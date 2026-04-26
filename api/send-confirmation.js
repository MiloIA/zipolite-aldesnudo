export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const {
    reservacion_id, paquete_nombre, nombre, email, whatsapp,
    personas, metodo_pago, total, anticipo, fecha_inicio, fecha_fin
  } = req.body || {};

  if (!email || !nombre || !paquete_nombre) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const BANK_CLABE    = process.env.BANK_CLABE || '—';
  const FROM          = 'Zipolite al Desnudo <reservaciones@zipolitealdesnudo.com>';
  const shortId       = (reservacion_id || '').substring(0, 8).toUpperCase();

  const metodosLabel = {
    transfer: 'Transferencia / Depósito',
    card:     'Contado con tarjeta',
    '3':  'Financiamiento 3 meses',
    '6':  'Financiamiento 6 meses',
    '9':  'Financiamiento 9 meses',
    '12': 'Financiamiento 12 meses',
    '18': 'Financiamiento 18 meses',
    '24': 'Financiamiento 24 meses',
  };
  const metodoLabel = metodosLabel[metodo_pago] || metodo_pago || '—';

  const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

  const fechasHtml = (fecha_inicio || fecha_fin)
    ? `<tr><td style="padding:8px 0;color:#555;font-size:0.9rem;">Fechas</td><td style="padding:8px 0;font-weight:600;">${fecha_inicio || ''}${fecha_inicio && fecha_fin ? ' — ' : ''}${fecha_fin || ''}</td></tr>`
    : '';

  const pagoHtml = metodo_pago === 'transfer'
    ? `<div style="margin-top:24px;padding:16px 20px;background:#e0f7fa;border-left:4px solid #0097A7;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:0.85rem;color:#00695C;font-weight:700;">Realiza tu pago a:</p>
        <p style="margin:0;font-size:0.9rem;color:#1A3A4A;">BBVA &nbsp;·&nbsp; CLABE: <strong>${BANK_CLABE}</strong></p>
       </div>`
    : `<div style="margin-top:24px;padding:16px 20px;background:#f5f5f5;border-radius:8px;">
        <p style="margin:0;font-size:0.88rem;color:#555;">Te contactaremos para coordinar el pago.</p>
       </div>`;

  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1A3A4A,#006080);padding:32px 32px 24px;text-align:center;">
          <div style="font-size:2.8rem;margin-bottom:8px;">🌈</div>
          <h1 style="margin:0;color:#ffffff;font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;">¡Tu reserva está lista!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:0.85rem;">Zipolite al Desnudo — Agencia de Viajes LGBT+</p>
        </td></tr>

        <!-- No. reserva badge -->
        <tr><td style="padding:0 32px;">
          <div style="background:#e0f7fa;border-radius:0 0 12px 12px;padding:12px 20px;text-align:center;">
            <span style="font-size:0.75rem;color:#00695C;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Número de reserva</span>
            <div style="font-size:1.4rem;font-weight:800;color:#1A3A4A;font-family:monospace;letter-spacing:0.1em;">${shortId}</div>
          </div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0;font-size:1rem;color:#1A3A4A;">Hola, <strong>${nombre}</strong> 👋</p>
          <p style="margin:8px 0 0;font-size:0.88rem;color:#555;line-height:1.5;">Recibimos tu reserva con éxito. Aquí está el resumen:</p>
        </td></tr>

        <!-- Details table -->
        <tr><td style="padding:16px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8f0f2;">
            <tr><td style="padding:8px 0;color:#555;font-size:0.9rem;">Paquete</td><td style="padding:8px 0;font-weight:600;color:#1A3A4A;">${paquete_nombre}</td></tr>
            <tr style="background:#f9fcfd;"><td style="padding:8px 6px;color:#555;font-size:0.9rem;">Personas</td><td style="padding:8px 6px;font-weight:600;color:#1A3A4A;">${personas}</td></tr>
            ${fechasHtml}
            <tr><td style="padding:8px 0;color:#555;font-size:0.9rem;">Método de pago</td><td style="padding:8px 0;font-weight:600;color:#1A3A4A;">${metodoLabel}</td></tr>
            <tr style="background:#f9fcfd;"><td style="padding:8px 6px;color:#555;font-size:0.9rem;">Total del paquete</td><td style="padding:8px 6px;font-weight:700;color:#1A3A4A;">${fmt(total)}</td></tr>
            <tr><td style="padding:10px 0;color:#0097A7;font-size:0.95rem;font-weight:700;">Pagas hoy</td><td style="padding:10px 0;font-weight:800;font-size:1.05rem;color:#0097A7;">${fmt(anticipo)}</td></tr>
          </table>
        </td></tr>

        <!-- Pago instructions -->
        <tr><td style="padding:0 32px 24px;">${pagoHtml}</td></tr>

        <!-- Footer -->
        <tr><td style="background:#1A3A4A;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.6);font-size:0.78rem;">¿Dudas? Escríbenos por WhatsApp o a reservaciones@zipolitealdesnudo.com</p>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.4);font-size:0.72rem;">© Zipolite al Desnudo · Agencia LGBT+</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const notifHtml = `<h2>🔔 Nueva reserva recibida</h2>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:0.9rem;">
  <tr><td style="padding:6px 16px 6px 0;color:#555;">No. reserva</td><td><strong>${shortId}</strong></td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Nombre</td><td>${nombre}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Email</td><td>${email}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">WhatsApp</td><td>${whatsapp}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Paquete</td><td>${paquete_nombre}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Personas</td><td>${personas}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Fechas</td><td>${fecha_inicio || '—'} → ${fecha_fin || '—'}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Método de pago</td><td>${metodoLabel}</td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Total</td><td><strong>${fmt(total)}</strong></td></tr>
  <tr><td style="padding:6px 16px 6px 0;color:#555;">Anticipo</td><td><strong>${fmt(anticipo)}</strong></td></tr>
</table>`;

  try {
    const [clientRes, notifRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: `✅ Reserva confirmada — ${paquete_nombre}`,
          html: clientHtml,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: ['reservaciones@zipolitealdesnudo.com'],
          subject: `🔔 Nueva reserva — ${nombre} — ${paquete_nombre}`,
          html: notifHtml,
        }),
      }),
    ]);

    if (!clientRes.ok) {
      const err = await clientRes.json().catch(() => ({}));
      return res.status(500).json({ ok: false, error: err.message || 'Error enviando email al cliente' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
