import { createClient } from '@supabase/supabase-js'

// Dirección y clave PÚBLICA del proyecto. Es seguro que estén en la app:
// la protección real está en la base de datos (Row Level Security).
export const SUPABASE_URL = 'https://zbqzywdifiqwbmggzhyb.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_eIAjstlBW3iLWqU_hJPRvA_E6S8VyQ_'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Ejecuta una consulta y lanza el error si lo hay
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

// Columnas de personas que la app puede leer (el PIN cifrado nunca se lee)
export const PERSONA_COLS = 'id, nombre, area, rol, intentos_fallidos, activo'
