import { useState } from 'react'
import { Modal } from './ui.jsx'

// Instructivos por pantalla y rol. Cada uno: para qué sirve, pasos o funciones, y un consejo.
// Roles: 'gestor' (Administrador y Dirección), 'consulta', 'tablet'.
const AYUDA = {
  'tablero.gestor': {
    titulo: 'Tablero de planta',
    proposito: 'Ver de un vistazo todas las OPs en planta y cuáles necesitan atención.',
    puntos: [
      ['Leer el cumplimiento', 'A tiempo · En riesgo (faltan 2 días o menos) · Vencida (pasó la fecha compromiso).'],
      ['Leer el avance', '% de los minutos estándar ya terminados. "Pasos" muestra cuántos van de cuántos.'],
      ['Filtrar y buscar', 'Activas, Terminadas o Todas. Busca por número de OP, cliente o proyecto.'],
      ['Abrir una OP', 'Haz clic en la fila para ver sus ítems, pasos y el mapa.'],
      ['Crear una OP', 'Botón "+ Nueva OP".'],
    ],
    consejo: 'Cada mañana revisa primero las Vencidas y En riesgo: son las que definen la prioridad del día.',
  },
  'tablero.consulta': {
    titulo: 'Tablero de planta',
    proposito: 'Consultar el estado de las OPs sin tener que llamar a la planta.',
    puntos: [
      ['Leer el cumplimiento', 'A tiempo · En riesgo (faltan 2 días o menos) · Vencida (pasó la fecha compromiso).'],
      ['Leer el avance', '% del trabajo estándar ya terminado y pasos hechos de los totales.'],
      ['Buscar', 'Por número de OP, cliente o proyecto.'],
      ['Ver detalle', 'Haz clic en la fila para ver sus pasos y el mapa del proyecto.'],
    ],
    consejo: 'Si necesitas cambiar una fecha o prioridad, pídelo a Dirección de Producción: tu acceso es solo de lectura.',
  },
  'nueva.gestor': {
    titulo: 'Nueva OP',
    proposito: 'Registrar los datos generales de una orden antes de detallar qué se fabrica.',
    pasos: [
      'Escribe el número de OP (el mismo de la app de proyectos), cliente y proyecto.',
      'Pon la fecha compromiso real: de ella sale el semáforo de cumplimiento.',
      'Elige la prioridad: 1 es la más urgente. Ordena las tareas en las tablets.',
      'Pulsa "Crear OP y agregar ítems". En la siguiente pantalla cargas lo que se fabrica.',
    ],
    consejo: 'Si el paquete técnico (planos, materiales, cantidades) está incompleto, anótalo en Notas antes de liberar la OP a planta.',
  },
  'op.gestor': {
    titulo: 'Detalle de la OP',
    proposito: 'Armar la OP por ítems y productos, y seguir cada paso.',
    pasos: [
      '"+ Agregar ítem": lo que se entrega (ej. 8 mesas). "Editar ítem" cambia descripción o cantidad y recalcula los pasos.',
      '"+ Agregar producto": elige el producto, escribe sus medidas en cm (ancho × profundidad × alto, según aplique), la dificultad y cuántas unidades lleva cada ítem.',
      'El sistema crea un paso por cada proceso de la ruta, con su tiempo estándar ya calculado. Antes de guardar ves el tiempo por área.',
      'Si el ítem lleva productos de dos o más familias (ej. Metal y Madera), aparece el ensamble final: elige su área y dificultad.',
      'Dificultad: Media es la predeterminada. Baja reduce el tiempo y Alta lo aumenta.',
      '"Editar" en un producto: corrige medidas, dificultad o unidades y los pasos pendientes se recalculan.',
      'Alternativas: pulsa "Usar esta" para escoger (ej. pintura en planta u horno). Opcionales: "Omitir" o "Incluir".',
      'Terceros: "Enviado al tercero" al despachar y "Recibido" al volver.',
    ],
    puntos: [
      ['Editar datos', 'Cambia fecha compromiso, prioridad, estado y fecha de entrega real.'],
      ['Corregir tiempos', '"Registros (n)" en un paso muestra los tiempos registrados: puedes corregir minutos y cantidad o borrarlos. "Reabrir" vuelve a abrir un paso terminado.'],
      ['Eliminar OP', 'Borra la OP con todo lo registrado. Pide escribir el número para confirmar y no se puede deshacer.'],
      ['Estados', 'Pendiente · En espera (falta un paso anterior) · En curso · Pausada · Terminada.'],
    ],
    consejo: 'Un paso solo aparece en la tablet cuando terminan los anteriores. Sin medidas, el paso queda sin estándar y no cuenta para medir eficiencia.',
  },
  'op.consulta': {
    titulo: 'Detalle de la OP',
    proposito: 'Ver qué se fabrica en la OP y en qué paso va cada parte.',
    puntos: [
      ['Ítems y pasos', 'Cada ítem muestra sus productos y los pasos con su estado, tiempo estándar y real.'],
      ['Estados', 'Pendiente · En espera (falta un paso anterior) · En curso · Pausada · Terminada.'],
      ['Mapa del proyecto', 'El mismo recorrido dibujado de izquierda a derecha.'],
    ],
    consejo: 'El ensamble final empieza solo cuando terminan todos los productos del ítem: ahí suelen estar las esperas.',
  },
  'mapa.gestor': {
    titulo: 'Mapa del proyecto',
    proposito: 'Ver el recorrido completo de la OP y qué está frenando el avance.',
    puntos: [
      ['Cómo se lee', 'De izquierda a derecha: OP → ítems → productos → ensamble final. Cada producto lista sus procesos.'],
      ['Procesos', '✓ terminado · ● en proceso · ○ listo para empezar · gris: en espera. A la derecha, tiempo real / estándar y quién trabajó.'],
      ['Alertas', 'En rojo, los procesos que van 20% o más por encima del estándar.'],
      ['Moverse', 'Arrastra para desplazarte. Rueda del mouse o botones + / − para acercar.'],
    ],
    consejo: 'Busca la fila más larga o con más pasos en gris: esa es la ruta que define la fecha de entrega.',
  },
  'catalogos.gestor': {
    titulo: 'Configuraciones',
    proposito: 'Administrar las personas y los datos base con que el sistema calcula tiempos.',
    puntos: [
      ['Personas', 'Agrega operarios: aparecen en la tablet de su área para registrar su tiempo. Usa "Activo" para retirar a alguien sin borrar su historial.'],
      ['Productos y rutas', 'Crea o edita productos, familias y rutas. Cada proceso de la ruta lleva sus minutos para una unidad del tamaño de referencia. Un producto de terceros puede tener pasos previos en planta (ej. plantillas en Madera) antes del envío al proveedor.'],
      ['Procesos', 'Crea procesos nuevos (también de terceros, ej. Tapizado) y ajusta el tiempo del ensamble final.'],
      ['Dificultad', 'Multiplicadores de Baja, Media y Alta.'],
      ['Estándar real', 'Compara lo real con lo estándar por producto y área, y sugiere el nuevo valor. "Aplicar" lo actualiza.'],
    ],
    consejo: 'Actualiza un estándar solo cuando tenga 10 o más pasos medidos. Con menos datos, una tarea atípica distorsiona el número.',
  },
  'tablet.tablet': {
    titulo: 'Cómo registrar en la tablet',
    proposito: 'Anotar cuánto tiempo trabajaste en cada tarea y cuánto hiciste. Con eso la planta sabe cómo va cada pedido.',
    pasos: [
      'Toca el proyecto (OP), luego el ítem, y "Registrar" en el proceso en el que trabajaste.',
      'Si hiciste un proceso para todo el proyecto (ej. el corte de todo el material), entra a la OP y toca "Registrar un proceso de todo el proyecto": el tiempo se reparte solo entre los ítems.',
      'Toca tu nombre.',
      'Escribe el tiempo que trabajaste (o toca un atajo: 30 min, 1 h, 2 h…) y cuántas unidades terminaste.',
      'Si la tarea quedó lista, toca "Guardar y terminé la tarea". Si la sigues después, "Guardar · sigo después".',
      'Si estuviste parado (reunión, falta de material, apoyo a instalaciones), toca "Registrar paro", elige el motivo y el tiempo.',
    ],
    puntos: [
      ['Qué aparece', 'Los proyectos con trabajo para tu área, en orden de prioridad. Dentro de cada ítem ves los procesos: los listos, los que esperan un paso anterior y los terminados.'],
      ['Tus horas del día', 'Al tocar tu nombre ves cuánto llevas registrado hoy. Al final del día debería sumar tu jornada.'],
    ],
    consejo: 'Registra cada vez que cambies de tarea, no al final del día: así el tiempo sale exacto.',
  },
}

export function BotonAyuda({ clave, rol, etiqueta = 'Cómo funciona', claro }) {
  const [abierto, setAbierto] = useState(false)
  const r = rol === 'tablet' ? 'tablet' : ['admin', 'direccion'].includes(rol) ? 'gestor' : 'consulta'
  const contenido = AYUDA[`${clave}.${r}`] || AYUDA[`${clave}.gestor`]
  if (!contenido) return null
  return (
    <>
      <button className={`btn-ayuda${claro ? ' claro' : ''}`} onClick={() => setAbierto(true)}>
        <span className="ayuda-icono">?</span>{etiqueta}
      </button>
      {abierto && (
        <Modal titulo={contenido.titulo} onClose={() => setAbierto(false)} ancho={600}>
          <div className={`ayuda${r === 'tablet' ? ' ayuda-grande' : ''}`}>
            <p className="ayuda-proposito">{contenido.proposito}</p>
            {contenido.pasos && (
              <>
                <h4>Paso a paso</h4>
                <ol>{contenido.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </>
            )}
            {contenido.puntos && (
              <>
                <h4>{contenido.pasos ? 'Además' : 'Qué puedes hacer'}</h4>
                <dl>{contenido.puntos.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
              </>
            )}
            <div className="ayuda-consejo"><b>Consejo:</b> {contenido.consejo}</div>
            <div className="acciones"><button className="btn" onClick={() => setAbierto(false)}>Entendido</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}
