// Logística: ubicaciones, orden de las paradas y estimación del tiempo de un recorrido (sin GPS ni servicios pagos)

export const VEHICULOS = { camion: 'Camión MQI', mensajero: 'Mensajero (moto o carro)', externo: 'Otro camión / transporte externo' }
export const TIPOS_VUELTA = { entrega: 'Entrega', recogida: 'Recogida', diligencia: 'Diligencia' }
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

// Horas
export const aMin = (h) => { const [a, b] = String(h).split(':'); return Number(a) * 60 + Number(b || 0) }
export const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
const TOLERANCIA = 10 // minutos que se acepta llegar después de la hora acordada

/**
 * Hora estimada de llegada a cada parada saliendo de la planta a la hora de salida.
 * Si una parada tiene hora exacta y se llega antes, se espera hasta esa hora.
 * @returns [{llega, inicio, tarde}] en minutos del día (tarde = minutos después de la hora acordada)
 */
export function llegadas(paradas, planta, minParada = 20, salida = '07:00') {
  let t = aMin(salida), p = tieneUbic(planta) ? pos(planta) : null
  return paradas.map((v) => {
    if (tieneUbic(v)) { const q = pos(v); if (p) t += minViaje(p, q); p = q } else t += 20
    const llega = t
    const fija = v.hora ? aMin(v.hora) : null
    if (fija !== null && t < fija) t = fija
    const inicio = t
    t += minParada
    return { llega, inicio, tarde: fija !== null ? Math.max(0, llega - fija) : 0 }
  })
}

/**
 * Ordena las paradas: las que no tienen hora exacta por cercanía y franja; luego cada parada con hora exacta
 * se mete donde se llegue a tiempo (o lo menos tarde posible) terminando más temprano.
 */
export function ordenarParadas(vueltas, planta, opts = {}) {
  const { minParada = 20, salida = '07:00' } = opts
  const fijas = vueltas.filter((v) => v.hora).sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
  let ruta = ordenarLibres(vueltas.filter((v) => !v.hora), planta)
  for (const f of fijas) {
    let mejor = null
    for (let i = 0; i <= ruta.length; i++) {
      const cand = [...ruta.slice(0, i), f, ...ruta.slice(i)]
      const ll = llegadas(cand, planta, minParada, salida)
      const tarde = ll.reduce((s, x) => s + Math.max(0, x.tarde - TOLERANCIA), 0)
      const fin = ll.length ? ll[ll.length - 1].inicio : 0
      if (!mejor || tarde < mejor.tarde || (tarde === mejor.tarde && fin < mejor.fin)) mejor = { cand, tarde, fin }
    }
    ruta = mejor.cand
  }
  return ruta
}

/**
 * Ordena las paradas sin hora exacta para recorrer menos: primero las de la mañana, luego las de cualquier hora y al final las de la tarde;
 * dentro de cada franja, la más cercana primero y luego se mejora con intercambios (2-opt). Las paradas sin ubicación van al final de su franja.
 */
function ordenarLibres(vueltas, planta) {
  const orden = ['manana', 'todo', 'tarde']
  let desde = tieneUbic(planta) ? pos(planta) : null
  const out = []
  for (const fr of orden) {
    const grupo = vueltas.filter((v) => (v.franja || 'todo') === fr)
    const con = grupo.filter(tieneUbic), sin = grupo.filter((v) => !tieneUbic(v))
    let ruta = []
    const resto = [...con]
    let p = desde || (resto[0] ? pos(resto[0]) : null)
    while (resto.length) {
      let k = 0
      for (let i = 1; i < resto.length; i++) if (km(p, pos(resto[i])) < km(p, pos(resto[k]))) k = i
      // Las urgentes de la franja van primero
      const urg = resto.findIndex((v) => v.prioridad === 1)
      if (urg >= 0 && resto[k].prioridad !== 1) k = urg
      p = pos(resto[k]); ruta.push(resto.splice(k, 1)[0])
    }
    ruta = dosOpt(ruta, desde)
    out.push(...sin.filter((v) => v.prioridad === 1), ...ruta, ...sin.filter((v) => v.prioridad !== 1))
    if (ruta.length) desde = pos(ruta[ruta.length - 1])
  }
  return out
}
function largo(ruta, inicio) {
  let s = 0, p = inicio
  for (const v of ruta) { const q = pos(v); if (p) s += km(p, q); p = q }
  return s
}
function dosOpt(ruta, inicio) {
  if (ruta.length < 4 || ruta.some((v) => v.prioridad === 1)) return ruta
  let mejor = ruta, d = largo(ruta, inicio), cambio = true
  for (let vuelta = 0; cambio && vuelta < 20; vuelta++) {
    cambio = false
    for (let i = 0; i < mejor.length - 1; i++) for (let j = i + 1; j < mejor.length; j++) {
      const n = [...mejor.slice(0, i), ...mejor.slice(i, j + 1).reverse(), ...mejor.slice(j + 1)]
      const dn = largo(n, inicio)
      if (dn + 1e-9 < d) { mejor = n; d = dn; cambio = true }
    }
  }
  return mejor
}

// Tiempo estimado de un recorrido: paradas × minutos por parada + trayectos (incluye el regreso a la planta)
export function estimar(paradas, planta, minParada = 20) {
  let viaje = 0, kms = 0, sinUbic = 0
  let p = tieneUbic(planta) ? pos(planta) : null
  for (const v of paradas) {
    if (!tieneUbic(v)) { sinUbic++; viaje += 20; continue } // sin ubicación: se suponen 20 min de trayecto
    const q = pos(v)
    if (p) { viaje += minViaje(p, q); kms += km(p, q) * FACTOR_CALLE }
    p = q
  }
  if (p && tieneUbic(planta) && paradas.length) { viaje += minViaje(p, pos(planta)); kms += km(p, pos(planta)) * FACTOR_CALLE }
  const parada = paradas.length * minParada
  return { total: Math.round(viaje + parada), viaje: Math.round(viaje), parada, km: Math.round(kms), sinUbic }
}

/**
 * Propone qué va en el camión y qué con mensajero: el camión se llena primero (lo que necesita camión y lo urgente),
 * hasta su jornada; lo que no cabe y no necesita camión pasa al mensajero.
 */
export function proponerAsignacion(vueltas, planta, minParada, jornadaCamion, salida = '07:00') {
  const op = { minParada, salida }
  const orden = [...vueltas].sort((a, b) => (b.necesita_camion - a.necesita_camion) || (a.prioridad - b.prioridad)
    || (tieneUbic(planta) && tieneUbic(a) && tieneUbic(b) ? km(pos(planta), pos(a)) - km(pos(planta), pos(b)) : 0))
  const camion = [], mensajero = []
  for (const v of orden) {
    const prueba = ordenarParadas([...camion, v], planta, op)
    const ll = llegadas(prueba, planta, minParada, salida)
    const aTiempo = ll.every((x) => x.tarde <= TOLERANCIA)
    const dura = ll.length ? ll[ll.length - 1].inicio + minParada - aMin(salida) : 0
    if (v.necesita_camion || (aTiempo && Math.max(dura, estimar(prueba, planta, minParada).total) <= jornadaCamion)) camion.push(v)
    else mensajero.push(v)
  }
  return { camion: ordenarParadas(camion, planta, op), mensajero: ordenarParadas(mensajero, planta, op) }
}

// Links para navegar
const punto = (v) => (tieneUbic(v) ? `${v.lat},${v.lng}` : [v.direccion, v.municipio || 'Medellín'].filter(Boolean).join(', '))
export const linkMaps = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto(v))}`
export const linkWaze = (v) => (tieneUbic(v) ? `https://waze.com/ul?ll=${v.lat},${v.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(punto(v))}&navigate=yes`)
// Recorrido completo en Google Maps (hasta 9 paradas intermedias; si hay más, se parte en tramos)
export function linksRecorrido(paradas, planta) {
  const pts = paradas.filter((v) => tieneUbic(v) || v.direccion)
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
