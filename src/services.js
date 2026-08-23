import state from './state.js';
import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';
import { supabase } from './supabase.js';

function getStoredJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`No se pudo leer el valor guardado en ${key}:`, error);
        return fallback;
    }
}

function setStoredJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function normalizeDateValue(fechaValue) {
    if (!fechaValue) return null;
    if (fechaValue instanceof Date) return isNaN(fechaValue.getTime()) ? null : fechaValue;
    if (typeof fechaValue === 'number') {
        const parsed = new Date(fechaValue);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof fechaValue === 'string') {
        const trimmed = fechaValue.toString().trim();
        if (!trimmed) return null;
        if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(trimmed)) {
            const normalized = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`;
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function normalizeServiceRecord(item) {
    if (!item || typeof item !== 'object') {
        return {
            id: `service_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            fecha: new Date().toISOString(),
            cliente: 'Cliente',
            servicio: 'Servicio',
            precio: 0,
            metodoPago: 'Transferencia',
            categoria: 'Otro',
            seña: 0,
            completado: 'No'
        };
    }

    const rawPaymentMethod = (item.metodoPago || 'Transferencia').toString().trim();
    const paymentMethodByKey = {
        efectivo: 'Efectivo',
        transferencia: 'Transferencia',
        fiado: 'Fiado'
    };

    return {
        ...item,
        id: item.id || `service_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        fecha: item.fecha || new Date().toISOString(),
        cliente: (item.cliente || 'Cliente').toString().trim() || 'Cliente',
        servicio: (item.servicio || 'Servicio').toString().trim() || 'Servicio',
        precio: Number(item.precio) || 0,
        metodoPago: paymentMethodByKey[rawPaymentMethod.toLowerCase()] || rawPaymentMethod || 'Transferencia',
        categoria: (item.categoria || 'Otro').toString().trim() || 'Otro',
        seña: Number(item.seña) || 0,
        completado: item.completado || 'No'
    };
}

export function normalizeExpenseRecord(item) {
    if (!item || typeof item !== 'object') {
        return {
            id: `expense_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            fecha: new Date().toISOString(),
            concepto: 'Gasto',
            monto: 0,
            metodoPago: 'Efectivo',
            categoria: 'Otro'
        };
    }

    return {
        ...item,
        id: item.id || `expense_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        fecha: item.fecha || new Date().toISOString(),
        concepto: (item.concepto || 'Gasto').toString().trim() || 'Gasto',
        monto: Number(item.monto) || 0,
        metodoPago: (item.metodoPago || 'Efectivo').toString().trim() || 'Efectivo',
        categoria: (item.categoria || 'Otro').toString().trim() || 'Otro'
    };
}

export async function registerServiceDirectly(transaction) {
    if (supabase && state.currentUser?.authId) {
        try {
            let { data: clientRecord, error: clientError } = await supabase
                .from('clientes')
                .select('id')
                .eq('nombre_normalizado', transaction.cliente.toLowerCase().trim())
                .maybeSingle();
            if (clientError) throw clientError;

            if (!clientRecord) {
                const { data: newClient, error: newClientError } = await supabase
                    .from('clientes')
                    .insert({ nombre: transaction.cliente.trim() })
                    .select('id')
                    .single();
                if (newClientError) throw newClientError;
                clientRecord = newClient;
            }

            const { data, error } = await supabase
                .from('servicios')
                .insert({
                    legacy_id: transaction.id,
                    cliente_id: clientRecord.id,
                    usuario_id: state.currentUser.authId,
                    fecha: transaction.fecha,
                    servicio: transaction.servicio,
                    categoria: transaction.categoria || 'Otro',
                    precio: Number(transaction.precio) || 0,
                    sena: Number(transaction.seña) || 0,
                    metodo_pago: transaction.metodoPago.toLowerCase(),
                    completado: transaction.completado === true || ['sí', 'si', 'yes', 'true'].includes(String(transaction.completado).toLowerCase()),
                    vuelto: Number(transaction.vuelto) || 0
                })
                .select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre)')
                .single();
            if (error) throw error;

            return { success: true, service: normalizeServiceRecord({
                id: data.legacy_id || data.id,
                fecha: data.fecha,
                cliente: data.clientes?.nombre || transaction.cliente,
                servicio: data.servicio,
                categoria: data.categoria,
                precio: data.precio,
                seña: data.sena,
                metodoPago: data.metodo_pago,
                completado: data.completado ? 'Sí' : 'No',
                vuelto: data.vuelto
            }) };
        } catch (error) {
            console.error('Error al registrar servicio en Supabase:', error);
            showToast('No se pudo guardar el servicio en Supabase.', 'error');
            return null;
        }
    }

    showToast('Supabase no está disponible para guardar el servicio.', 'error');
    return null;
}

export async function updateServiceRecord(id, updates) {
    if (!supabase || !state.currentUser?.authId) return null;
    const { data, error } = await supabase
        .from('servicios')
        .update(updates)
        .eq('legacy_id', id)
        .select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre)')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el servicio en Supabase.');
    return normalizeServiceRecord({
        id: data.legacy_id || data.id,
        fecha: data.fecha,
        cliente: data.clientes?.nombre || 'Cliente',
        servicio: data.servicio,
        categoria: data.categoria,
        precio: data.precio,
        seña: data.sena,
        metodoPago: data.metodo_pago,
        completado: data.completado ? 'Sí' : 'No',
        vuelto: data.vuelto
    });
}

export async function loadServicesData() {
    if (!state.currentUser) return;

    if (supabase && state.currentUser.authId) {
        const { data, error } = await supabase
            .from('servicios')
            .select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre)')
            .order('fecha', { ascending: false });

        if (!error && Array.isArray(data)) {
            state.servicesList = data.map(item => normalizeServiceRecord({
                id: item.legacy_id || item.id,
                fecha: item.fecha,
                cliente: item.clientes?.nombre || 'Cliente',
                servicio: item.servicio,
                categoria: item.categoria,
                precio: item.precio,
                seña: item.sena,
                metodoPago: item.metodo_pago,
                completado: item.completado ? 'Sí' : 'No',
                vuelto: item.vuelto
            }));
            saveServicesCache();
            renderHistoryList();
            if (typeof window.calculateAndRenderStats === 'function') window.calculateAndRenderStats();
            updateClientAutocomplete();
            return;
        }

        console.error('No se pudieron cargar servicios desde Supabase:', error);
        state.servicesList = [];
        saveServicesCache();
        renderHistoryList();
        if (typeof window.calculateAndRenderStats === 'function') window.calculateAndRenderStats();
        updateClientAutocomplete();
        return;
    }

    state.servicesList = [];
    renderHistoryList();
    updateClientAutocomplete();
}

export function saveServicesCache() {
    if (state.currentUser) {
        const normalized = Array.isArray(state.servicesList) ? state.servicesList.map(normalizeServiceRecord) : [];
        state.servicesList = normalized;
        setStoredJson(`evolet_services_v4_${state.currentUser.email}`, normalized);
    }
}

export function updateClientAutocomplete() {
    const datalist = document.getElementById('past-clients-list');
    if (!datalist) return;

    const serviceList = Array.isArray(state.servicesList) ? state.servicesList.map(normalizeServiceRecord) : [];

    const uniqueClients = [...new Set(serviceList.map(item => item.cliente))]
        .filter(name => name && name.length > 0)
        .sort((a, b) => a.localeCompare(b));

    datalist.innerHTML = uniqueClients
        .map(clientName => `<option value="${escapeHtml(clientName)}">`)
        .join('');
}

export function getFilteredHistory() {
    const searchInput = document.getElementById('history-search');
    const filterSelect = document.getElementById('history-filter');
    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filterVal = filterSelect ? filterSelect.value : 'todos';

    const list = Array.isArray(state.servicesList) ? state.servicesList.map(normalizeServiceRecord) : [];
    list.sort((a, b) => {
        const dateA = normalizeDateValue(a.fecha);
        const dateB = normalizeDateValue(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });

    return list.filter(item => {
        const clienteText = (item.cliente || '').toString().toLowerCase();
        const servicioText = (item.servicio || '').toString().toLowerCase();
        const matchesSearch = clienteText.includes(searchVal) || servicioText.includes(searchVal);

        if (!matchesSearch) return false;

        if (filterVal === 'todos') return true;

        const date = new Date(item.fecha);
        const now = new Date();

        if (filterVal === 'hoy') {
            return date.toDateString() === now.toDateString();
        }

        if (filterVal === 'semana') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            return date >= oneWeekAgo;
        }

        if (filterVal === 'mes') {
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }

        return true;
    });
}

export function filterHistory() {
    renderHistoryList();
}

export function renderHistoryList() {
    const listElement = document.getElementById('history-list');
    if (!listElement) return;

    listElement.innerHTML = '';

    const filteredList = getFilteredHistory();

    if (filteredList.length === 0) {
        listElement.innerHTML = `
            <div class="card-info-box" style="text-align: center;">
                <p>No se encontraron registros</p>
            </div>
        `;
        return;
    }

    filteredList.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const dateObj = normalizeDateValue(item.fecha) || new Date();
        const formattedDate = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
            dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        const payIcons = {
            Transferencia: '<i class="fa-solid fa-mobile-screen-button"></i>',
            Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>'
        };
        const payIcon = payIcons[item.metodoPago] || '<i class="fa-solid fa-money-check-dollar"></i>';

        const totalFormatted = `$${Number(item.precio || 0).toLocaleString('es-AR')}`;
        const clienteLabel = (item.cliente || 'Cliente').toString().trim() || 'Cliente';
        const servicioLabel = (item.servicio || 'Servicio').toString().trim() || 'Servicio';

        const isAdmin = state.currentUser && state.currentUser.rol === 'admin';

        card.innerHTML = `
    <div class="card-details">
        <div class="card-client">${escapeHtml(clienteLabel)}</div>
        <div class="card-service">${escapeHtml(servicioLabel)}</div>
        <div class="card-meta">
            <span><i class="fa-regular fa-calendar" style="color: var(--barbie-pink); margin-right: 3px;"></i>${formattedDate}</span>
            <span class="pay-badge" title="Método de pago">${payIcon} ${item.metodoPago}</span>
        </div>
    </div>
    <div class="card-amount-box">
        <div class="card-price" style="font-size: 18px; color: var(--barbie-dark);">${totalFormatted}</div>
    </div>
    <div class="card-actions-col">
        <button class="btn-view-detail" title="Ver Detalle">
            <i class="fa-solid fa-eye"></i>
        </button>
        ${isAdmin ? `
        <button class="btn-delete-card" title="Eliminar Registro">
            <i class="fa-solid fa-trash-can"></i>
        </button>
        ` : ''}
    </div>
`;

        const viewBtn = card.querySelector('.btn-view-detail');
        if (viewBtn) viewBtn.addEventListener('click', () => {
            if (typeof window.viewServiceDetail === 'function') {
                window.viewServiceDetail(item.id);
            }
        });

        const deleteBtn = card.querySelector('.btn-delete-card');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (typeof window.deleteServiceRecord === 'function') {
                    window.deleteServiceRecord(item.id);
                }
            });
        }

        listElement.appendChild(card);
    });
}

export async function deleteServiceRecord(id) {
    if (!state.currentUser || state.currentUser.rol !== 'admin') {
        showToast('Solo los administradores pueden eliminar registros.', 'error');
        return;
    }
    state.pendingDeleteId = id;
    document.getElementById('delete-modal').classList.remove('hidden');
}

export function cancelDeleteServiceRecord() {
    document.getElementById('delete-modal').classList.add('hidden');
    state.pendingDeleteId = null;
    showToast('Eliminación cancelada', 'info');
}

export async function confirmDeleteServiceRecord() {
    const id = state.pendingDeleteId;
    document.getElementById('delete-modal').classList.add('hidden');

    if (!id) return;
    state.pendingDeleteId = null;

    showLoader(true, 'Eliminando de la nube...');

    try {
        let resp;
        if (supabase && state.currentUser?.authId) {
            const { error } = await supabase.from('servicios').delete().eq('legacy_id', id);
            if (error) throw error;
            resp = { success: true };
        } else {
            throw new Error('Supabase no está disponible para eliminar el servicio.');
        }
        showLoader(false);
        if (resp && resp.success) {
            state.servicesList = state.servicesList.filter(x => x.id !== id);
            saveServicesCache();
            renderHistoryList();
            if (typeof window.calculateAndRenderStats === 'function') window.calculateAndRenderStats();
            updateClientAutocomplete();
            showToast('Registro eliminado con éxito', 'success');
        } else {
            showToast((resp && resp.message) || 'No se pudo eliminar el registro', 'error');
        }
    } catch (error) {
        showLoader(false);
        console.error('Error al borrar:', error);
        showToast('Error de conexión al intentar borrar. Inténtalo más tarde.', 'error');
    }
}
