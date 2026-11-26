import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { hoyCO, fechaCorta } from '../../nomina/datos.js'

const ESTADOS = ['Normal', 'Incapacitado', 'No asistió', 'Vacaciones']
const fmtLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Registro diario de entrada y salida (Litografía o Industrial)
export default function Jornada({ grupo, config }) {
  const { cfg, festivos } = config
  const industrial = grupo === 'industrial'
  const [fecha, setFecha] = useState(hoyCO())
  const [personas, setPersonas] = useState(null)
  const [filas, setFilas] = useState([])
  const [yaExiste, setYaExiste] = useState(false)
  const [guardadas, setGuardadas] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const laboral = M.esDiaLaboralNormal(fecha, festivos)

  const cargar = useCallback(async () => {
    try {
      const desde = M.fechaISOMasDias(M.viernesDeSemana(hoyCO()), -7)
      const [ps, reg, fechas] = await Promise.all([
        q(sb.rpc('empleados_jornada', { p_grupo: grupo })),
        q(sb.from('jornadas').select('*').eq('grupo', grupo).eq('fecha', fecha)),
        q(sb.from('jornadas').select('fecha').eq('grupo', grupo).gte('fecha', desde)),
      ])
      const lista = [...ps].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
      // Quien ya tiene registro ese día aunque hoy no esté en la lista (p. ej. lo retiraron después) también aparece
      reg.forEach((r) => { if (!lista.some((p) => p.id === r.empleado_id)) lista.push({ id: r.empleado_id, nombre: r.nombre, area: r.area }) })
      const prev = Object.fromEntries(reg.map((r) => [r.empleado_id, r]))
      const lab = M.esDiaLaboralNormal(fecha, festivos)
      setPersonas(lista)
      setYaExiste(reg.length > 0)
      setGuardadas([...new Set(fechas.map((f) => f.fecha))])
      setFilas(lista.map((p) => {
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
  useEffect(() => { setPersonas(null); setOk(''); cargar() }, [cargar])
  useEnVivo(() => { if (!sucio) cargar() }, ['jornadas'])

  const cambiar = (i, campo, v) => {
    setSucio(true); setOk('')
    setFilas((fs) => fs.map((f, j) => {
      if (j !== i) return f
      const n = { ...f, [campo]: v }
      if (campo === 'estado' && v !== 'Normal') { n.entrada = ''; n.salida = '' }
      if (campo === 'estado' && v === 'Normal' && !f.entrada && laboral) n.entrada = cfg.inicioJornadaNormal || '07:00'
      if (campo === 'estado' && v !== 'Normal' && v !== M.ESTADO_DESCANSO_NOCTURNO) { n.segEntrada = ''; n.segSalida = ''; n.segSiguiente = false }
      return n
    }))
  }

  // Días laborales de esta semana (hasta ayer) y de la anterior sin registro guardado
  const faltantes = useMemo(() => {
    const hoy = hoyCO(), ini = M.viernesDeSemana(hoy)
    const entre = (a, b) => { const out = []; for (let d = a; d <= b; d = M.fechaISOMasDias(d, 1)) if (M.esDiaLaboralNormal(d, festivos) && !guardadas.includes(d)) out.push(d); return out }
    return { actual: entre(ini, M.fechaISOMasDias(hoy, -1)), previa: entre(M.fechaISOMasDias(ini, -7), M.fechaISOMasDias(ini, -1)) }
  }, [guardadas, festivos])

  const guardar = async () => {
    setError(''); setOk('')
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
      setOk(`Día guardado: ${filasBD.length} registro(s).`)
      setSucio(false)
      await cargar()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  const mover = (n) => setFecha(M.fechaISOMasDias(fecha, n))
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
      </div>
      {(faltantes.actual.length > 0 || faltantes.previa.length > 0) && (
        <Aviso tipo="warn">
          {faltantes.previa.length > 0 && <div><b>Semana anterior sin registrar:</b> {faltantes.previa.map((d) => <button key={d} className="btn-link" onClick={() => setFecha(d)}>{fechaCorta(d)}</button>)}</div>}
          {faltantes.actual.length > 0 && <div><b>Esta semana sin registrar:</b> {faltantes.actual.map((d) => <button key={d} className="btn-link" onClick={() => setFecha(d)}>{fechaCorta(d)}</button>)}</div>}
        </Aviso>
      )}
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {!personas ? <Cargando /> : (
        <>
          <div className="tabla-cont">
            <table className="tabla tabla-pagos">
              <thead><tr>
                <th>Nombre</th><th>Área</th><th>Estado</th><th>Entrada</th><th>Salida</th><th>Horas</th>
                {industrial && <><th>2ª entrada</th><th>2ª salida</th><th>Día sig.</th><th>2ª horas</th></>}
                <th>Observación</th>
              </tr></thead>
              <tbody>
                {filas.map((f, i) => {
                  const normal = f.estado === 'Normal'
                  const h = normal ? M.calcularHorasLaboradas(f.entrada, f.salida, cfg, laboral) : 0
                  const malE = normal && f.entrada && !M.esHoraValida(f.entrada), malS = normal && f.salida && !M.esHoraValida(f.salida)
                  const tarde = normal && laboral && fecha >= M.FECHA_INICIO_SALDO_TARDANZAS && M.esHoraValida(f.entrada)
                    ? Math.round((M.textoAHoras(f.entrada) - M.textoAHoras(cfg.inicioJornadaNormal)) * 60) : 0
                  const permiteSeg = normal || f.estado === M.ESTADO_DESCANSO_NOCTURNO
                  const hs = f.segEntrada || f.segSalida ? M.calcularHorasSegunda(f.segEntrada, f.segSalida, f.segSiguiente) : 0
                  return (
                    <tr key={f.id} className={!normal ? 'fila-tenue' : ''}>
                      <td><b>{f.nombre}</b></td>
                      <td className="tenue">{f.area}</td>
                      <td><select value={f.estado} onChange={(e) => cambiar(i, 'estado', e.target.value)}>
                        {[...ESTADOS, ...(industrial ? [M.ESTADO_DESCANSO_NOCTURNO] : [])].map((o) => <option key={o}>{o}</option>)}
                      </select></td>
                      <td><input className={'hora' + (malE ? ' mal' : '')} value={f.entrada} disabled={!normal} placeholder="07:00" onChange={(e) => cambiar(i, 'entrada', e.target.value.trim())} />
                        {tarde > M.TOLERANCIA_LLEGADA_TARDE_MIN && <div className="tarde">{tarde} min tarde</div>}</td>
                      <td><input className={'hora' + (malS ? ' mal' : '')} value={f.salida} disabled={!normal} placeholder="16:00" onChange={(e) => cambiar(i, 'salida', e.target.value.trim())} /></td>
                      <td className="num">{normal ? (h === null ? (f.salida ? <span className="mal-txt">Verifica hora</span> : '') : h) : '—'}</td>
                      {industrial && <>
                        <td><input className="hora" value={f.segEntrada} disabled={!permiteSeg} placeholder="—" onChange={(e) => cambiar(i, 'segEntrada', e.target.value.trim())} /></td>
                        <td><input className="hora" value={f.segSalida} disabled={!permiteSeg} placeholder="—" onChange={(e) => cambiar(i, 'segSalida', e.target.value.trim())} /></td>
                        <td><input type="checkbox" checked={f.segSiguiente} disabled={!permiteSeg} onChange={(e) => cambiar(i, 'segSiguiente', e.target.checked)} /></td>
                        <td className="num">{hs === null ? <span className="mal-txt">Revisa</span> : hs || ''}</td>
                      </>}
                      <td><input className="obs" value={f.observacion} onChange={(e) => cambiar(i, 'observacion', e.target.value)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="pagos-pie">
            <span>Total horas laboradas: <b>{Math.round(total * 100) / 100}</b></span>
            <button className="btn btn-ok" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar día'}</button>
          </div>
          <p className="ayuda-txt">Hora en formato 24 h (HH:MM). {laboral ? `Se descuentan ${cfg.tiempoAlmuerzo} h de almuerzo.` : 'Día no laboral: quien no digite nada no trabajó y no se guarda.'}
            {industrial && ' Segunda jornada: toda es tiempo extra; si termina después de medianoche marca "Día sig.".'}</p>
        </>
      )}
    </div>
  )
}
