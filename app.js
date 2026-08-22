/**
 * =========================================================================
 *                  LÓGICA DE APLICACIÓN - EVOLET NAILS
 * =========================================================================
 * 
 * CONFIGURACIÓN DE LA NUBE:
 * Pega la URL del Web App de Google (Apps Script) entre las comillas simples de abajo.
 */
import { showLoader } from './src/ui/loader.js';
import { showToast } from './src/ui/toast.js';
import { apiPost, apiGet } from './src/api.js';
// Import Font Awesome from local dependency so Vite bundles fonts correctly
import '@fortawesome/fontawesome-free/css/all.min.css';
import { CONFIG_SHEET_URL } from './src/config.js';
import state from './src/state.js';
import { loadAppointments, normalizeAppointmentList, mergeAppointmentLists, createStableAppointmentId, getAppointmentDateParts } from './src/appointments.js';
import {
    normalizeServiceRecord,
    normalizeExpenseRecord,
    loadServicesData,
    registerServiceDirectly,
    saveServicesCache,
    updateClientAutocomplete,
    renderHistoryList,
    getFilteredHistory,
    filterHistory,
    deleteServiceRecord,
    cancelDeleteServiceRecord,
    confirmDeleteServiceRecord
} from './src/services.js';

window.deleteServiceRecord = deleteServiceRecord;
window.cancelDeleteServiceRecord = cancelDeleteServiceRecord;
window.confirmDeleteServiceRecord = confirmDeleteServiceRecord;
window.viewServiceDetail = viewServiceDetail;

function getYearMonthStr(fechaValue) {
    if (!fechaValue) return "";

    // Si ya es un string con pinta de fecha ISO ("YYYY-MM-DD..."), usamos los primeros 7 caracteres
    if (typeof fechaValue === "string" && /^\d{4}-\d{2}/.test(fechaValue)) {
        return fechaValue.substring(0, 7);
    }

    // Para cualquier otro caso (Date, número/timestamp, u otro string raro):
    // construimos un Date y extraemos año y mes de forma segura
    const d = new Date(fechaValue);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Exponer renderizadores para que los módulos importados puedan invocarlos sin crear dependencia circular
window.renderCalendar = renderCalendar;
window.renderDayAppointments = renderDayAppointments;

function normalizeDateValue(fechaValue) {
    if (!fechaValue) return null;

    if (fechaValue instanceof Date) {
        return isNaN(fechaValue.getTime()) ? null : fechaValue;
    }

    if (typeof fechaValue === "number") {
        const parsed = new Date(fechaValue);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof fechaValue === "string") {
        const trimmed = fechaValue.toString().trim();
        if (!trimmed) return null;

        if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(trimmed)) {
            const normalized = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`;
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) return parsed;
        }

        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
}

function normalizeCalendarDate(fechaValue) {
    const dateValue = normalizeDateValue(fechaValue);
    if (!dateValue) return new Date();

    return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function getMonthWindowRange(referenceDate = new Date()) {
    const endDate = new Date(referenceDate);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, referenceDate.getDate());
    startDate.setHours(0, 0, 0, 0);

    return { startDate, endDate };
}

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

// Servicios y historial movidos a src/services.js

function isWithinMonthWindow(fechaValue, referenceDate = new Date()) {
    const dateValue = normalizeDateValue(fechaValue);
    if (!dateValue) return false;

    const { startDate, endDate } = getMonthWindowRange(referenceDate);
    return dateValue >= startDate && dateValue <= endDate;
}

function updateCashActionsVisibility() {
    const val = document.querySelector('input[name="payment-method"]:checked') ? document.querySelector('input[name="payment-method"]:checked').value : null;
    const cashActions = document.getElementById('cash-actions');
    if (cashActions) cashActions.style.display = (val === 'Efectivo') ? 'block' : 'none';
}

function hasSuspiciousPriceInput(rawValue) {
    const num = Number(rawValue);
    if (!Number.isFinite(num) || num <= 0) return false;
    return num > 0 && num < 1000;
}

function updateCashSummary() {
    const amountInput = document.getElementById('cash-amount-given');
    const dueEl = document.getElementById('cash-summary-due');
    const givenEl = document.getElementById('cash-summary-given');
    const changeEl = document.getElementById('cash-summary-change');

    if (!amountInput || !dueEl || !givenEl || !changeEl || !state.pendingTransaction) return;

    const totalPrice = Number(state.pendingTransaction.precio) || 0;
    const senaAmount = Number(state.pendingTransaction.seña) || 0;
    const amountDue = Math.max(0, totalPrice - senaAmount);
    const amountGiven = Number(amountInput.value) || 0;
    const change = Math.max(0, amountGiven - amountDue);

    dueEl.textContent = `$${amountDue.toLocaleString("es-AR")}`;
    givenEl.textContent = `$${amountGiven.toLocaleString("es-AR")}`;
    changeEl.textContent = `$${change.toLocaleString("es-AR")}`;
}

function openCashModal() {
    const modal = document.getElementById('cash-modal');
    if (!modal) return;
    const amountInput = document.getElementById('cash-amount-given');
    if (amountInput && state.pendingTransaction) {
        const totalPrice = Number(state.pendingTransaction.precio) || 0;
        const senaAmount = Number(state.pendingTransaction.seña) || 0;
        const amountDue = Math.max(0, totalPrice - senaAmount);
        amountInput.value = (state.pendingTransaction.amountGiven !== undefined) ? state.pendingTransaction.amountGiven : amountDue;
    }
    updateCashSummary();
    modal.classList.remove('hidden');
}

function closeCashModal() {
    const modal = document.getElementById('cash-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function resetServiceForm() {
    const form = document.getElementById("service-form");
    if (form) form.reset();

    const servicePriceInput = document.getElementById("service-price");
    if (servicePriceInput) {
        servicePriceInput.value = "";
        delete servicePriceInput.dataset.priceAlertShown;
    }

    const extRemovalCheck = document.getElementById("chk-external-removal");
    if (extRemovalCheck) extRemovalCheck.checked = false;

    const extRemovalContainer = document.getElementById("external-removal-options-container");
    if (extRemovalContainer) {
        extRemovalContainer.classList.add("hidden");
    }

    const paymentRadio = document.querySelector('input[name="payment-method"][value="Transferencia"]');
    if (paymentRadio) paymentRadio.checked = true;

    const cashAmountInput = document.getElementById("cash-amount-given");
    if (cashAmountInput) cashAmountInput.value = "";

    state.pendingTransaction = null;
    state.linkedAppointment = null;
}

function handleCashModalConfirm() {
    const amountInput = document.getElementById('cash-amount-given');
    const amountNum = amountInput ? Number(amountInput.value) || 0 : 0;
    const returnMethodEl = document.querySelector('input[name="cash-return-method"]:checked');
    const returnMethod = returnMethodEl ? returnMethodEl.value : 'Efectivo';

    if (!state.pendingTransaction) {
        closeCashModal();
        showToast('No hay transacción en espera.', 'error');
        return;
    }

    const totalPrice = Number(state.pendingTransaction.precio) || 0;
    const senaAmount = Number(state.pendingTransaction.seña) || 0;
    const amountDue = Math.max(0, totalPrice - senaAmount);
    const vuelto = Math.max(0, Number((amountNum - amountDue).toFixed(2)));

    state.pendingTransaction.vuelto = vuelto;
    state.pendingTransaction.vueltoReturnMethod = returnMethod;
    state.pendingTransaction.amountGiven = amountNum;

    closeCashModal();

    // Ahora abrir modal de confirmación con los datos actualizados
    document.getElementById("confirm-client").textContent = state.pendingTransaction.cliente;
    document.getElementById("confirm-service").textContent = state.pendingTransaction.servicio;

    if (senaAmount > 0) {
        const netPrice = Number(state.pendingTransaction.precio) - senaAmount;
        document.getElementById("confirm-price").innerHTML = `Total: $${Number(state.pendingTransaction.precio).toLocaleString("es-AR")} <br> <span style="font-size: 11px; color: var(--text-muted);">Seña: -$${senaAmount.toLocaleString("es-AR")} | Neto: <strong>$${netPrice.toLocaleString("es-AR")}</strong></span>`;
    } else {
        document.getElementById("confirm-price").textContent = `$${Number(state.pendingTransaction.precio).toLocaleString("es-AR")}`;
    }

    // Añadir info de vuelto si existe
    if (state.pendingTransaction.vuelto && Number(state.pendingTransaction.vuelto) > 0) {
        document.getElementById("confirm-payment").textContent = `${state.pendingTransaction.metodoPago} (Vuelto: $${Number(state.pendingTransaction.vuelto).toLocaleString("es-AR")})`;
    } else {
        document.getElementById("confirm-payment").textContent = state.pendingTransaction.metodoPago;
    }

    document.getElementById("confirm-modal").classList.remove("hidden");
}


// Catálogo de Servicios oficial extraído del PDF
let SERVICES_CATALOG = {
    semi: [
        { name: "Semipermanente Basic", price: 12000 },
        { name: "Semipermanente Full", price: 14000 }
    ],
    kapping: [
        { name: "Kapping", price: 12500 },
        { name: "Kapping Basic", price: 14000 },
        { name: "Kapping Full", price: 15500 },
        { name: "Kapping con Polygel Basic", price: 15500 },
        { name: "Kapping con Polygel Full", price: 17000 }
    ],
    softgel: [
        { name: "Soft Gel Basic", price: 16500 },
        { name: "Soft Gel Full", price: 18000 }
    ],
    esculpidas: [
        { name: "Esculpidas en Polygel Basic", price: 17500 },
        { name: "Esculpidas en Polygel Full", price: 19000 }
    ],
    remocion: [
        { name: "Retiro Servicio Propio", price: 0 },
        { name: "Remoción Semipermanente", price: 4500 },
        { name: "Remoción Kapping", price: 5000 },
        { name: "Remoción Softgel", price: 5500 },
        { name: "Remoción Polygel", price: 6000 },
        { name: "Remoción Acrilico", price: 6500 }
    ],
    personalizado: [
        { name: "Servicio Personalizado", price: 0 }
    ]
};

// Estado General de la Aplicación (definido en src/state.js)

// =========================================================================
//                  INICIALIZACIÓN DE LA APLICACIÓN
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    // Registrar Service Worker para PWA Offline (Forzar chequeo de actualización de red)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then(reg => {
                console.log('Service Worker registrado con éxito');
                reg.update(); // Forzar verificación de nueva versión en cada carga
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    if (installingWorker) {
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('Nueva versión disponible. Recargando...');
                                    showToast("Actualizando aplicación a la última versión...", "success");
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 1500);
                                }
                            }
                        };
                    }
                };
            })
            .catch(err => console.warn('Error al registrar Service Worker:', err));
    }

    // Escuchar cuando el navegador vuelve a tener conexión para sincronizar de inmediato
    window.addEventListener("online", () => {
        showToast("Conexión de red restablecida. Sincronizando datos offline...", "info");
        checkAndSyncOfflineTransactions();
    });

    // Verificar Sesión Activa (v4)
    const savedSession = localStorage.getItem("evolet_session_v4");
    if (savedSession) {
        state.currentUser = JSON.parse(savedSession);
        document.getElementById("user-display-name").textContent = state.currentUser.nombre;
        showAppScreen();
        loadServicesData();
        loadPricesFromCloud(); // Cargar precios dinámicos
        loadAppointments(); // Cargar turnos agendados en la nube
        loadExpenses(); // Cargar gastos registrados
        loadCajaMovements(); // Cargar movimientos entre cajas
        checkAdminAccess(); // Verificar si es admin para la pestaña Ajustes
    } else {
        showLoginScreen();
    }

    // Renderizar categorías y servicios iniciales en el formulario
    renderCategories();
    selectCategory("semi");
    // Ajustar visibilidad de controles extra para efectivo
    updateCashActionsVisibility();
}

// =========================================================================
//                  EVENT LISTENERS
// =========================================================================
function setupEventListeners() {
    // Login
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);

    // Navegación de Pestañas
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            const tabName = e.currentTarget.getAttribute("data-tab");
            switchTab(tabName);
        });
    });
// Modal de Detalle de Servicio / Ticket
    const detailBtnClose = document.getElementById("detail-btn-close");
    if (detailBtnClose) {
        detailBtnClose.addEventListener("click", () => {
            document.getElementById("service-detail-modal").classList.add("hidden");
        });
    }
    const detailBtnShare = document.getElementById("detail-btn-share");
    if (detailBtnShare) {
        detailBtnShare.addEventListener("click", shareServiceTicket);
    }
    // Logout con Confirmación
    document.getElementById("btn-logout").addEventListener("click", () => {
        showGenericConfirmModal(
            "Cerrar Sesión",
            "¿Segura de que deseas cerrar sesión en la aplicación?",
            handleLogout
        );
    });

    // Formulario de Registro - Categorías
    document.querySelector(".category-grid").addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-cat")) {
            const cat = e.target.getAttribute("data-cat");
            selectCategory(cat);
        }
    });

    // Envío de Formulario de Servicio
    document.getElementById("service-form").addEventListener("submit", handleServiceSubmit);

    // Mostrar/ocultar y manejar precios de retiro externo previo
    document.getElementById("chk-external-removal").addEventListener("change", (e) => {
        const container = document.getElementById("external-removal-options-container");
        if (e.target.checked) {
            populateExternalRemovalTypes();
            container.classList.remove("hidden");
        } else {
            container.classList.add("hidden");
        }
        recalculateFinalServicePrice();
    });



    // Modal de Confirmación de Registro
    document.getElementById("modal-btn-confirm").addEventListener("click", confirmServiceRegistration);
    document.getElementById("modal-btn-cancel").addEventListener("click", cancelServiceRegistration);

    // Mostrar controles extra para efectivo cuando aplique
    const paymentRadios = document.querySelectorAll('input[name="payment-method"]');
    paymentRadios.forEach(r => r.addEventListener('change', updateCashActionsVisibility));

    const servicePriceInput = document.getElementById('service-price');
    if (servicePriceInput) {
        servicePriceInput.addEventListener('input', () => {
            const rawValue = Number(servicePriceInput.value);
            if (!hasSuspiciousPriceInput(rawValue)) {
                delete servicePriceInput.dataset.priceAlertShown;
            }
        });

        servicePriceInput.addEventListener('blur', () => {
            const rawValue = Number(servicePriceInput.value);
            if (hasSuspiciousPriceInput(rawValue) && servicePriceInput.dataset.priceAlertShown !== 'true') {
                servicePriceInput.dataset.priceAlertShown = 'true';
                window.alert('Hay un error en el monto ingresado. Verificá que el valor sea 9.000, 10.000 o similar, no 9 o 10.');
                servicePriceInput.focus();
                servicePriceInput.select();
            }
        });
    }

    // Botón Pago Justo (abre modal)
    const btnPago = document.getElementById('btn-pago-justo');
    if (btnPago) btnPago.addEventListener('click', () => {
        // Si hay una transacción pendiente (desde submit), usamos esa; sino preparamos una temporal
        if (!state.pendingTransaction) {
            showToast('Primero completa los datos del servicio y presiona Registrar.', 'info');
            return;
        }
        openCashModal();
    });

    // Cash modal handlers
    const cashCancel = document.getElementById('cash-modal-cancel');
    const cashConfirm = document.getElementById('cash-modal-confirm');
    const cashAmountInput = document.getElementById('cash-amount-given');
    if (cashCancel) cashCancel.addEventListener('click', closeCashModal);
    if (cashConfirm) cashConfirm.addEventListener('click', handleCashModalConfirm);
    if (cashAmountInput) cashAmountInput.addEventListener('input', updateCashSummary);

    // Modal de Confirmación de Eliminación
    document.getElementById("delete-btn-confirm").addEventListener("click", confirmDeleteServiceRecord);
    document.getElementById("delete-btn-cancel").addEventListener("click", cancelDeleteServiceRecord);

    // Movimientos entre cajas
    const cajaMovementForm = document.getElementById("caja-movement-form");
    if (cajaMovementForm) cajaMovementForm.addEventListener("submit", handleCajaMovementSubmit);

    // Historial - Buscador y Filtros
    document.getElementById("history-search").addEventListener("input", filterHistory);
    document.getElementById("history-filter").addEventListener("change", filterHistory);

    // Modales de Seña y Reagendamiento de Turnos
    document.getElementById("sena-form").addEventListener("submit", handleSenaSubmit);
    document.getElementById("sena-modal-btn-cancel").addEventListener("click", closeSenaModal);
    document.getElementById("reschedule-form").addEventListener("submit", handleRescheduleSubmit);
    document.getElementById("reschedule-modal-btn-cancel").addEventListener("click", closeRescheduleModal);

    // Botones de Recarga/Sincronización (Solución Móvil)
    const globalReloadBtn = document.getElementById("btn-global-reload");
    if (globalReloadBtn) {
        globalReloadBtn.addEventListener("click", () => refreshAllData(true));
    }

    const refreshCalBtn = document.getElementById("btn-refresh-calendar");
    if (refreshCalBtn) {
        refreshCalBtn.addEventListener("click", () => loadAppointments(true));
    }

    // Escuchar cuando la app vuelve a estar visible en pantalla en celulares
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && state.currentUser) {
            console.log("Pantalla encendida/App en primer plano, sincronizando turnos...");
            loadAppointments(false);
        }
    });

    // Cancelar cobro de turno y volver a Agenda
    const cancelCheckoutBtn = document.getElementById("btn-cancel-checkout");
    if (cancelCheckoutBtn) {
        cancelCheckoutBtn.addEventListener("click", cancelCheckoutAndReturnToAgenda);
    }

    // Listeners del constructor de servicio combinado (Categoría Otro)
    const selComb1 = document.getElementById("combined-service-1");
    const selComb2 = document.getElementById("combined-service-2");
    const cntComb1 = document.getElementById("combined-count-1");

    if (selComb1) selComb1.addEventListener("change", updateCombinedServiceCalculation);
    if (selComb2) selComb2.addEventListener("change", updateCombinedServiceCalculation);
    if (cntComb1) cntComb1.addEventListener("change", updateCombinedServiceCalculation);

    // Opciones de Cobro (Fiado toggle)
    const chkFiado = document.getElementById("chk-allow-fiado");
    if (chkFiado) {
        chkFiado.addEventListener("change", (e) => {
            state.allowFiado = e.target.checked;
            localStorage.setItem("evolet_allow_fiado", state.allowFiado ? "true" : "false");
            updateFiadoPaymentVisibility();
            showToast(state.allowFiado ? "Modo Fiado habilitado" : "Modo Fiado deshabilitado", "info");
        });
    }

    // Mostrar/ocultar la pestaña de Registrar desde Ajustes
    const chkRegisterTab = document.getElementById("chk-allow-register-tab");
    if (chkRegisterTab) {
        chkRegisterTab.addEventListener("change", (e) => {
            state.allowRegisterTab = e.target.checked;
            localStorage.setItem("evolet_allow_register_tab", state.allowRegisterTab ? "true" : "false");
            updateRegisterTabVisibility();
            showToast(state.allowRegisterTab ? "Pestaña Registrar habilitada" : "Pestaña Registrar oculta", "info");
        });
    }

    updateFiadoPaymentVisibility();
    updateRegisterTabVisibility();

    // Ajustes de precios (Admin)
    document.getElementById("btn-edit-mode").addEventListener("click", () => {
        state.isEditingPrices = true;
        document.getElementById("btn-edit-mode").classList.add("hidden");
        document.getElementById("edit-actions-container").classList.remove("hidden");
        renderPricesEditor();
    });


    document.getElementById("btn-cancel-prices").addEventListener("click", () => {
        showGenericConfirmModal(
            "Descartar cambios",
            "Tienes cambios sin guardar. ¿Deseas cancelar la edición y perder los cambios?",
            () => {
                state.isEditingPrices = false;
                document.getElementById("edit-actions-container").classList.add("hidden");
                document.getElementById("btn-edit-mode").classList.remove("hidden");
                renderPricesEditor();
                showToast("Edición cancelada", "info");
            }
        );
    });

    document.getElementById("btn-save-prices").addEventListener("click", () => {
        showGenericConfirmModal(
            "Guardar cambios",
            "¿Confirmas que deseas guardar la nueva lista de precios en la nube?",
            () => {
                savePricesToCloud();
            }
        );
    });

    // Modal Genérico de Confirmación
    document.getElementById("generic-modal-btn-confirm").addEventListener("click", () => {
        document.getElementById("generic-confirm-modal").classList.add("hidden");
        if (genericConfirmCallback) {
            genericConfirmCallback();
            genericConfirmCallback = null;
        }
    });

    document.getElementById("generic-modal-btn-cancel").addEventListener("click", () => {
        document.getElementById("generic-confirm-modal").classList.add("hidden");
        genericConfirmCallback = null;
    });

    // Navegación del Calendario
    document.getElementById("cal-prev-month").addEventListener("click", () => {
        state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById("cal-next-month").addEventListener("click", () => {
        state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
        renderCalendar();
    });

    // Abrir Modal de Agendar Turno
    document.getElementById("btn-open-schedule").addEventListener("click", () => {
        openScheduleModalForDate(state.selectedCalendarDay);
    });

 

    // Cerrar Modal de Agendar Turno
    document.getElementById("schedule-btn-cancel").addEventListener("click", () => {
        document.getElementById("schedule-modal").classList.add("hidden");
    });

    // Envío del formulario de agendar turno
    document.getElementById("schedule-form").addEventListener("submit", handleScheduleSubmit);

    // Mostrar/ocultar campos de seña según estado del turno
    document.getElementById("schedule-status").addEventListener("change", (e) => {
        const senaFields = document.getElementById("schedule-sena-fields");
        if (e.target.value === "Reservado") {
            senaFields.classList.remove("hidden");
        } else {
            senaFields.classList.add("hidden");
            document.getElementById("schedule-sena-amount").value = "0";
        }
    });

    // Envío del formulario de registrar gasto
    document.getElementById("expense-form").addEventListener("submit", handleExpenseSubmit);

    // Navegación desde Agenda a Historial de Ventas
    document.getElementById("btn-view-history").addEventListener("click", () => {
        switchTab("historial");
    });

    // Botones de Volver al Calendario
    document.querySelectorAll(".btn-back-to-calendar").forEach(btn => {
        btn.addEventListener("click", () => {
            switchTab("calendario");
        });
    });

    // Navegación desde Gastos a Historial de Gastos
    document.getElementById("btn-view-expenses-history").addEventListener("click", () => {
        switchTab("historial-gastos");
    });

    // Botones de Volver a Gastos
    document.querySelectorAll(".btn-back-to-expenses").forEach(btn => {
        btn.addEventListener("click", () => {
            switchTab("gastos");
        });
    });

    // Filtros e input del historial de gastos
    document.getElementById("expense-search").addEventListener("input", () => {
        renderExpensesHistoryList();
    });
    document.getElementById("expense-filter").addEventListener("change", () => {
        renderExpensesHistoryList();
    });
}

// Controlar visibilidad del método de pago Fiado según configuración
function updateFiadoPaymentVisibility() {
    const fiadoWrapper = document.getElementById("pay-btn-fiado-wrapper");
    const chkFiado = document.getElementById("chk-allow-fiado");

    if (chkFiado) {
        chkFiado.checked = !!state.allowFiado;
    }

    if (fiadoWrapper) {
        if (state.allowFiado) {
            fiadoWrapper.style.display = "block";
        } else {
            fiadoWrapper.style.display = "none";
            // Si estaba seleccionado Fiado y se deshabilitó, pasar a Transferencia
            const fiadoRadio = document.querySelector('input[name="payment-method"][value="Fiado"]');
            if (fiadoRadio && fiadoRadio.checked) {
                const transRadio = document.querySelector('input[name="payment-method"][value="Transferencia"]');
                if (transRadio) transRadio.checked = true;
            }
        }
    }
}

function updateRegisterTabVisibility() {
    const registrarBtn = document.getElementById("nav-btn-registrar");
    const chkRegisterTab = document.getElementById("chk-allow-register-tab");
    const isAdmin = state.currentUser && state.currentUser.rol === "admin";

    if (chkRegisterTab) {
        chkRegisterTab.checked = !!state.allowRegisterTab;
    }

    const shouldShowRegisterTab = isAdmin && state.allowRegisterTab;
    if (registrarBtn) {
        if (shouldShowRegisterTab) {
            registrarBtn.classList.remove("hidden");
        } else {
            registrarBtn.classList.add("hidden");
        }
    }

    if (!shouldShowRegisterTab) {
        const activeTabBtn = document.querySelector(".nav-item.active");
        if (activeTabBtn && activeTabBtn.getAttribute("data-tab") === "registrar") {
            switchTab("calendario");
        }
    }
}

// =========================================================================
//                  MANEJO DE PANTALLAS Y NAVEGACIÓN
// =========================================================================
function showLoginScreen() {
    document.getElementById("login-screen").classList.add("active");
    document.getElementById("app-screen").classList.remove("active");
}

function showAppScreen() {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");
}

function switchTab(tabId) {
    if (state.isEditingPrices && tabId !== "configuracion") {
        showGenericConfirmModal(
            "Descartar cambios",
            "Tienes cambios sin guardar en los precios. ¿Deseas cambiar de pestaña y perder los cambios?",
            () => {
                // Desactivar modo edición y proceder
                state.isEditingPrices = false;

                const actionsContainer = document.getElementById("edit-actions-container");
                if (actionsContainer) actionsContainer.classList.add("hidden");

                const editBtn = document.getElementById("btn-edit-mode");
                if (editBtn) editBtn.classList.remove("hidden");

                executeSwitchTab(tabId);
            }
        );
        return;
    }
    executeSwitchTab(tabId);
}

function executeSwitchTab(tabId) {
    let navTabId = tabId;
    if (tabId === "historial") navTabId = "calendario";
    if (tabId === "historial-gastos") navTabId = "gastos";

    // Cambiar estado en navegación inferior
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        if (item.getAttribute("data-tab") === navTabId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Cambiar visibilidad de paneles
    const panes = document.querySelectorAll(".tab-pane");
    panes.forEach(pane => {
        if (pane.id === `tab-${tabId}`) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });

    // Acciones especiales al cambiar de pestaña
    if (tabId === "historial") {
        renderHistoryList();
    } else if (tabId === "estadisticas") {
        calculateAndRenderStats();
    } else if (tabId === "calendario") {
        renderCalendar();
        renderDayAppointments();
        loadAppointments();
    } else if (tabId === "gastos") {
        const expDateInput = document.getElementById("expense-date");
        if (expDateInput) {
            const todayStr = new Date().toISOString().split('T')[0];
            expDateInput.value = todayStr;
        }
        renderExpensesList();
    } else if (tabId === "configuracion") {
        renderPricesEditor();
    } else if (tabId === "historial-gastos") {
        renderExpensesHistoryList();
    }
}

// =========================================================================
//                  GESTIÓN DE AUTENTICACIÓN
// =========================================================================
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!CONFIG_SHEET_URL) {
        showToast("Configuración requerida: Escribe la URL de tu Google Sheet en la variable CONFIG_SHEET_URL de app.js.", "error");
        return;
    }

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "login", email: email, password: password }, { showLoading: true, loadingText: 'Verificando credenciales...' });

        if (data && data.success) {
            state.currentUser = data.user;
            localStorage.setItem("evolet_session_v4", JSON.stringify(state.currentUser));
            document.getElementById("user-display-name").textContent = state.currentUser.nombre;
            showToast(`¡Bienvenida de vuelta, ${data.user.nombre}!`, "success");
            showAppScreen();
            loadServicesData();
            loadPricesFromCloud(); // Cargar precios dinámicos
            loadExpenses(); // Cargar gastos registrados
            loadCajaMovements(); // Cargar movimientos entre cajas
            checkAdminAccess(); // Chequear permisos
        } else {
            showToast((data && data.message) ? data.message : "Email o contraseña incorrectos", "error");
        }
    } catch (error) {
        console.error("Error en login:", error);
        showToast("Error de conexión. Verifica la URL de Google Sheets o tu internet.", "error");
    }
}

function handleLogout() {
    localStorage.removeItem("evolet_session_v4");
    state.currentUser = null;
    state.servicesList = [];

    // Ocultar botón de configuración al cerrar sesión
    const configBtn = document.getElementById("nav-btn-config");
    if (configBtn) configBtn.classList.add("hidden");

    updateRegisterTabVisibility();
    showLoginScreen();
    showToast("Sesión cerrada con éxito. ¡Vuelve pronto!");
}

// =========================================================================
//                  RENDERIZADO DE FORMULARIO DE SERVICIOS
// =========================================================================
function renderCategories() {
    const grid = document.querySelector(".category-grid");
    grid.innerHTML = "";

    const catLabels = {
        semi: "Semi",
        kapping: "Kapping",
        softgel: "Soft Gel",
        esculpidas: "Esculpidas",
        remocion: "Remoción",
        personalizado: "Otro"
    };

    Object.keys(SERVICES_CATALOG).forEach(catKey => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn-cat ${catKey === state.selectedCategory ? 'active' : ''}`;
        btn.setAttribute("data-cat", catKey);
        btn.textContent = catLabels[catKey];
        grid.appendChild(btn);
    });
}

function selectCategory(catKey) {
    state.selectedCategory = catKey;

    const buttons = document.querySelectorAll(".btn-cat");
    buttons.forEach(btn => {
        if (btn.getAttribute("data-cat") === catKey) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const gridWrapper = document.getElementById("services-grid-wrapper");
    const builder = document.getElementById("combined-service-builder");
    const extWrapper = document.getElementById("external-removal-wrapper");

    if (catKey === "personalizado") {
        if (gridWrapper) gridWrapper.classList.add("hidden");
        if (builder) builder.classList.remove("hidden");
        if (extWrapper) extWrapper.style.display = "block";
        populateCombinedServiceDropdowns();
        updateCombinedServiceCalculation();
    } else {
        if (gridWrapper) gridWrapper.classList.remove("hidden");
        if (builder) builder.classList.add("hidden");
        if (catKey === "remocion") {
            if (extWrapper) extWrapper.style.display = "none";
        } else {
            if (extWrapper) extWrapper.style.display = "block";
        }
        renderSubServicesGrid(catKey);
    }
}

function renderSubServicesGrid(catKey) {
    const grid = document.getElementById("services-grid");
    grid.innerHTML = "";

    const services = SERVICES_CATALOG[catKey];

    services.forEach((service, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-service";

        if (catKey === "personalizado") {
            btn.innerHTML = `
                <span>${service.name}</span>
                <span class="price-tag">Definir $</span>
            `;
        } else {
            btn.innerHTML = `
                <span>${service.name}</span>
                <span class="price-tag">$${service.price.toLocaleString("es-AR")}</span>
            `;
        }

        btn.addEventListener("click", () => {
            selectSubService(service, btn);
        });

        grid.appendChild(btn);

        if (index === 0) {
            selectSubService(service, btn);
        }
    });
}

function selectSubService(service, buttonElement) {
    state.selectedService = service;

    const serviceButtons = document.querySelectorAll(".btn-service");
    serviceButtons.forEach(btn => btn.classList.remove("active"));

    buttonElement.classList.add("active");

    const nameInput = document.getElementById("service-name-input");
    const priceInput = document.getElementById("service-price");

    // Ocultar checkbox de retiro externo si la categoría elegida es de remoción o personalizado
    const extWrapper = document.getElementById("external-removal-wrapper");
    const chk = document.getElementById("chk-external-removal");
    const opts = document.getElementById("external-removal-options-container");
    if (extWrapper && chk && opts) {
        if (state.selectedCategory === "remocion" || state.selectedCategory === "personalizado") {
            extWrapper.style.display = "none";
        } else {
            extWrapper.style.display = "block";
        }
        chk.checked = false;
        opts.classList.add("hidden");
        state.selectedExternalRemoval = null;
    }

    if (state.selectedCategory === "personalizado") {
        nameInput.value = "";
        nameInput.readOnly = false;
        nameInput.placeholder = "Escribe el servicio personalizado...";
        priceInput.value = "";
        priceInput.placeholder = "Monto en $";
        nameInput.focus();
    } else {
        nameInput.value = service.name;
        nameInput.readOnly = true;
        priceInput.value = service.price;
    }
}

// Poblar de forma dinámica los selectores del constructor de servicio combinado
function populateCombinedServiceDropdowns() {
    const sel1 = document.getElementById("combined-service-1");
    const sel2 = document.getElementById("combined-service-2");
    if (!sel1 || !sel2) return;

    if (sel1.options.length > 0 && sel2.options.length > 0) return;

    sel1.innerHTML = "";
    sel2.innerHTML = "";

    const categoriesToInclude = ["kapping", "softgel", "esculpidas", "semi"];

    categoriesToInclude.forEach(cat => {
        const services = SERVICES_CATALOG[cat] || [];
        services.forEach(s => {
            const opt1 = document.createElement("option");
            opt1.value = s.name;
            opt1.textContent = `${s.name} ($${s.price.toLocaleString("es-AR")})`;
            opt1.setAttribute("data-price", s.price);
            sel1.appendChild(opt1);

            const opt2 = document.createElement("option");
            opt2.value = s.name;
            opt2.textContent = `${s.name} ($${s.price.toLocaleString("es-AR")})`;
            opt2.setAttribute("data-price", s.price);
            sel2.appendChild(opt2);
        });
    });

    if (sel1.options.length > 0) sel1.selectedIndex = 0;
    if (sel2.options.length > 1) {
        const idxEsculpidas = Array.from(sel2.options).findIndex(opt => opt.value.toLowerCase().includes("esculpida"));
        sel2.selectedIndex = idxEsculpidas !== -1 ? idxEsculpidas : (sel2.options.length - 1);
    }
}

// Recalcular la combinación de los 2 servicios (10 uñas en total)
function updateCombinedServiceCalculation() {
    if (state.selectedCategory !== "personalizado") return;

    const sel1 = document.getElementById("combined-service-1");
    const sel2 = document.getElementById("combined-service-2");
    const count1El = document.getElementById("combined-count-1");
    const count2El = document.getElementById("combined-count-2");

    if (!sel1 || !sel2 || !count1El || !count2El) return;

    const count1 = parseInt(count1El.value) || 7;
    const count2 = 10 - count1;

    count2El.innerHTML = `<option value="${count2}" selected>${count2} ${count2 === 1 ? 'uña' : 'uñas'}</option>`;

    const opt1 = sel1.options[sel1.selectedIndex];
    const opt2 = sel2.options[sel2.selectedIndex];

    if (!opt1 || !opt2) return;

    const name1 = opt1.value;
    const price1 = Number(opt1.getAttribute("data-price")) || 0;

    const name2 = opt2.value;
    const price2 = Number(opt2.getAttribute("data-price")) || 0;

    const combinedName = `${name1} (${count1} ${count1 === 1 ? 'uña' : 'uñas'}) + ${name2} (${count2} ${count2 === 1 ? 'uña' : 'uñas'})`;
    const baseCombinedPrice = Math.round(((price1 * count1) + (price2 * count2)) / 10);

    state.selectedService = {
        name: combinedName,
        price: baseCombinedPrice
    };

    const nameInput = document.getElementById("service-name-input");
    if (nameInput) {
        nameInput.value = combinedName;
        nameInput.readOnly = true;
    }

    recalculateFinalServicePrice();
}

// Cargar de forma dinámica las opciones de retiro externo como botones btn-service
function populateExternalRemovalTypes() {
    const grid = document.getElementById("external-removal-buttons-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const rems = SERVICES_CATALOG.remocion || [];
    const validRems = rems.filter(rem => rem.name !== "Retiro Servicio Propio");

    state.selectedExternalRemoval = null;

    validRems.forEach((rem, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-service btn-ext-removal";
        btn.innerHTML = `
            <span>${escapeHtml(rem.name)}</span>
            <span class="price-tag">+$${rem.price.toLocaleString("es-AR")}</span>
        `;

        btn.addEventListener("click", () => {
            const allBtns = grid.querySelectorAll(".btn-ext-removal");
            allBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedExternalRemoval = rem;
            recalculateFinalServicePrice();
        });

        grid.appendChild(btn);

        if (idx === 0) {
            btn.classList.add("active");
            state.selectedExternalRemoval = rem;
        }
    });
    recalculateFinalServicePrice();
}

// Recalcular el precio sumando el retiro previo si está marcado
function recalculateFinalServicePrice() {
    const priceInput = document.getElementById("service-price");
    if (!priceInput || !state.selectedService) return;

    let basePrice = Number(state.selectedService.price) || 0;

    const chk = document.getElementById("chk-external-removal");
    if (chk && chk.checked && state.selectedExternalRemoval) {
        const extraPrice = Number(state.selectedExternalRemoval.price) || 0;
        priceInput.value = basePrice + extraPrice;
    } else {
        priceInput.value = basePrice;
    }
}

// =========================================================================
//                  ENVÍO Y CONFIRMACIÓN DE REGISTROS
// =========================================================================
function handleServiceSubmit(e) {
    e.preventDefault();

    if (!state.currentUser) {
        showToast("Debes iniciar sesión para registrar servicios.", "error");
        return;
    }

    const clientName = document.getElementById("client-name").value.trim();
    let serviceName = document.getElementById("service-name-input").value.trim();
    const chk = document.getElementById("chk-external-removal");
    if (chk && chk.checked && state.selectedExternalRemoval) {
        serviceName = `${serviceName} + ${state.selectedExternalRemoval.name}`;
    }

    const rawPriceValue = Number(document.getElementById("service-price").value);
    const price = rawPriceValue;

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    if (hasSuspiciousPriceInput(rawPriceValue)) {
        window.alert('Hay un error en el monto ingresado. Verificá que el valor sea 9.000, 10.000 o similar, no 9 o 10.');
        document.getElementById("service-price").focus();
        document.getElementById("service-price").select();
        return;
    }

    if (!clientName || !serviceName || price <= 0) {
        showToast("Completa los datos del cliente y precio correctamente.", "error");
        return;
    }

    // Calcular si hay seña vinculada
    let senaAmount = 0;
    if (state.linkedAppointment && state.linkedAppointment.cliente === clientName) {
        senaAmount = Number(state.linkedAppointment.precio) || 0;
    }

    // Estructura de transacción pre-cobrada por completo (seña=senaAmount, completado="Sí")
    const transaction = {
        id: "evt_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000),
        fecha: new Date().toISOString(),
        usuario: state.currentUser.email,
        cliente: clientName,
        servicio: serviceName,
        categoria: state.selectedCategory,
        precio: price,
        seña: senaAmount,
        metodoPago: paymentMethod,
        completado: "Sí"
    };

    // Guardar en espera
    state.pendingTransaction = transaction;

    // Si el pago es en efectivo, abrir modal de 'Pago justo' antes de confirmar
    if (paymentMethod === "Efectivo") {
        openCashModal();
        return;
    }

    // Mostrar modal de confirmación normal
    document.getElementById("confirm-client").textContent = transaction.cliente;
    document.getElementById("confirm-service").textContent = transaction.servicio;

    if (senaAmount > 0) {
        const netPrice = price - senaAmount;
        document.getElementById("confirm-price").innerHTML = `Total: $${price.toLocaleString("es-AR")} <br> <span style="font-size: 11px; color: var(--text-muted);">Seña: -$${senaAmount.toLocaleString("es-AR")} | Neto: <strong>$${netPrice.toLocaleString("es-AR")}</strong></span>`;
    } else {
        document.getElementById("confirm-price").textContent = `$${transaction.precio.toLocaleString("es-AR")}`;
    }

    document.getElementById("confirm-payment").textContent = transaction.metodoPago;

    document.getElementById("confirm-modal").classList.remove("hidden");
}

function cancelServiceRegistration() {
    document.getElementById("confirm-modal").classList.add("hidden");
    state.pendingTransaction = null;
    showToast("Registro cancelado", "info");
}

async function confirmServiceRegistration() {
    document.getElementById("confirm-modal").classList.add("hidden");

    if (!state.pendingTransaction) return;

    const transaction = state.pendingTransaction;
    state.pendingTransaction = null;

    if (!CONFIG_SHEET_URL) {
        showToast("Por favor configura la URL de tu Google Sheet en app.js para poder guardar.", "error");
        return;
    }

    showLoader(true, "Registrando servicio en la nube...");

    try {
        // Si estamos cobrando un turno vinculado, intentar actualizar una seña existente
        if (state.linkedAppointment) {
            const apt = state.linkedAppointment;
            // Buscar servicio tipo 'Seña' no completado para este cliente/usuario
            const senaCandidate = state.servicesList.find(s => s && s.servicio && s.servicio.toString().toLowerCase().includes('seña') &&
                s.cliente === transaction.cliente &&
                (s.usuario ? s.usuario.toString().toLowerCase() : '') === (state.currentUser ? state.currentUser.email.toString().toLowerCase() : '') &&
                (!s.completado || s.completado.toString().toLowerCase() !== 'sí' && s.completado.toString().toLowerCase() !== 'si')
            );

            if (senaCandidate) {
                // Actualizar la fila de servicio existente en lugar de crear una nueva
                const editPayload = {
                    action: 'edit_service',
                    id: senaCandidate.id,
                    precio: transaction.precio,
                    metodoPago: transaction.metodoPago || senaCandidate.metodoPago,
                    completado: 'Sí'
                };

                const respData = await apiPost(CONFIG_SHEET_URL, editPayload, { showLoading: true, loadingText: 'Actualizando servicio...', swallowError: true });

                if (respData && respData.success) {
                    // Actualizar cache local del servicio editado
                    const idx = state.servicesList.findIndex(x => x.id === senaCandidate.id);
                    if (idx !== -1) {
                        state.servicesList[idx].precio = transaction.precio;
                        state.servicesList[idx].metodoPago = transaction.metodoPago || state.servicesList[idx].metodoPago;
                        state.servicesList[idx].completado = 'Sí';
                        saveServicesCache();
                        renderHistoryList();
                        calculateAndRenderStats();
                        updateClientAutocomplete();
                    }

                    showToast('Cobro registrado actualizando la seña existente', 'success');

                    // Marcar el turno vinculado como completado en la nube
                    const aptId = apt.id;
                    try {
                        const updateData = await apiPost(CONFIG_SHEET_URL, {
                            action: 'edit_appointment',
                            id: aptId,
                            estado: 'Completado',
                            precio: transaction.precio,
                            servicio: apt.servicio,
                            fecha: apt.fecha,
                            horaInicio: apt.horaInicio,
                            horaFin: apt.horaFin,
                            eventId: apt.eventId
                        }, { showLoading: true, loadingText: 'Actualizando turno...', swallowError: true });
                        if (!updateData || !updateData.success) {
                            console.warn('No se pudo actualizar el turno en la nube:', updateData && updateData.message);
                        } else {
                            state.appointmentsList = state.appointmentsList.map(x => {
                                if (x.id === aptId) {
                                    return { ...x, estado: 'Completado', precio: transaction.precio };
                                }
                                return x;
                            });
                            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
                            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
                            renderCalendar();
                            renderDayAppointments();
                        }
                    } catch (editErr) {
                        console.error('Error al actualizar el turno después de cobrar:', editErr);
                    }

                    await loadServicesData();
                    clearCheckoutState();
                    resetServiceForm();
                    switchTab('calendario');
                    return;
                } else {
                    showToast(respData.message || 'Error al actualizar la seña en Google Sheets', 'error');
                    return;
                }
            }
        }

        // Si no se actualizó una seña existente, crear un nuevo servicio como antes
        const data = await apiPost(CONFIG_SHEET_URL, { action: "add_service", ...transaction }, { showLoading: true, loadingText: 'Registrando servicio...' });

        if (data.success) {
            const wasLinked = !!state.linkedAppointment;
            state.servicesList.unshift(data.service);
            saveServicesCache();
            updateClientAutocomplete(); // Recargar el autocompletado
            showToast("¡Servicio guardado con éxito!", "success");

            // Si hubo vuelto, registrar un gasto para que se descuente de la caja
            if (transaction && transaction.vuelto && Number(transaction.vuelto) > 0) {
                try {
                    const expensePayload = {
                        action: 'add_expense',
                        concepto: `Vuelto - ${transaction.cliente} - ${transaction.servicio}`,
                        monto: Number(transaction.vuelto),
                        metodoPago: transaction.vueltoReturnMethod ? transaction.vueltoReturnMethod : transaction.metodoPago,
                        usuario: state.currentUser ? state.currentUser.email : '',
                        categoria: 'Vuelto'
                    };

                    try {
                        const expData = await apiPost(CONFIG_SHEET_URL, expensePayload, { showLoading: false, swallowError: true });
                        if (expData && expData.success) {
                            showToast('Vuelto registrado en Gastos para ajustar caja', 'info');
                            // Recargar lista de gastos en background
                            loadExpenses();
                            calculateAndRenderStats();
                        } else {
                            console.warn('No se pudo registrar el vuelto como gasto:', expData && expData.message);
                        }
                    } catch (err) {
                        console.error('Error registrando gasto por vuelto:', err);
                    }
                } catch (err) {
                    console.error('Error preparando payload de gasto por vuelto:', err);
                }
            }

            // Si el servicio estaba vinculado a un turno, marcarlo como completado
            if (state.linkedAppointment) {
                const aptId = state.linkedAppointment.id;

                try {
                    const updateData = await apiPost(CONFIG_SHEET_URL, {
                        action: "edit_appointment",
                        id: aptId,
                        estado: "Completado",
                        precio: transaction.precio,
                        servicio: state.linkedAppointment.servicio,
                        fecha: state.linkedAppointment.fecha,
                        horaInicio: state.linkedAppointment.horaInicio,
                        horaFin: state.linkedAppointment.horaFin,
                        eventId: state.linkedAppointment.eventId
                    }, { showLoading: true, loadingText: 'Actualizando turno...', swallowError: true });

                    if (!updateData || !updateData.success) {
                        console.warn('No se pudo actualizar el turno en la nube:', updateData && updateData.message);
                    } else {
                        state.appointmentsList = state.appointmentsList.map(x => {
                            if (x.id === aptId) {
                                return { ...x, estado: "Completado", precio: transaction.precio };
                            }
                            return x;
                        });
                        const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
                        localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));

                        renderCalendar();
                        renderDayAppointments();
                    }
                } catch (updateErr) {
                    console.error("Error al actualizar el turno después de cobrar:", updateErr);
                }
            }

            await loadServicesData();
            clearCheckoutState();
            renderHistoryList();
            calculateAndRenderStats();
            resetServiceForm();
            switchTab("calendario");
        } else {
            showToast(data.message || "Error al registrar en Google Sheets", "error");
        }
    } catch (error) {
        console.error("Error al registrar servicio:", error);
        saveOfflineTransaction(transaction);
        showToast("Error de conexión. Se guardó localmente en tu iPhone y se subirá luego.", "warning");
        resetServiceForm();
    } finally {
        showLoader(false);
    }
}

// Servicios/historial movidos a src/services.js

// =========================================================================
//                  DETALLE DE SERVICIO Y TICKET COMPARTIBLE
// =========================================================================

function capitalizeCategoryLabel(cat) {
    const labels = {
        semi: "Semipermanente",
        kapping: "Kapping",
        softgel: "Soft Gel",
        esculpidas: "Esculpidas",
        remocion: "Remoción",
        personalizado: "Personalizado / Combinado"
    };
    return labels[cat] || (cat || "Otro");
}

function viewServiceDetail(id) {
 const item = state.servicesList.find(s => String(s.id) === String(id));
    if (!item) {
        showToast("No se encontró el registro.", "error");
        return;
    }

    state.currentDetailItem = item;

    document.getElementById("detail-cliente").textContent = item.cliente;
    document.getElementById("detail-servicio").textContent = item.servicio;
    document.getElementById("detail-categoria").textContent = capitalizeCategoryLabel(item.categoria);

    const precio = Number(item.precio) || 0;
    const sena = Number(item.seña) || 0;
    document.getElementById("detail-precio").textContent = `$${precio.toLocaleString("es-AR")}`;

    const senaRow = document.getElementById("detail-sena-row");
    if (sena > 0) {
        senaRow.style.display = "flex";
        document.getElementById("detail-sena").textContent = `-$${sena.toLocaleString("es-AR")} (Neto: $${(precio - sena).toLocaleString("es-AR")})`;
    } else {
        senaRow.style.display = "none";
    }

    document.getElementById("detail-metodo").textContent = item.metodoPago;

    const dateObj = normalizeDateValue(item.fecha) || new Date();
    const formattedFullDate = dateObj.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        " - " + dateObj.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' });
    document.getElementById("detail-fecha").textContent = formattedFullDate;

    document.getElementById("detail-usuario").textContent = item.usuario || "-";

    document.getElementById("service-detail-modal").classList.remove("hidden");
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > maxWidth && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length;
}


function countWrappedLines(ctx, text, maxWidth) {
    const words = text.toString().split(' ');
    let line = '';
    let lines = 1;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > maxWidth && n > 0) {
            lines++;
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    return lines;
}

function generateTicketCanvas(item) {
    const canvas = document.getElementById("ticket-canvas");
    const ctx = canvas.getContext("2d");
    const W = 640;
    const marginX = 50;
    const contentWidth = W - marginX * 2;

    const precio = Number(item.precio) || 0;
    const sena = Number(item.seña) || 0;
    const hasSena = sena > 0;
    const neto = precio - sena;

    const dateObj = normalizeDateValue(item.fecha) || new Date();
    const fechaStr = dateObj.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        " - " + dateObj.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' });

    const rows = [
        { label: "CLIENTA", value: item.cliente, big: true },
        { label: "SERVICIO", value: item.servicio },
        { label: "CATEGORÍA", value: capitalizeCategoryLabel(item.categoria) },
        { label: "PRECIO TOTAL", value: `$${precio.toLocaleString("es-AR")}` },
        { label: "MÉTODO DE PAGO", value: item.metodoPago },
        { label: "FECHA Y HORA", value: fechaStr },
        { label: "ATENDIDO POR", value: item.usuario || "-" }
    ];

    // === Constantes de layout ===
    const headerHeight = 110;
    const badgeRadius = 44;
    const rowLabelFont = "600 12px 'Outfit', Arial";
    const rowValueFont = "22px 'Outfit', Arial";
    const rowValueBigFont = "bold 24px 'Outfit', Arial";
    const rowLineHeight = 27;

    // === PASADA 1: medir alturas sin dibujar ===
 let y = headerHeight + badgeRadius + 100; // espacio para badge + nombre + subtítulo + separador
    rows.forEach(row => {
        ctx.font = row.big ? rowValueBigFont : rowValueFont;
        const lines = countWrappedLines(ctx, row.value, contentWidth);
        y += 30 + (lines - 1) * rowLineHeight + 22; // label + líneas de valor + espacio entre filas
    });

    y += 30; // separador antes de seña/total

    if (hasSena) {
        ctx.font = rowValueFont;
        const lines = countWrappedLines(ctx, `-$${sena.toLocaleString("es-AR")}`, contentWidth);
        y += 30 + (lines - 1) * rowLineHeight + 22;
    }

    y += 20; // espacio antes del total
    const totalBlockHeight = 90;
    y += totalBlockHeight;

    const footerHeight = 90;
    const H = Math.round(y + footerHeight);

    // Ahora sí, fijamos el tamaño real y dibujamos
    canvas.width = W;
    canvas.height = H;

    // === Fondo ===
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    // === Header degradé (membrete) ===
    const headerGradient = ctx.createLinearGradient(0, 0, W, 0);
    headerGradient.addColorStop(0, "#FF69B4");
    headerGradient.addColorStop(1, "#FF1493");
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, W, headerHeight);

    // === Insignia circular con el logo ===
    const badgeX = W / 2;
    const badgeY = headerHeight;

    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.clip();

    const logoImg = document.getElementById("logo-img");
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.drawImage(logoImg, badgeX - badgeRadius, badgeY - badgeRadius, badgeRadius * 2, badgeRadius * 2);
    } else {
        ctx.fillStyle = "#FFF0F5";
        ctx.fillRect(badgeX - badgeRadius, badgeY - badgeRadius, badgeRadius * 2, badgeRadius * 2);
        ctx.fillStyle = "#FF1493";
        ctx.font = "bold 26px 'Outfit', Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("EN", badgeX, badgeY);
        ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FF69B4";
    ctx.stroke();

    // === Nombre del negocio y subtítulo ===
    ctx.textAlign = "center";
    ctx.fillStyle = "#5A3D46";
    ctx.font = "bold 26px 'Outfit', Arial";
    ctx.fillText("EVOLET NAILS", badgeX, badgeY + badgeRadius + 38);

    ctx.fillStyle = "#9E7D86";
    ctx.font = "13px 'Outfit', Arial";
    ctx.fillText("COMPROBANTE DE SERVICIO", badgeX, badgeY + badgeRadius + 58);

    // === Separador ===
    function drawDivider(yPos) {
        ctx.strokeStyle = "#FFC0CB";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(marginX, yPos);
        ctx.lineTo(W - marginX, yPos);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    let cursorY = badgeY + badgeRadius + 100;
    drawDivider(cursorY - 24);

    ctx.textAlign = "left";

    // === PASADA 2: dibujar filas ===
    function drawRow(label, value, valueColor, big) {
        ctx.fillStyle = "#9E7D86";
        ctx.font = rowLabelFont;
        ctx.fillText(label, marginX, cursorY);

        ctx.fillStyle = valueColor || "#5A3D46";
        ctx.font = big ? rowValueBigFont : rowValueFont;
        const lines = countWrappedLines(ctx, value, contentWidth);
        wrapCanvasText(ctx, value.toString(), marginX, cursorY + 26, contentWidth, rowLineHeight);
        cursorY += 30 + (lines - 1) * rowLineHeight + 22;
    }

    rows.forEach(row => {
        drawRow(row.label, row.value, row.big ? "#FF1493" : "#5A3D46", row.big);
    });

    cursorY += 8;
    drawDivider(cursorY);
    cursorY += 30;

    if (hasSena) {
        drawRow("SEÑA DESCONTADA", `-$${sena.toLocaleString("es-AR")}`, "#FF4D4D", false);
    }

    // === Total destacado ===
    ctx.fillStyle = "#9E7D86";
    ctx.font = "600 14px 'Outfit', Arial";
    ctx.fillText(hasSena ? "TOTAL COBRADO (NETO)" : "TOTAL COBRADO", marginX, cursorY);

    ctx.fillStyle = "#FF1493";
    ctx.font = "bold 46px 'Outfit', Arial";
    ctx.textAlign = "right";
    ctx.fillText(`$${neto.toLocaleString("es-AR")}`, W - marginX, cursorY + 12);
    ctx.textAlign = "left";

    cursorY += totalBlockHeight;
    drawDivider(cursorY - 20);

   // === Footer ===
    const footerText = "Gracias por su confianza";
    const footerY = cursorY + 35;

    ctx.font = "600 15px 'Outfit', Arial";
    const footerTextWidth = ctx.measureText(footerText).width;

    let iconWidth = 0;
    const iconGap = 10;
    try {
        ctx.font = "900 15px 'Font Awesome 6 Free'";
        iconWidth = ctx.measureText("\uf004").width;
    } catch (e) {
        iconWidth = 0;
    }

    const footerBlockWidth = iconWidth + (iconWidth > 0 ? iconGap : 0) + footerTextWidth;
    let footerX = (W - footerBlockWidth) / 2;

    ctx.textAlign = "left";

    if (iconWidth > 0) {
        try {
            ctx.font = "900 15px 'Font Awesome 6 Free'";
            ctx.fillStyle = "#FF69B4";
            ctx.fillText("\uf004", footerX, footerY);
            footerX += iconWidth + iconGap;
        } catch (e) {
            // seguimos sin ícono
        }
    }

    ctx.fillStyle = "#5A3D46";
    ctx.font = "600 15px 'Outfit', Arial";
    ctx.fillText(footerText, footerX, footerY);

    ctx.fillStyle = "#CBB2B9";
    ctx.font = "11px 'Outfit', Arial";
    ctx.textAlign = "center";
    ctx.fillText("Comprobante generado automáticamente", W / 2, cursorY + 58);

    ctx.textAlign = "left";

    return canvas;
}

function downloadTicketBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function shareServiceTicket() {
    const item = state.currentDetailItem;
    if (!item) return;

    const canvas = generateTicketCanvas(item);

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast("No se pudo generar el ticket.", "error");
            return;
        }

        const fileName = `ticket_${item.cliente.replace(/\s+/g, '_')}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: "Ticket Evolet Nails",
                    text: `Ticket de ${item.cliente} - ${item.servicio}`
                });
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error("Error al compartir:", err);
                    showToast("No se pudo abrir el menú de compartir.", "error");
                }
                // Si el usuario cancela (AbortError), no hacemos nada.
            }
        } else {
            showToast("Tu navegador no permite compartir imágenes directamente. Probá desde el celular con Chrome actualizado.", "warning");
        }
    }, "image/png");
}
// =========================================================================
//                  CÁLCULOS Y ESTADÍSTICAS
// =========================================================================
function renderCajaMovementsList() {
    const container = document.getElementById("caja-movements-list");
    if (!container) return;

    if (!state.cajaMovementsList || state.cajaMovementsList.length === 0) {
        container.innerHTML = `
            <div class="no-appointments-placeholder">
                <i class="fa-solid fa-right-left" style="font-size: 20px; color: var(--text-light); margin-bottom: 5px; display: block;"></i>
                Todavía no hay movimientos entre cajas.
            </div>
        `;
        return;
    }

    const sorted = [...state.cajaMovementsList].sort((a, b) => {
        const dateA = normalizeDateValue(a.fecha);
        const dateB = normalizeDateValue(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });

    container.innerHTML = "";
    sorted.forEach(item => {
        const date = normalizeDateValue(item.fecha) || new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const monthStr = String(date.getMonth() + 1).padStart(2, '0');
        const isDeposit = item.tipo === "deposito";
        const label = isDeposit ? "Depósito" : "Extracción";
        const fromTo = isDeposit ? "Efectivo → MP" : "MP → Efectivo";

        const card = document.createElement("div");
        card.className = "appointment-card";
        card.innerHTML = `
            <div class="appointment-time-col">
                <span class="appointment-time-start">${day}/${monthStr}</span>
                <span class="appointment-time-duration">${escapeHtml(label)}</span>
            </div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(item.concepto || "Movimiento de caja")}</div>
                <div class="appointment-service-name" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
                    <span class="pay-badge" style="background-color: #fce4ec; color: #c2185b; font-size: 9px; padding: 1px 6px; border-radius: 4px;">${escapeHtml(fromTo)}</span>
                    <span>
                        <i class="fa-solid fa-right-left" style="color: var(--barbie-pink); font-size: 10px;"></i>
                        <strong>$${Number(item.monto || 0).toLocaleString("es-AR")}</strong>
                    </span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

async function loadCajaMovements() {
    if (!state.currentUser) return;

    const cacheKey = `evolet_caja_movements_v1_${state.currentUser.email}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            state.cajaMovementsList = JSON.parse(cached);
        } catch (error) {
            console.warn("No se pudo leer el caché de movimientos de caja:", error);
            state.cajaMovementsList = [];
        }
    } else {
        state.cajaMovementsList = [];
    }

    renderCajaMovementsList();

    if (!CONFIG_SHEET_URL) return;

    try {
        const url = `${CONFIG_SHEET_URL}?action=get_caja_movements`;
        const data = await apiGet(url, { showLoading: true, loadingText: 'Cargando movimientos de caja...', swallowError: true });
        if (data && data.success && Array.isArray(data.movements)) {
            state.cajaMovementsList = data.movements;
            localStorage.setItem(cacheKey, JSON.stringify(state.cajaMovementsList));
            renderCajaMovementsList();
            calculateAndRenderStats();
        }
    } catch (error) {
        console.warn("No se pudieron cargar movimientos de caja desde la nube:", error);
    }
}

async function handleCajaMovementSubmit(e) {
    e.preventDefault();

    if (!state.currentUser) {
        showToast("Inicia sesión para registrar movimientos entre cajas.", "error");
        return;
    }

    const tipo = document.getElementById("caja-movement-type").value;
    const monto = Number(document.getElementById("caja-movement-amount").value);
    const fecha = document.getElementById("caja-movement-date").value;
    const concepto = document.getElementById("caja-movement-concept").value.trim();

    if (!monto || !fecha || !concepto) {
        showToast("Completá el monto, fecha y concepto del movimiento.", "error");
        return;
    }

    const movimiento = {
        action: "add_caja_movement",
        id: "caja_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000),
        fecha,
        tipo,
        monto,
        concepto,
        origen: tipo === "deposito" ? "Efectivo" : "MP",
        destino: tipo === "deposito" ? "MP" : "Efectivo",
        usuario: state.currentUser.email
    };

    try {
        const data = await apiPost(CONFIG_SHEET_URL, movimiento, { showLoading: true, loadingText: 'Registrando movimiento de caja...' });

        if (data && data.success) {
            state.cajaMovementsList.push(data.movement || movimiento);
            const cacheKey = `evolet_caja_movements_v1_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.cajaMovementsList));
            renderCajaMovementsList();
            calculateAndRenderStats();
            showToast("Movimiento registrado con éxito.", "success");
            document.getElementById("caja-movement-form").reset();
            const today = new Date().toISOString().slice(0, 10);
            document.getElementById("caja-movement-date").value = today;
        } else {
            showToast(data.message || "No se pudo guardar el movimiento.", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al guardar movimiento de caja:", error);
        const queueKey = `evolet_offline_caja_movements_v1_${state.currentUser.email}`;
        const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
        queue.push(movimiento);
        localStorage.setItem(queueKey, JSON.stringify(queue));
        state.cajaMovementsList.push(movimiento);
        const cacheKey = `evolet_caja_movements_v1_${state.currentUser.email}`;
        localStorage.setItem(cacheKey, JSON.stringify(state.cajaMovementsList));
        renderCajaMovementsList();
        calculateAndRenderStats();
        showToast("Movimiento guardado offline. Se sincronizará luego.", "warning");
    }
}

function calculateAndRenderStats() {
    const now = new Date();
    const { startDate, endDate } = getMonthWindowRange(now);

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Fecha de referencia desde la cual se cuentan los movimientos de Caja Total.
    // Poné acá la fecha en la que se fijaron los saldos iniciales de abajo
    // ($20.300 efectivo y $67.921,85 MP), en formato "YYYY-MM-DD".
    const initialBalanceDate = "2026-07-01"; // <-- CAMBIAR por la fecha real

    // Sumar ingresos (servicios) desde la fecha de referencia por método de pago
    let periodEfectivoIncome = 0;
    let periodMpIncome = 0;

    state.servicesList.forEach(item => {
        if (item.fecha) {
            const itemDateStr = item.fecha.substring(0, 10);
            if (itemDateStr >= initialBalanceDate) {
                const precio = Number(item.precio) || 0;
                const seña = Number(item.seña) || 0;
                const neto = precio - seña;

                if (item.metodoPago === "Efectivo") {
                    periodEfectivoIncome += neto;
                } else if (item.metodoPago === "Transferencia") {
                    periodMpIncome += neto;
                }
            }
        }
    });

    // Sumar egresos (gastos) desde la fecha de referencia por método de pago
    let periodEfectivoExpenses = 0;
    let periodMpExpenses = 0;

    state.expensesList.forEach(item => {
        if (item.fecha) {
            const itemDateStr = item.fecha.substring(0, 10);
            if (itemDateStr >= initialBalanceDate) {
                const monto = Number(item.monto) || 0;
                if (item.metodoPago === "Efectivo") {
                    periodEfectivoExpenses += monto;
                } else if (item.metodoPago === "Transferencia") {
                    periodMpExpenses += monto;
                }
            }
        }
    });

    // Saldos iniciales fijos (correspondientes a initialBalanceDate, no modificables)
    const initialEfectivo = 20300.00;
    const initialMp = 67921.85;

    const initialBalanceDateValue = new Date(`${initialBalanceDate}T00:00:00`);
    let currentEfectivo = initialEfectivo + periodEfectivoIncome - periodEfectivoExpenses;
    let currentMp = initialMp + periodMpIncome - periodMpExpenses;

    state.cajaMovementsList.forEach(item => {
        const movementDate = normalizeDateValue(item.fecha);
        if (!movementDate || movementDate < initialBalanceDateValue) return;
        const monto = Number(item.monto) || 0;
        if (item.tipo === "deposito") {
            currentEfectivo -= monto;
            currentMp += monto;
        } else if (item.tipo === "extraccion") {
            currentMp -= monto;
            currentEfectivo += monto;
        }
    });

    const currentTotal = currentEfectivo + currentMp;

    // Pintar valores en el DOM
    const statCajaTotal = document.getElementById("stat-caja-total");
    const consolidatedBreakdown = document.getElementById("cajas-consolidated-breakdown");

    if (statCajaTotal) {
        statCajaTotal.textContent = `$${currentTotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (consolidatedBreakdown) {
        consolidatedBreakdown.textContent = `Efectivo: $${currentEfectivo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | MP: $${currentMp.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - 7);

    let totalMonthIncome = 0;
    let totalWeekIncome = 0;
    let servicesCountMonth = 0;

    let cashSum = 0;
    let transfeSum = 0;

    const serviceCounts = {};

    state.servicesList.forEach(item => {
        const date = normalizeDateValue(item.fecha);
        const precio = Number(item.precio) || 0;

        const isThisMonth = date && date >= startDate && date <= endDate;
        const isThisWeek = date && date >= startOfWeek;

        if (isThisMonth) {
            totalMonthIncome += precio;
            servicesCountMonth++;

            serviceCounts[item.servicio] = (serviceCounts[item.servicio] || 0) + 1;

            if (item.metodoPago === "Efectivo") cashSum += precio;
            else if (item.metodoPago === "Transferencia") transfeSum += precio;
        }

        if (isThisWeek) {
            totalWeekIncome += precio;
        }
    });

    const averageTicket = servicesCountMonth > 0 ? Math.round(totalMonthIncome / servicesCountMonth) : 0;

    // Calcular egresos del mes y agrupar por categoría
    let totalMonthExpenses = 0;
    const categorySums = {
        "Insumos": 0,
        "Servicios": 0,
        "Comida": 0,
        "Gasto propio": 0,
        "Otro": 0
    };

    state.expensesList.forEach(item => {
        const date = normalizeDateValue(item.fecha);
        if (date && date >= startDate && date <= endDate) {
            const monto = Number(item.monto) || 0;
            totalMonthExpenses += monto;
            const cat = item.categoria || "Otro";
            if (categorySums[cat] !== undefined) {
                categorySums[cat] += monto;
            } else {
                categorySums["Otro"] += monto;
            }
        }
    });

    const netBalance = totalMonthIncome - totalMonthExpenses;

    document.getElementById("stat-month-income").textContent = `$${totalMonthIncome.toLocaleString("es-AR")}`;
    document.getElementById("stat-month-expenses").textContent = `$${totalMonthExpenses.toLocaleString("es-AR")}`;

    const balanceEl = document.getElementById("stat-net-balance");
    balanceEl.textContent = `${netBalance < 0 ? '-' : ''}$${Math.abs(netBalance).toLocaleString("es-AR")}`;

    const netBalanceCard = document.getElementById("net-balance-card");
    if (netBalanceCard) {
        if (netBalance >= 0) {
            netBalanceCard.classList.add("pink-glow");
            netBalanceCard.classList.remove("red-glow");
        } else {
            netBalanceCard.classList.remove("pink-glow");
            netBalanceCard.classList.add("red-glow");
        }
    }

    document.getElementById("stat-week-income").textContent = `$${totalWeekIncome.toLocaleString("es-AR")}`;
    document.getElementById("stat-count-month").textContent = servicesCountMonth;
    document.getElementById("stat-average-ticket").textContent = `$${averageTicket.toLocaleString("es-AR")}`;

    const totalPayments = cashSum + transfeSum;
    const pctCash = totalPayments > 0 ? Math.round((cashSum / totalPayments) * 100) : 0;
    const pctTransfe = totalPayments > 0 ? Math.round((transfeSum / totalPayments) * 100) : 0;

    const barCash = document.getElementById("bar-cash");
    const barTransfe = document.getElementById("bar-transfe");
    const textCash = document.getElementById("text-cash");
    const textTransfe = document.getElementById("text-transfe");

    if (barCash) barCash.style.width = `${pctCash}%`;
    if (barTransfe) barTransfe.style.width = `${pctTransfe}%`;
    if (textCash) textCash.textContent = `$${cashSum.toLocaleString("es-AR")} (${pctCash}%)`;
    if (textTransfe) textTransfe.textContent = `$${transfeSum.toLocaleString("es-AR")} (${pctTransfe}%)`;

    // Renderizar desglose de gastos por categoría
    const catStatsContainer = document.getElementById("category-expenses-stats");
    if (catStatsContainer) {
        catStatsContainer.innerHTML = "";

        const sortedCats = Object.entries(categorySums)
            .map(([name, sum]) => ({ name, sum }))
            .sort((a, b) => b.sum - a.sum);

        const catIcons = {
            "Insumos": '<i class="fa-solid fa-box-open" style="color: var(--barbie-pink);"></i>',
            "Servicios": '<i class="fa-solid fa-bolt" style="color: #FFD700;"></i>',
            "Comida": '<i class="fa-solid fa-utensils" style="color: #FFA500;"></i>',
            "Gasto propio": '<i class="fa-solid fa-user-tag" style="color: #9370DB;"></i>',
            "Otro": '<i class="fa-solid fa-circle-question" style="color: var(--text-light);"></i>'
        };

        sortedCats.forEach(cat => {
            const pct = totalMonthExpenses > 0 ? Math.round((cat.sum / totalMonthExpenses) * 100) : 0;
            const icon = catIcons[cat.name] || catIcons["Otro"];

            const row = document.createElement("div");
            row.className = "payment-stat-row";
            row.innerHTML = `
                <div class="payment-stat-label">${icon} ${cat.name}</div>
                <div class="payment-progress-bar">
                    <div class="progress" style="width: ${pct}%"></div>
                </div>
                <div class="payment-stat-val">$${cat.sum.toLocaleString("es-AR")} (${pct}%)</div>
            `;
            catStatsContainer.appendChild(row);
        });
    }

    renderPopularServices(serviceCounts);
    renderDebtorsList();
    renderCajaMovementsList();
}

// Renderizar el listado dinámico de deudores (fiados)
function renderDebtorsList() {
    const debtors = state.servicesList.filter(item => item.metodoPago === "Fiado");
    const panel = document.getElementById("debtors-panel");
    const container = document.getElementById("debtors-list-container");
    if (!panel || !container) return;

    if (debtors.length === 0) {
        panel.classList.add("hidden");
        return;
    }

    panel.classList.remove("hidden");
    container.innerHTML = "";

    debtors.forEach(debt => {
        const card = document.createElement("div");
        card.className = "appointment-card";
        card.style.borderColor = "#ffb3b3";
        card.style.background = "#fffefe";

        const dateStr = debt.fecha ? new Date(debt.fecha).toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit' }) : "-";

        card.innerHTML = `
            <div class="appointment-time-col" style="border-right-color: #ffcccc; min-width: 60px;">
                <span class="appointment-time-start" style="color: #cc0000; font-size: 13px;">${dateStr}</span>
            </div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(debt.cliente)}</div>
                <div class="appointment-service-name" style="color: #666;">
                    ${escapeHtml(debt.servicio)} — <strong style="color: #cc0000;">$${debt.precio.toLocaleString("es-AR")}</strong>
                </div>
            </div>
            <div class="appointment-actions-col">
                <button class="btn-collect-debt btn btn-success" data-id="${debt.id}" style="width: auto; padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: var(--radius-sm); border: none; display: flex; align-items: center; gap: 4px; background: #2e7d32; color: white;">
                    <i class="fa-solid fa-money-bill-wave"></i> Cobrar
                </button>
            </div>
        `;

        card.querySelector(".btn-collect-debt").addEventListener("click", () => {
            collectDebt(debt);
        });

        container.appendChild(card);
    });
}

// Cobrar una deuda pendiente (pasar de Fiado a Efectivo/Transferencia)
async function collectDebt(debt) {
    const metodo = confirm(`¿El cobro de la deuda de $${debt.precio} de ${debt.cliente} fue por transferencia / MercadoPago?\n(Aceptar = MercadoPago/Transferencia, Cancelar = Efectivo)`) ? "Transferencia" : "Efectivo";

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "edit_service", id: debt.id, metodoPago: metodo, fecha: new Date().toISOString() }, { showLoading: true, loadingText: 'Registrando pago de deuda...' });
        if (data && data.success) {
            showToast("¡Deuda cobrada e ingresada a la caja correctamente!", "success");

            // Actualizar localmente el servicio
            debt.metodoPago = metodo;
            debt.fecha = new Date().toISOString();

            saveServicesCache();
            calculateAndRenderStats();
        } else {
            showToast(data.message || "Error al cobrar la deuda", "error");
        }
    } catch (err) {
        console.error("Error al cobrar la deuda:", err);
        showToast("Error de conexión. Inténtalo de nuevo.", "error");
    } finally {
        showLoader(false);
    }
}

function renderPopularServices(serviceCounts) {
    const listElement = document.getElementById("popular-services-list");
    if (!listElement) return;
    listElement.innerHTML = "";

    const sorted = Object.entries(serviceCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    if (sorted.length === 0) {
        listElement.innerHTML = `<p style="font-size:12px; color:var(--text-muted)">No hay registros este mes</p>`;
        return;
    }

    sorted.forEach(item => {
        const row = document.createElement("div");
        row.className = "pop-service-row";
        row.innerHTML = `
            <span class="pop-service-name">${escapeHtml(item.name)}</span>
            <span class="pop-service-count">${item.count} turnos</span>
        `;
        listElement.appendChild(row);
    });
}

// =========================================================================
//                  SOPORTE OFFLINE TEMPORAL
// =========================================================================
function saveOfflineTransaction(transaction) {
    const offlineQueue = JSON.parse(localStorage.getItem(`evolet_offline_v4_${state.currentUser.email}`) || "[]");
    offlineQueue.push(transaction);
    localStorage.setItem(`evolet_offline_v4_${state.currentUser.email}`, JSON.stringify(offlineQueue));

    state.servicesList.unshift(transaction);
    saveServicesCache();
    renderHistoryList();
    updateClientAutocomplete();
}

async function checkAndSyncOfflineTransactions() {
    if (!navigator.onLine || !CONFIG_SHEET_URL || !state.currentUser) return;

    // 1. Sincronizar Servicios (Ventas)
    const servicesKey = `evolet_offline_v4_${state.currentUser.email}`;
    const servicesQueue = JSON.parse(localStorage.getItem(servicesKey) || "[]");

    if (servicesQueue.length > 0) {
        console.log(`Sincronizando ${servicesQueue.length} servicios offline...`);
        const failedServices = [];
        for (const transaction of servicesQueue) {
            try {
                const data = await apiPost(CONFIG_SHEET_URL, { action: "add_service", ...transaction }, { showLoading: false, swallowError: true });
                if (!data || !data.success) {
                    failedServices.push(transaction);
                }
            } catch (e) {
                failedServices.push(transaction);
            }
        }
        if (failedServices.length === 0) {
            localStorage.removeItem(servicesKey);
            showToast("¡Servicios guardados offline sincronizados con éxito!", "success");
            loadServicesData();
        } else {
            localStorage.setItem(servicesKey, JSON.stringify(failedServices));
        }
    }

    // 2. Sincronizar Gastos
    const expensesKey = `evolet_offline_expenses_v4_${state.currentUser.email}`;
    const expensesQueue = JSON.parse(localStorage.getItem(expensesKey) || "[]");

    if (expensesQueue.length > 0) {
        console.log(`Sincronizando ${expensesQueue.length} gastos offline...`);
        const failedExpenses = [];
        for (const expenseData of expensesQueue) {
            try {
                const data = await apiPost(CONFIG_SHEET_URL, { action: "add_expense", ...expenseData }, { showLoading: false, swallowError: true });
                if (!data || !data.success) {
                    failedExpenses.push(expenseData);
                }
            } catch (e) {
                failedExpenses.push(expenseData);
            }
        }
        if (failedExpenses.length === 0) {
            localStorage.removeItem(expensesKey);
            showToast("¡Gastos guardados offline sincronizados con éxito!", "success");
            loadExpensesData();
        } else {
            localStorage.setItem(expensesKey, JSON.stringify(failedExpenses));
        }
    }
}

// =========================================================================
//                  UTILIDADES
// =========================================================================
function escapeHtml(string) {
    const matchHtmlRegExp = /["'&<>]/;
    const str = '' + string;
    const match = matchHtmlRegExp.exec(str);

    if (!match) {
        return str;
    }

    let escape;
    let html = '';
    let index = 0;
    let lastIndex = 0;

    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escape = '&quot;';
                break;
            case 38: // &
                escape = '&amp;';
                break;
            case 39: // '
                escape = '&#39;';
                break;
            case 60: // <
                escape = '&lt;';
                break;
            case 62: // >
                escape = '&gt;';
                break;
            default:
                continue;
        }

        if (lastIndex !== index) {
            html += str.substring(lastIndex, index);
        }

        lastIndex = index + 1;
        html += escape;
    }

    return lastIndex !== index
        ? html + str.substring(lastIndex, index)
        : html;
}

// showToast and showLoader are provided by modular UI helpers in src/ui/

window.app = {
    deleteServiceRecord,
    viewServiceDetail
};

// Cargar catálogo de precios desde Google Sheets
async function loadPricesFromCloud() {
    if (!CONFIG_SHEET_URL) return;
    try {
        const url = `${CONFIG_SHEET_URL}?action=get_prices`;
        const data = await apiGet(url, { showLoading: true, loadingText: 'Cargando precios...', swallowError: true });

        if (data && data.success && data.prices && data.prices.length > 0) {
            const newCatalog = {};
            data.prices.forEach(p => {
                if (!newCatalog[p.categoria]) {
                    newCatalog[p.categoria] = [];
                }
                newCatalog[p.categoria].push({ name: p.name, price: p.price });
            });

            // Reemplazar catálogo global
            SERVICES_CATALOG = newCatalog;

            // Re-renderizar formulario
            renderCategories();
            if (state.selectedCategory && SERVICES_CATALOG[state.selectedCategory]) {
                selectCategory(state.selectedCategory);
            } else {
                selectCategory(Object.keys(SERVICES_CATALOG)[0]);
            }
            console.log("Catálogo actualizado desde la nube:", SERVICES_CATALOG);
        }
    } catch (error) {
        console.warn("No se pudieron cargar los precios de la nube, usando valores locales.", error);
    }
}

// Chequear acceso de administrador y ajustar visibilidad del botón de Ajustes e importación
function checkAdminAccess() {
    const configBtn = document.getElementById("nav-btn-config");
    const syncBtn = document.getElementById("btn-sync-history");
    const isAdmin = state.currentUser && state.currentUser.rol === "admin";

    if (configBtn) {
        if (isAdmin) {
            configBtn.classList.remove("hidden");
        } else {
            configBtn.classList.add("hidden");
            const activeTabBtn = document.querySelector(".nav-item.active");
            if (activeTabBtn && activeTabBtn.getAttribute("data-tab") === "configuracion") {
                switchTab("calendario");
            }
        }
    }

    if (syncBtn) {
        if (isAdmin) {
            syncBtn.classList.remove("hidden");
        } else {
            syncBtn.classList.add("hidden");
        }
    }

    updateRegisterTabVisibility();
}

// Renderizar el editor de precios dinámico en Ajustes
function renderPricesEditor() {
    const container = document.getElementById("prices-editor-container");
    if (!container) return;

    container.innerHTML = "";

    Object.keys(SERVICES_CATALOG).forEach(catKey => {
        if (catKey === "personalizado") return; // No se edita el manual/otro

        const categoryGroup = document.createElement("div");
        categoryGroup.className = "price-category-group";

        const catLabels = {
            semi: "Semipermanente",
            kapping: "Kapping",
            softgel: "Soft Gel",
            esculpidas: "Esculpidas",
            remocion: "Remociones"
        };

        const title = document.createElement("div");
        title.className = "price-category-title";
        title.textContent = catLabels[catKey] || catKey;
        categoryGroup.appendChild(title);

        const services = SERVICES_CATALOG[catKey];
        services.forEach(service => {
            const row = document.createElement("div");
            row.className = "price-item-row";

            const nameLabel = document.createElement("div");
            nameLabel.className = "price-item-name";
            nameLabel.textContent = service.name;
            row.appendChild(nameLabel);

            if (state.isEditingPrices) {
                // Modo Edición: Mostrar inputs y el precio anterior en una etiqueta a la izquierda
                const rowContent = document.createElement("div");
                rowContent.style.display = "flex";
                rowContent.style.alignItems = "center";
                rowContent.style.gap = "10px";

                const oldPriceSpan = document.createElement("span");
                oldPriceSpan.className = "old-price-label";
                oldPriceSpan.textContent = `(Antes: $${service.price.toLocaleString("es-AR")})`;
                rowContent.appendChild(oldPriceSpan);

                const inputWrapper = document.createElement("div");
                inputWrapper.className = "price-input-wrapper";
                inputWrapper.innerHTML = `
                    <span>$</span>
                    <input type="number" 
                           class="price-input-field" 
                           data-category="${catKey}" 
                           data-name="${escapeHtml(service.name)}" 
                           value="${service.price}" 
                           min="0" 
                           inputmode="numeric">
                `;
                rowContent.appendChild(inputWrapper);
                row.appendChild(rowContent);
            } else {
                // Modo Solo Lectura: Mostrar etiqueta limpia del valor actual
                const priceVal = document.createElement("div");
                priceVal.className = "price-val-label";
                priceVal.textContent = `$${service.price.toLocaleString("es-AR")}`;
                row.appendChild(priceVal);
            }

            categoryGroup.appendChild(row);
        });

        if (services.length > 0) {
            container.appendChild(categoryGroup);
        }
    });
}

// Guardar precios modificados en Google Sheets
async function savePricesToCloud() {
    if (!state.currentUser || state.currentUser.rol !== "admin") {
        showToast("No tienes permisos de administrador", "error");
        return;
    }

    if (!CONFIG_SHEET_URL) {
        showToast("URL de Google Sheets no configurada en app.js", "error");
        return;
    }

    const inputs = document.querySelectorAll(".price-input-field");
    const updatedPrices = [];

    inputs.forEach(input => {
        const category = input.getAttribute("data-category");
        const name = input.getAttribute("data-name");
        const price = Number(input.value) || 0;

        updatedPrices.push({
            categoria: category,
            name: name,
            price: price
        });
    });

    // Preservar la categoría de personalizado/otro que no tiene inputs editables
    if (SERVICES_CATALOG["personalizado"]) {
        SERVICES_CATALOG["personalizado"].forEach(service => {
            updatedPrices.push({
                categoria: "personalizado",
                name: service.name,
                price: service.price
            });
        });
    }

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "update_prices", email: state.currentUser.email, prices: updatedPrices }, { showLoading: true, loadingText: 'Guardando lista de precios...' });

        if (data && data.success) {
            state.isEditingPrices = false;

            const actionsContainer = document.getElementById("edit-actions-container");
            if (actionsContainer) actionsContainer.classList.add("hidden");

            const editBtn = document.getElementById("btn-edit-mode");
            if (editBtn) editBtn.classList.remove("hidden");

            showToast("¡Lista de precios guardada con éxito!", "success");
            await loadPricesFromCloud();
        } else {
            showToast(data.message || "Error al actualizar precios", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al guardar precios:", error);
        showToast("Error de conexión al guardar los precios.", "error");
    }
}

// Variables y lógica para el modal genérico de confirmación
let genericConfirmCallback = null;

function showGenericConfirmModal(title, subtitle, onConfirm) {
    const titleEl = document.getElementById("generic-modal-title");
    const subEl = document.getElementById("generic-modal-sub");

    if (titleEl) titleEl.innerHTML = `${title} <i class="fa-solid fa-circle-question" style="color: var(--barbie-pink);"></i>`;
    if (subEl) subEl.textContent = subtitle;

    genericConfirmCallback = onConfirm;

    const modal = document.getElementById("generic-confirm-modal");
    if (modal) modal.classList.remove("hidden");
}

// Gestión de turnos movida a src/appointments.js

// Función global para forzar recarga/sincronización de todos los datos
async function refreshAllData(showLoaderToast = true) {
    if (!state.currentUser) return;

    const icon = document.querySelector("#btn-global-reload i");
    if (icon) icon.classList.add("fa-spin");

    if (showLoaderToast) showLoader(true, "Sincronizando datos con la nube...");

    try {
        await Promise.all([
            loadAppointments(),
            loadServicesData(),
            loadPricesFromCloud(),
            loadExpenses(),
            loadCajaMovements()
        ]);
        showToast("¡Datos sincronizados correctamente!", "success");
    } catch (err) {
        console.error("Error al sincronizar datos:", err);
        showToast("Sin conexión. Mostrando datos locales.", "warning");
    } finally {
        if (icon) icon.classList.remove("fa-spin");
        if (showLoaderToast) showLoader(false);
    }
}

// Renderizar la cuadrícula del calendario
function renderCalendar() {
    const monthYearEl = document.getElementById("calendar-month-year");
    const gridEl = document.getElementById("calendar-days-grid");
    if (!monthYearEl || !gridEl) return;

    const date = state.calendarDate;
    const year = date.getFullYear();
    const month = date.getMonth();

    // Mostrar título del mes
    const monthNames = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    monthYearEl.textContent = `${monthNames[month]} ${year}`;

    gridEl.innerHTML = "";

    // Primer día del mes
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Ajustar para empezar en Lunes (JS: 0=Domingo, 1=Lunes...) -> Nuevo: 0=Lunes, 6=Domingo
    const startPadding = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Días del mes anterior (padding)
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startPadding; i > 0; i--) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day empty";
        dayDiv.textContent = prevLastDay - i + 1;
        gridEl.appendChild(dayDiv);
    }

    // Días del mes actual
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= lastDay; day++) {
        const dayBtn = document.createElement("div");
        dayBtn.className = "calendar-day";

        const numberSpan = document.createElement("span");
        numberSpan.className = "day-number";
        numberSpan.textContent = day;
        dayBtn.appendChild(numberSpan);

        const thisDate = new Date(year, month, day);

        // Es hoy?
        if (thisDate.toDateString() === today.toDateString()) {
            dayBtn.classList.add("today");
        }

        // Es seleccionado?
        if (thisDate.toDateString() === state.selectedCalendarDay.toDateString()) {
            dayBtn.classList.add("selected");
        }

        // Filtrar citas de este día
        const dayApts = state.appointmentsList.filter(apt => {
            const parts = getAppointmentDateParts(apt);
            if (!parts) return false;
            return parts.year === year && parts.month === month && parts.day === day;
        });

        if (dayApts.length > 0) {
            dayBtn.classList.add("has-appointments");

            const previewContainer = document.createElement("div");
            previewContainer.className = "day-events-preview";

            // Mostrar hasta 2 píldoras
            const maxVisible = 2;
            dayApts.slice(0, maxVisible).forEach(apt => {
                const pill = document.createElement("div");
                const statusClass = (apt.estado || "Provisional").toLowerCase();
                pill.className = `event-preview-pill ${statusClass}`;
                pill.textContent = apt.cliente;
                previewContainer.appendChild(pill);
            });

            // Mostrar "+N" si hay más
            if (dayApts.length > maxVisible) {
                const morePill = document.createElement("div");
                morePill.className = "event-preview-pill more";
                morePill.textContent = `+${dayApts.length - maxVisible}`;
                previewContainer.appendChild(morePill);
            }

            dayBtn.appendChild(previewContainer);
        }

        // Click en el día
        dayBtn.addEventListener("click", () => {
            if (state.selectedCalendarDay.toDateString() === thisDate.toDateString()) {
                openScheduleModalForDate(thisDate);
            } else {
                state.selectedCalendarDay = thisDate;
                renderCalendar();
                renderDayAppointments();
            }
        });

        gridEl.appendChild(dayBtn);
    }
}

// Renderizar turnos del día seleccionado
function renderDayAppointments() {
    const container = document.getElementById("day-appointments-container");
    const dateTitle = document.getElementById("selected-day-date");
    const title = document.getElementById("selected-day-title");
    if (!container || !dateTitle || !title) return;

    const selDate = state.selectedCalendarDay;
    const yyyy = selDate.getFullYear();
    const mm = String(selDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selDate.getDate()).padStart(2, '0');
    dateTitle.textContent = `${dd}/${mm}/${yyyy}`;

    title.textContent = `Turnos del ${selDate.toLocaleDateString("es-AR", { day: 'numeric', month: 'long' })}`;

    container.innerHTML = "";

    // Filtrar citas del día
    const dayApts = state.appointmentsList.filter(apt => {
        const parts = getAppointmentDateParts(apt);
        if (!parts) return false;
        return parts.year === yyyy && parts.month === selDate.getMonth() && parts.day === selDate.getDate();
    });

    if (dayApts.length === 0) {
        container.innerHTML = `
            <div class="no-appointments-placeholder" style="cursor: pointer;" id="btn-empty-schedule">
                <i class="fa-solid fa-calendar-plus" style="font-size: 24px; color: var(--barbie-pink); margin-bottom: 8px; display: block;"></i>
                No hay turnos agendados para este día.
                <span style="font-size: 11px; color: var(--barbie-dark); font-weight: 700; display: block; margin-top: 4px;">
                    <i class="fa-solid fa-plus"></i> Presiona aquí para agendar
                </span>
            </div>
        `;
        document.getElementById("btn-empty-schedule").addEventListener("click", () => {
            openScheduleModalForDate(selDate);
        });
        return;
    }

    dayApts.forEach(apt => {
        const card = document.createElement("div");
        const statusClass = (apt.estado || "Provisional").toLowerCase();
        card.className = `appointment-card ${statusClass}`;

        const start = new Date(apt.horaInicio);
        const end = new Date(apt.horaFin);
        const timeStr = start.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' });

        const isAdmin = state.currentUser && state.currentUser.rol === "admin";
        const aptSena = Number(apt.precio) || 0;

    card.innerHTML = `
            <div class="appointment-time-col">
                <span class="appointment-time-start">${timeStr}</span>
            </div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(apt.cliente)}</div>
                <div class="appointment-service-name">
                    <i class="fa-solid fa-sparkles" style="color: var(--barbie-pink); font-size: 9px;"></i> 
                    ${apt.estado === "Reservado" ? `Reservado (Seña: $${aptSena.toLocaleString("es-AR")})` : apt.estado === "Completado" || apt.estado === "completed" ? `Cobrado` : `Provisional`}
                </div>
            </div>
            <div class="appointment-actions-col" style="display: flex; gap: 8px; align-items: center;">
                ${apt.estado !== "Completado" ? `
                <button class="btn-reschedule-appointment" title="Reagendar Turno" data-id="${apt.id}" style="background: #fff3e0; color: #e65100; border: none; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-regular fa-calendar-plus" style="font-size: 11px;"></i>
                </button>
                ` : ''}
                ${apt.estado === "Provisional" ? `
                    <button class="btn-confirm-appointment-sena" title="Cargar Seña" data-id="${apt.id}" style="background: #e3f2fd; color: #0d47a1; border: none; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
                        <i class="fa-solid fa-check-double" style="font-size: 11px;"></i>
                    </button>
                ` : ''}
                ${apt.estado === "Reservado" ? `
                    <button class="btn-checkout-appointment" title="Cobrar Turno" data-id="${apt.id}" style="background: #e8f5e9; color: #2e7d32; border: none; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
                        <i class="fa-solid fa-dollar-sign" style="font-size: 11px;"></i>
                    </button>
                ` : ''}
                ${isAdmin ? `
                <button class="btn-delete-appointment" title="Cancelar Turno" data-id="${apt.id}">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
                ` : ''}
            </div>
        `;

        // Evento de eliminar
        if (isAdmin) {
            card.querySelector(".btn-delete-appointment").addEventListener("click", () => {
                cancelAppointment(apt.id, apt.cliente);
            });
        }

        // Evento de reagendar
        const btnReschedule = card.querySelector(".btn-reschedule-appointment");
        if (btnReschedule) {
            btnReschedule.addEventListener("click", () => {
                openRescheduleModal(apt);
            });
        }

        // Evento de confirmar reserva con seña (Modal)
        const btnSena = card.querySelector(".btn-confirm-appointment-sena");
        if (btnSena) {
            btnSena.addEventListener("click", () => {
                openSenaModal(apt);
            });
        }

        // Evento de cobrar turno
        const btnCheckout = card.querySelector(".btn-checkout-appointment");
        if (btnCheckout) {
            btnCheckout.addEventListener("click", () => {
                openCheckoutForAppointment(apt);
            });
        }

        container.appendChild(card);
    });
}

// =========================================================================
//                  MANEJO DE MODALES DE SEÑA Y REAGENDAMIENTO
// =========================================================================
let currentSenaAppointment = null;
let currentRescheduleAppointment = null;

function openSenaModal(apt) {
    currentSenaAppointment = apt;
    const sub = document.getElementById("sena-modal-sub");
    if (sub) sub.textContent = `Cargar seña para ${apt.cliente}:`;

    const amt = document.getElementById("sena-modal-amount");
    if (amt) amt.value = apt.precio ? apt.precio : "2500";

    const modal = document.getElementById("sena-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeSenaModal() {
    currentSenaAppointment = null;
    const modal = document.getElementById("sena-modal");
    if (modal) modal.classList.add("hidden");
}

async function handleSenaSubmit(e) {
    e.preventDefault();
    if (!currentSenaAppointment) return;

    const apt = currentSenaAppointment;
    const sena = Number(document.getElementById("sena-modal-amount").value) || 0;
    const metodo = document.querySelector('input[name="sena-modal-payment"]:checked').value;

    if (sena < 0) {
        showToast("Ingresá un monto de seña válido para confirmar el turno.", "error");
        document.getElementById("sena-modal-amount").focus();
        document.getElementById("sena-modal-amount").select();
        return;
    }

    if (sena > 0 && sena < 1000) {
        window.alert('La seña debe ser 0 o mayor a 1000. Revisá el monto ingresado antes de guardar.');
        document.getElementById("sena-modal-amount").focus();
        document.getElementById("sena-modal-amount").select();
        return;
    }

    const newStatus = "Reservado";

    closeSenaModal();
    showLoader(true, "Actualizando turno en la nube...");

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "edit_appointment", id: apt.id, cliente: apt.cliente, fecha: apt.fecha, estado: newStatus, precio: sena }, { showLoading: false, swallowError: true });
        if (data && data.success) {
            apt.estado = newStatus;
            apt.precio = sena;
            state.appointmentsList = normalizeAppointmentList(state.appointmentsList);

            await registerServiceDirectly({
                id: "serv_" + new Date().getTime(),
                fecha: new Date().toISOString(),
                usuario: state.currentUser ? state.currentUser.email : "Evolet",
                cliente: apt.cliente,
                servicio: "Seña",
                categoria: "Manicuría",
                precio: sena,
                seña: 0,
                metodoPago: metodo,
                completado: false
            });

            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            const targetDate = normalizeCalendarDate(apt.horaInicio || apt.fecha || new Date());
            state.selectedCalendarDay = targetDate;
            state.calendarDate = targetDate;
            await loadAppointments(false);
            showToast(`¡Turno actualizado a "${newStatus}"!`, "success");
            renderCalendar();
            renderDayAppointments();
        } else {
            showToast(data.message || "Error al actualizar turno", "error");
        }
    } catch (err) {
        console.error("Error al actualizar turno:", err);
        showToast("Error de conexión. Inténtalo de nuevo.", "error");
    } finally {
        showLoader(false);
    }
}

function openRescheduleModal(apt) {
    currentRescheduleAppointment = apt;
    const sub = document.getElementById("reschedule-modal-sub");
    if (sub) sub.textContent = `Reagendar turno de ${apt.cliente} (Estado: ${apt.estado}):`;

    let dateStr = "";
    let timeStr = "10:00";
    if (apt.horaInicio) {
        const d = new Date(apt.horaInicio);
        if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().split('T')[0];
            timeStr = d.toTimeString().substring(0, 5);
        }
    }
    if (!dateStr && apt.fecha) {
        dateStr = apt.fecha.substring(0, 10);
    }

    document.getElementById("reschedule-date").value = dateStr;
    document.getElementById("reschedule-time").value = timeStr;
    const modal = document.getElementById("reschedule-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeRescheduleModal() {
    currentRescheduleAppointment = null;
    const modal = document.getElementById("reschedule-modal");
    if (modal) modal.classList.add("hidden");
}

async function handleRescheduleSubmit(e) {
    e.preventDefault();
    if (!currentRescheduleAppointment) return;

    const apt = currentRescheduleAppointment;
    const newDate = document.getElementById("reschedule-date").value;
    const newTime = document.getElementById("reschedule-time").value;

    if (!newDate || !newTime) {
        showToast("Selecciona fecha y hora para reagendar.", "error");
        return;
    }

    const startIso = `${newDate}T${newTime}:00`;
    const startDate = new Date(startIso);
    const endDate = new Date(startDate.getTime() + (90 * 60 * 1000));
    const endIso = endDate.toISOString();

    closeRescheduleModal();
    showLoader(true, "Reagendando turno en la nube y Google Calendar...");

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "edit_appointment", id: apt.id, fecha: newDate, horaInicio: startDate.toISOString(), horaFin: endIso }, { showLoading: false, swallowError: true });
        if (data && data.success) {
            apt.fecha = newDate;
            apt.horaInicio = startDate.toISOString();
            apt.horaFin = endIso;

            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            showToast("¡Turno reagendado con éxito!", "success");

            state.selectedCalendarDay = startDate;
            state.calendarDate = startDate;

            renderCalendar();
            renderDayAppointments();
        } else {
            showToast(data.message || "Error al reagendar el turno", "error");
        }
    } catch (err) {
        console.error("Error al reagendar el turno:", err);
        showToast("Error de conexión al reagendar.", "error");
    } finally {
        showLoader(false);
    }
}

// Limpiar estado de cobro de turno
function clearCheckoutState() {
    state.linkedAppointment = null;
    const senaBanner = document.getElementById("checkout-sena-banner");
    if (senaBanner) senaBanner.classList.add("hidden");

    const cancelCheckoutBtn = document.getElementById("btn-cancel-checkout");
    if (cancelCheckoutBtn) cancelCheckoutBtn.classList.add("hidden");

    const clientInput = document.getElementById("client-name");
    if (clientInput) {
        clientInput.readOnly = false;
        clientInput.value = "";
    }
}

function cancelCheckoutAndReturnToAgenda() {
    clearCheckoutState();
    switchTab("calendario");
    showToast("Cobro cancelado. De vuelta en la Agenda.", "info");
}

// Abrir pantalla de registro pre-llenando los datos del turno y haciendo el nombre readonly
function openCheckoutForAppointment(apt) {
    state.linkedAppointment = apt;

    const clientInput = document.getElementById("client-name");
    clientInput.value = apt.cliente;
    clientInput.readOnly = true;

    const cancelCheckoutBtn = document.getElementById("btn-cancel-checkout");
    if (cancelCheckoutBtn) cancelCheckoutBtn.classList.remove("hidden");

    // Crear o actualizar un banner informativo de seña en el formulario
    let senaBanner = document.getElementById("checkout-sena-banner");
    if (!senaBanner) {
        senaBanner = document.createElement("div");
        senaBanner.id = "checkout-sena-banner";
        senaBanner.style.padding = "10px 14px";
        senaBanner.style.background = "#e3f2fd";
        senaBanner.style.color = "#0d47a1";
        senaBanner.style.borderRadius = "var(--radius-sm)";
        senaBanner.style.fontSize = "12px";
        senaBanner.style.fontWeight = "600";
        senaBanner.style.marginBottom = "15px";
        senaBanner.style.display = "flex";
        senaBanner.style.alignItems = "center";
        senaBanner.style.gap = "8px";

        const form = document.getElementById("service-form");
        form.insertBefore(senaBanner, form.firstChild);
    }
    const aptSena = Number(apt.precio) || 0;
    senaBanner.innerHTML = `<i class="fa-solid fa-circle-info"></i> Turno Reservado. Seña de <strong>$${aptSena.toLocaleString("es-AR")}</strong> ya cobrada será descontada del total automáticamente.`;
    senaBanner.classList.remove("hidden");

    switchTab("registrar");
    showToast(`Cobrando turno de ${apt.cliente} (Seña: -$${aptSena.toLocaleString("es-AR")})`, "info");
}

// Envío del formulario de agendar turno
async function handleScheduleSubmit(e) {
    e.preventDefault();

    if (!state.currentUser) {
        showToast("Debes iniciar sesión para agendar turnos.", "error");
        return;
    }

    const cliente = document.getElementById("schedule-client-name").value.trim();
    const dateVal = document.getElementById("schedule-date").value;
    const timeVal = document.getElementById("schedule-time").value;

    if (!cliente || !dateVal || !timeVal) {
        showToast("Por favor, completa todos los campos obligatorios.", "error");
        return;
    }

    const statusVal = document.getElementById("schedule-status").value;
    const rawSenaAmount = Number(document.getElementById("schedule-sena-amount").value);
    const senaAmount = rawSenaAmount || 0;
    const paymentMethodEl = document.querySelector('input[name="schedule-payment"]:checked');
    const senaPaymentMethod = paymentMethodEl ? paymentMethodEl.value : "Transferencia";

    if (statusVal === "Reservado" && rawSenaAmount !== 0 && rawSenaAmount < 1000) {
        window.alert('La seña debe ser 0 o mayor a 1000. Revisá el monto ingresado antes de guardar.');
        document.getElementById("schedule-sena-amount").focus();
        document.getElementById("schedule-sena-amount").select();
        return;
    }

    // Calcular horas ISO (Duración por defecto: 90 minutos, Servicio: "Turno", Precio: seña o 0)
    const start = new Date(`${dateVal}T${timeVal}`);
    const duration = 90;
    const end = new Date(start.getTime() + duration * 60000);

    const appointmentData = {
        action: "add_appointment",
        id: "app_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000),
        fecha: dateVal,
        horaInicio: start.toISOString(),
        horaFin: end.toISOString(),
        cliente: cliente,
        servicio: "Turno",
        precio: statusVal === "Reservado" ? senaAmount : 0,
        usuario: state.currentUser.email,
        estado: statusVal
    };

    // Resetear formulario para siguientes llamadas
    document.getElementById("schedule-form").reset();
    document.getElementById("schedule-sena-fields").classList.add("hidden");
    document.getElementById("schedule-modal").classList.add("hidden");
    showLoader(true, "Agendando turno y sincronizando con Google Calendar...");

    try {
        const data = await apiPost(CONFIG_SHEET_URL, appointmentData, { showLoading: true, loadingText: 'Agendando turno y sincronizando con Google Calendar...' });

        if (data && data.success) {
            showToast("¡Turno agendado y sincronizado con éxito!", "success");

            const normalizedAppointment = {
                ...(data.appointment || appointmentData),
                estado: statusVal,
                precio: statusVal === "Reservado" ? senaAmount : 0
            };

            // Añadir localmente, ordenar y recargar
            state.appointmentsList = normalizeAppointmentList([
                ...state.appointmentsList,
                normalizedAppointment
            ]);

            const normalizedStart = normalizeCalendarDate(start);
            state.selectedCalendarDay = normalizedStart;
            state.calendarDate = normalizedStart;

            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            localStorage.removeItem(`evolet_appointments_v4_${state.currentUser.email}_last_sync`);

            if (statusVal === "Reservado" && senaAmount > 0) {
                showLoader(true, "Registrando seña en la contabilidad...");
                await registerServiceDirectly({
                    id: "serv_" + new Date().getTime(),
                    fecha: new Date().toISOString(), // Se registra con la fecha de hoy
                    usuario: state.currentUser.email,
                    cliente: cliente,
                    servicio: "Seña",
                    categoria: "Manicuría",
                    precio: senaAmount,
                    seña: 0,
                    metodoPago: senaPaymentMethod,
                    completado: false
                });
                showLoader(false);
            }

            await loadAppointments(false);
            renderCalendar();
            renderDayAppointments();
        } else {
            showToast(data.message || "Error al agendar turno", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al agendar turno:", error);
        showToast("Error de conexión al agendar. Verifica tu internet.", "error");
    }
}

// Cancelar Turno (Solo Administradores)
function cancelAppointment(id, clientName) {
    if (!state.currentUser || state.currentUser.rol !== "admin") {
        showToast("Solo los administradores pueden cancelar turnos.", "error");
        return;
    }
    showGenericConfirmModal(
        "Cancelar Turno",
        `¿Segura de que deseas cancelar el turno de ${clientName}? Se eliminará también de tu Google Calendar.`,
        async () => {
            showLoader(true, "Cancelando turno...");
            try {
                const data = await apiPost(CONFIG_SHEET_URL, { action: "delete_appointment", id: id, email: state.currentUser.email }, { showLoading: true, loadingText: 'Cancelando turno...' });

                if (data && data.success) {
                    showToast("Turno cancelado correctamente.", "success");

                    // Remover de la lista local sin perder el resto de turnos
                    state.appointmentsList = normalizeAppointmentList(
                        state.appointmentsList.filter(apt => apt.id !== id)
                    );

                    const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
                    localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));

                    renderCalendar();
                    renderDayAppointments();
                } else {
                    showToast(data.message || "Error al cancelar turno", "error");
                }
            } catch (error) {
                showLoader(false);
                console.error("Error al cancelar turno:", error);
                showToast("Error de conexión al cancelar turno.", "error");
            }
        }
    );
}

// Abrir el modal de agendar turno parametrizando una fecha
function openScheduleModalForDate(date) {
    const dateInput = document.getElementById("schedule-date");
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;

    // Resetear campos del formulario
    document.getElementById("schedule-client-name").value = "";
    document.getElementById("schedule-time").value = "14:00"; // Hora por defecto

    document.getElementById("schedule-modal").classList.remove("hidden");
}

// Invocar la acción en la nube para importar servicios ya cobrados
async function importHistoryServices() {
    if (!state.currentUser) return;

    if (!CONFIG_SHEET_URL) {
        showToast("Configuración incorrecta.", "error");
        return;
    }

    try {
        const data = await apiPost(CONFIG_SHEET_URL, { action: "import_services", email: state.currentUser.email }, { showLoading: true, loadingText: 'Importando cobrados...' });

        if (data && data.success) {
            showToast(data.message || `¡Sincronización completada!`, "success");

            // Recargar turnos de la nube
            await loadAppointments();
        } else {
            showToast(data.message || "Error al importar historial", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al importar historial:", error);
        showToast("Error de conexión al importar historial.", "error");
    }
}

// Cargar gastos de la nube
async function loadExpenses() {
    if (!state.currentUser) return;

    const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
    const cached = getStoredJson(cacheKey, []);
    if (Array.isArray(cached)) {
        state.expensesList = cached.map(normalizeExpenseRecord);
        const activeTab = document.querySelector(".nav-item.active");
        if (activeTab && activeTab.getAttribute("data-tab") === "gastos") {
            renderExpensesList();
        }
    }

    if (!CONFIG_SHEET_URL) return;

    try {
        const data = await apiGet(`${CONFIG_SHEET_URL}?action=get_expenses`, { showLoading: true, loadingText: 'Cargando gastos...', swallowError: true });

        if (data && data.success && data.expenses) {
            state.expensesList = Array.isArray(data.expenses) ? data.expenses.map(normalizeExpenseRecord) : [];
            setStoredJson(cacheKey, state.expensesList);

            const activeTab = document.querySelector(".nav-item.active");
            if (activeTab && activeTab.getAttribute("data-tab") === "gastos") {
                renderExpensesList();
            }
            // Actualizar también estadísticas si cambiaran los egresos
            if (activeTab && activeTab.getAttribute("data-tab") === "estadisticas") {
                calculateAndRenderStats();
            }
        }
    } catch (error) {
        console.warn("No se pudieron cargar gastos en tiempo real:", error);
    }
}

// Renderizar el historial de gastos del mes actual
function renderExpensesList() {
    const container = document.getElementById("expenses-list");
    const totalEl = document.getElementById("expense-month-total");
    if (!container || !totalEl) return;

    container.innerHTML = "";

    const now = new Date();
    const { startDate, endDate } = getMonthWindowRange(now);

    // Filtrar los gastos del periodo desde el día equivalente del mes anterior hasta hoy
    const monthExpenses = state.expensesList.filter(item => {
        const date = normalizeDateValue(item.fecha);
        return date && date >= startDate && date <= endDate;
    });


    // Ordenar de más nuevo a más viejo
    monthExpenses.sort((a, b) => {
        const dateA = normalizeDateValue(a.fecha);
        const dateB = normalizeDateValue(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });



    let totalSum = 0;

    if (monthExpenses.length === 0) {
        container.innerHTML = `
            <div class="no-appointments-placeholder">
                <i class="fa-solid fa-receipt" style="font-size: 20px; color: var(--text-light); margin-bottom: 5px; display: block;"></i>
                No hay gastos registrados este mes
            </div>
        `;
        totalEl.textContent = "$0";
        return;
    }

    monthExpenses.forEach(exp => {
        totalSum += exp.monto;

        const date = normalizeDateValue(exp.fecha) || new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const monthStr = String(date.getMonth() + 1).padStart(2, '0');

        const card = document.createElement("div");
        card.className = "appointment-card";
        const isAdmin = state.currentUser && state.currentUser.rol === "admin";

        card.innerHTML = `
            <div class="appointment-time-col">
                <span class="appointment-time-start">${day}/${monthStr}</span>
                <span class="appointment-time-duration">${escapeHtml(exp.metodoPago)}</span>
            </div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(exp.concepto)}</div>
                <div class="appointment-service-name" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
                    <span class="pay-badge" style="background-color: #fce4ec; color: #c2185b; font-size: 9px; padding: 1px 6px; border-radius: 4px;">${escapeHtml(exp.categoria || "Otro")}</span>
                    <span>
                        <i class="fa-solid fa-arrow-trend-down" style="color: #ff4d4d; font-size: 10px;"></i>
                        <strong>$${exp.monto.toLocaleString("es-AR")}</strong>
                    </span>
                </div>
            </div>
            ${isAdmin ? `
            <div class="appointment-actions-col">
                <button class="btn-delete-expense btn-delete-appointment" title="Eliminar Gasto" data-id="${exp.id}">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
            ` : ''}
        `;

        if (isAdmin) {
            const deleteBtn = card.querySelector(".btn-delete-expense");
            if (deleteBtn) {
                deleteBtn.addEventListener("click", () => {
                    deleteExpenseRecord(exp.id, exp.concepto);
                });
            }
        }

        container.appendChild(card);
    });

    totalEl.textContent = `$${totalSum.toLocaleString("es-AR")}`;
}

// Registrar gasto (Submit de formulario)
async function handleExpenseSubmit(e) {
    e.preventDefault();

    if (!state.currentUser) {
        showToast("Inicia sesión para registrar gastos.", "error");
        return;
    }

    const concepto = document.getElementById("expense-concept").value.trim();
    const monto = Number(document.getElementById("expense-amount").value);
    const fecha = document.getElementById("expense-date").value;
    const metodoPago = document.querySelector('input[name="expense-payment"]:checked').value;
    const categoria = document.getElementById("expense-category").value;

    if (!concepto || !monto || !fecha || !metodoPago || !categoria) {
        showToast("Por favor, completa todos los campos del gasto.", "error");
        return;
    }

    const expenseData = {
        action: "add_expense",
        id: "exp_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000),
        fecha: fecha,
        concepto: concepto,
        monto: monto,
        metodoPago: metodoPago,
        categoria: categoria,
        usuario: state.currentUser.email
    };

    try {
        const data = await apiPost(CONFIG_SHEET_URL, expenseData, { showLoading: true, loadingText: 'Registrando gasto en la planilla...' });

        if (data && data.success) {
            showToast("¡Gasto registrado con éxito!", "success");

            // Limpiar formulario
            document.getElementById("expense-concept").value = "";
            document.getElementById("expense-amount").value = "";

            // Añadir localmente
            state.expensesList.push(normalizeExpenseRecord(data.expense || expenseData));

            const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
            setStoredJson(cacheKey, state.expensesList);

            renderExpensesList();
            calculateAndRenderStats();
        } else {
            showToast(data.message || "Error al registrar el gasto", "error");
        }
    } catch (error) {
            showLoader(false);
            console.error("Error al registrar gasto:", error);
            showToast("Error de conexión al registrar. Se guardó offline.", "error");

        // Guardar offline
        const queueKey = `evolet_offline_expenses_v4_${state.currentUser.email}`;
        const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
        queue.push(expenseData);
        localStorage.setItem(queueKey, JSON.stringify(queue));

        state.expensesList.push(normalizeExpenseRecord(expenseData));
        const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
        setStoredJson(cacheKey, state.expensesList);

        renderExpensesList();
        calculateAndRenderStats();
    }
}

// Eliminar registro de gasto (Solo Administradores)
function deleteExpenseRecord(id, concepto) {
    if (!state.currentUser || state.currentUser.rol !== "admin") {
        showToast("Solo los administradores pueden eliminar gastos.", "error");
        return;
    }
    showGenericConfirmModal(
        "Eliminar Gasto",
        `¿Segura de que deseas eliminar el gasto por "${concepto}"?`,
        async () => {
            showLoader(true, "Eliminando gasto...");

            try {
                const data = await apiPost(CONFIG_SHEET_URL, { action: "delete_expense", id: id }, { showLoading: true, loadingText: 'Eliminando gasto...' });

                if (data && data.success) {
                    showToast("Gasto eliminado correctamente.", "success");

                    state.expensesList = state.expensesList.filter(exp => exp.id !== id);
                    const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
                    setStoredJson(cacheKey, state.expensesList);

                    renderExpensesList();
                    calculateAndRenderStats();

                    // Si estamos viendo el historial de gastos, recargar también
                    const activeTab = document.querySelector(".nav-item.active");
                    if (activeTab && activeTab.getAttribute("data-tab") === "gastos") {
                        const histPane = document.getElementById("tab-historial-gastos");
                        if (histPane && histPane.classList.contains("active")) {
                            renderExpensesHistoryList();
                        }
                    }
                } else {
                    showToast(data.message || "Error al eliminar gasto", "error");
                }
            } catch (error) {
                showLoader(false);
                console.error("Error al eliminar gasto:", error);
                showToast("Error de conexión al intentar eliminar.", "error");
            }
        }
    );
}

// Renderizar el listado histórico de gastos con búsqueda y filtros
function renderExpensesHistoryList() {
    const listElement = document.getElementById("expenses-history-list");
    if (!listElement) return;

    listElement.innerHTML = "";

    const filteredList = getFilteredExpensesHistory();

    if (filteredList.length === 0) {
        listElement.innerHTML = `
            <div class="card-info-box" style="text-align: center;">
                <p>No se encontraron registros de gastos</p>
            </div>
        `;
        return;
    }

    filteredList.forEach(item => {
        const card = document.createElement("div");
        card.className = "history-card";

        const dateObj = normalizeDateValue(item.fecha) || new Date();
        const formattedDate = dateObj.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit' });

        const payIcons = {
            Transferencia: '<i class="fa-solid fa-mobile-screen-button"></i>',
            Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>'
        };
        const payIcon = payIcons[item.metodoPago] || '<i class="fa-solid fa-receipt"></i>';
        const totalFormatted = `$${Number(item.monto || 0).toLocaleString("es-AR")}`;
        const conceptoLabel = (item.concepto || "Gasto").toString().trim() || "Gasto";

        const isAdmin = state.currentUser && state.currentUser.rol === "admin";

        card.innerHTML = `
            <div class="card-details">
                <div class="card-client">${escapeHtml(conceptoLabel)}</div>
                <div class="card-meta" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
                    <span><i class="fa-regular fa-calendar" style="color: var(--barbie-pink); margin-right: 3px;"></i>${formattedDate}</span>
                    <span class="pay-badge" title="Método de pago">${payIcon} ${item.metodoPago}</span>
                    <span class="pay-badge" style="background-color: #fce4ec; color: #c2185b;">${escapeHtml(item.categoria || "Otro")}</span>
                </div>
            </div>
            <div class="card-amount-box">
                <div class="card-price" style="font-size: 18px; color: var(--barbie-dark);">${totalFormatted}</div>
            </div>
            ${isAdmin ? `
            <button class="btn-delete-card btn-delete-expense-history" title="Eliminar Gasto">
                <i class="fa-solid fa-trash-can"></i>
            </button>
            ` : ''}
        `;

        if (isAdmin) {
            const deleteBtn = card.querySelector(".btn-delete-expense-history");
            if (deleteBtn) {
                deleteBtn.addEventListener("click", () => {
                    deleteExpenseRecord(item.id, item.concepto);
                });
            }
        }

        listElement.appendChild(card);
    });
}

// Obtener egresos filtrados por búsqueda y select
function getFilteredExpensesHistory() {
    const searchInput = document.getElementById("expense-search");
    const filterSelect = document.getElementById("expense-filter");
    if (!searchInput || !filterSelect) return state.expensesList;

    const searchVal = searchInput.value.toLowerCase().trim();
    const filterVal = filterSelect.value;

    // Clonar y ordenar del más nuevo al más viejo
    const list = Array.isArray(state.expensesList) ? state.expensesList.map(normalizeExpenseRecord) : [];
    list.sort((a, b) => {
        const dateA = normalizeDateValue(a.fecha);
        const dateB = normalizeDateValue(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });

    return list.filter(item => {
        const conceptoText = (item.concepto || "").toString().toLowerCase();
        const metodoText = (item.metodoPago || "").toString().toLowerCase();
        const matchesSearch = conceptoText.includes(searchVal) || metodoText.includes(searchVal);

        if (!matchesSearch) return false;

        if (filterVal === "todos") return true;

        const date = new Date(item.fecha + "T00:00:00");
        const now = new Date();

        if (filterVal === "hoy") {
            return date.toDateString() === now.toDateString();
        }

        if (filterVal === "semana") {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            return date >= oneWeekAgo;
        }

        if (filterVal === "mes") {
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }

        return true;
    });
}
