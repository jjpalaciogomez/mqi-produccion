import { Modal } from '../../ui.jsx'

// Ayuda de cada módulo de Pagos (misma información del programa anterior, ajustada a esta pantalla)
export const AYUDA = {
  jornadalito: {
    titulo: 'Jornada Litografía',
    acciones: [
      'Elige el día con la fecha o con <b>‹ Día anterior / Día siguiente ›</b>. Si ese día ya tiene un registro guardado, aparece el aviso azul y se muestra solo para consulta.',
      'La lista trae solo al personal de Litografía que liquida horas extra, con la hora de entrada estándar ya puesta.',
      'Escribe la <b>hora de salida</b> en formato 24 h con dos puntos, ej. <b>16:00</b>.',
      'Si alguien no trabajó, cambia su <b>Estado</b> a Incapacitado o No asistió — sus horas se bloquean solas.',
      'Pulsa <b>Guardar día</b> (arriba a la derecha). Si no alcanzas a terminar, usa <b>Guardar avance</b> y continúa más tarde.',
      'En <b>Horas extra de la semana</b> ves, solo para consulta, el total de horas extra de cada persona en la semana elegida (viernes a jueves), por tipo y sin valores en pesos.',
    ],
    notas: [
      'Las alertas de arriba muestran los días laborales sin registro de <b>esta semana</b> (hasta ayer) y de la <b>semana anterior</b> (viernes a jueves). Pulsa una fecha pendiente para ir a ella. Sábados, domingos y festivos no se marcan como pendientes.',
      'El formato de hora es estricto: HH:MM (07:00, no 7:00). Si está mal escrito, el campo se marca en rojo.',
      'La hora de salida siempre debe ser posterior a la de entrada — no se permiten turnos que crucen la medianoche.',
      '<b>Guardar día se bloquea</b> si falta o está mal alguna hora en las filas "Normal", pero solo en días laborales. En sábado, domingo o festivo, quien no digite nada simplemente no trabajó ese día.',
      '<b>Incapacitado</b> = con justificación. <b>No asistió</b> = sin justificación.',
      'Horas laboradas = (salida − entrada) − tiempo de almuerzo, según los parámetros de nómina.',
      'Un día ya guardado <b>no se puede modificar</b> desde aquí; solo Gerencia/Administrador puede usar <b>Corregir día</b>.',
      '<b>Llegadas tarde</b> (desde el 20/11/2026): en un día laboral con Estado Normal, si la entrada es posterior al inicio de jornada aparece «X′ tarde». Ese tiempo se suma al saldo pendiente en horas y se cancela con las próximas horas extra (HED, HEN, HEDF, HENF). Si la justificación hace que no deba devolverse, anótalo en Observación y ajusta la hora de entrada.',
    ],
  },
  jornadaindustrial: {
    titulo: 'Jornada Industrial',
    acciones: [
      'Elige el día con la fecha o con <b>‹ Día anterior / Día siguiente ›</b>. Si ese día ya tiene un registro guardado, aparece el aviso azul y se muestra solo para consulta.',
      'La lista trae al personal de todas las áreas menos Litografía que liquida horas extra, con la hora de entrada estándar ya puesta.',
      'Escribe la <b>hora de salida</b> en formato 24 h, ej. <b>16:00</b>. Si alguien no trabajó, cambia su <b>Estado</b>.',
      'Si alguien hizo una <b>segunda jornada</b> (p. ej. turno de noche), pulsa <b>+</b> en la columna «2ª jorn.» y escribe su entrada y salida. Si la salida es menor que la entrada, la casilla «día siguiente» se marca sola.',
      'El día siguiente a un turno nocturno, quien descansa se marca con el Estado <b>Descanso nocturno</b> (se bloquea la primera jornada, pero puede llevar una segunda).',
      'Pulsa <b>Guardar día</b>.',
    ],
    notas: [
      'Las alertas de arriba muestran los días laborales sin registro de esta semana y de la semana anterior (viernes a jueves). Pulsa una fecha para ir a ella.',
      '<b>Descanso nocturno</b>: ese día NO se descuenta de la nómina; cada día de descanso (de lunes a viernes sin festivo) genera 8 horas por devolver, que se cancelan con las horas extra de la semana del turno, en el orden HED, HEN, HEDF, HENF. Lo que no alcanza queda como saldo pendiente en horas — no se paga ni se descuenta en dinero.',
      '<b>Turno que pasa de la medianoche</b>: la primera jornada termina antes de la medianoche y la segunda empieza a esa misma hora con «día siguiente». Ej.: de 07:00 a 05:00 del día siguiente → primera 07:00–17:00 y segunda 17:00 → 05:00. El sistema no deja guardar jornadas que se cruzan.',
      'La segunda jornada puede terminar al día siguiente y durar hasta 16 horas, sin descuento de almuerzo. <b>Todas sus horas se pagan como extra</b> (diurnas HED, nocturnas HEN; en domingo o festivo HEDF / HENF).',
      '<b>Guardar día se bloquea</b> si falta o está mal alguna hora en las filas "Normal", solo en días laborales.',
      'Un día ya guardado <b>no se puede modificar</b> desde aquí; solo Gerencia/Administrador puede usar <b>Corregir día</b>.',
      'Es independiente de Jornada Litografía — no comparten filas ni datos.',
    ],
  },
  horasextra: {
    titulo: 'Horas extra semanal',
    acciones: [
      'Elige la semana (viernes a jueves) y el grupo: <b>Industrial</b> (todas las áreas menos Litografía) o <b>Litografía</b>. Cada grupo se maneja por separado.',
      'Arriba del cuadro aparece una alerta con los <b>días de la semana anterior que aún no tienen registro de Jornada</b>. Regístralos en Jornada antes de liquidar.',
      'Las horas salen solas de la Jornada. Para corregir a alguien, haz clic en su fila: se abre una ventana con sus horas por tipo, lo que dice la jornada y el valor. <b>Traer horas de la jornada</b> reemplaza todo el cuadro con lo calculado.',
      'Pulsa <b>Guardar semana</b>.',
      '<b>Resumen de la semana</b>: por empleado, qué días hicieron horas extra, las horas canceladas por descansos y llegadas tarde y el neto a pagar, con detalle día por día y descarga a Excel.',
      '<b>Saldos pendientes</b>: el conteo en horas por empleado (descansos y llegadas tarde) y su historial de movimientos.',
      '<b>Archivo Bancolombia</b>: arma el archivo de pago de la semana guardada (Industrial + Litografía juntos).',
    ],
    notas: [
      'Solo aparece quien tiene «¿Liquida horas extra?» = Sí en Empleados.',
      'Las columnas <b>Descuento por devolver</b>, <b>Neto a pagar</b> y <b>Saldo pendiente (h)</b> muestran cuántas horas se cancelan por descansos de turno nocturno y llegadas tarde y cuántas quedan para las próximas semanas. El cuadro guarda siempre las extras <b>brutas</b>; el descuento se aplica al exportar a Bancolombia y en los informes.',
      'Guardar un grupo no borra ni afecta al otro, aunque sea la misma semana.',
      'Para exportar, cada empleado necesita Banco, Cuenta y Cédula completos — a quien le falte algo se le avisa y queda fuera del archivo. Quien quede con neto $0 no aparece.',
      'Es un pago independiente: no se suma automáticamente a la nómina quincenal.',
      'Contabilidad solo consulta y exporta: no puede editar ni guardar el cuadro.',
    ],
  },
  nomina: {
    titulo: 'Nómina quincenal',
    acciones: [
      'Elige la quincena. El cuadro se llena solo con los días sugeridos desde Ausentismos.',
      'Haz clic en la persona que tuvo novedad: en la ventana cambias días, incapacidad, vacaciones, licencia, «Otros (+/-)» y la nota, y ves el cálculo hasta el neto. <b>Aplicar</b> deja el cambio en el cuadro (la fila queda en amarillo).',
      'Pulsa <b>Guardar quincena</b> (arriba). Si ya estaba guardada, se pide confirmar antes de reemplazarla.',
      '<b>Archivo Bancolombia</b> genera el archivo de pago con lo <b>guardado</b>. <b>Exportar Excel</b> baja el cuadro tal como se ve, en cualquier momento.',
    ],
    notas: [
      '15 días a remunerar por defecto; se restan los días de <b>Permiso</b> y <b>Ausentismo sin justa causa</b> (no se pagan ni generan auxilio de transporte).',
      'Incapacidad, Vacaciones y Licencia salen de <b>Ausentismos</b> (Incapacidad/Accidente de trabajo, Vacaciones y Calamidad). La licencia por calamidad se paga al 100 % del básico, sin auxilio de transporte.',
      '<b>Ingreso dentro de la quincena</b>: solo se remuneran los días desde su fecha de ingreso. <b>Retiro</b>: aparece en las quincenas en las que trabajó, con los días hasta su fecha de retiro (último día trabajado). La liquidación final se hace aparte.',
      '<b>Auxilio de transporte</b>: solo por los días realmente trabajados.',
      'Si registras o eliminas un ausentismo después de guardar la quincena, pulsa <b>Recalcular desde Ausentismos</b> (conserva Otros y Nota), revisa y guarda de nuevo.',
      '<b>Incapacidad</b>: subsidio al 66,67 % desde el día 1 para incapacidad común y al 100 % para accidente de trabajo.',
      '<b>Salud y pensión (4 % + 4 %)</b> se calculan sobre el IBC = básico + subsidio de incapacidad. A los <b>Jubilados</b> no se les descuenta pensión.',
      '<b>Programado</b> sale de Pagos Programados (pasa el mouse sobre el valor para ver el concepto). Al guardar por primera vez a una persona en la quincena, avanza una cuota.',
      '<b>Prestación de servicios</b>: valor neto del salario prorrateado, sin auxilio de transporte ni descuentos de salud/pensión.',
      'No incluye horas extra (van aparte) ni cesantías/prima/vacaciones.',
      'Contabilidad solo consulta y exporta: no puede editar, recalcular ni guardar.',
    ],
  },
  programados: {
    titulo: 'Pagos Programados',
    acciones: [
      'Pulsa <b>+ Nuevo programado</b>: elige el empleado, el concepto, el <b>Tipo</b> (Indefinido o A término fijo) y si <b>suma o descuenta</b>.',
      'En «A término fijo» escribe el <b>Monto total</b> y el <b>Número de quincenas</b>; el valor por quincena se calcula solo.',
      'Marca <b>¿Cuenta para conciliaciones?</b> = Sí solo si debe cruzarse contra una cuenta contable; elige el tipo de cuenta y la cuenta puntual (salen de la configuración de Causaciones).',
      'La tabla <b>Activos</b> muestra los vigentes, con <b>Cancelar</b>. <b>Finalizados y cancelados</b> es el histórico; ambas se filtran por empleado (y por estado) y se ordenan con clic en el encabezado.',
      'Para cambiar la conciliación de uno ya guardado, pulsa <b>Editar</b> en su fila.',
    ],
    notas: [
      'En «A término fijo» la última cuota absorbe el residuo del redondeo para que la suma cuadre exacto con el monto total.',
      'Se aplica solo cada vez que se guarda una quincena en Nómina, mientras esté Activo. <b>Quincena inicio</b> se llena sola la primera vez que se aplica.',
      'Cancelar no se puede deshacer (hay que crear uno nuevo). Un «A término fijo» pasa solo a Finalizado cuando se pagan todas sus quincenas.',
      'La conciliación es solo para contabilidad: no cambia el valor que se paga o descuenta.',
    ],
  },
  ausentismos: {
    titulo: 'Ausentismos',
    acciones: [
      'Pulsa <b>+ Registrar ausencia</b>: elige el empleado, el <b>Tipo</b> (Accidente de trabajo, Incapacidad, Ausentismo sin justa causa, Permiso, Calamidad o Vacaciones) y las fechas — los días se calculan solos.',
      'La tabla muestra por defecto lo que afecta la <b>quincena en curso</b>; cambia la quincena o filtra por empleado y tipo. «Días en esta quincena» cuenta solo lo que cae dentro de la quincena elegida.',
      '<b>Eliminar</b> borra el registro por completo (no se puede recuperar).',
    ],
    notas: [
      'Aquí se registra todo: incapacidad, accidente, ausencias, permisos, calamidad y <b>vacaciones</b>. Alimenta la Nómina quincenal, el saldo de Vacaciones y el informe de Ausentismo.',
      'Es independiente de la Jornada (que solo se usa para horas extra).',
      'Los días hábiles excluyen domingos y festivos (el sábado sí cuenta). <b>Incapacidad y Accidente de trabajo se cuentan en días calendario</b>, con quincena de 15 días.',
      'Incapacidad: 66,67 % (accidente 100 %), sin auxilio de transporte. Vacaciones y Calamidad: 100 % del básico, sin auxilio. Permiso y Ausentismo sin justa causa: no se pagan.',
      'Si la quincena ya estaba guardada en Nómina, usa <b>Recalcular desde Ausentismos</b> allá y guarda de nuevo.',
      'Contabilidad puede registrar ausencias, pero no eliminarlas.',
    ],
  },
  vacaciones: {
    titulo: 'Vacaciones',
    acciones: [
      'Esta pestaña muestra el <b>saldo</b>. Para registrar un período de vacaciones ve a <b>Ausentismos</b> con Tipo = «Vacaciones».',
      'Haz clic en una persona para ver todos sus registros. La tabla se ordena con clic en el encabezado y se descarga en Excel.',
    ],
    notas: [
      'Cada empleado causa <b>15 días hábiles por año</b>, contando desde su fecha de ingreso real.',
      'Los días hábiles excluyen domingos y festivos; el sábado sí cuenta.',
      'Lo disfrutado suma lo registrado históricamente y lo registrado en Ausentismos con Tipo = «Vacaciones».',
      'El «Saldo inicial Excel» es el dato del control anterior (corte 01/09/2026); se muestra aparte y no altera el cálculo.',
      'Vacaciones se paga al 100 % del básico, sin auxilio de transporte.',
    ],
  },
  informes: {
    titulo: 'Informes',
    acciones: [
      '<b>Novedades</b>: elige la quincena; filtra por empleado o tipo. El Excel respeta el filtro.',
      '<b>Costo de nómina</b>: elige cuántas quincenas mostrar; gráfica de tendencia y detalle.',
      '<b>Horas extra</b>: total por empleado (para ver sobrecargas recurrentes) y gráfica semana a semana. El valor es <b>neto</b> (ya descuenta descansos y llegadas tarde).',
      '<b>Ausentismo</b>: rango de fechas libre; días por tipo y por empleado.',
      '<b>Programados</b>: vista ejecutiva de préstamos y pagos a término.',
      '<b>Histórico por empleado</b>: evolución de pago de una persona (incluye retirados).',
      'Todas las tablas se ordenan con clic en el encabezado.',
    ],
    notas: [
      'Novedades junta lo de Nómina (incapacidad, otros, programados) con lo de Ausentismos; la columna «Fuente» dice de dónde salió.',
      'En Costo de nómina las horas extra son aproximadas: cada semana se suma a la quincena donde cae su último día.',
      'Los informes solo muestran lo guardado — no calculan ni modifican nada.',
    ],
  },
  causaciones: {
    titulo: 'Causaciones',
    acciones: [
      'Elige la quincena (debe estar guardada en Nómina) y pulsa <b>Generar causación</b>. Con <b>Previsualizar</b> la ves antes sin guardarla.',
      'En «Causaciones guardadas» haz clic en una quincena para ver su detalle; <b>Exportar Excel</b> baja las líneas listas para contabilidad.',
      '<b>Regenerar</b> borra las líneas de esa quincena y las vuelve a calcular con los datos de hoy. <b>Eliminar</b> la borra sin recalcular.',
    ],
    notas: [
      'Una causación generada no se recalcula sola: queda fija hasta que se regenere a propósito. Solo se genera una vez por quincena.',
      'El centro de costo se reparte en partes iguales entre los del área (la última parte absorbe el redondeo).',
      'Incapacidad: los primeros 2 días son gasto; del día 3 en adelante, si está configurada la cuenta por cobrar a EPS/ARL, se causa como cuenta por cobrar.',
      'Los empleados de empresas temporales se causan de forma simplificada (solo el total devengado).',
      'A los Jubilados no se les causa aporte patronal de pensión.',
      'Contabilidad consulta y descarga, pero no genera, regenera ni elimina. La configuración contable la edita Gerencia/Administrador.',
    ],
  },
  empleados: {
    titulo: 'Empleados',
    acciones: [
      'Agregar: <b>+ Nuevo empleado</b> (obligatorios: Cédula, Nombre, Salario, Área, EPS, Fondo de pensión, ARL y Caja de Compensación).',
      'Editar: haz clic en cualquier parte de la fila.',
      'Dar de baja: <b>Desactivar</b> a la derecha de la fila — pregunta la fecha de retiro (vacía = hoy). Pasa a «Retirados», que solo ve Gerencia/Administrador, desde donde se puede <b>Reactivar</b>.',
    ],
    notas: [
      'Un empleado inactivo deja de aparecer en Nómina y Horas extra (salvo en la quincena de su retiro).',
      'Área, EPS, Fondo de pensión, ARL y Caja se eligen de las listas de la configuración de Causaciones.',
      '«Jubilado» en Fondo de pensión: no se descuenta el 4 % de pensión ni se causa el aporte patronal.',
      '«¿Liquida horas extra? = No» lo quita solo del cuadro de horas extra.',
      '«Documento para conciliaciones» solo se llena si el banco usa un documento distinto (p. ej. extranjeros).',
      'Carga también los datos personales (cumpleaños, correo, dirección, teléfono, contacto de emergencia): el aviso de cumpleaños usa la fecha de cumpleaños.',
    ],
  },
}

export function ModalAyuda({ a, onClose }) {
  return (
    <Modal titulo={`Ayuda · ${a.titulo}`} onClose={onClose} ancho={780}>
      <div className="ayuda">
        <h4>Cómo se usa</h4>
        <ol>{a.acciones.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}</ol>
        <h4>Ten en cuenta</h4>
        <ul>{a.notas.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}</ul>
      </div>
    </Modal>
  )
}
