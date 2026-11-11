import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Modal, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { DIF_NOMBRE, calcMaquina, textoMedidas, unidadProc } from '../estandar.js'
import { BarraFechas, hoyCO, lunesDe, sumarDias, useProgramacion } from './Programacion.jsx'

// Pantalla de la tablet de un área. Muestra las tareas de su área y de Pintura
// (Pintura no tiene tablet propia). El operario toca su nombre y escribe cuánto trabajó.

// Jornada en minutos según el día (hora de Colombia): lunes a jueves 8,5 h, viernes 8 h
const jornadaHoy = () => {
  const dia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getDay()
  return dia === 5 ? 480 : dia >= 1 && dia <= 4 ? 510 : 0
}

export default function Tablet({ perfil }) {
  const area = perfil.area
  const areas = area ? [...new Set([area, 'PINTURA', 'INSTALACION'])] : null
  const [tareas, setTareas] = useState(null)
  const [personas, setPersonas] = useState([])
  const [motivos, setMotivos] = useState([])
  const [maquinas, setMaquinas] = useState({})
  const [hoyProg, setHoyProg] = useState([])
  const [esperas, setEsperas] = useState({}) // OP → pasos de otras áreas que faltan antes
  const [verOtros, setVerOtros] = useState(false)
  const [error, setError] = useState('')
  const [vista, setVista] = useState({ nivel: 'ops' }) // ops → op → item
  const [accion, setAccion] = useState(null) // {tipo: 'registrar'|'proyecto'|'paro'|'elegir', ...}
  const [msg, setMsg] = useState('')
  const [hora, setHora] = useState(new Date())

  const cargar = useCallback(async () => {
    try {
      let c = sb.from('v_tareas').select('*').in('estado', ['pendiente', 'en_curso', 'pausada', 'terminada'])
        .in('op_estado', ['borrador', 'en_planta']).neq('area', 'TERCEROS').order('paso').order('creado')
      if (areas) c = c.in('area', areas)
      let cp = sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario').order('nombre')
      if (areas) cp = cp.in('area', areas)
      let cpr = sb.from('programacion').select('orden_id, area, hora_inicio, hora_fin, personas, nota').eq('fecha', hoyCO()).order('hora_inicio')
      if (areas) cpr = cpr.in('area', areas)
      const [t, p, m, mq, pr] = await Promise.all([q(c), q(cp), q(sb.from('motivos_paro').select('*').eq('activo', true).order('codigo')),
        q(sb.from('procesos').select('codigo, nombre, unidad, rendimiento, capacidad_ciclo, min_montaje').eq('es_maquina', true)), q(cpr)])
      // Las OPs ocultas no salen en la tablet
      const ocultas = new Set((await q(sb.from('ordenes').select('id').gt('oculta_hasta', hoyCO()))).map((o) => o.id))
      // Qué pasos de otras áreas tienen esperando lo programado hoy (p. ej. el corte láser antes de acrílico)
      const idsProg = [...new Set(pr.map((b) => b.orden_id))]
      const esp = {}
      if (idsProg.length && areas) {
        const otrasTs = await q(sb.from('v_tareas').select('orden_id, item_id, componente_id, paso, area, proceso, proceso_nombre, estado').in('orden_id', idsProg).not('area', 'in', `(${areas.map((a) => `"${a}"`).join(',')})`).not('estado', 'in', '(terminada,omitida)'))
        for (const x of t.filter((x) => x.estado === 'pendiente' && x.bloqueada && idsProg.includes(x.orden_id))) {
          const antes = otrasTs.filter((y) => x.componente_id ? y.componente_id === x.componente_id && y.paso < x.paso : y.item_id === x.item_id && y.componente_id)
          ;(esp[x.orden_id] ||= []).push(...antes)
        }
      }
      setEsperas(esp)
      setHoyProg(pr); setTareas(t.filter((x) => !ocultas.has(x.orden_id))); setPersonas(p); setMotivos(m); setMaquinas(Object.fromEntries(mq.map((x) => [x.codigo, x]))); setError('')
    } catch (e) { setError(`Sin conexión con el sistema: ${e.message}`) }
  }, [area]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t) }, [cargar])
  useEffect(() => { const t = setInterval(() => setHora(new Date()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(t) }, [msg])

  const ops = useMemo(() => {
    const activa = (t) => ['en_curso', 'pausada'].includes(t.estado) || (t.estado === 'pendiente' && !t.bloqueada)
    const g = {}
    for (const t of tareas || []) {
      const o = (g[t.orden_id] ||= { id: t.orden_id, numero: t.op_numero, cliente: t.cliente, proyecto: t.proyecto, prioridad: t.prioridad, fecha: t.fecha_compromiso, tareas: [] })
      o.tareas.push(t)
    }
    return Object.values(g).filter((o) => o.tareas.some((t) => t.estado !== 'terminada'))
      .map((o) => ({ ...o, activa: o.tareas.some(activa) }))
      .sort((a, b) => (a.prioridad - b.prioridad) || String(a.fecha || '9').localeCompare(String(b.fecha || '9')))
  }, [tareas])
  // Lo programado para hoy va primero (en orden de hora); lo demás queda detrás de "Ver otros proyectos"
  const progDe = (id) => hoyProg.filter((b) => b.orden_id === id)
  // Lo programado hoy sale aunque esté esperando un paso de otra área (se dice cuál); lo demás, solo si hay algo para hacer
  const programadas = ops.filter((o) => progDe(o.id).length).sort((a, b) => progDe(a.id)[0].hora_inicio.localeCompare(progDe(b.id)[0].hora_inicio))
  const otras = ops.filter((o) => !progDe(o.id).length && o.activa)
  const textoEspera = (o) => {
    if (o.activa) return ''
    const ns = [...new Set((esperas[o.id] || []).map((t) => `${(t.proceso_nombre || t.proceso || '').toLowerCase()} (${t.area.toLowerCase()})`))]
    return ns.length ? `Esperando: ${ns.join(', ')}` : 'Esperando pasos anteriores'
  }
  const textoProg = (id) => progDe(id).map((b) => {
    const quien = (b.personas || []).map((x) => personas.find((p) => p.id === x)?.nombre.split(' ')[0]).filter(Boolean)
    return `${b.hora_inicio.slice(0, 5)}–${b.hora_fin.slice(0, 5)}${areas && b.area !== area ? ` ${b.area.toLowerCase()}` : ''}${quien.length ? ` · ${quien.join(', ')}` : ''}`
  }).join(' | ')
  const op = vista.opId ? ops.find((o) => o.id === vista.opId) : null
  const items = useMemo(() => {
    if (!op) return []
    const g = {}
    for (const t of op.tareas) (g[t.item_id] ||= { id: t.item_id, numero: t.item_numero, descripcion: t.item_descripcion, tareas: [] }).tareas.push(t)
    return Object.values(g).sort((a, b) => a.numero - b.numero)
  }, [op])
  const item = vista.itemId ? items.find((i) => i.id === vista.itemId) : null

  // Si la OP o el ítem ya no tienen nada, vuelve atrás
  useEffect(() => {
    if (tareas === null) return
    if (vista.opId && !op) setVista({ nivel: 'ops' })
    else if (vista.itemId && !item) setVista({ nivel: 'op', opId: vista.opId })
  }, [tareas, op, item, vista])

  return (
    <div className="tablet">
      <header className="tablet-cab">
        <div className="tablet-marca"><img src="./logo-mqi.png" alt="MQI" className="logo" /><div><div className="tablet-area">{area ? `Tablet ${area}` : 'Tablet de planta'}</div>
          <div className="tenue-claro">{hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div></div></div>
        <div className="tablet-botones">
          <button className="btn btn-sec" onClick={() => setVista({ nivel: 'calendario' })}>Programación</button>
          <button className="btn btn-paro" onClick={() => setAccion({ tipo: 'paro' })}>Registrar paro</button>
          <button className="btn btn-sec" onClick={cargar}>Actualizar</button>
          <BotonAyuda clave="tablet" rol="tablet" etiqueta="¿Cómo registro?" claro />
        </div>
      </header>

      {msg && <div className="toast">{msg}</div>}
      <Aviso>{error}</Aviso>

      <nav className="migas">
        <button className={vista.nivel === 'ops' ? 'sel' : ''} onClick={() => setVista({ nivel: 'ops' })}>Proyectos en planta</button>
        {op && <><span>›</span><button className={vista.nivel === 'op' ? 'sel' : ''} onClick={() => setVista({ nivel: 'op', opId: op.id })}>OP {op.numero}</button></>}
        {item && <><span>›</span><button className="sel">Ítem {item.numero}</button></>}
        {vista.nivel === 'calendario' && <><span>›</span><button className="sel">Programación</button></>}
      </nav>

      {vista.nivel === 'calendario' && <CalendarioTablet areas={areas} tareas={tareas} personas={personas} />}

      {vista.nivel === 'ops' && (
        tareas === null ? <div className="vacio">Cargando…</div> : ops.length === 0 ? <div className="vacio">No hay proyectos con tareas para esta área.</div> : (
          <>
            <h2 className="tablet-h2">Programado para hoy</h2>
            {programadas.length === 0
              ? <div className="vacio">No hay proyectos programados hoy para esta área. Toca "Ver otros proyectos" si necesitas registrar algo.</div>
              : <div className="tarjetas">
                  {programadas.map((o) => <TarjetaGrupo key={o.id} titulo={`OP ${o.numero}`} sup={o.cliente} sub={`${o.proyecto} · entrega ${fmtFecha(o.fecha)}`}
                    prog={textoProg(o.id)} espera={textoEspera(o)} ts={o.tareas} onClick={() => setVista({ nivel: 'op', opId: o.id })} />)}
                </div>}
            {otras.length > 0 && (
              <button className="btn btn-sec btn-grande ver-otros" onClick={() => setVerOtros(!verOtros)}>
                {verOtros ? 'Ocultar otros proyectos' : `Ver otros proyectos (${otras.length}) · no programados hoy`}</button>
            )}
            {verOtros && (
              <div className="tarjetas otros">
                {otras.map((o) => <TarjetaGrupo key={o.id} titulo={`OP ${o.numero}`} sup={o.cliente} sub={`${o.proyecto} · entrega ${fmtFecha(o.fecha)}`}
                  ts={o.tareas} onClick={() => setVista({ nivel: 'op', opId: o.id })} />)}
              </div>
            )}
          </>
        )
      )}

      {vista.nivel === 'op' && op && (
        <section>
          <div className="tablet-tit">
            <h2 className="tablet-h2">OP {op.numero} · {op.proyecto}<span className="tablet-cliente">{op.cliente}</span></h2>
            <button className="btn btn-grande btn-sec" onClick={() => setAccion({ tipo: 'elegir', op })}>Registrar un proceso de todo el proyecto</button>
          </div>
          <p className="tenue">Elige el ítem en el que trabajaste.</p>
          <div className="tarjetas">
            {items.map((i) => <TarjetaGrupo key={i.id} titulo={i.descripcion} sup={`Ítem ${i.numero}`} ts={i.tareas} grande
              onClick={() => setVista({ nivel: 'item', opId: op.id, itemId: i.id })} />)}
          </div>
        </section>
      )}

      {vista.nivel === 'item' && item && (
        <section>
          <h2 className="tablet-h2 item-tit"><small>Ítem {item.numero}</small>{item.descripcion}</h2>
          <p className="tenue">Toca "Registrar" en el proceso en el que trabajaste. Los procesos de máquina solo se marcan como avanzados o listos.</p>
          <ListaProcesos ts={item.tareas} onRegistrar={(t) => setAccion({ tipo: 'registrar', tarea: t })}
            onMaquina={(t) => setAccion({ tipo: 'maquina', lista: [t], nombre: t.proceso_nombre, proceso: t.proceso })} />
        </section>
      )}

      <footer className="tablet-pie">
        <span>MQI Producción</span>
        <button className="btn-link" onClick={() => sb.auth.signOut()}>Cerrar sesión de la tablet</button>
      </footer>

      {accion?.tipo === 'elegir' && (
        <ElegirProceso op={accion.op} onClose={() => setAccion(null)} onElegir={(proceso, lista) => setAccion(
          lista[0]?.es_maquina ? { tipo: 'maquina', lista, nombre: proceso.nombre, proceso: proceso.proceso, op: accion.op }
            : { tipo: 'proyecto', op: accion.op, proceso, lista })} />
      )}
      {accion?.tipo === 'maquina' && (
        <FlujoMaquina accion={accion} maquina={maquinas[accion.proceso]} personas={personas} onClose={() => setAccion(null)}
          onHecho={(texto) => { setAccion(null); setMsg(texto); cargar() }} />
      )}
      {accion && !['elegir', 'maquina'].includes(accion.tipo) && (
        <FlujoRegistro accion={accion} personas={personas} motivos={motivos}
          onClose={() => setAccion(null)}
          onHecho={(texto) => { setAccion(null); setMsg(texto); cargar() }} />
      )}
    </div>
  )
}

function contar(ts) {
  return {
    proceso: ts.filter((t) => ['en_curso', 'pausada'].includes(t.estado)).length,
    listas: ts.filter((t) => t.estado === 'pendiente' && !t.bloqueada).length,
    espera: ts.filter((t) => t.estado === 'pendiente' && t.bloqueada).length,
    hechas: ts.filter((t) => t.estado === 'terminada').length,
  }
}

// Programación para la tablet: agenda en lista (más clara que la vista por horas cuando hay varios trabajos a la vez)
const NOTAS_SISTEMA = ['Reorganizada para cumplir entregas']
function CalendarioTablet({ areas, tareas, personas }) {
  const [modo, setModo] = useState('dia')
  const [dia, setDia] = useState(hoyCO())
  const lunes = lunesDe(dia)
  const desde = modo === 'semana' ? lunes : dia
  const hasta = modo === 'semana' ? sumarDias(lunes, 5) : dia
  const { d, error } = useProgramacion(desde, hasta, areas)
  const dias = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f)
  const perPorId = Object.fromEntries([...(d?.personas || []), ...personas].map((p) => [p.id, p]))
  // Qué falta hacer de esa OP en esa área (procesos no terminados)
  const queHacer = (b) => {
    const ts = (tareas || []).filter((t) => t.orden_id === b.orden_id && t.area === b.area && !['terminada', 'omitida'].includes(t.estado))
    const g = {}
    for (const t of ts) {
      const k = t.proceso_nombre || t.proceso
      const x = (g[k] ||= { nombre: k, maquina: t.es_maquina, items: new Set() })
      x.items.add(t.item_numero)
    }
    return Object.values(g)
  }
  return (
    <section>
      <BarraFechas vista={modo} setVista={setModo} dia={dia} setDia={setDia} />
      <Aviso>{error}</Aviso>
      {!d ? <div className="vacio">Cargando…</div> : dias.map((f) => {
        const bs = d.bloques.filter((b) => b.fecha === f).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || String(a.ordenes?.numero).localeCompare(String(b.ordenes?.numero)))
        if (modo === 'semana' && !bs.length && new Date(f + 'T12:00:00').getDay() === 6) return null
        return (
          <div key={f} className="agenda-dia">
            {modo === 'semana' && <h3 className="agenda-fecha">{new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>}
            {bs.length === 0 ? <div className="vacio">Nada programado.</div> : (
              <div className="agenda-lista">
                {bs.map((b) => {
                  const hacer = queHacer(b)
                  const quien = (b.personas || []).map((id) => perPorId[id]?.nombre.split(' ')[0]).filter(Boolean)
                  const nota = b.nota && !NOTAS_SISTEMA.includes(b.nota) ? b.nota : null
                  return (
                    <div key={b.id} className="agenda-item">
                      <div className="agenda-hora">{b.hora_inicio.slice(0, 5)}<span>a {b.hora_fin.slice(0, 5)}</span></div>
                      <div className="agenda-cuerpo">
                        <div className="agenda-op"><b>OP {b.ordenes?.numero}</b> {b.ordenes?.proyecto}
                          {areas && areas.length > 1 && b.area !== areas[0] && <span className="etq">{b.area.toLowerCase()}</span>}</div>
                        {hacer.length > 0
                          ? <div className="agenda-hacer">{hacer.map((h) => <span key={h.nombre} className={`chip-proc${h.maquina ? ' maq' : ''}`}>{h.maquina ? '⚙ ' : ''}{h.nombre.toLowerCase()}<small> · ítem {[...h.items].sort((x, y) => x - y).join(', ')}</small></span>)}</div>
                          : <div className="tenue pequeño">Sin procesos pendientes en esta área</div>}
                        {(quien.length > 0 || nota) && <div className="agenda-extra">{quien.length > 0 && <span>👤 {quien.join(', ')}</span>}{nota && <span>📝 {nota}</span>}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function TarjetaGrupo({ titulo, sup, sub, prog, espera, ts, onClick, grande }) {
  const c = contar(ts)
  return (
    <button className={`tarea tarea-grupo${grande ? ' grupo-item' : ''}`} onClick={onClick}>
      <div className="tarea-op">{sup}</div>
      <div className="tarea-proceso">{titulo}</div>
      {sub && <div className="tarea-det">{sub}</div>}
      {prog && <div className="tarea-prog">🕒 {prog}</div>}
      {espera && <div className="tarea-espera">⏳ {espera}</div>}
      <div className="grupo-cuentas">
        {c.proceso > 0 && <span className="badge badge-info">{c.proceso} en proceso</span>}
        {c.listas > 0 && <span className="badge badge-ok">{c.listas} listas</span>}
        {c.espera > 0 && <span className="badge badge-muted">{c.espera} en espera</span>}
        {c.hechas > 0 && <span className="badge badge-muted">{c.hechas} terminadas</span>}
      </div>
    </button>
  )
}

function ListaProcesos({ ts, onRegistrar, onMaquina }) {
  const grupos = {}
  for (const t of ts) (grupos[t.componente_id || 'ens'] ||= []).push(t)
  return Object.entries(grupos).map(([k, lista]) => {
    const t0 = lista[0]
    return (
      <div key={k} className="tarjeta grupo-producto">
        <div className="grupo-cab">
          {t0.componente_id ? <><b>{t0.producto}</b> {t0.producto_nombre}
            <span className="tenue"> · {textoMedidas(t0.medida, t0.ancho, t0.profundidad, t0.alto) || 'ver plano'} · dificultad {DIF_NOMBRE[t0.dificultad]?.toLowerCase()}{t0.componente_detalle ? ` · ${t0.componente_detalle}` : ''}</span></>
            : <b>Ensamble final del ítem</b>}
        </div>
        {lista.map((t) => {
          const hecha = t.estado === 'terminada'
          const espera = t.estado === 'pendiente' && t.bloqueada
          return (
            <div key={t.id} className={`fila-proceso${hecha ? ' hecha' : ''}${espera ? ' espera' : ''}${t.es_maquina ? ' maquina' : ''}`}>
              {t.es_maquina ? (
                <div>
                  <div className="tarea-proceso">{hecha ? '✓ ' : t.estado === 'en_curso' ? '◐ ' : '☐ '}{t.proceso_nombre} <span className="etq etq-maq">máquina</span></div>
                  <div className="tarea-det">
                    {fmtNum(t.cant_proceso, 2)} {unidadProc(t.unidad_proceso)} · {t.ciclos} {t.ciclos === 1 ? 'montaje' : 'montajes'}
                    {t.estado === 'en_curso' && ' · avanzado'}{hecha && ' · listo'}{espera && ' · espera el paso anterior'}
                  </div>
                </div>
              ) : (
              <div>
                <div className="tarea-proceso">{hecha ? '✓ ' : ''}{t.proceso_nombre}{t.area === 'PINTURA' ? ' · Pintura' : t.area === 'INSTALACION' ? ' · Instalación' : ''}</div>
                <div className="tarea-det">
                  {fmtNum(t.cantidad, 2)} und
                  {Number(t.min_reales) > 0 && <> · registrado <b>{fmtMin(t.min_reales)}</b>{Number(t.cantidad_registrada) > 0 && ` · hecho ${fmtNum(t.cantidad_registrada, 2)} de ${fmtNum(t.cantidad, 2)}`}</>}
                  {espera && ' · espera el paso anterior'}
                </div>
              </div>
              )}
              {!hecha && !espera && (t.es_maquina
                ? <button className="btn btn-grande btn-sec" onClick={() => onMaquina(t)}>Marcar</button>
                : <button className="btn btn-grande" onClick={() => onRegistrar(t)}>Registrar</button>)}
            </div>
          )
        })}
      </div>
    )
  })
}

// Procesos disponibles en la OP para registrar de una vez en todo el proyecto
function ElegirProceso({ op, onClose, onElegir }) {
  const g = {}
  for (const t of op.tareas) {
    if (!t.proceso || !(['en_curso', 'pausada'].includes(t.estado) || (t.estado === 'pendiente' && !t.bloqueada))) continue
    ;(g[t.proceso] ||= { proceso: t.proceso, nombre: t.proceso_nombre, area: t.area, lista: [] }).lista.push(t)
  }
  const procesos = Object.values(g).sort((a, b) => b.lista.length - a.lista.length)
  return (
    <Modal titulo={`OP ${op.numero} · proceso de todo el proyecto`} onClose={onClose} ancho={640}>
      <p className="tenue">Úsalo cuando hiciste un proceso para todo el proyecto de una vez (por ejemplo, el corte de todo el material).
        El tiempo se reparte entre los ítems según su tiempo estándar.</p>
      {procesos.length === 0 ? <p>No hay procesos disponibles ahora en este proyecto.</p> : (
        <div className="personas">
          {procesos.map((p) => (
            <button key={p.proceso} className="persona" onClick={() => onElegir(p, p.lista)}>
              {p.nombre}<span>{p.area} · {p.lista.length} {p.lista.length === 1 ? 'tarea' : 'tareas'}{p.lista[0].es_maquina ? ' · máquina' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

const und = (u) => (u === 'UND' ? 'und' : u)

// Procesos de máquina: no se escribe tiempo; se marca avanzado o listo y se abona el montaje al operario
function FlujoMaquina({ accion, maquina, personas, onClose, onHecho }) {
  const { lista } = accion
  const [persona, setPersona] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cant = lista.reduce((s, t) => s + Number(t.cant_proceso || 0), 0)
  const calc = calcMaquina(maquina, cant)
  const ya = lista.reduce((s, t) => s + Number(t.min_reales || 0), 0)
  const abonoListo = Math.max((calc?.minOperario || 0) - ya, 0)
  const abonoAvance = Math.max(Number(maquina?.min_montaje || 0) - ya, 0)
  const avanzado = lista.every((t) => t.estado === 'en_curso')
  const marcar = async (listo) => {
    setEnviando(true); setError('')
    const r = await sb.rpc('marcar_maquina', { p_tareas: lista.map((t) => t.id), p_persona: persona.id, p_listo: listo })
    setEnviando(false)
    const fallo = r.error?.message || r.data
    if (fallo) { setError(fallo); return }
    onHecho(`${accion.nombre} ${listo ? 'listo' : 'avanzado'}${lista.length > 1 ? ' en todo el proyecto' : ''} · ${persona.nombre.split(' ')[0]}`)
  }
  return (
    <Modal titulo={`${accion.nombre} · proceso de máquina`} onClose={onClose} ancho={600}>
      {lista.length === 1
        ? <p className="tenue">OP {lista[0].op_numero} · Ítem {lista[0].item_numero} · {lista[0].producto_nombre}</p>
        : <div className="tenue">OP {accion.op?.numero} · todo el proyecto:
            <ul className="lista-reparto">{lista.map((t) => <li key={t.id}>Ítem {t.item_numero} · {t.producto_nombre} · {fmtNum(t.cant_proceso, 2)} {unidadProc(t.unidad_proceso)}</li>)}</ul></div>}
      <div className="hoy">
        {fmtNum(cant, 2)} {unidadProc(lista[0]?.unidad_proceso)} · {calc?.ciclos ?? '—'} {calc?.ciclos === 1 ? 'montaje' : 'montajes'} · máquina {calc?.minMaquina ? fmtMin(calc.minMaquina) : '—'}
      </div>
      <p className="tenue">Aquí no se escribe tiempo. Al marcarlo se te abona el tiempo de montaje y cambio de material.</p>
      {!persona ? (
        <div>
          <p className="paso-tit">¿Quién lo hizo?</p>
          <div className="personas">
            {personas.map((p) => <button key={p.id} className="persona" onClick={() => setPersona(p)}>{p.nombre}<span>{p.area}</span></button>)}
            {personas.length === 0 && <p>No hay personas para esta tablet.</p>}
          </div>
        </div>
      ) : (
        <div className="form">
          <div className="quien"><b>{persona.nombre}</b><button className="btn-link" onClick={() => setPersona(null)}>Cambiar</button></div>
          <Aviso>{error}</Aviso>
          <div className="acciones acciones-registro">
            {!avanzado && <button className="btn btn-sec btn-grande" disabled={enviando} onClick={() => marcar(false)}>
              Avanzado · ya está montado{abonoAvance > 0 ? ` (+${fmtMin(abonoAvance)})` : ''}</button>}
            <button className="btn btn-ok btn-grande" disabled={enviando} onClick={() => marcar(true)}>
              Listo{lista.length > 1 ? ' en todo el proyecto' : ''}{abonoListo > 0 ? ` (+${fmtMin(abonoListo)})` : ''}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const ATAJOS = [15, 30, 60, 90, 120, 180, 240, 480]

function FlujoRegistro({ accion, personas, motivos, onClose, onHecho }) {
  const { tipo, tarea } = accion
  const pendiente = tarea?.cantidad ? Math.max(Number(tarea.cantidad) - Number(tarea.cantidad_registrada || 0), 0) : ''
  const [persona, setPersona] = useState(null)
  const [hoy, setHoy] = useState(null)
  const [horas, setHoras] = useState('')
  const [minutos, setMinutos] = useState('')
  const [cantidad, setCantidad] = useState(pendiente === '' ? '' : String(pendiente))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const elegir = async (p) => {
    setPersona(p)
    const { data } = await sb.rpc('minutos_hoy', { p_persona: p.id })
    setHoy(Number(data) || 0)
  }
  const total = (Number(horas) || 0) * 60 + (Number(minutos) || 0)
  const atajo = (m) => { setHoras(String(Math.floor(m / 60))); setMinutos(String(m % 60)) }
  const jornada = jornadaHoy()
  const conEste = (hoy || 0) + total

  const guardar = async (termino) => {
    if (total <= 0) { setError('Escribe cuánto tiempo trabajaste.'); return }
    if (tipo === 'paro' && !motivo) { setError('Elige el motivo del paro.'); return }
    setEnviando(true); setError('')
    const r = tipo === 'paro'
      ? await sb.rpc('registrar_paro', { p_persona: persona.id, p_motivo: Number(motivo), p_minutos: total })
      : tipo === 'proyecto'
      ? await sb.rpc('registrar_proyecto', { p_orden: accion.op.id, p_proceso: accion.proceso.proceso, p_persona: persona.id, p_minutos: total, p_termino: termino })
      : await sb.rpc('registrar_avance', {
        p_tarea: tarea.id, p_persona: persona.id, p_minutos: total,
        p_cantidad: cantidad === '' ? null : Number(String(cantidad).replace(',', '.')), p_termino: termino,
      })
    setEnviando(false)
    const fallo = r.error?.message || r.data
    if (fallo) { setError(fallo); return }
    const n = persona.nombre.split(' ')[0]
    const nombreProc = tipo === 'proyecto' ? accion.proceso.nombre : tarea?.proceso_nombre
    onHecho(tipo === 'paro' ? 'Paro registrado' : termino ? `${n} terminó ${nombreProc?.toLowerCase()}${tipo === 'proyecto' ? ' en todo el proyecto' : ''}` : `Avance de ${n} registrado`)
  }

  return (
    <Modal titulo={tipo === 'paro' ? 'Registrar paro' : tipo === 'proyecto' ? 'Proceso de todo el proyecto' : 'Registrar tiempo'} onClose={onClose} ancho={600}>
      {tarea && <p className="tenue">OP {tarea.op_numero} · Ítem {tarea.item_numero} · <b>{tarea.proceso_nombre}</b> · {tarea.producto_nombre || 'ensamble final'}</p>}
      {tipo === 'proyecto' && (
        <div className="tenue">OP {accion.op.numero} · <b>{accion.proceso.nombre}</b>. El tiempo se reparte entre:
          <ul className="lista-reparto">{accion.lista.map((t) => <li key={t.id}>Ítem {t.item_numero} · {t.producto_nombre || 'ensamble'} · {fmtNum(t.cantidad, 2)} und</li>)}</ul>
        </div>
      )}
      {!persona ? (
        <div>
          <p className="paso-tit">¿Quién eres?</p>
          <div className="personas">
            {personas.map((p) => (
              <button key={p.id} className="persona" onClick={() => elegir(p)}>{p.nombre}<span>{p.area}</span></button>
            ))}
            {personas.length === 0 && <p>No hay personas para esta tablet.</p>}
          </div>
        </div>
      ) : (
        <div className="form">
          <div className="quien">
            <b>{persona.nombre}</b>
            <button className="btn-link" onClick={() => { setPersona(null); setHoy(null) }}>Cambiar</button>
          </div>
          {hoy !== null && <div className="hoy">Hoy llevas registrado: <b>{fmtMin(hoy)}</b>{jornada ? ` de ${fmtMin(jornada)} de jornada` : ''}</div>}

          {tipo === 'paro' && (
            <label className="paso-tit">Motivo
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="select-grande">
                <option value="">Selecciona el motivo…</option>
                {motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.descripcion}</option>)}
              </select>
            </label>
          )}

          <div>
            <p className="paso-tit">{tipo === 'paro' ? '¿Cuánto duró el paro?' : tipo === 'proyecto' ? '¿Cuánto tiempo trabajaste en este proceso (en total)?' : '¿Cuánto tiempo trabajaste en esta tarea?'}</p>
            <div className="atajos">
              {ATAJOS.map((m) => (
                <button key={m} type="button" className={total === m ? 'sel' : ''} onClick={() => atajo(m)}>{m < 60 ? `${m} min` : `${fmtNum(m / 60, 1)} h`}</button>
              ))}
            </div>
            <div className="tiempo">
              <label>Horas<input className="input-grande" value={horas} onChange={(e) => setHoras(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="0" /></label>
              <label>Minutos<input className="input-grande" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="0" /></label>
            </div>
            {jornada > 0 && total > 0 && conEste > jornada && (
              <Aviso tipo="warn">Con este registro llevarías {fmtMin(conEste)} hoy, más que la jornada ({fmtMin(jornada)}). Revisa el tiempo; si incluye horas extra, continúa.</Aviso>
            )}
          </div>

          {tipo === 'registrar' && (
            <label className="paso-tit">¿Cuántas unidades terminaste? ({und(tarea.unidad)})
              <input className="input-grande" value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="Cantidad" />
            </label>
          )}

          <Aviso>{error}</Aviso>
          {tipo === 'paro' ? (
            <div className="acciones"><button className="btn btn-grande" disabled={enviando} onClick={() => guardar(false)}>Guardar paro</button></div>
          ) : (
            <div className="acciones acciones-registro">
              <button className="btn btn-sec btn-grande" disabled={enviando} onClick={() => guardar(false)}>Guardar · sigo después</button>
              <button className="btn btn-ok btn-grande" disabled={enviando} onClick={() => guardar(true)}>{tipo === 'proyecto' ? 'Guardar y terminé en todo el proyecto' : 'Guardar y terminé la tarea'}</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
