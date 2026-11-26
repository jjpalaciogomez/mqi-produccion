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

// Contenedor de Pagos: carga la configuración de nómina y los empleados una vez y los comparte
export default function Pagos({ modulo, perfil, modulos }) {
  const [base, setBase] = useState(null)
  const [error, setError] = useState('')
  const verEmpleados = modulos.some((m) => !['jornadalito', 'jornadaindustrial'].includes(m))

  const cargar = useCallback(async () => {
    try {
      const [config, empleados] = await Promise.all([cargarConfig(), verEmpleados ? cargarEmpleados() : Promise.resolve([])])
      setBase({ config, empleados }); setError('')
    } catch (e) { setError(e.message) }
  }, [verEmpleados])
  useEffect(() => { cargar() }, [cargar])
  useEnVivo(cargar, ['empleados', 'nomina_config'], 120000)

  const titulo = (MODULOS.find(([m]) => m === modulo) || [])[1]
  if (error) return <Aviso>{error}</Aviso>
  if (!base) return <Cargando />
  const props = { ...base, perfil, modulos, recargarBase: cargar }
  return (
    <div className="pagos">
      <div className="titulo-pagina"><h1>{titulo}</h1></div>
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
