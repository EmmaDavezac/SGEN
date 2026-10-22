/**
 * Rate limit de inicio de sesión (lado cliente).
 *
 * Registra los intentos fallidos en localStorage y bloquea el ingreso durante
 * un tiempo creciente fijo cuando se agotan los intentos permitidos dentro de
 * la ventana de medición. Se limpia al iniciar sesión con éxito.
 *
 * IMPORTANTE: esta medida es de experiencia de uso (frena fuerza bruta básica
 * desde un mismo navegador). La protección real debe venir del servidor:
 * Supabase Auth ya aplica límites propios y RLS sigue siendo la autorización.
 */

export const LOGIN_RATE_LIMIT_KEY = 'evolet_login_rate_limit_v1';

export const LOGIN_RATE_LIMIT = {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockMs: 60000,
};

const EMPTY_STATE = Object.freeze({
    attempts: 0,
    remainingAttempts: LOGIN_RATE_LIMIT.maxAttempts,
    lockedUntil: 0,
    lockedMs: 0,
});

function getStorage(storage) {
    if (storage !== undefined) return storage;
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch (error) {
        console.warn('No se pudo acceder al almacenamiento para el rate limit:', error);
        return null;
    }
}

function readRawState(storage) {
    if (!storage) return { attempts: [], lockedUntil: 0 };
    try {
        const raw = storage.getItem(LOGIN_RATE_LIMIT_KEY);
        if (!raw) return { attempts: [], lockedUntil: 0 };
        const parsed = JSON.parse(raw);
        return {
            attempts: Array.isArray(parsed.attempts)
                ? parsed.attempts.filter((value) => Number.isFinite(value))
                : [],
            lockedUntil: Number.isFinite(parsed.lockedUntil) ? parsed.lockedUntil : 0,
        };
    } catch (error) {
        console.warn('No se pudo leer el estado de intentos de ingreso:', error);
        return { attempts: [], lockedUntil: 0 };
    }
}

function writeRawState(storage, state) {
    if (!storage) return;
    try {
        storage.setItem(LOGIN_RATE_LIMIT_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('No se pudo guardar el estado de intentos de ingreso:', error);
    }
}

function normalize(raw, now) {
    // Bloqueo vencido: se libera y se reinicia la ventana de intentos.
    if (raw.lockedUntil && raw.lockedUntil <= now) {
        return { attempts: [], lockedUntil: 0 };
    }

    // Descarta los intentos fuera de la ventana de medición.
    const windowStart = now - LOGIN_RATE_LIMIT.windowMs;
    const attempts = raw.attempts.filter((value) => value > windowStart);

    // Sin bloqueo y sin intentos vigentes: estado limpio.
    if (!raw.lockedUntil && attempts.length === 0) {
        return { attempts: [], lockedUntil: 0 };
    }

    return { attempts, lockedUntil: raw.lockedUntil };
}

function toPublicState(raw, now) {
    const attempts = raw.attempts.length;
    return {
        attempts,
        remainingAttempts: Math.max(0, LOGIN_RATE_LIMIT.maxAttempts - attempts),
        lockedUntil: raw.lockedUntil,
        lockedMs: raw.lockedUntil > now ? raw.lockedUntil - now : 0,
    };
}

/**
 * Devuelve el estado actual del rate limit para la fecha `now`.
 * Los intentos fuera de la ventana y los bloqueos vencidos se descartan aquí,
 * por lo que sirve también para renovar el estado en pantalla.
 */
export function readLoginRateState(now = Date.now(), storage = undefined) {
    const resolvedStorage = getStorage(storage);
    const normalized = normalize(readRawState(resolvedStorage), now);

    // Sincroniza el almacenamiento cuando el estado quedó viejo.
    const stored = readRawState(resolvedStorage);
    if (normalized.attempts.length !== stored.attempts.length || normalized.lockedUntil !== stored.lockedUntil) {
        writeRawState(resolvedStorage, normalized);
    }

    return toPublicState(normalized, now);
}

/**
 * Registra un intento fallido de ingreso y devuelve el estado resultante.
 * Al llegar a `maxAttempts` dentro de la ventana, activa el bloqueo.
 */
export function registerFailedLoginAttempt(now = Date.now(), storage = undefined) {
    const resolvedStorage = getStorage(storage);
    const normalized = normalize(readRawState(resolvedStorage), now);
    const attempts = [...normalized.attempts, now];

    const raw = {
        attempts,
        lockedUntil: attempts.length >= LOGIN_RATE_LIMIT.maxAttempts
            ? now + LOGIN_RATE_LIMIT.lockMs
            : 0,
    };
    writeRawState(resolvedStorage, raw);
    return toPublicState(raw, now);
}

/** Borra los intentos registrados (ingreso correcto). */
export function clearLoginAttempts(storage = undefined) {
    const resolvedStorage = getStorage(storage);
    if (!resolvedStorage) return;
    try {
        resolvedStorage.removeItem(LOGIN_RATE_LIMIT_KEY);
    } catch (error) {
        console.warn('No se pudieron limpiar los intentos de ingreso:', error);
    }
}

/** Formatea milisegundos restantes como `m:ss` (ej. `4:59`). */
export function formatRemainingTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Mensaje estándar tras un intento fallido, según el estado resultante. */
export function describeLoginFailure(state) {
    if (state.lockedMs > 0) {
        return `Demasiados intentos fallidos. El ingreso quedó bloqueado; reintentá en ${formatRemainingTime(state.lockedMs)}.`;
    }
    const left = state.remainingAttempts;
    const attemptsLabel = left === 1 ? 'Queda 1 intento' : `Quedan ${left} intentos`;
    return `Email o contraseña incorrectos. ${attemptsLabel} antes de un bloqueo temporal.`;
}