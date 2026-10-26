/**
 * syncQueue.js — Cola de escrituras offline para SGEN
 *
 * Cuando la app no tiene conexion, las mutaciones (insert/update/delete) se
 * guardan en IndexedDB (store `sync_queue`) y se reproducen en orden FIFO en
 * cuanto el navegador vuelve a estar online.
 *
 * Estructura de un item en la cola:
 *   {
 *     id        : string  — UUID v4 local
 *     table     : string  — nombre de la tabla Supabase destino
 *     action    : 'insert' | 'update' | 'delete'
 *     payload   : object  — datos a escribir / id a borrar
 *     createdAt : number  — Date.now() para ordenar FIFO
 *     attempts  : number  — reintentos fallidos (para futura logica de backoff)
 *   }
 */

import { STORES, putInStore, getAllFromStore, deleteFromStore } from './db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateLocalId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback: timestamp + random
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Agrega una operacion a la cola.
 * @param {{ table: string, action: 'insert'|'update'|'delete', payload: object }} op
 * @returns {Promise<string>} id local del item encolado
 */
export async function enqueueOperation({ table, action, payload }) {
    const item = {
        id: generateLocalId(),
        table,
        action,
        payload,
        createdAt: Date.now(),
        attempts: 0,
    };
    await putInStore(STORES.SYNC_QUEUE, item);
    return item.id;
}

/**
 * Devuelve todas las operaciones pendientes ordenadas por `createdAt` (FIFO).
 * @returns {Promise<Array>}
 */
export async function getPendingOperations() {
    const all = await getAllFromStore(STORES.SYNC_QUEUE);
    return all.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Elimina una operacion de la cola (despues de aplicarla con exito).
 * @param {string} id
 */
export async function removeOperation(id) {
    await deleteFromStore(STORES.SYNC_QUEUE, id);
}

/**
 * Cuenta las operaciones pendientes.
 * @returns {Promise<number>}
 */
export async function getPendingCount() {
    const ops = await getPendingOperations();
    return ops.length;
}

/**
 * Procesa la cola FIFO aplicando cada operacion contra Supabase.
 *
 * Se importa `supabase` directamente en runtime (import dinamico) para evitar
 * dependencia circular con services.js. Cada operacion exitosa se elimina de
 * la cola. Si falla, se incrementa `attempts` y se sigue con la siguiente
 * para no bloquear el resto de la cola.
 *
 * @param {object} supabaseClient — instancia de @supabase/supabase-js
 * @returns {Promise<{ applied: number, failed: number }>}
 */
export async function processSyncQueue(supabaseClient) {
    if (!supabaseClient) return { applied: 0, failed: 0 };

    const ops = await getPendingOperations();
    let applied = 0;
    let failed = 0;

    for (const op of ops) {
        try {
            await applyOperation(supabaseClient, op);
            await removeOperation(op.id);
            applied++;
        } catch (err) {
            console.warn(`[SyncQueue] Fallo al aplicar operacion ${op.id} (${op.action} en ${op.table}):`, err);
            // Incrementar intentos para futura logica de backoff / descarte
            await putInStore(STORES.SYNC_QUEUE, { ...op, attempts: (op.attempts || 0) + 1 });
            failed++;
        }
    }

    return { applied, failed };
}

// ---------------------------------------------------------------------------
// Aplicador de operaciones
// ---------------------------------------------------------------------------

async function applyOperation(supabase, op) {
    const { table, action, payload } = op;

    if (action === 'insert') {
        // Quitamos el id local temporal antes de insertar en Supabase
        const { _localId, ...cleanPayload } = payload;
        const { error } = await supabase.from(table).insert(cleanPayload);
        if (error) throw error;

    } else if (action === 'update') {
        const { id, ...updates } = payload;
        if (!id) throw new Error(`SyncQueue: update sin id en tabla ${table}`);
        const { error } = await supabase.from(table).update(updates).eq('id', id);
        if (error) throw error;

    } else if (action === 'delete') {
        const { id } = payload;
        if (!id) throw new Error(`SyncQueue: delete sin id en tabla ${table}`);
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;

    } else {
        throw new Error(`SyncQueue: accion desconocida "${action}"`);
    }
}

