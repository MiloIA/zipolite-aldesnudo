/*
CREATE TABLE IF NOT EXISTS public.login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  first_attempt TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service only" ON public.login_attempts FOR ALL USING (auth.role() = 'service_role');
*/

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 h

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Obtener IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  // Verificar intentos
  const { data: attempt } = await supabase
    .from('login_attempts')
    .select('count, first_attempt')
    .eq('ip', ip)
    .single();

  if (attempt) {
    const minutosTranscurridos = (Date.now() - new Date(attempt.first_attempt)) / 60000;
    if (minutosTranscurridos < 15 && attempt.count >= 5) {
      const minutosRestantes = Math.ceil(15 - minutosTranscurridos);
      return res.status(429).json({
        error: `Demasiados intentos. Intenta en ${minutosRestantes} minutos.`
      });
    }
    if (minutosTranscurridos >= 15) {
      // Reset si ya pasaron 15 minutos
      await supabase.from('login_attempts').delete().eq('ip', ip);
    }
  }

  // Si la contraseña es incorrecta, incrementar contador
  if (req.body.password !== process.env.ADMIN_PASSWORD) {
    await supabase.from('login_attempts').upsert({
      ip,
      count: (attempt?.count || 0) + 1,
      first_attempt: attempt?.first_attempt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'ip' });
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Si es correcta, limpiar intentos
  await supabase.from('login_attempts').delete().eq('ip', ip);

  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + TOKEN_TTL).toISOString();

  await supabase.from('admin_sessions').insert({ token, expires_at });

  return res.status(200).json({ success: true, token });
}
