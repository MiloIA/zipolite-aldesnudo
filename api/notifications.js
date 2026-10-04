import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── type=notification — envío de push a todos los suscriptores ────────────────

async function handleNotification(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const { data: session } = await supabase
    .from('admin_sessions').select('expires_at').eq('token', token).single();
  if (!session || new Date(session.expires_at) < new Date())
    return res.status(401).json({ error: 'Sesión expirada' });

  const { title, body, image, url } = req.body;
  const { data: subs } = await supabase.from('push_subscriptions').select('*');

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, image, url: url?.trim() || 'https://zipolitealdesnudo.com/#paquetes' })
    ).catch(err => console.error('Error enviando a', sub.endpoint, err.message)))
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  await supabase.from('push_history')
    .insert([{ title, body, image: image || null, url: url || null, sent }]);
  return res.status(200).json({ sent });
}

// ── type=confirmation — confirmación de reserva + CRM ────────────────────────

async function createViajero(reservacion) {
  try {
    const { data: existing } = await supabase
      .from('viajeros').select('id')
      .eq('reservacion_id', reservacion.id).eq('numero_viajero', 1).maybeSingle();
    if (existing) return;
    const parts = (reservacion.nombre || '').split(' ');
    await supabase.from('viajeros').insert({
      reservacion_id:      reservacion.id,
      nombre:              parts[0] || '',
      ap_paterno:          parts[1] || '',
      ap_materno:          parts[2] || '',
      correo:              reservacion.email,
      whatsapp:            reservacion.whatsapp || null,
      fecha_nacimiento:    reservacion.fecha_nacimiento || null,
      contacto_emergencia: reservacion.contacto_emergencia || null,
      es_titular:          true,
      numero_viajero:      1,
    });
  } catch (e) {
    console.error('createViajero error:', e.message);
  }
}

async function updateContactoEstado(email, whatsapp) {
  try {
    const { data: byEmail } = email
      ? await supabase.from('contactos').select('id').eq('email', email).maybeSingle()
      : { data: null };
    const { data: byWa } = (!byEmail && whatsapp)
      ? await supabase.from('contactos').select('id').eq('whatsapp', whatsapp).maybeSingle()
      : { data: null };
    const existente = byEmail || byWa;
    const updates = { estado_crm: 'reservado', temperatura: 'caliente', updated_at: new Date().toISOString() };
    if (existente) {
      await supabase.from('contactos').update(updates).eq('id', existente.id);
    } else {
      await supabase.from('contactos').insert({ email: email || null, whatsapp: whatsapp || null, origen: 'sitio', ...updates });
    }
    if (email && whatsapp) {
      const { data: telegramContacto } = await supabase
        .from('contactos').select('id')
        .eq('whatsapp', whatsapp).not('telegram_chat_id', 'is', null).is('email', null).maybeSingle();
      if (telegramContacto && telegramContacto.id !== existente?.id) {
        await supabase.from('contactos').update({ email, ...updates }).eq('id', telegramContacto.id);
      }
    }
  } catch (e) {
    console.error('updateContactoEstado error:', e.message);
  }
}

async function handleConfirmation(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    if (token !== process.env.ADMIN_PASSWORD) {
      const { data: session } = await supabase
        .from('admin_sessions').select('expires_at').eq('token', token).single();
      if (!session || new Date(session.expires_at) < new Date())
        return res.status(401).json({ error: 'Sesión expirada' });
    }
  } else {
    const reservacion_id = req.body?.reservacion_id;
    if (!reservacion_id) return res.status(401).json({ error: 'No autorizado' });
    const { data: reservaCheck } = await supabase
      .from('reservaciones').select('created_at').eq('id', reservacion_id).single();
    if (!reservaCheck) return res.status(404).json({ error: 'Reservación no encontrada' });
    const minutosDesdeCreacion = (Date.now() - new Date(reservaCheck.created_at)) / 60000;
    if (minutosDesdeCreacion > 30) return res.status(401).json({ error: 'No autorizado' });
  }

  const {
    reservacion_id, paquete_nombre, nombre, email, whatsapp,
    personas, metodo_pago, total, anticipo,
    bank_name, bank_clabe, fecha_inicio, fecha_fin,
    fecha_nacimiento, contacto_emergencia,
  } = req.body || {};

  if (!email || !nombre || !paquete_nombre)
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });

  try {
    await createViajero({ id: reservacion_id, nombre, email, whatsapp: whatsapp || null, fecha_nacimiento: fecha_nacimiento || null, contacto_emergencia: contacto_emergencia || null });
    await updateContactoEstado(email, whatsapp || null);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.query.type === 'notification') return handleNotification(req, res);
  return handleConfirmation(req, res);
}
