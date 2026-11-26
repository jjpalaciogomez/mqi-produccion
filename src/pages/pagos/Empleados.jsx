import { useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../../supabase.js'
import { Aviso, Badge, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { pesos, siguienteId, fechaCorta, hoyCO } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'

const CAMPOS = [
  ['nombre', 'Nombre completo'], ['cedula', 'Cédula'], ['tipo_doc_banco', 'Tipo de documento', ['Cédula', 'Cédula de extranjería', 'NIT', 'Pasaporte', 'Otro']],
  ['cargo', 'Cargo'], ['area', 'Área', 'areas'], ['tipo_contrato', 'Tipo de contrato', ['Término indefinido', 'Término fijo', 'Obra o labor', 'Aprendizaje', 'Prestación de servicios']],
  ['fecha_ingreso', 'Fecha de ingreso', 'date'], ['salario', 'Salario mensual', 'number'], ['aux_transporte', '¿Auxilio de transporte?', 'bool'],
  ['aux_conectividad', '¿Auxilio de conectividad?', 'bool'], ['liquida_extras', '¿Liquida horas extra?', 'bool'], ['empresa', 'Empresa / entidad', 'empresas'],
  ['banco', 'Banco', 'bancos'], ['cuenta', 'No. de cuenta'], ['eps', 'EPS', 'eps'], ['pension', 'Fondo de pensión', 'pension'], ['arl', 'ARL', 'arl'],
  ['nivel_riesgo', 'Nivel de riesgo ARL', ['I', 'II', 'III', 'IV', 'V']], ['caja_compensacion', 'Caja de compensación', 'caja'],
  ['fecha_cumpleanos', 'Fecha de cumpleaños', 'date'], ['correo_personal', 'Correo personal'], ['telefono', 'Teléfono'], ['direccion', 'Dirección de residencia'],
  ['contacto_emergencia', 'Contacto de emergencia (nombre y teléfono)'], ['documento_conciliacion', 'Documento para conciliaciones (si difiere)'],
]

export default function Empleados({ config, empleados, recargarBase }) {
  const caus = config.causaciones || {}
  const [busca, setBusca] = useState('')
  const [verRetirados, setVerRetirados] = useState(false)
  const [editando, setEditando] = useState(null)
  const [retirar, setRetirar] = useState(null)
  const [personas, setPersonas] = useState([])
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  useEffect(() => { q(sb.from('personas').select(PERSONA_COLS).order('nombre')).then(setPersonas).catch(() => {}) }, [])

  const opciones = useMemo(() => {
    const de = (campo, base) => [...new Set([...(base || []), ...empleados.map((e) => e[campo]).filter(Boolean)])]
    return {
      areas: de('area', (caus.areas || []).map((a) => a.Area)), bancos: M.BANCOS_ACH.map((b) => b.nombre), empresas: de('empresa', ['MQI', ...(caus.temporales || []).map((t) => t.Nombre)]),
      eps: de('eps', (caus.entidadesEPS || []).map((x) => x.Nombre)), pension: de('pension', [...(caus.entidadesPension || []).map((x) => x.Nombre), 'Jubilado']),
      arl: de('arl', (caus.entidadesARL || []).map((x) => x.Nombre)), caja: de('caja_compensacion', (caus.entidadesCaja || []).map((x) => x.Nombre)),
    }
  }, [empleados, caus])

  const lista = empleados.filter((e) => (verRetirados ? e.estado === 'Inactivo' : e.estado !== 'Inactivo'))
    .filter((e) => !busca || `${e.nombre} ${e.cedula} ${e.area} ${e.cargo} ${e.id}`.toLowerCase().includes(busca.toLowerCase()))

  const guardar = async (d) => {
    setError(''); setOk('')
    try {
      if (!d.nombre?.trim()) throw new Error('El nombre es obligatorio.')
      const fila = { ...d, nombre: d.nombre.trim(), salario: Number(d.salario) || 0, actualizado: new Date().toISOString() }
      ;['fecha_ingreso', 'fecha_cumpleanos', 'fecha_retiro'].forEach((k) => { if (!fila[k]) fila[k] = null })
      delete fila._nuevo
      if (d._nuevo) {
        fila.id = siguienteId(empleados.map((e) => e.id), 'E', 3); fila.estado = 'Activo'
        await q(sb.from('empleados').insert(fila))
      } else {
        await q(sb.from('empleados').update(fila).eq('id', d.id))
      }
      setOk(`Empleado ${d._nuevo ? 'creado' : 'actualizado'}: ${fila.nombre}.`); setEditando(null); recargarBase()
    } catch (e) { setError(e.message) }
  }
  const cambiarEstado = async (e, estado, fecha) => {
    try {
      await q(sb.from('empleados').update({ estado, fecha_retiro: estado === 'Inactivo' ? fecha || hoyCO() : null, actualizado: new Date().toISOString() }).eq('id', e.id))
      setRetirar(null); recargarBase()
    } catch (err) { setError(err.message) }
  }
  const exportar = () => descargarTabla(verRetirados ? 'Empleados_retirados.xlsx' : 'Empleados.xlsx', ['ID', ...CAMPOS.map(([, t]) => t), 'Estado', 'Fecha de retiro'],
    lista.map((e) => [e.id, ...CAMPOS.map(([k, , t]) => (t === 'bool' ? (e[k] ? 'Sí' : 'No') : k === 'salario' ? Number(e[k]) : e[k] ?? '')), e.estado, e.fecha_retiro || '']))

  return (
    <div>
      <div className="barra-horas">
        <input placeholder="Buscar nombre, cédula, área…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="segmentado"><button className={!verRetirados ? 'sel' : ''} onClick={() => setVerRetirados(false)}>Activos ({empleados.filter((e) => e.estado !== 'Inactivo').length})</button>
          <button className={verRetirados ? 'sel' : ''} onClick={() => setVerRetirados(true)}>Retirados ({empleados.filter((e) => e.estado === 'Inactivo').length})</button></div>
        <button className="btn btn-sec btn-sm" onClick={exportar}>Exportar Excel</button>
        <button className="btn btn-sm" onClick={() => setEditando({ _nuevo: true, aux_transporte: true, liquida_extras: true, tipo_doc_banco: 'Cédula', empresa: 'MQI', tipo_contrato: 'Término indefinido' })}>+ Nuevo empleado</button>
      </div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="tabla-cont"><table className="tabla tabla-pagos tabla-click">
        <thead><tr><th>ID</th><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Área</th><th>Contrato</th><th>Ingreso</th><th>Salario</th><th>Aux. transp.</th><th>Extras</th><th>Producción</th>{verRetirados && <th>Retiro</th>}<th></th></tr></thead>
        <tbody>{lista.map((e) => {
          const sug = Number(e.salario) <= config.cfg.smlv * config.cfg.topeAuxTransporteSMLV
          return (
            <tr key={e.id} onClick={() => setEditando({ ...e })}>
              <td className="tenue">{e.id}</td><td><b>{e.nombre}</b></td><td>{e.cedula}</td><td>{e.cargo}</td><td>{e.area}</td><td className="tenue">{e.tipo_contrato}</td>
              <td>{fechaCorta(e.fecha_ingreso)}</td><td className="num">{pesos(e.salario)}</td>
              <td>{e.aux_transporte ? 'Sí' : 'No'}{e.aux_transporte !== sug && e.tipo_contrato !== 'Prestación de servicios' && <span className="tenue" title="Sugerido según el tope de 2 SMLV"> (sugerido: {sug ? 'Sí' : 'No'})</span>}</td>
              <td>{e.liquida_extras ? 'Sí' : 'No'}</td>
              <td>{e.persona_id ? <Badge tone="ok">enlazado</Badge> : ''}</td>
              {verRetirados && <td>{fechaCorta(e.fecha_retiro)}</td>}
              <td onClick={(ev) => ev.stopPropagation()}>{e.estado === 'Inactivo'
                ? <button className="btn-link" onClick={() => cambiarEstado(e, 'Activo')}>Reactivar</button>
                : <button className="btn-link peligro" onClick={() => setRetirar({ e, fecha: hoyCO() })}>Retirar</button>}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
      {editando && <FormEmpleado d={editando} opciones={opciones} personas={personas} empleados={empleados} cfg={config.cfg} onGuardar={guardar} onClose={() => setEditando(null)} />}
      {retirar && (
        <Modal titulo={`Retirar a ${retirar.e.nombre}`} onClose={() => setRetirar(null)}>
          <label>Último día trabajado (fecha de retiro)<input type="date" value={retirar.fecha} onChange={(ev) => setRetirar({ ...retirar, fecha: ev.target.value })} /></label>
          <p className="tenue">Seguirá apareciendo en la nómina de la quincena de su retiro, con los días hasta esa fecha.</p>
          <div className="pagos-pie"><button className="btn btn-paro" onClick={() => cambiarEstado(retirar.e, 'Inactivo', retirar.fecha)}>Retirar</button></div>
        </Modal>
      )}
    </div>
  )
}

function FormEmpleado({ d: inicial, opciones, personas, empleados, cfg, onGuardar, onClose }) {
  const [d, setD] = useState(inicial)
  const usadas = new Set(empleados.filter((e) => e.persona_id && e.id !== d.id).map((e) => e.persona_id))
  return (
    <Modal titulo={d._nuevo ? 'Nuevo empleado' : `${d.id} · ${d.nombre}`} onClose={onClose} ancho={900}>
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(d) }}>
        <div className="fila3">
          {CAMPOS.map(([k, t, tipo]) => {
            const lista = Array.isArray(tipo) ? tipo : opciones[tipo]
            return (
              <label key={k}>{t}
                {tipo === 'bool' ? <select value={d[k] ? 'Sí' : 'No'} onChange={(e) => setD({ ...d, [k]: e.target.value === 'Sí' })}><option>Sí</option><option>No</option></select>
                  : lista ? <><input list={'l-' + k} value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} /><datalist id={'l-' + k}>{lista.map((o) => <option key={o} value={o} />)}</datalist></>
                    : <input type={tipo === 'date' ? 'date' : tipo === 'number' ? 'number' : 'text'} value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} />}
              </label>
            )
          })}
          <label>Persona en producción (tablets)
            <select value={d.persona_id || ''} onChange={(e) => setD({ ...d, persona_id: e.target.value || null })}>
              <option value="">— sin enlazar —</option>
              {personas.filter((p) => !usadas.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.area ? ` (${p.area})` : ''}</option>)}
            </select>
          </label>
        </div>
        {Number(d.salario) > 0 && <p className="tenue">Valor hora ordinaria: {pesos(Number(d.salario) / cfg.divisorMensual)} · Auxilio de transporte sugerido: {Number(d.salario) <= cfg.smlv * cfg.topeAuxTransporteSMLV ? 'Sí' : 'No'} (tope {cfg.topeAuxTransporteSMLV} SMLV)</p>}
        <div className="pagos-pie"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn btn-ok">Guardar</button></div>
      </form>
    </Modal>
  )
}
