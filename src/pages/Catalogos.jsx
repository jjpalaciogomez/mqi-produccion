import { useCallback, useEffect, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Badge, Cargando, Modal, fmtMin, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'
import { ETIQUETA_MEDIDA, pasosPrincipales, textoMedidas } from '../estandar.js'

const AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA', 'INSTALACION']
const ROLES = { operario: 'Operario', direccion: 'Dirección', consulta: 'Consulta', admin: 'Administrador' }

export default function Catalogos({ perfil }) {
  const [tab, setTab] = useState('personas')
  return (
    <div>
      <div className="titulo-pagina"><h1>Configuraciones</h1><BotonAyuda clave="catalogos" rol={perfil?.rol} /></div>
      <div className="segmentado pestañas">
        {[...(perfil?.rol === 'admin' ? [['usuarios', 'Usuarios']] : []), ['personas', 'Personas'], ['productos', 'Productos y rutas'], ['procesos', 'Procesos'], ['dificultad', 'Dificultad'], ['real', 'Estándar real']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'usuarios' && <Usuarios perfil={perfil} />}
      {tab === 'personas' && <Personas />}
      {tab === 'productos' && <Productos />}
      {tab === 'procesos' && <Procesos />}
      {tab === 'dificultad' && <Dificultad />}
      {tab === 'real' && <EstandarReal />}
    </div>
  )
}

// ---------- Usuarios de la app (solo Administrador) ----------
const PERMISOS = {
  admin: ['Administrador', 'Todo: OPs, programación, configuraciones, usuarios, indicadores, horas y corrección de registros'],
  consulta: ['Consulta', 'Solo ve el tablero de planta y el detalle de las OPs; no cambia nada'],
  tablet: ['Tablet', 'Pantalla de registro de un área para los operarios'],
}
async function usuarios(body) {
  const { data, error } = await sb.functions.invoke('usuarios', { body })
  if (error) {
    let m = error.message
    try { m = (await error.context.json()).error || m } catch { /* sin detalle */ }
    throw new Error(m)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function Usuarios({ perfil }) {
  const [lista, setLista] = useState(null)
  const [personas, setPersonas] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [edit, setEdit] = useState({})
  const [clave, setClave] = useState(null) // usuario al que se le cambia la contraseña
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'consulta', area: 'METAL', password: '' })
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([usuarios({ accion: 'listar' }), q(sb.from('personas').select('id, nombre, area').eq('activo', true).order('nombre'))])
      setLista(u.sort((a, b) => String(a.email).localeCompare(String(b.email)))); setPersonas(p); setError('')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const hacer = async (fn, texto) => {
    setOcupado(true); setError(''); setOk('')
    try { await fn(); setOk(texto); await cargar(); return true } catch (e) { setError(e.message); return false } finally { setOcupado(false) }
  }
  const val = (u, k) => (edit[u.id]?.[k] !== undefined ? edit[u.id][k] : u[k])
  const setE = (u, k, v) => setEdit({ ...edit, [u.id]: { ...edit[u.id], [k]: v } })
  const crear = (e) => {
    e.preventDefault()
    hacer(() => usuarios({ accion: 'crear', ...nuevo }), `Usuario ${nuevo.email} creado. Ya puede entrar con su correo y la contraseña que escribiste.`)
      .then((b) => b && setNuevo({ ...nuevo, email: '', nombre: '', password: '' }))
  }
  if (!lista) return <><Aviso>{error}</Aviso>{!error && <Cargando />}</>
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <p className="tenue">Cuentas para entrar a la app. El permiso decide qué puede ver y hacer cada una. Los operarios no necesitan usuario: registran desde la tablet de su área (se manejan en Personas).</p>
      <table className="tabla tabla-usuarios">
        <thead><tr><th>Correo</th><th>Nombre</th><th>Permiso</th><th>Área (tablet)</th><th>Persona vinculada</th><th>Último ingreso</th><th /></tr></thead>
        <tbody>{lista.map((u) => {
          const cambio = !!edit[u.id]
          const yo = u.id === perfil?.user_id
          return (
            <tr key={u.id}>
              <td><b>{u.email}</b>{yo && <span className="etq">tú</span>}</td>
              <td><input value={val(u, 'nombre') || ''} onChange={(e) => setE(u, 'nombre', e.target.value)} placeholder="Nombre" /></td>
              <td><select value={val(u, 'rol') || ''} onChange={(e) => setE(u, 'rol', e.target.value)}>
                {!u.rol && <option value="">Sin permiso</option>}
                {Object.entries(PERMISOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}
              </select></td>
              <td>{val(u, 'rol') === 'tablet'
                ? <select value={val(u, 'area') || ''} onChange={(e) => setE(u, 'area', e.target.value)}><option value="">Todas</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
                : <span className="tenue">—</span>}</td>
              <td>{['admin', 'direccion'].includes(val(u, 'rol'))
                ? <select value={val(u, 'persona_id') || ''} onChange={(e) => setE(u, 'persona_id', e.target.value)}><option value="">—</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                : <span className="tenue">—</span>}</td>
              <td className="tenue pequeño">{u.ultimo_ingreso ? new Date(u.ultimo_ingreso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca'}</td>
              <td className="acciones-fila">
                {cambio && <button className="btn btn-sm" disabled={ocupado} onClick={() => hacer(() => usuarios({ accion: 'permisos', id: u.id, rol: val(u, 'rol'), nombre: val(u, 'nombre'), area: val(u, 'area'), persona_id: val(u, 'persona_id') }), `Permisos de ${u.email} guardados. Se aplican la próxima vez que abra la app.`).then((b) => b && setEdit({ ...edit, [u.id]: undefined }))}>Guardar</button>}
                <button className="btn-link" onClick={() => setClave({ u, password: '' })}>Contraseña</button>
                {!yo && <button className="btn-link peligro" disabled={ocupado} onClick={() => {
                  if (!window.confirm(`¿Eliminar el usuario ${u.email}? Ya no podrá entrar a la app. Esto no borra OPs ni registros.`)) return
                  hacer(() => usuarios({ accion: 'eliminar', id: u.id }), `Usuario ${u.email} eliminado.`)
                }}>Eliminar</button>}
              </td>
            </tr>
          )
        })}</tbody>
      </table>

      <form className="tarjeta form fila-form" onSubmit={crear} autoComplete="off">
        <label>Correo<input type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} required autoComplete="off" /></label>
        <label>Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Gerencia" /></label>
        <label>Permiso<select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>{Object.entries(PERMISOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {nuevo.rol === 'tablet' && <label>Área<select value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>}
        <label>Contraseña (mín. 8)<input type="password" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
        <button className="btn" disabled={ocupado}>Crear usuario</button>
      </form>

      <div className="tarjeta permisos-ayuda">
        {Object.entries(PERMISOS).map(([k, [t, d]]) => <div key={k}><b>{t}</b>: <span className="tenue">{d}</span></div>)}
      </div>

      {clave && (
        <Modal titulo={`Nueva contraseña · ${clave.u.email}`} onClose={() => setClave(null)} ancho={460}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); hacer(() => usuarios({ accion: 'clave', id: clave.u.id, password: clave.password }), `Contraseña de ${clave.u.email} cambiada.`).then((b) => b && setClave(null)) }}>
            <label>Nueva contraseña (mín. 8 caracteres)<input type="password" value={clave.password} onChange={(e) => setClave({ ...clave, password: e.target.value })} required minLength={8} autoComplete="new-password" autoFocus /></label>
            <div className="acciones"><button type="button" className="btn btn-sec" onClick={() => setClave(null)}>Cancelar</button><button className="btn" disabled={ocupado}>Guardar</button></div>
          </form>
        </Modal>
      )}
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
// Lleva los estándares y dificultades vigentes a las OPs abiertas (los pasos terminados no cambian)
function AplicarEstandares({ onOk, onError }) {
  const [aplicando, setAplicando] = useState(false)
  const aplicar = async () => {
    if (!window.confirm('¿Aplicar los estándares vigentes a todas las OPs abiertas? Se recalculan los pasos que no han terminado; los terminados conservan su estándar.')) return
    setAplicando(true)
    const { data, error } = await sb.rpc('recalcular_estandares', {})
    setAplicando(false)
    if (error) onError(error.message); else onOk(`Estándares aplicados: se recalcularon ${data} ítems de las OPs abiertas.`)
  }
  return <button className="btn btn-sec" onClick={aplicar} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Aplicar a OPs abiertas'}</button>
}

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
        <span className="titulo-acciones"><AplicarEstandares onOk={setOk} onError={setError} /><button className="btn" onClick={() => setForm('nuevo')}>+ Nuevo producto</button></span>
      </div>
      <table className="tabla tabla-std">
        <thead><tr><th>Producto</th><th>Medida y referencia</th><th>Ruta</th><th>Estándar por área</th><th /></tr></thead>
        <tbody>
          {d.productos.map((p) => {
            const rs = d.rutas.filter((r) => r.producto === p.codigo)
            const areas = {}
            const maq = new Set()
            for (const r of pasosPrincipales(rs)) {
              const a = procPor[r.proceso]?.area
              if (procPor[r.proceso]?.es_maquina) { maq.add(procPor[r.proceso].nombre.toLowerCase()); areas[a] = areas[a] || 0; continue }
              areas[a] = (areas[a] || 0) + Number(r.min_ref || 0)
            }
            return (
              <tr key={p.codigo} className={p.activo ? '' : 'omitida'}>
                <td><b>{p.codigo}</b> {p.nombre}<div className="tenue pequeño">{p.familia}{p.activo ? '' : ' · inactivo'}</div></td>
                <td>{ETIQUETA_MEDIDA[p.medida]}<div className="tenue pequeño">{p.ref_descripcion || textoMedidas(p.medida, p.ref_ancho, p.ref_prof, p.ref_alto)}</div></td>
                <td className="pequeño">{rutaTexto(rs, procPor) || <span className="tenue">sin ruta</span>}</td>
                <td>{Object.entries(areas).map(([a, m]) => <div key={a} className="std-area"><span>{a}</span><b>{a === 'TERCEROS' ? `${fmtNum(m, 0)} días` : `${fmtNum(m, 0)} min`}</b></div>)}
                  {maq.size > 0 && <div className="tenue pequeño">+ máquina: {[...maq].join(', ')}</div>}</td>
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
  const procPlanta = d.procesos.filter((p) => (p.area !== 'TERCEROS' || !f.terceros) && !p.codigo.startsWith('ENS-'))
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
      {procPor[p.proceso]?.es_maquina
        ? <span className="etq etq-maq" title="El tiempo sale del rendimiento de la máquina (Configuraciones › Procesos)">máquina</span>
        : <input className="input-cant" value={p.min_ref} onChange={(e) => setPaso(i, 'min_ref', e.target.value)} placeholder={procPor[p.proceso]?.area === 'TERCEROS' ? 'días' : 'min'} inputMode="decimal" />}
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
  const ens = d.procesos.filter((p) => p.codigo.startsWith('ENS-') && p.codigo !== 'ENS-1')
  const sugerir = (area) => {
    const pref = d.procesos.find((p) => p.area === area && !p.codigo.startsWith('ENS-'))?.codigo.split('-')[0] || area.slice(0, 3)
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
  const guardarEns = async (p, v) => {
    v = num(v); if (v === null || isNaN(v) || v < 0 || v === Number(p.tiempo_std_min)) return
    try { await q(sb.from('procesos').update({ tiempo_std_min: v }).eq('codigo', p.codigo)); setOk(`Ensamble final de ${p.area.toLowerCase()} actualizado. Usa "Aplicar a OPs abiertas" para llevarlo a las OPs en curso.`); cargar() } catch (err) { setError(err.message) }
  }
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      <div className="tarjeta">
        <h3 className="subt" style={{ marginTop: 0 }}>Ensamble final de ítems multiárea</h3>
        <p className="tenue pequeño">Minutos por unidad del ítem en dificultad media, según el área que ensambla. Un ítem puede tener varios ensambles (uno por área), se eligen en el detalle de la OP.</p>
        <div className="fila-form">
          {ens.map((p) => (
            <label key={p.codigo}>{p.area}
              <span><input className="input-cant" defaultValue={p.tiempo_std_min} onBlur={(e) => guardarEns(p, e.target.value)} inputMode="decimal" /> min</span></label>
          ))}
          <AplicarEstandares onOk={setOk} onError={setError} />
        </div>
      </div>
      <Maquinas procesos={d.procesos} onOk={(t) => { setOk(t); cargar() }} onError={setError} />
      <h3 className="subt">Todos los procesos</h3>
      <table className="tabla">
        <thead><tr><th>Código</th><th>Área</th><th>Proceso</th><th>Usado en</th></tr></thead>
        <tbody>{d.procesos.map((p) => (
          <tr key={p.codigo}><td><b>{p.codigo}</b></td><td>{p.area}</td><td>{p.nombre}{p.es_maquina && <span className="etq etq-maq">máquina</span>}</td>
            <td className="tenue pequeño">{[...new Set(d.rutas.filter((r) => r.proceso === p.codigo).map((r) => r.producto))].join(', ') || '—'}</td></tr>
        ))}</tbody>
      </table>
      <form className="tarjeta form fila-form" onSubmit={agregar}>
        <label>Área<select value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>{[...AREAS.filter((a) => a !== 'INSTALACION'), 'TERCEROS'].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Nombre del proceso<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required placeholder={nuevo.area === 'TERCEROS' ? 'Ej. Tapizado' : 'Ej. Plantillas'} /></label>
        <label>Código<input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder={sugerir(nuevo.area)} /></label>
        <button className="btn">Agregar proceso</button>
      </form>
    </div>
  )
}

// Procesos de máquina: rendimiento, capacidad por ciclo (montaje) y minutos de montaje del operario
function Maquinas({ procesos, onOk, onError }) {
  const [agregar, setAgregar] = useState('')
  const maq = procesos.filter((p) => p.es_maquina)
  const otros = procesos.filter((p) => !p.es_maquina && !['TERCEROS'].includes(p.area) && !p.codigo.startsWith('ENS-'))
  const guardar = async (p, campo, v) => {
    if (campo !== 'unidad') { v = num(v); if (v !== null && (isNaN(v) || v < 0 || (v === 0 && campo !== 'min_montaje'))) return }
    if (campo === 'num_maquinas') { if (v === null || v < 1) return; v = Math.round(v) }
    if (v === (campo === 'unidad' ? p.unidad : (p[campo] === null ? null : Number(p[campo])))) return
    const fila = { [campo]: v }
    // El rendimiento por hora se deduce del montaje: capacidad ÷ minutos de máquina por montaje
    const cap = campo === 'capacidad_ciclo' ? v : Number(p.capacidad_ciclo)
    const mc = campo === 'min_maquina_ciclo' ? v : Number(p.min_maquina_ciclo)
    if (cap > 0 && mc > 0) fila.rendimiento = Math.round((cap / mc) * 60 * 1000) / 1000
    try { await q(sb.from('procesos').update(fila).eq('codigo', p.codigo)); onOk(`${p.nombre}: actualizado. Usa "Aplicar a OPs abiertas" para llevarlo a las OPs en curso.`) }
    catch (e) { onError(e.message) }
  }
  const marcar = async (codigo, si) => {
    try { await q(sb.from('procesos').update({ es_maquina: si }).eq('codigo', codigo)); setAgregar(''); onOk(si ? 'Proceso marcado como de máquina. Completa sus datos por montaje.' : 'El proceso vuelve a medirse por tiempo del operario.') }
    catch (e) { onError(e.message) }
  }
  const u = (p) => (String(p.unidad).toUpperCase() === 'M2' ? 'm²' : 'und')
  // Qué significa la configuración de cada máquina, en palabras
  const lectura = (p) => {
    const cap = Number(p.capacidad_ciclo), mc = Number(p.min_maquina_ciclo), mo = Number(p.min_montaje || 0)
    if (!(cap > 0) || !(mc > 0)) return <span className="t-warn">Falta {!(cap > 0) ? 'la capacidad por montaje' : 'el tiempo de máquina por montaje'}: sin eso no se puede programar.</span>
    const n = Math.max(1, Number(p.num_maquinas) || 1)
    const porJornada = Math.floor(510 / mc) * n
    const rinde = (cap / mc) * 60
    return <>Cada montaje carga hasta <b>{fmtNum(cap, 2)} {u(p)}</b>: la máquina trabaja <b>{fmtMin(mc)}</b> y el operario pone <b>{fmtMin(mo)}</b> montando y cambiando material.
      {n > 1 ? <> Hay <b>{n} máquinas</b>, cada una con un montaje a la vez: rinden juntas <b>{fmtNum(rinde * n, 1)} {u(p)}/h</b></> : <> Rinde <b>{fmtNum(rinde, 1)} {u(p)}/h</b></>}; en una jornada de 8,5 h {n > 1 ? 'hacen' : 'hace'} hasta <b>{porJornada} {porJornada === 1 ? 'montaje' : 'montajes'}</b> (≈ {fmtNum(porJornada * cap, 1)} {u(p)}) y le ocupa al operario {fmtMin(porJornada * mo)}.</>
  }
  return (
    <div className="tarjeta">
      <h3 className="subt" style={{ marginTop: 0 }}>Procesos de máquina</h3>
      <p className="tenue pequeño">Se programan por montaje y no llevan dificultad. Montajes = cantidad ÷ capacidad por montaje (redondeado hacia arriba).
        Tiempo de máquina = montajes × minutos de máquina por montaje (el último montaje, en proporción a lo que lleva). Al operario solo se le abonan los montajes × sus minutos de montaje. Si hay varias máquinas iguales (p. ej. 3 impresoras), cada una trabaja un montaje a la vez y la programación las usa en paralelo.</p>
      <table className="tabla maq-tabla">
        <thead><tr><th>Proceso</th><th>Cantidad de máquinas</th><th>Se mide en</th><th>Capacidad por montaje</th><th>Máquina por montaje</th><th>Operario por montaje</th><th>Qué significa</th><th /></tr></thead>
        <tbody>{maq.map((p) => (
          <tr key={p.codigo}>
            <td><b>{p.codigo}</b> {p.nombre}</td>
            <td><input className="input-cant" defaultValue={p.num_maquinas ?? 1} onBlur={(e) => guardar(p, 'num_maquinas', e.target.value)} inputMode="numeric" /></td>
            <td><select defaultValue={String(p.unidad).toUpperCase() === 'M2' ? 'M2' : 'UND'} onChange={(e) => guardar(p, 'unidad', e.target.value)}><option value="M2">m²</option><option value="UND">unidades</option></select></td>
            <td><input className="input-cant" defaultValue={p.capacidad_ciclo ?? ''} onBlur={(e) => guardar(p, 'capacidad_ciclo', e.target.value)} inputMode="decimal" /> {u(p)}</td>
            <td><input className="input-cant" defaultValue={p.min_maquina_ciclo ?? ''} onBlur={(e) => guardar(p, 'min_maquina_ciclo', e.target.value)} inputMode="decimal" /> min</td>
            <td><input className="input-cant" defaultValue={p.min_montaje ?? ''} onBlur={(e) => guardar(p, 'min_montaje', e.target.value)} inputMode="decimal" /> min</td>
            <td className="pequeño maq-lectura">{lectura(p)}</td>
            <td><button className="btn-link peligro" onClick={() => marcar(p.codigo, false)}>Quitar</button></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="fila-form" style={{ marginTop: 8 }}>
        <select value={agregar} onChange={(e) => setAgregar(e.target.value)}>
          <option value="">Marcar otro proceso como de máquina…</option>
          {otros.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.nombre} ({p.area})</option>)}
        </select>
        <button className="btn btn-sec btn-sm" disabled={!agregar} onClick={() => marcar(agregar, true)}>Marcar</button>
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
      <div style={{ float: 'right' }}><AplicarEstandares onOk={setOk} onError={setError} /></div>
      <p className="tenue">El tiempo estándar del producto se multiplica por este valor según la dificultad que se elija al agregarlo a un ítem. Media es la predeterminada. No aplica a los procesos de máquina (imprimir, cortes, DTF): su tiempo sale del rendimiento de la máquina.</p>
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
