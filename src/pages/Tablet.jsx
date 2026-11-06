import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, Modal, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

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
  const [accion, setAccion] = useState(null) // {tipo: 'registrar'|'paro', tarea}
  const [msg, setMsg] = useState('')
  const [hora, setHora] = useState(new Date())

  const cargar = useCallback(async () => {
    try {
      let c = sb.from('v_tareas').select('*').in('estado', ['pendiente', 'en_curso', 'pausada']).in('op_estado', ['borrador', 'en_planta']).neq('proceso', 'TER-1')
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

  const orden = (a, b) => (a.prioridad - b.prioridad) || String(a.fecha_compromiso || '9').localeCompare(String(b.fecha_compromiso || '9'))
  const { enProceso, listas, espera } = useMemo(() => {
    const ts = tareas || []
    return {
      enProceso: ts.filter((t) => ['en_curso', 'pausada'].includes(t.estado)).sort(orden),
      listas: ts.filter((t) => t.estado === 'pendiente' && !t.bloqueada).sort(orden),
      espera: ts.filter((t) => t.estado === 'pendiente' && t.bloqueada).length,
    }
  }, [tareas])

  return (
    <div className="tablet">
      <header className="tablet-cab">
        <div><div className="tablet-area">{area ? `Tablet ${area}` : 'Tablet de planta'}</div>
          <div className="tenue-claro">{hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div></div>
        <div className="tablet-botones">
          <button className="btn btn-paro" onClick={() => setAccion({ tipo: 'paro' })}>Registrar paro</button>
          <button className="btn btn-sec" onClick={cargar}>Actualizar</button>
          <BotonAyuda clave="tablet" rol="tablet" etiqueta="¿Cómo registro?" claro />
        </div>
      </header>

      {msg && <div className="toast">{msg}</div>}
      <Aviso>{error}</Aviso>

      <section>
        <h2 className="tablet-h2">En proceso <span className="cuenta">{enProceso.length}</span></h2>
        {enProceso.length === 0 ? <div className="vacio">Ninguna tarea empezada.</div> : (
          <div className="tarjetas">{enProceso.map((t) => <TarjetaTarea key={t.id} t={t} onRegistrar={() => setAccion({ tipo: 'registrar', tarea: t })} />)}</div>
        )}
      </section>
      <section>
        <h2 className="tablet-h2">Listas para empezar <span className="cuenta">{listas.length}</span></h2>
        {tareas === null ? <div className="vacio">Cargando…</div> : listas.length === 0 ? <div className="vacio">No hay tareas listas para esta área.</div> : (
          <div className="tarjetas">{listas.map((t) => <TarjetaTarea key={t.id} t={t} onRegistrar={() => setAccion({ tipo: 'registrar', tarea: t })} />)}</div>
        )}
        {espera > 0 && <p className="nota">{espera} tarea(s) más esperan que terminen pasos anteriores.</p>}
      </section>

      <footer className="tablet-pie">
        <span>MQI Producción</span>
        <button className="btn-link" onClick={() => sb.auth.signOut()}>Cerrar sesión de la tablet</button>
      </footer>

      {accion && (
        <FlujoRegistro accion={accion} personas={personas} motivos={motivos}
          onClose={() => setAccion(null)}
          onHecho={(texto) => { setAccion(null); setMsg(texto); cargar() }} />
      )}
    </div>
  )
}

function TarjetaTarea({ t, onRegistrar }) {
  const empezada = Number(t.min_reales) > 0
  return (
    <div className={`tarea tarea-${t.estado}`}>
      <div className="tarea-op">OP {t.op_numero} · {t.cliente}</div>
      <div className="tarea-proceso">{t.proceso_nombre}</div>
      <div className="tarea-det">{t.item_descripcion}{t.producto ? ` · ${t.producto}` : ' · ensamble final'}</div>
      <div className="tarea-det">Cantidad: <b>{t.cantidad ? `${fmtNum(t.cantidad, 2)} ${t.unidad}` : 'ver plano'}</b> · Entrega OP: {fmtFecha(t.fecha_compromiso)}</div>
      {empezada && (
        <div className="tarea-avance">Registrado: <b>{fmtMin(t.min_reales)}</b>{Number(t.cantidad_registrada) > 0 && <> · hecho <b>{fmtNum(t.cantidad_registrada, 2)}{t.cantidad ? ` de ${fmtNum(t.cantidad, 2)}` : ''} {t.unidad}</b></>}</div>
      )}
      <div className="tarea-pie">
        <span className={`badge ${empezada ? 'badge-info' : 'badge-muted'}`}>{empezada ? 'En proceso' : 'Sin empezar'}</span>
        <button className="btn btn-grande" onClick={onRegistrar}>Registrar</button>
      </div>
    </div>
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
      : await sb.rpc('registrar_avance', {
        p_tarea: tarea.id, p_persona: persona.id, p_minutos: total,
        p_cantidad: cantidad === '' ? null : Number(String(cantidad).replace(',', '.')), p_termino: termino,
      })
    setEnviando(false)
    const fallo = r.error?.message || r.data
    if (fallo) { setError(fallo); return }
    const n = persona.nombre.split(' ')[0]
    onHecho(tipo === 'paro' ? 'Paro registrado' : termino ? `${n} terminó ${tarea.proceso_nombre}` : `Avance de ${n} registrado`)
  }

  return (
    <Modal titulo={tipo === 'paro' ? 'Registrar paro' : 'Registrar tiempo'} onClose={onClose} ancho={600}>
      {tarea && <p className="tenue">OP {tarea.op_numero} · {tarea.proceso_nombre} · {tarea.item_descripcion}</p>}
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
            <p className="paso-tit">{tipo === 'paro' ? '¿Cuánto duró el paro?' : '¿Cuánto tiempo trabajaste en esta tarea?'}</p>
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
            <label className="paso-tit">¿Cuánto hiciste? ({tarea.unidad})
              <input className="input-grande" value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" placeholder="Cantidad" />
            </label>
          )}

          <Aviso>{error}</Aviso>
          {tipo === 'paro' ? (
            <div className="acciones"><button className="btn btn-grande" disabled={enviando} onClick={() => guardar(false)}>Guardar paro</button></div>
          ) : (
            <div className="acciones acciones-registro">
              <button className="btn btn-sec btn-grande" disabled={enviando} onClick={() => guardar(false)}>Guardar · sigo después</button>
              <button className="btn btn-ok btn-grande" disabled={enviando} onClick={() => guardar(true)}>Guardar y terminé la tarea</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
