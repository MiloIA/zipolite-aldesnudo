const SB_URL = 'https://rimpazjnhxnrkvziqmbj.supabase.co';
const SB_KEY = 'sb_publishable_NEoxD-p2ZK-VzzFpYlVlUw_nxbMWARz';
const sb = window.supabase.createClient(SB_URL, SB_KEY);
let stripeClient;

// Admin password stored in Vercel env — fetched via meta tag injected at build time
// For static HTML we use a hash comparison approach
// Admin auth via localStorage

let pkgs = [], adminPkgs = [], curPkg = null, selPayment = 'anticipo';
let pendingSlug = null;
function slugify(nombre) {
  return nombre.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const fecha = new Date(fechaStr + 'T12:00:00');
  return fecha.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
function closeShareMenus(except) {
  document.querySelectorAll('.pkg-share-menu.open').forEach(m => { if (m !== except) m.classList.remove('open'); });
}
document.addEventListener('click', e => {
  if (!e.target.closest('.pkg-share-wrap')) closeShareMenus(null);
});
let tempPassword;
let currentSession = null;
let oaiKey = localStorage.getItem('oai_key') || '';
let adminAuthenticated = !!sessionStorage.getItem('adminToken');
let _reservando = false;

const DEFAULT_PKGS = [
  {id:'d1',nombre:'Paquete Premium',descripcion:'Hotel Paraíso · Línea de playa · 5 noches',precio:8500,fechas:'Jueves a Martes',incluye:['Vuelo redondo CDMX — Zipolite','5 noches en Hotel Paraíso (línea de playa)','Traslados aeropuerto ↔ hotel','Habitación doble (asignamos compañero/a)','Ambiente 100% LGBT+'],nota:'💡 Habitación privada disponible: +$2,500–$3,000 MXN',icono:'✈️',badge:'⭐ Más popular',tipo:'primary'},
  {id:'d2',nombre:'Camping Año Nuevo',descripcion:'29 Dic — 3 Ene · Área privada · 48 lugares',precio:4750,fechas:'29 Dic — 3 Ene',incluye:['Transporte terrestre CDMX ↔ Zipolite','Área de camping privada con seguridad','Tienda de campaña + colchón inflable','Alberca, duchas y sanitarios','A 2 calles de la playa'],nota:'🎉 ¡Recibe el Año Nuevo con tu familia LGBT+! Cupo limitado.',icono:'⛺',badge:null,tipo:'secondary'}
];

// ---- LOAD ----
async function loadAll() {
  await loadPkgs();
  await loadGallery();
  await loadBlog();
}

async function loadPkgs() {
  const {data} = await sb.from('paquetes').select('*').eq('activo',true).order('created_at');
  console.log(data);
  const today = new Date().toISOString().split('T')[0];
  const vigentes = (data||[]).filter(p => !p.fecha_fin || p.fecha_fin >= today);
  pkgs = vigentes.length > 0 ? vigentes : DEFAULT_PKGS;
  renderPkgs(pkgs);
  if (pendingSlug) { activateSlugCard(pendingSlug); pendingSlug = null; }
}

function renderPkgs(list) {
  const c = document.getElementById('pkg-container');
  if (!list.length) { c.innerHTML='<div class="empty-msg">No hay paquetes.</div>'; return; }
  c.innerHTML = list.map(p => {
    const inc = Array.isArray(p.incluye) ? p.incluye : (p.incluye||'').split('\n').filter(i=>i.trim());
    const placeholderBg = p.tipo==='secondary' ? 'background:linear-gradient(135deg,#1a4a22,#4CAF50)' : 'background:linear-gradient(135deg,#006080,#00BCD4)';
    const header = p.foto_url
      ? `<div class="pkg-img-wrap">
          ${p.badge ? `<span class="pkg-badge">${p.badge}</span>` : ''}
          <img class="pkg-img" src="${p.foto_url}" alt="${p.nombre}" loading="lazy">
          <div class="pkg-img-overlay">
            <div class="pkg-icon">${p.icono||'✈️'}</div>
            <h3>${p.nombre}</h3>
            <p>${p.descripcion||''}</p>
            <div class="pkg-fechas">
              📅 ${formatearFecha(p.fecha_inicio)} — ${formatearFecha(p.fecha_fin)}
            </div>
          </div>
        </div>`
      : `<div class="pkg-img-wrap">
          ${p.badge ? `<span class="pkg-badge">${p.badge}</span>` : ''}
          <div class="pkg-img-placeholder" style="${placeholderBg};"></div>
          <div class="pkg-img-overlay">
            <h3>${p.nombre}</h3>
            <p>${p.descripcion||''}</p>
            <div class="pkg-fechas">
              📅 ${formatearFecha(p.fecha_inicio)} — ${formatearFecha(p.fecha_fin)}
            </div>
          </div>
        </div>`;
    const slug = slugify(p.nombre);
    const shareUrl = `https://zipolitealdesnudo.com/?paquete=${slug}`;
    return `<div class="pkg-card" data-slug="${slug}">
      ${header}
      <div class="pkg-body">
        <div class="pkg-price"><span class="currency">MXN $</span><span class="amount">${Number(p.precio).toLocaleString()}</span><span class="per">/ persona</span></div>
        <div class="pkg-urgency">${p.tipo==='secondary'?'🏕️ ¡Solo 48 lugares disponibles!':'✈️ Incluye vuelo, hotel y traslados'}</div>
        <ul class="pkg-features">${inc.slice(0,5).map(i=>`<li><span class="chk">✓</span><span>${i.trim()}</span></li>`).join('')}${inc.length>5?`<div class="pkg-extra-items" style="display:none">${inc.slice(5).map(i=>`<li><span class="chk">✓</span><span>${i.trim()}</span></li>`).join('')}</div><button class="pkg-more-btn" onclick="toggleExtras(this)">+ ${inc.length-5} más incluidos ▾</button>`:''}</ul>
        <button class="pkg-btn pkg-btn-${p.tipo||'primary'}" onclick="openPay('${p.id}')">
          🏖️ Reservar ahora
        </button>
        <div class="pkg-share-wrap">
          <button class="pkg-share-btn" onclick="toggleShareMenu(this)">🔗 Compartir</button>
          <div class="pkg-share-menu">
            <button class="pkg-share-item" onclick="copyPkgLink('${shareUrl}',this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Copiar link</button>
            <button class="pkg-share-item" onclick="sharePkgWhatsapp('${shareUrl}','${p.nombre.replace(/'/g,"\\'")}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> WhatsApp</button>
            <button class="pkg-share-item" onclick="sharePkgFacebook('${shareUrl}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Facebook</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleExtras(btn) {
  const extras = btn.previousElementSibling;
  const isOpen = extras.style.display !== 'none';
  extras.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen
    ? `+ ${extras.children.length} más incluidos ▾`
    : 'Ver menos ▴';
}

function toggleShareMenu(btn) {
  const menu = btn.nextElementSibling;
  const isOpen = menu.classList.contains('open');
  closeShareMenus(null);
  if (!isOpen) menu.classList.add('open');
}

function copyPkgLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '¡Link copiado!';
    setTimeout(() => { btn.textContent = orig; btn.closest('.pkg-share-menu').classList.remove('open'); }, 2000);
  });
}

function sharePkgWhatsapp(url, nombre) {
  const text = encodeURIComponent(`¡Mira este paquete de Zipolite al Desnudo! ${nombre} ${url}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

function sharePkgFacebook(url) {
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
}

function activateSlugCard(slug) {
  const card = document.querySelector(`.pkg-card[data-slug="${slug}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('slug-highlight');
  setTimeout(() => card.classList.remove('slug-highlight'), 2000);
  const pkg = pkgs.find(p => slugify(p.nombre) === slug);
  if (pkg) setTimeout(() => openPay(pkg.id), 600);
}

async function loadGallery() {
  const {data} = await sb.from('galeria').select('*').order('orden').order('created_at');
  const c = document.getElementById('gal-container');
  if (!data || !data.length) { c.innerHTML='<div class="empty-msg">📷 Agrega fotos desde el panel admin (⚙️ en el footer)</div>'; return; }
  allGalleryImages = data;
  console.log('allGalleryImages:', allGalleryImages.length);
  lbImages = data;
  const visible = data.slice(0, 9);
  c.innerHTML = visible.map((img, i) => `<div class="gallery-item" onclick="openLightbox(${i})"><img src="${img.url}" alt="${img.descripcion||'Zipolite'}" loading="lazy"></div>`).join('');
  if (data.length > 9) {
    c.innerHTML += `<button class="btn-ver-mas" onclick="loadMoreGallery()">📷 Ver más fotos (${data.length - 9})</button>`;
  }
}
let allGalleryImages = [];
function loadMoreGallery() {
  const grid = document.getElementById('gallery-modal-grid');
  grid.innerHTML = allGalleryImages.map((img, i) =>
    `<div class="gallery-item" onclick="closeGalleryModal();openLightbox(${i})"><img src="${img.url}" alt="${img.descripcion||'Zipolite'}" loading="lazy"></div>`
  ).join('');
  document.getElementById('gallery-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeGalleryModal() {
  document.getElementById('gallery-modal').classList.remove('active');
  document.body.style.overflow = '';
}

async function loadBlog() {
  const {data} = await sb.from('blog').select('*').eq('publicado',true).order('created_at',{ascending:false});
  const c = document.getElementById('blog-container');
  if (!data || !data.length) { c.innerHTML='<div class="empty-msg">✍️ Posts del blog aparecerán aquí.</div>'; return; }
  c.innerHTML = data.map(p=>`
    <div class="blog-card" onclick="openBlogDrawer('${p.id}')">
      ${p.imagen ? `<img src="${p.imagen}" class="blog-card-img" alt="${p.titulo}">` : `<div class="blog-card-img-placeholder">🌊</div>`}
      <div class="blog-card-body">
        <h3>${p.titulo}</h3>
        <p>${(p.contenido||'').substring(0,150)}...</p>
        <div class="blog-card-footer">
          <span class="blog-card-date">${new Date(p.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</span>
          <span class="blog-card-cta">Leer más →</span>
        </div>
      </div>
    </div>`).join('');
}

// ---- COTIZADOR ----
// SQL tabla descuentos (añadir columnas si ya existe):
// alter table descuentos add column usos_maximos integer default null;
// alter table descuentos add column usos_actuales integer default 0;
const STRIPE_RATES = {
  card: {rate:3.6,  flat:3, months:0},
  '3':  {rate:8.6,  flat:3, months:3},
  '6':  {rate:11.1, flat:3, months:6},
  '9':  {rate:13.6, flat:3, months:9},
  '12': {rate:16.1, flat:3, months:12},
  '18': {rate:21.1, flat:3, months:18},
  '24': {rate:25.1, flat:3, months:24},
};
const HABITACION_PRECIOS = {
  1: 6400,
  2: 3200,
  3: 2133,
  4: 3200,
};
let activeDiscount = null, lastTotal = 0;

function grossUp(base, rate, flat) { return Math.ceil((base + flat) / (1 - rate / 100)); }
function fmt(n) { return '$' + Math.round(n).toLocaleString('es-MX'); }

function buildPersonasOptions(max) {
  const sel = document.getElementById('m-personas');
  sel.innerHTML = '';
  const def = 1;
  for (let i = 1; i <= max; i++) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = i === 1 ? '1 persona' : `${i} personas`;
    o.selected = (i === def);
    sel.appendChild(o);
  }
  sel.value = String(def);
}

function calcStep0() {
  const alojamiento = document.querySelector('input[name="alojamiento"]:checked')?.value;
  const personasHab = parseInt(document.querySelector('input[name="habitacion-personas"]:checked')?.value || 1);
  const tourExtra = document.getElementById('tour-carrizalillo')?.checked ? 800 : 0;
  let extraPorPersona = 0;
  if (alojamiento === 'habitacion') {
    extraPorPersona = HABITACION_PRECIOS[personasHab] || HABITACION_PRECIOS[1];
  }
  const totalPorPersona = (curPkg._precioOriginal || curPkg.precio) + extraPorPersona + tourExtra;
  const el = document.getElementById('step0-total');
  if (el) el.textContent = '$' + totalPorPersona.toLocaleString('es-MX') + '/persona';
  return { extraPorPersona, tourExtra, totalPorPersona };
}

function confirmarPersonalizacion() {
  const { extraPorPersona, tourExtra, totalPorPersona } = calcStep0();
  window.pkgExtraHabitacion = extraPorPersona;
  window.pkgExtraTour = tourExtra;
  if (!curPkg._precioOriginal) curPkg._precioOriginal = curPkg.precio;
  curPkg.precio = totalPorPersona;

  const alojamiento = document.querySelector('input[name="alojamiento"]:checked')?.value;
  let personasSeleccionadas = 1;
  if (alojamiento === 'habitacion') {
    personasSeleccionadas = parseInt(document.querySelector('input[name="habitacion-personas"]:checked')?.value || 1);
  }
  const selectPersonas = document.getElementById('m-personas');
  if (selectPersonas) {
    selectPersonas.value = personasSeleccionadas;
    selectPersonas.dispatchEvent(new Event('change'));
  }

  window._paso0Alojamiento = document.querySelector('input[name="alojamiento"]:checked')?.value || 'camping';
  window._paso0PersonasHab = parseInt(document.querySelector('input[name="habitacion-personas"]:checked')?.value || 1);
  window._paso0Tour = document.getElementById('tour-carrizalillo')?.checked || false;

  document.getElementById('modal-step-1').style.display = 'none';
  document.getElementById('modal-step-2').style.display = 'block';
  calcCotizador();
}

function generarPersonalizador() {
  const el = document.getElementById('modal-step-1');
  if (!el) return;
  el.innerHTML = `
    <h3 style="font-family:'Fraunces',serif;font-size:1.35rem;font-weight:800;color:var(--dark);margin-bottom:16px;">¿Cómo quieres vivir tu Año Nuevo?</h3>
    <div class="pkg-option-group">
      <label class="pkg-option-title">🏕️ Alojamiento</label>
      <div class="pkg-option-items">
        <label class="pkg-option-item">
          <input type="radio" name="alojamiento" value="camping" checked>
          <span>🏕️ Camping — incluido en el paquete</span>
          <strong>$0 extra</strong>
        </label>
        <label class="pkg-option-item">
          <input type="radio" name="alojamiento" value="habitacion">
          <span>🛏️ Habitación privada</span>
          <strong>ver precios →</strong>
        </label>
      </div>
    </div>
    <div id="habitacion-options" style="display:none">
      <label class="pkg-option-title">¿Cuántos van en la habitación?</label>
      <div class="pkg-option-items" id="habitacion-personas"></div>
    </div>
    <div class="pkg-option-group">
      <label class="pkg-option-title">🌊 Tours opcionales</label>
      <label class="pkg-option-item">
        <input type="checkbox" id="tour-carrizalillo" value="800">
        <span>🏖️ Carrizalillo + Bioluminiscencia</span>
        <strong>+$800/persona</strong>
      </label>
    </div>
    <div class="pkg-precio-resumen">
      <span>Total estimado:</span>
      <strong id="step0-total">$${(curPkg.precio||0).toLocaleString('es-MX')}/persona</strong>
    </div>
    <button onclick="confirmarPersonalizacion()" class="pay-btn">Continuar →</button>
  `;
  document.querySelectorAll('input[name="alojamiento"]').forEach(r => {
    r.addEventListener('change', () => {
      const habOpts = document.getElementById('habitacion-options');
      if (r.value === 'habitacion' && r.checked) {
        habOpts.style.display = 'block';
        document.getElementById('habitacion-personas').innerHTML = [1,2,3,4].map(n =>
          `<label class="pkg-option-item">
            <input type="radio" name="habitacion-personas" value="${n}" ${n===2?'checked':''}>
            <span>${n} persona${n>1?'s':''}</span>
            <strong>+$${HABITACION_PRECIOS[n].toLocaleString('es-MX')}/persona</strong>
          </label>`
        ).join('');
        document.querySelectorAll('input[name="habitacion-personas"]').forEach(r2 => r2.addEventListener('change', calcStep0));
      } else {
        habOpts.style.display = 'none';
      }
      calcStep0();
    });
  });
  document.getElementById('tour-carrizalillo').addEventListener('change', calcStep0);
}

function avanzarDesdeDetalles() {
  const _isCustomizable = curPkg.tipo === 'secondary' || (curPkg.nombre||'').toLowerCase().includes('nuevo');
  if (_isCustomizable) {
    document.getElementById('modal-step-0').style.display = 'none';
    document.getElementById('modal-step-1').style.display = 'block';
  } else {
    document.getElementById('modal-step-0').style.display = 'none';
    document.getElementById('modal-step-2').style.display = 'block';
    calcCotizador();
  }
}

async function crearGrupo() {
  const { data: { session } } = await sb.auth.getSession();
  const alojamiento = window._paso0Alojamiento || 'camping';
  const personasHab = window._paso0PersonasHab || 1;
  const tourIncluido = window._paso0Tour || false;
  const precioPersona = curPkg.precio;
  const personasEsperadas = parseInt(document.getElementById('m-personas')?.value || 1);

  const btn = document.getElementById('btn-crear-grupo');
  if (btn) { btn.textContent = 'Creando grupo...'; btn.disabled = true; }

  const res = await fetch('/api/crear-grupo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paquete_id: curPkg.id,
      paquete_nombre: curPkg.nombre,
      organizador_id: session?.user?.id || null,
      organizador_nombre: session?.user?.user_metadata?.full_name || '',
      organizador_email: session?.user?.email || '',
      personas_esperadas: personasEsperadas,
      alojamiento,
      personas_habitacion: personasHab,
      tour_incluido: tourIncluido,
      precio_por_persona: precioPersona
    })
  });

  const data = await res.json();
  if (!data.ok) {
    if (btn) { btn.textContent = '🔗 Crear grupo y compartir link'; btn.disabled = false; }
    return;
  }

  window._grupoId = data.grupo_id;
  window._grupoCodigo = data.codigo;
  console.log('codigo grupo:', data.codigo);
  const codigoDisplay = document.getElementById('grupo-codigo-display');
  if (codigoDisplay) codigoDisplay.textContent = data.codigo;
  const grupoOpt = document.getElementById('grupo-option');
  const grupoUrl = `https://zipolitealdesnudo.com/?grupo=${data.codigo}`;
  if (grupoOpt) grupoOpt.innerHTML = `
    <div style="font-weight:700;color:#0d1b3e;margin-bottom:0.5rem;">✅ Grupo creado</div>
    <div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
      <div style="font-size:0.8rem;color:#666;margin-bottom:0.25rem;">Código de grupo</div>
      <div style="font-size:1.3rem;font-weight:800;color:#1a9fa0;letter-spacing:0.1em;">${data.codigo}</div>
    </div>
    <button onclick="navigator.clipboard.writeText('${grupoUrl}').then(()=>this.textContent='✅ ¡Copiado!')"
      style="width:100%;padding:0.6rem;background:#1a9fa0;border:none;border-radius:8px;color:white;font-weight:700;cursor:pointer;margin-bottom:0.5rem;">
      📋 Copiar link del grupo
    </button>
    <a href="https://wa.me/?text=${encodeURIComponent('¡Únete a nuestro viaje de Año Nuevo en Zipolite! 🌊🏳️‍🌈 Reserva tu lugar aquí: ' + grupoUrl)}"
      target="_blank"
      style="display:block;text-align:center;padding:0.6rem;background:#25D366;border-radius:8px;color:white;font-weight:700;text-decoration:none;">
      💬 Compartir por WhatsApp
    </a>
  `;
  return data.codigo;
}

function setPagoTipo(tipo) {
  document.getElementById('btn-pago-individual').classList.toggle('active', tipo === 'individual');
  document.getElementById('btn-pago-grupal').classList.toggle('active', tipo === 'grupal');
  const grupoSection = document.getElementById('grupo-link-section');
  if (tipo === 'grupal') {
    grupoSection.innerHTML = `
      <div style="margin-bottom:0.75rem;">
        <div style="font-weight:700;color:#0d1b3e;margin-bottom:0.5rem;">👥 Cómo funciona el pago grupal:</div>
        <ol style="margin:0;padding-left:1.25rem;font-size:0.85rem;color:#444;line-height:1.8;">
          <li>Se generará un código único para tu grupo</li>
          <li>Compártelo con tus acompañantes</li>
          <li>Cada quien entra con el código, se registra y realiza su pago</li>
          <li>Todos quedan vinculados al mismo grupo</li>
        </ol>
      </div>
      <div id="grupo-codigo-area" style="display:none;">
        <div style="font-size:0.85rem;color:#0d1b3e;margin-bottom:0.5rem;font-weight:600;">Tu código de grupo:</div>
        <div id="grupo-codigo-display" style="font-size:1.3rem;font-weight:800;color:#1a9fa0;margin-bottom:0.75rem;letter-spacing:0.15em;"></div>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="copiarLinkGrupo(this)" style="flex:1;padding:0.5rem;background:#1a9fa0;color:white;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">📋 Copiar link</button>
          <button onclick="compartirWhatsAppGrupo()" style="flex:1;padding:0.5rem;background:#25D366;color:white;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">💬 WhatsApp</button>
        </div>
      </div>
      <button id="btn-generar-codigo" onclick="generarCodigoGrupo()" style="width:100%;padding:0.6rem;background:#1a9fa0;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-top:0.5rem;">
        🔗 Generar código de grupo
      </button>
    `;
    grupoSection.style.display = 'block';
  } else {
    grupoSection.style.display = 'none';
    const selectPersonas = document.getElementById('m-personas');
    if (selectPersonas) {
      selectPersonas.value = '1';
      selectPersonas.dispatchEvent(new Event('change'));
    }
  }
}

function copiarLinkGrupo(btn) {
  const url = 'https://zipolitealdesnudo.com/?grupo=' + window._grupoCodigo;
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✅ ¡Link copiado!';
    setTimeout(() => btn.textContent = '📋 Copiar link', 2500);
  });
}

function compartirWhatsAppGrupo() {
  const url = 'https://zipolitealdesnudo.com/?grupo=' + window._grupoCodigo;
  window.open('https://wa.me/?text=' + encodeURIComponent('¡Únete a nuestro viaje! 🌊🏳️‍🌈 Reserva tu lugar aquí: ' + url), '_blank');
}

async function generarCodigoGrupo() {
  const btnGen = document.getElementById('btn-generar-codigo');
  if (btnGen) { btnGen.textContent = 'Generando...'; btnGen.disabled = true; }
  await crearGrupo();
  const codigo = window._grupoCodigo;
  if (!codigo) return;
  if (btnGen) btnGen.style.display = 'none';
  const area = document.getElementById('grupo-codigo-area');
  if (area) {
    const display = document.getElementById('grupo-codigo-display');
    if (display) display.textContent = codigo;
    area.style.display = 'block';
  }
}

function mostrarBannerGrupo(grupo) {
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#0d1b3e;color:white;padding:0.75rem 1.5rem;border-radius:12px;z-index:9999;font-weight:600;font-size:0.9rem;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
  banner.innerHTML = `👥 Te uniste al grupo <strong>${grupo.codigo}</strong> — ${grupo.paquete_nombre}`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
}

function openPay(id) {
  curPkg = pkgs.find(p=>String(p.id)===String(id)) || pkgs[0];
  if (!curPkg) return;
  _reservando = false;
  const _cbtn = document.getElementById('confirm-btn');
  if (_cbtn) { _cbtn.disabled = false; _cbtn.textContent = 'Confirmar reserva'; }
  sessionStorage.removeItem('reservacion_pendiente');

  // Poblar paso 1
  const s1inc = Array.isArray(curPkg.incluye) ? curPkg.incluye : (curPkg.incluye||'').split('\n').filter(i=>i.trim());
  document.getElementById('s1-name').textContent = curPkg.nombre;
  document.getElementById('s1-desc').textContent = curPkg.descripcion || '';
  const s1fechas = document.getElementById('s1-fechas');
  s1fechas.style.display = curPkg.fechas ? 'block' : 'none';
  document.getElementById('s1-fechas-text').textContent = curPkg.fechas || '';

  // Highlights block
  const s1hl = document.getElementById('s1-highlights');
  const fmtFecha = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}) : null;
  const fechaInicio = fmtFecha(curPkg.fecha_inicio);
  const fechaFin    = fmtFecha(curPkg.fecha_fin);
  const fechaTxt    = (fechaInicio && fechaFin) ? `${fechaInicio} — ${fechaFin}` : (curPkg.fechas || '');
  const incluyeStr  = (Array.isArray(curPkg.incluye) ? curPkg.incluye.join(' ') : (curPkg.incluye||'')).toLowerCase();
  const nombreLow   = (curPkg.nombre||'').toLowerCase();
  const transporteIco = curPkg.icono || '✈️';
  const transporteTxt = (incluyeStr.includes('vuelo') || nombreLow.includes('vuelo'))
    ? 'Vuelo incluido'
    : (incluyeStr.includes('transporte') || nombreLow.includes('transporte'))
      ? 'Transporte incluido'
      : 'Ver detalle de incluidos abajo';
  const rowStyle = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(0,150,170,0.1);font-size:0.88rem;';
  s1hl.innerHTML = `
    <div style="${rowStyle}"><span>📅</span><span>${fechaTxt||'—'}</span></div>
    <div style="${rowStyle}"><span>${transporteIco}</span><span>${transporteTxt}</span></div>
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:0.88rem;"><span>💳</span><span>Págalo hasta en 24 meses<span style="font-size:0.8rem;color:#888;"> — comisión bancaria aplica</span></span></div>`;
  s1hl.style.display = 'block';

  document.getElementById('s1-incluye').innerHTML = s1inc.map(i=>`<li style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f0f9fa;font-size:0.9rem;"><span style="color:var(--ocean);flex-shrink:0;">✓</span><span>${i.trim()}</span></li>`).join('');
  const s1nota = document.getElementById('s1-nota');
  s1nota.textContent = curPkg.nota || '';
  s1nota.style.display = curPkg.nota ? 'block' : 'none';
  const lugaresHtml = curPkg.lugares_totales != null ? (() => {
    const disp = curPkg.lugares_totales - (curPkg.lugares_vendidos || 0);
    const u = disp < 10;
    return `<span style="color:${u?'#c0241d':'#2e7d32'};">${u?'⚠️':'✓'} Quedan ${disp} lugares${u?' — ¡Cupo muy limitado!':''}</span>`;
  })() : '';
  document.getElementById('s1-lugares').innerHTML = lugaresHtml;

  // Poblar paso 2
  document.getElementById('m-name').textContent = curPkg.nombre;
  document.getElementById('m-desc').textContent = curPkg.descripcion || '';
  document.getElementById('m-lugares').innerHTML = lugaresHtml;
  buildPersonasOptions(curPkg.nombre.toLowerCase().includes('camping') ? 48 : (curPkg.lugares_totales || 10));
  document.getElementById('m-metodo').value = 'transfer';
  activeDiscount = null;
  document.getElementById('m-disc-code').value = '';
  document.getElementById('m-disc-msg').textContent = '';
  document.getElementById('disc-clear-btn').style.display = 'none';
  calcCotizador();

  // Prellenar campos con datos de sesión si existe, si no limpiar
  sb.auth.getSession().then(({ data: { session } }) => {
    currentSession = session;
    document.getElementById('r-nombre').value = session?.user?.user_metadata?.full_name || '';
    document.getElementById('r-email').value = session?.user?.email || '';
    document.getElementById('r-whatsapp').value = session?.user?.user_metadata?.whatsapp || '';
    if (session) document.getElementById('login-hint').style.display = 'none';
    const banner = document.getElementById('login-suggest-banner');
    if (banner) banner.style.display = session ? 'none' : 'block';
  });
  document.getElementById('r-cuanto').value = 'anticipo';
  document.getElementById('r-cuanto-anticipo-opt').textContent = `Anticipo ${fmt(curPkg.monto_anticipo||3000)} — aparta todos los lugares`;
  // Itinerario
  const s1itin = document.getElementById('s1-itinerario');
  if (s1itin) {
    let itinerario = curPkg.itinerario;
    if (typeof itinerario === 'string') {
      try { itinerario = JSON.parse(itinerario); } catch(e) { itinerario = null; }
    }
    if (!Array.isArray(itinerario)) itinerario = null;
    console.log('itinerario parsed:', itinerario);
    if (itinerario && itinerario.length) {
      s1itin.innerHTML = '<strong style="font-size:0.9rem;color:var(--ocean);">Itinerario</strong>' +
        itinerario.map(dia => `<div style="display:flex;gap:8px;padding:4px 0;font-size:0.85rem;"><span style="color:var(--ocean);font-weight:700;">${dia.emoji || ''} ${dia.dia || ''}</span><span><strong>${dia.titulo || ''}</strong>${dia.descripcion ? ' — ' + dia.descripcion : ''}</span></div>`).join('');
      s1itin.style.display = 'block';
    } else {
      s1itin.style.display = 'none';
    }
  }

  // Personalizer prep — injected into step-1, shown later via avanzarDesdeDetalles
  const _isCustomizable = curPkg.tipo === 'secondary' || (curPkg.nombre||'').toLowerCase().includes('nuevo');
  if (_isCustomizable) generarPersonalizador();

  document.getElementById('modal-step-0').style.display = 'block';
  document.getElementById('modal-step-1').style.display = 'none';
  document.getElementById('modal-step-2').style.display = 'none';
  document.getElementById('modal-step-3').style.display = 'none';
  document.getElementById('pay-modal').classList.add('open');
}

function closePay() {
  document.getElementById('pay-modal').classList.remove('open');
  if (curPkg && curPkg._precioOriginal) {
    curPkg.precio = curPkg._precioOriginal;
    delete curPkg._precioOriginal;
  }
  document.getElementById('modal-step-0').style.display = 'block';
  document.getElementById('modal-step-1').style.display = 'none';
  document.getElementById('modal-step-2').style.display = 'none';
  document.getElementById('modal-step-3').style.display = 'none';
  _reservando = false;
  const _cbtn = document.getElementById('confirm-btn');
  if (_cbtn) { _cbtn.disabled = false; _cbtn.textContent = 'Confirmar reserva'; }
}

async function confirmarReserva() {
  if (_reservando) return;
  _reservando = true;

  const btn = document.getElementById('confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  const nombre = document.getElementById('r-nombre').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const whatsapp = document.getElementById('r-whatsapp').value.trim();
  const errEl = document.getElementById('reserva-error');

  const resetBtn = () => {
    _reservando = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar reserva'; }
  };

  if (!nombre || !email || !whatsapp) {
    errEl.textContent = 'Por favor completa todos los campos';
    errEl.style.display = 'block';
    resetBtn();
    return;
  }
  errEl.style.display = 'none';
  const metodo = document.getElementById('m-metodo').value;
  const p = parseInt(document.getElementById('m-personas').value);
  const cuanto = document.getElementById('r-cuanto').value;
  const anticipo = cuanto === 'anticipo' ? (curPkg.monto_anticipo || 3000) * p : lastTotal;

  // Verificar disponibilidad antes de crear la reserva
  const { data: paquete } = await sb.from('paquetes').select('lugares_totales, lugares_vendidos').eq('nombre', curPkg.nombre).single();
  if (paquete?.lugares_totales != null && (paquete.lugares_vendidos || 0) >= paquete.lugares_totales) {
    errEl.textContent = 'Lo sentimos, este paquete ya no tiene lugares disponibles.';
    errEl.style.display = 'block';
    resetBtn();
    return;
  }

  console.log('[reserva] fechas del paquete:', curPkg.fecha_inicio, curPkg.fecha_fin, curPkg.fechas);
  const {data, error} = await sb.from('reservaciones').insert([{
    paquete_id: String(curPkg.id),
    paquete_nombre: curPkg.nombre,
    nombre, email, whatsapp,
    personas: p,
    metodo_pago: metodo,
    total: lastTotal,
    anticipo,
    fecha_inicio: curPkg.fecha_inicio || null,
    fecha_fin: curPkg.fecha_fin || null,
    grupo_id: window._grupoId || null,
    estado: 'pendiente'
  }]).select().single();
  if (error) { errEl.textContent = 'Error al guardar reserva: ' + error.message; errEl.style.display = 'block'; resetBtn(); return; }
  fetch('/api/send-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservacion_id: data.id,
      paquete_nombre: curPkg.nombre,
      nombre, email, whatsapp,
      personas: p,
      metodo_pago: metodo,
      total: lastTotal,
      anticipo,
      bank_name: localStorage.getItem('bank_name') || '',
      bank_clabe: localStorage.getItem('bank_clabe') || '',
      fecha_inicio: curPkg.fecha_inicio || '',
      fecha_fin: curPkg.fecha_fin || '',
    }),
  }).catch(e => console.error('send-confirmation:', e));
  await crearCuentaAuth(nombre, email, whatsapp);
  mostrarStep3(data, {nombre, email, p, metodo, cuanto, anticipo});
}

async function crearCuentaAuth(nombre, email, whatsapp) {
  const tempPass = 'Zip' + Math.random().toString(36).slice(2,8).toUpperCase() + '!';
  const { error: authError } = await sb.auth.signUp({
    email,
    password: tempPass,
    options: { data: { full_name: nombre, whatsapp } }
  });
  if (authError && !authError.message.includes('already registered')) {
    console.error('auth.signUp:', authError.message);
  }
  tempPassword = tempPass;
}

async function updatePassword() {
  const msgEl = document.getElementById('pass-msg');
  const email = document.getElementById('r-email').value;
  const sec = document.getElementById('new-pass-section');
  await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  msgEl.style.color = '#2e7d32';
  msgEl.textContent = '✅ Cuenta creada. Te enviamos un email para establecer tu contraseña.';
  if (sec) { sec.querySelector('input').style.display='none'; sec.querySelector('button').style.display='none'; }
}

function mostrarStep3(res, info) {
  const shortId = (res.id || '').substring(0, 8).toUpperCase();
  const metodosLabel = {transfer:'Transferencia / Depósito',card:'Contado con tarjeta','3':'Financiamiento 3 meses','6':'Financiamiento 6 meses','9':'Financiamiento 9 meses','12':'Financiamiento 12 meses','18':'Financiamiento 18 meses','24':'Financiamiento 24 meses'};
  const metodoLabel = metodosLabel[info.metodo] || info.metodo;
  let html = `<h3 style="color:#2e7d32;font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:6px;">✅ ¡Reserva recibida!</h3>
    <p style="font-size:0.82rem;color:#888;margin-bottom:16px;">Tu número de reserva: <strong style="font-size:1rem;color:var(--dark);font-family:monospace;">${shortId}</strong></p>
    <a href="viajeros.html?reservacion=${res.id}" style="display:block;width:100%;padding:14px;background:var(--red);color:white;border:none;border-radius:12px;font-family:'Plus Jakarta Sans',sans-serif;font-size:0.97rem;font-weight:700;text-align:center;text-decoration:none;box-shadow:0 4px 18px rgba(232,49,42,0.35);margin-bottom:18px;">Registrar viajeros →</a>
    <div style="background:#e8f5e9;border-radius:12px;padding:16px;margin-bottom:16px;">
      <p style="font-weight:700;font-size:0.95rem;margin-bottom:4px;">🔐 Tu cuenta</p>
      <p style="font-size:0.83rem;color:#555;margin-bottom:12px;">${info.email}</p>
      ${currentSession
        ? `<p style="font-size:0.83rem;color:#2e7d32;font-weight:600;">✅ Reserva registrada en tu cuenta. <a href="cuenta.html" style="color:var(--ocean);">Ver mis reservaciones →</a></p>`
        : `<div id="new-pass-section">
        <input type="password" id="new-password" placeholder="Establece tu contraseña" style="width:100%;padding:9px 12px;border:1.5px solid #a5d6a7;border-radius:8px;font-size:0.9rem;outline:none;margin-bottom:8px;">
        <button onclick="updatePassword()" style="width:100%;padding:9px;background:#2e7d32;color:#fff;border:none;border-radius:8px;font-size:0.88rem;font-weight:700;cursor:pointer;">Guardar contraseña</button>
        <div id="pass-msg" style="font-size:0.83rem;margin-top:6px;min-height:18px;"></div>
        <p style="text-align:center;margin-top:10px;font-size:0.8rem;color:#888;">¿Ya tienes cuenta? <a href="#" onclick="closePay();openRegister();return false;" style="color:var(--ocean);font-weight:600;">Inicia sesión →</a></p>
      </div>`}
    </div>
    <div class="cot-result">
      <div class="cot-row"><span>Paquete</span><strong>${curPkg.nombre}</strong></div>
      <div class="cot-row"><span>Personas</span><strong>${info.p}</strong></div>
      <div class="cot-row"><span>Método de pago</span><strong>${metodoLabel}</strong></div>
      <div class="cot-row highlight"><span>Total</span><strong>${fmt(lastTotal)}</strong></div>
      <div class="cot-row" style="color:#2e7d32;"><span>Pagas hoy</span><strong>${fmt(info.anticipo)}</strong></div>
    </div>`;
  if (info.metodo === 'transfer') {
    html += `<div class="bank-info" style="display:block;margin-top:12px;">
      <div class="bank-row"><span>Banco</span><strong>${localStorage.getItem('bank_name')||'—'}</strong></div>
      <div class="bank-row"><span>CLABE</span><strong>${localStorage.getItem('bank_clabe')||'—'}</strong></div>
    </div>`;
  }
  const waNum = localStorage.getItem('cfg_wa') || '529582199953';
  const waMsg = encodeURIComponent(`Hola, acabo de hacer una reserva. Paquete: ${curPkg.nombre}, Personas: ${info.p}, No. reserva: ${shortId}, Nombre: ${info.nombre}, Pago: ${metodoLabel}, Total: ${fmt(lastTotal)}, Pago hoy: ${fmt(info.anticipo)}`);
  html += `<button id="btn-whatsapp-step3" class="pay-btn" style="margin-top:18px;background:linear-gradient(135deg,#25D366,#128C7E);" onclick="window.open('https://wa.me/${waNum}?text=${waMsg}','_blank')">💬 Avisar por WhatsApp</button>`;
  document.getElementById('modal-step-3').innerHTML = html;
  if (info.metodo !== 'transfer') document.getElementById('btn-whatsapp-step3').style.display = 'none';
  document.getElementById('modal-step-2').style.display = 'none';
  document.getElementById('modal-step-3').style.display = 'block';
}

function clearDiscountMsg() { if (!activeDiscount) document.getElementById('m-disc-msg').textContent = ''; }

function clearDiscount() {
  activeDiscount = null;
  document.getElementById('m-disc-code').value = '';
  document.getElementById('m-disc-msg').textContent = '';
  document.getElementById('disc-clear-btn').style.display = 'none';
  calcCotizador();
}

async function applyDiscount() {
  const code = document.getElementById('m-disc-code').value.trim().toUpperCase();
  const msgEl = document.getElementById('m-disc-msg');
  const clearBtn = document.getElementById('disc-clear-btn');
  if (!code) return;
  const {data} = await sb.from('descuentos').select('*').eq('codigo', code).eq('activo', true).single();
  const setErr = txt => { msgEl.style.color='#c0241d'; msgEl.textContent=txt; activeDiscount=null; clearBtn.style.display='none'; };
  if (!data) { setErr('❌ Código no válido o inactivo.'); }
  else if (data.usos_maximos !== null && data.usos_actuales >= data.usos_maximos) { setErr('❌ Código agotado.'); }
  else {
    activeDiscount = data;
    clearBtn.style.display = 'inline-block';
    msgEl.style.color = '#2e7d32';
    msgEl.textContent = data.tipo === 'percent' ? `✓ Descuento de ${data.valor}% aplicado` : `✓ Descuento de ${fmt(data.valor)} aplicado`;
  }
  calcCotizador();
}

function applyDiscountToBase(basePorPersona, personas) {
  const total = basePorPersona * personas;
  if (!activeDiscount) return total;
  const descPorPersona = activeDiscount.tipo === 'percent'
    ? basePorPersona * (1 - activeDiscount.valor / 100)
    : Math.max(0, basePorPersona - activeDiscount.valor);
  return Math.max(0, descPorPersona * personas);
}

function calcCotizador() {
  if (!curPkg) return;
  const p = parseInt(document.getElementById('m-personas').value);
  const cuanto = document.getElementById('r-cuanto')?.value || 'total';
  const metodoSel = document.getElementById('m-metodo');
  const financVals = ['3','6','9','12','18','24'];
  metodoSel.querySelectorAll('option').forEach(o => { o.disabled = cuanto === 'anticipo' && financVals.includes(o.value); });
  if (cuanto === 'anticipo' && financVals.includes(metodoSel.value)) metodoSel.value = 'transfer';
  const metodo = metodoSel.value;
  const precioBase = curPkg.precio;
  const totalSinDesc = precioBase * p;
  const base = applyDiscountToBase(precioBase, p);
  const descuento = totalSinDesc - base;
  const resultEl = document.getElementById('cot-result');
  const bankEl = document.getElementById('bank-info');
  document.getElementById('m-price-base').textContent = fmt(totalSinDesc);

  let rows = `<div class="cot-row"><span>Precio base</span><strong>${fmt(precioBase)} × ${p} ${p === 1 ? 'persona' : 'personas'} = ${fmt(totalSinDesc)}</strong></div>`;
  if (descuento > 0) {
    rows += `<div class="cot-row" style="color:#2e7d32;"><span>Descuento aplicado</span><strong>-${fmt(descuento)}</strong></div>`;
  }

  if (cuanto === 'anticipo') {
    const montoAnticipo = (curPkg.monto_anticipo || 3000) * p;
    document.getElementById('r-cuanto-anticipo-opt').textContent = `Anticipo ${fmt(montoAnticipo)} — aparta todos los lugares`;
    const resto = Math.max(0, base - montoAnticipo);
    if (metodo === 'transfer') {
      document.getElementById('bank-clabe-display').textContent = localStorage.getItem('bank_clabe') || '—';
      document.getElementById('bank-name-display').textContent = localStorage.getItem('bank_name') || '—';
      bankEl.style.display = 'block';
      rows += `<div class="cot-row"><span>Comisión</span><strong style="color:#2e7d32;">Sin comisión ✓</strong></div>`;
      rows += `<div class="cot-row highlight" style="color:#2e7d32;"><span>Pagas hoy</span><strong>${fmt(montoAnticipo)}</strong></div>`;
      lastTotal = montoAnticipo;
    } else {
      bankEl.style.display = 'none';
      const cfg = STRIPE_RATES[metodo];
      const anticipoGross = grossUp(montoAnticipo, cfg.rate, cfg.flat);
      if (cfg.months === 0) {
        rows += `<div class="cot-row"><span>Comisión bancaria (anticipo)</span><strong>+${fmt(anticipoGross - montoAnticipo)}</strong></div>`;
      } else {
        rows += `<div class="cot-row"><span>Costo de financiamiento (anticipo)</span><strong>+${fmt(anticipoGross - montoAnticipo)}</strong></div>`;
        rows += `<div class="cot-row"><span>Mensualidad</span><strong>${fmt(anticipoGross / cfg.months)} × ${cfg.months} meses</strong></div>`;
      }
      rows += `<div class="cot-row highlight" style="color:#2e7d32;"><span>Pagas hoy</span><strong>${fmt(anticipoGross)}</strong></div>`;
      lastTotal = anticipoGross;
    }
    rows += `<div class="cot-row"><span>Resto (10 días antes del viaje)</span><strong>${fmt(resto)}</strong></div>`;
  } else {
    let finalTotal = base;
    if (metodo === 'transfer') {
      document.getElementById('bank-clabe-display').textContent = localStorage.getItem('bank_clabe') || '—';
      document.getElementById('bank-name-display').textContent = localStorage.getItem('bank_name') || '—';
      bankEl.style.display = 'block';
      rows += `<div class="cot-row"><span>Comisión</span><strong style="color:#2e7d32;">Sin comisión ✓</strong></div>`;
    } else {
      bankEl.style.display = 'none';
      const cfg = STRIPE_RATES[metodo];
      finalTotal = grossUp(base, cfg.rate, cfg.flat);
      if (cfg.months === 0) {
        rows += `<div class="cot-row"><span>Comisión bancaria</span><strong>+${fmt(finalTotal - base)}</strong></div>`;
      } else {
        rows += `<div class="cot-row"><span>Costo de financiamiento</span><strong>+${fmt(finalTotal - base)}</strong></div>`;
        rows += `<div class="cot-row"><span>Mensualidad</span><strong>${fmt(finalTotal / STRIPE_RATES[metodo].months)} × ${STRIPE_RATES[metodo].months} meses</strong></div>`;
      }
    }
    rows += `<div class="cot-row highlight"><span>Total a pagar</span><strong>${fmt(finalTotal)}</strong></div>`;
    lastTotal = finalTotal;
  }

  resultEl.innerHTML = rows;
}

function goWhatsApp() {
  if (!curPkg) return;
  const p = parseInt(document.getElementById('m-personas').value);
  const metodo = document.getElementById('m-metodo').value;
  const nombre = document.getElementById('m-nombre')?.value.trim() || '';
  const waContact = document.getElementById('m-contact-wa')?.value.trim() || '';
  const base = applyDiscountToBase(curPkg.precio, p);
  let payDesc;
  if (metodo === 'transfer') {
    payDesc = `Transferencia/Depósito — Total: ${fmt(base)}`;
  } else if (metodo === 'card') {
    payDesc = `Contado con tarjeta — Total: ${fmt(grossUp(base, STRIPE_RATES.card.rate, STRIPE_RATES.card.flat))}`;
  } else {
    const cfg = STRIPE_RATES[metodo];
    const total = grossUp(base, cfg.rate, cfg.flat);
    payDesc = `Financiamiento ${cfg.months} meses — ${fmt(total/cfg.months)}/mes — Total: ${fmt(total)}`;
  }
  const discLine = activeDiscount
    ? `\n🏷️ Descuento (${activeDiscount.codigo}): ${activeDiscount.tipo==='percent'?activeDiscount.valor+'%':fmt(activeDiscount.valor)}`
    : '';
  const contactLine = nombre ? `\n👤 ${nombre}${waContact ? ' · 📱 '+waContact : ''}` : '';
  const waNum = localStorage.getItem('cfg_wa') || '529582199953';
  const msg = `Hola! Me interesa el *${curPkg.nombre}* para ${p} persona${p>1?'s':''}.${contactLine}\n💰 ${payDesc}${discLine}\n\n¿Me pueden confirmar disponibilidad?`;
  window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
}
document.getElementById('pay-modal').addEventListener('click', function(e) { if (e.target===this) closePay(); });

// ---- USER AUTH ----
function openRegister() { document.getElementById('user-register').classList.add('open'); }
function closeRegister() {
  document.getElementById('user-register').classList.remove('open');
  setTimeout(backToStep1, 300);
}
function backToStep1() {
  document.getElementById('reg-step-1').style.display = 'block';
  document.getElementById('reg-step-login').style.display = 'none';
  document.getElementById('reg-step-signup').style.display = 'none';
  document.getElementById('reg-msg').style.display = 'none';
}
async function signInGoogle() {
  const {error} = await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://www.zipolitealdesnudo.com/cuenta.html'}});
  if (error) showRegMsg('Error: '+error.message, true);
}
async function checkEmail() {
  const email = document.getElementById('reg-email').value.trim();
  if (!email) { showRegMsg('Escribe tu email', true); return; }
  showRegMsg('Verificando...', false);
  const {error} = await sb.auth.signInWithPassword({email, password: ''});
  if (error && error.message === 'Invalid login credentials') {
    document.getElementById('reg-step-1').style.display = 'none';
    document.getElementById('reg-step-login').style.display = 'block';
    document.getElementById('reg-email-show-login').textContent = email;
    document.getElementById('login-pass').value = '';
    document.getElementById('reg-msg').style.display = 'none';
    document.getElementById('login-pass').focus();
  } else {
    document.getElementById('reg-step-1').style.display = 'none';
    document.getElementById('reg-step-signup').style.display = 'block';
    document.getElementById('reg-email-show-signup').textContent = email;
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-pass').value = '';
    document.getElementById('reg-msg').style.display = 'none';
    document.getElementById('signup-name').focus();
  }
}
async function doLogin() {
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!pass) { showRegMsg('Escribe tu contraseña', true); return; }
  const {error} = await sb.auth.signInWithPassword({email, password: pass});
  if (error) showRegMsg('Error: '+error.message, true);
  else { showRegMsg('✅ ¡Bienvenido!'); setTimeout(() => { closeRegister(); window.location.href = 'cuenta.html'; }, 1200); }
}
function resetPass() {
  const email = document.getElementById('reg-email').value.trim();
  if (!email) { alert('Escribe tu email primero'); return; }
  sb.auth.resetPasswordForEmail(email, {redirectTo: window.location.origin}).then(() => showRegMsg('✅ Revisa tu email para restablecer tu contraseña'));
}
async function doSignup() {
  const email = document.getElementById('reg-email').value.trim();
  const name = document.getElementById('signup-name').value.trim();
  const pass = document.getElementById('signup-pass').value;
  if (!name || !pass) { showRegMsg('Completa todos los campos', true); return; }
  const {error} = await sb.auth.signUp({email, password: pass, options: {data: {full_name: name}}});
  if (error) showRegMsg('Error: '+error.message, true);
  else showRegMsg('✅ ¡Cuenta creada! Revisa tu email para confirmar.');
}
function showRegMsg(msg, isError=false) {
  const el = document.getElementById('reg-msg');
  el.textContent = msg; el.style.display = 'block';
  el.style.color = isError ? '#c0241d' : '#2e7d32';
  if (!isError) setTimeout(() => el.style.display = 'none', 3000);
}
document.getElementById('user-register').addEventListener('click', function(e) { if(e.target===this) closeRegister(); });

// SQL (ejecutar en Supabase para agregar columnas a paquetes):
// alter table paquetes add column if not exists lugares_totales integer default null;
// alter table paquetes add column if not exists lugares_vendidos integer default 0;
// alter table paquetes add column if not exists fecha_inicio date default null;
// alter table paquetes add column if not exists fecha_fin date default null;

async function loadNotifCenter() {
  const { data } = await sb.from('push_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const list = document.getElementById('notif-center-list');
  const badge = document.getElementById('notif-badge');

  if (!data?.length) {
    list.innerHTML = '<p class="notif-empty">Sin notificaciones aún 🔔</p>';
    return;
  }

  const read = JSON.parse(localStorage.getItem('notif_read') || '[]');
  const unread = data.filter(n => !read.includes(n.id));

  if (unread.length > 0) {
    badge.textContent = unread.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  list.innerHTML = data.map(n => `
    <div class="notif-item ${read.includes(n.id) ? 'read' : 'unread'}"
         data-id="${n.id}"
         data-url="${n.url || ''}"
         style="cursor:pointer">
      ${n.image ? `<img src="${n.image}" class="notif-item-img">` : ''}
      <div class="notif-item-body">
        <strong>${n.title}</strong>
        <p>${n.body}</p>
        <small>${new Date(n.created_at).toLocaleDateString('es-MX', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small>
      </div>
      ${!read.includes(n.id) ? '<span class="notif-dot"></span>' : ''}
    </div>
  `).join('');

  list.addEventListener('click', function(e) {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    const id = item.dataset.id;
    const url = item.dataset.url;

    const read = JSON.parse(localStorage.getItem('notif_read') || '[]');
    if (!read.includes(id)) {
      read.push(id);
      localStorage.setItem('notif_read', JSON.stringify(read));
    }

    window.open(`/notificacion.html?id=${id}`, '_blank');

    loadNotifCenter();
  }, { once: true });
}

function toggleNotifCenter() {
  const center = document.getElementById('notif-center');
  const isOpen = center.style.display !== 'none';
  center.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadNotifCenter();
}

document.addEventListener('click', function(e) {
  const center = document.getElementById('notif-center');
  const bell = document.querySelector('.notif-bell');
  if (center && bell &&
      !center.contains(e.target) &&
      !bell.contains(e.target)) {
    center.style.display = 'none';
  }
});


function markAllRead() {
  sb.from('push_history').select('id').then(({data}) => {
    if (data) {
      localStorage.setItem('notif_read', JSON.stringify(data.map(n => n.id)));
      document.getElementById('notif-badge').style.display = 'none';
      loadNotifCenter();
    }
  });
}

async function openBlogDrawer(id) {
  const overlay = document.getElementById('blog-drawer-overlay');
  const drawer = document.getElementById('blog-drawer');
  const content = document.getElementById('blog-drawer-content');
  overlay.classList.add('active');
  drawer.classList.add('active');
  document.body.style.overflow = 'hidden';
  content.innerHTML = '<div style="text-align:center;padding:40px">⏳ Cargando...</div>';
  const { data } = await sb.from('blog').select('*').eq('id', id).single();
  if (!data) { content.innerHTML = '<p>Error al cargar</p>'; return; }
  content.innerHTML = `
    <div style="margin:-24px -20px 0;position:relative;min-height:200px">
      ${data.imagen
        ? `<img src="${data.imagen}" style="width:100%;height:260px;object-fit:cover;display:block">`
        : `<div style="height:200px;background:linear-gradient(135deg,#0d1b3e,#0891b2)"></div>`
      }
      <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 50%);display:flex;align-items:flex-end;padding:24px 20px">
        <div>
          <span style="display:inline-block;background:rgba(255,255,255,0.2);backdrop-filter:blur(8px);color:white;font-size:0.72rem;font-weight:700;padding:4px 12px;border-radius:999px;margin-bottom:10px;letter-spacing:1px">
            BLOG & GUÍAS
          </span>
          <h2 style="color:white;font-size:1.4rem;font-weight:900;line-height:1.3;margin:0">
            ${data.titulo}
          </h2>
          <p style="color:rgba(255,255,255,0.7);font-size:0.8rem;margin:6px 0 0">
            ${new Date(data.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
      </div>
    </div>

    <div class="blog-drawer-body">
      ${(data.contenido||'').split('\n').filter(p=>p.trim()).map(p=>
        `<p style="margin:0 0 18px">${p}</p>`
      ).join('')}

      <div style="margin-top:36px">
        <a href="#paquetes" onclick="closeBlogDrawer()"
          style="display:block;background:linear-gradient(135deg,#e63946,#c1121f);color:white;text-align:center;padding:16px;border-radius:999px;font-size:1rem;font-weight:700;text-decoration:none">
          🏖️ Ver paquetes de viaje
        </a>
      </div>
    </div>
  `;
}
function closeBlogDrawer() {
  document.getElementById('blog-drawer-overlay').classList.remove('active');
  document.getElementById('blog-drawer').classList.remove('active');
  document.body.style.overflow = '';
}

// Check auth state on load
sb.auth.onAuthStateChange((event, session) => {
  const btn = document.querySelector('a[onclick="openRegister();return false;"]');
  if (session && btn) {
    const name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
    btn.textContent = '👤 ' + name;
    btn.removeAttribute('onclick');
    btn.href = 'cuenta.html';
  } else if (!session && btn) {
    btn.textContent = '👤 Mi cuenta';
    btn.href = '#';
    btn.setAttribute('onclick', 'openRegister();return false;');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'true') {
    window.history.replaceState({}, document.title, window.location.pathname);
    document.getElementById('admin-login').classList.add('open');
    setTimeout(() => document.getElementById('admin-pwd').focus(), 100);
  }

  if (window.location.hash.includes('access_token') && window.location.hash.includes('type=recovery')) {
    window.location.href = 'cuenta.html' + window.location.hash;
    return;
  }
  const _slugParam = new URLSearchParams(window.location.search).get('paquete');
  if (_slugParam) { pendingSlug = _slugParam; } else { window.scrollTo(0, 0); }

  const grupoParam = new URLSearchParams(window.location.search).get('grupo');
  if (grupoParam) {
    (async () => {
      const { data: grupo } = await sb.from('grupos').select('*').eq('codigo', grupoParam).single();
      if (grupo) {
        window.history.replaceState({}, document.title, window.location.pathname);
        window._grupoId = grupo.id;
        window._grupoData = grupo;
        mostrarBannerGrupo(grupo);
        setTimeout(() => openPay(grupo.paquete_id), 500);
      }
    })();
  }
  if (typeof Stripe !== 'undefined') stripeClient = Stripe('pk_live_51TTtl8GZiSqY5s2qtJhc06lhXuoCUBFFRNN8kZa7XJtnwpwjaHWnkkXolOEYk5XywllFXXQeD6sAbAIehdTCdt4M00EtP6jfWW');
  loadAll();
  checkFirstTimeSetup();
  if (sessionStorage.getItem('adminToken')) {
    (async () => {
      const token = sessionStorage.getItem('adminToken');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch('/api/admin-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.valid) openAdmin();
        else { sessionStorage.removeItem('adminToken'); adminAuthenticated = false; }
      } catch(e) {
        clearTimeout(timeout);
      }
    })();
  }
  if (window.location.hash === '#login') { openRegister(); window.location.hash = ''; }
});

document.addEventListener('keydown', e => {
  if (e.shiftKey && e.altKey && e.key === 'A') { e.preventDefault(); openAdminLogin(); }
});

(function initAdminTapZone() {
  let tapCount = 0;
  let tapTimer = null;
  const zone = document.getElementById('admin-tap-zone');
  if (!zone) return;
  zone.addEventListener('click', () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
    if (tapCount >= 5) {
      tapCount = 0;
      clearTimeout(tapTimer);
      document.getElementById('admin-login').classList.add('open');
      setTimeout(() => document.getElementById('admin-pwd').focus(), 100);
    }
  });
})();

function toggleMobileMenu() {
  const nav = document.getElementById('nav-links');
  const btn = document.getElementById('hamburger');
  const open = nav.classList.toggle('mobile-open');
  btn.textContent = open ? '✕' : '☰';
  btn.setAttribute('aria-expanded', open);
}

document.addEventListener('click', function(e) {
  const nav = document.getElementById('nav-links');
  const btn = document.getElementById('hamburger');
  if (nav.classList.contains('mobile-open') && !nav.contains(e.target) && e.target !== btn) {
    nav.classList.remove('mobile-open');
    btn.textContent = '☰';
    btn.setAttribute('aria-expanded', 'false');
  }
});

document.querySelectorAll('#nav-links a').forEach(function(link) {
  link.addEventListener('click', function() {
    const nav = document.getElementById('nav-links');
    const btn = document.getElementById('hamburger');
    nav.classList.remove('mobile-open');
    btn.textContent = '☰';
    btn.setAttribute('aria-expanded', 'false');
  });
});

let lbImages = [];
let lbIndex = 0;
function openLightbox(index) {
  lbIndex = index;
  const lb = document.getElementById('lb-overlay');
  document.getElementById('lb-img').src = lbImages[lbIndex].url;
  document.getElementById('lb-img').alt = lbImages[lbIndex].descripcion || 'Zipolite';
  document.getElementById('lb-counter').textContent = `${lbIndex + 1} / ${lbImages.length}`;
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function lbNav(dir) {
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  document.getElementById('lb-img').src = lbImages[lbIndex].url;
  document.getElementById('lb-img').alt = lbImages[lbIndex].descripcion || 'Zipolite';
  document.getElementById('lb-counter').textContent = `${lbIndex + 1} / ${lbImages.length}`;
}
let testiIndex = 0;
document.addEventListener('DOMContentLoaded', () => {
  testiIndex = 0;
  const track = document.getElementById('testi-track');
  if (track) track.style.transform = 'translateX(0)';
});
function testiNav(dir) {
  const track = document.getElementById('testi-track');
  const cards = track.querySelectorAll('.testi-card');
  const visible = window.innerWidth <= 768 ? 1 : 3;
  const max = Math.max(0, cards.length - visible);
  testiIndex = Math.min(Math.max(testiIndex + dir, 0), max);
  const cardWidth = cards[0].offsetWidth + 24;
  track.style.transform = `translateX(-${testiIndex * cardWidth}px)`;
}
function toggleFaq(btn) {
  const item = btn.parentElement;
  const answer = item.querySelector('.faq-a');
  const icon = btn.querySelector('span');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el => {
    el.classList.remove('open');
    el.querySelector('.faq-a').style.maxHeight = '0';
    el.querySelector('.faq-q span').textContent = '+';
  });
  if (!isOpen) {
    item.classList.add('open');
    answer.style.maxHeight = answer.scrollHeight + 'px';
    icon.textContent = '−';
  }
}
function closeLightbox() {
  document.getElementById('lb-overlay').classList.remove('active');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') lbNav(1);
  if (e.key === 'ArrowLeft') lbNav(-1);
  if (e.key === 'Escape') closeLightbox();
});
document.addEventListener('contextmenu', e => {
  if (e.target.tagName==='IMG' && (e.target.closest('#gal-container')||e.target.id==='lb-img')) e.preventDefault();
}, true);
document.addEventListener('dragstart', e => {
  if (e.target.tagName==='IMG' && (e.target.closest('#gal-container')||e.target.id==='lb-img')) e.preventDefault();
}, true);

let deferredPrompt;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.querySelectorAll('.pwa-install-btn')
    .forEach(btn => btn.style.display = 'flex');
});

window.addEventListener('appinstalled', () => {
  document.querySelectorAll('.pwa-install-btn')
    .forEach(btn => btn.style.display = 'none');
  deferredPrompt = null;
});

// En móvil siempre mostrar el botón
if (isMobile) {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.pwa-install-btn')
      .forEach(btn => btn.style.display = 'flex');
  });
}

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.then(() => deferredPrompt = null);
  } else if (isIOS) {
    alert('Para instalar la app:\nToca el botón compartir ↑ → "Añadir a pantalla de inicio"');
  } else if (isMobile) {
    alert('Para instalar la app:\nToca el menú ⋮ → "Añadir a pantalla de inicio"');
  }
}

/*
  SQL para crear la tabla cotizaciones en Supabase (ejecutar en SQL Editor):

  CREATE TABLE IF NOT EXISTS public.cotizaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT NOT NULL,
    destino TEXT NOT NULL,
    ciudad_salida TEXT NOT NULL,
    fecha_salida DATE NOT NULL,
    fecha_regreso DATE NOT NULL,
    num_viajeros TEXT NOT NULL,
    presupuesto TEXT,
    comentarios TEXT,
    estado TEXT DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT NOW()
  );
  ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON public.cotizaciones FOR ALL USING (true);
*/

// ---- COTIZACIÓN PÚBLICA ----

(function initCotizacionDates() {
  const today = new Date().toISOString().split('T')[0];
  const salida = document.getElementById('cot-salida');
  const regreso = document.getElementById('cot-regreso');
  if (salida) { salida.min = today; salida.value = ''; }
  if (regreso) { regreso.min = today; regreso.value = ''; }
})();

function toggleOtraCiudad(val) {
  const wrap = document.getElementById('cot-otra-wrap');
  const input = document.getElementById('cot-otra-ciudad');
  const show = val === 'Otra';
  wrap.style.display = show ? 'flex' : 'none';
  input.required = show;
}

function updateFechaRegreso() {
  const salida = document.getElementById('cot-salida').value;
  const regreso = document.getElementById('cot-regreso');
  if (salida) {
    regreso.min = salida;
    if (regreso.value && regreso.value < salida) regreso.value = '';
  }
}

async function submitCotizacion(e) {
  e.preventDefault();
  const btn = document.getElementById('cot-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const ciudadVal = document.getElementById('cot-ciudad').value;
  const ciudadFinal = ciudadVal === 'Otra'
    ? (document.getElementById('cot-otra-ciudad').value.trim() || 'Otra')
    : ciudadVal;

  const payload = {
    nombre: document.getElementById('cot-nombre').value.trim(),
    whatsapp: document.getElementById('cot-wa').value.trim(),
    email: document.getElementById('cot-email').value.trim(),
    destino: document.getElementById('cot-destino').value.trim(),
    ciudad_salida: ciudadFinal,
    fecha_salida: document.getElementById('cot-salida').value,
    fecha_regreso: document.getElementById('cot-regreso').value,
    num_viajeros: document.getElementById('cot-viajeros').value,
    presupuesto: document.getElementById('cot-presupuesto').value,
    comentarios: document.getElementById('cot-comentarios').value.trim(),
    estado: 'pendiente'
  };

  const { error } = await sb.from('cotizaciones').insert(payload);

  if (error) {
    alert('Error al enviar: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'Solicitar cotización gratuita →';
    return;
  }

  fetch('/api/notify-cotizacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});

  document.getElementById('form-cotizacion').reset();
  document.getElementById('cot-otra-wrap').style.display = 'none';
  document.getElementById('cot-otra-ciudad').required = false;
  const success = document.getElementById('cot-success');
  success.style.display = 'block';
  btn.disabled = false;
  btn.textContent = 'Solicitar cotización gratuita →';
  setTimeout(() => success.style.display = 'none', 7000);
}

async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const reg = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'BIC4z8vU4bWH0KAOvgi5YXmzuRU3EkbCOsDuTeKJn1bhjDCqSTOVh1LBHRaRMNVp54ho1JnntgC4kxz2qJsnYEg'
  });

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub)
  });
}

window.addEventListener('load', () => {
  setTimeout(registerPush, 3000);
});
