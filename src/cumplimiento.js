// Cumplimiento de una OP según su programación (no solo según la fecha de hoy) y acciones pendientes.
import { hhBloque, sumarHabiles } from './planificador.js'

export const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const fmtF = (f) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—')
const abiertas = (t) => !['terminada', 'omitida'].includes(t.estado)

/**
 * @param o OP (v_ordenes) · @param ts sus pasos (v_tareas) · @param bs sus bloques programados de hoy en adelante
 * @returns {fin, estado, tono, texto, alertas: [{tono, texto}], faltaH, porArea}
 */
export function evaluarOP(o, ts, bs) {
  const hoy = hoyCO()
  const alertas = []
  if (['terminada', 'entregada', 'anulada'].includes(o.estado)) {
    const cumplida = o.semaforo === 'cumplida'
    return { fin: o.fecha_entrega_real, estado: o.semaforo || o.estado, tono: o.estado === 'anulada' ? 'muted' : cumplida ? 'ok' : 'bad',
      texto: o.estado === 'anulada' ? 'Anulada' : cumplida ? 'Cumplida' : 'Incumplida', alertas, faltaH: 0 }
  }
  const pendPlanta = ts.filter((t) => abiertas(t) && t.area !== 'TERCEROS')
  const terceros = ts.filter((t) => abiertas(t) && t.area === 'TERCEROS')

  // Horas hombre pendientes frente a programadas, por área
  const porArea = {}
  for (const t of pendPlanta) (porArea[t.area] ||= { pend: 0, prog: 0 }).pend += Math.max(Number(t.min_std || 0) - Number(t.min_reales || 0), 0)
  for (const b of bs) (porArea[b.area] ||= { pend: 0, prog: 0 }).prog += hhBloque(b)
  const faltan = Object.entries(porArea).map(([a, x]) => [a, x.pend - x.prog]).filter(([, v]) => v >= 30)
  const faltaH = faltan.reduce((s, [, v]) => s + v, 0)

  // Fecha de terminación según la programación, más los terceros que van al final
  let fin = bs.reduce((m, b) => (b.fecha > m ? b.fecha : m), '')
  for (const t of terceros) {
    const despues = ts.some((x) => abiertas(x) && x.area !== 'TERCEROS' && (
      (t.componente_id && x.componente_id === t.componente_id && x.paso > t.paso) || (!x.componente_id && x.item_id === t.item_id)))
    if (despues) continue // otro paso de planta ya programado espera este tercero
    const dias = Math.max(Math.ceil(Number(t.tiempo_std_unit || 0) - Number(t.min_reales || 0) / 1440), 0)
    const desde = fin && fin > hoy ? fin : hoy
    const f = dias ? sumarHabiles(desde, dias) : desde
    if (f > fin) fin = f
  }

  // Acciones pendientes del administrador
  for (const t of terceros) {
    const dias = Number(t.tiempo_std_unit || 0)
    if (t.estado === 'pendiente' && !t.bloqueada) alertas.push({ tono: 'warn', texto: `Enviar a terceros: ${(t.proceso_nombre || 'tercero').toLowerCase()} · ítem ${t.item_numero}` })
    if (t.estado === 'en_curso' && dias && Number(t.min_reales || 0) / 1440 > dias) alertas.push({ tono: 'bad', texto: `Tercero atrasado: ${(t.proceso_nombre || '').toLowerCase()} · ítem ${t.item_numero} (lleva ${Math.floor(Number(t.min_reales) / 1440)} de ${dias} días)` })
  }
  const sinStd = pendPlanta.filter((t) => t.tiempo_std_unit === null || t.tiempo_std_unit === undefined).length
  if (sinStd) alertas.push({ tono: 'warn', texto: `${sinStd} ${sinStd === 1 ? 'paso sin tiempo estándar' : 'pasos sin tiempo estándar'} (faltan medidas)` })
  if (!ts.length) alertas.push({ tono: 'warn', texto: 'Sin ítems ni pasos' })
  if (faltan.length && bs.length) alertas.push({ tono: 'warn', texto: `Falta programar ${faltan.map(([a, v]) => `${Math.round(v / 60 * 10) / 10} h ${a.toLowerCase()}`).join(', ')}` })

  let estado, tono, texto
  const pendiente = pendPlanta.length + terceros.length > 0
  if (!pendiente) { estado = 'lista'; tono = 'ok'; texto = 'Lista para entregar' }
  else if (o.fecha_compromiso && o.fecha_compromiso < hoy) { estado = 'vencida'; tono = 'bad'; texto = 'Vencida' }
  else if (!bs.length && pendPlanta.length) { estado = 'sin_programar'; tono = 'warn'; texto = 'Sin programar' }
  else if (o.fecha_compromiso && fin > o.fecha_compromiso) { estado = 'no_alcanza'; tono = 'bad'; texto = `No alcanza · termina ${fmtF(fin)}` }
  else if (faltan.length) { estado = 'incompleta'; tono = 'warn'; texto = `Programación incompleta · ${fmtF(fin)}` }
  else if (o.fecha_compromiso && fin && sumarHabiles(fin, 1) > o.fecha_compromiso) { estado = 'justa'; tono = 'warn'; texto = `Justa · termina ${fmtF(fin)}` }
  else { estado = 'a_tiempo'; tono = 'ok'; texto = fin ? `A tiempo · termina ${fmtF(fin)}` : 'A tiempo' }
  if (estado === 'no_alcanza') alertas.unshift({ tono: 'bad', texto: `Según la programación termina el ${fmtF(fin)}, después de la entrega (${fmtF(o.fecha_compromiso)})` })
  if (estado === 'sin_programar') alertas.unshift({ tono: 'warn', texto: 'Programar la OP' })
  return { fin: fin || null, estado, tono, texto, alertas, faltaH, porArea }
}
