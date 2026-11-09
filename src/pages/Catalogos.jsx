import { useCallback, useEffect, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Badge, Cargando, Modal, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { ETIQUETA_MEDIDA } from '../estandar.js'

const AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']
const ROLES = { operario: 'Operario', direccion: 'Dirección', consulta: 'Consulta', admin: 'Administrador' }

export default function Catalogos({ perfil }) {
  const [tab, setTab] = useState('personas')
  return (
    <div>
      <div className="titulo-pagina"><h1>Catálogos</h1><BotonAyuda clave="catalogos" rol={perfil?.rol} /></div>
      <div className="segmentado pestañas">
        {[['personas', 'Personas'], ['estandares', 'Estándares por producto'], ['dificultad', 'Dificultad'], ['real', 'Estándar real']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'personas' && <Personas />}
      {tab === 'estandares' && <Estandares />}
      {tab === 'dificultad' && <Dificultad />}
      {tab === 'real' && <EstandarReal />}
    </div>
  )
}

function Personas() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState({ nombre: '', area: 'METAL', rol: 'operario' })
  const cargar = useCallback(() => q(sb.from('v_personas').select('*').order('area').order('nombre')).then(setLista).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  const agregar = async (e) => {
    e.preventDefault()
    try { await q(sb.from('personas').insert({ ...nueva, nombre: nueva.nombre.trim().toUpperCase() })); setNueva({ ...nueva, nombre: '' }); cargar() }
    catch (err) { setError(err.message) }
  }
  const activar = (p) => q(sb.from('personas').update({ activo: !p.activo }).eq('id', p.id)).then(cargar).catch((e) => setError(e.message))

  if (!lista) return <Cargando />
  return (
    <div>
      <Aviso>{error}</Aviso>
      <p className="tenue">Los operarios activos aparecen en la tablet de su área (y en todas, los de Pintura) para registrar su tiempo.</p>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Área</th><th>Rol</th><th>Activo</th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} className={p.activo ? '' : 'omitida'}>
              <td>{p.nombre}</td><td>{p.area || '—'}</td><td>{ROLES[p.rol]}</td>
              <td><button className="btn-link" onClick={() => activar(p)}>{p.activo ? 'Sí' : 'No'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="tarjeta form fila-form" onSubmit={agregar}>
        <label>Nombre<input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} required /></label>
        <label>Área<select value={nueva.area} onChange={(e) => setNueva({ ...nueva, area: e.target.value })}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Rol<select value={nueva.rol} onChange={(e) => setNueva({ ...nueva, rol: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button className="btn">Agregar persona</button>
      </form>
    </div>
  )
}

const num = (v) => (v === '' || v === null ? null : Number(String(v).replace(',', '.')))

function Estandares() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [abierto, setAbierto] = useState(null)
  const cargar = useCallback(() => Promise.all([
    q(sb.from('productos').select('*').order('familia').order('codigo')),
    q(sb.from('etapas_producto').select('*').order('paso')),
    q(sb.from('procesos').select('*').in('codigo', ['ENS-1', 'TER-1'])),
  ]).then(([productos, etapas, procesos]) => setD({ productos, etapas, procesos })).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (tabla, filtro, cambios, texto) => {
    try {
      let c = sb.from(tabla).update(cambios)
      for (const [k, v] of Object.entries(filtro)) c = c.eq(k, v)
      await q(c); setOk(texto); setError(''); cargar()
    } catch (e) { setError(e.message) }
  }
  if (!d) return <Cargando />
  const ens = d.procesos.find((p) => p.codigo === 'ENS-1'), ter = d.procesos.find((p) => p.codigo === 'TER-1')
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <p className="tenue">Cada producto tiene un <b>tamaño de referencia</b> y, por área, los minutos que toma <b>una unidad de ese tamaño en dificultad media</b>.
        El sistema escala el tiempo con las medidas de cada ítem. Los cambios aplican a los productos que se agreguen o editen desde ahora.</p>
      <table className="tabla tabla-std">
        <thead><tr><th>Producto</th><th>Medida</th><th>Tamaño de referencia (cm)</th><th>Minutos por unidad de referencia</th><th /></tr></thead>
        <tbody>
          {d.productos.map((p) => {
            const es = d.etapas.filter((e) => e.producto === p.codigo)
            return (
              <tr key={p.codigo}>
                <td><b>{p.codigo}</b> {p.nombre}<div className="tenue pequeño">{p.familia}</div></td>
                <td>{ETIQUETA_MEDIDA[p.medida]}</td>
                <td>
                  {p.medida === 'UNIDAD' ? <span className="tenue">—</span> : (
                    <div className="dims">
                      <input className="input-cant" defaultValue={p.ref_ancho ?? ''} title="Ancho" onBlur={(e) => num(e.target.value) !== Number(p.ref_ancho) && guardar('productos', { codigo: p.codigo }, { ref_ancho: num(e.target.value) }, `${p.codigo}: referencia actualizada`)} inputMode="decimal" />
                      {p.medida === 'CM3' && <>×<input className="input-cant" defaultValue={p.ref_prof ?? ''} title="Profundidad" onBlur={(e) => num(e.target.value) !== Number(p.ref_prof) && guardar('productos', { codigo: p.codigo }, { ref_prof: num(e.target.value) }, `${p.codigo}: referencia actualizada`)} inputMode="decimal" /></>}
                      ×<input className="input-cant" defaultValue={p.ref_alto ?? ''} title="Alto" onBlur={(e) => num(e.target.value) !== Number(p.ref_alto) && guardar('productos', { codigo: p.codigo }, { ref_alto: num(e.target.value) }, `${p.codigo}: referencia actualizada`)} inputMode="decimal" />
                    </div>
                  )}
                  <div className="tenue pequeño">{p.ref_descripcion}</div>
                </td>
                <td>
                  {es.length === 0 ? <span className="tenue">Sin ruta</span> : es.map((e) => (
                    <div key={e.id} className="std-area">
                      <span>{e.area}{e.alternativa ? ' (alt.)' : ''}{e.opcional ? ' (opc.)' : ''}</span>
                      {e.area === 'TERCEROS' ? <span className="tenue">días</span> : (
                        <input className="input-cant" defaultValue={e.min_ref ?? ''} placeholder="min"
                          onBlur={(ev) => num(ev.target.value) !== (e.min_ref === null ? null : Number(e.min_ref)) && guardar('etapas_producto', { id: e.id }, { min_ref: num(ev.target.value) }, `${p.codigo} · ${e.area}: estándar actualizado`)} inputMode="decimal" />
                      )}
                    </div>
                  ))}
                </td>
                <td><button className="btn-link" onClick={() => setAbierto(abierto === p.codigo ? null : p.codigo)}>{abierto === p.codigo ? 'Ocultar' : 'Detalle'}</button></td>
              </tr>
            )
          }).flatMap((fila, i) => {
            const p = d.productos[i]
            if (abierto !== p.codigo) return [fila]
            return [fila, (
              <tr key={p.codigo + '-det'} className="fila-detalle"><td colSpan={5}>
                <p><b>Incluye:</b> {p.incluye}</p>
                <p><b>Ruta:</b> {p.ruta_texto}</p>
                <p><b>Parte fija del tiempo:</b>{' '}
                  <input className="input-cant" defaultValue={Math.round(Number(p.fraccion_fija) * 100)} onBlur={(e) => { const v = num(e.target.value); if (v !== null && v >= 0 && v <= 100 && v !== Math.round(Number(p.fraccion_fija) * 100)) guardar('productos', { codigo: p.codigo }, { fraccion_fija: v / 100 }, `${p.codigo}: parte fija actualizada`) }} inputMode="numeric" /> %
                  <span className="tenue"> — lo que no cambia con el tamaño (alistar, montar, cuadrar). El resto crece en proporción a las medidas.</span></p>
                {p.std_fuente && <p className="tenue pequeño"><b>Cómo se calculó el estándar inicial:</b> {p.std_fuente}</p>}
              </td></tr>
            )]
          })}
        </tbody>
      </table>
      <div className="tarjeta form fila-form">
        <label>Ensamble final (min por unidad del ítem)
          <input className="input-cant" defaultValue={ens?.tiempo_std_min} onBlur={(e) => num(e.target.value) !== Number(ens?.tiempo_std_min) && guardar('procesos', { codigo: 'ENS-1' }, { tiempo_std_min: num(e.target.value) }, 'Ensamble final actualizado')} inputMode="decimal" /></label>
        <label>Terceros (días de entrega)
          <input className="input-cant" defaultValue={ter?.tiempo_std_min} onBlur={(e) => num(e.target.value) !== Number(ter?.tiempo_std_min) && guardar('procesos', { codigo: 'TER-1' }, { tiempo_std_min: num(e.target.value) }, 'Días de terceros actualizados')} inputMode="decimal" /></label>
      </div>
    </div>
  )
}

function Dificultad() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const cargar = useCallback(() => q(sb.from('dificultades').select('*').order('orden')).then(setLista).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])
  const guardar = async (d, v) => {
    v = num(v)
    if (v === null || isNaN(v) || v <= 0 || v === Number(d.multiplicador)) return
    try { await q(sb.from('dificultades').update({ multiplicador: v }).eq('nivel', d.nivel)); setOk(`Dificultad ${d.nombre.toLowerCase()} actualizada`); cargar() }
    catch (e) { setError(e.message) }
  }
  if (!lista) return <Cargando />
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <p className="tenue">El tiempo estándar del producto se multiplica por este valor según la dificultad que se elija al agregarlo a un ítem. Media es la predeterminada.</p>
      <table className="tabla" style={{ maxWidth: 480 }}>
        <thead><tr><th>Dificultad</th><th>Multiplicador</th><th>Efecto</th></tr></thead>
        <tbody>{lista.map((d) => (
          <tr key={d.nivel}><td><b>{d.nombre}</b></td>
            <td><input className="input-cant" defaultValue={d.multiplicador} onBlur={(e) => guardar(d, e.target.value)} inputMode="decimal" /></td>
            <td className="tenue">{Number(d.multiplicador) === 1 ? 'igual al estándar' : `${Number(d.multiplicador) > 1 ? '+' : ''}${fmtNum((Number(d.multiplicador) - 1) * 100, 0)}% de tiempo`}</td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function EstandarReal() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(() => q(sb.from('v_estandar_producto').select('*').order('producto').order('area')).then(setLista).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])
  const aplicar = async (r) => {
    try { await q(sb.from('etapas_producto').update({ min_ref: r.min_ref_sugerido }).eq('producto', r.producto).eq('area', r.area)); cargar() }
    catch (e) { setError(e.message) }
  }
  if (!lista) return <Cargando />
  if (lista.length === 0) return <div className="vacio">Todavía no hay pasos terminados. Aquí aparecerá, por producto y área, cuánto tardan de verdad comparado con el estándar, a medida que las tablets registren.</div>
  return (
    <div>
      <Aviso>{error}</Aviso>
      <p className="tenue">Compara los minutos reales con los estándar de lo que se hizo (ya ajustados por medidas y dificultad).
        El sugerido es el nuevo valor para el tamaño de referencia. Aplícalo cuando haya 10 o más pasos medidos.</p>
      <table className="tabla">
        <thead><tr><th>Producto</th><th>Área</th><th>Estándar</th><th>Real</th><th>Diferencia</th><th>Pasos medidos</th><th>Referencia vigente → sugerida</th><th /></tr></thead>
        <tbody>{lista.map((r) => {
          const dif = (Number(r.razon) - 1) * 100
          return (
            <tr key={r.producto + r.area}><td><b>{r.producto}</b> {r.nombre}</td><td>{r.area}</td>
              <td>{fmtNum(r.min_std, 0)} min</td><td>{fmtNum(r.min_reales, 0)} min</td>
              <td><Badge tone={Math.abs(dif) <= 20 ? 'ok' : 'warn'}>{dif > 0 ? '+' : ''}{fmtNum(dif, 0)}%</Badge></td>
              <td>{r.tareas_medidas}{r.tareas_medidas < 10 && <span className="tenue"> (pocos datos)</span>}</td>
              <td>{fmtNum(r.min_ref, 1)} → <b>{fmtNum(r.min_ref_sugerido, 1)}</b> min</td>
              <td>{Number(r.min_ref_sugerido) !== Number(r.min_ref) && <button className="btn-link" onClick={() => aplicar(r)}>Aplicar</button>}</td></tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}
