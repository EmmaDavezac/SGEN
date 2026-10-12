/**
 * Navegación entre pestañas para abrir la ficha de una clienta.
 *
 * Los paneles (Agenda, Historial, Clientes) no se conocen entre sí: App.jsx solo
 * decide qué pestaña se ve. Para poder decir "mostrame la ficha de esta clienta"
 * desde una venta se usa un evento global en window: quien navega cambia de
 * pestaña y dispara el evento, y Clientes lo escucha para abrir la ficha.
 */
export const CLIENTE_ABRIR_EVENTO = 'evolet:abrir-cliente';

// Último id pedido. Si ClientsPanel todavía no está montado (ocurre justo al
// cambiar de pestaña: el evento se dispara antes de que React monte el panel),
// el evento se pierde, así que se deja guardado acá y el panel lo consume al
// montar o cuando termina de cargar las clientas.
let pendiente = null;

/** Dispara el evento; Clientes debe estar montado para reaccionar. */
export function pedirAbrirCliente(clienteId) {
    if (!clienteId || typeof window === 'undefined') return;
    pendiente = clienteId;
    window.dispatchEvent(new CustomEvent(CLIENTE_ABRIR_EVENTO, { detail: { clienteId } }));
}

/** Devuelve el id pendiente (una sola vez) o null si no hay ninguno. */
export function consumirClientePendiente() {
    const id = pendiente;
    pendiente = null;
    return id;
}
