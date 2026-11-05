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

export default function App() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState('')

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
  if (perfil.rol === 'tablet') return <Tablet perfil={perfil} />
  return <Shell perfil={perfil} />
}

function Shell({ perfil }) {
  const ruta = useRuta()
  const gestor = ['admin', 'direccion'].includes(perfil.rol)
  let pagina
  const m = ruta.match(/^\/op\/([0-9a-f-]+)/)
  if (m) pagina = <OrdenDetalle id={m[1]} perfil={perfil} gestor={gestor} />
  else if (ruta === '/nueva' && gestor) pagina = <NuevaOP />
  else if (ruta === '/catalogos' && gestor) pagina = <Catalogos perfil={perfil} />
  else pagina = <Tablero gestor={gestor} />

  const link = (r, txt) => (
    <a href={`#${r}`} className={(ruta === r || (r === '/' && ruta.startsWith('/op/'))) ? 'activo' : ''}>{txt}</a>
  )
  return (
    <div className="shell">
      <header className="barra-sup">
        <div className="marca"><img src="./icon.svg" alt="" /> MQI Producción</div>
        <nav>
          {link('/', 'Tablero de planta')}
          {gestor && link('/nueva', 'Nueva OP')}
          {gestor && link('/catalogos', 'Catálogos')}
        </nav>
        <div className="usuario">
          <span>{perfil.nombre || ''} · {ROLES[perfil.rol]}</span>
          <button className="btn btn-sec btn-sm" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main className="contenido">{pagina}</main>
    </div>
  )
}

const ROLES = { admin: 'Administrador', direccion: 'Dirección', consulta: 'Consulta', tablet: 'Tablet' }
