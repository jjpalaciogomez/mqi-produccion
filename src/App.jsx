import { useEffect, useState } from 'react'
import { sb } from './supabase.js'
import { Cargando } from './ui.jsx'
import Login from './pages/Login.jsx'
import Tablero from './pages/Tablero.jsx'
import NuevaOP from './pages/NuevaOP.jsx'
import OrdenDetalle from './pages/OrdenDetalle.jsx'
import Catalogos from './pages/Catalogos.jsx'
import Tablet from './pages/Tablet.jsx'

function useRuta() {
  const [h, setH] = useState(window.location.hash || '#/')
  useEffect(() => {
    const f = () => setH(window.location.hash || '#/')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h.replace(/^#/, '') || '/'
}

export const ir = (ruta) => { window.location.hash = ruta }

// Modo prueba del Administrador: ver la app como otro rol sin cambiar de usuario
const VISTAS = [
  ['admin|', 'Administrador'], ['direccion|', 'Dirección'], ['consulta|', 'Consulta'],
  ['tablet|METAL', 'Tablet Metal'], ['tablet|MADERA', 'Tablet Madera'],
  ['tablet|ACRILICO', 'Tablet Acrílico'], ['tablet|GRAN FORMATO', 'Tablet Gran Formato'],
]
const leerVista = () => { try { return localStorage.getItem('mqi_ver_como') || 'admin|' } catch { return 'admin|' } }
const guardarVista = (v) => { try { localStorage.setItem('mqi_ver_como', v) } catch { /* sin almacenamiento */ } }

function SelectorVista({ valor, onCambio }) {
  return (
    <label className="ver-como">Ver como
      <select value={valor} onChange={(e) => onCambio(e.target.value)}>
        {VISTAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

function AvisoPrueba({ valor, onCambio }) {
  if (valor === 'admin|') return null
  const nombre = VISTAS.find(([v]) => v === valor)?.[1]
  return (
    <div className="aviso-prueba">
      <span><b>Modo prueba:</b> estás viendo la app como <b>{nombre}</b>. Tus permisos reales siguen siendo de Administrador.</span>
      <button className="btn btn-sm" onClick={() => onCambio('admin|')}>Volver a Administrador</button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState('')
  const [vista, setVista] = useState(leerVista)
  const cambiarVista = (v) => { setVista(v); guardarVista(v) }

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setError('')
    if (!session) { setPerfil(null); return }
    sb.from('perfiles').select('*').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data) setError('Tu usuario no tiene un perfil asignado. Pide a Dirección de Producción que lo configure.')
      else setPerfil(data)
    })
  }, [session])

  if (session === undefined) return <Cargando />
  if (!session) return <Login />
  if (error) return (
    <div className="centro">
      <div className="tarjeta"><p>{error}</p><button className="btn" onClick={() => sb.auth.signOut()}>Salir</button></div>
    </div>
  )
  if (!perfil) return <Cargando />

  const esAdmin = perfil.rol === 'admin'
  const [rolVista, areaVista] = vista.split('|')
  const efectivo = esAdmin && VISTAS.some(([v]) => v === vista) ? { ...perfil, rol: rolVista, area: areaVista || null } : perfil
  const prueba = esAdmin ? { valor: vista, onCambio: cambiarVista } : null

  if (efectivo.rol === 'tablet') return (
    <>
      {prueba && <div className="barra-prueba-tablet"><SelectorVista {...prueba} /><AvisoPrueba {...prueba} /></div>}
      <Tablet key={vista} perfil={efectivo} />
    </>
  )
  return <Shell key={vista} perfil={efectivo} prueba={prueba} />
}

function Shell({ perfil, prueba }) {
  const ruta = useRuta()
  const gestor = ['admin', 'direccion'].includes(perfil.rol)
  let pagina
  const m = ruta.match(/^\/op\/([0-9a-f-]+)/)
  if (m) pagina = <OrdenDetalle id={m[1]} perfil={perfil} gestor={gestor} />
  else if (ruta === '/nueva' && gestor) pagina = <NuevaOP rol={perfil.rol} />
  else if (ruta === '/catalogos' && gestor) pagina = <Catalogos perfil={perfil} />
  else pagina = <Tablero gestor={gestor} rol={perfil.rol} />

  const link = (r, txt) => (
    <a href={`#${r}`} className={(ruta === r || (r === '/' && ruta.startsWith('/op/'))) ? 'activo' : ''}>{txt}</a>
  )
  return (
    <div className="shell">
      <header className="barra-sup">
        <div className="marca"><img src="./logo-mqi.png" alt="MQI" className="logo" /><span>Producción</span></div>
        <nav>
          {link('/', 'Tablero de planta')}
          {gestor && link('/catalogos', 'Catálogos')}
        </nav>
        <div className="usuario">
          {prueba && <SelectorVista {...prueba} />}
          <span>{perfil.nombre || ''} · {ROLES[perfil.rol]}</span>
          <button className="btn btn-sec btn-sm" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      {prueba && <AvisoPrueba {...prueba} />}
      <main className="contenido">{pagina}</main>
    </div>
  )
}

const ROLES = { admin: 'Administrador', direccion: 'Dirección', consulta: 'Consulta', tablet: 'Tablet' }
