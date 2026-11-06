import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q, PERSONA_COLS } from '../supabase.js'
import { Aviso, EstadoTarea, Modal, PinPad, fmtFecha, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

// Pantalla de la tablet de un área. Muestra las tareas de su área y de Pintura
// (Pintura no tiene tablet propia). El operario se identifica con su nombre + PIN.
export default function Tablet({ perfil }) {
  const area = perfil.area
  const areas = area ? [area, 'PINTURA'] : null
  const [tareas, setTareas] = useState(null)
  const [personas, setPersonas] = useState([])
  const [motivos, setMotivos] = useState([])
  const [paros, setParos] = useState([])
  const [error, setError] = useState('')
  const [accion, setAccion] = useState(null) // {tipo, tarea}
  const [msg, setMsg] = useState('')
  const [hora, setHora] = useState(new Date())

  const cargar = useCallback(async () => {
    try {
      let c = sb.from('v_tareas').select('*').in('estado', ['pendiente', 'en_curso', 'pausada']).in('op_estado', ['borrador', 'en_planta']).neq('proceso', 'TER-1')
      if (areas) c = c.in('area', areas)
      let cp = sb.from('personas').select(PERSONA_COLS).eq('activo', true).eq('rol', 'operario').order('nombre')
      if (areas) cp = cp.in('area', areas)
      const [t, p, m, pa] = await Promise.all([
        q(c), q(cp),
        q(sb.from('motivos_paro').select('*').order('codigo')),
        q(sb.from('paros').select('id, persona_id, motivo, inicio').is('fin', null)),
      ])
      setTareas(t); setPersonas(p); setMotivos(m); setParos(pa); setError('')
    } catch (e) { setError(`Sin conexión con el sistema: ${e.message}`) }
  }, [area]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); const t = setInterval(cargar, 20000); return () => clearInterval(t) }, [cargar])
  useEffect(() => { const t = setInterval(() => setHora(new Date()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(t) }, [msg])

  const orden = (a, b) => (a.prioridad - b.prioridad) || String(a.fecha_compromiso || '9').localeCompare(String(b.fecha_compromiso || '9'))
  const { activas, listas, espera } = useMemo(() => {
    const ts = tareas || []
    return {
      activas: ts.filter((t) => ['en_curso', 'pausada'].includes(t.estado)).sort(orden),
      listas: ts.filter((t) => t.estado === 'pendiente' && !t.bloqueada).sort(orden),
      espera: ts.filter((t) => t.estado === 'pendiente' && t.bloqueada).length,
    }
  }, [tareas])
  const nombre = (id) => personas.find((p) => p.id === id)?.nombre || ''
  const parosArea = paros.filter((p) => personas.some((x) => x.id === p.persona_id))

  return (
    <div className="tablet">
      <header className="tablet-cab">
        <div><div className="tablet-area">{area ? `Tablet ${area}` : 'Tablet de planta'}</div>
          <div className="tenue-claro">{hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div></div>
        <div className="tablet-botones">
          <button className="btn btn-paro" onClick={() => setAccion({ tipo: 'paro' })}>Reportar paro</button>
          {parosArea.length > 0 && <button className="btn btn-sec" onClick={() => setAccion({ tipo: 'fin_paro' })}>Terminar paro</button>}
          <button className="btn btn-sec" onClick={cargar}>Actualizar</button>
          <BotonAyuda clave="tablet" rol="tablet" etiqueta="¿Cómo registro?" claro />
        </div>
      </header>

      {msg && <div className="toast">{msg}</div>}
      <Aviso>{error}</Aviso>
      {parosArea.length > 0 && (
        <div className="aviso aviso-warn">En paro: {parosArea.map((p) => `${nombre(p.persona_id).split(' ')[0]} (${motivos.find((m) => m.codigo === p.motivo)?.descripcion.toLowerCase() || ''})`).join(' · ')}</div>
      )}

      <section>
        <h2 className="tablet-h2">En curso y pausadas <span className="cuenta">{activas.length}</span></h2>
        {activas.length === 0 ? <div className="vacio">Nada en curso.</div> : (
          <div className="tarjetas">{activas.map((t) => <TarjetaTarea key={t.id} t={t} onAccion={(tipo) => setAccion({ tipo, tarea: t })} />)}</div>
        )}
      </section>
      <section>
        <h2 className="tablet-h2">Listas para iniciar <span className="cuenta">{listas.length}</span></h2>
        {tareas === null ? <div className="vacio">Cargando…</div> : listas.length === 0 ? <div className="vacio">No hay tareas listas para esta área.</div> : (
          <div className="tarjetas">{listas.map((t) => <TarjetaTarea key={t.id} t={t} onAccion={(tipo) => setAccion({ tipo, tarea: t })} />)}</div>
        )}
        {espera > 0 && <p className="nota">{espera} tarea(s) más esperan que terminen pasos anteriores.</p>}
      </section>

      <footer className="tablet-pie">
        <span>MQI Producción</span>
        <button className="btn-link" onClick={() => sb.auth.signOut()}>Cerrar sesión de la tablet</button>
      </footer>

      {accion && (
        <FlujoAccion accion={accion} personas={personas} motivos={motivos} paros={parosArea}
          onClose={() => setAccion(null)}
          onHecho={(texto) => { setAccion(null); setMsg(texto); cargar() }} />
      )}
    </div>
  )
}

function TarjetaTarea({ t, onAccion }) {
  return (
    <div className={`tarea tarea-${t.estado}`}>
      <div className="tarea-op">OP {t.op_numero} · {t.cliente}</div>
      <div className="tarea-proceso">{t.proceso_nombre}</div>
      <div className="tarea-det">{t.item_descripcion}{t.producto ? ` · ${t.producto}` : ' · ensamble final'}</div>
      <div className="tarea-det">Cantidad: <b>{t.cantidad ? `${fmtNum(t.cantidad, 2)} ${t.unidad}` : 'ver plano'}</b> · Entrega OP: {fmtFecha(t.fecha_compromiso)}</div>
      <div className="tarea-pie">
        <EstadoTarea estado={t.estado} />
        <div className="tarea-botones">
          {t.estado === 'pendiente' && <button className="btn btn-grande" onClick={() => onAccion('iniciar')}>Iniciar</button>}
          {t.estado === 'pausada' && <button className="btn btn-grande" onClick={() => onAccion('iniciar')}>Reanudar</button>}
          {t.estado === 'en_curso' && <button className="btn btn-sec btn-grande" onClick={() => onAccion('pausar')}>Pausar</button>}
          {['en_curso', 'pausada'].includes(t.estado) && <button className="btn btn-ok btn-grande" onClick={() => onAccion('terminar')}>Terminar</button>}
        </div>
      </div>
    </div>
  )
}

const TITULOS = { iniciar: 'Iniciar tarea', pausar: 'Pausar tarea', terminar: 'Terminar tarea', paro: 'Reportar paro', fin_paro: 'Terminar paro' }

function FlujoAccion({ accion, personas, motivos, paros, onClose, onHecho }) {
  const { tipo, tarea } = accion
  const [persona, setPersona] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [cantidad, setCantidad] = useState(tarea?.cantidad ?? '')
  const [paso, setPaso] = useState('persona')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const necesitaDatos = tipo === 'pausar' || tipo === 'terminar' || tipo === 'paro'
  const candidatos = tipo === 'fin_paro' ? personas.filter((p) => paros.some((x) => x.persona_id === p.id)) : personas

  const enviar = useCallback(async (pin) => {
    setEnviando(true); setError('')
    let r
    if (tipo === 'iniciar') r = await sb.rpc('iniciar_tarea', { p_tarea: tarea.id, p_persona: persona.id, p_pin: pin })
    if (tipo === 'pausar') r = await sb.rpc('pausar_tarea', { p_tarea: tarea.id, p_persona: persona.id, p_pin: pin, p_motivo: Number(motivo) })
    if (tipo === 'terminar') r = await sb.rpc('terminar_tarea', { p_tarea: tarea.id, p_persona: persona.id, p_pin: pin, p_cantidad: cantidad === '' ? null : Number(String(cantidad).replace(',', '.')) })
    if (tipo === 'paro') r = await sb.rpc('iniciar_paro', { p_persona: persona.id, p_pin: pin, p_motivo: Number(motivo) })
    if (tipo === 'fin_paro') r = await sb.rpc('terminar_paro', { p_persona: persona.id, p_pin: pin })
    setEnviando(false)
    const fallo = r.error?.message || r.data
    if (fallo) { setError(fallo); return }
    const n = persona.nombre.split(' ')[0]
    onHecho({ iniciar: `${n} inició ${tarea?.proceso_nombre}`, pausar: 'Tarea pausada', terminar: `${n} terminó ${tarea?.proceso_nombre}`, paro: 'Paro registrado', fin_paro: 'Paro terminado' }[tipo])
  }, [tipo, tarea, persona, motivo, cantidad, onHecho])

  return (
    <Modal titulo={TITULOS[tipo]} onClose={onClose} ancho={560}>
      {tarea && <p className="tenue">OP {tarea.op_numero} · {tarea.proceso_nombre} · {tarea.item_descripcion}</p>}
      {paso === 'persona' && (
        <div>
          <p className="paso-tit">¿Quién eres?</p>
          <div className="personas">
            {candidatos.map((p) => (
              <button key={p.id} className="persona" onClick={() => { setPersona(p); setPaso(necesitaDatos ? 'datos' : 'pin') }}>
                {p.nombre}<span>{p.area}</span>
              </button>
            ))}
            {candidatos.length === 0 && <p>No hay personas para esta tablet.</p>}
          </div>
        </div>
      )}
      {paso === 'datos' && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); setPaso('pin') }}>
          {(tipo === 'pausar' || tipo === 'paro') && (
            <label className="paso-tit">Motivo
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} required className="select-grande">
                <option value="">Selecciona el motivo…</option>
                {motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.descripcion}</option>)}
              </select>
            </label>
          )}
          {tipo === 'terminar' && (
            <label className="paso-tit">Cantidad hecha ({tarea.unidad})
              <input className="input-grande" value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" />
            </label>
          )}
          <div className="acciones"><button type="button" className="btn btn-sec btn-grande" onClick={() => setPaso('persona')}>Atrás</button><button className="btn btn-grande">Continuar</button></div>
        </form>
      )}
      {paso === 'pin' && (
        <div>
          <p className="paso-tit">{persona.nombre}: escribe tu PIN</p>
          <PinPad onCompleto={enviar} deshabilitado={enviando} />
          <Aviso>{error}</Aviso>
          <div className="acciones"><button className="btn btn-sec btn-grande" onClick={() => { setError(''); setPaso('persona') }}>Cambiar persona</button></div>
        </div>
      )}
    </Modal>
  )
}
