/**
 * Helper puro para mostrar progreso REAL en operaciones de escritura remota
 * (crear / modificar / eliminar en Supabase + sincronizar con Google Calendar).
 *
 * No toca la UI: solo ejecuta una lista de pasos en orden y va reportando el
 * estado de cada uno (pendiente → en curso → hecho / error). Si un paso falla,
 * lo marca en rojo, detiene la secuencia y re-lanza el error para que el
 * llamador muestre su aviso actual. Al ser puro, es testeable sin montar React.
 */

export const STEP_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    ERROR: 'error',
};

/**
 * Convierte definiciones `{ label, run }` en estados iniciales (todo pendiente).
 * @param {Array<{id?: string, label: string, run: () => any}>} defs
 * @returns {Array<{id: string, label: string, status: string}>}
 */
export function createSteps(defs) {
    return defs.map((def, index) => ({
        id: def.id || `step-${index}`,
        label: def.label,
        status: STEP_STATUS.PENDING,
    }));
}

/**
 * Ejecuta los pasos en secuencia reportando el progreso en cada transición.
 * @param {Array<{id?: string, label: string, run: () => Promise<any>|any}>} defs
 * @param {(steps: Array<{id:string,label:string,status:string}>) => void} [onProgress]
 *        Se llama con una copia inmutable del estado tras cada cambio.
 * @returns {Promise<any>} El resultado del último paso ejecutado.
 * @throws Re-lanza el error del paso fallido (ese paso queda en estado ERROR).
 */
export async function runSteps(defs, onProgress) {
    const steps = createSteps(defs);
    const emit = () => {
        if (typeof onProgress === 'function') {
            onProgress(steps.map((step) => ({ ...step })));
        }
    };

    emit();

    let result;
    for (let index = 0; index < defs.length; index += 1) {
        steps[index].status = STEP_STATUS.RUNNING;
        emit();
        try {
            // eslint-disable-next-line no-await-in-loop -- el orden de los pasos importa
            result = await defs[index].run();
            steps[index].status = STEP_STATUS.DONE;
            emit();
        } catch (error) {
            steps[index].status = STEP_STATUS.ERROR;
            emit();
            throw error;
        }
    }
    return result;
}
