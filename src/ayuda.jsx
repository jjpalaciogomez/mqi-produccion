import { useState } from 'react'
import { Modal } from './ui.jsx'

// Instructivos por pantalla y rol. Cada uno: para qué sirve, pasos o funciones, y un consejo.
// Roles: 'gestor' (Administrador), 'consulta', 'tablet'.
const AYUDA = {
  'tablero.gestor': {
    titulo: 'Tablero de planta',
    proposito: 'Ver de un vistazo todas las OPs en planta y cuáles necesitan atención.',
    puntos: [
      ['Cumplimiento según programación', 'Compara la fecha en que termina la OP según la programación (más los días de terceros que van al final) con la fecha de entrega: A tiempo · Justa (1 día hábil o menos de margen) · No alcanza · Programación incompleta · Sin programar · Vencida · Lista para entregar.'],
      ['Alertas y pendientes', 'Lo que requiere acción: enviar a terceros, terceros atrasados, horas que faltan por programar, pasos sin tiempo estándar.'],
      ['Leer el avance', '% de los minutos estándar ya terminados. "Pasos" muestra cuántos van de cuántos.'],
      ['Filtrar y buscar', 'Activas, Ocultas, Terminadas o Todas. Busca por número de OP, cliente o proyecto.'],
      ['Ocultar una OP', 'Dentro de la OP, "Ocultar OP" la saca del tablero, la programación y las tablets hasta una fecha (o hasta que la muestres). Útil para OPs con plazo amplio que aún no se van a trabajar.'],
      ['Abrir una OP', 'Haz clic en la fila para ver sus alertas, las horas por área, sus ítems, pasos y el mapa.'],
      ['Crear una OP', 'Botón "+ Nueva OP".'],
    ],
    consejo: 'Cada mañana revisa primero las que dicen No alcanza o Vencida y atiende los envíos a terceros: son los que definen la prioridad del día.',
  },
  'tablero.consulta': {
    titulo: 'Tablero de planta',
    proposito: 'Consultar el estado de las OPs sin tener que llamar a la planta.',
    puntos: [
      ['Cumplimiento según programación', 'Compara la fecha en que termina la OP según la programación (más los días de terceros que van al final) con la fecha de entrega: A tiempo · Justa (1 día hábil o menos de margen) · No alcanza · Programación incompleta · Sin programar · Vencida · Lista para entregar.'],
      ['Alertas y pendientes', 'Lo que requiere acción: enviar a terceros, terceros atrasados, horas que faltan por programar, pasos sin tiempo estándar.'],
      ['Leer el avance', '% del trabajo estándar ya terminado y pasos hechos de los totales.'],
      ['Buscar', 'Por número de OP, cliente o proyecto.'],
      ['Ver detalle', 'Haz clic en la fila para ver sus pasos y el mapa del proyecto.'],
    ],
    consejo: 'Si necesitas cambiar una fecha o prioridad, pídelo al Administrador: tu acceso es solo de lectura.',
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
      ['Usuarios', 'Solo el Administrador: crea cuentas con correo y contraseña, asigna su permiso (Administrador, Consulta o Tablet de un área), cambia contraseñas y elimina usuarios.'],
      ['Personas', 'Agrega operarios: aparecen en la tablet de su área para registrar su tiempo. Usa "Activo" para retirar a alguien sin borrar su historial.'],
      ['Productos y rutas', 'Crea o edita productos, familias y rutas. Cada proceso de la ruta lleva sus minutos para una unidad del tamaño de referencia. Un producto de terceros puede tener pasos previos en planta (ej. plantillas en Madera) antes del envío al proveedor.'],
      ['Procesos', 'Crea procesos nuevos (también de terceros, ej. Tapizado) y ajusta el tiempo del ensamble final de cada área. Un ítem multiárea puede tener varios ensambles (uno por área), se eligen en el detalle de la OP.'],
      ['Procesos de máquina', 'Imprimir, corte láser, corte plotter y DTF no llevan dificultad. Se configuran por montaje: cuánto carga cada montaje (área de la cama o del tramo de rollo, en cm² en los procesos por m²), cuántos minutos trabaja la máquina y cuántos pone el operario montando y cambiando material. La columna "Qué significa" lo traduce a rendimiento por hora y montajes por jornada. "Cantidad de máquinas" dice cuántas iguales hay (hay 3 impresoras): cada una trabaja un montaje a la vez y la programación las usa en paralelo.'],
      ['Dificultad', 'Multiplicadores de Baja, Media y Alta.'],
      ['Estándar real', 'Compara lo real con lo estándar por producto y área, y sugiere el nuevo valor. "Aplicar" lo actualiza.'],
    ],
    consejo: 'Actualiza un estándar solo cuando tenga 10 o más pasos medidos. Con menos datos, una tarea atípica distorsiona el número.',
  },
  'indicadores.gestor': {
    titulo: 'Indicadores',
    proposito: 'Ver en un solo lugar cómo va la planta: cumplimiento, carga, eficiencia, paros y personal. Se actualiza solo cada minuto.',
    puntos: [
      ['Periodo', 'Arriba eliges últimos 7 días, últimos 30 días o el mes actual. La carga pendiente y las OPs activas siempre son de hoy.'],
      ['Colores', 'Verde: bien · Amarillo: atención · Rojo: problema. Pasa el mouse sobre una barra para ver el detalle.'],
      ['Eficiencia', '100% = la planta produce al ritmo del estándar. Menos de 100% = tarda más de lo previsto.'],
      ['Carga por área', 'Horas estándar pendientes y cuántos días de trabajo son con el personal actual del área.'],
      ['Máquinas', 'Horas de máquina pendientes y trabajadas en el periodo, con su uso frente a la jornada. No se suman a las horas del personal ni a la eficiencia.'],
      ['OPs que requieren atención', 'Toca una fila para abrir la OP.'],
    ],
    consejo: 'Úsalo en la reunión semanal: primero las OPs vencidas o en riesgo, luego el área con más días de carga y por último los paros más frecuentes.',
  },
  'horas.gestor': {
    titulo: 'Horas del personal',
    proposito: 'Ver cuánto tiempo registró cada operario frente a su jornada, para detectar tiempos sin registrar o inflados.',
    puntos: [
      ['Día', 'Tiempo en tareas y en paros de cada persona, la diferencia con la jornada y su estado. "Detalle" muestra cada registro con su hora, OP, proceso y cantidad.'],
      ['Semana', 'Cuadro de lunes a sábado con el total de cada día. Rojo: sin registros · Amarillo: incompleto · Verde: completo · Azul: posible tiempo extra.'],
      ['Estados', 'Incompleto: menos del 90% de la jornada. Posible tiempo extra: más de 15 minutos por encima de la jornada.'],
    ],
    consejo: 'Revísalo al cierre de cada día: es más fácil corregir un registro el mismo día que una semana después. Las correcciones se hacen en el detalle de la OP, botón "Registros".',
  },
  'programacion.gestor': {
    titulo: 'Programación de planta',
    proposito: 'Decidir qué proyecto trabaja cada área, cada día y a qué hora. Las tablets muestran primero lo programado para hoy.',
    puntos: [
      ['Semana', 'Filas = áreas, columnas = días. La barra de cada celda compara las horas-persona programadas con la capacidad del área (operarios × jornada): verde bien, amarillo casi lleno, rojo sobrecargado. Toca el día para verlo por horas.'],
      ['Día', 'Agenda por horas con una columna por área. Los bloques que se cruzan van lado a lado: varios operarios o trabajos cortos en simultáneo.'],
      ['Programar (automático)', 'Toca "+ Programar", una celda o "Programar" en la tabla de abajo. Eliges la OP, el área, desde qué día y hora, y las horas hombre (vienen llenas con lo pendiente). El sistema reparte en los días hábiles: lo que no cabe en la jornada pasa al día siguiente, sin pasarse de las horas hombre del área (o de los operarios elegidos) ni de las horas de cada máquina. Ves el plan antes de confirmar.'],
      ['OP completa', 'Programa todas las áreas de una OP de una vez, en el orden de sus pasos: cada proceso empieza cuando terminan los anteriores de su producto, el ensamble cuando terminan todos los productos del ítem y los terceros ocupan sus días hábiles. Si un día no tiene espacio, pasa al siguiente. Puede reemplazar lo que ya estaba programado de esa OP.'],
      ['Pintura', 'Mientras Pintura no tenga operarios activos, la hacen los de Metal: el sistema programa la pintura dentro de la capacidad de Metal y la muestra en la tablet de Metal.'],
      ['Instalación', 'Solo hace ensambles multiárea: cuando los instaladores no tienen trabajo de calle ayudan con los ensambles. Se elige "INSTALACION" como área del ensamble en el detalle de la OP, sus ensambles salen en todas las tablets y los instaladores (personas del área Instalación) aparecen en todas para registrar.'],
      ['Gran Formato', 'Programa varios proyectos a la misma hora: el límite son las horas hombre del área y las de cada máquina (impresora, láser, plotter, DTF). Cada celda muestra la carga en horas hombre y el uso de cada máquina.'],
      ['Horas extra', 'Botón "Horas extra": eliges el día, el área o toda la planta y hasta qué hora se quedan. Sábados, domingos y festivos no tienen jornada normal: ahí se pone desde y hasta qué hora se trabaja. Los festivos de Colombia salen marcados en el calendario y no se programa trabajo normal en ellos. Para mover lo ya programado y aprovechar las horas extra, usa "Reorganizar programación".'],
      ['Reorganizar programación', 'Rehace toda la programación automática desde ahora probando varios órdenes entre OPs, para que se cumpla la mayor cantidad de entregas. Muestra antes y después y cuáles no alcanzan con la capacidad actual. Los bloques hechos a mano no se tocan.'],
      ['Programar todo lo pendiente', 'Programa todas las OPs que faltan, en orden de prioridad y fecha de entrega, y marca en rojo las que terminarían después de su entrega.'],
      ['Manual', 'Para un horario fijo, elige "Manual" en la ventana de programar. Un bloque guardado se puede editar, copiar al siguiente día o quitar (solo él, o todos los bloques de esa programación).'],
      ['Trabajo por programar', 'Abajo: horas estándar pendientes de cada OP por área frente a lo ya programado. "Programar" abre el bloque con la OP y el área listas.'],
      ['Tablet', 'Muestra lo programado hoy con su horario y operarios. Lo demás queda en "Ver otros proyectos", para urgencias o adelantos. Tiene su propia vista del calendario.'],
    ],
    consejo: 'Programa el día siguiente antes de terminar la jornada y usa "Copiar al…" en los bloques que se repiten.',
  },
  'logistica.gestor': {
    titulo: 'Logística',
    proposito: 'Pedir entregas, recogidas y diligencias, y armar con ellas la ruta de cada día, aprovechando primero el camión de MQI.',
    puntos: [
      ['Ruta del día', 'Columnas: Sin asignar, Camión MQI y Mensajero (y "Otro transporte" si hace falta). "Proponer asignación" llena primero el camión (lo que necesita camión y lo urgente) mientras cumpla los horarios y regrese a tiempo; lo que no cabe va con mensajero. Puedes mover cada vuelta, subirla o bajarla.'],
      ['Horarios', 'Cada vuelta dice cuándo: cualquier hora, mañana, tarde, a una hora exacta (p. ej. para coordinar con Instalaciones) o entre dos horas. Cada cliente o proveedor tiene su horario de recepción por días (p. ej. L-V 8–12 y 2–5, S 8–12) y su tiempo en el sitio. Al pedir la vuelta se avisa si ese día no reciben o si la hora pedida no cae en su horario.'],
      ['Volver a la planta', 'Al pedir una vuelta se puede marcar "Después de esta vuelta el camión debe volver a la planta a dejar lo que trae", lo antes posible o antes de una hora. También existe el tipo "Regreso a la planta" para que el camión esté en la planta a una hora (p. ej. a traer algo que se necesita). En la ruta y en el celular del conductor ese paso aparece como una parada más (P · Planta MQI) con su hora estimada, y entra en el recorrido de Google Maps.'],
      ['Recoger en la planta', 'En una entrega se puede marcar "Antes, el camión debe pasar por la planta a recoger la mercancía" y desde qué hora estará lista. La ruta hace pasar el camión por la planta a esa hora antes de ir al cliente. "Cuándo: A partir de una hora" sirve para vueltas que no se pueden hacer antes de cierta hora.'],
      ['Sacar de la ruta', 'Cada parada tiene "Sacar" (vuelve a Sin asignar) y cada ruta "Sacar todas", para reorganizar. Si la ruta ya está confirmada, primero "Volver a borrador".'],
      ['Guardar como recurrente', 'Al abrir una vuelta a un sitio que no está guardado (aunque ya se haya hecho), "Guardar como recurrente" lo crea como cliente, proveedor u otro con sus datos.'],
      ['Horas', 'Todas las horas se eligen de una lista en formato de 12 horas (8:00 a. m., 2:30 p. m.). El horario de recepción de cada cliente o proveedor es obligatorio: "Tiene horario" (días y horas de cada franja) o "Recibe a cualquier hora".'],
      ['Ordenar', 'Arma el orden respetando todo: la hora pedida, el horario de recepción de cada sitio, la salida de la planta, el almuerzo y la hora de regreso. Si se llega antes de que reciban, se espera. Cada parada muestra a qué hora llega y sale; en rojo lo que queda por fuera de su horario o el día que el sitio no recibe.'],
      ['Punto de salida y horarios', 'Ubicación de la planta, hora de salida, hora en que debe regresar, almuerzo (desde qué hora y cuánto dura), tiempo promedio en cada sitio y margen para la hora exacta. El viaje se estima por distancia (línea recta × 1,4 a 22 km/h) hasta conectar el GPS.'],
      ['Confirmar ruta', 'Al confirmarla, el conductor la ve en su celular y ya no se mueve. "Volver a borrador" para cambiarla.'],
      ['Lo que no se hizo', 'Lo pendiente o lo que "No se pudo" de días anteriores aparece en Sin asignar con la fecha original, para volver a programarlo.'],
      ['Clientes y proveedores', 'Sitios recurrentes con dirección, contacto, teléfono, horario y ubicación. Al pedir una vuelta, elegirlos llena todo solo. También se guardan marcando "Guardar este sitio como recurrente".'],
      ['Ubicación', 'Pega el link completo de Google Maps (no el corto maps.app.goo.gl) o las coordenadas: en Google Maps mantén presionado el punto y copia los números que aparecen.'],
      ['Permisos', '"Pide vueltas" (compras, Litografía…) solo ve Logística: pide vueltas y guarda clientes y proveedores. "Conductor" ve en el celular la ruta confirmada del día, con botones para Maps, Waze, llamar, y marcar "Hecha" o "No se pudo".'],
    ],
    consejo: 'Arma y confirma la ruta del día siguiente en la tarde; el conductor la tiene lista al llegar.',
  },
  'logistica.consulta': {
    titulo: 'Pedir vueltas',
    proposito: 'Pedir entregas, recogidas y diligencias para que se programen en la ruta del camión o con mensajero.',
    pasos: [
      'Toca "+ Pedir vuelta".',
      'Elige el cliente o proveedor guardado (se llenan dirección, contacto y teléfono) o escribe el sitio. Si vas a volver a ir, marca "Guardar este sitio como recurrente".',
      'Pon el día y la franja (mañana, tarde o cualquier hora) o, si hay que coordinarla (p. ej. con Instalaciones), la hora exacta; qué se lleva o se recoge y, si aplica, la OP.',
      'Marca "Necesita camión" si es grande o pesado, y "Urgente" si no puede esperar.',
      'En "Las que pedí" ves si ya está asignada, confirmada, hecha o si no se pudo. Mientras la ruta no esté confirmada, puedes corregirla o cancelarla.',
    ],
    consejo: 'Pídela con un día de anticipación: la ruta se arma y se confirma la tarde anterior.',
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
      'Los procesos de máquina (imprimir, cortes, DTF) no llevan tiempo: toca "Marcar", tu nombre y luego "Avanzado" cuando quedó montado o "Listo" cuando terminó. El sistema te abona el tiempo de montaje y cambio de material.',
      'La pantalla inicial muestra los proyectos programados para hoy con su horario. Si necesitas otro, toca "Ver otros proyectos". El botón "Programación" muestra el calendario del área.',
      'Si estuviste parado (servicio a otra área, permiso, EPS, ordenar y asear…), toca "Registrar paro", elige el motivo y el tiempo.',
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
