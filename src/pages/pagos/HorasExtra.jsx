import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { hoyCO, pesos, num, todas, opcionesSemana, empleadosMotor, porId, fechaCorta } from '../../nomina/datos.js'
import { archivoBancolombia, descargarTabla } from '../../nomina/xlsx.js'
import { AlertasFaltantes, calcularFaltantes } from './Jornada.jsx'
import { useOrden } from '../../nomina/orden.jsx'

const C = M.CATEGORIAS
const NOMBRES = { HED: 'Extra diurna', HEN: 'Extra nocturna', RN: 'Recargo nocturno', HDF: 'Dominical/festiva diurna', HNDF: 'Dominical/festiva nocturna', HEDF: 'Extra dom./fest. diurna', HENF: 'Extra dom./fest. nocturna' }

export default function HorasExtra({ config, empleados, soloLectura }) {
  const { cfg, festivos } = config
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const empPorId = useMemo(() => porId(emps), [emps])
  const [datos, setDatos] = useState(null) // { jornadas, he }
  const [semana, setSemana] = useState(() => opcionesSemana().anterior)
  const [grupo, setGrupo] = useState('industrial')
  const [filas, setFilas] = useState([])
  const [sucio, setSucio] = useState(false)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState('cuadro')
  const [banco, setBanco] = useState(null)
  const [editar, setEditar] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [jornadas, he] = await Promise.all([todas('jornadas'), todas('nomina_horas_extra')])
      setDatos({ jornadas, he }); setError('')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(() => { if (!sucio) cargar() }, ['jornadas', 'nomina_horas_extra'])

  const inicio = M.semanaInicioDeLabel(semana)
  const fechas = useMemo(() => M.fechasDeSemana(inicio), [inicio])
  const cadena = useMemo(() => (datos ? M.calcularCadenaDescuentosHE(datos.jornadas, datos.he, empPorId, cfg, festivos) : null), [datos, empPorId, cfg, festivos])
  const desdeJornada = useMemo(() => (datos ? M.calcularHorasExtraDesdeJornada(datos.jornadas, fechas, grupo, cfg, festivos) : {}), [datos, fechas, grupo, cfg, festivos])
  const opciones = useMemo(() => opcionesSemana(datos ? [...new Set(datos.he.map((r) => r.semana))] : []), [datos])

  // Arma el cuadro: lo guardado de la semana, o lo calculado desde la jornada
  useEffect(() => {
    if (!datos || sucio) return
    const lista = M.empleadosParaHorasExtra(emps, grupo).sort((a, b) => (a.Area || '').localeCompare(b.Area || '', 'es') || (a.Nombre || '').localeCompare(b.Nombre || '', 'es'))
    const guardado = Object.fromEntries(datos.he.filter((r) => r.semana === semana).map((r) => [r.empleado_id, r]))
    setFilas(lista.map((e) => {
      const g = guardado[e.ID_Empleado], j = desdeJornada[e.ID_Empleado] || {}
      const h = Object.fromEntries(C.map((c) => [c, g ? Number(g[c.toLowerCase()]) || 0 : M.redondear2(j[c] || 0)]))
      return { id: e.ID_Empleado, nombre: e.Nombre, area: e.Area, guardado: !!g, ...h }
    }))
  }, [datos, semana, grupo, emps, desdeJornada, sucio])

  const aplicar = (i, cambios) => { setSucio(true); setOk(''); setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios, editado: true } : f))) }
  const traerJornada = () => { setSucio(true); setFilas((fs) => fs.map((f) => ({ ...f, ...Object.fromEntries(C.map((c) => [c, M.redondear2((desdeJornada[f.id] || {})[c] || 0)])) }))) }

  const calc = (f) => {
    const emp = empPorId[f.id]
    const h = Object.fromEntries(C.map((c) => [c, Number(f[c]) || 0]))
    const v = M.calcularHorasExtra(emp, h, cfg)
    const debe = (cadena?.descuentos[f.id] || {})[inicio] || 0
    const saldoAnt = cadena ? M.saldoAntesDeSemana(cadena, f.id, inicio) : 0
    const d = M.aplicarDescuentoHoras(h, saldoAnt + debe, emp, cfg)
    return { ...v, debe, saldoAnt, aplicado: d, neto: Math.max(0, v.TotalHorasExtra - d.ValorDescuento) }
  }
  const totales = filas.reduce((a, f) => { const c = calc(f); a.bruto += c.TotalHorasExtra; a.neto += c.neto; return a }, { bruto: 0, neto: 0 })

  const guardar = async () => {
    setError(''); setOk('')
    try {
      setGuardando(true)
      const filasBD = filas.map((f) => {
        const emp = empPorId[f.id], c = M.calcularHorasExtra(emp, f, cfg)
        return { semana, semana_inicio: inicio, empleado_id: f.id, nombre: emp.Nombre, area: emp.Area || null, valor_hora: c.ValorHora,
          ...Object.fromEntries(C.map((k) => [k.toLowerCase(), Number(f[k]) || 0])), ...Object.fromEntries(C.map((k) => ['v_' + k.toLowerCase(), c['Valor' + k]])), total: c.TotalHorasExtra }
      })
      await q(sb.from('nomina_horas_extra').delete().eq('semana', semana).in('empleado_id', filas.map((f) => f.id)))
      if (filasBD.length) await q(sb.from('nomina_horas_extra').insert(filasBD))
      setOk(`Semana guardada (${grupo === 'industrial' ? 'Industrial' : 'Litografía'}): ${filasBD.length} personas.`)
      setSucio(false); await cargar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const prepararBanco = () => {
    try {
      setBanco(M.datosBancolombiaHorasExtra(semana, datos.he.filter((r) => r.semana === semana), empPorId, cadena, cfg, hoyCO()))
    } catch (e) { setError(e.message) }
  }

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const guardadaSemana = datos.he.some((r) => r.semana === semana)
  return (
    <div>
      <div className="barra-horas">
        <select value={semana} onChange={(e) => { setSucio(false); setSemana(e.target.value) }}>
          {opciones.lista.map((s) => <option key={s} value={s}>{s}{s === opciones.actual ? ' (en curso)' : ''}</option>)}
        </select>
        <div className="segmentado">
          <button className={grupo === 'industrial' ? 'sel' : ''} onClick={() => { setSucio(false); setGrupo('industrial') }}>Industrial</button>
          <button className={grupo === 'litografia' ? 'sel' : ''} onClick={() => { setSucio(false); setGrupo('litografia') }}>Litografía</button>
        </div>
        <div className="segmentado">
          {[['cuadro', 'Cuadro'], ['resumen', 'Resumen de la semana'], ['saldos', 'Saldos pendientes']].map(([v, t]) => <button key={v} className={vista === v ? 'sel' : ''} onClick={() => setVista(v)}>{t}</button>)}
        </div>
        {guardadaSemana ? <Badge tone="ok">Semana guardada</Badge> : <Badge tone="warn">Sin guardar</Badge>}
        <button className="btn btn-sec btn-sm" disabled={!guardadaSemana} onClick={prepararBanco}>Archivo Bancolombia</button>
        {vista === 'cuadro' && <>
          <span className="empuja pagos-total">A pagar <b>{pesos(totales.neto)}</b></span>
          {sucio && <Badge tone="warn">Cambios sin guardar</Badge>}
          {!soloLectura && <>
          <button className="btn btn-sec btn-sm" onClick={traerJornada} title="Reemplaza las horas del cuadro por las calculadas desde la jornada">Traer horas de la jornada</button>
          <button className="btn btn-ok btn-sm" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar semana'}</button>
          </>}
        </>}
      </div>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {vista === 'cuadro' && <>
        <AlertasFaltantes soloAnterior f={calcularFaltantes([...new Set(datos.jornadas.filter((j) => j.grupo === grupo).map((j) => j.fecha))], festivos)} />
        {soloLectura && <div className="aviso-consulta">Solo consulta y exportación: este usuario no puede editar ni guardar el cuadro.</div>}
        <div className="tabla-cont">
          <table className={'tabla tabla-pagos' + (soloLectura ? '' : ' tabla-click')}>
            <thead><tr><th>Nombre</th><th>Área</th>{C.map((c) => <th key={c} title={NOMBRES[c]} className="num">{c}</th>)}<th className="num">Valor hora</th><th className="num">Extras (bruto)</th><th title="Horas por devolver (descanso nocturno / llegadas tarde)">Descuento por devolver (h)</th><th className="num">Neto a pagar</th><th className="num">Saldo pendiente (h)</th></tr></thead>
            <tbody>
              {filas.map((f, i) => {
                const c = calc(f)
                return (
                  <tr key={f.id} onClick={() => !soloLectura && setEditar(i)} className={f.editado ? 'fila-editada' : ''} title={soloLectura ? '' : 'Clic para corregir las horas'}>
                    <td><b>{f.nombre}</b>{!f.guardado && <div className="tenue">calculado de la jornada</div>}</td>
                    <td className="tenue">{f.area}</td>
                    {C.map((k) => <td key={k} className="num">{Number(f[k]) ? num(Number(f[k])) : ''}</td>)}
                    <td className="num">{pesos(c.ValorHora)}</td>
                    <td className="num">{pesos(c.TotalHorasExtra)}</td>
                    <td className="num">{c.aplicado.AplicadoTotal > 0 || c.saldoAnt > 0 || c.debe > 0
                      ? <span title={`Debe esta semana: ${c.debe} h · saldo anterior: ${c.saldoAnt} h · queda: ${c.aplicado.SaldoFinal} h`}>{c.aplicado.AplicadoTotal} h ({M.textoAplicado(c.aplicado.Aplicado) || '—'})</span> : ''}</td>
                    <td className="num"><b>{pesos(c.neto)}</b></td>
                    <td className="num">{c.aplicado.SaldoFinal || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pagos-pie">
          <span>Bruto: <b>{pesos(totales.bruto)}</b> · A pagar: <b>{pesos(totales.neto)}</b></span>
        </div>
        <p className="ayuda-txt">Las horas se calculan solas desde la Jornada (viernes a jueves). Para corregirlas haz clic en la persona antes de guardar. El descuento por descanso nocturno y llegadas tarde se aplica sobre HED, HEN, HEDF y HENF, en ese orden.</p>
      </>}
      {vista === 'resumen' && <Resumen datos={datos} semana={semana} fechas={fechas} grupo={grupo} cfg={cfg} festivos={festivos} cadena={cadena} inicio={inicio} emps={emps} />}
      {vista === 'saldos' && <Saldos cadena={cadena} empPorId={empPorId} />}
      {banco && <ModalBanco res={banco} tipo="HORAS_EXTRA" onClose={() => setBanco(null)} />}
      {editar !== null && filas[editar] && <ModalHoras f={filas[editar]} calc={calc} desdeJornada={desdeJornada[filas[editar].id] || {}}
        onAplicar={(c) => { aplicar(editar, c); setEditar(null) }} onClose={() => setEditar(null)} />}
    </div>
  )
}

function ModalHoras({ f: inicial, calc, desdeJornada, onAplicar, onClose }) {
  const [d, setD] = useState(Object.fromEntries(C.map((c) => [c, inicial[c]])))
  const c = calc({ ...inicial, ...d })
  return (
    <Modal titulo={`${inicial.nombre} · horas extra`} onClose={onClose} ancho={720}>
      <form onSubmit={(e) => { e.preventDefault(); onAplicar(d) }}>
        <table className="tabla tabla-resumen">
          <thead><tr><th>Tipo</th><th className="num">Según jornada</th><th className="num">Horas a pagar</th><th className="num">Valor</th></tr></thead>
          <tbody>{C.map((k) => (
            <tr key={k}><td><b>{k}</b> <span className="tenue">{NOMBRES[k]}</span></td>
              <td className="num tenue">{M.redondear2(desdeJornada[k] || 0) || ''}</td>
              <td className="num"><input className="num-in" type="number" step="0.25" min="0" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} style={{ width: 90 }} /></td>
              <td className="num">{c['Valor' + k] ? pesos(c['Valor' + k]) : ''}</td></tr>
          ))}
            <tr className="sub"><td colSpan={3}><b>Bruto</b> <span className="tenue">(valor hora {pesos(c.ValorHora)})</span></td><td className="num"><b>{pesos(c.TotalHorasExtra)}</b></td></tr>
            {c.aplicado.AplicadoTotal > 0 && <tr><td colSpan={3}>Descuento por horas por devolver: {c.aplicado.AplicadoTotal} h ({M.textoAplicado(c.aplicado.Aplicado)}){c.aplicado.SaldoFinal > 0 ? ` · quedan ${c.aplicado.SaldoFinal} h` : ''}</td><td className="num">−{pesos(c.aplicado.ValorDescuento)}</td></tr>}
            <tr className="sub"><td colSpan={3}><b>A pagar</b></td><td className="num"><b>{pesos(c.neto)}</b></td></tr>
          </tbody>
        </table>
        <div className="acciones" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-sec" onClick={() => setD(Object.fromEntries(C.map((k) => [k, M.redondear2(desdeJornada[k] || 0)])))}>Usar las de la jornada</button>
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn btn-ok">Aplicar</button>
        </div>
        <p className="tenue pequeño">"Aplicar" deja el cambio en el cuadro; para que quede en firme usa "Guardar semana" arriba.</p>
      </form>
    </Modal>
  )
}

// Filas día a día con horas extra (jornada y 2ª jornada) de una semana, para los empleados del grupo
function detalleDias(datos, fechas, grupo, cfg, festivos, ids) {
  const filas = []
  datos.jornadas.filter((j) => j.grupo === grupo && ids.has(j.empleado_id)).forEach((j) => {
    M.segmentosDeJornada(j, cfg, festivos).forEach((s) => {
      if (!fechas.includes(s.Fecha)) return
      const tot = M.redondear2(C.reduce((a, c) => a + s.Clasif[c], 0))
      if (tot > 0) filas.push({ id: j.empleado_id, nombre: j.nombre, area: j.area || '', fecha: s.Fecha, jornada: s.Segunda ? '' : `${j.entrada || ''}–${j.salida || ''}`, segunda: s.Segunda ? `${j.seg_entrada}–${j.seg_salida}` : '', ...s.Clasif, tot })
    })
  })
  return filas
}
const diaCorto = (iso) => `${M.DIAS_SEMANA[M.diaSemana(iso)].slice(0, 3)} ${fechaCorta(iso).slice(0, 5)}`

// Resumen de la semana: qué días hicieron horas extra, descuentos por descansos/llegadas tarde y neto (igual que la hoja)
function Resumen({ datos, semana, fechas, grupo, cfg, festivos, cadena, inicio, emps }) {
  const [filtro, setFiltro] = useState('')
  const { ordenar, th } = useOrden()
  const empPorId = Object.fromEntries(M.empleadosParaHorasExtra(emps, grupo).map((e) => [e.ID_Empleado, e]))
  const ids = new Set(Object.keys(empPorId))
  const det = detalleDias(datos, fechas, grupo, cfg, festivos, ids)
  const guardado = {}, guardadoHoras = {}
  datos.he.filter((r) => r.semana === semana && ids.has(r.empleado_id)).forEach((r) => {
    guardado[r.empleado_id] = (guardado[r.empleado_id] || 0) + (Number(r.total) || 0)
    const h = guardadoHoras[r.empleado_id] || (guardadoHoras[r.empleado_id] = Object.fromEntries(C.map((c) => [c, 0])))
    C.forEach((c) => { h[c] += Number(r[c.toLowerCase()]) || 0 })
  })
  const porEmp = {}
  const fila = (id) => (porEmp[id] = porEmp[id] || { id, nombre: empPorId[id].Nombre, area: empPorId[id].Area || '', dias: [], descansos: [], tardanzas: [], ...Object.fromEntries(C.map((c) => [c, 0])), total: 0 })
  det.forEach((f) => { const e = fila(f.id); e.dias.push(f.fecha); C.forEach((c) => { e[c] += f[c] }); e.total += f.tot })
  const extra = []
  if (cadena) {
    cadena.descansos.forEach((d) => { if (!ids.has(d.ID_Empleado) || d.SemanaInicio !== inicio) return; fila(d.ID_Empleado).descansos.push(d); extra.push({ id: d.ID_Empleado, nombre: d.Nombre, fecha: d.Fecha, nota: d.Laboral ? `Descanso nocturno: ${d.Horas} h por devolver` : 'Descanso en día no laboral: no genera horas' }) })
    cadena.tardanzas.forEach((t) => { if (!ids.has(t.ID_Empleado) || t.SemanaInicio !== inicio) return; fila(t.ID_Empleado).tardanzas.push(t); extra.push({ id: t.ID_Empleado, nombre: t.Nombre, fecha: t.Fecha, nota: `Llegó ${t.Entrada} (${t.Minutos} min tarde = ${t.Horas} h)` }) })
    Object.keys(guardado).forEach((id) => { if (guardado[id] > 0) fila(id) })
    Object.keys(cadena.porEmpleado).forEach((id) => { if (ids.has(id) && M.saldoAntesDeSemana(cadena, id, inicio) > 0) fila(id) })
  }
  const lista = Object.values(porEmp).map((e) => {
    C.forEach((c) => { e[c] = M.redondear2(e[c]) }); e.total = M.redondear2(e.total)
    e.fest = M.redondear2(e.HDF + e.HNDF + e.HEDF + e.HENF)
    const base = guardado[e.id] !== undefined ? guardadoHoras[e.id] : Object.fromEntries(C.map((c) => [c, e[c]]))
    e.bruto = guardado[e.id] !== undefined ? guardado[e.id] : M.calcularHorasExtra(empPorId[e.id], base, cfg).TotalHorasExtra
    e.debe = M.redondear2(e.descansos.reduce((a, d) => a + (d.Horas || 0), 0) + e.tardanzas.reduce((a, t) => a + t.Horas, 0))
    e.saldoAnt = cadena ? M.saldoAntesDeSemana(cadena, e.id, inicio) : 0
    const r = M.aplicarDescuentoHoras(base, e.saldoAnt + e.debe, empPorId[e.id], cfg)
    e.aplicado = r; e.neto = Math.max(0, e.bruto - r.ValorDescuento)
    e.dias = [...new Set(e.dias)].sort()
    e.novedades = [...e.descansos.map((d) => `descanso ${fechaCorta(d.Fecha).slice(0, 5)}`), ...e.tardanzas.map((t) => `tarde ${fechaCorta(t.Fecha).slice(0, 5)} (${t.Minutos} min)`)].join(', ')
    return e
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const enc = ['Empleado', 'Área', 'Días con horas', 'Fechas', 'HED', 'HEN', 'RN', 'Dom./festivo', 'Total horas', 'Extras (bruto)', 'Descansos y llegadas tarde', 'Descuento (h)', 'Saldo anterior (h)', 'Neto a pagar', 'Saldo pendiente (h)']
  const filasX = lista.map((e) => [e.nombre, e.area, e.dias.length, e.dias.map((d) => fechaCorta(d).slice(0, 5)).join(', '), e.HED, e.HEN, e.RN, e.fest, e.total, Math.round(e.bruto), e.novedades, e.aplicado.AplicadoTotal, e.saldoAnt, Math.round(e.neto), e.aplicado.SaldoFinal])
  const detalle = [...det, ...extra.map((x) => ({ ...x, nota: x.nota }))].filter((f) => !filtro || f.id === filtro).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.fecha.localeCompare(b.fecha))
  return (
    <div>
      <div className="barra-horas">
        <span className="tenue">{grupo === 'industrial' ? 'Industrial' : 'Litografía'} · {semana}</span>
        <button className="btn btn-sec btn-sm empuja" onClick={() => descargarTabla(`Resumen_HE_${grupo}.xlsx`, enc, filasX)}>Descargar resumen (Excel)</button>
      </div>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr>{enc.map((t, i) => th(i, t, { className: i >= 4 && i !== 10 ? 'num' : '' }))}</tr></thead>
        <tbody>{ordenar(lista, (e, k) => filasX[lista.indexOf(e)][k]).map((e) => <tr key={e.id}><td><b>{e.nombre}</b></td><td className="tenue">{e.area}</td><td className="num">{e.dias.length || ''}</td><td className="tenue">{e.dias.map(diaCorto).join(', ')}</td>
          {['HED', 'HEN', 'RN', 'fest', 'total'].map((k) => <td key={k} className="num">{e[k] ? num(e[k]) : ''}</td>)}
          <td className="num">{pesos(e.bruto)}</td><td className="tenue">{e.novedades}</td><td className="num">{e.aplicado.AplicadoTotal || ''}</td><td className="num">{e.saldoAnt || ''}</td>
          <td className="num"><b>{pesos(e.neto)}</b></td><td className="num">{e.aplicado.SaldoFinal || ''}</td></tr>)}</tbody>
      </table>{!lista.length && <p className="tenue">Nadie tuvo horas extra, descansos ni llegadas tarde esa semana.</p>}</div>
      <div className="barra-horas" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Detalle día por día</h3>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos los empleados</option>{lista.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
        <button className="btn btn-sec btn-sm empuja" onClick={() => descargarTabla(`Detalle_HE_${grupo}.xlsx`, ['Empleado', 'Fecha', 'Día', 'Jornada', '2ª jornada', ...C, 'Total', 'Nota'],
          detalle.map((f) => [f.nombre, f.fecha, M.DIAS_SEMANA[M.diaSemana(f.fecha)], f.jornada || '', f.segunda || '', ...C.map((c) => f[c] || 0), f.tot || 0, f.nota || '']))}>Descargar detalle (Excel)</button>
      </div>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Jornada</th><th>2ª jornada</th>{C.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>{detalle.map((f, i) => <tr key={i}><td>{f.nombre}</td><td>{diaCorto(f.fecha)}</td>
          {f.nota ? <td colSpan={C.length + 3} className="tenue">{f.nota}</td> : <><td className="tenue">{f.jornada}</td><td className="tenue">{f.segunda}</td>{C.map((c) => <td key={c} className="num">{f[c] ? num(f[c]) : ''}</td>)}<td className="num"><b>{num(f.tot)}</b></td></>}</tr>)}</tbody>
      </table></div>
    </div>
  )
}

// Saldos pendientes por descansos nocturnos y llegadas tarde, con su historial (igual que la hoja)
function Saldos({ cadena, empPorId }) {
  const [filtro, setFiltro] = useState('')
  const { ordenar, th } = useOrden()
  if (!cadena) return null
  const res = {}, movs = []
  const r = (id, nombre, area) => (res[id] = res[id] || { id, nombre: nombre || empPorId[id]?.Nombre || id, area: area || empPorId[id]?.Area || '', desc: 0, tarde: 0, gen: 0, descontadas: 0, saldo: 0 })
  const rango = (w) => `${fechaCorta(w).slice(0, 5)} al ${fechaCorta(M.fechaISOMasDias(w, 6)).slice(0, 5)}`
  cadena.descansos.forEach((d) => { const x = r(d.ID_Empleado, d.Nombre, d.Area); x.gen = M.redondear2(x.gen + (d.Horas || 0)); x.desc = M.redondear2(x.desc + (d.Horas || 0))
    movs.push({ id: d.ID_Empleado, nombre: x.nombre, fecha: d.Fecha, tipo: 'Descanso', semana: rango(d.SemanaInicio), horas: d.Horas || 0, detalle: d.Laboral ? `Día de descanso por turno nocturno: se deben ${d.Horas} h` : 'Cae en día no laboral: no genera horas por devolver', orden: d.Fecha + '1' }) })
  cadena.tardanzas.forEach((t) => { const x = r(t.ID_Empleado, t.Nombre, t.Area); x.gen = M.redondear2(x.gen + t.Horas); x.tarde = M.redondear2(x.tarde + t.Horas)
    movs.push({ id: t.ID_Empleado, nombre: x.nombre, fecha: t.Fecha, tipo: 'Llegada tarde', semana: rango(t.SemanaInicio), horas: t.Horas, detalle: `Llegó a las ${t.Entrada} (${t.Minutos} min tarde)${t.Observacion ? ' · ' + t.Observacion : ''}`, orden: t.Fecha + '1' }) })
  Object.entries(cadena.porEmpleado).forEach(([id, sem]) => Object.keys(sem).sort().forEach((w) => { const c = sem[w], x = r(id); x.saldo = c.SaldoFinal
    if (c.AplicadoTotal > 0) { x.descontadas = M.redondear2(x.descontadas + c.AplicadoTotal)
      movs.push({ id, nombre: x.nombre, fecha: M.fechaISOMasDias(w, 6), tipo: 'Descuento', semana: rango(w), horas: -c.AplicadoTotal, detalle: `Se descontaron ${c.AplicadoTotal} h de las extras de esa semana (${M.textoAplicado(c.Aplicado)})${c.SaldoFinal > 0 ? ` · quedan ${c.SaldoFinal} h pendientes` : ' · saldo saldado'}`, orden: M.fechaISOMasDias(w, 7) + '2' }) } }))
  const lista = Object.values(res).sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, 'es'))
  const mv = movs.filter((m) => !filtro || m.id === filtro).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : 0))
  const enc = ['Empleado', 'Área', 'Por descansos (h)', 'Por llegadas tarde (h)', 'Total generadas', 'Horas ya descontadas', 'Saldo pendiente (h)']
  return (
    <div>
      <div className="barra-horas"><span className="tenue">Un día de descanso por turno nocturno (en día laboral) equivale a {cadena.horasDia} h. Las llegadas tarde cuentan desde el {fechaCorta(M.FECHA_INICIO_SALDO_TARDANZAS)}.</span>
        <button className="btn btn-sec btn-sm empuja" onClick={() => descargarTabla('Saldos_horas_por_devolver.xlsx', enc, lista.map((x) => [x.nombre, x.area, x.desc, x.tarde, x.gen, x.descontadas, x.saldo]))}>Descargar (Excel)</button></div>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr>{enc.map((t, i) => th(i, t, { className: i > 1 ? 'num' : '' }))}</tr></thead>
        <tbody>{ordenar(lista, (x, k) => [x.nombre, x.area, x.desc, x.tarde, x.gen, x.descontadas, x.saldo][k]).map((x) => <tr key={x.id}><td><b>{x.nombre}</b></td><td className="tenue">{x.area}</td><td className="num">{x.desc}</td><td className="num">{x.tarde}</td><td className="num">{x.gen}</td><td className="num">{x.descontadas}</td><td className="num"><b>{x.saldo}</b></td></tr>)}</tbody>
      </table></div>
      <div className="barra-horas" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Historial de movimientos</h3>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todos los empleados</option>{lista.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      </div>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr><th>Empleado</th><th>Fecha</th><th>Movimiento</th><th>Semana del turno</th><th className="num">Horas</th><th>Detalle</th></tr></thead>
        <tbody>{mv.map((m, i) => <tr key={i}><td>{m.nombre}</td><td>{diaCorto(m.fecha)}</td><td>{m.tipo}</td><td className="tenue">{m.semana}</td><td className="num">{m.horas > 0 ? '+' : ''}{m.horas}</td><td className="tenue">{m.detalle}</td></tr>)}</tbody>
      </table></div>
    </div>
  )
}

export function ModalBanco({ res, tipo, onClose }) {
  const total = res.filas.reduce((a, f) => a + f.ValorTransaccion, 0)
  return (
    <Modal titulo="Archivo de pago Bancolombia" onClose={onClose} ancho={720}>
      <p><b>{res.filas.length}</b> pagos por <b>{pesos(total)}</b> — {res.quincena || res.semana}</p>
      {res.descuentos?.length > 0 && <Aviso tipo="warn"><b>Descuentos aplicados:</b><ul>{res.descuentos.map((d, i) => <li key={i}>{d}</li>)}</ul></Aviso>}
      {res.excluidos.length > 0 && <Aviso tipo="warn"><b>No se incluyen:</b><ul>{res.excluidos.map((d, i) => <li key={i}>{d}</li>)}</ul></Aviso>}
      <div className="tabla-cont" style={{ maxHeight: 300 }}><table className="tabla"><tbody>{res.filas.map((f, i) => <tr key={i}><td>{f.NombreBeneficiario}</td><td className="num">{pesos(f.ValorTransaccion)}</td></tr>)}</tbody></table></div>
      <div className="pagos-pie">
        <button className="btn btn-sec" onClick={() => descargarTabla('Detalle_pago.xlsx', ['Nombre', 'Documento', 'Banco', 'Cuenta', 'Valor'], res.filas.map((f) => [f.NombreBeneficiario, f.NitBeneficiario, f.CodigoBanco, f.NoCuentaBeneficiario, f.ValorTransaccion]))}>Descargar detalle</button>
        <button className="btn btn-ok" onClick={() => { archivoBancolombia(res, tipo); onClose() }}>Descargar archivo PAB</button>
      </div>
    </Modal>
  )
}
