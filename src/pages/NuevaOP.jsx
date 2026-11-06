import { useState } from 'react'
import { sb } from '../supabase.js'
import { Aviso } from '../ui.jsx'
import { BotonAyuda } from '../ayuda.jsx'

export default function NuevaOP({ rol }) {
  const [f, setF] = useState({ numero: '', cliente: '', proyecto: '', comercial: '', fecha_compromiso: '', prioridad: 3, notas: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true); setError('')
    const fila = { ...f, numero: f.numero.trim(), prioridad: Number(f.prioridad), fecha_compromiso: f.fecha_compromiso || null }
    const { data, error } = await sb.from('ordenes').insert(fila).select('id').single()
    setGuardando(false)
    if (error) setError(error.code === '23505' ? 'Ya existe una OP con ese número.' : error.message)
    else window.location.hash = `/op/${data.id}`
  }

  return (
    <div className="angosto">
      <div className="titulo-pagina"><h1>Nueva orden de producción</h1><BotonAyuda clave="nueva" rol={rol} /></div>
      <p className="tenue">Primero los datos generales. En el siguiente paso agregas los ítems y sus productos.</p>
      <form className="tarjeta form" onSubmit={guardar}>
        <div className="fila2">
          <label>Número de OP *<input value={f.numero} onChange={set('numero')} required placeholder="Ej. 3850" /></label>
          <label>Fecha compromiso *<input type="date" value={f.fecha_compromiso} onChange={set('fecha_compromiso')} required /></label>
        </div>
        <label>Cliente *<input value={f.cliente} onChange={set('cliente')} required /></label>
        <label>Proyecto *<input value={f.proyecto} onChange={set('proyecto')} required placeholder="Ej. Adecuación local Campo Amor" /></label>
        <div className="fila2">
          <label>Comercial<input value={f.comercial} onChange={set('comercial')} /></label>
          <label>Prioridad (1 = más alta)
            <select value={f.prioridad} onChange={set('prioridad')}>
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label>Notas<textarea rows={3} value={f.notas} onChange={set('notas')} /></label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <a className="btn btn-sec" href="#/">Cancelar</a>
          <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear OP y agregar ítems'}</button>
        </div>
      </form>
    </div>
  )
}
