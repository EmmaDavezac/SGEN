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
    const authId = transaction?.usuario_id || transaction?.usuarioId || state.currentUser?.authId;
    if (supabase && authId) {
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

            const turnoId = transaction.turno_id || transaction.turnoId || null;
            const { data, error } = await supabase
                .from('servicios')
                .insert({
                    legacy_id: transaction.id,
                    cliente_id: clientRecord.id,
                    turno_id: turnoId,
                    usuario_id: authId,
                    fecha: transaction.fecha,
                    servicio: transaction.servicio,
                    categoria: transaction.categoria || 'Otro',
                    precio: Number(transaction.precio) || 0,
                    sena: Number(transaction.seña) || 0,
                    metodo_pago: transaction.metodoPago.toLowerCase(),
                    completado: transaction.completado === true || ['sí', 'si', 'yes', 'true'].includes(String(transaction.completado).toLowerCase()),
                    vuelto: Number(transaction.vuelto) || 0
                })
                .select('id, legacy_id, turno_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
                .single();
            if (error) throw error;

            return { success: true, service: normalizeServiceRecord({
                id: data.legacy_id || data.id,
                rawId: data.id,
                turnoId: data.turno_id,
                fecha: data.fecha,
                cliente: data.clientes?.nombre || transaction.cliente,
                servicio: data.servicio,
                categoria: data.categoria,
                precio: data.precio,
                seña: data.sena,
                metodoPago: data.metodo_pago,
                completado: data.completado ? 'Sí' : 'No',
                vuelto: data.vuelto,
                usuario: data.perfiles?.nombre || data.perfiles?.email || state.currentUser?.nombre || state.currentUser?.email
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

export async function loadClientsFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function loadAppointmentsFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('turnos')
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id')
        .order('hora_inicio', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadExpensesFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('gastos')
        .select('id, fecha, concepto, categoria, monto, metodo_pago')
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadServicesFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('servicios')
        .select('id, legacy_id, turno_id, cliente_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadCashboxDataFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const [servicesResult, movementsResult, expensesResult] = await Promise.all([
        supabase.from('servicios').select('precio, sena, metodo_pago, completado'),
        supabase.from('movimientos_caja').select('*').order('fecha', { ascending: false }).limit(50),
        supabase.from('gastos').select('monto, metodo_pago')
    ]);
    if (servicesResult.error) throw servicesResult.error;
    if (movementsResult.error) throw movementsResult.error;
    if (expensesResult.error) throw expensesResult.error;
    return {
        services: servicesResult.data || [],
        movements: movementsResult.data || [],
        expenses: expensesResult.data || []
    };
}

export async function saveClientToDatabase(payload, { usuarioId = null } = {}) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('clientes')
        .insert(payload)
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .single();
    if (error) throw error;
    return data;
}

export async function findClientByNormalizedName(name) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .eq('nombre_normalizado', String(name || '').trim().toLowerCase())
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function updateClientInDatabase(id, updates) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('clientes')
        .update(updates)
        .eq('id', id)
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .single();
    if (error) throw error;
    return data;
}

export async function deleteClientFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
}

export async function saveExpenseToDatabase(payload) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('gastos')
        .insert(payload)
        .select('id, fecha, concepto, categoria, monto, metodo_pago')
        .single();
    if (error) throw error;
    return data;
}

export async function saveCashMovementToDatabase(payload) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('movimientos_caja')
        .insert(payload)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

export async function saveAppointmentToDatabase(payload) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('turnos')
        .insert(payload)
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id, usuario_id')
        .single();
    if (error) throw error;
    return data;
}

export async function updateAppointmentStatusInDatabase(id, updates) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('turnos')
        .update(updates)
        .eq('id', id)
        .select('id, estado, precio')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el turno para actualizar.');
    return data;
}

export async function updateAppointmentInDatabase({ id = null, legacyId = null, updates = {} } = {}) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    let query = supabase.from('turnos').update(updates);
    query = id ? query.eq('id', id) : query.eq('legacy_id', legacyId);
    const { data, error } = await query
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id, usuario_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el turno para actualizar.');
    return data;
}

export async function updateServiceRecord(id, updates) {
    if (!supabase || !state.currentUser?.authId) return null;
    const { data, error } = await supabase
        .from('servicios')
        .update(updates)
        .eq('legacy_id', id)
        .select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
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

export async function deleteServiceFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { error } = await supabase.from('servicios').delete().eq('legacy_id', id);
    if (error) throw error;
    return { success: true };
}

export function normalizeTurnoEstado(raw) {
    const value = (raw || '').toString().trim().toLowerCase();
    if (['completed', 'completado', 'cobrado', 'pagado'].includes(value)) return 'completado';
    if (['reservado', 'reserved'].includes(value)) return 'reservado';
    if (['cancelado', 'cancelled'].includes(value)) return 'cancelado';
    return 'provisional';
}

export async function repairMissingTurnoLinks({ clientId = null, serviceDate = null, serviceName = '' } = {}) {
    if (!supabase || !clientId) return { updated: 0, total: 0 };

    const { data: orphanServices, error } = await supabase
        .from('servicios')
        .select('id, cliente_id, fecha, servicio, turno_id')
        .eq('cliente_id', clientId)
        .is('turno_id', null)
        .order('fecha', { ascending: false });
    if (error) throw error;

    const items = (serviceDate ? (orphanServices || []).filter((item) => {
        if (!item?.fecha) return true;
        return new Date(item.fecha).toISOString().slice(0, 10) === serviceDate;
    }) : orphanServices || []);

    let updated = 0;
    for (const item of items) {
        const target = (serviceName || item.servicio || '').toLowerCase();
        const { data: candidates, error: candidatesError } = await supabase
            .from('turnos')
            .select('id, fecha, servicio, cliente_id')
            .eq('cliente_id', clientId)
            .order('fecha', { ascending: false });
        if (candidatesError) throw candidatesError;

        const filtered = (candidates || []).filter((turno) => {
            const turnoDate = turno?.fecha ? new Date(turno.fecha).toISOString().slice(0, 10) : null;
            const sameDay = !serviceDate || !turnoDate || turnoDate === serviceDate;
            const turnoName = (turno?.servicio || '').toLowerCase();
            return sameDay && (turnoName.includes(target) || target.includes(turnoName) || turnoName === 'turno' || target === 'turno');
        });

        const match = filtered[0];
        if (!match) continue;

        const { error: updateError } = await supabase
            .from('servicios')
            .update({ turno_id: match.id })
            .eq('id', item.id);
        if (updateError) throw updateError;
        updated += 1;
    }

    return { updated, total: items.length };
}

export async function registerPaymentRecord({
    serviceId = null,
    turnoId = null,
    usuarioId = null,
    amount,
    paymentMethod = 'transferencia',
    type = 'cobro'
}) {
    if (!supabase) throw new Error('Supabase no está disponible.');

    const paymentAmount = Number(amount) || 0;
    const method = String(paymentMethod || 'transferencia').toLowerCase() === 'efectivo'
        ? 'efectivo'
        : 'transferencia';

    if (paymentAmount <= 0) return { skipped: true };
    if (!serviceId && !turnoId) throw new Error('El pago debe estar relacionado con un servicio o turno.');

    const { data, error } = await supabase
        .from('pagos')
        .insert({
            servicio_id: serviceId,
            turno_id: turnoId,
            usuario_id: usuarioId || state.currentUser?.authId || null,
            fecha: new Date().toISOString(),
            monto: paymentAmount,
            metodo_pago: method,
            tipo: type
        })
        .select('id, servicio_id, turno_id, monto, metodo_pago, tipo')
        .single();

    if (error) throw error;
    return { success: true, payment: data };
}

export async function finalizeRegisteredService({
    turnoId = null,
    turnoLegacyId = null,
    precio = 0,
    serviceId = null,
    paymentAmount = 0,
    paymentMethod = 'transferencia',
    usuarioId = null
}) {
    if (!supabase) throw new Error('Supabase no está disponible.');

    await registerPaymentRecord({
        serviceId,
        turnoId,
        usuarioId,
        amount: paymentAmount,
        paymentMethod,
        type: 'cobro'
    });

    if (!turnoId && !turnoLegacyId) return { updated: true, turnoId: null };

    let query = supabase
        .from('turnos')
        .update({ estado: 'completado', precio: Number(precio) || 0 });
    query = turnoId ? query.eq('id', turnoId) : query.eq('legacy_id', turnoLegacyId);

    const { error } = await query;
    if (error) throw error;
    return { updated: true, turnoId: turnoId || turnoLegacyId };
}

export async function completePendingPayment({
    serviceId,
    serviceOverride = null,
    paymentMethod = 'transferencia',
    vuelto = 0,
    finalizeTurno = true,
    usuarioId = null
}) {
    if (!supabase) return { updated: false, reason: 'missing_supabase' };

    let serviceRecord = serviceOverride;
    if (!serviceRecord) {
        const { data, error } = await supabase
            .from('servicios')
            .select('id, legacy_id, turno_id, cliente_id, fecha, servicio, precio, metodo_pago, completado')
            .or(`id.eq.${serviceId},legacy_id.eq.${serviceId}`)
            .maybeSingle();
        if (error) throw error;
        serviceRecord = data;
    }

    if (!serviceRecord) return { updated: false, reason: 'missing_service' };

    const servicePk = serviceRecord.id || serviceRecord.legacy_id || serviceId;
    const updatePayload = {
        metodo_pago: String(paymentMethod || 'transferencia').toLowerCase(),
        completado: true,
        vuelto: Number(vuelto) || 0
    };

    const { error: serviceError } = await supabase
        .from('servicios')
        .update(updatePayload)
        .or(`id.eq.${servicePk},legacy_id.eq.${servicePk}`);
    if (serviceError) throw serviceError;

    const finalizedTurnoId = serviceRecord.turno_id || null;
    if (serviceRecord.id) {
        const paymentMonto = Number(serviceRecord.precio) || 0;
        const paymentMethodValue = String(paymentMethod || 'transferencia').toLowerCase();
        if (paymentMonto > 0 && ['efectivo', 'transferencia'].includes(paymentMethodValue)) {
            await registerPaymentRecord({
                serviceId: serviceRecord.id,
                turnoId: finalizedTurnoId,
                usuarioId,
                amount: paymentMonto,
                paymentMethod: paymentMethodValue,
                type: 'cobro'
            });
        }
    }

    if (!finalizeTurno) return { updated: true, turnoId: finalizedTurnoId };

    const matchId = serviceRecord.turno_id || null;
    if (matchId) {
        const { error: turnoError } = await supabase
            .from('turnos')
            .update({ estado: normalizeTurnoEstado('completado'), precio: Number(serviceRecord.precio) || 0 })
            .eq('id', matchId);
        if (turnoError) throw turnoError;
        return { updated: true, turnoId: matchId };
    }

    const clienteId = serviceRecord.cliente_id;
    if (!clienteId) return { updated: true, turnoId: null, reason: 'missing_cliente' };

    const serviceDate = serviceRecord.fecha ? new Date(serviceRecord.fecha).toISOString().slice(0, 10) : null;
    let turnoQuery = supabase
        .from('turnos')
        .select('id, fecha, servicio, precio, cliente_id')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false });

    if (serviceDate) {
        turnoQuery = turnoQuery.eq('fecha', serviceDate);
    }

    const { data: turnoCandidates, error: turnoError } = await turnoQuery;
    if (turnoError) throw turnoError;

    const targetName = (serviceRecord.servicio || '').toLowerCase();
    const match = (turnoCandidates || []).find((turno) => {
        const current = (turno.servicio || '').toLowerCase();
        return current.includes(targetName) || targetName.includes(current) || current === 'turno' || targetName === 'turno';
    }) || (turnoCandidates || [])[0];

    if (!match) {
        const repaired = await repairMissingTurnoLinks({
            clientId: clienteId,
            serviceDate: serviceDate,
            serviceName: serviceRecord.servicio
        });
        if (repaired.updated > 0) {
            const { data: recoveredCandidates, error: recoveredError } = await supabase
                .from('turnos')
                .select('id, fecha, servicio, precio, cliente_id')
                .eq('cliente_id', clienteId)
                .order('fecha', { ascending: false });
            if (recoveredError) throw recoveredError;

            const recoveredMatch = (recoveredCandidates || []).find((turno) => {
                const sameDay = !serviceDate || new Date(turno.fecha).toISOString().slice(0, 10) === serviceDate;
                const current = (turno.servicio || '').toLowerCase();
                const target = (serviceRecord.servicio || '').toLowerCase();
                return sameDay && (current.includes(target) || target.includes(current) || current === 'turno' || target === 'turno');
            }) || (recoveredCandidates || [])[0];

            if (recoveredMatch) {
                const { error: updateRecoveredTurnoError } = await supabase
                    .from('turnos')
                    .update({ estado: normalizeTurnoEstado('completado'), precio: Number(serviceRecord.precio) || Number(recoveredMatch.precio) || 0 })
                    .eq('id', recoveredMatch.id);
                if (updateRecoveredTurnoError) throw updateRecoveredTurnoError;

                const { error: linkRecoveredError } = await supabase
                    .from('servicios')
                    .update({ turno_id: recoveredMatch.id })
                    .or(`id.eq.${servicePk},legacy_id.eq.${servicePk}`);
                if (linkRecoveredError) throw linkRecoveredError;

                return { updated: true, turnoId: recoveredMatch.id };
            }
        }
        return { updated: true, turnoId: null, reason: 'no_matching_turno' };
    }

    const { error: updateTurnoError } = await supabase
        .from('turnos')
        .update({ estado: normalizeTurnoEstado('completado'), precio: Number(serviceRecord.precio) || Number(match.precio) || 0 })
        .eq('id', match.id);
    if (updateTurnoError) throw updateTurnoError;

    const { error: linkError } = await supabase
        .from('servicios')
        .update({ turno_id: match.id })
        .or(`id.eq.${servicePk},legacy_id.eq.${servicePk}`);
    if (linkError) throw linkError;

    return { updated: true, turnoId: match.id };
}

export async function updateLinkedTurnoStatus(serviceId, serviceOverride = null) {
    return completePendingPayment({
        serviceId,
        serviceOverride,
        paymentMethod: serviceOverride?.metodo_pago || 'transferencia',
        vuelto: 0,
        finalizeTurno: true
    });
}

export async function loadServicesData() {
    if (!state.currentUser) return;

    if (supabase && state.currentUser.authId) {
        const { data, error } = await supabase
            .from('servicios')
            .select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
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
                vuelto: item.vuelto,
                usuario: item.perfiles?.nombre || item.perfiles?.email || state.currentUser?.nombre || state.currentUser?.email
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
    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const activePeriod = document.querySelector('[data-history-filter].active');
    const activeCategory = document.querySelector('[data-history-category].active');
    const activePayment = document.querySelector('[data-history-payment].active');
    const filterVal = activePeriod ? activePeriod.dataset.historyFilter : 'todos';
    const selectedCategory = activeCategory ? activeCategory.dataset.historyCategory : 'todos';
    const selectedPayment = activePayment ? activePayment.dataset.historyPayment : 'todos';

    const normalizeCategory = (value) => {
        const normalized = (value || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalized.includes('semi')) return 'semi';
        if (normalized.includes('kapping')) return 'kapping';
        if (normalized.includes('softgel') || normalized.includes('soft gel')) return 'softgel';
        if (normalized.includes('esculpid')) return 'esculpidas';
        if (normalized.includes('personal') || normalized.includes('otro')) return 'personalizado';
        if (normalized.includes('remoc') || normalized.includes('retiro')) return 'remocion';
        return normalized;
    };

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

        const categoriaText = normalizeCategory(item.categoria);
        if (selectedCategory !== 'todos' && categoriaText !== normalizeCategory(selectedCategory)) return false;
        if (selectedPayment !== 'todos' && (item.metodoPago || '').toLowerCase() !== selectedPayment) return false;

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
            <div class="list-empty-state">
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
        const paymentLabel = (item.metodoPago || '').toLowerCase() === 'fiado' ? 'Pendiente de pago' : item.metodoPago;
        const registeredBy = item.usuario || state.currentUser?.nombre || state.currentUser?.email || '-';

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
            <span class="pay-badge" title="Método de pago">${payIcon} ${paymentLabel}</span>
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
