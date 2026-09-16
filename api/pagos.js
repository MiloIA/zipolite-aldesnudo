import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ANO_NUEVO_PKG_ID = '05c33974-5f37-4cff-9ec4-bc60df160f69';

async function requireAuth(req) {
  const token = req.headers['x-admin-token'] || '';
  if (token === process.env.ADMIN_PASSWORD) return true;
  // Also accept admin session tokens (64-char hex from admin-auth.js)
  if (/^[a-f0-9]{64}$/.test(token)) {
    const { data } = await sb.from('admin_sessions')
      .select('expires_at').eq('token', token).single();
    if (data && new Date(data.expires_at) > new Date()) return true;
  }
  return false;
}

async function createViajero(reservacion) {
  try {
    const { data: existing } = await sb
      .from('viajeros').select('id')
      .eq('reservacion_id', reservacion.id).eq('numero_viajero', 1).maybeSingle();
    if (existing) return;
    const parts = (reservacion.nombre || '').split(' ');
    await sb.from('viajeros').insert({
      reservacion_id: reservacion.id,
      nombre:         parts[0] || '',
      ap_paterno:     parts[1] || '',
      ap_materno:     parts[2] || '',
      correo:         reservacion.email,
      whatsapp:       reservacion.whatsapp || null,
      es_titular:     true,
      numero_viajero: 1,
    });
  } catch (e) {
    console.error('createViajero error:', e.message);
  }
}

async function updateContactoEstado(email, whatsapp) {
  try {
    const { data: byEmail } = email
      ? await sb.from('contactos').select('id').eq('email', email).maybeSingle()
      : { data: null };
    const { data: byWa } = (!byEmail && whatsapp)
      ? await sb.from('contactos').select('id').eq('whatsapp', whatsapp).maybeSingle()
      : { data: null };
    const existente = byEmail || byWa;
    const updates = {
      estado_crm:  'reservado',
      temperatura: 'caliente',
      updated_at:  new Date().toISOString(),
    };
    if (existente) {
      await sb.from('contactos').update(updates).eq('id', existente.id);
    } else {
      await sb.from('contactos').insert({ email: email || null, whatsapp: whatsapp || null, origen: 'sitio', ...updates });
    }
  } catch (e) {
    console.error('updateContactoEstado error:', e.message);
  }
}

export default async function handler(req, res) {
  const { method } = req;
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;

  // ── PUBLIC: client reads own reservaciones by email ──────────────────────
  if (method === 'GET' && params.get('email') && params.get('cliente') === '1') {
    const email = params.get('email');
    const { data: reservaciones, error: rErr } = await sb
      .from('reservaciones')
      .select('id, paquete_nombre, personas, total, estado, metodo_pago, fecha_inicio, fecha_fin, created_at, variantes_paquete(nombre), paquetes(foto_url)')
      .eq('email', email)
      .order('created_at', { ascending: false });

    if (rErr) return res.status(500).json({ error: rErr.message });
    if (!reservaciones || reservaciones.length === 0) return res.status(200).json({ data: [] });

    const ids = reservaciones.map(r => r.id);
    const { data: pagos } = await sb
      .from('pagos')
      .select('reservacion_id, monto, confirmado')
      .in('reservacion_id', ids);

    const byReserva = {};
    (pagos || []).forEach(p => {
      if (!byReserva[p.reservacion_id]) byReserva[p.reservacion_id] = [];
      byReserva[p.reservacion_id].push(p);
    });

    const data = reservaciones.map(r => ({
      ...r,
      foto_url: r.paquetes?.foto_url || null,
      total_pagado: (byReserva[r.id] || [])
        .filter(p => p.confirmado)
        .reduce((s, p) => s + (Number(p.monto) || 0), 0),
    }));

    return res.status(200).json({ data });
  }

  // ── PUBLIC: client reads own reservacion by UUID (no auth needed) ─────────
  if (method === 'GET' && params.get('reservacion_id') && !params.get('all') && !params.get('variantes')) {
    const reservacionId = params.get('reservacion_id');
    const [{ data: reserva, error: rErr }, { data: pagos }] = await Promise.all([
      sb.from('reservaciones').select('*').eq('id', reservacionId).single(),
      sb.from('pagos').select('*').eq('reservacion_id', reservacionId).order('fecha', { ascending: true }),
    ]);
    if (rErr || !reserva) return res.status(404).json({ error: 'Reservación no encontrada' });
    return res.status(200).json({ reserva, pagos: pagos || [] });
  }

  // ── PUBLIC: client submits comprobante de transferencia ───────────────────
  if (method === 'POST' && (req.body || {}).action === 'comprobante') {
    const { reservacion_id, monto, file_base64, file_name, file_type } = req.body || {};
    if (!reservacion_id || !monto) return res.status(400).json({ error: 'Faltan datos' });

    // 1. Fetch reservacion data for notification
    const { data: reserva } = await sb
      .from('reservaciones')
      .select('id, nombre, email, whatsapp, paquete_nombre')
      .eq('id', reservacion_id)
      .single();
    if (!reserva) return res.status(404).json({ error: 'Reservación no encontrada' });

    // 2. Upload file to Storage
    let comprobanteNota = 'Comprobante subido por cliente — pendiente confirmación';
    let uploadPath = null;
    if (file_base64 && file_name) {
      try {
        const buffer = Buffer.from(file_base64, 'base64');
        const ext = (file_name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        uploadPath = `${reservacion_id}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage
          .from('comprobantes')
          .upload(uploadPath, buffer, { contentType: file_type || 'image/jpeg', upsert: true });
        if (!upErr) comprobanteNota += ` — archivo: ${uploadPath}`;
      } catch (_) {}
    }

    // 3. Insert pago — select id back for inline keyboard
    const { data: pago, error: pagoErr } = await sb.from('pagos').insert([{
      reservacion_id,
      monto: Number(monto),
      metodo: 'transferencia',
      fecha: new Date().toISOString().split('T')[0],
      notas: comprobanteNota,
      confirmado: false,
    }]).select('id').single();
    if (pagoErr) return res.status(500).json({ error: pagoErr.message });

    // 4. Telegram notification
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_CHAT_ID;
    console.log('TG CHECK:', tgToken ? 'TOKEN_SET' : 'TOKEN_MISSING', tgChat ? 'CHAT_SET' : 'CHAT_MISSING');
    if (tgToken && tgChat) {
      const shortId = reservacion_id.slice(-6).toUpperCase();
      const caption =
        `🧾 <b>Comprobante recibido</b>\n\n` +
        `<b>Reserva:</b> #${shortId}\n` +
        `<b>Cliente:</b> ${reserva.nombre || '—'}\n` +
        `<b>Email:</b> ${reserva.email || '—'}\n` +
        `<b>WhatsApp:</b> ${reserva.whatsapp || '—'}\n` +
        `<b>Paquete:</b> ${reserva.paquete_nombre || '—'}\n` +
        `<b>Monto declarado:</b> $${Number(monto).toLocaleString('es-MX')}`;

      const replyMarkup = pago?.id ? {
        inline_keyboard: [[
          { text: '✅ Confirmar pago', callback_data: `confirmar_pago:${pago.id}` },
          { text: '❌ Rechazar',       callback_data: `rechazar_pago:${pago.id}`  },
        ]],
      } : undefined;

      const fileUrl = uploadPath
        ? `${process.env.SUPABASE_URL}/storage/v1/object/public/comprobantes/${uploadPath}`
        : null;
      const mensajeTelegram = caption + (uploadPath
        ? `\n\n📎 <a href="${fileUrl}">Ver comprobante</a>`
        : '');

      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChat,
          text: mensajeTelegram,
          parse_mode: 'HTML',
          ...(replyMarkup && { reply_markup: replyMarkup }),
        }),
      }).catch(e => console.error('telegram comprobante:', e));
    }

    return res.status(201).json({ ok: true });
  }

  // ── Auth required for all other routes ────────────────────────────────────
  if (!await requireAuth(req)) return res.status(401).json({ error: 'No autorizado' });

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

    return res.status(400).json({ error: 'Falta parámetro all o variantes' });
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
      await createViajero(data);
      await updateContactoEstado(data.email, data.whatsapp);
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
