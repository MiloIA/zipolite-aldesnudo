import { createClient } from '@supabase/supabase-js';
import { enviarConfirmacion } from '../lib/confirmacion.js';

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

  // ── Verificación de firma Clip ────────────────────────────────────────────
  const clipSignature = req.headers['x-clip-signature'];
  const clipSecret    = process.env.CLIP_WEBHOOK_SECRET;

  if (clipSecret) {
    if (!clipSignature) {
      console.error('Clip webhook: firma ausente');
      return res.status(401).json({ error: 'Firma requerida' });
    }
    const rawBody = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);
    const { createHmac, timingSafeEqual } = await import('crypto');
    const expected = 'sha256=' + createHmac('sha256', clipSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(clipSignature);
    const b = Buffer.from(expected);
    const valid = a.length === b.length && timingSafeEqual(a, b);
    if (!valid) {
      console.error('Clip webhook: firma inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }
  } else {
    console.warn('CLIP_WEBHOOK_SECRET no configurado — verificación de firma deshabilitada');
  }
  // ─────────────────────────────────────────────────────────────────────────

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
      .select('estado, variante_id, personas, total')
      .eq('id', refId)
      .single();

    // 2. Update reservation status (campos fijos, estado se calcula abajo)
    const { error: updateError } = await supabase
      .from('reservaciones')
      .update({
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

    // 2b. Insertar pago confirmado (solo en primera confirmación para evitar duplicados)
    if (reservaAntes?.estado !== 'confirmada') {
      await supabase.from('pagos').insert({
        reservacion_id: refId,
        monto: parseFloat(amount),
        metodo: 'card',
        fecha: new Date().toISOString().split('T')[0],
        confirmado: true,
        notas: `Pago con tarjeta vía Clip — order_id: ${clipId}`,
      });
    }

    // 2c. Calcular estado según total pagado
    const { data: todosPagosClip } = await supabase
      .from('pagos')
      .select('monto')
      .eq('reservacion_id', refId)
      .eq('confirmado', true);

    const totalPagadoClip = (todosPagosClip || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const totalReservaClip = Number(reservaAntes?.total) || 0;
    const nuevoEstadoClip = totalPagadoClip >= totalReservaClip ? 'confirmada' : 'parcial';

    await supabase
      .from('reservaciones')
      .update({ estado: nuevoEstadoClip })
      .eq('id', refId);

    // 2. Fetch full reservation data for email
    const { data: reserva } = await supabase
      .from('reservaciones')
      .select('*')
      .eq('id', refId)
      .single();

    await enviarConfirmacion(refId, { supabaseClient: supabase, resendApiKey: RESEND_API_KEY });

    if (reserva && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const shortId = refId.substring(0, 8).toUpperCase();
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
