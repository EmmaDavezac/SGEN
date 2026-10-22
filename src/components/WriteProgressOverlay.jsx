import React from 'react';
import { createPortal } from 'react-dom';
import { STEP_STATUS } from '../progressTask.js';

/**
 * Pantalla de carga única y reutilizable para toda operación de escritura
 * remota (crear / modificar / eliminar). Cubre toda la interfaz (hereda
 * `.loader-overlay`, z-index 150000: por encima de `.modal-overlay`, 100000,
 * para que el progreso se vea incluso con un ConfirmModal todavía abierto)
 * para que no se pueda interactuar mientras dura la operación y evitar
 * errores desde la UI.
 *
 * Se monta por portal en `document.body` (igual que `Modal`): los ConfirmModal
 * viven en body, y así ambas capas compiten en el mismo stacking context sin
 * depender del árbol de la app.
 *
 * Dos presentaciones:
 *  - `indeterminate` (sin pasos): corazón animado + texto, igual al loader de
 *    login/recuperación. Para operaciones de un solo paso.
 *  - `steps` (con pasos): corazón + título + checklist con el estado real de
 *    cada paso (pendiente / en curso / hecho / error), para operaciones con
 *    varias etapas (p. ej. agendar un turno).
 *
 * Es solo visual: no toca el estado de los formularios. Si algo falla, el paso
 * queda en rojo un instante y el llamador re-lanza el error para mostrar el
 * aviso; la información ya escrita se conserva para reintentar.
 */
function WriteProgressOverlay({ task }) {
    if (!task) return null;

    const steps = Array.isArray(task.steps) ? task.steps : null;
    const mode = steps && steps.length > 0 ? 'steps' : 'indeterminate';

    if (mode === 'indeterminate') {
        return createPortal(
            <div className="loader-overlay" aria-live="polite" aria-busy="true">
                <div className="spinner-container">
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                    <p>{task.title || 'Cargando...'}</p>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="loader-overlay write-progress-overlay" aria-live="polite" aria-busy="true">
            <div className="write-progress-card">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                <h3 className="write-progress-title">{task.title || 'Guardando...'}</h3>
                <ul className="write-progress-steps">
                    {steps.map((step) => (
                        <li
                            key={step.id}
                            className={`write-progress-step is-${step.status}`}
                        >
                            <span className="write-progress-step-icon" aria-hidden="true">
                                {step.status === STEP_STATUS.DONE && <i className="fa-solid fa-check"></i>}
                                {step.status === STEP_STATUS.RUNNING && <i className="fa-solid fa-spinner fa-spin"></i>}
                                {step.status === STEP_STATUS.ERROR && <i className="fa-solid fa-xmark"></i>}
                                {step.status === STEP_STATUS.PENDING && <i className="fa-regular fa-circle"></i>}
                            </span>
                            <span className="write-progress-step-label">{step.label}</span>
                        </li>
                    ))}
                </ul>
                <p className="write-progress-note">
                    Estamos guardando tu información, no cierres la app.
                </p>
            </div>
        </div>,
        document.body
    );
}

export default WriteProgressOverlay;
