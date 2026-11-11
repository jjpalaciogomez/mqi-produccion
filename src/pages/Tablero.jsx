import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Barra, Cargando, ESTADO_OP, Semaforo, fmtFecha, fmtMin } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

const ORDEN_AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']
const NOMBRE_AREA = { METAL: 'Metal', MADERA: 'Madera', ACRILICO: 'Acrílico', 'GRAN FORMATO': 'Gran formato', PINTURA: 'Pintura' }
const h1 = (m) => { const v = Number(m) / 60; return v === 0 ? '0' : v < 10 ? v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString('es-CO') }

// Horas registradas / estándar de un área; la barra muestra cuánto del estándar ya se gastó
function CeldaHoras({ x, total }) {
  if (!x || (!x.std && !x.real)) return <td className="celda-area vacia">—</td>
  const p = x.std ? x.real / x.std : x.real ? 2 : 0
  const tono = p > 1.1 ? 'mal' : p > 0.9 ? 'alerta' : 'ok'
  return (
    <td className={`celda-area${total ? ' total' : ''}`} title={`Horas hombre: ${h1(x.real)} h registradas de ${h1(x.std)} h estándar${x.maq ? `\nMáquina (aparte, no se suma): ${h1(x.maqReal)} de ${h1(x.maq)} h` : ''}`}>
      <span><b>{h1(x.real)}</b> / {h1(x.std)} h</span>
      <i className={`mini-barra t-${tono}`}><em style={{ width: `${Math.min(p, 1) * 100}%` }} /></i>
    </td>
  )
}

const ORDEN_SEM = { vencida: 0, en_riesgo: 1, a_tiempo: 2, sin_fecha: 3, incumplida: 4, cumplida: 5 }

export default function Tablero({ gestor, rol }) {
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('activas')
  const [buscar, setBuscar] = useState('')
  const [horas, setHoras] = useState({})

  const cargar = useCallback(async () => {
    try {
      let consulta = sb.from('v_ordenes').select('*')
      if (filtro === 'activas') consulta = consulta.in('estado', ['borrador', 'en_planta'])
      if (filtro === 'cerradas') consulta = consulta.in('estado', ['terminada', 'entregada'])
      const ords = await q(consulta.order('fecha_compromiso', { ascending: true, nullsFirst: false }))
      // Horas reales y estándar por área de cada OP (sin terceros ni pasos omitidos)
      const ids = ords.map((o) => o.id)
      const ts = ids.length ? await q(sb.from('v_tareas').select('orden_id, area, min_std, min_reales, estado, es_maquina, min_maquina, min_maquina_real').in('orden_id', ids).neq('area', 'TERCEROS').neq('estado', 'omitida')) : []
      const h = {}
      for (const t of ts) {
        const x = ((h[t.orden_id] ||= {})[t.area] ||= { real: 0, std: 0, maq: 0, maqReal: 0 })
        // Siempre horas hombre; las de máquina se llevan aparte y no se suman
        x.real += Number(t.min_reales || 0); x.std += Number(t.min_std || 0)
        if (t.es_maquina) { x.maq += Number(t.min_maquina || 0); x.maqReal += Number(t.min_maquina_real || 0) }
      }
      setHoras(h)
      setOrdenes(ords)
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

  // Áreas que aparecen en las OPs de la lista, en orden fijo
  const areas = useMemo(() => {
    const usadas = new Set(Object.values(horas).flatMap((x) => Object.keys(x)))
    return [...ORDEN_AREAS.filter((a) => usadas.has(a)), ...[...usadas].filter((a) => !ORDEN_AREAS.includes(a))]
  }, [horas])

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
              <tr><th>OP</th><th>Proyecto / cliente</th><th>Compromiso</th><th>Cumplimiento</th><th style={{ width: 150 }}>Avance</th>
                {areas.map((a) => <th key={a} className="th-area">{NOMBRE_AREA[a] || a}</th>)}
                <th className="th-area">Total</th><th>Pasos</th><th>Estado</th><th>Prior.</th></tr>
              <tr className="sub-cab"><th colSpan={5} /><th colSpan={areas.length + 1} className="th-area">horas hombre: registradas / estándar</th><th colSpan={3} /></tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} onClick={() => { window.location.hash = `/op/${o.id}` }}>
                  <td><b>{o.numero}</b></td>
                  <td><div className="tab-proyecto">{o.proyecto}</div><div className="tab-cliente">{o.cliente}</div></td>
                  <td>{fmtFecha(o.fecha_compromiso)}</td>
                  <td><Semaforo valor={o.semaforo} /></td>
                  <td><Barra pct={o.avance_pct} /></td>
                  {areas.map((a) => <CeldaHoras key={a} x={horas[o.id]?.[a]} />)}
                  <CeldaHoras total x={Object.values(horas[o.id] || {}).reduce((s, x) => ({ real: s.real + x.real, std: s.std + x.std }), { real: 0, std: 0 })} />
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
