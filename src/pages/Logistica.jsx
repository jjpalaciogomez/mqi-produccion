import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Cargando, Modal, fmtFecha, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { hoyCO } from '../cumplimiento.js'
import {
  DIAS_SEM, ESTADOS_VUELTA, TIPOS_LUGAR, TIPOS_VUELTA, VEHICULOS, aMin, cfgDe, zonaDe, zonaTxt, cuandoTxt, h12, esLinkCorto, estimar, hm, leerUbicacion, linkMaps,
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
  return [aj, cargar]
}

export default function Logistica({ perfil, gestor }) {
  const [tab, setTab] = useState(gestor ? 'ruta' : 'vueltas')
  const [lugares, setLugares] = useState(null)
  const cargarLugares = useCallback(() => q(sb.from('lugares').select('*').order('nombre')).then(setLugares).catch(() => setLugares([])), [])
  useEffect(() => { cargarLugares() }, [cargarLugares])
  return (
    <div>
      <div className="titulo-pagina">
        <div><h1>Logística</h1><div className="tenue pequeño">Entregas, recogidas y diligencias: se piden aquí y se organizan en la ruta de cada día.</div></div>
        <BotonAyuda clave="logistica" rol={perfil?.rol} />
      </div>
      <div className="segmentado pestañas">
        {[...(gestor ? [['ruta', 'Ruta del día']] : []), ['vueltas', 'Vueltas'], ['lugares', 'Clientes y proveedores']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'ruta' && gestor && <RutaDelDia lugares={lugares || []} perfil={perfil} onLugares={cargarLugares} />}
      {tab === 'vueltas' && <Vueltas perfil={perfil} gestor={gestor} lugares={lugares || []} onLugares={cargarLugares} />}
      {tab === 'lugares' && <Lugares lugares={lugares} onCambio={cargarLugares} />}
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
      let c = sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero)').order('fecha').order('hora', { nullsFirst: false }).order('creado')
      if (filtro === 'pendientes') c = c.in('estado', ['pendiente', 'no_hecha'])
      else c = c.gte('fecha', sumarDias(hoy, -30))
      if (filtro === 'mias') c = c.eq('solicitante', yo)
      setLista(await q(c)); setError('')
    } catch (e) { setError(e.message) }
  }, [filtro, hoy, yo])
  useEffect(() => { cargar() }, [cargar])
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
function RutaDelDia({ lugares, perfil, onLugares }) {
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
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero)').eq('fecha', fecha).neq('estado', 'cancelada')),
        // Lo que quedó pendiente o no se pudo hacer en días anteriores
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado, numero)').lt('fecha', fecha).in('estado', ['pendiente', 'no_hecha']).gte('fecha', sumarDias(fecha, -60))),
      ])
      const ids = new Set(recs.map((r) => r.id))
      const vs = [...delDia, ...previas.filter((v) => !v.recorrido_id || !ids.has(v.recorrido_id))]
      setD({ recs, vs }); setError('')
    } catch (e) { setError(e.message) }
  }, [fecha])
  useEffect(() => { cargar() }, [cargar])

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
    const [n] = await q(sb.from('recorridos').upsert({ fecha, vehiculo: vehDe(k), numero: numDe(k) }, { onConflict: 'fecha,vehiculo,numero' }).select())
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
  const ordenar = (veh) => accion(() => guardarOrden(veh, ordenarParadas(deVeh(veh), planta, cfgRuta[veh] || cfg, fecha)), 'Paradas ordenadas según la hora pedida, el horario de recepción de cada sitio, el almuerzo y la cercanía.')
  // La propuesta usa la última ruta abierta (sin confirmar) del camión y del mensajero
  const abierta = (veh) => { const ks = cols.filter((c) => vehDe(c) === veh && !bloqueado(c)); return ks[ks.length - 1] || null }
  const proponer = () => accion(async () => {
    const kc = abierta('camion'), km = abierta('mensajero')
    const libres = [...sinAsignar, ...(kc ? deVeh(kc) : []), ...(km ? deVeh(km) : [])]
    const p = proponerAsignacion(libres, planta, (kc && cfgRuta[kc]) || cfg, fecha)
    if (kc) await guardarOrden(kc, p.camion)
    else p.mensajero.unshift(...p.camion)
    if (km && p.mensajero.length) await guardarOrden(km, p.mensajero)
  }, 'Asignación propuesta: el camión se llena primero mientras llegue a tiempo a cada sitio y regrese antes de su hora de fin; lo demás va con mensajero. Revísala y confirma.')
  const confirmar = (veh, si) => accion(async () => {
    const r = await asegurarRec(veh)
    await q(sb.from('recorridos').update(si ? { estado: 'confirmada', confirmada_por: perfil?.user_id, confirmada_en: new Date().toISOString() } : { estado: 'borrador' }).eq('id', r.id))
  }, si ? `${nombreRuta(veh)} confirmada: ya la ve el conductor en su celular.` : 'La ruta volvió a borrador.')
  const guardarSalida = (k, h) => accion(async () => { const r = await asegurarRec(k); await q(sb.from('recorridos').update({ salida: h || null }).eq('id', r.id)) })
  const guardarConductor = (veh, nombre) => accion(async () => { const r = await asegurarRec(veh); await q(sb.from('recorridos').update({ conductor: nombre.trim() || null }).eq('id', r.id)) })

  // Columnas: camión y mensajero (ruta 1) siempre; las rutas que existan ese día; y las que se agreguen
  const [extraCols, setExtraCols] = useState([])
  useEffect(() => { setExtraCols([]) }, [fecha])
  const ordenVeh = Object.keys(VEHICULOS)
  const cols = [...new Set(['camion:1', 'mensajero:1', ...(d?.recs || []).map((r) => `${r.vehiculo}:${r.numero || 1}`), ...extraCols])]
    .sort((a, b) => ordenVeh.indexOf(vehDe(a)) - ordenVeh.indexOf(vehDe(b)) || numDe(a) - numDe(b))
  const rutasDe = (veh) => cols.filter((c) => vehDe(c) === veh)
  const nombreRuta = (k) => `${VEHICULOS[vehDe(k)]}${rutasDe(vehDe(k)).length > 1 || numDe(k) > 1 ? ` · Ruta ${numDe(k)}` : ''}`
  const otraRuta = (veh) => { const n = Math.max(0, ...rutasDe(veh).map(numDe)) + 1; setExtraCols([...extraCols, `${veh}:${n}`]) }
  // Hora de salida de cada ruta: la que se puso; si no, la ruta 1 sale a la hora de salida y las siguientes cuando regresa la anterior del mismo vehículo
  const cfgRuta = {}, estRuta = {}
  for (const k of cols) {
    const r = rec(k), prev = cols.filter((c) => vehDe(c) === vehDe(k) && numDe(c) < numDe(k)).pop()
    const salida = r?.salida ? String(r.salida).slice(0, 5) : prev && estRuta[prev] && deVeh(prev).length ? hm(estRuta[prev].regreso + (Number(cfg.min_descargue) || 15)) : cfg.salida
    // Si en una ruta anterior del mismo vehículo ya almorzó, en esta no se vuelve a contar el almuerzo
    const yaAlmorzo = cols.some((c) => vehDe(c) === vehDe(k) && numDe(c) < numDe(k) && estRuta[c]?.sim?.almuerzo !== null && deVeh(c).length)
    cfgRuta[k] = { ...cfg, salida, ...(yaAlmorzo ? { almuerzo_min: 0 } : {}) }
    estRuta[k] = d ? estimar(deVeh(k), planta, cfgRuta[k], fecha) : null
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
        <button className="btn" disabled={ocupado || !aj || !d} onClick={proponer} title="Llena primero el camión mientras cumpla los horarios; lo demás va con mensajero">Proponer asignación</button>
        {!rutasDe('externo').length && <button className="btn btn-sec btn-sm" onClick={() => otraRuta('externo')}>+ Otro transporte</button>}
        <button className="btn-link" onClick={() => setVerAjustes(true)}>Punto de salida y horarios</button>
      </div>
      {aj && !planta && <Aviso tipo="warn">Falta la ubicación de la planta (punto de salida). Sin ella no se puede calcular el orden ni el tiempo de viaje. <button className="btn-link" onClick={() => setVerAjustes(true)}>Configurarla</button></Aviso>}
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
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
            const ps = deVeh(veh), r = rec(veh), conf = r?.estado === 'confirmada'
            const est = estRuta[veh], cr = cfgRuta[veh]
            const pasa = est.regreso > aMin(cfg.fin)
            const zonas = Object.entries(ps.reduce((g, v) => { const z = zonaTxt(v) || 'Sin zona'; g[z] = (g[z] || 0) + 1; return g }, {}))
            const links = linksRecorrido(ps, planta)
            const nombresDe = (ids) => ids.map((id) => ps.find((x) => x.id === id)?.destino).filter(Boolean).join(', ')
            return (
              <div key={veh} className={`log-col${conf ? ' confirmada' : ''}`}>
                <div className="log-col-cab">
                  <b>{nombreRuta(veh)}</b>
                  <span className={`badge ${conf ? 'badge-info' : 'badge-muted'}`}>{conf ? 'Confirmada' : 'Borrador'}</span>
                </div>
                <div className="log-est">
                  {ps.length} {ps.length === 1 ? 'parada' : 'paradas'}{ps.length > 0 && <> · sale {h12(cr.salida)} · regresa ≈ <b className={pasa ? 't-mal' : ''}>{hm(est.regreso)}</b></>}{planta && est.km ? ` · ${fmtNum(est.km, 0)} km` : ''}
                  {zonas.length > 0 && <div className="log-zonas">{zonas.map(([z, n]) => <span key={z} className={`zona z-${z.toLowerCase().replace(' ', '-')}`}>{z} {n}</span>)}</div>}
                  {ps.length > 0 && est.sim.almuerzo !== null && <div className="tenue pequeño">🍽 almuerzo ≈ {hm(est.sim.almuerzo)}</div>}
                  {est.sim.alSalir.length > 0 && <div className="tenue pequeño">⤓ Sale de la planta con la mercancía de: {nombresDe(est.sim.alSalir)}</div>}
                  {pasa && <div className="t-mal pequeño">Regresa después de su hora de fin ({cfg.fin}): mueve algo a otro vehículo o a otro día.</div>}
                  {est.sinUbic > 0 && ps.length > 0 && <div className="tenue pequeño">{est.sinUbic} sin ubicación: el tiempo es aproximado.</div>}
                  {est.problemas > 0 && <div className="t-mal pequeño">{est.problemas === 1 ? 'Una parada queda' : `${est.problemas} paradas quedan`} fuera de su horario: usa "Ordenar", pásala a otro vehículo o a otro día.</div>}
                </div>
                <div className="log-ruta-datos">
                  <input className="log-conductor" placeholder={vehDe(veh) === 'camion' ? 'Conductor' : 'Quién la hace'} defaultValue={r?.conductor || ''} key={r?.id || veh} disabled={conf}
                    onBlur={(e) => e.target.value !== (r?.conductor || '') && guardarConductor(veh, e.target.value)} />
                  <label className="pequeño" title="Si no se pone, la ruta 1 sale a la hora de salida y las siguientes cuando regresa la anterior">Sale<SelectorHora value={r?.salida ? String(r.salida).slice(0, 5) : ''} vacio={`Auto (${h12(cr.salida)})`} onChange={(h) => !conf && guardarSalida(veh, h)} /></label>
                </div>
                {ps.map((v, i) => (<Fragment key={v.id}>
                  {v.recoger_planta && (!planta || est.sim.pasos[i]?.carga) && <ParadaPlanta motivo="recoger" v={v} paso={est.sim.pasos[i]} sinPlanta={!planta} nombres={nombresDe(est.sim.pasos[i]?.carga?.lleva || [v.id])} />}
                  <Parada v={v} n={i + 1} fecha={fecha} paso={est.sim.pasos[i]} onAbrir={() => setForm(v)}
                    acciones={conf ? null : <>
                      <button className="btn-icono" disabled={ocupado || i === 0} onClick={() => subir(veh, i, -1)} title="Subir">↑</button>
                      <button className="btn-icono" disabled={ocupado || i === ps.length - 1} onClick={() => subir(veh, i, 1)} title="Bajar">↓</button>
                      <select value={veh} disabled={ocupado} onChange={(e) => mover(v, e.target.value)}>
                        <option value="">Sacar de la ruta</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{nombreRuta(c)}</option>)}<option value="pospuesta">No programar por ahora</option>
                      </select>
                      <button className="btn-link peligro" disabled={ocupado} onClick={() => mover(v, '')} title="Vuelve a Sin asignar">Sacar</button>
                    </>} />
                  {v.volver_planta && <ParadaPlanta motivo="dejar" v={v} paso={est.sim.pasos[i]} sinPlanta={!planta} nombres={nombresDe(est.sim.pasos[i]?.vuelve?.lleva || [])} />}
                </Fragment>))}
                <div className="log-col-pie">
                  {!conf && ps.length > 1 && <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => ordenar(veh)}>Ordenar</button>}
                  {!conf && ps.some((x) => x.estado === 'pendiente') && <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => sacarTodas(veh)} title="Pasa a Sin asignar todas las vueltas pendientes de esta ruta, para reorganizar">Sacar todas</button>}
                  {conf && <span className="tenue pequeño">Para sacar o mover vueltas, vuelve la ruta a borrador.</span>}
                  {links.map((l, i) => <a key={l} className="btn btn-sec btn-sm" href={l} target="_blank" rel="noreferrer">Ver en Google Maps{links.length > 1 ? ` (${i + 1})` : ''}</a>)}
                  {ps.length > 0 && (conf
                    ? <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => confirmar(veh, false)}>Volver a borrador</button>
                    : <button className="btn btn-sm" disabled={ocupado} onClick={() => confirmar(veh, true)}>Confirmar ruta</button>)}
                  {numDe(veh) === Math.max(...rutasDe(vehDe(veh)).map(numDe)) && <button className="btn-link" onClick={() => otraRuta(vehDe(veh))} title="Otra salida del mismo vehículo más tarde en el día">+ Otra ruta</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {form && <FormVuelta inicial={form} lugares={lugares} perfil={perfil} gestor
        onClose={() => setForm(null)} onGuardado={() => { setForm(null); cargar(); onLugares() }} />}
      {verAjustes && aj && <AjustesLogistica aj={aj} onClose={() => setVerAjustes(false)} onGuardado={() => { setVerAjustes(false); cargarAj() }} />}
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
  const [c, setC] = useState({ salida: c0.salida, fin: c0.fin, almuerzo_desde: c0.almuerzo_desde, almuerzo_min: c0.almuerzo_min, min_parada: c0.min_parada, tolerancia: c0.tolerancia, min_descargue: c0.min_descargue })
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
        almuerzo_min: Number(c.almuerzo_min) || 0, min_parada: Number(c.min_parada) || 20, tolerancia: Number(c.tolerancia) || 0, min_descargue: Number(c.min_descargue) || 15 } }))
      onGuardado()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal titulo="Punto de salida y horarios" onClose={onClose} ancho={620}>
      <form className="form" onSubmit={guardar}>
        <label>Ubicación de la planta (link de Google Maps o coordenadas)<input value={ubic} onChange={(e) => setUbic(e.target.value)} placeholder="6.2442, -75.5812" />
          <span className="tenue pequeño">{u ? `✓ ${u.lat}, ${u.lng}` : 'En Google Maps, mantén presionado el punto de la planta y copia las coordenadas que aparecen.'}</span></label>
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
