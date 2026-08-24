import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ANO_NUEVO_PKG_ID = '05c33974-5f37-4cff-9ec4-bc60df160f69';

function requireAuth(req) {
  return req.headers['x-admin-token'] === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  if (!requireAuth(req)) return res.status(401).json({ error: 'No autorizado' });

  const { method } = req;
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (method === 'GET') {

    // GET ?all=1 → all reservaciones for año nuevo + pagos aggregated + variantes
    if (params.get('all') === '1') {
      const [{ data: reservaciones, error }, { data: variantes }] = await Promise.all([
        sb.from('reservaciones')
          .select('*, variantes_paquete(nombre)')
          .eq('paquete_id', ANO_NUEVO_PKG_ID)
          .order('created_at', { ascending: true }),
        sb.from('variantes_paquete')
          .select('id, nombre, precio, lugares_totales, lugares_vendidos')
          .eq('paquete_id', ANO_NUEVO_PKG_ID)
          .order('nombre'),
      ]);

      if (error) return res.status(500).json({ error: error.message });
      if (!reservaciones || reservaciones.length === 0) return res.status(200).json({ data: [], variantes: variantes || [] });

      const ids = reservaciones.map(r => r.id);
      const { data: pagos } = await sb
        .from('pagos')
        .select('*')
        .in('reservacion_id', ids)
        .order('fecha', { ascending: true });

      const byReserva = {};
      (pagos || []).forEach(p => {
        if (!byReserva[p.reservacion_id]) byReserva[p.reservacion_id] = [];
        byReserva[p.reservacion_id].push(p);
      });

      const data = reservaciones.map(r => ({
        ...r,
        pagos: byReserva[r.id] || [],
        total_pagado: (byReserva[r.id] || [])
          .filter(p => p.confirmado)
          .reduce((s, p) => s + (Number(p.monto) || 0), 0),
      }));

      return res.status(200).json({ data, variantes: variantes || [] });
    }

    // GET ?variantes=1 → variantes for año nuevo package
    if (params.get('variantes') === '1') {
      const { data, error } = await sb
        .from('variantes_paquete')
        .select('id, nombre, precio, lugares_totales, lugares_vendidos')
        .eq('paquete_id', ANO_NUEVO_PKG_ID)
        .order('nombre');

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    // GET ?reservacion_id=XXX → pagos for one reservacion
    const reservacionId = params.get('reservacion_id');
    if (!reservacionId) return res.status(400).json({ error: 'Falta reservacion_id o parámetro all/variantes' });

    const [{ data: reserva, error: rErr }, { data: pagos }] = await Promise.all([
      sb.from('reservaciones').select('*').eq('id', reservacionId).single(),
      sb.from('pagos').select('*').eq('reservacion_id', reservacionId).order('fecha', { ascending: true }),
    ]);

    if (rErr) return res.status(404).json({ error: 'Reservación no encontrada' });
    return res.status(200).json({ reserva, pagos: pagos || [] });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const body = req.body || {};

    // POST { action: 'reservacion' } → create manual reservacion
    if (body.action === 'reservacion') {
      const { nombre, email, whatsapp, variante_id, personas, total, notas } = body;
      if (!nombre || !email) return res.status(400).json({ error: 'nombre y email son requeridos' });

      const { data, error } = await sb.from('reservaciones').insert([{
        paquete_id: ANO_NUEVO_PKG_ID,
        paquete_nombre: 'Año Nuevo al Desnudo',
        nombre,
        email,
        whatsapp: whatsapp || null,
        personas: Number(personas) || 1,
        variante_id: variante_id || null,
        total: Number(total) || 0,
        anticipo_pagado: 0,
        estado: 'pendiente',
        metodo_pago: 'transfer',
        notas: notas || null,
      }]).select().single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ data });
    }

    // POST → register pago
    const { reservacion_id, monto, metodo, fecha, notas, confirmado } = body;
    if (!reservacion_id || !monto) return res.status(400).json({ error: 'reservacion_id y monto son requeridos' });

    const { data: pago, error: pagoErr } = await sb.from('pagos').insert([{
      reservacion_id,
      monto: Number(monto),
      metodo: metodo || 'transfer',
      fecha: fecha || new Date().toISOString().split('T')[0],
      notas: notas || null,
      confirmado: !!confirmado,
    }]).select().single();

    if (pagoErr) return res.status(500).json({ error: pagoErr.message });

    if (confirmado) {
      await confirmarYActualizar(reservacion_id);
    }

    return res.status(201).json({ data: pago });
  }

  // ── PATCH ?id=XXX → confirm a pago ──────────────────────────────────────
  if (method === 'PATCH') {
    const pagoId = params.get('id');
    if (!pagoId) return res.status(400).json({ error: 'Falta id del pago' });

    const { data: pago, error: fetchErr } = await sb
      .from('pagos')
      .select('*')
      .eq('id', pagoId)
      .single();

    if (fetchErr || !pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.confirmado) return res.status(200).json({ ok: true, msg: 'Ya estaba confirmado' });

    const { error } = await sb.from('pagos').update({ confirmado: true }).eq('id', pagoId);
    if (error) return res.status(500).json({ error: error.message });

    await confirmarYActualizar(pago.reservacion_id);

    return res.status(200).json({ ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    const pagoId = params.get('pago_id');
    const reservacionId = params.get('reservacion_id');
    const deleteReservacion = params.get('delete_reservacion') === '1';

    // DELETE ?reservacion_id=XXX&delete_reservacion=1
    if (deleteReservacion && reservacionId) {
      await sb.from('pagos').delete().eq('reservacion_id', reservacionId);
      const { error } = await sb.from('reservaciones').delete().eq('id', reservacionId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // DELETE ?pago_id=XXX
    if (pagoId) {
      const { data: pago } = await sb
        .from('pagos').select('reservacion_id, confirmado').eq('id', pagoId).single();
      const { error } = await sb.from('pagos').delete().eq('id', pagoId);
      if (error) return res.status(500).json({ error: error.message });
      if (pago?.confirmado && pago?.reservacion_id) {
        await confirmarYActualizar(pago.reservacion_id);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Falta pago_id o reservacion_id con delete_reservacion=1' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

async function confirmarYActualizar(reservacionId) {
  // Recalculate total paid from all confirmed pagos
  const { data: pagosConf } = await sb
    .from('pagos')
    .select('id, monto')
    .eq('reservacion_id', reservacionId)
    .eq('confirmado', true);

  const totalPagado = (pagosConf || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);

  const { data: reservaInfo } = await sb
    .from('reservaciones').select('total').eq('id', reservacionId).single();
  const totalPkg = Number(reservaInfo?.total) || 0;
  const estado = totalPagado === 0 ? 'pendiente'
    : totalPkg > 0 && totalPagado >= totalPkg ? 'confirmada'
    : 'parcial';

  await sb.from('reservaciones')
    .update({ anticipo_pagado: totalPagado, estado })
    .eq('id', reservacionId);

  // Only update lugares_vendidos on the FIRST confirmed pago
  if ((pagosConf || []).length !== 1) return;

  const { data: reserva } = await sb
    .from('reservaciones')
    .select('personas, variante_id')
    .eq('id', reservacionId)
    .single();

  if (!reserva?.variante_id || !reserva?.personas) return;

  const { data: variante } = await sb
    .from('variantes_paquete')
    .select('lugares_vendidos')
    .eq('id', reserva.variante_id)
    .single();

  await sb.from('variantes_paquete')
    .update({ lugares_vendidos: (variante?.lugares_vendidos || 0) + reserva.personas })
    .eq('id', reserva.variante_id);
}
