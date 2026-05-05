import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  console.log('VAPID PUBLIC:', process.env.VAPID_PUBLIC_KEY ? 'OK' : 'MISSING');
  console.log('VAPID PRIVATE:', process.env.VAPID_PRIVATE_KEY ? 'OK' : 'MISSING');
  console.log('VAPID EMAIL:', process.env.VAPID_EMAIL ? 'OK' : 'MISSING');
  const { title, body, image, url } = req.body;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*');
  console.log('Suscriptores encontrados:', subs?.length);

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, image, url: url && url.trim() !== '' ? url.trim() : 'https://zipolitealdesnudo.com/#paquetes' })
    ).catch(err => console.error('Error enviando a', sub.endpoint, err.message)))
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  await supabase.from('push_history')
    .insert([{ title, body, image: image || null, url: url || null, sent }]);
  res.status(200).json({ sent });
}
