import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Barra, Cargando, ESTADO_OP, fmtFecha, fmtMin } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { SIN_FECHA, estaOculta, evaluarOP, hoyCO } from '../cumplimiento.js'

// Tablero de planta: cumplimiento según la programación y lo que hay que hacer en cada OP.
// Las horas por área se ven dentro de cada OP.
const GRAVEDAD = { bad: 0, warn: 1, ok: 2, muted: 3 }
const COLS_TAREA = 'id, orden_id, item_id, item_numero, componente_id, paso, area, estado, bloqueada, min_std, min_reales, tiempo_std_unit, proceso_nombre'

export default function Tablero({ gestor, rol }) {
  const [ordenes, setOrdenes] = useState(null)
  const [eval_, setEval] = useState({})
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('activas')
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    try {
      let consulta = sb.from('v_ordenes').select('*')
      if (filtro === 'activas' || filtro === 'ocultas') consulta = consulta.in('estado', ['borrador', 'en_planta'])
      if (filtro === 'cerradas') consulta = consulta.in('estado', ['terminada', 'entregada'])
      const ords = await q(consulta.order('fecha_compromiso', { ascending: true, nullsFirst: false }))
      const ids = ords.map((o) => o.id)
      const [ts, bs] = ids.length ? await Promise.all([
        q(sb.from('v_tareas').select(COLS_TAREA).in('orden_id', ids).neq('estado', 'omitida')),
        q(sb.from('programacion').select('orden_id, area, fecha, hora_inicio, hora_fin, personas, min_hombre').in('orden_id', ids).gte('fecha', hoyCO())),
      ]) : [[], []]
      const ev = {}
      for (const o of ords) ev[o.id] = evaluarOP(o, ts.filter((t) => t.orden_id === o.id), bs.filter((b) => b.orden_id === o.id))
      setEval(ev); setOrdenes(ords); setError('')
    } catch (e) { setError(e.message) }
  }, [filtro])

  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t) }, [cargar])

  const lista = useMemo(() => {
    if (!ordenes) return []
    const b = buscar.trim().toLowerCase()
    return ordenes
      .filter((o) => filtro === 'ocultas' ? estaOculta(o) : filtro === 'activas' ? !estaOculta(o) : true)
      .filter((o) => !b || `${o.numero} ${o.cliente} ${o.proyecto} ${o.comercial || ''}`.toLowerCase().includes(b))
      .sort((a, c) => (filtro === 'activas' ? (GRAVEDAD[eval_[a.id]?.tono] ?? 9) - (GRAVEDAD[eval_[c.id]?.tono] ?? 9) : 0)
        || String(a.fecha_compromiso || '9').localeCompare(String(c.fecha_compromiso || '9')) || (a.prioridad - c.prioridad))
  }, [ordenes, buscar, filtro, eval_])

  const resumen = useMemo(() => {
    const r = { total: 0, mal: 0, sinProg: 0, acciones: 0, horas: 0, ocultas: 0 }
    for (const o of ordenes || []) {
      if (!['borrador', 'en_planta'].includes(o.estado)) continue
      if (estaOculta(o)) { r.ocultas++; continue }
      const e = eval_[o.id]
      r.total++
      if (['vencida', 'no_alcanza'].includes(e?.estado)) r.mal++
      if (['sin_programar', 'incompleta'].includes(e?.estado)) r.sinProg++
      r.acciones += (e?.alertas || []).filter((a) => /^Enviar|^Tercero atrasado/.test(a.texto)).length
      r.horas += (Number(o.min_std_total) || 0) - (Number(o.min_std_terminado) || 0)
    }
    return r
  }, [ordenes, eval_])

  return (
    <div>
      <div className="titulo-pagina">
        <h1>Tablero de planta</h1>
        <div className="titulo-acciones">
          <BotonAyuda clave="tablero" rol={rol} />
          {gestor && <a className="btn btn-sec" href="#/programacion">Programación</a>}
          {gestor && <a className="btn" href="#/nueva">+ Nueva OP</a>}
        </div>
      </div>

      {filtro === 'activas' && ordenes && (
        <div className="kpis">
          <div className="kpi"><span>OPs activas</span><b>{resumen.total}</b></div>
          <div className="kpi kpi-bad"><span>No alcanzan o vencidas</span><b>{resumen.mal}</b></div>
          <div className="kpi kpi-warn"><span>Sin programar o incompletas</span><b>{resumen.sinProg}</b></div>
          <div className="kpi kpi-warn"><span>Envíos a terceros pendientes</span><b>{resumen.acciones}</b></div>
          <div className="kpi"><span>Trabajo estándar pendiente</span><b>{fmtMin(resumen.horas)}</b></div>
        </div>
      )}

      <div className="filtros">
        <div className="segmentado">
          {[['activas', 'Activas'], ['ocultas', `Ocultas${filtro === 'activas' && resumen.ocultas ? ` (${resumen.ocultas})` : ''}`], ['cerradas', 'Terminadas'], ['todas', 'Todas']].map(([v, t]) => (
            <button key={v} className={filtro === v ? 'sel' : ''} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
        <input className="buscar" placeholder="Buscar OP, cliente, proyecto…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <button className="btn btn-sec btn-sm" onClick={cargar}>Actualizar</button>
      </div>

      <Aviso>{error}</Aviso>
      {!ordenes ? <Cargando /> : lista.length === 0 ? (
        <div className="vacio">No hay órdenes {filtro === 'activas' ? 'activas' : filtro === 'ocultas' ? 'ocultas' : ''}. {gestor && <a href="#/nueva">Crear la primera OP</a>}</div>
      ) : (
        <div className="tabla-cont">
          <table className="tabla tabla-click tabla-tablero">
            <thead>
              <tr><th>OP</th><th>Proyecto / cliente</th><th>Entrega</th><th>Cumplimiento según programación</th><th style={{ width: 130 }}>Avance</th>
                <th>Alertas y pendientes</th><th>Estado</th><th>Prior.</th></tr>
            </thead>
            <tbody>
              {lista.map((o) => {
                const e = eval_[o.id] || { alertas: [] }
                return (
                  <tr key={o.id} onClick={() => { window.location.hash = `/op/${o.id}` }}>
                    <td><b>{o.numero}</b></td>
                    <td><div className="tab-proyecto">{o.proyecto}</div><div className="tab-cliente">{o.cliente}</div></td>
                    <td className="nowrap">{fmtFecha(o.fecha_compromiso)}</td>
                    <td>{estaOculta(o)
                      ? <span className="badge badge-muted">Oculta {o.oculta_hasta === SIN_FECHA ? '' : `hasta ${fmtFecha(o.oculta_hasta)}`}</span>
                      : <span className={`badge badge-${e.tono || 'muted'}`}>{e.texto}</span>}</td>
                    <td><Barra pct={o.avance_pct} /><div className="tenue pequeño centrado">{o.tareas_terminadas}/{o.tareas_total} pasos</div></td>
                    <td className="celda-alertas">
                      {e.alertas.length === 0 ? <span className="tenue">—</span>
                        : e.alertas.slice(0, 4).map((a, i) => <div key={i} className={`alerta-op t-${a.tono}`}>{a.tono === 'bad' ? '⚠' : '•'} {a.texto}</div>)}
                      {e.alertas.length > 4 && <div className="tenue pequeño">y {e.alertas.length - 4} más…</div>}
                    </td>
                    <td>{ESTADO_OP[o.estado]}</td>
                    <td className="centrado">{o.prioridad}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">El cumplimiento compara la fecha en que termina la OP según la programación (más los días de terceros que van al final) con la fecha de entrega. Las horas por área están dentro de cada OP. Se actualiza cada minuto.</p>
    </div>
  )
}
