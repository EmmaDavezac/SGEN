import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';

// Evitar notificar repetidamente la misma URL fallida
const failedUrlCache = new Set();

export async function apiPost(url, payload, { showLoading = true, loadingText = 'Conectando con la nube...', swallowError = false } = {}) {
    if (showLoading) showLoader(true, loadingText);
    try {
        const controller = new AbortController();
        const timeoutMs = 8000; // 8s timeout para evitar esperas largas
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const resp = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));
        let data = null;
        const text = await resp.text().catch(() => null);
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                // Server did not return JSON
                data = { success: false, message: 'Respuesta no JSON del servidor', raw: text };
            }
        }

        if (!resp.ok) {
            const msg = (data && data.message) ? data.message : `HTTP ${resp.status}`;
            if (!swallowError) showToast(msg, 'error');
            return { success: false, message: msg };
        }

        return data;
    } catch (err) {
        console.error('API POST error for URL:', url, err);
        if (!swallowError) showToast('Error de conexión con la nube', 'warning');
        return { success: false, message: 'network_error', rawError: String(err) };
    } finally {
        if (showLoading) showLoader(false);
    }
}

export async function apiGet(url, { showLoading = true, loadingText = 'Cargando...', swallowError = false } = {}) {
    if (showLoading) showLoader(true, loadingText);
    try {
        if (!url) throw new Error('URL vacía en apiGet');
        // Intentos simples de reintento para errores de red transitorios
        const maxRetries = 2;
        let attempt = 0;
        let resp = null;
        while (attempt <= maxRetries) {
            try {
                const controller = new AbortController();
                const timeoutMs = 8000;
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                resp = await fetch(url, { mode: 'cors', signal: controller.signal }).finally(() => clearTimeout(timeoutId));
                break;
            } catch (e) {
                attempt++;
                if (attempt > maxRetries) throw e;
                // pequeña espera exponencial
                await new Promise(r => setTimeout(r, 300 * attempt));
            }
        }
        const text = await resp.text().catch(() => null);
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = { success: false, message: 'Respuesta no JSON del servidor', raw: text };
            }
        }

        if (!resp.ok) {
            const msg = (data && data.message) ? data.message : `HTTP ${resp.status}`;
            if (!swallowError) showToast(msg, 'error');
            return { success: false, message: msg };
        }

        return data;
    } catch (err) {
        console.error('API GET error for URL:', url, err);
        if (!swallowError) {
            if (!failedUrlCache.has(url)) {
                failedUrlCache.add(url);
                showToast('Error de conexión con la nube. Revisa el despliegue y abre consola para más detalles.', 'warning');
                console.warn('API GET failed URL (logged once):', url);
            }
        }
        return { success: false, message: 'network_error', rawError: String(err) };
    } finally {
        if (showLoading) showLoader(false);
    }
}
