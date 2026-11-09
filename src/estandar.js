// Cálculo del tiempo estándar por producto (igual que la función std_unidad de la base de datos)
export const DIF_NOMBRE = { BAJO: 'Baja', MEDIO: 'Media', ALTO: 'Alta' }

const n = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

export function tamano(medida, a, p, h) {
  a = n(a); p = n(p); h = n(h)
  if (medida === 'CM2') return a && (h ?? p) ? a * (h ?? p) : null
  if (medida === 'CM3') return a && p && h ? a * p * h : null
  return 1
}

// Minutos por unidad en un área, o null si faltan medidas o estándar
export function stdUnidad(prod, etapa, dims, multiplicador) {
  if (!prod || !etapa || etapa.min_ref === null || etapa.min_ref === undefined) return null
  let f = 1
  if (prod.medida !== 'UNIDAD') {
    const t = tamano(prod.medida, dims.ancho, dims.profundidad, dims.alto)
    const r = tamano(prod.medida, prod.ref_ancho, prod.ref_prof, prod.ref_alto)
    if (!t || !r) return null
    f = Number(prod.fraccion_fija) + (1 - Number(prod.fraccion_fija)) * (t / r)
  }
  return Number(etapa.min_ref) * f * Number(multiplicador || 1)
}

export const fmtCm = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 }))

// "120 × 60 × 72 cm" según la medida del producto
export function textoMedidas(medida, a, p, h) {
  if (medida === 'CM2') return a && (h || p) ? `${fmtCm(a)} × ${fmtCm(h || p)} cm` : ''
  if (medida === 'CM3') return a && p && h ? `${fmtCm(a)} × ${fmtCm(p)} × ${fmtCm(h)} cm` : ''
  return ''
}

export const ETIQUETA_MEDIDA = { CM2: 'Área (cm²)', CM3: 'Volumen (cm³)', UNIDAD: 'Por unidad' }
