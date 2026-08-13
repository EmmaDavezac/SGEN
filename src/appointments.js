import { CONFIG_SHEET_URL } from './config.js';
import state from './state.js';
import { showLoader } from './ui/loader.js';
import { showToast } from './ui/toast.js';

export function createStableAppointmentId(apt) {
    const seed = [
        apt?.id || "",
        apt?.fecha || "",
        apt?.horaInicio || "",
        apt?.horaFin || "",
        apt?.cliente || "",
        apt?.servicio || "",
        apt?.precio || "",
        apt?.estado || ""
    ].join("|");

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }

    return `app_${Math.abs(hash)}`;
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

    const addRecord = (record) => {
        const normalized = normalizeAppointmentRecord(record);
        if (!normalized) return;

        const key = normalized.id || `${normalized.horaInicio || ""}-${normalized.cliente || ""}-${normalized.servicio || ""}`;
        if (!key) return;

        const existing = byId.get(key);
        if (existing) {
            byId.set(key, { ...existing, ...normalized });
        } else {
            byId.set(key, normalized);
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
        const response = await fetch(`${CONFIG_SHEET_URL}?action=get_appointments&email=${encodeURIComponent(state.currentUser.email)}`);
        const data = await response.json();

        if (data.success && Array.isArray(data.appointments)) {
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
