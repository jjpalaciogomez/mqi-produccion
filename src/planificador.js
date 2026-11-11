// Planificador automático de la programación.
// Reparte las horas pendientes de una OP en un área por los días hábiles, respetando:
//  · la jornada de cada día (lunes a jueves 8,5 h, viernes 8 h, sábado y domingo no se programa) más las horas extra programadas,
//  · las horas hombre libres del área (operarios × jornada) o de los operarios elegidos,
//  · las horas libres de cada máquina (una jornada por máquina y día; si hay varias iguales, p. ej. 3 impresoras, un montaje en cada una a la vez).
// En Gran Formato (en paralelo) varios proyectos se ponen a la misma hora; el límite son las horas hombre y las máquinas.
// En las demás áreas el trabajo va en fila después de lo ya programado.

export const aMin = (h) => { const [a, b] = String(h).split(':'); return Number(a) * 60 + Number(b) }
export const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
export const jornadaMin = (f) => { const w = new Date(f + 'T12:00:00').getDay(); return w === 5 ? 480 : w >= 1 && w <= 4 ? 510 : 0 }
export const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const arriba15 = (m) => Math.ceil(m / 15 - 1e-9) * 15

// Horas hombre de un bloque (las guardadas, o duración × operarios en bloques hechos a mano)
export const hhBloque = (b) => (b.min_hombre !== null && b.min_hombre !== undefined
  ? Number(b.min_hombre) : (aMin(b.hora_fin) - aMin(b.hora_inicio)) * Math.max(1, b.personas?.length || 0))
export const maqBloque = (b, proc) => Number(b.maquinas?.[proc] || 0)

// Cuántas máquinas iguales hay de cada proceso (p. ej. 3 impresoras): cada una trabaja un montaje a la vez.
// Se fija al cargar la programación; por defecto 1.
let MAQ = {}
export function fijarMaquinas(lista) { MAQ = Object.fromEntries((lista || []).map((m) => [m.codigo, { n: Math.max(1, Number(m.num_maquinas) || 1), mc: Number(m.min_maquina_ciclo) || 0 }])) }
export const numMaquinas = (proc) => MAQ[proc]?.n || 1

// Áreas sin personal propio que hace otra área (hoy: Pintura la hacen los de Metal).
// Mientras Pintura no tenga operarios activos, comparte la capacidad de Metal.
export const APOYO = { PINTURA: 'METAL' }
export function capacidadArea(area, operarios) {
  const base = !operarios?.[area] && APOYO[area] ? APOYO[area] : area
  const pool = [base, ...Object.keys(APOYO).filter((a) => APOYO[a] === base && !operarios?.[a])]
  return { base, pool: [...new Set([area, ...pool])], operariosArea: operarios?.[base] || 0 }
}

// Horas extra programadas: la planta (o un área) trabaja ese día hasta más tarde; también sirve para sábados
let EXTRA = {}
export function fijarExtras(lista) {
  EXTRA = {}
  for (const x of lista || []) (EXTRA[x.fecha] ||= {})[x.area || '*'] = String(x.hasta).slice(0, 5)
}
export const extraDe = (f, area) => {
  const e = EXTRA[f]
  if (!e) return null
  const v = [e['*'], area && e[area]].filter(Boolean).sort()
  return v.length ? v[v.length - 1] : null
}

// Horario de trabajo de un día para un área: [inicio, fin] en minutos (con horas extra si las hay)
export function ventana(f, horario, area) {
  const ini = aMin(horario?.entrada || '07:00')
  const j = jornadaMin(f)
  const ex = extraDe(f, area)
  const fin = Math.max(j ? ini + j : 0, ex ? aMin(ex) : 0)
  return fin > ini ? [ini, fin] : null
}
export const jornadaArea = (f, area, horario) => { const w = ventana(f, horario, area); return w ? w[1] - w[0] : 0 }

/**
 * @param demanda {hh: minutos hombre, maq: {proceso: minutos de máquina}}
 * @param op {area, desde (fecha), desdeHora ('HH:MM' o null), personas [], operariosArea, paralelo}
 * @param bloques bloques ya programados (de hoy en adelante, todas las áreas)
 */
export function planificar(demanda, op, bloques, horario) {
  const personas = op.personas || []
  let restoH = Math.max(0, demanda.hh || 0)
  const restoM = Object.fromEntries(Object.entries(demanda.maq || {}).filter(([, v]) => v > 0))
  const out = []
  let f = op.desde
  for (let n = 0; n < 90 && (restoH >= 1 || Object.values(restoM).some((v) => v >= 1)); n++, f = sumarDias(f, 1)) {
    const w = ventana(f, horario, op.base || op.area)
    if (!w) continue
    const jor = w[1] - w[0] // jornada del día, con horas extra si las hay
    const pool = op.pool || [op.area]
    const delDia = [...bloques, ...out].filter((b) => pool.includes(b.area) && b.fecha === f)
    let ini = w[0]
    if (f === op.desde && op.desdeHora) ini = Math.max(ini, aMin(op.desdeHora))
    if (!op.paralelo) {
      if (personas.length) {
        // Después de lo que ya tienen programado esas personas
        for (const b of delDia) if ((b.personas || []).some((p) => personas.includes(p))) ini = Math.max(ini, aMin(b.hora_fin))
      } else {
        // Sin operarios: carriles = operarios del área; entra cuando se libera uno
        const fines = delDia.filter((b) => !(b.personas || []).length).map((b) => aMin(b.hora_fin)).sort((a, b) => a - b)
        const lanes = Math.max(1, op.operariosArea)
        if (fines.length >= lanes) ini = Math.max(ini, fines[fines.length - lanes])
      }
    }
    ini = arriba15(ini)
    const reloj = w[1] - ini
    if (reloj < 15) continue

    // Horas hombre disponibles
    let capH
    if (personas.length) {
      capH = personas.reduce((s, p) => {
        const usado = delDia.reduce((u, b) => u + ((b.personas || []).includes(p) ? hhBloque(b) / Math.max(1, b.personas.length) : 0), 0)
        return s + Math.max(0, Math.min(reloj, jor - usado))
      }, 0)
    } else {
      const usadoArea = delDia.reduce((u, b) => u + hhBloque(b), 0)
      // Un trabajo grande puede repartirse entre varios operarios del área ese día
      capH = Math.max(0, Math.min(reloj * Math.max(1, op.operariosArea), Math.max(1, op.operariosArea) * jor - usadoArea))
    }
    // Horas de máquina disponibles (una jornada por máquina y día, todas las áreas)
    const tomaM = {}, paraleloM = {}
    for (const [proc, m] of Object.entries(restoM)) {
      if (m < 1) continue
      const usado = [...bloques, ...out].filter((b) => b.fecha === f).reduce((u, b) => u + maqBloque(b, proc), 0)
      // Con varias máquinas iguales, se trabajan a la vez tantos montajes como máquinas (sin pasar de los montajes que quedan)
      const nM = numMaquinas(proc), mc = MAQ[proc]?.mc
      const k = Math.min(nM, mc > 0 ? Math.max(1, Math.ceil(m / mc - 1e-9)) : nM)
      const libre = Math.max(0, Math.min(reloj * k, nM * jor - usado))
      if (libre >= 1) { tomaM[proc] = Math.min(m, libre); paraleloM[proc] = k }
    }
    // Con máquina de por medio, los montajes del operario van al ritmo de la máquina
    const quedaMaq = Object.entries(restoM).some(([k, v]) => v - (tomaM[k] || 0) >= 1)
    const fracM = Math.max(0, ...Object.entries(tomaM).map(([k, v]) => v / (demanda.maq[k] || v)))
    const ritmo = quedaMaq ? Math.max((demanda.hh || 0) * fracM, 15) : restoH
    const tomaH = Math.min(restoH, capH, ritmo)
    const nP = personas.length || Math.max(1, Math.ceil(tomaH / reloj - 1e-9))
    const dur = Math.max(tomaH / nP, ...Object.entries(tomaM).map(([k, v]) => v / (paraleloM[k] || 1)), 0)
    if (dur < 1) continue
    const fin = Math.min(ini + arriba15(dur), w[1])
    out.push({
      area: op.area, fecha: f, hora_inicio: hm(ini), hora_fin: hm(fin), personas,
      min_hombre: Math.round(tomaH), maquinas: Object.fromEntries(Object.entries(tomaM).map(([k, v]) => [k, Math.round(v)])),
    })
    restoH -= tomaH
    for (const [k, v] of Object.entries(tomaM)) restoM[k] -= v
  }
  return { bloques: out, faltaH: restoH, faltaM: restoM }
}

// ---------- OP completa ----------
// Suma días hábiles (lunes a viernes) a una fecha
export function sumarHabiles(f, n) {
  let x = f
  for (let k = 0; k < n;) { x = sumarDias(x, 1); if (jornadaMin(x) > 0) k++ }
  return x
}
const clave = (p) => `${p.fecha} ${hm(p.min)}`
const mayor = (a, b) => (!a ? b : !b ? a : clave(a) >= clave(b) ? a : b)

/**
 * Programa todas las áreas de una OP respetando el orden de los pasos:
 * cada paso empieza cuando terminan los anteriores de su producto, el ensamble cuando terminan todos los productos del ítem,
 * y los pasos de terceros ocupan sus días hábiles sin bloques de planta.
 * @param tareas pasos de la OP (v_tareas) · @param ctx bloques ya programados de otras OPs
 * @param op {desde, desdeHora, operarios: {area: n}}
 */
export function planificarOP(tareas, ctx0, op, horario) {
  const entrada = aMin(horario?.entrada || '07:00')
  const ctx = [...ctx0]
  const crudos = []
  const terceros = []
  const fin = {}
  const ts = tareas.filter((t) => t.estado !== 'omitida')
    .sort((a, b) => (a.componente_id ? 0 : 1) - (b.componente_id ? 0 : 1) || a.paso - b.paso || a.item_numero - b.item_numero)
  const inicio = { fecha: op.desde, min: op.desdeHora ? aMin(op.desdeHora) : entrada }
  let finOP = null
  for (const t of ts) {
    const preds = t.componente_id
      ? ts.filter((x) => x.componente_id === t.componente_id && x.paso < t.paso)
      : ts.filter((x) => x.item_id === t.item_id && x.componente_id)
    let start = inicio
    for (const p of preds) start = mayor(start, fin[p.id])
    if (t.estado === 'terminada') { fin[t.id] = null; continue }
    if (t.area === 'TERCEROS') {
      const dias = Math.max(Math.ceil(Number(t.tiempo_std_unit || 0) - Number(t.min_reales || 0) / 1440), 0)
      const hasta = dias ? sumarHabiles(start.fecha, dias) : start.fecha
      terceros.push({ tarea: t, desde: start.fecha, hasta, dias })
      fin[t.id] = { fecha: hasta, min: dias ? entrada : start.min }
      finOP = mayor(finOP, fin[t.id])
      continue
    }
    const hh = Math.max(Number(t.min_std || 0) - Number(t.min_reales || 0), 0)
    const maq = t.es_maquina ? { [t.proceso]: Math.max(Number(t.min_maquina || 0) - Number(t.min_maquina_real || 0), 0) } : {}
    if (hh < 1 && !Object.values(maq).some((v) => v >= 1)) { fin[t.id] = start; continue }
    const r = planificar({ hh, maq }, {
      area: t.area, desde: start.fecha, desdeHora: hm(start.min), personas: [],
      ...capacidadArea(t.area, op.operarios), paralelo: t.area === 'GRAN FORMATO',
    }, ctx, horario)
    ctx.push(...r.bloques)
    crudos.push(...r.bloques)
    const u = r.bloques[r.bloques.length - 1]
    fin[t.id] = u ? { fecha: u.fecha, min: aMin(u.hora_fin) } : start
    finOP = mayor(finOP, fin[t.id])
  }
  // Un bloque por área y día
  const g = {}
  for (const b of crudos) {
    const k = `${b.area}|${b.fecha}`
    const x = g[k]
    if (!x) { g[k] = { ...b, maquinas: { ...b.maquinas } }; continue }
    if (b.hora_inicio < x.hora_inicio) x.hora_inicio = b.hora_inicio
    if (b.hora_fin > x.hora_fin) x.hora_fin = b.hora_fin
    x.min_hombre += b.min_hombre
    for (const [p, v] of Object.entries(b.maquinas)) x.maquinas[p] = (x.maquinas[p] || 0) + v
  }
  const bloques = Object.values(g).sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))
  return { bloques, terceros, fin: finOP }
}

// ---------- Reorganizar toda la programación ----------
// Prueba varios órdenes de OPs (más corta primero, entrega más cercana primero, prioridad) y mejora con intercambios,
// buscando que la menor cantidad de OPs termine después de su entrega y con el menor atraso total.
const diasEntre = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5)
export function reorganizar(ops, tareas, fijos, op, horario) {
  const carga = {}
  for (const t of tareas) {
    if (['terminada', 'omitida'].includes(t.estado) || t.area === 'TERCEROS') continue
    carga[t.orden_id] = (carga[t.orden_id] || 0) + Math.max(Number(t.min_std || 0) - Number(t.min_reales || 0), 0)
      + (t.es_maquina ? Math.max(Number(t.min_maquina || 0) - Number(t.min_maquina_real || 0), 0) : 0)
  }
  const conTrabajo = ops.filter((o) => carga[o.id] > 0 || tareas.some((t) => t.orden_id === o.id && t.area === 'TERCEROS' && !['terminada', 'omitida'].includes(t.estado)))
  const correr = (orden) => {
    const ctx = [...fijos]
    return orden.map((o) => {
      const r = planificarOP(tareas.filter((t) => t.orden_id === o.id), ctx, op, horario)
      const bs = r.bloques.map((b) => ({ ...b, orden_id: o.id }))
      ctx.push(...bs)
      const fin = r.fin?.fecha || null
      return { op: o, bloques: bs, terceros: r.terceros, fin, atraso: fin && o.fecha_compromiso && fin > o.fecha_compromiso ? diasEntre(fin, o.fecha_compromiso) : 0 }
    })
  }
  const nota = (R) => ({ tarde: R.filter((x) => x.atraso > 0).length, atraso: R.reduce((s, x) => s + x.atraso, 0) })
  const mejor = (a, b) => a.tarde < b.tarde || (a.tarde === b.tarde && a.atraso < b.atraso)
  const fc = (o) => String(o.fecha_compromiso || '9999')
  const cands = [
    [...conTrabajo].sort((a, b) => carga[a.id] - carga[b.id]),
    [...conTrabajo].sort((a, b) => fc(a).localeCompare(fc(b)) || carga[a.id] - carga[b.id]),
    [...conTrabajo].sort((a, b) => fc(a).localeCompare(fc(b)) || a.prioridad - b.prioridad),
    [...conTrabajo].sort((a, b) => a.prioridad - b.prioridad || fc(a).localeCompare(fc(b))),
  ]
  let orden = cands[0]; let R = correr(orden); let s = nota(R)
  for (const c of cands.slice(1)) { const r = correr(c); const n = nota(r); if (mejor(n, s)) { orden = c; R = r; s = n } }
  for (let pasada = 0; pasada < 3; pasada++) {
    let cambio = false
    for (let i = 0; i < orden.length - 1; i++) {
      const o2 = [...orden]; [o2[i], o2[i + 1]] = [o2[i + 1], o2[i]]
      const r = correr(o2); const n = nota(r)
      if (mejor(n, s)) { orden = o2; R = r; s = n; cambio = true }
    }
    if (!cambio) break
  }
  return { resultado: R, ...s }
}
