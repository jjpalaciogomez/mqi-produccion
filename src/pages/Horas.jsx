import { useCallback, useEffect, useMemo, useState } from 'react'
import { jornadaMin } from '../planificador.js'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Badge, Cargando, fmtMin } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

// Reporte de horas registradas por persona: por día o por semana.
// Jornada: lunes a jueves 8,5 h, viernes 8 h; sábados, domingos y festivos no laborales.
const jornada = (fecha) => jornadaMin(fecha) // festivos: 0
const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const lunesDe = (f) => { const d = new Date(f + 'T12:00:00').getDay(); return sumarDias(f, d === 0 ? -6 : 1 - d) }
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fmtDia = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

function estado(total, jor) {
  if (jor === 0) return total > 0 ? ['info', 'Día no laboral'] : ['muted', '—']
  if (total === 0) return ['bad', 'Sin registros']
  if (total < jor * 0.9) return ['warn', 'Incompleto']
  if (total > jor + 15) return ['info', 'Posible tiempo extra']
  return ['ok', 'Completo']
}

export default function Horas({ perfil }) {
  const [vista, setVista] = useState('dia')
  const [fecha, setFecha] = useState(hoyCO())
  const [datos, setDatos] = useState(null)
  const [personas, setPersonas] = useState([])
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const desde = vista === 'dia' ? fecha : lunesDe(fecha)
  const hasta = vista === 'dia' ? fecha : sumarDias(desde, 5)

  const cargar = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([
        q(sb.rpc('horas_personal', { p_desde: desde, p_hasta: hasta })),
        q(sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario').order('area').order('nombre')),
      ])
      setDatos(h); setPersonas(p); setError('')
    } catch (e) { setError(e.message) }
  }, [desde, hasta])
  useEffect(() => { setDatos(null); setAbierta(null); cargar() }, [cargar])

  const mover = (n) => setFecha(sumarDias(fecha, vista === 'dia' ? n : n * 7))

  return (
    <div>
      <div className="titulo-pagina"><h1>Horas del personal</h1><BotonAyuda clave="horas" rol={perfil?.rol} /></div>
      <div className="barra-horas">
        <div className="segmentado">
          <button className={vista === 'dia' ? 'sel' : ''} onClick={() => setVista('dia')}>Día</button>
          <button className={vista === 'semana' ? 'sel' : ''} onClick={() => setVista('semana')}>Semana</button>
        </div>
        <button className="btn btn-sec btn-sm" onClick={() => mover(-1)}>‹ Anterior</button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn btn-sec btn-sm" onClick={() => mover(1)}>Siguiente ›</button>
        <button className="btn-link" onClick={() => setFecha(hoyCO())}>Hoy</button>
        <span className="tenue">{vista === 'dia' ? fmtDia(fecha) : `Semana del ${fmtDia(desde)} al ${fmtDia(hasta)}`}</span>
      </div>
      <Aviso>{error}</Aviso>
      {!datos ? <Cargando /> : vista === 'dia'
        ? <Dia fecha={fecha} datos={datos} personas={personas} abierta={abierta} setAbierta={setAbierta} />
        : <Semana desde={desde} datos={datos} personas={personas} />}
      <p className="nota">El día es la fecha en que se hizo el registro en la tablet. Se cuentan tareas (sin terceros) y paros. Jornada: lunes a jueves 8,5 h, viernes 8 h; los festivos no se descuentan.</p>
    </div>
  )
}

function Dia({ fecha, datos, personas, abierta, setAbierta }) {
  const jor = jornada(fecha)
  const filas = useMemo(() => {
    const por = Object.fromEntries(datos.map((d) => [d.persona_id, d]))
    const lista = personas.map((p) => ({ ...p, ...(por[p.id] || {}), id: p.id }))
    // Personas que registraron pero ya no son operarios activos
    for (const d of datos) if (!personas.some((p) => p.id === d.persona_id)) lista.push({ ...d, id: d.persona_id })
    return lista.map((f) => {
      const t = Number(f.min_tareas || 0), pa = Number(f.min_paros || 0)
      return { ...f, t, pa, total: t + pa }
    })
  }, [datos, personas])
  const conReg = filas.filter((f) => f.total > 0).length
  const completos = filas.filter((f) => jor > 0 && f.total >= jor * 0.9).length
  const totT = filas.reduce((s, f) => s + f.t, 0), totP = filas.reduce((s, f) => s + f.pa, 0)

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span>Personas con registro</span><b>{conReg} / {filas.length}</b></div>
        <div className="kpi"><span>Jornada completa</span><b>{jor ? `${completos} / ${filas.length}` : 'No laboral'}</b></div>
        <div className="kpi"><span>Horas en tareas</span><b>{fmtMin(totT)}</b></div>
        <div className="kpi"><span>Horas en paros</span><b>{fmtMin(totP)}</b></div>
      </div>
      <table className="tabla">
        <thead><tr><th>Persona</th><th>Área</th><th>En tareas</th><th>En paros</th><th>Total</th><th>Jornada</th><th>Diferencia</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {filas.map((f) => {
            const [tono, txt] = estado(f.total, jor)
            const dif = f.total - jor
            return [
              <tr key={f.id}>
                <td><b>{f.nombre}</b></td><td>{f.area || '—'}</td>
                <td>{f.t ? fmtMin(f.t) : '—'}</td><td>{f.pa ? fmtMin(f.pa) : '—'}</td>
                <td><b>{f.total ? fmtMin(f.total) : '—'}</b></td>
                <td className="tenue">{jor ? fmtMin(jor) : '—'}</td>
                <td className={dif < 0 ? 'neg' : dif > 15 ? 'pos' : ''}>{jor ? `${dif > 0 ? '+' : dif < 0 ? '−' : ''}${fmtMin(Math.abs(dif))}` : '—'}</td>
                <td><Badge tone={tono}>{txt}</Badge></td>
                <td>{f.total > 0 && <button className="btn-link" onClick={() => setAbierta(abierta === f.id ? null : f.id)}>{abierta === f.id ? 'Ocultar' : 'Detalle'}</button>}</td>
              </tr>,
              abierta === f.id && <tr key={f.id + '-d'} className="fila-registros"><td colSpan={9}><DetallePersona persona={f.id} fecha={fecha} /></td></tr>,
            ]
          })}
        </tbody>
      </table>
    </>
  )
}

function DetallePersona({ persona, fecha }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    // Rango del día en hora de Colombia (UTC−5)
    const ini = `${fecha}T00:00:00-05:00`, fin = `${sumarDias(fecha, 1)}T00:00:00-05:00`
    Promise.all([
      q(sb.from('registros').select('id, inicio, fin, minutos, cantidad, lote, tareas(area, procesos(nombre), ordenes(numero, proyecto), items(numero, descripcion))')
        .eq('persona_id', persona).is('motivo_pausa', null).gte('inicio', ini).lt('inicio', fin).order('inicio')),
      q(sb.from('paros').select('id, inicio, fin, minutos, observacion, motivos_paro(descripcion)')
        .eq('persona_id', persona).gte('inicio', ini).lt('inicio', fin).order('inicio')),
    ]).then(([r, p]) => setD({ r: r.filter((x) => x.tareas?.area !== 'TERCEROS'), p })).catch((e) => setError(e.message))
  }, [persona, fecha])
  if (error) return <Aviso>{error}</Aviso>
  if (!d) return <Cargando />
  const min = (x) => x.minutos ?? (x.fin ? (new Date(x.fin) - new Date(x.inicio)) / 60000 : 0)
  const hora = (x) => new Date(x.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  return (
    <table className="tabla">
      <thead><tr><th>Hora</th><th>Tipo</th><th>OP / ítem</th><th>Proceso o motivo</th><th>Tiempo</th><th>Cantidad</th></tr></thead>
      <tbody>
        {[...d.r.map((x) => ({ ...x, tipo: 'tarea' })), ...d.p.map((x) => ({ ...x, tipo: 'paro' }))]
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
          .map((x) => (
            <tr key={x.id}>
              <td className="pequeño">{hora(x)}</td>
              <td>{x.tipo === 'paro' ? <Badge tone="warn">Paro</Badge> : x.lote ? <Badge tone="info">Proyecto</Badge> : <Badge tone="muted">Tarea</Badge>}</td>
              <td>{x.tipo === 'tarea' ? <>OP {x.tareas?.ordenes?.numero} · Ítem {x.tareas?.items?.numero} <span className="tenue">{x.tareas?.items?.descripcion}</span></> : '—'}</td>
              <td>{x.tipo === 'tarea' ? x.tareas?.procesos?.nombre : x.motivos_paro?.descripcion}{x.observacion ? <span className="tenue"> · {x.observacion}</span> : ''}</td>
              <td>{fmtMin(min(x))}</td>
              <td>{x.cantidad ?? '—'}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

function Semana({ desde, datos, personas }) {
  const dias = DIAS.map((_, i) => sumarDias(desde, i))
  // Los días que aún no llegan no cuentan para la jornada de la semana
  const hoy = hoyCO()
  const jorDia = (f) => (f > hoy ? 0 : jornada(f))
  const jorSem = dias.reduce((s, f) => s + jorDia(f), 0)
  const ids = [...new Set([...personas.map((p) => p.id), ...datos.map((d) => d.persona_id)])]
  const info = (id) => personas.find((p) => p.id === id) || datos.find((d) => d.persona_id === id)
  const celda = (id, f) => { const d = datos.find((x) => x.persona_id === id && x.fecha === f); return d ? Number(d.min_tareas) + Number(d.min_paros) : 0 }
  return (
    <table className="tabla tabla-semana">
      <thead><tr><th>Persona</th><th>Área</th>{dias.map((f, i) => <th key={f}>{DIAS[i]} {Number(f.slice(8))}</th>)}<th>Total</th><th>Jornada</th><th>Diferencia</th></tr></thead>
      <tbody>
        {ids.map((id) => {
          const p = info(id)
          const tot = dias.reduce((s, f) => s + celda(id, f), 0)
          const dif = tot - jorSem
          return (
            <tr key={id}>
              <td><b>{p?.nombre}</b></td><td>{p?.area || '—'}</td>
              {dias.map((f) => {
                const m = celda(id, f), j = jorDia(f)
                const [tono] = estado(m, j)
                return <td key={f} className={`celda-h h-${tono}`}>{m ? fmtMin(m) : j ? '—' : ''}</td>
              })}
              <td><b>{fmtMin(tot)}</b></td><td className="tenue">{fmtMin(jorSem)}</td>
              <td className={dif < 0 ? 'neg' : dif > 15 ? 'pos' : ''}>{`${dif > 0 ? '+' : dif < 0 ? '−' : ''}${fmtMin(Math.abs(dif))}`}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
