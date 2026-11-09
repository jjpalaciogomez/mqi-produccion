import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Barra, Cargando, ESTADO_OP, EstadoTarea, Modal, Semaforo, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import Mapa from './Mapa.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { DIF_NOMBRE, ETIQUETA_MEDIDA, stdUnidad, textoMedidas } from '../estandar.js'

const AREAS_PLANTA = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']

export default function OrdenDetalle({ id, perfil, gestor }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('estructura')
  const [modal, setModal] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [orden, items, comps, tareas, productos, etapas, difs] = await Promise.all([
        q(sb.from('v_ordenes').select('*').eq('id', id).maybeSingle()),
        q(sb.from('items').select('*').eq('orden_id', id).order('numero')),
        q(sb.from('componentes').select('*, items!inner(orden_id)').eq('items.orden_id', id)),
        q(sb.from('v_tareas').select('*').eq('orden_id', id).order('paso')),
        q(sb.from('productos').select('*').eq('activo', true).order('codigo')),
        q(sb.from('etapas_producto').select('*').order('paso').order('id')),
        q(sb.from('dificultades').select('*').order('orden')),
      ])
      if (!orden) { setError('No se encontró la OP.'); return }
      setD({ orden, items, comps, tareas, productos, etapas, difs }); setError('')
    } catch (e) { setError(e.message) }
  }, [id])

  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t) }, [cargar])

  if (error && !d) return <Aviso>{error}</Aviso>
  if (!d) return <Cargando />
  const { orden } = d

  return (
    <div>
      <a href="#/" className="volver">← Tablero</a>
      <div className="titulo-pagina">
        <div>
          <h1>OP {orden.numero} · {orden.cliente}</h1>
          <div className="tenue">{orden.proyecto}{orden.comercial ? ` · Comercial: ${orden.comercial}` : ''}</div>
        </div>
        <div className="titulo-acciones">
          <BotonAyuda clave={vista === 'mapa' ? 'mapa' : 'op'} rol={perfil.rol} />
          {gestor && <button className="btn btn-sec" onClick={() => setModal('editar')}>Editar datos</button>}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Compromiso</span><b>{fmtFecha(orden.fecha_compromiso)}</b></div>
        <div className="kpi"><span>Cumplimiento</span><b><Semaforo valor={orden.semaforo} /></b></div>
        <div className="kpi"><span>Estado</span><b>{ESTADO_OP[orden.estado]}</b></div>
        <div className="kpi"><span>Avance</span><b><Barra pct={orden.avance_pct} /></b></div>
        <div className="kpi"><span>Trabajo estándar</span><b>{fmtMin(orden.min_std_terminado)} / {fmtMin(orden.min_std_total)}</b></div>
      </div>
      {orden.notas && <p className="notas-op">{orden.notas}</p>}
      <Aviso>{error}</Aviso>

      <div className="segmentado pestañas">
        <button className={vista === 'estructura' ? 'sel' : ''} onClick={() => setVista('estructura')}>Ítems y pasos</button>
        <button className={vista === 'mapa' ? 'sel' : ''} onClick={() => setVista('mapa')}>Mapa del proyecto</button>
      </div>

      {vista === 'mapa'
        ? <Mapa orden={orden} items={d.items} comps={d.comps} tareas={d.tareas} productos={d.productos} />
        : <Estructura d={d} gestor={gestor} perfil={perfil} recargar={cargar} setError={setError} />}

      {modal === 'editar' && <EditarOP orden={orden} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
    </div>
  )
}

function Estructura({ d, gestor, perfil, recargar, setError }) {
  const { orden, items, comps, tareas, productos, etapas, difs } = d
  const [nuevoItem, setNuevoItem] = useState(false)
  const prodPorCod = useMemo(() => Object.fromEntries(productos.map((p) => [p.codigo, p])), [productos])

  const accion = async (fn) => { try { await fn(); await recargar() } catch (e) { setError(e.message) } }

  if (items.length === 0 && !gestor) return <div className="vacio">Esta OP todavía no tiene ítems.</div>

  return (
    <div className="items">
      {items.length === 0 && (
        <div className="vacio">
          Esta OP aún no tiene ítems. Un ítem es lo que se entrega al cliente (una mesa, un aviso, una barra);
          dentro de cada ítem agregas los productos estándar que lo forman.
        </div>
      )}
      {items.map((it) => {
        const cs = comps.filter((c) => c.item_id === it.id)
        const ens = tareas.find((t) => t.item_id === it.id && !t.componente_id)
        return (
          <section key={it.id} className="tarjeta item">
            <div className="item-cab">
              <h2>Ítem {it.numero} · {it.descripcion} <span className="tenue">× {fmtNum(it.cantidad, 2)}</span></h2>
              <div className="tenue">Ensamble final: {it.area_ensamble || '—'}</div>
              {gestor && (
                <button className="btn-link peligro" onClick={() => {
                  if (tareas.some((t) => t.item_id === it.id && ['en_curso', 'pausada', 'terminada'].includes(t.estado))) {
                    setError('No se puede borrar un ítem con pasos ya iniciados.'); return
                  }
                  accion(() => q(sb.from('items').delete().eq('id', it.id)))
                }}>Borrar ítem</button>
              )}
            </div>

            {cs.map((c) => (
              <Componente key={c.id} c={c} it={it} prod={prodPorCod[c.producto]} tareas={tareas.filter((t) => t.componente_id === c.id)}
                productos={productos} etapas={etapas} difs={difs} gestor={gestor} perfil={perfil} accion={accion} setError={setError} />
            ))}

            {ens && (
              <div className="componente ensamble">
                <div className="comp-cab"><b>Ensamble final del ítem</b><span className="tenue"> · empieza cuando terminan todos los productos</span></div>
                <TablaTareas tareas={[ens]} gestor={gestor} perfil={perfil} accion={accion} setError={setError} />
              </div>
            )}

            {gestor && <AgregarComponente item={it} productos={productos} etapas={etapas} difs={difs} nComps={cs.length} accion={accion} />}
          </section>
        )
      })}
      {gestor && (nuevoItem
        ? <AgregarItem orden={orden} items={items} onClose={() => setNuevoItem(false)} accion={accion} />
        : <button className="btn" onClick={() => setNuevoItem(true)}>+ Agregar ítem</button>)}
    </div>
  )
}

function Componente({ c, it, prod, tareas, productos, etapas, difs, gestor, perfil, accion, setError }) {
  const [editando, setEditando] = useState(false)
  const iniciado = tareas.some((t) => ['en_curso', 'pausada', 'terminada'].includes(t.estado))
  const medidas = textoMedidas(prod?.medida, c.ancho, c.profundidad, c.alto)
  const total = Number(c.cantidad || 1) * Number(it.cantidad || 1)
  if (editando) {
    return <FormComponente item={it} productos={productos} etapas={etapas} difs={difs} inicial={c}
      onClose={() => setEditando(false)} accion={accion} />
  }
  return (
    <div className="componente">
      <div className="comp-cab">
        <b>{c.producto}</b> {prod?.nombre}
        {medidas ? <> · <b>{medidas}</b></> : prod?.medida !== 'UNIDAD' && <span className="etq etq-alerta">faltan medidas</span>}
        <span className={`etq dif-${c.dificultad}`}>Dificultad {DIF_NOMBRE[c.dificultad]?.toLowerCase()}</span>
        <span className="tenue"> · {fmtNum(c.cantidad, 2)} por ítem = {fmtNum(total, 2)} und</span>
        {c.descripcion && <span className="tenue"> · {c.descripcion}</span>}
        {gestor && <button className="btn-link" onClick={() => setEditando(true)}>Editar</button>}
        {gestor && !iniciado && (
          <button className="btn-link peligro" onClick={() => accion(() => q(sb.from('componentes').delete().eq('id', c.id)))}>Quitar</button>
        )}
      </div>
      <TablaTareas tareas={tareas} gestor={gestor} perfil={perfil} accion={accion} setError={setError} />
    </div>
  )
}

function TablaTareas({ tareas, gestor, perfil, accion }) {
  const cambiarEstado = (t, estado) => accion(() => q(sb.from('tareas').update({ estado }).eq('id', t.id)))
  const alternar = (t) => {
    // Activa esta alternativa y omite las demás del mismo paso
    const hermanas = tareas.filter((x) => x.paso === t.paso && x.alternativa && x.id !== t.id)
    accion(async () => {
      await q(sb.from('tareas').update({ estado: 'pendiente' }).eq('id', t.id))
      for (const h of hermanas) if (h.estado === 'pendiente') await q(sb.from('tareas').update({ estado: 'omitida' }).eq('id', h.id))
    })
  }
  const tercero = (t, fase) => accion(async () => {
    if (fase === 'enviar') {
      await q(sb.from('registros').insert({ tarea_id: t.id, persona_id: perfil.persona_id }))
      await q(sb.from('tareas').update({ estado: 'en_curso' }).eq('id', t.id))
      await sb.from('ordenes').update({ estado: 'en_planta' }).eq('id', t.orden_id).eq('estado', 'borrador')
    } else {
      await q(sb.from('registros').update({ fin: new Date().toISOString() }).eq('tarea_id', t.id).is('fin', null))
      await q(sb.from('tareas').update({ estado: 'terminada', cantidad_hecha: t.cantidad }).eq('id', t.id))
    }
  })

  return (
    <table className="tabla tabla-tareas">
      <thead><tr><th>Paso</th><th>Área</th><th>Cantidad</th><th>Estándar</th><th>Real</th><th>Estado</th>{gestor && <th />}</tr></thead>
      <tbody>
        {tareas.map((t) => (
          <tr key={t.id} className={t.estado === 'omitida' ? 'omitida' : ''}>
            <td className="centrado">{t.paso === 999 ? 'Final' : t.paso}</td>
            <td><b>{t.area}</b>{t.opcional && <span className="etq">opcional</span>}{t.alternativa && <span className="etq">alternativa</span>}</td>
            <td className="celda-cant">
              {t.estado === 'terminada' && t.cantidad_hecha !== null ? fmtNum(t.cantidad_hecha, 2) : fmtNum(t.cantidad, 2)}
              <span className="unidad">{t.unidad === 'UND' ? 'und' : t.unidad}</span>
            </td>
            <td>{t.proceso === 'TER-1' ? `${fmtNum(t.tiempo_std_unit, 0)} días`
              : t.tiempo_std_unit !== null ? <>{fmtMin(t.min_std)}{Number(t.cantidad) > 1 && <span className="tenue pequeño"> ({fmtMin(t.tiempo_std_unit)} c/u)</span>}</>
              : <span className="tenue">{t.componente_id ? 'faltan medidas' : 'sin estándar'}</span>}</td>
            <td>{Number(t.min_reales) > 0 ? fmtMin(t.min_reales) : '—'}</td>
            <td><EstadoTarea estado={t.estado} bloqueada={t.bloqueada} /></td>
            {gestor && (
              <td className="acciones-fila">
                {t.proceso === 'TER-1' && t.estado === 'pendiente' && !t.bloqueada && <button className="btn btn-sm" onClick={() => tercero(t, 'enviar')}>Enviado al tercero</button>}
                {t.proceso === 'TER-1' && t.estado === 'en_curso' && <button className="btn btn-sm" onClick={() => tercero(t, 'recibir')}>Recibido</button>}
                {t.alternativa && t.estado === 'omitida' && <button className="btn-link" onClick={() => alternar(t)}>Usar esta</button>}
                {t.opcional && t.estado === 'pendiente' && <button className="btn-link" onClick={() => cambiarEstado(t, 'omitida')}>Omitir</button>}
                {t.opcional && !t.alternativa && t.estado === 'omitida' && <button className="btn-link" onClick={() => cambiarEstado(t, 'pendiente')}>Incluir</button>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AgregarItem({ orden, items, onClose, accion }) {
  const [f, setF] = useState({ descripcion: '', cantidad: 1, area_ensamble: 'METAL' })
  const guardar = (e) => {
    e.preventDefault()
    const numero = Math.max(0, ...items.map((i) => i.numero)) + 1
    accion(() => q(sb.from('items').insert({ ...f, cantidad: Number(f.cantidad), orden_id: orden.id, numero }))).then(onClose)
  }
  return (
    <form className="tarjeta form" onSubmit={guardar}>
      <h3>Nuevo ítem</h3>
      <label>Descripción *<input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} required placeholder="Ej. Mesas para clientes" autoFocus /></label>
      <div className="fila2">
        <label>Cantidad<input type="number" min="0" step="any" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></label>
        <label>Área del ensamble final
          <select value={f.area_ensamble} onChange={(e) => setF({ ...f, area_ensamble: e.target.value })}>
            {AREAS_PLANTA.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <p className="nota">El ensamble final se crea solo cuando el ítem tiene dos o más productos.</p>
      <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">Agregar ítem</button></div>
    </form>
  )
}

function AgregarComponente({ item, productos, etapas, difs, nComps, accion }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) return <button className="btn btn-sec btn-sm" onClick={() => setAbierto(true)}>+ Agregar producto a este ítem</button>
  return <FormComponente item={item} productos={productos} etapas={etapas} difs={difs} nComps={nComps}
    onClose={() => setAbierto(false)} accion={accion} />
}

// Formulario para agregar o editar un producto dentro de un ítem: medidas, dificultad y unidades
function FormComponente({ item, productos, etapas, difs, nComps = 0, inicial, onClose, accion }) {
  const [f, setF] = useState({
    producto: inicial?.producto || '', cantidad: inicial ? String(inicial.cantidad) : '1', descripcion: inicial?.descripcion || '',
    ancho: inicial?.ancho ?? '', profundidad: inicial?.profundidad ?? '', alto: inicial?.alto ?? '', dificultad: inicial?.dificultad || 'MEDIO',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const familias = useMemo(() => {
    const g = {}
    for (const p of productos) (g[p.familia] ||= []).push(p)
    return g
  }, [productos])
  const prod = productos.find((p) => p.codigo === f.producto)
  const mult = difs.find((d) => d.nivel === f.dificultad)?.multiplicador
  const unidades = (Number(String(f.cantidad).replace(',', '.')) || 0) * Number(item.cantidad || 1)
  const pasos = etapas.filter((e) => e.producto === f.producto)
  const num = (v) => (v === '' || v === null ? null : Number(String(v).replace(',', '.')))

  const guardar = (e) => {
    e.preventDefault()
    const fila = {
      producto: f.producto, cantidad: num(f.cantidad) || 1, descripcion: f.descripcion || null, dificultad: f.dificultad,
      ancho: prod?.medida === 'UNIDAD' ? null : num(f.ancho),
      profundidad: prod?.medida === 'CM3' ? num(f.profundidad) : null,
      alto: prod?.medida === 'UNIDAD' ? null : num(f.alto),
    }
    accion(async () => {
      let id = inicial?.id
      if (id) await q(sb.from('componentes').update(fila).eq('id', id))
      else id = (await q(sb.from('componentes').insert({ ...fila, item_id: item.id }).select('id').single())).id
      await q(sb.rpc('generar_tareas', { p_componente: id }))
      if (!inicial && nComps + 1 >= 2) await q(sb.rpc('generar_ensamble', { p_item: item.id }))
    }).then(onClose)
  }

  return (
    <form className="agregar-comp" onSubmit={guardar}>
      <label>Producto estándar
        <select value={f.producto} onChange={set('producto')} required autoFocus disabled={!!inicial}>
          <option value="">Selecciona…</option>
          {Object.entries(familias).map(([fam, ps]) => (
            <optgroup key={fam} label={fam}>
              {ps.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.nombre}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {prod && !inicial && <p className="nota">Incluye: {prod.incluye}</p>}

      {prod && prod.medida !== 'UNIDAD' && (
        <div className="fila3">
          <label>Ancho (cm)<input value={f.ancho} onChange={set('ancho')} inputMode="decimal" required /></label>
          {prod.medida === 'CM3' && <label>Profundidad (cm)<input value={f.profundidad} onChange={set('profundidad')} inputMode="decimal" required /></label>}
          <label>{prod.medida === 'CM3' ? 'Alto (cm)' : 'Alto o largo (cm)'}<input value={f.alto} onChange={set('alto')} inputMode="decimal" required /></label>
        </div>
      )}
      {prod && (
        <div className="fila3">
          <label>Dificultad
            <select value={f.dificultad} onChange={set('dificultad')}>
              {difs.map((d) => <option key={d.nivel} value={d.nivel}>{d.nombre} (×{fmtNum(d.multiplicador, 2)})</option>)}
            </select>
          </label>
          <label>Unidades por ítem<input value={f.cantidad} onChange={set('cantidad')} inputMode="decimal" required /></label>
          <label>Detalle (opcional)<input value={f.descripcion} onChange={set('descripcion')} placeholder="Ej. base de mesa, tubo 1½" /></label>
        </div>
      )}

      {prod && (
        <div className="previa-std">
          <div className="tenue pequeño">{ETIQUETA_MEDIDA[prod.medida]} · referencia: {prod.ref_descripcion || '—'} · total {fmtNum(unidades, 2)} und</div>
          {pasos.length === 0 ? <div className="tenue">Este producto no tiene ruta: no se crearán pasos.</div> : (
            <ul>
              {pasos.map((e) => {
                const u = stdUnidad(prod, e, f, mult)
                return (
                  <li key={e.id}><b>{e.area}</b>{e.alternativa && ' (alternativa)'}{e.opcional && ' (opcional)'}: {' '}
                    {e.area === 'TERCEROS' ? 'en días' : u === null ? <span className="tenue">{e.min_ref === null ? 'sin estándar' : 'escribe las medidas'}</span>
                      : <>{fmtMin(u)} c/u · <b>{fmtMin(u * unidades)}</b></>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <div className="acciones">
        <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
        <button className="btn">{inicial ? 'Guardar y recalcular pasos' : 'Agregar y crear pasos'}</button>
      </div>
    </form>
  )
}

function EditarOP({ orden, onClose, onSaved }) {
  const [f, setF] = useState({
    cliente: orden.cliente, proyecto: orden.proyecto, comercial: orden.comercial || '', fecha_compromiso: orden.fecha_compromiso || '',
    prioridad: orden.prioridad, estado: orden.estado, fecha_entrega_real: orden.fecha_entrega_real || '', notas: orden.notas || '',
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const guardar = async (e) => {
    e.preventDefault()
    const { error } = await sb.from('ordenes').update({
      ...f, prioridad: Number(f.prioridad), fecha_compromiso: f.fecha_compromiso || null, fecha_entrega_real: f.fecha_entrega_real || null,
    }).eq('id', orden.id)
    if (error) setError(error.message); else onSaved()
  }
  return (
    <Modal titulo={`Editar OP ${orden.numero}`} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label>Cliente<input value={f.cliente} onChange={set('cliente')} required /></label>
        <label>Proyecto<input value={f.proyecto} onChange={set('proyecto')} required /></label>
        <div className="fila2">
          <label>Comercial<input value={f.comercial} onChange={set('comercial')} /></label>
          <label>Prioridad<select value={f.prioridad} onChange={set('prioridad')}>{[1, 2, 3, 4, 5].map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
        <div className="fila2">
          <label>Fecha compromiso<input type="date" value={f.fecha_compromiso} onChange={set('fecha_compromiso')} /></label>
          <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(ESTADO_OP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label>Fecha de entrega real<input type="date" value={f.fecha_entrega_real} onChange={set('fecha_entrega_real')} /></label>
        <label>Notas<textarea rows={3} value={f.notas} onChange={set('notas')} /></label>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  )
}
