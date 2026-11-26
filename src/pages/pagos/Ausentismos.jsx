import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Cargando, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { todas, siguienteId, ahoraTexto, opcionesQuincena, fechaCorta, hoyCO } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'
import { useOrden } from '../../nomina/orden.jsx'

export const diasAusentismo = (tipo, ini, fin, festivos) => {
  if (!ini || !fin || fin < ini) return 0
  return M.AUS_TIPOS_INCAPACIDAD.includes(tipo) ? M.diasEntre(ini, fin) + 1 : M.calcularDiasHabiles(ini, fin, festivos)
}

export default function Ausentismos({ config, empleados, soloLectura }) {
  const { festivos } = config
  const [datos, setDatos] = useState(null)
  const hoy = hoyCO()
  const [f, setF] = useState({ empleado_id: '', tipo: 'Incapacidad', fecha_inicio: hoy, fecha_fin: hoy, observacion: '' })
  const [filtro, setFiltro] = useState(() => opcionesQuincena().actual)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const { ordenar, th } = useOrden()
  const [fEmp, setFEmp] = useState(''), [fTipo, setFTipo] = useState('')
  const activos = useMemo(() => empleados.filter((e) => e.estado !== 'Inactivo'), [empleados])

  const cargar = useCallback(async () => {
    try { const [aus, vac] = await Promise.all([todas('ausentismos'), todas('vacaciones')]); setDatos({ aus, vac }); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['ausentismos', 'vacaciones'])

  const dias = diasAusentismo(f.tipo, f.fecha_inicio, f.fecha_fin, festivos)
  const guardar = async (e) => {
    e.preventDefault(); setError(''); setOk('')
    try {
      const emp = empleados.find((x) => x.id === f.empleado_id)
      if (!emp) throw new Error('Elige el empleado.')
      if (!f.fecha_inicio || !f.fecha_fin) throw new Error('Elige la fecha de inicio y de fin.')
      if (f.fecha_fin < f.fecha_inicio) throw new Error('La fecha de fin no puede ser anterior a la de inicio.')
      if (dias <= 0) throw new Error('Ese rango no tiene ningún día hábil (¿son puros domingos/festivos?).')
      await q(sb.from('ausentismos').insert({ id: siguienteId(datos.aus.map((a) => a.id), 'AU'), empleado_id: emp.id, nombre: emp.nombre, tipo: f.tipo,
        fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, dias_habiles: dias, observacion: f.observacion || null, estado: 'Activo', fecha_registro: ahoraTexto() }))
      setOk(`Registrado: ${f.tipo} de ${emp.nombre} (${dias} día${dias === 1 ? '' : 's'}).`)
      setF({ ...f, empleado_id: '', observacion: '' }); setNuevo(false); cargar()
    } catch (err) { setError(err.message) }
  }
  const eliminar = async (a) => {
    if (!window.confirm(`¿Eliminar ${a.tipo} de ${a.nombre} (${fechaCorta(a.fecha_inicio)} a ${fechaCorta(a.fecha_fin)})? No se puede deshacer.`)) return
    try { await q(sb.from(a.origen === 'vac' ? 'vacaciones' : 'ausentismos').delete().eq('id', a.id)); cargar() } catch (e) { setError(e.message) }
  }

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const qi = filtro === 'todas' ? null : M.parsearQuincena(filtro)
  const lista = [
    ...datos.aus.filter((a) => a.estado !== 'Cancelado').map((a) => ({ ...a, origen: 'aus' })),
    ...datos.vac.filter((v) => v.estado === 'Activo' && (v.tipo || 'Periodo') === 'Periodo').map((v) => ({ ...v, tipo: 'Vacaciones', origen: 'vac', observacion: '(registro de Vacaciones) ' + (v.observacion || '') })),
  ].filter((a) => !qi || (a.fecha_fin >= qi.inicio && a.fecha_inicio <= qi.fin)).filter((a) => (!fEmp || a.empleado_id === fEmp) && (!fTipo || a.tipo === fTipo))
    .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
  // Días que caen dentro de la quincena elegida (incapacidad en días calendario de quincena de 15; el resto hábiles)
  const diasQ = (a) => {
    if (!qi) return ''
    const ini = a.fecha_inicio > qi.inicio ? a.fecha_inicio : qi.inicio, fin = a.fecha_fin < qi.fin ? a.fecha_fin : qi.fin
    if (M.AUS_TIPOS_INCAPACIDAD.includes(a.tipo)) return M.diasAusentismoEnQuincena(a.empleado_id, [a.tipo], qi.inicio, qi.fin, [{ ...a, estado: 'Activo' }], festivos)
    return M.calcularDiasHabiles(ini, fin, festivos)
  }
  const nombresEmp = [...new Map([...datos.aus, ...datos.vac].map((a) => [a.empleado_id, a.nombre])).entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'es'))
  return (
    <div>
      {nuevo && <Modal titulo="Registrar ausencia" onClose={() => setNuevo(false)} ancho={760}>
      <form onSubmit={guardar}>
        <div className="fila3">
          <label>Empleado<select value={f.empleado_id} onChange={(e) => setF({ ...f, empleado_id: e.target.value })}><option value="">—</option>{activos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
          <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{M.AUS_TIPOS.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Desde<input type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value, fecha_fin: f.fecha_fin < e.target.value ? e.target.value : f.fecha_fin })} /></label>
          <label>Hasta<input type="date" value={f.fecha_fin} onChange={(e) => setF({ ...f, fecha_fin: e.target.value })} /></label>
          <label>Observación<input value={f.observacion} onChange={(e) => setF({ ...f, observacion: e.target.value })} /></label>
        </div>
        <p className="tenue">{dias} {M.AUS_TIPOS_INCAPACIDAD.includes(f.tipo) ? 'días calendario' : 'días hábiles (sin domingos ni festivos)'}.
          {' '}{M.AUS_TIPOS_INCAPACIDAD.includes(f.tipo) ? 'Pasa a Nómina como días de incapacidad.' : M.AUS_TIPOS_NO_REMUNERADOS.includes(f.tipo) ? 'Se descuenta de los días a remunerar.' : f.tipo === 'Calamidad' ? 'Licencia remunerada al 100 %, sin auxilio de transporte.' : 'Pasa a Nómina como días de vacaciones.'}</p>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn btn-ok">Registrar</button></div>
      </form>
      </Modal>}
      <div className="barra-horas">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todas">Todas las fechas</option>{opcionesQuincena().lista.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fEmp} onChange={(e) => setFEmp(e.target.value)}><option value="">Todos los empleados</option>{nombresEmp.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Todos los tipos</option>{M.AUS_TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn btn-sec btn-sm" onClick={() => descargarTabla('Ausentismos.xlsx', ['ID', 'Empleado', 'Tipo', 'Desde', 'Hasta', 'Días (total)', 'Días en esta quincena', 'Observación'], lista.map((a) => [a.id, a.nombre, a.tipo, a.fecha_inicio, a.fecha_fin, Number(a.dias_habiles), diasQ(a), a.observacion || '']))}>Exportar Excel</button>
        <button className="btn btn-sm empuja" onClick={() => { setError(''); setNuevo(true) }}>+ Registrar ausencia</button>
      </div>
      <Aviso>{error && !nuevo ? error : ''}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="tabla-cont"><table className="tabla tabla-pagos">
        <thead><tr>{th('id', 'ID')}{th('nombre', 'Empleado')}{th('tipo', 'Tipo')}{th('fecha_inicio', 'Fecha inicio')}{th('fecha_fin', 'Fecha fin')}{th('dias_habiles', 'Días (total)', { className: 'num' })}{qi && th('_q', 'Días en esta quincena', { className: 'num' })}{th('observacion', 'Observación')}<th></th></tr></thead>
        <tbody>{ordenar(lista, (a, k) => (k === '_q' ? diasQ(a) : k === 'dias_habiles' ? Number(a.dias_habiles) : a[k])).map((a) => (
          <tr key={a.origen + a.id}><td className="tenue">{a.id}</td><td>{a.nombre}</td><td>{a.tipo}</td><td>{fechaCorta(a.fecha_inicio)}</td><td>{fechaCorta(a.fecha_fin)}</td>
            <td className="num">{Number(a.dias_habiles)}</td>{qi && <td className="num">{diasQ(a)}</td>}<td className="tenue">{a.observacion}</td><td>{!soloLectura && <button className="btn-link peligro" onClick={() => eliminar(a)}>Eliminar</button>}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}
