import { useCallback, useEffect, useState } from 'react'
import { useEnVivo } from '../../vivo.js'
import { Aviso, Cargando } from '../../ui.jsx'
import { MODULOS, cargarConfig, cargarEmpleados } from '../../nomina/datos.js'
import Jornada from './Jornada.jsx'
import HorasExtra from './HorasExtra.jsx'
import Nomina from './Nomina.jsx'
import Programados from './Programados.jsx'
import Ausentismos from './Ausentismos.jsx'
import Vacaciones from './Vacaciones.jsx'
import Informes from './Informes.jsx'
import Causaciones from './Causaciones.jsx'
import Empleados from './Empleados.jsx'
import { AYUDA, ModalAyuda } from './Ayuda.jsx'

// Contenedor de Pagos: carga la configuración de nómina y los empleados una vez y los comparte
export default function Pagos({ modulo, perfil, modulos }) {
  const [base, setBase] = useState(null)
  const [error, setError] = useState('')
  const [ayuda, setAyuda] = useState(false)
  const verEmpleados = modulos.some((m) => !['jornadalito', 'jornadaindustrial'].includes(m))

  const cargar = useCallback(async () => {
    try {
      const [config, empleados] = await Promise.all([cargarConfig(), verEmpleados ? cargarEmpleados() : Promise.resolve([])])
      // Solo se reemplaza si algo cambió de verdad: así las pantallas no se recargan (ni pierden lo digitado) en cada revisión periódica
      setBase((b) => (b && JSON.stringify(b.config) === JSON.stringify(config) && JSON.stringify(b.empleados) === JSON.stringify(empleados) ? b : { config, empleados })); setError('')
    } catch (e) { setError(e.message) }
  }, [verEmpleados])
  useEffect(() => { cargar() }, [cargar])
  // Alto de la barra superior fija, para que los encabezados de las tablas queden pegados justo debajo
  useEffect(() => {
    const barra = document.querySelector('.barra-sup')
    if (!barra || !window.ResizeObserver) return
    const medir = () => document.documentElement.style.setProperty('--alto-barra', `${Math.round(barra.getBoundingClientRect().height)}px`)
    medir()
    const ro = new ResizeObserver(medir); ro.observe(barra)
    return () => ro.disconnect()
  }, [])
  useEnVivo(cargar, ['empleados', 'nomina_config'], 120000)

  const titulo = (MODULOS.find(([m]) => m === modulo) || [])[1]
  if (error) return <Aviso>{error}</Aviso>
  if (!base) return <Cargando />
  const rol = perfil?.rol
  // Mismos permisos del programa anterior: Gerencia/Administrador todo; Contabilidad consulta y exporta (no guarda nómina,
  // horas extra ni causaciones, ni elimina ausentismos); Recursos Humanos edita sus módulos; los retirados solo los ve Gerencia.
  const props = { ...base, perfil, modulos, recargarBase: cargar, gestor: ['admin', 'direccion'].includes(rol), soloLectura: rol === 'contabilidad' }
  return (
    <div className="pagos">
      <div className="titulo-pagina"><h1>{titulo}</h1>{AYUDA[modulo] && <button className="btn btn-sec btn-sm" onClick={() => setAyuda(true)}>❓ Ayuda</button>}</div>
      {ayuda && <ModalAyuda a={AYUDA[modulo]} onClose={() => setAyuda(false)} />}
      {modulo === 'jornadalito' && <Jornada grupo="litografia" {...props} />}
      {modulo === 'jornadaindustrial' && <Jornada grupo="industrial" {...props} />}
      {modulo === 'horasextra' && <HorasExtra {...props} />}
      {modulo === 'nomina' && <Nomina {...props} />}
      {modulo === 'programados' && <Programados {...props} />}
      {modulo === 'ausentismos' && <Ausentismos {...props} />}
      {modulo === 'vacaciones' && <Vacaciones {...props} />}
      {modulo === 'informes' && <Informes {...props} />}
      {modulo === 'causaciones' && <Causaciones {...props} />}
      {modulo === 'empleados' && <Empleados {...props} />}
    </div>
  )
}
