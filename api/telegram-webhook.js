// deploy: 2026-08-25
import { createClient } from '@supabase/supabase-js';
import {
  MENU_PRINCIPAL_TEXT, RESPUESTAS, SALUDOS, REPLY_KEYBOARD, REPLY_KB_ACTIONS,
  slugify, buildMenuButtons, getPaqueteData, handleWithClaude
} from '../lib/telegram-mateo.js';
import {
  handleMesesSelection, crearReservaYPago, handleReservaStep
} from '../lib/telegram-reserva.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── FUNCIONES UTILITARIAS ───────────────────────────────────

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

async function answerCallback(token, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

async function getContacto(chatId) {
  const { data } = await supabase
    .from('contactos')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  return data;
}

async function upsertContacto(chatId, from) {
  const existing = await getContacto(chatId);
  if (existing) return existing;
  const { data } = await supabase
    .from('contactos')
    .insert({
      telegram_chat_id: chatId,
      nombre: from?.first_name || 'Desconocido',
      origen: 'telegram',
      estado_crm: 'lead',
      temperatura: 'frio'
    })
    .select()
    .single();
  return data;
}

async function actualizarContacto(chatId, updates) {
  await supabase.from('contactos').update(updates).eq('telegram_chat_id', chatId);
}

async function getHistorial(chatId) {
  const { data } = await supabase
    .from('conversaciones_telegram')
    .select('historial, nombre, email, whatsapp, estado_embudo, estado_reserva, pkg_context')
    .eq('chat_id', chatId)
    .maybeSingle();
  return data || { historial: [], nombre: null, email: null, whatsapp: null, estado_reserva: null, pkg_context: null };
}

async function saveHistorial(chatId, historial, extras = {}) {
  await supabase
    .from('conversaciones_telegram')
    .upsert({ chat_id: chatId, historial, ...extras }, { onConflict: 'chat_id' });
}

async function registrarInteraccion(contactoId, tipo, resumen) {
  if (!contactoId) return;
  await supabase.from('interacciones').insert({
    contacto_id: contactoId,
    canal: 'telegram',
    tipo,
    resumen: resumen.substring(0, 200)
  });
}

function generarSlotsHorario(dia) {
  const ahora = new Date();
  const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
  const slots = [];
  for (let h = 13; h <= 17; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 17 && m > 0) continue;
      if (dia === 'hoy') {
        const minutos = h * 60 + m;
        if (minutos <= horaActual + 30) continue;
      }
      const label = `${h}:${m === 0 ? '00' : m}pm`;
      slots.push({ text: label, callback_data: `slot_${dia}_${h}_${m}` });
    }
  }
  return slots;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { paquetes = [], resenas = null } = await getPaqueteData().catch(err => {
    console.error('getPaqueteData failed:', err?.message);
    return { paquetes: [], resenas: null };
  });
  const menuButtons = buildMenuButtons(paquetes);

  // ── CALLBACK QUERY (botones inline) ──────────────────────
  if (body.callback_query) {
    const query = body.callback_query;
    const chatId = String(query.message.chat.id);
    const data = query.data;
    await answerCallback(token, query.id);

    const contacto = await upsertContacto(chatId, query.from);
    const nombre = contacto?.nombre || query.from?.first_name || '';

    if (data === 'menu') {
      const saludo = nombre ? `${MENU_PRINCIPAL_TEXT}\n\n¡Hola de nuevo, ${nombre}! 👋` : MENU_PRINCIPAL_TEXT;
      await sendMessage(token, chatId, saludo, menuButtons);
      return res.status(200).end();
    }

    if (data === 'asesor') {
      await sendMessage(token, chatId, RESPUESTAS.asesor.text, RESPUESTAS.asesor.buttons);
      const alertaText = `🚨 *Usuario pide asesor*\n\nNombre: ${nombre}\nChat ID: ${chatId}\nUsername: @${query.from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });
      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'nota', 'Usuario solicitó hablar con asesor');
      return res.status(200).end();
    }

    if (data === 'faq_menu') {
      await sendMessage(token, chatId, RESPUESTAS.faq_menu.text, RESPUESTAS.faq_menu.buttons);
      return res.status(200).end();
    }

    if (data === 'agendar_dia') {
      await sendMessage(token, chatId, RESPUESTAS.agendar_dia.text, RESPUESTAS.agendar_dia.buttons);
      return res.status(200).end();
    }

    if (data === 'llamada_hoy' || data === 'llamada_manana') {
      const dia = data === 'llamada_hoy' ? 'hoy' : 'manana';
      const slots = generarSlotsHorario(dia);

      if (slots.length === 0) {
        await sendMessage(token, chatId,
          `Lo siento, ya no hay horarios disponibles para hoy. ¿Agendamos para mañana?`,
          [[{ text: '📅 Mañana', callback_data: 'llamada_manana' }, { text: '⬅️ Menú', callback_data: 'menu' }]]
        );
        return res.status(200).end();
      }

      const rows = [];
      for (let i = 0; i < slots.length; i += 2) {
        const row = [slots[i]];
        if (slots[i + 1]) row.push(slots[i + 1]);
        rows.push(row);
      }
      rows.push([{ text: '⬅️ Menú principal', callback_data: 'menu' }]);
      const diaTexto = dia === 'hoy' ? 'hoy' : 'mañana';
      await sendMessage(token, chatId, `⏰ ¿A qué hora te llamamos ${diaTexto}?`, rows);
      return res.status(200).end();
    }

    if (data.startsWith('slot_')) {
      const parts = data.split('_');
      const dia = parts[1];
      const h = parts[2];
      const m = parts[3] === '0' ? '00' : parts[3];
      const hora = `${h}:${m}pm`;
      const diaTexto = dia === 'hoy' ? 'hoy' : 'mañana';
      const telefono = contacto?.whatsapp || 'no registrado';

      await sendMessage(token, chatId,
        `✅ *¡Llamada agendada!*\n\nTe llamamos ${diaTexto} a las *${hora}*.\n\nSi el número al que te llamaremos no es correcto, escríbelo aquí. 📱`,
        [[{ text: '🏠 Menú principal', callback_data: 'menu' }]]
      );
      const alertaText = `📞 *LLAMADA AGENDADA*\n\nNombre: ${nombre}\nTeléfono: ${telefono}\nCuándo: ${diaTexto} a las ${hora}\nChat ID: ${chatId}\nUsername: @${query.from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });
      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'llamada', `Llamada agendada ${diaTexto} a las ${hora}`);
      return res.status(200).end();
    }

    if (data.startsWith('pkg_')) {
      const conv = await getHistorial(chatId);
      const paq = paquetes.find(p => `pkg_${p.id}` === data)
        || paquetes.find(p => data.includes(slugify(p.nombre).slice(0, 6)));
      const context = paq
        ? `[CONTEXTO: El usuario seleccionó el paquete "${paq.nombre}". Haz UNA pregunta consultiva: ¿solo o en grupo? ¿cuántas personas?]`
        : `[CONTEXTO: El usuario toca el botón de un paquete de viaje. Pregúntale cuál le interesa y cuántas personas van.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);

      if (paq && (paq.variantes || []).length > 0) {
        const varianteMsgs = (paq.variantes || []).map(v => {
          const disp = v.lugares_totales ? ` (${v.lugares_totales - (v.lugares_vendidos || 0)} disp.)` : '';
          const vn = (v.nombre || '').toLowerCase();
          const emoji = vn.includes('glamping') ? '🏕️'
            : vn.includes('doble') ? '🛏️🛏️'
            : vn.includes('individual') || vn.includes('habitaci') ? '🛏️'
            : vn.includes('transport') ? '🚌' : '🌴';
          return [{ text: `${emoji} ${v.nombre} — $${(v.precio || 0).toLocaleString('es-MX')}${disp}`, callback_data: `var_${v.id}` }];
        });
        await sendMessage(token, chatId, '¿Qué modalidad te interesa?', varianteMsgs);
      }

      return res.status(200).end();
    }

    if (data.startsWith('var_')) {
      const conv = await getHistorial(chatId);
      const varId = data.slice(4);
      let foundVar = null, foundPaq = null;
      for (const p of paquetes) {
        const v = (p.variantes || []).find(v => v.id === varId);
        if (v) { foundVar = v; foundPaq = p; break; }
      }
      const disponibles = foundVar?.lugares_totales != null
        ? foundVar.lugares_totales - (foundVar.lugares_vendidos || 0)
        : null;
      const context = foundVar
        ? `[CONTEXTO: El usuario seleccionó la variante "${foundVar.nombre}" del paquete "${foundPaq?.nombre}" a $${(foundVar.precio || 0).toLocaleString('es-MX')}/persona con anticipo de $${(foundVar.anticipo || 0).toLocaleString('es-MX')}${disponibles !== null ? `. Hay ${disponibles} lugares disponibles` : ''}. Pregúntale cuántas personas van y avanza hacia el cierre.]`
        : `[CONTEXTO: El usuario seleccionó una variante de paquete. Pregúntale cuántas personas van y avanza hacia el cierre.]`;

      if (foundVar && foundPaq) {
        const pkgCtx = {
          paquete_id: foundPaq.id,
          paquete_nombre: foundPaq.nombre,
          variante_id: foundVar.id,
          variante_nombre: foundVar.nombre,
          precio: foundVar.precio,
          anticipo: foundVar.anticipo,
        };
        await saveHistorial(chatId, conv.historial, {
          pkg_context: pkgCtx,
          estado_reserva: {
            step: null,
            ...pkgCtx,
            personas: null,
            nombre: null,
            email: null
          }
        });
      }

      const slug = slugify(foundPaq?.nombre || '');
      const varButtons = (slug && foundPaq) ? [
        [
          { text: 'ℹ️ Información del viaje', callback_data: `info_pkg_${foundPaq.id}` },
          { text: '❓ Preguntas frecuentes', callback_data: 'faq_menu' }
        ],
        [{ text: '✅ Reservar ahora', callback_data: `reservar_${slug}` }]
      ] : null;

      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre, varButtons);
      return res.status(200).end();
    }

    if (data.startsWith('info_pkg_')) {
      const conv = await getHistorial(chatId);
      const pkgId = data.slice(9);
      const p = paquetes.find(p => p.id === pkgId);
      const varianteName = conv.pkg_context?.variante_nombre || '';
      const context = p
        ? `[CONTEXTO: El usuario quiere información detallada del paquete ${p.nombre}${varianteName ? ` variante ${varianteName}` : ''}. Describe qué incluye, el itinerario, el lugar de hospedaje y el ambiente. Sé entusiasta pero conciso.]`
        : `[CONTEXTO: El usuario quiere información detallada del paquete. Describe qué incluye, el itinerario, el lugar de hospedaje y el ambiente. Sé entusiasta pero conciso.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
      return res.status(200).end();
    }

    if (data.startsWith('reservar_')) {
      const conv = await getHistorial(chatId);
      const slug = data.slice(9);
      const paq = paquetes.find(p => slugify(p.nombre) === slug);
      const existingCtx = conv.estado_reserva || {};
      const pkgCtx = conv.pkg_context || {};

      const enriquecido = {
        paquete_id: existingCtx.paquete_id || pkgCtx.paquete_id || paq?.id || null,
        paquete_nombre: existingCtx.paquete_nombre || pkgCtx.paquete_nombre || paq?.nombre || slug.replace(/-/g, ' '),
        variante_id: existingCtx.variante_id || pkgCtx.variante_id || null,
        variante_nombre: existingCtx.variante_nombre || pkgCtx.variante_nombre || null,
        precio: existingCtx.precio || pkgCtx.precio || null,
        anticipo: existingCtx.anticipo || pkgCtx.anticipo || null,
      };

      await saveHistorial(chatId, conv.historial, {
        estado_reserva: {
          step: 'pidiendo_tipo_pago',
          ...enriquecido,
          personas: existingCtx.personas || 1,
          tipo_pago: null,
          metodo: null,
          meses: null,
          nombre: null,
          email: null
        }
      });

      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await sendMessage(token, chatId,
        `¡Perfecto! Vamos a apartar tu lugar 🎉\n\n¿Cómo quieres manejarlo?\n\n💰 *Solo anticipo* — aparta ahora, el resto lo pagas 15 días antes\n✅ *Pago completo* — paga todo hoy y olvídate`,
        [[
          { text: '💰 Solo anticipo', callback_data: 'tipo_anticipo' },
          { text: '✅ Pago completo', callback_data: 'tipo_total' }
        ]]
      );
      return res.status(200).end();
    }

    if (data === 'tipo_anticipo' || data === 'tipo_total') {
      const conv = await getHistorial(chatId);
      let ctx = conv.estado_reserva || {};
      const tipoPago = data === 'tipo_anticipo' ? 'anticipo' : 'total';
      if (!ctx.precio && conv.pkg_context) {
        ctx = { ...ctx, ...conv.pkg_context };
        await supabase.from('conversaciones_telegram')
          .update({ estado_reserva: ctx })
          .eq('chat_id', chatId);
      }
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...ctx, step: 'pidiendo_metodo', tipo_pago: tipoPago }
      });
      await sendMessage(token, chatId,
        `¿Cómo quieres pagar?\n\n🏦 *Transferencia* — sin cargo extra, manda el comprobante\n💳 *Tarjeta* — pago con o sin meses`,
        [[
          { text: '🏦 Transferencia', callback_data: 'metodo_transfer' },
          { text: '💳 Tarjeta', callback_data: 'metodo_tarjeta' }
        ]]
      );
      return res.status(200).end();
    }

    if (data === 'metodo_transfer' || data === 'metodo_tarjeta') {
      const conv = await getHistorial(chatId);
      const ctx = conv.estado_reserva || {};
      if (data === 'metodo_transfer') {
        await saveHistorial(chatId, conv.historial, {
          estado_reserva: { ...ctx, step: 'pidiendo_nombre', metodo: 'transfer' }
        });
        await sendMessage(token, chatId,
          `Perfecto, transferencia sin cargos extra 🏦\n\n¿Cuál es tu *nombre completo* para la reserva? 👇`
        );
      } else {
        await saveHistorial(chatId, conv.historial, {
          estado_reserva: { ...ctx, step: 'pidiendo_meses', metodo: 'tarjeta' }
        });
        await sendMessage(token, chatId,
          `¿A cuántos meses?`,
          [
            [{ text: 'Contado', callback_data: 'meses_0' }, { text: '3 meses', callback_data: 'meses_3' }, { text: '6 meses', callback_data: 'meses_6' }],
            [{ text: '9 meses', callback_data: 'meses_9' }, { text: '12 meses', callback_data: 'meses_12' }, { text: '18 meses', callback_data: 'meses_18' }, { text: '24 meses', callback_data: 'meses_24' }]
          ]
        );
      }
      return res.status(200).end();
    }

    if (data.startsWith('meses_')) {
      const conv = await getHistorial(chatId);
      const ctx = conv.estado_reserva || {};
      const validMeses = [0, 3, 6, 9, 12, 18, 24];
      const rawMeses = parseInt(data.slice(6));
      const meses = validMeses.includes(rawMeses) ? rawMeses : 0;
      await handleMesesSelection(chatId, meses, ctx, conv, token);
      return res.status(200).end();
    }

    if (data === 'info_pagos') {
      const conv = await getHistorial(chatId);
      const context = `[CONTEXTO: El usuario pregunta por formas de pago. Explica brevemente: transferencia/depósito (sin cargo) y tarjeta con financiamiento 3-24 meses (aplica cargo). Luego pregunta cuál prefiere y para qué paquete.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
      return res.status(200).end();
    }

    if (data === 'tour_opcional') {
      const conv = await getHistorial(chatId);
      const context = `[CONTEXTO: El usuario pregunta por el tour Carrizalillo + Bioluminiscencia ($1,000/persona). Descríbelo con entusiasmo en 2-3 líneas y pregunta si quiere agregarlo a su reserva.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
      return res.status(200).end();
    }

    if (data === 'habitacion_info') {
      const conv = await getHistorial(chatId);
      const context = `[CONTEXTO: El usuario pregunta por las habitaciones del paquete Año Nuevo al Desnudo. Describe las opciones individual y doble con precios y anticipo desde los datos de paquetes. Pregunta cuántas personas van.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
      return res.status(200).end();
    }

    if (data.startsWith('faq_')) {
      const conv = await getHistorial(chatId);
      const topics = {
        faq_zipolite: 'qué es Zipolite y por qué es un destino único',
        faq_nudismo: 'si es obligatorio el nudismo en Zipolite',
        faq_solo: 'si se puede ir solo y cómo funciona el grupo social del viaje',
        faq_lgbt: 'si el viaje es exclusivo para LGBT+ y la política de inclusión',
        faq_cancelacion: 'la política de cancelación y reembolsos',
      };
      const topic = topics[data] || data.replace('faq_', '').replace(/_/g, ' ');
      const context = `[CONTEXTO: El usuario tiene una pregunta frecuente sobre: ${topic}. Respóndela de forma cálida y breve en 2-3 líneas, luego redirige hacia reservar con una pregunta o CTA.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
      return res.status(200).end();
    }

    return res.status(200).end();
  }

  // ── MENSAJE DE TEXTO ──────────────────────────────────────
  if (!body.message?.text) return res.status(200).end();

  const chatId = String(body.message.chat.id);
  const userText = body.message.text.trim();
  const from = body.message.from;

  const contacto = await upsertContacto(chatId, from);
  const conv = await getHistorial(chatId);
  const nombre = conv.nombre || contacto?.nombre || from?.first_name || '';

  await registrarInteraccion(contacto?.id, 'mensaje_entrante', userText);

  // ── Reply keyboard taps → cancel flow + route ──
  const rkAction = REPLY_KB_ACTIONS[userText];
  if (rkAction) {
    if (conv.estado_reserva?.step) {
      await saveHistorial(chatId, conv.historial, { estado_reserva: null });
    }
    if (rkAction === 'menu') {
      const saludo = nombre ? `${MENU_PRINCIPAL_TEXT}\n\n¡Hola de nuevo, ${nombre}! 👋` : MENU_PRINCIPAL_TEXT;
      await sendMessage(token, chatId, saludo, menuButtons);
    } else if (rkAction === 'asesor') {
      await sendMessage(token, chatId, RESPUESTAS.asesor.text, RESPUESTAS.asesor.buttons);
      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'nota', 'Usuario solicitó hablar con asesor');
      const alertaText = `🚨 *Usuario pide asesor*\n\nNombre: ${nombre}\nChat ID: ${chatId}\nUsername: @${from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });
    } else if (rkAction === 'agendar_dia') {
      await sendMessage(token, chatId, RESPUESTAS.agendar_dia.text, RESPUESTAS.agendar_dia.buttons);
    }
    return res.status(200).end();
  }

  // ── Flujo de reserva: multi-step (texto) ──
  if (conv.estado_reserva?.step) {
    const handled = await handleReservaStep(token, chatId, userText, conv.estado_reserva, conv, nombre);
    if (handled) return res.status(200).end();
  }

  // ── Saludo → menú (sin AI, respuesta rápida) ──
  const esSaludo = SALUDOS.some(s => userText.toLowerCase().includes(s)) || userText === '/start';
  if (esSaludo) {
    const saludo = nombre
      ? `🌊 ¡Hola de nuevo, *${nombre}*! Me alegra verte por aquí 🌈\n\n¿En qué te puedo ayudar hoy?`
      : MENU_PRINCIPAL_TEXT;
    if (userText === '/start') {
      await sendMessage(token, chatId, saludo);
      await sendMessage(token, chatId, '¿Qué paquete te interesa? 👇', menuButtons);
    } else {
      await sendMessage(token, chatId, saludo, menuButtons);
    }
    return res.status(200).end();
  }

  // ── Número de teléfono (flujo agendando) ──
  const telMatch = userText.match(/[\d\s\-\+]{10,15}/);
  if (telMatch && conv.estado_embudo === 'agendando') {
    const tel = telMatch[0].replace(/\s|-/g, '');
    await actualizarContacto(chatId, { whatsapp: tel });
    await saveHistorial(chatId, conv.historial, { estado_embudo: null });
    await sendMessage(token, chatId,
      `✅ Número actualizado: *${tel}*\n\n¿Cuándo prefieres la llamada?`,
      [[{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }]]
    );
    return res.status(200).end();
  }

  // ── Todo lo demás → AI ────────────────────────────────────
  try {
    await handleWithClaude(chatId, userText, conv, contacto, paquetes, resenas, token, nombre);
  } catch (err) {
    console.error('Webhook error:', err);
  }
  res.status(200).end();
}
