import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;
  console.log('Clip webhook received:', JSON.stringify(event));

  const status   = event?.resource_status || event?.payment_status || event?.status;
  const refId    = event?.metadata?.external_reference || event?.external_reference;
  const clipId   = event?.payment_request_id || event?.payment_id || event?.id;
  const amount   = event?.amount;

  if (!refId) {
    console.error('Clip webhook: no external_reference found', event);
    return res.status(200).json({ received: true });
  }

  if (status === 'COMPLETED' || status === 'PAID' || status === 'paid' || status === 'APPROVED') {
    const { error } = await supabase
      .from('reservaciones')
      .update({
        status: 'confirmada',
        metodo_pago: 'card',
        clip_payment_id: clipId,
        anticipo_pagado: amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', refId);

    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({ error: 'DB update failed' });
    }

    console.log(`Reservación ${refId} confirmada via Clip webhook`);
  }

  return res.status(200).json({ received: true });
}
