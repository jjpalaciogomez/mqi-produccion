import { useCallback, useEffect, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Badge, Cargando, Modal, fmtNum } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

const AREAS = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']
const ROLES = { operario: 'Operario', direccion: 'Dirección', consulta: 'Consulta', admin: 'Administrador' }

export default function Catalogos({ perfil }) {
  const [tab, setTab] = useState('personas')
  return (
    <div>
      <div className="titulo-pagina"><h1>Catálogos</h1><BotonAyuda clave="catalogos" rol={perfil?.rol} /></div>
      <div className="segmentado pestañas">
        {[['personas', 'Personas y PIN'], ['procesos', 'Procesos y tiempos'], ['productos', 'Productos y rutas'], ['real', 'Estándar real']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>
      {tab === 'personas' && <Personas />}
      {tab === 'procesos' && <Procesos />}
      {tab === 'productos' && <Productos />}
      {tab === 'real' && <EstandarReal />}
    </div>
  )
}

function Personas() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [pinDe, setPinDe] = useState(null)
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
      <p className="tenue">El PIN de 4 dígitos es lo que cada operario escribe en la tablet. Tras 5 intentos fallidos se bloquea; asignar un PIN nuevo lo desbloquea.</p>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Área</th><th>Rol</th><th>PIN</th><th>Activo</th><th /></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} className={p.activo ? '' : 'omitida'}>
              <td>{p.nombre}</td><td>{p.area || '—'}</td><td>{ROLES[p.rol]}</td>
              <td>{p.rol !== 'operario' ? <span className="tenue">—</span> : p.intentos_fallidos >= 5 ? <Badge tone="bad">Bloqueado</Badge> : p.tiene_pin ? <Badge tone="ok">Asignado</Badge> : <Badge tone="warn">Sin PIN</Badge>}</td>
              <td><button className="btn-link" onClick={() => activar(p)}>{p.activo ? 'Sí' : 'No'}</button></td>
              <td>{p.rol === 'operario' && <button className="btn btn-sm" onClick={() => setPinDe(p)}>Asignar PIN</button>}</td>
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
      {pinDe && <AsignarPin persona={pinDe} onClose={() => { setPinDe(null); cargar() }} />}
    </div>
  )
}

function AsignarPin({ persona, onClose }) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const guardar = async (e) => {
    e.preventDefault()
    const { error } = await sb.rpc('asignar_pin', { p_persona: persona.id, p_pin: pin })
    if (error) setMsg(error.message); else { setOk(true); setMsg('') }
  }
  return (
    <Modal titulo={`PIN de ${persona.nombre}`} onClose={onClose} ancho={420}>
      {ok ? (
        <div><p>PIN guardado. Entrégaselo a {persona.nombre.split(' ')[0]} en persona; el sistema no lo vuelve a mostrar.</p>
          <div className="acciones"><button className="btn" onClick={onClose}>Listo</button></div></div>
      ) : (
        <form className="form" onSubmit={guardar}>
          <label>PIN nuevo (4 dígitos)<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" required pattern="[0-9]{4}" autoFocus /></label>
          <Aviso>{msg}</Aviso>
          <div className="acciones"><button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={pin.length !== 4}>Guardar PIN</button></div>
        </form>
      )}
    </Modal>
  )
}

function Procesos() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState('')
  const cargar = useCallback(() => q(sb.from('procesos').select('*').order('area').order('codigo')).then(setLista).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])
  const guardar = async (p, valor) => {
    const v = Number(String(valor).replace(',', '.'))
    if (isNaN(v) || v === Number(p.tiempo_std_min)) return
    try { await q(sb.from('procesos').update({ tiempo_std_min: v }).eq('codigo', p.codigo)); setGuardado(`${p.codigo} actualizado`); cargar() }
    catch (e) { setError(e.message) }
  }
  if (!lista) return <Cargando />
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{guardado}</Aviso>
      <p className="tenue">Los cambios aplican a los pasos que se creen desde ahora; las OPs ya cargadas conservan el estándar con que se crearon.</p>
      <table className="tabla">
        <thead><tr><th>Código</th><th>Área</th><th>Proceso</th><th>Unidad</th><th>Estándar (min/unidad)</th><th>Equivale a</th><th>Confianza</th><th>Nota</th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.codigo}>
              <td><b>{p.codigo}</b></td><td>{p.area}</td><td>{p.nombre}</td><td>{p.unidad}</td>
              <td><input className="input-cant" defaultValue={p.tiempo_std_min} onBlur={(e) => guardar(p, e.target.value)} inputMode="decimal" /></td>
              <td className="tenue">{p.equivalente}</td>
              <td><Badge tone={{ MEDIA: 'info', BAJA: 'warn', 'MUY BAJA': 'bad' }[p.confianza] || 'muted'}>{p.confianza}</Badge></td>
              <td className="tenue pequeño">{p.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Productos() {
  const [lista, setLista] = useState(null)
  useEffect(() => { q(sb.from('productos').select('*').order('codigo')).then(setLista) }, [])
  if (!lista) return <Cargando />
  return (
    <table className="tabla">
      <thead><tr><th>Código</th><th>Familia</th><th>Producto</th><th>Unidad</th><th>Ruta</th><th>Incluye</th></tr></thead>
      <tbody>{lista.map((p) => (
        <tr key={p.codigo}><td><b>{p.codigo}</b></td><td>{p.familia}</td><td>{p.nombre}</td><td>{p.unidad}</td><td className="pequeño">{p.ruta_texto}</td><td className="tenue pequeño">{p.incluye}</td></tr>
      ))}</tbody>
    </table>
  )
}

function EstandarReal() {
  const [lista, setLista] = useState(null)
  useEffect(() => { q(sb.from('v_estandar_real').select('*').order('proceso')).then(setLista) }, [])
  if (!lista) return <Cargando />
  if (lista.length === 0) return <div className="vacio">Todavía no hay pasos terminados con cantidad. Aquí aparecerá el tiempo real por unidad de cada proceso a medida que las tablets registren.</div>
  return (
    <div>
      <p className="tenue">Compara el estándar vigente con el promedio real. Sugerido: actualizar un estándar solo cuando tenga 10 o más pasos medidos.</p>
      <table className="tabla">
        <thead><tr><th>Proceso</th><th>Unidad</th><th>Vigente</th><th>Real</th><th>Diferencia</th><th>Pasos medidos</th></tr></thead>
        <tbody>{lista.map((r) => {
          const dif = r.std_vigente ? (r.std_real / r.std_vigente - 1) * 100 : null
          return (
            <tr key={r.proceso}><td><b>{r.proceso}</b> {r.nombre}</td><td>{r.unidad}</td><td>{fmtNum(r.std_vigente, 4)}</td><td>{fmtNum(r.std_real, 4)}</td>
              <td>{dif === null ? '—' : <Badge tone={Math.abs(dif) <= 20 ? 'ok' : 'warn'}>{dif > 0 ? '+' : ''}{fmtNum(dif, 0)}%</Badge>}</td>
              <td>{r.tareas_medidas}{r.tareas_medidas < 10 && <span className="tenue"> (pocos datos)</span>}</td></tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}
