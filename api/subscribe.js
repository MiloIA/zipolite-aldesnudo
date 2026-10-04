import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sub = req.body;
  const endpoint = sub?.endpoint;
  const p256dh   = sub?.keys?.p256dh;
  const auth     = sub?.keys?.auth;

  if (!endpoint || !p256dh || !auth)
    return res.status(400).json({ error: 'Suscripción incompleta' });

  const user_id = req.body?.user_id ?? null;

  const { error } = await sb.from('push_subscriptions').upsert(
    { endpoint, p256dh, auth, user_agent: req.headers['user-agent'] ?? null, created_at: new Date().toISOString(), ...(user_id ? { user_id } : {}) },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('push_subscriptions upsert error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
