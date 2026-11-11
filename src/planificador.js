// Planificador automático de la programación.
// Reparte las horas pendientes de una OP en un área por los días hábiles, respetando:
//  · la jornada de cada día (lunes a jueves 8,5 h, viernes 8 h, sábado y domingo no se programa),
//  · las horas hombre libres del área (operarios × jornada) o de los operarios elegidos,
//  · las horas libres de cada máquina (impresora, láser, plotter, DTF: una jornada por día).
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

export function ventana(f, horario) {
  const j = jornadaMin(f)
  if (!j) return null
  const ini = aMin(horario?.entrada || '07:00')
  return [ini, ini + j]
}

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
    const w = ventana(f, horario)
    if (!w) continue
    const jor = jornadaMin(f)
    const delDia = [...bloques, ...out].filter((b) => b.area === op.area && b.fecha === f)
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
      capH = Math.max(0, Math.min(reloj, Math.max(1, op.operariosArea) * jor - usadoArea))
    }
    // Horas de máquina disponibles (una jornada por máquina y día, todas las áreas)
    const tomaM = {}
    for (const [proc, m] of Object.entries(restoM)) {
      if (m < 1) continue
      const usado = [...bloques, ...out].filter((b) => b.fecha === f).reduce((u, b) => u + maqBloque(b, proc), 0)
      const libre = Math.max(0, Math.min(reloj, jor - usado))
      if (libre >= 1) tomaM[proc] = Math.min(m, libre)
    }
    // Con máquina de por medio, los montajes del operario van al ritmo de la máquina
    const quedaMaq = Object.entries(restoM).some(([k, v]) => v - (tomaM[k] || 0) >= 1)
    const fracM = Math.max(0, ...Object.entries(tomaM).map(([k, v]) => v / (demanda.maq[k] || v)))
    const ritmo = quedaMaq ? Math.max((demanda.hh || 0) * fracM, 15) : restoH
    const tomaH = Math.min(restoH, capH, ritmo)
    const nP = Math.max(1, personas.length)
    const dur = Math.max(tomaH / nP, ...Object.values(tomaM), 0)
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
