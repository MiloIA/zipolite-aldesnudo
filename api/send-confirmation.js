export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const {
    reservacion_id, paquete_nombre, nombre, email, whatsapp,
    personas, metodo_pago, total, anticipo,
    bank_name, bank_clabe, fecha_inicio, fecha_fin,
  } = req.body || {};

  if (!email || !nombre || !paquete_nombre) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM   = 'Zipolite al Desnudo <reservaciones@zipolitealdesnudo.com>';
  const ADMIN  = 'reservaciones@zipolitealdesnudo.com';
  const NOTIFY = 'infinitybymexico@gmail.com';

  const shortId = (reservacion_id || '').substring(0, 8).toUpperCase();

  const metodosLabel = {
    transfer: 'Transferencia / Depósito', card: 'Contado con tarjeta',
    '3': 'Financiamiento 3 meses',  '6': 'Financiamiento 6 meses',
    '9': 'Financiamiento 9 meses',  '12': 'Financiamiento 12 meses',
    '18': 'Financiamiento 18 meses','24': 'Financiamiento 24 meses',
  };
  const metodoLabel = metodosLabel[metodo_pago] || metodo_pago || '—';
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  const anticipoLabel = Number(anticipo) < Number(total) ? 'Paga hoy (anticipo)' : 'Total a pagar';

  const fechasRow = (fecha_inicio || fecha_fin)
    ? `<tr><td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Fechas</td>
         <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${fecha_inicio || ''}${fecha_inicio && fecha_fin ? ' — ' : ''}${fecha_fin || ''}</td></tr>`
    : '';

  const pagoSection = metodo_pago === 'transfer'
    ? `<div style="margin:24px 0 0;padding:16px 20px;background:#fffde7;border-left:4px solid #f9a825;border-radius:0 8px 8px 0;">
         <p style="margin:0 0 8px;font-size:0.8rem;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:0.06em;">Datos para transferencia</p>
         <p style="margin:0 0 4px;font-size:0.9rem;color:#1A3A4A;"><strong>Banco:</strong> ${bank_name || '—'}</p>
         <p style="margin:0;font-size:0.9rem;color:#1A3A4A;"><strong>CLABE:</strong> ${bank_clabe || '—'}</p>
       </div>`
    : `<div style="margin:24px 0 0;padding:14px 18px;background:#f5f5f5;border-radius:8px;">
         <p style="margin:0;font-size:0.88rem;color:#777;">Te contactaremos para coordinar el pago.</p>
       </div>`;

  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0feff;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0feff;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,100,120,0.10);">

      <tr><td style="background:#1A3A4A;padding:32px;text-align:center;">
        <div style="font-size:2.6rem;margin-bottom:10px;">🌈</div>
        <h1 style="margin:0;color:#ffffff;font-size:1.45rem;font-weight:800;">¡Tu reserva está lista!</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:0.82rem;">Zipolite al Desnudo — Agencia de Viajes LGBT+</p>
      </td></tr>

      <tr><td style="padding:28px 32px 0;">
        <p style="margin:0 0 20px;font-size:0.95rem;color:#333;">Hola, <strong>${nombre}</strong> 👋 Recibimos tu reserva con éxito.</p>
        <div style="display:inline-block;background:#0097A7;color:#ffffff;font-family:monospace;font-size:1.1rem;font-weight:700;letter-spacing:0.12em;padding:8px 20px;border-radius:100px;">
          # ${shortId}
        </div>
        <p style="margin:6px 0 20px;font-size:0.75rem;color:#999;">Número de reserva — guárdalo para cualquier consulta</p>
      </td></tr>

      <tr><td style="padding:0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0f4f7;border-radius:10px;overflow:hidden;font-size:0.9rem;">
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Paquete</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${paquete_nombre}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Personas</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${personas}</td>
          </tr>
          ${fechasRow}
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Método de pago</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${metodoLabel}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Total del paquete</td>
            <td style="padding:10px 12px;font-weight:700;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${fmt(total)}</td>
          </tr>
          <tr style="background:#e0f7fa;">
            <td style="padding:12px;color:#006064;font-weight:700;">Pagas hoy</td>
            <td style="padding:12px;font-weight:800;color:#006064;font-size:1.05rem;">${fmt(anticipo)}</td>
          </tr>
        </table>
        ${pagoSection}
      </td></tr>

      <tr><td style="padding:24px 32px 0;font-size:0.82rem;color:#888;line-height:1.6;">
        <p style="margin:0;">Si tienes dudas sobre tu reserva, contáctanos y menciona tu número <strong>${shortId}</strong>.</p>
      </td></tr>

      <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid #e8f5f7;margin-top:24px;">
        <p style="margin:0;font-size:0.75rem;color:#aaa;">Zipolite al Desnudo &nbsp;•&nbsp; zipolitealdesnudo.com &nbsp;•&nbsp; WhatsApp: 958 219 9953</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const notifHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:0.9rem;color:#333;padding:24px;">
  <h2 style="color:#1A3A4A;margin-bottom:16px;">🔔 Nueva reserva recibida</h2>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="padding:6px 20px 6px 0;color:#777;">No. reserva</td><td><strong>${shortId}</strong></td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Nombre</td><td>${nombre}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Email</td><td>${email}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">WhatsApp</td><td>${whatsapp || '—'}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Paquete</td><td>${paquete_nombre}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Personas</td><td>${personas}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Fechas</td><td>${fecha_inicio || '—'} → ${fecha_fin || '—'}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Método de pago</td><td>${metodoLabel}</td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">Total</td><td><strong>${fmt(total)}</strong></td></tr>
    <tr><td style="padding:6px 20px 6px 0;color:#777;">${anticipoLabel}</td><td><strong>${fmt(anticipo)}</strong></td></tr>
  </table>
</body>
</html>`;

  try {
    const send = (to, subject, html) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    const tgText = `🔔 <b>Nueva reserva</b>\n\n` +
      `<b>No. reserva:</b> ${shortId}\n` +
      `<b>Nombre:</b> ${nombre}\n` +
      `<b>Email:</b> ${email}\n` +
      `<b>WhatsApp:</b> ${whatsapp || '—'}\n` +
      `<b>Paquete:</b> ${paquete_nombre}\n` +
      `<b>Personas:</b> ${personas}\n` +
      `<b>Fechas:</b> ${fecha_inicio || '—'} → ${fecha_fin || '—'}\n` +
      `<b>Método de pago:</b> ${metodoLabel}\n` +
      `<b>Total:</b> ${fmt(total)}\n` +
      `<b>${anticipoLabel}:</b> ${fmt(anticipo)}`;

    const [r1] = await Promise.all([
      send(email,   `✅ Reserva confirmada — ${paquete_nombre}`, clientHtml),
      send(NOTIFY,  `🔔 Nueva reserva — ${nombre} — ${paquete_nombre}`, notifHtml),
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgText, parse_mode: 'HTML' }),
      }).catch(e => console.error('telegram:', e)),
    ]);

    if (!r1.ok) {
      const err = await r1.json().catch(() => ({}));
      return res.status(500).json({ ok: false, error: err.message || 'Error enviando email al cliente' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
// redeploy 2026-04-28 23:15
// v2
