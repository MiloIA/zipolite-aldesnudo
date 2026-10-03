import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'zipolite_wh_2026';
const WA_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TG_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID  = process.env.TELEGRAM_CHAT_ID;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendWA(to, text) {
  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
}

async function notifyTelegram(msg) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: msg,
      parse_mode: 'HTML',
    }),
  });
}

// ── Lógica del bot Mateo ──────────────────────────────────────────────────────

const MENU = `¡Hola! Soy Mateo 🌊, el asistente de *Zipolite al Desnudo*.

¿En qué te puedo ayudar?

1️⃣ Ver paquetes disponibles
2️⃣ Reservar un lugar
3️⃣ Estado de mi reserva
4️⃣ Hablar con un agente

Escribe el número de tu opción.`;

const PAQUETES = `🏖️ *Paquetes Año Nuevo 2027 en Zipolite*

🌿 *Camping Año Nuevo* — $4,750
• 5 noches en la playa
• 48 lugares disponibles
• Incluye: campamento, actividades y acceso al área nudista

🏨 *Paquete Premium* — $8,500
• Hotel Paraíso, 5 noches
• Vuelo + traslados incluidos
• Financiamiento hasta 24 meses sin intereses

Para reservar escribe *RESERVAR* o llámanos al 958 219 9953.
🌐 zipolitealdesnudo.com`;

async function handleMessage(from, body) {
  const text = (body || '').trim().toLowerCase();

  // Guardar mensaje en Supabase para historial
  await sb.from('whatsapp_messages').insert({
    phone: from,
    message: body,
    direction: 'inbound',
    created_at: new Date().toISOString(),
  }).catch(() => {}); // no bloquear si la tabla no existe aún

  // Notificar a Telegram (admin)
  await notifyTelegram(`📱 <b>WhatsApp nuevo mensaje</b>\nDe: +${from}\n\n${body}`);

  // Lógica de respuestas
  if (['hola', 'hi', 'hello', 'buenas', 'buenos días', 'buen día', 'hey', 'inicio', 'inicio', 'menu', 'menú'].some(k => text.includes(k))) {
    return sendWA(from, MENU);
  }

  if (text === '1' || text.includes('paquete') || text.includes('precio') || text.includes('costo') || text.includes('cuánto') || text.includes('cuanto')) {
    return sendWA(from, PAQUETES);
  }

  if (text === '2' || text.includes('reservar') || text.includes('apartar') || text.includes('reserva')) {
    return sendWA(from, `Para reservar tu lugar necesito algunos datos:\n\n1. Tu nombre completo\n2. Paquete: Camping ($4,750) o Premium ($8,500)\n3. Número de personas\n\nO entra directo a nuestra web: https://zipolitealdesnudo.com`);
  }

  if (text === '3' || text.includes('estado') || text.includes('mi reserva') || text.includes('confirmacion') || text.includes('confirmación')) {
    return sendWA(from, `Para consultar tu reserva entra a:\nhttps://zipolitealdesnudo.com/mi-cuenta.html\n\nO escríbenos con tu nombre completo y te verificamos.`);
  }

  if (text === '4' || text.includes('agente') || text.includes('humano') || text.includes('persona')) {
    await notifyTelegram(`🚨 <b>Cliente pide agente humano en WhatsApp</b>\nTeléfono: +${from}\nMensaje: ${body}`);
    return sendWA(from, `Un agente te contactará pronto 🙏\n\nTambién puedes escribirnos directamente al mismo número o a:\n🌐 zipolitealdesnudo.com`);
  }

  // Respuesta por defecto
  return sendWA(from, `Gracias por escribirnos 🌊\n\nEscribe *HOLA* para ver el menú o contáctanos en:\n📞 958 219 9953\n🌐 zipolitealdesnudo.com`);
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Verificación del webhook (GET)
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WhatsApp webhook verificado ✓');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Token inválido' });
  }

  // Mensajes entrantes (POST)
  if (req.method === 'POST') {
    try {
      const body = req.body;

      // Confirmar recepción a Meta inmediatamente
      res.status(200).json({ status: 'ok' });

      const entry    = body?.entry?.[0];
      const changes  = entry?.changes?.[0];
      const value    = changes?.value;
      const messages = value?.messages;

      if (!messages?.length) return;

      for (const msg of messages) {
        const from    = msg.from;   // número sin "+"
        const msgType = msg.type;
        const text    = msgType === 'text' ? msg.text?.body : `[${msgType}]`;

        await handleMessage(from, text);
      }
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
