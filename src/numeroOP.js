import { useEffect, useState } from 'react'
import { sb } from './supabase.js'

// Número de OP normalizado: "OP 3901", "3901 " y "3.901" son el mismo número (igual que el índice de la base de datos)
export const normalizarOP = (n) => String(n || '').toLowerCase().replace(/^\s*op/, '').replace(/[^0-9a-z]/g, '')

// Devuelve la OP que ya tiene ese número (o null), para avisar mientras se escribe
export function useOPExistente(numero, excluirId) {
  const [ops, setOps] = useState([])
  useEffect(() => { sb.from('ordenes').select('id, numero, proyecto, cliente, estado').then(({ data }) => setOps(data || [])) }, [])
  const n = normalizarOP(numero)
  if (!n) return null
  return ops.find((o) => o.id !== excluirId && normalizarOP(o.numero) === n) || null
}
