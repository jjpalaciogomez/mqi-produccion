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

  return (
    <div className="centro login">
      <form className="tarjeta login-caja" onSubmit={entrar}>
        <div className="marca grande"><img src="./icon.svg" alt="" /> MQI Producción</div>
        <p className="sub">Sistema de control de planta</p>
        <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" /></label>
        <Aviso>{error}</Aviso>
        <button className="btn btn-grande" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="nota">Las tablets de planta entran una vez con la cuenta de su área y quedan abiertas.</p>
      </form>
    </div>
  )
}
