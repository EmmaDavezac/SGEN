/**
 * Atajo global de "volver".
 *
 * Los botones `Volver` (`.btn-back`) de cada pantalla son la única fuente de
 * verdad de la navegación hacia atrás: en lugar de duplicar su lógica, este
 * módulo los "aprieta" programáticamente (`.click()`), de modo que heredan sus
 * confirmaciones de cambios sin guardar y cualquier otro efecto que ya tengan.
 */

/**
 * Presiona el botón `Volver` visible de la pantalla actual, si existe.
 *
 * @returns {boolean} true si había un Volver visible y se presionó.
 */
export function pressVisibleBackButton() {
    // Si hay un modal (o una confirmación) abierto, el `Esc` es suyo: no se
    // atraviesa para apretar el Volver que quedó debajo.
    if (document.querySelector('.modal-overlay')) return false;

    const backButton = Array.from(document.querySelectorAll('.btn-back')).find(
        (button) => !button.disabled && button.getClientRects().length > 0
    );
    if (!backButton) return false;

    // Pulsación simulada: el click programático no dispara :active, así que se
    // marca la clase a mano y se quita apenas pasó el gesto.
    backButton.classList.add('is-pressed');
    window.setTimeout(() => backButton.classList.remove('is-pressed'), 200);

    backButton.click();
    return true;
}
