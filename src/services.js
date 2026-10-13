import { supabase } from './supabase.js';

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

export async function registerServiceDirectly(transaction) {
    const authId = transaction?.usuario_id || transaction?.usuarioId || null;
    if (!supabase) throw new Error('Supabase no está disponible para guardar el servicio.');
    if (!authId) throw new Error('Falta el usuario para registrar el servicio.');

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

    return {
        success: true,
        service: normalizeServiceRecord({
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
            usuario: data.perfiles?.nombre || data.perfiles?.email || null
        })
    };
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
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, motivo_cancelacion, event_id, cliente_id')
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

/**
 * Borra una clienta de forma definitiva.
 *
 * Devolvemos las filas afectadas (`.select('id')`) porque RLS puede dejar un
 * DELETE en 0 filas SIN error: sin esta verificación la app celebraba un
 * borrado que nunca ocurrió y la clienta reaparecía al recargar.
 */
export async function deleteClientFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { data, error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .select('id');
    if (error) {
        const code = String(error.code || '');
        if (code === '23503' || /violates foreign key constraint/i.test(error.message || '')) {
            throw new Error('No se puede eliminar: la clienta tiene turnos o servicios en el historial. El historial se conserva para no perder registros.');
        }
        throw error;
    }
    if (!data || data.length === 0) {
        throw new Error('No se pudo eliminar la clienta: no hay permisos (RLS) o ya no existe en el sistema.');
    }
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
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, motivo_cancelacion, event_id, cliente_id, usuario_id')
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
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, motivo_cancelacion, event_id, cliente_id, usuario_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el turno para actualizar.');
    return data;
}
function isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTurnoUuid(turnoId) {
    if (!turnoId) return null;
    if (isUuid(turnoId)) return turnoId;
    // Puede venir legacy_id (app_...) desde caché vieja: resolver a UUID real.
    const { data, error } = await supabase
        .from('turnos')
        .select('id')
        .eq('legacy_id', turnoId)
        .maybeSingle();
    if (error) throw error;
    return data?.id || null;
}
export async function hasSenaForTurno(turnoId) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    if (!turnoId) return false;
    const uuid = await resolveTurnoUuid(turnoId).catch(() => null);
    if (!uuid) return false;
    const { data, error } = await supabase
        .from('pagos')
        .select('id')
        .eq('turno_id', uuid)
        .eq('tipo', 'sena')
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

export async function hasLinkedServiceForTurno(turnoId) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    if (!turnoId) return false;
    const uuid = await resolveTurnoUuid(turnoId).catch(() => null);
    if (!uuid) return false;
    const { data, error } = await supabase
        .from('servicios')
        .select('id')
        .eq('turno_id', uuid)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

/**
 * Trae el respaldo completo de un turno para la ficha de consulta: los pagos
 * registrados (seña, cobros, ajustes) y el servicio vinculado, si se hizo.
 *
 * @returns {Promise<{pagos: Array, servicio: object|null>}
 */
export async function loadTurnoDetail(turnoId) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const empty = { pagos: [], servicio: null };
    if (!turnoId) return empty;
    const uuid = await resolveTurnoUuid(turnoId).catch(() => null);
    if (!uuid) return empty;

    const [pagosResult, servicioResult] = await Promise.all([
        supabase
            .from('pagos')
            .select('id, fecha, monto, metodo_pago, tipo')
            .eq('turno_id', uuid)
            .order('fecha', { ascending: true }),
        supabase
            .from('servicios')
            .select('id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, perfiles(nombre)')
            .eq('turno_id', uuid)
            .maybeSingle()
    ]);
    if (pagosResult.error) throw pagosResult.error;
    if (servicioResult.error) throw servicioResult.error;
    return {
        pagos: pagosResult.data || [],
        servicio: servicioResult.data || null
    };
}

/**
 * Cancela un turno: lo marca como cancelado y guarda el motivo.
 * No borra nada, así que la seña y el historial se mantienen consultables.
 */
export async function cancelAppointmentInDatabase({ id = null, legacyId = null, motivo = '' } = {}) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const reason = String(motivo || '').trim();
    if (!reason) throw new Error('Escribí el motivo de la cancelación.');
    let query = supabase
        .from('turnos')
        .update({ estado: 'cancelado', motivo_cancelacion: reason });
    query = id ? query.eq('id', id) : query.eq('legacy_id', legacyId);
    const { data, error } = await query
        .select('id, legacy_id, estado, motivo_cancelacion')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el turno para cancelar. Puede que tu rol no tenga permiso o la sesión expiró.');
    return data;
}

export async function deleteAppointmentFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    if (!id) throw new Error('Falta el ID del turno.');
    const uuid = await resolveTurnoUuid(id).catch(() => null);
    // Intentar por UUID y por legacy_id para cubrir caché vieja.
    let lastError = null;
    const attempts = [];
    if (uuid) attempts.push({ col: 'id', val: uuid });
    if (!isUuid(id)) attempts.push({ col: 'legacy_id', val: id });
    if (attempts.length === 0) attempts.push({ col: 'id', val: id });
    for (const attempt of attempts) {
        const { data, error } = await supabase
            .from('turnos')
            .delete()
            .eq(attempt.col, attempt.val)
            .select('id')
            .maybeSingle();
        if (!error && data) return { success: true };
        if (error) lastError = error;
    }
    if (lastError) throw lastError;
    throw new Error('No se encontró el turno para eliminar. Puede que tu rol no tenga permiso (solo admin puede borrar) o la sesión expiró.');
}


export async function deleteServiceFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    const { error } = await supabase.from('servicios').delete().eq('legacy_id', id);
    if (error) throw error;
    return { success: true };
}

// La normalización del estado del turno vive en appointmentActions.js (fuente
// única del flujo de turnos). Se importa y reexporta acá para no romper ni los
// imports ni los usos internos de este módulo.
import { normalizeTurnoEstado } from './appointmentActions.js';
export { normalizeTurnoEstado };

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
            usuario_id: usuarioId,
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
