import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Cargando, Modal, fmtFecha, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { AREAS_PLANTA } from '../estandar.js'

// Programación de la planta: bloques de trabajo (OP + área + día + horario + operarios opcionales)

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const COLORES = ['#2a78d6', '#1d8a4e', '#b5530f', '#7a4cc2', '#c0392b', '#0f8a8a', '#a8326e', '#5b6b1a', '#2c4f9e', '#8a5a00']
export const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
export const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); const w = (d.getDay() + 6) % 7; return sumarDias(f, -w) }
const aMin = (h) => { const [a, b] = String(h).split(':'); return Number(a) * 60 + Number(b) }
const hhmm = (h) => String(h).slice(0, 5)
const jornadaMin = (f) => { const w = new Date(f + 'T12:00:00').getDay(); return w === 5 ? 480 : w >= 1 && w <= 4 ? 510 : 0 }
const colorOP = (n) => COLORES[[...String(n)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length]
const fmtH = (m) => `${fmtNum(m / 60, 1)} h`
const nombreCorto = (n) => String(n || '').split(' ')[0]
// Horas-persona de un bloque: duración × operarios (1 si no tiene asignados)
const horasBloque = (b) => (aMin(b.hora_fin) - aMin(b.hora_inicio)) * Math.max(1, b.personas?.length || 0)

// Bloques de un rango de fechas y áreas (lo usan esta página y la tablet)
export function useProgramacion(desde, hasta, areas) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const clave = (areas || []).join(',')
  const cargar = useCallback(async () => {
    try {
      let c = sb.from('programacion').select('*, ordenes(numero, proyecto, cliente, estado, fecha_compromiso)')
        .gte('fecha', desde).lte('fecha', hasta).order('hora_inicio')
      if (areas) c = c.in('area', areas)
      const [bloques, personas] = await Promise.all([q(c), q(sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario').order('nombre'))])
      setD({ bloques, personas }); setError('')
    } catch (e) { setError(e.message) }
  }, [desde, hasta, clave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [cargar])
  return { d, error, cargar }
}

export default function Programacion({ perfil, gestor }) {
  const [vista, setVista] = useState('semana')
  const [dia, setDia] = useState(hoyCO())
  const [filtro, setFiltro] = useState('')
  const [form, setForm] = useState(null)
  const [pend, setPend] = useState(null)
  const lunes = lunesDe(dia)
  const desde = vista === 'semana' ? lunes : dia
  const hasta = vista === 'semana' ? sumarDias(lunes, 5) : dia
  const areas = filtro ? [filtro] : AREAS_PLANTA
  const { d, error, cargar } = useProgramacion(desde, hasta, null)

  // Trabajo pendiente por OP y área (para programar) y horas ya programadas desde hoy
  const cargarPend = useCallback(async () => {
    const hoy = hoyCO()
    const [ts, futuros, ops] = await Promise.all([
      q(sb.from('v_tareas').select('orden_id, area, min_std, estado').in('estado', ['pendiente', 'en_curso', 'pausada']).in('op_estado', ['borrador', 'en_planta']).neq('area', 'TERCEROS')),
      q(sb.from('programacion').select('orden_id, area, hora_inicio, hora_fin, personas').gte('fecha', hoy)),
      q(sb.from('v_ordenes').select('id, numero, proyecto, cliente, fecha_compromiso, prioridad, semaforo, estado').in('estado', ['borrador', 'en_planta']).order('numero')),
    ])
    const g = {}
    for (const t of ts) { const k = `${t.orden_id}|${t.area}`; (g[k] ||= { orden_id: t.orden_id, area: t.area, std: 0, prog: 0 }).std += Number(t.min_std || 0) }
    for (const b of futuros) { const k = `${b.orden_id}|${b.area}`; if (g[k]) g[k].prog += horasBloque(b) }
    setPend({ filas: Object.values(g), ops })
  }, [])
  useEffect(() => { cargarPend().catch(() => {}) }, [cargarPend])
  const recargar = () => { cargar(); cargarPend().catch(() => {}) }

  const opsPorId = useMemo(() => Object.fromEntries((pend?.ops || []).map((o) => [o.id, o])), [pend])

  return (
    <div>
      <div className="titulo-pagina">
        <div><h1>Programación de planta</h1><div className="tenue pequeño">Qué proyecto trabaja cada área, cada día y a qué hora. Las tablets muestran primero lo programado para hoy.</div></div>
        <div className="titulo-acciones">
          {gestor && <button className="btn" onClick={() => setForm({ area: filtro || 'METAL', fecha: dia < hoyCO() ? hoyCO() : dia, hora_inicio: '07:00', hora_fin: '11:00', personas: [] })}>+ Programar</button>}
          <BotonAyuda clave="programacion" rol={perfil?.rol} />
        </div>
      </div>
      <BarraFechas vista={vista} setVista={setVista} dia={dia} setDia={setDia}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todas las áreas</option>{AREAS_PLANTA.map((a) => <option key={a}>{a}</option>)}</select>
      </BarraFechas>
      <Aviso>{error}</Aviso>
      {!d ? <Cargando /> : (
        <Calendario vista={vista} dia={dia} lunes={lunes} areas={areas} bloques={d.bloques} personas={d.personas}
          onDia={(f) => { setDia(f); setVista('dia') }}
          onNuevo={gestor ? (area, fecha, hora) => setForm({ area, fecha, hora_inicio: hora || '07:00', hora_fin: hora ? `${String(Math.min(Number(hora.slice(0, 2)) + 2, 23)).padStart(2, '0')}:00` : '11:00', personas: [] }) : null}
          onEditar={gestor ? (b) => setForm(b) : null} />
      )}

      {pend && <PorProgramar pend={pend} areas={areas} opsPorId={opsPorId}
        onProgramar={gestor ? (f) => setForm({ orden_id: f.orden_id, area: f.area, fecha: dia < hoyCO() ? hoyCO() : dia, hora_inicio: '07:00', hora_fin: '11:00', personas: [] }) : null} />}

      {form && d && <FormBloque inicial={form} ops={pend?.ops || []} pend={pend} personas={d.personas} bloques={d.bloques}
        onClose={() => setForm(null)} onGuardado={() => { setForm(null); recargar() }} />}
    </div>
  )
}

export function BarraFechas({ vista, setVista, dia, setDia, children }) {
  const lunes = lunesDe(dia)
  const paso = vista === 'semana' ? 7 : 1
  const titulo = vista === 'semana'
    ? `Semana del ${new Date(lunes + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })} al ${new Date(sumarDias(lunes, 5) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}`
    : new Date(dia + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="prog-barra">
      <div className="segmentado">{[['semana', 'Semana'], ['dia', 'Día']].map(([v, t]) => <button key={v} className={vista === v ? 'sel' : ''} onClick={() => setVista(v)}>{t}</button>)}</div>
      <button className="btn btn-sec btn-sm" onClick={() => setDia(sumarDias(dia, -paso))}>‹</button>
      <button className="btn btn-sec btn-sm" onClick={() => setDia(hoyCO())}>Hoy</button>
      <button className="btn btn-sec btn-sm" onClick={() => setDia(sumarDias(dia, paso))}>›</button>
      <b className="prog-titulo">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</b>
      {children}
    </div>
  )
}

// Vista semana (filas = áreas, columnas = días) o día (agenda por horas, columnas = áreas)
export function Calendario({ vista, dia, lunes, areas, bloques, personas, onDia, onNuevo, onEditar }) {
  const perPorId = Object.fromEntries(personas.map((p) => [p.id, p]))
  const gente = (a) => personas.filter((p) => p.area === a).length
  const hoy = hoyCO()

  if (vista === 'semana') {
    const dias = DIAS.map((_, i) => sumarDias(lunes, i))
    return (
      <div className="prog-semana" style={{ gridTemplateColumns: `130px repeat(${dias.length}, minmax(150px, 1fr))` }}>
        <div className="ps-esq" />
        {dias.map((f, i) => (
          <button key={f} className={`ps-dia${f === hoy ? ' es-hoy' : ''}`} onClick={() => onDia?.(f)} title="Ver el día por horas">
            {DIAS[i]} <b>{new Date(f + 'T12:00:00').getDate()}</b>
          </button>
        ))}
        {areas.map((a) => [
          <div key={a} className="ps-area"><b>{a}</b><span className="tenue pequeño">{gente(a)} {gente(a) === 1 ? 'operario' : 'operarios'}</span></div>,
          ...dias.map((f) => {
            const bs = bloques.filter((b) => b.area === a && b.fecha === f)
            const prog = bs.reduce((s, b) => s + horasBloque(b), 0)
            const cap = gente(a) * jornadaMin(f)
            const pct = cap ? prog / cap : 0
            return (
              <div key={a + f} className={`ps-celda${f === hoy ? ' es-hoy' : ''}${f < hoy ? ' pasado' : ''}`}
                onClick={(e) => { if (e.target === e.currentTarget && onNuevo) onNuevo(a, f) }}>
                {(prog > 0 || cap > 0) && (
                  <div className={`ps-carga ${pct > 1 ? 'mal' : pct > 0.85 ? 'alerta' : 'bien'}`} title="Horas-persona programadas frente a la capacidad del área">
                    <i style={{ width: `${Math.min(pct, 1) * 100}%` }} /><span>{fmtH(prog)}{cap ? ` / ${fmtH(cap)}` : ''}</span>
                  </div>
                )}
                {bs.map((b) => <Bloque key={b.id} b={b} perPorId={perPorId} onClick={onEditar} compacto />)}
                {onNuevo && <button className="ps-mas" onClick={() => onNuevo(a, f)}>+</button>}
              </div>
            )
          }),
        ])}
      </div>
    )
  }

  // Día por horas
  const bsDia = bloques.filter((b) => b.fecha === dia)
  const h0 = Math.min(7 * 60, ...bsDia.map((b) => Math.floor(aMin(b.hora_inicio) / 60) * 60))
  const h1 = Math.max(17 * 60, ...bsDia.map((b) => Math.ceil(aMin(b.hora_fin) / 60) * 60))
  const PX = 1.1 // píxeles por minuto
  const horas = []
  for (let m = h0; m <= h1; m += 60) horas.push(m)
  const ahora = (() => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })); return d.getHours() * 60 + d.getMinutes() })()
  return (
    <div className="prog-dia" style={{ gridTemplateColumns: `56px repeat(${areas.length}, minmax(170px, 1fr))` }}>
      <div className="pd-esq" />
      {areas.map((a) => {
        const prog = bsDia.filter((b) => b.area === a).reduce((s, b) => s + horasBloque(b), 0)
        const cap = gente(a) * jornadaMin(dia)
        return <div key={a} className="pd-area"><b>{a}</b><span className="tenue pequeño">{fmtH(prog)}{cap ? ` de ${fmtH(cap)}` : ''}</span></div>
      })}
      <div className="pd-horas" style={{ height: (h1 - h0) * PX + 12 }}>
        {horas.map((m) => <span key={m} style={{ top: (m - h0) * PX }}>{String(m / 60).padStart(2, '0')}:00</span>)}
      </div>
      {areas.map((a) => {
        const bs = bsDia.filter((b) => b.area === a).sort((x, y) => aMin(x.hora_inicio) - aMin(y.hora_inicio))
        // Carriles: bloques que se cruzan van lado a lado
        const fin = []
        const carril = bs.map((b) => { let k = fin.findIndex((f) => f <= aMin(b.hora_inicio)); if (k < 0) k = fin.length; fin[k] = aMin(b.hora_fin); return k })
        const n = Math.max(1, fin.length)
        return (
          <div key={a} className="pd-col" style={{ height: (h1 - h0) * PX }}
            onClick={(e) => {
              if (e.target !== e.currentTarget || !onNuevo) return
              const m = h0 + Math.floor((e.nativeEvent.offsetY / PX) / 60) * 60
              onNuevo(a, dia, `${String(m / 60).padStart(2, '0')}:00`)
            }}>
            {horas.map((m) => <i key={m} className="pd-linea" style={{ top: (m - h0) * PX }} />)}
            {dia === hoyCO() && ahora > h0 && ahora < h1 && <i className="pd-ahora" style={{ top: (ahora - h0) * PX }} />}
            {bs.map((b, i) => (
              <div key={b.id} className="pd-bloque" style={{
                top: (aMin(b.hora_inicio) - h0) * PX, height: Math.max((aMin(b.hora_fin) - aMin(b.hora_inicio)) * PX - 2, 22),
                left: `calc(${(100 * carril[i]) / n}% + 2px)`, width: `calc(${100 / n}% - 4px)`,
              }}>
                <Bloque b={b} perPorId={perPorId} onClick={onEditar} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Bloque({ b, perPorId, onClick, compacto }) {
  const o = b.ordenes || {}
  const vencida = o.fecha_compromiso && o.fecha_compromiso < hoyCO() && ['borrador', 'en_planta'].includes(o.estado)
  const quienes = (b.personas || []).map((id) => nombreCorto(perPorId[id]?.nombre)).filter(Boolean)
  return (
    <div className={`bloque${compacto ? ' compacto' : ''}${onClick ? ' clic' : ''}${vencida ? ' vencida' : ''}`} style={{ '--c': colorOP(o.numero) }}
      onClick={(e) => { e.stopPropagation(); onClick?.(b) }}
      title={`OP ${o.numero} · ${o.proyecto || ''}\n${hhmm(b.hora_inicio)}–${hhmm(b.hora_fin)}${quienes.length ? `\n${quienes.join(', ')}` : ''}${b.nota ? `\n${b.nota}` : ''}${vencida ? '\nEntrega vencida' : ''}`}>
      <div className="bl-hora">{hhmm(b.hora_inicio)}–{hhmm(b.hora_fin)}</div>
      <div className="bl-op"><b>OP {o.numero}</b> {o.proyecto}</div>
      {quienes.length > 0 && <div className="bl-quien">{quienes.join(', ')}</div>}
      {!compacto && b.nota && <div className="bl-quien">{b.nota}</div>}
    </div>
  )
}

// Lista de OPs con trabajo pendiente por área y cuánto falta por programar
function PorProgramar({ pend, areas, opsPorId, onProgramar }) {
  const filas = pend.filas.filter((f) => areas.includes(f.area) && f.std > 0 && opsPorId[f.orden_id])
    .map((f) => ({ ...f, op: opsPorId[f.orden_id], falta: Math.max(f.std - f.prog, 0) }))
    .sort((a, b) => (a.op.prioridad - b.op.prioridad) || String(a.op.fecha_compromiso || '9').localeCompare(String(b.op.fecha_compromiso || '9')))
  if (!filas.length) return null
  return (
    <section className="tarjeta prog-pend">
      <h3 className="subt" style={{ marginTop: 0 }}>Trabajo por programar</h3>
      <p className="tenue pequeño">Horas estándar pendientes de cada OP por área, frente a las horas-persona ya programadas de hoy en adelante.</p>
      <table className="tabla">
        <thead><tr><th>OP</th><th>Área</th><th>Entrega</th><th>Pendiente</th><th>Programado</th><th>Falta</th><th /></tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={f.orden_id + f.area}>
            <td><span className="punto" style={{ background: colorOP(f.op.numero) }} /><b>OP {f.op.numero}</b> <span className="tenue">{f.op.proyecto}</span></td>
            <td>{f.area}</td>
            <td className={f.op.semaforo === 'vencida' ? 't-mal' : ''}>{fmtFecha(f.op.fecha_compromiso)}</td>
            <td>{fmtH(f.std)}</td><td>{f.prog ? fmtH(f.prog) : '—'}</td>
            <td>{f.falta > 0 ? <b>{fmtH(f.falta)}</b> : <span className="tenue">cubierto</span>}</td>
            <td>{onProgramar && <button className="btn-link" onClick={() => onProgramar(f)}>Programar</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  )
}

function FormBloque({ inicial, ops, pend, personas, bloques, onClose, onGuardado }) {
  const [f, setF] = useState({ orden_id: '', nota: '', ...inicial, hora_inicio: hhmm(inicial.hora_inicio), hora_fin: hhmm(inicial.hora_fin), personas: inicial.personas || [] })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const gente = personas.filter((p) => p.area === f.area || f.personas.includes(p.id))
  const otros = personas.filter((p) => p.area !== f.area && !f.personas.includes(p.id))
  const toggle = (id) => setF({ ...f, personas: f.personas.includes(id) ? f.personas.filter((x) => x !== id) : [...f.personas, id] })
  const info = pend?.filas.find((x) => x.orden_id === f.orden_id && x.area === f.area)
  // Operarios que ya tienen otro bloque que se cruza
  const cruces = f.personas.filter((id) => bloques.some((b) => b.id !== f.id && b.fecha === f.fecha && (b.personas || []).includes(id)
    && aMin(b.hora_inicio) < aMin(f.hora_fin) && aMin(f.hora_inicio) < aMin(b.hora_fin)))
  const [otroDia, setOtroDia] = useState(false)

  const guardar = async (e, copiarA) => {
    e?.preventDefault()
    if (!f.orden_id) { setError('Elige la OP.'); return }
    if (aMin(f.hora_fin) <= aMin(f.hora_inicio)) { setError('La hora de fin debe ser después de la de inicio.'); return }
    setEnviando(true); setError('')
    const fila = { orden_id: f.orden_id, area: f.area, fecha: copiarA || f.fecha, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, personas: f.personas, nota: f.nota?.trim() || null }
    try {
      if (f.id && !copiarA) await q(sb.from('programacion').update(fila).eq('id', f.id))
      else await q(sb.from('programacion').insert(fila))
      onGuardado()
    } catch (err) { setError(err.message); setEnviando(false) }
  }
  const eliminar = async () => {
    if (!window.confirm('¿Quitar este bloque de la programación?')) return
    try { await q(sb.from('programacion').delete().eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) }
  }
  const siguienteHabil = () => { let x = sumarDias(f.fecha, 1); while (jornadaMin(x) === 0) x = sumarDias(x, 1); return x }

  return (
    <Modal titulo={f.id ? 'Editar bloque programado' : 'Programar trabajo'} onClose={onClose} ancho={620}>
      <form className="form" onSubmit={guardar}>
        <label>Proyecto (OP)
          <select value={f.orden_id} onChange={set('orden_id')} required autoFocus={!f.orden_id}>
            <option value="">Selecciona…</option>
            {!ops.some((o) => o.id === f.orden_id) && f.ordenes && <option value={f.orden_id}>OP {f.ordenes.numero} · {f.ordenes.proyecto}</option>}
            {ops.map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.proyecto} · {o.cliente}</option>)}
          </select>
        </label>
        <div className="fila3">
          <label>Área<select value={f.area} onChange={set('area')}>{AREAS_PLANTA.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>Día<input type="date" value={f.fecha} onChange={set('fecha')} required /></label>
          <span className="fila-horas">
            <label>Desde<input type="time" value={f.hora_inicio} onChange={set('hora_inicio')} step={900} required /></label>
            <label>Hasta<input type="time" value={f.hora_fin} onChange={set('hora_fin')} step={900} required /></label>
          </span>
        </div>
        {info && <p className="nota">Pendiente de esta OP en {f.area.toLowerCase()}: <b>{fmtH(info.std)}</b> estándar · programado de hoy en adelante: <b>{fmtH(info.prog)}</b></p>}
        {f.orden_id && !info && <p className="nota">Esta OP no tiene trabajo pendiente en {f.area.toLowerCase()}.</p>}

        <div>
          <div className="paso-tit pequeño">Operarios (opcional; sin operarios queda abierto a toda el área)</div>
          <div className="chips">
            {gente.map((p) => <button type="button" key={p.id} className={`chip-sel${f.personas.includes(p.id) ? ' sel' : ''}`} onClick={() => toggle(p.id)}>{p.nombre}</button>)}
            {!otroDia && otros.length > 0 && <button type="button" className="btn-link" onClick={() => setOtroDia(true)}>+ de otra área</button>}
            {otroDia && otros.map((p) => <button type="button" key={p.id} className="chip-sel" onClick={() => toggle(p.id)}>{p.nombre} <small>{p.area}</small></button>)}
          </div>
          {cruces.length > 0 && <Aviso tipo="warn">{cruces.map((id) => personas.find((p) => p.id === id)?.nombre).join(', ')} ya {cruces.length === 1 ? 'tiene' : 'tienen'} otro trabajo programado en ese horario. Si es un trabajo corto en simultáneo, puedes continuar.</Aviso>}
        </div>
        <label>Nota (opcional)<input value={f.nota || ''} onChange={set('nota')} placeholder="Ej. solo ítems 3 y 4 · cortar todo el material" /></label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {f.id && <button type="button" className="btn-link peligro" onClick={eliminar}>Quitar bloque</button>}
          {f.id && <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => guardar(null, siguienteHabil())}>Copiar al {new Date(siguienteHabil() + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })}</button>}
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={enviando}>{f.id ? 'Guardar' : 'Programar'}</button>
        </div>
      </form>
    </Modal>
  )
}
