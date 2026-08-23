import { CONFIG_SHEET_URL } from './config.js';
import state from './state.js';
import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';
import { apiGet } from './api.js';
import { supabase } from './supabase.js';

export function createStableAppointmentId(apt) {
    const seed = [
        apt?.fecha || "",
        apt?.horaInicio || "",
        apt?.cliente || "",
        apt?.servicio || "",
        apt?.usuario || ""
    ].join("|");

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }

    return `app_${Math.abs(hash)}`;
}

function getAppointmentIdentity(apt) {
    return [
        apt?.horaInicio || apt?.fecha || "",
        apt?.cliente || "",
        apt?.servicio || "",
        apt?.usuario || ""
    ].join("|").toLowerCase().trim();
}

export function normalizeAppointmentRecord(apt) {
    if (!apt || typeof apt !== "object") return null;

    const normalized = { ...apt };
    if (!normalized.id) {
        normalized.id = createStableAppointmentId(normalized);
    }
    if (normalized.estado && typeof normalized.estado === "string") {
        normalized.estado = normalized.estado.toString().trim();
    }
    if (!normalized.estado) {
        normalized.estado = "Provisional";
    }
    if (normalized.estado && typeof normalized.estado === "string") {
        const lower = normalized.estado.toLowerCase();
        if (lower === "completed" || lower === "completado" || lower === "cobrado" || lower === "pagado") normalized.estado = "Completado";
        else if (lower === "reservado") normalized.estado = "Reservado";
        else if (lower === "provisional") normalized.estado = "Provisional";
    }
    if (normalized.precio === undefined || normalized.precio === null) {
        normalized.precio = 0;
    }
    if (!normalized.horaInicio && normalized.fecha) {
        normalized.horaInicio = normalized.fecha;
    }
    if (!normalized.horaFin && normalized.horaInicio) {
        normalized.horaFin = normalized.horaInicio;
    }
    return normalized;
}

export function normalizeAppointmentList(appointments, fallbackAppointments = []) {
    const normalized = [];
    const seenKeys = new Set();

    const pushUnique = (item) => {
        const record = normalizeAppointmentRecord(item);
        if (!record) return;

        const key = record.id || `${record.horaInicio || ""}-${record.cliente || ""}-${record.servicio || ""}`;
        if (!key || seenKeys.has(key)) return;

        seenKeys.add(key);
        normalized.push(record);
    };

    if (Array.isArray(appointments)) {
        appointments.forEach(pushUnique);
    }

    if (Array.isArray(fallbackAppointments) && normalized.length < fallbackAppointments.length) {
        fallbackAppointments.forEach(pushUnique);
    }

    return normalized.sort((a, b) => {
        const aTime = new Date(a.horaInicio || a.fecha || 0).getTime();
        const bTime = new Date(b.horaInicio || b.fecha || 0).getTime();
        return aTime - bTime;
    });
}

export function mergeAppointmentLists(localAppointments, cloudAppointments) {
    const merged = [];
    const byId = new Map();
    const byIdentity = new Map();

    const addRecord = (record) => {
        const normalized = normalizeAppointmentRecord(record);
        if (!normalized) return;

        const idKey = normalized.id || "";
        const identityKey = getAppointmentIdentity(normalized);
        if (!idKey && !identityKey) return;

        const existing = byId.get(idKey) || byIdentity.get(identityKey);
        if (existing) {
            const mergedRecord = { ...existing, ...normalized };
            if (idKey) byId.set(idKey, mergedRecord);
            if (identityKey) byIdentity.set(identityKey, mergedRecord);
            const index = merged.indexOf(existing);
            if (index !== -1) merged[index] = mergedRecord;
        } else {
            if (idKey) byId.set(idKey, normalized);
            if (identityKey) byIdentity.set(identityKey, normalized);
            merged.push(normalized);
        }
    };

    (Array.isArray(localAppointments) ? localAppointments : []).forEach(addRecord);
    (Array.isArray(cloudAppointments) ? cloudAppointments : []).forEach(addRecord);

    return merged.sort((a, b) => {
        const aTime = new Date(a.horaInicio || a.fecha || 0).getTime();
        const bTime = new Date(b.horaInicio || b.fecha || 0).getTime();
        return aTime - bTime;
    });
}

export async function loadAppointments(showNotification = false) {
    if (!state.currentUser) return;
    const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;

    if (supabase && state.currentUser.authId) {
        const { data, error } = await supabase
            .from('turnos')
            .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, clientes(nombre), perfiles(email)')
            .order('hora_inicio', { ascending: true });

        if (!error && Array.isArray(data)) {
            state.appointmentsList = normalizeAppointmentList(data.map(item => normalizeAppointmentRecord({
                id: item.legacy_id || item.id,
                fecha: item.fecha,
                horaInicio: item.hora_inicio,
                horaFin: item.hora_fin,
                cliente: item.clientes?.nombre || 'Cliente',
                servicio: item.servicio,
                precio: item.precio,
                estado: item.estado,
                eventId: item.event_id,
                usuario: item.perfiles?.email || state.currentUser.email
            })));

            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            if (typeof window.renderCalendar === 'function') window.renderCalendar();
            if (typeof window.renderDayAppointments === 'function') window.renderDayAppointments();
            if (showNotification) showToast('Agenda actualizada desde Supabase.', 'success');
            return;
        }

        console.error('No se pudieron cargar turnos desde Supabase:', error);
        state.appointmentsList = [];
        localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
        if (typeof window.renderCalendar === 'function') window.renderCalendar();
        if (typeof window.renderDayAppointments === 'function') window.renderDayAppointments();
        if (showNotification) showToast('No se pudieron cargar los turnos desde Supabase.', 'error');
        return;
    }

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            state.appointmentsList = normalizeAppointmentList(parsed);
        } catch (e) {
            console.error("Error al parsear caché local de turnos:", e);
            state.appointmentsList = [];
        }
    } else {
        state.appointmentsList = [];
    }

    const activeTab = document.querySelector(".nav-item.active");
    if (activeTab && activeTab.getAttribute("data-tab") === "calendario") {
        if (typeof window.renderCalendar === 'function') window.renderCalendar();
        if (typeof window.renderDayAppointments === 'function') window.renderDayAppointments();
    }

    if (!CONFIG_SHEET_URL) return;

    try {
        const url = `${CONFIG_SHEET_URL}?action=get_appointments&email=${encodeURIComponent(state.currentUser.email)}`;
        const data = await apiGet(url, { showLoading: true, loadingText: 'Cargando turnos...', swallowError: true });

        if (data && data.success && Array.isArray(data.appointments)) {
            const hasCloudData = data.appointments.length > 0;
            const hasLocalData = state.appointmentsList.length > 0;

            if (hasCloudData && hasLocalData) {
                state.appointmentsList = mergeAppointmentLists(state.appointmentsList, data.appointments);
            } else if (hasCloudData) {
                state.appointmentsList = normalizeAppointmentList(data.appointments);
            } else {
                state.appointmentsList = normalizeAppointmentList(state.appointmentsList);
            }

            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));

            if (typeof window.renderCalendar === 'function') window.renderCalendar();
            if (typeof window.renderDayAppointments === 'function') window.renderDayAppointments();

            if (showNotification) {
                showToast("Agenda actualizada desde la nube.", "success");
            }
        } else {
            state.appointmentsList = normalizeAppointmentList(state.appointmentsList);
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            if (showNotification) {
                showToast(data.message || "No se pudieron obtener los turnos", "error");
            }
        }
    } catch (error) {
        console.warn("No se pudieron cargar los turnos de la nube, usando caché local.", error);
        state.appointmentsList = normalizeAppointmentList(state.appointmentsList);
        localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
        if (showNotification) {
            showToast("Sin conexión a la nube. Mostrando turnos guardados localmente.", "warning");
        }
    }
}

export async function updateAppointmentInSupabase(appointmentId, updates) {
    if (!supabase || !state.currentUser?.authId) return null;

    const lookup = supabase.from('turnos').select('id').eq('legacy_id', appointmentId).maybeSingle();
    const { data: existing, error: lookupError } = await lookup;
    if (lookupError) throw lookupError;
    if (!existing) throw new Error('No se encontró el turno en Supabase.');

    const { data, error } = await supabase
        .from('turnos')
        .update(updates)
        .eq('id', existing.id)
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id')
        .single();
    if (error) throw error;
    return { success: true, appointment: data };
}

export async function deleteAppointmentInSupabase(appointmentId) {
    if (!supabase || !state.currentUser?.authId) return null;

    const { data: existing, error: lookupError } = await supabase
        .from('turnos')
        .select('id')
        .eq('legacy_id', appointmentId)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) throw new Error('No se encontró el turno en Supabase.');

    const { error } = await supabase.from('turnos').delete().eq('id', existing.id);
    if (error) throw error;
    return { success: true };
}

// Obtener partes de fecha de un turno (year, month (0-based), day, hour, minute)
export function getAppointmentDateParts(apt) {
    if (!apt) return null;
    const dateStr = apt.horaInicio || apt.fecha || null;
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return {
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes()
    };
}
