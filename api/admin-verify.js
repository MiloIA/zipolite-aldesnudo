import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body || {};
  const now = new Date().toISOString();

  // Purge expired tokens
  await supabase.from('admin_sessions').delete().lt('expires_at', now);

  if (!token) return res.status(200).json({ valid: false });

  const { data } = await supabase
    .from('admin_sessions')
    .select('expires_at')
    .eq('token', token)
    .single();

  if (data && data.expires_at > now) {
    return res.status(200).json({ valid: true });
  }
  return res.status(200).json({ valid: false });
}
