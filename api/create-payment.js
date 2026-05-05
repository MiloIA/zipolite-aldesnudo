import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { monto, paquete_id, paquete_nombre, nombre, email, reservacion_id } = req.body || {};

  if (!monto || !paquete_id) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const { data: paquete } = await supabase
    .from('paquetes')
    .select('precio')
    .eq('id', paquete_id)
    .single();

  if (!paquete) return res.status(404).json({ error: 'Paquete no encontrado' });

  if (monto < paquete.precio * 0.1) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  if (!reservacion_id) {
    return res.status(400).json({ error: 'Falta reservacion_id' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(monto * 100),
      currency: 'mxn',
      metadata: { paquete_nombre: paquete_nombre || '', nombre: nombre || '', reservacion_id },
    });
    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
