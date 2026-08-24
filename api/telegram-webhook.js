import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_HISTORIAL = 8;

// ─── CACHÉ DE PAQUETES ───────────────────────────────────────

let pkgCache = null;
let pkgCacheTime = 0;
const PKG_CACHE_MS = 10 * 60 * 1000; // 10 minutos

async function getPaqueteData() {
  if (pkgCache && Date.now() - pkgCacheTime < PKG_CACHE_MS) return pkgCache;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const [{ data: paquetes }, { data: variantes }, { data: tours }, resenaResult] = await Promise.all([
    sb.from('paquetes').select('*').eq('activo', true).order('created_at'),
    sb.from('variantes_paquete').select('*').eq('activo', true).order('orden'),
    sb.from('tours_paquete').select('*').eq('activo', true).order('orden'),
    sb.from('testimonios').select('nombre, texto, paquete').limit(5).catch(() => ({ data: null }))
  ]);
  const resenas = resenaResult?.data || null;
  pkgCache = {
    paquetes: (paquetes || []).map(p => ({
      ...p,
      variantes: (variantes || []).filter(v => v.paquete_id === p.id),
      tours: (tours || []).filter(t => t.paquete_id === p.id)
    })),
    resenas
  };
  pkgCacheTime = Date.now();
  return pkgCache;
}

// ─── TEXTOS Y BOTONES ────────────────────────────────────────

const MENU_PRINCIPAL = {
  text: `🌊 *¡Hola! Soy Mateo* 🌈\n\nAsesor de Zipolite al Desnudo — más de 10 años llevando a la comunidad LGBT+ a la playa más libre de México.\n\n+342 viajeros ya vivieron esto. ¿Tú cuándo te unes?`,
  buttons: [
    [{ text: '🏕️ Año Nuevo al Desnudo', callback_data: 'pkg_anonuevo' }],
    [{ text: '🌙 Lunas de Octubre', callback_data: 'pkg_lunas' }],
    [{ text: '💳 Métodos de pago', callback_data: 'info_pagos' }],
    [{ text: '❓ Preguntas frecuentes', callback_data: 'faq_menu' }],
    [{ text: '📞 Agendar una llamada', callback_data: 'agendar_dia' }],
    [{ text: '🙋 Hablar con un asesor', callback_data: 'asesor' }]
  ]
};

const RESPUESTAS = {
  pkg_anonuevo: {
    text: `🏕️ *Año Nuevo al Desnudo*\n\n📅 29 dic 2026 → 3 ene 2027 · 5 días / 4 noches\n💰 Desde $4,750 por persona\n\n🚌 Salida CDMX: 29 dic · 10:00pm (cita 9:30pm)\n🏠 Regreso: 3 ene · 6:00pm · Llegada CDMX madrugada 4 ene\n\n✅ *¿QUÉ INCLUYE?*\n🏕️ Camping en área privada de 5 hectáreas:\n• Alberca · Duchas · Sanitarios · Electricidad · Seguridad 24/7\n• A 2 calles de la playa y 1 calle del adoquín\n• Por promoción: tienda y colchón inflable en préstamo\n\n🚌 Autobús con chofer certificado SCT, seguro de viajero, WC, pantallas y cargadores USB\n\n🌅 Day Pass incluido el último día — te quedas en instalaciones hasta las 6pm\n\n📅 *ITINERARIO*\n30 dic — Llegada a Zipolite. Día libre 🌊\n31 dic — Tour Mazunte + Punta Cometa 🌅 → Cena grupal organizada en Restaurante 3 de Diciembre* → Bar en playa · show drag · fuegos artificiales · Año Nuevo 🎆\n1 ene — Día libre 🏖️\n2 ene — Opcional: Carrizalillo + Bioluminiscencia Laguna Manialtepec ✨ (+$1,000 por persona)\n3 ene — Regreso CDMX (cita 5:30pm)\n\n*La cena y todos los consumos van por cuenta de cada viajero. En Zipolite no existe el todo incluido.\n\n🛏️ *¿QUIERES MÁS COMODIDAD?*\nHotel rústico · Cama matrimonial · Baño privado · Ventilador\n• 1 persona en habitación: $10,750 por persona — aparta con $3,000\n• 2 personas en habitación: $7,750 por persona — aparta con $3,000 por persona\n⚠️ Solo 5 habitaciones disponibles\n\n🏕️ Camping: $4,750 por persona — aparta con $1,500\n\n¿Te vas con nosotros? 🔥`,
    buttons: [
      [{ text: '✅ ¡Quiero reservar!', callback_data: 'reservar_anonuevo' }],
      [{ text: '🛏️ Info habitaciones', callback_data: 'habitacion_info' }],
      [{ text: '🌊 Tour opcional +$1,000', callback_data: 'tour_opcional' }],
      [{ text: '💳 Formas de pago', callback_data: 'info_pagos' }],
      [{ text: '📞 Prefiero que me llamen', callback_data: 'agendar_dia' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  pkg_lunas: {
    text: `🌙 *Lunas de Octubre*\n\n📅 22 → 27 octubre 2026 · 6 días / 5 noches\n💰 $8,854 por persona\n\n✈️ *VUELO REDONDO CDMX INCLUIDO*\n• Salida: jue 22 oct · 12:00pm desde AICM\n• Regreso: mar 27 oct · 10:32pm\n\n✅ *¿QUÉ INCLUYE?*\n• Vuelo redondo Ciudad de México ↔ Zipolite\n• 5 noches en Hotel Paraíso — línea de playa 🌊\n• Habitación doble\n• Traslados aeropuerto ↔ hotel\n\nTodo el viaje organizado. Solo llega y disfruta.\n\n💰 Aparta tu lugar con $3,500 por persona\n\n⚠️ Alimentos, bebidas y gastos personales van por cuenta de cada viajero. En Zipolite no existe el todo incluido.\n\n¿Te lo agendamos? 🌙`,
    buttons: [
      [{ text: '✅ ¡Quiero reservar!', callback_data: 'reservar_lunas' }],
      [{ text: '💳 Formas de pago', callback_data: 'info_pagos' }],
      [{ text: '📞 Prefiero que me llamen', callback_data: 'agendar_dia' }],
      [{ text: '🙋 Tengo preguntas', callback_data: 'asesor' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  info_pagos: {
    text: `💳 *Formas de pago*\n\n🏦 *Transferencia o depósito bancario*\n• Sin cargos adicionales\n• Confirmación en 24 horas\n\n💳 *Tarjeta con financiamiento*\n• 3, 6, 9, 12, 18 o 24 meses\n• Se aplica cargo por financiamiento\n\nEn ambos casos apartas tu lugar con el anticipo y liquidas el resto antes del viaje. Tu lugar queda asegurado desde el primer pago. ✅`,
    buttons: [
      [{ text: '🏕️ Año Nuevo al Desnudo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🌙 Lunas de Octubre', callback_data: 'pkg_lunas' }],
      [{ text: '📞 Agendar llamada', callback_data: 'agendar_dia' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_menu: {
    text: '❓ *Preguntas frecuentes*\n\n¿Sobre qué tienes dudas? 👇',
    buttons: [
      [{ text: '🌊 ¿Qué es Zipolite?', callback_data: 'faq_zipolite' }],
      [{ text: '👙 ¿Tengo que ser nudista?', callback_data: 'faq_nudismo' }],
      [{ text: '👤 ¿Puedo ir solo?', callback_data: 'faq_solo' }],
      [{ text: '🏳️‍🌈 ¿Solo es para LGBT+?', callback_data: 'faq_lgbt' }],
      [{ text: '❌ ¿Qué pasa si cancelo?', callback_data: 'faq_cancelacion' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_zipolite: {
    text: `🌊 *¿Qué es Zipolite?*\n\nZipolite es la playa más libre de México, en Oaxaca. Un lugar donde puedes ser tú mismo sin filtros ni juicios. Ambiente relajado, naturaleza increíble y una comunidad que te recibe como eres. 🌴\n\nEs uno de los pocos destinos en México donde la libertad no es un concepto — es la forma de vivir.`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_nudismo: {
    text: `👙 *¿Tengo que ser nudista?*\n\nPara nada. Nadie está obligado a nada. Tú decides cómo vivir la experiencia, siempre desde el respeto y tu comodidad.\n\nHay quienes van en traje de baño todo el tiempo y también quienes se sueltan poco a poco. Lo importante es que te sientas libre a tu manera. 😊`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_solo: {
    text: `👤 *¿Puedo ir solo?*\n\nSí, y es de lo más común. Muchos de nuestros viajeros llegan solos y regresan con amistades nuevas para toda la vida.\n\nNuestros grupos están diseñados para que desde antes de salir ya te sientas acompañado. Llegas solo, regresas en familia. 🌈`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_lgbt: {
    text: `🏳️‍🌈 *¿Solo es para LGBT+?*\n\nSomos una agencia 100% LGBT+ friendly. Nuestros grupos tienen principalmente viajeros LGBT+, aliados y personas con buena vibra.\n\nNo importa quién seas — lo importante es el respeto y las ganas de pasarla bien. Aquí no tienes que encajar... solo llegar. 💛`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  faq_cancelacion: {
    text: `❌ *¿Qué pasa si cancelo?*\n\nEl anticipo no es reembolsable ya que se usa para asegurar tu lugar desde el momento en que reservas.\n\nSi cancelas con más de 30 días de anticipación, se reembolsa el saldo adicional que hayas pagado.\n\nTe explicamos todo claramente desde el inicio — sin letras chiquitas. 📋`,
    buttons: [
      [{ text: '⬅️ Más preguntas', callback_data: 'faq_menu' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  habitacion_info: {
    text: `🛏️ *Habitaciones — Año Nuevo al Desnudo*\n\nHotel rústico a 2 calles de la playa y a calle y media del adoquín:\n• Cama matrimonial\n• Baño privado\n• Ventilador de techo\n\n💰 *Precios por persona:*\n• 1 persona en habitación: $10,750 — aparta con $3,000\n• 2 personas en habitación: $7,750 — aparta con $3,000 por persona\n\n⚠️ Solo 5 habitaciones disponibles — se agotan rápido\n\n¿Apartamos la tuya?`,
    buttons: [
      [{ text: '✅ Quiero reservar con habitación', callback_data: 'reservar_anonuevo' }],
      [{ text: '📞 Prefiero que me llamen', callback_data: 'agendar_dia' }],
      [{ text: '⬅️ Ver paquete completo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  tour_opcional: {
    text: `🌊 *Tour opcional — 2 de enero*\n\nUno de los días más especiales del viaje:\n\n🏖️ *Playa Carrizalillo — Puerto Escondido*\nUna de las playas más bonitas de Oaxaca. Aguas turquesas, arena blanca.\n\n✨ *Laguna de Manialtepec — Bioluminiscencia*\nAl caer la noche abordamos una lancha y nadamos en aguas que brillan como estrellas. Una experiencia que no olvidarás.\n\n✅ *Incluye:*\n• Transporte Zipolite → Carrizalillo → Manialtepec → Zipolite\n• Entrada a Laguna de Manialtepec\n• Tour en lancha · Guía local · Chaleco salvavidas\n\n💰 *$1,000 por persona* (costo adicional al paquete)\n\n¿Te apuntas?`,
    buttons: [
      [{ text: '✅ ¡Me apunto al tour!', callback_data: 'reservar_anonuevo' }],
      [{ text: '⬅️ Ver paquete completo', callback_data: 'pkg_anonuevo' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  reservar_anonuevo: {
    text: `🎉 *¡Excelente decisión!*\n\nPara reservar tu lugar en Año Nuevo al Desnudo:\n👉 https://zipolitealdesnudo.com/?paquete=ano-nuevo-al-desnudo\n\nAparta con $1,500 por persona (glamping) o $3,000 por persona (habitación).\n\nTu lugar queda confirmado desde el primer pago. ✅`,
    buttons: [
      [{ text: '📞 Prefiero que me llamen', callback_data: 'agendar_dia' }],
      [{ text: '🙋 Tengo una duda', callback_data: 'asesor' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  reservar_lunas: {
    text: `🎉 *¡Excelente decisión!*\n\nPara reservar tu lugar en Lunas de Octubre:\n👉 https://zipolitealdesnudo.com/?paquete=lunas-de-octubre\n\nAparta con $3,500 por persona y el resto lo pagas antes del viaje.\n\nTu lugar queda confirmado desde el primer pago. ✅`,
    buttons: [
      [{ text: '📞 Prefiero que me llamen', callback_data: 'agendar_dia' }],
      [{ text: '🙋 Tengo una duda', callback_data: 'asesor' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  asesor: {
    text: `🙋 *Hablar con un asesor*\n\nLe aviso a un asesor ahora mismo que quieres información.\n\nEn breve alguien se comunicará contigo por este mismo chat. 🌊`,
    buttons: [
      [{ text: '📞 O agendamos una llamada', callback_data: 'agendar_dia' }],
      [{ text: '🏠 Menú principal', callback_data: 'menu' }]
    ]
  },

  agendar_dia: {
    text: `📞 *Agendemos tu llamada*\n\n¿Cuándo prefieres que te llamemos?`,
    buttons: [
      [{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }],
      [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
    ]
  }
};

const SALUDOS = ['hola', 'hi', 'buenas', 'hey', 'inicio', 'start', 'info', 'ayuda', 'help', 'menu', 'menú', 'buenos días', 'buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'buen día'];

// ─── HELPERS DE MENSAJES DINÁMICOS ───────────────────────────

function slugify(nombre) {
  return (nombre || '')
    .toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function buildPaqueteMsg(p) {
  let msg = `🌴 *${p.nombre}*\n`;
  if (p.fechas) msg += `📅 ${p.fechas}\n`;
  msg += `\n*Modalidades disponibles:*\n`;
  (p.variantes || []).forEach(v => {
    const disp = v.lugares_totales
      ? ` _(${v.lugares_totales - (v.lugares_vendidos || 0)} disponibles)_`
      : '';
    const ant = v.anticipo_es_total
      ? ' _(pago completo)_'
      : ` _(anticipo $${(v.anticipo || 0).toLocaleString('es-MX')})_`;
    msg += `• *${v.nombre}*: $${(v.precio || 0).toLocaleString('es-MX')} p/persona${ant}${disp}\n`;
  });
  if (p.tours && p.tours.length > 0) {
    msg += `\n🗺 *Tours opcionales:*\n`;
    p.tours.forEach(t => {
      msg += `• ${t.nombre}: +$${(t.precio || 0).toLocaleString('es-MX')}\n`;
    });
  }
  if (p.nota) msg += `\n⚠️ _${p.nota}_\n`;
  msg += `\n✅ Reserva en: https://zipolitealdesnudo.com/?paquete=${slugify(p.nombre)}`;
  return msg;
}

function varianteIcon(nombre) {
  if (!nombre) return '🌴';
  const n = nombre.toLowerCase();
  if (n.includes('glamping') || n.includes('camping')) return '🏕️';
  if (n.includes('individual')) return '🛏️';
  if (n.includes('doble')) return '🛏️🛏️';
  if (n.includes('transport') || n.includes('autobús') || n.includes('autobus')) return '🚌';
  return '🌴';
}

function buildVarianteButtons(p) {
  const varianteBtns = (p.variantes || []).map(v => ([{
    text: `${varianteIcon(v.nombre)} ${v.nombre} — $${(v.precio || 0).toLocaleString('es-MX')}`,
    callback_data: `var_${v.id}`
  }]));
  const tourBtns = (p.tours || []).map(t => ([{
    text: `🗺 ${t.nombre} +$${(t.precio || 0).toLocaleString('es-MX')}`,
    callback_data: 'tour_opcional'
  }]));
  return [
    ...varianteBtns,
    ...tourBtns,
    [{ text: '📞 Agendar llamada', callback_data: 'agendar_dia' }],
    [{ text: '⬅️ Menú principal', callback_data: 'menu' }]
  ];
}

function refreshRespuestas(paquetes) {
  const anoNuevo = paquetes.find(p => slugify(p.nombre).includes('ano-nuevo'));
  const lunas = paquetes.find(p => slugify(p.nombre).includes('lunas'));

  if (anoNuevo) {
    const glamping = anoNuevo.variantes.find(v => v.nombre.toLowerCase().includes('glamping') || v.nombre.toLowerCase().includes('camping'));
    const habDoble = anoNuevo.variantes.find(v => v.nombre.toLowerCase().includes('doble'));
    const habIndiv = anoNuevo.variantes.find(v => v.nombre.toLowerCase().includes('individual'));

    if (glamping || habDoble || habIndiv) {
      const lines = [];
      if (habIndiv) lines.push(`• 1 persona en habitación: $${(habIndiv.precio || 0).toLocaleString('es-MX')} — aparta con $${(habIndiv.anticipo || 0).toLocaleString('es-MX')}`);
      if (habDoble) lines.push(`• 2 personas en habitación: $${(habDoble.precio || 0).toLocaleString('es-MX')} — aparta con $${(habDoble.anticipo || 0).toLocaleString('es-MX')} por persona`);
      const dispHab = habIndiv?.lugares_totales
        ? `\n⚠️ Solo ${habIndiv.lugares_totales - (habIndiv.lugares_vendidos || 0)} habitaciones disponibles — se agotan rápido`
        : '\n⚠️ Habitaciones limitadas — se agotan rápido';

      RESPUESTAS.habitacion_info.text = `🛏️ *Habitaciones — Año Nuevo al Desnudo*\n\nHotel rústico a 2 calles de la playa y a calle y media del adoquín:\n• Cama matrimonial\n• Baño privado\n• Ventilador de techo\n\n💰 *Precios por persona:*\n${lines.join('\n')}${dispHab}\n\n¿Apartamos la tuya?`;

      if (glamping) {
        const gAnt = glamping.anticipo || 1500;
        const hAnt = habDoble?.anticipo || habIndiv?.anticipo || 3000;
        RESPUESTAS.reservar_anonuevo.text = `🎉 *¡Excelente decisión!*\n\nPara reservar tu lugar en Año Nuevo al Desnudo:\n👉 https://zipolitealdesnudo.com/?paquete=ano-nuevo-al-desnudo\n\nAparta con $${gAnt.toLocaleString('es-MX')} por persona (glamping) o $${hAnt.toLocaleString('es-MX')} por persona (habitación).\n\nTu lugar queda confirmado desde el primer pago. ✅`;
      }
    }
  }

  if (lunas) {
    const v = lunas.variantes[0];
    if (v) {
      RESPUESTAS.reservar_lunas.text = `🎉 *¡Excelente decisión!*\n\nPara reservar tu lugar en Lunas de Octubre:\n👉 https://zipolitealdesnudo.com/?paquete=${slugify(lunas.nombre)}\n\nAparta con $${(v.anticipo || 3500).toLocaleString('es-MX')} por persona y el resto lo pagas antes del viaje.\n\nTu lugar queda confirmado desde el primer pago. ✅`;
    }
  }
}

function buildMenuButtons(paquetes) {
  const pkgBtns = (paquetes || []).map(p => ([{
    text: `${p.icono || '🌴'} ${p.nombre}`,
    callback_data: `pkg_${p.id}`
  }]));
  return [
    ...pkgBtns,
    [{ text: '💳 Métodos de pago', callback_data: 'info_pagos' }],
    [{ text: '❓ Preguntas frecuentes', callback_data: 'faq_menu' }],
    [{ text: '📞 Agendar una llamada', callback_data: 'agendar_dia' }],
    [{ text: '🙋 Hablar con un asesor', callback_data: 'asesor' }]
  ];
}

// ─── SISTEMA PROMPT ──────────────────────────────────────────

function buildSystemPrompt(paquetes, resenas) {
  let pkgsInfo = '';
  (paquetes || []).forEach((p, i) => {
    pkgsInfo += `\n${i + 1}. ${p.nombre.toUpperCase()}\n`;
    pkgsInfo += `   - Fechas: ${p.fechas || 'por confirmar'}\n`;
    (p.variantes || []).forEach(v => {
      const disponibles = v.lugares_totales
        ? ` · ${v.lugares_totales - (v.lugares_vendidos || 0)} lugares disponibles`
        : '';
      const anticipoInfo = v.anticipo_es_total
        ? 'pago completo al reservar'
        : `anticipo $${(v.anticipo || 0).toLocaleString('es-MX')}/persona`;
      pkgsInfo += `   - ${v.nombre}: $${(v.precio || 0).toLocaleString('es-MX')}/persona · ${anticipoInfo}${disponibles}\n`;
    });
    (p.tours || []).forEach(t => {
      pkgsInfo += `   - Tour opcional ${t.nombre}: +$${(t.precio || 0).toLocaleString('es-MX')}/persona\n`;
    });
    if (p.nota) pkgsInfo += `   ⚠️ ${p.nota}\n`;
  });

  let prompt = `Eres Mateo, asesor de ventas de Zipolite al Desnudo, agencia LGBT+ mexicana con más de 10 años de experiencia y +342 viajeros. Eres cálido, directo y experto en cerrar ventas. Tu objetivo principal es que el usuario reserve.

SOBRE LA AGENCIA:
- Especialistas en viajes LGBT+ a Zipolite, Oaxaca
- +10 años creando experiencias, +342 viajeros satisfechos, 5 estrellas
- Ambiente 100% seguro, inclusivo y libre de discriminación
- Comunidad real: llegas solo y regresas con amigos

PAQUETES ACTUALES:${pkgsInfo}
PAGOS: Transferencia/depósito (sin cargo extra) o tarjeta con financiamiento 3-24 meses (aplica cargo)
RESERVAS: https://zipolitealdesnudo.com

PERSONALIDAD Y ESTILO:
- Eres un vendedor consultivo, cálido y con personalidad. No eres un catálogo de precios.
- Antes de dar información, haz UNA pregunta para entender al cliente: ¿viaja solo o en grupo? ¿ya conoce Zipolite? ¿cuál es su presupuesto?
- Nunca listes todas las variantes de golpe. Recomienda la más apropiada según lo que sabes del cliente.
- Usa el nombre del cliente siempre que lo sepas.
- Mensajes cortos — máximo 4 líneas por respuesta. Si necesitas dar más info, hazlo en dos mensajes o con botones.
- Termina SIEMPRE con una pregunta que avance hacia el cierre o una CTA clara.

FLUJO DE CIERRE (síguelo en orden):
1. CALIFICAR → Pregunta: ¿solo o en grupo? ¿cuántas personas? ¿ya conoce Zipolite?
2. RECOMENDAR → Basado en respuestas, sugiere UNA variante específica con precio y anticipo
3. MANEJAR OBJECIONES → Si dice "está caro": habla de financiamiento y del valor. Si dice "voy solo": habla de la comunidad y de que muchos van solos.
4. CERRAR → "¿Te aparto el lugar?" Si dice sí: pide su nombre completo para la reserva
5. COBRAR → Da los datos de transferencia O el link de reserva con Clip
6. CONFIRMAR → Avisa que recibirá confirmación por email y será agregado al grupo de WhatsApp del viaje

MANEJO DE OBJECIONES:
- "Está caro" → "Entiendo. ¿Sabías que puedes apartar tu lugar con solo $1,500 y el resto pagarlo en partes? Muchos viajeros lo hacen así."
- "Voy solo" → "¡Perfecto! La mayoría llega solo. Al segundo día ya tienes nuevos amigos. ¿Quieres que te cuente cómo funciona el grupo?"
- "No sé si puedo ir" → "Las fechas son 29 dic al 4 ene. ¿Qué te lo impediría? A veces encontramos solución."
- "Lo pienso" → "Claro, tómate tu tiempo. Solo te digo que quedan [X] lugares en glamping y el año pasado se llenó. ¿Qué necesitas saber para decidirte?"

SOBRE OPINIONES Y RESEÑAS:
- Puedes mencionar que tenemos más de 342 viajeros satisfechos y reseñas de 5 estrellas
- Algunos testimonios reales: "Fue una gran experiencia, les agradezco a cada uno" — Gonzalo; "Me la pasé increíble" — Isaac; "Un gusto conocerles" — Luis Ángel (Feb 2026)

SOBRE EL DESTINO:
- Zipolite es la única playa nudista legal de México, en Oaxaca. Ambiente relajado, sin juicios.
- No es obligatorio el nudismo — cada quien a su ritmo
- Ambiente LGBT+ friendly, comunidad real, seguro
- Hotel Los Ángeles (glamping): 5 hectáreas, alberca, duchas, seguridad, wifi, a 2 calles de la playa
- Hotel Juquila (habitaciones): rústico, a calle y media de la playa, sin asignación de compañero

REGLAS ESTRICTAS:
1. Responde SIEMPRE en español
2. NUNCA pidas WhatsApp — el usuario ya está en Telegram
3. NUNCA pidas email a menos que el usuario lo ofrezca
4. NUNCA listes todas las opciones de golpe — recomienda UNA y pregunta
5. NUNCA mandas al sitio web como primera respuesta — es el último recurso
6. Si el usuario quiere agendar llamada: responde ÚNICAMENTE con AGENDAR_LLAMADA
7. Si necesita asesor humano: termina con ESCALAR_ASESOR
8. NUNCA digas que la cena del 31 o los consumos están incluidos — van por cuenta del viajero
9. NUNCA inventes información que no esté en este prompt
10. Crea urgencia real: menciona disponibilidad cuando sea relevante`;

  if (resenas && resenas.length > 0) {
    prompt += '\n\nRESEÑAS REALES DE VIAJEROS:\n';
    resenas.slice(0, 3).forEach(r => {
      prompt += `- "${r.texto}" — ${r.nombre}\n`;
    });
  }

  return prompt;
}

// ─── FUNCIONES UTILITARIAS ───────────────────────────────────

async function sendMessage(token, chatId, text, buttons) {
  const body = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function answerCallback(token, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

async function getContacto(chatId) {
  const { data } = await supabase
    .from('contactos')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  return data;
}

async function upsertContacto(chatId, from) {
  const existing = await getContacto(chatId);
  if (existing) return existing;
  const { data } = await supabase
    .from('contactos')
    .insert({
      telegram_chat_id: chatId,
      nombre: from?.first_name || 'Desconocido',
      origen: 'telegram',
      estado_crm: 'lead',
      temperatura: 'frio'
    })
    .select()
    .single();
  return data;
}

async function actualizarContacto(chatId, updates) {
  await supabase.from('contactos').update(updates).eq('telegram_chat_id', chatId);
}

async function getHistorial(chatId) {
  const { data } = await supabase
    .from('conversaciones_telegram')
    .select('historial, nombre, email, whatsapp, estado_embudo')
    .eq('chat_id', chatId)
    .maybeSingle();
  return data || { historial: [], nombre: null, email: null, whatsapp: null };
}

async function saveHistorial(chatId, historial, extras = {}) {
  await supabase
    .from('conversaciones_telegram')
    .upsert({ chat_id: chatId, historial, ...extras }, { onConflict: 'chat_id' });
}

async function registrarInteraccion(contactoId, tipo, resumen) {
  if (!contactoId) return;
  await supabase.from('interacciones').insert({
    contacto_id: contactoId,
    canal: 'telegram',
    tipo,
    resumen: resumen.substring(0, 200)
  });
}

function generarSlotsHorario(dia) {
  const ahora = new Date();
  const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
  const slots = [];
  for (let h = 13; h <= 17; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 17 && m > 0) continue;
      if (dia === 'hoy') {
        const minutos = h * 60 + m;
        if (minutos <= horaActual + 30) continue;
      }
      const label = `${h}:${m === 0 ? '00' : m}pm`;
      slots.push({ text: label, callback_data: `slot_${dia}_${h}_${m}` });
    }
  }
  return slots;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { paquetes = [], resenas = null } = await getPaqueteData().catch(() => ({}));
  if (paquetes.length) refreshRespuestas(paquetes);
  const menuButtons = buildMenuButtons(paquetes);

  // ── CALLBACK QUERY (botones) ──
  if (body.callback_query) {
    const query = body.callback_query;
    const chatId = String(query.message.chat.id);
    const data = query.data;
    await answerCallback(token, query.id);

    const contacto = await upsertContacto(chatId, query.from);
    const nombre = contacto?.nombre || query.from?.first_name || '';

    // Menú principal
    if (data === 'menu') {
      const saludo = nombre ? `${MENU_PRINCIPAL.text}\n\n¡Hola de nuevo, ${nombre}! 👋` : MENU_PRINCIPAL.text;
      await sendMessage(token, chatId, saludo, menuButtons);
      return res.status(200).end();
    }

    // Asesor
    if (data === 'asesor') {
      await sendMessage(token, chatId, RESPUESTAS.asesor.text, RESPUESTAS.asesor.buttons);
      const alertaText = `🚨 *Usuario pide asesor*\n\nNombre: ${nombre}\nChat ID: ${chatId}\nUsername: @${query.from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });
      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'nota', 'Usuario solicitó hablar con asesor');
      return res.status(200).end();
    }

    // Agendar día
    if (data === 'llamada_hoy' || data === 'llamada_manana') {
      const dia = data === 'llamada_hoy' ? 'hoy' : 'manana';
      const slots = generarSlotsHorario(dia);

      if (slots.length === 0) {
        await sendMessage(token, chatId,
          `Lo siento, ya no hay horarios disponibles para hoy. ¿Agendamos para mañana?`,
          [[{ text: '📅 Mañana', callback_data: 'llamada_manana' }, { text: '⬅️ Menú', callback_data: 'menu' }]]
        );
        return res.status(200).end();
      }

      const rows = [];
      for (let i = 0; i < slots.length; i += 2) {
        const row = [slots[i]];
        if (slots[i + 1]) row.push(slots[i + 1]);
        rows.push(row);
      }
      rows.push([{ text: '⬅️ Menú principal', callback_data: 'menu' }]);
      const diaTexto = dia === 'hoy' ? 'hoy' : 'mañana';
      await sendMessage(token, chatId, `⏰ ¿A qué hora te llamamos ${diaTexto}?`, rows);
      return res.status(200).end();
    }

    // Slot de horario seleccionado
    if (data.startsWith('slot_')) {
      const parts = data.split('_');
      const dia = parts[1];
      const h = parts[2];
      const m = parts[3] === '0' ? '00' : parts[3];
      const hora = `${h}:${m}pm`;
      const diaTexto = dia === 'hoy' ? 'hoy' : 'mañana';
      const telefono = contacto?.whatsapp || 'no registrado';

      await sendMessage(token, chatId,
        `✅ *¡Llamada agendada!*\n\nTe llamamos ${diaTexto} a las *${hora}*.\n\nSi el número al que te llamaremos no es correcto, escríbelo aquí. 📱`,
        [[{ text: '🏠 Menú principal', callback_data: 'menu' }]]
      );

      const alertaText = `📞 *LLAMADA AGENDADA*\n\nNombre: ${nombre}\nTeléfono: ${telefono}\nCuándo: ${diaTexto} a las ${hora}\nChat ID: ${chatId}\nUsername: @${query.from?.username || 'sin username'}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });

      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'llamada', `Llamada agendada ${diaTexto} a las ${hora}`);
      return res.status(200).end();
    }

    // Paquete dinámico desde Supabase (pkg_{uuid})
    if (data.startsWith('pkg_') && !RESPUESTAS[data]) {
      const paq = paquetes.find(p => `pkg_${p.id}` === data);
      if (paq) {
        await sendMessage(token, chatId, buildPaqueteMsg(paq), buildVarianteButtons(paq));
      }
      return res.status(200).end();
    }

    // Variante específica (var_{uuid})
    if (data.startsWith('var_')) {
      const varId = data.slice(4);
      let foundVar = null;
      let foundPaq = null;
      for (const p of paquetes) {
        const v = (p.variantes || []).find(v => v.id === varId);
        if (v) { foundVar = v; foundPaq = p; break; }
      }
      if (foundVar && foundPaq) {
        const disp = foundVar.lugares_totales
          ? `\n${foundVar.lugares_totales - (foundVar.lugares_vendidos || 0)} lugares disponibles`
          : '';
        const ant = foundVar.anticipo_es_total
          ? 'pago completo'
          : `Anticipo $${(foundVar.anticipo || 0).toLocaleString('es-MX')}`;
        const msg = `${varianteIcon(foundVar.nombre)} *${foundVar.nombre} — ${foundPaq.nombre}*\n$${(foundVar.precio || 0).toLocaleString('es-MX')} por persona · ${ant}${disp}\n\n¿Cuántas personas van?`;
        const slug = slugify(foundPaq.nombre);
        await sendMessage(token, chatId, msg, [
          [{ text: '✅ Reservar esta opción', url: `https://zipolitealdesnudo.com/?paquete=${slug}` }],
          [{ text: '💳 Formas de pago', callback_data: 'info_pagos' }],
          [{ text: '⬅️ Ver otras opciones', callback_data: `pkg_${foundPaq.id}` }]
        ]);
      }
      return res.status(200).end();
    }

    // Respuestas hardcodeadas (fallback estático)
    if (RESPUESTAS[data]) {
      await sendMessage(token, chatId, RESPUESTAS[data].text, RESPUESTAS[data].buttons);
      return res.status(200).end();
    }

    return res.status(200).end();
  }

  // ── MENSAJE DE TEXTO ──
  if (!body.message?.text) return res.status(200).end();

  const chatId = String(body.message.chat.id);
  const userText = body.message.text.trim();
  const from = body.message.from;

  const contacto = await upsertContacto(chatId, from);
  const conv = await getHistorial(chatId);
  const nombre = conv.nombre || contacto?.nombre || from?.first_name || '';

  await registrarInteraccion(contacto?.id, 'mensaje_entrante', userText);

  // Detectar saludo → menú
  const esSaludo = SALUDOS.some(s => userText.toLowerCase().includes(s)) || userText === '/start';
  if (esSaludo) {
    const saludo = nombre
      ? `🌊 ¡Hola de nuevo, *${nombre}*! Me alegra verte por aquí 🌈\n\n¿En qué te puedo ayudar hoy?`
      : MENU_PRINCIPAL.text;
    await sendMessage(token, chatId, saludo, menuButtons);
    return res.status(200).end();
  }

  // Detectar si el usuario da un número de teléfono para actualizar
  const telMatch = userText.match(/[\d\s\-\+]{10,15}/);
  if (telMatch && conv.estado_embudo === 'agendando') {
    const tel = telMatch[0].replace(/\s|-/g, '');
    await actualizarContacto(chatId, { whatsapp: tel });
    await saveHistorial(chatId, conv.historial, { estado_embudo: null });
    await sendMessage(token, chatId,
      `✅ Número actualizado: *${tel}*\n\n¿Cuándo prefieres la llamada?`,
      [[{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }]]
    );
    return res.status(200).end();
  }

  // Claude para texto libre
  const historial = conv.historial || [];
  const messages = [
    ...historial.slice(-MAX_HISTORIAL),
    { role: 'user', content: userText }
  ];

  try {
    let reply = '¡Hola! Soy Mateo 🌊 Visita zipolitealdesnudo.com para ver nuestros paquetes.';

    if (process.env.ANTHROPIC_API_KEY) {
      const contextExtra = nombre ? `El usuario se llama ${nombre}.` : '';
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: buildSystemPrompt(paquetes, resenas) + (contextExtra ? `\n\nCONTEXTO: ${contextExtra}` : ''),
          messages
        })
      });
      const aiData = await aiRes.json();
      reply = aiData.content?.[0]?.text || reply;
    }

    // Detectar señales especiales
    const escalar = reply.includes('ESCALAR_ASESOR');
    const agendar = reply.includes('AGENDAR_LLAMADA');
    reply = reply.replace('ESCALAR_ASESOR', '').replace('AGENDAR_LLAMADA', '').trim();

    // Detectar si el usuario dio su nombre
    const nombreMatch = reply.match(/NOMBRE:([^\n]+)/);
    if (nombreMatch) {
      const nuevoNombre = nombreMatch[1].trim();
      reply = reply.replace(/NOMBRE:[^\n]+/, '').trim();
      await actualizarContacto(chatId, { nombre: nuevoNombre, estado_crm: 'contactado', temperatura: 'tibio' });
      await saveHistorial(chatId, [
        ...historial.slice(-MAX_HISTORIAL),
        { role: 'user', content: userText },
        { role: 'assistant', content: reply }
      ], { nombre: nuevoNombre });
    } else {
      await saveHistorial(chatId, [
        ...historial.slice(-MAX_HISTORIAL),
        { role: 'user', content: userText },
        { role: 'assistant', content: reply }
      ]);
    }

    // Botones por defecto en texto libre
    const botonesDefault = [[{ text: '🏠 Menú principal', callback_data: 'menu' }]];
    if (agendar) {
      botonesDefault.unshift([
        { text: '📅 Llamada hoy', callback_data: 'llamada_hoy' },
        { text: '📅 Llamada mañana', callback_data: 'llamada_manana' }
      ]);
    }

    if (agendar && reply.trim() === '') {
      await sendMessage(token, chatId,
        `📞 *Agendemos tu llamada*\n\n¿Cuándo prefieres que te llamemos?`,
        [[{ text: '📅 Hoy', callback_data: 'llamada_hoy' }, { text: '📅 Mañana', callback_data: 'llamada_manana' }],
         [{ text: '⬅️ Menú principal', callback_data: 'menu' }]]
      );
      return res.status(200).end();
    }

    await sendMessage(token, chatId, reply, botonesDefault);
    await registrarInteraccion(contacto?.id, 'mensaje_saliente', reply);

    // Escalar a asesor
    if (escalar) {
      await actualizarContacto(chatId, { estado_crm: 'seguimiento', temperatura: 'caliente' });
      await registrarInteraccion(contacto?.id, 'nota', 'Usuario solicitó hablar con asesor vía texto libre');
      const alertaText = `🚨 *Usuario pide asesor*\n\nNombre: ${nombre}\nChat ID: ${chatId}\nMensaje: ${userText}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: alertaText, parse_mode: 'Markdown' })
      });
    }

    res.status(200).end();
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).end();
  }
}
