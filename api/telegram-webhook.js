import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_HISTORIAL = 10;

const MENU_PRINCIPAL = {
  text: `🌊 ¡Hola! Soy Mateo, asesor de Zipolite al Desnudo 🌈

Llevamos más de 10 años creando experiencias LGBT+ en la playa más libre de México. +342 viajeros ya vivieron esto. ¿Tú cuándo te unes?`,
  buttons: [
    [{ text: '🏕️ Año Nuevo al Desnudo', callback_data: 'pkg_anonuevo' }],
    [{ text: '🌙 Lunas de Octubre', callback_data: 'pkg_lunas' }],
    [{ text: '💳 Métodos de pago', callback_data: 'info_pagos' }],
    [{ text: '❓ Preguntas frecuentes', callback_data: 'faq_menu' }],
    [{ text: '🙋 Hablar con un asesor', callback_data: 'asesor' }]
  ]
};

const RESPUESTAS = {
  pkg_anonuevo: {
    text: `🏕️ Año Nuevo al Desnudo

📅 29 dic 2026 → 3 ene 2027 · 5 días / 4 noches
💰 Desde $4,750 por persona

🚌 Salida CDMX: 29 dic · 10:00pm (cita 9:30pm)
🏠 Regreso: 3 ene · 6:00pm · Llegada CDMX madrugada 4 ene

✅ ¿QUÉ INCLUYE?

🏕️ Camping en área privada de 5 hectáreas:
- Alberca · Duchas · Sanitarios · Electricidad · Seguridad
- A 2 calles de la playa y 1 calle del adoquín
- Por promoción: tienda y colchón inflable en préstamo

🚌 Autobús con chofer certificado SCT, seguro de viajero, WC, pantallas y cargadores USB

🌅 Day Pass incluido el último día — te quedas en instalaciones hasta las 6pm

📅 ITINERARIO
30 dic — Llegada a Zipolite. Día libre 🌊
31 dic — Tour Mazunte + Punta Cometa 🌅 → Cena grupal en Restaurante 3 de Diciembre* → Bar en playa · show drag · fuegos artificiales · Año Nuevo 🎆
1 ene — Día libre 🏖️
2 ene — Opcional: Carrizalillo + Bioluminiscencia Laguna Manialtepec ✨ (+$1,000 por persona)
3 ene — Regreso CDMX (cita 5:30pm)
*La cena es a costo del viajero — nosotros organizamos la reserva del restaurante para que disfruten sin contratiempos 🍕

🛏️ ¿QUIERES MÁS COMODIDAD?
Hotel rústico · Cama matrimonial · Baño privado · Ventilador
- 1 persona en habitación: $10,750 por persona — aparta con $3,000
- 2 personas en habitación: $7,750 por persona — aparta con $3,000 por persona
⚠️ Solo 5 habitaciones disponibles

🏕️ Camping: $4,750 por persona — aparta con $1,500 por persona

⚠️ En Zipolite no existe el todo incluido. Alimentos, bebidas, propinas y gastos personales van por cuenta de cada viajero.

¿Te vas con nosotros? 🔥`,
    buttons: [
      [{ text: '✅ ¡Me apunto!', callback_data: 'reservar_anonuevo' }],
      [{ text: '🛏️ Quiero habitación', callback_data: 'habitacion_info' }],
      [{ text: '🌊 Tour opcional +$1,000', callback_data: 'tour_opcional' }],
      [{ text: '💳 Formas de pago', callback_data: 'info_pagos' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  pkg_lunas: {
    text: `🌙 Lunas de Octubre

📅 22 → 27 octubre 2026 · 6 días / 5 noches
💰 $8,854 por persona

✈️ VUELO REDONDO CDMX INCLUIDO
- Salida: jue 22 oct · 12:00pm desde AICM
- Regreso: mar 27 oct · 10:32pm

✅ ¿QUÉ INCLUYE?
- Vuelo redondo Ciudad de México ↔ Zipolite
- 5 noches en Hotel Paraíso — línea de playa 🌊
- Habitación doble
- Traslados aeropuerto ↔ hotel

Todo incluido. Solo llega y disfruta.

💰 Aparta tu lugar con $1,500 por persona

⚠️ En Zipolite no existe el todo incluido. Alimentos, bebidas, propinas y gastos personales van por cuenta de cada viajero.

¿Te lo agendamos? 🌙`,
    buttons: [
      [{ text: '✅ Quiero reservar', callback_data: 'reservar_lunas' }],
      [{ text: '💳 Formas de pago', callback_data: 'info_pagos' }],
      [{ text: '🙋 Tengo preguntas', callback_data: 'asesor' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  info_pagos: {
    text: `💳 Formas de pago

🏦 Transferencia o depósito bancario
- Sin cargos adicionales
- Confirmación en 24 horas

💳 Tarjeta con financiamiento
- 3, 6, 9, 12, 18 o 24 meses
- Se aplica cargo por financiamiento

En ambos casos apartas tu lugar con el anticipo y liquidas el resto antes del viaje. Tu lugar queda asegurado desde el primer pago. ✅

¿Qué paquete te interesa?`,
    buttons: [
      [{ text: '🏕️ Año Nuevo al Desnudo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🌙 Lunas de Octubre', callback_data: 'pkg_lunas' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_menu: {
    text: '❓ Preguntas frecuentes\n\n¿Sobre qué tienes dudas? 👇',
    buttons: [
      [{ text: '🌊 ¿Qué es Zipolite?', callback_data: 'faq_zipolite' }],
      [{ text: '👙 ¿Tengo que ser nudista?', callback_data: 'faq_nudismo' }],
      [{ text: '👤 ¿Puedo ir solo?', callback_data: 'faq_solo' }],
      [{ text: '🏳️‍🌈 ¿Solo es para LGBT+?', callback_data: 'faq_lgbt' }],
      [{ text: '❌ ¿Qué pasa si cancelo?', callback_data: 'faq_cancelacion' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_zipolite: {
    text: `🌊 ¿Qué es Zipolite?

Zipolite es la playa más libre de México, en Oaxaca. Un lugar donde puedes ser tú mismo sin filtros ni juicios. Ambiente relajado, naturaleza increíble y una comunidad que te recibe como eres. 🌴

Es uno de los pocos destinos en México donde la libertad no es un concepto — es la forma de vivir.`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_nudismo: {
    text: `👙 ¿Tengo que ser nudista?

Para nada. Nadie está obligado a nada. Tú decides cómo vivir la experiencia, siempre desde el respeto y tu comodidad.

Hay quienes van en traje de baño todo el tiempo y también quienes se sueltan poco a poco. Lo importante es que te sientas libre a tu manera. 😊`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_solo: {
    text: `👤 ¿Puedo ir solo?

Sí, y es de lo más común. Muchos de nuestros viajeros llegan solos y regresan con amistades nuevas para toda la vida.

Nuestros grupos están diseñados para que desde antes de salir ya te sientas acompañado. Llegas solo, regresas en familia. 🌈`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_lgbt: {
    text: `🏳️‍🌈 ¿Solo es para LGBT+?

Somos una agencia 100% LGBT+ friendly. Nuestros grupos tienen principalmente viajeros LGBT+, aliados y personas con buena vibra.

No importa quién seas — lo importante es el respeto y las ganas de pasarla bien. Aquí no tienes que encajar... solo llegar. 💛`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_cancelacion: {
    text: `❌ ¿Qué pasa si cancelo?

El anticipo no es reembolsable ya que se usa para asegurar tu lugar desde el momento en que reservas.

Si cancelas con más de 30 días de anticipación, se reembolsa el saldo adicional que hayas pagado.

Te explicamos todo claramente desde el inicio — sin letras chiquitas. 📋`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  habitacion_info: {
    text: `🛏️ Habitaciones — Año Nuevo al Desnudo

Hotel rústico a 2 calles de la playa y a calle y media del adoquín:
- Cama matrimonial
- Baño privado
- Ventilador de techo

💰 Precios:
- 1 persona en habitación: $10,750 por persona
- 2 personas en habitación: $7,750 por persona
- Anticipo: $3,000 por persona

⚠️ Solo 5 habitaciones disponibles — se agotan rápido

¿Quieres apartar la tuya?`,
    buttons: [
      [{ text: '✅ Quiero reservar con habitación', callback_data: 'reservar_anonuevo' }],
      [{ text: '⬅️ Ver paquete completo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  tour_opcional: {
    text: `🌊 Tour opcional — 2 de enero

Uno de los días más especiales del viaje:

🏖️ Playa Carrizalillo — Puerto Escondido
Una de las playas más bonitas de Oaxaca. Aguas turquesas, arena blanca y ambiente increíble.

✨ Laguna de Manialtepec — Bioluminiscencia
Al caer la noche abordamos una lancha y nadamos en aguas que brillan como estrellas. Una experiencia que no olvidarás.

✅ Incluye:
- Transporte Zipolite → Carrizalillo → Manialtepec → Zipolite
- Entrada a Laguna de Manialtepec
- Tour en lancha
- Guía local
- Chaleco salvavidas

💰 $1,000 por persona (costo adicional al paquete)

¿Te apuntas?`,
    buttons: [
      [{ text: '✅ ¡Me apunto al tour!', callback_data: 'reservar_anonuevo' }],
      [{ text: '⬅️ Ver paquete completo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  reservar_anonuevo: {
    text: `¡Perfecto! 🎉

Para reservar tu lugar en Año Nuevo al Desnudo entra aquí:
👉 https://zipolitealdesnudo.com

Elige tu paquete, llena tus datos y aparta con $1,500 por persona (camping) o $3,000 por persona (habitación).

Tu lugar queda confirmado desde el primer pago. ✅`,
    buttons: [
      [{ text: '🙋 Tengo dudas antes de reservar', callback_data: 'asesor' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  reservar_lunas: {
    text: `¡Perfecto! 🎉

Para reservar tu lugar en Lunas de Octubre entra aquí:
👉 https://zipolitealdesnudo.com

Aparta con $1,500 por persona y el resto lo pagas antes del viaje.

Tu lugar queda confirmado desde el primer pago. ✅`,
    buttons: [
      [{ text: '🙋 Tengo dudas antes de reservar', callback_data: 'asesor' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  asesor: {
    text: `¡Claro! Le aviso a un asesor ahora mismo 🙌

En breve alguien se comunicará contigo por este mismo chat.`,
    buttons: [
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  }
};

const SALUDOS = ['hola', 'hi', 'buenas', 'hey', 'inicio', 'start', 'info', 'ayuda', 'help', 'menu', 'menú', 'buenos días', 'buenos dias', 'buenas tardes', 'buenas noches'];

async function sendMessage(token, chatId, text, buttons) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  };
  if (buttons) {
    body.reply_markup = { inline_keyboard: buttons };
  }
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

async function getConversacion(chatId) {
  const { data } = await supabase
    .from('conversaciones_telegram')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle();
  return data;
}

async function saveConversacion(chatId, updates) {
  await supabase
    .from('conversaciones_telegram')
    .upsert({ chat_id: chatId, ...updates }, { onConflict: 'chat_id' });
}

async function upsertContacto(chatId, from) {
  const { data: existing } = await supabase
    .from('contactos')
    .select('id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data } = await supabase
    .from('contactos')
    .insert({
      telegram_chat_id: chatId,
      nombre: from?.first_name || 'Desconocido',
      origen: 'telegram',
      estado_crm: 'lead',
      temperatura: 'frio'
    })
    .select('id')
    .single();

  return data?.id;
}

async function registrarInteraccion(contactoId, tipo, resumen) {
  await supabase.from('interacciones').insert({
    contacto_id: contactoId,
    canal: 'telegram',
    tipo,
    resumen
  });
}

const systemPrompt = `Eres Mateo, asesor de ventas de Zipolite al Desnudo, agencia LGBT+ mexicana con más de 10 años de experiencia y +342 viajeros. Eres cálido, profesional y experto en cerrar ventas.

SOBRE LA AGENCIA:
- Especialistas en viajes LGBT+ a Zipolite, Oaxaca
- Más de 10 años creando experiencias
- +342 viajeros satisfechos, 5 estrellas
- Ambiente 100% seguro, inclusivo y libre

PAQUETES:
1. Año Nuevo al Desnudo - $4,750/persona camping
   - 29 dic 2026 al 3 ene 2027 · 5 días / 4 noches
   - Salida CDMX 29 dic 10pm (cita 9:30pm)
   - Regreso 3 ene 6pm
   - Itinerario: 30 dic día libre · 31 dic Mazunte + Punta Cometa. Organizamos reserva grupal en Restaurante 3 de Diciembre para cenar juntos — IMPORTANTE: el costo de la cena NO está incluido en el paquete, cada viajero paga su consumo. Después: bar en playa con show drag y fuegos artificiales para recibir el Año Nuevo. · 1 ene día libre · 2 ene tour opcional · 3 ene regreso
   - Incluye: transporte en autobús SCT, camping 5 hectáreas, alberca, duchas, seguridad, tienda y colchón en préstamo, Day Pass último día
   - Habitaciones disponibles (solo 5): 1 persona $10,750 · 2 personas $7,750 c/u · anticipo habitación $3,000
   - Tour opcional 2 ene: Carrizalillo + Bioluminiscencia Manialtepec · $1,000 extra
   - Anticipo camping: $1,500 por persona

2. Lunas de Octubre - $8,854/persona
   - 22 al 27 oct 2026 · 6 días / 5 noches
   - Incluye vuelo redondo CDMX, Hotel Paraíso línea de playa, habitación doble, traslados
   - Salida 22 oct 12pm AICM · Regreso 27 oct 10:32pm
   - Anticipo: $1,500 por persona

PAGOS: Transferencia/depósito (sin cargo) o financiamiento con tarjeta 3-24 meses
IMPORTANTE: En Zipolite no existe todo incluido. Alimentos, bebidas y gastos personales no están incluidos.

REGLAS:
- Responde siempre en español
- Sé breve, máximo 3 párrafos
- Tu objetivo es cerrar la venta — guía siempre hacia reservar
- Para reservar: https://zipolitealdesnudo.com
- Si piden asesor o no puedes resolver algo, termina con ESCALAR_ASESOR
- Si el usuario menciona nombre, email o WhatsApp extráelos y termina con DATOS:{"nombre":"...","email":"...","whatsapp":"..."}
- Nunca inventes precios ni fechas`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // Manejar callback_query (botones)
  if (body.callback_query) {
    const query = body.callback_query;
    const chatId = String(query.message.chat.id);
    const data = query.data;

    await answerCallback(token, query.id);
    await upsertContacto(chatId, query.from);

    if (data === 'menu') {
      await sendMessage(token, chatId, MENU_PRINCIPAL.text, MENU_PRINCIPAL.buttons);
      return res.status(200).end();
    }

    if (data === 'asesor') {
      await sendMessage(token, chatId, RESPUESTAS.asesor.text, RESPUESTAS.asesor.buttons);

      const alertaText = `🚨 Usuario pide asesor\n\nNombre: ${query.from?.first_name || 'Desconocido'}\nChat ID: ${chatId}\nUsername: @${query.from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText })
      });

      const { data: contactoData } = await supabase
        .from('contactos')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .maybeSingle();

      if (contactoData) {
        await supabase.from('contactos').update({
          estado_crm: 'seguimiento',
          temperatura: 'caliente'
        }).eq('id', contactoData.id);
      }

      return res.status(200).end();
    }

    if (RESPUESTAS[data]) {
      await sendMessage(token, chatId, RESPUESTAS[data].text, RESPUESTAS[data].buttons);
      return res.status(200).end();
    }

    return res.status(200).end();
  }

  // Manejar mensajes de texto
  if (!body.message?.text) return res.status(200).end();

  const chatId = String(body.message.chat.id);
  const userText = body.message.text.trim();
  const from = body.message.from;

  await upsertContacto(chatId, from);

  // Detectar saludos → mostrar menú
  const esSaludo = SALUDOS.some(s => userText.toLowerCase().includes(s)) || userText === '/start';
  if (esSaludo) {
    await sendMessage(token, chatId, MENU_PRINCIPAL.text, MENU_PRINCIPAL.buttons);
    return res.status(200).end();
  }

  // Texto libre → Claude
  const conversacion = await getConversacion(chatId);
  const historial = conversacion?.historial || [];
  const contactoId = await upsertContacto(chatId, from);

  if (contactoId) {
    await registrarInteraccion(contactoId, 'mensaje_entrante', userText.substring(0, 200));
  }

  const messages = [
    ...historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: userText }
  ];

  try {
    let reply;

    if (!process.env.ANTHROPIC_API_KEY) {
      reply = '¡Hola! Soy Mateo 🌊 Tu asesor de viajes LGBT+ a Zipolite. Visita zipolitealdesnudo.com para ver nuestros paquetes.';
    } else {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: systemPrompt,
          messages
        })
      });

      const aiData = await aiRes.json();
      reply = aiData.content?.[0]?.text || 'Lo siento, intenta de nuevo en un momento.';
    }

    const escalar = reply.includes('ESCALAR_ASESOR');
    reply = reply.replace('ESCALAR_ASESOR', '').trim();

    const datosMatch = reply.match(/DATOS:(\{.*?\})/s);
    let datosExtraidos = null;
    if (datosMatch) {
      try { datosExtraidos = JSON.parse(datosMatch[1]); } catch(e) {}
      reply = reply.replace(/DATOS:\{.*?\}/s, '').trim();
    }

    const nuevoHistorial = [
      ...historial.slice(-MAX_HISTORIAL),
      { role: 'user', content: userText },
      { role: 'assistant', content: reply }
    ];

    const updates = { historial: nuevoHistorial };
    if (datosExtraidos?.nombre) updates.nombre = datosExtraidos.nombre;
    if (datosExtraidos?.email) updates.email = datosExtraidos.email;
    if (datosExtraidos?.whatsapp) updates.whatsapp = datosExtraidos.whatsapp;
    await saveConversacion(chatId, updates);

    if (datosExtraidos && contactoId) {
      const contactUpdate = {};
      if (datosExtraidos.nombre) contactUpdate.nombre = datosExtraidos.nombre;
      if (datosExtraidos.email) contactUpdate.email = datosExtraidos.email;
      if (datosExtraidos.whatsapp) contactUpdate.whatsapp = datosExtraidos.whatsapp;
      if (Object.keys(contactUpdate).length > 0) {
        contactUpdate.estado_crm = 'contactado';
        contactUpdate.temperatura = 'tibio';
        await supabase.from('contactos').update(contactUpdate).eq('id', contactoId);
      }
    }

    await sendMessage(token, chatId, reply, [
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]);

    if (contactoId) {
      await registrarInteraccion(contactoId, 'mensaje_saliente', reply.substring(0, 200));
    }

    if (escalar) {
      if (contactoId) {
        await supabase.from('contactos').update({
          estado_crm: 'seguimiento',
          temperatura: 'caliente'
        }).eq('id', contactoId);
        await registrarInteraccion(contactoId, 'nota', 'Usuario solicitó hablar con asesor');
      }
      const alertaText = `🚨 Usuario pide asesor\n\nNombre: ${from?.first_name || 'Desconocido'}\nChat ID: ${chatId}\nUsername: @${from?.username || 'sin username'}\nMensaje: ${userText}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText })
      });
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).end();
  }
}
