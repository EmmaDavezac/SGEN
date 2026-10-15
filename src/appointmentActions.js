/**
 * Matriz de acciones permitidas para un turno, según su estado y el rol de la sesión.
 *
 * Fuente única de verdad del flujo de turnos. Antes estas reglas estaban
 * duplicadas como comparaciones de strings sueltas dentro del JSX del
 * calendario, lo que provocaba que un turno cancelado se mostrara como
 * provisional y que el botón "Eliminar" apareciera en estados donde la
 * operación iba a fallar.
 *
 * Flujo acordado:
 *
 *   [Crear turno] ──► PROVISIONAL ──Confirmar (seña)──► RESERVADO ──Cobrar (turno ya pasado)──► COBRADO
 *                        │                                   │                                    │
 *                        │                            Reagendar (mover)                          │ (solo lectura)
 *                        │                            Cancelar (ya pasó, con motivo)              │
 *                        └ Eliminar (cualquier sesión)      └ Eliminar en cascada → solo superadmin      └ Eliminar en cascada → solo superadmin
 *
 * Cancelar no borra: el turno queda como cancelado con su motivo, la seña y el
 * historial siguen consultables. Eliminar borra la fila y solo aplica a
 * provisionales; el superadmin puede borrar en cascada (turno + servicio +
 * pagos) cualquier turno con confirmación explícita.
 *
 * El módulo no importa nada (ni supabase) para poder testearse en aislamiento.
 */

/** Estados normalizados del turno (igual semántica que `normalizeTurnoEstado` de services.js). */
export const ESTADO_PROVISIONAL = 'provisional';
export const ESTADO_RESERVADO = 'reservado';
export const ESTADO_COMPLETADO = 'completado';
export const ESTADO_CANCELADO = 'cancelado';

export const ESTADOS_TURNO = [
    ESTADO_PROVISIONAL,
    ESTADO_RESERVADO,
    ESTADO_COMPLETADO,
    ESTADO_CANCELADO
];

/** Texto visible de cada estado en la UI. */
export const ESTADO_LABEL = {
    [ESTADO_PROVISIONAL]: 'Provisional',
    [ESTADO_RESERVADO]: 'Reservado',
    [ESTADO_COMPLETADO]: 'Cobrado',
    [ESTADO_CANCELADO]: 'Cancelado'
};

export const APPOINTMENT_ACTIONS = {
    CONSULTAR: 'consultar',
    CONFIRMAR: 'confirmar',
    REAGENDAR: 'reagendar',
    COBRAR: 'cobrar',
    CANCELAR: 'cancelar',
    ELIMINAR: 'eliminar',
    SINCRONIZAR: 'sincronizar'
};

/**
 * Presentación de cada acción (props que consume `ListIconButton`).
 * `variant` limitada a la paleta de `LIST_VARIANT_CLASS` en Button.jsx
 * (primary / danger / success / warning / info / whatsapp).
 */
export const ACTION_META = {
    [APPOINTMENT_ACTIONS.CONSULTAR]: {
        icon: 'fa-eye',
        iconStyle: 'solid',
        label: 'Consultar',
        title: 'Consultar el turno',
        variant: 'primary'
    },
    [APPOINTMENT_ACTIONS.CONFIRMAR]: {
        icon: 'fa-check-double',
        iconStyle: 'solid',
        label: 'Confirmar',
        title: 'Cargar seña y confirmar',
        variant: 'info'
    },
    [APPOINTMENT_ACTIONS.REAGENDAR]: {
        icon: 'fa-calendar-plus',
        iconStyle: 'regular',
        label: 'Reagendar',
        title: 'Reagendar turno',
        variant: 'warning'
    },
    [APPOINTMENT_ACTIONS.COBRAR]: {
        icon: 'fa-dollar-sign',
        iconStyle: 'solid',
        label: 'Cobrar',
        title: 'Cobrar turno',
        variant: 'success'
    },
    [APPOINTMENT_ACTIONS.CANCELAR]: {
        icon: 'fa-ban',
        iconStyle: 'solid',
        label: 'Cancelar',
        title: 'Cancelar turno',
        variant: 'warning'
    },
    [APPOINTMENT_ACTIONS.ELIMINAR]: {
        icon: 'fa-trash-can',
        iconStyle: 'regular',
        label: 'Eliminar',
        title: 'Eliminar turno',
        variant: 'danger'
    },
    [APPOINTMENT_ACTIONS.SINCRONIZAR]: {
        icon: 'fa-cloud-arrow-up',
        iconStyle: 'solid',
        label: 'Sincronizar',
        title: 'Sincronizar con Google Calendar',
        variant: 'primary'
    }
};

/** Orden en que se dibujan los botones en la tarjeta del turno. */
export const ACTION_ORDER = [
    APPOINTMENT_ACTIONS.CONSULTAR,
    APPOINTMENT_ACTIONS.CONFIRMAR,
    APPOINTMENT_ACTIONS.REAGENDAR,
    APPOINTMENT_ACTIONS.COBRAR,
    APPOINTMENT_ACTIONS.CANCELAR,
    APPOINTMENT_ACTIONS.SINCRONIZAR,
    APPOINTMENT_ACTIONS.ELIMINAR
];

/**
 * Normaliza el estado crudo de la base a uno de ESTADOS_TURNO.
 * Acepta las variantes legadas ('completed', 'cobrado', 'pagado', 'reserved'…).
 * Un estado desconocido se trata como cancelado, NUNCA como provisional:
 * así un turno cancelado no hereda las acciones de uno activo.
 *
 * @param {string} raw
 * @returns {string} uno de ESTADOS_TURNO
 */
export function normalizeTurnoEstado(raw) {
    const value = (raw || '').toString().trim().toLowerCase();
    if (['completed', 'completado', 'cobrado', 'pagado'].includes(value)) return ESTADO_COMPLETADO;
    if (['reservado', 'reserved'].includes(value)) return ESTADO_RESERVADO;
    if (['cancelado', 'cancelled', 'canceled'].includes(value)) return ESTADO_CANCELADO;
    if (value === ESTADO_PROVISIONAL) return ESTADO_PROVISIONAL;
    return ESTADO_CANCELADO;
}

/** Etiqueta legible del estado normalizado. */
export function estadoLabel(estado) {
    return ESTADO_LABEL[normalizeTurnoEstado(estado)] || ESTADO_LABEL[ESTADO_CANCELADO];
}

/** Clase CSS de estado (badge de tarjeta y pildora del calendario). */
export function estadoBadgeClass(estado) {
    return normalizeTurnoEstado(estado);
}

/**
 * ¿Ya pasó el horario del turno?
 * Usa `horaFin` (el turno termina) y cae a `horaInicio` si no existe.
 * Si no hay fecha válida devuelve `false`: ante la duda no se habilita el cobro.
 *
 * @param {object} apt turno mapeado
 * @param {number} now epoch ms inyectable (para tests)
 */
export function isAppointmentPast(apt, now = Date.now()) {
    // Sin fecha válida no se habilita el cobro. Ojo: `new Date(0)` es 1970 y
    // pasaría el comparador, así que hay que descartar el dato ausente antes.
    const raw = apt?.horaFin || apt?.horaInicio || apt?.fecha;
    if (!raw) return false;
    const end = new Date(raw);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() <= now;
}

/**
 * Calcula las acciones de un turno.
 *
 * Devuelve SIEMPRE las siete acciones en ACTION_ORDER, con los flags
 * `visible` / `disabled` y el `reason` que explica cada restricción. El
 * listado filtra por `visible`; la ventana de consulta muestra todas para
 * que se entienda por qué una acción no está disponible.
 *
 * @param {object} apt turno mapeado (necesita `estado`, `horaFin`/`horaInicio`, `eventId`)
 * @param {object} ctx
 * @param {boolean} ctx.isAdmin admin o superadmin (habilita sincronizar con Google)
 * @param {boolean} ctx.isSuperadmin único rol que elimina reservados y cobrados
 * @param {boolean} ctx.isLoggedIn hay sesión activa (habilita eliminar provisionales)
 * @param {number} ctx.now epoch ms inyectable (para tests)
 * @returns {Array<{key: string, visible: boolean, disabled: boolean, reason: string|null}>}
 */
export function getAppointmentActions(apt, { isAdmin = false, isSuperadmin = false, isLoggedIn = false, now = Date.now() } = {}) {
    const estado = normalizeTurnoEstado(apt?.estado);
    const past = isAppointmentPast(apt, now);
    const yaSincronizado = Boolean(apt?.eventId);

    const build = (key, visible, disabled = false, reason = null) => ({
        key,
        ...ACTION_META[key],
        visible,
        disabled,
        reason
    });

    return [
        // Consultar: solo cuando el turno ya terminó (cobrado o cancelado).
        // Mientras está activo, el detalle está visible en la tarjeta y lo que
        // importa son las acciones; cuando ya no hay nada que hacer, esta es la
        // única puerta para ver el histórico del turno.
        build(
            APPOINTMENT_ACTIONS.CONSULTAR,
            estado === ESTADO_COMPLETADO || estado === ESTADO_CANCELADO,
            false,
            estado === ESTADO_COMPLETADO || estado === ESTADO_CANCELADO
                ? null
                : 'El detalle del turno se puede consultar cuando termine.'
        ),

        // Confirmar con seña: solo mientras el turno sea provisional.
        build(
            APPOINTMENT_ACTIONS.CONFIRMAR,
            estado === ESTADO_PROVISIONAL,
            false,
            estado === ESTADO_PROVISIONAL
                ? null
                : estado === ESTADO_CANCELADO
                    ? 'El turno está cancelado.'
                    : 'El turno ya fue confirmado con la seña.'
        ),

        // Reagendar: solo reservados que todavía no pasaron.
        // Un turno cuya hora ya llegó no se mueve: moverlo sería reescribir el
        // historial. Si la cliente no vino, la salida es cancelarlo con motivo.
        build(
            APPOINTMENT_ACTIONS.REAGENDAR,
            estado === ESTADO_RESERVADO && !past,
            false,
            estado !== ESTADO_RESERVADO
                ? estado === ESTADO_PROVISIONAL
                    ? 'Para cambiar la fecha de un turno provisional hay que cancelarlo y agendarlo de nuevo.'
                    : estado === ESTADO_CANCELADO
                        ? 'El turno está cancelado.'
                        : 'El turno ya está cobrado.'
                : past
                    ? 'El horario del turno ya pasó. Si la cliente no vino, cancelalo con el motivo.'
                    : null
        ),

        // Cobrar: solo reservados, y recién cuando pasó el horario.
        build(
            APPOINTMENT_ACTIONS.COBRAR,
            estado === ESTADO_RESERVADO,
            !past,
            estado !== ESTADO_RESERVADO
                ? estado === ESTADO_COMPLETADO
                    ? 'El turno ya fue cobrado.'
                    : estado === ESTADO_CANCELADO
                        ? 'El turno está cancelado.'
                        : 'Primero cargá la seña para confirmar el turno.'
                : past
                    ? null
                    : 'El turno todavía no pasó. Se puede cobrar cuando termine.'
        ),

        // Cancelar: solo reservados cuyo horario ya pasó (la cliente no vino).
        // Es la contracara de Cobrar y de Reagendar: cuando el turno ya pasó, la
        // manicurista solo puede cerrarlo (cobrado o cancelado), no moverlo.
        // A diferencia de eliminar, el turno queda como registro con su motivo,
        // así que la seña y el historial siguen consultables.
        build(
            APPOINTMENT_ACTIONS.CANCELAR,
            estado === ESTADO_RESERVADO && past && Boolean(isLoggedIn),
            false,
            estado === ESTADO_CANCELADO
                ? 'El turno ya está cancelado.'
                : estado === ESTADO_COMPLETADO
                    ? 'El turno ya fue cobrado.'
                    : estado === ESTADO_PROVISIONAL
                        ? 'Un turno provisional se elimina, no se cancela.'
                        : estado === ESTADO_RESERVADO && !past
                            ? 'Todavía no se puede cancelar: recién cuando pase el horario del turno.'
                            : isLoggedIn
                                ? null
                                : 'Iniciá sesión para cancelar turnos.'
        ),
        // Sincronizar con Google: reparación, solo admin y si falta el evento.
        build(
            APPOINTMENT_ACTIONS.SINCRONIZAR,
            Boolean(isAdmin) && !yaSincronizado,
            false,
            !isAdmin
                ? 'Solo una admin puede sincronizar con Google Calendar.'
                : yaSincronizado
                    ? 'El turno ya está sincronizado con Google Calendar.'
                    : null
        ),

        // Eliminar: provisional para cualquier sesión; el resto solo superadmin.
        build(
            APPOINTMENT_ACTIONS.ELIMINAR,
            estado === ESTADO_PROVISIONAL ? Boolean(isLoggedIn) : Boolean(isSuperadmin),
            false,
            estado === ESTADO_PROVISIONAL
                ? isLoggedIn
                    ? null
                    : 'Iniciá sesión para eliminar turnos.'
                : isSuperadmin
                    ? null
                    : 'Solo el superadmin puede eliminar turnos reservados, cobrados o cancelados.'
        )
    ];
}

/** Acciones que se dibujan como botones en la tarjeta del turno. */
export function getVisibleAppointmentActions(apt, ctx) {
    return getAppointmentActions(apt, ctx).filter((action) => action.visible);
}
