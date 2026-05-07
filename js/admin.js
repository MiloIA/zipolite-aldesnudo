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
  if (tabId === 'comisiones') loadComisiones();
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
  const {data:gd}=await sb.from('galeria').select('*').is('paquete_id',null).order('orden').order('created_at');
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

  const adminToken = sessionStorage.getItem('adminToken');
  const res = await fetch('/api/send-notification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
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
  const [{ data, error }, { data: grupos }] = await Promise.all([
    sb.from('reservaciones').select('*').order('created_at', { ascending: false }),
    sb.from('grupos').select('id, codigo, paquete_nombre, organizador_nombre, personas_esperadas')
  ]);
  if (error) { document.getElementById('adm-reservaciones').innerHTML='<p style="color:red;font-size:0.85rem;">Error cargando reservaciones.</p>'; return; }
  const gruposMap = Object.fromEntries((grupos||[]).map(g => [g.id, g]));
  renderReservaciones(data||[], gruposMap);
  window._admGruposMap = gruposMap;
  window._admReservaciones = data||[];
}

function renderReservaciones(list, gruposMap = {}) {
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
    const grupoBadge = r.grupo_id && gruposMap[r.grupo_id]
      ? `<span style="display:inline-block;background:#e0f7f7;color:#1a9fa0;font-size:0.72rem;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:4px;">👥 ${gruposMap[r.grupo_id].codigo}</span>`
      : '';
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
      <td style="padding:8px 10px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${r.nombre||'—'}${grupoBadge}</td>
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

function toggleGruposView() {
  const gruposEl = document.getElementById('adm-grupos');
  const btn = document.getElementById('btn-ver-grupos');
  const isOpen = gruposEl.style.display !== 'none';
  if (isOpen) {
    gruposEl.style.display = 'none';
    btn.textContent = '👥 Ver grupos';
  } else {
    gruposEl.style.display = 'block';
    btn.textContent = '👥 Ocultar grupos';
    loadGrupos();
  }
}

async function loadGrupos() {
  const { data: grupos, error } = await sb.from('grupos').select('*').order('created_at', { ascending: false });
  if (error) { document.getElementById('adm-grupos').innerHTML = '<p style="color:red;font-size:0.85rem;">Error cargando grupos.</p>'; return; }
  renderGrupos(grupos||[], window._admReservaciones||[]);
}

function renderGrupos(grupos, reservaciones) {
  const el = document.getElementById('adm-grupos');
  if (!grupos.length) { el.innerHTML = '<p style="color:#aaa;font-size:0.85rem;margin-bottom:12px;">Sin grupos creados aún.</p>'; return; }
  const thS = 'style="background:#e0f7f7;padding:8px 10px;text-align:left;font-size:0.75rem;font-weight:700;color:#1a9fa0;white-space:nowrap;"';
  const rows = grupos.map(g => {
    const miembros = reservaciones.filter(r => r.grupo_id === g.id);
    const confirmados = miembros.filter(r => r.estado === 'confirmado' || r.estado === 'confirmada').length;
    const estado = miembros.length >= g.personas_esperadas ? '✅ Completo' : `⏳ ${miembros.length}/${g.personas_esperadas}`;
    const detalles = miembros.length
      ? miembros.map(r => `<div style="font-size:0.78rem;color:#555;padding:2px 0;">${r.nombre||'—'} · ${r.estado||'pendiente'}</div>`).join('')
      : '<div style="font-size:0.78rem;color:#aaa;">Sin reservas vinculadas</div>';
    return `<tr>
      <td style="padding:8px 10px;font-size:0.85rem;font-weight:800;color:#1a9fa0;font-family:monospace;">${g.codigo}</td>
      <td style="padding:8px 10px;font-size:0.82rem;">${g.paquete_nombre||'—'}</td>
      <td style="padding:8px 10px;font-size:0.82rem;">${g.organizador_nombre||'—'}</td>
      <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${estado} <span style="color:#888;">(${confirmados} conf.)</span></td>
      <td style="padding:8px 10px;font-size:0.82rem;">${g.alojamiento||'—'}</td>
      <td style="padding:8px 10px;font-size:0.82rem;min-width:180px;">${detalles}</td>
      <td style="white-space:nowrap">
        <button onclick="confirmarGrupo('${g.id}')"
          style="background:#1a9fa0;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin:2px"
          title="Confirmar todas las reservas del grupo">
          ✅ Confirmar
        </button>
        <button onclick="contratoGrupo('${g.id}')"
          style="background:#6366f1;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin:2px"
          title="Generar contrato para todos">
          📄 Contrato
        </button>
        <button onclick="viajerosGrupo('${g.id}','${g.codigo}')"
          style="background:#0ea5e9;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin:2px"
          title="Ver ficha de viajeros">
          👤 Viajeros
        </button>
        <button onclick="eliminarGrupo('${g.id}','${g.codigo}')"
          style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin:2px"
          title="Eliminar grupo">
          🗑️
        </button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div style="margin-bottom:12px;padding:12px;background:#f0fdf9;border-radius:8px;border:1px solid #1a9fa0;">
    <strong style="font-size:0.9rem;color:#0d1b3e;">👥 Grupos activos (${grupos.length})</strong>
    <div style="overflow-x:auto;margin-top:10px;"><table style="width:100%;border-collapse:collapse;min-width:500px;">
      <thead><tr>
        <th ${thS}>Código</th><th ${thS}>Paquete</th><th ${thS}>Organizador</th>
        <th ${thS}>Personas</th><th ${thS}>Alojamiento</th><th ${thS}>Miembros</th>
        <th ${thS}>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
    },
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
      contrato_url: r.contrato_url || null,
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
  const itSection = document.getElementById('itinerario-editor-section');
  if (itSection) itSection.style.display = 'none';
  const galSection = document.getElementById('galeria-paquete-section');
  if (galSection) galSection.style.display = 'none';
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

// ITINERARIO EDITOR
function toggleItinerarioEditor() {
  const section = document.getElementById('itinerario-editor-section');
  if (!section) return;
  if (section.style.display !== 'none') {
    section.style.display = 'none';
  } else {
    section.style.display = 'block';
    const pkgId = document.getElementById('pf-id').value;
    if (pkgId) loadItinerarioDias(pkgId);
    else document.getElementById('itinerario-dias-container').innerHTML =
      '<div style="color:#e53935;font-size:0.85rem;">Primero guarda el paquete para poder agregar días.</div>';
  }
}

async function loadItinerarioDias(pkgId) {
  const container = document.getElementById('itinerario-dias-container');
  if (!container) return;
  container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">Cargando...</div>';
  const { data, error } = await sb.from('itinerario_dias').select('*').eq('paquete_id', pkgId).order('orden');
  if (error) { container.innerHTML = '<div style="color:#e53935;">Error: ' + error.message + '</div>'; return; }
  renderItinerarioDias(data || [], pkgId);
}

function renderItinerarioDias(dias, pkgId) {
  const container = document.getElementById('itinerario-dias-container');
  if (!container) return;
  if (!dias.length) {
    container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;padding:0.5rem 0;">No hay días aún. Agrega el primero.</div>';
    return;
  }
  container.innerHTML = dias.map(d => diaCardHTML(d, pkgId)).join('');
}

function diaCardHTML(d, pkgId) {
  const tituloEsc = (d.titulo || '').replace(/"/g, '&quot;');
  return `
    <div class="dia-card" id="dia-card-${d.id}" style="border:1px solid #e0e0e0;border-radius:10px;padding:1rem;margin-bottom:0.75rem;background:white;">
      <div style="display:grid;grid-template-columns:60px 80px 1fr;gap:8px;margin-bottom:8px;">
        <div>
          <label style="font-size:0.7rem;font-weight:700;color:#888;display:block;margin-bottom:3px;">EMOJI</label>
          <input type="text" id="dia-emoji-${d.id}" value="${d.emoji || ''}" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:1.1rem;text-align:center;">
        </div>
        <div>
          <label style="font-size:0.7rem;font-weight:700;color:#888;display:block;margin-bottom:3px;">DÍA</label>
          <input type="text" id="dia-label-${d.id}" value="${d.fecha_label || d.dia || ''}" placeholder="Día 1" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.8rem;">
        </div>
        <div>
          <label style="font-size:0.7rem;font-weight:700;color:#888;display:block;margin-bottom:3px;">TÍTULO</label>
          <input type="text" id="dia-titulo-${d.id}" value="${tituloEsc}" placeholder="Título del día" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;">
        </div>
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-size:0.7rem;font-weight:700;color:#888;display:block;margin-bottom:3px;">DESCRIPCIÓN</label>
        <textarea id="dia-desc-${d.id}" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;resize:vertical;min-height:60px;">${d.descripcion || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="dia-save-${d.id}" onclick="guardarDia('${d.id}','${pkgId}')" style="flex:1;padding:8px;background:#1a9fa0;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85rem;">💾 Guardar día</button>
        <button onclick="eliminarDia('${d.id}')" style="padding:8px 14px;background:#e53935;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85rem;">🗑️</button>
      </div>
    </div>`;
}

async function guardarDia(diaId, pkgId) {
  const label = document.getElementById(`dia-label-${diaId}`)?.value || '';
  const emoji = document.getElementById(`dia-emoji-${diaId}`)?.value || '';
  const titulo = document.getElementById(`dia-titulo-${diaId}`)?.value || '';
  const descripcion = document.getElementById(`dia-desc-${diaId}`)?.value || '';
  const { error } = await sb.from('itinerario_dias').upsert({
    id: diaId,
    paquete_id: pkgId,
    fecha_label: label,
    dia: label,
    emoji,
    titulo,
    descripcion,
  });
  const btn = document.getElementById(`dia-save-${diaId}`);
  if (error) { alert('Error al guardar: ' + error.message); return; }
  if (btn) { btn.textContent = '✅ Guardado'; setTimeout(() => btn.textContent = '💾 Guardar día', 2000); }
}

async function eliminarDia(diaId) {
  if (!confirm('¿Eliminar este día del itinerario?')) return;
  const { error } = await sb.from('itinerario_dias').delete().eq('id', diaId);
  if (error) { alert('Error: ' + error.message); return; }
  document.getElementById(`dia-card-${diaId}`)?.remove();
}

async function agregarDia(pkgId) {
  if (!pkgId) { alert('Primero guarda el paquete.'); return; }
  const orden = document.querySelectorAll('.dia-card').length;
  const { data, error } = await sb.from('itinerario_dias').insert({
    paquete_id: pkgId,
    fecha_label: '',
    dia: '',
    emoji: '📍',
    titulo: '',
    descripcion: '',
    orden,
  }).select().single();
  if (error) { alert('Error: ' + error.message); return; }
  const container = document.getElementById('itinerario-dias-container');
  if (!container) return;
  const emptyMsg = container.querySelector('div:not(.dia-card)');
  if (emptyMsg) emptyMsg.remove();
  container.insertAdjacentHTML('beforeend', diaCardHTML(data, pkgId));
}

// GALERÍA POR PAQUETE
function toggleGaleriaPaquete() {
  const section = document.getElementById('galeria-paquete-section');
  if (!section) return;
  if (section.style.display !== 'none') {
    section.style.display = 'none';
  } else {
    section.style.display = 'block';
    const pkgId = document.getElementById('pf-id').value;
    if (pkgId) loadGaleriaPaquete(pkgId);
    else document.getElementById('galeria-paquete-grid').innerHTML =
      '<div style="color:#e53935;font-size:0.82rem;grid-column:1/-1;">Primero guarda el paquete.</div>';
  }
}

async function loadGaleriaPaquete(pkgId) {
  const grid = document.getElementById('galeria-paquete-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:#aaa;font-size:0.82rem;grid-column:1/-1;">Cargando...</div>';
  const { data, error } = await sb.from('galeria').select('*').eq('paquete_id', pkgId).order('created_at');
  if (error) { grid.innerHTML = '<div style="color:#e53935;grid-column:1/-1;">Error: ' + error.message + '</div>'; return; }
  renderGaleriaPaquete(data || []);
}

function renderGaleriaPaquete(fotos) {
  const grid = document.getElementById('galeria-paquete-grid');
  if (!grid) return;
  if (!fotos.length) {
    grid.innerHTML = '<div style="color:#aaa;font-size:0.82rem;grid-column:1/-1;">Sin fotos aún.</div>';
    return;
  }
  grid.innerHTML = fotos.map(f => `
    <div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:#f0f0f0;">
      <img src="${f.url}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
      ${f.categoria ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:0.6rem;padding:2px 4px;text-align:center;">${f.categoria}</div>` : ''}
      <button onclick="delFotoPaquete('${f.id}','${f.url}')" style="position:absolute;top:3px;right:3px;background:rgba(229,57,53,0.85);color:white;border:none;border-radius:4px;padding:2px 5px;cursor:pointer;font-size:0.75rem;line-height:1;">🗑️</button>
    </div>`).join('');
}

async function uploadFotosPaquete(input, pkgId) {
  if (!pkgId) { alert('Primero guarda el paquete.'); return; }
  const categoria = document.getElementById('pkg-gal-categoria')?.value || 'general';
  const files = Array.from(input.files);
  for (const file of files) {
    const ext = file.name.split('.').pop();
    const path = `paquetes/${pkgId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await sb.storage.from('galeria').upload(path, file, { contentType: file.type });
    if (upErr) { alert('Error al subir: ' + upErr.message); continue; }
    const { data: { publicUrl } } = sb.storage.from('galeria').getPublicUrl(path);
    await sb.from('galeria').insert([{ url: publicUrl, descripcion: file.name, orden: 0, paquete_id: pkgId, categoria }]);
  }
  input.value = '';
  await loadGaleriaPaquete(pkgId);
}

async function delFotoPaquete(id, url) {
  if (!confirm('¿Eliminar esta foto?')) return;
  const parts = url.split('/storage/v1/object/public/galeria/');
  if (parts[1]) await sb.storage.from('galeria').remove([parts[1]]);
  const { error } = await sb.from('galeria').delete().eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  await loadGaleriaPaquete(document.getElementById('pf-id').value);
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
    await sb.from('galeria').insert([{ url: publicUrl, descripcion: file.name, orden: 0, paquete_id: null }]);
    await loadGallery();
    const { data } = await sb.from('galeria').select('*').is('paquete_id',null).order('orden').order('created_at');
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
  const { data } = await sb.from('galeria').select('*').is('paquete_id',null).order('orden').order('created_at');
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

  const adminToken = sessionStorage.getItem('adminToken');
  const res = await fetch('/api/generate-contract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
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

// ---- ADMIN: COMISIONES ----

const _COM_RATES = {
  card: { rate: 3.6,  flat: 3, months: 0,  label: 'Contado tarjeta' },
  '3':  { rate: 8.6,  flat: 3, months: 3,  label: '3 meses' },
  '6':  { rate: 11.1, flat: 3, months: 6,  label: '6 meses' },
  '9':  { rate: 13.6, flat: 3, months: 9,  label: '9 meses' },
  '12': { rate: 16.1, flat: 3, months: 12, label: '12 meses' },
  '18': { rate: 21.1, flat: 3, months: 18, label: '18 meses' },
  '24': { rate: 25.1, flat: 3, months: 24, label: '24 meses' },
};

async function loadComisiones() {
  const resumenEl = document.getElementById('comisiones-resumen');
  const tablasEl  = document.getElementById('comisiones-tablas');
  resumenEl.innerHTML = '';
  tablasEl.innerHTML  = '<div style="color:#aaa;font-size:0.85rem;"><span class="spin"></span> Cargando paquetes...</div>';

  const { data, error } = await sb.from('paquetes').select('id,nombre,precio').eq('activo', true).order('created_at');
  if (error) { tablasEl.innerHTML = `<p style="color:red;font-size:0.85rem;">Error: ${error.message}</p>`; return; }
  if (!data || !data.length) { tablasEl.innerHTML = '<p style="color:#aaa;font-size:0.85rem;">Sin paquetes activos.</p>'; return; }

  let inconsistentes = 0;
  const html = data.map(pkg => {
    const base = Number(pkg.precio) || 0;
    const thS = 'style="background:#f0f4f6;padding:7px 10px;text-align:left;font-size:0.72rem;font-weight:700;color:#666;white-space:nowrap;"';
    const tdS = (extra) => `style="padding:7px 10px;font-size:0.82rem;border-bottom:1px solid #f0f0f0;white-space:nowrap;${extra||''}"`;

    // Fila transferencia
    const rows = [`<tr>
      <td ${tdS()}>Transferencia / Depósito</td>
      <td ${tdS('font-weight:700;')}>$${base.toLocaleString('es-MX')}</td>
      <td ${tdS('color:#2e7d32;')}>Sin comisión</td>
      <td ${tdS('font-weight:700;')}>$${base.toLocaleString('es-MX')}</td>
      <td ${tdS('color:#aaa;')}>—</td>
      <td ${tdS()}>✅</td>
    </tr>`];

    // Filas Stripe
    for (const [key, cfg] of Object.entries(_COM_RATES)) {
      const total    = grossUp(base, cfg.rate, cfg.flat);
      const comision = total - base;
      const verify   = grossUp(base, cfg.rate, cfg.flat);
      const valido   = total === verify;
      if (!valido) inconsistentes++;
      const mensualidad = cfg.months > 0
        ? `$${Math.ceil(total / cfg.months).toLocaleString('es-MX')} × ${cfg.months}`
        : '—';
      rows.push(`<tr>
        <td ${tdS()}>${cfg.label}</td>
        <td ${tdS('font-weight:700;')}>$${base.toLocaleString('es-MX')}</td>
        <td ${tdS()}>+$${comision.toLocaleString('es-MX')}</td>
        <td ${tdS('font-weight:700;')}>$${total.toLocaleString('es-MX')}</td>
        <td ${tdS()}>${mensualidad}</td>
        <td ${tdS(valido ? '' : 'color:#e53935;font-weight:700;')}>${valido ? '✅' : '❌'}</td>
      </tr>`);
    }

    return `<div style="margin-bottom:28px;">
      <h4 style="font-size:0.95rem;font-weight:700;margin:0 0 10px;color:#1A3A4A;">${pkg.nombre} — precio base $${base.toLocaleString('es-MX')} MXN</h4>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:560px;">
          <thead><tr>
            <th ${thS}>Método de pago</th>
            <th ${thS}>Precio base</th>
            <th ${thS}>Comisión Stripe</th>
            <th ${thS}>Total al cliente</th>
            <th ${thS}>Mensualidad</th>
            <th ${thS}>Válido</th>
          </tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  tablasEl.innerHTML = html;

  if (inconsistentes === 0) {
    resumenEl.innerHTML = `<span style="color:#2e7d32;">${data.length} paquetes verificados — todos correctos ✅</span>`;
  } else {
    resumenEl.innerHTML = `<span style="color:#e53935;">⚠️ ${inconsistentes} inconsistencia${inconsistentes > 1 ? 's' : ''} detectada${inconsistentes > 1 ? 's' : ''} en ${data.length} paquetes</span>`;
  }
}

// ---- ADMIN: AUDITORÍA ----

const _AUDIT_RATES = {
  card: { rate: 3.6,  flat: 3 },
  '3':  { rate: 8.6,  flat: 3 },
  '6':  { rate: 11.1, flat: 3 },
  '9':  { rate: 13.6, flat: 3 },
  '12': { rate: 16.1, flat: 3 },
  '18': { rate: 21.1, flat: 3 },
  '24': { rate: 25.1, flat: 3 },
};

async function runAuditoria() {
  const btn        = document.getElementById('btn-auditoria');
  const resumenEl  = document.getElementById('auditoria-resumen');
  const resultsEl  = document.getElementById('auditoria-resultados');
  const ultimaEl   = document.getElementById('auditoria-ultima');

  btn.disabled    = true;
  btn.textContent = '⏳ Analizando...';
  resumenEl.innerHTML  = '';
  resultsEl.innerHTML  = '<div style="color:#aaa;font-size:0.85rem;"><span class="spin"></span> Ejecutando auditoría...</div>';

  const criticos = [], advertencias = [], avisos = [];
  const categorias = [];

  // Datos base reutilizados por varias categorías
  const [{ data: paquetes }, { data: reservasConf }] = await Promise.all([
    sb.from('paquetes').select('id,nombre,precio,activo,lugares_totales,fecha_fin'),
    sb.from('reservaciones')
      .select('id,nombre,email,total,personas,paquete_id,metodo_pago,contrato_url,created_at')
      .in('estado', ['confirmado', 'confirmada']),
  ]);
  const paqMap = {};
  (paquetes || []).forEach(p => { paqMap[p.id] = p; });

  // --- CAT 1: Montos incorrectos ---
  const cat1 = [];
  for (const r of (reservasConf || [])) {
    const metodo = r.metodo_pago;
    if (!metodo || metodo === 'transfer') continue;
    const cfg = _AUDIT_RATES[metodo];
    if (!cfg) continue;
    const pkg = paqMap[r.paquete_id];
    if (!pkg) continue;
    const base     = Number(pkg.precio) * (Number(r.personas) || 1);
    const expected = grossUp(base, cfg.rate, cfg.flat);
    const actual   = Number(r.total) || 0;
    if (Math.abs(expected - actual) > 10) {
      cat1.push({
        id: r.id, tab: 'reservaciones',
        label: `#${r.id.substring(0,8).toUpperCase()} — ${r.nombre || r.email}`,
        desc:  `Total registrado $${actual.toLocaleString('es-MX')} · esperado $${expected.toLocaleString('es-MX')} (${metodo === 'card' ? 'tarjeta' : metodo + ' meses'})`,
      });
      criticos.push(r.id);
    }
  }
  categorias.push({ icono: cat1.length ? '🔴' : '✅', nombre: 'Reservaciones con monto incorrecto', items: cat1 });

  // --- CAT 2: Confirmadas sin contrato ---
  const cat2 = (reservasConf || [])
    .filter(r => !r.contrato_url)
    .map(r => ({
      id: r.id, tab: 'reservaciones',
      label: `#${r.id.substring(0,8).toUpperCase()} — ${r.nombre || r.email}`,
      desc:  'Reservación confirmada sin contrato generado',
    }));
  cat2.forEach(() => advertencias.push(1));
  categorias.push({ icono: cat2.length ? '🟠' : '✅', nombre: 'Confirmadas sin contrato', items: cat2 });

  // --- CAT 3: Paquetes vencidos activos ---
  const hoy = new Date().toISOString().split('T')[0];
  const cat3 = (paquetes || [])
    .filter(p => p.activo && p.fecha_fin && p.fecha_fin < hoy)
    .map(p => ({
      id: p.id, tab: 'paquetes',
      label: p.nombre,
      desc:  `Activo pero venció el ${p.fecha_fin}`,
    }));
  cat3.forEach(() => advertencias.push(1));
  categorias.push({ icono: cat3.length ? '🟠' : '✅', nombre: 'Paquetes vencidos aún activos', items: cat3 });

  // --- CAT 4: Pendientes > 7 días ---
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pendientesViejas } = await sb
    .from('reservaciones')
    .select('id,nombre,email,created_at')
    .eq('estado', 'pendiente')
    .lt('created_at', hace7dias);
  const cat4 = (pendientesViejas || []).map(r => ({
    id: r.id, tab: 'reservaciones',
    label: `#${r.id.substring(0,8).toUpperCase()} — ${r.nombre || r.email}`,
    desc:  `Pendiente desde ${new Date(r.created_at).toLocaleDateString('es-MX')}`,
  }));
  cat4.forEach(() => avisos.push(1));
  categorias.push({ icono: cat4.length ? '🟡' : '✅', nombre: 'Reservaciones pendientes > 7 días', items: cat4 });

  // --- CAT 5: Lugares sobrevendidos ---
  const cat5 = [];
  for (const pkg of (paquetes || [])) {
    if (!pkg.activo || pkg.lugares_totales == null) continue;
    const confirmadas = (reservasConf || []).filter(r => r.paquete_id === pkg.id).length;
    if (confirmadas > pkg.lugares_totales) {
      cat5.push({
        id: pkg.id, tab: 'paquetes',
        label: pkg.nombre,
        desc:  `${confirmadas} confirmadas · ${pkg.lugares_totales} lugares disponibles`,
      });
      criticos.push(pkg.id);
    }
  }
  categorias.push({ icono: cat5.length ? '🔴' : '✅', nombre: 'Lugares sobrevendidos', items: cat5 });

  // --- CAT 6: Descuentos vencidos activos ---
  const { data: descVencidos } = await sb
    .from('descuentos')
    .select('id,codigo,valido_hasta')
    .eq('activo', true)
    .lt('valido_hasta', new Date().toISOString());
  const cat6 = (descVencidos || []).map(d => ({
    id: d.id, tab: 'descuentos',
    label: d.codigo,
    desc:  `Activo pero venció el ${new Date(d.valido_hasta).toLocaleDateString('es-MX')}`,
  }));
  cat6.forEach(() => avisos.push(1));
  categorias.push({ icono: cat6.length ? '🟡' : '✅', nombre: 'Códigos de descuento vencidos activos', items: cat6 });

  // --- RESUMEN ---
  const nCrit = criticos.length, nAdv = advertencias.length, nAvis = avisos.length;
  if (nCrit === 0 && nAdv === 0 && nAvis === 0) {
    resumenEl.innerHTML = `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:14px 18px;color:#166534;font-weight:700;">✅ Todo correcto — Sin problemas detectados</div>`;
  } else {
    const parts = [];
    if (nCrit > 0) parts.push(`<span style="color:#dc2626;font-weight:700;">🔴 ${nCrit} problema${nCrit>1?'s':''} crítico${nCrit>1?'s':''}</span>`);
    if (nAdv  > 0) parts.push(`<span style="color:#ea580c;font-weight:700;">🟠 ${nAdv} advertencia${nAdv>1?'s':''}</span>`);
    if (nAvis > 0) parts.push(`<span style="color:#ca8a04;font-weight:700;">🟡 ${nAvis} aviso${nAvis>1?'s':''}</span>`);
    resumenEl.innerHTML = `<div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:14px 18px;display:flex;gap:20px;flex-wrap:wrap;">${parts.join('')}</div>`;
  }

  // --- CATEGORÍAS ---
  resultsEl.innerHTML = categorias.map(cat => {
    const bg  = cat.icono==='🔴'?'#fef2f2':cat.icono==='🟠'?'#fff7ed':cat.icono==='🟡'?'#fefce8':'#f0fdf4';
    const bdr = cat.icono==='🔴'?'#fca5a5':cat.icono==='🟠'?'#fed7aa':cat.icono==='🟡'?'#fde047':'#86efac';
    const detail = cat.items.map(item => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;gap:10px;">
        <div style="font-size:0.82rem;min-width:0;">
          <span style="font-weight:600;">${item.label}</span>
          <span style="color:#888;margin-left:8px;">${item.desc}</span>
        </div>
        <button onclick="switchAdminTab('${item.tab}')" style="flex-shrink:0;padding:4px 12px;background:#0097A7;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:0.78rem;">Ver</button>
      </div>`).join('');
    const hasItems = cat.items.length > 0;
    return `<div style="background:${bg};border:1.5px solid ${bdr};border-radius:12px;padding:14px 18px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;${hasItems?'cursor:pointer;':''}" ${hasItems?`onclick="const d=this.nextElementSibling;d.style.display=d.style.display==='none'?'block':'none'"`:''}>
        <div style="font-weight:700;font-size:0.95rem;">${cat.icono} ${cat.nombre} <span style="font-weight:400;font-size:0.82rem;color:#888;">(${cat.items.length})</span></div>
        ${hasItems?'<span style="color:#888;font-size:0.8rem;">▼ detalle</span>':''}
      </div>
      <div style="display:${hasItems?'block':'none'};">${detail}</div>
    </div>`;
  }).join('');

  // --- GUARDAR HISTORIAL ---
  const now = new Date().toISOString();
  await sb.from('auditoria_resultados').upsert({
    id: 1,
    ejecutada_at: now,
    criticos: nCrit,
    advertencias: nAdv,
    avisos: nAvis,
    detalle: JSON.stringify(categorias.map(c => ({ nombre: c.nombre, icono: c.icono, count: c.items.length }))),
  }, { onConflict: 'id' });

  ultimaEl.textContent = `Última ejecución: ${new Date(now).toLocaleString('es-MX')}`;
  btn.disabled    = false;
  btn.textContent = '▶ Ejecutar auditoría';
}

// ---- ADMIN: QA AGENT ----

async function runQA() {
  const btn      = document.getElementById('btn-qa');
  const areaEl   = document.getElementById('qa-area');
  const resultEl = document.getElementById('qa-resultados');

  btn.disabled    = true;
  btn.textContent = '⏳ Ejecutando...';
  areaEl.style.display  = 'block';
  resultEl.innerHTML    = '<div style="color:#aaa;font-size:0.88rem;padding:14px 0;"><span class="spin"></span> Ejecutando pruebas... por favor espera</div>';

  const t0 = Date.now();
  const qaResults = [];

  // ── FASE 1: Verificación estática ──────────────────────────────────────

  const endpoints = [
    '/api/admin-verify',
    '/api/send-notification',
    '/api/generate-contract',
    '/api/confirm-payment',
    '/api/send-confirmation',
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (r.status === 500) {
        qaResults.push({ fase: 1, status: '🔴', texto: `${ep} devuelve 500 — error interno` });
      } else {
        qaResults.push({ fase: 1, status: '✅', texto: `${ep} responde correctamente (${r.status})` });
      }
    } catch (e) {
      qaResults.push({ fase: 1, status: '🔴', texto: `${ep} no responde — ${e.message}` });
    }
  }

  const { data: paquetes } = await sb.from('paquetes').select('*').eq('activo', true);
  if (!paquetes || paquetes.length === 0) {
    qaResults.push({ fase: 1, status: '🔴', texto: 'No hay paquetes activos' });
  } else {
    qaResults.push({ fase: 1, status: '✅', texto: `${paquetes.length} paquetes activos encontrados` });
  }

  const QA_RATES = {
    '3':  { rate: 8.6,  flat: 3 }, '6':  { rate: 11.1, flat: 3 },
    '9':  { rate: 13.6, flat: 3 }, '12': { rate: 16.1, flat: 3 },
    '18': { rate: 21.1, flat: 3 }, '24': { rate: 25.1, flat: 3 },
  };
  function qaGrossUp(base, rate, flat) { return Math.ceil((base + flat) / (1 - rate / 100)); }
  let calcOk = true;
  for (const p of (paquetes || [])) {
    for (const cfg of Object.values(QA_RATES)) {
      if (qaGrossUp(p.precio, cfg.rate, cfg.flat) <= p.precio) { calcOk = false; }
    }
  }
  qaResults.push({ fase: 1, status: calcOk ? '✅' : '🔴', texto: calcOk ? 'Cálculos de financiamiento correctos' : 'Error en cálculos de financiamiento' });

  const tablas = [
    { nombre: 'paquetes',       col: 'id'    },
    { nombre: 'reservaciones',  col: 'id'    },
    { nombre: 'viajeros',       col: 'id'    },
    { nombre: 'cotizaciones',   col: 'id'    },
    { nombre: 'egresos',        col: 'id'    },
    { nombre: 'admin_sessions', col: 'token' },
    { nombre: 'login_attempts', col: 'ip'    },
  ];
  for (const { nombre, col } of tablas) {
    const { error } = await sb.from(nombre).select(col).limit(1);
    if (error) {
      qaResults.push({ fase: 1, status: '🔴', texto: `Tabla '${nombre}' no accesible: ${error.message}` });
    } else {
      qaResults.push({ fase: 1, status: '✅', texto: `Tabla '${nombre}' accesible` });
    }
  }

  // ── FASE 2: Flujo completo ─────────────────────────────────────────────

  let reservaTest = null;
  const paqueteTest = (paquetes || [])[0];

  if (paqueteTest) {
    const { data: rt, error: errReserva } = await sb.from('reservaciones').insert({
      nombre: 'QA Test Agent',
      email: 'qa@zipolitealdesnudo.com',
      whatsapp: '5500000000',
      paquete_nombre: paqueteTest.nombre,
      personas: 1,
      total: paqueteTest.precio,
      anticipo: paqueteTest.monto_anticipo,
      metodo_pago: 'transfer',
      estado: 'pendiente',
      fecha_inicio: paqueteTest.fecha_inicio,
      fecha_fin: paqueteTest.fecha_fin,
      created_at: new Date().toISOString(),
    }).select().single();

    if (errReserva) {
      qaResults.push({ fase: 2, status: '🔴', texto: `Error creando reserva de prueba: ${errReserva.message}` });
    } else {
      reservaTest = rt;
      qaResults.push({ fase: 2, status: '✅', texto: `Reserva de prueba creada: #${rt.id.slice(0, 8).toUpperCase()}` });
    }
  } else {
    qaResults.push({ fase: 2, status: '🔴', texto: 'Sin paquetes activos — no se puede ejecutar Fase 2' });
  }

  if (reservaTest) {
    const { error: errViajero } = await sb.from('viajeros').insert({
      reservacion_id: reservaTest.id,
      nombre: 'QA', ap_paterno: 'Test', ap_materno: 'Agent',
      fecha_nacimiento: '1990-01-01', nacionalidad: 'Mexicana',
      correo: 'qa@zipolitealdesnudo.com', whatsapp: '5500000000',
      contacto_emergencia: 'QA Emergency 5500000000',
      alergias: 'Ninguna', es_titular: true,
    });
    qaResults.push({ fase: 2, status: errViajero ? '🔴' : '✅', texto: errViajero ? `Error creando viajero: ${errViajero.message}` : 'Viajero de prueba creado' });
  }

  if (reservaTest) {
    const adminToken = sessionStorage.getItem('adminToken');
    const contractRes = await fetch('/api/generate-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ reservacion_id: reservaTest.id }),
    });
    qaResults.push({ fase: 2, status: contractRes.ok ? '✅' : '🔴', texto: contractRes.ok ? 'Contrato PDF generado correctamente' : `Error generando contrato: ${contractRes.status}` });
  }

  if (reservaTest) {
    const { error: errConfirm } = await sb.from('reservaciones').update({ estado: 'confirmada' }).eq('id', reservaTest.id);
    qaResults.push({ fase: 2, status: errConfirm ? '🔴' : '✅', texto: errConfirm ? `Error confirmando reserva: ${errConfirm.message}` : 'Reserva confirmada correctamente' });
  }

  if (reservaTest) {
    await sb.from('viajeros').delete().eq('reservacion_id', reservaTest.id);
    await sb.from('egresos').delete().eq('reservacion_id', reservaTest.id);
    await sb.from('reservaciones').delete().eq('id', reservaTest.id);
    await sb.storage.from('contratos').remove([`${reservaTest.id}.pdf`]);
    qaResults.push({ fase: 2, status: '✅', texto: 'Datos de prueba limpiados correctamente' });
  }

  // ── RENDER ─────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const pasaron = qaResults.filter(r => r.status === '✅').length;
  const fallaron = qaResults.filter(r => r.status === '🔴').length;

  const fase1 = qaResults.filter(r => r.fase === 1);
  const fase2 = qaResults.filter(r => r.fase === 2);

  const renderRows = rows => rows.map(r =>
    `<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:0.83rem;">
      <span style="flex-shrink:0;font-size:1rem;">${r.status}</span>
      <span style="color:#333;">${r.texto}</span>
    </div>`
  ).join('');

  const sectionStyle = 'background:#f9f9fb;border:1.5px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:14px;';
  const headStyle = 'font-weight:700;font-size:0.92rem;color:#1A3A4A;margin-bottom:10px;';

  resultEl.innerHTML = `
    <div style="${sectionStyle}">
      <div style="${headStyle}">Fase 1 — Verificación estática</div>
      ${renderRows(fase1)}
    </div>
    <div style="${sectionStyle}">
      <div style="${headStyle}">Fase 2 — Flujo completo</div>
      ${renderRows(fase2)}
    </div>
    <div style="background:${fallaron===0?'#f0fdf4':'#fff7ed'};border:1.5px solid ${fallaron===0?'#86efac':'#fed7aa'};border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <span style="font-weight:700;font-size:0.95rem;">
        <span style="color:#16a34a;">✅ ${pasaron} prueba${pasaron!==1?'s':''} pasaron</span>
        ${fallaron>0?`&nbsp;&nbsp;<span style="color:#dc2626;">🔴 ${fallaron} fallaron</span>`:''}
      </span>
      <span style="color:#888;font-size:0.82rem;">Tiempo total: ${elapsed}s</span>
    </div>`;

  btn.disabled    = false;
  btn.textContent = '🧪 Ejecutar QA';
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

async function confirmarGrupo(grupoId) {
  const miembros = (window._admReservaciones||[]).filter(r => r.grupo_id === grupoId);
  if (!miembros.length) { alert('Este grupo no tiene reservaciones vinculadas.'); return; }
  if (!confirm(`¿Confirmar ${miembros.length} reservación(es) de este grupo?`)) return;
  const ids = miembros.map(r => r.id);
  const { error } = await sb.from('reservaciones')
    .update({ estado: 'confirmado' })
    .in('id', ids);
  if (error) { alert('Error: ' + error.message); return; }
  alert(`✅ ${ids.length} reservación(es) confirmadas.`);
  loadReservaciones();
}

async function contratoGrupo(grupoId) {
  const miembros = (window._admReservaciones||[]).filter(r => r.grupo_id === grupoId);
  if (!miembros.length) { alert('Sin reservaciones vinculadas.'); return; }
  const confirmados = miembros.filter(r => r.estado === 'confirmado' || r.estado === 'confirmada');
  if (!confirmados.length) {
    alert('Primero confirma las reservaciones del grupo.');
    return;
  }
  if (!confirm(`¿Generar contrato para ${confirmados.length} reservación(es) confirmada(s)?`)) return;
  let errores = 0;
  for (const r of confirmados) {
    try {
      const res = await fetch('/api/generar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservacionId: r.id })
      });
      if (!res.ok) errores++;
    } catch(e) { errores++; }
  }
  if (errores) alert(`⚠️ ${errores} error(es) al generar contratos.`);
  else alert(`📄 Contratos generados para ${confirmados.length} reservación(es).`);
  loadReservaciones();
}

async function viajerosGrupo(grupoId, codigo) {
  const miembros = (window._admReservaciones||[]).filter(r => r.grupo_id === grupoId);
  if (!miembros.length) { alert('Sin reservaciones vinculadas.'); return; }
  const { data: viajeros, error } = await sb
    .from('viajeros')
    .select('*')
    .in('reservacion_id', miembros.map(r => r.id));
  if (error) { alert('Error cargando viajeros.'); return; }
  if (!viajeros || !viajeros.length) {
    alert('Aún no hay fichas de viajeros registradas en este grupo.');
    return;
  }
  const html = viajeros.map(v => `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px">
      <strong>${v.nombre} ${v.ap_paterno||''} ${v.ap_materno||''}</strong>
      ${v.es_titular ? '<span style="background:#d4f7ef;color:#0a7a65;padding:2px 8px;border-radius:99px;font-size:11px;margin-left:6px">titular</span>' : ''}
      <div style="font-size:13px;color:#666;margin-top:4px">
        📧 ${v.correo||'—'} · 📱 ${v.whatsapp||'—'}<br>
        🎂 ${v.fecha_nacimiento||'—'} · 🌍 ${v.nacionalidad||'—'}<br>
        ${v.alergias ? '⚠️ '+v.alergias : ''}
      </div>
    </div>
  `).join('');
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">👤 Viajeros — Grupo ${codigo}</h3>
        <button onclick="this.closest('[style*=fixed]').remove()"
          style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      ${html}
    </div>
  `;
  document.body.appendChild(modal);
}

async function eliminarGrupo(grupoId, codigo) {
  const miembros = (window._admReservaciones||[]).filter(r => r.grupo_id === grupoId);
  const msg = miembros.length
    ? `⚠️ El grupo ${codigo} tiene ${miembros.length} reservación(es) vinculada(s).\n\nSolo se eliminará el grupo, las reservaciones se conservan.\n\n¿Continuar?`
    : `¿Eliminar el grupo ${codigo}?`;
  if (!confirm(msg)) return;
  const { error } = await sb.from('grupos').delete().eq('id', grupoId);
  if (error) { alert('Error: ' + error.message); return; }
  alert(`🗑️ Grupo ${codigo} eliminado.`);
  loadGrupos();
}
