import { useState } from 'react'

// Ordenar tablas haciendo clic en el encabezado (como en la hoja): un clic ascendente, otro descendente
const comparar = (a, b) => {
  const va = a === null || a === undefined || a === '' ? null : a, vb = b === null || b === undefined || b === '' ? null : b
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  const na = typeof va === 'number' ? va : Number(va), nb = typeof vb === 'number' ? vb : Number(vb)
  if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== '') return na - nb
  return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
}

export function useOrden() {
  const [o, setO] = useState(null) // { k, dir }
  const ordenar = (filas, valor) => (!o ? filas : [...filas].sort((a, b) => comparar(valor(a, o.k), valor(b, o.k)) * o.dir))
  const th = (k, etiqueta, props = {}) => (
    <th key={k} {...props} className={`${props.className || ''} ordenable${o?.k === k ? ' ordenada' : ''}`} title={props.title || 'Clic para ordenar'}
      onClick={() => setO((x) => (x && x.k === k ? (x.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }))}>
      {etiqueta}{o?.k === k ? (o.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  )
  return { ordenar, th }
}
