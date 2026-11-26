import { useState } from 'react'
import { sb } from '../supabase.js'
import { Aviso } from '../ui.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setEnviando(true); setError('')
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message)
    setEnviando(false)
  }

  const olvide = async () => {
    setError('')
    if (!email.trim()) return setError('Escribe tu correo y vuelve a tocar "¿Olvidaste tu contraseña?".')
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname })
    setError(error ? error.message : 'Te enviamos un correo con el enlace para crear una contraseña nueva.')
  }

  return (
    <div className="centro login">
      <img src="./logo-mqi.png" alt="MQI Más Que Impresos" className="login-logo" />
      <form className="tarjeta login-caja" onSubmit={entrar}>
        <h1 className="login-tit">Control de Producción</h1>
        <p className="sub">Sistema de control de planta</p>
        <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" /></label>
        <Aviso tipo={error.startsWith('Te enviamos') ? 'ok' : 'error'}>{error}</Aviso>
        <button className="btn btn-grande" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn-link" onClick={olvide}>¿Olvidaste tu contraseña?</button>
        <p className="nota">Las tablets de planta entran una vez con la cuenta de su área y quedan abiertas.</p>
      </form>
    </div>
  )
}
