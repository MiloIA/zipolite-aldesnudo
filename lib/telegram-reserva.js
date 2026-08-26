import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '🏠 Menú principal' }, { text: '📞 Agendar llamada' }, { text: '🙋 Hablar con asesor' }]
  ],
  resize_keyboard: true,
  persistent: true,
  input_field_placeholder: 'Escribe tu mensaje...'
};

// Private helpers
async function sendMessage(token, chatId, text, inlineButtons = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: inlineButtons ? { inline_keyboard: inlineButtons } : REPLY_KEYBOARD
  };
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function saveHistorial(chatId, historial, extras = {}) {
  await supabase
    .from('conversaciones_telegram')
    .upsert({ chat_id: chatId, historial, ...extras }, { onConflict: 'chat_id' });
}

async function actualizarContacto(chatId, updates) {
  await supabase.from('contactos').update(updates).eq('telegram_chat_id', chatId);
}

// ─── TASAS Y CÁLCULO DE FINANCIAMIENTO ──────────────────────

export const CLIP_RATES = { 0: 4.18, 3: 9.48, 6: 12.96, 9: 17.02, 12: 18.99, 18: 26.53, 24: 35.69 };

export function calcFinanciamiento(monto, meses) {
  const tasas = { 0: 0, 3: 9.48, 6: 12.96, 9: 17.02, 12: 18.99, 18: 26.53, 24: 35.69 };
  const tasa = tasas[meses] ?? 0;
  if (meses === 0 || tasa === 0) {
    return { totalFinanciado: monto, mensualidad: monto, cargo: 0 };
  }
  const totalFinanciado = Math.round(monto / (1 - tasa / 100));
  const mensualidad = Math.round(totalFinanciado / meses);
  const cargo = totalFinanciado - monto;
  return { totalFinanciado, mensualidad, cargo };
}

export async function handleMesesSelection(chatId, meses, ctx, conv, token) {
  const personasNum = ctx.personas || 1;
  const montoBase = ctx.tipo_pago === 'total'
    ? (ctx.precio || 0) * personasNum
    : ((ctx.anticipo || 0) > 0 ? (ctx.anticipo || 0) * personasNum : (ctx.precio || 0) * personasNum);
  const { totalFinanciado, cargo, mensualidad } = calcFinanciamiento(montoBase, meses);
  const varEmoji = (ctx.variante_nombre || '').toLowerCase().includes('glamping') ? '🏕️'
    : (ctx.variante_nombre || '').toLowerCase().includes('habitaci') ? '🛏️'
    : (ctx.variante_nombre || '').toLowerCase().includes('transport') ? '🚌' : '💳';
  const label = ctx.variante_nombre || ctx.paquete_nombre || 'Paquete';
  const personas = `${personasNum} persona${personasNum > 1 ? 's' : ''}`;
  let resumenMsg;
  if (meses === 0) {
    resumenMsg =
      `${varEmoji} *${label} · ${personas} · Contado con tarjeta de crédito*\n\n` +
      `• *Total a pagar: $${totalFinanciado.toLocaleString('es-MX')} MXN*\n\n` +
      `¿Cuál es tu *nombre completo* para la reserva? 👇`;
  } else {
    resumenMsg =
      `${varEmoji} *${label} · ${personas} · ${meses} meses*\n\n` +
      `💰 *$${mensualidad.toLocaleString('es-MX')}/mes* — cómodo y sin estrés\n\n` +
      `• Precio base: $${montoBase.toLocaleString('es-MX')}\n` +
      `• Costo de financiamiento: +$${cargo.toLocaleString('es-MX')}\n` +
      `• Total: $${totalFinanciado.toLocaleString('es-MX')}\n` +
      `• Mensualidad: *$${mensualidad.toLocaleString('es-MX')}* × ${meses} meses\n\n` +
      `¿Cuál es tu *nombre completo* para la reserva? 👇`;
  }
  await saveHistorial(chatId, conv.historial, {
    estado_reserva: { ...ctx, step: 'pidiendo_nombre', meses }
  });
  await sendMessage(token, chatId, resumenMsg);
}

// ─── CREAR RESERVA + PAGO ────────────────────────────────────

export async function crearReservaYPago(token, chatId, estado) {
  console.log('=== CREAR RESERVA START ===', JSON.stringify({
    paquete_id: estado.paquete_id,
    variante_id: estado.variante_id,
    precio: estado.precio,
    personas: estado.personas,
    anticipo: estado.anticipo,
    tipo_pago: estado.tipo_pago,
    metodo: estado.metodo,
    nombre: estado.nombre,
    email: estado.email
  }));

  // If precio is missing, try fetching pkg_context from DB as fallback
  if (!estado.precio || estado.precio === 0 || !estado.paquete_id || !estado.variante_id) {
    const { data: row } = await supabase
      .from('conversaciones_telegram')
      .select('pkg_context')
      .eq('chat_id', chatId)
      .maybeSingle();
    const pkgCtx = row?.pkg_context;
    if (pkgCtx?.precio && pkgCtx.precio > 0 && pkgCtx.paquete_id && pkgCtx.variante_id) {
      console.log('crearReservaYPago: using pkg_context fallback', pkgCtx);
      estado = {
        ...pkgCtx,
        ...estado,
        precio: pkgCtx.precio,
        variante_id: pkgCtx.variante_id,
        paquete_id: pkgCtx.paquete_id,
        paquete_nombre: estado.paquete_nombre || pkgCtx.paquete_nombre,
        anticipo: estado.anticipo || pkgCtx.anticipo,
        personas: estado.personas || pkgCtx.personas || 1,
      };
    } else {
      console.error('crearReservaYPago: missing context, no fallback', { precio: estado.precio, paquete_id: estado.paquete_id, variante_id: estado.variante_id });
      await sendMessage(token, chatId,
        '❌ Hubo un error con los datos de tu reserva. Por favor inicia de nuevo eligiendo tu paquete desde el menú.'
      );
      await supabase.from('conversaciones_telegram').update({ estado_reserva: null }).eq('chat_id', chatId);
      return;
    }
  }

  const clienteNombre = estado.nombre || '';
  const email = estado.email || '';
  const personas = estado.personas || 1;
  const montoTotal = (estado.precio || 0) * personas;
  const montoAnticipo = estado.tipo_pago === 'total'
    ? montoTotal
    : (estado.anticipo || 0) * personas;
  const montoBase = montoAnticipo > 0 ? montoAnticipo : montoTotal;
  const metodo = estado.metodo || 'clip';
  const meses = estado.meses ?? 0;

  // 1. Crear reservación en Supabase
  const sb = supabase;

  const testInsert = {
    paquete_id: estado.paquete_id,
    nombre: estado.nombre || 'TEST',
    email: estado.email || 'test@test.com',
    estado: 'pendiente'
  };

  console.log('TEST INSERT:', JSON.stringify(testInsert));

  const { data: resData, error: resError } = await sb
    .from('reservaciones')
    .insert(testInsert)
    .select()
    .single();

  console.log('TEST RESULT:', JSON.stringify(resData));
  console.log('TEST ERROR:', JSON.stringify(resError));

  if (resError) {
    await sendMessage(token, chatId, `DEBUG ERROR: ${resError.message} | code: ${resError.code}`);
    return;
  }

  await sendMessage(token, chatId, `DEBUG OK: reservacion ${resData.id}`);
  return; // stop here for now

  // 1b. Insertar viajero titular
  const nombreParts = (clienteNombre || '').split(' ');
  const viajeroNombre = nombreParts[0] || '';
  const ap_paterno = nombreParts[1] || '';
  const ap_materno = nombreParts[2] || '';
  await supabase.from('viajeros').insert({
    reservacion_id: reserva.id,
    nombre: viajeroNombre,
    ap_paterno,
    ap_materno,
    apellido_paterno: ap_paterno,
    apellido_materno: ap_materno,
    fecha_nacimiento: estado.fecha_nacimiento || null,
    whatsapp: estado.whatsapp || null,
    correo: estado.email || null,
    contacto_emergencia: estado.contacto_emergencia || null,
    es_titular: true,
    numero_viajero: 1
  }).then(({ error }) => { if (error) console.error('viajeros insert error:', error.message); });

  // 2. Limpiar estado + actualizar CRM
  await supabase.from('conversaciones_telegram').update({ estado_reserva: null }).eq('chat_id', chatId);
  await supabase.from('contactos').update({ estado_crm: 'reservado', temperatura: 'caliente' }).eq('telegram_chat_id', chatId);

  // 3. Transferencia bancaria
  if (metodo === 'transfer') {
    try {
      const { data: cfgRows, error: cfgError } = await supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', ['banco_nombre', 'banco_clabe', 'banco_beneficiario']);

      console.log('CONFIG ROWS:', JSON.stringify(cfgRows));
      console.log('CONFIG ERROR:', JSON.stringify(cfgError));

      const config = {};
      (cfgRows || []).forEach(row => { config[row.clave] = row.valor; });

      fetch('https://zipolitealdesnudo.com/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservacion_id: reserva.id, paquete_nombre: estado.paquete_nombre,
          nombre: clienteNombre, email, whatsapp: null, personas,
          metodo_pago: 'transfer', total: montoTotal,
          anticipo: montoAnticipo,
          fecha_inicio: '', fecha_fin: ''
        })
      }).catch(e => console.error('send-confirmation error:', e));

      await sendMessage(token, chatId,
        `✅ *¡Listo, ${clienteNombre}!* Tu lugar está apartado.\n\n` +
        `🏦 *Datos para transferencia:*\n` +
        `- Banco: ${config.banco_nombre || 'BBVA'}\n` +
        `- CLABE: \`${config.banco_clabe || '—'}\`\n` +
        `- Beneficiario: ${config.banco_beneficiario || 'Zipolite al Desnudo'}\n` +
        `- Monto anticipo: *$${montoAnticipo.toLocaleString('es-MX')}*\n\n` +
        `📸 Envía tu comprobante por aquí cuando transfieras.\n` +
        `📧 Recibirás confirmación en ${email}`
      );
    } catch (e) {
      console.error('TRANSFER ERROR:', e.message, e.stack);
      await sendMessage(token, chatId,
        `✅ Tu reserva está registrada, ${clienteNombre}.\n\nContáctanos para los datos de transferencia: wa.me/529582199953`
      );
    }
    return;
  }

  // 4. Pago con tarjeta via Clip
  const { totalFinanciado: montoClip } = calcFinanciamiento(montoBase, meses);
  const clipToken = Buffer.from(
    `${process.env.CLIP_API_KEY}:${process.env.CLIP_SECRET_KEY}`
  ).toString('base64');
  const baseUrl = 'https://zipolitealdesnudo.com';
  let checkoutUrl = null;

  const clipBody = {
    amount: montoClip,
    purchase_description: estado.paquete_nombre || 'Reservación Zipolite al Desnudo',
    redirection_url: {
      success: `${baseUrl}/pago-confirmado.html?reservacion_id=${reserva.id}&status=paid`,
      error:   `${baseUrl}/pago-confirmado.html?reservacion_id=${reserva.id}&status=error`,
      default: `${baseUrl}/pago-confirmado.html?reservacion_id=${reserva.id}&status=pending`,
    },
    webhook_url: `${baseUrl}/api/clip-webhook`,
    metadata: { external_reference: reserva.id, nombre: clienteNombre, email }
  };
  const clipUrl = 'https://api.payclip.com/v2/checkout';
  console.log('=== CLIP REQUEST ===');
  console.log('URL:', clipUrl);
  console.log('Body:', JSON.stringify(clipBody, null, 2));

  try {
    const clipRes = await fetch(clipUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${clipToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(clipBody)
    });
    const clipText = await clipRes.text();
    console.log('=== CLIP RESPONSE ===');
    console.log('Status:', clipRes.status);
    console.log('Body:', clipText);
    const clipData = JSON.parse(clipText);
    if (clipRes.ok) {
      checkoutUrl = clipData.payment_request_url;
    } else {
      console.error('Clip error response:', JSON.stringify(clipData));
      console.error('Clip request body (on error):', JSON.stringify(clipBody));
    }
  } catch (clipErr) {
    console.error('Clip fetch error:', clipErr?.message);
    console.error('Clip request body (on exception):', JSON.stringify(clipBody));
  }

  if (!checkoutUrl) {
    await sendMessage(token, chatId,
      `Hubo un problema al generar tu link de pago 😕\n\nNo te preocupes, tu lugar está guardado.\nEscríbenos a wa.me/529582199953 y te lo resolvemos en minutos.`
    );
    return;
  }

  fetch('https://zipolitealdesnudo.com/api/send-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservacion_id: reserva.id, paquete_nombre: estado.paquete_nombre,
      nombre: clienteNombre, email, whatsapp: null, personas,
      metodo_pago: 'clip', total: montoTotal,
      anticipo: montoAnticipo,
      fecha_inicio: '', fecha_fin: ''
    })
  }).catch(e => console.error('send-confirmation error:', e));

  const montoFmt = montoClip.toLocaleString('es-MX');
  const mesesInfo = meses > 0 ? ` · ${meses} meses` : ' · contado';
  await sendMessage(token, chatId,
    `✅ *¡Listo, ${clienteNombre}!* Tu lugar está apartado.\n\n🔗 *Completa tu pago aquí:*\n${checkoutUrl}\n\n💰 Tarjeta${mesesInfo}: *$${montoFmt} MXN*\n📧 Recibirás confirmación en ${email}\n\nEl link es válido por 24 horas. ¿Alguna duda?`
  );
}

// ─── MANEJADOR DE PASOS DE RESERVA (mensajes de texto) ──────

export async function handleReservaStep(token, chatId, msgText, estadoReserva, conv, nombre) {
  if (estadoReserva?.step === 'pidiendo_tipo_pago') {
    let estadoEnriquecido = estadoReserva;
    if (!estadoReserva.precio && conv.pkg_context) {
      estadoEnriquecido = { ...estadoReserva, ...conv.pkg_context };
      await supabase.from('conversaciones_telegram')
        .update({ estado_reserva: estadoEnriquecido })
        .eq('chat_id', chatId);
    }
    const lower = msgText.toLowerCase();
    const esAnticipo = lower.includes('anticipo') || lower.includes('apart') || lower.includes('solo');
    const esTotal = lower.includes('complet') || lower.includes('total') || lower.includes('todo');
    if (!esAnticipo && !esTotal) {
      await sendMessage(token, chatId,
        `¿Solo anticipo o pago completo? 👇`,
        [[
          { text: '💰 Solo anticipo', callback_data: 'tipo_anticipo' },
          { text: '✅ Pago completo', callback_data: 'tipo_total' }
        ]]
      );
      return true;
    }
    const tipoPago = esAnticipo ? 'anticipo' : 'total';
    await saveHistorial(chatId, conv.historial, {
      estado_reserva: { ...estadoEnriquecido, step: 'pidiendo_metodo', tipo_pago: tipoPago }
    });
    await sendMessage(token, chatId,
      `¿Cómo quieres pagar?\n\n🏦 *Transferencia* — sin cargo extra\n💳 *Tarjeta* — con o sin meses`,
      [[
        { text: '🏦 Transferencia', callback_data: 'metodo_transfer' },
        { text: '💳 Tarjeta', callback_data: 'metodo_tarjeta' }
      ]]
    );
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_metodo') {
    const lower = msgText.toLowerCase();
    const esTransfer = lower.includes('transfer') || lower.includes('deposito') || lower.includes('depósito') || lower.includes('banco');
    const esTarjeta = lower.includes('tarjeta') || lower.includes('card') || lower.includes('credito') || lower.includes('crédito');
    if (!esTransfer && !esTarjeta) {
      await sendMessage(token, chatId,
        `¿Transferencia o tarjeta? 👇`,
        [[
          { text: '🏦 Transferencia', callback_data: 'metodo_transfer' },
          { text: '💳 Tarjeta', callback_data: 'metodo_tarjeta' }
        ]]
      );
      return true;
    }
    if (esTransfer) {
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...estadoReserva, step: 'pidiendo_nombre', metodo: 'transfer' }
      });
      await sendMessage(token, chatId,
        `Perfecto, transferencia sin cargos extra 🏦\n\n¿Cuál es tu *nombre completo* para la reserva? 👇`
      );
    } else {
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...estadoReserva, step: 'pidiendo_meses', metodo: 'tarjeta' }
      });
      await sendMessage(token, chatId,
        `¿A cuántos meses?`,
        [
          [{ text: 'Contado', callback_data: 'meses_0' }, { text: '3 meses', callback_data: 'meses_3' }, { text: '6 meses', callback_data: 'meses_6' }],
          [{ text: '9 meses', callback_data: 'meses_9' }, { text: '12 meses', callback_data: 'meses_12' }, { text: '18 meses', callback_data: 'meses_18' }, { text: '24 meses', callback_data: 'meses_24' }]
        ]
      );
    }
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_meses') {
    const mesesMatch = msgText.match(/\b(contado|0|3|6|9|12|18|24)\b/i);
    if (!mesesMatch) {
      await sendMessage(token, chatId,
        `Selecciona el plazo 👇`,
        [
          [{ text: 'Contado', callback_data: 'meses_0' }, { text: '3 meses', callback_data: 'meses_3' }, { text: '6 meses', callback_data: 'meses_6' }],
          [{ text: '9 meses', callback_data: 'meses_9' }, { text: '12 meses', callback_data: 'meses_12' }, { text: '18 meses', callback_data: 'meses_18' }, { text: '24 meses', callback_data: 'meses_24' }]
        ]
      );
      return true;
    }
    const meses = mesesMatch[1].toLowerCase() === 'contado' ? 0 : parseInt(mesesMatch[1]);
    await handleMesesSelection(chatId, meses, estadoReserva, conv, token);
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_nombre') {
    const emailInMsg = msgText.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailInMsg) {
      const emailInput = emailInMsg[0].toLowerCase();
      const rawNombre = msgText.replace(emailInMsg[0], '').replace(/\s+/g, ' ').trim() || nombre;
      const nombreCapitalizado = rawNombre.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      await actualizarContacto(chatId, { nombre: nombreCapitalizado });
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...estadoReserva, step: 'pidiendo_nacimiento', nombre: nombreCapitalizado, email: emailInput }
      });
      await sendMessage(token, chatId,
        `📅 ¿Cuál es tu fecha de nacimiento?\n\nEscríbela así: DD/MM/AAAA`
      );
    } else {
      const nombreCapitalizado = msgText.trim().split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...estadoReserva, step: 'pidiendo_email', nombre: nombreCapitalizado }
      });
      await actualizarContacto(chatId, { nombre: nombreCapitalizado });
      await sendMessage(token, chatId,
        `Perfecto, *${nombreCapitalizado}* 👋\n\n¿Cuál es tu email para enviarte la confirmación?`
      );
    }
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_email') {
    const emailInput = msgText.trim().toLowerCase();
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      await sendMessage(token, chatId, `Ese email no parece válido, ¿puedes verificarlo? 🙏`);
      return true;
    }
    await saveHistorial(chatId, conv.historial, {
      estado_reserva: { ...estadoReserva, step: 'pidiendo_nacimiento', email: emailInput }
    });
    await sendMessage(token, chatId,
      `📅 ¿Cuál es tu fecha de nacimiento?\n\nEscríbela así: DD/MM/AAAA`
    );
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_nacimiento') {
    const raw = msgText.trim();
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!match) {
      await sendMessage(token, chatId,
        `Esa fecha no parece válida. Escríbela así: DD/MM/AAAA (ejemplo: 15/03/1990)`
      );
      return true;
    }
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    let year = parseInt(match[3]);
    if (year < 100) year += 1900;
    const fecha = new Date(year, month - 1, day);
    const hoy = new Date();
    const edad = hoy.getFullYear() - fecha.getFullYear() -
      (hoy < new Date(hoy.getFullYear(), fecha.getMonth(), fecha.getDate()) ? 1 : 0);
    if (
      isNaN(fecha.getTime()) ||
      fecha.getMonth() !== month - 1 ||
      edad < 18 ||
      year < 1900 || year > hoy.getFullYear()
    ) {
      await sendMessage(token, chatId,
        `Esa fecha no parece válida. Escríbela así: DD/MM/AAAA (ejemplo: 15/03/1990)`
      );
      return true;
    }
    const isoFecha = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    await saveHistorial(chatId, conv.historial, {
      estado_reserva: { ...estadoReserva, step: 'pidiendo_whatsapp', fecha_nacimiento: isoFecha }
    });
    await sendMessage(token, chatId,
      `📱 ¿Cuál es tu número de WhatsApp?\n\n(Incluye el código de país, ejemplo: +52 55 1234 5678)`
    );
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_whatsapp') {
    const digits = msgText.replace(/\D/g, '');
    if (digits.length < 10) {
      await sendMessage(token, chatId,
        `Ese número no parece completo. Incluye código de país: +52 55 1234 5678`
      );
      return true;
    }
    await saveHistorial(chatId, conv.historial, {
      estado_reserva: { ...estadoReserva, step: 'pidiendo_emergencia', whatsapp: msgText.trim() }
    });
    await sendMessage(token, chatId,
      `🆘 Por último: ¿quién es tu contacto de emergencia?\n\nEscribe nombre y teléfono:\nEjemplo: María García · +52 55 9876 5432`
    );
    return true;
  }

  if (estadoReserva?.step === 'pidiendo_emergencia') {
    const emergencia = msgText.trim();
    if (!emergencia) return true;
    await sendMessage(token, chatId, `Un momento, estoy generando tu link de pago... ⏳`);
    await crearReservaYPago(token, chatId, { ...estadoReserva, contacto_emergencia: emergencia });
    return true;
  }

  return false;
}
