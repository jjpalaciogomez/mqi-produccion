// Logística: ubicaciones, orden de las paradas y estimación del tiempo de un recorrido (sin GPS ni servicios pagos)

export const VEHICULOS = { camion: 'Camión MQI', mensajero: 'Mensajero (moto o carro)', externo: 'Otro camión / transporte externo' }
export const TIPOS_VUELTA = { entrega: 'Entrega', recogida: 'Recogida', diligencia: 'Diligencia', regreso: 'Regreso a la planta' }
export const FRANJAS = { todo: 'Cualquier hora', manana: 'Mañana', tarde: 'Tarde' }
export const TIPOS_LUGAR = { cliente: 'Cliente', proveedor: 'Proveedor', otro: 'Otro' }
export const ESTADOS_VUELTA = { pendiente: 'Pendiente', hecha: 'Hecha', no_hecha: 'No se pudo', cancelada: 'Cancelada' }

// Saca latitud y longitud de un link de Google Maps o de "6.2442, -75.5812"
export function leerUbicacion(txt) {
  const s = String(txt || '').trim()
  if (!s) return null
  const pats = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // sitio exacto dentro del link
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/,
  ]
  for (const p of pats) {
    const m = s.match(p)
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    }
  }
  return null
}
export const esLinkCorto = (txt) => /goo\.gl|maps\.app/.test(String(txt || ''))
export const tieneUbic = (x) => x && x.lat !== null && x.lat !== undefined && x.lat !== '' && x.lng !== null && x.lng !== undefined && x.lng !== ''

// Distancia en línea recta (km)
export function km(a, b) {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
// Por calles se recorre ~1,4 veces la línea recta; en la ciudad se rinde ~22 km/h
const FACTOR_CALLE = 1.4, KMH = 22
export const minViaje = (a, b) => (km(a, b) * FACTOR_CALLE / KMH) * 60

const pos = (x) => ({ lat: Number(x.lat), lng: Number(x.lng) })

// ---------------- Zona de la ciudad (Valle de Aburrá) ----------------
const MUN_ZONA = {
  norte: ['bello', 'copacabana', 'girardota', 'barbosa'],
  sur: ['envigado', 'itagui', 'sabaneta', 'la estrella', 'caldas'],
  oriente: ['rionegro', 'marinilla', 'guarne', 'la ceja', 'el retiro', 'el carmen de viboral', 'el santuario', 'llanogrande', 'san antonio de pereira'],
}
const sinTilde = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
export const ZONAS = { norte: 'Norte', sur: 'Sur', centro: 'Centro', oriente: 'Oriente', occidente: 'Occidente' }
/** Zona aproximada: por la ubicación (si la hay) o por el municipio. Medellín: centro, norte, sur (Poblado/Guayabal), oriente y occidente (Laureles/Belén/Robledo). */
export function zonaDe(v) {
  if (!v) return null
  const mun = sinTilde(v.municipio)
  for (const [z, ms] of Object.entries(MUN_ZONA)) if (ms.some((m) => mun.includes(m))) return z
  if (v.lat !== null && v.lat !== undefined && v.lat !== '' && v.lng !== null && v.lng !== undefined && v.lng !== '') {
    const lat = Number(v.lat), lng = Number(v.lng)
    if (lng > -75.5) return 'oriente' // Oriente antioqueño
    if (lat >= 6.275) return 'norte'
    if (lat < 6.235) return 'sur'
    if (lng < -75.585) return 'occidente'
    if (lng > -75.556) return 'oriente'
    return 'centro'
  }
  // Sin ubicación: por el barrio escrito en la dirección
  const dir = sinTilde(v.direccion)
  for (const [z, bs] of Object.entries(BARRIOS)) if (bs.some((b) => dir.includes(b))) return z
  return null
}
const BARRIOS = {
  occidente: ['belen', 'laureles', 'estadio', 'san joaquin', 'la america', 'calasanz', 'san javier', 'robledo', 'floresta', 'conquistadores', 'santa monica'],
  sur: ['poblado', 'guayabal', 'cristo rey', 'campo amor', 'manila', 'patio bonito'],
  centro: ['candelaria', 'centro', 'prado', 'boston', 'san benito', 'guayaquil'],
  norte: ['aranjuez', 'castilla', 'manrique', 'popular', 'santa cruz', 'doce de octubre', 'pedregal', 'tricentenario'],
  oriente: ['buenos aires', 'villa hermosa', 'milagrosa', 'loreto', 'las palmas'],
}
export const zonaTxt = (v) => ZONAS[zonaDe(v)] || ''

// ---------------- Horas ----------------
export const aMin = (h) => { const [a, b] = String(h).split(':'); return Number(a) * 60 + Number(b || 0) }
export const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60) % 60).padStart(2, '0')}`
export const hCorta = (h) => (h ? String(h).slice(0, 5) : '')
const DIA = 24 * 60
export const DIAS_SEM = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']]
const diaSem = (fecha) => new Date(fecha + 'T12:00:00').getDay()

// Configuración del día del vehículo (Logística → Punto de salida y horarios)
export const CFG_DEF = { salida: '07:00', fin: '16:30', almuerzo_desde: '12:00', almuerzo_min: 60, min_parada: 20, tolerancia: 10, min_descargue: 15 }
export function cfgDe(aj) {
  const c = { ...CFG_DEF, ...(aj || {}) }
  // Compatibilidad: antes se guardaba la jornada en minutos
  if (!aj?.fin && aj?.jornada_camion) c.fin = hm(aMin(c.salida) + Number(aj.jornada_camion))
  return c
}

/**
 * Horario de recepción de un sitio: lista de franjas [{d: [1,2,3,4,5], a: '08:00', b: '12:00'}, …] (d = días: 0 domingo … 6 sábado).
 * Vacío o nulo = recibe a cualquier hora.
 */
export function ventanasRecepcion(rec, fecha) {
  if (!Array.isArray(rec) || !rec.length) return null
  const w = diaSem(fecha)
  return rec.filter((r) => (r.d || []).includes(w) && r.a && r.b).map((r) => [aMin(r.a), aMin(r.b)]).sort((x, y) => x[0] - y[0])
}
export function recepcionTxt(rec) {
  if (!Array.isArray(rec) || !rec.length) return ''
  const g = {}
  for (const r of rec) {
    const k = [...(r.d || [])].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).join(',')
    ;(g[k] ||= []).push(`${h12(r.a)} a ${h12(r.b)}`)
  }
  const lun = (k) => Math.min(...k.split(',').filter(Boolean).map((n) => (Number(n) + 6) % 7))
  return Object.entries(g).sort((x, y) => lun(x[0]) - lun(y[0])).map(([k, hs]) => `${diasTxt(k.split(',').filter(Boolean).map(Number))} ${hs.join(' y ')}`).join(' · ')
}
function diasTxt(ds) {
  const ord = DIAS_SEM.map(([n]) => n).filter((n) => ds.includes(n))
  const idx = ord.map((n) => DIAS_SEM.findIndex(([m]) => m === n))
  const seguidos = idx.length > 2 && idx.every((x, i) => i === 0 || x === idx[i - 1] + 1)
  const l = (n) => DIAS_SEM.find(([m]) => m === n)[1]
  return seguidos ? `${l(ord[0])}-${l(ord[ord.length - 1])}` : ord.map(l).join(' ')
}

// Hora en formato de 12 horas, como se lee en Colombia: 8:00 a. m.
export const h12 = (h) => {
  if (!h) return ''
  const m = aMin(h), hh = Math.floor(m / 60) % 24, mm = m % 60
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}

// Cuándo se pidió la vuelta: hora exacta, entre dos horas, antes de una hora, mañana, tarde o cualquier hora
export function cuandoTxt(v) {
  if (v.cuando === 'desde' && v.hora) return `desde las ${h12(v.hora)}`
  if (v.hora && v.hora_hasta) return `entre ${h12(v.hora)} y ${h12(v.hora_hasta)}`
  if (!v.hora && v.hora_hasta) return `antes de las ${h12(v.hora_hasta)}`
  if (v.hora) return `a las ${h12(v.hora)}`
  return v.franja === 'manana' ? 'en la mañana' : v.franja === 'tarde' ? 'en la tarde' : ''
}
function ventanasPedido(v, cfg) {
  if (v.cuando === 'desde' && v.hora) return [[aMin(v.hora), DIA]]
  if (v.hora && v.hora_hasta) return [[aMin(v.hora), aMin(v.hora_hasta)]]
  if (v.hora_hasta) return [[0, aMin(v.hora_hasta)]]
  if (v.hora) return [[aMin(v.hora), aMin(v.hora) + Number(cfg.tolerancia || 0)]]
  if (v.franja === 'manana') return [[0, 12 * 60]]
  if (v.franja === 'tarde') return [[12 * 60, DIA]]
  return [[0, DIA]]
}
/**
 * Horas en que se puede atender la parada ese día: lo que se pidió ∩ el horario de recepción del sitio.
 * @returns {ventanas: [[desde, hasta]], cerrado: el sitio no recibe ese día, choque: lo pedido no cae en el horario de recepción}
 */
export function ventanasParada(v, fecha, cfg) {
  const ped = ventanasPedido(v, cfg)
  const rec = ventanasRecepcion(v.recepcion, fecha)
  if (rec === null) return { ventanas: ped, cerrado: false, choque: false }
  if (!rec.length) return { ventanas: [], cerrado: true, choque: false }
  const out = []
  for (const [a, b] of ped) for (const [c, d] of rec) { const x = Math.max(a, c), y = Math.min(b, d); if (y >= x) out.push([x, y]) }
  out.sort((p, q) => p[0] - q[0])
  return { ventanas: out, cerrado: false, choque: !out.length }
}
export const minParadaDe = (v, cfg) => Number(v.min_parada) || Number(cfg.min_parada) || 20

/**
 * Simula el recorrido: sale de la planta a la hora de salida, viaja, espera si llega antes de que reciban,
 * atiende cada parada, toma el almuerzo cuando le llega la hora y regresa a la planta.
 * @returns {pasos: [{llega, inicio, sale, espera, tarde, cerrado, choque, almuerzoAntes}], regreso, km, sinUbic, almuerzo}
 */
export function simular(paradas, planta, cfg, fecha) {
  let t = aMin(cfg.salida), p = tieneUbic(planta) ? pos(planta) : null, kms = 0, sinUbic = 0
  const almDesde = aMin(cfg.almuerzo_desde || '12:00'), almMin = Number(cfg.almuerzo_min) || 0
  let almuerzo = null
  const tomarAlmuerzo = () => { if (almMin && almuerzo === null && t >= almDesde) { almuerzo = t; t += almMin; return true } return false }
  const pp = tieneUbic(planta) ? pos(planta) : null
  // Mercancía que hay que recoger en la planta: cada vez que el camión está en la planta carga todo lo que ya esté listo
  const porCargar = new Set(pp ? paradas.filter((v) => v.recoger_planta) : [])
  const cargar = () => {
    const lleva = []
    for (const v of [...porCargar]) if (!v.lista_desde || aMin(v.lista_desde) <= t) { porCargar.delete(v); lleva.push(v) }
    return lleva
  }
  const alSalir = cargar() // lo que ya está listo a la hora de salida va desde el principio
  const pasos = paradas.map((v) => {
    const almuerzoAntes = tomarAlmuerzo()
    // Si la mercancía de esta parada aún no va en el camión, pasa por la planta (espera a que esté lista) y carga todo lo listo
    let carga = null
    if (porCargar.has(v)) {
      if (p && (p.lat !== pp.lat || p.lng !== pp.lng)) { t += minViaje(p, pp); kms += km(p, pp) * FACTOR_CALLE }
      p = pp
      const llegaP = t
      if (v.lista_desde && t < aMin(v.lista_desde)) t = aMin(v.lista_desde)
      const lleva = cargar()
      t += Number(cfg.min_descargue) || 15
      carga = { llega: llegaP, sale: t, lleva: lleva.map((x) => x.id) }
    }
    if (tieneUbic(v)) { const q = pos(v); if (p) { t += minViaje(p, q); kms += km(p, q) * FACTOR_CALLE } p = q } else { sinUbic++; t += 20 }
    const llega = t
    const { ventanas, cerrado, choque } = ventanasParada(v, fecha, cfg)
    let inicio = t, tarde = 0
    const w = ventanas.find(([, b]) => b >= t)
    if (w) inicio = Math.max(t, w[0])
    else if (ventanas.length) tarde = t - ventanas[ventanas.length - 1][1]
    // Si toca esperar y en la espera entra la hora del almuerzo, se almuerza mientras tanto
    if (almMin && almuerzo === null && inicio - t >= almMin && inicio >= almDesde) almuerzo = Math.max(t, almDesde)
    const espera = inicio - t
    t = inicio + minParadaDe(v, cfg)
    const sale = t
    // Después de esta parada el camión vuelve a la planta a dejar algo (lo antes posible o antes de una hora)
    let vuelve = null
    if (v.volver_planta && tieneUbic(planta)) {
      if (p) { t += minViaje(p, pos(planta)); kms += km(p, pos(planta)) * FACTOR_CALLE }
      p = pos(planta)
      vuelve = { sale, llega: t, tarde: v.volver_antes ? Math.max(0, t - aMin(v.volver_antes)) : 0 }
      t += Number(cfg.min_descargue) || 15
      vuelve.lleva = cargar().map((x) => x.id) // de paso carga lo que ya esté listo
    }
    return { llega, inicio, sale, espera, tarde, cerrado, choque, almuerzoAntes, vuelve, carga }
  })
  if (paradas.length) {
    tomarAlmuerzo()
    if (p && tieneUbic(planta)) { t += minViaje(p, pos(planta)); kms += km(p, pos(planta)) * FACTOR_CALLE }
  }
  return { pasos, regreso: t, km: Math.round(kms), kmExacto: kms, sinUbic, almuerzo, alSalir: alSalir.map((x) => x.id) }
}
export const problemas = (sim) => sim.pasos.filter((x) => x.tarde > 0 || x.cerrado || x.choque || x.vuelve?.tarde > 0).length

// Qué tan buena es una ruta: primero que nadie quede por fuera de su horario, luego volver temprano y atender pronto lo urgente
function costo(paradas, sim, cfg) {
  let c = sim.regreso
  sim.pasos.forEach((x, i) => {
    if (x.cerrado || x.choque) c += 5000
    c += x.tarde * 100
    if (x.vuelve) c += x.vuelve.tarde * 100 + (paradas[i].volver_antes ? 0 : x.vuelve.llega * 0.5) // "lo antes posible": cuanto antes, mejor
    if (paradas[i].prioridad === 1) c += x.inicio * 0.5
  })
  c += Math.max(0, sim.regreso - aMin(cfg.fin)) * 20
  c += (sim.kmExacto || 0) * 0.5 // a igual hora de regreso, la ruta más corta (agrupa zonas)
  return c
}

/**
 * Ordena las paradas respetando horarios: primero mete las que tienen la ventana más corta o temprana,
 * cada una en el lugar donde la ruta queda mejor; luego prueba mover cada parada a otro lugar.
 */
export function ordenarParadas(vueltas, planta, cfg, fecha) {
  // Las que no se pueden atender ese día (sitio cerrado, o lo pedido no cae en su horario) van al final
  const imposible = (v) => { const x = ventanasParada(v, fecha, cfg); return x.cerrado || x.choque }
  const malas = vueltas.filter(imposible)
  vueltas = vueltas.filter((v) => !imposible(v))
  if (vueltas.length < 2) return [...vueltas, ...malas]
  const evalua = (r) => costo(r, simular(r, planta, cfg, fecha), cfg)
  const fin = (v) => { const w = ventanasParada(v, fecha, cfg).ventanas; return w.length ? w[w.length - 1][1] : DIA }
  const ancho = (v) => ventanasParada(v, fecha, cfg).ventanas.reduce((s, [a, b]) => s + b - a, 0)
  const insertar = (lista) => {
    let ruta = []
    for (const v of lista) {
      let mejor = null
      for (let i = 0; i <= ruta.length; i++) {
        const cand = [...ruta.slice(0, i), v, ...ruta.slice(i)]
        const c = evalua(cand)
        if (!mejor || c < mejor.c) mejor = { cand, c }
      }
      ruta = mejor.cand
    }
    return ruta
  }
  // Varias rutas de partida: por ventana más estrecha, y "barridos" por zona (ángulo alrededor de la planta, en ambos sentidos)
  const semillas = [insertar([...vueltas].sort((a, b) => fin(a) - fin(b) || ancho(a) - ancho(b) || a.prioridad - b.prioridad))]
  if (tieneUbic(planta)) {
    const pl = pos(planta)
    const ang = (v) => (tieneUbic(v) ? Math.atan2(Number(v.lat) - pl.lat, Number(v.lng) - pl.lng) : 9)
    for (const giro of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const rot = (v) => { let x = ang(v) - giro; while (x < -Math.PI) x += 2 * Math.PI; while (x > Math.PI) x -= 2 * Math.PI; return x }
      const barrido = [...vueltas].sort((a, b) => rot(a) - rot(b))
      semillas.push(barrido, [...barrido].reverse())
    }
  }
  let mejor = null
  for (const sem of semillas) {
    const r = mejorar(sem, evalua)
    const c = evalua(r)
    if (!mejor || c < mejor.c) mejor = { r, c }
  }
  return [...mejor.r, ...malas]
}

// Mejora una ruta: mover una parada o un tramo de 2-3 paradas a otro lugar, e invertir tramos (2-opt)
function mejorar(ruta, evalua) {
  let actual = evalua(ruta)
  for (let pasada = 0; pasada < 6; pasada++) {
    let cambio = false
    for (let largo = 1; largo <= 3; largo++) {
      for (let i = 0; i + largo <= ruta.length; i++) {
        const tramo = ruta.slice(i, i + largo), sin = [...ruta.slice(0, i), ...ruta.slice(i + largo)]
        for (let j = 0; j <= sin.length; j++) {
          if (j === i) continue
          const cand = [...sin.slice(0, j), ...tramo, ...sin.slice(j)]
          const c = evalua(cand)
          if (c + 1e-6 < actual) { ruta = cand; actual = c; cambio = true }
        }
      }
    }
    for (let i = 0; i < ruta.length - 1; i++) for (let j = i + 1; j < ruta.length; j++) {
      const cand = [...ruta.slice(0, i), ...ruta.slice(i, j + 1).reverse(), ...ruta.slice(j + 1)]
      const c = evalua(cand)
      if (c + 1e-6 < actual) { ruta = cand; actual = c; cambio = true }
    }
    if (!cambio) break
  }
  return ruta
}

// Kilómetros y tiempo del recorrido
export function estimar(paradas, planta, cfg, fecha) {
  const sim = simular(paradas, planta, cfg, fecha)
  return { total: Math.round(sim.regreso - aMin(cfg.salida)), regreso: sim.regreso, km: sim.km, sinUbic: sim.sinUbic, problemas: problemas(sim), sim }
}

/**
 * Propone qué va en el camión y qué con mensajero: el camión se llena primero (lo que necesita camión y lo urgente)
 * mientras todas sus paradas queden dentro de su horario y regrese antes de su hora de fin; lo demás va con mensajero.
 */
export function proponerAsignacion(vueltas, planta, cfg, fecha) {
  const lejos = (v) => (tieneUbic(planta) && tieneUbic(v) ? km(pos(planta), pos(v)) : 0)
  const orden = [...vueltas].sort((a, b) => (b.necesita_camion - a.necesita_camion) || (a.prioridad - b.prioridad) || lejos(a) - lejos(b))
  let camion = []
  const mensajero = []
  for (const v of orden) {
    const prueba = ordenarParadas([...camion, v], planta, cfg, fecha)
    const sim = simular(prueba, planta, cfg, fecha)
    const nuevos = problemas(sim) - problemas(simular(camion, planta, cfg, fecha))
    if (v.necesita_camion || (nuevos <= 0 && sim.regreso <= aMin(cfg.fin))) camion = prueba
    else mensajero.push(v)
  }
  return { camion, mensajero: ordenarParadas(mensajero, planta, cfg, fecha) }
}

// Links para navegar
const punto = (v) => (tieneUbic(v) ? `${v.lat},${v.lng}` : [v.direccion, v.municipio || 'Medellín'].filter(Boolean).join(', '))
export const linkMaps = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto(v))}`
export const linkWaze = (v) => (tieneUbic(v) ? `https://waze.com/ul?ll=${v.lat},${v.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(punto(v))}&navigate=yes`)
// Recorrido completo en Google Maps (hasta 9 paradas intermedias; si hay más, se parte en tramos)
// Paradas del recorrido incluyendo los pasos por la planta (recoger mercancía antes / volver a dejar algo después)
export const PLANTA_NOMBRE = 'Planta MQI'
export function puntosRuta(paradas, planta) {
  const pl = tieneUbic(planta) ? { ...planta, destino: PLANTA_NOMBRE, esPlanta: true } : null
  const out = []
  for (const v of paradas) {
    for (const x of [...(v.recoger_planta && pl ? [pl] : []), v, ...(v.volver_planta && pl ? [pl] : [])]) {
      if (x.esPlanta && out[out.length - 1]?.esPlanta) continue // dos pasos seguidos por la planta = uno
      out.push(x)
    }
  }
  return out
}
export function linksRecorrido(paradas, planta) {
  // El recorrido siempre sale de la planta y termina en la planta
  const pts = puntosRuta(paradas, planta).filter((v) => tieneUbic(v) || v.direccion)
  if (pts.length && tieneUbic(planta) && !pts[pts.length - 1].esPlanta) pts.push({ ...planta, destino: PLANTA_NOMBRE, esPlanta: true })
  if (!pts.length) return []
  const tramos = []
  let origen = tieneUbic(planta) ? `${planta.lat},${planta.lng}` : null
  for (let i = 0; i < pts.length; i += 10) {
    const t = pts.slice(i, i + 10)
    const dest = punto(t[t.length - 1])
    const way = t.slice(0, -1).map(punto).join('|')
    tramos.push(`https://www.google.com/maps/dir/?api=1${origen ? `&origin=${encodeURIComponent(origen)}` : ''}&destination=${encodeURIComponent(dest)}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}&travelmode=driving`)
    origen = dest
  }
  return tramos
}
export const telLink = (t) => `tel:${String(t || '').replace(/[^\d+]/g, '')}`
