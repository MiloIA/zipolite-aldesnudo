import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ error: 'Parámetro codigo requerido' });

  const { data: grupo, error: grupoError } = await supabase
    .from('grupos')
    .select('id, codigo, paquete_nombre, personas_esperadas, estado, organizador_email')
    .eq('codigo', codigo.toUpperCase())
    .single();

  if (grupoError || !grupo) return res.status(404).json({ error: 'Código no encontrado' });

  const { data: reservaciones, error: resError } = await supabase
    .from('reservaciones')
    .select('nombre, personas, total, anticipo, metodo_pago, estado, email')
    .eq('grupo_id', grupo.id);

  if (resError) return res.status(500).json({ error: resError.message });

  const miembros = (reservaciones || []).map(r => {
    let estadoMiembro;
    if (r.estado === 'confirmado' || (r.metodo_pago && r.metodo_pago !== 'pendiente')) {
      estadoMiembro = 'pagado';
    } else if (r.anticipo > 0) {
      estadoMiembro = 'anticipo';
    } else {
      estadoMiembro = 'pendiente';
    }
    return {
      nombre: r.nombre,
      personas: r.personas,
      total: r.total,
      anticipo: r.anticipo,
      metodo_pago: r.metodo_pago,
      estado: estadoMiembro,
      es_organizador: r.email === grupo.organizador_email,
    };
  });

  const pagados = miembros.filter(m => m.estado === 'pagado').length;
  const anticipo_solo = miembros.filter(m => m.estado === 'anticipo').length;
  const pendientes = miembros.filter(m => m.estado === 'pendiente').length;

  return res.status(200).json({
    grupo: {
      codigo: grupo.codigo,
      paquete_nombre: grupo.paquete_nombre,
      personas_esperadas: grupo.personas_esperadas,
      estado: grupo.estado,
    },
    miembros,
    resumen: {
      total_miembros: miembros.length,
      pagados,
      anticipo_solo,
      pendientes,
    },
  });
}
