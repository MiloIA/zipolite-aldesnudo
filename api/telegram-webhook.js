import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_HISTORIAL = 10;

async function getConversacion(chatId) {
  const { data } = await supabase
    .from('conversaciones_telegram')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle();
  return data;
}

async function saveConversacion(chatId, updates) {
  const { data } = await supabase
    .from('conversaciones_telegram')
    .upsert({ chat_id: chatId, ...updates }, { onConflict: 'chat_id' })
    .select()
    .single();
  return data;
}

async function upsertContacto(chatId, nombre, from) {
  const existing = await supabase
    .from('contactos')
    .select('id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (existing.data) return existing.data.id;

  const { data } = await supabase
    .from('contactos')
    .insert({
      telegram_chat_id: chatId,
      nombre: nombre || from?.first_name || 'Desconocido',
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message } = req.body;
  if (!message?.text) return res.status(200).end();

  const chatId = String(message.chat.id);
  const userText = message.text;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // Obtener o crear conversación
  const conversacion = await getConversacion(chatId);
  const historial = conversacion?.historial || [];

  // Registrar contacto en CRM
  const contactoId = await upsertContacto(chatId, conversacion?.nombre, message.from);

  // Registrar interacción entrante
  if (contactoId) {
    await registrarInteraccion(contactoId, 'mensaje_entrante', userText.substring(0, 200));
  }

  const systemPrompt = `Eres Mateo, asesor de viajes LGBT+ de Zipolite al Desnudo, agencia mexicana especializada en viajes a Zipolite, Oaxaca. Eres cálido, amigable y conoces todos los paquetes a la perfección.

PAQUETES ACTUALES:
1. Año nuevo al desnudo - $4,750/persona
   - Fechas: 29 Dic 2026 al 3 Ene 2027
   - Incluye: Transporte terrestre CDMX↔Zipolite, 4 noches camping, tienda y colchón inflable en préstamo, área privada con seguridad/alberca/duchas/electricidad, a 2 calles de la playa
   - Solo 48 lugares disponibles

2. Lunas de Octubre - $8,854/persona
   - Fechas: 22 al 27 de Octubre 2026
   - Incluye: Vuelo redondo CDMX, 5 noches Hotel Paraíso línea de playa, habitación doble, traslados aeropuerto-hotel
   - Salida: Jueves 22 Oct 12:00pm, Regreso: Martes 27 Oct 10:32pm

PAGOS: Transferencia/depósito o financiamiento a 3, 6, 9, 12, 18 o 24 meses con tarjeta.
RESERVAS: https://zipolitealdesnudo.com
WHATSAPP: 958 219 9953

REGLAS:
- Responde siempre en español
- Sé breve y conversacional, máximo 3 párrafos
- Si el usuario quiere reservar, manda el link: https://zipolitealdesnudo.com
- Si en la conversación el usuario menciona su nombre, email o WhatsApp, extráelos y termina con: DATOS:{"nombre":"...","email":"...","whatsapp":"..."}
- Si pide hablar con un asesor o no puedes resolver algo, responde y termina con: ESCALAR_ASESOR
- Nunca inventes precios ni fechas`;

  // Construir mensajes con historial
  const messages = [
    ...historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: userText }
  ];

  try {
    let reply;

    if (!process.env.ANTHROPIC_API_KEY) {
      reply = '¡Hola! Soy Mateo 🌊 Tu asesor de viajes LGBT+ a Zipolite. Escríbenos al 958 219 9953 o visita zipolitealdesnudo.com';
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
      reply = aiData.content?.[0]?.text || 'Lo siento, no pude procesar tu mensaje. Escríbenos al 958 219 9953';
    }

    // Detectar escalación
    const escalar = reply.includes('ESCALAR_ASESOR');
    reply = reply.replace('ESCALAR_ASESOR', '').trim();

    // Detectar datos del usuario
    const datosMatch = reply.match(/DATOS:(\{.*?\})/s);
    let datosExtraidos = null;
    if (datosMatch) {
      try {
        datosExtraidos = JSON.parse(datosMatch[1]);
        reply = reply.replace(/DATOS:\{.*?\}/s, '').trim();
      } catch(e) {}
    }

    // Actualizar historial
    const nuevoHistorial = [
      ...historial.slice(-MAX_HISTORIAL),
      { role: 'user', content: userText },
      { role: 'assistant', content: reply }
    ];

    // Guardar conversación con datos extraídos
    const updates = { historial: nuevoHistorial };
    if (datosExtraidos?.nombre) updates.nombre = datosExtraidos.nombre;
    if (datosExtraidos?.email) updates.email = datosExtraidos.email;
    if (datosExtraidos?.whatsapp) updates.whatsapp = datosExtraidos.whatsapp;
    await saveConversacion(chatId, updates);

    // Actualizar contacto con datos extraídos
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

    // Enviar respuesta al usuario
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: 'HTML' })
    });

    // Registrar interacción saliente
    if (contactoId) {
      await registrarInteraccion(contactoId, 'mensaje_saliente', reply.substring(0, 200));
    }

    // Escalar a asesor
    if (escalar && contactoId) {
      await supabase.from('contactos').update({
        estado_crm: 'seguimiento',
        temperatura: 'caliente'
      }).eq('id', contactoId);

      await registrarInteraccion(contactoId, 'nota', 'Usuario solicitó hablar con asesor');

      const alertaText = `🚨 Usuario pide asesor\n\nNombre: ${conversacion?.nombre || message.from?.first_name || 'Desconocido'}\nChat ID: ${chatId}\nUsername: @${message.from?.username || 'sin username'}\nMensaje: ${userText}`;
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
