import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Cargando, Modal, fmtFecha, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { AREAS_PLANTA } from '../estandar.js'
import { aMin, hhBloque, jornadaMin, maqBloque, planificar, planificarOP } from '../planificador.js'

// Programación de la planta: bloques de trabajo (OP + área + día + horario + operarios opcionales)

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const COLORES = ['#2a78d6', '#1d8a4e', '#b5530f', '#7a4cc2', '#c0392b', '#0f8a8a', '#a8326e', '#5b6b1a', '#2c4f9e', '#8a5a00']
export const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
export const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); const w = (d.getDay() + 6) % 7; return sumarDias(f, -w) }
const hhmm = (h) => String(h).slice(0, 5)
const colorOP = (n) => COLORES[[...String(n)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length]
const fmtH = (m) => `${fmtNum(m / 60, 1)} h`
const nombreCorto = (n) => String(n || '').split(' ')[0]
const horasBloque = hhBloque
const ahoraCO = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })); return d.getHours() * 60 + d.getMinutes() }
const hmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

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
      const [bloques, personas, maquinas, aj] = await Promise.all([q(c), q(sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario').order('nombre')),
        q(sb.from('procesos').select('codigo, nombre, area').eq('es_maquina', true).order('codigo')), q(sb.from('ajustes').select('valor').eq('clave', 'horario'))])
      setD({ bloques, personas, maquinas, horario: aj[0]?.valor || { entrada: '07:00' } }); setError('')
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
      q(sb.from('v_tareas').select('orden_id, area, proceso, min_std, min_reales, estado, es_maquina, min_maquina, min_maquina_real').in('estado', ['pendiente', 'en_curso', 'pausada']).in('op_estado', ['borrador', 'en_planta']).neq('area', 'TERCEROS')),
      q(sb.from('programacion').select('*').gte('fecha', hoy)),
      q(sb.from('v_ordenes').select('id, numero, proyecto, cliente, fecha_compromiso, prioridad, semaforo, estado').in('estado', ['borrador', 'en_planta']).order('numero')),
    ])
    const g = {}
    // Pendiente = estándar de lo que falta menos lo ya registrado; máquina aparte por proceso
    for (const t of ts) {
      const k = `${t.orden_id}|${t.area}`
      const x = (g[k] ||= { orden_id: t.orden_id, area: t.area, std: 0, prog: 0, maq: {}, progM: {} })
      x.std += Math.max(Number(t.min_std || 0) - Number(t.min_reales || 0), 0)
      if (t.es_maquina) x.maq[t.proceso] = (x.maq[t.proceso] || 0) + Math.max(Number(t.min_maquina || 0) - Number(t.min_maquina_real || 0), 0)
    }
    for (const b of futuros) {
      const x = g[`${b.orden_id}|${b.area}`]
      if (!x) continue
      x.prog += horasBloque(b)
      for (const [p, m] of Object.entries(b.maquinas || {})) x.progM[p] = (x.progM[p] || 0) + Number(m)
    }
    for (const x of Object.values(g)) {
      x.faltaH = Math.max(x.std - x.prog, 0)
      x.faltaM = Object.fromEntries(Object.entries(x.maq).map(([p, m]) => [p, Math.max(m - (x.progM[p] || 0), 0)]).filter(([, v]) => v >= 1))
      x.maqTotal = Object.values(x.maq).reduce((s, v) => s + v, 0)
    }
    setPend({ filas: Object.values(g), ops, futuros })
  }, [])
  useEffect(() => { cargarPend().catch(() => {}) }, [cargarPend])
  const recargar = () => { cargar(); cargarPend().catch(() => {}) }

  const opsPorId = useMemo(() => Object.fromEntries((pend?.ops || []).map((o) => [o.id, o])), [pend])

  const [todo, setTodo] = useState(false)
  const guardarEntrada = async (v) => {
    if (!v || v === d?.horario?.entrada) return
    try { await q(sb.from('ajustes').upsert({ clave: 'horario', valor: { ...(d?.horario || {}), entrada: v } })); recargar() } catch (e) { alert(e.message) }
  }
  const nuevoAuto = (extra) => setForm({ area: filtro || 'METAL', fecha: dia < hoyCO() ? hoyCO() : dia, hora_inicio: d?.horario?.entrada || '07:00', hora_fin: '11:00', personas: [], modo: 'auto', ...extra })

  return (
    <div>
      <div className="titulo-pagina">
        <div><h1>Programación de planta</h1><div className="tenue pequeño">Qué proyecto trabaja cada área, cada día y a qué hora. Lo que no cabe en la jornada pasa solo a los días siguientes.</div></div>
        <div className="titulo-acciones">
          {gestor && <button className="btn btn-sec" onClick={() => setTodo(areas)} disabled={!pend || !d}>Programar todo lo pendiente</button>}
          {gestor && <button className="btn" onClick={() => nuevoAuto({ alcance: 'op' })}>+ Programar</button>}
          <BotonAyuda clave="programacion" rol={perfil?.rol} />
        </div>
      </div>
      <BarraFechas vista={vista} setVista={setVista} dia={dia} setDia={setDia}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Todas las áreas</option>{AREAS_PLANTA.map((a) => <option key={a}>{a}</option>)}</select>
        {gestor && d && <label className="entrada-planta">Entrada<input type="time" step={900} defaultValue={d.horario.entrada} onBlur={(e) => guardarEntrada(e.target.value)} /></label>}
      </BarraFechas>
      <Aviso>{error}</Aviso>
      {!d ? <Cargando /> : (
        <Calendario vista={vista} dia={dia} lunes={lunes} areas={areas} bloques={d.bloques} personas={d.personas} maquinas={d.maquinas}
          onDia={(f) => { setDia(f); setVista('dia') }}
          onNuevo={gestor ? (area, fecha, hora) => nuevoAuto({ area, fecha, hora_inicio: hora || d.horario.entrada }) : null}
          onEditar={gestor ? (b) => setForm(b) : null} />
      )}

      {pend && <PorProgramar pend={pend} areas={areas} opsPorId={opsPorId} maquinas={d?.maquinas || []}
        onProgramar={gestor ? (f) => nuevoAuto({ orden_id: f.orden_id, area: f.area, alcance: f.alcance }) : null}
        onProgramarTodo={gestor ? (as) => setTodo(as) : null} />}

      {form && d && pend && <FormBloque inicial={form} ops={pend.ops} pend={pend} personas={d.personas} bloques={d.bloques} horario={d.horario} maquinas={d.maquinas}
        onClose={() => setForm(null)} onGuardado={() => { setForm(null); recargar() }} />}
      {todo && d && pend && <ProgramarTodo pend={pend} opsPorId={opsPorId} areas={todo} personas={d.personas} horario={d.horario}
        onClose={() => setTodo(false)} onGuardado={() => { setTodo(false); recargar() }} />}
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
export function Calendario({ vista, dia, lunes, areas, bloques, personas, maquinas = [], onDia, onNuevo, onEditar }) {
  const perPorId = Object.fromEntries(personas.map((p) => [p.id, p]))
  const gente = (a) => personas.filter((p) => p.area === a).length
  const hoy = hoyCO()
  // Uso de cada máquina del área en el día (horas de máquina programadas frente a la jornada)
  const barrasMaq = (a, f) => maquinas.filter((m) => m.area === a).map((m) => {
    const usado = bloques.filter((b) => b.fecha === f).reduce((s, b) => s + maqBloque(b, m.codigo), 0)
    if (!usado) return null
    const pct = jornadaMin(f) ? usado / jornadaMin(f) : 1
    return (
      <div key={m.codigo} className={`ps-carga maq ${pct > 1 ? 'mal' : pct > 0.85 ? 'alerta' : 'bien'}`} title={`${m.nombre}: ${fmtH(usado)} de máquina programadas`}>
        <i style={{ width: `${Math.min(pct, 1) * 100}%` }} /><span>⚙ {m.nombre.toLowerCase()} {fmtH(usado)}</span>
      </div>
    )
  })

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
                    <i style={{ width: `${Math.min(pct, 1) * 100}%` }} /><span>{fmtNum(prog / 60, 1)}{cap ? ` / ${fmtNum(cap / 60, 1)}` : ''} h-h</span>
                  </div>
                )}
                {barrasMaq(a, f)}
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
        return <div key={a} className="pd-area"><b>{a}</b><span className="tenue pequeño">{fmtNum(prog / 60, 1)}{cap ? ` de ${fmtNum(cap / 60, 1)}` : ''} h-h</span>{barrasMaq(a, dia)}</div>
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
      {!compacto && (b.min_hombre !== null && b.min_hombre !== undefined) && <div className="bl-quien">{fmtH(Number(b.min_hombre))} h-h{Object.keys(b.maquinas || {}).length ? ` · ⚙ ${fmtH(Object.values(b.maquinas).reduce((s, v) => s + Number(v), 0))} máq.` : ''}</div>}
      {!compacto && b.nota && <div className="bl-quien">{b.nota}</div>}
    </div>
  )
}

const nombreMaq = (maquinas, p) => (maquinas.find((m) => m.codigo === p)?.nombre || p).toLowerCase()
const textoMaq = (maquinas, obj) => Object.entries(obj || {}).filter(([, v]) => v >= 1).map(([p, v]) => `${nombreMaq(maquinas, p)} ${fmtH(v)}`).join(' · ')

// Lista de OPs con trabajo pendiente por área y cuánto falta por programar
export function PorProgramar({ pend, areas, opsPorId, maquinas, onProgramar, onProgramarTodo }) {
  const [area, setArea] = useState('')
  const [verCubiertas, setVerCubiertas] = useState(false)
  const esCubierta = (f) => f.faltaH < 1 && !Object.keys(f.faltaM).length
  const base = pend.filas.filter((f) => areas.includes(f.area) && (f.std > 0 || f.maqTotal > 0) && opsPorId[f.orden_id])
  if (!base.length) return null
  const porArea = (a) => base.filter((f) => f.area === a && !esCubierta(f)).length
  const sel = area && areas.includes(area) ? area : ''
  const filas = base.filter((f) => (!sel || f.area === sel) && (verCubiertas || !esCubierta(f)))
    .map((f) => ({ ...f, op: opsPorId[f.orden_id] }))
    .sort((a, b) => (a.op.prioridad - b.op.prioridad) || String(a.op.fecha_compromiso || '9').localeCompare(String(b.op.fecha_compromiso || '9')))
  const tot = filas.reduce((s, f) => s + f.faltaH, 0)
  return (
    <section className="tarjeta prog-pend">
      <div className="pend-cab">
        <h3 className="subt" style={{ margin: 0 }}>Trabajo por programar</h3>
        {onProgramarTodo && filas.some((f) => !esCubierta(f)) && (
          <button className="btn btn-sec btn-sm" onClick={() => onProgramarTodo(sel ? [sel] : areas)}>Programar todo {sel ? `de ${sel.toLowerCase()}` : 'lo de la lista'}</button>
        )}
      </div>
      <div className="pend-filtros">
        <div className="segmentado">
          {areas.length > 1 && <button className={!sel ? 'sel' : ''} onClick={() => setArea('')}>Todas</button>}
          {areas.map((a) => <button key={a} className={sel === a || areas.length === 1 ? 'sel' : ''} onClick={() => setArea(a)}>{a.charAt(0) + a.slice(1).toLowerCase()} <span className="cuenta">{porArea(a)}</span></button>)}
        </div>
        <label className="chk"><input type="checkbox" checked={verCubiertas} onChange={(e) => setVerCubiertas(e.target.checked)} /> Ver también las ya programadas</label>
      </div>
      <p className="tenue pequeño">Horas hombre pendientes de cada OP por área (y horas de máquina aparte), frente a lo ya programado de hoy en adelante.{filas.length ? ` Falta programar: ${fmtH(tot)} hombre.` : ''}</p>
      {filas.length === 0 ? <div className="tenue">No hay OPs por programar{sel ? ` en ${sel.toLowerCase()}` : ''}.</div> : (
      <table className="tabla">
        <thead><tr><th>OP</th><th>Área</th><th>Entrega</th><th>Pendiente h-h</th><th>Programado</th><th>Falta</th><th>Máquina por programar</th><th /></tr></thead>
        <tbody>{filas.map((f) => {
          const cubierto = f.faltaH < 1 && !Object.keys(f.faltaM).length
          return (
            <tr key={f.orden_id + f.area}>
              <td><span className="punto" style={{ background: colorOP(f.op.numero) }} /><b>OP {f.op.numero}</b> <span className="tenue">{f.op.proyecto}</span></td>
              <td>{f.area}</td>
              <td className={f.op.semaforo === 'vencida' ? 't-mal' : ''}>{fmtFecha(f.op.fecha_compromiso)}</td>
              <td>{fmtH(f.std)}</td><td>{f.prog ? fmtH(f.prog) : '—'}</td>
              <td>{f.faltaH >= 1 ? <b>{fmtH(f.faltaH)}</b> : <span className="tenue">{cubierto ? 'cubierto' : '—'}</span>}</td>
              <td className="pequeño">{textoMaq(maquinas, f.faltaM) || <span className="tenue">—</span>}</td>
              <td className="acciones-fila">{onProgramar && !cubierto && <>
                <button className="btn-link" onClick={() => onProgramar(f)}>Programar</button>
                <button className="btn-link" onClick={() => onProgramar({ ...f, alcance: 'op' })} title="Todas las áreas de la OP, en el orden de sus pasos">OP completa</button>
              </>}</td>
            </tr>
          )
        })}</tbody>
      </table>
      )}
    </section>
  )
}

// Contexto del planificador: inicio (hoy desde ahora, o el día elegido) y si el área trabaja en paralelo
const inicioPlan = (fecha, hora) => {
  const hoy = hoyCO()
  if (fecha > hoy) return { desde: fecha, desdeHora: hora || null }
  const ahora = hmm(Math.ceil(ahoraCO() / 15) * 15)
  return { desde: hoy, desdeHora: hora && hora > ahora ? hora : ahora }
}
const enParalelo = (area) => area === 'GRAN FORMATO'

function ListaPlan({ bloques, maquinas, personas }) {
  const perPorId = Object.fromEntries(personas.map((p) => [p.id, p]))
  return (
    <ul className="plan-lista">
      {bloques.map((b, i) => (
        <li key={i}>
          <b>{new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</b> {b.hora_inicio}–{b.hora_fin}
          <span className="tenue"> · {fmtH(b.min_hombre)} h-h{textoMaq(maquinas, b.maquinas) ? ` · ⚙ ${textoMaq(maquinas, b.maquinas)}` : ''}
            {b.personas?.length ? ` · ${b.personas.map((id) => nombreCorto(perPorId[id]?.nombre)).join(', ')}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

// Programa todas las OPs pendientes, en orden de prioridad y fecha de entrega
export function ProgramarTodo({ pend, opsPorId, areas, personas, horario, onClose, onGuardado }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [tareas, setTareas] = useState(null)
  const completa = areas.length >= AREAS_PLANTA.length
  useEffect(() => {
    q(sb.from('v_tareas').select('id, orden_id, item_id, item_numero, componente_id, paso, area, proceso, proceso_nombre, estado, min_std, min_reales, es_maquina, min_maquina, min_maquina_real, tiempo_std_unit')
      .in('op_estado', ['borrador', 'en_planta'])).then(setTareas).catch((e) => setError(e.message))
  }, [])
  const plan = useMemo(() => {
    if (!tareas) return null
    const ini = inicioPlan(hoyCO(), null)
    const operarios = {}
    for (const p of personas) operarios[p.area] = (operarios[p.area] || 0) + 1
    const filas = pend.filas.filter((f) => areas.includes(f.area) && opsPorId[f.orden_id] && (f.faltaH >= 1 || Object.keys(f.faltaM).length))
      .map((f) => ({ ...f, op: opsPorId[f.orden_id] }))
      .sort((a, b) => (a.op.prioridad - b.op.prioridad) || String(a.op.fecha_compromiso || '9').localeCompare(String(b.op.fecha_compromiso || '9')))
    const ctx = [...pend.futuros]
    const hechas = new Set()
    const out = []
    for (const f of filas) {
      // OP sin nada programado y todas las áreas: se programa completa, en el orden de sus pasos
      if (completa && !pend.futuros.some((b) => b.orden_id === f.orden_id)) {
        if (hechas.has(f.orden_id)) continue
        hechas.add(f.orden_id)
        const r = planificarOP(tareas.filter((t) => t.orden_id === f.orden_id), ctx, { ...ini, operarios }, horario)
        const bs = r.bloques.map((b) => ({ ...b, orden_id: f.orden_id }))
        ctx.push(...bs)
        const delOP = filas.filter((x) => x.orden_id === f.orden_id)
        const faltaM = {}
        for (const x of delOP) for (const [k, v] of Object.entries(x.faltaM)) faltaM[k] = (faltaM[k] || 0) + v
        const fin = r.fin?.fecha || null
        out.push({ ...f, area: 'OP completa', faltaH: delOP.reduce((s, x) => s + x.faltaH, 0), faltaM, bs, fin, tarde: fin && f.op.fecha_compromiso && fin > f.op.fecha_compromiso })
        continue
      }
      const r = planificar({ hh: f.faltaH, maq: f.faltaM }, {
        area: f.area, ...ini, personas: [], operariosArea: operarios[f.area] || 0, paralelo: enParalelo(f.area),
      }, ctx, horario)
      const bs = r.bloques.map((b) => ({ ...b, orden_id: f.orden_id }))
      ctx.push(...bs)
      const fin = bs.length ? bs[bs.length - 1].fecha : null
      out.push({ ...f, bs, fin, tarde: fin && f.op.fecha_compromiso && fin > f.op.fecha_compromiso })
    }
    return out
  }, [tareas, pend, opsPorId, areas, personas, horario, completa])
  if (!plan) return <Modal titulo="Programar todo lo pendiente" onClose={onClose} ancho={820}><Aviso>{error}</Aviso>{!error && <Cargando />}</Modal>
  const total = plan.reduce((s, f) => s + f.bs.length, 0)
  const guardar = async () => {
    setEnviando(true); setError('')
    try {
      const filas = plan.flatMap((f) => { const grupo = crypto.randomUUID(); return f.bs.map((b) => ({ ...b, grupo })) })
      if (filas.length) await q(sb.from('programacion').insert(filas))
      onGuardado()
    } catch (e) { setError(e.message); setEnviando(false) }
  }
  return (
    <Modal titulo="Programar todo lo pendiente" onClose={onClose} ancho={820}>
      <p className="tenue">Se programa cada OP en orden de prioridad y fecha de entrega, desde ahora. Lo que no cabe en la jornada de un día pasa al siguiente día hábil.
        Gran Formato programa varios proyectos a la vez, limitado por las horas hombre del área y por las horas de cada máquina. No se mueve nada de lo ya programado.
        {completa && ' Las OPs que aún no tienen nada programado se programan completas, respetando el orden de sus pasos y los días de terceros.'}</p>
      {plan.length === 0 ? <p>No hay trabajo pendiente sin programar.</p> : (
        <table className="tabla">
          <thead><tr><th>OP</th><th>Área</th><th>Horas</th><th>Bloques</th><th>Termina</th><th>Entrega</th></tr></thead>
          <tbody>{plan.map((f) => (
            <tr key={f.orden_id + f.area} className={f.tarde ? 'fila-tarde' : ''}>
              <td><span className="punto" style={{ background: colorOP(f.op.numero) }} /><b>OP {f.op.numero}</b> <span className="tenue">{f.op.proyecto}</span></td>
              <td>{f.area}</td>
              <td className="pequeño">{fmtH(f.faltaH)} h-h{Object.keys(f.faltaM).length ? <><br />⚙ {fmtH(Object.values(f.faltaM).reduce((s, v) => s + v, 0))} máq.</> : ''}</td>
              <td>{f.bs.length}</td>
              <td>{f.fin ? fmtFecha(f.fin) : '—'}</td>
              <td className={f.tarde ? 't-mal' : ''}>{fmtFecha(f.op.fecha_compromiso)}{f.tarde ? ' · no alcanza' : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {plan.some((f) => f.tarde) && <Aviso tipo="warn">Las OPs en rojo terminarían después de su fecha de entrega con la capacidad actual. Puedes subirles la prioridad, asignar más operarios o renegociar la fecha.</Aviso>}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="btn btn-sec" onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={enviando || !total} onClick={guardar}>Programar {total} bloques</button>
      </div>
    </Modal>
  )
}

// Programa la OP completa: todas las áreas en el orden de sus pasos, terceros incluidos
function ProgramarOP({ f, setF, ops, pend, personas, horario, maquinas, onClose, onGuardado }) {
  const [tareas, setTareas] = useState(null)
  const [reemplazar, setReemplazar] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    setTareas(null)
    if (!f.orden_id) return
    q(sb.from('v_tareas').select('id, item_id, item_numero, item_descripcion, componente_id, producto_nombre, paso, area, proceso, proceso_nombre, estado, min_std, min_reales, es_maquina, min_maquina, min_maquina_real, tiempo_std_unit')
      .eq('orden_id', f.orden_id)).then(setTareas).catch((e) => setError(e.message))
  }, [f.orden_id])
  const hoy = hoyCO()
  const previos = pend.futuros.filter((b) => b.orden_id === f.orden_id)
  const plan = useMemo(() => {
    if (!tareas) return null
    const ctx = reemplazar ? pend.futuros.filter((b) => b.orden_id !== f.orden_id) : pend.futuros
    const operarios = {}
    for (const p of personas) operarios[p.area] = (operarios[p.area] || 0) + 1
    return planificarOP(tareas, ctx, { ...inicioPlan(f.fecha, f.hora_inicio), operarios }, horario)
  }, [tareas, reemplazar, pend, f.orden_id, f.fecha, f.hora_inicio, personas, horario])
  const op = ops.find((o) => o.id === f.orden_id)
  const porArea = {}
  for (const b of plan?.bloques || []) (porArea[b.area] ||= []).push(b)
  const guardar = async (e) => {
    e.preventDefault()
    if (!plan?.bloques.length) { setError('No hay horas de planta para programar en esta OP.'); return }
    setEnviando(true); setError('')
    try {
      if (reemplazar && previos.length) await q(sb.from('programacion').delete().eq('orden_id', f.orden_id).gte('fecha', hoy))
      const grupo = crypto.randomUUID()
      await q(sb.from('programacion').insert(plan.bloques.map((b) => ({ ...b, orden_id: f.orden_id, nota: f.nota?.trim() || null, grupo }))))
      onGuardado()
    } catch (err) { setError(err.message); setEnviando(false) }
  }
  return (
    <form className="form" onSubmit={guardar}>
      <label>Proyecto (OP)
        <select value={f.orden_id} onChange={(e) => setF({ ...f, orden_id: e.target.value })} required>
          <option value="">Selecciona…</option>
          {ops.map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.proyecto} · {o.cliente}</option>)}
        </select>
      </label>
      <div className="fila2">
        <label>Desde el día<input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></label>
        <label>Desde la hora<input type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} step={900} /></label>
      </div>
      <p className="nota">Se programan todas las áreas de la OP en el orden de sus pasos: cada proceso empieza cuando terminan los anteriores de su producto,
        el ensamble cuando terminan todos los productos del ítem, y los terceros cuentan sus días hábiles. Si un día no tiene espacio, pasa al siguiente.</p>
      {previos.length > 0 && <label className="chk"><input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
        Reemplazar lo que ya está programado de esta OP desde hoy ({previos.length} {previos.length === 1 ? 'bloque' : 'bloques'})</label>}
      <label>Nota (opcional)<input value={f.nota || ''} onChange={(e) => setF({ ...f, nota: e.target.value })} /></label>
      {f.orden_id && !plan && !error && <Cargando />}
      {plan && (
        <div className="previa-std">
          {!plan.bloques.length && !plan.terceros.length ? <div className="tenue">Esta OP no tiene trabajo pendiente.</div> : <>
            <div><b>{plan.bloques.length} {plan.bloques.length === 1 ? 'bloque' : 'bloques'}</b>
              {plan.fin && <> · la OP termina el <b>{fmtFecha(plan.fin.fecha)}</b></>}
              {op?.fecha_compromiso && plan.fin && plan.fin.fecha > op.fecha_compromiso && <span className="t-mal"> · después de la entrega ({fmtFecha(op.fecha_compromiso)})</span>}</div>
            {Object.entries(porArea).map(([a, bs]) => (
              <div key={a} className="plan-area"><b>{a}</b> <span className="tenue">· {fmtH(bs.reduce((s, b) => s + b.min_hombre, 0))} h-h · {fmtFecha(bs[0].fecha)} a {fmtFecha(bs[bs.length - 1].fecha)}</span>
                <ListaPlan bloques={bs} maquinas={maquinas} personas={personas} /></div>
            ))}
            {plan.terceros.map((x) => (
              <div key={x.tarea.id} className="plan-area"><b>TERCEROS</b> <span className="tenue">· {x.tarea.proceso_nombre?.toLowerCase()} (ítem {x.tarea.item_numero}) · {x.dias} {x.dias === 1 ? 'día hábil' : 'días hábiles'}: {fmtFecha(x.desde)} a {fmtFecha(x.hasta)}</span></div>
            ))}
          </>}
        </div>
      )}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={enviando || !plan?.bloques.length}>Programar OP ({plan?.bloques.length || 0} bloques)</button>
      </div>
    </form>
  )
}

export function FormBloque({ inicial, ops, pend, personas, bloques, horario, maquinas, onClose, onGuardado }) {
  const [f, setF] = useState({ orden_id: '', nota: '', ...inicial, hora_inicio: hhmm(inicial.hora_inicio), hora_fin: hhmm(inicial.hora_fin), personas: inicial.personas || [] })
  const modo = f.id ? 'manual' : (f.modo || 'auto')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const gente = personas.filter((p) => p.area === f.area || f.personas.includes(p.id))
  const otros = personas.filter((p) => p.area !== f.area && !f.personas.includes(p.id))
  const toggle = (id) => setF({ ...f, personas: f.personas.includes(id) ? f.personas.filter((x) => x !== id) : [...f.personas, id] })
  const info = pend?.filas.find((x) => x.orden_id === f.orden_id && x.area === f.area)
  const [horasTxt, setHorasTxt] = useState(() => (info ? String(Math.round((info.faltaH / 60) * 10) / 10) : ''))
  useEffect(() => { setHorasTxt(info ? String(Math.round((info.faltaH / 60) * 10) / 10) : '') }, [f.orden_id, f.area]) // eslint-disable-line react-hooks/exhaustive-deps
  // Operarios que ya tienen otro bloque que se cruza
  const cruces = modo === 'manual' ? f.personas.filter((id) => bloques.some((b) => b.id !== f.id && b.fecha === f.fecha && (b.personas || []).includes(id)
    && aMin(b.hora_inicio) < aMin(f.hora_fin) && aMin(f.hora_inicio) < aMin(b.hora_fin))) : []
  const [otroDia, setOtroDia] = useState(false)
  const delGrupo = f.grupo ? bloques.filter((b) => b.grupo === f.grupo).length : 0

  // Plan automático: reparte las horas en los días según la jornada y la capacidad
  const plan = useMemo(() => {
    if (modo !== 'auto' || !f.orden_id) return null
    const hh = Math.max(0, Number(String(horasTxt).replace(',', '.')) || 0) * 60
    const maq = info?.faltaM || {}
    if (hh < 1 && !Object.keys(maq).length) return { bloques: [] }
    return planificar({ hh, maq }, {
      area: f.area, ...inicioPlan(f.fecha, f.hora_inicio), personas: f.personas,
      operariosArea: personas.filter((p) => p.area === f.area).length, paralelo: enParalelo(f.area),
    }, pend.futuros, horario)
  }, [modo, f.orden_id, f.area, f.fecha, f.hora_inicio, f.personas, horasTxt, info, pend, personas, horario])

  const guardar = async (e, copiarA) => {
    e?.preventDefault()
    if (!f.orden_id) { setError('Elige la OP.'); return }
    setEnviando(true); setError('')
    try {
      if (modo === 'auto') {
        if (!plan?.bloques.length) { setError('No hay horas para programar.'); setEnviando(false); return }
        const grupo = crypto.randomUUID()
        await q(sb.from('programacion').insert(plan.bloques.map((b) => ({ ...b, orden_id: f.orden_id, nota: f.nota?.trim() || null, grupo }))))
      } else {
        if (aMin(f.hora_fin) <= aMin(f.hora_inicio)) { setError('La hora de fin debe ser después de la de inicio.'); setEnviando(false); return }
        const fila = { orden_id: f.orden_id, area: f.area, fecha: copiarA || f.fecha, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, personas: f.personas, nota: f.nota?.trim() || null }
        if (f.id && !copiarA) await q(sb.from('programacion').update(fila).eq('id', f.id))
        else await q(sb.from('programacion').insert({ ...fila, min_hombre: copiarA ? f.min_hombre ?? null : null, maquinas: copiarA ? f.maquinas || {} : {} }))
      }
      onGuardado()
    } catch (err) { setError(err.message); setEnviando(false) }
  }
  const eliminar = async (todoGrupo) => {
    if (!window.confirm(todoGrupo ? `¿Quitar los ${delGrupo} bloques de esta programación?` : '¿Quitar este bloque de la programación?')) return
    try { await q(todoGrupo ? sb.from('programacion').delete().eq('grupo', f.grupo) : sb.from('programacion').delete().eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) }
  }
  const siguienteHabil = () => { let x = sumarDias(f.fecha, 1); while (jornadaMin(x) === 0) x = sumarDias(x, 1); return x }
  const ultimo = plan?.bloques.length ? plan.bloques[plan.bloques.length - 1].fecha : null
  const op = ops.find((o) => o.id === f.orden_id)

  return (
    <Modal titulo={f.id ? 'Editar bloque programado' : 'Programar trabajo'} onClose={onClose} ancho={720}>
      {!f.id && (
        <div className="segmentado modo-prog">{[['op', 'OP completa'], ['auto', 'Un área (automático)'], ['manual', 'Manual (horario fijo)']].map(([v, t]) =>
          <button type="button" key={v} className={(v === 'op' ? f.alcance === 'op' : f.alcance !== 'op' && modo === v) ? 'sel' : ''}
            onClick={() => setF({ ...f, alcance: v === 'op' ? 'op' : 'area', modo: v === 'op' ? 'auto' : v })}>{t}</button>)}</div>
      )}
      {f.alcance === 'op' && !f.id ? <ProgramarOP f={f} setF={setF} ops={ops} pend={pend} personas={personas} horario={horario} maquinas={maquinas} onClose={onClose} onGuardado={onGuardado} /> : (
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
          <label>{modo === 'auto' ? 'Desde el día' : 'Día'}<input type="date" value={f.fecha} onChange={set('fecha')} required /></label>
          {modo === 'auto'
            ? <label>Desde la hora<input type="time" value={f.hora_inicio} onChange={set('hora_inicio')} step={900} /></label>
            : <span className="fila-horas">
                <label>Desde<input type="time" value={f.hora_inicio} onChange={set('hora_inicio')} step={900} required /></label>
                <label>Hasta<input type="time" value={f.hora_fin} onChange={set('hora_fin')} step={900} required /></label>
              </span>}
        </div>
        {info && <p className="nota">Pendiente de esta OP en {f.area.toLowerCase()}: <b>{fmtH(info.std)}</b> hombre{info.maqTotal ? <> · máquina: <b>{textoMaq(maquinas, info.maq)}</b></> : ''} · ya programado: <b>{fmtH(info.prog)}</b></p>}
        {f.orden_id && !info && <p className="nota">Esta OP no tiene trabajo pendiente en {f.area.toLowerCase()}.</p>}
        {modo === 'auto' && (
          <label>Horas hombre a programar
            <input className="input-cant" value={horasTxt} onChange={(e) => setHorasTxt(e.target.value)} inputMode="decimal" />
          </label>
        )}

        <div>
          <div className="etq-chips">Operarios (opcional; sin operarios queda abierto a toda el área{modo === 'auto' ? '. Con operarios, se usa la jornada libre de cada uno' : ''})</div>
          <div className="chips">
            {gente.map((p) => <button type="button" key={p.id} className={`chip-sel${f.personas.includes(p.id) ? ' sel' : ''}`} onClick={() => toggle(p.id)}>{p.nombre}</button>)}
            {!otroDia && otros.length > 0 && <button type="button" className="btn-link" onClick={() => setOtroDia(true)}>+ de otra área</button>}
            {otroDia && otros.map((p) => <button type="button" key={p.id} className="chip-sel" onClick={() => toggle(p.id)}>{p.nombre} <small>{p.area}</small></button>)}
          </div>
          {cruces.length > 0 && <Aviso tipo="warn">{cruces.map((id) => personas.find((p) => p.id === id)?.nombre).join(', ')} ya {cruces.length === 1 ? 'tiene' : 'tienen'} otro trabajo programado en ese horario. Si es un trabajo corto en simultáneo, puedes continuar.</Aviso>}
        </div>
        <label>Nota (opcional)<input value={f.nota || ''} onChange={set('nota')} placeholder="Ej. solo ítems 3 y 4 · cortar todo el material" /></label>

        {modo === 'auto' && plan && (
          <div className="previa-std">
            {plan.bloques.length === 0 ? <div className="tenue">No hay horas para programar.</div> : <>
              <div><b>Se programará en {plan.bloques.length} {plan.bloques.length === 1 ? 'bloque' : 'bloques'}</b>{ultimo && <> · termina el <b>{fmtFecha(ultimo)}</b></>}
                {op?.fecha_compromiso && ultimo > op.fecha_compromiso && <span className="t-mal"> · después de la entrega ({fmtFecha(op.fecha_compromiso)})</span>}</div>
              <ListaPlan bloques={plan.bloques} maquinas={maquinas} personas={personas} />
            </>}
          </div>
        )}

        <Aviso>{error}</Aviso>
        <div className="acciones">
          {f.id && <button type="button" className="btn-link peligro" onClick={() => eliminar(false)}>Quitar bloque</button>}
          {f.id && delGrupo > 1 && <button type="button" className="btn-link peligro" onClick={() => eliminar(true)}>Quitar los {delGrupo} bloques de esta programación</button>}
          {f.id && <button type="button" className="btn btn-sec" disabled={enviando} onClick={() => guardar(null, siguienteHabil())}>Copiar al {new Date(siguienteHabil() + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })}</button>}
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={enviando}>{f.id ? 'Guardar' : modo === 'auto' ? `Programar${plan?.bloques.length ? ` ${plan.bloques.length} bloques` : ''}` : 'Programar'}</button>
        </div>
      </form>
      )}
    </Modal>
  )
}
