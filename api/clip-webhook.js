import { createClient } from '@supabase/supabase-js';
import { generarContrato } from '../lib/generar-contrato.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function createViajero(reservacion) {
  try {
    const { data: existing } = await supabase
      .from('viajeros').select('id')
      .eq('reservacion_id', reservacion.id).eq('numero_viajero', 1).maybeSingle();
    if (existing) return;
    const parts = (reservacion.nombre || '').split(' ');
    await supabase.from('viajeros').insert({
      reservacion_id: reservacion.id,
      nombre:         parts[0] || '',
      ap_paterno:     parts[1] || '',
      ap_materno:     parts[2] || '',
      correo:         reservacion.email,
      whatsapp:       reservacion.whatsapp || null,
      es_titular:     true,
      numero_viajero: 1,
    });
  } catch (e) {
    console.error('createViajero error:', e.message);
  }
}

async function updateContactoEstado(email, whatsapp) {
  try {
    const { data: byEmail } = email
      ? await supabase.from('contactos').select('id').eq('email', email).maybeSingle()
      : { data: null };
    const { data: byWa } = (!byEmail && whatsapp)
      ? await supabase.from('contactos').select('id').eq('whatsapp', whatsapp).maybeSingle()
      : { data: null };
    const existente = byEmail || byWa;
    const updates = {
      estado_crm:  'reservado',
      temperatura: 'caliente',
      updated_at:  new Date().toISOString(),
    };
    if (existente) {
      await supabase.from('contactos').update(updates).eq('id', existente.id);
    } else {
      await supabase.from('contactos').insert({ email: email || null, whatsapp: whatsapp || null, origen: 'sitio', ...updates });
    }
  } catch (e) {
    console.error('updateContactoEstado error:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;
  console.log('Clip webhook received:', JSON.stringify(event));

  const eventType = event?.event_type;
  const refId     = event?.payment_detail?.merch_inv_id;
  const clipId    = event?.payment_detail?.order_id;
  const amount    = event?.payment_detail?.amount;

  if (!refId) {
    console.error('Clip webhook: no merch_inv_id found', event);
    return res.status(200).json({ received: true });
  }

  if (eventType === 'REQUEST_COMPLETED') {
    // 1. Fetch current state before updating (to detect first confirmation)
    const { data: reservaAntes } = await supabase
      .from('reservaciones')
      .select('estado, variante_id, personas')
      .eq('id', refId)
      .single();

    // 2. Update reservation status
    const { error: updateError } = await supabase
      .from('reservaciones')
      .update({
        estado: 'confirmada',
        metodo_pago: 'card',
        clip_payment_id: clipId,
        anticipo_pagado: parseFloat(amount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', refId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ error: 'DB update failed' });
    }

    // 2. Fetch full reservation data for email
    const { data: reserva } = await supabase
      .from('reservaciones')
      .select('*')
      .eq('id', refId)
      .single();

    if (reserva && RESEND_API_KEY) {
      const shortId = refId.substring(0, 8).toUpperCase();
      const miReservaUrl = `https://zipolitealdesnudo.com/mi-reserva?id=${refId}`;
      const contrato = await generarContrato(refId);
      const contrato_url = contrato.ok ? contrato.contrato_url : null;
      const htmlClient = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1A3A4A;padding:2rem;text-align:center;">
            <h1 style="color:#fff;margin:0;">🌊 ¡Tu reserva está confirmada!</h1>
            <p style="color:#a0d8ef;margin:0.5rem 0 0;">Zipolite al Desnudo — Agencia de Viajes LGBT+</p>
          </div>
          <div style="padding:2rem;">
            <p>Hola, <strong>${reserva.nombre}</strong> 👋 Tu pago fue procesado exitosamente.</p>
            <div style="background:#f5f5f5;border-radius:8px;padding:1.5rem;margin:1.5rem 0;">
              <p><strong># ${shortId}</strong> — Número de reserva — guárdalo para cualquier consulta.</p>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:0.5rem 0;color:#666;">Paquete</td><td style="text-align:right;font-weight:600;">${reserva.paquete_nombre}</td></tr>
                <tr><td style="padding:0.5rem 0;color:#666;">Personas</td><td style="text-align:right;">${reserva.personas}</td></tr>
                <tr><td style="padding:0.5rem 0;color:#666;">Método de pago</td><td style="text-align:right;">Contado con tarjeta</td></tr>
                <tr><td style="padding:0.5rem 0;color:#666;">Total del paquete</td><td style="text-align:right;">$${reserva.total} MXN</td></tr>
                <tr style="border-top:2px solid #1A3A4A;"><td style="padding:0.75rem 0;font-weight:700;">Total pagado</td><td style="text-align:right;font-weight:700;color:#1A3A4A;">$${amount} MXN</td></tr>
              </table>
            </div>
            <div style="text-align:center;margin:1.5rem 0;">
              <p style="margin:0 0 10px;font-size:0.88rem;color:#555;">🔗 Consulta tu reserva y realiza tus pagos:</p>
              <a href="${miReservaUrl}" style="background:#1a9fa0;color:white;padding:12px 24px;border-radius:99px;text-decoration:none;display:inline-block;font-weight:700;">
                Ver mi reserva →
              </a>
              ${contrato_url ? `
              <a href="${contrato_url}"
                 style="display:inline-block;margin-top:8px;padding:12px 24px;background:#f0f9f9;color:#1a9fa0;border:1.5px solid #1a9fa0;border-radius:99px;text-decoration:none;font-weight:700;">
                📄 Descargar contrato PDF →
              </a>` : ''}
            </div>
            <p>Si tienes dudas sobre tu reserva, contáctanos y menciona tu número <strong>${shortId}</strong>.</p>
            <p style="text-align:center;margin-top:2rem;">
              <a href="https://wa.me/529582199953" style="background:#25D366;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;">💬 WhatsApp</a>
            </p>
          </div>
          <div style="background:#f0f0f0;padding:1rem;text-align:center;font-size:0.8rem;color:#666;">
            Zipolite al Desnudo · <a href="https://zipolitealdesnudo.com">zipolitealdesnudo.com</a> · WhatsApp: 958 219 9953
          </div>
        </div>`;

      // Send email to client
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Zipolite al Desnudo <hola@zipolitealdesnudo.com>',
          to: [reserva.email],
          subject: `✅ ¡Reserva confirmada! #${shortId} — ${reserva.paquete_nombre}`,
          html: htmlClient
        })
      }).catch(e => console.error('Email error:', e));

      // Telegram notification
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: `✅ PAGO CONFIRMADO\n👤 ${reserva.nombre}\n📦 ${reserva.paquete_nombre}\n💰 $${amount} MXN\n🆔 #${shortId}`,
            parse_mode: 'HTML'
          })
        }).catch(e => console.error('Telegram error:', e));
      }
    }

    // 3. Update variantes_paquete.lugares_vendidos on first confirmation only
    if (reservaAntes && reservaAntes.estado !== 'confirmada' && reservaAntes.variante_id && reservaAntes.personas) {
      const { data: varianteData } = await supabase
        .from('variantes_paquete')
        .select('lugares_vendidos')
        .eq('id', reservaAntes.variante_id)
        .single();

      await supabase
        .from('variantes_paquete')
        .update({ lugares_vendidos: (varianteData?.lugares_vendidos || 0) + reservaAntes.personas })
        .eq('id', reservaAntes.variante_id);
    }

    if (reserva) {
      await createViajero(reserva);
      await updateContactoEstado(reserva.email, reserva.whatsapp);
    }
    console.log(`Reservación ${refId} confirmada via Clip webhook`);
  }

  return res.status(200).json({ received: true });
}
