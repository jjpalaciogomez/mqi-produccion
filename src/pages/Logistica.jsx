import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEnVivo } from '../vivo.js'
import { sb, q } from '../supabase.js'
import { Aviso, Cargando, Modal, fmtFecha, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { hoyCO } from '../cumplimiento.js'
import {
  DIAS_SEM, ESTADOS_VUELTA, TIPOS_LUGAR, TIPOS_TRANSPORTE, TIPOS_VUELTA, VEHICULOS, aMin, esContratado, esConductor, telLink, linkWhatsApp, mensajeVuelta, mensajeResumen, linkUber, PLANTILLA_VUELTA, PLANTILLA_RESUMEN, CAMPOS_VUELTA, CAMPOS_RESUMEN, cfgDe, zonaDe, zonaTxt, cuandoTxt, h12, esLinkCorto, estimar, hm, leerUbicacion, linkMaps,
  linksRecorrido, ordenarParadas, proponerAsignacion, recepcionTxt, tieneUbic, ventanasParada,
} from '../logistica.js'

const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const diaTxt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const AJ_DEF = { lat: null, lng: null }
const horaTxt = (h) => (h ? String(h).slice(0, 5) : '')

function useAjustesLog() {
  const [aj, setAj] = useState(null)
  const cargar = useCallback(() => q(sb.from('ajustes').select('valor').eq('clave', 'logistica')).then((r) => setAj({ ...AJ_DEF, ...(r[0]?.valor || {}) })).catch(() => setAj(AJ_DEF)), [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['ajustes'])
  return [aj, cargar]
}

// Plantillas de WhatsApp personalizadas (ajustes 'whatsapp'); si no hay, se usan las predeterminadas
function usePlantillasWa() {
  const [tpl, setTpl] = useState({})
  const cargar = useCallback(() => q(sb.from('ajustes').select('valor').eq('clave', 'whatsapp')).then((r) => setTpl(r[0]?.valor || {})).catch(() => setTpl({})), [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['ajustes'])
  return [tpl, cargar]
}

export default function Logistica({ perfil, gestor }) {
  const [tab, setTab] = useState(gestor ? 'ruta' : 'vueltas')
  const [lugares, setLugares] = useState(null)
  const cargarLugares = useCallback(() => q(sb.from('lugares').select('*').order('nombre')).then(setLugares).catch(() => setLugares([])), [])
  const [transps, setTransps] = useState(null)
  const cargarTransps = useCallback(() => q(sb.from('transportadores').select('*').order('nombre')).then(setTransps).catch(() => setTransps([])), [])
  useEffect(() => { cargarTransps() }, [cargarTransps])
  useEnVivo(cargarTransps, ['transportadores'], 120000)
  useEffect(() => { cargarLugares() }, [cargarLugares])
  useEnVivo(cargarLugares, ['lugares'], 120000)
  return (
    <div>
      <div className="titulo-pagina">
        <div><h1>Logística</h1><div className="tenue pequeño">Entregas, recogidas y diligencias: se piden aquí y se organizan en la ruta de cada día.</div></div>
        <BotonAyuda clave="logistica" rol={perfil?.rol} />
      </div>
      <div className="segmentado pestañas">
        {[...(gestor ? [['ruta', 'Ruta del día']] : []), ['vueltas', 'Vueltas'], ['lugares', 'Clientes y proveedores'], ['transportadores', 'Transportadores']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'ruta' && gestor && <RutaDelDia lugares={lugares || []} transps={transps || []} perfil={perfil} onLugares={cargarLugares} />}
      {tab === 'vueltas' && <Vueltas perfil={perfil} gestor={gestor} lugares={lugares || []} onLugares={cargarLugares} />}
      {tab === 'lugares' && <Lugares lugares={lugares} onCambio={cargarLugares} />}
      {tab === 'transportadores' && <Transportadores lista={transps} onCambio={cargarTransps} gestor={gestor} />}
    </div>
  )
}

// ---------------- Vueltas ----------------
function Vueltas({ perfil, gestor, lugares, onLugares }) {
  const hoy = hoyCO()
  const [lista, setLista] = useState(null)
  const [filtro, setFiltro] = useState('pendientes')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const yo = perfil?.user_id
  const cargar = useCallback(async () => {
    try {
      let c = sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero), transportadores(nombre, telefono)').order('fecha').order('hora', { nullsFirst: false }).order('creado')
      if (filtro === 'pendientes') c = c.in('estado', ['pendiente', 'no_hecha'])
      else c = c.gte('fecha', sumarDias(hoy, -30))
      if (filtro === 'mias') c = c.eq('solicitante', yo)
      setLista(await q(c)); setError('')
    } catch (e) { setError(e.message) }
  }, [filtro, hoy, yo])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['vueltas', 'recorridos', 'transportadores'])
  const puedeEditar = (v) => gestor || (v.solicitante === yo && v.estado === 'pendiente' && (!v.recorridos || v.recorridos.estado === 'borrador'))
  const porFecha = useMemo(() => {
    const g = {}
    for (const v of lista || []) (g[v.fecha] ||= []).push(v)
    return Object.entries(g)
  }, [lista])
  return (
    <div>
      <div className="filtros">
        <div className="segmentado">
          {[['pendientes', 'Por hacer'], ['mias', 'Las que pedí'], ['todas', 'Todas (último mes)']].map(([k, t]) => (
            <button key={k} className={filtro === k ? 'sel' : ''} onClick={() => setFiltro(k)}>{t}</button>))}
        </div>
        <button className="btn" onClick={() => setForm({})}>+ Pedir vuelta</button>
      </div>
      <Aviso>{error}</Aviso>
      {!lista ? <Cargando /> : lista.length === 0 ? <div className="vacio">No hay vueltas {filtro === 'pendientes' ? 'por hacer' : ''}.</div> : porFecha.map(([f, vs]) => (
        <div key={f} className="tarjeta log-dia">
          <h3 className="subt" style={{ marginTop: 0 }}>{diaTxt(f)}{f < hoy && vs.some((v) => v.estado === 'pendiente') ? <span className="badge badge-bad" style={{ marginLeft: 8 }}>atrasada</span> : null}</h3>
          <table className="tabla tabla-click">
            <thead><tr><th>Tipo</th><th>Destino</th><th>Qué</th><th>Cuándo</th><th>Pidió</th><th>Estado</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.id} onClick={() => setForm(v)} className={v.estado === 'cancelada' ? 'omitida' : ''}>
                <td><span className={`etq-vuelta ${v.tipo}`}>{TIPOS_VUELTA[v.tipo]}</span>{v.prioridad === 1 && <span className="badge badge-bad">urgente</span>}</td>
                <td><b>{v.destino}</b>{zonaTxt(v) && <span className={`zona z-${zonaDe(v)}`}>{zonaTxt(v)}</span>}<div className="tenue pequeño">{[v.direccion, v.municipio].filter(Boolean).join(', ')}</div></td>
                <td>{v.descripcion}{v.op && <span className="tenue"> · OP {v.op}</span>}{v.necesita_camion && <span className="etq">camión</span>}</td>
                <td>{v.hora ? <b className="hora-exacta">⏰ {cuandoTxt(v)}</b> : cuandoTxt(v) || 'Cualquier hora'}{recepcionTxt(v.recepcion) && <div className="tenue pequeño">recibe {recepcionTxt(v.recepcion)}</div>}</td>
                <td className="tenue pequeño">{v.solicitante_nombre || '—'}</td>
                <td><EstadoVuelta v={v} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {form && <FormVuelta inicial={form} lugares={lugares} perfil={perfil} soloLectura={form.id && !puedeEditar(form)} gestor={gestor}
        onClose={() => setForm(null)} onGuardado={() => { setForm(null); cargar(); onLugares() }} />}
    </div>
  )
}

function EstadoVuelta({ v }) {
  if (v.estado === 'hecha') return <span className="badge badge-ok">Hecha</span>
  if (v.estado === 'no_hecha') return <span className="badge badge-bad" title={v.resultado || ''}>No se pudo</span>
  if (v.estado === 'cancelada') return <span className="badge badge-muted">Cancelada</span>
  if (v.pospuesta) return <span className="badge badge-muted">No programar por ahora</span>
  if (v.recorridos && esContratado(v.recorridos.vehiculo)) return <span className="badge badge-info">Servicio contratado{v.transportadores ? ` · ${v.transportadores.nombre}` : ''}</span>
  if (v.recorridos) return <span className={`badge ${v.recorridos.estado === 'confirmada' ? 'badge-info' : 'badge-muted'}`}>{VEHICULOS[v.recorridos.vehiculo]?.split(' ')[0]}{v.recorridos.numero > 1 ? ` (ruta ${v.recorridos.numero})` : ''}{v.recorridos.estado === 'confirmada' ? ' · confirmada' : ' · en borrador'}</span>
  return <span className="badge badge-warn">Sin asignar</span>
}

const VACIA = { tipo: 'entrega', lugar_id: '', destino: '', direccion: '', municipio: 'Medellín', contacto: '', telefono: '', horario: '', ubic: '',
  franja: 'todo', hora: '', hora_hasta: '', cuando: 'todo', recepcion: [], min_parada: '', volver_planta: false, volver_antes: '', recoger_planta: false, lista_desde: '', descripcion: '', op: '', necesita_camion: false, prioridad: 2, guardarLugar: false, tipoLugar: 'cliente' }

function FormVuelta({ inicial, lugares, perfil, soloLectura, gestor, onClose, onGuardado }) {
  const hoy = hoyCO()
  const [f, setF] = useState(() => ({ ...VACIA, fecha: hoy, ...Object.fromEntries(Object.entries(inicial).filter(([, v]) => v !== null)),
    ubic: tieneUbic(inicial) ? `${inicial.lat}, ${inicial.lng}` : '', lugar_id: inicial.lugar_id || '', hora: horaTxt(inicial.hora), hora_hasta: horaTxt(inicial.hora_hasta),
    cuando: inicial.cuando || (inicial.hora && inicial.hora_hasta ? 'rango' : inicial.hora ? 'exacta' : inicial.hora_hasta ? 'antes' : inicial.franja || 'todo'),
    recepcion: inicial.recepcion || [], min_parada: inicial.min_parada ?? '', volver_antes: horaTxt(inicial.volver_antes), lista_desde: horaTxt(inicial.lista_desde) }))
  const [aj] = useAjustesLog()
  const regreso = f.tipo === 'regreso'
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const elegirLugar = (id) => {
    const l = lugares.find((x) => x.id === id)
    if (!l) { setF({ ...f, lugar_id: '' }); return }
    setF({ ...f, lugar_id: id, destino: l.nombre, direccion: l.direccion || '', municipio: l.municipio || '', contacto: l.contacto || '', telefono: l.telefono || '',
      horario: l.horario || '', recepcion: l.recepcion || [], min_parada: l.min_parada ?? '', ubic: tieneUbic(l) ? `${l.lat}, ${l.lng}` : '', tipo: f.id ? f.tipo : l.tipo === 'proveedor' ? 'recogida' : 'entrega' })
  }
  const ubic = leerUbicacion(f.ubic)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (f.ubic && !ubic) { setError(esLinkCorto(f.ubic) ? 'Ese es un link corto de Google Maps: ábrelo, copia el link completo de la barra del navegador o las coordenadas (mantén presionado el punto en el mapa).' : 'No reconozco esa ubicación. Pega el link completo de Google Maps o las coordenadas, p. ej. 6.2442, -75.5812.'); return }
    if (['exacta', 'rango', 'desde'].includes(f.cuando) && !f.hora) { setError('Elige la hora.'); return }
    if (f.cuando === 'antes' && !f.hora_hasta) { setError('Elige antes de qué hora.'); return }
    if (f.cuando === 'rango' && (!f.hora_hasta || f.hora_hasta <= f.hora)) { setError('La hora "hasta" debe ser después de la hora "desde".'); return }
    const errRec = validarRecepcion(f.recepcion)
    if (!regreso && errRec) { setError(errRec); return }
    if (regreso && !tieneUbic(aj)) { setError('Falta la ubicación de la planta (Logística → Punto de salida y horarios).'); return }
    setEnviando(true)
    try {
      let lugarId = f.lugar_id || null
      if (!lugarId && f.guardarLugar) {
        const [l] = await q(sb.from('lugares').insert({ tipo: f.tipoLugar, nombre: f.destino.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null,
          contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, horario: f.horario.trim() || null, recepcion: f.recepcion, min_parada: Number(f.min_parada) || null, lat: ubic?.lat ?? null, lng: ubic?.lng ?? null }).select())
        lugarId = l.id
      }
      const fila = { tipo: f.tipo, lugar_id: lugarId, destino: f.destino.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null,
        contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, horario: f.horario.trim() || null, lat: ubic?.lat ?? null, lng: ubic?.lng ?? null,
        recepcion: regreso ? [] : f.recepcion, min_parada: Number(f.min_parada) || null,
        fecha: f.fecha, cuando: f.cuando, hora: ['exacta', 'rango', 'desde'].includes(f.cuando) ? f.hora : null, hora_hasta: ['rango', 'antes'].includes(f.cuando) ? f.hora_hasta : null,
        franja: f.cuando === 'desde' ? (f.hora >= '12:00' ? 'tarde' : 'todo') : ['exacta', 'rango'].includes(f.cuando) ? (f.hora < '12:00' ? 'manana' : 'tarde') : f.cuando === 'antes' ? (f.hora_hasta <= '12:00' ? 'manana' : 'todo') : f.cuando,
        volver_planta: !regreso && !!f.volver_planta, volver_antes: !regreso && f.volver_planta && f.volver_antes ? f.volver_antes : null,
        recoger_planta: !regreso && !!f.recoger_planta, lista_desde: !regreso && f.recoger_planta && f.lista_desde ? f.lista_desde : null, descripcion: f.descripcion.trim(), op: String(f.op || '').trim() || null, necesita_camion: !!f.necesita_camion, prioridad: Number(f.prioridad) }
      if (regreso) Object.assign(fila, { destino: 'Planta MQI', lugar_id: null, direccion: null, contacto: null, telefono: null, horario: null, lat: aj.lat, lng: aj.lng })
      if (f.id) await q(sb.from('vueltas').update(fila).eq('id', f.id))
      else await q(sb.from('vueltas').insert({ ...fila, solicitante_nombre: perfil?.nombre || null }))
      onGuardado()
    } catch (err) { setError(err.message); setEnviando(false) }
  }
  const cambiarEstado = async (estado) => {
    if (estado === 'cancelada' && !window.confirm('¿Cancelar esta vuelta?')) return
    try { await q(sb.from('vueltas').update({ estado, ...(estado === 'pendiente' ? { recorrido_id: null, orden: null, resultado: null, hecha_en: null } : {}) }).eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) }
  }
  const borrar = async () => {
    if (!window.confirm('¿Borrar esta vuelta? No se puede deshacer.')) return
    try { await q(sb.from('vueltas').delete().eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) }
  }
  const clientes = lugares.filter((l) => l.activo)
  return (
    <Modal titulo={f.id ? (soloLectura ? 'Vuelta' : 'Editar vuelta') : 'Pedir vuelta'} onClose={onClose} ancho={720}>
      <form className="form" onSubmit={guardar}>
        <fieldset disabled={soloLectura} className="sin-borde">
          <div className="fila-form">
            <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value, ...(e.target.value === 'regreso' ? { destino: 'Planta MQI', necesita_camion: true, lugar_id: '' } : {}) })}>{Object.entries(TIPOS_VUELTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            {!regreso && <label className="crece">Cliente o proveedor guardado
              <select value={f.lugar_id} onChange={(e) => elegirLugar(e.target.value)}>
                <option value="">— Otro sitio (escribir abajo) —</option>
                {['cliente', 'proveedor', 'otro'].map((t) => {
                  const ls = clientes.filter((l) => l.tipo === t)
                  return ls.length ? <optgroup key={t} label={`${TIPOS_LUGAR[t]}es`.replace('Otroes', 'Otros')}>{ls.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</optgroup> : null
                })}
              </select></label>}
          </div>
          {regreso && <p className="tenue">El camión vuelve a la planta (p. ej. a dejar algo que se necesita en producción). Indica la hora y qué trae.</p>}
          {!regreso && <>
          <div className="fila-form">
            <label className="crece">Destino (nombre)<input value={f.destino} onChange={set('destino')} required /></label>
            <label className="crece">Dirección<input value={f.direccion} onChange={set('direccion')} /></label>
            <label>Municipio<input value={f.municipio} onChange={set('municipio')} /></label>
          </div>
          <div className="fila-form">
            <label>Contacto<input value={f.contacto} onChange={set('contacto')} /></label>
            <label>Teléfono<input value={f.telefono} onChange={set('telefono')} inputMode="tel" /></label>
          </div>
          <EditorRecepcion valor={f.recepcion} onChange={(r) => setF({ ...f, recepcion: r })} desdeLugar={!!f.lugar_id} />
          <label>Ubicación (link de Google Maps o coordenadas)<input value={f.ubic} onChange={set('ubic')} placeholder="https://www.google.com/maps/… o 6.2442, -75.5812" />
            <span className="tenue pequeño">{ubic ? `✓ ${ubic.lat}, ${ubic.lng}` : 'Opcional, pero con ubicación el sistema puede ordenar la ruta por cercanía.'}</span></label>
          {!f.lugar_id && !f.id && (
            <div className="fila-form recurrente">
              <label className="check"><input type="checkbox" checked={f.guardarLugar} onChange={set('guardarLugar')} /> Guardar este sitio como recurrente</label>
              {f.guardarLugar && <select value={f.tipoLugar} onChange={set('tipoLugar')}>{Object.entries(TIPOS_LUGAR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
            </div>
          )}
          </>}
          <div className="fila-form">
            <label>Día<input type="date" value={f.fecha} min={f.id ? undefined : hoy} onChange={set('fecha')} required /></label>
            <label>Cuándo<select value={f.cuando} onChange={set('cuando')}>{Object.entries(CUANDO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            {['exacta', 'rango', 'desde'].includes(f.cuando) && <label>{f.cuando === 'exacta' ? 'Hora' : 'Desde'}<SelectorHora value={f.hora} onChange={(v) => setF({ ...f, hora: v })} /></label>}
            {['rango', 'antes'].includes(f.cuando) && <label>{f.cuando === 'antes' ? 'Antes de' : 'Hasta'}<SelectorHora value={f.hora_hasta} onChange={(v) => setF({ ...f, hora_hasta: v })} /></label>}
            <label title="Cuánto se demora en el sitio (descargar, recibir, firmar…). Vacío = el promedio">Tiempo en el sitio<span className="con-unidad"><input type="number" min={5} step={5} value={f.min_parada} onChange={set('min_parada')} placeholder="prom." style={{ width: 70 }} /> min</span></label>
            <label>OP (opcional)<input value={f.op || ''} onChange={set('op')} style={{ width: 100 }} /></label>
          </div>
          {!regreso && <AvisoHorario v={{ ...f, hora: ['exacta', 'rango', 'desde'].includes(f.cuando) ? f.hora : null, hora_hasta: ['rango', 'antes'].includes(f.cuando) ? f.hora_hasta : null, franja: f.cuando }} />}
          <label>Qué se lleva o se recoge<textarea rows={2} value={f.descripcion} onChange={set('descripcion')} required placeholder="p. ej. 3 avisos en acrílico, 2 cajas" /></label>
          <div className="fila-form">
            <label className="check"><input type="checkbox" checked={!!f.necesita_camion} onChange={set('necesita_camion')} /> Necesita camión (grande o pesado)</label>
            <label className="check"><input type="checkbox" checked={Number(f.prioridad) === 1} onChange={(e) => setF({ ...f, prioridad: e.target.checked ? 1 : 2 })} /> Urgente</label>
          </div>
          {!regreso && f.tipo !== 'recogida' && (
            <div className="fila-form volver-planta">
              <label className="check"><input type="checkbox" checked={!!f.recoger_planta} onChange={(e) => setF({ ...f, recoger_planta: e.target.checked })} /> Antes, el camión debe pasar por la planta a recoger la mercancía</label>
              {f.recoger_planta && <>
                <span className="pequeño">Lista desde</span>
                <SelectorHora value={f.lista_desde} onChange={(v) => setF({ ...f, lista_desde: v })} />
                <span className="tenue pequeño">(vacío = ya está lista)</span>
              </>}
            </div>
          )}
          {!regreso && (
            <div className="fila-form volver-planta">
              <label className="check"><input type="checkbox" checked={!!f.volver_planta} onChange={(e) => setF({ ...f, volver_planta: e.target.checked, necesita_camion: e.target.checked ? true : f.necesita_camion })} /> Después de esta vuelta el camión debe volver a la planta a dejar lo que trae</label>
              {f.volver_planta && <>
                <select value={f.volver_antes ? 'antes' : 'pronto'} onChange={(e) => setF({ ...f, volver_antes: e.target.value === 'antes' ? (f.volver_antes || '11:00') : '' })}>
                  <option value="pronto">Lo antes posible</option><option value="antes">Antes de una hora</option>
                </select>
                {f.volver_antes && <SelectorHora value={f.volver_antes} onChange={(v) => setF({ ...f, volver_antes: v })} />}
              </>}
            </div>
          )}
        </fieldset>
        {f.id && !f.lugar_id && !regreso && <GuardarRecurrente v={f} onHecho={(l) => setF({ ...f, lugar_id: l.id })} />}
        {f.id && <p className="tenue pequeño">Pidió: {f.solicitante_nombre || '—'} · {ESTADOS_VUELTA[f.estado]}{f.resultado ? ` · Nota del conductor: ${f.resultado}` : ''}</p>}
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {f.id && gestor && <button type="button" className="btn-link peligro" onClick={borrar}>Borrar</button>}
          {f.id && !soloLectura && f.estado === 'pendiente' && <button type="button" className="btn btn-sec" onClick={() => cambiarEstado('cancelada')}>Cancelar vuelta</button>}
          {f.id && gestor && ['no_hecha', 'cancelada', 'hecha'].includes(f.estado) && <button type="button" className="btn btn-sec" onClick={() => cambiarEstado('pendiente')}>Volver a pendiente</button>}
          <button type="button" className="btn btn-sec" onClick={onClose}>Cerrar</button>
          {!soloLectura && <button className="btn" disabled={enviando}>{f.id ? 'Guardar' : 'Pedir vuelta'}</button>}
        </div>
      </form>
    </Modal>
  )
}

// ---------------- Ruta del día (administrador) ----------------
function RutaDelDia({ lugares, transps, perfil, onLugares }) {
  const hoy = hoyCO()
  const [fecha, setFecha] = useState(() => { const h = new Date().toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }); return Number(h) >= 14 ? sumarDias(hoy, new Date(hoy + 'T12:00:00').getDay() === 5 ? 3 : 1) : hoy })
  const [aj, cargarAj] = useAjustesLog()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [form, setForm] = useState(null)
  const [verAjustes, setVerAjustes] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async () => {
    try {
      const [recs, delDia, previas] = await Promise.all([
        q(sb.from('recorridos').select('*').eq('fecha', fecha)),
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero), transportadores(nombre, telefono)').eq('fecha', fecha).neq('estado', 'cancelada')),
        // Lo que quedó pendiente o no se pudo hacer en días anteriores
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero), transportadores(nombre, telefono)').lt('fecha', fecha).in('estado', ['pendiente', 'no_hecha']).gte('fecha', sumarDias(fecha, -60))),
      ])
      const ids = new Set(recs.map((r) => r.id))
      const vs = [...delDia, ...previas.filter((v) => !v.recorrido_id || !ids.has(v.recorrido_id))]
      setD({ recs, vs }); setError('')
    } catch (e) { setError(e.message) }
  }, [fecha])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['vueltas', 'recorridos', 'transportadores'], 20000)

  const planta = aj && tieneUbic(aj) ? aj : null
  const cfg = cfgDe(aj)
  // Cada columna es una ruta: vehículo + número (un vehículo puede hacer varias rutas en el día)
  const [vehDe, numDe] = [(k) => k.split(':')[0], (k) => Number(k.split(':')[1] || 1)]
  const rec = (k) => d?.recs.find((r) => r.vehiculo === vehDe(k) && (r.numero || 1) === numDe(k))
  const deVeh = (k) => { const r = rec(k); return r ? d.vs.filter((v) => v.recorrido_id === r.id).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)) : [] }
  const libresDia = d ? d.vs.filter((v) => !d.recs.some((r) => r.id === v.recorrido_id) && v.estado !== 'hecha') : []
  const sinAsignar = libresDia.filter((v) => !v.pospuesta)
  const pospuestas = libresDia.filter((v) => v.pospuesta) // "No programar por ahora": no entran en la ruta ni en la propuesta
  const [verPosp, setVerPosp] = useState(false)
  const bloqueado = (veh) => rec(veh)?.estado === 'confirmada'

  // Crea la ruta (vehículo + número) si no existe
  const asegurarRec = async (k) => {
    const r = rec(k)
    if (r) return r
    const [n] = await q(sb.from('recorridos').upsert({ fecha, vehiculo: vehDe(k), numero: numDe(k), ...(vehDe(k) === 'camion' && condPred ? { conductor: condPred } : {}) }, { onConflict: 'fecha,vehiculo,numero' }).select())
    return n
  }
  const guardarOrden = async (veh, lista) => {
    const r = await asegurarRec(veh)
    await Promise.all(lista.map((v, i) => q(sb.from('vueltas').update({ recorrido_id: r.id, orden: i + 1, pospuesta: false, ...(v.fecha !== fecha || v.estado === 'no_hecha' ? { fecha, estado: 'pendiente' } : {}) }).eq('id', v.id))))
  }
  const accion = async (fn, msg) => {
    setOcupado(true); setError(''); setOk('')
    try { await fn(); if (msg) setOk(msg); await cargar() } catch (e) { setError(e.message) }
    setOcupado(false)
  }
  const sacarTodas = (veh) => {
    if (!window.confirm(`¿Sacar las vueltas pendientes de ${nombreRuta(veh).toLowerCase()} para reorganizar? Vuelven a "Sin asignar".`)) return
    accion(async () => { await Promise.all(deVeh(veh).filter((v) => v.estado === 'pendiente').map((v) => q(sb.from('vueltas').update({ recorrido_id: null, orden: null }).eq('id', v.id)))) }, 'Vueltas devueltas a Sin asignar.')
  }
  const mover = (v, destino) => accion(async () => {
    if (!destino || destino === 'pospuesta' || destino === 'retomar') {
      await q(sb.from('vueltas').update({ recorrido_id: null, orden: null, pospuesta: destino === 'pospuesta' }).eq('id', v.id)); return
    }
    await guardarOrden(destino, [...deVeh(destino).filter((x) => x.id !== v.id), v])
  })
  const subir = (veh, i, dir) => accion(async () => {
    const l = [...deVeh(veh)]; const j = i + dir
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    await guardarOrden(veh, l)
  })
  const pendDe = (k) => deVeh(k).filter((v) => v.estado === 'pendiente'), fijasDe = (k) => deVeh(k).filter((v) => v.estado !== 'pendiente')
  // Las vueltas ya hechas (o que no se pudieron) no se reordenan: quedan de primeras, como pasaron
  const ordenar = (veh) => accion(() => guardarOrden(veh, [...fijasDe(veh), ...ordenarParadas(pendDe(veh), planta, cfgRuta[veh] || cfg, fecha)]), 'Paradas ordenadas según la hora pedida, el horario de recepción de cada sitio, el almuerzo y la cercanía.')
  // La propuesta usa la última ruta abierta (sin confirmar) del camión y del mensajero
  const abierta = (veh) => { const ks = cols.filter((c) => vehDe(c) === veh && !bloqueado(c)); return ks[ks.length - 1] || null }
  const proponer = () => accion(async () => {
    const kc = abierta('camion'), km = 'mensajero:1' // lo que no cabe en el camión se pide como servicio contratado
    const libres = [...sinAsignar, ...(kc ? pendDe(kc) : []), ...(km ? pendDe(km) : [])]
    const p = proponerAsignacion(libres, planta, (kc && cfgRuta[kc]) || cfg, fecha)
    if (kc) await guardarOrden(kc, [...fijasDe(kc), ...p.camion])
    else p.mensajero.unshift(...p.camion)
    if (km && p.mensajero.length) await guardarOrden(km, [...fijasDe(km), ...p.mensajero])
  }, 'Asignación propuesta: el camión se llena primero mientras llegue a tiempo a cada sitio y regrese antes de su hora de fin; lo demás queda para pedir como servicio contratado. Revísala y confirma la ruta del camión.')
  // El camión está en la planta a cierta hora: lo hecho queda en su ruta y lo pendiente se vuelve a programar desde la hora en que puede volver a salir
  const [verEnPlanta, setVerEnPlanta] = useState(false)
  const [wa, setWa] = useState(null) // ruta (o vuelta) para mandar por WhatsApp
  const [tplWa] = usePlantillasWa()
  const replanificar = ({ enPlanta, sale, almorzo }) => accion(async () => {
    const rutas = cols.filter((c) => vehDe(c) === 'camion' && rec(c))
    const ult = Math.max(0, ...rutas.filter((k) => fijasDe(k).length).map(numDe))
    const pend = rutas.flatMap(pendDe)
    if (ult) await q(sb.from('recorridos').update({ en_planta: enPlanta }).eq('id', rec(`camion:${ult}`).id))
    const destino = `camion:${ult + 1}`
    await Promise.all(pend.map((v) => q(sb.from('vueltas').update({ recorrido_id: null, orden: null }).eq('id', v.id))))
    // Rutas posteriores que quedan vacías se quitan
    for (const k of rutas) if (numDe(k) > ult + 1) await q(sb.from('recorridos').delete().eq('id', rec(k).id))
    const [r] = await q(sb.from('recorridos').upsert({ fecha, vehiculo: 'camion', numero: ult + 1, salida: sale, ya_almorzo: almorzo, en_planta: null, estado: 'borrador' }, { onConflict: 'fecha,vehiculo,numero' }).select())
    const p = proponerAsignacion([...pend, ...sinAsignar], planta, { ...cfg, salida: sale, ...(almorzo ? { almuerzo_min: 0 } : {}) }, fecha)
    await Promise.all(p.camion.map((v, i) => q(sb.from('vueltas').update({ recorrido_id: r.id, orden: i + 1, pospuesta: false, ...(v.fecha !== fecha || v.estado === 'no_hecha' ? { fecha, estado: 'pendiente' } : {}) }).eq('id', v.id))))
    setOk(`Ruta recalculada: ${nombreRuta(destino)} sale a las ${h12(sale)} con ${p.camion.length} ${p.camion.length === 1 ? 'vuelta' : 'vueltas'}.${p.mensajero.length ? ` ${p.mensajero.length} no alcanzan en el camión y quedaron en "Sin asignar" (pásalas a servicio contratado o a otro día).` : ''} Revísala y confírmala para que la vea el conductor.`)
    setVerEnPlanta(false)
  })
  const confirmar = (veh, si) => accion(async () => {
    const r = await asegurarRec(veh)
    await q(sb.from('recorridos').update(si ? { estado: 'confirmada', confirmada_por: perfil?.user_id, confirmada_en: new Date().toISOString() } : { estado: 'borrador' }).eq('id', r.id))
  }, si ? `${nombreRuta(veh)} confirmada: ya la ve el conductor en su celular.` : 'La ruta volvió a borrador.')
  const guardarSalida = (k, h) => accion(async () => { const r = await asegurarRec(k); await q(sb.from('recorridos').update({ salida: h || null }).eq('id', r.id)) })
  // Quitar una ruta vacía; las rutas siguientes del mismo vehículo se renumeran
  const eliminarRuta = (k) => {
    if (deVeh(k).length) return
    const r = rec(k)
    setExtraCols(extraCols.filter((c) => c !== k))
    if (!r) return
    accion(async () => {
      await q(sb.from('recorridos').delete().eq('id', r.id))
      const despues = (d?.recs || []).filter((x) => x.vehiculo === vehDe(k) && (x.numero || 1) > numDe(k)).sort((a, b) => a.numero - b.numero)
      for (const x of despues) await q(sb.from('recorridos').update({ numero: x.numero - 1 }).eq('id', x.id))
      setExtraCols([])
    }, `${nombreRuta(k)} eliminada.`)
  }
  const guardarRec = (k, cambios) => accion(async () => { const r = await asegurarRec(k); await q(sb.from('recorridos').update(cambios).eq('id', r.id)) })
  const marcarHecha = (v, si) => accion(() => q(sb.from('vueltas').update(si ? { estado: 'hecha', hecha_en: new Date().toISOString() } : { estado: 'pendiente', hecha_en: null }).eq('id', v.id)), si ? `${v.destino}: hecha.` : '')
  // Conductores registrados: primero el de la empresa (predeterminado), luego los de reemplazo
  const conductores = transps.filter((t) => esConductor(t.tipo) && t.activo !== false).sort((a, b) => (a.tipo === 'conductor_empresa' ? 0 : 1) - (b.tipo === 'conductor_empresa' ? 0 : 1) || a.nombre.localeCompare(b.nombre))
  const condPred = conductores.find((t) => t.tipo === 'conductor_empresa')?.nombre || cfg.conductor || ''
  const telConductor = (nom) => conductores.find((x) => x.nombre === nom)?.telefono || (nom && nom === cfg.conductor ? cfg.conductor_tel : '') || ''
  const guardarConductor = (veh, nombre) => accion(async () => { const r = await asegurarRec(veh); await q(sb.from('recorridos').update({ conductor: nombre.trim() || null }).eq('id', r.id)) })

  // Columnas: camión y mensajero (ruta 1) siempre; las rutas que existan ese día; y las que se agreguen
  const [extraCols, setExtraCols] = useState([])
  useEffect(() => { setExtraCols([]) }, [fecha])
  const ordenVeh = Object.keys(VEHICULOS)
  const cols = [...new Set(['camion:1', 'mensajero:1', ...(d?.recs || []).map((r) => `${r.vehiculo}:${r.numero || 1}`), ...extraCols])]
    .sort((a, b) => ordenVeh.indexOf(vehDe(a)) - ordenVeh.indexOf(vehDe(b)) || numDe(a) - numDe(b))
  const rutasDe = (veh) => cols.filter((c) => vehDe(c) === veh)
  const nombreRuta = (k) => vehDe(k) === 'externo' ? `Ruta contratada ${numDe(k)}` : `${VEHICULOS[vehDe(k)]}${rutasDe(vehDe(k)).length > 1 || numDe(k) > 1 ? ` · Ruta ${numDe(k)}` : ''}`
  const otraRuta = (veh) => { const n = Math.max(0, ...rutasDe(veh).map(numDe)) + 1; setExtraCols([...extraCols, `${veh}:${n}`]) }
  // Costo del día en servicios contratados: rutas contratadas + vueltas sueltas
  const costoDia = (d?.recs || []).filter((r) => r.vehiculo === 'externo').reduce((s, r) => s + Number(r.valor || 0), 0)
    + (d?.vs || []).filter((v) => v.recorridos?.vehiculo === 'mensajero' && v.fecha === fecha).reduce((s, v) => s + Number(v.valor || 0), 0)
  // Hora de salida de cada ruta: la que se puso; si no, la ruta 1 sale a la hora de salida y las siguientes cuando regresa la anterior del mismo vehículo
  // Hoy, una ruta que todavía no ha arrancado no puede salir en una hora que ya pasó: sale desde ahora
  const [reloj, setReloj] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setReloj(new Date()), 60000); return () => clearInterval(t) }, [])
  const ahoraMin = fecha === hoyCO() ? Math.ceil((reloj.getHours() * 60 + reloj.getMinutes()) / 5) * 5 : null
  const cfgRuta = {}, estRuta = {}
  for (const k of cols) {
    const r = rec(k), prev = cols.filter((c) => vehDe(c) === vehDe(k) && numDe(c) < numDe(k)).pop()
    const salida = r?.salida ? String(r.salida).slice(0, 5) : prev && estRuta[prev] && deVeh(prev).length ? hm(estRuta[prev].regreso + (Number(cfg.min_descargue) || 15)) : cfg.salida
    // Si en una ruta anterior del mismo vehículo ya almorzó, en esta no se vuelve a contar el almuerzo
    const yaAlmorzo = cols.some((c) => vehDe(c) === vehDe(k) && numDe(c) < numDe(k) && estRuta[c]?.sim?.almuerzo !== null && deVeh(c).length)
    cfgRuta[k] = vehDe(k) === 'externo'
      // Ruta con un transportador contratado: sin almuerzo ni hora de fin del camión
      ? { ...cfg, salida: r?.salida ? String(r.salida).slice(0, 5) : cfg.salida, almuerzo_min: 0, fin: '23:59' }
      : { ...cfg, salida, ...(yaAlmorzo || r?.ya_almorzo ? { almuerzo_min: 0 } : {}) }
    const arrancada = rec(k)?.estado === 'confirmada' || deVeh(k).some((v) => v.estado !== 'pendiente')
    if (ahoraMin !== null && !arrancada && aMin(cfgRuta[k].salida) < ahoraMin) cfgRuta[k] = { ...cfgRuta[k], salida: hm(ahoraMin), desdeAhora: true }
    estRuta[k] = d ? estimar(deVeh(k), planta, cfgRuta[k], fecha) : null
    // Si se indicó la hora real en que el camión quedó en la planta, esa manda
    if (estRuta[k] && r?.en_planta) estRuta[k] = { ...estRuta[k], regreso: aMin(String(r.en_planta).slice(0, 5)), real: true }
  }

  return (
    <div>
      <div className="filtros">
        <div className="barra-fechas">
          <button className="btn btn-sec btn-sm" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</button>
          <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          <button className="btn btn-sec btn-sm" onClick={() => setFecha(sumarDias(fecha, 1))}>›</button>
          <b className="fecha-larga">{diaTxt(fecha)}</b>
        </div>
        <button className="btn btn-sec" onClick={() => setForm({ fecha })}>+ Vuelta</button>
        <button className="btn" disabled={ocupado || !aj || !d} onClick={proponer} title="Llena primero el camión mientras cumpla los horarios; lo demás queda como servicio contratado">Proponer asignación</button>
        <button className="btn btn-sec" disabled={!d} onClick={() => otraRuta('externo')} title="Arma una ruta con varias vueltas para un transportador contratado (mensajero, carro o camión externo)">+ Ruta contratada</button>
        <button className="btn btn-sec" disabled={ocupado || !aj || !d} onClick={() => setVerEnPlanta(true)} title="Cambió la ruta en el día: indica a qué hora está el camión en la planta y desde qué hora puede volver a salir">🏭 Camión en la planta…</button>
        <button className="btn-link" onClick={() => setVerAjustes(true)}>Punto de salida y horarios</button>
      </div>
      {aj && !planta && <Aviso tipo="warn">Falta la ubicación de la planta (punto de salida). Sin ella no se puede calcular el orden ni el tiempo de viaje. <button className="btn-link" onClick={() => setVerAjustes(true)}>Configurarla</button></Aviso>}
      {costoDia > 0 && <div className="tenue pequeño">Servicios contratados del día: <b>${fmtNum(costoDia, 0)}</b></div>}
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <datalist id="lista-conductores">{conductores.map((t) => <option key={t.id} value={t.nombre}>{t.telefono || ''}</option>)}</datalist>
      {!d || !aj ? <Cargando /> : (
        <div className="log-columnas" style={{ gridTemplateColumns: `repeat(${cols.length + 1}, minmax(260px, 1fr))` }}>
          <div className="log-col">
            <div className="log-col-cab"><b>Sin asignar</b><span className="tenue pequeño">{sinAsignar.length} {sinAsignar.length === 1 ? 'vuelta' : 'vueltas'}</span></div>
            {sinAsignar.length === 0 ? <div className="vacio pequeño">Nada pendiente.</div> : sinAsignar.map((v) => (
              <Parada key={v.id} v={v} fecha={fecha} cfg={cfg} onAbrir={() => setForm(v)}
                acciones={<select value="" disabled={ocupado} onChange={(e) => mover(v, e.target.value)}><option value="">Asignar a…</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{nombreRuta(c)}</option>)}<option value="pospuesta">No programar por ahora</option></select>} />
            ))}
            {pospuestas.length > 0 && (
              <div className="log-pospuestas">
                <button className="btn-link" onClick={() => setVerPosp(!verPosp)}>{verPosp ? '▾' : '▸'} No programar por ahora ({pospuestas.length})</button>
                {verPosp && pospuestas.map((v) => (
                  <Parada key={v.id} v={v} fecha={fecha} cfg={cfg} onAbrir={() => setForm(v)}
                    acciones={<select value="" disabled={ocupado} onChange={(e) => mover(v, e.target.value)}><option value="">Programar en…</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{nombreRuta(c)}</option>)}<option value="retomar">Volver a Sin asignar</option></select>} />
                ))}
              </div>
            )}
          </div>
          {cols.map((veh) => {
            if (vehDe(veh) === 'mensajero') return (
              <ColContratados key={veh} tplWa={tplWa} planta={planta} titulo={nombreRuta(veh)} ps={deVeh(veh)} fecha={fecha} cfg={cfg} transps={transps} ocupado={ocupado}
                onAbrir={setForm} onAccion={accion} onSacar={(v, destino) => mover(v, destino)} destinos={cols.filter((c) => c !== veh && !bloqueado(c)).map((c) => [c, nombreRuta(c)])} />
            )
            const ps = deVeh(veh), r = rec(veh), conf = r?.estado === 'confirmada', contratada = vehDe(veh) === 'externo'
            const est = estRuta[veh], cr = cfgRuta[veh]
            const pasa = !contratada && est.regreso > aMin(cfg.fin)
            const zonas = Object.entries(ps.reduce((g, v) => { const z = zonaTxt(v) || 'Sin zona'; g[z] = (g[z] || 0) + 1; return g }, {}))
            const links = linksRecorrido(ps, planta)
            const nombresDe = (ids) => ids.map((id) => ps.find((x) => x.id === id)?.destino).filter(Boolean).join(', ')
            return (
              <div key={veh} className={`log-col${conf ? ' confirmada' : ''}${contratada ? ' contratado' : ''}`}>
                <div className="log-col-cab">
                  <b>{nombreRuta(veh)}</b>
                  {contratada ? <span className="badge badge-info">Servicio contratado</span> : <span className={`badge ${conf ? 'badge-info' : 'badge-muted'}`}>{conf ? 'Confirmada' : 'Borrador'}</span>}
                </div>
                <div className="log-est">
                  {ps.length} {ps.length === 1 ? 'parada' : 'paradas'}{ps.length > 0 && <> · sale {h12(cr.salida)}{cr.desdeAhora ? ' (desde ahora)' : ''}{contratada ? ` · termina ≈ ${h12(hm(est.sim.pasos.length ? est.sim.pasos[est.sim.pasos.length - 1].sale : aMin(cr.salida)))}` : <> · {est.real ? 'en la planta' : 'regresa ≈'} <b className={pasa ? 't-mal' : ''}>{hm(est.regreso)}</b></>}</>}{planta && est.km ? ` · ${fmtNum(est.km, 0)} km` : ''}
                  {zonas.length > 0 && <div className="log-zonas">{zonas.map(([z, n]) => <span key={z} className={`zona z-${z.toLowerCase().replace(' ', '-')}`}>{z} {n}</span>)}</div>}
                  {!contratada && ps.length > 0 && est.sim.almuerzo !== null && <div className="tenue pequeño">🍽 almuerzo ≈ {hm(est.sim.almuerzo)}</div>}
                  {pasa && <div className="t-mal pequeño">Regresa después de su hora de fin ({cfg.fin}): mueve algo a otro vehículo o a otro día.</div>}
                  {est.sinUbic > 0 && ps.length > 0 && <div className="tenue pequeño">{est.sinUbic} sin ubicación: el tiempo es aproximado.</div>}
                  {est.problemas > 0 && <div className="t-mal pequeño">{est.problemas === 1 ? 'Una parada queda' : `${est.problemas} paradas quedan`} fuera de su horario: usa "Ordenar", pásala a otro vehículo o a otro día.</div>}
                </div>
                <div className="log-ruta-datos">
                  {contratada ? <DatosContratada r={r} transps={transps} ocupado={ocupado} onGuardar={(cambios) => guardarRec(veh, cambios)} /> : <>
                  {/* El conductor se puede cambiar aunque la ruta esté confirmada (p. ej. si el conductor se incapacita) */}
                  {(() => {
                    const actual = r?.conductor || condPred
                    return (<>
                      <select className="log-conductor" value={actual} disabled={ocupado} onChange={(e) => guardarConductor(veh, e.target.value)} title="El conductor de la empresa sale por defecto; se puede cambiar por otro conductor registrado en Transportadores">
                        <option value="">Conductor…</option>
                        {conductores.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}{t.tipo === 'conductor_empresa' ? ' (empresa)' : ''}</option>)}
                        {actual && !conductores.some((t) => t.nombre === actual) && <option value={actual}>{actual}</option>}
                      </select>
                      {telConductor(actual) && <a className="btn btn-sec btn-sm" href={telLink(telConductor(actual))}>Llamar</a>}
                    </>)
                  })()}
                  </>}
                  <label className="pequeño" title="Si no se pone, la ruta 1 sale a la hora de salida y las siguientes cuando regresa la anterior">Sale<SelectorHora value={r?.salida ? String(r.salida).slice(0, 5) : ''} vacio={contratada ? `(${h12(cr.salida)})` : `Auto (${h12(cr.salida)})`} onChange={(h) => !conf && guardarSalida(veh, h)} /></label>
                </div>
                {ps.length > 0 && <PuntoPlanta tipo="sale" hora={aMin(cr.salida)} lleva={nombresDe(est.sim.alSalir)} sinPlanta={!planta} />}
                {ps.map((v, i) => (<Fragment key={v.id}>
                  {v.recoger_planta && (!planta || est.sim.pasos[i]?.carga) && <ParadaPlanta motivo="recoger" v={v} paso={est.sim.pasos[i]} sinPlanta={!planta} nombres={nombresDe(est.sim.pasos[i]?.carga?.lleva || [v.id])} />}
                  <Parada v={v} n={i + 1} fecha={fecha} paso={est.sim.pasos[i]} onAbrir={() => setForm(v)}
                    acciones={<>
                      {v.estado === 'pendiente'
                        ? <button className="btn btn-ok btn-sm" disabled={ocupado} onClick={() => marcarHecha(v, true)}>Hecha</button>
                        : v.estado === 'hecha' && <button className="btn-link" disabled={ocupado} onClick={() => marcarHecha(v, false)}>Deshacer</button>}
                      {!conf && <>
                      {contratada && v.estado === 'pendiente' && <a className="btn btn-sec btn-sm" href={linkUber(v, planta)} target="_blank" rel="noreferrer" title="Abre Uber con la recogida y el destino de esta vuelta">🚗 Uber</a>}
                      <button className="btn-icono" disabled={ocupado || i === 0} onClick={() => subir(veh, i, -1)} title="Subir">↑</button>
                      <button className="btn-icono" disabled={ocupado || i === ps.length - 1} onClick={() => subir(veh, i, 1)} title="Bajar">↓</button>
                      <select value={veh} disabled={ocupado} onChange={(e) => mover(v, e.target.value)}>
                        <option value="">Sacar de la ruta</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{nombreRuta(c)}</option>)}<option value="pospuesta">No programar por ahora</option>
                      </select>
                      <button className="btn-link peligro" disabled={ocupado} onClick={() => mover(v, '')} title="Vuelve a Sin asignar">Sacar</button>
                      </>}
                    </>} />
                  {v.volver_planta && <ParadaPlanta motivo="dejar" v={v} paso={est.sim.pasos[i]} sinPlanta={!planta} nombres={nombresDe(est.sim.pasos[i]?.vuelve?.lleva || [])} />}
                </Fragment>))}
                {!contratada && ps.length > 0 && <PuntoPlanta tipo="regresa" hora={est.regreso} real={est.real} tarde={pasa} fin={cfg.fin} sinPlanta={!planta} />}
                <div className="log-col-pie">
                  {ps.length === 0 && (numDe(veh) > 1 || contratada || rec(veh)) && !(veh === 'camion:1' && !rec(veh)) && <button className="btn-link peligro" disabled={ocupado} onClick={() => eliminarRuta(veh)} title="Quita esta ruta vacía">Eliminar ruta</button>}
                  {!conf && ps.length > 1 && <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => ordenar(veh)}>Ordenar</button>}
                  {!conf && ps.some((x) => x.estado === 'pendiente') && <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => sacarTodas(veh)} title="Pasa a Sin asignar todas las vueltas pendientes de esta ruta, para reorganizar">Sacar todas</button>}
                  {conf && <span className="tenue pequeño">Para sacar o mover vueltas, vuelve la ruta a borrador.</span>}
                  {ps.length > 0 && <button className="btn btn-sec btn-sm" onClick={() => {
                    const tel = contratada ? transps.find((x) => x.id === r?.transportador_id)?.telefono
                      : telConductor(r?.conductor || condPred)
                    const nombre = contratada ? transps.find((x) => x.id === r?.transportador_id)?.nombre : (r?.conductor || condPred)
                    const pend = ps.filter((x) => x.estado === 'pendiente')
                    setWa({ titulo: nombreRuta(veh), tel: tel || '', nombre: nombre || '', resumen: mensajeResumen(pend, { titulo: nombreRuta(veh), salida: cr.salida, planta }, tplWa.resumen),
                      mensajes: pend.map((x, j) => ({ id: x.id, destino: x.destino, texto: mensajeVuelta(x, { n: j + 1, total: pend.length, titulo: nombreRuta(veh), paso: est.sim.pasos[ps.indexOf(x)] }, tplWa.vuelta) })) })
                  }} title="Manda la ruta por WhatsApp: un mensaje por cada vuelta con dirección y ubicación en Maps">📲 WhatsApp</button>}
                  {links.map((l, i) => <a key={l} className="btn btn-sec btn-sm" href={l} target="_blank" rel="noreferrer">Ver en Google Maps{links.length > 1 ? ` (${i + 1})` : ''}</a>)}
                  {!contratada && ps.length > 0 && (conf
                    ? <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => confirmar(veh, false)}>Volver a borrador</button>
                    : <button className="btn btn-sm" disabled={ocupado} onClick={() => confirmar(veh, true)}>Confirmar ruta</button>)}
                  {!contratada && numDe(veh) === Math.max(...rutasDe(vehDe(veh)).map(numDe)) && <button className="btn-link" onClick={() => otraRuta(vehDe(veh))} title="Otra salida del mismo vehículo más tarde en el día">+ Otra ruta</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {form && <FormVuelta inicial={form} lugares={lugares} perfil={perfil} gestor
        onClose={() => setForm(null)} onGuardado={() => { setForm(null); cargar(); onLugares() }} />}
      {wa && <EnviarWhatsApp {...wa} onClose={() => setWa(null)} />}
      {verEnPlanta && <CamionEnPlanta cfg={cfg} fecha={fecha} hechas={cols.filter((c) => vehDe(c) === 'camion').reduce((n, k) => n + fijasDe(k).length, 0)}
        pendientes={cols.filter((c) => vehDe(c) === 'camion').reduce((n, k) => n + pendDe(k).length, 0) + sinAsignar.length} ocupado={ocupado}
        onClose={() => setVerEnPlanta(false)} onAceptar={replanificar} />}
      {verAjustes && aj && <AjustesLogistica aj={aj} onClose={() => setVerAjustes(false)} onGuardado={() => { setVerAjustes(false); cargarAj() }} />}
    </div>
  )
}

// Servicios contratados: cada vuelta se pide por aparte al transportador, cuando se necesite (sin ruta ni horario del camión)
function ColContratados({ tplWa, planta, titulo, ps, fecha, cfg, transps, ocupado, onAbrir, onAccion, onSacar, destinos }) {
  const activos = transps.filter((t) => t.activo !== false && !esConductor(t.tipo))
  const asignar = (v, id) => onAccion(() => q(sb.from('vueltas').update({ transportador_id: id || null }).eq('id', v.id)))
  const hecha = (v, si) => onAccion(() => q(sb.from('vueltas').update(si ? { estado: 'hecha', hecha_en: new Date().toISOString() } : { estado: 'pendiente', hecha_en: null }).eq('id', v.id)), si ? `${v.destino}: hecha.` : '')
  const pend = ps.filter((v) => v.estado === 'pendiente').length
  return (
    <div className="log-col contratado">
      <div className="log-col-cab"><b>{titulo}</b><span className="tenue pequeño">{pend} por hacer · {ps.length - pend} hechas</span></div>
      <div className="tenue pequeño log-est">Se piden cuando se necesiten a un transportador (mensajero, carro, camión externo). No siguen la ruta ni el horario del camión.</div>
      {ps.length === 0 && <div className="vacio pequeño">Asigna aquí desde "Sin asignar" las vueltas que se van a pedir a un servicio.</div>}
      {ps.map((v) => {
        const t = transps.find((x) => x.id === v.transportador_id)
        return (
          <Parada key={v.id} v={v} fecha={fecha} cfg={cfg} onAbrir={() => onAbrir(v)}
            acciones={<div className="contratado-acc">
              <select value={v.transportador_id || ''} disabled={ocupado} onChange={(e) => asignar(v, e.target.value)}>
                <option value="">Transportador…</option>{activos.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.tipo ? ` (${TIPOS_TRANSPORTE[x.tipo] || x.tipo}${x.tamano ? ` ${x.tamano}` : ''})` : ''}</option>)}
              </select>
              {t?.telefono && <a className="btn btn-sec btn-sm" href={telLink(t.telefono)}>Llamar</a>}
              {v.estado === 'pendiente' && <a className="btn btn-sec btn-sm" href={linkWhatsApp(t?.telefono, mensajeVuelta(v, { titulo: 'Servicio contratado' }, tplWa.vuelta))} target="_blank" rel="noreferrer" title="Manda esta vuelta por WhatsApp al transportador">📲 WhatsApp</a>}
              {v.estado === 'pendiente' && <a className="btn btn-sec btn-sm" href={linkUber(v, planta)} target="_blank" rel="noreferrer" title="Abre Uber con la recogida y el destino puestos; eliges el servicio (Envíos, moto, carro) y confirmas allá">🚗 Uber</a>}
              <CampoValor valor={v.valor} disabled={ocupado} onGuardar={(n) => onAccion(() => q(sb.from('vueltas').update({ valor: n }).eq('id', v.id)))} />
              {v.estado === 'pendiente'
                ? <button className="btn btn-ok btn-sm" disabled={ocupado} onClick={() => hecha(v, true)}>Hecha</button>
                : v.estado === 'hecha' && <button className="btn-link" disabled={ocupado} onClick={() => hecha(v, false)}>Deshacer</button>}
              <select value="" disabled={ocupado} onChange={(e) => onSacar(v, e.target.value)}>
                <option value="">Mover…</option>{destinos.map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="retomar">Sacar (a Sin asignar)</option><option value="pospuesta">No programar por ahora</option>
              </select>
            </div>} />
        )
      })}
    </div>
  )
}

// Mandar una ruta por WhatsApp: un resumen opcional y un mensaje independiente por cada vuelta
function EnviarWhatsApp({ titulo, tel: tel0, nombre, resumen, mensajes, onClose }) {
  const [tel, setTel] = useState(tel0)
  const [enviados, setEnviados] = useState({})
  const [ver, setVer] = useState(null)
  const marca = (k) => setEnviados((e) => ({ ...e, [k]: true }))
  const fila = (k, etiqueta, texto) => (
    <div key={k} className={`wa-fila${enviados[k] ? ' enviado' : ''}`}>
      <div className="crece"><b>{etiqueta}</b>{enviados[k] && <span className="badge badge-ok">Enviado</span>}
        <div><button type="button" className="btn-link pequeño" onClick={() => setVer(ver === k ? null : k)}>{ver === k ? 'Ocultar mensaje' : 'Ver mensaje'}</button></div>
        {ver === k && <pre className="wa-texto">{texto}</pre>}
      </div>
      <a className={`btn btn-sm ${enviados[k] ? 'btn-sec' : ''}`} href={linkWhatsApp(tel, texto)} target="_blank" rel="noreferrer" onClick={() => marca(k)}>{enviados[k] ? 'Reenviar' : 'Enviar'}</a>
    </div>
  )
  return (
    <Modal titulo={`WhatsApp · ${titulo}`} onClose={onClose} ancho={620}>
      <div className="form">
        <label>Celular de {nombre || 'quien hace la ruta'}<input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="3001234567 (si se deja vacío, WhatsApp pide elegir el contacto)" /></label>
        <p className="tenue pequeño">Cada botón abre WhatsApp con el mensaje listo: lo envías allá y vuelves aquí para el siguiente. Cada vuelta va en un mensaje aparte, con la dirección y el link de Google Maps.</p>
        {mensajes.length === 0 ? <div className="vacio">No hay vueltas pendientes en esta ruta.</div> : <>
          {fila('resumen', 'Resumen de la ruta (opcional)', resumen)}
          {mensajes.map((m, i) => fila(m.id, `${i + 1}. ${m.destino}`, m.texto))}
        </>}
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cerrar</button></div>
      </div>
    </Modal>
  )
}

// Valor pagado por un servicio contratado (se guarda al salir del campo)
function CampoValor({ valor, disabled, onGuardar }) {
  return (
    <label className="campo-valor" title="Cuánto valió el servicio">$
      <input type="number" min="0" step="500" inputMode="numeric" placeholder="Valor" defaultValue={valor ?? ''} key={valor ?? ''} disabled={disabled}
        onBlur={(e) => { const n = e.target.value === '' ? null : Number(e.target.value); if (n !== (valor ?? null)) onGuardar(n) }} />
    </label>
  )
}

// Datos de una ruta contratada: quién la hace (transportador) y cuánto vale todo el recorrido
function DatosContratada({ r, transps, ocupado, onGuardar }) {
  const t = transps.find((x) => x.id === r?.transportador_id)
  return (
    <div className="contratado-acc">
      <select value={r?.transportador_id || ''} disabled={ocupado} onChange={(e) => onGuardar({ transportador_id: e.target.value || null })}>
        <option value="">Transportador…</option>
        {transps.filter((x) => x.activo !== false && !esConductor(x.tipo)).map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.tipo ? ` (${TIPOS_TRANSPORTE[x.tipo] || x.tipo}${x.tamano ? ` ${x.tamano}` : ''})` : ''}</option>)}
      </select>
      {t?.telefono && <a className="btn btn-sec btn-sm" href={telLink(t.telefono)}>Llamar</a>}
      <CampoValor valor={r?.valor} disabled={ocupado} onGuardar={(n) => onGuardar({ valor: n })} />
    </div>
  )
}

// Transportadores recurrentes (mensajeros y servicios de transporte que se contratan)
function Transportadores({ lista, onCambio, gestor }) {
  const [form, setForm] = useState(null)
  const [verMensajes, setVerMensajes] = useState(false)
  const [verInactivos, setVerInactivos] = useState(false)
  if (!lista) return <Cargando />
  const ls = lista.filter((t) => verInactivos || t.activo !== false)
  return (
    <div>
      <div className="filtros">
        <span className="tenue">Mensajeros y servicios de transporte que se contratan seguido, y conductores que pueden manejar el camión de la empresa. Los servicios se eligen en las vueltas de "Servicio contratado"; los conductores, en el campo Conductor de cada ruta del camión.</span>
        <label className="check pequeño"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos</label>
        {gestor && <button className="btn btn-sec" onClick={() => setVerMensajes(true)}>✏️ Mensajes de WhatsApp</button>}
        <button className="btn" onClick={() => setForm({ tipo: 'moto' })}>+ Agregar</button>
      </div>
      {ls.length === 0 ? <div className="vacio">No hay transportadores guardados.</div> : (
        <table className="tabla tabla-click">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Tamaño</th><th>Contacto</th><th>Teléfono</th><th>Notas</th></tr></thead>
          <tbody>{ls.map((t) => (
            <tr key={t.id} onClick={() => setForm(t)} className={t.activo === false ? 'omitida' : ''}>
              <td><b>{t.nombre}</b></td><td>{TIPOS_TRANSPORTE[t.tipo] || t.tipo || '—'}</td><td>{t.tamano}</td><td>{t.contacto}</td>
              <td>{t.telefono && <a href={telLink(t.telefono)} onClick={(e) => e.stopPropagation()}>{t.telefono}</a>}</td><td className="tenue pequeño">{t.notas}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {verMensajes && <EditorMensajesWa onClose={() => setVerMensajes(false)} />}
      {form && <FormTransportador inicial={form} onClose={() => setForm(null)} onGuardado={() => { setForm(null); onCambio() }} />}
    </div>
  )
}
// Personalizar los mensajes de WhatsApp que se mandan a conductores y transportadores
const EJEMPLO_WA = { tipo: 'entrega', destino: 'Helados Yom Yom', direccion: 'Cra. 46 # 48C Sur', municipio: 'Envigado', lat: 6.17, lng: -75.59, descripcion: 'Llevar ADH huellitas', op: '3904',
  contacto: 'Ana', telefono: '3001234567', recepcion: [{ d: [1, 2, 3, 4, 5], a: '07:30', b: '16:00' }], franja: 'manana', recoger_planta: true, fecha: '2026-11-12' }
function EditorMensajesWa({ onClose }) {
  const [tpl, cargar] = usePlantillasWa()
  const [f, setF] = useState(null)
  const [cual, setCual] = useState('vuelta')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => { if (!f) setF({ vuelta: tpl.vuelta || PLANTILLA_VUELTA, resumen: tpl.resumen || PLANTILLA_RESUMEN }) }, [tpl]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(null)
  if (!f) return null
  const campos = cual === 'vuelta' ? CAMPOS_VUELTA : CAMPOS_RESUMEN
  const insertar = (c) => {
    const el = ref.current, t = f[cual], i = el ? el.selectionStart : t.length, j = el ? el.selectionEnd : t.length
    setF({ ...f, [cual]: t.slice(0, i) + `{${c}}` + t.slice(j) })
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = i + c.length + 2 } }, 0)
  }
  const guardar = async () => {
    setError(''); setOk(false)
    try {
      await q(sb.from('ajustes').upsert({ clave: 'whatsapp', valor: { vuelta: f.vuelta.trim() === PLANTILLA_VUELTA ? null : f.vuelta, resumen: f.resumen.trim() === PLANTILLA_RESUMEN ? null : f.resumen } }))
      await cargar(); setOk(true)
    } catch (e) { setError(e.message) }
  }
  const vista = cual === 'vuelta'
    ? mensajeVuelta(EJEMPLO_WA, { n: 1, total: 3, titulo: 'Ruta contratada 1', paso: { llega: 7 * 60 + 29 } }, f.vuelta)
    : mensajeResumen([EJEMPLO_WA, { ...EJEMPLO_WA, destino: 'PVZ SAS Carolina', municipio: 'Medellín' }], { titulo: 'Ruta contratada 1', salida: '11:30' }, f.resumen)
  return (
    <Modal titulo="Mensajes de WhatsApp" onClose={onClose} ancho={860}>
      <div className="form">
        <div className="segmentado">
          <button className={cual === 'vuelta' ? 'sel' : ''} onClick={() => setCual('vuelta')}>Mensaje de cada vuelta</button>
          <button className={cual === 'resumen' ? 'sel' : ''} onClick={() => setCual('resumen')}>Resumen de la ruta</button>
        </div>
        <p className="tenue pequeño">Escribe el mensaje como quieres que le llegue al conductor. Los datos de cada vuelta se ponen con los campos entre llaves (toca uno para insertarlo donde está el cursor). Si un renglón tiene campos y todos quedan vacíos, ese renglón no se envía. *texto* sale en negrilla en WhatsApp.</p>
        <div className="wa-campos">{campos.map(([c, d]) => <button key={c} type="button" className="chip" title={d} onClick={() => insertar(c)}>{`{${c}}`} <span className="tenue">{d}</span></button>)}</div>
        <div className="wa-editor">
          <label className="crece">Plantilla<textarea ref={ref} rows={14} value={f[cual]} onChange={(e) => { setF({ ...f, [cual]: e.target.value }); setOk(false) }} /></label>
          <div className="crece"><div className="pequeño"><b>Así le llega (ejemplo)</b></div><pre className="wa-texto">{vista}</pre></div>
        </div>
        <Aviso>{error}</Aviso>{ok && <Aviso tipo="ok">Mensajes guardados. Se usan desde ya en todas las rutas.</Aviso>}
        <div className="acciones">
          <button type="button" className="btn-link" onClick={() => setF({ ...f, [cual]: cual === 'vuelta' ? PLANTILLA_VUELTA : PLANTILLA_RESUMEN })}>Restaurar el predeterminado</button>
          <button type="button" className="btn btn-sec" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

function FormTransportador({ inicial, onClose, onGuardado }) {
  const [f, setF] = useState({ nombre: '', tipo: 'moto', tamano: '', contacto: '', telefono: '', notas: '', ...Object.fromEntries(Object.entries(inicial).filter(([, v]) => v !== null)) })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const guardar = async (e) => {
    e.preventDefault()
    const fila = { nombre: f.nombre.trim(), tipo: f.tipo, tamano: esConductor(f.tipo) ? null : (f.tamano || '').trim() || null, contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, notas: f.notas.trim() || null }
    try { if (f.id) await q(sb.from('transportadores').update(fila).eq('id', f.id)); else await q(sb.from('transportadores').insert(fila)); onGuardado() } catch (err) { setError(err.message) }
  }
  const activar = async (si) => { try { await q(sb.from('transportadores').update({ activo: si }).eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) } }
  return (
    <Modal titulo={f.id ? f.nombre : 'Nuevo transportador'} onClose={onClose} ancho={560}>
      <form className="form" onSubmit={guardar}>
        <div className="fila-form">
          <label className="crece">Nombre (persona o empresa)<input value={f.nombre} onChange={set('nombre')} required /></label>
          <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_TRANSPORTE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        </div>
        {!esConductor(f.tipo) && <label>Tamaño o capacidad del vehículo<input value={f.tamano || ''} onChange={set('tamano')} placeholder="Ej.: camión de 6 m, furgón 2 t, carro pequeño" /></label>}
        <div className="fila-form">
          <label>Contacto<input value={f.contacto} onChange={set('contacto')} /></label>
          <label>Teléfono<input value={f.telefono} onChange={set('telefono')} inputMode="tel" /></label>
        </div>
        <label>Notas (tarifas, cómo se pide, horario en que atiende…)<textarea rows={2} value={f.notas} onChange={set('notas')} /></label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {f.id && <button type="button" className="btn-link" onClick={() => activar(f.activo === false)}>{f.activo === false ? 'Activar' : 'Desactivar'}</button>}
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

// Cambió la ruta en el día: el camión está en la planta a cierta hora y puede volver a salir desde otra
function CamionEnPlanta({ cfg, fecha, hechas, pendientes, ocupado, onClose, onAceptar }) {
  const ahora = (() => { const d = new Date(); const m = d.getHours() * 60 + d.getMinutes(); return hm(Math.ceil(m / 15) * 15) })()
  const ini = fecha === hoyCO() ? ahora : cfg.salida
  const sumar = (h, min) => hm(aMin(h) + min)
  const almDef = (h) => aMin(h) >= aMin(cfg.almuerzo_desde) + (Number(cfg.almuerzo_min) || 0)
  const [enPlanta, setEnPlanta] = useState(ini)
  const [sale, setSale] = useState(sumar(ini, Number(cfg.min_descargue) || 15))
  const [almorzo, setAlmorzo] = useState(almDef(ini))
  const [error, setError] = useState('')
  const cambiarPlanta = (h) => { setEnPlanta(h); if (h) { if (!sale || sale < h) setSale(sumar(h, Number(cfg.min_descargue) || 15)); setAlmorzo(almDef(h)) } }
  const aceptar = (e) => {
    e.preventDefault()
    if (!enPlanta || !sale) { setError('Indica las dos horas.'); return }
    if (sale < enPlanta) { setError('La hora de salida debe ser igual o después de la hora en que está en la planta.'); return }
    onAceptar({ enPlanta, sale, almorzo })
  }
  return (
    <Modal titulo="El camión está en la planta" onClose={onClose} ancho={520}>
      <form className="form" onSubmit={aceptar}>
        <p className="tenue pequeño">Úsalo cuando la ruta cambie durante el día. Las vueltas ya hechas ({hechas}) se quedan en su ruta como pasaron. Las pendientes ({pendientes}, contando las de "Sin asignar") se vuelven a programar en una ruta nueva que sale de la planta a la hora que indiques.</p>
        <div className="fila-form">
          <label>Está en la planta a las<SelectorHora value={enPlanta} onChange={cambiarPlanta} /></label>
          <label>Puede volver a salir desde las<SelectorHora value={sale} onChange={setSale} desde={enPlanta || '05:00'} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={almorzo} onChange={(e) => setAlmorzo(e.target.checked)} /> El conductor ya almorzó (no se cuenta el almuerzo en la nueva ruta)</label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={ocupado}>Recalcular ruta</button>
        </div>
      </form>
    </Modal>
  )
}

// Inicio y fin del recorrido: siempre en la planta
function PuntoPlanta({ tipo, hora, lleva, tarde, fin, sinPlanta, real }) {
  return (
    <div className={`log-planta-punto ${tipo}${tarde ? ' tarde' : ''}`}>
      <span className="ico">🏭</span>
      <div className="crece">
        <b>{tipo === 'sale' ? 'Sale de la planta' : real ? 'En la planta' : 'Regresa a la planta'}</b> <span className={tarde ? 't-mal' : ''}>{tipo === 'sale' || real ? h12(hm(hora)) : `≈ ${h12(hm(hora))}`}</span>{real && <span className="tenue pequeño"> (indicado)</span>}
        {tipo === 'sale' && lleva && <div className="pequeño">Lleva la mercancía de: {lleva}</div>}
        {tarde && <div className="t-mal pequeño">Después de su hora de regreso ({h12(fin)})</div>}
        {sinPlanta && <div className="tenue pequeño">Falta la ubicación de la planta</div>}
      </div>
    </div>
  )
}

// Paso por la planta dentro de la ruta: recoger la mercancía antes de una vuelta o volver a dejar algo después
function ParadaPlanta({ motivo, v, paso, sinPlanta, nombres }) {
  const x = motivo === 'recoger' ? paso?.carga : paso?.vuelve
  const tarde = motivo === 'dejar' && x?.tarde > 0
  return (
    <div className={`log-parada planta${tarde ? ' no-hecha' : ''}`}>
      <div className="log-parada-cab">
        <span className="log-n planta">P</span>
        <div className="crece">
          <div><span className="etq-vuelta regreso">{motivo === 'recoger' ? 'Recoger en la planta' : 'Volver a la planta'}</span><b>Planta MQI</b></div>
          <div className="pequeño">{motivo === 'recoger' ? `Recoger la mercancía para ${nombres || v.destino}` : `Dejar lo que trae de ${v.destino}${nombres ? ` y recoger la mercancía para ${nombres}` : ''}`}</div>
          <div className={`log-llega${tarde ? ' t-mal' : ''}`}>
            {sinPlanta ? 'Falta la ubicación de la planta para calcular este paso.'
              : motivo === 'recoger'
                ? <>{v.lista_desde ? `Lista desde las ${h12(v.lista_desde)} · ` : ''}{x ? `en la planta ≈ ${hm(x.llega)}, sale ${hm(x.sale)}` : ''}</>
                : <>{v.volver_antes ? `Debe llegar antes de las ${h12(v.volver_antes)} · ` : 'Lo antes posible · '}{x ? `llega ≈ ${hm(x.llega)}${tarde ? ` (${Math.round(x.tarde)} min tarde)` : ''}` : ''}</>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Parada({ v, n, fecha, paso, cfg, acciones, onAbrir }) {
  const vp = !paso && cfg ? ventanasParada(v, fecha, cfg) : null
  return (
    <>
    {paso?.almuerzoAntes && <div className="log-almuerzo">🍽 Almuerzo</div>}
    <div className={`log-parada ${v.tipo}${v.estado === 'hecha' ? ' hecha' : ''}${v.estado === 'no_hecha' ? ' no-hecha' : ''}`}>
      <div className="log-parada-cab" onClick={onAbrir}>
        {n && <span className="log-n">{n}</span>}
        <div className="crece">
          <div><span className={`etq-vuelta ${v.tipo}`}>{TIPOS_VUELTA[v.tipo]}</span><b>{v.destino}</b>{zonaTxt(v) && <span className={`zona z-${zonaDe(v)}`}>{zonaTxt(v)}</span>}</div>
          <div className="tenue pequeño">{[v.direccion, v.municipio].filter(Boolean).join(', ') || 'Sin dirección'}{!tieneUbic(v) && ' · sin ubicación'}</div>
          <div className="pequeño">{v.descripcion}{v.op ? ` · OP ${v.op}` : ''}</div>
          <div className="log-tags">
            {v.hora ? <b className="hora-exacta">⏰ {cuandoTxt(v)}</b> : cuandoTxt(v) && <span className="etq">{cuandoTxt(v)}</span>}
            {v.necesita_camion && <span className="etq">camión</span>}
            {v.prioridad === 1 && <span className="badge badge-bad">urgente</span>}
            {v.fecha < fecha && <span className="badge badge-warn">de {fmtFecha(v.fecha).slice(0, 5)}</span>}
            {v.estado === 'no_hecha' && <span className="badge badge-bad" title={v.resultado || ''}>no se pudo{v.resultado ? `: ${v.resultado}` : ''}</span>}
            {v.estado === 'hecha' && <span className="badge badge-ok">hecha</span>}
          </div>
          {recepcionTxt(v.recepcion) && <div className="tenue pequeño">🕒 Recibe {recepcionTxt(v.recepcion)}</div>}
          {v.horario && <div className="tenue pequeño">{v.horario}</div>}
          {paso && <div className={`log-llega ${paso.cerrado || paso.choque || paso.tarde > 0 ? 't-mal' : ''}`}>
            {paso.cerrado ? 'Ese día el sitio no recibe' : paso.choque ? 'Lo pedido no cae en su horario de recepción'
              : <>Llega ≈ {hm(paso.llega)}{paso.espera >= 5 ? ` · espera hasta ${hm(paso.inicio)}` : ''}{paso.tarde > 0 ? ` · ${Math.round(paso.tarde)} min tarde` : ''} · sale {hm(paso.sale)}</>}
          </div>}
          {paso && v.recoger_planta && !paso.carga && <div className="log-llega">⤓ Su mercancía ya va en el camión (se cargó al salir o en un paso anterior por la planta)</div>}
          {!paso && v.recoger_planta && <div className="log-llega">⤓ Antes pasa por la planta a recoger{v.lista_desde ? ` (lista desde las ${h12(v.lista_desde)})` : ''}{paso?.carga ? ` · en la planta ≈ ${hm(paso.carga.llega)}–${hm(paso.carga.sale)}` : ''}</div>}
          {!paso && v.volver_planta && <div className={`log-llega${paso?.vuelve?.tarde > 0 ? ' t-mal' : ''}`}>↩ Luego vuelve a la planta {v.volver_antes ? `antes de las ${h12(v.volver_antes)}` : 'lo antes posible'}{paso?.vuelve ? ` · llega ≈ ${hm(paso.vuelve.llega)}${paso.vuelve.tarde > 0 ? ` (${Math.round(paso.vuelve.tarde)} min tarde)` : ''}` : ''}</div>}
          {vp && (vp.cerrado || vp.choque) && <div className="log-llega t-mal">{vp.cerrado ? 'Ese día el sitio no recibe' : 'Lo pedido no cae en su horario de recepción'}</div>}
        </div>
      </div>
      {acciones && <div className="log-parada-acc">{acciones}</div>}
    </div>
    </>
  )
}

function AjustesLogistica({ aj, onClose, onGuardado }) {
  const c0 = cfgDe(aj)
  const [ubic, setUbic] = useState(tieneUbic(aj) ? `${aj.lat}, ${aj.lng}` : '')
  const [c, setC] = useState({ salida: c0.salida, fin: c0.fin, almuerzo_desde: c0.almuerzo_desde, almuerzo_min: c0.almuerzo_min, min_parada: c0.min_parada, tolerancia: c0.tolerancia, min_descargue: c0.min_descargue, conductor: aj.conductor || '', conductor_tel: aj.conductor_tel || '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value })
  const u = leerUbicacion(ubic)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (!u) { setError(esLinkCorto(ubic) ? 'Ese es un link corto: ábrelo y copia el link completo o las coordenadas.' : 'Pega el link completo de Google Maps de la planta o sus coordenadas.'); return }
    if (c.fin <= c.salida) { setError('La hora de fin debe ser después de la salida.'); return }
    const { jornada_camion, ...resto } = aj // eslint-disable-line no-unused-vars
    try {
      await q(sb.from('ajustes').upsert({ clave: 'logistica', valor: { ...resto, lat: u.lat, lng: u.lng, salida: c.salida, fin: c.fin, almuerzo_desde: c.almuerzo_desde,
        almuerzo_min: Number(c.almuerzo_min) || 0, min_parada: Number(c.min_parada) || 20, tolerancia: Number(c.tolerancia) || 0, min_descargue: Number(c.min_descargue) || 15, conductor: c.conductor.trim() || null, conductor_tel: c.conductor_tel.trim() || null } }))
      onGuardado()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal titulo="Punto de salida y horarios" onClose={onClose} ancho={620}>
      <form className="form" onSubmit={guardar}>
        <label>Ubicación de la planta (link de Google Maps o coordenadas)<input value={ubic} onChange={(e) => setUbic(e.target.value)} placeholder="6.2442, -75.5812" />
          <span className="tenue pequeño">{u ? `✓ ${u.lat}, ${u.lng}` : 'En Google Maps, mantén presionado el punto de la planta y copia las coordenadas que aparecen.'}</span></label>
        <h4 className="subt">Conductor del camión de la empresa</h4>
        <div className="fila-form">
          <label className="crece">Conductor predeterminado<input list="lista-conductores" value={c.conductor} onChange={set('conductor')} placeholder="Nombre del conductor de planta" /></label>
          <label>Teléfono<input value={c.conductor_tel} onChange={set('conductor_tel')} inputMode="tel" /></label>
        </div>
        <p className="tenue pequeño">Se pone solo en cada ruta del camión. Si un día maneja otra persona, se cambia en la ruta (por ejemplo, un conductor de reemplazo guardado en Transportadores).</p>
        <h4 className="subt">Horario del recorrido</h4>
        <div className="fila-form">
          <label>Sale de la planta<SelectorHora value={c.salida} onChange={(v) => setC({ ...c, salida: v })} /></label>
          <label>Debe regresar antes de<SelectorHora value={c.fin} onChange={(v) => setC({ ...c, fin: v })} /></label>
          <label>Almuerzo desde<SelectorHora value={c.almuerzo_desde} onChange={(v) => setC({ ...c, almuerzo_desde: v })} /></label>
          <label>Duración del almuerzo<span className="con-unidad"><input type="number" min={0} step={5} value={c.almuerzo_min} onChange={set('almuerzo_min')} style={{ width: 70 }} /> min</span></label>
        </div>
        <div className="fila-form">
          <label>Tiempo promedio en cada sitio<span className="con-unidad"><input type="number" min={5} step={5} value={c.min_parada} onChange={set('min_parada')} style={{ width: 70 }} /> min</span></label>
          <label title="Cuando una vuelta pide volver a la planta a dejar algo">Descargue en la planta<span className="con-unidad"><input type="number" min={0} step={5} value={c.min_descargue} onChange={set('min_descargue')} style={{ width: 70 }} /> min</span></label>
          <label>Margen para hora exacta<span className="con-unidad"><input type="number" min={0} step={5} value={c.tolerancia} onChange={set('tolerancia')} style={{ width: 70 }} /> min</span></label>
        </div>
        <p className="tenue pequeño">Así se arma la ruta: sale a la hora de salida; si llega a un sitio antes de que reciba (o antes de la hora pedida) espera; el almuerzo se toma cuando llega su hora
          (o durante una espera larga); cada parada dura su tiempo en el sitio (o el promedio) y al final regresa a la planta. Una hora exacta se cumple si llega hasta {c.tolerancia || 0} min después. Si una vuelta pide volver a la planta a dejar algo, el camión pasa por la planta justo después de esa parada.
          El viaje se estima por la distancia en línea recta × 1,4 a 22 km/h; cuando conectemos el GPS del camión se ajustará con datos reales.</p>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  )
}

// ---------------- Horario de recepción ----------------
const CUANDO = { todo: 'Cualquier hora', manana: 'En la mañana', tarde: 'En la tarde', exacta: 'A una hora exacta', desde: 'A partir de una hora', antes: 'Antes de una hora', rango: 'Entre dos horas' }
const L_V = [1, 2, 3, 4, 5]
const PLANTILLAS = [
  ['L-V 8–12 y 2–5', [{ d: L_V, a: '08:00', b: '12:00' }, { d: L_V, a: '14:00', b: '17:00' }]],
  ['L-V 8–5', [{ d: L_V, a: '08:00', b: '17:00' }]],
  ['L-V 8–5 y S 8–12', [{ d: L_V, a: '08:00', b: '17:00' }, { d: [6], a: '08:00', b: '12:00' }]],
  ['L-S 7–4', [{ d: [...L_V, 6], a: '07:00', b: '16:00' }]],
]
function EditorRecepcion({ valor, onChange, desdeLugar, siempreAbierto }) {
  const lista = Array.isArray(valor) ? valor : []
  const [abierto0, setAbierto] = useState(false)
  const abierto = siempreAbierto || abierto0
  const cambiar = (i, k, v) => onChange(lista.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const dia = (i, n) => { const d = lista[i].d || []; cambiar(i, 'd', d.includes(n) ? d.filter((x) => x !== n) : [...d, n]) }
  const resumen = recepcionTxt(lista)
  return (
    <div className="recepcion">
      <div className="recepcion-cab">
        <span><b>Horario de recepción:</b> {resumen || <span className="tenue">recibe a cualquier hora</span>}{desdeLugar && resumen ? <span className="tenue pequeño"> (del cliente/proveedor guardado)</span> : null}</span>
        {!siempreAbierto && <button type="button" className="btn-link" onClick={() => setAbierto(!abierto)}>{abierto ? 'Listo' : 'Cambiar'}</button>}
      </div>
      {abierto && <>
        {lista.map((r, i) => (
          <div key={i} className="recepcion-fila">
            <div className="dias">{DIAS_SEM.map(([n, l]) => <button type="button" key={n} className={(r.d || []).includes(n) ? 'sel' : ''} onClick={() => dia(i, n)}>{l}</button>)}</div>
            <span className="tenue pequeño">de</span><SelectorHora value={r.a || ''} onChange={(v) => cambiar(i, 'a', v)} />
            <span className="tenue pequeño">a</span><SelectorHora value={r.b || ''} onChange={(v) => cambiar(i, 'b', v)} />
            {(!(r.d || []).length || !r.a || !r.b || r.b <= r.a) && <span className="t-mal pequeño">{!(r.d || []).length ? 'Marca los días' : 'Revisa las horas'}</span>}
            <button type="button" className="btn-link peligro" onClick={() => onChange(lista.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        <div className="recepcion-acc">
          <button type="button" className="btn btn-sec btn-sm" onClick={() => onChange([...lista, { d: L_V, a: '08:00', b: '12:00' }])}>+ Franja</button>
          <span className="tenue pequeño">Rápido:</span>
          {PLANTILLAS.map(([t, v]) => <button type="button" key={t} className="btn btn-sec btn-sm" onClick={() => onChange(v.map((x) => ({ ...x, d: [...x.d] })))}>{t}</button>)}
          {lista.length > 0 && <button type="button" className="btn-link" onClick={() => onChange([])}>Recibe a cualquier hora</button>}
        </div>
      </>}
    </div>
  )
}

// Convierte el sitio de una vuelta (hecha o no) en cliente/proveedor recurrente
function GuardarRecurrente({ v, onHecho }) {
  const [tipo, setTipo] = useState(v.tipo === 'recogida' ? 'proveedor' : 'cliente')
  const [estado, setEstado] = useState('')
  const guardar = async () => {
    setEstado('guardando')
    try {
      const ubic = leerUbicacion(v.ubic)
      const [l] = await q(sb.from('lugares').insert({ tipo, nombre: String(v.destino || '').trim(), direccion: v.direccion || null, municipio: v.municipio || null,
        contacto: v.contacto || null, telefono: v.telefono || null, recepcion: v.recepcion || [], min_parada: Number(v.min_parada) || null,
        lat: ubic?.lat ?? (tieneUbic(v) ? v.lat : null), lng: ubic?.lng ?? (tieneUbic(v) ? v.lng : null) }).select())
      // Se enlaza la vuelta con el sitio guardado (si los permisos lo permiten)
      await sb.from('vueltas').update({ lugar_id: l.id }).eq('id', v.id)
      setEstado('ok'); onHecho(l)
    } catch (e) { setEstado(e.message) }
  }
  if (estado === 'ok') return <Aviso tipo="ok">Guardado como {TIPOS_LUGAR[tipo].toLowerCase()} recurrente. Revisa su horario de recepción en "Clientes y proveedores".</Aviso>
  return (
    <div className="fila-form recurrente">
      <span className="pequeño">¿Se vuelve a ir a <b>{v.destino}</b>?</span>
      <select value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(TIPOS_LUGAR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <button type="button" className="btn btn-sec btn-sm" disabled={estado === 'guardando'} onClick={guardar}>Guardar como recurrente</button>
      {estado && estado !== 'guardando' && <span className="t-mal pequeño">{estado}</span>}
    </div>
  )
}

// Revisa que cada franja tenga días y horas válidas
function validarRecepcion(rec) {
  for (const r of rec || []) {
    if (!(r.d || []).length) return 'En el horario de recepción, marca los días de cada franja.'
    if (!r.a || !r.b) return 'En el horario de recepción, elige la hora de inicio y de fin de cada franja.'
    if (r.b <= r.a) return 'En el horario de recepción, la hora de fin debe ser después de la de inicio.'
  }
  return ''
}

// Selector de hora en formato de 12 horas (cada 15 minutos), para que no haya confusiones de formato
export function SelectorHora({ value, onChange, desde = '05:00', hasta = '21:00', paso = 15, vacio = '— hora —' }) {
  const opts = []
  for (let m = aMin(desde); m <= aMin(hasta); m += paso) opts.push(hm(m))
  const v = value ? String(value).slice(0, 5) : ''
  if (v && !opts.includes(v)) opts.push(v)
  opts.sort()
  return (
    <select className="sel-hora" value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vacio}</option>
      {opts.map((o) => <option key={o} value={o}>{h12(o)}</option>)}
    </select>
  )
}

// Avisa si el día o la hora pedida no cuadran con el horario de recepción
function AvisoHorario({ v }) {
  if (!v.fecha || !(Array.isArray(v.recepcion) && v.recepcion.length)) return null
  if (['exacta', 'rango'].includes(v.franja) && !v.hora) return null
  const x = ventanasParada({ ...v, franja: ['exacta', 'rango'].includes(v.franja) ? 'todo' : v.franja }, v.fecha, cfgDe(null))
  const dia = new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })
  if (x.cerrado) return <Aviso tipo="warn">El {dia} este sitio no recibe ({recepcionTxt(v.recepcion)}). Cambia el día o el horario de recepción.</Aviso>
  if (x.choque) return <Aviso tipo="warn">La hora pedida no cae en el horario de recepción ({recepcionTxt(v.recepcion)}).</Aviso>
  return null
}

// ---------------- Clientes y proveedores recurrentes ----------------
function Lugares({ lugares, onCambio }) {
  const [buscar, setBuscar] = useState('')
  const [tipo, setTipo] = useState('')
  const [form, setForm] = useState(null)
  const [verInactivos, setVerInactivos] = useState(false)
  if (!lugares) return <Cargando />
  const b = buscar.trim().toLowerCase()
  const lista = lugares.filter((l) => (verInactivos || l.activo) && (!tipo || l.tipo === tipo)
    && (!b || `${l.nombre} ${l.direccion || ''} ${l.contacto || ''} ${l.municipio || ''}`.toLowerCase().includes(b)))
  return (
    <div>
      <div className="filtros">
        <div className="segmentado">{[['', 'Todos'], ['cliente', 'Clientes'], ['proveedor', 'Proveedores'], ['otro', 'Otros']].map(([k, t]) => <button key={k} className={tipo === k ? 'sel' : ''} onClick={() => setTipo(k)}>{t}</button>)}</div>
        <input className="buscar" placeholder="Buscar nombre, dirección, contacto…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <label className="check pequeño"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos</label>
        <button className="btn" onClick={() => setForm({ tipo: tipo || 'cliente', municipio: 'Medellín' })}>+ Agregar</button>
      </div>
      {lista.length === 0 ? <div className="vacio">No hay {tipo ? `${TIPOS_LUGAR[tipo].toLowerCase()}es` : 'clientes ni proveedores'} guardados. Agrégalos aquí o marca "Guardar este sitio como recurrente" al pedir una vuelta.</div> : (
        <table className="tabla tabla-click">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Dirección</th><th>Contacto</th><th>Recibe</th><th>Ubicación</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.id} onClick={() => setForm(l)} className={l.activo ? '' : 'omitida'}>
              <td><b>{l.nombre}</b>{zonaTxt(l) && <span className={`zona z-${zonaDe(l)}`}>{zonaTxt(l)}</span>}</td><td>{TIPOS_LUGAR[l.tipo]}</td>
              <td>{[l.direccion, l.municipio].filter(Boolean).join(', ')}</td>
              <td>{l.contacto}{l.telefono && <div className="tenue pequeño">{l.telefono}</div>}</td>
              <td className="pequeño">{recepcionTxt(l.recepcion) || (l.horario ? <span className="t-mal">Falta pasar a días y horas: "{l.horario}"</span> : <span className="tenue">cualquier hora</span>)}{l.min_parada ? <div className="tenue">{l.min_parada} min en el sitio</div> : null}</td>
              <td>{tieneUbic(l) ? <a href={linkMaps(l)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Ver mapa</a> : <span className="tenue">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {form && <FormLugar inicial={form} onClose={() => setForm(null)} onGuardado={() => { setForm(null); onCambio() }} />}
    </div>
  )
}

function FormLugar({ inicial, onClose, onGuardado }) {
  const [f, setF] = useState(() => ({ nombre: '', direccion: '', municipio: '', contacto: '', telefono: '', horario: '', notas: '', recepcion: [], min_parada: '', ...Object.fromEntries(Object.entries(inicial).filter(([, v]) => v !== null)),
    ubic: tieneUbic(inicial) ? `${inicial.lat}, ${inicial.lng}` : '' }))
  // Horario de recepción: hay que decir explícitamente si tiene horario o si recibe a cualquier hora
  const [conHorario, setConHorario] = useState(() => ((inicial.recepcion || []).length ? 'si' : inicial.id && !inicial.horario ? 'no' : ''))
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const u = leerUbicacion(f.ubic)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (!conHorario) { setError('Indica el horario de recepción: elige "Tiene horario" (días y horas) o "Recibe a cualquier hora".'); return }
    if (conHorario === 'si' && !(f.recepcion || []).length) { setError('Agrega al menos una franja con sus días y horas, o elige "Recibe a cualquier hora".'); return }
    const errRec = conHorario === 'si' ? validarRecepcion(f.recepcion) : ''
    if (errRec) { setError(errRec); return }
    if (f.ubic && !u) { setError(esLinkCorto(f.ubic) ? 'Ese es un link corto de Google Maps: ábrelo y copia el link completo o las coordenadas.' : 'No reconozco esa ubicación. Pega el link completo de Google Maps o las coordenadas.'); return }
    const fila = { tipo: f.tipo, nombre: f.nombre.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null, contacto: f.contacto.trim() || null,
      telefono: f.telefono.trim() || null, horario: null, notas: f.notas.trim() || null, lat: u?.lat ?? null, lng: u?.lng ?? null,
      recepcion: conHorario === 'si' ? f.recepcion : [], min_parada: Number(f.min_parada) || null }
    try {
      if (f.id) await q(sb.from('lugares').update(fila).eq('id', f.id))
      else await q(sb.from('lugares').insert(fila))
      onGuardado()
    } catch (err) { setError(err.message) }
  }
  const activar = async (si) => { try { await q(sb.from('lugares').update({ activo: si }).eq('id', f.id)); onGuardado() } catch (err) { setError(err.message) } }
  return (
    <Modal titulo={f.id ? f.nombre : 'Nuevo cliente o proveedor'} onClose={onClose} ancho={640}>
      <form className="form" onSubmit={guardar}>
        <div className="fila-form">
          <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_LUGAR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="crece">Nombre<input value={f.nombre} onChange={set('nombre')} required /></label>
        </div>
        <div className="fila-form">
          <label className="crece">Dirección<input value={f.direccion} onChange={set('direccion')} /></label>
          <label>Municipio<input value={f.municipio} onChange={set('municipio')} /></label>
        </div>
        <div className="fila-form">
          <label>Contacto<input value={f.contacto} onChange={set('contacto')} /></label>
          <label>Teléfono<input value={f.telefono} onChange={set('telefono')} inputMode="tel" /></label>
          <label title="Cuánto se demora normalmente en este sitio (descargar, recibir, firmar…). Vacío = el promedio">Tiempo en el sitio<span className="con-unidad"><input type="number" min={5} step={5} value={f.min_parada} onChange={set('min_parada')} placeholder="prom." style={{ width: 70 }} /> min</span></label>
        </div>
        <div className="recepcion">
          <div className="recepcion-cab"><b>Horario de recepción</b>
            <div className="segmentado">
              <button type="button" className={conHorario === 'si' ? 'sel' : ''} onClick={() => { setConHorario('si'); if (!(f.recepcion || []).length) setF({ ...f, recepcion: [{ d: [1, 2, 3, 4, 5], a: '08:00', b: '17:00' }] }) }}>Tiene horario</button>
              <button type="button" className={conHorario === 'no' ? 'sel' : ''} onClick={() => setConHorario('no')}>Recibe a cualquier hora</button>
            </div>
          </div>
          {f.horario && <div className="aviso-texto-ant">Antes estaba escrito: <b>{f.horario}</b>. Pásalo a días y horas abajo.</div>}
          {conHorario === 'si' && <EditorRecepcion valor={f.recepcion} onChange={(r) => setF({ ...f, recepcion: r })} siempreAbierto />}
        </div>
        <label>Ubicación (link de Google Maps o coordenadas)<input value={f.ubic} onChange={set('ubic')} placeholder="https://www.google.com/maps/… o 6.2442, -75.5812" />
          <span className="tenue pequeño">{u ? `✓ ${u.lat}, ${u.lng}` : 'En Google Maps, mantén presionado el sitio y copia las coordenadas, o copia el link completo de la barra.'}</span></label>
        <label>Notas (portería, parqueo, a quién preguntar…)<textarea rows={2} value={f.notas} onChange={set('notas')} /></label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {f.id && <button type="button" className="btn-link" onClick={() => activar(!f.activo)}>{f.activo ? 'Desactivar' : 'Activar'}</button>}
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
