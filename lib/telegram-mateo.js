import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MAX_HISTORIAL = 8;

// ─── CACHÉ DE PAQUETES ───────────────────────────────────────

let pkgCache = null;
let pkgCacheTime = 0;
const PKG_CACHE_MS = 10 * 60 * 1000;

export async function getPaqueteData() {
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

export const MENU_PRINCIPAL_TEXT = `🌊 *¡Hola! Soy Mateo* 🌈\n\nAsesor de Zipolite al Desnudo — más de 10 años llevando a la comunidad LGBT+ a la playa más libre de México.\n\n+342 viajeros ya vivieron esto. ¿Tú cuándo te unes?`;

export const RESPUESTAS = {
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

export const SALUDOS = ['hola', 'hi', 'buenas', 'hey', 'inicio', 'start', 'info', 'ayuda', 'help', 'menu', 'menú', 'buenos días', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'buen día'];

export const REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '🏠 Menú principal' }, { text: '📞 Agendar llamada' }, { text: '🙋 Hablar con asesor' }]
  ],
  resize_keyboard: true,
  persistent: true,
  input_field_placeholder: 'Escribe tu mensaje...'
};

export const REPLY_KB_ACTIONS = {
  '🏠 Menú principal': 'menu',
  '📞 Agendar llamada': 'agendar_dia',
  '🙋 Hablar con asesor': 'asesor'
};

// ─── HELPERS ─────────────────────────────────────────────────

export function slugify(nombre) {
  return (nombre || '')
    .toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function buildMenuButtons(paquetes) {
  return (paquetes || []).map(p => ([{
    text: `${p.icono || '🌴'} ${p.nombre}`,
    callback_data: `pkg_${p.id}`
  }]));
}

// Private helpers used internally by handleWithClaude
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

async function registrarInteraccion(contactoId, tipo, resumen) {
  if (!contactoId) return;
  await supabase.from('interacciones').insert({
    contacto_id: contactoId,
    canal: 'telegram',
    tipo,
    resumen: resumen.substring(0, 200)
  });
}

// ─── SISTEMA PROMPT ──────────────────────────────────────────

export function buildSystemPrompt(paquetes, resenas) {
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

// ─── EXTRACCIÓN DE CONTEXTO DESDE RESPUESTA ─────────────────

export function extractContextFromResponse(text, paquetes) {
  const textLower = text.toLowerCase();
  for (const p of paquetes) {
    for (const v of (p.variantes || [])) {
      if (!v.precio) continue;
      const precioStr = v.precio.toLocaleString('es-MX');
      const nombreLower = (v.nombre || '').toLowerCase();
      if (
        (nombreLower.length > 3 && textLower.includes(nombreLower)) ||
        text.includes(precioStr) ||
        text.includes('$' + v.precio)
      ) {
        return {
          paquete_id: p.id,
          paquete_nombre: p.nombre,
          variante_id: v.id,
          variante_nombre: v.nombre,
          precio: v.precio,
          anticipo: v.anticipo,
          anticipo_es_total: v.anticipo_es_total || false,
          personas: 1
        };
      }
    }
  }
  return null;
}

export function extractPersonas(replyText) {
  const soloMatch = /(va solo|viaja solo|va sola|\bsolo\b|\bsola\b)/i.test(replyText);
  if (soloMatch) return 1;
  const numMatch = replyText.match(/(?:somos|vamos|van|para|seré)\s*(\d+)/i)
    || replyText.match(/(\d+)\s*(?:persona|viajero|lugar)/i);
  return numMatch ? Math.max(1, parseInt(numMatch[1])) : null;
}

// ─── HANDLER DE IA UNIFICADO ─────────────────────────────────

export async function handleWithClaude(chatId, userMessage, conv, contacto, paquetes, resenas, token, nombre, inlineButtons = null) {
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

  // Extract package context from Claude's response and persist as pkg_context
  const extractedCtx = extractContextFromResponse(reply, paquetes);
  const personasDetected = extractPersonas(reply);
  if (extractedCtx || personasDetected) {
    const existingPkg = conv.pkg_context || {};
    let newPkg = extractedCtx
      ? { ...extractedCtx, personas: personasDetected || existingPkg.personas || 1 }
      : { ...existingPkg, personas: personasDetected };
    if (newPkg.precio || existingPkg.precio) {
      if (!newPkg.precio) newPkg = { ...existingPkg, ...newPkg };
      supabase.from('conversaciones_telegram')
        .update({ pkg_context: newPkg })
        .eq('chat_id', chatId)
        .then(() => {}).catch(e => console.error('pkg_context update error:', e));
    }
  }

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
    if (isClosingButton && paquetes.length > 0 && historial.length >= 6) {
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
