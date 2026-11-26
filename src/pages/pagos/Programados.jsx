import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando, Modal } from '../../ui.jsx'
import { useOrden } from '../../nomina/orden.jsx'
import { pesos, todas, siguienteId, ahoraTexto, opcionesQuincena } from '../../nomina/datos.js'

const TIPOS_CUENTA = [['COSTO', 'costo'], ['GASTO ADMINISTRATIVO', 'gastoAdministrativo'], ['GASTO DE VENTAS', 'gastoDeVentas']]
const vacio = { empleado_id: '', concepto: '', tipo: 'Indefinido', direccion: 'sumar', valor: '', monto_total: '', quincenas_totales: '', concilia: 'No', tipo_cuenta: '', cuenta: '' }

function resumen(p) {
  const valor = Number(p.valor) || 0, tot = Number(p.quincenas_totales) || 0, apl = Number(p.quincenas_aplicadas) || 0
  const termino = tot > 0, monto = termino ? Number(p.monto_total) || 0 : 0
  const pagado = termino ? (apl >= tot ? monto : valor * apl) : 0
  return { termino, monto, saldo: termino ? monto - pagado : null, restantes: termino ? Math.max(0, tot - apl) : null }
}

export default function Programados({ config, empleados }) {
  const caus = config.causaciones
  const [lista, setLista] = useState(null)
  const [f, setF] = useState(vacio)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [fAct, setFAct] = useState(''), [fFin, setFFin] = useState(''), [fEstado, setFEstado] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [conc, setConc] = useState(null)
  const activos = useMemo(() => empleados.filter((e) => e.estado !== 'Inactivo'), [empleados])

  const cargar = useCallback(async () => { try { setLista(await todas('programados')); setError('') } catch (e) { setError(e.message) } }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['programados'])

  const validarConciliacion = (d) => {
    if (d.concilia !== 'Sí') return { cuenta_conciliacion: 'No', tipo_cuenta_conciliacion: null, cuenta_contable_conciliacion: null }
    const clave = (TIPOS_CUENTA.find(([t]) => t === d.tipo_cuenta) || [])[1]
    if (!clave) throw new Error('Si marca "¿Cuenta para conciliaciones?" = Sí, debe elegir un tipo de cuenta válido.')
    if (!d.cuenta) throw new Error('Si marca "¿Cuenta para conciliaciones?" = Sí, debe elegir la cuenta puntual.')
    if (!(caus.cuentas?.[clave] || []).some((c) => c.Concepto === d.cuenta)) throw new Error(`La cuenta "${d.cuenta}" no existe en las cuentas de ${d.tipo_cuenta}.`)
    return { cuenta_conciliacion: 'Sí', tipo_cuenta_conciliacion: d.tipo_cuenta, cuenta_contable_conciliacion: d.cuenta }
  }

  const guardar = async (e) => {
    e.preventDefault(); setError(''); setOk('')
    try {
      const emp = empleados.find((x) => x.id === f.empleado_id)
      if (!emp) throw new Error('Elige el empleado.')
      if (!f.concepto.trim()) throw new Error('El concepto es obligatorio.')
      let valor, tot, monto
      const signo = f.direccion === 'descontar' ? -1 : 1 // igual que la hoja: se escribe el valor positivo y se elige si suma o descuenta
      if (f.tipo === 'A término fijo') {
        monto = signo * Math.abs(Number(f.monto_total)); tot = Number(f.quincenas_totales)
        if (!monto) throw new Error('El monto total debe ser distinto de cero (positivo = pago, negativo = descuento).')
        if (!tot || tot <= 0) throw new Error('El número de quincenas debe ser mayor a cero.')
        valor = Math.round(monto / tot)
      } else {
        valor = signo * Math.abs(Number(f.valor)); tot = 0; monto = 0
        if (!valor) throw new Error('El valor debe ser distinto de cero (positivo = pago, negativo = descuento).')
      }
      const conc = validarConciliacion(f)
      await q(sb.from('programados').insert({ id: siguienteId(lista.map((p) => p.id), 'P', 3), empleado_id: emp.id, nombre: emp.nombre, concepto: f.concepto.trim(),
        valor, quincenas_totales: tot, quincenas_aplicadas: 0, estado: 'Activo', fecha_creacion: ahoraTexto(), tipo: f.tipo, monto_total: monto,
        quincena_inicio: null, ...conc }))
      setF(vacio); setNuevo(false); setOk('Programado creado. Se aplicará en la próxima quincena que se guarde.'); cargar()
    } catch (err) { setError(err.message) }
  }
  const cancelar = async (p) => {
    if (!window.confirm(`¿Cancelar "${p.concepto}" de ${p.nombre}? Ya no se aplicará en las próximas quincenas.`)) return
    try { await q(sb.from('programados').update({ estado: 'Cancelado' }).eq('id', p.id)); cargar() } catch (e) { setError(e.message) }
  }
  const cambiarConc = async (p, d) => {
    try { await q(sb.from('programados').update(validarConciliacion(d)).eq('id', p.id)); setConc(null); setOk(`Conciliación de ${p.id} actualizada.`); cargar() } catch (e) { setError(e.message) }
  }

  if (!lista) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const ordenar = (xs) => [...xs].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  const act = ordenar(lista.filter((p) => p.estado === 'Activo' && (!fAct || p.empleado_id === fAct)))
  const fin = ordenar(lista.filter((p) => p.estado !== 'Activo' && (!fFin || p.empleado_id === fFin) && (!fEstado || p.estado === fEstado)))
  const empsDe = (xs) => [...new Map(xs.map((p) => [p.empleado_id, p.nombre])).entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'es'))
  const cuentasDe = (t) => (caus.cuentas?.[(TIPOS_CUENTA.find(([x]) => x === t) || [])[1]] || []).map((c) => c.Concepto)
  return (
    <div>
      <div className="barra-horas">
        <h3 style={{ margin: 0 }}>Activos</h3>
        <select value={fAct} onChange={(e) => setFAct(e.target.value)}><option value="">Todos los empleados</option>{empsDe(lista.filter((p) => p.estado === 'Activo')).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <button className="btn btn-sm empuja" onClick={() => { setF(vacio); setError(''); setNuevo(true) }}>+ Nuevo programado</button>
      </div>
      <Aviso>{error && !nuevo ? error : ''}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      {nuevo && <Modal titulo="Nuevo pago o descuento programado" onClose={() => setNuevo(false)} ancho={760}>
      <form onSubmit={guardar}>
        <div className="fila3">
          <label>Empleado<select value={f.empleado_id} onChange={(e) => setF({ ...f, empleado_id: e.target.value })}><option value="">—</option>{activos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
          <label>Concepto<input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej. Préstamo, bonificación…" /></label>
          <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="Indefinido">Indefinido (sin fin)</option><option value="A término fijo">A término fijo (monto total en X quincenas)</option></select></label>
          <label>¿Sumar o descontar?<select value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })}><option value="sumar">Sumar a la nómina (pago)</option><option value="descontar">Descontar de la nómina</option></select></label>
          {f.tipo === 'Indefinido'
            ? <label>Valor quincenal<input type="number" min="0" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="Ej: 50000" /></label>
            : <>
              <label>Monto total<input type="number" min="0" value={f.monto_total} onChange={(e) => setF({ ...f, monto_total: e.target.value })} /></label>
              <label>Número de quincenas<input type="number" min="1" value={f.quincenas_totales} onChange={(e) => setF({ ...f, quincenas_totales: e.target.value })} /></label>
            </>}
          <label>¿Cuenta para conciliaciones?<select value={f.concilia} onChange={(e) => setF({ ...f, concilia: e.target.value })}><option>No</option><option>Sí</option></select></label>
          {f.concilia === 'Sí' && <>
            <label>Tipo de cuenta<select value={f.tipo_cuenta} onChange={(e) => setF({ ...f, tipo_cuenta: e.target.value, cuenta: '' })}><option value="">—</option>{TIPOS_CUENTA.map(([t]) => <option key={t}>{t}</option>)}</select></label>
            <label>Cuenta puntual<select value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}><option value="">—</option>{cuentasDe(f.tipo_cuenta).map((c) => <option key={c}>{c}</option>)}</select></label>
          </>}
        </div>
        {f.tipo === 'A término fijo' && Number(f.monto_total) > 0 && Number(f.quincenas_totales) > 0 ? <p className="tenue">Valor por quincena (automático): {pesos((f.direccion === 'descontar' ? -1 : 1) * Math.round(Number(f.monto_total) / Number(f.quincenas_totales)))} (la última cuota ajusta el redondeo)</p> : null}
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn btn-sec" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn btn-ok">Crear programado</button></div>
      </form>
      </Modal>}
      <TablaProg filas={act} activos onConc={(p) => { setError(''); setConc(p) }} onCancelar={cancelar} />
      <div className="barra-horas" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Finalizados y cancelados</h3>
        <select value={fFin} onChange={(e) => setFFin(e.target.value)}><option value="">Todos los empleados</option>{empsDe(lista.filter((p) => p.estado !== 'Activo')).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="">Todos los estados</option><option>Finalizado</option><option>Cancelado</option></select>
      </div>
      <TablaProg filas={fin} onConc={(p) => { setError(''); setConc(p) }} />
      {conc && <ModalConc p={conc} cuentasDe={cuentasDe} error={error} onCambio={(d) => cambiarConc(conc, d)} onClose={() => setConc(null)} />}
    </div>
  )
}

function TablaProg({ filas: crudas, activos, onConc, onCancelar }) {
  const { ordenar, th } = useOrden()
  const filas = ordenar(crudas, (p, k) => { const r = resumen(p); return k === 'monto' ? (r.termino ? r.monto : null) : k === 'saldo' ? r.saldo : k === 'restantes' ? r.restantes : k === 'valor' ? Number(p.valor) : k === 'avance' ? Number(p.quincenas_aplicadas) : p[k] })
  return (
    <div className="tabla-cont"><table className="tabla tabla-pagos">
      <thead><tr>{th('nombre', 'Empleado')}{th('concepto', 'Concepto')}{th('tipo', 'Tipo')}{th('monto', 'Monto total', { className: 'num' })}{th('valor', 'Valor/quincena', { className: 'num' })}{th('quincena_inicio', 'Quincena inicio')}{th('avance', 'Avance', { className: 'num' })}
        {activos ? <>{th('saldo', 'Saldo pendiente', { className: 'num' })}{th('restantes', 'Quincenas restantes', { className: 'num' })}</> : th('estado', 'Estado')}{th('cuenta_conciliacion', 'Conciliación')}<th></th></tr></thead>
      <tbody>{filas.map((p) => {
        const r = resumen(p)
        return (
          <tr key={p.id}>
            <td><b>{p.nombre}</b></td><td>{p.concepto}</td><td>{p.tipo || (r.termino ? 'A término fijo' : 'Indefinido')}</td>
            <td className="num">{r.termino ? pesos(r.monto) : '—'}</td><td className="num">{pesos(p.valor)}</td><td className="tenue">{p.quincena_inicio || '—'}</td>
            <td className="num">{r.termino ? `${p.quincenas_aplicadas}/${p.quincenas_totales}` : `${p.quincenas_aplicadas} aplicadas`}</td>
            {activos ? <><td className="num">{r.termino ? pesos(r.saldo) : '—'}</td><td className="num">{r.termino ? r.restantes : '—'}</td></>
              : <td><Badge tone={p.estado === 'Cancelado' ? 'bad' : 'muted'}>{p.estado}</Badge></td>}
            <td>{p.cuenta_conciliacion === 'Sí' ? `${p.tipo_cuenta_conciliacion} · ${p.cuenta_contable_conciliacion}` : 'No'} <button className="btn-link" onClick={() => onConc(p)}>Editar</button></td>
            <td>{activos && <button className="btn-link peligro" onClick={() => onCancelar(p)}>Cancelar</button>}</td>
          </tr>
        )
      })}</tbody>
    </table>{!filas.length && <p className="tenue">No hay registros.</p>}</div>
  )
}

function ModalConc({ p, cuentasDe, error, onCambio, onClose }) {
  const [d, setD] = useState({ concilia: p.cuenta_conciliacion === 'Sí' ? 'Sí' : 'No', tipo_cuenta: p.tipo_cuenta_conciliacion || '', cuenta: p.cuenta_contable_conciliacion || '' })
  return (
    <Modal titulo={`Conciliación · ${p.id} ${p.concepto}`} onClose={onClose} ancho={620}>
      <p className="tenue" style={{ marginTop: 0 }}>{p.nombre} · {pesos(p.valor)} por quincena</p>
      <div className="fila-form">
        <label>¿Cuenta para conciliaciones?<select value={d.concilia} onChange={(e) => setD({ ...d, concilia: e.target.value })}><option>No</option><option>Sí</option></select></label>
        {d.concilia === 'Sí' && <>
          <label>Tipo de cuenta<select value={d.tipo_cuenta} onChange={(e) => setD({ ...d, tipo_cuenta: e.target.value, cuenta: '' })}><option value="">—</option>{TIPOS_CUENTA.map(([t]) => <option key={t}>{t}</option>)}</select></label>
          <label className="crece">Cuenta puntual<select value={d.cuenta} onChange={(e) => setD({ ...d, cuenta: e.target.value })}><option value="">—</option>{cuentasDe(d.tipo_cuenta).map((c) => <option key={c}>{c}</option>)}</select></label>
        </>}
      </div>
      <Aviso>{error}</Aviso>
      <div className="acciones"><button className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn btn-ok" onClick={() => onCambio(d)}>Guardar</button></div>
    </Modal>
  )
}
