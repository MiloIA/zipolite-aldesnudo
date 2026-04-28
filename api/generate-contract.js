import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { reservacion_id } = req.body || {};
  if (!reservacion_id) return res.status(400).json({ error: 'reservacion_id requerido' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: reserva, error: errReserva } = await supabase
    .from('reservaciones')
    .select('*')
    .eq('id', reservacion_id)
    .single();

  if (errReserva || !reserva) {
    return res.status(404).json({ error: 'Reservación no encontrada' });
  }

  const { data: viajeros, error: errViajeros } = await supabase
    .from('viajeros')
    .select('*')
    .eq('reservacion_id', reservacion_id);

  if (errViajeros) {
    return res.status(500).json({ error: 'Error al obtener viajeros: ' + errViajeros.message });
  }

  const pdfBuffer = await buildPDF(reserva, viajeros || []);

  const fileName = `${reservacion_id}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('contratos')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    return res.status(500).json({ error: 'Error al subir PDF: ' + uploadError.message });
  }

  const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);
  const pdfUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from('reservaciones')
    .update({ contrato_url: pdfUrl })
    .eq('id', reservacion_id);

  if (updateError) {
    return res.status(500).json({ error: 'Error al actualizar reservación: ' + updateError.message });
  }

  return res.status(200).json({ ok: true, url: pdfUrl });
}

function buildPDF(reserva, viajeros) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55, size: 'LETTER' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const titular = viajeros.find(v => v.es_titular) || viajeros[0] || {};
    const fechaAceptacion = reserva.created_at
      ? new Date(reserva.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

    const fechaLlegada  = reserva.fecha_llegada  || reserva.fecha_inicio || 'N/A';
    const fechaSalida   = reserva.fecha_salida   || reserva.fecha_fin    || 'N/A';
    const precioBase    = Number(reserva.precio_base || reserva.total || 0);
    const anticipo      = Number(reserva.anticipo || 0);
    const saldo         = Number(reserva.saldo_pendiente ?? (precioBase - anticipo));
    const fmt = n => '$' + Math.round(n).toLocaleString('es-MX') + ' MXN';

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold')
      .text('CONTRATO DE PRESTACIÓN DE SERVICIOS TURÍSTICOS', { align: 'center' });
    doc.fontSize(11).font('Helvetica-Bold')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.', { align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    // ── I. Partes ───────────────────────────────────────────────────────────
    sectionTitle(doc, 'I. PARTES');
    const nombreTitular = [titular.nombre, titular.apellidos].filter(Boolean).join(' ') || 'N/A';
    row(doc, 'Nombre completo del titular', nombreTitular);
    row(doc, 'Fecha de nacimiento',          titular.fecha_nacimiento || 'N/A');
    doc.moveDown(0.8);

    // ── II. Objeto ──────────────────────────────────────────────────────────
    sectionTitle(doc, 'II. OBJETO DEL CONTRATO');
    row(doc, 'Destino',              'Zipolite, Oaxaca, México');
    row(doc, 'Paquete',              reserva.paquete_nombre || 'N/A');
    row(doc, 'Fecha de llegada',     fechaLlegada);
    row(doc, 'Fecha de salida',      fechaSalida);
    row(doc, 'Duración',             reserva.duracion || 'N/A');
    row(doc, 'Servicios incluidos',  reserva.incluye   || 'N/A');
    doc.moveDown(0.8);

    // ── III. Precio ─────────────────────────────────────────────────────────
    sectionTitle(doc, 'III. PRECIO Y FORMA DE PAGO');
    row(doc, 'Precio base del paquete', fmt(precioBase));
    row(doc, 'Método de pago',          reserva.metodo_pago || 'N/A');
    row(doc, 'Anticipo pagado',         fmt(anticipo));
    doc.moveDown(0.8);

    // ── IV. Liquidación ─────────────────────────────────────────────────────
    sectionTitle(doc, 'IV. LIQUIDACIÓN');
    row(doc, 'Saldo pendiente', fmt(saldo));
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text('El saldo restante deberá liquidarse en su totalidad 10 días naturales antes de la fecha de llegada. En caso de no realizarse el pago en el plazo indicado, la reserva podrá ser cancelada sin derecho a reembolso del anticipo.');
    doc.moveDown(0.8);

    // ── V. Cancelaciones ────────────────────────────────────────────────────
    sectionTitle(doc, 'V. POLÍTICA DE CANCELACIÓN');
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text('• El anticipo no es reembolsable bajo ninguna circunstancia.');
    doc.text('• En caso de cancelación con menos de 20 días naturales de anticipación a la fecha de viaje, no se realizará reembolso de ningún monto pagado.');
    doc.text('• Cancelaciones con más de 20 días de anticipación podrán generar un crédito a cuenta, sujeto a disponibilidad y evaluación de la agencia.');
    doc.moveDown(0.8);

    // ── VI. Responsabilidades ───────────────────────────────────────────────
    sectionTitle(doc, 'VI. RESPONSABILIDADES Y LIMITACIONES');
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text('• La agencia no asume responsabilidad por cambios, retrasos o cancelaciones de vuelos imputables a las aerolíneas.');
    doc.text('• Quedan excluidos de responsabilidad los casos de fuerza mayor, desastres naturales, actos de autoridad o cualquier evento ajeno al control de la agencia.');
    doc.text('• Los servicios prestados por proveedores terceros (hoteles, transportistas, actividades) son responsabilidad exclusiva de dichos proveedores.');
    doc.text('• En todo lo no previsto en este contrato se estará a lo dispuesto por el Artículo 2111 del Código Civil Federal (CCF) y demás disposiciones aplicables.');
    doc.moveDown(0.8);

    // ── VII. Viajeros ───────────────────────────────────────────────────────
    sectionTitle(doc, 'VII. LISTA DE VIAJEROS');
    renderTravelersTable(doc, viajeros);
    doc.moveDown(0.8);

    // ── VIII. Aceptación ────────────────────────────────────────────────────
    sectionTitle(doc, 'VIII. ACEPTACIÓN DIGITAL');
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text(`El cliente aceptó digitalmente este contrato el ${fechaAceptacion} mediante el marcado del checkbox de aceptación en el sitio web zipolitealdesnudo.com.`);
    doc.text(`Folio de reservación: ${reserva.id}`);
    doc.moveDown(1.5);

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(8).fillColor('#666')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.  ·  Agencia de Viajes LGBT+', { align: 'center' });
    doc.text('WhatsApp: 958 219 9953  ·  reservaciones@zipolitealdesnudo.com  ·  zipolitealdesnudo.com', { align: 'center' });

    doc.end();
  });
}

function sectionTitle(doc, text) {
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A3A4A').text(text);
  doc.moveDown(0.3);
}

function row(doc, label, value) {
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(label + ':', x, y, { continued: false });
  doc.font('Helvetica').fontSize(9).fillColor('#111').text(String(value), x + 12, doc.y - doc.currentLineHeight(), { continued: false });
  doc.moveDown(0.25);
}

function renderTravelersTable(doc, viajeros) {
  if (!viajeros.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#888').text('Sin viajeros registrados.');
    return;
  }

  const left = doc.page.margins.left;
  const colW = [200, 110, 120];
  const headers = ['Nombre completo', 'Fecha nacimiento', 'Nacionalidad'];

  // Header row
  let x = left;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff');
  doc.rect(left, doc.y, colW[0] + colW[1] + colW[2], 14).fill('#1A3A4A');
  const headerY = doc.y - 14 + 3;
  headers.forEach((h, i) => {
    doc.fillColor('#fff').text(h, x + 3, headerY, { width: colW[i] - 6, lineBreak: false });
    x += colW[i];
  });
  doc.moveDown(0.1);

  // Data rows
  viajeros.forEach((v, idx) => {
    const rowY = doc.y;
    const bg = idx % 2 === 0 ? '#f5fafc' : '#ffffff';
    doc.rect(left, rowY, colW[0] + colW[1] + colW[2], 13).fill(bg);

    const nombre = [v.nombre, v.apellidos].filter(Boolean).join(' ') || 'N/A';
    const cells = [nombre, v.fecha_nacimiento || 'N/A', v.nacionalidad || 'N/A'];
    x = left;
    doc.font('Helvetica').fontSize(8.5).fillColor('#222');
    cells.forEach((cell, i) => {
      doc.text(cell, x + 3, rowY + 2, { width: colW[i] - 6, lineBreak: false });
      x += colW[i];
    });
    doc.moveDown(0.05);
    doc.y = rowY + 13;
  });
}
