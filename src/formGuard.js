/**
 * Guardia de formularios sin guardar.
 *
 * Los paneles avisan, con `useFormGuard`, que tienen un formulario de
 * creación o de edición abierto. App se suscribe con `subscribeToFormGuard`
 * para pedir confirmación antes de cambiar de pestaña desde la navegación
 * inferior: sin ese aviso, el cambio desmonta el panel y pierde los datos en
 * silencio (el mismo riesgo que ya cubren los botones `Volver` con sus
 * confirmaciones de descarte).
 *
 * Como pueden convivir varios formularios (una ficha en edición detrás de un
 * modal, p. ej.), el estado global se calcula con un contador de guardias
 * activos en lugar de un simple flag.
 */

import { useEffect } from 'react';

let activeGuards = 0;
const subscribers = new Set();

function notifySubscribers() {
    const isActive = activeGuards > 0;
    subscribers.forEach((listener) => listener(isActive));
}

/**
 * Suscribe un listener al estado global del guardia. Se invoca de inmediato
 * con el estado actual y después con cada cambio. Devuelve la función de baja.
 *
 * @param {(isActive: boolean) => void} listener
 * @returns {() => void}
 */
export function subscribeToFormGuard(listener) {
    subscribers.add(listener);
    listener(activeGuards > 0);
    return () => subscribers.delete(listener);
}

/**
 * Declara que hay un formulario abierto mientras `active` sea verdadero. Al
 * cerrar el formulario (o al desmontar el panel) el guardia se libera solo.
 *
 * @param {boolean} active
 */
export function useFormGuard(active) {
    useEffect(() => {
        if (!active) return undefined;
        activeGuards += 1;
        notifySubscribers();
        return () => {
            activeGuards -= 1;
            notifySubscribers();
        };
    }, [active]);
}