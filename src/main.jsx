import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

// ----- Actualización automática -----
// Cada 2 minutos revisa si hay una versión nueva publicada. Si nadie está escribiendo,
// recarga sola; si hay un formulario abierto, muestra un aviso para actualizar.
const actual = document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src')
async function revisarVersion() {
  if (!actual) return
  try {
    const html = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
    const nueva = html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1]
    if (!nueva || nueva === actual) return
    const ocupado = document.querySelector('.modal, .agregar-comp, form.tarjeta') ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    if (!ocupado) { location.reload(); return }
    if (!document.getElementById('aviso-version')) {
      const d = document.createElement('div')
      d.id = 'aviso-version'
      d.innerHTML = 'Hay una versión nueva del programa. <button>Actualizar ahora</button>'
      d.querySelector('button').onclick = () => location.reload()
      document.body.appendChild(d)
    }
  } catch { /* sin conexión: se intenta de nuevo luego */ }
}
setInterval(revisarVersion, 120000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarVersion() })
