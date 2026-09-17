import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MAX_DAILY = 40;
const DELAY_MS = 3000;

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET || 'zipolite-crm-2026';
  if (req.method !== 'GET') return res.status(405).end();
  if (authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1. Get active packages for message content
  const { data: paquetes } = await sb
    .from('paquetes')
    .select('id, nombre, fechas, precio, icono')
    .eq('activo', true)
    .order('created_at');

  // 2. Get leads to contact
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads } = await sb
    .from('contactos')
    .select(`
      id, nombre, telegram_chat_id, crm_mensajes_enviados, estado_crm,
      conversaciones_telegram!inner(chat_id, updated_at)
    `)
    .eq('opt_out', false)
    .neq('estado_crm', 'reservado')
    .lt('crm_mensajes_enviados', 3)
    .not('telegram_chat_id', 'is', null)
    .or(`crm_ultimo_mensaje.is.null,crm_ultimo_mensaje.lt.${sevenDaysAgo}`)
    .filter('conversaciones_telegram.updated_at', 'lt', sevenDaysAgo)
    .limit(MAX_DAILY);

  if (!leads || leads.length === 0) {
    return res.json({ sent: 0, message: 'No leads to contact' });
  }

  // 3. Build message based on crm_mensajes_enviados count
  function buildMessage(lead, paquetes, messageNumber) {
    const nombre = lead.nombre?.split(' ')[0] || 'amigo';
    const pkgList = (paquetes || []).map(p =>
      `${p.icono || '🌴'} *${p.nombre}*`
    ).join('\n');

    if (messageNumber === 0) {
      return {
        text: `🌊 Hola ${nombre}, soy Mateo de Zipolite al Desnudo 🌈\n\nTenemos viajes disponibles para ti:\n\n${pkgList}\n\n¿Te interesa alguno?`,
        buttons: [
          ...(paquetes || []).map(p => ([{
            text: `${p.icono || '🌴'} ${p.nombre}`,
            callback_data: `pkg_${p.id}`
          }])),
          [{ text: '❌ No me contacten', callback_data: 'opt_out' }]
        ]
      };
    }

    if (messageNumber === 1) {
      return {
        text: `🌴 ${nombre}, ¿sabes que Zipolite es la única playa nudista legal de México?\n\nNuestra comunidad LGBT+ ha crecido a +342 viajeros que llegan solos y regresan con amigos.\n\nEl viaje de Año Nuevo tiene solo 42 lugares — se llena rápido.\n\n¿Te cuento más?`,
        buttons: [
          [{ text: '🎆 Sí, cuéntame del Año Nuevo', callback_data: `pkg_05c33974-5f37-4cff-9ec4-bc60df160f69` }],
          [{ text: '❌ No me contacten más', callback_data: 'opt_out' }]
        ]
      };
    }

    if (messageNumber === 2) {
      return {
        text: `⏰ ${nombre}, último aviso — quedan pocos lugares para Año Nuevo al Desnudo.\n\nAparta tu lugar con solo $1,500 de anticipo y el resto lo pagas después.\n\n¿Lo apartamos?`,
        buttons: [
          [{ text: '✅ Quiero apartar mi lugar', callback_data: `reservar_ano-nuevo-al-desnudo` }],
          [{ text: '❌ No me contacten más', callback_data: 'opt_out' }]
        ]
      };
    }
  }

  // 4. Send messages with delay
  let sent = 0;
  const results = [];

  for (const lead of leads) {
    const chatId = lead.telegram_chat_id;
    const msgNumber = lead.crm_mensajes_enviados || 0;
    const msg = buildMessage(lead, paquetes, msgNumber);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: msg.text,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: msg.buttons }
          })
        }
      );

      if (response.ok) {
        await sb.from('contactos').update({
          crm_mensajes_enviados: msgNumber + 1,
          crm_ultimo_mensaje: new Date().toISOString(),
          proxima_accion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          estado_crm: msgNumber >= 2 ? 'perdido' : 'seguimiento'
        }).eq('id', lead.id);

        sent++;
        results.push({ chat_id: chatId, nombre: lead.nombre, status: 'sent', message: msgNumber + 1 });
      } else {
        const err = await response.json();
        results.push({ chat_id: chatId, error: err.description });
      }
    } catch (e) {
      results.push({ chat_id: chatId, error: e.message });
    }

    if (sent < leads.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // ── Contactos sin Telegram pero con email ──────────────────
  const { data: leadsSinTg } = await sb
    .from('contactos')
    .select('id, nombre, email, crm_mensajes_enviados, estado_crm')
    .eq('opt_out', false)
    .neq('estado_crm', 'reservado')
    .lt('crm_mensajes_enviados', 1)
    .is('telegram_chat_id', null)
    .not('email', 'is', null)
    .or(`crm_ultimo_mensaje.is.null,crm_ultimo_mensaje.lt.${sevenDaysAgo}`)
    .limit(20);

  if (leadsSinTg?.length && process.env.RESEND_API_KEY) {
    for (const lead of leadsSinTg) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Zipolite al Desnudo <hola@zipolitealdesnudo.com>',
            to: [lead.email],
            subject: '🌊 Tu lugar en Zipolite te espera',
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                <h2 style="color:#0B2E3E;">Hola ${lead.nombre || 'viajero'} 👋</h2>
                <p>Vimos que te interesaste en nuestros viajes LGBT+ a Zipolite, Oaxaca. Queremos ayudarte a encontrar el paquete perfecto para ti.</p>
                <p style="margin:16px 0;"><strong>Tenemos disponibilidad limitada</strong> en nuestros próximos viajes. Nuestro asesor Mateo puede resolver todas tus dudas en segundos.</p>
                <a href="https://t.me/Mateotravel_bot"
                  style="display:inline-block;padding:12px 24px;background:#1a9fa0;color:#fff;border-radius:99px;text-decoration:none;font-weight:700;margin-bottom:12px;">
                  💬 Chatear con Mateo en Telegram
                </a>
                <br>
                <a href="https://wa.me/529582199953"
                  style="display:inline-block;padding:12px 24px;background:#25D366;color:#fff;border-radius:99px;text-decoration:none;font-weight:700;">
                  💚 Escribir por WhatsApp
                </a>
                <p style="margin-top:24px;color:#6b7280;font-size:0.82rem;">
                  Si no deseas recibir más mensajes,
                  <a href="https://zipolitealdesnudo.com/api/optout?email=${encodeURIComponent(lead.email)}">haz clic aquí</a>.
                </p>
              </div>`
          })
        });

        await sb.from('contactos').update({
          crm_mensajes_enviados: (lead.crm_mensajes_enviados || 0) + 1,
          crm_ultimo_mensaje: new Date().toISOString()
        }).eq('id', lead.id);

        await new Promise(r => setTimeout(r, 2000));
      } catch(e) {
        console.error('CRM email error:', lead.email, e.message);
      }
    }
  }

  return res.json({ sent, total: leads.length, results });
}
