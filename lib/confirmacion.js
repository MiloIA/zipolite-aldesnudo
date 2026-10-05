import webpush from 'web-push';
import { generarContrato } from './generar-contrato.js';

const FROM = 'Zipolite al Desnudo <hola@zipolitealdesnudo.com>';

export async function enviarConfirmacion(reservaId, { supabaseClient: sb, resendApiKey }) {
  // 1. Fetch reserva completa
  const { data: reserva, error: rErr } = await sb
    .from('reservaciones').select('*').eq('id', reservaId).single();
  if (rErr || !reserva) return { ok: false, error: rErr?.message || 'Reserva no encontrada' };

  // 2. Suma pagos confirmados
  const { data: pagos } = await sb
    .from('pagos').select('monto').eq('reservacion_id', reservaId).eq('confirmado', true);
  const totalPagado = (pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);

  // 3. Genera contrato PDF
  const contrato = await generarContrato(reservaId);
  const contrato_url = contrato.ok ? contrato.url : null;

  // 4. Construye HTML
  const shortId = reservaId.substring(0, 8).toUpperCase();
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  const miReservaUrl = `https://zipolitealdesnudo.com/mi-reserva?id=${reservaId}`;

  const fechasRow = (reserva.fecha_inicio || reserva.fecha_fin)
    ? `<tr>
         <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Fechas</td>
         <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${reserva.fecha_inicio || ''}${reserva.fecha_inicio && reserva.fecha_fin ? ' — ' : ''}${reserva.fecha_fin || ''}</td>
       </tr>`
    : '';

  const metodoPago = String(reserva.metodo_pago || '');
  const esFinanc = ['3','6','9','12','18','24'].includes(metodoPago) || metodoPago === 'Financiamiento';
  const pagoBlock = esFinanc
    ? `<div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
         <p style="margin:0 0 6px;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Tu financiamiento está activo. Tu lugar está confirmado y apartado.</p>
         <p style="margin:0;font-size:0.9rem;color:#555;">Los cargos se realizarán automáticamente cada mes. ¿Dudas? Escríbenos por WhatsApp.</p>
       </div>`
    : `<div style="margin:22px 0;padding:18px 22px;background:#e8f5e9;border-left:4px solid #43a047;border-radius:0 10px 10px 0;">
         <p style="margin:0;font-weight:700;color:#2e7d32;font-size:0.95rem;">✅ Recibimos tu pago de ${fmt(totalPagado)}. ¡Tu lugar está confirmado!</p>
       </div>`;

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
        <p style="margin:0 0 20px;font-size:0.95rem;color:#333;">Hola, <strong>${reserva.nombre}</strong> 👋 Tu reserva ha sido <strong style="color:#006064;">confirmada oficialmente</strong>.</p>
        <div style="display:inline-block;background:#0097A7;color:#ffffff;font-family:monospace;font-size:1.1rem;font-weight:700;letter-spacing:0.12em;padding:8px 20px;border-radius:100px;">
          # ${shortId}
        </div>
        <p style="margin:6px 0 20px;font-size:0.75rem;color:#999;">Número de reserva — guárdalo para cualquier consulta</p>
      </td></tr>

      <tr><td style="padding:0 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0f4f7;border-radius:10px;overflow:hidden;font-size:0.9rem;">
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Paquete</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${reserva.paquete_nombre || '—'}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Personas</td>
            <td style="padding:10px 12px;font-weight:600;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${reserva.personas || '—'}</td>
          </tr>
          ${fechasRow}
          <tr style="background:#f0feff;">
            <td style="padding:10px 12px;color:#555;border-bottom:1px solid #e8f5f7;">Total del paquete</td>
            <td style="padding:10px 12px;font-weight:700;color:#1A3A4A;border-bottom:1px solid #e8f5f7;">${fmt(reserva.total)}</td>
          </tr>
          <tr style="background:#e0f7fa;">
            <td style="padding:12px;color:#006064;font-weight:700;">Pagado</td>
            <td style="padding:12px;font-weight:800;color:#006064;font-size:1.05rem;">${fmt(totalPagado)}</td>
          </tr>
        </table>
        ${pagoBlock}
      </td></tr>

      <tr><td style="padding:20px 32px 0;text-align:center;">
        <a href="${miReservaUrl}" style="background:#1a9fa0;color:white;padding:12px 24px;border-radius:99px;text-decoration:none;display:inline-block;font-weight:700;">
          Ver mi reserva →
        </a>
      </td></tr>

      ${contrato_url ? `
      <tr><td style="padding:20px 32px 0;">
        <div style="padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #1a9fa0;">
          <p style="margin:0 0 8px;font-weight:600;color:#1a1a1a;">📄 Tu contrato de viaje</p>
          <p style="margin:0 0 12px;color:#666;font-size:0.9rem;">Tu contrato está listo. Descárgalo y guárdalo.</p>
          <a href="${contrato_url}" style="display:inline-block;padding:10px 20px;background:#1a9fa0;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
            Descargar contrato PDF →
          </a>
        </div>
      </td></tr>` : ''}

      <tr><td style="padding:20px 32px 0;">
        <div style="padding:14px 18px;background:#f5f5f5;border-radius:10px;font-size:0.88rem;color:#555;line-height:1.6;">
          ¿Dudas? Escríbenos por WhatsApp al <strong>958 219 9953</strong> mencionando tu número <strong>${shortId}</strong>
        </div>
      </td></tr>

      <tr><td style="padding:24px 32px 28px;text-align:center;border-top:1px solid #e8f5f7;margin-top:24px;">
        <p style="margin:0;font-size:0.75rem;color:#aaa;">Zipolite al Desnudo &nbsp;•&nbsp; zipolitealdesnudo.com &nbsp;•&nbsp; WhatsApp: 958 219 9953</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  // 5. Envía email
  if (resendApiKey && reserva.email) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to:   [reserva.email],
        subject: `✅ ¡Tu lugar en Zipolite está confirmado! — Reserva #${shortId}`,
        html,
      }),
    }).catch(e => console.error('confirmacion email error:', e));
  }

  // 6. Push notification si el usuario tiene suscripción vinculada
  const vapidEmail   = process.env.VAPID_EMAIL;
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (vapidEmail && vapidPublic && vapidPrivate && reserva.email) {
    try {
      const { data: { user: authUser } } = await sb.auth.admin.getUserByEmail(reserva.email);
      if (authUser) {
        const { data: subs } = await sb
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', authUser.id);

        if (subs?.length) {
          webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);
          await Promise.allSettled(
            subs.map(sub => webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({
                title: '✅ Reserva confirmada',
                body:  `${reserva.paquete_nombre} — #${shortId}`,
                url:   miReservaUrl,
              })
            ).catch(e => console.error('push error:', sub.endpoint, e.message)))
          );
        }
      }
    } catch (e) {
      console.error('push lookup error:', e.message);
    }
  }

  return { ok: true };
}
