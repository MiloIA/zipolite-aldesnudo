// ---- ADMIN AUTH ----
function openAdminLogin() {
  document.getElementById('admin-login').classList.add('open');
  setTimeout(()=>document.getElementById('admin-pwd').focus(), 100);
}
function closeAdminLogin() {
  document.getElementById('admin-login').classList.remove('open');
  document.getElementById('admin-pwd').value = '';
  document.getElementById('login-err').style.display = 'none';
}

async function checkAdminPwd() {
  const pwd = document.getElementById('admin-pwd').value;
  if (!pwd) return;
  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.token) {
      adminAuthenticated = true;
      sessionStorage.setItem('adminToken', data.token);
      closeAdminLogin();
      openAdmin();
    } else {
      const errEl = document.getElementById('login-err');
      errEl.textContent = res.status === 429 ? data.error : 'Contraseña incorrecta';
      errEl.style.display = 'block';
    }
  } catch {
    document.getElementById('login-err').textContent = 'Error de conexión. Intenta de nuevo.';
    document.getElementById('login-err').style.display = 'block';
  }
}

function checkFirstTimeSetup() {
  if (window.location.hash !== '#setup-admin') return;
  alert('La contraseña del admin se configura en las variables de entorno de Vercel (ADMIN_PASSWORD).');
  window.location.hash = '';
}

async function hashStr(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.admin-section').forEach(section => {
    section.classList.toggle('active', section.id === 'admin-section-' + tabId);
  });
  localStorage.setItem('adminActiveTab', tabId);
  if (tabId === 'configuracion') loadConfig();
  if (tabId === 'cotizaciones') loadCotizaciones();
  if (tabId === 'finanzas') loadFinanzas();
}

function openAdmin() {
  if (!adminAuthenticated) { openAdminLogin(); return; }
  document.getElementById('admin-panel').style.display = 'block';
  loadAdminData();
  const savedTab = localStorage.getItem('adminActiveTab') || 'paquetes';
  switchAdminTab(savedTab);
}
function closeAdmin() {
  document.getElementById('admin-panel').style.display = 'none';
}

// ---- DISCOUNTS ADMIN ----
async function loadDiscounts() {
  const {data} = await sb.from('descuentos').select('*').order('created_at',{ascending:false});
  renderDiscounts(data||[]);
}
function renderDiscounts(list) {
  const c = document.getElementById('adm-disc-list');
  if (!list.length) { c.innerHTML='<div style="color:#aaa;font-size:0.85rem;">Sin códigos aún.</div>'; return; }
  c.innerHTML = list.map(d=>{
    const usosInfo = d.usos_maximos != null ? `${d.usos_actuales??0}/${d.usos_maximos} usos` : `${d.usos_actuales??0}/ilimitado usos`;
    return `<div class="item-row">
      <div class="item-info"><h4>${d.codigo} — ${d.tipo==='percent'?d.valor+'%':fmt(d.valor)+' MXN'}</h4><p>${d.activo?'✅ Activo':'⏸ Inactivo'} · ${usosInfo}</p></div>
      <div class="item-actions"><button class="del-btn" onclick="delDiscount('${d.id}')">Eliminar</button></div>
    </div>`;
  }).join('');
}
async function saveDiscount() {
  const codigo = document.getElementById('disc-codigo').value.trim().toUpperCase();
  const tipo = document.getElementById('disc-tipo').value;
  const valor = parseFloat(document.getElementById('disc-valor').value);
  const activo = document.getElementById('disc-activo').checked;
  const usosTxt = document.getElementById('disc-usos').value.trim();
  const usos_maximos = usosTxt ? parseInt(usosTxt) : null;
  if (!codigo || isNaN(valor)) { alert('Completa código y valor.'); return; }
  const {error} = await sb.from('descuentos').insert([{codigo, tipo, valor, activo, usos_maximos}]);
  if (error) { alert('Error: '+error.message); return; }
  ['disc-codigo','disc-valor','disc-usos'].forEach(id=>document.getElementById(id).value='');
  loadDiscounts();
}
async function delDiscount(id) {
  if (!confirm('¿Eliminar este código?')) return;
  const { data, error } = await sb.from('descuentos').delete().eq('id', id).select();
  if (error) { alert('Error al eliminar: ' + error.message); return; }
  if (!data || data.length === 0) { alert('No se pudo eliminar. Verifica los permisos en Supabase (RLS).'); }
  await loadDiscounts();
}

// ---- ADMIN DATA ----
async function loadAdminPkgs() {
  const {data} = await sb.from('paquetes').select('*').order('created_at');
  adminPkgs = data || [];
  renderAdmPkgs();
}

async function loadAdminData() {
  await loadAdminPkgs();
  const {data:gd}=await sb.from('galeria').select('*').order('orden').order('created_at');
  renderAdmGallery(gd||[]);
  const {data:bd}=await sb.from('blog').select('*').order('created_at',{ascending:false});
  renderAdmBlog(bd||[]);
  loadConfig();
  loadDiscounts();
  loadReservaciones();
  loadCotizaciones();
  loadPushStats();
  loadPushHistory();
  loadDescuentos();
}

// ---- PUSH NOTIFICATIONS ----
async function loadDescuentos() {
  const { data } = await sb.from('descuentos')
    .select('codigo, valor, tipo')
    .eq('activo', true)
    .order('codigo');

  const select = document.getElementById('push-codigo');
  if (!select) return;

  select.innerHTML = '<option value="">Sin código de descuento</option>';

  if (data?.length) {
    data.forEach(d => {
      const label = d.tipo === 'porcentaje'
        ? `${d.codigo} (${d.valor}% off)`
        : `${d.codigo} ($${d.valor} off)`;
      select.innerHTML += `<option value="${d.codigo}">${label}</option>`;
    });
  }
}

async function loadPushStats() {
  const { data } = await sb.from('push_subscriptions').select('id');
  document.getElementById('push-count').textContent = data?.length || 0;
}

document.getElementById('push-title')?.addEventListener('input', updatePushPreview);
document.getElementById('push-body')?.addEventListener('input', updatePushPreview);
document.getElementById('push-image')?.addEventListener('input', updatePushPreview);

function updatePushPreview() {
  const title = document.getElementById('push-title').value || 'Título';
  const body = document.getElementById('push-body').value || 'Mensaje...';
  const image = document.getElementById('push-image').value;
  document.getElementById('push-preview').innerHTML = `
    <div class="notif-preview">
      <div class="notif-header">
        <img src="/icon-192x192.png" class="notif-icon">
        <div>
          <strong>${title}</strong>
          <p>${body}</p>
        </div>
      </div>
      ${image ? `<img src="${image}" class="notif-image" onerror="this.style.display='none'">` : ''}
    </div>
  `;
}

async function uploadPushImage(input) {
  const file = input.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop();
  const path = `push/${Date.now()}.${ext}`;

  const { error } = await sb.storage
    .from('galeria')
    .upload(path, file, { contentType: file.type });

  if (error) { alert('Error al subir imagen: ' + error.message); return; }

  const { data } = sb.storage.from('galeria').getPublicUrl(path);

  document.getElementById('push-image').value = data.publicUrl;
  document.getElementById('push-image-name').textContent = file.name;
  document.getElementById('push-image-preview').src = data.publicUrl;
  document.getElementById('push-image-preview').style.display = 'block';
}

async function sendPushNotification() {
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  const image = document.getElementById('push-image').value.trim();
  const url = document.getElementById('push-url').value.trim();
  const descripcion = document.getElementById('push-descripcion').value.trim();
  const codigo_descuento = document.getElementById('push-codigo').value.trim().toUpperCase();
  const valido_hasta = document.getElementById('push-valido-hasta').value;
  const cta_texto = document.getElementById('push-cta-texto').value.trim();
  const cta_url = document.getElementById('push-cta-url').value.trim();

  if (!title || !body) {
    alert('Título y mensaje son obligatorios');
    return;
  }

  const btn = document.querySelector('.btn-push-send');
  btn.textContent = '⏳ Enviando...';
  btn.disabled = true;

  const res = await fetch('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, image, url })
  });

  const data = await res.json();
  const result = document.getElementById('push-result');

  if (res.ok) {
    const record = { title, body, sent: data.sent };
    if (image) record.image = image;
    if (descripcion) record.descripcion = descripcion;
    if (codigo_descuento) record.codigo_descuento = codigo_descuento;
    if (valido_hasta) record.valido_hasta = valido_hasta;
    if (cta_texto) record.cta_texto = cta_texto;
    if (cta_url) record.cta_url = cta_url;

    const { data: inserted } = await sb.from('push_history').insert([record]).select('id').single();
    const miniUrl = inserted?.id ? `/notificacion.html?id=${inserted.id}` : '';
    result.innerHTML = `<p class="push-success">✅ Enviado a ${data.sent} suscriptores${miniUrl ? ` · <a href="${miniUrl}" target="_blank">Ver mini-página</a>` : ''}</p>`;

    loadPushHistory();
    document.getElementById('push-title').value = '';
    document.getElementById('push-body').value = '';
    document.getElementById('push-image').value = '';
    document.getElementById('push-url').value = '';
    document.getElementById('push-descripcion').value = '';
    document.getElementById('push-codigo').value = '';
    document.getElementById('push-valido-hasta').value = '';
    document.getElementById('push-cta-texto').value = '🏖️ Ver paquetes';
    document.getElementById('push-cta-url').value = '';
    document.getElementById('push-preview').innerHTML = '<p style="color:#aaa;font-size:0.85rem">👆 Preview aparecerá aquí</p>';
  } else {
    result.innerHTML = `<p class="push-error">❌ Error al enviar</p>`;
  }

  btn.textContent = '🚀 Enviar a todos los suscriptores';
  btn.disabled = false;
}

async function loadPushHistory() {
  const { data } = await sb.from('push_history')
    .select('*').order('created_at', { ascending: false }).limit(10);
  const list = document.getElementById('push-history-list');
  if (!data?.length) { list.innerHTML = '<p style="color:#aaa">Sin historial aún.</p>'; return; }
  list.innerHTML = data.map(h => `
    <div class="push-history-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <strong>${h.title}</strong>
          <p>${h.body}</p>
          <small>Enviado a ${h.sent} personas · ${new Date(h.created_at).toLocaleDateString('es-MX')}</small>
        </div>
        <button onclick="deleteNotif('${h.id}')"
          style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.1rem;padding:4px 8px;flex-shrink:0"
          title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function deleteNotif(id) {
  if (!confirm('¿Eliminar esta notificación? La mini-página también dejará de estar disponible.')) return;
  const { error } = await sb.from('push_history').delete().eq('id', id);
  if (error) { alert('Error al eliminar'); return; }
  await loadPushHistory();
  await loadPushStats();
  await loadNotifCenter();
}

async function loadReservaciones() {
  const {data,error} = await sb.from('reservaciones').select('*').order('created_at',{ascending:false});
  if (error) { document.getElementById('adm-reservaciones').innerHTML='<p style="color:red;font-size:0.85rem;">Error cargando reservaciones.</p>'; return; }
  renderReservaciones(data||[]);
}

function renderReservaciones(list) {
  const pendientes = list.filter(r => r.estado === 'pendiente').length;
  const badge = document.getElementById('badge-pendientes');
  if (badge) { badge.textContent = pendientes; badge.style.display = pendientes > 0 ? 'inline' : 'none'; }
  const c = document.getElementById('adm-reservaciones');
  if (!list.length) { c.innerHTML='<p style="color:#aaa;font-size:0.85rem;">Sin reservaciones aún.</p>'; return; }
  const fmt = n => '$'+Math.round(Number(n)||0).toLocaleString('es-MX');
  const badgeClass = e => e==='confirmado'?'badge-conf':e==='cancelado'?'badge-canc':'badge-pend';
  const thS = 'style="background:#f0f4f6;padding:8px 10px;text-align:left;font-size:0.75rem;font-weight:700;color:#666;white-space:nowrap;"';
  const tdS = 'style="padding:8px 10px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;"';
  const rows = list.map((r, i) => {
    const fecha = r.created_at ? r.created_at.substring(0,10) : '—';
    const shortId = (r.id||'').substring(0,8).toUpperCase();
    const estado = r.estado || 'pendiente';
    const emailRaw = r.email || '—';
    const email = emailRaw.length > 20 ? emailRaw.substring(0,20)+'…' : emailRaw;
    const btnConfirm = estado !== 'confirmado'
      ? `<button class="btn-res-ok" onclick="confirmarReservacion('${r.id}')">✅ Confirmar</button>` : '';
    const btnDel = `<button class="btn-res-del" onclick="eliminarReservacion('${r.id}')">🗑 Eliminar</button>`;
    const btnViajeros = `<button class="btn-res-ok" style="background:#0097A7;" onclick="event.stopPropagation();verViajeros('${r.id}','${(r.paquete_nombre||'').replace(/'/g,"\\'")}')">👥 Viajeros</button>`;
    const safeName = (r.nombre||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const safeEmail = (r.email||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const safeWa = (r.whatsapp||r.telefono||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const btnContrato = r.contrato_url
      ? `<a href="${r.contrato_url}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;background:#1A3A4A;color:#fff;border-radius:6px;font-size:0.78rem;font-weight:600;text-decoration:none;vertical-align:middle;">📄 Ver</a>`
      : `<button id="btn-contrato-${r.id}" class="btn-res-ok" style="background:#0d6b6b;" onclick="openContratoModal('${r.id}','${safeName}','${safeEmail}','${safeWa}')">📄 Contrato</button>`;
    const td = (extra,content) => `<td style="padding:8px 10px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;${extra||''}">${content}</td>`;
    return `<tr>
      ${td('text-align:center;font-weight:700;color:#aaa;font-size:0.78rem;', i+1)}
      ${td('',fecha)}
      ${td('font-family:monospace;font-weight:700;color:#0097A7;','#'+shortId)}
      ${td('',r.nombre||'—')}
      <td style="padding:8px 10px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;" title="${r.email||''}">${email}</td>
      ${td('',r.whatsapp||r.telefono||'—')}
      ${td('max-width:160px;overflow:hidden;text-overflow:ellipsis;',r.paquete_nombre||'—')}
      ${td('text-align:center;',r.personas||'—')}
      ${td('font-weight:700;',fmt(r.total))}
      ${td('','<span class="'+badgeClass(estado)+'">'+estado+'</span>')}
      ${td('',btnViajeros+' '+btnContrato+' '+btnConfirm+btnDel)}
    </tr>`;
  }).join('');
  c.innerHTML = `<div style="overflow-x:auto;width:100%;"><table style="width:100%;border-collapse:collapse;min-width:600px;">
    <thead><tr>
      <th ${thS}>#</th><th ${thS}>Fecha</th><th ${thS}>No. Reserva</th><th ${thS}>Nombre</th><th ${thS}>Email</th><th ${thS}>WhatsApp</th><th ${thS}>Paquete</th>
      <th ${thS}>Pers.</th><th ${thS}>Total</th><th ${thS}>Estado</th><th ${thS}>Acciones</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function toggleManualResForm() {
  const f = document.getElementById('manual-res-form');
  const opening = f.style.display === 'none';
  f.style.display = opening ? 'block' : 'none';
  if (opening) loadPkgsForResForm();
}

async function loadPkgsForResForm() {
  const { data } = await sb.from('paquetes').select('id,nombre,precio,monto_anticipo').eq('activo',true).order('created_at');
  const sel = document.getElementById('mrf-paquete');
  sel.innerHTML = '<option value="">— Selecciona paquete —</option>' +
    (data||[]).map(p => `<option value="${p.id}" data-anticipo="${p.monto_anticipo||0}" data-precio="${p.precio||0}">${p.nombre} — $${Math.round(Number(p.precio)||0).toLocaleString('es-MX')} MXN</option>`).join('');
}

function autofillAnticipo(sel) {
  const opt = sel.options[sel.selectedIndex];
  const anticipo = opt?.dataset?.anticipo || '';
  const precio = opt?.dataset?.precio || '';
  const tipoPago = document.getElementById('mrf-tipo-pago')?.value || 'anticipo';
  document.getElementById('mrf-anticipo').value = tipoPago === 'total' && precio ? precio : anticipo;
  const hint = document.getElementById('mrf-anticipo-hint');
  if (hint) hint.textContent = anticipo ? `El paquete tiene anticipo de $${Math.round(Number(anticipo)||0).toLocaleString('es-MX')} — puedes capturar el monto real pagado.` : '';
}

function onTipoPagoChange() {
  const paqueteSel = document.getElementById('mrf-paquete');
  const opt = paqueteSel.options[paqueteSel.selectedIndex];
  const tipoPago = document.getElementById('mrf-tipo-pago').value;
  const val = tipoPago === 'total' ? (opt?.dataset?.precio || '') : (opt?.dataset?.anticipo || '');
  if (val) document.getElementById('mrf-anticipo').value = val;
}

async function saveManualReservacion() {
  const nombre = document.getElementById('mrf-nombre').value.trim();
  const email = document.getElementById('mrf-email').value.trim();
  if (!nombre || !email) { alert('Nombre y email son obligatorios'); return; }
  const paqueteSel = document.getElementById('mrf-paquete');
  const paqueteId = paqueteSel.value || null;
  const paqueteNombre = paqueteId ? (paqueteSel.options[paqueteSel.selectedIndex]?.text?.split(' — ')[0] || '') : null;
  const personas = parseInt(document.getElementById('mrf-personas').value) || 1;
  const anticipo = parseFloat(document.getElementById('mrf-anticipo').value) || 0;
  const { error } = await sb.from('reservaciones').insert([{
    paquete_id: paqueteId ? String(paqueteId) : null,
    paquete_nombre: paqueteNombre,
    nombre,
    email,
    whatsapp: document.getElementById('mrf-wa').value.trim() || null,
    personas,
    metodo_pago: document.getElementById('mrf-metodo').value,
    total: anticipo,
    anticipo,
    fecha_inicio: null,
    fecha_fin: null,
    estado: document.getElementById('mrf-estado').value
  }]);
  if (error) { alert('Error al guardar: ' + error.message); return; }
  document.getElementById('manual-res-form').style.display = 'none';
  ['mrf-nombre','mrf-email','mrf-wa','mrf-anticipo','mrf-notas'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('mrf-paquete').value = '';
  document.getElementById('mrf-personas').value = '1';
  document.getElementById('mrf-tipo-pago').value = 'anticipo';
  document.getElementById('mrf-estado').value = 'pendiente';
  document.getElementById('mrf-anticipo-hint').textContent = '';
  loadReservaciones();
}

async function confirmarReservacion(id) {
  const { data: r, error: fetchErr } = await sb.from('reservaciones').select('*').eq('id', id).single();
  if (fetchErr || !r) { alert('Error al obtener la reservación'); return; }

  const { error } = await sb.from('reservaciones').update({ estado: 'confirmado' }).eq('id', id);
  if (error) { alert('Error al confirmar: ' + error.message); return; }

  fetch('/api/confirm-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservacion_id: r.id,
      nombre: r.nombre,
      email: r.email,
      whatsapp: r.whatsapp,
      paquete_nombre: r.paquete_nombre,
      personas: r.personas,
      metodo_pago: r.metodo_pago,
      total: r.total,
      anticipo: r.anticipo,
      fecha_inicio: r.fecha_inicio || '',
      fecha_fin: r.fecha_fin || '',
      bank_name: localStorage.getItem('bank_name') || '',
      bank_clabe: localStorage.getItem('bank_clabe') || '',
    }),
  }).catch(e => console.error('confirm-payment:', e));

  loadReservaciones();
}

async function eliminarReservacion(id) {
  if (!confirm('¿Eliminar esta reservación? Esta acción no se puede deshacer.')) return;
  await sb.from('reservaciones').delete().eq('id',id);
  loadReservaciones();
}

async function verViajeros(reservacionId, paqueteNombre) {
  const modal = document.getElementById('viajeros-modal');
  const body  = document.getElementById('viajeros-modal-body');
  const sub   = document.getElementById('viajeros-modal-sub');
  body.innerHTML = '<p style="color:#aaa;">Cargando...</p>';
  sub.textContent = paqueteNombre ? `Reserva: ${paqueteNombre}` : `Folio: ${reservacionId.substring(0,8).toUpperCase()}`;
  modal.classList.add('open');

  const { data, error } = await sb.from('viajeros').select('*').eq('reservacion_id', reservacionId);
  if (error || !data || !data.length) {
    body.innerHTML = '<p style="color:#aaa;">Sin viajeros registrados.</p>';
    return;
  }

  body.innerHTML = data.map((v, i) => {
    const nombre = [v.nombre, v.ap_paterno, v.ap_materno].filter(Boolean).join(' ') || '—';
    const filas = [
      ['Nombre',              nombre],
      ['Fecha de nacimiento', v.fecha_nacimiento || '—'],
      ['Nacionalidad',        v.nacionalidad     || '—'],
      ['Correo',              v.correo           || '—'],
      ['WhatsApp',            v.whatsapp         || '—'],
      ['Contacto emergencia', v.contacto_emergencia || '—'],
      v.alergias ? ['Alergias / restricciones', v.alergias] : null,
    ].filter(Boolean);

    const rows = filas.map(([label, val]) =>
      `<tr>
        <td style="padding:5px 10px 5px 0;color:#888;font-weight:600;white-space:nowrap;width:40%;">${label}</td>
        <td style="padding:5px 0;color:#222;">${val}</td>
      </tr>`
    ).join('');

    return `<div style="margin-bottom:18px;padding-bottom:18px;${i < data.length-1 ? 'border-bottom:1px solid #eee;' : ''}">
      <p style="font-weight:700;color:#0097A7;margin:0 0 8px;">Viajero ${i+1}${v.es_titular ? ' (titular)' : ''}</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">${rows}</table>
    </div>`;
  }).join('');
}

function renderAdmPkgs() {
  const c=document.getElementById('adm-pkgs');
  if (!adminPkgs.length) {c.innerHTML='<div style="color:#aaa;font-size:0.85rem;">No hay paquetes en Supabase aún.</div>';return;}
  c.innerHTML=adminPkgs.map(p=>{
    const lugares = p.lugares_totales != null ? ` · ${p.lugares_totales-(p.lugares_vendidos||0)} lugares disp.` : '';
    const fechas = p.fecha_fin ? ` · hasta ${p.fecha_fin}` : (p.fechas ? ` · ${p.fechas}` : '');
    return `<div class="item-row">
    <div class="item-info"><h4>${p.icono||''} ${p.nombre}</h4><p>${p.activo?'✅ Activo':'⏸ Inactivo'} · MXN $${Number(p.precio).toLocaleString()}${fechas}${lugares}</p></div>
    <div class="item-actions">
      <button class="edit-btn" onclick="editPkg('${p.id}')">Editar</button>
      <button class="del-btn" onclick="delPkg('${p.id}')">Eliminar</button>
    </div>
  </div>`;
  }).join('');
}

function renderAdmGallery(imgs) {
  const c=document.getElementById('adm-gallery');
  if (!imgs.length) {c.innerHTML='<div style="color:#aaa;font-size:0.82rem;grid-column:1/-1;">Sin imágenes.</div>';return;}
  c.innerHTML=imgs.map(img=>`<div class="gp-item"><img src="${img.url}" alt=""><button class="gp-del" onclick="delPhoto('${img.id}')">✕</button></div>`).join('');
}

function renderAdmBlog(posts) {
  const c=document.getElementById('adm-blog');
  if (!posts.length) {c.innerHTML='<div style="color:#aaa;font-size:0.85rem;">No hay posts.</div>';return;}
  c.innerHTML=posts.map(p=>`<div class="item-row">
    <div class="item-info"><h4>${p.titulo}</h4><p>${p.publicado?'✅ Publicado':'📝 Borrador'} · ${new Date(p.created_at).toLocaleDateString('es-MX')}</p></div>
    <div class="item-actions">
      <button class="edit-btn" onclick='editBlog(${JSON.stringify(p)})'>Editar</button>
      <button class="del-btn" onclick="delBlog('${p.id}')">Eliminar</button>
    </div>
  </div>`).join('');
}

// PKG CRUD
function showPkgForm(){document.getElementById('pkg-form').style.display='block';}
function hidePkgForm(){document.getElementById('pkg-form').style.display='none';clearPkgForm();}
function clearPkgForm(){['pf-id','pf-nombre','pf-precio','pf-fechas','pf-icono','pf-desc','pf-incluye','pf-nota','pf-badge','pf-lugares','pf-anticipo','pf-fecha-inicio','pf-fecha-fin','pf-foto-url'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('pf-tipo').value='primary';document.getElementById('pf-foto-preview').innerHTML='';}

function editPkg(id) {
  const p=adminPkgs.find(x=>String(x.id)==String(id));
  if (!p) return;
  document.getElementById('pf-id').value=id;
  document.getElementById('pf-nombre').value=p.nombre||'';
  document.getElementById('pf-precio').value=p.precio||'';
  document.getElementById('pf-fechas').value=p.fechas||'';
  document.getElementById('pf-icono').value=p.icono||'';
  document.getElementById('pf-desc').value=p.descripcion||'';
  document.getElementById('pf-incluye').value=Array.isArray(p.incluye)?p.incluye.join('\n'):(p.incluye||'');
  document.getElementById('pf-nota').value=p.nota||'';
  document.getElementById('pf-tipo').value=p.tipo||'primary';
  document.getElementById('pf-badge').value=p.badge||'';
  document.getElementById('pf-lugares').value=p.lugares_totales!=null?p.lugares_totales:'';
  document.getElementById('pf-anticipo').value=p.monto_anticipo||3000;
  document.getElementById('pf-fecha-inicio').value=p.fecha_inicio||'';
  document.getElementById('pf-fecha-fin').value=p.fecha_fin||'';
  document.getElementById('pf-foto-url').value=p.foto_url||'';
  document.getElementById('pf-foto-preview').innerHTML=p.foto_url?`<img src="${p.foto_url}" style="max-height:120px;border-radius:8px;margin-top:8px;object-fit:cover;">`:''
  document.getElementById('pkg-form').style.display='block';
  document.getElementById('pkg-form').scrollIntoView({behavior:'smooth'});
}

async function savePkg() {
  const id=document.getElementById('pf-id').value;
  const inc=document.getElementById('pf-incluye').value.split('\n').map(i=>i.trim()).filter(i=>i);
  const lugaresVal = document.getElementById('pf-lugares').value.trim();
  const fechaFin = document.getElementById('pf-fecha-fin').value || null;
  const today = new Date().toISOString().split('T')[0];
  const d={
    nombre:document.getElementById('pf-nombre').value,
    precio:parseInt(document.getElementById('pf-precio').value)||0,
    fechas:document.getElementById('pf-fechas').value,
    icono:document.getElementById('pf-icono').value||'✈️',
    descripcion:document.getElementById('pf-desc').value,
    incluye:inc,
    nota:document.getElementById('pf-nota').value,
    tipo:document.getElementById('pf-tipo').value,
    badge:document.getElementById('pf-badge').value||null,
    lugares_totales:lugaresVal?parseInt(lugaresVal):null,
    fecha_inicio:document.getElementById('pf-fecha-inicio').value||null,
    fecha_fin:fechaFin,
    activo: fechaFin ? fechaFin >= today : true,
    foto_url: document.getElementById('pf-foto-url').value.trim() || null,
    monto_anticipo: parseInt(document.getElementById('pf-anticipo').value)||3000
  };
  const isDefault = !id || id.startsWith('d');
  let error;
  if (id && !isDefault) {
    ({error} = await sb.from('paquetes').update(d).eq('id',id));
  } else {
    ({error} = await sb.from('paquetes').insert([d]));
  }
  if (error) {alert('Error: '+error.message);return;}
  const el=document.getElementById('pkg-saved');el.style.display='block';setTimeout(()=>el.style.display='none',2500);
  hidePkgForm();await loadPkgs();await loadAdminPkgs();
}

async function delPkg(id) {
  if (!confirm('¿Eliminar este paquete?'))return;
  const {error} = await sb.from('paquetes').delete().eq('id',id).select();
  if (error) {alert('Error al eliminar: '+error.message);return;}
  await loadPkgs();await loadAdminPkgs();
}

async function uploadPkgPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  const path = `paquetes/${Date.now()}.${ext}`;
  const {error} = await sb.storage.from('galeria').upload(path, file, {upsert: true});
  if (error) { alert('Error al subir foto: ' + error.message); return; }
  const {data: {publicUrl}} = sb.storage.from('galeria').getPublicUrl(path);
  document.getElementById('pf-foto-url').value = publicUrl;
  document.getElementById('pf-foto-preview').innerHTML = `<img src="${publicUrl}" style="max-height:120px;border-radius:8px;margin-top:8px;object-fit:cover;">`;
}

// GALLERY
async function uploadPhotos(input) {
  const files = Array.from(input.files);
  for (const file of files) {
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await sb.storage.from('galeria').upload(path, file, { contentType: file.type });
    if (upErr) { alert('Error al subir imagen: ' + upErr.message); continue; }
    const { data: { publicUrl } } = sb.storage.from('galeria').getPublicUrl(path);
    await sb.from('galeria').insert([{ url: publicUrl, descripcion: file.name, orden: 0 }]);
    await loadGallery();
    const { data } = await sb.from('galeria').select('*').order('orden').order('created_at');
    renderAdmGallery(data || []);
  }
  input.value = '';
}
async function delPhoto(id) {
  if (!confirm('¿Eliminar esta foto?')) return;
  const { data: row } = await sb.from('galeria').select('url').eq('id', id).single();
  if (row?.url) {
    const filename = row.url.split('/').pop();
    await sb.storage.from('galeria').remove([filename]);
  }
  const { error } = await sb.from('galeria').delete().eq('id', id);
  if (error) { alert('Error al eliminar: ' + error.message); return; }
  const { data } = await sb.from('galeria').select('*').order('orden').order('created_at');
  renderAdmGallery(data || []);
  loadGallery();
}

// BLOG UPLOAD
async function uploadBlogImage(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  const path = `blog/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('galeria').upload(path, file, { contentType: file.type });
  if (error) { alert('Error al subir imagen: ' + error.message); return; }
  const { data } = sb.storage.from('galeria').getPublicUrl(path);
  document.getElementById('bf-imagen').value = data.publicUrl;
  document.getElementById('bf-imagen-name').textContent = file.name;
  document.getElementById('bf-imagen-preview').src = data.publicUrl;
  document.getElementById('bf-imagen-preview').style.display = 'block';
}

// BLOG CRUD
function clearBlog(){['bf-id','bf-titulo','bf-contenido','bf-meta','bf-slug','bf-imagen'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('bf-pub').value='false';document.getElementById('bf-imagen-name').textContent='';document.getElementById('bf-imagen-preview').style.display='none';document.getElementById('bf-imagen-preview').src='';}
function editBlog(p){
  document.getElementById('bf-id').value=p.id;
  document.getElementById('bf-titulo').value=p.titulo||'';
  document.getElementById('bf-contenido').value=p.contenido||'';
  document.getElementById('bf-meta').value=p.meta_descripcion||'';
  document.getElementById('bf-slug').value=p.slug||'';
  document.getElementById('bf-pub').value=p.publicado?'true':'false';
  document.getElementById('bf-titulo').scrollIntoView({behavior:'smooth'});
}
async function saveBlog() {
  const id=document.getElementById('bf-id').value;
  const titulo=document.getElementById('bf-titulo').value;
  if (!titulo){alert('El título es obligatorio');return;}
  const slug=document.getElementById('bf-slug').value||titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const d={titulo,contenido:document.getElementById('bf-contenido').value,meta_descripcion:document.getElementById('bf-meta').value,slug,publicado:document.getElementById('bf-pub').value==='true',imagen:document.getElementById('bf-imagen').value||null};
  const {error}=id?await sb.from('blog').update(d).eq('id',id):await sb.from('blog').insert([d]);
  if (error){alert('Error: '+error.message);return;}
  const el=document.getElementById('blog-saved');el.style.display='block';setTimeout(()=>el.style.display='none',2500);
  clearBlog();await loadBlog();
  const {data}=await sb.from('blog').select('*').order('created_at',{ascending:false});
  renderAdmBlog(data||[]);
}
async function delBlog(id){
  if (!confirm('¿Eliminar?'))return;
  await sb.from('blog').delete().eq('id',id);
  await loadBlog();
  const {data}=await sb.from('blog').select('*').order('created_at',{ascending:false});
  renderAdmBlog(data||[]);
}

// AI
async function aiSEO(){
  const titulo=document.getElementById('bf-titulo').value;
  const contenido=document.getElementById('bf-contenido').value;
  if (!titulo&&!contenido){alert('Escribe el título primero');return;}
  if (!oaiKey){alert('Configura tu OpenAI API Key en Configuración');return;}
  const btn=document.getElementById('ai-seo-btn');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  try{
    const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+oaiKey},body:JSON.stringify({model:'gpt-3.5-turbo',messages:[{role:'user',content:`Para el blog de "Zipolite al Desnudo" (agencia LGBT+ México), genera:
1. Meta descripción SEO máx 160 chars
2. Slug URL
Título: "${titulo}"
Responde SOLO JSON: {"meta":"...","slug":"..."}`}]})});
    const data=await res.json();
    const r=JSON.parse((data.choices?.[0]?.message?.content||'{}').replace(/```json|```/g,'').trim());
    if(r.meta)document.getElementById('bf-meta').value=r.meta;
    if(r.slug)document.getElementById('bf-slug').value=r.slug;
  }catch(e){
    const slug=titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    document.getElementById('bf-slug').value=slug;
    document.getElementById('bf-meta').value=`${titulo} - Zipolite al Desnudo, viajes LGBT+ México`.substring(0,160);
  }
  btn.disabled=false;btn.innerHTML='🤖 Auto SEO';
}

async function aiNota(){
  const nombre=document.getElementById('pf-nombre').value;
  if (!nombre){alert('Escribe el nombre del paquete primero');return;}
  if (!oaiKey){alert('Configura tu OpenAI API Key en Configuración');return;}
  const btn=document.getElementById('ai-nota-btn');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  try{
    const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+oaiKey},body:JSON.stringify({model:'gpt-3.5-turbo',messages:[{role:'user',content:`Nota persuasiva máx 80 chars con emoji para el paquete "${nombre}" de agencia LGBT+ a Zipolite. Solo el texto.`}]})});
    const data=await res.json();
    const nota=data.choices?.[0]?.message?.content||'';
    if(nota)document.getElementById('pf-nota').value=nota.trim();
  }catch(e){document.getElementById('pf-nota').value='🌈 ¡El paquete perfecto para vivir Zipolite!';}
  btn.disabled=false;btn.innerHTML='🤖 Generar con IA';
}

async function loadConfig() {
  const { data } = await sb.from('configuracion').select('*').limit(1).single();
  if (data) {
    if (data.openai_api_key) { oaiKey = data.openai_api_key; document.getElementById('cfg-openai').value = data.openai_api_key; localStorage.setItem('oai_key', data.openai_api_key); }
    if (data.whatsapp_agencia) { document.getElementById('cfg-wa').value = data.whatsapp_agencia; localStorage.setItem('cfg_wa', data.whatsapp_agencia); }
    if (data.banco) { document.getElementById('cfg-banco').value = data.banco; localStorage.setItem('bank_name', data.banco); }
    if (data.clabe_interbancaria) { document.getElementById('cfg-clabe').value = data.clabe_interbancaria; localStorage.setItem('bank_clabe', data.clabe_interbancaria); }
  } else {
    const savedKey = localStorage.getItem('oai_key'); if (savedKey) document.getElementById('cfg-openai').value = savedKey;
    const savedWa = localStorage.getItem('cfg_wa'); if (savedWa) document.getElementById('cfg-wa').value = savedWa;
    const savedBanco = localStorage.getItem('bank_name'); if (savedBanco) document.getElementById('cfg-banco').value = savedBanco;
    const savedClabe = localStorage.getItem('bank_clabe'); if (savedClabe) document.getElementById('cfg-clabe').value = savedClabe;
  }
}

async function saveCfg() {
  const key = document.getElementById('cfg-openai').value.trim();
  const wa = document.getElementById('cfg-wa').value.trim();
  const banco = document.getElementById('cfg-banco').value.trim();
  const clabe = document.getElementById('cfg-clabe').value.trim();
  if (key) { oaiKey = key; localStorage.setItem('oai_key', key); }
  if (wa) localStorage.setItem('cfg_wa', wa);
  if (banco) localStorage.setItem('bank_name', banco);
  if (clabe) localStorage.setItem('bank_clabe', clabe);
  const { error } = await sb.from('configuracion').upsert({
    id: 1,
    openai_api_key: key || null,
    whatsapp_agencia: wa || null,
    banco: banco || null,
    clabe_interbancaria: clabe || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) { alert('Error al guardar en Supabase: ' + error.message); return; }
const el = document.getElementById('cfg-saved'); el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2500);
}

// ---- ADMIN: COTIZACIONES ----

async function loadCotizaciones() {
  const container = document.getElementById('adm-cotizaciones');
  container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;"><span class="spin"></span> Cargando...</div>';
  const { data, error } = await sb.from('cotizaciones').select('*').order('created_at', { ascending: false });
  if (error) { container.innerHTML = '<p style="color:red;font-size:0.85rem;">Error: ' + error.message + '</p>'; return; }
  if (!data || data.length === 0) { container.innerHTML = '<p style="color:#aaa;font-size:0.85rem;">Sin cotizaciones aún.</p>'; return; }

  const badgeEl = document.getElementById('badge-cotizaciones');
  const pendientes = data.filter(c => c.estado === 'pendiente').length;
  if (pendientes > 0) { badgeEl.textContent = pendientes; badgeEl.style.display = 'inline-flex'; }
  else { badgeEl.style.display = 'none'; }

  const estadoBadge = e => {
    if (e === 'pendiente') return '<span class="badge-pend">pendiente</span>';
    if (e === 'en proceso') return '<span class="badge-proceso">en proceso</span>';
    return '<span class="badge-enviada">enviada</span>';
  };
  const nextEstado = e => e === 'pendiente' ? 'en proceso' : e === 'en proceso' ? 'enviada' : 'pendiente';
  const nextLabel = e => e === 'pendiente' ? '→ En proceso' : e === 'en proceso' ? '→ Enviada' : '↺ Pendiente';

  const rows = data.map(c => `
    <tr>
      <td>${new Date(c.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'})}</td>
      <td><strong>${c.nombre}</strong><br><span style="color:#888;font-size:0.78rem;">${c.email}</span></td>
      <td>${c.destino}</td>
      <td style="white-space:nowrap;">${c.fecha_salida} → ${c.fecha_regreso}</td>
      <td style="text-align:center;">${c.num_viajeros}</td>
      <td>${c.presupuesto || '—'}</td>
      <td><a href="https://wa.me/${c.whatsapp.replace(/\D/g,'')}" target="_blank" style="color:#1a9fa0;font-weight:600;">${c.whatsapp}</a></td>
      <td>${estadoBadge(c.estado)}</td>
      <td style="white-space:nowrap;"><button class="btn-cot-estado" onclick="updateEstadoCot('${c.id}','${nextEstado(c.estado)}')">${nextLabel(c.estado)}</button> <button class="btn-res-del" onclick="deleteCotizacion('${c.id}')">🗑️</button></td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="res-table-wrap">
      <table class="res-table">
        <thead><tr>
          <th>Fecha</th><th>Nombre</th><th>Destino</th><th>Fechas viaje</th>
          <th>Viajeros</th><th>Presupuesto</th><th>WhatsApp</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function updateEstadoCot(id, nuevoEstado) {
  const { error } = await sb.from('cotizaciones').update({ estado: nuevoEstado }).eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  loadCotizaciones();
}

async function deleteCotizacion(id) {
  if (!confirm('¿Eliminar esta cotización?')) return;
  const { error } = await sb.from('cotizaciones').delete().eq('id', id);
  if (error) { alert('Error al eliminar: ' + error.message); return; }
  loadCotizaciones();
}

/*
  SQL para crear la tabla egresos en Supabase (ejecutar en SQL Editor):

  CREATE TABLE IF NOT EXISTS public.egresos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reservacion_id UUID NOT NULL UNIQUE,
    vuelo NUMERIC DEFAULT 0,
    hotel NUMERIC DEFAULT 0,
    traslados NUMERIC DEFAULT 0,
    experiencias NUMERIC DEFAULT 0,
    otros NUMERIC DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ALTER TABLE public.egresos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON public.egresos FOR ALL USING (true);
*/

// ---- ADMIN: FINANZAS ----

async function loadFinanzas() {
  const mesEl = document.getElementById('fin-mes');
  if (!mesEl) return;
  if (!mesEl.value) {
    const now = new Date();
    mesEl.value = now.toISOString().slice(0, 7);
  }
  const [year, month] = mesEl.value.split('-').map(Number);
  const desde = `${year}-${String(month).padStart(2,'0')}-01`;
  const hasta = new Date(year, month, 1).toISOString().split('T')[0];

  const tablaEl = document.getElementById('fin-tabla');
  tablaEl.innerHTML = '<div style="color:#aaa;font-size:0.85rem;"><span class="spin"></span> Cargando...</div>';

  const { data: reservas, error } = await sb.from('reservaciones')
    .select('id,nombre,paquete_nombre,total')
    .eq('estado', 'confirmado')
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .order('created_at', { ascending: false });

  if (error) { tablaEl.innerHTML = `<p style="color:red;font-size:0.85rem;">Error: ${error.message}</p>`; return; }

  const ids = (reservas || []).map(r => r.id);
  let egresosMap = {};
  if (ids.length) {
    const { data: eg } = await sb.from('egresos').select('*').in('reservacion_id', ids);
    (eg || []).forEach(e => { egresosMap[e.reservacion_id] = e; });
  }

  _renderFinanzas(reservas || [], egresosMap);
}

function _renderFinanzas(reservas, egresosMap) {
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

  let sumIng = 0, sumEg = 0;
  reservas.forEach(r => {
    const e = egresosMap[r.id] || {};
    sumIng += Number(r.total) || 0;
    sumEg += (Number(e.vuelo)||0)+(Number(e.hotel)||0)+(Number(e.traslados)||0)+(Number(e.experiencias)||0)+(Number(e.otros)||0);
  });
  const util = sumIng - sumEg;
  const margen = sumIng > 0 ? (util / sumIng * 100).toFixed(1) : 0;

  document.getElementById('fin-v-ingresos').textContent = fmt(sumIng);
  document.getElementById('fin-v-egresos').textContent  = fmt(sumEg);
  const uEl = document.getElementById('fin-v-utilidad');
  uEl.textContent = fmt(util); uEl.style.color = util >= 0 ? '#43a047' : '#e53935';
  document.getElementById('fin-v-margen').textContent = margen + '%';

  const tablaEl = document.getElementById('fin-tabla');
  if (!reservas.length) {
    tablaEl.innerHTML = '<p style="color:#aaa;font-size:0.85rem;">Sin reservas confirmadas en este período.</p>';
    return;
  }

  const thS = 'style="background:#f0f4f6;padding:8px 10px;text-align:left;font-size:0.72rem;font-weight:700;color:#888;white-space:nowrap;"';
  const tdS = 'padding:8px 6px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;';

  const rows = reservas.map(r => {
    const e = egresosMap[r.id] || {};
    const vuelo        = Number(e.vuelo)        || 0;
    const hotel        = Number(e.hotel)        || 0;
    const traslados    = Number(e.traslados)    || 0;
    const experiencias = Number(e.experiencias) || 0;
    const otros        = Number(e.otros)        || 0;
    const egTotal = vuelo + hotel + traslados + experiencias + otros;
    const ingreso = Number(r.total) || 0;
    const rowUtil = ingreso - egTotal;
    const rowMrgn = ingreso > 0 ? (rowUtil / ingreso * 100).toFixed(1) : '—';
    const uColor = rowUtil >= 0 ? '#43a047' : '#e53935';
    const shortId = r.id.substring(0, 8).toUpperCase();

    const inp = (field, val) =>
      `<input class="fin-egr-inp" type="number" min="0" step="1"
        data-rid="${r.id}" data-field="${field}" value="${val}"
        oninput="recalcFinRow('${r.id}')">`;

    return `<tr id="fin-row-${r.id}" data-ingreso="${ingreso}">
      <td style="${tdS}font-family:monospace;color:#0097A7;">#${shortId}</td>
      <td style="${tdS}">${r.nombre || '—'}</td>
      <td style="${tdS}max-width:130px;overflow:hidden;text-overflow:ellipsis;">${r.paquete_nombre || '—'}</td>
      <td style="${tdS}font-weight:700;">${fmt(ingreso)}</td>
      <td style="${tdS}padding-left:4px;padding-right:4px;">${inp('vuelo', vuelo)}</td>
      <td style="${tdS}padding-left:4px;padding-right:4px;">${inp('hotel', hotel)}</td>
      <td style="${tdS}padding-left:4px;padding-right:4px;">${inp('traslados', traslados)}</td>
      <td style="${tdS}padding-left:4px;padding-right:4px;">${inp('experiencias', experiencias)}</td>
      <td style="${tdS}padding-left:4px;padding-right:4px;">${inp('otros', otros)}</td>
      <td style="${tdS}font-weight:700;" id="fin-egtot-${r.id}">${fmt(egTotal)}</td>
      <td style="${tdS}font-weight:700;color:${uColor};" id="fin-util-${r.id}">${fmt(rowUtil)}</td>
      <td style="${tdS}color:${uColor};" id="fin-mrgn-${r.id}">${rowMrgn === '—' ? '—' : rowMrgn + '%'}</td>
      <td style="${tdS}">
        <button class="save-btn" style="margin:0;padding:5px 11px;font-size:0.78rem;" onclick="guardarEgreso('${r.id}')">💾 Guardar</button>
      </td>
      <td style="${tdS}">
        <button class="btn-res-del" style="padding:5px 9px;" onclick="eliminarEgreso('${r.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  tablaEl.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:980px;">
        <thead><tr>
          <th ${thS}>No. Reserva</th><th ${thS}>Cliente</th><th ${thS}>Paquete</th>
          <th ${thS}>Ingreso</th><th ${thS}>Vuelo</th><th ${thS}>Hotel</th>
          <th ${thS}>Traslados</th><th ${thS}>Experiencias</th><th ${thS}>Otros</th>
          <th ${thS}>Total Egresos</th><th ${thS}>Utilidad</th><th ${thS}>Margen %</th>
          <th ${thS}></th><th ${thS}></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function recalcFinRow(rid) {
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  let egTotal = 0;
  document.querySelectorAll(`.fin-egr-inp[data-rid="${rid}"]`).forEach(inp => {
    egTotal += Number(inp.value) || 0;
  });

  const row = document.getElementById(`fin-row-${rid}`);
  const ingreso = Number(row?.dataset?.ingreso) || 0;
  const util = ingreso - egTotal;
  const mrgn = ingreso > 0 ? (util / ingreso * 100).toFixed(1) : '—';
  const uColor = util >= 0 ? '#43a047' : '#e53935';

  document.getElementById(`fin-egtot-${rid}`).textContent = fmt(egTotal);
  const uEl = document.getElementById(`fin-util-${rid}`);
  uEl.textContent = fmt(util); uEl.style.color = uColor;
  const mEl = document.getElementById(`fin-mrgn-${rid}`);
  mEl.textContent = mrgn === '—' ? '—' : mrgn + '%'; mEl.style.color = uColor;

  _updateFinMetrics();
}

function _updateFinMetrics() {
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  let sumIng = 0, sumEg = 0;
  document.querySelectorAll('#fin-tabla tbody tr[data-ingreso]').forEach(row => {
    const rid = row.id.replace('fin-row-', '');
    sumIng += Number(row.dataset.ingreso) || 0;
    const egtEl = document.getElementById(`fin-egtot-${rid}`);
    sumEg += Number((egtEl?.textContent || '').replace(/[$,.]/g, '').replace(/\s/g, '')) || 0;
  });
  const util = sumIng - sumEg;
  const margen = sumIng > 0 ? (util / sumIng * 100).toFixed(1) : 0;
  document.getElementById('fin-v-ingresos').textContent = fmt(sumIng);
  document.getElementById('fin-v-egresos').textContent  = fmt(sumEg);
  const uEl = document.getElementById('fin-v-utilidad');
  uEl.textContent = fmt(util); uEl.style.color = util >= 0 ? '#43a047' : '#e53935';
  document.getElementById('fin-v-margen').textContent = margen + '%';
}

async function guardarEgreso(rid) {
  const payload = { reservacion_id: rid, updated_at: new Date().toISOString() };
  document.querySelectorAll(`.fin-egr-inp[data-rid="${rid}"]`).forEach(inp => {
    payload[inp.dataset.field] = Number(inp.value) || 0;
  });

  const { error } = await sb.from('egresos').upsert(payload, { onConflict: 'reservacion_id' });
  if (error) { alert('Error al guardar: ' + error.message); return; }

  const btn = document.querySelector(`#fin-row-${rid} .save-btn`);
  if (btn) { btn.textContent = '✅ Guardado'; setTimeout(() => btn.textContent = '💾 Guardar', 1800); }
}

async function eliminarEgreso(rid) {
  if (!confirm('¿Eliminar los egresos de esta reserva? Los datos capturados se perderán.')) return;
  const { error } = await sb.from('egresos').delete().eq('reservacion_id', rid);
  if (error) { alert('Error al eliminar: ' + error.message); return; }
  document.querySelectorAll(`.fin-egr-inp[data-rid="${rid}"]`).forEach(inp => { inp.value = 0; });
  recalcFinRow(rid);
}

// ---- CONTRATO ----

function openContratoModal(resId, nombre, email, whatsapp) {
  document.getElementById('cm-res-id').value = resId;
  document.getElementById('cm-nombre').value = nombre || '';
  document.getElementById('cm-ap-paterno').value = '';
  document.getElementById('cm-ap-materno').value = '';
  document.getElementById('cm-fecha-nac').value = '';
  document.getElementById('cm-nacionalidad').value = 'Mexicana';
  document.getElementById('cm-correo').value = email || '';
  document.getElementById('cm-whatsapp').value = whatsapp || '';
  document.getElementById('cm-emergencia').value = '';
  document.getElementById('cm-alergias').value = '';
  document.getElementById('contrato-modal-sub').textContent = 'Folio: ' + resId.substring(0, 8).toUpperCase();
  const btn = document.getElementById('btn-generar-contrato');
  btn.innerHTML = '📄 Generar contrato';
  btn.disabled = false;
  document.getElementById('contrato-modal').classList.add('open');
}

function closeContratoModal() {
  document.getElementById('contrato-modal').classList.remove('open');
}

async function generarContrato() {
  const resId = document.getElementById('cm-res-id').value;
  const nombre = document.getElementById('cm-nombre').value.trim();
  const apPaterno = document.getElementById('cm-ap-paterno').value.trim();
  const apMaterno = document.getElementById('cm-ap-materno').value.trim();
  const fechaNac = document.getElementById('cm-fecha-nac').value;
  const nacionalidad = document.getElementById('cm-nacionalidad').value.trim() || 'Mexicana';
  const correo = document.getElementById('cm-correo').value.trim();
  const whatsapp = document.getElementById('cm-whatsapp').value.trim();
  const emergencia = document.getElementById('cm-emergencia').value.trim();
  const alergias = document.getElementById('cm-alergias').value.trim();

  if (!apPaterno || !apMaterno || !fechaNac) {
    alert('Apellido paterno, materno y fecha de nacimiento son obligatorios.');
    return;
  }

  const btn = document.getElementById('btn-generar-contrato');
  btn.innerHTML = '<span class="spin"></span> Generando...';
  btn.disabled = true;

  await sb.from('viajeros').delete().eq('reservacion_id', resId).eq('es_titular', true);
  const { error: vErr } = await sb.from('viajeros').insert([{
    reservacion_id: resId,
    nombre,
    ap_paterno: apPaterno,
    ap_materno: apMaterno,
    fecha_nacimiento: fechaNac,
    nacionalidad,
    correo,
    whatsapp,
    contacto_emergencia: emergencia || null,
    alergias: alergias || null,
    es_titular: true
  }]);

  if (vErr) {
    btn.innerHTML = '📄 Generar contrato';
    btn.disabled = false;
    alert('Error al guardar viajero: ' + vErr.message);
    return;
  }

  const res = await fetch('/api/generate-contract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservacion_id: resId })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    btn.innerHTML = '📄 Generar contrato';
    btn.disabled = false;
    alert('Error al generar contrato: ' + (data.error || res.statusText));
    return;
  }

  const contratoUrl = data.contrato_url || data.url;
  const btnRow = document.getElementById('btn-contrato-' + resId);
  if (btnRow && contratoUrl) {
    btnRow.outerHTML = `<a href="${contratoUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;background:#1A3A4A;color:#fff;border-radius:6px;font-size:0.78rem;font-weight:600;text-decoration:none;vertical-align:middle;">📄 Ver</a>`;
  }

  closeContratoModal();
  showToast('✅ Contrato generado');
}

function showToast(msg) {
  let t = document.getElementById('admin-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'admin-toast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#0d9488;color:#fff;padding:12px 26px;border-radius:12px;font-weight:700;font-size:0.95rem;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,0.18);transition:opacity 0.4s;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}
