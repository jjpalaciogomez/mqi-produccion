import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Modal, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { DIF_NOMBRE, textoMedidas } from '../estandar.js'

// Pantalla de la tablet de un área. Muestra las tareas de su área y de Pintura
// (Pintura no tiene tablet propia). El operario toca su nombre y escribe cuánto trabajó.

// Jornada en minutos según el día (hora de Colombia): lunes a jueves 8,5 h, viernes 8 h
const jornadaHoy = () => {
  const dia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getDay()
  return dia === 5 ? 480 : dia >= 1 && dia <= 4 ? 510 : 0
}

export default function Tablet({ perfil }) {
  const area = perfil.area
  const areas = area ? [area, 'PINTURA'] : null
  const [tareas, setTareas] = useState(null)
  const [personas, setPersonas] = useState([])
  const [motivos, setMotivos] = useState([])
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
      const [t, p, m] = await Promise.all([q(c), q(cp), q(sb.from('motivos_paro').select('*').order('codigo'))])
      setTareas(t); setPersonas(p); setMotivos(m); setError('')
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
    return Object.values(g).filter((o) => o.tareas.some(activa))
      .sort((a, b) => (a.prioridad - b.prioridad) || String(a.fecha || '9').localeCompare(String(b.fecha || '9')))
  }, [tareas])
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
      </nav>

      {vista.nivel === 'ops' && (
        tareas === null ? <div className="vacio">Cargando…</div> : ops.length === 0 ? <div className="vacio">No hay proyectos con tareas para esta área.</div> : (
          <div className="tarjetas">
            {ops.map((o) => <TarjetaGrupo key={o.id} titulo={`OP ${o.numero}`} sup={o.cliente} sub={`${o.proyecto} · entrega ${fmtFecha(o.fecha)}`}
              ts={o.tareas} onClick={() => setVista({ nivel: 'op', opId: o.id })} />)}
          </div>
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
          <p className="tenue">Toca "Registrar" en el proceso en el que trabajaste.</p>
          <ListaProcesos ts={item.tareas} onRegistrar={(t) => setAccion({ tipo: 'registrar', tarea: t })} />
        </section>
      )}

      <footer className="tablet-pie">
        <span>MQI Producción</span>
        <button className="btn-link" onClick={() => sb.auth.signOut()}>Cerrar sesión de la tablet</button>
      </footer>

      {accion?.tipo === 'elegir' && (
        <ElegirProceso op={accion.op} onClose={() => setAccion(null)} onElegir={(proceso, lista) => setAccion({ tipo: 'proyecto', op: accion.op, proceso, lista })} />
      )}
      {accion && accion.tipo !== 'elegir' && (
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

function TarjetaGrupo({ titulo, sup, sub, ts, onClick, grande }) {
  const c = contar(ts)
  return (
    <button className={`tarea tarea-grupo${grande ? ' grupo-item' : ''}`} onClick={onClick}>
      <div className="tarea-op">{sup}</div>
      <div className="tarea-proceso">{titulo}</div>
      {sub && <div className="tarea-det">{sub}</div>}
      <div className="grupo-cuentas">
        {c.proceso > 0 && <span className="badge badge-info">{c.proceso} en proceso</span>}
        {c.listas > 0 && <span className="badge badge-ok">{c.listas} listas</span>}
        {c.espera > 0 && <span className="badge badge-muted">{c.espera} en espera</span>}
        {c.hechas > 0 && <span className="badge badge-muted">{c.hechas} terminadas</span>}
      </div>
    </button>
  )
}

function ListaProcesos({ ts, onRegistrar }) {
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
            <div key={t.id} className={`fila-proceso${hecha ? ' hecha' : ''}${espera ? ' espera' : ''}`}>
              <div>
                <div className="tarea-proceso">{hecha ? '✓ ' : ''}{t.proceso_nombre}{t.area === 'PINTURA' ? ' · Pintura' : ''}</div>
                <div className="tarea-det">
                  {fmtNum(t.cantidad, 2)} und
                  {Number(t.min_reales) > 0 && <> · registrado <b>{fmtMin(t.min_reales)}</b>{Number(t.cantidad_registrada) > 0 && ` · hecho ${fmtNum(t.cantidad_registrada, 2)} de ${fmtNum(t.cantidad, 2)}`}</>}
                  {espera && ' · espera el paso anterior'}
                </div>
              </div>
              {!hecha && !espera && <button className="btn btn-grande" onClick={() => onRegistrar(t)}>Registrar</button>}
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
              {p.nombre}<span>{p.area} · {p.lista.length} {p.lista.length === 1 ? 'tarea' : 'tareas'}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

const und = (u) => (u === 'UND' ? 'und' : u)

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
