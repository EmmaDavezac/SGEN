import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';

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
        const resp = await fetch(url);
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
        console.error('API GET error:', err);
        if (!swallowError) showToast('Error de conexión con la nube', 'warning');
        return null;
    } finally {
        if (showLoading) showLoader(false);
    }
}
