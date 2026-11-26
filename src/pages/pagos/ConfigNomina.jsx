import { useCallback, useEffect, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { Aviso, Cargando } from '../../ui.jsx'
import { cargarConfig, fechaCorta } from '../../nomina/datos.js'
import * as M from '../../nomina/motor.js'

const PARAMS = [
  ['Normativa legal', [['smlv', 'SMLV (salario mínimo mensual)', 'n'], ['auxTransporte', 'Auxilio de transporte', 'n'], ['auxConectividad', 'Auxilio de conectividad digital', 'n'],
    ['topeAuxTransporteSMLV', 'Tope aux. transporte (en # SMLV)', 'n'], ['jornadaSemanal', 'Jornada semanal (horas)', 'n'], ['divisorMensual', 'Divisor mensual de horas', 'n'],
    ['pctRecargoNocturno', '% Recargo nocturno (0,35 = 35 %)', 'n'], ['pctRecargoDomFest', '% Recargo dominical/festivo', 'n'], ['pctHED', '% Hora extra diurna', 'n'], ['pctHEN', '% Hora extra nocturna', 'n'],
    ['umbralDomingosHabituales', 'Umbral domingos habituales (mes)', 'n'], ['topeHorasExtraDiarias', 'Tope horas extra diarias', 'n'], ['topeHorasExtraSemanales', 'Tope horas extra semanales (referencia)', 'n']]],
  ['Horas extra y jornada', [['horasJornadaLJ', 'Horas de jornada lunes a jueves', 'n'], ['horasJornadaViernes', 'Horas de jornada viernes', 'n'], ['toleranciaHoraExtraMin', 'Tolerancia antes de contar hora extra (min)', 'n'],
    ['inicioJornadaNormal', 'Inicio de jornada normal (HH:MM)', 'h'], ['finJornadaLJ', 'Fin de jornada lunes a jueves', 'h'], ['finJornadaViernes', 'Fin de jornada viernes', 'h'],
    ['inicioJornadaNocturna', 'Inicio de jornada nocturna', 'h'], ['finJornadaNocturna', 'Fin de jornada nocturna', 'h'], ['tiempoAlmuerzo', 'Tiempo de almuerzo diario (horas)', 'n']]],
  ['Incapacidad', [['pctIncapacidad', '% Subsidio por incapacidad (0,667 = 66,7 %)', 'n'], ['aplicarPisoIncapacidad', '¿Aplicar piso de SMLV proporcional?', ['Sí', 'No']]]],
  ['Archivo Bancolombia', [['nitPagador', 'NIT pagador (empresa)', 't'], ['cuentaADebitar', 'Cuenta a debitar (empresa)', 't'], ['tipoCuentaADebitar', 'Tipo de cuenta a debitar', ['S', 'D']],
    ['tipoPagoBanco', 'Tipo de pago (código)', 'n'], ['aplicacionPagoBanco', 'Aplicación (código)', 't'], ['tipoTransaccionACH', 'Tipo de transacción ACH', 'n'], ['secuenciaEnvioBanco', 'Secuencia de envío', 't']]],
  ['Notificaciones', [['correoCumpleanos', 'Correo para aviso de cumpleaños', 't']]],
]
// Factores sobre el valor hora (se recalculan solos, igual que en la hoja)
export const factoresDe = (p) => ({
  HED: 1 + Number(p.pctHED), HEN: 1 + Number(p.pctHEN), RN: Number(p.pctRecargoNocturno), HDF: 1 + Number(p.pctRecargoDomFest),
  HNDF: 1 + Number(p.pctRecargoNocturno) + Number(p.pctRecargoDomFest), HEDF: 1 + Number(p.pctHED) + Number(p.pctRecargoDomFest), HENF: 1 + Number(p.pctHEN) + Number(p.pctRecargoDomFest),
})
const redF = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10000) / 10000]))

export default function ConfigNomina() {
  const [c, setC] = useState(null)
  const [p, setP] = useState(null)
  const [fest, setFest] = useState([])
  const [nuevoF, setNuevoF] = useState('')
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [tab, setTab] = useState('parametros')

  const cargar = useCallback(async () => { try { const x = await cargarConfig(); setC(x); setP(x.parametros); setFest(x.festivos) } catch (e) { setError(e.message) } }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setError(''); setOk('')
    try {
      PARAMS.forEach(([, ps]) => ps.forEach(([k, l, t]) => { if (t === 'h' && !M.esHoraValida(p[k])) throw new Error(`"${l}" debe ser una hora HH:MM.`); if (t === 'n' && (p[k] === '' || isNaN(Number(p[k])))) throw new Error(`"${l}" debe ser un número.`) }))
      const par = Object.fromEntries(Object.entries(p).map(([k, v]) => { const def = PARAMS.flatMap((x) => x[1]).find((x) => x[0] === k); return [k, def && def[2] === 'n' ? Number(v) : v] }))
      await q(sb.from('nomina_config').upsert([{ clave: 'parametros', valor: par, actualizado: new Date().toISOString() }, { clave: 'factores', valor: redF(factoresDe(par)), actualizado: new Date().toISOString() },
        { clave: 'festivos', valor: [...new Set(fest)].sort(), actualizado: new Date().toISOString() }]))
      setOk('Parámetros guardados. Los cálculos nuevos ya los usan; lo guardado antes no cambia.'); cargar()
    } catch (e) { setError(e.message) }
  }

  if (!c) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const f = redF(factoresDe(p))
  return (
    <div className="pagos">
      <div className="titulo-pagina"><h1>Parámetros de nómina</h1></div>
      <div className="segmentado">{[['parametros', 'Parámetros legales y jornada'], ['festivos', 'Festivos'], ['causaciones', 'Causaciones contables']].map(([v, t]) => <button key={v} className={tab === v ? 'sel' : ''} onClick={() => setTab(v)}>{t}</button>)}</div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      {tab === 'parametros' && <>
        {PARAMS.map(([sec, ps]) => (
          <div key={sec} className="tarjeta form-pagos"><h3>{sec}</h3><div className="fila3">
            {ps.map(([k, l, t]) => <label key={k}>{l}{Array.isArray(t)
              ? <select value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: e.target.value })}>{t.map((o) => <option key={o}>{o}</option>)}</select>
              : <input value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: e.target.value })} />}</label>)}
          </div></div>
        ))}
        <div className="tarjeta"><h3>Factores sobre el valor hora (se calculan solos)</h3>
          <p>{Object.entries(f).map(([k, v]) => <span key={k} className="chip-factor"><b>{k}</b> {v}</span>)}</p>
          <p className="tenue">Valor hora = salario ÷ {p.divisorMensual}. RN es solo el recargo (la hora ya está pagada en el básico).</p></div>
        <div className="pagos-pie"><button className="btn btn-ok" onClick={guardar}>Guardar parámetros</button></div>
      </>}
      {tab === 'festivos' && <div className="tarjeta form-pagos">
        <h3>Festivos (recargos dominicales/festivos y días hábiles)</h3>
        <div className="barra-horas"><input type="date" value={nuevoF} onChange={(e) => setNuevoF(e.target.value)} /><button className="btn btn-sm" disabled={!nuevoF} onClick={() => { setFest([...new Set([...fest, nuevoF])].sort()); setNuevoF('') }}>Agregar</button></div>
        <div className="chips">{[...fest].sort().map((x) => <span key={x} className="chip-factor">{M.DIAS_SEMANA[M.diaSemana(x)].slice(0, 3)} {fechaCorta(x)} <button className="btn-link peligro" onClick={() => setFest(fest.filter((y) => y !== x))}>×</button></span>)}</div>
        <p className="tenue">Recuerda agregar los festivos de 2027 antes de enero.</p>
        <div className="pagos-pie"><button className="btn btn-ok" onClick={guardar}>Guardar festivos</button></div>
      </div>}
      {tab === 'causaciones' && <CausConfig valor={c.causaciones} onGuardado={cargar} />}
    </div>
  )
}

const TABLAS = [
  ['areas', 'Áreas y centros de costo', [['Area', 'Área'], ['CentrosCosto', 'Centro(s) de costo, separados por coma', 'lista'], ['Tipo', 'Tipo', ['COSTO', 'GASTO ADMINISTRATIVO', 'GASTO DE VENTAS']]]],
  ['cuentas.costo', 'Cuentas de provisión — COSTO', [['Concepto', 'Concepto'], ['CuentaDebito', 'Cuenta débito'], ['CuentaCredito', 'Cuenta crédito'], ['Notas', 'Notas']]],
  ['cuentas.gastoAdministrativo', 'Cuentas de provisión — GASTO ADMINISTRATIVO', [['Concepto', 'Concepto'], ['CuentaDebito', 'Cuenta débito'], ['CuentaCredito', 'Cuenta crédito'], ['Notas', 'Notas']]],
  ['cuentas.gastoDeVentas', 'Cuentas de provisión — GASTO DE VENTAS', [['Concepto', 'Concepto'], ['CuentaDebito', 'Cuenta débito'], ['CuentaCredito', 'Cuenta crédito'], ['Notas', 'Notas']]],
  ['parametros', 'Parámetros y cuentas fijas', [['Parametro', 'Parámetro', 'fijo'], ['Valor', 'Valor'], ['Descripcion', 'Descripción']]],
  ['entidadesPension', 'Fondos de pensión', [['Nombre', 'Nombre'], ['NIT', 'NIT']]],
  ['entidadesEPS', 'EPS', [['Nombre', 'Nombre'], ['NIT', 'NIT']]],
  ['entidadesARL', 'ARL', [['Nombre', 'Nombre'], ['NIT', 'NIT']]],
  ['nivelesRiesgoARL', 'Niveles de riesgo ARL (tarifa)', [['Nivel', 'Nivel'], ['Tarifa', 'Tarifa', 'num']]],
  ['entidadesCaja', 'Cajas de compensación', [['Nombre', 'Nombre'], ['NIT', 'NIT']]],
  ['temporales', 'Empresas temporales', [['Nombre', 'Nombre (igual al campo Empresa del empleado)'], ['NIT', 'NIT']]],
  ['causacionTemporal', 'Causación simplificada — empleados de temporales', [['Concepto', 'Concepto'], ['CuentaDebito', 'Cuenta débito'], ['CuentaCredito', 'Cuenta crédito']]],
]
const leer = (o, ruta) => ruta.split('.').reduce((a, k) => a?.[k], o) || []
const escribir = (o, ruta, v) => { const c = structuredClone(o); const ks = ruta.split('.'); let x = c; ks.slice(0, -1).forEach((k) => { x[k] = x[k] || {}; x = x[k] }); x[ks.at(-1)] = v; return c }

// Editor de la configuración contable (lo usan Configuración y la pestaña Causaciones)
export function CausConfig({ valor, onGuardado }) {
  const [v, setV] = useState(valor)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const guardar = async () => {
    setError(''); setOk('')
    try {
      await q(sb.from('nomina_config').upsert({ clave: 'causaciones', valor: v, actualizado: new Date().toISOString() }))
      setOk('Configuración de causaciones guardada.'); onGuardado?.()
    } catch (e) { setError(e.message) }
  }
  return (
    <div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      {TABLAS.map(([ruta, titulo, cols]) => {
        const filas = leer(v, ruta)
        const set = (i, k, x) => setV(escribir(v, ruta, filas.map((f, j) => (j === i ? { ...f, [k]: x } : f))))
        return (
          <details key={ruta} className="tarjeta form-pagos"><summary><b>{titulo}</b> <span className="tenue">({filas.length})</span></summary>
            <table className="tabla"><thead><tr>{cols.map(([, t]) => <th key={t}>{t}</th>)}<th></th></tr></thead>
              <tbody>{filas.map((f, i) => (
                <tr key={i}>{cols.map(([k, , tipo]) => (
                  <td key={k}>{tipo === 'fijo' ? f[k]
                    : Array.isArray(tipo) ? <select value={f[k] || ''} onChange={(e) => set(i, k, e.target.value)}>{tipo.map((o) => <option key={o}>{o}</option>)}</select>
                      : tipo === 'lista' ? <input value={(f[k] || []).join(', ')} onChange={(e) => set(i, k, e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
                        : <input value={f[k] ?? ''} onChange={(e) => set(i, k, tipo === 'num' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />}</td>
                ))}<td>{cols[0][2] !== 'fijo' && <button className="btn-link peligro" onClick={() => setV(escribir(v, ruta, filas.filter((_, j) => j !== i)))}>Quitar</button>}</td></tr>
              ))}</tbody></table>
            {cols[0][2] !== 'fijo' && <button className="btn btn-sec btn-sm" onClick={() => setV(escribir(v, ruta, [...filas, {}]))}>+ Agregar fila</button>}
          </details>
        )
      })}
      <div className="pagos-pie"><button className="btn btn-ok" onClick={guardar}>Guardar causaciones</button></div>
    </div>
  )
}
