import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const fechaLlegada = reserva.fecha_llegada || reserva.fecha_inicio || 'N/A';
    const fechaSalida  = reserva.fecha_salida  || reserva.fecha_fin    || 'N/A';
    const precioBase   = Number(reserva.precio_base || reserva.total || 0);
    const anticipo     = Number(reserva.anticipo || 0);
    const saldo        = Number(reserva.saldo_pendiente ?? (precioBase - anticipo));
    const fmt          = n => '$' + Math.round(n).toLocaleString('es-MX') + ' MXN';
    const nombreTitular = [titular.nombre, titular.apellidos].filter(Boolean).join(' ') || 'N/A';

    // ── Header ──
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
      .text('CONTRATO DE PRESTACIÓN DE SERVICIOS TURÍSTICOS', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.', { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(1);

    // ── I. Partes ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('I. PARTES');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`Nombre completo del titular: ${nombreTitular}`);
    doc.moveDown(0.5);
    doc.text(`Fecha de nacimiento: ${titular.fecha_nacimiento || 'N/A'}`);
    doc.moveDown(1);

    // ── II. Objeto ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('II. OBJETO DEL CONTRATO');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text('Destino: Zipolite, Oaxaca, México');
    doc.moveDown(0.5);
    doc.text(`Paquete: ${reserva.paquete_nombre || 'N/A'}`);
    doc.moveDown(0.5);
    doc.text(`Fecha de llegada: ${fechaLlegada}`);
    doc.moveDown(0.5);
    doc.text(`Fecha de salida: ${fechaSalida}`);
    doc.moveDown(0.5);
    doc.text(`Duración: ${reserva.duracion || 'N/A'}`);
    doc.moveDown(0.5);
    doc.text(`Servicios incluidos: ${reserva.incluye || 'N/A'}`);
    doc.moveDown(1);

    // ── III. Precio ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('III. PRECIO Y FORMA DE PAGO');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`Precio base del paquete: ${fmt(precioBase)}`);
    doc.moveDown(0.5);
    doc.text(`Método de pago: ${reserva.metodo_pago || 'N/A'}`);
    doc.moveDown(0.5);
    doc.text(`Anticipo pagado: ${fmt(anticipo)}`);
    doc.moveDown(1);

    // ── IV. Liquidación ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('IV. LIQUIDACIÓN');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`Saldo pendiente: ${fmt(saldo)}`);
    doc.moveDown(0.5);
    doc.text('El saldo restante deberá liquidarse en su totalidad 10 días naturales antes de la fecha de llegada. En caso de no realizarse el pago en el plazo indicado, la reserva podrá ser cancelada sin derecho a reembolso del anticipo.');
    doc.moveDown(1);

    // ── V. Cancelaciones ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('V. POLÍTICA DE CANCELACIÓN');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text('• El anticipo no es reembolsable bajo ninguna circunstancia.');
    doc.moveDown(0.5);
    doc.text('• En caso de cancelación con menos de 20 días naturales de anticipación a la fecha de viaje, no se realizará reembolso de ningún monto pagado.');
    doc.moveDown(0.5);
    doc.text('• Cancelaciones con más de 20 días de anticipación podrán generar un crédito a cuenta, sujeto a disponibilidad y evaluación de la agencia.');
    doc.moveDown(1);

    // ── VI. Responsabilidades ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('VI. RESPONSABILIDADES Y LIMITACIONES');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text('• La agencia no asume responsabilidad por cambios, retrasos o cancelaciones de vuelos imputables a las aerolíneas.');
    doc.moveDown(0.5);
    doc.text('• Quedan excluidos de responsabilidad los casos de fuerza mayor, desastres naturales, actos de autoridad o cualquier evento ajeno al control de la agencia.');
    doc.moveDown(0.5);
    doc.text('• Los servicios prestados por proveedores terceros (hoteles, transportistas, actividades) son responsabilidad exclusiva de dichos proveedores.');
    doc.moveDown(0.5);
    doc.text('• En todo lo no previsto en este contrato se estará a lo dispuesto por el Artículo 2111 del Código Civil Federal (CCF) y demás disposiciones aplicables.');
    doc.moveDown(1);

    // ── VII. Viajeros ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('VII. LISTA DE VIAJEROS');
    doc.moveDown(0.3);

    if (!viajeros.length) {
      doc.fontSize(10).font('Helvetica').fillColor('#888')
        .text('Sin viajeros registrados.');
      doc.moveDown(0.5);
    } else {
      viajeros.forEach((v, i) => {
        const nombre = [v.nombre, v.apellidos].filter(Boolean).join(' ') || 'N/A';
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111')
          .text(`${i + 1}. ${nombre}`);
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#444')
          .text(`   Fecha de nacimiento: ${v.fecha_nacimiento || 'N/A'}     Nacionalidad: ${v.nacionalidad || 'N/A'}`);
        doc.moveDown(0.5);
      });
    }
    doc.moveDown(0.5);

    // ── VIII. Aceptación ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('VIII. ACEPTACIÓN DIGITAL');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`El cliente aceptó digitalmente este contrato el ${fechaAceptacion} mediante el marcado del checkbox de aceptación en el sitio web zipolitealdesnudo.com.`);
    doc.moveDown(0.5);
    doc.text(`Folio de reservación: ${reserva.id}`);
    doc.moveDown(2);

    // ── Footer ──
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#666')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.  ·  Agencia de Viajes LGBT+', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('WhatsApp: 958 219 9953  ·  reservaciones@zipolitealdesnudo.com  ·  zipolitealdesnudo.com', { align: 'center' });

    doc.end();
  });
}
