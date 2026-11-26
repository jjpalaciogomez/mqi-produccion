import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { todas, siguienteId, ahoraTexto, fechaCorta, hoyCO, empleadosMotor, num } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'

export default function Vacaciones({ config, empleados }) {
  const { festivos } = config
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const [datos, setDatos] = useState(null)
  const hoy = hoyCO()
  const [f, setF] = useState({ empleado_id: '', fecha_inicio: hoy, fecha_fin: hoy, observacion: '' })
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [hist, setHist] = useState(null)

  const cargar = useCallback(async () => {
    try { const [vac, aus] = await Promise.all([todas('vacaciones'), todas('ausentismos')]); setDatos({ vac, aus }); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['vacaciones', 'ausentismos'])

  const dias = f.fecha_inicio && f.fecha_fin && f.fecha_fin >= f.fecha_inicio ? M.calcularDiasHabiles(f.fecha_inicio, f.fecha_fin, festivos) : 0
  const guardar = async (e) => {
    e.preventDefault(); setError(''); setOk('')
    try {
      const emp = empleados.find((x) => x.id === f.empleado_id)
      if (!emp) throw new Error('Elige el empleado.')
      if (f.fecha_fin < f.fecha_inicio) throw new Error('La fecha de fin no puede ser anterior a la de inicio.')
      if (dias <= 0) throw new Error('Ese rango no tiene ningún día hábil (¿son puros domingos/festivos?).')
      await q(sb.from('vacaciones').insert({ id: siguienteId(datos.vac.map((v) => v.id), 'V'), empleado_id: emp.id, nombre: emp.nombre, fecha_inicio: f.fecha_inicio,
        fecha_fin: f.fecha_fin, dias_habiles: dias, observacion: f.observacion || null, estado: 'Activo', fecha_registro: ahoraTexto(), tipo: 'Periodo' }))
      setOk(`Vacaciones registradas: ${emp.nombre}, ${dias} días hábiles.`); setF({ ...f, empleado_id: '', observacion: '' }); cargar()
    } catch (err) { setError(err.message) }
  }
  const cancelar = async (v) => {
    if (!window.confirm(`¿Cancelar las vacaciones ${v.id} de ${v.nombre}?`)) return
    try { await q(sb.from('vacaciones').update({ estado: 'Cancelado' }).eq('id', v.id)); cargar() } catch (e) { setError(e.message) }
  }

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const saldos = M.saldoVacaciones(emps, datos.vac, datos.aus, hoy)
  const delEmp = hist ? datos.vac.filter((v) => v.empleado_id === hist).sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)) : []
  return (
    <div>
      <form className="tarjeta form-pagos" onSubmit={guardar}>
        <h3>Registrar vacaciones</h3>
        <div className="fila3">
          <label>Empleado<select value={f.empleado_id} onChange={(e) => setF({ ...f, empleado_id: e.target.value })}><option value="">—</option>{emps.filter((e) => e.Estado !== 'Inactivo').map((e) => <option key={e.ID_Empleado} value={e.ID_Empleado}>{e.Nombre}</option>)}</select></label>
          <label>Desde<input type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value, fecha_fin: f.fecha_fin < e.target.value ? e.target.value : f.fecha_fin })} /></label>
          <label>Hasta<input type="date" value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} /></label>
          <label>Observación<input value={f.observacion} onChange={(e) => setF({ ...f, observacion: e.target.value })} /></label>
        </div>
        <p className="tenue">{dias} días hábiles (cuenta sábados; no cuenta domingos ni festivos).</p>
        <button className="btn btn-ok">Registrar</button>
      </form>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="barra-horas">
        <h3 style={{ margin: 0 }}>Saldo de vacaciones al {fechaCorta(hoy)}</h3>
        <button className="btn btn-sec btn-sm" onClick={() => descargarTabla('Saldo_vacaciones.xlsx', ['ID', 'Nombre', 'Área', 'Ingreso', 'Causados', 'Disfrutados', 'Saldo', 'Saldo inicial (Excel, corte 01/09/2026)'],
          saldos.map((s) => [s.ID_Empleado, s.Nombre, s.Area, s.FechaIngreso, s.DiasCausados, s.DiasDisfrutados, s.SaldoPendiente, s.SaldoInicialExcel ?? '']))}>Exportar Excel</button>
      </div>
      <div className="tabla-cont"><table className="tabla tabla-pagos tabla-click">
        <thead><tr><th>Nombre</th><th>Área</th><th>Ingreso</th><th>Días causados</th><th>Disfrutados</th><th>Saldo</th><th title="Días pendientes según el control en Excel, corte 01/09/2026">Saldo inicial Excel</th></tr></thead>
        <tbody>{saldos.map((s) => (
          <tr key={s.ID_Empleado} onClick={() => setHist(hist === s.ID_Empleado ? null : s.ID_Empleado)} className={hist === s.ID_Empleado ? 'sel' : ''}>
            <td><b>{s.Nombre}</b></td><td className="tenue">{s.Area}</td><td>{fechaCorta(s.FechaIngreso)}</td><td className="num">{num(s.DiasCausados, 1)}</td>
            <td className="num">{num(s.DiasDisfrutados)}</td><td className="num"><b className={s.SaldoPendiente < 0 ? 'mal-txt' : ''}>{num(s.SaldoPendiente, 1)}</b></td>
            <td className="num tenue">{s.SaldoInicialExcel !== null ? num(s.SaldoInicialExcel) : ''}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="ayuda-txt">Causados = días calendario desde el ingreso ÷ 360 × 15. Disfrutados = períodos registrados aquí + ausencias tipo "Vacaciones". El "Saldo inicial Excel" es el dato que traía el control anterior; se muestra aparte y no altera el cálculo (igual que en la hoja). Haz clic en una persona para ver sus registros.</p>
      {hist && <div className="tarjeta"><h3>Registros de {saldos.find((s) => s.ID_Empleado === hist)?.Nombre}</h3>
        <table className="tabla"><thead><tr><th>ID</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Observación</th><th>Estado</th><th></th></tr></thead>
          <tbody>{delEmp.map((v) => <tr key={v.id}><td>{v.id}</td><td>{v.tipo}</td><td>{fechaCorta(v.fecha_inicio)}</td><td>{fechaCorta(v.fecha_fin)}</td><td className="num">{num(v.dias_habiles)}</td>
            <td className="tenue">{v.observacion}</td><td><Badge tone={v.estado === 'Activo' ? 'ok' : 'muted'}>{v.estado}</Badge></td>
            <td>{v.estado === 'Activo' && v.tipo === 'Periodo' && <button className="btn-link peligro" onClick={() => cancelar(v)}>Cancelar</button>}</td></tr>)}</tbody></table></div>}
    </div>
  )
}
