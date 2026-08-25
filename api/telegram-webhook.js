import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_HISTORIAL = 8;

// ─── CACHÉ DE PAQUETES ───────────────────────────────────────

let pkgCache = null;
let pkgCacheTime = 0;
const PKG_CACHE_MS = 10 * 60 * 1000;

async function getPaqueteData() {
  if (pkgCache && Date.now() - pkgCacheTime < PKG_CACHE_MS) return pkgCache;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const [
    { data: paquetes, error: ePaq },
    { data: variantes, error: eVar },
    { data: tours, error: eTours },
    resenaResult
  ] = await Promise.all([
    sb.from('paquetes').select('*').eq('activo', true).order('created_at'),
    sb.from('variantes_paquete').select('*').eq('activo', true).order('orden'),
    sb.from('tours_paquete').select('*').eq('activo', true).order('orden'),
    Promise.resolve(sb.from('testimonios').select('nombre, texto, paquete').limit(5))
      .catch(() => ({ data: null }))
  ]);

  if (ePaq) console.error('getPaqueteData paquetes error:', ePaq.message);
  if (eVar) console.error('getPaqueteData variantes error:', eVar.message);
  if (eTours) console.error('getPaqueteData tours error:', eTours.message);

  const paquetesMapped = (paquetes || []).map(p => ({
    ...p,
    variantes: (variantes || []).filter(v => v.paquete_id === p.id),
    tours: (tours || []).filter(t => t.paquete_id === p.id)
  }));
  const resenas = resenaResult?.data || null;

  console.log('getPaqueteData OK — paquetes:', paquetesMapped.length, '| resenas:', resenas?.length ?? 'null');

  pkgCache = { paquetes: paquetesMapped, resenas };
  pkgCacheTime = Date.now();
  return pkgCache;
}

// ─── TEXTOS ESTÁTICOS ────────────────────────────────────────

const MENU_PRINCIPAL_TEXT = `🌊 *¡Hola! Soy Mateo* 🌈\n\nAsesor de Zipolite al Desnudo — más de 10 años llevando a la comunidad LGBT+ a la playa más libre de México.\n\n+342 viajeros ya vivieron esto. ¿Tú cuándo te unes?`;

const RESPUESTAS = {
  faq_menu: {
    text: '❓ *Preguntas frecuentes*\n\n¿Sobre qué tienes dudas? 👇',
    buttons: [
      [{ text: '🌊 ¿Qué es Zipolite?', callback_data: 'faq_zipolite' }],
      [{ text: '👙 ¿Tengo que ser nudista?', callback_data: 'faq_nudismo' }],
      [{ text: '👤 ¿Puedo ir solo?', callback_data: 'faq_solo' }],
      [{ text: '🏳️‍🌈 ¿Solo es para LGBT+?', callback_data: 'faq_lgbt' }],
      [{ text: '❌ ¿Qué pasa si cancelo?', callback_data: 'faq_cancelacion' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },
  asesor: {
    text: `🙋 *Hablar con un asesor*\n\nLe aviso a un asesor ahora mismo que quieres información.\n\nEn breve alguien se comunicará contigo por este mismo chat. 🌊`,
    buttons: [
      [{ text: '📞 O agendamos una llamada', callback_data: 'agendar_dia' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },
  agendar_dia: {
    text: `📞 *Agendemos tu llamada*\n\n¿Cuándo prefieres que te llamemos?`,
    buttons: [
      [{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  }
};

const SALUDOS = ['hola', 'hi', 'buenas', 'hey', 'inicio', 'start', 'info', 'ayuda', 'help', 'menu', 'menú', 'buenos días', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'buen día'];

const REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '🏠 Menú principal' }, { text: '📞 Agendar llamada' }, { text: '🙋 Hablar con asesor' }]
  ],
  resize_keyboard: true,
  persistent: true,
  input_field_placeholder: 'Escribe tu mensaje...'
};

const REPLY_KB_ACTIONS = {
  '🏠 Menú principal': 'menu',
  '📞 Agendar llamada': 'agendar_dia',
  '🙋 Hablar con asesor': 'asesor'
};

// ─── HELPERS ─────────────────────────────────────────────────

function slugify(nombre) {
  return (nombre || '')
    .toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function buildMenuButtons(paquetes) {
  return (paquetes || []).map(p => ([{
    text: `${p.icono || '🌴'} ${p.nombre}`,
    callback_data: `pkg_${p.id}`
  }]));
}

// ─── SISTEMA PROMPT ──────────────────────────────────────────

function buildSystemPrompt(paquetes, resenas) {
  let pkgsInfo = '';
  (paquetes || []).forEach((p, i) => {
    pkgsInfo += `\n${i + 1}. ${p.nombre.toUpperCase()}\n`;
    pkgsInfo += `   - Fechas: ${p.fechas || 'por confirmar'}\n`;
    (p.variantes || []).forEach(v => {
      const disponibles = v.lugares_totales
        ? ` · ${v.lugares_totales - (v.lugares_vendidos || 0)} lugares disponibles`
        : '';
      const anticipoInfo = v.anticipo_es_total
        ? 'pago completo al reservar'
        : `anticipo $${(v.anticipo || 0).toLocaleString('es-MX')}/persona`;
      pkgsInfo += `   - ${v.nombre}: $${(v.precio || 0).toLocaleString('es-MX')}/persona · ${anticipoInfo}${disponibles}\n`;
    });
    (p.tours || []).forEach(t => {
      pkgsInfo += `   - Tour opcional ${t.nombre}: +$${(t.precio || 0).toLocaleString('es-MX')}/persona\n`;
    });
    if (p.nota) pkgsInfo += `   ⚠️ ${p.nota}\n`;
  });

  let prompt = `Eres Mateo, asesor de ventas de Zipolite al Desnudo, agencia LGBT+ mexicana con más de 10 años de experiencia y +342 viajeros. Eres cálido, directo y experto en cerrar ventas. Tu objetivo principal es que el usuario reserve.

SOBRE LA AGENCIA:
- Especialistas en viajes LGBT+ a Zipolite, Oaxaca
- +10 años creando experiencias, +342 viajeros satisfechos, 5 estrellas
- Ambiente 100% seguro, inclusivo y libre de discriminación
- Comunidad real: llegas solo y regresas con amigos

PAQUETES ACTUALES:${pkgsInfo}
RESERVAS: https://zipolitealdesnudo.com

OPERATIVA DE RESERVAS:
- Liquidación: el saldo restante se liquida 15 días antes del viaje
- Contrato: sí, al confirmar la reserva el cliente recibe un contrato digital por email automáticamente
- Anticipo no reembolsable; saldo adicional pagado se reembolsa si cancela con más de 30 días de anticipación

CÁLCULO DE FINANCIAMIENTO:
TASAS REALES DE CLIP (gross-up):
- Contado con tarjeta: 4.18%
- 3 meses: 9.48%
- 6 meses: 12.96%
- 9 meses: 17.02%
- 12 meses: 18.99%
- 18 meses: 26.53%
- 24 meses: 35.69%

Fórmula: total_con_cargo = monto / (1 - tasa/100) → mensualidad = total_con_cargo / meses

Ejemplo glamping 4 personas a 6 meses:
    monto = $19,000
    total_con_cargo = $19,000 / (1 - 0.1296) = $19,000 / 0.8704 = $21,829
    mensualidad = $21,829 / 6 = $3,638/mes
    cargo extra = $21,829 - $19,000 = $2,829

FORMATO OBLIGATORIO para respuestas de financiamiento:
"[emoji] *[Variante] · [N] personas · [X] meses*

💰 *$[mensualidad]/mes* — cómodo y sin estrés

• Precio base: $[precio × personas]
• Costo de financiamiento: +$[total - base]
• Total: $[total_con_cargo]
• Mensualidad: *$[mensualidad]* × [X] meses

¿[CTA de cierre]?"

REGLAS DE FINANCIAMIENTO:
• Emojis de variante: 🏕️ glamping, 🛏️ habitación, 🚌 transporte
• Nunca omitas el costo de financiamiento — es necesario para que los números cuadren
• NUNCA muestres la fórmula ni el proceso de cálculo
• Termina siempre con una pregunta de cierre
• Nunca mezcles variantes en una sola respuesta — pregunta primero cuál le interesa, luego calcula solo esa

CUANDO EL CLIENTE PREGUNTE SI EL COSTO ES POR PERSONA O POR TODOS:
Responde SIEMPRE con el desglose POR PERSONA primero, luego el total:

"Es por ambos. Por persona queda así:

🏕️ *Por persona · [X] meses*
• Precio: $[precio_variante]
• Financiamiento: +$[cargo_por_persona]
• Total por persona: $[total_por_persona]
• Mensualidad: *$[mensualidad_por_persona]/mes* × [X] meses

En total entre [N] personas: *$[mensualidad_total]/mes*

¿[CTA]?"

REGLA CRÍTICA: La mensualidad por persona = (precio_variante / (1 - tasa)) / meses. NUNCA dividas la mensualidad total entre personas después — calcula siempre desde el precio individual.

FORMAS DE PAGO DETALLADAS:
- Transferencia/depósito: sin cargo extra. El cliente transfiere y manda comprobante.
- Tarjeta con financiamiento: aplica cargo según tabla de arriba. Se procesa en el sitio con Clip.
- Para transferencia, el equipo comparte los datos bancarios al confirmar la reserva (Banco y CLABE se proporcionan al cliente cuando confirma que quiere pagar por transferencia)

FORMATO VISUAL DE RESPUESTAS:
• Usa *negritas* para precios, nombres de variantes y datos clave
• Usa emojis como separadores visuales, no como decoración aleatoria
• Máximo 4 líneas por bloque de información
• Siempre deja una línea en blanco antes de la pregunta de cierre
• Para listas usa • no guiones
• Nunca uses texto plano para precios — siempre *$X,XXX*

PERSONALIDAD Y ESTILO:
- Eres un vendedor consultivo, cálido y con personalidad. No eres un catálogo de precios.
- Si el mensaje empieza con [CONTEXTO:], sigue las instrucciones de ese contexto exactamente.
- Si es texto libre sin contexto, haz UNA pregunta para entender al cliente antes de dar info.
- Nunca listes todas las variantes de golpe. Recomienda la más apropiada según lo que sabes del cliente.
- Usa el nombre del cliente siempre que lo sepas.
- Mensajes cortos — máximo 4 líneas por respuesta.
- Termina SIEMPRE con una pregunta que avance hacia el cierre o una CTA clara.

FLUJO DE CIERRE (síguelo en orden):
1. CALIFICAR → Pregunta: ¿solo o en grupo? ¿cuántas personas? ¿ya conoce Zipolite?
2. RECOMENDAR → Basado en respuestas, sugiere UNA variante específica con precio y anticipo
3. MANEJAR OBJECIONES → Si dice "está caro": habla de financiamiento y del valor. Si dice "voy solo": habla de la comunidad.
4. CERRAR → "¿Te aparto el lugar?" — si el usuario confirma, di "¡Perfecto! Usa el botón de abajo 👇" — el sistema guiará el proceso de pago paso a paso
5. COBRAR → NUNCA pidas nombre, email ni datos bancarios — el sistema los recopila automáticamente con los botones
6. CONFIRMAR → Avisa que recibirá confirmación por email

MANEJO DE OBJECIONES:
- "Está caro" → "Entiendo. ¿Sabías que puedes apartar tu lugar con solo $1,500 y el resto pagarlo en partes?"
- "Voy solo" → "¡Perfecto! La mayoría llega solo. Al segundo día ya tienes nuevos amigos."
- "No sé si puedo ir" → "¿Qué te lo impediría? A veces encontramos solución."
- "Lo pienso" → "Claro. Solo te digo que quedan [X] lugares y el año pasado se llenó. ¿Qué necesitas saber?"

SOBRE EL DESTINO:
- Zipolite es la única playa nudista legal de México, en Oaxaca. Ambiente relajado, sin juicios.
- No es obligatorio el nudismo — cada quien a su ritmo
- Hotel Los Ángeles (glamping): 5 hectáreas, alberca, duchas, seguridad, a 2 calles de la playa
- Hotel Juquila (habitaciones): rústico, a calle y media de la playa, sin asignación de compañero

REGLAS ESTRICTAS:
1. Responde SIEMPRE en español
2. NUNCA pidas WhatsApp — el usuario ya está en Telegram
3. NUNCA pidas email a menos que el usuario lo ofrezca
4. NUNCA listes todas las opciones de golpe — recomienda UNA y pregunta
5. NUNCA mandas al sitio web como primera respuesta — es el último recurso
6. Si el usuario quiere agendar llamada: responde ÚNICAMENTE con AGENDAR_LLAMADA
7. Si necesita asesor humano: termina con ESCALAR_ASESOR
8. NUNCA digas que la cena del 31 o los consumos están incluidos — van por cuenta del viajero
9. NUNCA inventes información que no esté en este prompt
10. Crea urgencia real: menciona disponibilidad cuando sea relevante
11. Nunca digas "no tengo ese detalle" o "consúltalo al reservar" para preguntas sobre liquidación, contrato, financiamiento o formas de pago — tienes toda esa información en este prompt, úsala`;

  if (resenas && resenas.length > 0) {
    prompt += '\n\nRESEÑAS REALES DE VIAJEROS:\n';
    resenas.slice(0, 3).forEach(r => {
      prompt += `- "${r.texto}" — ${r.nombre}\n`;
    });
  }

  return prompt;
}

// ─── FUNCIONES UTILITARIAS ───────────────────────────────────

async function sendMessage(token, chatId, text, inlineButtons = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: inlineButtons
      ? { inline_keyboard: inlineButtons }
      : REPLY_KEYBOARD
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
    .select('historial, nombre, email, whatsapp, estado_embudo, estado_reserva')
    .eq('chat_id', chatId)
    .maybeSingle();
  return data || { historial: [], nombre: null, email: null, whatsapp: null, estado_reserva: null };
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

// ─── TASAS Y CÁLCULO DE FINANCIAMIENTO ──────────────────────

const CLIP_RATES = { 0: 4.18, 3: 9.48, 6: 12.96, 9: 17.02, 12: 18.99, 18: 26.53, 24: 35.69 };

function calcFinanciamiento(monto, meses) {
  const tasa = CLIP_RATES[meses] ?? 4.18;
  const total = Math.round(monto / (1 - tasa / 100));
  const cargo = total - monto;
  const mensualidad = meses > 0 ? Math.round(total / meses) : null;
  return { total, cargo, mensualidad, tasa };
}

async function handleMesesSelection(chatId, meses, ctx, conv, token) {
  const personasNum = ctx.personas || 1;
  const montoBase = ctx.tipo_pago === 'total'
    ? (ctx.precio || 0) * personasNum
    : ((ctx.anticipo || 0) > 0 ? (ctx.anticipo || 0) * personasNum : (ctx.precio || 0) * personasNum);
  const { total, cargo, mensualidad } = calcFinanciamiento(montoBase, meses);
  const varEmoji = (ctx.variante_nombre || '').toLowerCase().includes('glamping') ? '🏕️'
    : (ctx.variante_nombre || '').toLowerCase().includes('habitaci') ? '🛏️'
    : (ctx.variante_nombre || '').toLowerCase().includes('transport') ? '🚌' : '💳';
  const label = ctx.variante_nombre || ctx.paquete_nombre || 'Paquete';
  const personas = `${personasNum} persona${personasNum > 1 ? 's' : ''}`;
  let resumenMsg;
  if (meses === 0) {
    resumenMsg =
      `${varEmoji} *${label} · ${personas} · Contado*\n\n` +
      `• Precio base: *$${montoBase.toLocaleString('es-MX')}*\n` +
      `• Cargo por tarjeta: +*$${cargo.toLocaleString('es-MX')}*\n` +
      `• *Total a pagar: $${total.toLocaleString('es-MX')} MXN*\n\n` +
      `¿Cuál es tu *nombre completo* para la reserva? 👇`;
  } else {
    resumenMsg =
      `${varEmoji} *${label} · ${personas} · ${meses} meses*\n\n` +
      `💰 *$${mensualidad.toLocaleString('es-MX')}/mes* — cómodo y sin estrés\n\n` +
      `• Precio base: $${montoBase.toLocaleString('es-MX')}\n` +
      `• Costo de financiamiento: +$${cargo.toLocaleString('es-MX')}\n` +
      `• Total: $${total.toLocaleString('es-MX')}\n` +
      `• Mensualidad: *$${mensualidad.toLocaleString('es-MX')}* × ${meses} meses\n\n` +
      `¿Cuál es tu *nombre completo* para la reserva? 👇`;
  }
  await saveHistorial(chatId, conv.historial, {
    estado_reserva: { ...ctx, step: 'pidiendo_nombre', meses }
  });
  await sendMessage(token, chatId, resumenMsg);
}

// ─── CREAR RESERVA + PAGO ────────────────────────────────────

async function crearReservaYPago(token, chatId, estado) {
  console.log('=== crearReservaYPago CALLED ===');
  console.log('estado:', JSON.stringify(estado, null, 2));

  const CLIP_API_KEY = process.env.CLIP_API_KEY;
  const CLIP_SECRET_KEY = process.env.CLIP_SECRET_KEY;
  console.log('CLIP_API_KEY exists:', !!CLIP_API_KEY);
  console.log('CLIP_SECRET_KEY exists:', !!CLIP_SECRET_KEY);

  await sendMessage(token, chatId, 'DEBUG: función llamada. Revisa logs de Vercel.');
}
// ─── HANDLER DE IA UNIFICADO ─────────────────────────────────

async function handleWithClaude(chatId, userMessage, conv, contacto, paquetes, resenas, token, nombre, inlineButtons = null) {
  const historial = conv.historial || [];
  const messages = [
    ...historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: userMessage }
  ];

  let reply = '¡Hola! Soy Mateo 🌊 Visita zipolitealdesnudo.com para ver nuestros paquetes.';

  if (process.env.ANTHROPIC_API_KEY) {
    const contextExtra = nombre ? `El usuario se llama ${nombre}.` : '';
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: buildSystemPrompt(paquetes, resenas) + (contextExtra ? `\n\nCONTEXTO: ${contextExtra}` : ''),
        messages
      })
    });
    const aiData = await aiRes.json();
    reply = aiData.content?.[0]?.text || reply;
  }

  const escalar = reply.includes('ESCALAR_ASESOR');
  const agendar = reply.includes('AGENDAR_LLAMADA');
  reply = reply.replace('ESCALAR_ASESOR', '').replace('AGENDAR_LLAMADA', '').trim();

  const nombreMatch = reply.match(/NOMBRE:([^\n]+)/);
  const newHistorial = [
    ...historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: userMessage },
    { role: 'assistant', content: reply }
  ];

  if (nombreMatch) {
    const nuevoNombre = nombreMatch[1].trim();
    reply = reply.replace(/NOMBRE:[^\n]+/, '').trim();
    await actualizarContacto(chatId, { nombre: nuevoNombre, estado_crm: 'contactado', temperatura: 'tibio' });
    await saveHistorial(chatId, newHistorial, { nombre: nuevoNombre });
  } else {
    await saveHistorial(chatId, newHistorial, {});
  }

  if (agendar) {
    const agendarMsg = reply.trim() || `📞 *Agendemos tu llamada*\n\n¿Cuándo prefieres que te llamemos?`;
    await sendMessage(token, chatId, agendarMsg, [
      [{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]);
  } else {
    let finalButtons = inlineButtons;
    const closingPhrases = ['¿te aparto', '¿apartamos', '¿reservamos'];
    const isClosingButton = closingPhrases.some(ph => reply.toLowerCase().includes(ph));
    if (isClosingButton && paquetes.length > 0) {
      const allText = [...historial.map(m => m.content), userMessage].join(' ').toLowerCase();
      const relevantPaq = paquetes.find(p => allText.includes(p.nombre.toLowerCase())) || paquetes[0];
      const pkgSlug = slugify(relevantPaq.nombre);
      finalButtons = [
        [
          { text: '✅ Confirmar reserva', callback_data: `reservar_${pkgSlug}` },
          { text: '💳 Ver formas de pago', callback_data: 'info_pagos' }
        ]
      ];
    }
    await sendMessage(token, chatId, reply, finalButtons);
  }

  await registrarInteraccion(contacto?.id, 'mensaje_saliente', reply);

  if (escalar) {
    await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
    await registrarInteraccion(contacto?.id, 'nota', 'Usuario solicitó hablar con asesor');
    const alertaText = `🚨 *Usuario pide asesor*\n\nNombre: ${nombre}\nChat ID: ${chatId}\nMensaje: ${userMessage.substring(0, 200)}`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
    });
  }
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
        ? `[CONTEXTO: El usuario quiere información sobre el paquete "${paq.nombre}". Sigue el flujo consultivo: haz UNA pregunta para calificar (¿solo o en grupo? ¿cuántas personas?). NO listes todas las variantes todavía.]`
        : `[CONTEXTO: El usuario toca el botón de un paquete de viaje. Pregúntale cuál le interesa y cuántas personas van.]`;
      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre);
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

      // Persist variant context for the reservation flow
      if (foundVar && foundPaq) {
        await saveHistorial(chatId, conv.historial, {
          estado_reserva: {
            step: null,
            paquete_id: foundPaq.id,
            paquete_nombre: foundPaq.nombre,
            variante_id: foundVar.id,
            variante_nombre: foundVar.nombre,
            precio: foundVar.precio,
            anticipo: foundVar.anticipo,
            personas: null,
            nombre: null,
            email: null
          }
        });
      }

      const slug = slugify(foundPaq?.nombre || '');
      const varButtons = slug ? [
        [
          { text: '✅ Reservar ahora', callback_data: `reservar_${slug}` },
          { text: '💳 Ver formas de pago', callback_data: 'info_pagos' }
        ]
      ] : null;

      await registrarInteraccion(contacto?.id, 'mensaje_entrante', `tap: ${data}`);
      await handleWithClaude(chatId, context, conv, contacto, paquetes, resenas, token, nombre, varButtons);
      return res.status(200).end();
    }

    // ── Confirmar reserva → iniciar flujo de nombre/email ──
    if (data.startsWith('reservar_')) {
      const conv = await getHistorial(chatId);
      const slug = data.slice(9);
      const paq = paquetes.find(p => slugify(p.nombre) === slug);
      const existingCtx = conv.estado_reserva || {};

      await saveHistorial(chatId, conv.historial, {
        estado_reserva: {
          step: 'pidiendo_tipo_pago',
          paquete_id: existingCtx.paquete_id || paq?.id || null,
          paquete_nombre: existingCtx.paquete_nombre || paq?.nombre || slug.replace(/-/g, ' '),
          variante_id: existingCtx.variante_id || null,
          variante_nombre: existingCtx.variante_nombre || null,
          precio: existingCtx.precio || null,
          anticipo: existingCtx.anticipo || null,
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
      const ctx = conv.estado_reserva || {};
      const tipoPago = data === 'tipo_anticipo' ? 'anticipo' : 'total';
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

  // ── Flujo de reserva: multi-step ──
  const estadoReserva = conv.estado_reserva;

  if (estadoReserva?.step === 'pidiendo_tipo_pago') {
    const lower = userText.toLowerCase();
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
      return res.status(200).end();
    }
    const tipoPago = esAnticipo ? 'anticipo' : 'total';
    await saveHistorial(chatId, conv.historial, {
      estado_reserva: { ...estadoReserva, step: 'pidiendo_metodo', tipo_pago: tipoPago }
    });
    await sendMessage(token, chatId,
      `¿Cómo quieres pagar?\n\n🏦 *Transferencia* — sin cargo extra\n💳 *Tarjeta* — con o sin meses`,
      [[
        { text: '🏦 Transferencia', callback_data: 'metodo_transfer' },
        { text: '💳 Tarjeta', callback_data: 'metodo_tarjeta' }
      ]]
    );
    return res.status(200).end();
  }

  if (estadoReserva?.step === 'pidiendo_metodo') {
    const lower = userText.toLowerCase();
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
      return res.status(200).end();
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
    return res.status(200).end();
  }

  if (estadoReserva?.step === 'pidiendo_meses') {
    const mesesMatch = userText.match(/\b(contado|0|3|6|9|12|18|24)\b/i);
    if (!mesesMatch) {
      await sendMessage(token, chatId,
        `Selecciona el plazo 👇`,
        [
          [{ text: 'Contado', callback_data: 'meses_0' }, { text: '3 meses', callback_data: 'meses_3' }, { text: '6 meses', callback_data: 'meses_6' }],
          [{ text: '9 meses', callback_data: 'meses_9' }, { text: '12 meses', callback_data: 'meses_12' }, { text: '18 meses', callback_data: 'meses_18' }, { text: '24 meses', callback_data: 'meses_24' }]
        ]
      );
      return res.status(200).end();
    }
    const meses = mesesMatch[1].toLowerCase() === 'contado' ? 0 : parseInt(mesesMatch[1]);
    await handleMesesSelection(chatId, meses, estadoReserva, conv, token);
    return res.status(200).end();
  }

  if (estadoReserva?.step === 'pidiendo_nombre') {
    const emailInMsg = userText.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailInMsg) {
      // Name and email sent together in one message
      const emailInput = emailInMsg[0].toLowerCase();
      const nuevoNombre = userText.replace(emailInMsg[0], '').replace(/\s+/g, ' ').trim() || nombre;
      await actualizarContacto(chatId, { nombre: nuevoNombre });
      await sendMessage(token, chatId, `Un momento, estoy generando tu link de pago... ⏳`);
      await crearReservaYPago(token, chatId, { ...estadoReserva, nombre: nuevoNombre, email: emailInput });
    } else {
      const nuevoNombre = userText.trim();
      await saveHistorial(chatId, conv.historial, {
        estado_reserva: { ...estadoReserva, step: 'pidiendo_email', nombre: nuevoNombre }
      });
      await actualizarContacto(chatId, { nombre: nuevoNombre });
      await sendMessage(token, chatId,
        `Perfecto, *${nuevoNombre}* 👋\n\n¿Cuál es tu email para enviarte la confirmación?`
      );
    }
    return res.status(200).end();
  }

  if (estadoReserva?.step === 'pidiendo_email') {
    const emailInput = userText.trim().toLowerCase();
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      await sendMessage(token, chatId, `Ese email no parece válido, ¿puedes verificarlo? 🙏`);
      return res.status(200).end();
    }
    await sendMessage(token, chatId, `Un momento, estoy generando tu link de pago... ⏳`);
    await crearReservaYPago(token, chatId, { ...estadoReserva, email: emailInput });
    return res.status(200).end();
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
