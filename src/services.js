import { ensureAuthSession, supabase } from './supabase.js';

// Aviso global cuando una consulta detecta sesión expirada: App lo escucha
// para cerrar la sesión local y llevar al login (evita listados vacíos).
export function notifySessionExpired() {
    try {
        window.dispatchEvent(new CustomEvent('evolet:sesion-expirada'));
    } catch (error) { /* ignore */ }
}

// Las lecturas con RLS devuelven `[]` SIN error cuando el JWT expiró (la
// consulta corre como anónima). Validar la sesión antes evita pisar el caché
// local con vacíos y deja que App fuerce un login fresco.
async function requireAuthForRead() {
    try {
        await ensureAuthSession();
    } catch (error) {
        notifySessionExpired();
        throw error;
    }
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
        fiado: 'Fiado',
        combinado: 'Combinado'
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
        // Reparto del cobro combinado (0 cuando el método es único).
        montoEfectivo: Number(item.montoEfectivo ?? item.monto_efectivo) || 0,
        montoTransferencia: Number(item.montoTransferencia ?? item.monto_transferencia) || 0,
        saldoPendiente: Number(item.saldoPendiente ?? item.saldo_pendiente) || 0,
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
    const metodoPago = String(transaction.metodoPago || 'Transferencia').toLowerCase();
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
            metodo_pago: metodoPago,
            // Reparto del cobro combinado; 0 en los métodos únicos.
            monto_efectivo: Number(transaction.montoEfectivo) || 0,
            monto_transferencia: Number(transaction.montoTransferencia) || 0,
            saldo_pendiente: Number(transaction.saldoPendiente) || 0,
            completado: transaction.completado === true || ['sí', 'si', 'yes', 'true'].includes(String(transaction.completado).toLowerCase()),
            vuelto: Number(transaction.vuelto) || 0
        })
        .select('id, legacy_id, turno_id, fecha, servicio, categoria, precio, sena, metodo_pago, monto_efectivo, monto_transferencia, saldo_pendiente, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
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
            montoEfectivo: data.monto_efectivo,
            montoTransferencia: data.monto_transferencia,
            saldoPendiente: data.saldo_pendiente,
            completado: data.completado ? 'Sí' : 'No',
            vuelto: data.vuelto,
            usuario: data.perfiles?.nombre || data.perfiles?.email || null
        })
    };
}

export async function loadClientsFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    await requireAuthForRead();
    const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function loadAppointmentsFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    await requireAuthForRead();
    const { data, error } = await supabase
        .from('turnos')
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, motivo_cancelacion, event_id, cliente_id')
        .order('hora_inicio', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadExpensesFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    await requireAuthForRead();
    const { data, error } = await supabase
        .from('gastos')
        .select('id, fecha, concepto, categoria, monto, metodo_pago')
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadServicesFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    await requireAuthForRead();
    const { data, error } = await supabase
        .from('servicios')
        .select('id, legacy_id, turno_id, cliente_id, fecha, servicio, categoria, precio, sena, metodo_pago, monto_efectivo, monto_transferencia, saldo_pendiente, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function loadCashboxDataFromDatabase() {
    if (!supabase) throw new Error('Supabase no está disponible.');
    await requireAuthForRead();
    const [servicesResult, movementsResult, expensesResult] = await Promise.all([
        supabase.from('servicios').select('precio, sena, metodo_pago, monto_efectivo, monto_transferencia, completado'),
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
 * Borra una cliente de forma definitiva.
 *
 * Devolvemos las filas afectadas (`.select('id')`) porque RLS puede dejar un
 * DELETE en 0 filas SIN error: sin esta verificación la app celebraba un
 * borrado que nunca ocurrió y la cliente reaparecía al recargar.
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
            throw new Error('No se puede eliminar: la cliente tiene turnos o servicios en el historial. El historial se conserva para no perder registros.');
        }
        throw error;
    }
    if (!data || data.length === 0) {
        throw new Error('No se pudo eliminar la cliente: no hay permisos (RLS) o ya no existe en el sistema.');
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

    const usuarioId = payload.usuario_id;
    const fecha = payload.fecha;
    const horaInicio = payload.hora_inicio;
    const horaFin = payload.hora_fin;

    // Regla de negocio: un usuario no puede crear dos turnos al mismo tiempo.
    // Si ya existe un turno (no cancelado) del mismo usuario en la misma fecha
    // cuyos horarios se solapan, se rechaza la creación.
    if (usuarioId && fecha && horaInicio && horaFin) {
        const { data: solapados, error: solapError } = await supabase
            .from('turnos')
            .select('id, hora_inicio, hora_fin, servicio')
            .eq('usuario_id', usuarioId)
            .eq('fecha', fecha)
            .neq('estado', 'cancelado')
            .lt('hora_inicio', horaFin)
            .gt('hora_fin', horaInicio);

        if (solapError) throw solapError;

        if (solapados && solapados.length > 0) {
            const conflicto = solapados[0];
            const hi = new Date(conflicto.hora_inicio).toLocaleTimeString('es-AR', {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            const hf = new Date(conflicto.hora_fin).toLocaleTimeString('es-AR', {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            throw new Error(
                `Ya tenés un turno agendado para el ${fecha} de ${hi} a ${hf} (${conflicto.servicio}). No se pueden crear dos turnos al mismo tiempo.`
            );
        }
    }

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
    if (!data) throw new Error('No se encontró el turno para actualizar. Puede que tu rol no tenga permiso (RLS) o que el turno ya no exista.');
    return data;
}

export async function updateAppointmentInDatabase({ id = null, legacyId = null, updates = {} } = {}) {
    if (!supabase) throw new Error('Supabase no está disponible.');

    const tocaHorario = Boolean(updates.hora_inicio || updates.hora_fin || updates.fecha);
    let turnoActual = null;
    let usuarioId = null;

    // Si se toca fecha/horario, necesitamos el turno actual para obtener
    // usuario_id y los valores actuales (fallback cuando no se pasan todos).
    if (tocaHorario) {
        const columna = id ? 'id' : 'legacy_id';
        const valor = id || legacyId;
        const { data: existente, error: errExistente } = await supabase
            .from('turnos')
            .select('id, usuario_id, fecha, hora_inicio, hora_fin, estado')
            .eq(columna, valor)
            .maybeSingle();
        if (errExistente) throw errExistente;
        if (!existente) throw new Error('No se encontró el turno para actualizar.');
        turnoActual = existente;
        usuarioId = existente.usuario_id;
    }

    // Regla de negocio: un usuario no puede tener dos turnos solapados.
    // Al reagendar, se excluye el turno que se está editando para que no
    // choque consigo mismo. Los turnos cancelados no bloquean el horario.
    if (tocaHorario && usuarioId && turnoActual) {
        const nuevaFecha = updates.fecha || turnoActual.fecha;
        const nuevaHoraInicio = updates.hora_inicio || turnoActual.hora_inicio;
        const nuevaHoraFin = updates.hora_fin || turnoActual.hora_fin;

        const { data: solapados, error: solapError } = await supabase
            .from('turnos')
            .select('id, hora_inicio, hora_fin, servicio')
            .eq('usuario_id', usuarioId)
            .eq('fecha', nuevaFecha)
            .neq('estado', 'cancelado')
            .neq('id', turnoActual.id)
            .lt('hora_inicio', nuevaHoraFin)
            .gt('hora_fin', nuevaHoraInicio);

        if (solapError) throw solapError;

        if (solapados && solapados.length > 0) {
            const conflicto = solapados[0];
            const hi = new Date(conflicto.hora_inicio).toLocaleTimeString('es-AR', {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            const hf = new Date(conflicto.hora_fin).toLocaleTimeString('es-AR', {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            throw new Error(
                `Ya tenés un turno agendado para el ${nuevaFecha} de ${hi} a ${hf} (${conflicto.servicio}). No se pueden crear dos turnos al mismo tiempo.`
            );
        }
    }

    let query = supabase.from('turnos').update(updates);
    query = id ? query.eq('id', id) : query.eq('legacy_id', legacyId);
    const { data, error } = await query
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, motivo_cancelacion, event_id, cliente_id, usuario_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No se encontró el turno para actualizar. Puede que tu rol no tenga permiso (RLS) o que el turno ya no exista.');
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
    await requireAuthForRead();
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
            .select('id, fecha, servicio, categoria, precio, sena, metodo_pago, monto_efectivo, monto_transferencia, saldo_pendiente, completado, vuelto, perfiles(nombre)')
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

/**
 * Elimina un turno en cascada: pagos (señas y cobros) → servicio vinculado →
 * turno. Solo para superadmin: borra datos de caja e historial, así que la UI
 * lo ofrece únicamente con rol superadmin y confirmación explícita.
 *
 * Orden obligatorio (FKs sin ON DELETE CASCADE):
 *  1. `pagos` por turno_id (señas) y por servicio_id (cobros del servicio).
 *  2. `servicios` por turno_id (el cobro asociado al turno).
 *  3. `turnos` por id/legacy_id.
 *
 * RLS: el borrado de pagos y servicios ya es admin-only
 * (pagos_delete_admin / servicios_delete_admin, y es_admin_actual incluye al
 * superadmin), así que no hace falta migración para esta función.
 *
 * @returns {Promise<{success: true, pagos: number, servicios: number}>}
 */
export async function deleteTurnoCascade(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    if (!id) throw new Error('Falta el ID del turno.');
    const uuid = await resolveTurnoUuid(id).catch(() => null);
    // Intentar por UUID y por legacy_id para cubrir caché vieja.
    const turnoKeys = [];
    if (uuid) turnoKeys.push({ col: 'id', val: uuid });
    if (!isUuid(id)) turnoKeys.push({ col: 'legacy_id', val: id });
    if (turnoKeys.length === 0) turnoKeys.push({ col: 'id', val: id });

    let servicioIds = [];
    if (uuid) {
        // Servicio(s) vinculados al turno: su borrado exige eliminar antes sus
        // pagos (pagos.servicio_id tiene FK a servicios sin cascade, igual que
        // ya hace deleteServiceFromDatabase).
        const { data: vinculados, error: vinculadosError } = await supabase
            .from('servicios')
            .select('id')
            .eq('turno_id', uuid);
        if (vinculadosError) throw vinculadosError;
        servicioIds = (vinculados || []).map((s) => s.id).filter(Boolean);
    }

    let pagosBorrados = 0;

    // 1a) Pagos directos del turno (señas: tipo 'sena' con turno_id).
    // turno_id es uuid: solo se usa el UUID resuelto, nunca el legacy_id
    // (texto) para no provocar error de tipo en Postgres.
    if (uuid) {
        const { data, error } = await supabase
            .from('pagos')
            .delete()
            .eq('turno_id', uuid)
            .select('id');
        if (error) throw error;
        pagosBorrados += (data || []).length;
    }

    // 1b) Pagos de cada servicio vinculado (cobros con servicio_id).
    for (const servicioId of servicioIds) {
        const { data, error } = await supabase
            .from('pagos')
            .delete()
            .eq('servicio_id', servicioId)
            .select('id');
        if (error) throw error;
        pagosBorrados += (data || []).length;
    }

    // 2) Servicio(s) vinculado(s) al turno.
    let serviciosBorrados = 0;
    if (uuid) {
        const { data, error } = await supabase
            .from('servicios')
            .delete()
            .eq('turno_id', uuid)
            .select('id');
        if (error) {
            const code = String(error.code || '');
            if (code === '23503' || /violates foreign key constraint/i.test(error.message || '')) {
                throw new Error('No se puede eliminar: el servicio del turno tiene datos asociados.');
            }
            throw error;
        }
        serviciosBorrados = (data || []).length;
    }

    // 3) El turno propiamente dicho.
    let turnoBorrado = false;
    let lastError = null;
    for (const attempt of turnoKeys) {
        const { data, error } = await supabase
            .from('turnos')
            .delete()
            .eq(attempt.col, attempt.val)
            .select('id');
        if (!error && data && data.length > 0) {
            turnoBorrado = true;
            break;
        }
        if (error) lastError = error;
    }
    if (!turnoBorrado) {
        if (lastError) throw lastError;
        throw new Error('No se encontró el turno para eliminar. Puede que tu rol no tenga permiso (solo superadmin puede borrar en cascada) o la sesión expiró.');
    }
    return { success: true, pagos: pagosBorrados, servicios: serviciosBorrados };
}


export async function deleteServiceFromDatabase(id) {
    if (!supabase) throw new Error('Supabase no está disponible.');
    if (!id) throw new Error('Falta el ID del registro.');

    // Resolver el UUID real del servicio: puede venir como UUID o como
    // legacy_id (caché vieja), igual que en deleteAppointmentFromDatabase.
    let uuid = null;
    if (isUuid(id)) {
        uuid = id;
    } else {
        const { data, error } = await supabase
            .from('servicios')
            .select('id')
            .eq('legacy_id', id)
            .maybeSingle();
        if (error) throw error;
        uuid = data?.id || null;
    }
    if (!uuid) {
        throw new Error('No se encontró el registro a eliminar: puede que ya no exista o que tu rol no tenga permiso (solo admin).');
    }

    // `pagos` tiene FK a `servicios` sin cascade: se borran primero los pagos
    // del servicio para no violar la integridad referencial (23503). El
    // borrado de pagos es admin-only en RLS, igual que este en la interfaz.
    const { error: pagosError } = await supabase
        .from('pagos')
        .delete()
        .eq('servicio_id', uuid);
    if (pagosError) throw pagosError;

    const { data: deleted, error } = await supabase
        .from('servicios')
        .delete()
        .eq('id', uuid)
        .select('id');
    if (error) {
        const code = String(error.code || '');
        if (code === '23503' || /violates foreign key constraint/i.test(error.message || '')) {
            throw new Error('No se puede eliminar: el registro tiene datos asociados en el historial.');
        }
        throw error;
    }
    // RLS puede dejar el delete en 0 filas SIN error: verificar filas afectadas
    // para no celebrar un borrado que nunca ocurrió (el registro reaparecía
    // al recargar el historial).
    if (!deleted || deleted.length === 0) {
        throw new Error('No se pudo eliminar el registro: no tenés permiso (solo admin) o ya no existe.');
    }
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

/**
 * Registra los cobros del servicio y marca el turno como completado.
 *
 * `payments` (array de {amount, method}) permite un cobro combinado: una fila
 * en `pagos` por cada medio usado. Se mantiene `paymentAmount`/`paymentMethod`
 * como atajo para el caso único (si `payments` no viene, se usa ese par).
 * Importante: el cobro combinado solo genera filas en `pagos` cuando hay
 * turno_id o servicio_id (requisito de la tabla); el reparto exacto vive en
 * las columnas de `servicios`, que se guardan siempre en registerServiceDirectly.
 */
export async function finalizeRegisteredService({
    turnoId = null,
    turnoLegacyId = null,
    precio = 0,
    serviceId = null,
    paymentAmount = 0,
    paymentMethod = 'transferencia',
    payments = null,
    usuarioId = null
}) {
    if (!supabase) throw new Error('Supabase no está disponible.');

    const plan = (Array.isArray(payments) && payments.length > 0)
        ? payments
        : [{ amount: paymentAmount, method: paymentMethod }];

    for (const entry of plan) {
        await registerPaymentRecord({
            serviceId,
            turnoId,
            usuarioId,
            amount: entry.amount,
            paymentMethod: entry.method,
            type: 'cobro'
        });
    }

    if (!turnoId && !turnoLegacyId) return { updated: true, turnoId: null };

    let query = supabase
        .from('turnos')
        .update({ estado: 'completado', precio: Number(precio) || 0 });
    query = turnoId ? query.eq('id', turnoId) : query.eq('legacy_id', turnoLegacyId);

    // RLS puede dejar el update en 0 filas SIN error: sin verificar, la app
    // celebraba un cobro que nunca se aplicó y el turno seguía 'reservado'.
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error('No se pudo marcar el turno como cobrado: no tenés permiso (RLS) o el turno ya no existe.');
    }
    return { updated: true, turnoId: turnoId || turnoLegacyId };
}

/**
 * Completa un cobro pendiente (fiado puro o porción fiada de un combinado).
 *
 * - `amount`: monto a cobrar en este momento. Si no viene, se usa el precio
 *   total (comportamiento clásico de los fiados).
 * - `combined`: marca que el servicio es `combinado`; en ese caso NO se cambia
 *   `metodo_pago` (sigue describiendo el reparto original), se decrementa
 *   `saldo_pendiente` y la porción cobrada se suma al medio elegido
 *   (`monto_efectivo` / `monto_transferencia`), para que la Caja refleje el
 *   dinero real de cada medio.
 */
export async function completePendingPayment({
    serviceId,
    serviceOverride = null,
    paymentMethod = 'transferencia',
    amount = null,
    combined = false,
    vuelto = 0,
    finalizeTurno = true,
    usuarioId = null
}) {
    if (!supabase) return { updated: false, reason: 'missing_supabase' };

    let serviceRecord = serviceOverride;
    if (!serviceRecord) {
        const { data, error } = await supabase
            .from('servicios')
            .select('id, legacy_id, turno_id, cliente_id, fecha, servicio, precio, metodo_pago, monto_efectivo, monto_transferencia, saldo_pendiente, completado')
            .or(`id.eq.${serviceId},legacy_id.eq.${serviceId}`)
            .maybeSingle();
        if (error) throw error;
        serviceRecord = data;
    }

    if (!serviceRecord) return { updated: false, reason: 'missing_service' };

    const servicePk = serviceRecord.id || serviceRecord.legacy_id || serviceId;
    const paymentMethodValue = String(paymentMethod || 'transferencia').toLowerCase() === 'efectivo'
        ? 'efectivo'
        : 'transferencia';
    const montoACobrar = Math.max(0, Number(amount ?? (Number(serviceRecord.precio) || 0)) || 0);

    const updatePayload = {
        completado: true,
        vuelto: Number(vuelto) || 0
    };
    if (combined) {
        const previo = Number(serviceRecord[`monto_${paymentMethodValue}`]) || 0;
        updatePayload.metodo_pago = 'combinado';
        updatePayload[`monto_${paymentMethodValue}`] = previo + montoACobrar;
        updatePayload.saldo_pendiente = Math.max(
            0,
            (Number(serviceRecord.saldo_pendiente) || 0) - montoACobrar
        );
    } else {
        updatePayload.metodo_pago = paymentMethodValue;
    }

    const { error: serviceError } = await supabase
        .from('servicios')
        .update(updatePayload)
        .or(`id.eq.${servicePk},legacy_id.eq.${servicePk}`);
    if (serviceError) throw serviceError;

    const finalizedTurnoId = serviceRecord.turno_id || null;
    if (serviceRecord.id) {
        if (montoACobrar > 0) {
            await registerPaymentRecord({
                serviceId: serviceRecord.id,
                turnoId: finalizedTurnoId,
                usuarioId,
                amount: montoACobrar,
                paymentMethod: paymentMethodValue,
                type: 'cobro'
            });
        }
    }

    if (!finalizeTurno) return { updated: true, turnoId: finalizedTurnoId };

    const matchId = serviceRecord.turno_id || null;
    if (matchId) {
        // Misma red de seguridad que finalizeRegisteredService: RLS puede dejar
        // el update en 0 filas sin error y el cobro quedaría sin aplicar.
        const { data: turnoUpdated, error: turnoError } = await supabase
            .from('turnos')
            .update({ estado: normalizeTurnoEstado('completado'), precio: Number(serviceRecord.precio) || 0 })
            .eq('id', matchId)
            .select('id');
        if (turnoError) throw turnoError;
        if (!turnoUpdated || turnoUpdated.length === 0) {
            throw new Error('No se pudo marcar el turno como cobrado: no tenés permiso (RLS) o el turno ya no existe.');
        }
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
    const metodo = String(serviceOverride?.metodo_pago || 'transferencia').toLowerCase();
    const esCombinado = metodo === 'combinado';
    return completePendingPayment({
        serviceId,
        serviceOverride,
        paymentMethod: esCombinado ? 'transferencia' : metodo,
        // Un combinado ya cobrado no debe generar un cobro nuevo: solo se
        // sincroniza el estado del turno (saldo 0, sin monto a registrar).
        amount: esCombinado ? 0 : null,
        combined: esCombinado,
        vuelto: 0,
        finalizeTurno: true
    });
}
