// Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"): fijos, trasladados al lunes siguiente y los que dependen de la Pascua.
const cache = {}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mas = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const lunesSiguiente = (d) => { const w = d.getDay(); return w === 1 ? d : mas(d, (8 - w) % 7) }
function pascua(y) { // algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mes - 1, dia, 12)
}
export function festivosDe(y) {
  if (cache[y]) return cache[y]
  const f = {}
  const pon = (d, n) => { f[iso(d)] = n }
  const D = (m, d) => new Date(y, m - 1, d, 12)
  pon(D(1, 1), 'Año Nuevo'); pon(D(5, 1), 'Día del Trabajo'); pon(D(7, 20), 'Independencia'); pon(D(8, 7), 'Batalla de Boyacá')
  pon(D(12, 8), 'Inmaculada Concepción'); pon(D(12, 25), 'Navidad')
  pon(lunesSiguiente(D(1, 6)), 'Reyes Magos'); pon(lunesSiguiente(D(3, 19)), 'San José'); pon(lunesSiguiente(D(6, 29)), 'San Pedro y San Pablo')
  pon(lunesSiguiente(D(8, 15)), 'Asunción de la Virgen'); pon(lunesSiguiente(D(10, 12)), 'Día de la Raza'); pon(lunesSiguiente(D(11, 1)), 'Todos los Santos')
  pon(lunesSiguiente(D(11, 11)), 'Independencia de Cartagena')
  const p = pascua(y)
  pon(mas(p, -3), 'Jueves Santo'); pon(mas(p, -2), 'Viernes Santo')
  pon(mas(p, 43), 'Ascensión del Señor'); pon(mas(p, 64), 'Corpus Christi'); pon(mas(p, 71), 'Sagrado Corazón')
  return (cache[y] = f)
}
export const festivo = (fecha) => festivosDe(Number(String(fecha).slice(0, 4)))[String(fecha).slice(0, 10)] || null
