import { useState } from 'react'
import { Aviso } from '../../ui.jsx'
import { todas, cargarConfig } from '../../nomina/datos.js'
import { verificarTodo } from '../../nomina/verificar.js'

const SECC = [
  ['nomina', 'Nómina quincenal', 'Con las mismas entradas guardadas (días, incapacidad, otros, programado) se recalcula cada fila con las reglas actuales.'],
  ['horasExtra', 'Horas extra en pesos', 'Con las mismas horas guardadas se recalculan los valores con el salario y los factores.'],
  ['causaciones', 'Causaciones', 'Se regenera cada quincena causada y se compara por empleado, cuenta, centro de costo y concepto.'],
  ['jornadas', 'Horas laboradas de la jornada', 'Se recalculan las horas de cada registro de entrada/salida.'],
  ['jornadaVsExtras', 'Jornada vs. horas extra guardadas', 'Compara lo que la jornada calcula con lo que se guardó en la semana. Las diferencias suelen ser ajustes a mano antes de guardar.'],
]

// Recalcula todo lo guardado con el motor y lo compara peso a peso (no modifica nada)
export default function Verificacion() {
  const [inf, setInf] = useState(null)
  const [error, setError] = useState('')
  const [corriendo, setCorriendo] = useState(false)
  const correr = async () => {
    setCorriendo(true); setError('')
    try {
      const [config, empleados, jornadas, horasExtra, nomina, programados, vacaciones, ausentismos, causaciones] = await Promise.all([cargarConfig(), todas('empleados'), todas('jornadas'),
        todas('nomina_horas_extra'), todas('nomina_quincenal'), todas('programados'), todas('vacaciones'), todas('ausentismos'), todas('causaciones')])
      setInf(verificarTodo({ config, empleados, jornadas, horasExtra, nomina, programados, vacaciones, ausentismos, causaciones }))
    } catch (e) { setError(e.message) } finally { setCorriendo(false) }
  }
  return (
    <div className="pagos">
      <div className="titulo-pagina"><h1>Verificación de cálculos</h1></div>
      <p>Recalcula con el motor del programa todo lo que está guardado y lo compara peso a peso. No cambia ningún dato.</p>
      <button className="btn btn-ok" disabled={corriendo} onClick={correr}>{corriendo ? 'Verificando…' : 'Verificar todo'}</button>
      <Aviso>{error}</Aviso>
      {inf && SECC.map(([k, t, desc]) => {
        const s = inf[k], total = s.filas ?? s.semanas ?? s.quincenas
        return (
          <details key={k} className="tarjeta form-pagos" open={s.dif.length > 0 && k !== 'jornadaVsExtras'}>
            <summary><b>{t}</b>: {s.ok} de {total} iguales {s.dif.length === 0 ? '✔' : `· ${s.dif.length} con diferencias`}</summary>
            <p className="tenue">{desc}</p>
            {s.dif.length > 0 && <div className="tabla-cont" style={{ maxHeight: 400 }}><table className="tabla"><tbody>
              {s.dif.map((x, i) => <tr key={i}><td>{x.q || x.s || x.f}</td><td>{x.nombre || x.emp || ''}</td><td>{x.motivo || (x.difs || []).join(' · ')}</td></tr>)}
            </tbody></table></div>}
          </details>
        )
      })}
      {inf && <p className="ayuda-txt">Las quincenas de agosto a la primera de octubre se liquidaron con reglas que después se cambiaron en la hoja (IBC con subsidio de incapacidad, jubilados sin pensión, accidente de trabajo al 100 %). Lo guardado es lo que se pagó y no se modifica.</p>}
    </div>
  )
}
