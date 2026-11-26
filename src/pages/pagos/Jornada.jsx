import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { hoyCO, fechaCorta } from '../../nomina/datos.js'

const ESTADOS = ['Normal', 'Incapacitado', 'No asistió', 'Vacaciones']
const fmtLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Registro diario de entrada y salida (Litografía o Industrial)
export default function Jornada({ grupo, config, gestor }) {
  const { cfg, festivos } = config
  const industrial = grupo === 'industrial'
  const [fecha, setFecha] = useState(hoyCO())
  const [personas, setPersonas] = useState(null)
  const [filas, setFilas] = useState([])
  const [yaExiste, setYaExiste] = useState(false)
  const [abiertas, setAbiertas] = useState({})
  const [guardadas, setGuardadas] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [conAvance, setConAvance] = useState([])
  const [borrador, setBorrador] = useState(null) // fecha/hora del avance guardado sin terminar
  const [corrigiendo, setCorrigiendo] = useState(false) // un día ya guardado solo se consulta; Gerencia/Admin lo puede corregir
  const laboral = M.esDiaLaboralNormal(fecha, festivos)

  const cargar = useCallback(async () => {
    try {
      const desde = M.fechaISOMasDias(M.viernesDeSemana(hoyCO()), -7)
      const [ps, reg, fechas, borr, borrs] = await Promise.all([
        q(sb.rpc('empleados_jornada', { p_grupo: grupo })),
        q(sb.from('jornadas').select('*').eq('grupo', grupo).eq('fecha', fecha)),
        q(sb.from('jornadas').select('fecha').eq('grupo', grupo).gte('fecha', desde)),
        q(sb.from('jornadas_borrador').select('*').eq('grupo', grupo).eq('fecha', fecha).maybeSingle()),
        q(sb.from('jornadas_borrador').select('fecha').eq('grupo', grupo).gte('fecha', desde)),
      ])
      setConAvance(borrs.map((b) => b.fecha))
      const lista = [...ps].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
      // Quien ya tiene registro ese día aunque hoy no esté en la lista (p. ej. lo retiraron después) también aparece
      reg.forEach((r) => { if (!lista.some((p) => p.id === r.empleado_id)) lista.push({ id: r.empleado_id, nombre: r.nombre, area: r.area }) })
      const prev = Object.fromEntries(reg.map((r) => [r.empleado_id, r]))
      const lab = M.esDiaLaboralNormal(fecha, festivos)
      setPersonas(lista)
      setYaExiste(reg.length > 0)
      // Avance guardado sin terminar: se retoma donde quedó (solo si el día aún no se guardó)
      const avance = reg.length === 0 && borr ? Object.fromEntries((borr.filas || []).map((f) => [f.id, f])) : null
      setBorrador(avance ? borr.actualizado : null)
      setGuardadas([...new Set(fechas.map((f) => f.fecha))])
      setFilas(lista.map((p) => {
        if (avance && avance[p.id]) return { ...avance[p.id], nombre: p.nombre, area: p.area || '' }
        const r = prev[p.id]
        const estado = r ? r.estado || 'Normal' : 'Normal'
        const normal = estado === 'Normal'
        return {
          id: p.id, nombre: p.nombre, area: p.area || '', estado,
          entrada: r ? (normal ? M.normalizarHora(r.entrada || '') : '') : (lab ? cfg.inicioJornadaNormal || '07:00' : ''),
          salida: r && normal ? M.normalizarHora(r.salida || '') : '',
          observacion: r?.observacion || '',
          segEntrada: r && (normal || estado === M.ESTADO_DESCANSO_NOCTURNO) ? M.normalizarHora(r.seg_entrada || '') : '',
          segSalida: r && (normal || estado === M.ESTADO_DESCANSO_NOCTURNO) ? M.normalizarHora(r.seg_salida || '') : '',
          segSiguiente: !!(r && r.seg_fecha_salida && r.seg_fecha_salida > fecha),
        }
      }))
      setSucio(false); setError('')
    } catch (e) { setError(e.message) }
  }, [grupo, fecha, festivos, cfg])
  useEffect(() => { setPersonas(null); setOk(''); setCorrigiendo(false); cargar() }, [cargar])
  // Una sola tabla mientras quepa en la pantalla; si no cabe, se parte en dos columnas para no desplazarse
  const [altoVentana, setAltoVentana] = useState(() => window.innerHeight)
  useEffect(() => { const f = () => setAltoVentana(window.innerHeight); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  useEnVivo(() => { if (!sucio) cargar() }, ['jornadas', 'jornadas_borrador'])

  // Guarda lo digitado hasta ahora, sin validar; el día sigue pendiente hasta "Guardar día"
  const guardarAvance = async () => {
    setError(''); setOk('')
    try {
      setGuardando(true)
      const filasAv = filas.map(({ id, estado, entrada, salida, observacion, segEntrada, segSalida, segSiguiente }) => ({ id, estado, entrada, salida, observacion, segEntrada, segSalida, segSiguiente }))
      await q(sb.from('jornadas_borrador').upsert({ grupo, fecha, filas: filasAv, actualizado: new Date().toISOString() }))
      setOk('Avance guardado. El día sigue pendiente (aparece en las alertas) hasta que pulses "Guardar día".')
      setSucio(false); await cargar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const cambiar = (i, campo, v) => {
    setSucio(true); setOk('')
    setFilas((fs) => fs.map((f, j) => {
      if (j !== i) return f
      const n = { ...f, [campo]: v }
      if (campo === 'estado' && v !== 'Normal') { n.entrada = ''; n.salida = '' }
      if (campo === 'estado' && v === 'Normal' && !f.entrada && laboral) n.entrada = cfg.inicioJornadaNormal || '07:00'
      if (campo === 'estado' && v !== 'Normal' && v !== M.ESTADO_DESCANSO_NOCTURNO) { n.segEntrada = ''; n.segSalida = ''; n.segSiguiente = false }
      // Igual que la hoja: si la 2ª salida es menor que la 2ª entrada, se marca "Día siguiente" solo
      if ((campo === 'segEntrada' || campo === 'segSalida') && M.esHoraValida(n.segEntrada) && M.esHoraValida(n.segSalida))
        n.segSiguiente = M.textoAHoras(n.segSalida) <= M.textoAHoras(n.segEntrada)
      return n
    }))
  }

  // Días laborales de esta semana (hasta ayer) y de la anterior sin registro guardado
  const faltantes = useMemo(() => calcularFaltantes(guardadas, festivos), [guardadas, festivos])

  const guardar = async () => {
    setError(''); setOk('')
    if (yaExiste && !corrigiendo) { setError('Este día ya está guardado y solo se puede consultar.'); return }
    try {
      // Mismas validaciones de la hoja
      filas.forEach((f) => {
        const desc = f.estado === M.ESTADO_DESCANSO_NOCTURNO
        if (f.estado !== 'Normal' && !desc) return
        if (industrial && (f.segEntrada || f.segSalida)) {
          if (!M.esHoraValida(f.segEntrada) || !M.esHoraValida(f.segSalida)) throw new Error(`Falta o está mal escrita la hora de entrada/salida de la SEGUNDA jornada de ${f.nombre}. Usa el formato HH:MM (ej. 20:00).`)
          if (M.calcularHorasSegunda(f.segEntrada, f.segSalida, f.segSiguiente) === null) throw new Error(`La segunda jornada de ${f.nombre} no es válida: la salida debe ser posterior a la entrada (si termina al día siguiente, marca "Día siguiente") y no puede durar más de 16 horas.`)
          if (M.segundaSeCruzaConPrimera({ HoraEntrada: f.entrada, HoraSalida: f.salida, SegHoraEntrada: f.segEntrada, SegHoraSalida: f.segSalida, SegDiaSiguiente: f.segSiguiente }))
            throw new Error(`La SEGUNDA jornada de ${f.nombre} se cruza con su primera jornada y esas horas se contarían dos veces. Si trabajó de corrido, registra la primera hasta una hora y la segunda desde esa misma hora.`)
        }
        if (desc) return
        if (!laboral && !f.entrada && !f.salida) return
        if (!M.esHoraValida(f.entrada) || !M.esHoraValida(f.salida)) throw new Error(`Falta o está mal escrita la hora de entrada/salida de ${f.nombre}. Usa el formato HH:MM (ej. 16:00).`)
        if (M.textoAHoras(f.salida) <= M.textoAHoras(f.entrada)) throw new Error(`La hora de salida de ${f.nombre} debe ser posterior a la de entrada.`)
      })
      const filasBD = filas.map((f) => {
        const estado = f.estado || 'Normal'
        const nada = !f.entrada && !f.salida
        const tieneSeg = industrial && (estado === 'Normal' || estado === M.ESTADO_DESCANSO_NOCTURNO) && !!(f.segEntrada || f.segSalida)
        if (!laboral && estado === 'Normal' && nada && !tieneSeg) return null
        const entrada = estado === 'Normal' ? M.normalizarHora(f.entrada || '') : ''
        const salida = estado === 'Normal' ? M.normalizarHora(f.salida || '') : ''
        const horas = estado === 'Normal' && !nada ? M.calcularHorasLaboradas(entrada, salida, cfg, laboral) : 0
        const r = { grupo, fecha, empleado_id: f.id, nombre: f.nombre, area: f.area || null, entrada: entrada || null, salida: salida || null,
          horas: horas ?? 0, observacion: f.observacion || null, estado, seg_entrada: null, seg_fecha_salida: null, seg_salida: null, seg_horas: 0 }
        if (tieneSeg) {
          r.seg_entrada = M.normalizarHora(f.segEntrada); r.seg_salida = M.normalizarHora(f.segSalida)
          r.seg_fecha_salida = f.segSiguiente ? M.fechaISOMasDias(fecha, 1) : fecha
          r.seg_horas = M.calcularHorasSegunda(r.seg_entrada, r.seg_salida, f.segSiguiente) ?? 0
        }
        return r
      }).filter(Boolean)
      setGuardando(true)
      await q(sb.from('jornadas').delete().eq('grupo', grupo).eq('fecha', fecha).in('empleado_id', filas.map((f) => f.id)))
      if (filasBD.length) await q(sb.from('jornadas').insert(filasBD))
      await q(sb.from('jornadas_borrador').delete().eq('grupo', grupo).eq('fecha', fecha))
      setOk(`Día guardado: ${filasBD.length} registro(s).`)
      setSucio(false); setCorrigiendo(false)
      await cargar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const mover = (n) => setFecha(M.fechaISOMasDias(fecha, n))
  const bloq = yaExiste && !corrigiendo
  const total = filas.reduce((a, f) => a + (f.estado === 'Normal' ? M.calcularHorasLaboradas(f.entrada, f.salida, cfg, laboral) || 0 : 0), 0)

  return (
    <div>
      <div className="barra-horas">
        <button className="btn btn-sec btn-sm" onClick={() => mover(-1)}>‹ Día anterior</button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn btn-sec btn-sm" onClick={() => mover(1)}>Día siguiente ›</button>
        <button className="btn-link" onClick={() => setFecha(hoyCO())}>Hoy</button>
        <span className="pagos-dia">{fmtLarga(fecha)} {laboral ? <Badge tone="info">Día laboral</Badge> : <Badge tone="warn">{festivos.includes(fecha) ? 'Festivo' : M.diaSemana(fecha) === 0 ? 'Domingo' : 'Sábado'}</Badge>}
          {yaExiste && <Badge tone="ok">Ya registrado</Badge>}</span>
        {personas && <span className="empuja pagos-total" title={'Hora en formato 24 h (HH:MM). ' + (laboral ? `Se descuentan ${cfg.tiempoAlmuerzo} h de almuerzo.` : 'Día no laboral: quien no digite nada no trabajó y no se guarda.') + (industrial ? ' Segunda jornada (+): toda es tiempo extra; si termina después de medianoche marca la casilla.' : '')}>Total: <b>{Math.round(total * 100) / 100} h</b> <span className="ayuda-q">?</span></span>}
        {personas && bloq && gestor && <button className="btn btn-sec btn-sm" onClick={() => setCorrigiendo(true)} title="Solo Gerencia/Administrador puede corregir un día ya guardado">Corregir día</button>}
 {personas && !bloq && !corrigiendo && <button className="btn btn-sec btn-sm" disabled={guardando} onClick={guardarAvance} title="Guarda lo que llevas sin terminar; el día sigue pendiente hasta que pulses Guardar día">Guardar avance</button>}
        {personas && !bloq && <button className="btn btn-ok btn-sm" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : corrigiendo ? 'Guardar corrección' : 'Guardar día'}</button>}
      </div>
      <AlertasFaltantes f={faltantes} onDia={setFecha} conAvance={conAvance} />
      {borrador && !yaExiste && <div className="aviso-avance">📝 Avance guardado el {new Date(borrador).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — el día está <b>incompleto</b> y sigue pendiente hasta que pulses "Guardar día".</div>}
      {bloq && <div className="aviso-consulta">📋 Este día ya tiene un registro guardado. Se muestra solo para consulta{gestor ? ' — para cambiarlo usa "Corregir día".' : ' — no se puede modificar desde aquí.'}</div>}
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {!personas ? <Cargando /> : (
        <>
          {(() => { const dos = filas.length > Math.max(8, Math.floor((altoVentana - 250) / 33)); return (
          <fieldset disabled={bloq} className={'jornada-paneles sin-borde' + (dos ? ' dos' : '')}>
            {(dos ? [filas.slice(0, Math.ceil(filas.length / 2)), filas.slice(Math.ceil(filas.length / 2))] : [filas]).map((grupoFilas, gi) => (
            <div className="tabla-cont" key={gi}>
            <table className="tabla tabla-pagos tabla-compacta tabla-jornada">
              <thead><tr>
                <th className="j-nombre">Nombre</th>{!dos && <th>Área</th>}<th className="j-estado">Estado</th><th className="j-hora">Entrada</th><th className="j-hora">Salida</th><th className="j-horas">Horas</th>
                {industrial && <th className="j-seg" title="Segunda jornada (toda es tiempo extra)">2ª jorn.</th>}
                <th>Observación</th>
              </tr></thead>
              <tbody>
                {grupoFilas.map((f) => {
                  const i = filas.indexOf(f)
                  const normal = f.estado === 'Normal'
                  const h = normal ? M.calcularHorasLaboradas(f.entrada, f.salida, cfg, laboral) : 0
                  const malE = normal && f.entrada && !M.esHoraValida(f.entrada), malS = normal && f.salida && !M.esHoraValida(f.salida)
                  const tarde = normal && laboral && fecha >= M.FECHA_INICIO_SALDO_TARDANZAS && M.esHoraValida(f.entrada)
                    ? Math.round((M.textoAHoras(f.entrada) - M.textoAHoras(cfg.inicioJornadaNormal)) * 60) : 0
                  const permiteSeg = normal || f.estado === M.ESTADO_DESCANSO_NOCTURNO
                  const hs = f.segEntrada || f.segSalida ? M.calcularHorasSegunda(f.segEntrada, f.segSalida, f.segSiguiente) : 0
                  const segAbierta = abiertas[f.id] || f.segEntrada || f.segSalida
                  return (
                    <tr key={f.id} className={!normal ? 'fila-tenue' : ''}>
                      <td className="j-nombre-td" title={`${f.nombre} · ${f.area}`}><b>{f.nombre}</b></td>{!dos && <td className="tenue">{f.area}</td>}
                      <td><select value={f.estado} onChange={(e) => cambiar(i, 'estado', e.target.value)}>
                        {[...ESTADOS, ...(industrial ? [M.ESTADO_DESCANSO_NOCTURNO] : [])].map((o) => <option key={o}>{o}</option>)}
                      </select></td>
                      <td><input className={'hora' + (malE ? ' mal' : '')} value={f.entrada} disabled={!normal} onChange={(e) => cambiar(i, 'entrada', e.target.value.trim())} /></td>
                      <td><input className={'hora' + (malS ? ' mal' : '')} value={f.salida} disabled={!normal} onChange={(e) => cambiar(i, 'salida', e.target.value.trim())} /></td>
                      <td className="num">{normal ? (h === null ? (f.salida ? <span className="mal-txt">Revisa</span> : '') : h) : '—'}{industrial && (hs === null ? <div className="mal-txt seg-h">2ª ?</div> : hs ? <div className="seg-h" title="Horas de la segunda jornada">+{hs}</div> : null)}{tarde > M.TOLERANCIA_LLEGADA_TARDE_MIN && <div className="tarde" title={`Llegó ${tarde} minutos tarde`}>{tarde}′ tarde</div>}</td>
                      {industrial && <td className="j-seg-td">{!segAbierta
                        ? <button className="btn-mini" disabled={!permiteSeg} title="Agregar segunda jornada" onClick={() => setAbiertas((x) => ({ ...x, [f.id]: true }))}>+</button>
                        : <span className="seg-campos">
                          <input className="hora" value={f.segEntrada} disabled={!permiteSeg} placeholder="—" onChange={(e) => cambiar(i, 'segEntrada', e.target.value.trim())} />
                          <input className="hora" value={f.segSalida} disabled={!permiteSeg} placeholder="—" onChange={(e) => cambiar(i, 'segSalida', e.target.value.trim())} />
                          <input type="checkbox" title="Termina al día siguiente (después de medianoche)" checked={f.segSiguiente} disabled={!permiteSeg} onChange={(e) => cambiar(i, 'segSiguiente', e.target.checked)} />
                        </span>}</td>}
                      <td><input className="obs" value={f.observacion} title={f.observacion} onChange={(e) => cambiar(i, 'observacion', e.target.value)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            ))}
          </fieldset>
          ) })()}
        </>
      )}
    </div>
  )
}

// Alertas de días laborales sin registro (igual que la hoja: esta semana hasta ayer y la semana anterior, viernes a jueves)
export function AlertasFaltantes({ f, onDia, soloAnterior, conAvance = [] }) {
  const corto = (d) => fechaCorta(d).slice(0, 5) + (conAvance.includes(d) ? ' (incompleto)' : '')
  return (
    <div className="faltantes">
      {!soloAnterior && (f.actual.length
        ? <span className="falt falt-mal">⚠ Esta semana faltan {f.actual.length}: {f.actual.map((d, i) => <span key={d}>{i ? ', ' : ''}<button className="dia-pend" onClick={() => onDia?.(d)}>{corto(d)}</button></span>)}</span>
        : <span className="falt falt-ok">✓ Todos los días laborales de esta semana están registrados</span>)}
      {f.previa.length
        ? <span className="falt falt-aviso">⚠ Semana anterior ({f.rango}) — faltan {f.previa.length} día(s) por registrar en Jornada: {f.previa.map((d, i) => <span key={d}>{i ? ', ' : ''}{onDia ? <button className="dia-pend" onClick={() => onDia(d)}>{corto(d)}</button> : corto(d)}</span>)}</span>
        : <span className="falt falt-ok">✓ Semana anterior ({f.rango}): todos los días laborales tienen registro de jornada</span>}
    </div>
  )
}

// Cálculo de días faltantes (mismo criterio de la hoja: lunes a viernes sin festivo)
export function calcularFaltantes(guardadas, festivos) {
  const hoy = hoyCO(), ini = M.viernesDeSemana(hoy)
  const entre = (a, b) => { const out = []; for (let d = a; d <= b; d = M.fechaISOMasDias(d, 1)) if (M.esDiaLaboralNormal(d, festivos) && !guardadas.includes(d)) out.push(d); return out }
  const iniPrev = M.fechaISOMasDias(ini, -7), finPrev = M.fechaISOMasDias(ini, -1)
  return { actual: entre(ini, M.fechaISOMasDias(hoy, -1)), previa: entre(iniPrev, finPrev), rango: `${fechaCorta(iniPrev).slice(0, 5)} al ${fechaCorta(finPrev).slice(0, 5)}` }
}
