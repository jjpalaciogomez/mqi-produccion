import { useEffect, useRef, useState } from 'react'
import { iniciarEnVivo, detenerEnVivo } from './vivo.js'
import { sb } from './supabase.js'
import { Cargando } from './ui.jsx'
import Login from './pages/Login.jsx'
import Tablero from './pages/Tablero.jsx'
import NuevaOP from './pages/NuevaOP.jsx'
import OrdenDetalle from './pages/OrdenDetalle.jsx'
import Catalogos from './pages/Catalogos.jsx'
import Tablet from './pages/Tablet.jsx'
import Horas from './pages/Horas.jsx'
import Indicadores from './pages/Indicadores.jsx'
import Programacion from './pages/Programacion.jsx'
import Logistica from './pages/Logistica.jsx'
import Conductor from './pages/Conductor.jsx'
import Pagos from './pages/pagos/Pagos.jsx'
import ConfigNomina from './pages/pagos/ConfigNomina.jsx'
import Verificacion from './pages/pagos/Verificacion.jsx'
import { MODULOS } from './nomina/datos.js'

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

// Enlace de invitación o de recuperación de contraseña: Supabase deja "type=invite|recovery" en la dirección
const LLEGA_CON_ENLACE = /type=(invite|recovery|signup)/.test(window.location.hash + window.location.search)

function CrearClave({ onListo }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [error, setError] = useState(''), [enviando, setEnviando] = useState(false)
  const guardar = async (e) => {
    e.preventDefault(); setError('')
    if (a.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (a !== b) return setError('Las dos contraseñas no coinciden.')
    setEnviando(true)
    const { error } = await sb.auth.updateUser({ password: a })
    setEnviando(false)
    if (error) setError(error.message); else { window.location.hash = '#/'; onListo() }
  }
  return (
    <div className="centro login">
      <img src="./logo-mqi.png" alt="MQI Más Que Impresos" className="login-logo" />
      <form className="tarjeta login-caja" onSubmit={guardar}>
        <h1 className="login-tit">Crea tu contraseña</h1>
        <p className="sub">Con ella vas a entrar al programa de ahora en adelante.</p>
        <label>Nueva contraseña<input type="password" value={a} onChange={(e) => setA(e.target.value)} required autoComplete="new-password" /></label>
        <label>Repítela<input type="password" value={b} onChange={(e) => setB(e.target.value)} required autoComplete="new-password" /></label>
        {error && <div className="aviso aviso-error">{error}</div>}
        <button className="btn btn-grande" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar y entrar'}</button>
      </form>
    </div>
  )
}

// Modo prueba del Administrador: ver la app como otro rol sin cambiar de usuario
const VISTAS = [
  ['admin|', 'Administrador'], ['consulta|', 'Consulta'],
  ['tablet|METAL', 'Tablet Metal'], ['tablet|MADERA', 'Tablet Madera'],
  ['tablet|ACRILICO', 'Tablet Acrílico'], ['tablet|GRAN FORMATO', 'Tablet Gran Formato'],
  ['logistica|', 'Pide vueltas (logística)'], ['conductor|', 'Conductor'],
  ['rrhh|', 'Recursos Humanos'], ['contabilidad|', 'Contabilidad'], ['litografia|', 'Litografía (jornada)'],
]
// Módulos de Pagos por rol (la base de datos aplica lo mismo; esto solo arma el menú)
const MODULOS_ROL = {
  admin: MODULOS.map(([m]) => m), direccion: MODULOS.map(([m]) => m),
  rrhh: ['empleados', 'nomina', 'programados', 'ausentismos', 'vacaciones'],
  contabilidad: ['horasextra', 'nomina', 'empleados', 'programados', 'ausentismos', 'vacaciones', 'informes', 'causaciones'],
  litografia: ['jornadalito'],
}
const modulosDe = (p) => [...new Set([...(MODULOS_ROL[p.rol] || []), ...(p.modulos_pagos || [])])]
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
  const [crearClave, setCrearClave] = useState(LLEGA_CON_ENLACE)
  const cambiarVista = (v) => { setVista(v); guardarVista(v) }

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((ev, s) => { setSession(s); if (ev === 'PASSWORD_RECOVERY') setCrearClave(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setError('')
    if (!session) { setPerfil(null); return }
    sb.from('perfiles').select('*').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data) setError('Tu usuario no tiene un perfil asignado. Pide al Administrador que lo configure.')
      else setPerfil(data)
    })
  }, [session])

  // Cambios en tiempo real entre dispositivos mientras hay sesión
  useEffect(() => { if (perfil) iniciarEnVivo(); else detenerEnVivo() }, [perfil])

  if (session === undefined) return <Cargando />
  if (!session) return <Login />
  if (crearClave) return <CrearClave onListo={() => setCrearClave(false)} />
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
  if (efectivo.rol === 'conductor') return (
    <>
      {prueba && <div className="barra-prueba-tablet"><SelectorVista {...prueba} /><AvisoPrueba {...prueba} /></div>}
      <Conductor key={vista} perfil={efectivo} />
    </>
  )
  return <Shell key={vista} perfil={efectivo} prueba={prueba} />
}

function Menu({ titulo, items, ruta }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', f)
    return () => document.removeEventListener('pointerdown', f)
  }, [abierto])
  useEffect(() => { setAbierto(false) }, [ruta])
  if (!items.length) return null
  const activo = items.some(([r]) => ruta === r || (r === '/' && ruta.startsWith('/op/')) || (r !== '/' && ruta.startsWith(r + '/')))
  return (
    <div ref={ref} className={'menu-sup' + (abierto ? ' abierto' : '')}
      onMouseEnter={(e) => e.nativeEvent.pointerType !== 'touch' && setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
      <button className={'menu-titulo' + (activo ? ' activo' : '')} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        {titulo} <span className="menu-flecha">▾</span>
      </button>
      <div className="menu-lista" role="menu">
        {items.map(([r, txt]) => (
          <a key={r} role="menuitem" href={`#${r}`} className={ruta === r || (r === '/' && ruta.startsWith('/op/')) ? 'activo' : ''} onClick={() => setAbierto(false)}>{txt}</a>
        ))}
      </div>
    </div>
  )
}

function Shell({ perfil, prueba }) {
  const ruta = useRuta()
  const gestor = ['admin', 'direccion'].includes(perfil.rol)
  const soloPagos = ['rrhh', 'contabilidad', 'litografia'].includes(perfil.rol)
  const modulos = modulosDe(perfil)
  const itemsPagos = MODULOS.filter(([m]) => modulos.includes(m)).map(([m, t]) => ['/pagos/' + m, t])
  const itemsProd = soloPagos ? [] : perfil.rol === 'logistica' ? [['/', 'Logística']] : [
    ['/', 'Tablero de planta'], ['/programacion', 'Programación'],
    ...(gestor ? [['/logistica', 'Logística'], ['/horas', 'Horas del personal'], ['/indicadores', 'Indicadores']] : []),
  ]
  const itemsConfig = gestor ? [['/catalogos', 'Catálogos y usuarios'], ['/config/nomina', 'Parámetros de nómina'], ['/config/verificacion', 'Verificación de cálculos']] : []

  let pagina
  const m = ruta.match(/^\/op\/([0-9a-f-]+)/)
  const mp = ruta.match(/^\/pagos\/(\w+)/)
  if (mp && modulos.includes(mp[1])) pagina = <Pagos key={mp[1]} modulo={mp[1]} perfil={perfil} modulos={modulos} />
  else if (soloPagos) pagina = itemsPagos.length ? <Pagos key={itemsPagos[0][0]} modulo={itemsPagos[0][0].split('/')[2]} perfil={perfil} modulos={modulos} /> : <p>Sin módulos asignados.</p>
  else if (ruta === '/config/nomina' && gestor) pagina = <ConfigNomina perfil={perfil} />
  else if (ruta === '/config/verificacion' && gestor) pagina = <Verificacion />
  // Quien solo pide vueltas (compras, Litografía…) ve únicamente Logística
  else if (perfil.rol === 'logistica') pagina = <Logistica perfil={perfil} gestor={false} />
  else if (ruta === '/logistica' && gestor) pagina = <Logistica perfil={perfil} gestor />
  else if (m) pagina = <OrdenDetalle id={m[1]} perfil={perfil} gestor={gestor} />
  else if (ruta === '/nueva' && gestor) pagina = <NuevaOP rol={perfil.rol} />
  else if (ruta === '/catalogos' && gestor) pagina = <Catalogos perfil={perfil} />
  else if (ruta === '/horas' && gestor) pagina = <Horas perfil={perfil} />
  else if (ruta === '/programacion') pagina = <Programacion perfil={perfil} gestor={gestor} />
  else if (ruta === '/indicadores' && gestor) pagina = <Indicadores perfil={perfil} />
  else pagina = <Tablero gestor={gestor} rol={perfil.rol} />

  return (
    <div className="shell">
      <header className="barra-sup">
        <div className="marca"><img src="./logo-mqi.png" alt="MQI" className="logo" /><span>{soloPagos ? 'Pagos' : 'Producción'}</span></div>
        <nav>
          <Menu titulo="Producción" items={itemsProd} ruta={ruta} />
          <Menu titulo="Pagos" items={itemsPagos} ruta={ruta} />
          <Menu titulo="Configuración" items={itemsConfig} ruta={ruta} />
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

const ROLES = { admin: 'Administrador', direccion: 'Administrador', consulta: 'Consulta', tablet: 'Tablet', logistica: 'Logística', conductor: 'Conductor', rrhh: 'Recursos Humanos', contabilidad: 'Contabilidad', litografia: 'Litografía' }
