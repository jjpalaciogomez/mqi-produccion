import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { todas, siguienteId, ahoraTexto, fechaCorta, hoyCO, empleadosMotor, num } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'
import { useOrden } from '../../nomina/orden.jsx'

export default function Vacaciones({ config, empleados }) {
  const { festivos } = config
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const [datos, setDatos] = useState(null)
  const hoy = hoyCO()
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [hist, setHist] = useState(null)
  const { ordenar, th } = useOrden()

  const cargar = useCallback(async () => {
    try { const [vac, aus] = await Promise.all([todas('vacaciones'), todas('ausentismos')]); setDatos({ vac, aus }); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['vacaciones', 'ausentismos'])

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const saldos = M.saldoVacaciones(emps, datos.vac, datos.aus, hoy)
  // Registros de la persona: períodos históricos de esta pestaña + ausencias tipo "Vacaciones" (desde donde se registran ahora)
  const delEmp = hist ? [...datos.vac.filter((v) => v.empleado_id === hist).map((v) => ({ ...v, fuente: v.tipo === 'Saldo inicial' ? 'Saldo inicial (Excel)' : 'Vacaciones (histórico)' })),
    ...datos.aus.filter((a) => a.empleado_id === hist && a.tipo === 'Vacaciones' && a.estado !== 'Cancelado').map((a) => ({ ...a, fuente: 'Ausentismos' }))]
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)) : []
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="barra-horas">
        <h3 style={{ margin: 0 }}>Saldo de vacaciones al {fechaCorta(hoy)}</h3>
        <button className="btn btn-sec btn-sm" onClick={() => descargarTabla('Saldo_vacaciones.xlsx', ['ID', 'Nombre', 'Área', 'Ingreso', 'Causados', 'Disfrutados', 'Saldo', 'Saldo inicial (Excel, corte 01/09/2026)'],
          saldos.map((s) => [s.ID_Empleado, s.Nombre, s.Area, s.FechaIngreso, s.DiasCausados, s.DiasDisfrutados, s.SaldoPendiente, s.SaldoInicialExcel ?? '']))}>Exportar Excel</button>
        <span className="tenue empuja">Para registrar un período de vacaciones usa <b>Ausentismos</b> con Tipo = "Vacaciones".</span>
      </div>
      <div className="tabla-cont"><table className="tabla tabla-pagos tabla-click">
        <thead><tr>{th('Nombre', 'Empleado')}{th('Area', 'Área')}{th('FechaIngreso', 'Fecha ingreso')}{th('DiasCausados', 'Días causados', { className: 'num' })}{th('DiasDisfrutados', 'Días disfrutados', { className: 'num' })}{th('SaldoPendiente', 'Saldo pendiente', { className: 'num' })}{th('SaldoInicialExcel', 'Saldo inicial Excel', { className: 'num', title: 'Días pendientes según el control en Excel, corte 01/09/2026' })}</tr></thead>
        <tbody>{ordenar(saldos, (x, k) => x[k]).map((s) => (
          <tr key={s.ID_Empleado} onClick={() => setHist(s.ID_Empleado)}>
            <td><b>{s.Nombre}</b></td><td className="tenue">{s.Area}</td><td>{fechaCorta(s.FechaIngreso)}</td><td className="num">{num(s.DiasCausados, 1)}</td>
            <td className="num">{num(s.DiasDisfrutados)}</td><td className="num"><b className={s.SaldoPendiente < 0 ? 'mal-txt' : ''}>{num(s.SaldoPendiente, 1)}</b></td>
            <td className="num tenue">{s.SaldoInicialExcel !== null ? num(s.SaldoInicialExcel) : ''}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="ayuda-txt">Causados = días calendario desde el ingreso ÷ 360 × 15. Disfrutados = períodos históricos + ausencias tipo "Vacaciones" registradas en Ausentismos. El "Saldo inicial Excel" es el dato que traía el control anterior; se muestra aparte y no altera el cálculo (igual que en la hoja). Haz clic en una persona para ver sus registros en una ventana.</p>
      {hist && <Modal titulo={`Vacaciones de ${saldos.find((s) => s.ID_Empleado === hist)?.Nombre || hist}`} onClose={() => setHist(null)} ancho={820}>
        <table className="tabla tabla-pagos"><thead><tr><th>ID</th><th>Fuente</th><th>Desde</th><th>Hasta</th><th className="num">Días</th><th>Observación</th><th>Estado</th></tr></thead>
          <tbody>{delEmp.map((v) => <tr key={v.fuente + v.id}><td>{v.id}</td><td>{v.fuente}</td><td>{fechaCorta(v.fecha_inicio)}</td><td>{fechaCorta(v.fecha_fin)}</td><td className="num">{num(v.dias_habiles)}</td>
            <td className="tenue">{v.observacion}</td><td><Badge tone={v.estado === 'Activo' ? 'ok' : 'muted'}>{v.estado}</Badge></td></tr>)}</tbody></table>
        {delEmp.length === 0 && <p className="tenue">Sin registros.</p>}
      </Modal>}
    </div>
  )
}
