import { createClient } from '@supabase/supabase-js';
import { enviarConfirmacion } from '../lib/confirmacion.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const { data: session } = await supabase
    .from('admin_sessions')
    .select('expires_at')
    .eq('token', token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Sesión expirada' });
  }

  const {
    reservacion_id, nombre, email, whatsapp, paquete_nombre,
    personas, metodo_pago, total, anticipo,
    fecha_inicio, fecha_fin,
    bank_name, bank_clabe,
  } = req.body || {};

  if (!email || !nombre) return res.status(400).json({ ok: false, error: 'Faltan campos' });

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


  const tgText =
    `✅ <b>Reserva confirmada</b>\n\n` +
    `<b>No. reserva:</b> ${shortId}\n` +
    `<b>Cliente:</b> ${nombre}\n` +
    `<b>Paquete:</b> ${paquete_nombre || '—'}\n` +
    `<b>Método de pago:</b> ${traducirMetodoPago(metodo_pago)}\n` +
    `<b>Total:</b> ${fmt(total)}`;

  // Actualizar estado según total pagado
  const { data: todosPagos } = await supabase
    .from('pagos')
    .select('monto')
    .eq('reservacion_id', reservacion_id)
    .eq('confirmado', true);

  const totalPagado = (todosPagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const totalReserva = Number(total) || 0;
  const nuevoEstado = totalPagado >= totalReserva ? 'confirmada' : 'parcial';

  await supabase
    .from('reservaciones')
    .update({ estado: nuevoEstado })
    .eq('id', reservacion_id);

  try {
    await enviarConfirmacion(reservacion_id, { supabaseClient: supabase, resendApiKey: process.env.RESEND_API_KEY });
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: tgText, parse_mode: 'HTML' }),
    }).catch(e => console.error('telegram:', e));
    // Upsert en CRM
    try {
      const { data: existente } = await supabase
        .from('contactos')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existente) {
        await supabase
          .from('contactos')
          .update({ estado_crm: 'reservado', temperatura: 'caliente' })
          .eq('id', existente.id);
      } else {
        await supabase
          .from('contactos')
          .insert({
            email, nombre, whatsapp,
            origen: 'sitio',
            estado_crm: 'reservado',
            temperatura: 'caliente'
          });
      }
    } catch (crmErr) {
      console.error('CRM upsert error:', crmErr);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
