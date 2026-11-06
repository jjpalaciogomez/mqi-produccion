import { useEffect, useState } from 'react'

export const SEMAFORO = {
  a_tiempo: ['A tiempo', 'ok'],
  en_riesgo: ['En riesgo', 'warn'],
  vencida: ['Vencida', 'bad'],
  sin_fecha: ['Sin fecha', 'muted'],
  cumplida: ['Cumplida', 'ok'],
  incumplida: ['Incumplida', 'bad'],
}
export const ESTADO_OP = {
  borrador: 'Borrador', en_planta: 'En planta', terminada: 'Terminada', entregada: 'Entregada', anulada: 'Anulada',
}
export const ESTADO_TAREA = {
  pendiente: ['Pendiente', 'muted'], en_curso: ['En proceso', 'info'], pausada: ['Pausada', 'warn'],
  terminada: ['Terminada', 'ok'], omitida: ['Omitida', 'ghost'],
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Semaforo({ valor }) {
  const [txt, tone] = SEMAFORO[valor] || [valor, 'muted']
  return <Badge tone={tone}>{txt}</Badge>
}

export function EstadoTarea({ estado, bloqueada }) {
  if (estado === 'pendiente' && bloqueada) return <Badge tone="ghost">En espera</Badge>
  const [txt, tone] = ESTADO_TAREA[estado] || [estado, 'muted']
  return <Badge tone={tone}>{txt}</Badge>
}

export function Barra({ pct }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0))
  return (
    <div className="barra" title={`${v}%`}>
      <div className="barra-relleno" style={{ width: `${v}%` }} />
      <span>{v}%</span>
    </div>
  )
}

export function Modal({ titulo, onClose, children, ancho }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={ancho ? { maxWidth: ancho } : null}>
        <div className="modal-cab">
          <h3>{titulo}</h3>
          {onClose && <button className="btn-icono" onClick={onClose} aria-label="Cerrar">×</button>}
        </div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  )
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null
  return <div className={`aviso aviso-${tipo}`}>{children}</div>
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando">{texto}</div>
}

// Teclado numérico para el PIN de 4 dígitos (tablets)
export function PinPad({ onCompleto, deshabilitado }) {
  const [pin, setPin] = useState('')
  useEffect(() => {
    if (pin.length === 4) { onCompleto(pin); setPin('') }
  }, [pin, onCompleto])
  const tecla = (d) => !deshabilitado && setPin((p) => (p.length < 4 ? p + d : p))
  return (
    <div className="pinpad">
      <div className="pin-puntos">
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
      </div>
      <div className="pin-teclas">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => tecla(d)} disabled={deshabilitado}>{d}</button>
        ))}
        <button className="tecla-sec" onClick={() => setPin('')} disabled={deshabilitado}>Borrar</button>
        <button onClick={() => tecla('0')} disabled={deshabilitado}>0</button>
        <button className="tecla-sec" onClick={() => setPin((p) => p.slice(0, -1))} disabled={deshabilitado}>←</button>
      </div>
    </div>
  )
}

export const fmtFecha = (d) => {
  if (!d) return '—'
  const [y, m, dd] = String(d).slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}
export const fmtNum = (n, dec = 1) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: dec })
export const fmtMin = (m) => {
  const v = Number(m) || 0
  if (v < 60) return `${fmtNum(v, 0)} min`
  return `${fmtNum(v / 60, 1)} h`
}
