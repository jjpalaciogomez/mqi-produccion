// ----- Actualización en tiempo real entre dispositivos -----
// Un solo canal de Supabase Realtime escucha los cambios de las tablas principales.
// Cada pantalla se suscribe con useEnVivo(cargar, tablas): vuelve a cargar cuando cambia
// algo de esas tablas, cuando la pantalla vuelve a estar visible y, por si se pierde la
// conexión, cada cierto tiempo.
import { useEffect, useRef } from 'react'
import { sb } from './supabase.js'

export const TABLAS_VIVO = ['ordenes', 'tareas', 'registros', 'programacion', 'paros', 'horas_extra', 'vueltas', 'recorridos', 'lugares', 'transportadores', 'ajustes']

let canal = null
const pendientes = new Set()
let timer = null
function avisar(t) {
  pendientes.add(t)
  clearTimeout(timer)
  // Agrupa los cambios que llegan juntos (p. ej. al reorganizar se cambian muchas filas)
  timer = setTimeout(() => {
    const ts = [...pendientes]; pendientes.clear()
    window.dispatchEvent(new CustomEvent('mqi:cambio', { detail: ts }))
  }, 600)
}
export function iniciarEnVivo() {
  if (canal) return
  canal = sb.channel('mqi-cambios')
  for (const t of TABLAS_VIVO) canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => avisar(t))
  canal.subscribe((estado) => {
    // Al reconectar se recarga todo, por si hubo cambios mientras no había conexión
    if (estado === 'SUBSCRIBED') window.dispatchEvent(new CustomEvent('mqi:cambio', { detail: TABLAS_VIVO }))
  })
}
export function detenerEnVivo() { if (canal) { sb.removeChannel(canal); canal = null } }

export function useEnVivo(cargar, tablas, cada = 30000) {
  const ref = useRef(cargar)
  ref.current = cargar
  const clave = (tablas || []).join(',')
  useEffect(() => {
    let ult = Date.now()
    const correr = () => {
      if (document.visibilityState !== 'visible') return
      ult = Date.now()
      Promise.resolve().then(() => ref.current()).catch(() => {})
    }
    const onCambio = (e) => { if (!clave || e.detail.some((t) => clave.split(',').includes(t))) correr() }
    const onVolver = () => { if (document.visibilityState === 'visible' && Date.now() - ult > 3000) correr() }
    window.addEventListener('mqi:cambio', onCambio)
    document.addEventListener('visibilitychange', onVolver)
    window.addEventListener('focus', onVolver)
    window.addEventListener('online', onVolver)
    const iv = setInterval(correr, cada)
    return () => {
      window.removeEventListener('mqi:cambio', onCambio)
      document.removeEventListener('visibilitychange', onVolver)
      window.removeEventListener('focus', onVolver)
      window.removeEventListener('online', onVolver)
      clearInterval(iv)
    }
  }, [clave, cada])
}
