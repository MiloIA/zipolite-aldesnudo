/**
 * GET /api/wa-status?phone_id=xxx&waba_id=xxx
 * Requiere: Authorization: Bearer <adminToken>
 *
 * Consulta Meta Graph API para obtener:
 *   - status y platform_type del número
 *   - si la app está suscrita al WABA (webhook)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function verifyAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/, '').trim();
  if (!token || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) return false;

  const now = new Date().toISOString();
  const { data } = await supabase
    .from('admin_sessions')
    .select('expires_at')
    .eq('token', token)
    .single();

  return data && data.expires_at > now;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Auth
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const phoneId = req.query.phone_id;
  const wabaId  = req.query.waba_id;

  if (!phoneId || !wabaId) {
    return res.status(400).json({ error: 'phone_id y waba_id son requeridos' });
  }

  const accessToken = process.env.WA_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'WA_ACCESS_TOKEN no configurado en Vercel' });
  }

  try {
    // 1. Obtener estado del número
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=status,platform_type,code_verification_status,display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const phoneData = await phoneRes.json();

    if (phoneData.error) {
      return res.status(502).json({
        error: phoneData.error.message || 'Error de Meta Graph API',
        meta_error: phoneData.error
      });
    }

    // 2. Verificar si la app está suscrita al WABA
    let webhookSubscribed = false;
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const subData = await subRes.json();
      webhookSubscribed = Array.isArray(subData.data) && subData.data.length > 0;
    } catch {
      // Non-fatal: si falla esta check, seguimos
    }

    return res.status(200).json({
      phone_status:             phoneData.status            || 'UNKNOWN',
      platform_type:            phoneData.platform_type     || 'UNKNOWN',
      code_verification_status: phoneData.code_verification_status || null,
      display_phone_number:     phoneData.display_phone_number || null,
      webhook_subscribed:       webhookSubscribed,
    });

  } catch (e) {
    return res.status(502).json({ error: `Error de red: ${e.message}` });
  }
}
