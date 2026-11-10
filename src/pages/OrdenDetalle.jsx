import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Barra, Cargando, ESTADO_OP, EstadoTarea, Modal, Semaforo, fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import Mapa from './Mapa.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { AREAS_PLANTA, DIF_NOMBRE, ETIQUETA_MEDIDA, esTerceros, pasosPrincipales, stdPaso, textoMedidas } from '../estandar.js'


export default function OrdenDetalle({ id, perfil, gestor }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('estructura')
  const [modal, setModal] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const [orden, items, comps, tareas, productos, rutas, difs] = await Promise.all([
        q(sb.from('v_ordenes').select('*').eq('id', id).maybeSingle()),
        q(sb.from('items').select('*').eq('orden_id', id).order('numero')),
        q(sb.from('componentes').select('*, items!inner(orden_id)').eq('items.orden_id', id)),
        q(sb.from('v_tareas').select('*').eq('orden_id', id).order('paso').order('creado')),
        q(sb.from('productos').select('*').order('codigo')),
        q(sb.from('rutas').select('*, procesos(nombre, area)').order('paso').order('id')),
        q(sb.from('dificultades').select('*').order('orden')),
      ])
      if (!orden) { setError('No se encontró la OP.'); return }
      const ids = tareas.map((t) => t.id)
      const registros = ids.length ? await q(sb.from('registros')
        .select('id, tarea_id, inicio, fin, minutos, cantidad, observacion, lote, motivo_pausa, personas(nombre)')
        .in('tarea_id', ids).is('motivo_pausa', null).order('inicio')) : []
      setD({ orden, items, comps, tareas, productos, rutas, difs, registros }); setError('')
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
          {gestor && <button className="btn btn-sec" title="Aplica los estándares y dificultades vigentes a los pasos que no han terminado" onClick={async () => {
            if (!window.confirm('¿Recalcular el tiempo estándar de esta OP con los estándares vigentes? Los pasos ya terminados no cambian.')) return
            const { error } = await sb.rpc('recalcular_estandares', { p_orden: orden.id })
            if (error) setError(error.message); else cargar()
          }}>Recalcular estándares</button>}
          {gestor && <button className="btn btn-sec" onClick={() => setModal('editar')}>Editar datos</button>}
          {gestor && <button className="btn btn-sec peligro-txt" onClick={() => setModal('eliminar')}>Eliminar OP</button>}
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
        : <RegistrosCtx.Provider value={d.registros}><Estructura d={d} gestor={gestor} perfil={perfil} recargar={cargar} setError={setError} /></RegistrosCtx.Provider>}

      {modal === 'editar' && <EditarOP orden={orden} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
      {modal === 'eliminar' && <EliminarOP orden={orden} nRegistros={d.registros.length} onClose={() => setModal(null)} />}
    </div>
  )
}

function Estructura({ d, gestor, perfil, recargar, setError }) {
  const { orden, items, comps, tareas, productos, rutas, difs } = d
  const [nuevoItem, setNuevoItem] = useState(false)
  const prodPorCod = useMemo(() => Object.fromEntries(productos.map((p) => [p.codigo, p])), [productos])
  const activos = useMemo(() => productos.filter((p) => p.activo), [productos])

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
      {items.map((it) => (
        <Item key={it.id} it={it} cs={comps.filter((c) => c.item_id === it.id)} tareas={tareas.filter((t) => t.item_id === it.id)}
          prodPorCod={prodPorCod} productos={activos} rutas={rutas} difs={difs} gestor={gestor} perfil={perfil} accion={accion} setError={setError} />
      ))}
      {gestor && (nuevoItem
        ? <FormItem orden={orden} items={items} onClose={() => setNuevoItem(false)} accion={accion} />
        : <button className="btn" onClick={() => setNuevoItem(true)}>+ Agregar ítem</button>)}
    </div>
  )
}

function Item({ it, cs, tareas, prodPorCod, productos, rutas, difs, gestor, perfil, accion, setError }) {
  const [editando, setEditando] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  const ens = tareas.find((t) => !t.componente_id)
  const sincronizar = () => q(sb.rpc('sincronizar_item', { p_item: it.id }))
  const iniciado = tareas.some((t) => ['en_curso', 'pausada', 'terminada'].includes(t.estado))

  return (
    <section className="tarjeta item">
      {editando ? <FormItem inicial={it} onClose={() => setEditando(false)} accion={accion} /> : (
        <div className="item-cab">
          <h2 className="item-tit"><small>Ítem {it.numero}</small>{it.descripcion} <span className="tenue">× {fmtNum(it.cantidad, 2)}</span></h2>
          {gestor && <button className="btn-link" onClick={() => setEditando(true)}>Editar ítem</button>}
          {gestor && <button className="btn-link" onClick={() => setMoviendo(true)}>Mover a otra OP</button>}
          {gestor && (
            <button className="btn-link peligro" onClick={() => {
              if (iniciado) { setError('No se puede borrar un ítem con pasos ya iniciados.'); return }
              if (!window.confirm(`¿Borrar el ítem ${it.numero} (${it.descripcion}) y todos sus pasos?`)) return
              accion(() => q(sb.from('items').delete().eq('id', it.id)))
            }}>Borrar ítem</button>
          )}
        </div>
      )}

      {cs.map((c) => (
        <Componente key={c.id} c={c} it={it} prod={prodPorCod[c.producto]} tareas={tareas.filter((t) => t.componente_id === c.id)}
          productos={productos} rutas={rutas} difs={difs} gestor={gestor} perfil={perfil} accion={accion} sincronizar={sincronizar} />
      ))}

      {ens && (
        <div className="componente ensamble">
          <div className="comp-cab">
            <b>Ensamble final</b><span className="tenue"> · el ítem lleva productos de varias familias; empieza cuando terminan todos</span>
            {gestor && ens.estado !== 'terminada' ? (
              <span className="ens-ctrl">
                <label>Área
                  <select value={it.area_ensamble || ''} onChange={(e) => accion(async () => { await q(sb.from('items').update({ area_ensamble: e.target.value }).eq('id', it.id)); await sincronizar() })}>
                    {AREAS_PLANTA.filter((a) => a !== 'PINTURA').map((a) => <option key={a}>{a}</option>)}
                  </select>
                </label>
                <label>Dificultad
                  <select value={it.dificultad_ensamble} onChange={(e) => accion(async () => { await q(sb.from('items').update({ dificultad_ensamble: e.target.value }).eq('id', it.id)); await sincronizar() })}>
                    {difs.map((d) => <option key={d.nivel} value={d.nivel}>{d.nombre} (×{fmtNum(d.multiplicador, 2)})</option>)}
                  </select>
                </label>
              </span>
            ) : <span className={`etq dif-${it.dificultad_ensamble}`}>Dificultad {DIF_NOMBRE[it.dificultad_ensamble]?.toLowerCase()}</span>}
          </div>
          <TablaTareas tareas={[ens]} gestor={gestor} perfil={perfil} accion={accion} />
        </div>
      )}

      {moviendo && <MoverItem it={it} onClose={() => setMoviendo(false)} accion={accion} />}
      {gestor && <AgregarComponente item={it} productos={productos} rutas={rutas} difs={difs} accion={accion} sincronizar={sincronizar} />}
    </section>
  )
}

function Componente({ c, it, prod, tareas, productos, rutas, difs, gestor, perfil, accion, sincronizar }) {
  const [editando, setEditando] = useState(false)
  const iniciado = tareas.some((t) => ['en_curso', 'pausada', 'terminada'].includes(t.estado))
  const medidas = textoMedidas(prod?.medida, c.ancho, c.profundidad, c.alto)
  const total = Number(c.cantidad || 1) * Number(it.cantidad || 1)
  if (editando) {
    return <FormComponente item={it} productos={productos} rutas={rutas} difs={difs} inicial={c}
      onClose={() => setEditando(false)} accion={accion} sincronizar={sincronizar} />
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
          <button className="btn-link peligro" onClick={() => accion(async () => { await q(sb.from('componentes').delete().eq('id', c.id)); await sincronizar() })}>Quitar</button>
        )}
      </div>
      <TablaTareas tareas={tareas} gestor={gestor} perfil={perfil} accion={accion} />
    </div>
  )
}

const RegistrosCtx = createContext([])

function TablaTareas({ tareas, gestor, perfil, accion }) {
  const registros = useContext(RegistrosCtx)
  const [abierta, setAbierta] = useState(null)
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
      <thead><tr><th>Paso</th><th>Proceso</th><th>Área</th><th>Cantidad</th><th>Estándar</th><th>Real</th><th>Quién</th><th>Estado</th>{gestor && <th />}</tr></thead>
      <tbody>
        {tareas.map((t) => {
          const regs = registros.filter((r) => r.tarea_id === t.id)
          return [
          <tr key={t.id} className={t.estado === 'omitida' ? 'omitida' : ''}>
            <td className="centrado">{t.paso === 999 ? 'Final' : t.paso}</td>
            <td>{t.proceso && <b>{t.proceso} </b>}{t.proceso_nombre}{t.opcional && <span className="etq">opcional</span>}{t.alternativa && <span className="etq">alternativa</span>}</td>
            <td>{t.area}</td>
            <td className="celda-cant">
              {t.estado !== 'terminada' && Number(t.cantidad_registrada) > 0 ? `${fmtNum(t.cantidad_registrada, 2)} de ${fmtNum(t.cantidad, 2)}` : fmtNum(t.cantidad_hecha ?? t.cantidad, 2)}
              <span className="unidad">und</span>
            </td>
            <td>{esTerceros(t) ? `${fmtNum(t.tiempo_std_unit, 0)} días`
              : t.tiempo_std_unit !== null ? <>{fmtMin(t.min_std)}{Number(t.cantidad) > 1 && <span className="tenue pequeño"> ({fmtMin(t.tiempo_std_unit)} c/u)</span>}</>
              : <span className="tenue">{t.componente_id ? 'faltan medidas' : 'sin estándar'}</span>}</td>
            <td>{Number(t.min_reales) > 0 ? (esTerceros(t) ? `${fmtNum(Number(t.min_reales) / 1440, 1)} días` : fmtMin(t.min_reales)) : '—'}</td>
            <td className="tenue pequeño">{t.personas || ''}</td>
            <td><EstadoTarea estado={t.estado} bloqueada={t.bloqueada} /></td>
            {gestor && (
              <td className="acciones-fila">
                {esTerceros(t) && t.estado === 'pendiente' && !t.bloqueada && <button className="btn btn-sm" onClick={() => tercero(t, 'enviar')}>Enviado al tercero</button>}
                {esTerceros(t) && t.estado === 'en_curso' && <button className="btn btn-sm" onClick={() => tercero(t, 'recibir')}>Recibido</button>}
                {t.alternativa && t.estado === 'omitida' && <button className="btn-link" onClick={() => alternar(t)}>Usar esta</button>}
                {t.opcional && t.estado === 'pendiente' && <button className="btn-link" onClick={() => cambiarEstado(t, 'omitida')}>Omitir</button>}
                {!t.alternativa && t.estado === 'omitida' && <button className="btn-link" onClick={() => cambiarEstado(t, 'pendiente')}>Incluir</button>}
                {!esTerceros(t) && regs.length > 0 && <button className="btn-link" onClick={() => setAbierta(abierta === t.id ? null : t.id)}>{abierta === t.id ? 'Ocultar' : `Registros (${regs.length})`}</button>}
                {t.estado === 'terminada' && <button className="btn-link" onClick={() => accion(() => q(sb.rpc('reabrir_tarea', { p_tarea: t.id })))}>Reabrir</button>}
              </td>
            )}
          </tr>,
          gestor && abierta === t.id && (
            <tr key={t.id + '-r'} className="fila-registros"><td colSpan={9}>
              <ListaRegistros regs={regs} accion={accion} />
            </td></tr>
          ),
          ]
        })}
      </tbody>
    </table>
  )
}

// Crear o editar un ítem (lo que se entrega al cliente)
function FormItem({ orden, items, inicial, onClose, accion }) {
  const [f, setF] = useState({ descripcion: inicial?.descripcion || '', cantidad: inicial ? String(inicial.cantidad) : '1' })
  const guardar = (e) => {
    e.preventDefault()
    const cantidad = Number(String(f.cantidad).replace(',', '.'))
    if (!(cantidad > 0)) return
    accion(async () => {
      if (inicial) {
        await q(sb.from('items').update({ descripcion: f.descripcion.trim(), cantidad }).eq('id', inicial.id))
        await q(sb.rpc('sincronizar_item', { p_item: inicial.id }))
      } else {
        const numero = Math.max(0, ...items.map((i) => i.numero)) + 1
        await q(sb.from('items').insert({ descripcion: f.descripcion.trim(), cantidad, orden_id: orden.id, numero }))
      }
    }).then(onClose)
  }
  return (
    <form className={inicial ? 'agregar-comp' : 'tarjeta form'} onSubmit={guardar}>
      <h3>{inicial ? `Editar ítem ${inicial.numero}` : 'Nuevo ítem'}</h3>
      <div className="fila2">
        <label>Descripción *<input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} required placeholder="Ej. Mesas para clientes" autoFocus /></label>
        <label>Cantidad<input value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} inputMode="decimal" required /></label>
      </div>
      <p className="nota">{inicial ? 'Al cambiar la cantidad se recalculan las unidades y el tiempo de los pasos que no han terminado.'
        : 'Si el ítem lleva productos de varias familias (ej. Metal y Madera), el ensamble final se agrega solo.'}</p>
      <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn">{inicial ? 'Guardar' : 'Agregar ítem'}</button></div>
    </form>
  )
}

function AgregarComponente({ item, productos, rutas, difs, accion, sincronizar }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) return <button className="btn btn-sec btn-sm" onClick={() => setAbierto(true)}>+ Agregar producto a este ítem</button>
  return <FormComponente item={item} productos={productos} rutas={rutas} difs={difs}
    onClose={() => setAbierto(false)} accion={accion} sincronizar={sincronizar} />
}

// Agregar o editar un producto dentro de un ítem: medidas, dificultad y unidades
function FormComponente({ item, productos, rutas, difs, inicial, onClose, accion, sincronizar }) {
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
  const prod = productos.find((p) => p.codigo === f.producto) || (inicial && { codigo: inicial.producto, medida: 'UNIDAD' })
  const mult = difs.find((d) => d.nivel === f.dificultad)?.multiplicador
  const unidades = (Number(String(f.cantidad).replace(',', '.')) || 0) * Number(item.cantidad || 1)
  const pasos = rutas.filter((r) => r.producto === f.producto)
  const porArea = useMemo(() => {
    const g = {}
    for (const r of pasosPrincipales(pasos)) {
      const area = r.procesos?.area
      const u = stdPaso(prod, r, area, f, mult)
      const x = (g[area] ||= { area, min: 0, falta: false, procesos: [] })
      x.procesos.push(r.procesos?.nombre?.toLowerCase())
      if (u === null) x.falta = true; else x.min += u
    }
    return Object.values(g)
  }, [pasos, prod, f, mult])
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
      if (inicial) await q(sb.from('componentes').update(fila).eq('id', inicial.id))
      else await q(sb.from('componentes').insert({ ...fila, item_id: item.id }))
      await sincronizar()
    }).then(onClose)
  }

  return (
    <form className="agregar-comp" onSubmit={guardar}>
      <label>Producto estándar
        <select value={f.producto} onChange={set('producto')} required autoFocus disabled={!!inicial}>
          <option value="">Selecciona…</option>
          {inicial && !productos.some((p) => p.codigo === inicial.producto) && <option value={inicial.producto}>{inicial.producto}</option>}
          {Object.entries(familias).map(([fam, ps]) => (
            <optgroup key={fam} label={fam}>
              {ps.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.nombre}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {prod?.incluye && !inicial && <p className="nota">Incluye: {prod.incluye}</p>}

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
      {prod && difs.find((d) => d.nivel === f.dificultad)?.descripcion && (
        <p className="nota">Dificultad {difs.find((d) => d.nivel === f.dificultad).nombre.toLowerCase()}: {difs.find((d) => d.nivel === f.dificultad).descripcion}</p>
      )}

      {prod && (
        <div className="previa-std">
          <div className="tenue pequeño">{ETIQUETA_MEDIDA[prod.medida]} · referencia: {prod.ref_descripcion || '—'} · total {fmtNum(unidades, 2)} und</div>
          {pasos.length === 0 ? <div className="tenue">Este producto no tiene ruta: no se crearán pasos.</div> : (
            <ul>
              {porArea.map((a) => (
                <li key={a.area}><b>{a.area}</b>: {a.area === 'TERCEROS' ? `${fmtNum(a.min, 0)} días`
                  : a.falta ? <span className="tenue">escribe las medidas</span>
                  : <>{fmtMin(a.min)} c/u · <b>{fmtMin(a.min * unidades)}</b></>}
                  <span className="tenue pequeño"> ({a.procesos.join(', ')})</span></li>
              ))}
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

// Registros de tiempo de un paso: Administración y Dirección pueden corregirlos o borrarlos
function ListaRegistros({ regs, accion }) {
  const [edit, setEdit] = useState({})
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))
  const guardar = (r) => {
    const e = edit[r.id] || {}
    const minutos = num(e.minutos ?? r.minutos), cantidad = num(e.cantidad ?? r.cantidad)
    accion(() => q(sb.rpc('editar_registro', { p_registro: r.id, p_minutos: minutos, p_cantidad: cantidad })))
  }
  const borrar = (r, lote) => {
    const txt = lote ? '¿Borrar este registro en TODOS los ítems del proyecto donde se repartió?' : '¿Borrar este registro de tiempo?'
    if (!window.confirm(txt)) return
    accion(() => q(sb.rpc('eliminar_registro', { p_registro: r.id, p_todo_el_lote: lote })))
  }
  const minutosDe = (r) => r.minutos ?? (r.fin ? Math.round((new Date(r.fin) - new Date(r.inicio)) / 60000) : null)
  return (
    <div className="registros">
      <table className="tabla">
        <thead><tr><th>Fecha</th><th>Quién</th><th>Minutos</th><th>Cantidad</th><th>Nota</th><th /></tr></thead>
        <tbody>{regs.map((r) => (
          <tr key={r.id}>
            <td className="pequeño">{new Date(r.inicio).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{r.personas?.nombre?.split(' ').slice(0, 2).join(' ')}</td>
            <td><input className="input-cant" defaultValue={fmtNum(minutosDe(r), 0)} onChange={(e) => setEdit({ ...edit, [r.id]: { ...edit[r.id], minutos: e.target.value } })} inputMode="decimal" /></td>
            <td><input className="input-cant" defaultValue={r.cantidad ?? ''} onChange={(e) => setEdit({ ...edit, [r.id]: { ...edit[r.id], cantidad: e.target.value } })} inputMode="decimal" /></td>
            <td className="tenue pequeño">{r.lote ? 'Parte de un registro de todo el proyecto' : ''}{r.observacion ? ` ${r.observacion}` : ''}</td>
            <td className="acciones-fila">
              {edit[r.id] && <button className="btn btn-sm" onClick={() => guardar(r)}>Guardar</button>}
              <button className="btn-link peligro" onClick={() => borrar(r, false)}>Borrar</button>
              {r.lote && <button className="btn-link peligro" onClick={() => borrar(r, true)}>Borrar en todo el proyecto</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
      <p className="tenue pequeño">Si borras todos los registros de un paso, vuelve a quedar pendiente. Para reabrir un paso terminado usa "Reabrir".</p>
    </div>
  )
}

// Mueve el ítem (con sus productos, pasos y tiempos registrados) a otra OP
function MoverItem({ it, onClose, accion }) {
  const [ops, setOps] = useState(null)
  const [destino, setDestino] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    q(sb.from('ordenes').select('id, numero, cliente, proyecto, estado').neq('id', it.orden_id).neq('estado', 'anulada').order('creado', { ascending: false }))
      .then(setOps).catch((e) => setError(e.message))
  }, [it.orden_id])
  const mover = (e) => {
    e.preventDefault()
    if (!destino) return
    accion(() => q(sb.rpc('mover_item', { p_item: it.id, p_orden_destino: destino }))).then(onClose)
  }
  return (
    <Modal titulo={`Mover ítem ${it.numero} · ${it.descripcion}`} onClose={onClose}>
      <form className="form" onSubmit={mover}>
        <p>El ítem pasa a la otra OP con sus productos, pasos y tiempos registrados. Allí queda con el siguiente número de ítem.</p>
        {ops === null ? <Cargando /> : (
          <label>OP destino
            <select value={destino} onChange={(e) => setDestino(e.target.value)} required autoFocus>
              <option value="">Selecciona la OP…</option>
              {ops.map((o) => <option key={o.id} value={o.id}>OP {o.numero} · {o.proyecto} ({o.cliente})</option>)}
            </select>
          </label>
        )}
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={!destino}>Mover ítem</button></div>
      </form>
    </Modal>
  )
}

function EliminarOP({ orden, nRegistros, onClose }) {
  const [txt, setTxt] = useState('')
  const [error, setError] = useState('')
  const [borrando, setBorrando] = useState(false)
  const eliminar = async (e) => {
    e.preventDefault()
    setBorrando(true)
    const { error } = await sb.from('ordenes').delete().eq('id', orden.id)
    if (error) { setError(error.message); setBorrando(false); return }
    location.hash = '#/'
  }
  return (
    <Modal titulo={`Eliminar OP ${orden.numero}`} onClose={onClose}>
      <form className="form" onSubmit={eliminar}>
        <p>Se borrarán la OP <b>{orden.numero}</b> ({orden.proyecto}), todos sus ítems y pasos
          {nRegistros > 0 ? <> y <b>{nRegistros} registros de tiempo</b></> : ''}. <b>No se puede deshacer.</b></p>
        <label>Para confirmar, escribe el número de la OP
          <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={orden.numero} autoFocus />
        </label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn btn-peligro" disabled={txt.trim() !== String(orden.numero) || borrando}>{borrando ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditarOP({ orden, onClose, onSaved }) {
  const [f, setF] = useState({
    numero: orden.numero, cliente: orden.cliente, proyecto: orden.proyecto, comercial: orden.comercial || '', fecha_compromiso: orden.fecha_compromiso || '',
    prioridad: orden.prioridad, estado: orden.estado, fecha_entrega_real: orden.fecha_entrega_real || '', notas: orden.notas || '',
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const guardar = async (e) => {
    e.preventDefault()
    const { error } = await sb.from('ordenes').update({
      ...f, numero: String(f.numero).trim(), prioridad: Number(f.prioridad), fecha_compromiso: f.fecha_compromiso || null, fecha_entrega_real: f.fecha_entrega_real || null,
    }).eq('id', orden.id)
    if (error) setError(/duplicate|unique/i.test(error.message) ? `Ya existe otra OP con el número ${String(f.numero).trim()}.` : error.message); else onSaved()
  }
  return (
    <Modal titulo={`Editar OP ${orden.numero}`} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label>Número de OP<input value={f.numero} onChange={set('numero')} required /></label>
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
