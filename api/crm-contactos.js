import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const { data: session } = await supabase
    .from('admin_sessions')
    .select('expires_at')
    .eq('token', token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Sesión expirada' });
  }

  if (req.method === 'GET') {
    const { estado, temperatura, buscar } = req.query;

    let query = supabase
      .from('contactos')
      .select(`
        id, nombre, email, whatsapp, telegram_chat_id,
        origen, estado_crm, temperatura, proxima_accion,
        notas, created_at, updated_at
      `)
      .order('updated_at', { ascending: false });

    if (estado) query = query.eq('estado_crm', estado);
    if (temperatura) query = query.eq('temperatura', temperatura);
    if (buscar) query = query.or(
      `nombre.ilike.%${buscar}%,email.ilike.%${buscar}%,whatsapp.ilike.%${buscar}%`
    );

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ contactos: data });
  }

  if (req.method === 'PATCH') {
    const { id, estado_crm, temperatura, notas, proxima_accion } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const updates = {};
    if (estado_crm) updates.estado_crm = estado_crm;
    if (temperatura) updates.temperatura = temperatura;
    if (notas !== undefined) updates.notas = notas;
    if (proxima_accion) updates.proxima_accion = proxima_accion;

    const { data, error } = await supabase
      .from('contactos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ contacto: data });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
