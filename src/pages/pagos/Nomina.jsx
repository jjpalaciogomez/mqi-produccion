import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { hoyCO, pesos, todas, opcionesQuincena, empleadosMotor, porId } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'
import { ModalBanco } from './HorasExtra.jsx'

export default function Nomina({ config, empleados }) {
  const { cfg, festivos } = config
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const empPorId = useMemo(() => porId(emps), [emps])
  const [datos, setDatos] = useState(null)
  const [quincena, setQuincena] = useState(() => opcionesQuincena().actual)
  const [filas, setFilas] = useState([])
  const [sucio, setSucio] = useState(false)
  const [recalc, setRecalc] = useState(false)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [banco, setBanco] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [nomina, programados, vacaciones, ausentismos] = await Promise.all([todas('nomina_quincenal'), todas('programados'), todas('vacaciones'), todas('ausentismos')])
      setDatos({ nomina, programados, vacaciones, ausentismos }); setError('')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(() => { if (!sucio) cargar() }, ['nomina_quincenal', 'programados', 'vacaciones', 'ausentismos'])

  const qi = M.parsearQuincena(quincena)
  const opciones = useMemo(() => opcionesQuincena(datos ? [...new Set(datos.nomina.map((n) => n.quincena))] : []), [datos])
  const guardadas = useMemo(() => (datos ? Object.fromEntries(datos.nomina.filter((n) => n.quincena === quincena).map((n) => [n.empleado_id, n])) : {}), [datos, quincena])
  const yaExiste = Object.keys(guardadas).length > 0

  useEffect(() => {
    if (!datos || sucio || !qi) return
    let lista = M.empleadosParaNomina(emps, qi.inicio)
    emps.forEach((e) => { if (guardadas[e.ID_Empleado] && !lista.includes(e)) lista.push(e) })
    lista = lista.filter((e) => guardadas[e.ID_Empleado] || M.diasAntesIngreso(e.FechaIngreso, qi.inicio, qi.fin) < 15)
    lista.sort((a, b) => (a.Nombre || '').localeCompare(b.Nombre || '', 'es'))
    setFilas(lista.map((e) => {
      const g = guardadas[e.ID_Empleado]
      const s = M.sugeridosQuincena(e, qi.inicio, qi.fin, datos.ausentismos, datos.vacaciones, festivos)
      const usarGuardado = g && !recalc
      const prog = M.programadoActivo(e.ID_Empleado, datos.programados)
      const ent = usarGuardado ? { DiasTrabajados: Number(g.dias), Incapacidad: Number(g.incapacidad), DiasVacaciones: Number(g.dias_vacaciones), DiasLicencia: Number(g.dias_licencia) } : s
      const lim = M.calcularNominaBase(e, ent, cfg, null, null) // mismos topes de la hoja (nunca más de 15 días en total)
      return {
        id: e.ID_Empleado, nombre: e.Nombre, sug: s, guardado: !!g,
        DiasTrabajados: lim.DiasTrabajados, Incapacidad: lim.Incapacidad, DiasVacaciones: lim.DiasVacaciones, DiasLicencia: lim.DiasLicencia,
        OtrosAjuste: g ? Number(g.otros) : 0, Nota: g?.nota || '',
        // Una quincena ya guardada conserva el programado con que se liquidó (las cuotas ya avanzaron)
        programado: g ? { valor: Number(g.programado) || 0, concepto: g.programado_concepto || '', idsAplicables: [] } : prog,
        retirado: e.Estado === 'Inactivo' ? e.FechaRetiro || 'sin fecha' : '',
      }
    }))
  }, [datos, quincena, emps, guardadas, recalc, sucio, festivos, cfg, qi?.inicio])

  const cambiar = (i, c, v) => { setSucio(true); setOk(''); setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [c]: v } : f))) }
  const calcular = (f) => {
    const emp = empPorId[f.id]
    const empQ = guardadas[f.id] && !sucio ? { ...emp, Salario: Number(guardadas[f.id].salario) } : emp
    return M.calcularNominaBase(empQ, f, cfg, f.programado, M.splitIncapacidadPorTipo(f.id, qi.inicio, qi.fin, datos.ausentismos, festivos))
  }
  const calcs = datos && qi ? filas.map(calcular) : []
  const tot = calcs.reduce((a, c) => { a.dev += c.TotalDevengado; a.desc += c.TotalDescuentos; a.neto += c.NetoPagar; return a }, { dev: 0, desc: 0, neto: 0 })

  const guardar = async () => {
    setError(''); setOk('')
    try {
      setGuardando(true)
      const payload = filas.map((f) => {
        const emp = empPorId[f.id]
        const c = M.calcularNominaBase(emp, f, cfg, f.programado, M.splitIncapacidadPorTipo(f.id, qi.inicio, qi.fin, datos.ausentismos, festivos))
        return { empleado_id: f.id, nombre: emp.Nombre, salario: emp.Salario, dias: c.DiasTrabajados, incapacidad: c.Incapacidad, otros: Number(f.OtrosAjuste) || 0,
          nota: f.Nota || null, basico: c.Basico, aux_transporte: c.AuxTransporte, devengado: c.TotalDevengado, ibc: c.IBC, salud: c.Salud, pension: c.Pension,
          descuentos: c.TotalDescuentos, neto: c.NetoPagar, subsidio_incapacidad: c.SubsidioIncapacidad, programado: c.Programado,
          programado_concepto: f.programado.concepto || null, dias_vacaciones: c.DiasVacaciones, dias_licencia: c.DiasLicencia,
          programados_ids: f.guardado ? [] : f.programado.idsAplicables }
      })
      const r = await q(sb.rpc('guardar_nomina', { p_quincena: quincena, p_q_inicio: qi.inicio, p_filas: payload }))
      if (r !== 'ok') throw new Error(r)
      setOk(`Quincena guardada: ${payload.length} personas.`)
      setSucio(false); setRecalc(false); await cargar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const exportar = () => descargarTabla(`Nomina_${quincena}.xlsx`, ['ID', 'Nombre', 'Salario', 'Días', 'Incapacidad', 'Vacaciones', 'Licencia', 'Otros', 'Nota', 'Básico', 'Aux. transporte', 'Subsidio incap.', 'Programado', 'Devengado', 'IBC', 'Salud', 'Pensión', 'Descuentos', 'Neto'],
    filas.map((f, i) => { const c = calcs[i]; return [f.id, f.nombre, empPorId[f.id].Salario, c.DiasTrabajados, c.Incapacidad, c.DiasVacaciones, c.DiasLicencia, Number(f.OtrosAjuste) || 0, f.Nota, c.Basico, c.AuxTransporte, c.SubsidioIncapacidad, c.Programado, c.TotalDevengado, c.IBC, c.Salud, c.Pension, c.TotalDescuentos, c.NetoPagar] }))

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  return (
    <div>
      <div className="barra-horas">
        <select value={quincena} onChange={(e) => { setSucio(false); setRecalc(false); setQuincena(e.target.value) }}>
          {opciones.lista.map((s) => <option key={s} value={s}>{s}{s === opciones.actual ? ' (actual)' : ''}</option>)}
        </select>
        {yaExiste ? <Badge tone="ok">Guardada</Badge> : <Badge tone="warn">Sin guardar</Badge>}
        {yaExiste && <button className="btn btn-sec btn-sm" onClick={() => { setSucio(false); setRecalc(true) }} title="Vuelve a traer días de incapacidad, vacaciones, licencias y ausencias (conserva Otros y Nota)">Recalcular desde Ausentismos</button>}
        <button className="btn btn-sec btn-sm" onClick={exportar}>Exportar Excel</button>
        <button className="btn btn-sec btn-sm" disabled={!yaExiste} onClick={() => { try { setBanco(M.datosBancolombiaNomina(quincena, datos.nomina.filter((n) => n.quincena === quincena), empPorId, cfg, hoyCO())) } catch (e) { setError(e.message) } }}>Archivo Bancolombia</button>
      </div>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {recalc && <Aviso tipo="warn">Se recalcularon los días desde Ausentismos y Vacaciones. Revisa y guarda para que quede así.</Aviso>}
      <div className="tabla-cont">
        <table className="tabla tabla-pagos tabla-nomina">
          <thead><tr>
            <th>Nombre</th><th>Salario</th><th title="Días a remunerar (de 15)">Días</th><th>Incap.</th><th>Vacac.</th><th>Licencia</th><th>Otros (+/-)</th><th>Nota</th>
            <th>Básico</th><th>Aux. transp.</th><th>Subsidio incap.</th><th>Programado</th><th>Devengado</th><th>Salud</th><th>Pensión</th><th>Descuentos</th><th>Neto</th>
          </tr></thead>
          <tbody>
            {filas.map((f, i) => {
              const c = calcs[i], e = empPorId[f.id]
              const notas = [f.sug.DiasAntesIngreso && `ingresó: −${f.sug.DiasAntesIngreso} d`, f.sug.DiasDespuesRetiro && `retiro: −${f.sug.DiasDespuesRetiro} d`, f.sug.DiasNoRemunerados && `ausencias/permisos: −${f.sug.DiasNoRemunerados} d`, f.retirado && `retirado ${f.retirado}`].filter(Boolean)
              return (
                <tr key={f.id}>
                  <td><b>{f.nombre}</b>{notas.length > 0 && <div className="tenue">{notas.join(' · ')}</div>}{e.TipoContrato === 'Prestación de servicios' && <div className="tenue">Prestación de servicios</div>}</td>
                  <td className="num">{pesos(e.Salario)}</td>
                  {['DiasTrabajados', 'Incapacidad', 'DiasVacaciones', 'DiasLicencia'].map((k) => <td key={k}><input className="num-in corto" type="number" min="0" max="15" step="0.5" value={f[k]} onChange={(ev) => cambiar(i, k, ev.target.value)} /></td>)}
                  <td><input className="num-in" type="number" step="1000" value={f.OtrosAjuste} onChange={(ev) => cambiar(i, 'OtrosAjuste', ev.target.value)} /></td>
                  <td><input className="obs" value={f.Nota} onChange={(ev) => cambiar(i, 'Nota', ev.target.value)} /></td>
                  <td className="num">{pesos(c.Basico)}</td><td className="num">{pesos(c.AuxTransporte)}</td><td className="num">{pesos(c.SubsidioIncapacidad)}</td>
                  <td className="num" title={f.programado.concepto}>{c.Programado ? pesos(c.Programado) : ''}</td>
                  <td className="num">{pesos(c.TotalDevengado)}</td><td className="num">{pesos(c.Salud)}</td><td className="num">{pesos(c.Pension)}</td>
                  <td className="num">{pesos(c.TotalDescuentos)}</td><td className="num"><b>{pesos(c.NetoPagar)}</b></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pagos-pie">
        <span>{filas.length} personas · Devengado <b>{pesos(tot.dev)}</b> · Descuentos <b>{pesos(tot.desc)}</b> · Neto a pagar <b>{pesos(tot.neto)}</b></span>
        <button className="btn btn-ok" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : yaExiste ? 'Guardar cambios' : 'Guardar quincena'}</button>
      </div>
      <p className="ayuda-txt">Días + incapacidad + vacaciones + licencia no pueden pasar de 15. Al guardar por primera vez a una persona en la quincena se avanza una cuota de sus pagos programados.</p>
      {banco && <ModalBanco res={banco} tipo="NOMINA" onClose={() => setBanco(null)} />}
    </div>
  )
}
