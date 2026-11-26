import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { hoyCO, pesos, num, todas, opcionesSemana, empleadosMotor, porId, fechaCorta } from '../../nomina/datos.js'
import { archivoBancolombia, descargarTabla } from '../../nomina/xlsx.js'

const C = M.CATEGORIAS
const NOMBRES = { HED: 'Extra diurna', HEN: 'Extra nocturna', RN: 'Recargo nocturno', HDF: 'Dominical/festiva diurna', HNDF: 'Dominical/festiva nocturna', HEDF: 'Extra dom./fest. diurna', HENF: 'Extra dom./fest. nocturna' }

export default function HorasExtra({ config, empleados }) {
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

  const cambiar = (i, c, v) => { setSucio(true); setOk(''); setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [c]: v } : f))) }
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
          {[['cuadro', 'Cuadro'], ['detalle', 'Detalle por día'], ['saldos', 'Saldos por devolver']].map(([v, t]) => <button key={v} className={vista === v ? 'sel' : ''} onClick={() => setVista(v)}>{t}</button>)}
        </div>
        {guardadaSemana ? <Badge tone="ok">Semana guardada</Badge> : <Badge tone="warn">Sin guardar</Badge>}
        <button className="btn btn-sec btn-sm" disabled={!guardadaSemana} onClick={prepararBanco}>Archivo Bancolombia</button>
      </div>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {vista === 'cuadro' && <>
        <div className="tabla-cont">
          <table className="tabla tabla-pagos">
            <thead><tr><th>Nombre</th><th>Área</th>{C.map((c) => <th key={c} title={NOMBRES[c]}>{c}</th>)}<th>Valor hora</th><th>Bruto</th><th title="Horas por devolver (descanso nocturno / llegadas tarde)">Descuento</th><th>A pagar</th></tr></thead>
            <tbody>
              {filas.map((f, i) => {
                const c = calc(f)
                return (
                  <tr key={f.id}>
                    <td><b>{f.nombre}</b>{!f.guardado && <div className="tenue">calculado de la jornada</div>}</td>
                    <td className="tenue">{f.area}</td>
                    {C.map((k) => <td key={k}><input className="num-in" type="number" step="0.25" min="0" value={f[k]} onChange={(e) => cambiar(i, k, e.target.value)} /></td>)}
                    <td className="num">{pesos(c.ValorHora)}</td>
                    <td className="num">{pesos(c.TotalHorasExtra)}</td>
                    <td className="num">{c.aplicado.AplicadoTotal > 0 || c.saldoAnt > 0 || c.debe > 0
                      ? <span title={`Debe esta semana: ${c.debe} h · saldo anterior: ${c.saldoAnt} h · queda: ${c.aplicado.SaldoFinal} h`}>{c.aplicado.AplicadoTotal} h ({M.textoAplicado(c.aplicado.Aplicado) || '—'}){c.aplicado.SaldoFinal > 0 && <div className="tenue">queda {c.aplicado.SaldoFinal} h</div>}</span> : ''}</td>
                    <td className="num"><b>{pesos(c.neto)}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pagos-pie">
          <span>Bruto: <b>{pesos(totales.bruto)}</b> · A pagar: <b>{pesos(totales.neto)}</b></span>
          <button className="btn btn-sec" onClick={traerJornada}>Traer horas de la jornada</button>
          <button className="btn btn-ok" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar semana'}</button>
        </div>
        <p className="ayuda-txt">Las horas se calculan solas desde la Jornada (viernes a jueves). Puedes corregirlas antes de guardar. El descuento por descanso nocturno y llegadas tarde se aplica sobre HED, HEN, HEDF y HENF, en ese orden.</p>
      </>}
      {vista === 'detalle' && <DetalleDias datos={datos} fechas={fechas} grupo={grupo} cfg={cfg} festivos={festivos} cadena={cadena} inicio={inicio} />}
      {vista === 'saldos' && <Saldos cadena={cadena} empPorId={empPorId} />}
      {banco && <ModalBanco res={banco} tipo="HORAS_EXTRA" onClose={() => setBanco(null)} />}
    </div>
  )
}

function DetalleDias({ datos, fechas, grupo, cfg, festivos, cadena, inicio }) {
  const filas = []
  datos.jornadas.filter((j) => j.grupo === grupo).forEach((j) => {
    M.segmentosDeJornada(j, cfg, festivos).forEach((s) => {
      if (!fechas.includes(s.Fecha)) return
      const tot = C.reduce((a, c) => a + s.Clasif[c], 0)
      if (tot > 0) filas.push({ nombre: j.nombre, fecha: s.Fecha, jornada: s.Segunda ? `2ª: ${j.seg_entrada}–${j.seg_salida}` : `${j.entrada}–${j.salida}`, ...s.Clasif, tot })
    })
  })
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.fecha.localeCompare(b.fecha))
  const desc = cadena ? [...cadena.descansos.filter((d) => d.SemanaInicio === inicio), ...cadena.tardanzas.filter((t) => t.SemanaInicio === inicio)] : []
  return (
    <div>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr><th>Nombre</th><th>Fecha</th><th>Jornada</th>{C.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}><td>{f.nombre}</td><td>{M.DIAS_SEMANA[M.diaSemana(f.fecha)].slice(0, 3)} {fechaCorta(f.fecha)}</td><td className="tenue">{f.jornada}</td>{C.map((c) => <td key={c} className="num">{f[c] ? num(f[c]) : ''}</td>)}<td className="num"><b>{num(f.tot)}</b></td></tr>)}</tbody>
      </table></div>
      {desc.length > 0 && <><h3>Tiempo por devolver esta semana</h3><ul>{desc.map((d, i) => <li key={i}>{d.Nombre}: {d.Minutos ? `llegó tarde el ${fechaCorta(d.Fecha)} (${d.Minutos} min = ${d.Horas} h)` : `descanso nocturno el ${fechaCorta(d.Fecha)} (${d.Horas} h)`}</li>)}</ul></>}
    </div>
  )
}

function Saldos({ cadena, empPorId }) {
  if (!cadena) return null
  const res = {}
  const r = (id) => (res[id] = res[id] || { id, nombre: empPorId[id]?.Nombre || id, gen: 0, desc: 0, tarde: 0, descontadas: 0, saldo: 0 })
  cadena.descansos.forEach((d) => { const x = r(d.ID_Empleado); x.desc = M.redondear2(x.desc + (d.Horas || 0)); x.gen = M.redondear2(x.gen + (d.Horas || 0)) })
  cadena.tardanzas.forEach((t) => { const x = r(t.ID_Empleado); x.tarde = M.redondear2(x.tarde + t.Horas); x.gen = M.redondear2(x.gen + t.Horas) })
  Object.entries(cadena.porEmpleado).forEach(([id, sem]) => Object.keys(sem).sort().forEach((w) => { const x = r(id); x.saldo = sem[w].SaldoFinal; x.descontadas = M.redondear2(x.descontadas + sem[w].AplicadoTotal) }))
  const lista = Object.values(res).sort((a, b) => b.saldo - a.saldo)
  return (
    <div className="tabla-cont"><table className="tabla tabla-pagos">
      <thead><tr><th>Nombre</th><th>Horas generadas</th><th>Por descanso nocturno</th><th>Por llegadas tarde</th><th>Descontadas de extras</th><th>Saldo pendiente</th></tr></thead>
      <tbody>{lista.map((x) => <tr key={x.id}><td>{x.nombre}</td><td className="num">{x.gen}</td><td className="num">{x.desc}</td><td className="num">{x.tarde}</td><td className="num">{x.descontadas}</td><td className="num"><b>{x.saldo}</b></td></tr>)}</tbody>
    </table><p className="ayuda-txt">Un día de descanso por turno nocturno (en día laboral) equivale a {cadena.horasDia} h. Las llegadas tarde cuentan desde el {fechaCorta(M.FECHA_INICIO_SALDO_TARDANZAS)}.</p></div>
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
