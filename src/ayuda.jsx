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
      '"+ Agregar ítem": lo que se entrega (ej. 8 mesas) y el área que hace el ensamble final.',
      '"+ Agregar producto": elige el producto estándar y su cantidad. Los pasos se crean solos.',
      'Escribe la cantidad de cada paso en su unidad (cortes, cml, m²). Así se calcula el tiempo estándar.',
      'Alternativas: pulsa "Usar esta" para escoger (ej. pintura en planta u horno). Opcionales: "Omitir" o "Incluir".',
      'Terceros: "Enviado al tercero" al despachar y "Recibido" al volver.',
    ],
    puntos: [
      ['Editar datos', 'Cambia fecha compromiso, prioridad, estado y fecha de entrega real.'],
      ['Estados', 'Pendiente · En espera (falta un paso anterior) · En curso · Pausada · Terminada.'],
    ],
    consejo: 'Un paso solo aparece en la tablet cuando terminan los anteriores. Sin cantidad, el paso no cuenta para medir eficiencia.',
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
      ['Cómo se lee', 'De izquierda a derecha: OP → ítems → productos → pasos → ensamble final.'],
      ['Colores', 'Borde negro: lista para iniciar · Azul: en curso · Amarillo: pausada · Verde: terminada · Gris: esperando pasos anteriores.'],
      ['Moverse', 'Arrastra para desplazarte. Rueda del mouse o botones + / − para acercar.'],
    ],
    consejo: 'Busca la fila más larga o con más pasos en gris: esa es la ruta que define la fecha de entrega.',
  },
  'catalogos.gestor': {
    titulo: 'Catálogos',
    proposito: 'Administrar las personas y los datos base con que el sistema calcula tiempos.',
    puntos: [
      ['Personas y PIN', 'Agrega operarios y asigna su PIN de 4 dígitos. Si alguien se bloquea (5 intentos fallidos), asígnale un PIN nuevo. Usa "Activo" para retirar a alguien sin borrar su historial.'],
      ['Procesos y tiempos', 'Ajusta el tiempo estándar por unidad. Aplica solo a los pasos que se creen desde ese momento.'],
      ['Productos y rutas', 'Consulta qué pasos tiene cada producto estándar y qué productos comerciales incluye.'],
      ['Estándar real', 'Compara el estándar vigente con lo que miden las tablets.'],
    ],
    consejo: 'Actualiza un estándar solo cuando tenga 10 o más pasos medidos. Con menos datos, una tarea atípica distorsiona el número.',
  },
  'tablet.tablet': {
    titulo: 'Cómo registrar en la tablet',
    proposito: 'Marcar cuándo empiezas y terminas cada tarea. Con eso la planta sabe cómo va cada pedido.',
    pasos: [
      'Iniciar: toca "Iniciar" en la tarea → toca tu nombre → escribe tu PIN.',
      'Pausar: toca "Pausar" y elige el motivo (alimentación, servicio a instalaciones, falta de material…).',
      'Reanudar: toca "Reanudar" cuando vuelvas a la tarea.',
      'Terminar: toca "Terminar" y confirma la cantidad que hiciste.',
      'Reportar paro: úsalo cuando no estés en ninguna tarea (reunión, aseo, falta de material). Al volver, "Terminar paro".',
    ],
    puntos: [
      ['Qué aparece', 'Arriba: lo que está en curso o pausado. Abajo: lo que ya se puede empezar, en orden de prioridad.'],
      ['PIN bloqueado', 'Después de 5 intentos fallidos. Pide a Dirección de Producción uno nuevo.'],
    ],
    consejo: 'Registra en el momento, no al final del día. Si sales a ayudar a otra área o a instalaciones, pausa con ese motivo.',
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
