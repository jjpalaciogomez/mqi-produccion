import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Cargando, Modal, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { hoyCO } from '../cumplimiento.js'
import {
  ESTADOS_VUELTA, FRANJAS, TIPOS_LUGAR, TIPOS_VUELTA, VEHICULOS, esLinkCorto, estimar, leerUbicacion, linkMaps,
  linksRecorrido, ordenarParadas, proponerAsignacion, tieneUbic,
} from '../logistica.js'

const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const diaTxt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const AJ_DEF = { lat: null, lng: null, min_parada: 20, jornada_camion: 510 }

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
      let c = sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado)').order('fecha').order('creado')
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
            <thead><tr><th>Tipo</th><th>Destino</th><th>Qué</th><th>Franja</th><th>Pidió</th><th>Estado</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.id} onClick={() => setForm(v)} className={v.estado === 'cancelada' ? 'omitida' : ''}>
                <td><span className={`etq-vuelta ${v.tipo}`}>{TIPOS_VUELTA[v.tipo]}</span>{v.prioridad === 1 && <span className="badge badge-bad">urgente</span>}</td>
                <td><b>{v.destino}</b><div className="tenue pequeño">{[v.direccion, v.municipio].filter(Boolean).join(', ')}</div></td>
                <td>{v.descripcion}{v.op && <span className="tenue"> · OP {v.op}</span>}{v.necesita_camion && <span className="etq">camión</span>}</td>
                <td>{FRANJAS[v.franja]}</td>
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
  if (v.recorridos) return <span className={`badge ${v.recorridos.estado === 'confirmada' ? 'badge-info' : 'badge-muted'}`}>{VEHICULOS[v.recorridos.vehiculo]?.split(' ')[0]}{v.recorridos.estado === 'confirmada' ? ' · confirmada' : ' · en borrador'}</span>
  return <span className="badge badge-warn">Sin asignar</span>
}

const VACIA = { tipo: 'entrega', lugar_id: '', destino: '', direccion: '', municipio: 'Medellín', contacto: '', telefono: '', horario: '', ubic: '',
  franja: 'todo', descripcion: '', op: '', necesita_camion: false, prioridad: 2, guardarLugar: false, tipoLugar: 'cliente' }

function FormVuelta({ inicial, lugares, perfil, soloLectura, gestor, onClose, onGuardado }) {
  const hoy = hoyCO()
  const [f, setF] = useState(() => ({ ...VACIA, fecha: hoy, ...Object.fromEntries(Object.entries(inicial).filter(([, v]) => v !== null)),
    ubic: tieneUbic(inicial) ? `${inicial.lat}, ${inicial.lng}` : '', lugar_id: inicial.lugar_id || '' }))
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const elegirLugar = (id) => {
    const l = lugares.find((x) => x.id === id)
    if (!l) { setF({ ...f, lugar_id: '' }); return }
    setF({ ...f, lugar_id: id, destino: l.nombre, direccion: l.direccion || '', municipio: l.municipio || '', contacto: l.contacto || '', telefono: l.telefono || '',
      horario: l.horario || '', ubic: tieneUbic(l) ? `${l.lat}, ${l.lng}` : '', tipo: f.id ? f.tipo : l.tipo === 'proveedor' ? 'recogida' : 'entrega' })
  }
  const ubic = leerUbicacion(f.ubic)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (f.ubic && !ubic) { setError(esLinkCorto(f.ubic) ? 'Ese es un link corto de Google Maps: ábrelo, copia el link completo de la barra del navegador o las coordenadas (mantén presionado el punto en el mapa).' : 'No reconozco esa ubicación. Pega el link completo de Google Maps o las coordenadas, p. ej. 6.2442, -75.5812.'); return }
    setEnviando(true)
    try {
      let lugarId = f.lugar_id || null
      if (!lugarId && f.guardarLugar) {
        const [l] = await q(sb.from('lugares').insert({ tipo: f.tipoLugar, nombre: f.destino.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null,
          contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, horario: f.horario.trim() || null, lat: ubic?.lat ?? null, lng: ubic?.lng ?? null }).select())
        lugarId = l.id
      }
      const fila = { tipo: f.tipo, lugar_id: lugarId, destino: f.destino.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null,
        contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, horario: f.horario.trim() || null, lat: ubic?.lat ?? null, lng: ubic?.lng ?? null,
        fecha: f.fecha, franja: f.franja, descripcion: f.descripcion.trim(), op: String(f.op || '').trim() || null, necesita_camion: !!f.necesita_camion, prioridad: Number(f.prioridad) }
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
            <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_VUELTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label className="crece">Cliente o proveedor guardado
              <select value={f.lugar_id} onChange={(e) => elegirLugar(e.target.value)}>
                <option value="">— Otro sitio (escribir abajo) —</option>
                {['cliente', 'proveedor', 'otro'].map((t) => {
                  const ls = clientes.filter((l) => l.tipo === t)
                  return ls.length ? <optgroup key={t} label={`${TIPOS_LUGAR[t]}es`.replace('Otroes', 'Otros')}>{ls.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</optgroup> : null
                })}
              </select></label>
          </div>
          <div className="fila-form">
            <label className="crece">Destino (nombre)<input value={f.destino} onChange={set('destino')} required /></label>
            <label className="crece">Dirección<input value={f.direccion} onChange={set('direccion')} /></label>
            <label>Municipio<input value={f.municipio} onChange={set('municipio')} /></label>
          </div>
          <div className="fila-form">
            <label>Contacto<input value={f.contacto} onChange={set('contacto')} /></label>
            <label>Teléfono<input value={f.telefono} onChange={set('telefono')} inputMode="tel" /></label>
            <label className="crece">Horario de atención<input value={f.horario} onChange={set('horario')} placeholder="p. ej. L-V 8:00-12:00" /></label>
          </div>
          <label>Ubicación (link de Google Maps o coordenadas)<input value={f.ubic} onChange={set('ubic')} placeholder="https://www.google.com/maps/… o 6.2442, -75.5812" />
            <span className="tenue pequeño">{ubic ? `✓ ${ubic.lat}, ${ubic.lng}` : 'Opcional, pero con ubicación el sistema puede ordenar la ruta por cercanía.'}</span></label>
          {!f.lugar_id && !f.id && (
            <div className="fila-form recurrente">
              <label className="check"><input type="checkbox" checked={f.guardarLugar} onChange={set('guardarLugar')} /> Guardar este sitio como recurrente</label>
              {f.guardarLugar && <select value={f.tipoLugar} onChange={set('tipoLugar')}>{Object.entries(TIPOS_LUGAR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
            </div>
          )}
          <div className="fila-form">
            <label>Día<input type="date" value={f.fecha} min={f.id ? undefined : hoy} onChange={set('fecha')} required /></label>
            <label>Franja<select value={f.franja} onChange={set('franja')}>{Object.entries(FRANJAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label>OP (opcional)<input value={f.op || ''} onChange={set('op')} style={{ width: 100 }} /></label>
          </div>
          <label>Qué se lleva o se recoge<textarea rows={2} value={f.descripcion} onChange={set('descripcion')} required placeholder="p. ej. 3 avisos en acrílico, 2 cajas" /></label>
          <div className="fila-form">
            <label className="check"><input type="checkbox" checked={!!f.necesita_camion} onChange={set('necesita_camion')} /> Necesita camión (grande o pesado)</label>
            <label className="check"><input type="checkbox" checked={Number(f.prioridad) === 1} onChange={(e) => setF({ ...f, prioridad: e.target.checked ? 1 : 2 })} /> Urgente</label>
          </div>
        </fieldset>
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
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado)').eq('fecha', fecha).neq('estado', 'cancelada')),
        // Lo que quedó pendiente o no se pudo hacer en días anteriores
        q(sb.from('vueltas').select('*, recorridos(fecha, vehiculo, estado)').lt('fecha', fecha).in('estado', ['pendiente', 'no_hecha']).gte('fecha', sumarDias(fecha, -60))),
      ])
      const ids = new Set(recs.map((r) => r.id))
      const vs = [...delDia, ...previas.filter((v) => !v.recorrido_id || !ids.has(v.recorrido_id))]
      setD({ recs, vs }); setError('')
    } catch (e) { setError(e.message) }
  }, [fecha])
  useEffect(() => { cargar() }, [cargar])

  const planta = aj && tieneUbic(aj) ? aj : null
  const rec = (veh) => d?.recs.find((r) => r.vehiculo === veh)
  const deVeh = (veh) => { const r = rec(veh); return r ? d.vs.filter((v) => v.recorrido_id === r.id).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)) : [] }
  const sinAsignar = d ? d.vs.filter((v) => !d.recs.some((r) => r.id === v.recorrido_id) && v.estado !== 'hecha') : []
  const bloqueado = (veh) => rec(veh)?.estado === 'confirmada'

  // Crea el recorrido del vehículo si no existe
  const asegurarRec = async (veh) => {
    const r = rec(veh)
    if (r) return r
    const [n] = await q(sb.from('recorridos').upsert({ fecha, vehiculo: veh }, { onConflict: 'fecha,vehiculo' }).select())
    return n
  }
  const guardarOrden = async (veh, lista) => {
    const r = await asegurarRec(veh)
    await Promise.all(lista.map((v, i) => q(sb.from('vueltas').update({ recorrido_id: r.id, orden: i + 1, ...(v.fecha !== fecha || v.estado === 'no_hecha' ? { fecha, estado: 'pendiente' } : {}) }).eq('id', v.id))))
  }
  const accion = async (fn, msg) => {
    setOcupado(true); setError(''); setOk('')
    try { await fn(); if (msg) setOk(msg); await cargar() } catch (e) { setError(e.message) }
    setOcupado(false)
  }
  const mover = (v, destino) => accion(async () => {
    if (!destino) { await q(sb.from('vueltas').update({ recorrido_id: null, orden: null }).eq('id', v.id)); return }
    await guardarOrden(destino, [...deVeh(destino).filter((x) => x.id !== v.id), v])
  })
  const subir = (veh, i, dir) => accion(async () => {
    const l = [...deVeh(veh)]; const j = i + dir
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    await guardarOrden(veh, l)
  })
  const ordenar = (veh) => accion(() => guardarOrden(veh, ordenarParadas(deVeh(veh), planta)), 'Paradas ordenadas por cercanía y franja.')
  const proponer = () => accion(async () => {
    const libres = [...sinAsignar, ...(bloqueado('camion') ? [] : deVeh('camion')), ...(bloqueado('mensajero') ? [] : deVeh('mensajero'))]
    const p = proponerAsignacion(libres, planta, aj.min_parada, aj.jornada_camion)
    if (!bloqueado('camion')) await guardarOrden('camion', p.camion)
    if (!bloqueado('mensajero') && p.mensajero.length) await guardarOrden('mensajero', p.mensajero)
  }, 'Asignación propuesta: el camión se llena primero hasta su jornada; lo demás va con mensajero. Revísala y confirma.')
  const confirmar = (veh, si) => accion(async () => {
    const r = await asegurarRec(veh)
    await q(sb.from('recorridos').update(si ? { estado: 'confirmada', confirmada_por: perfil?.user_id, confirmada_en: new Date().toISOString() } : { estado: 'borrador' }).eq('id', r.id))
  }, si ? `Ruta de ${VEHICULOS[veh].toLowerCase()} confirmada: ya la ve el conductor en su celular.` : 'La ruta volvió a borrador.')
  const guardarConductor = (veh, nombre) => accion(async () => { const r = await asegurarRec(veh); await q(sb.from('recorridos').update({ conductor: nombre.trim() || null }).eq('id', r.id)) })

  const vehiculos = ['camion', 'mensajero', ...(rec('externo') || deVeh('externo').length ? ['externo'] : [])]
  const [verExterno, setVerExterno] = useState(false)
  const cols = verExterno && !vehiculos.includes('externo') ? [...vehiculos, 'externo'] : vehiculos

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
        <button className="btn" disabled={ocupado || !aj || !d} onClick={proponer} title="Llena primero el camión hasta su jornada; lo demás va con mensajero">Proponer asignación</button>
        {!cols.includes('externo') && <button className="btn btn-sec btn-sm" onClick={() => setVerExterno(true)}>+ Otro transporte</button>}
        <button className="btn-link" onClick={() => setVerAjustes(true)}>Punto de salida y tiempos</button>
      </div>
      {aj && !planta && <Aviso tipo="warn">Falta la ubicación de la planta (punto de salida). Sin ella no se puede calcular el orden ni el tiempo de viaje. <button className="btn-link" onClick={() => setVerAjustes(true)}>Configurarla</button></Aviso>}
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      {!d || !aj ? <Cargando /> : (
        <div className="log-columnas" style={{ gridTemplateColumns: `repeat(${cols.length + 1}, minmax(260px, 1fr))` }}>
          <div className="log-col">
            <div className="log-col-cab"><b>Sin asignar</b><span className="tenue pequeño">{sinAsignar.length} {sinAsignar.length === 1 ? 'vuelta' : 'vueltas'}</span></div>
            {sinAsignar.length === 0 ? <div className="vacio pequeño">Nada pendiente.</div> : sinAsignar.map((v) => (
              <Parada key={v.id} v={v} fecha={fecha} onAbrir={() => setForm(v)}
                acciones={<select value="" disabled={ocupado} onChange={(e) => mover(v, e.target.value)}><option value="">Asignar a…</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{VEHICULOS[c]}</option>)}</select>} />
            ))}
          </div>
          {cols.map((veh) => {
            const ps = deVeh(veh), r = rec(veh), conf = r?.estado === 'confirmada'
            const est = estimar(ps, planta, aj.min_parada)
            const pasa = veh === 'camion' && est.total > aj.jornada_camion
            const links = linksRecorrido(ps, planta)
            return (
              <div key={veh} className={`log-col${conf ? ' confirmada' : ''}`}>
                <div className="log-col-cab">
                  <b>{VEHICULOS[veh]}</b>
                  <span className={`badge ${conf ? 'badge-info' : 'badge-muted'}`}>{conf ? 'Confirmada' : 'Borrador'}</span>
                </div>
                <div className="log-est">
                  {ps.length} {ps.length === 1 ? 'parada' : 'paradas'} · ≈ <b className={pasa ? 't-mal' : ''}>{fmtMin(est.total)}</b>{planta && est.km ? ` · ${fmtNum(est.km, 0)} km` : ''}
                  {pasa && <div className="t-mal pequeño">Pasa la jornada del camión ({fmtMin(aj.jornada_camion)}): mueve algo al mensajero.</div>}
                  {est.sinUbic > 0 && ps.length > 0 && <div className="tenue pequeño">{est.sinUbic} sin ubicación: el tiempo es aproximado.</div>}
                </div>
                <input className="log-conductor" placeholder={veh === 'camion' ? 'Conductor' : 'Quién la hace'} defaultValue={r?.conductor || ''} key={r?.id || veh} disabled={conf}
                  onBlur={(e) => e.target.value !== (r?.conductor || '') && guardarConductor(veh, e.target.value)} />
                {ps.map((v, i) => (
                  <Parada key={v.id} v={v} n={i + 1} fecha={fecha} onAbrir={() => setForm(v)}
                    acciones={conf ? null : <>
                      <button className="btn-icono" disabled={ocupado || i === 0} onClick={() => subir(veh, i, -1)} title="Subir">↑</button>
                      <button className="btn-icono" disabled={ocupado || i === ps.length - 1} onClick={() => subir(veh, i, 1)} title="Bajar">↓</button>
                      <select value={veh} disabled={ocupado} onChange={(e) => mover(v, e.target.value)}>
                        <option value="">Quitar de la ruta</option>{cols.filter((c) => !bloqueado(c)).map((c) => <option key={c} value={c}>{VEHICULOS[c]}</option>)}
                      </select>
                    </>} />
                ))}
                <div className="log-col-pie">
                  {!conf && ps.length > 1 && <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => ordenar(veh)}>Ordenar por cercanía</button>}
                  {links.map((l, i) => <a key={l} className="btn btn-sec btn-sm" href={l} target="_blank" rel="noreferrer">Ver en Google Maps{links.length > 1 ? ` (${i + 1})` : ''}</a>)}
                  {ps.length > 0 && (conf
                    ? <button className="btn btn-sec btn-sm" disabled={ocupado} onClick={() => confirmar(veh, false)}>Volver a borrador</button>
                    : <button className="btn btn-sm" disabled={ocupado} onClick={() => confirmar(veh, true)}>Confirmar ruta</button>)}
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

function Parada({ v, n, fecha, acciones, onAbrir }) {
  return (
    <div className={`log-parada ${v.tipo}${v.estado === 'hecha' ? ' hecha' : ''}${v.estado === 'no_hecha' ? ' no-hecha' : ''}`}>
      <div className="log-parada-cab" onClick={onAbrir}>
        {n && <span className="log-n">{n}</span>}
        <div className="crece">
          <div><span className={`etq-vuelta ${v.tipo}`}>{TIPOS_VUELTA[v.tipo]}</span><b>{v.destino}</b></div>
          <div className="tenue pequeño">{[v.direccion, v.municipio].filter(Boolean).join(', ') || 'Sin dirección'}{!tieneUbic(v) && ' · sin ubicación'}</div>
          <div className="pequeño">{v.descripcion}{v.op ? ` · OP ${v.op}` : ''}</div>
          <div className="log-tags">
            {v.franja !== 'todo' && <span className="etq">{FRANJAS[v.franja].toLowerCase()}</span>}
            {v.necesita_camion && <span className="etq">camión</span>}
            {v.prioridad === 1 && <span className="badge badge-bad">urgente</span>}
            {v.fecha < fecha && <span className="badge badge-warn">de {fmtFecha(v.fecha).slice(0, 5)}</span>}
            {v.estado === 'no_hecha' && <span className="badge badge-bad" title={v.resultado || ''}>no se pudo{v.resultado ? `: ${v.resultado}` : ''}</span>}
            {v.estado === 'hecha' && <span className="badge badge-ok">hecha</span>}
            {v.horario && <span className="tenue pequeño">🕒 {v.horario}</span>}
          </div>
        </div>
      </div>
      {acciones && <div className="log-parada-acc">{acciones}</div>}
    </div>
  )
}

function AjustesLogistica({ aj, onClose, onGuardado }) {
  const [ubic, setUbic] = useState(tieneUbic(aj) ? `${aj.lat}, ${aj.lng}` : '')
  const [minParada, setMinParada] = useState(aj.min_parada)
  const [jornada, setJornada] = useState(aj.jornada_camion / 60)
  const [error, setError] = useState('')
  const u = leerUbicacion(ubic)
  const guardar = async (e) => {
    e.preventDefault()
    if (!u) { setError(esLinkCorto(ubic) ? 'Ese es un link corto: ábrelo y copia el link completo o las coordenadas.' : 'Pega el link completo de Google Maps de la planta o sus coordenadas.'); return }
    try {
      await q(sb.from('ajustes').upsert({ clave: 'logistica', valor: { ...aj, lat: u.lat, lng: u.lng, min_parada: Number(minParada) || 20, jornada_camion: Math.round((Number(String(jornada).replace(',', '.')) || 8.5) * 60) } }))
      onGuardado()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal titulo="Punto de salida y tiempos" onClose={onClose} ancho={560}>
      <form className="form" onSubmit={guardar}>
        <label>Ubicación de la planta (link de Google Maps o coordenadas)<input value={ubic} onChange={(e) => setUbic(e.target.value)} placeholder="6.2442, -75.5812" />
          <span className="tenue pequeño">{u ? `✓ ${u.lat}, ${u.lng}` : 'En Google Maps, mantén presionado el punto de la planta y copia las coordenadas que aparecen.'}</span></label>
        <div className="fila-form">
          <label>Minutos promedio por parada<input type="number" min={5} value={minParada} onChange={(e) => setMinParada(e.target.value)} /></label>
          <label>Jornada del camión (horas)<input value={jornada} onChange={(e) => setJornada(e.target.value)} inputMode="decimal" /></label>
        </div>
        <p className="tenue pequeño">El tiempo de viaje se estima por la distancia en línea recta × 1,4 a 22 km/h (tráfico de ciudad). Cuando conectemos el GPS del camión se podrá ajustar con datos reales.</p>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  )
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
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Dirección</th><th>Contacto</th><th>Horario</th><th>Ubicación</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.id} onClick={() => setForm(l)} className={l.activo ? '' : 'omitida'}>
              <td><b>{l.nombre}</b></td><td>{TIPOS_LUGAR[l.tipo]}</td>
              <td>{[l.direccion, l.municipio].filter(Boolean).join(', ')}</td>
              <td>{l.contacto}{l.telefono && <div className="tenue pequeño">{l.telefono}</div>}</td>
              <td className="pequeño">{l.horario}</td>
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
  const [f, setF] = useState(() => ({ nombre: '', direccion: '', municipio: '', contacto: '', telefono: '', horario: '', notas: '', ...Object.fromEntries(Object.entries(inicial).filter(([, v]) => v !== null)),
    ubic: tieneUbic(inicial) ? `${inicial.lat}, ${inicial.lng}` : '' }))
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const u = leerUbicacion(f.ubic)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (f.ubic && !u) { setError(esLinkCorto(f.ubic) ? 'Ese es un link corto de Google Maps: ábrelo y copia el link completo o las coordenadas.' : 'No reconozco esa ubicación. Pega el link completo de Google Maps o las coordenadas.'); return }
    const fila = { tipo: f.tipo, nombre: f.nombre.trim(), direccion: f.direccion.trim() || null, municipio: f.municipio.trim() || null, contacto: f.contacto.trim() || null,
      telefono: f.telefono.trim() || null, horario: f.horario.trim() || null, notas: f.notas.trim() || null, lat: u?.lat ?? null, lng: u?.lng ?? null }
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
          <label className="crece">Horario de atención<input value={f.horario} onChange={set('horario')} placeholder="L-V 8:00-12:00 y 2:00-5:00" /></label>
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
