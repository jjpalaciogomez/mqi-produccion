import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Barra, Cargando, ESTADO_OP, Semaforo, fmtFecha, fmtMin } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

const ORDEN_SEM = { vencida: 0, en_riesgo: 1, a_tiempo: 2, sin_fecha: 3, incumplida: 4, cumplida: 5 }

export default function Tablero({ gestor, rol }) {
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('activas')
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    try {
      let consulta = sb.from('v_ordenes').select('*')
      if (filtro === 'activas') consulta = consulta.in('estado', ['borrador', 'en_planta'])
      if (filtro === 'cerradas') consulta = consulta.in('estado', ['terminada', 'entregada'])
      setOrdenes(await q(consulta.order('fecha_compromiso', { ascending: true, nullsFirst: false })))
      setError('')
    } catch (e) { setError(e.message) }
  }, [filtro])

  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t) }, [cargar])

  const lista = useMemo(() => {
    if (!ordenes) return []
    const b = buscar.trim().toLowerCase()
    return ordenes
      .filter((o) => !b || `${o.numero} ${o.cliente} ${o.proyecto} ${o.comercial || ''}`.toLowerCase().includes(b))
      .sort((a, c) => (filtro === 'activas' ? (ORDEN_SEM[a.semaforo] ?? 9) - (ORDEN_SEM[c.semaforo] ?? 9) : 0)
        || (a.prioridad - c.prioridad))
  }, [ordenes, buscar, filtro])

  const resumen = useMemo(() => {
    const r = { total: 0, vencida: 0, en_riesgo: 0, a_tiempo: 0, horas: 0 }
    for (const o of ordenes || []) {
      if (!['borrador', 'en_planta'].includes(o.estado)) continue
      r.total++; r[o.semaforo] = (r[o.semaforo] || 0) + 1
      r.horas += (Number(o.min_std_total) || 0) - (Number(o.min_std_terminado) || 0)
    }
    return r
  }, [ordenes])

  return (
    <div>
      <div className="titulo-pagina">
        <h1>Tablero de planta</h1>
        <div className="titulo-acciones">
          <BotonAyuda clave="tablero" rol={rol} />
          {gestor && <a className="btn" href="#/nueva">+ Nueva OP</a>}
        </div>
      </div>

      {filtro === 'activas' && ordenes && (
        <div className="kpis">
          <div className="kpi"><span>OPs activas</span><b>{resumen.total}</b></div>
          <div className="kpi kpi-bad"><span>Vencidas</span><b>{resumen.vencida}</b></div>
          <div className="kpi kpi-warn"><span>En riesgo (≤ 2 días)</span><b>{resumen.en_riesgo}</b></div>
          <div className="kpi kpi-ok"><span>A tiempo</span><b>{resumen.a_tiempo}</b></div>
          <div className="kpi"><span>Trabajo estándar pendiente</span><b>{fmtMin(resumen.horas)}</b></div>
        </div>
      )}

      <div className="filtros">
        <div className="segmentado">
          {[['activas', 'Activas'], ['cerradas', 'Terminadas'], ['todas', 'Todas']].map(([v, t]) => (
            <button key={v} className={filtro === v ? 'sel' : ''} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
        <input className="buscar" placeholder="Buscar OP, cliente, proyecto…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <button className="btn btn-sec btn-sm" onClick={cargar}>Actualizar</button>
      </div>

      <Aviso>{error}</Aviso>
      {!ordenes ? <Cargando /> : lista.length === 0 ? (
        <div className="vacio">No hay órdenes {filtro === 'activas' ? 'activas' : ''}. {gestor && <a href="#/nueva">Crear la primera OP</a>}</div>
      ) : (
        <div className="tabla-cont">
          <table className="tabla tabla-click">
            <thead>
              <tr><th>OP</th><th>Cliente / proyecto</th><th>Compromiso</th><th>Cumplimiento</th><th style={{ width: 170 }}>Avance</th><th>Pasos</th><th>Estado</th><th>Prior.</th></tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} onClick={() => { window.location.hash = `/op/${o.id}` }}>
                  <td><b>{o.numero}</b></td>
                  <td><div>{o.cliente}</div><div className="tenue">{o.proyecto}</div></td>
                  <td>{fmtFecha(o.fecha_compromiso)}</td>
                  <td><Semaforo valor={o.semaforo} /></td>
                  <td><Barra pct={o.avance_pct} /></td>
                  <td>{o.tareas_terminadas}/{o.tareas_total}</td>
                  <td>{ESTADO_OP[o.estado]}</td>
                  <td className="centrado">{o.prioridad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">El avance se calcula con los minutos estándar de los pasos terminados. Se actualiza cada minuto.</p>
    </div>
  )
}
