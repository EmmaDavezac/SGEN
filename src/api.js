import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';

// Evitar notificar repetidamente la misma URL fallida
const failedUrlCache = new Set();

export async function apiPost(url, payload, { showLoading = true, loadingText = 'Conectando con la nube...', swallowError = false } = {}) {
    if (showLoading) showLoader(true, loadingText);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
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
        console.error('API POST error:', err);
        if (!swallowError) showToast('Error de conexión con la nube', 'warning');
        return null;
    } finally {
        if (showLoading) showLoader(false);
    }
}

export async function apiGet(url, { showLoading = true, loadingText = 'Cargando...', swallowError = false } = {}) {
    if (showLoading) showLoader(true, loadingText);
    try {
        if (!url) throw new Error('URL vacía en apiGet');
        const resp = await fetch(url, { mode: 'cors' });
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
                showToast(`Error de conexión con la nube. Revisa el despliegue y la URL: ${url}`, 'warning');
            }
        }
        return { success: false, message: 'network_error', rawError: String(err) };
    } finally {
        if (showLoading) showLoader(false);
    }
}
