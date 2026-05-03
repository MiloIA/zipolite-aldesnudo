export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const {
    nombre, whatsapp, email, destino, ciudad_salida,
    fecha_salida, fecha_regreso, num_viajeros, presupuesto, comentarios,
  } = req.body || {};

  const tgText =
    `🗺️ <b>Nueva solicitud de cotización</b>\n\n` +
    `👤 <b>Nombre:</b> ${nombre || '—'}\n` +
    `📱 <b>WhatsApp:</b> ${whatsapp || '—'}\n` +
    `📧 <b>Email:</b> ${email || '—'}\n` +
    `📍 <b>Destino:</b> ${destino || '—'}\n` +
    `🛫 <b>Sale de:</b> ${ciudad_salida || '—'}\n` +
    `📅 <b>Salida:</b> ${fecha_salida || '—'}\n` +
    `📅 <b>Regreso:</b> ${fecha_regreso || '—'}\n` +
    `👥 <b>Viajeros:</b> ${num_viajeros || '—'}\n` +
    `💰 <b>Presupuesto:</b> ${presupuesto || '—'}\n` +
    `💬 <b>Comentarios:</b> ${comentarios || '(ninguno)'}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: tgText,
          parse_mode: 'HTML',
        }),
      }
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
