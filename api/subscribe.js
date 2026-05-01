import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { endpoint, keys } = req.body;
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    }, { onConflict: 'endpoint' });
  if (error) return res.status(500).json({ error });
  res.status(200).json({ ok: true });
}
