// =====================================================================
// MOTOR DE NÓMINA — traducción fiel del Apps Script "Sistema de liquidación quincena"
// (CALCULADORA_NOMINA_QUINCENAL). Mismas reglas, mismos redondeos y mismo orden de
// operaciones, para que el historial recalculado dé igual peso a peso.
// Todas las funciones son puras: reciben los datos y devuelven el resultado.
// =====================================================================

export const CATEGORIAS = ['HED', 'HEN', 'RN', 'HDF', 'HNDF', 'HEDF', 'HENF']
export const ORDEN_DESCUENTO_HE = ['HED', 'HEN', 'HEDF', 'HENF']
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const ESTADO_DESCANSO_NOCTURNO = 'Descanso nocturno'
export const ESTADOS_JORNADA = ['Normal', 'No asistió', 'Incapacitado', 'Vacaciones', 'Permiso', ESTADO_DESCANSO_NOCTURNO]
export const FECHA_INICIO_SALDO_TARDANZAS = '2026-11-20'
export const TOLERANCIA_LLEGADA_TARDE_MIN = 0
export const AUS_TIPOS = ['Accidente de trabajo', 'Incapacidad', 'Ausentismo sin justa causa', 'Permiso', 'Calamidad', 'Vacaciones']
export const AUS_TIPOS_INCAPACIDAD = ['Incapacidad', 'Accidente de trabajo']
export const AUS_TIPOS_LICENCIA_REMUNERADA = ['Calamidad']
export const AUS_TIPOS_NO_REMUNERADOS = ['Ausentismo sin justa causa', 'Permiso']
export const MESES = [
  { nombre: 'enero', num: 1, abrev: 'ENE' }, { nombre: 'febrero', num: 2, abrev: 'FEB' },
  { nombre: 'marzo', num: 3, abrev: 'MAR' }, { nombre: 'abril', num: 4, abrev: 'ABR' },
  { nombre: 'mayo', num: 5, abrev: 'MAY' }, { nombre: 'junio', num: 6, abrev: 'JUN' },
  { nombre: 'julio', num: 7, abrev: 'JUL' }, { nombre: 'agosto', num: 8, abrev: 'AGO' },
  { nombre: 'septiembre', num: 9, abrev: 'SEP' }, { nombre: 'octubre', num: 10, abrev: 'OCT' },
  { nombre: 'noviembre', num: 11, abrev: 'NOV' }, { nombre: 'diciembre', num: 12, abrev: 'DIC' },
]
export const BANCOS_ACH = [
  { nombre: 'Bancolombia', codigo: 1007 }, { nombre: 'Nequi', codigo: 1507 }, { nombre: 'Davivienda', codigo: 1051 },
  { nombre: 'BBVA', codigo: 1013 }, { nombre: 'Banco de Bogotá', codigo: 1001 }, { nombre: 'Banco Popular', codigo: 1002 },
  { nombre: 'Banco Agrario', codigo: 1040 }, { nombre: 'Banco Caja Social', codigo: 1032 },
  { nombre: 'Scotiabank Colpatria', codigo: 1019 }, { nombre: 'Banco de Occidente', codigo: 1023 },
  { nombre: 'Banco AV Villas', codigo: 1052 }, { nombre: 'Itaú', codigo: 1006 }, { nombre: 'Bancoomeva', codigo: 1061 },
  { nombre: 'Banco GNB Sudameris', codigo: 1012 }, { nombre: 'Citibank', codigo: 1009 }, { nombre: 'Banco W', codigo: 1053 },
  { nombre: 'Mibanco', codigo: 1067 }, { nombre: 'Banco Falabella', codigo: 1062 }, { nombre: 'Banco Finandina', codigo: 1063 },
  { nombre: 'Bancamía', codigo: 1059 }, { nombre: 'Banco Serfinanza', codigo: 1069 }, { nombre: 'Banco Mundo Mujer', codigo: 1047 },
  { nombre: 'Banco Santander de Negocios', codigo: 1065 }, { nombre: 'Banco Cooperativo Coopcentral', codigo: 1066 },
  { nombre: 'Bancóldex', codigo: 1031 }, { nombre: 'Financiera Juriscoop', codigo: 1121 },
]
export const TIPO_DOC_BANCO = { 'Cédula': 1, 'Cédula de extranjería': 2, 'NIT': 3, 'Pasaporte': 4, 'Otro': 5 }

// ---------------------------------------------------------------------
// Utilidades de fecha y hora (fechas ISO 'yyyy-mm-dd', sin zona horaria)
// ---------------------------------------------------------------------
export const pad2 = (n) => String(n).padStart(2, '0')
export const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export function textoAHoras(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || hhmm.indexOf(':') === -1) return null
  const [a, b] = hhmm.split(':')
  const h = parseInt(a, 10), m = parseInt(b, 10)
  if (isNaN(h) || isNaN(m)) return null
  return h + m / 60
}
export const esHoraValida = (t) => typeof t === 'string' && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t)
export function normalizarHora(t) {
  if (!esHoraValida(t)) return t
  const [h, m] = t.split(':')
  return ('0' + h).slice(-2) + ':' + m
}
// Fecha ISO -> {y, m, d, dow}; se trabaja en UTC para no depender de la zona del equipo
const aUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const deUTC = (dt) => dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate())
export const diaSemana = (iso) => aUTC(iso).getUTCDay()
export const diaDelMes = (iso) => Number(iso.slice(8, 10))
export function fechaISOMasDias(iso, n) { const d = aUTC(iso); d.setUTCDate(d.getUTCDate() + n); return deUTC(d) }
export const viernesDeSemana = (iso) => fechaISOMasDias(iso, -((diaSemana(iso) - 5 + 7) % 7))
export const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / 86400000)

export function calcularDiasHabiles(desde, hasta, festivos) {
  if (!desde || !hasta || hasta < desde) return 0
  let dias = 0
  for (let d = desde; d <= hasta; d = fechaISOMasDias(d, 1)) {
    if (diaSemana(d) !== 0 && !festivos.includes(d)) dias++
  }
  return dias
}

// ---------------------------------------------------------------------
// Quincenas y semanas (etiquetas "Del 1 al 15 de noviembre de 2026")
// ---------------------------------------------------------------------
const mesPorNombre = (n) => MESES.find((x) => x.nombre === String(n).toLowerCase())
export function parsearQuincena(label) {
  const m = /^Del (\d{1,2}) al (\d{1,2}) de (\S+) de (\d{4})$/.exec((label || '').trim())
  if (!m) return null
  const mes = mesPorNombre(m[3]); if (!mes) return null
  const anio = +m[4], ini = +m[1], fin = +m[2]
  return { diaInicio: ini, diaFin: fin, mes, anio, inicio: `${anio}-${pad2(mes.num)}-${pad2(ini)}`, fin: `${anio}-${pad2(mes.num)}-${pad2(fin)}` }
}
export function etiquetaQuincena(anio, mesNum, primera) {
  const mes = MESES[mesNum - 1]
  const ultimo = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  return primera ? `Del 1 al 15 de ${mes.nombre} de ${anio}` : `Del 16 al ${ultimo} de ${mes.nombre} de ${anio}`
}
export function parsearSemana(label) {
  label = (label || '').trim()
  let m = /^Del (\d{1,2}) al (\d{1,2}) de (\S+) de (\d{4})$/.exec(label)
  if (m) { const mes = mesPorNombre(m[3]); return mes ? { diaInicio: +m[1], diaFin: +m[2], mesFin: mes, anioFin: +m[4] } : null }
  m = /^Del (\d{1,2}) de (\S+) al (\d{1,2}) de (\S+) de (\d{4})$/.exec(label)
  if (m) { const mes = mesPorNombre(m[4]); return mes ? { diaInicio: +m[1], diaFin: +m[3], mesFin: mes, anioFin: +m[5] } : null }
  m = /^Del (\d{1,2}) de (\S+) de (\d{4}) al (\d{1,2}) de (\S+) de (\d{4})$/.exec(label)
  if (m) { const mes = mesPorNombre(m[5]); return mes ? { diaInicio: +m[1], diaFin: +m[4], mesFin: mes, anioFin: +m[6] } : null }
  return null
}
export function semanaInicioDeLabel(label) {
  const i = parsearSemana(label); if (!i) return ''
  return fechaISOMasDias(`${i.anioFin}-${pad2(i.mesFin.num)}-${pad2(i.diaFin)}`, -6)
}
// Etiqueta de la semana (viernes a jueves) que empieza en un viernes dado — mismo formato de la hoja
export function etiquetaSemana(viernesISO) {
  const fin = fechaISOMasDias(viernesISO, 6)
  const [y1, m1, d1] = viernesISO.split('-').map(Number), [y2, m2, d2] = fin.split('-').map(Number)
  if (m1 === m2) return `Del ${d1} al ${d2} de ${MESES[m2 - 1].nombre} de ${y2}`
  return `Del ${d1} de ${MESES[m1 - 1].nombre} de ${y1} al ${d2} de ${MESES[m2 - 1].nombre} de ${y2}`
}
export const fechasDeSemana = (inicio) => Array.from({ length: 7 }, (_, i) => fechaISOMasDias(inicio, i))

// ---------------------------------------------------------------------
// Empleado: de la fila de la base de datos al formato que usa el motor
// ---------------------------------------------------------------------
export function empMotor(e) {
  return {
    ID_Empleado: e.id, Cedula: e.cedula || '', Nombre: e.nombre, Cargo: e.cargo || '', Area: e.area || '',
    TipoContrato: e.tipo_contrato || '', FechaIngreso: e.fecha_ingreso || '', Salario: Number(e.salario) || 0,
    AuxTransporte: e.aux_transporte ? 'Sí' : 'No', AuxConectividad: e.aux_conectividad ? 'Sí' : 'No',
    Banco: e.banco || '', Cuenta: e.cuenta || '', EPS: e.eps || '', Pension: e.pension || '', ARL: e.arl || '',
    NivelRiesgo: e.nivel_riesgo || '', Estado: e.estado || 'Activo', Empresa: e.empresa || '',
    LiquidaExtras: e.liquida_extras ? 'Sí' : 'No', TipoDocumentoBanco: e.tipo_doc_banco || '',
    FechaRetiro: e.fecha_retiro || '', CajaCompensacion: e.caja_compensacion || '',
  }
}
export const esAreaLitografia = (area) => !!area && area.toString().trim().toLowerCase()
  .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u') === 'litografia'

// cfg = parámetros + factores (mismo mapa que configComoMapa_ de la hoja)
export function cfgMapa(parametros, factores) {
  const cfg = { ...(parametros || {}) }
  Object.entries(factores || {}).forEach(([k, v]) => { cfg['factor' + k] = v })
  return cfg
}

// ---------------------------------------------------------------------
// JORNADA
// ---------------------------------------------------------------------
export function calcularHorasLaboradas(entrada, salida, cfg, diaLaboralNormal) {
  if (!esHoraValida(entrada) || !esHoraValida(salida)) return null
  const e = textoAHoras(entrada), s = textoAHoras(salida)
  if (s <= e) return null
  const almuerzo = diaLaboralNormal === false ? 0 : (Number(cfg.tiempoAlmuerzo) || 0)
  return Math.round(((s - e) - almuerzo) * 100) / 100
}
export function calcularHorasSegunda(entrada, salida, diaSiguiente) {
  if (!esHoraValida(entrada) || !esHoraValida(salida)) return null
  const e = textoAHoras(entrada), s = textoAHoras(salida)
  const horas = diaSiguiente ? (24 - e) + s : s - e
  if (horas <= 0 || horas > 16) return null
  return Math.round(horas * 100) / 100
}
export function segundaSeCruzaConPrimera(f) {
  if (!esHoraValida(f.HoraEntrada) || !esHoraValida(f.HoraSalida) || !esHoraValida(f.SegHoraEntrada) || !esHoraValida(f.SegHoraSalida)) return false
  const e1 = textoAHoras(f.HoraEntrada), s1 = textoAHoras(f.HoraSalida)
  const e2 = textoAHoras(f.SegHoraEntrada), s2 = textoAHoras(f.SegHoraSalida) + (f.SegDiaSiguiente ? 24 : 0)
  return e2 < s1 && s2 > e1
}
export const esDiaLaboralNormal = (fecha, festivos) => { const d = diaSemana(fecha); return d !== 0 && d !== 6 && !festivos.includes(fecha) }

const vacio = () => ({ HED: 0, HEN: 0, RN: 0, HDF: 0, HNDF: 0, HEDF: 0, HENF: 0 })

// Clasifica un día trabajado (jornada normal) en las 7 categorías
export function clasificarDia(reg, cfg, festivos) {
  const entrada = textoAHoras(reg.HoraEntrada)
  let salida = textoAHoras(reg.HoraSalida)
  if (entrada === null || salida === null) return null
  if (salida < entrada) salida += 24
  const dow = diaSemana(reg.Fecha)
  const esDescanso = dow === 0 || festivos.includes(reg.Fecha)
  const tolerancia = (Number(cfg.toleranciaHoraExtraMin) || 0) / 60
  let inicioOrdinario = null, finOrdinario
  if (esDescanso) finOrdinario = entrada + (Number(cfg.horasJornadaViernes) || 0)
  else if (dow === 6) finOrdinario = entrada
  else {
    inicioOrdinario = textoAHoras(cfg.inicioJornadaNormal)
    finOrdinario = dow === 5 ? textoAHoras(cfg.finJornadaViernes) : textoAHoras(cfg.finJornadaLJ)
  }
  if (finOrdinario === null) finOrdinario = entrada
  if (finOrdinario < entrada) finOrdinario += 24
  if (finOrdinario > salida) finOrdinario = salida
  let horasExtraDespues = Math.max(0, salida - finOrdinario)
  if (horasExtraDespues <= tolerancia) horasExtraDespues = 0
  let horasExtraAntes = 0, inicioOrdinarioEfectivo = entrada
  if (inicioOrdinario !== null && entrada < inicioOrdinario) {
    const adelanto = inicioOrdinario - entrada
    if (adelanto > tolerancia) { horasExtraAntes = adelanto; inicioOrdinarioEfectivo = inicioOrdinario }
  }
  let inicioNoct = textoAHoras(cfg.inicioJornadaNocturna), finNoct = textoAHoras(cfg.finJornadaNocturna)
  if (inicioNoct === null) inicioNoct = 19
  if (finNoct === null) finNoct = 6
  finNoct += 24
  const horasNocturnas = (a, b) => {
    if (b <= a) return 0
    const solape = (x1, x2) => { const ini = Math.max(a, x1), fin = Math.min(b, x2); return fin > ini ? fin - ini : 0 }
    return solape(inicioNoct, finNoct) + solape(inicioNoct - 24, finNoct - 24)
  }
  const ordinarioNocturno = horasNocturnas(inicioOrdinarioEfectivo, finOrdinario)
  const extraNocturnoDespues = horasExtraDespues > 0 ? horasNocturnas(finOrdinario, salida) : 0
  const extraDiurnoDespues = Math.max(0, horasExtraDespues - extraNocturnoDespues)
  const extraNocturnoAntes = horasExtraAntes > 0 ? horasNocturnas(entrada, inicioOrdinarioEfectivo) : 0
  const extraDiurnoAntes = Math.max(0, horasExtraAntes - extraNocturnoAntes)
  const ordinarioDiurno = Math.max(0, (finOrdinario - inicioOrdinarioEfectivo) - ordinarioNocturno)
  const extraDiurno = extraDiurnoDespues + extraDiurnoAntes
  const extraNocturno = extraNocturnoDespues + extraNocturnoAntes
  const r = vacio()
  if (esDescanso) { r.HDF = ordinarioDiurno; r.HNDF = ordinarioNocturno; r.HEDF = extraDiurno; r.HENF = extraNocturno }
  else { r.RN = ordinarioNocturno; r.HED = extraDiurno; r.HEN = extraNocturno }
  return r
}

// Segunda jornada (Industrial): toda es extra, repartida por fecha si cruza la medianoche
export function clasificarSegundaJornada(fecha, horaEntrada, fechaSalida, horaSalida, cfg, festivos) {
  if (!fecha || !esHoraValida(horaEntrada) || !esHoraValida(horaSalida)) return []
  const e = textoAHoras(horaEntrada), s = textoAHoras(horaSalida)
  const diaSiguiente = !!fechaSalida && String(fechaSalida) > fecha
  const tramos = diaSiguiente ? [{ f: fecha, a: e, b: 24 }, { f: fechaSalida, a: 0, b: s }] : [{ f: fecha, a: e, b: s }]
  let inicioNoct = textoAHoras(cfg.inicioJornadaNocturna), finNoct = textoAHoras(cfg.finJornadaNocturna)
  if (inicioNoct === null) inicioNoct = 19
  if (finNoct === null) finNoct = 6
  const solape = (a, b, x1, x2) => { const ini = Math.max(a, x1), fin = Math.min(b, x2); return fin > ini ? fin - ini : 0 }
  const out = []
  tramos.forEach((t) => {
    if (t.b <= t.a) return
    const noct = solape(t.a, t.b, inicioNoct, 24) + solape(t.a, t.b, 0, finNoct)
    const diur = Math.max(0, (t.b - t.a) - noct)
    const dow = diaSemana(t.f)
    const esDescanso = dow === 0 || festivos.includes(t.f)
    const c = vacio()
    if (esDescanso) { c.HEDF = diur; c.HENF = noct } else { c.HED = diur; c.HEN = noct }
    out.push({ Fecha: t.f, Clasif: c })
  })
  return out
}

// Tramos clasificados de una fila de jornada (de la base de datos)
export function segmentosDeJornada(j, cfg, festivos) {
  const out = []
  const clasif = clasificarDia({ Fecha: j.fecha, HoraEntrada: j.entrada || '', HoraSalida: j.salida || '' }, cfg, festivos)
  if (clasif) out.push({ Fecha: j.fecha, Clasif: clasif, Segunda: false })
  if (j.grupo === 'industrial') {
    clasificarSegundaJornada(j.fecha, j.seg_entrada || '', j.seg_fecha_salida || '', j.seg_salida || '', cfg, festivos)
      .forEach((t) => out.push({ Fecha: t.Fecha, Clasif: t.Clasif, Segunda: true }))
  }
  return out
}

// Suma por empleado de lo que cae en las fechas dadas (prellenado de Horas extra)
export function calcularHorasExtraDesdeJornada(jornadas, fechas, grupo, cfg, festivos) {
  const por = {}
  jornadas.filter((j) => j.grupo === grupo).forEach((j) => {
    segmentosDeJornada(j, cfg, festivos).forEach((seg) => {
      if (!fechas.includes(seg.Fecha)) return
      const p = por[j.empleado_id] || (por[j.empleado_id] = vacio())
      CATEGORIAS.forEach((k) => { p[k] += seg.Clasif[k] })
    })
  })
  Object.values(por).forEach((p) => CATEGORIAS.forEach((k) => { p[k] = Math.round(p[k] * 100) / 100 }))
  return por
}

// ---------------------------------------------------------------------
// HORAS EXTRA — valores en pesos
// ---------------------------------------------------------------------
export function calcularHorasExtra(emp, input, cfg) {
  const valorHora = emp.Salario / cfg.divisorMensual
  const val = (h, k) => Math.round((Number(h) || 0) * valorHora * cfg['factor' + k])
  const v = {}
  CATEGORIAS.forEach((k) => { v['Valor' + k] = val(input[k], k) })
  const total = CATEGORIAS.reduce((a, k) => a + v['Valor' + k], 0)
  return { ValorHora: Math.round(valorHora * 100) / 100, ...v, TotalHorasExtra: total }
}

// Descanso nocturno y llegadas tarde: horas que se descuentan de las extras
export const horasDiaDescanso = (cfg) => { const h = (Number(cfg.divisorMensual) || 0) / 30; return h > 0 && isFinite(h) ? redondear2(h) : 8 }

export function getDescansosNocturnos(jornadas, festivos) {
  return jornadas.filter((j) => j.grupo === 'industrial' && j.estado === ESTADO_DESCANSO_NOCTURNO && j.empleado_id && j.fecha).map((j) => {
    const dow = diaSemana(j.fecha)
    return {
      ID_Empleado: j.empleado_id, Nombre: j.nombre, Area: j.area || '', Fecha: j.fecha, Dia: DIAS_SEMANA[dow],
      Laboral: dow !== 0 && dow !== 6 && !festivos.includes(j.fecha),
      SemanaInicio: viernesDeSemana(fechaISOMasDias(j.fecha, -1)),
    }
  })
}

export function getTardanzas(jornadas, cfg, festivos) {
  const inicio = textoAHoras(cfg.inicioJornadaNormal)
  if (inicio === null) return []
  const out = []
  jornadas.forEach((j) => {
    if (!j.empleado_id || !j.fecha || j.fecha < FECHA_INICIO_SALDO_TARDANZAS) return
    if ((j.estado || 'Normal') !== 'Normal') return
    const entrada = j.entrada || ''
    if (!esHoraValida(entrada)) return
    const dow = diaSemana(j.fecha)
    if (dow === 0 || dow === 6 || festivos.includes(j.fecha)) return
    const minutos = Math.round((textoAHoras(entrada) - inicio) * 60)
    if (minutos <= TOLERANCIA_LLEGADA_TARDE_MIN) return
    out.push({ ID_Empleado: j.empleado_id, Nombre: j.nombre, Area: j.area || '', Grupo: j.grupo, Fecha: j.fecha, Dia: DIAS_SEMANA[dow],
      Entrada: entrada, Minutos: minutos, Horas: redondear2(minutos / 60), Observacion: j.observacion || '', SemanaInicio: viernesDeSemana(j.fecha) })
  })
  return out
}

export function aplicarDescuentoHoras(horas, disponible, emp, cfg) {
  let resto = redondear2(disponible)
  const aplic = { HED: 0, HEN: 0, HEDF: 0, HENF: 0 }
  ORDEN_DESCUENTO_HE.forEach((c) => {
    const t = Math.min(resto, Number(horas[c]) || 0)
    aplic[c] = redondear2(t)
    resto = redondear2(resto - t)
  })
  let valor = 0
  if (emp) {
    const netas = {}
    CATEGORIAS.forEach((c) => { netas[c] = (Number(horas[c]) || 0) - (aplic[c] || 0) })
    valor = calcularHorasExtra(emp, horas, cfg).TotalHorasExtra - calcularHorasExtra(emp, netas, cfg).TotalHorasExtra
  }
  return { Aplicado: aplic, AplicadoTotal: redondear2(disponible - resto), SaldoFinal: resto, ValorDescuento: valor }
}

// Cadena de saldos de horas por empleado y semana (descansos nocturnos + llegadas tarde)
export function calcularCadenaDescuentosHE(jornadas, horasExtraGuardadas, empleadosPorId, cfg, festivos) {
  const horasDia = horasDiaDescanso(cfg)
  const descansos = getDescansosNocturnos(jornadas, festivos)
  const ded = {}
  descansos.forEach((d) => {
    d.Horas = d.Laboral ? horasDia : 0
    if (!d.Horas) return
    ded[d.ID_Empleado] = ded[d.ID_Empleado] || {}
    ded[d.ID_Empleado][d.SemanaInicio] = redondear2((ded[d.ID_Empleado][d.SemanaInicio] || 0) + d.Horas)
  })
  const tardanzas = getTardanzas(jornadas, cfg, festivos)
  tardanzas.forEach((t) => {
    ded[t.ID_Empleado] = ded[t.ID_Empleado] || {}
    ded[t.ID_Empleado][t.SemanaInicio] = redondear2((ded[t.ID_Empleado][t.SemanaInicio] || 0) + t.Horas)
  })
  const porEmpleado = {}
  const ids = Object.keys(ded)
  if (!ids.length) return { porEmpleado, descuentos: ded, descansos, tardanzas, horasDia }
  const bruto = {}
  horasExtraGuardadas.forEach((r) => {
    if (!ded[r.empleado_id]) return
    const inicio = r.semana_inicio || semanaInicioDeLabel(r.semana)
    if (!inicio) return
    bruto[r.empleado_id] = bruto[r.empleado_id] || {}
    const b = bruto[r.empleado_id][inicio] || (bruto[r.empleado_id][inicio] = { ...vacio(), Total: 0 })
    CATEGORIAS.forEach((c) => { b[c] += Number(r[c.toLowerCase()]) || 0 })
    b.Total += Number(r.total) || 0
  })
  ids.forEach((id) => {
    const semanas = new Set([...Object.keys(ded[id]), ...Object.keys(bruto[id] || {})])
    let saldo = 0
    porEmpleado[id] = {}
    ;[...semanas].sort().forEach((w) => {
      const debe = ded[id][w] || 0
      const b = (bruto[id] || {})[w] || { ...vacio(), Total: 0 }
      const r = aplicarDescuentoHoras(b, saldo + debe, empleadosPorId[id], cfg)
      porEmpleado[id][w] = { Bruto: b.Total, HorasBrutas: b, Debe: debe, SaldoAnterior: saldo, Aplicado: r.Aplicado,
        AplicadoTotal: r.AplicadoTotal, SaldoFinal: r.SaldoFinal, ValorDescuento: r.ValorDescuento, Neto: Math.max(0, b.Total - r.ValorDescuento) }
      saldo = r.SaldoFinal
    })
  })
  return { porEmpleado, descuentos: ded, descansos, tardanzas, horasDia }
}
export function saldoAntesDeSemana(cadena, id, inicio) {
  const m = cadena.porEmpleado[id]; if (!m) return 0
  let mejor = '', saldo = 0
  Object.keys(m).forEach((k) => { if (k < inicio && k > mejor) { mejor = k; saldo = m[k].SaldoFinal } })
  return saldo
}
export const textoAplicado = (aplic) => ORDEN_DESCUENTO_HE.filter((c) => aplic[c] > 0).map((c) => c + ' ' + aplic[c]).join(' · ')

// ---------------------------------------------------------------------
// AUSENTISMOS, VACACIONES Y PROGRAMADOS dentro de una quincena
// ---------------------------------------------------------------------
function diasCalendarioComercialEnQuincena(inicio, fin, qIni, qFin, acumulado) {
  const desde = inicio > qIni ? inicio : qIni
  const hasta = fin < qFin ? fin : qFin
  const [qy, qm] = qFin.split('-').map(Number)
  const ultimoDiaMes = new Date(Date.UTC(qy, qm, 0)).getUTCDate()
  for (let d = desde; d <= hasta; d = fechaISOMasDias(d, 1)) {
    const n = diaDelMes(d)
    if (n <= 30 && !acumulado.includes(n)) acumulado.push(n)
    if (n === ultimoDiaMes && ultimoDiaMes < 30) for (let k = n + 1; k <= 30; k++) if (!acumulado.includes(k)) acumulado.push(k)
  }
  return acumulado
}
export function diasAusentismoEnQuincena(idEmp, tipos, qIni, qFin, ausentismos, festivos) {
  const esIncap = tipos.every((t) => AUS_TIPOS_INCAPACIDAD.includes(t))
  let dias = 0
  const cal = []
  ausentismos.forEach((a) => {
    if (a.empleado_id !== idEmp || a.estado !== 'Activo' || !tipos.includes(a.tipo)) return
    const inicio = a.fecha_inicio, fin = a.fecha_fin
    if (!inicio || !fin || fin < qIni || inicio > qFin) return
    if (esIncap) { diasCalendarioComercialEnQuincena(inicio, fin, qIni, qFin, cal); return }
    dias += calcularDiasHabiles(inicio > qIni ? inicio : qIni, fin < qFin ? fin : qFin, festivos)
  })
  return esIncap ? Math.min(15, cal.length) : dias
}
export function diasVacacionesEnQuincena(idEmp, qIni, qFin, vacaciones, festivos) {
  let dias = 0
  vacaciones.forEach((v) => {
    if (v.empleado_id !== idEmp || v.estado !== 'Activo' || (v.tipo || 'Periodo') !== 'Periodo') return
    if (!v.fecha_inicio || !v.fecha_fin) return
    const desde = v.fecha_inicio > qIni ? v.fecha_inicio : qIni
    const hasta = v.fecha_fin < qFin ? v.fecha_fin : qFin
    if (desde > hasta) return
    dias += calcularDiasHabiles(desde, hasta, festivos)
  })
  return dias
}
export const splitIncapacidadPorTipo = (idEmp, qIni, qFin, ausentismos, festivos) => (!qIni || !qFin ? { comun: 0, accidenteTrabajo: 0 } : {
  comun: diasAusentismoEnQuincena(idEmp, ['Incapacidad'], qIni, qFin, ausentismos, festivos),
  accidenteTrabajo: diasAusentismoEnQuincena(idEmp, ['Accidente de trabajo'], qIni, qFin, ausentismos, festivos),
})

export function diasAntesIngreso(fechaIngreso, qIni, qFin) {
  if (!fechaIngreso) return 0
  if (fechaIngreso <= qIni) return 0
  if (fechaIngreso > qFin) return 15
  const antes = Math.min(30, diaDelMes(fechaIngreso)) - diaDelMes(qIni)
  return Math.max(0, Math.min(15, antes))
}
export function diasDespuesRetiro(fechaRetiro, qIni, qFin) {
  if (!fechaRetiro) return 0
  if (fechaRetiro >= qFin) return 0
  if (fechaRetiro < qIni) return 15
  const trabajados = Math.min(30, diaDelMes(fechaRetiro)) - diaDelMes(qIni) + 1
  return Math.max(0, Math.min(15, 15 - trabajados))
}

export function programadoActivo(idEmp, programados) {
  let total = 0
  const conceptos = [], ids = []
  programados.forEach((p) => {
    if (p.empleado_id !== idEmp || p.estado !== 'Activo') return
    const valorRegular = Number(p.valor) || 0, totales = Number(p.quincenas_totales) || 0, aplicadas = Number(p.quincenas_aplicadas) || 0
    if (totales > 0 && aplicadas >= totales) return
    const montoTotal = Number(p.monto_total) || 0
    let estaVez = valorRegular
    if (totales > 0 && montoTotal && aplicadas + 1 === totales) estaVez = montoTotal - valorRegular * (totales - 1)
    total += estaVez
    conceptos.push(p.concepto)
    ids.push(p.id)
  })
  return { valor: total, concepto: conceptos.join(', '), idsAplicables: ids }
}

// ---------------------------------------------------------------------
// NÓMINA QUINCENAL
// ---------------------------------------------------------------------
export function calcularNominaBase(emp, input, cfg, programado, diasPorTipo) {
  const diasIncap = Math.max(0, Math.min(15, Number(input.Incapacidad) || 0))
  const diasVacaciones = Math.max(0, Math.min(15 - diasIncap, Number(input.DiasVacaciones) || 0))
  const diasLicencia = Math.max(0, Math.min(15 - diasIncap - diasVacaciones, Number(input.DiasLicencia) || 0))
  let dias = Number(input.DiasTrabajados) || 0
  const maxDias = Math.max(0, 15 - diasIncap - diasVacaciones - diasLicencia)
  if (dias > maxDias) dias = maxDias
  const esPS = emp.TipoContrato === 'Prestación de servicios'
  const basico = Math.round((emp.Salario / 2) * ((dias + diasVacaciones + diasLicencia) / 15))
  const califica = !esPS && emp.AuxTransporte === 'Sí' && emp.Salario <= cfg.smlv * cfg.topeAuxTransporteSMLV
  const auxTransporte = califica ? Math.round((cfg.auxTransporte / 2) * (dias / 15)) : 0
  let subsidioIncapacidad = 0
  if (diasIncap > 0) {
    const valorDia = emp.Salario / 30
    let diasAT = 0
    if (diasPorTipo) {
      const tot = (diasPorTipo.comun || 0) + (diasPorTipo.accidenteTrabajo || 0)
      if (tot > 0) diasAT = Math.round(diasIncap * ((diasPorTipo.accidenteTrabajo || 0) / tot))
    }
    diasAT = Math.min(diasAT, diasIncap)
    const diasComun = diasIncap - diasAT
    let diarioComun = Math.round(valorDia * (Number(cfg.pctIncapacidad) || 0.6667))
    if (cfg.aplicarPisoIncapacidad === 'Sí') diarioComun = Math.max(diarioComun, Math.round((Number(cfg.smlv) || 0) / 30))
    subsidioIncapacidad = diarioComun * diasComun + Math.round(valorDia) * diasAT
  }
  const ajuste = Number(input.OtrosAjuste) || 0
  const otrosDev = ajuste > 0 ? ajuste : 0, otrosDesc = ajuste < 0 ? -ajuste : 0
  const valorProg = programado ? (Number(programado.valor) || 0) : 0
  const progDev = valorProg > 0 ? valorProg : 0, progDesc = valorProg < 0 ? -valorProg : 0
  const totalDevengado = basico + auxTransporte + subsidioIncapacidad + otrosDev + progDev
  const ibc = basico + subsidioIncapacidad
  const salud = esPS ? 0 : Math.round(ibc * 0.04)
  const pension = (esPS || emp.Pension === 'Jubilado') ? 0 : Math.round(ibc * 0.04)
  const totalDescuentos = salud + pension + otrosDesc + progDesc
  return {
    DiasTrabajados: dias, Incapacidad: diasIncap, DiasVacaciones: diasVacaciones, DiasLicencia: diasLicencia,
    Basico: basico, AuxTransporte: auxTransporte, TotalDevengado: totalDevengado, IBC: ibc, Salud: salud, Pension: pension,
    TotalDescuentos: totalDescuentos, NetoPagar: totalDevengado - totalDescuentos, SubsidioIncapacidad: subsidioIncapacidad, Programado: valorProg,
  }
}

// Empleados que entran en una quincena (activos + retirados dentro de la quincena)
export function empleadosParaNomina(empleados, qIni) {
  return empleados.filter((e) => e.Estado !== 'Inactivo' || (!!qIni && !!e.FechaRetiro && e.FechaRetiro >= qIni))
}
export const empleadosParaHorasExtra = (empleados, grupo) => empleados.filter((e) =>
  e.Estado !== 'Inactivo' && e.TipoContrato !== 'Prestación de servicios' && e.LiquidaExtras !== 'No'
  && (!grupo || grupo === 'todos' || (grupo === 'litografia') === esAreaLitografia(e.Area)))

// Valores sugeridos de una persona para una quincena nueva (días, incapacidad, vacaciones, licencia)
export function sugeridosQuincena(emp, qIni, qFin, ausentismos, vacaciones, festivos) {
  const antes = diasAntesIngreso(emp.FechaIngreso, qIni, qFin)
  const despues = emp.Estado === 'Inactivo' ? diasDespuesRetiro(emp.FechaRetiro, qIni, qFin) : 0
  const noRem = diasAusentismoEnQuincena(emp.ID_Empleado, AUS_TIPOS_NO_REMUNERADOS, qIni, qFin, ausentismos, festivos)
  return {
    DiasAntesIngreso: antes, DiasDespuesRetiro: despues, DiasNoRemunerados: noRem,
    DiasTrabajados: Math.max(0, 15 - noRem - antes - despues),
    Incapacidad: diasAusentismoEnQuincena(emp.ID_Empleado, AUS_TIPOS_INCAPACIDAD, qIni, qFin, ausentismos, festivos),
    DiasVacaciones: diasVacacionesEnQuincena(emp.ID_Empleado, qIni, qFin, vacaciones, festivos)
      + diasAusentismoEnQuincena(emp.ID_Empleado, ['Vacaciones'], qIni, qFin, ausentismos, festivos),
    DiasLicencia: diasAusentismoEnQuincena(emp.ID_Empleado, AUS_TIPOS_LICENCIA_REMUNERADA, qIni, qFin, ausentismos, festivos),
  }
}

// ---------------------------------------------------------------------
// VACACIONES — saldo
// ---------------------------------------------------------------------
// Regla de la hoja: causados = días calendario desde el ingreso / 360 × 15; disfrutados = períodos + ausentismos "Vacaciones".
// Los "Saldo inicial" (corte Excel) se muestran aparte; la hoja no los sumaba (estaban escritos como texto).
export function saldoVacaciones(empleados, vacaciones, ausentismos, hoy) {
  const disfrutado = {}, inicial = {}
  vacaciones.forEach((v) => {
    if (v.estado !== 'Activo') return
    if ((v.tipo || 'Periodo') === 'Saldo inicial') { inicial[v.empleado_id] = (inicial[v.empleado_id] || 0) + (Number(v.dias_habiles) || 0); return }
    disfrutado[v.empleado_id] = (disfrutado[v.empleado_id] || 0) + (Number(v.dias_habiles) || 0)
  })
  ausentismos.forEach((a) => {
    if (a.estado !== 'Activo' || a.tipo !== 'Vacaciones') return
    disfrutado[a.empleado_id] = (disfrutado[a.empleado_id] || 0) + (Number(a.dias_habiles) || 0)
  })
  return empleados.filter((e) => e.Estado !== 'Inactivo').map((e) => {
    const ing = e.FechaIngreso || hoy
    const diasCal = ing <= hoy ? diasEntre(ing, hoy) : 0
    const causados = Math.round((diasCal / 360) * 15 * 10) / 10
    const disf = disfrutado[e.ID_Empleado] || 0
    return { ID_Empleado: e.ID_Empleado, Nombre: e.Nombre, Area: e.Area, FechaIngreso: e.FechaIngreso, DiasCausados: causados,
      DiasDisfrutados: disf, SaldoPendiente: Math.round((causados - disf) * 10) / 10, SaldoInicialExcel: inicial[e.ID_Empleado] ?? null }
  }).sort((a, b) => b.SaldoPendiente - a.SaldoPendiente)
}

// ---------------------------------------------------------------------
// CAUSACIONES CONTABLES
// ---------------------------------------------------------------------
const CAUS_TIPO_A_CLAVE = { 'COSTO': 'costo', 'GASTO ADMINISTRATIVO': 'gastoAdministrativo', 'GASTO DE VENTAS': 'gastoDeVentas' }
function buscarCuenta(lista, concepto) {
  const f = (lista || []).find((c) => c.Concepto === concepto)
  if (!f) throw new Error(`No existe la cuenta "${concepto}" en Configuración → Causaciones.`)
  if (!f.CuentaDebito) throw new Error(`La cuenta "${concepto}" no tiene Cuenta débito en Configuración → Causaciones.`)
  return f
}
function buscarParametro(cfg, nombre) {
  const p = (cfg.parametros || []).find((x) => x.Parametro === nombre)
  if (!p) throw new Error(`Falta el parámetro "${nombre}" en Configuración → Causaciones.`)
  return p
}
function paramNum(cfg, nombre) {
  const v = buscarParametro(cfg, nombre).Valor, n = Number(v)
  if (v === '' || v === null || v === undefined || isNaN(n)) throw new Error(`El parámetro "${nombre}" no tiene un valor numérico válido.`)
  return n
}
const paramTxt = (cfg, nombre) => String(buscarParametro(cfg, nombre).Valor || '').trim()
function centrosDelArea(cfg, area) {
  const a = (cfg.areas || []).find((x) => x.Area === area)
  if (!a) throw new Error(`El área "${area || '(sin área)'}" no existe en Configuración → Causaciones.`)
  return { tipo: a.Tipo, centros: a.CentrosCosto && a.CentrosCosto.length ? a.CentrosCosto : [''] }
}
function repartir(monto, centros) {
  if (!centros || centros.length <= 1) return [{ centro: (centros && centros[0]) || '', monto }]
  const base = Math.round(monto / centros.length)
  const partes = centros.map(() => base)
  partes[partes.length - 1] = monto - base * (centros.length - 1)
  return centros.map((c, i) => ({ centro: c, monto: partes[i] }))
}
function movimiento(lineas, o) {
  const monto = Math.round(o.monto || 0)
  if (!monto) return
  const rep = o.centros ? repartir(monto, o.centros) : [{ centro: '', monto }]
  rep.forEach((p) => {
    if (!p.monto) return
    lineas.push({ Cuenta: o.cuentaDebito, Descripcion: o.descripcion, CentroCosto: p.centro, Nit: o.nitDebito || '', Nombre: o.nombreDebito || '', Debito: p.monto, Credito: 0, Concepto: o.concepto })
  })
  lineas.push({ Cuenta: o.cuentaCredito, Descripcion: o.descripcion, CentroCosto: o.centroCredito || '', Nit: o.nitCredito || '', Nombre: o.nombreCredito || '', Debito: 0, Credito: monto, Concepto: o.concepto })
}
function splitDiasIncapacidad(iniReg, finReg, iniClip, finClip, tipo) {
  let ordinal = 0, diasEmpresa = 0, diasCobrar = 0
  for (let d = iniReg; d <= finReg; d = fechaISOMasDias(d, 1)) {
    ordinal++
    if (d >= iniClip && d <= finClip) {
      if (tipo === 'Accidente de trabajo') diasCobrar++
      else if (ordinal <= 2) diasEmpresa++
      else diasCobrar++
    }
  }
  return { diasEmpresa, diasCobrar }
}
export function splitIncapacidadEmpleadoQuincena(idEmp, qIni, qFin, ausentismos) {
  let e = 0, c = 0
  ausentismos.forEach((a) => {
    if (a.empleado_id !== idEmp || a.estado !== 'Activo') return
    if (a.tipo !== 'Incapacidad' && a.tipo !== 'Accidente de trabajo') return
    if (!a.fecha_inicio || !a.fecha_fin || a.fecha_fin < qIni || a.fecha_inicio > qFin) return
    const s = splitDiasIncapacidad(a.fecha_inicio, a.fecha_fin, a.fecha_inicio > qIni ? a.fecha_inicio : qIni, a.fecha_fin < qFin ? a.fecha_fin : qFin, a.tipo)
    e += s.diasEmpresa; c += s.diasCobrar
  })
  return { diasEmpresa: e, diasCobrar: c }
}

// nb = fila de nomina_quincenal (base de datos)
export function lineasCausacionNormal(emp, nb, cfg, splitIncap, quincena) {
  const lineas = []
  const areaInfo = centrosDelArea(cfg, emp.Area)
  const clave = CAUS_TIPO_A_CLAVE[areaInfo.tipo]
  if (!clave) throw new Error(`El área "${emp.Area}" tiene un Tipo inválido ("${areaInfo.tipo}") en Configuración → Causaciones.`)
  const cuentas = cfg.cuentas[clave]
  const basico = Number(nb.basico) || 0, aux = Number(nb.aux_transporte) || 0, subsidio = Number(nb.subsidio_incapacidad) || 0
  const base = basico + subsidio
  const nombreEmp = emp.Nombre, nitEmp = emp.Cedula
  const desc = emp.Nombre + ' — ' + quincena
  const comun = { centros: areaInfo.centros, nombreDebito: nombreEmp, nitCredito: nitEmp, nombreCredito: nombreEmp }
  const cS = buscarCuenta(cuentas, 'SUELDOS')
  movimiento(lineas, { ...comun, cuentaDebito: cS.CuentaDebito, cuentaCredito: cS.CuentaCredito, monto: basico, descripcion: 'Sueldos — ' + desc, concepto: 'SUELDOS' })
  if (aux) {
    const cA = buscarCuenta(cuentas, 'AUXILIO DE TRANSPORTE')
    movimiento(lineas, { ...comun, cuentaDebito: cA.CuentaDebito, cuentaCredito: cA.CuentaCredito, monto: aux, descripcion: 'Auxilio de transporte — ' + desc, concepto: 'AUXILIO DE TRANSPORTE' })
  }
  if (subsidio) {
    const cI = buscarCuenta(cuentas, 'INCAPACIDAD')
    const totalSplit = splitIncap.diasEmpresa + splitIncap.diasCobrar
    const cxc = paramTxt(cfg, 'Cuenta por cobrar a EPS/ARL (incapacidad 3+ días / accidente de trabajo)')
    let cobrar = 0, empresa = subsidio
    if (totalSplit > 0 && cxc) { cobrar = Math.round(subsidio * (splitIncap.diasCobrar / totalSplit)); empresa = subsidio - cobrar }
    if (empresa) movimiento(lineas, { ...comun, cuentaDebito: cI.CuentaDebito, cuentaCredito: cI.CuentaCredito, monto: empresa, descripcion: 'Incapacidad (a cargo de la empresa) — ' + desc, concepto: 'INCAPACIDAD' })
    if (cobrar) movimiento(lineas, { cuentaDebito: cxc, cuentaCredito: cI.CuentaCredito, monto: cobrar, descripcion: 'Incapacidad (cuenta por cobrar EPS/ARL) — ' + desc, concepto: 'INCAPACIDAD (CXC EPS/ARL)', centros: null, nitDebito: nitEmp, nombreDebito: nombreEmp, nitCredito: nitEmp, nombreCredito: nombreEmp })
  }
  if (base) {
    const ces = Math.round(base * paramNum(cfg, '% Cesantías'))
    const cC = buscarCuenta(cuentas, 'CESANTÍAS')
    movimiento(lineas, { ...comun, cuentaDebito: cC.CuentaDebito, cuentaCredito: cC.CuentaCredito, monto: ces, descripcion: 'Provisión cesantías — ' + desc, concepto: 'CESANTÍAS' })
    const cIn = buscarCuenta(cuentas, 'INTERÉS DE CESANTÍAS')
    movimiento(lineas, { ...comun, cuentaDebito: cIn.CuentaDebito, cuentaCredito: cIn.CuentaCredito, monto: Math.round(ces * paramNum(cfg, '% Interés de cesantías')), descripcion: 'Provisión interés de cesantías — ' + desc, concepto: 'INTERÉS DE CESANTÍAS' })
    const cP = buscarCuenta(cuentas, 'PRIMA DE SERVICIOS')
    movimiento(lineas, { ...comun, cuentaDebito: cP.CuentaDebito, cuentaCredito: cP.CuentaCredito, monto: Math.round(base * paramNum(cfg, '% Prima de servicios')), descripcion: 'Provisión prima de servicios — ' + desc, concepto: 'PRIMA DE SERVICIOS' })
    const cV = buscarCuenta(cuentas, 'VACACIONES')
    movimiento(lineas, { ...comun, cuentaDebito: cV.CuentaDebito, cuentaCredito: cV.CuentaCredito, monto: Math.round(base * paramNum(cfg, '% Vacaciones (provisión contable)')), descripcion: 'Provisión vacaciones — ' + desc, concepto: 'VACACIONES' })
    const cArl = buscarCuenta(cuentas, 'APORTE ADMINISTRADORA DE RIESGOS (ARL)')
    const nivel = (cfg.nivelesRiesgoARL || []).find((n) => n.Nivel === emp.NivelRiesgo)
    if (!nivel) throw new Error(`Tiene un Nivel de riesgo ARL ("${emp.NivelRiesgo}") que no existe en Configuración → Causaciones.`)
    const entArl = (cfg.entidadesARL || []).find((e) => e.Nombre === emp.ARL)
    movimiento(lineas, { centros: areaInfo.centros, nombreDebito: nombreEmp, cuentaDebito: cArl.CuentaDebito, cuentaCredito: paramTxt(cfg, 'Cuenta ARL'), monto: Math.round(base * (Number(nivel.Tarifa) || 0)), descripcion: 'Aporte ARL — ' + desc, concepto: 'APORTE ARL', nitCredito: entArl ? entArl.NIT : '', nombreCredito: emp.ARL || '' })
    if (emp.Pension !== 'Jubilado') {
      const cPe = buscarCuenta(cuentas, 'APORTE A FONDO DE PENSIÓN (empresa)')
      const entP = (cfg.entidadesPension || []).find((e) => e.Nombre === emp.Pension)
      movimiento(lineas, { centros: areaInfo.centros, nombreDebito: nombreEmp, cuentaDebito: cPe.CuentaDebito, cuentaCredito: paramTxt(cfg, 'Cuenta Fondos de Pensión (empresa y retención empleado)'), monto: Math.round(base * paramNum(cfg, '% Aporte a pensión — empresa')), descripcion: 'Aporte a pensión (empresa) — ' + desc, concepto: 'APORTE PENSIÓN (EMPRESA)', nitCredito: entP ? entP.NIT : '', nombreCredito: emp.Pension || '' })
    }
    const cCa = buscarCuenta(cuentas, 'APORTE A CAJA DE COMPENSACIÓN')
    const entC = (cfg.entidadesCaja || []).find((e) => e.Nombre === emp.CajaCompensacion)
    movimiento(lineas, { centros: areaInfo.centros, nombreDebito: nombreEmp, cuentaDebito: cCa.CuentaDebito, cuentaCredito: paramTxt(cfg, 'Cuenta Caja de Compensación Familiar'), monto: Math.round(base * paramNum(cfg, '% Aporte a caja de compensación — empresa')), descripcion: 'Aporte a caja de compensación — ' + desc, concepto: 'APORTE CAJA COMPENSACIÓN', nitCredito: entC ? entC.NIT : '', nombreCredito: emp.CajaCompensacion || '' })
  }
  return lineas
}
export function lineasCausacionTemporal(emp, nb, cfg, quincena) {
  const lineas = []
  const total = Number(nb.devengado) || 0
  if (!total) return lineas
  const ct = cfg.causacionTemporal
  const desc = emp.Nombre + ' — ' + quincena
  const o = { nombreDebito: emp.Nombre, nitCredito: emp.Cedula, nombreCredito: emp.Nombre }
  const c1 = buscarCuenta(ct, 'NÓMINA TEMPORALES')
  movimiento(lineas, { ...o, cuentaDebito: c1.CuentaDebito, cuentaCredito: c1.CuentaCredito, monto: total, descripcion: 'Nómina temporal — ' + desc, concepto: 'NÓMINA TEMPORALES' })
  const ces = Math.round(total * paramNum(cfg, '% Cesantías'))
  const c2 = buscarCuenta(ct, 'CESANTÍAS TEMPORALES')
  movimiento(lineas, { ...o, cuentaDebito: c2.CuentaDebito, cuentaCredito: c2.CuentaCredito, monto: ces, descripcion: 'Provisión cesantías (temporal) — ' + desc, concepto: 'CESANTÍAS TEMPORALES' })
  const c3 = buscarCuenta(ct, 'INTERESES CESANTÍAS TEMPORALES')
  movimiento(lineas, { ...o, cuentaDebito: c3.CuentaDebito, cuentaCredito: c3.CuentaCredito, monto: Math.round(ces * paramNum(cfg, '% Interés de cesantías')), descripcion: 'Provisión interés de cesantías (temporal) — ' + desc, concepto: 'INTERESES CESANTÍAS TEMPORALES' })
  const c4 = buscarCuenta(ct, 'PRIMA DE SERVICIOS TEMPORALES')
  movimiento(lineas, { ...o, cuentaDebito: c4.CuentaDebito, cuentaCredito: c4.CuentaCredito, monto: Math.round(total * paramNum(cfg, '% Prima de servicios')), descripcion: 'Provisión prima de servicios (temporal) — ' + desc, concepto: 'PRIMA DE SERVICIOS TEMPORALES' })
  const c5 = buscarCuenta(ct, 'VACACIONES TEMPORALES')
  movimiento(lineas, { ...o, cuentaDebito: c5.CuentaDebito, cuentaCredito: c5.CuentaCredito, monto: Math.round(total * paramNum(cfg, '% Vacaciones (provisión contable)')), descripcion: 'Provisión vacaciones (temporal) — ' + desc, concepto: 'VACACIONES TEMPORALES' })
  return lineas
}
export function generarCausacionQuincena(quincena, filasNomina, empleadosPorId, ausentismos, cfgCaus) {
  const q = parsearQuincena(quincena)
  if (!q) throw new Error(`No se pudo interpretar la quincena "${quincena}".`)
  if (!filasNomina.length) throw new Error(`No hay nómina guardada para "${quincena}". Guárdala primero en Nómina quincenal.`)
  let todas = []
  const advertencias = []
  filasNomina.forEach((nb) => {
    const emp = empleadosPorId[nb.empleado_id]
    if (!emp) { advertencias.push(`Empleado ${nb.empleado_id} ya no existe en Empleados — se omitió.`); return }
    const norm = String(emp.Empresa || '').trim().toUpperCase()
    const temporal = norm ? (cfgCaus.temporales || []).find((t) => String(t.Nombre || '').trim().toUpperCase() === norm) : null
    let ls
    try {
      ls = temporal ? lineasCausacionTemporal(emp, nb, cfgCaus, quincena)
        : lineasCausacionNormal(emp, nb, cfgCaus, splitIncapacidadEmpleadoQuincena(nb.empleado_id, q.inicio, q.fin, ausentismos), quincena)
    } catch (err) { throw new Error(`Empleado ${emp.Nombre} (${nb.empleado_id}): ${err.message}`) }
    ls.forEach((l) => { l.ID_Empleado = nb.empleado_id; l.TipoCausacion = temporal ? 'Temporal' : 'MQI' })
    todas = todas.concat(ls)
  })
  let deb = 0, cre = 0
  todas.forEach((l) => { deb += l.Debito || 0; cre += l.Credito || 0 })
  if (Math.round(Math.abs(deb - cre)) > Math.max(1, todas.length)) throw new Error(`La causación no cuadra: Débitos ${deb} vs. Créditos ${cre}.`)
  return { lineas: todas, totalDebito: deb, totalCredito: cre, advertencias }
}

// ---------------------------------------------------------------------
// ARCHIVO BANCOLOMBIA (datos; el archivo se arma en exportar.js)
// ---------------------------------------------------------------------
export function fechaAplicacionHoy(hoyISO) {
  const [y, m, d] = hoyISO.split('-')
  return Number(y + d + m)
}

const bancoCodigo = (nombre) => (BANCOS_ACH.find((b) => b.nombre === nombre) || {}).codigo
function encabezadoBanco(cfg, descripcion) {
  return {
    NitPagador: String(cfg.nitPagador || ''), TipoPago: Number(cfg.tipoPagoBanco) || 225, Aplicacion: cfg.aplicacionPagoBanco || 'M',
    SecuenciaEnvio: cfg.secuenciaEnvioBanco || 'A1', CuentaADebitar: String(cfg.cuentaADebitar || ''), TipoCuentaADebitar: cfg.tipoCuentaADebitar || 'D',
    DescripcionPago: descripcion.substring(0, 21),
  }
}
function filaBanco(emp, valor, referencia, cfg, fechaAplicacion, excluidos) {
  const codigo = bancoCodigo(emp.Banco)
  if (!codigo) { excluidos.push(`${emp.Nombre} — banco "${emp.Banco || '(vacío)'}" sin código válido`); return null }
  if (!emp.Cuenta) { excluidos.push(`${emp.Nombre} — no tiene número de cuenta registrado`); return null }
  if (!emp.Cedula) { excluidos.push(`${emp.Nombre} — no tiene cédula registrada`); return null }
  return { TipoDocumento: TIPO_DOC_BANCO[emp.TipoDocumentoBanco] || 1, NitBeneficiario: String(emp.Cedula), NombreBeneficiario: emp.Nombre,
    TipoTransaccion: Number(cfg.tipoTransaccionACH) || 37, CodigoBanco: codigo, NoCuentaBeneficiario: String(emp.Cuenta),
    Referencia: referencia, ValorTransaccion: valor, FechaAplicacion: fechaAplicacion }
}

// Pago de nómina quincenal (neto guardado de cada persona)
export function datosBancolombiaNomina(quincena, filasNomina, empleadosPorId, cfg, hoyISO) {
  const info = parsearQuincena(quincena)
  if (!info) throw new Error(`No se pudo interpretar la quincena "${quincena}".`)
  if (!filasNomina.length) throw new Error('No hay datos guardados para esa quincena. Guárdala primero en Nómina quincenal.')
  const referencia = ('NOMINA ' + info.diaInicio + 'a' + info.diaFin + ' ' + info.mes.abrev).substring(0, 21)
  const fecha = fechaAplicacionHoy(hoyISO)
  const filas = [], excluidos = []
  filasNomina.forEach((r) => {
    const neto = Number(r.neto) || 0
    const emp = empleadosPorId[r.empleado_id]
    if (!emp) { excluidos.push(r.empleado_id + ' — no se encontró en Empleados'); return }
    if (emp.Estado === 'Inactivo' && (!emp.FechaRetiro || emp.FechaRetiro < info.inicio)) {
      excluidos.push(`${emp.Nombre} — está INACTIVO y su retiro (${emp.FechaRetiro || 'sin fecha'}) es anterior a esta quincena`); return
    }
    if (neto <= 0) return
    const f = filaBanco(emp, neto, referencia, cfg, fecha, excluidos)
    if (f) filas.push(f)
  })
  return { encabezado: encabezadoBanco(cfg, 'NOMINA' + info.diaFin + info.mes.abrev), filas, excluidos, quincena }
}

// Pago de horas extra de una semana (neto después de descontar descansos nocturnos / llegadas tarde)
export function datosBancolombiaHorasExtra(semana, filasHE, empleadosPorId, cadena, cfg, hoyISO) {
  const info = parsearSemana(semana)
  if (!info) throw new Error(`No se pudo interpretar la semana "${semana}".`)
  const totales = {}
  filasHE.forEach((r) => { totales[r.empleado_id] = (totales[r.empleado_id] || 0) + (Number(r.total) || 0) })
  if (!Object.keys(totales).length) throw new Error('No hay horas extra guardadas para esa semana. Guárdala primero.')
  const referencia = ('HE ' + info.diaInicio + 'a' + info.diaFin + ' ' + info.mesFin.abrev).substring(0, 21)
  const fecha = fechaAplicacionHoy(hoyISO)
  const inicio = semanaInicioDeLabel(semana)
  const filas = [], excluidos = [], descuentos = []
  const money = (v) => '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  Object.keys(totales).forEach((id) => {
    let total = totales[id]
    const emp = empleadosPorId[id]
    const c = cadena.porEmpleado[id] && cadena.porEmpleado[id][inicio]
    if (c && emp && (c.AplicadoTotal > 0 || c.SaldoFinal > 0)) {
      descuentos.push(`${emp.Nombre}: se descontaron ${c.AplicadoTotal} h de extras por tiempo a devolver (descanso nocturno / llegadas tarde) (${textoAplicado(c.Aplicado)}) → extras ${money(c.Bruto)} → se paga ${money(c.Neto)}`
        + (c.SaldoFinal > 0 ? ` · saldo pendiente: ${c.SaldoFinal} h (se descontará de las próximas extras)` : ''))
    }
    if (c) total = c.Neto
    if (!emp) { excluidos.push(id + ' — no se encontró en Empleados'); return }
    if (emp.Estado === 'Inactivo') { excluidos.push(`${emp.Nombre} — está INACTIVO actualmente, no se incluye`); return }
    if (total <= 0) return
    const f = filaBanco(emp, Math.round(total), referencia, cfg, fecha, excluidos)
    if (f) filas.push(f)
  })
  return { encabezado: encabezadoBanco(cfg, 'HE' + info.diaFin + info.mesFin.abrev), filas, excluidos, descuentos, semana }
}
