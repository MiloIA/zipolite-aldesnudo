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
    .from('paquetes').select('precio').eq('id', paquete_id).single();

  if (!paquete) return res.status(404).json({ error: 'Paquete no encontrado' });
  if (monto < paquete.precio * 0.1)
    return res.status(400).json({ error: 'Monto inválido' });
  if (!reservacion_id)
    return res.status(400).json({ error: 'Falta reservacion_id' });

  const token = Buffer.from(`${process.env.CLIP_API_KEY}:${process.env.CLIP_SECRET_KEY}`).toString('base64');

  const payload = {
    amount: monto,
    currency: 'MXN',
    description: paquete_nombre || 'Reservación Zipolite al Desnudo',
    order_id: reservacion_id,
    redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://zipolitealdesnudo.com'}/pago-confirmado.html?reservacion_id=${reservacion_id}`,
    customer: { name: nombre, email },
  };

  const clipRes = await fetch('https://api-gw.payclip.com/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const clipData = await clipRes.json();

  if (!clipRes.ok) {
    console.error('Clip error:', clipData);
    return res.status(500).json({ error: 'Error al crear pago en Clip', detail: clipData });
  }

  return res.status(200).json({ checkout_url: clipData.checkout_url || clipData.payment_url });
}
