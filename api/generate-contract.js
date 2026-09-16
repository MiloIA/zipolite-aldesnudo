import { createClient } from '@supabase/supabase-js';
import { generarContrato } from '../lib/generar-contrato.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const authHeader = req.headers['authorization'];
  const bodyToken  = req.body?.admin_token;
  const token      = authHeader?.replace('Bearer ', '') || bodyToken;

  if (token === process.env.ADMIN_PASSWORD) {
    // llamada interna autorizada — continúa
  } else if (token) {
    const { data } = await supabase
      .from('admin_sessions')
      .select('expires_at')
      .eq('token', token)
      .single();
    const isValidAdmin = data && new Date(data.expires_at) > new Date();
    if (!isValidAdmin) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  } else {
    const reservacion_id = req.body?.reservacion_id;
    if (!reservacion_id) return res.status(400).json({ error: 'Falta reservacion_id' });

    const { data: reservaCheck } = await supabase
      .from('reservaciones')
      .select('created_at')
      .eq('id', reservacion_id)
      .single();

    if (!reservaCheck) return res.status(404).json({ error: 'Reservación no encontrada' });

    const horasDesdeCreacion = (Date.now() - new Date(reservaCheck.created_at)) / 3600000;
    if (horasDesdeCreacion > 24) {
      return res.status(401).json({ error: 'Enlace expirado. Contacta a la agencia.' });
    }
  }

  const { reservacion_id } = req.body || {};
  if (!reservacion_id) return res.status(400).json({ error: 'reservacion_id requerido' });

  const result = await generarContrato(reservacion_id);
  return res.status(result.ok ? 200 : 500).json(result);
}
