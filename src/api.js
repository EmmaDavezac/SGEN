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
        const data = await resp.json().catch(() => null);
        if (!data) {
            if (!swallowError) showToast('Respuesta inválida del servidor', 'error');
            return null;
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
        const data = await resp.json().catch(() => null);
        if (!data) {
            if (!swallowError) showToast('Respuesta inválida del servidor', 'error');
            return null;
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
