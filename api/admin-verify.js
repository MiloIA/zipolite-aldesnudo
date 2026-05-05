import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body;

  if (!token || typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
    return res.status(400).json({ valid: false, error: 'Token inválido' });
  }

  const now = new Date().toISOString();

  // Purge expired tokens
  await supabase.from('admin_sessions').delete().lt('expires_at', now);

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
