// =========================================================================
// MOTOR DE ALMACENAMIENTO LOCAL EN INDEXEDDB (OFFLINE-FIRST)
// =========================================================================
// Gestiona la persistencia de datos en el cliente para permitir navegación,
// consulta y auditoría sin conexión a internet.
// =========================================================================

const DB_NAME = 'sgen_offline_db';
const DB_VERSION = 1;

export const STORES = {
    CLIENTES: 'clientes',
    TURNOS: 'turnos',
    SERVICIOS: 'servicios',
    PRECIOS: 'precios',
    CATEGORIAS: 'categorias',
    GASTOS: 'gastos',
    MOVIMIENTOS_CAJA: 'movimientos_caja',
    SYNC_QUEUE: 'sync_queue',
    META: 'meta'
};

let dbPromise = null;

/**
 * Abre y retorna la instancia única de la base de datos IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
export function openOfflineDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB no está disponible en este entorno'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
                const s = db.createObjectStore(STORES.CLIENTES, { keyPath: 'id' });
                s.createIndex('nombre', 'nombre', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.TURNOS)) {
                const s = db.createObjectStore(STORES.TURNOS, { keyPath: 'id' });
                s.createIndex('fecha', 'fecha', { unique: false });
                s.createIndex('cliente_id', 'cliente_id', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.SERVICIOS)) {
                const s = db.createObjectStore(STORES.SERVICIOS, { keyPath: 'id' });
                s.createIndex('fecha', 'fecha', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.PRECIOS)) {
                const s = db.createObjectStore(STORES.PRECIOS, { keyPath: 'id' });
                s.createIndex('categoria', 'categoria', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.CATEGORIAS)) {
                db.createObjectStore(STORES.CATEGORIAS, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(STORES.GASTOS)) {
                const s = db.createObjectStore(STORES.GASTOS, { keyPath: 'id' });
                s.createIndex('fecha', 'fecha', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.MOVIMIENTOS_CAJA)) {
                const s = db.createObjectStore(STORES.MOVIMIENTOS_CAJA, { keyPath: 'id' });
                s.createIndex('fecha', 'fecha', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const s = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                s.createIndex('timestamp', 'timestamp', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.META)) {
                db.createObjectStore(STORES.META, { keyPath: 'key' });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('Error abriendo IndexedDB:', event.target.error);
            dbPromise = null;
            reject(event.target.error);
        };
    });

    return dbPromise;
}

/**
 * Obtiene todos los registros almacenados en una tabla.
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
export async function getAllFromStore(storeName) {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn(`No se pudo leer del store ${storeName}:`, err);
        return [];
    }
}

/**
 * Reemplaza o puebla por completo los registros de una tabla local.
 * @param {string} storeName
 * @param {any[]} items
 * @returns {Promise<void>}
 */
export async function setAllInStore(storeName, items = []) {
    if (!Array.isArray(items)) return;
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.clear();
            items.forEach((item) => {
                if (!item) return;
                const itemWithId = item.id != null
                    ? item
                    : { ...item, id: item.legacy_id || item.clave || String(Math.random()) };
                store.put(itemWithId);
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn(`No se pudo guardar registros en store ${storeName}:`, err);
    }
}

/**
 * Inserta o actualiza un registro individual en una tabla local.
 * @param {string} storeName
 * @param {any} item
 * @returns {Promise<any>}
 */
export async function putInStore(storeName, item) {
    if (!item) return;
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const itemWithId = item.id != null
                ? item
                : { ...item, id: item.legacy_id || item.clave || String(Math.random()) };
            store.put(itemWithId);
            tx.oncomplete = () => resolve(itemWithId);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn(`No se pudo actualizar registro en store ${storeName}:`, err);
        return item;
    }
}

/**
 * Elimina un registro por su clave primaria en una tabla local.
 * @param {string} storeName
 * @param {string|number} id
 * @returns {Promise<void>}
 */
export async function deleteFromStore(storeName, id) {
    if (id == null) return;
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn(`No se pudo eliminar de store ${storeName}:`, err);
    }
}

/**
 * Lee un valor de metadata por clave.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getMeta(key) {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.META, 'readonly');
            const store = tx.objectStore(STORES.META);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result?.value);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

/**
 * Guarda o actualiza un valor de metadata.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function setMeta(key, value) {
    try {
        const db = await openOfflineDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.META, 'readwrite');
            const store = tx.objectStore(STORES.META);
            store.put({ key, value, updatedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('Error guardando metadata offline:', err);
    }
}

