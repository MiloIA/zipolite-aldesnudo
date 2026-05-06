import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    paquete_id, paquete_nombre, organizador_id, organizador_nombre,
    organizador_email, personas_esperadas, alojamiento, personas_habitacion,
    tour_incluido, precio_por_persona
  } = req.body;

  const codigo = 'ZIP' + Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase.from('grupos').insert({
    codigo,
    paquete_id,
    paquete_nombre,
    organizador_id,
    organizador_nombre,
    organizador_email,
    personas_esperadas,
    alojamiento,
    personas_habitacion,
    tour_incluido,
    precio_por_persona,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, codigo, grupo_id: data.id });
}
