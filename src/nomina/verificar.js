// Verificación peso a peso: recalcula con el motor todo lo guardado y lo compara.
// Devuelve un informe con cada diferencia encontrada (no modifica nada).
import * as M from './motor.js'

export function verificarTodo(d) {
  const cfg = M.cfgMapa(d.config.parametros, d.config.factores)
  const festivos = d.config.festivos || []
  const emps = d.empleados.map(M.empMotor)
  const porId = Object.fromEntries(emps.map((e) => [e.ID_Empleado, e]))
  const inf = { nomina: { filas: 0, ok: 0, dif: [] }, horasExtra: { filas: 0, ok: 0, dif: [] }, jornadaVsExtras: { semanas: 0, ok: 0, dif: [] },
    causaciones: { quincenas: 0, ok: 0, dif: [] }, jornadas: { filas: 0, ok: 0, dif: [] } }

  // 1) Nómina quincenal: mismas entradas guardadas -> mismos valores
  const camposNb = [['Basico', 'basico'], ['AuxTransporte', 'aux_transporte'], ['SubsidioIncapacidad', 'subsidio_incapacidad'], ['TotalDevengado', 'devengado'],
    ['IBC', 'ibc'], ['Salud', 'salud'], ['Pension', 'pension'], ['TotalDescuentos', 'descuentos'], ['NetoPagar', 'neto'], ['DiasTrabajados', 'dias']]
  d.nomina.forEach((r) => {
    inf.nomina.filas++
    const base = porId[r.empleado_id]
    if (!base) { inf.nomina.dif.push({ q: r.quincena, emp: r.empleado_id, motivo: 'empleado no existe' }); return }
    const emp = { ...base, Salario: Number(r.salario) }
    const q = M.parsearQuincena(r.quincena)
    const input = { DiasTrabajados: r.dias, Incapacidad: r.incapacidad, OtrosAjuste: r.otros, DiasVacaciones: r.dias_vacaciones, DiasLicencia: r.dias_licencia }
    const calc = M.calcularNominaBase(emp, input, cfg, { valor: Number(r.programado) || 0 }, M.splitIncapacidadPorTipo(r.empleado_id, q.inicio, q.fin, d.ausentismos, festivos))
    const difs = camposNb.filter(([a, b]) => Math.abs((calc[a] || 0) - (Number(r[b]) || 0)) > 0.001).map(([a, b]) => `${a}: hoja ${r[b]} / nuevo ${calc[a]}`)
    if (difs.length) inf.nomina.dif.push({ q: r.quincena, emp: r.empleado_id, nombre: r.nombre, difs }); else inf.nomina.ok++
  })

  // 2) Horas extra guardadas: mismas horas -> mismos pesos
  const salarioEnSemana = (id) => porId[id]?.Salario
  d.horasExtra.forEach((r) => {
    inf.horasExtra.filas++
    const base = porId[r.empleado_id]
    if (!base) { inf.horasExtra.dif.push({ s: r.semana, emp: r.empleado_id, motivo: 'empleado no existe' }); return }
    // El valor hora guardado identifica el salario con que se liquidó (puede haber cambiado después)
    let emp = { ...base, Salario: salarioEnSemana(r.empleado_id) }
    if (Math.abs(M.calcularHorasExtra(emp, {}, cfg).ValorHora - Number(r.valor_hora)) > 0.01) emp = { ...base, Salario: Number(r.valor_hora) * cfg.divisorMensual }
    const h = Object.fromEntries(M.CATEGORIAS.map((c) => [c, Number(r[c.toLowerCase()]) || 0]))
    const calc = M.calcularHorasExtra(emp, h, cfg)
    const difs = M.CATEGORIAS.filter((c) => Math.abs(calc['Valor' + c] - Number(r['v_' + c.toLowerCase()])) > 0.001).map((c) => `${c}: hoja ${r['v_' + c.toLowerCase()]} / nuevo ${calc['Valor' + c]}`)
    if (Math.abs(calc.TotalHorasExtra - Number(r.total)) > 0.001) difs.push(`Total: hoja ${r.total} / nuevo ${calc.TotalHorasExtra}`)
    if (difs.length) inf.horasExtra.dif.push({ s: r.semana, emp: r.empleado_id, nombre: r.nombre, difs }); else inf.horasExtra.ok++
  })

  // 3) Horas de la jornada vs horas guardadas en la semana (lo que el cuadro prellena vs lo que se guardó)
  const semanas = [...new Set(d.horasExtra.map((r) => r.semana))]
  semanas.forEach((sem) => {
    const inicio = M.semanaInicioDeLabel(sem)
    const fechas = M.fechasDeSemana(inicio)
    const calc = { ...M.calcularHorasExtraDesdeJornada(d.jornadas, fechas, 'litografia', cfg, festivos), ...M.calcularHorasExtraDesdeJornada(d.jornadas, fechas, 'industrial', cfg, festivos) }
    inf.jornadaVsExtras.semanas++
    let todoOk = true
    d.horasExtra.filter((r) => r.semana === sem).forEach((r) => {
      const c = calc[r.empleado_id] || {}
      const difs = M.CATEGORIAS.filter((k) => Math.abs((c[k] || 0) - (Number(r[k.toLowerCase()]) || 0)) > 0.011).map((k) => `${k}: guardado ${r[k.toLowerCase()]} / jornada ${M.redondear2(c[k] || 0)}`)
      if (difs.length) { todoOk = false; inf.jornadaVsExtras.dif.push({ s: sem, emp: r.empleado_id, nombre: r.nombre, difs }) }
    })
    if (todoOk) inf.jornadaVsExtras.ok++
  })

  // 4) Horas laboradas de cada jornada
  d.jornadas.forEach((j) => {
    inf.jornadas.filas++
    if ((j.estado || 'Normal') !== 'Normal' || !j.entrada || !j.salida) { inf.jornadas.ok++; return }
    const h = M.calcularHorasLaboradas(j.entrada, j.salida, cfg, M.esDiaLaboralNormal(j.fecha, festivos))
    const seg = j.seg_entrada ? M.calcularHorasSegunda(j.seg_entrada, j.seg_salida, !!j.seg_fecha_salida && j.seg_fecha_salida > j.fecha) : 0
    const difs = []
    if (Math.abs((h ?? 0) - Number(j.horas)) > 0.001) difs.push(`horas: hoja ${j.horas} / nuevo ${h}`)
    if (j.seg_entrada && Math.abs((seg ?? 0) - Number(j.seg_horas)) > 0.001) difs.push(`2ª jornada: hoja ${j.seg_horas} / nuevo ${seg}`)
    if (difs.length) inf.jornadas.dif.push({ f: j.fecha, emp: j.empleado_id, nombre: j.nombre, difs }); else inf.jornadas.ok++
  })

  // 5) Causaciones: regenerar cada quincena causada y comparar por empleado + cuenta + centro + concepto
  const qs = [...new Set(d.causaciones.map((c) => c.quincena))]
  qs.forEach((q) => {
    inf.causaciones.quincenas++
    const nb = d.nomina.filter((r) => r.quincena === q)
    let gen
    try { gen = M.generarCausacionQuincena(q, nb, porId, d.ausentismos, d.config.causaciones) } catch (e) { inf.causaciones.dif.push({ q, motivo: e.message }); return }
    const clave = (l) => [l.ID_Empleado ?? l.empleado_id, l.Cuenta ?? l.cuenta, l.CentroCosto ?? l.centro_costo ?? '', l.Concepto ?? l.concepto].join('|')
    const suma = {}
    gen.lineas.forEach((l) => { const k = clave(l); suma[k] = suma[k] || [0, 0, 0, 0]; suma[k][0] += l.Debito; suma[k][1] += l.Credito })
    d.causaciones.filter((c) => c.quincena === q).forEach((c) => { const k = clave(c); suma[k] = suma[k] || [0, 0, 0, 0]; suma[k][2] += Number(c.debito); suma[k][3] += Number(c.credito) })
    const difs = Object.entries(suma).filter(([, v]) => Math.abs(v[0] - v[2]) > 0.001 || Math.abs(v[1] - v[3]) > 0.001)
      .map(([k, v]) => `${k}: hoja D${v[2]} C${v[3]} / nuevo D${v[0]} C${v[1]}`)
    if (difs.length) inf.causaciones.dif.push({ q, difs }); else inf.causaciones.ok++
  })
  return inf
}
