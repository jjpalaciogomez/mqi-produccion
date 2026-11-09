import { useCallback, useEffect, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Badge, Cargando, Modal, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { ETIQUETA_MEDIDA, pasosPrincipales, textoMedidas } from '../estandar.js'

const AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']
const ROLES = { operario: 'Operario', direccion: 'Dirección', consulta: 'Consulta', admin: 'Administrador' }

export default function Catalogos({ perfil }) {
  const [tab, setTab] = useState('personas')
  return (
    <div>
      <div className="titulo-pagina"><h1>Configuraciones</h1><BotonAyuda clave="catalogos" rol={perfil?.rol} /></div>
      <div className="segmentado pestañas">
        {[['personas', 'Personas'], ['productos', 'Productos y rutas'], ['procesos', 'Procesos'], ['dificultad', 'Dificultad'], ['real', 'Estándar real']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'personas' && <Personas />}
      {tab === 'productos' && <Productos />}
      {tab === 'procesos' && <Procesos />}
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

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

function useCatalogo() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(() => Promise.all([
    q(sb.from('productos').select('*').order('familia').order('codigo')),
    q(sb.from('rutas').select('*').order('paso').order('id')),
    q(sb.from('procesos').select('*').order('area').order('codigo')),
  ]).then(([productos, rutas, procesos]) => { setD({ productos, rutas, procesos }); setError('') }).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])
  return { d, error, setError, cargar }
}

// Productos con su ruta y estándar por área
function Productos() {
  const { d, error, setError, cargar } = useCatalogo()
  const [form, setForm] = useState(null) // null | 'nuevo' | producto
  const [ok, setOk] = useState('')
  if (!d) return <><Aviso>{error}</Aviso><Cargando /></>
  const procPor = Object.fromEntries(d.procesos.map((p) => [p.codigo, p]))
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="titulo-acciones" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="tenue" style={{ margin: 0 }}>El estándar de cada proceso es para <b>una unidad del tamaño de referencia en dificultad media</b>.
          El del producto en cada área es la suma de sus procesos. En terceros el valor son días.</p>
        <button className="btn" onClick={() => setForm('nuevo')}>+ Nuevo producto</button>
      </div>
      <table className="tabla tabla-std">
        <thead><tr><th>Producto</th><th>Medida y referencia</th><th>Ruta</th><th>Estándar por área</th><th /></tr></thead>
        <tbody>
          {d.productos.map((p) => {
            const rs = d.rutas.filter((r) => r.producto === p.codigo)
            const areas = {}
            for (const r of pasosPrincipales(rs)) { const a = procPor[r.proceso]?.area; areas[a] = (areas[a] || 0) + Number(r.min_ref || 0) }
            return (
              <tr key={p.codigo} className={p.activo ? '' : 'omitida'}>
                <td><b>{p.codigo}</b> {p.nombre}<div className="tenue pequeño">{p.familia}{p.activo ? '' : ' · inactivo'}</div></td>
                <td>{ETIQUETA_MEDIDA[p.medida]}<div className="tenue pequeño">{p.ref_descripcion || textoMedidas(p.medida, p.ref_ancho, p.ref_prof, p.ref_alto)}</div></td>
                <td className="pequeño">{rutaTexto(rs, procPor) || <span className="tenue">sin ruta</span>}</td>
                <td>{Object.entries(areas).map(([a, m]) => <div key={a} className="std-area"><span>{a}</span><b>{a === 'TERCEROS' ? `${fmtNum(m, 0)} días` : `${fmtNum(m, 0)} min`}</b></div>)}</td>
                <td><button className="btn-link" onClick={() => setForm(p)}>Editar</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {form && <ProductoForm inicial={form === 'nuevo' ? null : form} d={d} onClose={() => setForm(null)}
        onSaved={(t) => { setForm(null); setOk(t); setError(''); cargar() }} />}
    </div>
  )
}

const rutaTexto = (rs, procPor) => {
  const pasos = {}
  for (const r of rs) (pasos[r.paso] ||= []).push(`${r.proceso} ${procPor[r.proceso]?.nombre || ''}${r.opcional ? ' (opcional)' : ''}`.trim())
  return Object.values(pasos).map((x) => x.join(' / ')).join(' → ')
}

// Crear o editar un producto, su familia y su ruta
function ProductoForm({ inicial, d, onClose, onSaved }) {
  const familias = [...new Set(d.productos.map((p) => p.familia))].sort()
  const procPor = Object.fromEntries(d.procesos.map((p) => [p.codigo, p]))
  const rutasIni = inicial ? d.rutas.filter((r) => r.producto === inicial.codigo) : []
  const terIni = rutasIni.length > 0 && procPor[rutasIni[rutasIni.length - 1].proceso]?.area === 'TERCEROS' && inicial?.familia === 'TERCEROS'
  const [f, setF] = useState({
    familia: inicial?.familia || '', familiaNueva: '', codigo: inicial?.codigo || '', nombre: inicial?.nombre || '', incluye: inicial?.incluye || '',
    medida: inicial?.medida || 'CM2', ref_ancho: inicial?.ref_ancho ?? '', ref_prof: inicial?.ref_prof ?? '', ref_alto: inicial?.ref_alto ?? '',
    ref_descripcion: inicial?.ref_descripcion || '', fija: inicial ? Math.round(Number(inicial.fraccion_fija) * 100) : 30, activo: inicial?.activo ?? true,
    terceros: !inicial ? false : terIni, previo: terIni ? rutasIni.length > 1 : true,
  })
  // Pasos: {proceso, min_ref, opcional, alt (alternativa del paso anterior)}
  const pasosIni = () => {
    const out = []; let ultimo = null
    for (const r of rutasIni) { out.push({ proceso: r.proceso, min_ref: r.min_ref ?? '', opcional: r.opcional, alt: r.paso === ultimo }); ultimo = r.paso }
    return out
  }
  const iniciales = pasosIni()
  const [pasos, setPasos] = useState(terIni ? iniciales.slice(0, -1) : iniciales)
  const [envio, setEnvio] = useState(terIni ? { proceso: rutasIni[rutasIni.length - 1].proceso, min_ref: rutasIni[rutasIni.length - 1].min_ref ?? 8 } : { proceso: 'TER-1', min_ref: 8 })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const familia = f.familia === '__nueva' ? f.familiaNueva.trim().toUpperCase() : f.familia

  // Código sugerido: prefijo de la familia + siguiente número
  const sugerirCodigo = (fam) => {
    const deFam = d.productos.filter((p) => p.familia === fam).map((p) => p.codigo)
    const pref = deFam[0]?.split('-')[0] || fam.replace(/[^A-Z]/g, '').slice(0, 3) || 'PRD'
    let n = 1
    while (d.productos.some((p) => p.codigo === `${pref}-P${n}`)) n++
    return `${pref}-P${n}`
  }
  const cambiarFamilia = (v) => {
    const fam = v === '__nueva' ? f.familiaNueva.trim().toUpperCase() : v
    setF({ ...f, familia: v, codigo: inicial ? f.codigo : fam ? sugerirCodigo(fam) : '' })
  }
  const procPlanta = d.procesos.filter((p) => p.area !== 'TERCEROS' || !f.terceros)
  const procTerceros = d.procesos.filter((p) => p.area === 'TERCEROS')
  const setPaso = (i, k, v) => setPasos(pasos.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const mover = (i, dlt) => { const a = [...pasos]; const [x] = a.splice(i, 1); a.splice(i + dlt, 0, x); setPasos(a) }
  const usaPasos = !f.terceros || f.previo
  const usaMedidas = !(f.terceros && !f.previo)

  const guardar = async (e) => {
    e.preventDefault()
    const codigo = f.codigo.trim().toUpperCase()
    if (!familia) { setError('Elige o escribe la familia.'); return }
    if (!codigo || !f.nombre.trim()) { setError('Escribe código y nombre.'); return }
    if (!inicial && d.productos.some((p) => p.codigo === codigo)) { setError(`Ya existe un producto con el código ${codigo}.`); return }
    const lista = [...(usaPasos ? pasos : []), ...(f.terceros ? [{ ...envio, opcional: false, alt: false }] : [])].filter((p) => p.proceso)
    if (lista.length === 0) { setError('Agrega al menos un paso a la ruta.'); return }
    if (lista[0].alt) lista[0] = { ...lista[0], alt: false }
    let paso = 0
    const filas = lista.map((p, i) => {
      if (!(p.alt && i > 0)) paso++
      return { producto: codigo, paso, proceso: p.proceso, min_ref: num(p.min_ref), opcional: !!p.opcional, alternativa: false, _alt: p.alt && i > 0 }
    })
    // Marca como alternativa a todos los procesos de un paso que tenga más de uno
    for (const fila of filas) fila.alternativa = filas.filter((x) => x.paso === fila.paso).length > 1
    const dup = filas.find((x, i) => filas.findIndex((y) => y.paso === x.paso && y.proceso === x.proceso) !== i)
    if (dup) { setError(`El proceso ${dup.proceso} está repetido en el mismo paso.`); return }
    const medida = usaMedidas ? f.medida : 'UNIDAD'
    const producto = {
      codigo, familia, nombre: f.nombre.trim().toUpperCase(), incluye: f.incluye || null, unidad: 'UND', medida,
      ref_ancho: medida === 'UNIDAD' ? null : num(f.ref_ancho), ref_prof: medida === 'CM3' ? num(f.ref_prof) : null,
      ref_alto: medida === 'UNIDAD' ? null : num(f.ref_alto), ref_descripcion: f.ref_descripcion || null,
      fraccion_fija: Math.min(Math.max(num(f.fija) ?? 30, 0), 100) / 100, activo: f.activo,
      ruta_texto: rutaTexto(filas, procPor),
    }
    if (medida !== 'UNIDAD' && !(producto.ref_ancho && producto.ref_alto && (medida !== 'CM3' || producto.ref_prof))) { setError('Escribe las medidas del tamaño de referencia.'); return }
    setGuardando(true); setError('')
    try {
      if (inicial) await q(sb.from('productos').update(producto).eq('codigo', codigo))
      else await q(sb.from('productos').insert(producto))
      await q(sb.from('rutas').delete().eq('producto', codigo))
      await q(sb.from('rutas').insert(filas.map(({ _alt, ...x }) => x)))
      onSaved(`${codigo} guardado. Los cambios aplican a los productos que se agreguen o editen desde ahora.`)
    } catch (err) { setError(err.message); setGuardando(false) }
  }

  // Se llama como función (no como componente) para que los campos no pierdan el foco al escribir
  const filaPaso = (p, i) => (
    <div key={i} className={`paso-ruta${p.alt ? ' alt' : ''}`}>
      <span className="paso-n">{p.alt ? 'o' : pasos.slice(0, i + 1).filter((x, j) => !(x.alt && j > 0)).length}</span>
      <select value={p.proceso} onChange={(e) => setPaso(i, 'proceso', e.target.value)} required>
        <option value="">Proceso…</option>
        {[...new Set(procPlanta.map((x) => x.area))].map((a) => (
          <optgroup key={a} label={a}>{procPlanta.filter((x) => x.area === a).map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}</optgroup>
        ))}
      </select>
      <input className="input-cant" value={p.min_ref} onChange={(e) => setPaso(i, 'min_ref', e.target.value)} placeholder={procPor[p.proceso]?.area === 'TERCEROS' ? 'días' : 'min'} inputMode="decimal" />
      <label className="chk"><input type="checkbox" checked={!!p.opcional} onChange={(e) => setPaso(i, 'opcional', e.target.checked)} />opcional</label>
      {i > 0 && <label className="chk" title="Se hace este proceso o el anterior, no ambos"><input type="checkbox" checked={!!p.alt} onChange={(e) => setPaso(i, 'alt', e.target.checked)} />alternativa del anterior</label>}
      <span className="paso-btns">
        {i > 0 && <button type="button" className="btn-link" onClick={() => mover(i, -1)}>↑</button>}
        {i < pasos.length - 1 && <button type="button" className="btn-link" onClick={() => mover(i, 1)}>↓</button>}
        <button type="button" className="btn-link peligro" onClick={() => setPasos(pasos.filter((_, j) => j !== i))}>Quitar</button>
      </span>
    </div>
  )

  return (
    <Modal titulo={inicial ? `Editar ${inicial.codigo}` : 'Nuevo producto'} onClose={onClose} ancho={820}>
      <form className="form" onSubmit={guardar}>
        <div className="fila3">
          <label>Familia
            <select value={f.familia} onChange={(e) => cambiarFamilia(e.target.value)} required>
              <option value="">Selecciona…</option>
              {familias.map((x) => <option key={x}>{x}</option>)}
              <option value="__nueva">+ Nueva familia…</option>
            </select>
          </label>
          {f.familia === '__nueva' && <label>Nombre de la familia<input value={f.familiaNueva} onChange={(e) => setF({ ...f, familiaNueva: e.target.value })} onBlur={() => !inicial && setF((x) => ({ ...x, codigo: x.familiaNueva ? sugerirCodigo(x.familiaNueva.trim().toUpperCase()) : '' }))} required /></label>}
          <label>Código<input value={f.codigo} onChange={set('codigo')} disabled={!!inicial} required /></label>
        </div>
        <label>Nombre del producto<input value={f.nombre} onChange={set('nombre')} required placeholder="Ej. Tapizado" /></label>
        <label>Qué incluye (ejemplos)<input value={f.incluye} onChange={set('incluye')} placeholder="Ej. Sillas, butacos, bancas tapizadas" /></label>

        <div className="caja-ter">
          <label className="chk"><input type="checkbox" checked={f.terceros} onChange={set('terceros')} disabled={!!inicial && terIni} /> <b>Es un producto de terceros</b> (lo hace un proveedor)</label>
          {f.terceros && (
            <div className="ter-op">
              <span>¿Necesita trabajo previo de la planta antes de enviarlo al proveedor?</span>
              <label className="chk"><input type="radio" checked={f.previo} onChange={() => setF({ ...f, previo: true })} />Sí (ej. plantillas en Madera)</label>
              <label className="chk"><input type="radio" checked={!f.previo} onChange={() => setF({ ...f, previo: false })} />No</label>
            </div>
          )}
        </div>

        {usaMedidas && (
          <div className="fila3">
            <label>Cómo se mide
              <select value={f.medida} onChange={set('medida')}>
                <option value="CM2">Área: ancho × alto (cm²)</option>
                <option value="CM3">Volumen: ancho × profundidad × alto (cm³)</option>
                <option value="UNIDAD">Por unidad (sin medidas)</option>
              </select>
            </label>
            {f.medida !== 'UNIDAD' && (
              <label>Tamaño de referencia (cm)
                <span className="dims">
                  <input className="input-cant" value={f.ref_ancho} onChange={set('ref_ancho')} placeholder="ancho" inputMode="decimal" />
                  {f.medida === 'CM3' && <>×<input className="input-cant" value={f.ref_prof} onChange={set('ref_prof')} placeholder="prof." inputMode="decimal" /></>}
                  ×<input className="input-cant" value={f.ref_alto} onChange={set('ref_alto')} placeholder="alto" inputMode="decimal" />
                </span>
              </label>
            )}
            {f.medida !== 'UNIDAD' && <label>Parte fija del tiempo (%)<input value={f.fija} onChange={set('fija')} inputMode="numeric" /></label>}
          </div>
        )}
        {usaMedidas && <label>Descripción de la referencia<input value={f.ref_descripcion} onChange={set('ref_descripcion')} placeholder="Ej. Silla estándar 45 × 45 × 90 cm" /></label>}

        {usaPasos && (
          <div>
            <h4 className="sub-tit">{f.terceros ? 'Pasos en la planta antes de enviarlo' : 'Ruta (en orden)'} <span className="tenue pequeño">· minutos por unidad de referencia, dificultad media</span></h4>
            {pasos.length === 0 && <p className="tenue">Sin pasos todavía.</p>}
            {pasos.map((p, i) => filaPaso(p, i))}
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setPasos([...pasos, { proceso: '', min_ref: '', opcional: false, alt: false }])}>+ Agregar paso</button>
          </div>
        )}
        {f.terceros && (
          <div className="paso-ruta envio">
            <span className="paso-n">{usaPasos ? '→' : '1'}</span>
            <span>Envío al proveedor:</span>
            <select value={envio.proceso} onChange={(e) => setEnvio({ ...envio, proceso: e.target.value })}>
              {procTerceros.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}
            </select>
            <label className="chk">días de entrega <input className="input-cant" value={envio.min_ref} onChange={(e) => setEnvio({ ...envio, min_ref: e.target.value })} inputMode="decimal" /></label>
          </div>
        )}
        {inicial && <label className="chk"><input type="checkbox" checked={f.activo} onChange={set('activo')} /> Activo (aparece al agregar productos a un ítem)</label>}
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar producto'}</button></div>
      </form>
    </Modal>
  )
}

function Procesos() {
  const { d, error, setError, cargar } = useCatalogo()
  const [ok, setOk] = useState('')
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', area: 'MADERA' })
  if (!d) return <><Aviso>{error}</Aviso><Cargando /></>
  const ens = d.procesos.find((p) => p.codigo === 'ENS-1')
  const sugerir = (area) => {
    const pref = d.procesos.find((p) => p.area === area && p.codigo !== 'ENS-1')?.codigo.split('-')[0] || area.slice(0, 3)
    let n = 1; while (d.procesos.some((p) => p.codigo === `${pref}-${n}`)) n++
    return `${pref}-${n}`
  }
  const agregar = async (e) => {
    e.preventDefault()
    const codigo = (nuevo.codigo || sugerir(nuevo.area)).trim().toUpperCase()
    if (d.procesos.some((p) => p.codigo === codigo)) { setError(`Ya existe el proceso ${codigo}.`); return }
    try {
      await q(sb.from('procesos').insert({ codigo, nombre: nuevo.nombre.trim().toUpperCase(), area: nuevo.area, unidad: nuevo.area === 'TERCEROS' ? 'DIAS' : 'UND' }))
      setOk(`Proceso ${codigo} creado. Ya puedes usarlo en las rutas.`); setNuevo({ ...nuevo, codigo: '', nombre: '' }); cargar()
    } catch (err) { setError(err.message) }
  }
  const guardarEns = async (v) => {
    v = num(v); if (v === null || v === Number(ens?.tiempo_std_min)) return
    try { await q(sb.from('procesos').update({ tiempo_std_min: v }).eq('codigo', 'ENS-1')); setOk('Ensamble final actualizado'); cargar() } catch (err) { setError(err.message) }
  }
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="tarjeta form fila-form">
        <label>Ensamble final de ítems multiárea (min por unidad, dificultad media)
          <input className="input-cant" defaultValue={ens?.tiempo_std_min} onBlur={(e) => guardarEns(e.target.value)} inputMode="decimal" /></label>
      </div>
      <table className="tabla">
        <thead><tr><th>Código</th><th>Área</th><th>Proceso</th><th>Usado en</th></tr></thead>
        <tbody>{d.procesos.map((p) => (
          <tr key={p.codigo}><td><b>{p.codigo}</b></td><td>{p.area}</td><td>{p.nombre}</td>
            <td className="tenue pequeño">{[...new Set(d.rutas.filter((r) => r.proceso === p.codigo).map((r) => r.producto))].join(', ') || '—'}</td></tr>
        ))}</tbody>
      </table>
      <form className="tarjeta form fila-form" onSubmit={agregar}>
        <label>Área<select value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>{[...AREAS, 'TERCEROS'].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Nombre del proceso<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required placeholder={nuevo.area === 'TERCEROS' ? 'Ej. Tapizado' : 'Ej. Plantillas'} /></label>
        <label>Código<input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder={sugerir(nuevo.area)} /></label>
        <button className="btn">Agregar proceso</button>
      </form>
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
  const guardarDesc = async (d, v) => {
    v = v.trim()
    if (v === (d.descripcion || '')) return
    try { await q(sb.from('dificultades').update({ descripcion: v || null }).eq('nivel', d.nivel)); setOk(`Referencia de dificultad ${d.nombre.toLowerCase()} guardada`); cargar() }
    catch (e) { setError(e.message) }
  }
  if (!lista) return <Cargando />
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <p className="tenue">El tiempo estándar del producto se multiplica por este valor según la dificultad que se elija al agregarlo a un ítem. Media es la predeterminada.</p>
      <table className="tabla tabla-dif">
        <thead><tr><th>Dificultad</th><th>Multiplicador</th><th>Efecto</th><th>Referencia o descripción (cuándo usar este nivel)</th></tr></thead>
        <tbody>{lista.map((d) => (
          <tr key={d.nivel}><td><b>{d.nombre}</b></td>
            <td><input className="input-cant" defaultValue={d.multiplicador} onBlur={(e) => guardar(d, e.target.value)} inputMode="decimal" /></td>
            <td className="tenue">{Number(d.multiplicador) === 1 ? 'igual al estándar' : `${Number(d.multiplicador) > 1 ? '+' : ''}${fmtNum((Number(d.multiplicador) - 1) * 100, 0)}% de tiempo`}</td>
            <td><textarea className="dif-desc" rows={3} defaultValue={d.descripcion || ''} onBlur={(e) => guardarDesc(d, e.target.value)}
              placeholder={{ BAJO: 'Ej. piezas rectas, pocos cortes, sin acabados especiales', MEDIO: 'Ej. trabajo habitual de la planta', ALTO: 'Ej. curvas, muchos detalles, acabados finos, materiales delicados' }[d.nivel]} /></td></tr>
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
    try { await q(sb.rpc('aplicar_estandar', { p_producto: r.producto, p_area: r.area, p_factor: Number(r.razon) })); cargar() }
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
