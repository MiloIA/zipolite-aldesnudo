import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, paquete_nombre, nombre, email, reservacion_id } = req.body || {};

  if (!amount || !reservacion_id) {
    return res.status(400).json({ error: 'Faltan campos requeridos: amount, reservacion_id' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'mxn',
      metadata: { paquete_nombre: paquete_nombre || '', nombre: nombre || '', reservacion_id },
    });
    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
