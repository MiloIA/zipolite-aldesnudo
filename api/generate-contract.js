import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  try {
    console.log('generate-contract called', req.method, req.body);

    if (req.method !== 'POST') {
      console.log('returning:', { error: 'Method not allowed' });
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { reservacion_id } = req.body || {};
    if (!reservacion_id) {
      console.log('returning:', { error: 'reservacion_id requerido' });
      return res.status(400).json({ error: 'reservacion_id requerido' });
    }

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
      console.log('returning:', { error: 'Reservación no encontrada', errReserva });
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }

    const { data: viajeros, error: errViajeros } = await supabase
      .from('viajeros')
      .select('*')
      .eq('reservacion_id', reservacion_id);

    if (errViajeros) {
      console.log('returning:', { error: 'Error al obtener viajeros', errViajeros });
      return res.status(500).json({ error: 'Error al obtener viajeros: ' + errViajeros.message });
    }

    // Resolve servicios + fechas + precio desde paquetes, con fallback a reserva
    let servicios  = 'N/A';
    let fechaInicio = reserva.fecha_inicio || reserva.fecha_llegada || null;
    let fechaFin    = reserva.fecha_fin    || reserva.fecha_salida  || null;
    let precioPaquete = 0;

    if (reserva.incluye) {
      servicios = Array.isArray(reserva.incluye)
        ? reserva.incluye.join(', ')
        : String(reserva.incluye);
    }

    if (reserva.paquete_nombre) {
      const { data: paquete, error: errPaquete } = await supabase
        .from('paquetes')
        .select('incluye, fecha_inicio, fecha_fin, precio')
        .eq('nombre', reserva.paquete_nombre)
        .single();
      console.log('paquete query filter:', reserva.paquete_nombre);
      console.log('paquete result:', paquete, 'error:', errPaquete?.message);
      console.log('paquete fechas:', paquete?.fecha_inicio, paquete?.fecha_fin);
      if (paquete && !errPaquete) {
        if (!reserva.incluye && paquete.incluye) {
          servicios = Array.isArray(paquete.incluye)
            ? paquete.incluye.join(', ')
            : String(paquete.incluye);
        }
        fechaInicio   = paquete.fecha_inicio || fechaInicio;
        fechaFin      = paquete.fecha_fin    || fechaFin;
        precioPaquete = Number(paquete.precio || 0);
      }
    }

    console.log('fechas resueltas:', fechaInicio, fechaFin);

    const personas = Number(reserva.personas || 1);
    const total    = precioPaquete > 0
      ? precioPaquete * personas
      : Number(reserva.total || reserva.precio_base || 0);
    const anticipo = Number(reserva.anticipo || 0);
    const saldo    = Math.max(0, total - anticipo);

    let duracion = reserva.duracion || 'N/A';
    if (fechaInicio && fechaFin) {
      const d1 = new Date(fechaInicio);
      const d2 = new Date(fechaFin);
      if (!isNaN(d1) && !isNaN(d2)) {
        const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (dias > 0) duracion = `${dias} días / ${dias - 1} noches`;
      }
    }

    console.log('Starting PDF generation');
    const pdfBuffer = await buildPDF(reserva, viajeros || [], servicios, fechaInicio, fechaFin, total, saldo, duracion);
    console.log('PDF generated, size:', pdfBuffer.length);

    const fileName = `${reservacion_id}.pdf`;
    console.log('Uploading to storage');
    const { error: uploadError } = await supabase.storage
      .from('contratos')
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    console.log('Upload result:', uploadError ? uploadError.message : 'ok');

    if (uploadError) {
      console.log('upload error detail:', JSON.stringify(uploadError));
      console.log('returning:', { error: 'Error al subir PDF', uploadError });
      return res.status(500).json({ error: 'Error al subir PDF: ' + uploadError.message });
    }

    const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('reservaciones')
      .update({ contrato_url: pdfUrl })
      .eq('id', reservacion_id);

    if (updateError) {
      console.log('returning:', { error: 'Error al actualizar reservación', updateError });
      return res.status(500).json({ error: 'Error al actualizar reservación: ' + updateError.message });
    }

    console.log('returning:', { ok: true, url: pdfUrl });
    return res.status(200).json({ ok: true, url: pdfUrl });
  } catch (err) {
    console.error('FATAL ERROR:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}

function buildPDF(reserva, viajeros, servicios, fechaInicioPaquete, fechaFinPaquete, total, saldo, duracion) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55, size: 'LETTER' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Helpers ──
    const fmtFecha = d => {
      if (!d) return 'N/A';
      const iso = String(d).includes('T') ? d : d + 'T12:00:00';
      return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const fmtMetodo = m => {
      if (!m) return 'N/A';
      if (m === 'transfer') return 'Transferencia / Depósito';
      if (m === 'card') return 'Tarjeta de crédito';
      if (!isNaN(String(m))) return `Financiamiento a ${m} meses`;
      return String(m);
    };

    const fmt = n => '$' + Math.round(n).toLocaleString('es-MX') + ' MXN';
    const capitalize = s => s
      ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : '';

    // ── Data ──
    const titular = viajeros.find(v => v.es_titular) || viajeros[0] || {};
    const nombreTitular = capitalize(
      [titular.nombre, titular.ap_paterno, titular.ap_materno].filter(Boolean).join(' ')
    ) || 'N/A';

    const fechaAceptacion = fmtFecha(reserva.created_at?.split('T')[0] || null);
    const rawInicio = reserva.fecha_inicio || reserva.fecha_llegada || fechaInicioPaquete;
    const rawFin    = reserva.fecha_fin    || reserva.fecha_salida  || fechaFinPaquete;
    const fechaLlegada = fmtFecha(rawInicio);
    const fechaSalida  = fmtFecha(rawFin);

    const anticipo = Number(reserva.anticipo || 0);

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
    doc.text(`Servicios incluidos: ${servicios}`);
    doc.moveDown(1);

    // ── III. Precio ──
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A')
      .text('III. PRECIO Y FORMA DE PAGO');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`Precio total del paquete: ${fmt(total)}`);
    doc.moveDown(0.5);
    doc.text(`Método de pago: ${fmtMetodo(reserva.metodo_pago)}`);
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
        const nombre = capitalize(
          [v.nombre, v.ap_paterno, v.ap_materno].filter(Boolean).join(' ')
        ) || 'N/A';
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111')
          .text(`${i + 1}. ${nombre}`);
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333')
          .text(`   Fecha de nacimiento: ${v.fecha_nacimiento || 'N/A'}     Nacionalidad: ${v.nacionalidad || 'N/A'}`);
        doc.moveDown(0.2);
        if (v.correo) {
          doc.text(`   Correo: ${v.correo}`);
          doc.moveDown(0.2);
        }
        if (v.whatsapp) {
          doc.text(`   WhatsApp: ${v.whatsapp}`);
          doc.moveDown(0.2);
        }
        if (v.contacto_emergencia) {
          doc.text(`   Contacto de emergencia: ${v.contacto_emergencia}`);
          doc.moveDown(0.2);
        }
        if (v.alergias) {
          doc.text(`   Restricciones / alergias: ${v.alergias}`);
          doc.moveDown(0.2);
        }
        doc.moveDown(0.4);
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
