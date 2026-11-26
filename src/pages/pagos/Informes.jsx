import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Cargando } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { pesos, num, todas, empleadosMotor, porId, hoyCO, fechaCorta } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'

const VISTAS = [['novedades', 'Novedades de la quincena'], ['costos', 'Costo de nómina'], ['extras', 'Horas extra'], ['ausentismo', 'Ausentismo'], ['programados', 'Programados'], ['historico', 'Histórico por empleado']]
const ordenQ = (a, b) => M.parsearQuincena(a).inicio.localeCompare(M.parsearQuincena(b).inicio)

function Barras({ datos }) {
  const max = Math.max(1, ...datos.map((d) => d.v))
  return <div className="barras">{datos.map((d) => <div key={d.k} className="barra-col" title={`${d.k}: ${pesos(d.v)}`}><div className="barra-val" style={{ height: `${(d.v / max) * 100}%` }} /><span>{d.c}</span></div>)}</div>
}
function Tabla({ enc, filas, archivo }) {
  return (
    <>
      <div className="barra-horas"><button className="btn btn-sec btn-sm" onClick={() => descargarTabla(archivo, enc, filas.map((f) => f.map((v) => (v && v.excel !== undefined ? v.excel : v))))}>Exportar Excel</button></div>
      <div className="tabla-cont"><table className="tabla tabla-pagos"><thead><tr>{enc.map((e) => <th key={e}>{e}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j} className={typeof (v?.excel ?? v) === 'number' ? 'num' : ''}>{v?.ver ?? v}</td>)}</tr>)}</tbody></table></div>
    </>
  )
}
const $ = (v) => ({ ver: pesos(v), excel: Math.round(Number(v) || 0) })

export default function Informes({ config, empleados }) {
  const { cfg, festivos } = config
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const empPorId = useMemo(() => porId(emps), [emps])
  const [d, setD] = useState(null)
  const [vista, setVista] = useState('novedades')
  const [error, setError] = useState('')
  const [quincena, setQuincena] = useState('')
  const [cant, setCant] = useState(12)
  const [rango, setRango] = useState(() => { const h = hoyCO(); return { desde: h.slice(0, 8) + '01', hasta: h } })
  const [emp, setEmp] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [nomina, he, jornadas, aus, prog] = await Promise.all([todas('nomina_quincenal'), todas('nomina_horas_extra'), todas('jornadas'), todas('ausentismos'), todas('programados')])
      setD({ nomina, he, jornadas, aus, prog }); setError('')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['nomina_quincenal', 'nomina_horas_extra', 'ausentismos', 'programados'], 120000)
  const quincenas = useMemo(() => (d ? [...new Set(d.nomina.map((n) => n.quincena))].sort(ordenQ) : []), [d])
  useEffect(() => { if (!quincena && quincenas.length) setQuincena(quincenas.at(-1)) }, [quincenas, quincena])
  const cadena = useMemo(() => (d ? M.calcularCadenaDescuentosHE(d.jornadas, d.he, empPorId, cfg, festivos) : null), [d, empPorId, cfg, festivos])
  const netoHE = (r) => { const c = cadena.porEmpleado[r.empleado_id]?.[r.semana_inicio]; return c ? c.Neto : Number(r.total) || 0 }

  if (!d) return error ? <Aviso>{error}</Aviso> : <Cargando />
  let cuerpo = null

  if (vista === 'novedades' && quincena) {
    const qi = M.parsearQuincena(quincena), nov = []
    d.nomina.filter((n) => n.quincena === quincena).forEach((r) => {
      const area = empPorId[r.empleado_id]?.Area || ''
      if (Number(r.incapacidad) > 0) nov.push([r.nombre, area, 'Incapacidad', $(r.subsidio_incapacidad), `${Number(r.incapacidad)} día(s) — subsidio pagado`, 'Nómina'])
      if (Number(r.otros) !== 0) nov.push([r.nombre, area, Number(r.otros) > 0 ? 'Ajuste adicional' : 'Descuento adicional', $(r.otros), r.nota || '(sin motivo escrito)', 'Nómina'])
      if (Number(r.programado) !== 0) nov.push([r.nombre, area, Number(r.programado) > 0 ? 'Pago programado' : 'Descuento programado', $(r.programado), r.programado_concepto || '', 'Nómina'])
    })
    const g = {}
    d.aus.filter((a) => a.estado === 'Activo' && !M.AUS_TIPOS_INCAPACIDAD.includes(a.tipo) && a.fecha_fin >= qi.inicio && a.fecha_inicio <= qi.fin).forEach((a) => {
      const k = a.empleado_id + '|' + a.tipo
      g[k] = g[k] || { n: a.nombre, area: empPorId[a.empleado_id]?.Area || '', t: a.tipo, dias: 0, obs: [] }
      g[k].dias += M.calcularDiasHabiles(a.fecha_inicio > qi.inicio ? a.fecha_inicio : qi.inicio, a.fecha_fin < qi.fin ? a.fecha_fin : qi.fin, festivos)
      if (a.observacion) g[k].obs.push(a.observacion)
    })
    Object.values(g).forEach((x) => nov.push([x.n, x.area, x.t, $(0), `${x.dias} día(s) hábil(es)${x.obs.length ? ' — ' + x.obs.join('; ') : ''}`, 'Ausentismos']))
    cuerpo = <><select value={quincena} onChange={(e) => setQuincena(e.target.value)}>{quincenas.map((x) => <option key={x}>{x}</option>)}</select>
      <Tabla enc={['Empleado', 'Área', 'Tipo', 'Valor', 'Detalle', 'Fuente']} filas={nov} archivo={`Novedades_${quincena}.xlsx`} /></>
  }
  if (vista === 'costos') {
    const porQ = {}
    d.nomina.forEach((r) => {
      const a = porQ[r.quincena] = porQ[r.quincena] || { q: r.quincena, n: 0, basico: 0, aux: 0, sub: 0, prog: 0, dev: 0, desc: 0, neto: 0, he: 0 }
      a.n++; a.basico += +r.basico; a.aux += +r.aux_transporte; a.sub += +r.subsidio_incapacidad; a.prog += +r.programado; a.dev += +r.devengado; a.desc += +r.descuentos; a.neto += +r.neto
    })
    const porSem = {}
    d.he.forEach((r) => { porSem[r.semana] = (porSem[r.semana] || 0) + netoHE(r) })
    Object.entries(porSem).forEach(([s, v]) => { const fin = M.fechaISOMasDias(M.semanaInicioDeLabel(s), 6); Object.values(porQ).forEach((a) => { const qi = M.parsearQuincena(a.q); if (fin >= qi.inicio && fin <= qi.fin) a.he += v }) })
    const lista = Object.values(porQ).sort((a, b) => ordenQ(a.q, b.q)).slice(-cant)
    cuerpo = <><label className="inline">Últimas <input type="number" min="1" value={cant} onChange={(e) => setCant(Number(e.target.value) || 12)} /> quincenas</label>
      <Barras datos={lista.map((a) => ({ k: a.q, c: a.q.replace(/^Del (\d+) al (\d+) de (\w{3})\w* de \d+$/, '$1-$2 $3'), v: a.neto + a.he }))} />
      <Tabla enc={['Quincena', 'Personas', 'Básico', 'Aux. transporte', 'Subsidio incap.', 'Programado', 'Devengado', 'Descuentos', 'Neto nómina', 'Horas extra (neto)', 'Total pagado']}
        filas={lista.map((a) => [a.q, a.n, $(a.basico), $(a.aux), $(a.sub), $(a.prog), $(a.dev), $(a.desc), $(a.neto), $(a.he), $(a.neto + a.he)])} archivo="Costo_nomina.xlsx" /></>
  }
  if (vista === 'extras') {
    const sems = [...new Set(d.he.map((r) => r.semana))].sort((a, b) => M.semanaInicioDeLabel(a).localeCompare(M.semanaInicioDeLabel(b))).slice(-cant)
    const pe = {}, ps = Object.fromEntries(sems.map((s) => [s, 0]))
    d.he.filter((r) => sems.includes(r.semana) && Number(r.total) > 0).forEach((r) => {
      const neto = netoHE(r), x = pe[r.empleado_id] = pe[r.empleado_id] || { n: r.nombre, a: r.area || '', hed: 0, hen: 0, rn: 0, fest: 0, horas: 0, valor: 0, desc: 0, sem: 0 }
      x.hed += +r.hed; x.hen += +r.hen; x.rn += +r.rn; x.fest += +r.hdf + +r.hndf + +r.hedf + +r.henf
      x.horas += M.CATEGORIAS.reduce((a, c) => a + (+r[c.toLowerCase()] || 0), 0); x.valor += neto; x.desc += +r.total - neto; x.sem++; ps[r.semana] += neto
    })
    cuerpo = <><label className="inline">Últimas <input type="number" min="1" value={cant} onChange={(e) => setCant(Number(e.target.value) || 12)} /> semanas</label>
      <Barras datos={sems.map((s) => ({ k: s, c: fechaCorta(M.semanaInicioDeLabel(s)).slice(0, 5), v: ps[s] }))} />
      <Tabla enc={['Empleado', 'Área', 'HED', 'HEN', 'RN', 'Festivas', 'Total horas', 'Valor pagado', 'Descontado', 'Semanas']}
        filas={Object.values(pe).sort((a, b) => b.valor - a.valor).map((x) => [x.n, x.a, num(x.hed), num(x.hen), num(x.rn), num(x.fest), num(x.horas), $(x.valor), $(x.desc), x.sem])} archivo="Horas_extra.xlsx" /></>
  }
  if (vista === 'ausentismo') {
    const pe = {}
    d.aus.filter((a) => a.estado === 'Activo' && a.fecha_fin >= rango.desde && a.fecha_inicio <= rango.hasta).forEach((a) => {
      const dias = M.calcularDiasHabiles(a.fecha_inicio > rango.desde ? a.fecha_inicio : rango.desde, a.fecha_fin < rango.hasta ? a.fecha_fin : rango.hasta, festivos)
      if (dias <= 0) return
      const x = pe[a.empleado_id] = pe[a.empleado_id] || { n: a.nombre, a: empPorId[a.empleado_id]?.Area || '', t: {}, tot: 0 }
      x.t[a.tipo] = (x.t[a.tipo] || 0) + dias; x.tot += dias
    })
    cuerpo = <><div className="barra-horas"><input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /> a <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
      <Tabla enc={['Empleado', 'Área', ...M.AUS_TIPOS, 'Total días hábiles']} filas={Object.values(pe).sort((a, b) => b.tot - a.tot).map((x) => [x.n, x.a, ...M.AUS_TIPOS.map((t) => x.t[t] || ''), x.tot])} archivo="Ausentismo.xlsx" /></>
  }
  if (vista === 'programados') {
    const r = { dt: [0, 0, 0, 0], pt: [0, 0, 0, 0], ind: [0, 0], emp: [] }
    d.prog.filter((p) => p.estado !== 'Cancelado').forEach((p) => {
      const v = +p.valor, tot = +p.quincenas_totales, apl = +p.quincenas_aplicadas, monto = +p.monto_total || 0
      if (tot > 0) {
        const pagado = apl >= tot ? monto : v * apl, pend = monto - pagado
        const t = monto < 0 ? r.dt : r.pt
        t[0]++; t[1] += Math.abs(monto); t[2] += Math.abs(pagado); t[3] += Math.abs(pend)
        if (p.estado === 'Activo' && pend !== 0) r.emp.push([p.nombre, p.concepto, $(monto), $(pend), `${apl}/${tot}`])
      } else if (p.estado === 'Activo') { r.ind[0]++; r.ind[1] += v }
    })
    cuerpo = <>
      <div className="tarjetas">
        <div className="tarjeta"><h3>Descuentos a término</h3><p>{r.dt[0]} · original {pesos(r.dt[1])}</p><p>Recuperado {pesos(r.dt[2])} · <b>pendiente {pesos(r.dt[3])}</b></p></div>
        <div className="tarjeta"><h3>Pagos a término</h3><p>{r.pt[0]} · original {pesos(r.pt[1])}</p><p>Pagado {pesos(r.pt[2])} · <b>pendiente {pesos(r.pt[3])}</b></p></div>
        <div className="tarjeta"><h3>Indefinidos activos</h3><p>{r.ind[0]} programados</p><p>Impacto por quincena <b>{pesos(r.ind[1])}</b></p></div>
      </div>
      <Tabla enc={['Empleado', 'Concepto', 'Monto total', 'Pendiente', 'Avance']} filas={r.emp.sort((a, b) => Math.abs(b[3].excel) - Math.abs(a[3].excel))} archivo="Programados.xlsx" /></>
  }
  if (vista === 'historico') {
    const filas = d.nomina.filter((n) => n.empleado_id === emp).sort((a, b) => ordenQ(a.quincena, b.quincena)).slice(-cant)
    cuerpo = <><div className="barra-horas"><select value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Elige un empleado…</option>{emps.map((e) => <option key={e.ID_Empleado} value={e.ID_Empleado}>{e.Nombre}{e.Estado === 'Inactivo' ? ' (retirado)' : ''}</option>)}</select>
      <label className="inline">Últimas <input type="number" min="1" value={cant} onChange={(e) => setCant(Number(e.target.value) || 12)} /> quincenas</label></div>
      {emp && <><Barras datos={filas.map((r) => ({ k: r.quincena, c: r.quincena.replace(/^Del (\d+) al (\d+) de (\w{3})\w* de \d+$/, '$1-$2 $3'), v: +r.neto }))} />
        <Tabla enc={['Quincena', 'Días', 'Incap.', 'Otros', 'Nota', 'Básico', 'Aux. transp.', 'Subsidio', 'Programado', 'Devengado', 'Salud', 'Pensión', 'Descuentos', 'Neto']}
          filas={filas.map((r) => [r.quincena, +r.dias, +r.incapacidad, $(r.otros), r.nota || '', $(r.basico), $(r.aux_transporte), $(r.subsidio_incapacidad), $(r.programado), $(r.devengado), $(r.salud), $(r.pension), $(r.descuentos), $(r.neto)])} archivo="Historico_empleado.xlsx" /></>}</>
  }
  return (
    <div>
      <div className="segmentado seg-envuelve">{VISTAS.map(([v, t]) => <button key={v} className={vista === v ? 'sel' : ''} onClick={() => setVista(v)}>{t}</button>)}</div>
      <Aviso>{error}</Aviso>
      <div style={{ marginTop: 14 }}>{cuerpo}</div>
    </div>
  )
}
