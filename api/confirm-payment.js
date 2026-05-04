export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const {
    reservacion_id, nombre, email, whatsapp, paquete_nombre,
    personas, metodo_pago, total, anticipo,
    fecha_inicio, fecha_fin,
    bank_name, bank_clabe,
    contrato_url,
  } = req.body || {};

  if (!email || !nombre) return res.status(400).json({ ok: false, error: 'Faltan campos' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM  = 'Zipolite al Desnudo <reservaciones@zipolitealdesnudo.com>';
  const shortId = (reservacion_id || '').substring(0, 8).toUpperCase();
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  const traducirMetodoPago = m => ({
    'transfer': 'Transferencia / Depósito',
    'Transferencia/Depósito': 'Transferencia / Depósito',
    'card': 'Contado con tarjeta',
    '3': 'Financiamiento 3 meses',
    '6': 'Financiamiento 6 meses',
    '9': 'Financiamiento 9 meses',
    '12': 'Financiamiento 12 meses',
    '18': 'Financiamiento 18 meses',
    '24': 'Financiamiento 24 meses',
    'Financiamiento': 'Financiamiento',
  }[m] || m || '—');

  const financMeses = ['3', '6', '9', '12', '18', '24'];
  const isTransfer = metodo_pago === 'transfer' || metodo_pago === 'Transferencia/Depósito';
  const isCard     = metodo_pago === 'card';
  const isFinanc   = financMeses.includes(String(metodo_pago)) || metodo_pago === 'Financiamiento';

  const antiNum = Number(anticipo) || 0;
  const totNum  = Number(total)    || 0;

  let pagoBlock = '';
  if (isTransfer) {
    if (antiNum < totNum) {
      const resta = totNum - antiNum;
      pagoBlock = `
        <div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
          <p style="margin:0 0 8px;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Recibimos tu anticipo de ${fmt(anticipo)}</p>
          <table cellpadding="0" cellspacing="0" style="font-size:0.9rem;color:#1A3A4A;">
            <tr><td style="padding:3px 18px 3px 0;color:#666;">Resta por pagar</td><td><strong>${fmt(resta)}</strong></td></tr>
            <tr><td style="padding:3px 18px 3px 0;color:#666;">Fecha límite</td><td><strong>10 días antes del viaje</strong></td></tr>
          </table>
          <div style="margin-top:14px;padding:12px 16px;background:#fffde7;border-left:3px solid #f9a825;border-radius:0 8px 8px 0;">
            <p style="margin:0 0 5px;font-size:0.78rem;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:0.06em;">Datos para transferencia</p>
            <p style="margin:0 0 3px;font-size:0.9rem;"><strong>Banco:</strong> ${bank_name || '—'}</p>
            <p style="margin:0 0 3px;font-size:0.9rem;"><strong>CLABE:</strong> ${bank_clabe || '—'}</p>
            <p style="margin:0;font-size:0.9rem;"><strong>Concepto:</strong> ${shortId}</p>
          </div>
        </div>`;
    } else {
      pagoBlock = `
        <div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
          <p style="margin:0;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Recibimos tu pago completo. ¡Tu lugar está 100% confirmado! No necesitas hacer nada más, nos vemos en Zipolite 🌊</p>
        </div>`;
    }
  } else if (isCard) {
    pagoBlock = `
      <div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
        <p style="margin:0;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Tu pago con tarjeta fue procesado exitosamente. ¡Tu lugar está 100% confirmado!</p>
      </div>`;
  } else if (isFinanc) {
    pagoBlock = `
      <div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
        <p style="margin:0 0 6px;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Tu financiamiento está activo. Tu lugar está confirmado y apartado.</p>
        <p style="margin:0;font-size:0.9rem;color:#555;">Los cargos se realizarán automáticamente cada mes. Si tienes dudas sobre tu plan de pagos contáctanos por WhatsApp.</p>
      </div>`;
  }

  const fechasRow = (fecha_inicio || fecha_fin)
    ? `<tr><td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Fechas</td>
         <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${fecha_inicio || ''}${fecha_inicio && fecha_fin ? ' — ' : ''}${fecha_fin || ''}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0feff;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0feff;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,100,120,0.10);">

      <tr><td style="background:#1A3A4A;padding:32px;text-align:center;">
        <div style="font-size:2.6rem;margin-bottom:10px;">🌈</div>
        <h1 style="margin:0;color:#ffffff;font-size:1.45rem;font-weight:800;">¡Tu lugar en Zipolite está confirmado!</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:0.82rem;">Zipolite al Desnudo — Agencia de Viajes LGBT+</p>
      </td></tr>

      <tr><td style="padding:28px 32px 0;">
        <p style="margin:0 0 20px;font-size:0.95rem;color:#333;">Hola, <strong>${nombre}</strong> 👋 Tu reserva ha sido <strong style="color:#006064;">confirmada oficialmente</strong>.</p>
        <div style="display:inline-block;background:#0097A7;color:#ffffff;font-family:monospace;font-size:1.1rem;font-weight:700;letter-spacing:0.12em;padding:8px 20px;border-radius:100px;">
          # ${shortId}
        </div>
        <p style="margin:6px 0 20px;font-size:0.75rem;color:#999;">Número de reserva — guárdalo para cualquier consulta</p>
      </td></tr>

      <tr><td style="padding:0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0f4f7;border-radius:10px;overflow:hidden;font-size:0.9rem;">
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Paquete</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${paquete_nombre || '—'}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Personas</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${personas || '—'}</td>
          </tr>
          ${fechasRow}
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Total del paquete</td>
            <td style="padding:10px 12px;font-weight:700;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${fmt(total)}</td>
          </tr>
          <tr style="background:#e0f7fa;">
            <td style="padding:12px;color:#006064;font-weight:700;">Pagado</td>
            <td style="padding:12px;font-weight:800;color:#006064;font-size:1.05rem;">${fmt(anticipo)}</td>
          </tr>
        </table>
        ${pagoBlock}
      </td></tr>

      <tr><td style="padding:20px 32px 0;">
        <div style="padding:14px 18px;background:#f5f5f5;border-radius:10px;font-size:0.88rem;color:#555;line-height:1.6;">
          ¿Dudas? Escríbenos por WhatsApp al <strong>958 219 9953</strong> mencionando tu número de reserva <strong>${shortId}</strong>
        </div>
      </td></tr>

      ${contrato_url ? `<tr><td style="padding:20px 32px 0;">
        <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #1a9fa0;">
          <p style="margin:0 0 8px;font-weight:600;color:#1a1a1a;">📄 Tu contrato de viaje</p>
          <p style="margin:0 0 12px;color:#666;font-size:0.9rem;">Tu contrato está listo. Descárgalo y guárdalo para cualquier consulta.</p>
          <a href="${contrato_url}" style="display:inline-block;padding:10px 20px;background:#1a9fa0;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Descargar contrato PDF →</a>
        </div>
      </td></tr>` : ''}

      <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid #e8f5f7;margin-top:24px;">
        <p style="margin:0;font-size:0.75rem;color:#aaa;">Zipolite al Desnudo &nbsp;•&nbsp; zipolitealdesnudo.com &nbsp;•&nbsp; WhatsApp: 958 219 9953</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const tgText =
    `✅ <b>Reserva confirmada</b>\n\n` +
    `<b>No. reserva:</b> ${shortId}\n` +
    `<b>Cliente:</b> ${nombre}\n` +
    `<b>Paquete:</b> ${paquete_nombre || '—'}\n` +
    `<b>Método de pago:</b> ${traducirMetodoPago(metodo_pago)}\n` +
    `<b>Total:</b> ${fmt(total)}`;

  try {
    await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: `✅ ¡Tu lugar en Zipolite está confirmado! — Reserva #${shortId}`,
          html,
        }),
      }),
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgText, parse_mode: 'HTML' }),
      }).catch(e => console.error('telegram:', e)),
    ]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
