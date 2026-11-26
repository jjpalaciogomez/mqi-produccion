// Carga de datos de Pagos desde Supabase y utilidades comunes de pantalla
import { sb, q } from '../supabase.js'
import * as M from './motor.js'

export const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const pesos = (v) => (v === null || v === undefined || v === '' || isNaN(v) ? '' : (Number(v) < 0 ? '-$' : '$') + Math.abs(Math.round(Number(v))).toLocaleString('es-CO'))
export const num = (v, d = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d }))
export const fechaCorta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '')

export const MODULOS = [
  ['jornadalito', 'Jornada Litografía'], ['jornadaindustrial', 'Jornada Industrial'], ['horasextra', 'Horas extra semanal'],
  ['nomina', 'Nómina quincenal'], ['programados', 'Pagos Programados'], ['ausentismos', 'Ausentismos'], ['vacaciones', 'Vacaciones'],
  ['informes', 'Informes'], ['causaciones', 'Causaciones'], ['empleados', 'Empleados'],
]

// Lee todas las filas de una tabla (Supabase devuelve máximo 1000 por consulta)
export async function todas(tabla, armar = (x) => x, orden = 'id') {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const filas = await q(armar(sb.from(tabla).select('*')).order(orden).range(desde, desde + 999))
    out.push(...filas)
    if (filas.length < 1000) break
  }
  return out
}

export async function cargarConfig() {
  const filas = await q(sb.from('nomina_config').select('*'))
  const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor]))
  return { parametros: c.parametros || {}, factores: c.factores || {}, festivos: c.festivos || [], causaciones: c.causaciones || {},
    cfg: M.cfgMapa(c.parametros, c.factores) }
}
export async function cargarEmpleados() {
  const filas = await q(sb.from('empleados').select('*').order('nombre'))
  return filas
}
export const empleadosMotor = (filas) => filas.map(M.empMotor)
export const porId = (emps) => Object.fromEntries(emps.map((e) => [e.ID_Empleado, e]))

// Quincenas: las guardadas + la actual y la anterior
export function opcionesQuincena(guardadas = []) {
  const hoy = hoyCO()
  const [y, m, d] = hoy.split('-').map(Number)
  const set = new Set(guardadas)
  const actual = M.etiquetaQuincena(y, m, d <= 15)
  const prev = d <= 15 ? (m === 1 ? M.etiquetaQuincena(y - 1, 12, false) : M.etiquetaQuincena(y, m - 1, false)) : M.etiquetaQuincena(y, m, true)
  const sig = d <= 15 ? M.etiquetaQuincena(y, m, false) : (m === 12 ? M.etiquetaQuincena(y + 1, 1, true) : M.etiquetaQuincena(y, m + 1, true))
  ;[prev, actual, sig].forEach((q) => set.add(q))
  return { lista: [...set].sort((a, b) => (M.parsearQuincena(a)?.inicio || '').localeCompare(M.parsearQuincena(b)?.inicio || '')), actual }
}
// Semanas (viernes a jueves): guardadas + las 2 últimas
export function opcionesSemana(guardadas = []) {
  const hoy = hoyCO()
  const vie = M.viernesDeSemana(hoy)
  const set = new Set(guardadas)
  const actual = M.etiquetaSemana(vie)
  const anterior = M.etiquetaSemana(M.fechaISOMasDias(vie, -7))
  set.add(actual); set.add(anterior)
  return { lista: [...set].sort((a, b) => M.semanaInicioDeLabel(a).localeCompare(M.semanaInicioDeLabel(b))), actual, anterior }
}

export function siguienteId(ids, prefijo, ancho = 0) {
  let max = 0
  const re = new RegExp('^' + prefijo + '(\\d+)$')
  ids.forEach((id) => { const m = re.exec(id || ''); if (m) max = Math.max(max, parseInt(m[1], 10)) })
  return prefijo + (ancho ? String(max + 1).padStart(ancho, '0') : String(max + 1))
}
export const ahoraTexto = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16)
