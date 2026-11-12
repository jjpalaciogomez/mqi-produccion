import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEnVivo } from '../vivo.js'
import { jornadaMin } from '../planificador.js'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Cargando, Semaforo, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

// Indicadores de gerencia. Todo se calcula con los datos vivos y se actualiza cada minuto.
const AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA', 'INSTALACION']
const JORNADA_H = 8.5
const C = { serie1: '#2a78d6', serie2: '#eb6834', bien: '#1d8a4e', alerta: '#c98500', mal: '#c0392b', gris: '#9aa3ae' }
const hoyCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const PERIODOS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['mes', 'Este mes']]
const diaCO = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null)

export default function Indicadores({ perfil }) {
  const [periodo, setPeriodo] = useState('7')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [hora, setHora] = useState(null)
  const hoy = hoyCO()
  const desde = periodo === 'mes' ? hoy.slice(0, 8) + '01' : sumarDias(hoy, -(Number(periodo) - 1))

  const cargar = useCallback(async () => {
    try {
      const ini = `${desde}T00:00:00-05:00`
      const [ordenes, pendientes, regs, paros, personas, horas, desv, maq, procMaq] = await Promise.all([
        q(sb.from('v_ordenes').select('*')),
        q(sb.from('v_tareas').select('area, min_std, estado, bloqueada, op_estado, es_maquina, proceso, min_maquina, min_maquina_real').in('estado', ['pendiente', 'en_curso', 'pausada']).in('op_estado', ['borrador', 'en_planta']).neq('area', 'TERCEROS')),
        q(sb.from('registros').select('inicio, minutos, cantidad, persona_id, tareas(area, tiempo_std_unit, procesos(es_maquina))').is('motivo_pausa', null).not('minutos', 'is', null).gte('inicio', ini)),
        q(sb.from('paros').select('inicio, fin, minutos, persona_id, area, motivos_paro(descripcion)').gte('inicio', ini)),
        q(sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario')),
        q(sb.rpc('horas_personal', { p_desde: desde, p_hasta: hoy })),
        q(sb.from('v_estandar_producto').select('*')),
        q(sb.rpc('horas_maquina', { p_desde: desde, p_hasta: hoy })),
        q(sb.from('procesos').select('codigo, nombre, num_maquinas').eq('es_maquina', true).order('codigo')),
      ])
      setD({ ordenes, pendientes, regs: regs.filter((r) => r.tareas?.area !== 'TERCEROS'), paros, personas, horas, desv, maq, procMaq })
      setError(''); setHora(new Date())
    } catch (e) { setError(e.message) }
  }, [desde, hoy])
  useEffect(() => { setD(null); cargar() }, [cargar])
  useEnVivo(cargar, ['registros', 'paros', 'tareas', 'ordenes'], 60000)

  const k = useMemo(() => d && calcular(d, desde, hoy), [d, desde, hoy])

  return (
    <div className="ind">
      <div className="titulo-pagina">
        <div><h1>Indicadores</h1><div className="tenue pequeño">{hora ? `Actualizado ${hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo cada minuto` : ''}</div></div>
        <div className="titulo-acciones">
          <div className="segmentado">{PERIODOS.map(([v, t]) => <button key={v} className={periodo === v ? 'sel' : ''} onClick={() => setPeriodo(v)}>{t}</button>)}</div>
          <BotonAyuda clave="indicadores" rol={perfil?.rol} />
        </div>
      </div>
      <Aviso>{error}</Aviso>
      {!k ? <Cargando /> : <Tablero k={k} />}
    </div>
  )
}

function calcular(d, desde, hoy) {
  const activas = d.ordenes.filter((o) => ['borrador', 'en_planta'].includes(o.estado))
  const sem = { a_tiempo: 0, en_riesgo: 0, vencida: 0, sin_fecha: 0 }
  for (const o of activas) sem[o.semaforo] = (sem[o.semaforo] || 0) + 1
  const cerradas = d.ordenes.filter((o) => ['terminada', 'entregada'].includes(o.estado) && o.fecha_entrega_real && o.fecha_entrega_real >= desde)
  const cumplidas = cerradas.filter((o) => o.semaforo === 'cumplida').length

  // Carga pendiente por área y días de trabajo según el personal de cada área
  const carga = AREAS.map((a) => {
    const min = d.pendientes.filter((t) => t.area === a).reduce((s, t) => s + Number(t.min_std || 0), 0)
    const gente = d.personas.filter((p) => p.area === a).length
    return { area: a, min, gente, dias: gente ? min / 60 / (gente * JORNADA_H) : null }
  })
  const otras = d.pendientes.filter((t) => !AREAS.includes(t.area)).reduce((s, t) => s + Number(t.min_std || 0), 0)
  if (otras) carga.push({ area: 'OTRAS', min: otras, gente: 0, dias: null })

  // Eficiencia = minutos estándar de lo producido ÷ minutos reales registrados
  const ef = {}
  const efPersona = {}
  for (const r of d.regs) {
    if (r.tareas?.procesos?.es_maquina) continue // en máquinas el operario no mide tiempo: no entran en la eficiencia
    const a = r.tareas?.area || 'OTRAS'
    const std = Number(r.cantidad || 0) * Number(r.tareas?.tiempo_std_unit || 0)
    for (const [obj, key] of [[ef, a], [efPersona, r.persona_id]]) {
      const x = (obj[key] ||= { std: 0, real: 0, conCant: 0 })
      x.real += Number(r.minutos || 0)
      if (r.cantidad !== null && r.cantidad !== undefined) { x.std += std; x.conCant += Number(r.minutos || 0) }
    }
  }
  const efArea = AREAS.map((a) => ({ area: a, ...(ef[a] || { std: 0, real: 0, conCant: 0 }) })).filter((x) => x.real > 0)
  const efTotal = Object.values(ef).reduce((s, x) => ({ std: s.std + x.std, conCant: s.conCant + x.conCant }), { std: 0, conCant: 0 })

  // Horas por día: tareas y paros
  const dias = []
  for (let f = desde; f <= hoy; f = sumarDias(f, 1)) dias.push(f)
  const porDia = dias.map((f) => {
    const h = d.horas.filter((x) => x.fecha === f)
    return { f, tareas: h.reduce((s, x) => s + Number(x.min_tareas), 0), paros: h.reduce((s, x) => s + Number(x.min_paros), 0) }
  })
  const minTareas = porDia.reduce((s, x) => s + x.tareas, 0), minParos = porDia.reduce((s, x) => s + x.paros, 0)

  // Máquinas: horas pendientes (estándar) y horas trabajadas en el periodo frente a la jornada
  const minHabiles = dias.reduce((s, f) => s + jornadaMin(f), 0)
  const maquinas = d.procMaq.map((p) => {
    const pend = d.pendientes.filter((t) => t.proceso === p.codigo).reduce((s, t) => s + Math.max(Number(t.min_maquina || 0) - Number(t.min_maquina_real || 0), 0), 0)
    const hecho = d.maq.filter((x) => x.proceso === p.codigo).reduce((s, x) => s + Number(x.min_maquina || 0), 0)
    return { ...p, pend, hecho, uso: minHabiles ? pct(hecho, minHabiles * Math.max(1, Number(p.num_maquinas) || 1)) : null }
  })

  // Paros por motivo
  const motivos = {}
  for (const p of d.paros) {
    const m = p.minutos ?? (p.fin ? (new Date(p.fin) - new Date(p.inicio)) / 60000 : 0)
    const k = p.motivos_paro?.descripcion || 'Sin motivo'
    motivos[k] = (motivos[k] || 0) + Number(m || 0)
  }
  const paros = Object.entries(motivos).map(([motivo, min]) => ({ motivo, min })).sort((a, b) => b.min - a.min)

  // Personas
  const personas = d.personas.map((p) => {
    const h = d.horas.filter((x) => x.persona_id === p.id)
    const t = h.reduce((s, x) => s + Number(x.min_tareas), 0), pa = h.reduce((s, x) => s + Number(x.min_paros), 0)
    const e = efPersona[p.id]
    return { ...p, t, pa, total: t + pa, ef: e && e.conCant > 0 ? pct(e.std, e.conCant) : null, diasCon: new Set(h.map((x) => x.fecha)).size }
  }).sort((a, b) => b.total - a.total)

  // OPs más urgentes
  const orden = { vencida: 0, en_riesgo: 1, a_tiempo: 2, sin_fecha: 3 }
  const urgentes = [...activas].sort((a, b) => (orden[a.semaforo] - orden[b.semaforo]) || String(a.fecha_compromiso || '9').localeCompare(String(b.fecha_compromiso || '9'))).slice(0, 8)

  const desv = d.desv.filter((x) => x.tareas_medidas > 0).map((x) => ({ ...x, dif: (Number(x.razon) - 1) * 100 })).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 6)

  return {
    activas: activas.length, sem, cerradas: cerradas.length, cumplidas, carga, efArea, efTotal: efTotal.conCant ? pct(efTotal.std, efTotal.conCant) : null,
    porDia, minTareas, minParos, paros, personas, urgentes, desv, maquinas,
    pendienteTotal: carga.reduce((s, x) => s + x.min, 0),
  }
}

// ---------- Presentación ----------
function Tablero({ k }) {
  const tonoEf = (v) => (v === null ? 'gris' : v >= 90 ? 'bien' : v >= 75 ? 'alerta' : 'mal')
  const pctParos = pct(k.minParos, k.minTareas + k.minParos)
  const pctCumpl = pct(k.cumplidas, k.cerradas)
  return (
    <>
      <div className="ind-tiles">
        <Tile titulo="OPs en curso" valor={k.activas} detalle={<span className="mini-sem">
          <Chip tono="mal" n={k.sem.vencida} t="vencidas" /><Chip tono="alerta" n={k.sem.en_riesgo} t="en riesgo" /><Chip tono="bien" n={k.sem.a_tiempo} t="a tiempo" /></span>} />
        <Tile titulo="Entregas a tiempo" valor={pctCumpl === null ? '—' : `${pctCumpl}%`} tono={pctCumpl === null ? 'gris' : pctCumpl >= 90 ? 'bien' : pctCumpl >= 70 ? 'alerta' : 'mal'}
          detalle={k.cerradas ? `${k.cumplidas} de ${k.cerradas} OPs cerradas en el periodo` : 'Ninguna OP cerrada en el periodo'} />
        <Tile titulo="Eficiencia de planta" valor={k.efTotal === null ? '—' : `${k.efTotal}%`} tono={tonoEf(k.efTotal)}
          detalle="Tiempo estándar de lo producido ÷ tiempo real. 100% = al estándar" />
        <Tile titulo="Horas registradas" valor={fmtMin(k.minTareas + k.minParos)} detalle={`${fmtMin(k.minTareas)} en tareas · ${fmtMin(k.minParos)} en paros`} />
        <Tile titulo="Tiempo en paros" valor={pctParos === null ? '—' : `${pctParos}%`} tono={pctParos === null ? 'gris' : pctParos <= 10 ? 'bien' : pctParos <= 20 ? 'alerta' : 'mal'}
          detalle="del tiempo registrado" />
        <Tile titulo="Trabajo pendiente" valor={fmtMin(k.pendienteTotal)} detalle="tiempo estándar de los pasos que faltan" />
      </div>

      <div className="ind-grid">
        <Panel titulo="Carga pendiente por área" sub="Horas estándar que faltan y días de trabajo con el personal actual">
          <BarrasH filas={k.carga.map((c) => ({
            etiqueta: c.area, valor: c.min / 60, texto: `${fmtNum(c.min / 60, 1)} h`,
            extra: c.dias === null ? (c.min ? 'sin personal' : '') : `${fmtNum(c.dias, 1)} días · ${c.gente} pers.`,
            color: c.dias !== null && c.dias > 5 ? C.mal : c.dias !== null && c.dias > 3 ? C.alerta : C.serie1,
          }))} vacio="No hay trabajo pendiente." />
          <Leyenda items={[[C.serie1, 'Hasta 3 días'], [C.alerta, '3 a 5 días'], [C.mal, 'Más de 5 días']]} />
        </Panel>

        <Panel titulo="Eficiencia por área" sub="Estándar de lo producido ÷ tiempo real (línea = 100%)">
          <BarrasH max={Math.max(130, ...k.efArea.map((x) => pct(x.std, x.conCant) || 0))} meta={100}
            filas={k.efArea.map((x) => {
              const v = pct(x.std, x.conCant)
              return { etiqueta: x.area, valor: v || 0, texto: v === null ? 'sin cantidades' : `${v}%`, extra: `${fmtMin(x.real)} reales`, color: C[tonoEf(v)] }
            })} vacio="Aún no hay registros con cantidad en el periodo." />
          <Leyenda items={[[C.bien, '90% o más'], [C.alerta, '75–89%'], [C.mal, 'Menos de 75%']]} />
        </Panel>

        <Panel titulo="Máquinas" sub="Horas de máquina pendientes y uso en el periodo (no son horas del personal)">
          <BarrasH filas={k.maquinas.map((m) => ({
            etiqueta: m.nombre, valor: m.pend / 60, texto: `${fmtNum(m.pend / 60, 1)} h pendientes`,
            extra: `${fmtNum(m.hecho / 60, 1)} h trabajadas${m.uso !== null ? ` · uso ${m.uso}%` : ''}`, color: C.serie1,
          }))} vacio="No hay trabajo de máquina pendiente." />
          {k.maquinas.length > 0 && k.maquinas.every((m) => !m.pend) && <div className="tenue pequeño">{k.maquinas.map((m) => `${m.nombre.toLowerCase()}: ${fmtNum(m.hecho / 60, 1)} h trabajadas`).join(' · ')}</div>}
        </Panel>

        <Panel titulo="Horas registradas por día" sub="Tareas y paros de todo el personal" ancho>
          <Columnas dias={k.porDia} />
          <Leyenda items={[[C.serie1, 'Tareas'], [C.serie2, 'Paros']]} />
        </Panel>

        <Panel titulo="Paros por motivo" sub="Horas perdidas en el periodo">
          <BarrasH filas={k.paros.slice(0, 8).map((p) => ({ etiqueta: p.motivo, valor: p.min / 60, texto: fmtMin(p.min), color: C.serie2 }))} vacio="Sin paros registrados en el periodo." />
        </Panel>

        <Panel titulo="Desviación por producto" sub="Real frente al estándar en pasos terminados (todo el historial)">
          {k.desv.length === 0 ? <div className="ind-vacio">Aún no hay pasos terminados para comparar.</div> : (
            <Divergente filas={k.desv.map((x) => ({ etiqueta: `${x.producto} · ${x.area}`, valor: x.dif, extra: `${x.tareas_medidas} pasos` }))} />
          )}
        </Panel>

        <Panel titulo="OPs que requieren atención" sub="Ordenadas por urgencia" ancho>
          {k.urgentes.length === 0 ? <div className="ind-vacio">No hay OPs activas.</div> : (
            <table className="tabla ind-tabla">
              <thead><tr><th>OP</th><th>Proyecto</th><th>Entrega</th><th>Cumplimiento</th><th style={{ width: '30%' }}>Avance</th></tr></thead>
              <tbody>{k.urgentes.map((o) => (
                <tr key={o.id} onClick={() => { location.hash = `#/op/${o.id}` }} className="clic">
                  <td><b>{o.numero}</b></td>
                  <td><div className="tab-proyecto">{o.proyecto}</div><div className="tab-cliente">{o.cliente}</div></td>
                  <td>{fmtFecha(o.fecha_compromiso)}</td>
                  <td><Semaforo valor={o.semaforo} /></td>
                  <td><Progreso v={Number(o.avance_pct) || 0} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>

        <Panel titulo="Personal en el periodo" sub="Horas registradas, paros y eficiencia por persona" ancho>
          <table className="tabla ind-tabla">
            <thead><tr><th>Persona</th><th>Área</th><th style={{ width: '34%' }}>Horas registradas</th><th>Paros</th><th>Eficiencia</th><th>Días con registro</th></tr></thead>
            <tbody>{k.personas.map((p) => {
              const maxH = Math.max(...k.personas.map((x) => x.total), 1)
              return (
                <tr key={p.id}>
                  <td><b>{p.nombre}</b></td><td>{p.area}</td>
                  <td><div className="barra-inline"><i style={{ width: `${(100 * p.t) / maxH}%`, background: C.serie1 }} /><i style={{ width: `${(100 * p.pa) / maxH}%`, background: C.serie2 }} /><span>{fmtMin(p.total)}</span></div></td>
                  <td>{p.pa ? fmtMin(p.pa) : '—'}</td>
                  <td>{p.ef === null ? '—' : <span className={`ind-num t-${tonoEf(p.ef)}`}>{p.ef}%</span>}</td>
                  <td>{p.diasCon}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </Panel>
      </div>
      <p className="nota">Eficiencia: se calcula con los registros que tienen cantidad (minutos estándar de las unidades hechas ÷ minutos registrados). Los registros de "todo el proyecto" sin terminar no traen cantidad y no entran en la eficiencia. Días de carga: horas pendientes ÷ (personas del área × 8,5 h). Los procesos de máquina no entran en la eficiencia: al operario se le abona el montaje estándar; las horas de máquina salen del rendimiento y el uso se compara con la jornada del periodo.</p>
    </>
  )
}

const Tile = ({ titulo, valor, detalle, tono }) => (
  <div className={`ind-tile${tono ? ` t-${tono}` : ''}`}>
    <span className="ind-tile-tit">{titulo}</span>
    <b className="ind-tile-val">{valor}</b>
    {detalle && <span className="ind-tile-det">{detalle}</span>}
  </div>
)
const Chip = ({ tono, n, t }) => <span className={`chip t-${tono}`}>{n} {t}</span>
const Panel = ({ titulo, sub, children, ancho }) => (
  <section className={`ind-panel${ancho ? ' ancho' : ''}`}>
    <h3>{titulo}</h3>{sub && <div className="ind-sub">{sub}</div>}
    {children}
  </section>
)
const Leyenda = ({ items }) => <div className="ind-leyenda">{items.map(([c, t]) => <span key={t}><i style={{ background: c }} />{t}</span>)}</div>
const Progreso = ({ v }) => <div className="ind-prog"><i style={{ width: `${Math.min(v, 100)}%` }} /><span>{v}%</span></div>

function BarrasH({ filas, max, meta, vacio }) {
  if (!filas.length || filas.every((f) => !f.valor)) return <div className="ind-vacio">{vacio}</div>
  const m = max || Math.max(...filas.map((f) => f.valor), 1)
  return (
    <div className="barrash">
      {filas.map((f) => (
        <div key={f.etiqueta} className="bh-fila" title={`${f.etiqueta}: ${f.texto}${f.extra ? ' · ' + f.extra : ''}`}>
          <span className="bh-et">{f.etiqueta}</span>
          <div className="bh-pista">
            <i style={{ width: `${Math.max((100 * f.valor) / m, f.valor ? 1.5 : 0)}%`, background: f.color }} />
            {meta && <em style={{ left: `${(100 * meta) / m}%` }} />}
          </div>
          <span className="bh-val"><b>{f.texto}</b>{f.extra && <small>{f.extra}</small>}</span>
        </div>
      ))}
    </div>
  )
}

function Columnas({ dias }) {
  const max = Math.max(...dias.map((x) => x.tareas + x.paros), 60)
  const corto = dias.length > 14
  return (
    <div className="columnas">
      <div className="col-ejes">
        {dias.map((x) => {
          const tot = x.tareas + x.paros
          const dt = new Date(x.f + 'T12:00:00')
          return (
            <div key={x.f} className="col" title={`${dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}: ${fmtMin(x.tareas)} en tareas · ${fmtMin(x.paros)} en paros`}>
              <span className="col-val">{tot ? fmtNum(tot / 60, 0) : ''}</span>
              <div className="col-barra">
                <i style={{ height: `${(100 * x.paros) / max}%`, background: C.serie2 }} />
                <i style={{ height: `${(100 * x.tareas) / max}%`, background: C.serie1 }} />
              </div>
              <span className="col-et">{corto ? dt.getDate() : `${dt.toLocaleDateString('es-CO', { weekday: 'short' }).slice(0, 3)} ${dt.getDate()}`}</span>
            </div>
          )
        })}
      </div>
      <div className="tenue pequeño">Número sobre cada columna: horas totales del día.</div>
    </div>
  )
}

function Divergente({ filas }) {
  const m = Math.max(...filas.map((f) => Math.abs(f.valor)), 25)
  return (
    <div className="divergente">
      <div className="dv-cab"><span>Más rápido que el estándar</span><span>Más lento que el estándar</span></div>
      {filas.map((f) => (
        <div key={f.etiqueta} className="dv-fila" title={`${f.etiqueta}: ${f.valor > 0 ? '+' : ''}${fmtNum(f.valor, 0)}% · ${f.extra}`}>
          <span className="bh-et">{f.etiqueta}</span>
          <div className="dv-pista">
            <div className="dv-mitad izq">{f.valor < 0 && <i style={{ width: `${(100 * -f.valor) / m}%`, background: C.bien }} />}</div>
            <div className="dv-mitad der">{f.valor > 0 && <i style={{ width: `${(100 * f.valor) / m}%`, background: C.mal }} />}</div>
          </div>
          <span className="bh-val"><b>{f.valor > 0 ? '+' : ''}{fmtNum(f.valor, 0)}%</b><small>{f.extra}</small></span>
        </div>
      ))}
    </div>
  )
}
