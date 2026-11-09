// Cálculo del tiempo estándar (igual que la función std_ruta de la base de datos)
export const DIF_NOMBRE = { BAJO: 'Baja', MEDIO: 'Media', ALTO: 'Alta' }
export const AREAS_PLANTA = ['METAL', 'MADERA', 'ACRILICO', 'GRAN FORMATO', 'PINTURA']

const n = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

export function tamano(medida, a, p, h) {
  a = n(a); p = n(p); h = n(h)
  if (medida === 'CM2') return a && (h ?? p) ? a * (h ?? p) : null
  if (medida === 'CM3') return a && p && h ? a * p * h : null
  return 1
}

// Factor por tamaño (1 en el tamaño de referencia). null si faltan medidas.
export function factorTamano(prod, dims) {
  if (!prod || prod.medida === 'UNIDAD') return 1
  const t = tamano(prod.medida, dims.ancho, dims.profundidad, dims.alto)
  const r = tamano(prod.medida, prod.ref_ancho, prod.ref_prof, prod.ref_alto)
  if (!t || !r) return null
  return Number(prod.fraccion_fija) + (1 - Number(prod.fraccion_fija)) * (t / r)
}

// Minutos por unidad de un paso de la ruta (en terceros: días). null si faltan datos.
export function stdPaso(prod, ruta, area, dims, multiplicador) {
  if (!ruta || ruta.min_ref === null || ruta.min_ref === undefined) return null
  if (area === 'TERCEROS') return Number(ruta.min_ref)
  const f = factorTamano(prod, dims)
  return f === null ? null : Number(ruta.min_ref) * f * Number(multiplicador || 1)
}

// Pasos que cuentan para el estándar: sin opcionales y solo la primera alternativa de cada paso
export function pasosPrincipales(rutas) {
  const vistos = new Set()
  return rutas.filter((r) => {
    if (r.opcional) return false
    if (r.alternativa) { if (vistos.has(r.paso)) return false; vistos.add(r.paso) }
    return true
  })
}

export const fmtCm = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 }))

export function textoMedidas(medida, a, p, h) {
  if (medida === 'CM2') return a && (h || p) ? `${fmtCm(a)} × ${fmtCm(h || p)} cm` : ''
  if (medida === 'CM3') return a && p && h ? `${fmtCm(a)} × ${fmtCm(p)} × ${fmtCm(h)} cm` : ''
  return ''
}

export const ETIQUETA_MEDIDA = { CM2: 'Área (cm²)', CM3: 'Volumen (cm³)', UNIDAD: 'Por unidad' }
export const esTerceros = (t) => t.area === 'TERCEROS'
