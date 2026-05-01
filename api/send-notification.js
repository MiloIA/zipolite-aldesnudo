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
  const { title, body, image, url } = req.body;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*');

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, image, url: url || '/' })
    ))
  );
  res.status(200).json({ sent: results.filter(r => r.status === 'fulfilled').length });
}
