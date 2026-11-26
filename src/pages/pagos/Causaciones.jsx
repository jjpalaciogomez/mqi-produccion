import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb, q } from '../../supabase.js'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Badge, Cargando, Modal } from '../../ui.jsx'
import * as M from '../../nomina/motor.js'
import { pesos, todas, ahoraTexto, empleadosMotor, porId } from '../../nomina/datos.js'
import { descargarTabla } from '../../nomina/xlsx.js'
import { CausConfig } from './ConfigNomina.jsx'

const ENC = ['Quincena', 'ID línea', 'ID_Empleado', 'Cuenta', 'Descripción', 'C. Costo', 'NIT', 'Nombre', 'Débito', 'Crédito', 'Concepto', 'Tipo', 'Fecha de generación']

export default function Causaciones({ config, empleados, recargarBase }) {
  const emps = useMemo(() => empleadosMotor(empleados), [empleados])
  const empPorId = useMemo(() => porId(emps), [emps])
  const [datos, setDatos] = useState(null)
  const [quincena, setQuincena] = useState('')
  const [vista, setVista] = useState(null)
  const [error, setError] = useState(''), [ok, setOk] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [verConfig, setVerConfig] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [nomina, causaciones, ausentismos] = await Promise.all([todas('nomina_quincenal'), todas('causaciones'), todas('ausentismos')])
      setDatos({ nomina, causaciones, ausentismos }); setError('')
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['causaciones', 'nomina_quincenal'])

  const quincenas = useMemo(() => (datos ? [...new Set(datos.nomina.map((n) => n.quincena))].sort((a, b) => M.parsearQuincena(b).inicio.localeCompare(M.parsearQuincena(a).inicio)) : []), [datos])
  useEffect(() => { if (!quincena && quincenas.length) setQuincena(quincenas[0]) }, [quincenas, quincena])
  const guardadas = datos ? datos.causaciones.filter((c) => c.quincena === quincena).sort((a, b) => a.id_linea - b.id_linea) : []

  const calcular = () => M.generarCausacionQuincena(quincena, datos.nomina.filter((n) => n.quincena === quincena), empPorId, datos.ausentismos, config.causaciones)
  const previsualizar = () => { setError(''); try { setVista(calcular()) } catch (e) { setError(e.message) } }
  const generar = async (regenerar) => {
    setError(''); setOk('')
    if (regenerar && !window.confirm(`¿Regenerar la causación de ${quincena}? Se reemplazan sus ${guardadas.length} líneas guardadas.`)) return
    try {
      setOcupado(true)
      const g = calcular()
      const ahora = ahoraTexto()
      const filas = g.lineas.map((l, i) => ({ quincena, id_linea: i + 1, empleado_id: l.ID_Empleado, cuenta: l.Cuenta, descripcion: l.Descripcion, centro_costo: l.CentroCosto || null,
        nit: l.Nit || null, nombre: l.Nombre || null, debito: l.Debito, credito: l.Credito, concepto: l.Concepto, tipo: l.TipoCausacion, generado_en: ahora }))
      if (regenerar) await q(sb.from('causaciones').delete().eq('quincena', quincena))
      for (let i = 0; i < filas.length; i += 500) await q(sb.from('causaciones').insert(filas.slice(i, i + 500)))
      setOk(`Causación guardada: ${filas.length} líneas · Débitos ${pesos(g.totalDebito)} = Créditos ${pesos(g.totalCredito)}.` + (g.advertencias.length ? ' Advertencias: ' + g.advertencias.join(' ') : ''))
      setVista(null); await cargar()
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar la causación guardada de ${quincena}?`)) return
    try { await q(sb.from('causaciones').delete().eq('quincena', quincena)); cargar() } catch (e) { setError(e.message) }
  }
  const exportar = (lineas, nombre) => descargarTabla(nombre, ENC, lineas.map((l) => [l.quincena ?? quincena, l.id_linea ?? '', l.empleado_id ?? l.ID_Empleado, l.cuenta ?? l.Cuenta, l.descripcion ?? l.Descripcion,
    l.centro_costo ?? l.CentroCosto ?? '', l.nit ?? l.Nit ?? '', l.nombre ?? l.Nombre ?? '', Number(l.debito ?? l.Debito), Number(l.credito ?? l.Credito), l.concepto ?? l.Concepto, l.tipo ?? l.TipoCausacion, l.generado_en ?? '']))

  if (!datos) return error ? <Aviso>{error}</Aviso> : <Cargando />
  const resumen = [...new Set(datos.causaciones.map((c) => c.quincena))].map((qq) => {
    const ls = datos.causaciones.filter((c) => c.quincena === qq)
    return { q: qq, n: ls.length, d: ls.reduce((a, c) => a + Number(c.debito), 0), c: ls.reduce((a, c) => a + Number(c.credito), 0), f: ls[0]?.generado_en }
  })
  const mostrar = vista ? vista.lineas : guardadas
  const porConcepto = {}
  mostrar.forEach((l) => { const k = l.concepto ?? l.Concepto; porConcepto[k] = porConcepto[k] || [0, 0]; porConcepto[k][0] += Number(l.debito ?? l.Debito); porConcepto[k][1] += Number(l.credito ?? l.Credito) })
  return (
    <div>
      <div className="barra-horas">
        <select value={quincena} onChange={(e) => { setVista(null); setQuincena(e.target.value) }}>{quincenas.map((x) => <option key={x}>{x}</option>)}</select>
        {guardadas.length ? <Badge tone="ok">Causada ({guardadas.length} líneas)</Badge> : <Badge tone="warn">Sin causar</Badge>}
        <button className="btn btn-sec btn-sm" onClick={previsualizar}>Previsualizar</button>
        {!guardadas.length ? <button className="btn btn-sm btn-ok" disabled={ocupado} onClick={() => generar(false)}>Generar causación</button>
          : <><button className="btn btn-sm" disabled={ocupado} onClick={() => generar(true)}>Regenerar</button><button className="btn btn-sm btn-paro" onClick={eliminar}>Eliminar</button></>}
        {mostrar.length > 0 && <button className="btn btn-sec btn-sm" onClick={() => exportar(mostrar, `Causacion_${quincena}.xlsx`)}>Exportar Excel</button>}
        <button className="btn btn-sec btn-sm empuja" onClick={() => setVerConfig(true)}>Configuración contable</button>
      </div>
      <Aviso>{error}</Aviso><Aviso tipo="ok">{ok}</Aviso>
      {vista && <Aviso tipo="warn">Vista previa (sin guardar): {vista.lineas.length} líneas · Débitos {pesos(vista.totalDebito)} · Créditos {pesos(vista.totalCredito)}{vista.advertencias.length ? ' · ' + vista.advertencias.join(' ') : ''}</Aviso>}
      {mostrar.length > 0 && <>
        <h3>Totales por concepto</h3>
        <div className="tabla-cont"><table className="tabla tabla-pagos"><thead><tr><th>Concepto</th><th>Débito</th><th>Crédito</th></tr></thead>
          <tbody>{Object.entries(porConcepto).map(([k, [d, c]]) => <tr key={k}><td>{k}</td><td className="num">{pesos(d)}</td><td className="num">{pesos(c)}</td></tr>)}</tbody></table></div>
        <details><summary>Ver las {mostrar.length} líneas</summary>
          <div className="tabla-cont"><table className="tabla tabla-pagos"><thead><tr><th>Cuenta</th><th>Descripción</th><th>C. costo</th><th>NIT</th><th>Nombre</th><th>Débito</th><th>Crédito</th></tr></thead>
            <tbody>{mostrar.map((l, i) => <tr key={i}><td>{l.cuenta ?? l.Cuenta}</td><td>{l.descripcion ?? l.Descripcion}</td><td>{l.centro_costo ?? l.CentroCosto}</td><td>{l.nit ?? l.Nit}</td><td>{l.nombre ?? l.Nombre}</td>
              <td className="num">{Number(l.debito ?? l.Debito) ? pesos(l.debito ?? l.Debito) : ''}</td><td className="num">{Number(l.credito ?? l.Credito) ? pesos(l.credito ?? l.Credito) : ''}</td></tr>)}</tbody></table></div>
        </details>
      </>}
      <h3>Causaciones guardadas</h3>
      <div className="tabla-cont"><table className="tabla tabla-pagos"><thead><tr><th>Quincena</th><th>Líneas</th><th>Débitos</th><th>Créditos</th><th>Generada</th></tr></thead>
        <tbody>{resumen.map((r) => <tr key={r.q}><td>{r.q}</td><td className="num">{r.n}</td><td className="num">{pesos(r.d)}</td><td className="num">{pesos(r.c)}</td><td className="tenue">{r.f}</td></tr>)}</tbody></table></div>
      {verConfig && <Modal titulo="Configuración contable · cuentas, centros de costo, porcentajes y entidades" onClose={() => setVerConfig(false)} ancho={1100}>
        <CausConfig valor={config.causaciones} onGuardado={recargarBase} />
      </Modal>}
    </div>
  )
}
