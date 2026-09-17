import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

export async function generarContrato(reservacion_id) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: reserva, error: errReserva } = await supabase
      .from('reservaciones')
      .select('*')
      .eq('id', reservacion_id)
      .single();

    if (errReserva || !reserva) {
      return { ok: false, error: 'Reservación no encontrada' };
    }

    const { data: viajeros, error: errViajeros } = await supabase
      .from('viajeros')
      .select('*')
      .eq('reservacion_id', reservacion_id);

    if (errViajeros) {
      return { ok: false, error: 'Error al obtener viajeros: ' + errViajeros.message };
    }

    let servicios    = 'N/A';
    let fechaInicio  = reserva.fecha_inicio || reserva.fecha_llegada || null;
    let fechaFin     = reserva.fecha_fin    || reserva.fecha_salida  || null;
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

    const { data: pagosConfirmados } = await supabase
      .from('pagos')
      .select('monto, metodo')
      .eq('reservacion_id', reservacion_id)
      .eq('confirmado', true);

    const totalPagado = (pagosConfirmados || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const metodoPago  = pagosConfirmados?.[0]?.metodo || reserva.metodo_pago || 'transfer';

    const personas = Number(reserva.personas || 1);
    const total    = precioPaquete > 0
      ? precioPaquete * personas
      : Number(reserva.total || reserva.precio_base || 0);
    const saldo    = Math.max(0, total - totalPagado);

    let duracion = reserva.duracion || 'N/A';
    if (fechaInicio && fechaFin) {
      const d1 = new Date(fechaInicio);
      const d2 = new Date(fechaFin);
      if (!isNaN(d1) && !isNaN(d2)) {
        const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (dias > 0) duracion = `${dias} días / ${dias - 1} noches`;
      }
    }

    const pdfBuffer = await buildPDF(
      reserva, viajeros || [], servicios, fechaInicio, fechaFin, total, saldo, duracion, totalPagado, metodoPago
    );

    const fileName = `${reservacion_id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('contratos')
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      return { ok: false, error: 'Error al subir PDF: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);
    const url = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('reservaciones')
      .update({ contrato_url: url })
      .eq('id', reservacion_id);

    if (updateError) {
      return { ok: false, error: 'Error al actualizar reservación: ' + updateError.message };
    }

    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildPDF(reserva, viajeros, servicios, fechaInicioPaquete, fechaFinPaquete, total, saldo, duracion, totalPagado, metodoPago) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 55, size: 'LETTER' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmtFecha = d => {
      if (!d) return 'N/A';
      const iso = String(d).includes('T') ? d : d + 'T12:00:00';
      return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const fmtMetodo = m => {
      if (!m) return 'Transferencia bancaria';
      if (m === 'transfer' || m === 'transferencia') return 'Transferencia / Depósito';
      if (m === 'card') return 'Tarjeta de crédito';
      if (!isNaN(String(m))) return `Financiamiento a ${m} meses`;
      return String(m);
    };

    const fmt = n => '$' + Math.round(n).toLocaleString('es-MX') + ' MXN';
    const capitalize = s => s
      ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : '';

    const titular = viajeros.find(v => v.es_titular) || viajeros[0] || {};
    const nombreTitular = capitalize(
      [titular.nombre, titular.ap_paterno, titular.ap_materno].filter(Boolean).join(' ')
    ) || reserva.nombre || 'N/A';

    const fechaAceptacion = fmtFecha(reserva.created_at?.split('T')[0] || null);
    const rawInicio  = reserva.fecha_inicio || reserva.fecha_llegada || fechaInicioPaquete;
    const rawFin     = reserva.fecha_fin    || reserva.fecha_salida  || fechaFinPaquete;
    const fechaLlegada = fmtFecha(rawInicio);
    const fechaSalida  = fmtFecha(rawFin);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
      .text('CONTRATO DE PRESTACIÓN DE SERVICIOS TURÍSTICOS', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.', { align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('I. PARTES');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`Nombre completo del titular: ${nombreTitular}`);
    doc.moveDown(0.5);
    doc.text(`Fecha de nacimiento: ${titular.fecha_nacimiento || reserva.fecha_nacimiento || 'N/A'}`);
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('II. OBJETO DEL CONTRATO');
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

    // Sección III
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('III. PRECIO Y FORMA DE PAGO');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#111');
    doc.text(`Precio total del paquete: ${fmt(total)} MXN`);
    doc.moveDown(0.3);
    doc.text(`Método de pago: ${fmtMetodo(metodoPago)}`);
    doc.moveDown(0.3);
    if (saldo === 0) {
      doc.font('Helvetica-Bold').fillColor('#1a9fa0').text(`✓ Pagado en su totalidad: ${fmt(totalPagado)} MXN`);
      doc.font('Helvetica').fillColor('#111');
    } else {
      doc.text(`Anticipo pagado: ${fmt(totalPagado)} MXN`);
      doc.moveDown(0.3);
      doc.text(`Saldo pendiente: ${fmt(saldo)} MXN`);
    }
    doc.moveDown(1);

    // Sección IV — solo si hay saldo pendiente
    if (saldo > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('IV. LIQUIDACIÓN');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#111');
      doc.text(`Saldo pendiente: ${fmt(saldo)} MXN`);
      doc.moveDown(0.3);
      doc.text('El saldo restante deberá liquidarse en su totalidad 10 días naturales antes de la fecha de llegada. En caso de no realizarse el pago en el plazo indicado, la reserva podrá ser cancelada sin derecho a reembolso del anticipo.');
      doc.moveDown(1);
    }

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('V. POLÍTICA DE CANCELACIÓN');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text('• El anticipo no es reembolsable bajo ninguna circunstancia.');
    doc.moveDown(0.5);
    doc.text('• En caso de cancelación con menos de 20 días naturales de anticipación a la fecha de viaje, no se realizará reembolso de ningún monto pagado.');
    doc.moveDown(0.5);
    doc.text('• Cancelaciones con más de 20 días de anticipación podrán generar un crédito a cuenta, sujeto a disponibilidad y evaluación de la agencia.');
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('VI. RESPONSABILIDADES Y LIMITACIONES');
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

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('VII. LISTA DE VIAJEROS');
    doc.moveDown(0.3);

    if (!viajeros.length) {
      const nombreReserva = capitalize(reserva.nombre || '');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(`1. ${nombreReserva || 'N/A'}`);
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica').fillColor('#333')
        .text('   Fecha de nacimiento: N/A     Nacionalidad: N/A');
      doc.moveDown(0.2);
      if (reserva.email)    { doc.text(`   Correo: ${reserva.email}`);       doc.moveDown(0.2); }
      if (reserva.whatsapp) { doc.text(`   WhatsApp: ${reserva.whatsapp}`);  doc.moveDown(0.2); }
      doc.moveDown(0.4);
    } else {
      viajeros.forEach((v, i) => {
        const nombre = capitalize(
          [v.nombre, v.ap_paterno, v.ap_materno].filter(Boolean).join(' ')
        ) || 'N/A';
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(`${i + 1}. ${nombre}`);
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333')
          .text(`   Fecha de nacimiento: ${v.fecha_nacimiento || 'N/A'}     Nacionalidad: ${v.nacionalidad || 'N/A'}`);
        doc.moveDown(0.2);
        if (v.correo)              { doc.text(`   Correo: ${v.correo}`);                              doc.moveDown(0.2); }
        if (v.whatsapp)            { doc.text(`   WhatsApp: ${v.whatsapp}`);                          doc.moveDown(0.2); }
        if (v.contacto_emergencia) { doc.text(`   Contacto de emergencia: ${v.contacto_emergencia}`); doc.moveDown(0.2); }
        if (v.alergias)            { doc.text(`   Restricciones / alergias: ${v.alergias}`);          doc.moveDown(0.2); }
        doc.moveDown(0.4);
      });
    }
    doc.moveDown(0.5);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A3A4A').text('VIII. ACEPTACIÓN DIGITAL');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#111')
      .text(`El cliente aceptó digitalmente este contrato el ${fechaAceptacion} mediante el marcado del checkbox de aceptación en el sitio web zipolitealdesnudo.com.`);
    doc.moveDown(0.5);
    doc.text(`Folio de reservación: ${reserva.id}`);
    doc.moveDown(2);

    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#666')
      .text('INFINITY JOURNEY BY MÉXICO S.A.S.  ·  Agencia de Viajes LGBT+', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('WhatsApp: 958 219 9953  ·  reservaciones@zipolitealdesnudo.com  ·  zipolitealdesnudo.com', { align: 'center' });

    doc.end();
  });
}
