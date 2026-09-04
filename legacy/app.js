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
import { signInWithSupabase, supabase } from './src/supabase.js';
import state from './src/state.js';
import { loadAppointments, normalizeAppointmentList, mergeAppointmentLists, createStableAppointmentId, getAppointmentDateParts, updateAppointmentInSupabase, deleteAppointmentInSupabase, syncAppointmentWithGoogleCalendar } from './src/appointments.js';
import {
    normalizeServiceRecord,
    normalizeExpenseRecord,
    loadServicesData,
    registerServiceDirectly,
    updateServiceRecord,
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
    if ('serviceWorker' in navigator && import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations()
            .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
            .catch(error => console.warn('No se pudo limpiar el Service Worker de desarrollo:', error));
    } else if ('serviceWorker' in navigator) {
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
        loadClients();
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

    const accountForm = document.getElementById("account-form");
    if (accountForm) accountForm.addEventListener("submit", handleAccountSubmit);
    const accountSaveBtn = document.getElementById("account-save-btn");
    if (accountSaveBtn) accountSaveBtn.addEventListener("click", handleAccountSubmit);
    document.getElementById("account-edit-btn").addEventListener("click", () => setAccountEditing(true));
    document.getElementById("account-cancel-btn").addEventListener("click", () => setAccountEditing(false));

    const accountPasswordForm = document.getElementById("account-password-form");
    if (accountPasswordForm) accountPasswordForm.addEventListener("submit", handlePasswordSubmit);
    
    const showPasswordBtn = document.getElementById("show-change-password-btn");
    if (showPasswordBtn) showPasswordBtn.addEventListener("click", () => setAccountPasswordEditing(true));
    
    const accountPasswordCancelBtn = document.getElementById("account-password-cancel-btn");
    if (accountPasswordCancelBtn) accountPasswordCancelBtn.addEventListener("click", () => setAccountPasswordEditing(false));

    document.querySelectorAll(".password-reveal-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                const icon = btn.querySelector("i");
                if (icon) {
                    icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
                }
            }
        });
    });
    document.getElementById("client-detail-close").addEventListener("click", closeClientDetail);
    document.getElementById("client-edit-btn").addEventListener("click", () => setClientEditing(true));
    document.getElementById("client-cancel-btn").addEventListener("click", () => {
        if (selectedClient) openClientDetail(selectedClient.id);
    });

    const clientForm = document.getElementById("client-form");
    if (clientForm) clientForm.addEventListener("submit", handleClientSubmit);
    const clientsSearch = document.getElementById("clients-search");
    if (clientsSearch) clientsSearch.addEventListener("input", renderClientsList);
    const clientsFilterToggle = document.getElementById("clients-filter-toggle");
    if (clientsFilterToggle) clientsFilterToggle.addEventListener("click", () => document.getElementById("clients-filter-panel").classList.toggle("hidden"));
    document.querySelectorAll("[data-client-status]").forEach((button) => {
        button.addEventListener("click", () => {
            button.parentElement.querySelectorAll(".filter-choice").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            renderClientsList();
        });
    });
    const scheduleClientName = document.getElementById("schedule-client-name");
    if (scheduleClientName) scheduleClientName.addEventListener("input", () => {
        document.getElementById("schedule-new-client-panel")?.classList.add("hidden");
        renderScheduleSuggestions();
    });
    if (scheduleClientName) scheduleClientName.addEventListener("focus", renderScheduleSuggestions);
    document.addEventListener("click", (event) => {
        if (!event.target.closest("#schedule-client-name") && !event.target.closest("#client-suggestions")) {
            document.getElementById("client-suggestions")?.classList.add("hidden");
        }
    });
    const scheduleRegisterClient = document.getElementById("schedule-register-client");
    if (scheduleRegisterClient) scheduleRegisterClient.addEventListener("click", registerScheduleClient);

    const accountMenuButton = document.getElementById("btn-header-menu");
    const accountMenu = document.getElementById("account-menu");
    if (accountMenuButton && accountMenu) {
        accountMenuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const isOpen = !accountMenu.classList.contains("hidden");
            accountMenu.classList.toggle("hidden", isOpen);
            accountMenuButton.setAttribute("aria-expanded", String(!isOpen));
        });
        document.addEventListener("click", () => {
            accountMenu.classList.add("hidden");
            accountMenuButton.setAttribute("aria-expanded", "false");
        });
    }
    document.getElementById("menu-cuenta").addEventListener("click", () => switchTab("cuenta"));
    document.getElementById("menu-ajustes").addEventListener("click", () => switchTab("ajustes"));

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
    document.getElementById("history-filter-toggle").addEventListener("click", () => document.getElementById("history-filter-panel").classList.toggle("hidden"));
    document.querySelectorAll("[data-history-filter], [data-history-category], [data-history-payment]").forEach((button) => {
        button.addEventListener("click", () => {
            const group = button.parentElement;
            group.querySelectorAll(".filter-choice").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            filterHistory();
        });
    });

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

    // Mostrar/ocultar la pestaña Cajas desde Ajustes
    const chkCajasTab = document.getElementById("chk-allow-cajas-tab");
    if (chkCajasTab) {
        chkCajasTab.addEventListener("change", (e) => {
            state.allowCajasTab = e.target.checked;
            localStorage.setItem("evolet_allow_cajas_tab", state.allowCajasTab ? "true" : "false");
            updateCajasTabVisibility();
            showToast(state.allowCajasTab ? "Pestaña Cajas habilitada" : "Pestaña Cajas oculta", "info");
        });
    }

    updateFiadoPaymentVisibility();
    updateRegisterTabVisibility();
    updateCajasTabVisibility();

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
    document.getElementById("generic-modal-btn-confirm").addEventListener("click", async () => {
        const confirmation = genericConfirmState;
        if (!confirmation || confirmation.busy) return;

        confirmation.busy = true;
        setGenericConfirmBusy(true);
        closeGenericConfirmModal();
        confirmation.resolve(true);
        if (confirmation.onConfirm) await confirmation.onConfirm();
    });

    document.getElementById("generic-modal-btn-cancel").addEventListener("click", () => {
        const confirmation = genericConfirmState;
        if (!confirmation || confirmation.busy) return;
        confirmation.resolve(false);
        closeGenericConfirmModal();
    });

    document.getElementById("collect-debt-btn-cancel").addEventListener("click", closeCollectDebtModal);
    document.getElementById("collect-debt-btn-confirm").addEventListener("click", confirmDebtCollection);

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
    const expensesHistoryButton = document.getElementById("btn-view-expenses-history");
    if (expensesHistoryButton) expensesHistoryButton.addEventListener("click", () => {
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

    document.getElementById("expenses-search").addEventListener("input", renderExpensesList);
    document.getElementById("expenses-filter-toggle").addEventListener("click", () => document.getElementById("expenses-filter-panel").classList.toggle("hidden"));
    document.querySelectorAll("[data-expense-period], [data-expense-category]").forEach((button) => {
        button.addEventListener("click", () => {
            button.parentElement.querySelectorAll(".filter-choice").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            renderExpensesList();
        });
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

async function loadClients() {
    const container = document.getElementById("clients-list");
    if (!container || !state.currentUser) return;
    if (!supabase || !state.currentUser.authId) {
        container.innerHTML = '<div class="no-appointments-placeholder">La sección Clientes requiere Supabase.</div>';
        return;
    }
    container.innerHTML = '<div class="no-appointments-placeholder">Cargando clientes...</div>';
    try {
        const { data, error } = await supabase
            .from("clientes")
            .select("id, nombre, telefono, email, notas, activo, creado_en")
            .order("nombre", { ascending: true });
        if (error) throw error;
        state.clientsList = Array.isArray(data) ? data : [];
        updateScheduleClientSuggestions();
        renderClientsList();
    } catch (error) {
        console.error("Error al cargar clientes:", error);
        container.innerHTML = '<div class="no-appointments-placeholder">No se pudieron cargar los clientes.</div>';
    }
}

function updateScheduleClientSuggestions() {
    renderScheduleSuggestions();
}

function renderScheduleSuggestions() {
    const container = document.getElementById("client-suggestions");
    const input = document.getElementById("schedule-client-name");
    if (!container || !input) return;
    const query = input.value.trim().toLowerCase();
    const clients = (state.clientsList || []).filter((client) => client.activo !== false && client.nombre.toLowerCase().includes(query));
    container.innerHTML = clients.map((client) => `<button type="button" class="client-suggestion" data-client-name="${escapeHtml(client.nombre)}"><i class="fa-solid fa-user"></i>${escapeHtml(client.nombre)}</button>`).join("");
    container.classList.toggle("hidden", clients.length === 0);
    container.querySelectorAll(".client-suggestion").forEach((button) => button.addEventListener("click", () => {
        input.value = button.dataset.clientName;
        container.classList.add("hidden");
    }));
}

async function registerScheduleClient() {
    const nameInput = document.getElementById("schedule-client-name");
    const panel = document.getElementById("schedule-new-client-panel");
    const name = nameInput.value.trim();
    if (!name || !supabase || !state.currentUser?.authId) return;
    const button = document.getElementById("schedule-register-client");
    button.disabled = true;
    showLoader(true, "Registrando clienta...");
    try {
        const { data, error } = await supabase.from("clientes").insert({
            nombre: name,
            telefono: document.getElementById("schedule-new-client-phone").value.trim() || null,
            email: document.getElementById("schedule-new-client-email").value.trim().toLowerCase() || null
        }).select("id, nombre, telefono, email, notas, activo, creado_en").single();
        if (error) throw error;
        state.clientsList = [...(state.clientsList || []), data];
        updateScheduleClientSuggestions();
        panel.classList.add("hidden");
        showToast("Clienta registrada. Ya podés agendar el turno.", "success");
    } catch (error) {
        console.error("Error registrando clienta desde agenda:", error);
        showToast(error.code === "23505" ? "Ya existe una clienta con ese nombre." : "No se pudo registrar la clienta.", "error");
    } finally {
        button.disabled = false;
        showLoader(false);
    }
}

function renderClientsList() {
    const container = document.getElementById("clients-list");
    const searchInput = document.getElementById("clients-search");
    if (!container) return;

    const query = (searchInput?.value || "").trim().toLowerCase();
    const activeClientStatus = document.querySelector("[data-client-status].active");
    const statusFilter = activeClientStatus?.dataset.clientStatus || "activos";
    const clients = (state.clientsList || []).filter((client) => {
        if (statusFilter === "activos" && client.activo !== true) return false;
        if (statusFilter === "baja" && client.activo === true) return false;
        const searchable = [client.nombre, client.telefono, client.email, client.notas]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return searchable.includes(query);
    });

    if (clients.length === 0) {
        container.innerHTML = '<div class="list-empty-state">No hay clientes que coincidan con la búsqueda.</div>';
        return;
    }

    container.innerHTML = clients.map((client) => `
        <article class="appointment-card client-card ${client.activo === false ? "client-inactive" : ""}" data-client-id="${client.id}">
            <div class="client-avatar"><i class="fa-solid fa-user"></i></div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(client.nombre)}</div>
                <div class="appointment-service-name">
                    ${client.telefono ? `<span><i class="fa-solid fa-phone"></i> ${escapeHtml(client.telefono)}</span>` : ""}
                    ${client.email ? `<span><i class="fa-solid fa-envelope"></i> ${escapeHtml(client.email)}</span>` : ""}
                    ${client.notas ? `<span><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(client.notas)}</span>` : ""}
                </div>
            </div>
            <div class="card-actions-col client-actions-col">
                <button type="button" class="btn-view-detail client-details-btn" title="Ver información del cliente" aria-label="Ver información del cliente" data-client-id="${client.id}">
                    <i class="fa-solid fa-eye"></i>
                </button>
                ${state.currentUser?.rol === "admin" ? `<button type="button" class="btn-delete-card client-status-btn" title="${client.activo === false ? "Dar de alta" : "Dar de baja"}" aria-label="${client.activo === false ? "Dar de alta" : "Dar de baja"}" data-client-id="${client.id}"><i class="fa-solid ${client.activo === false ? "fa-user-check" : "fa-user-slash"}"></i></button>` : ""}
            </div>
        </article>
    `).join("");

    container.querySelectorAll(".client-details-btn").forEach((button) => {
        button.addEventListener("click", () => openClientDetail(button.dataset.clientId));
    });
    container.querySelectorAll(".client-status-btn").forEach((button) => {
        button.addEventListener("click", () => toggleClientStatus(button.dataset.clientId));
    });
}

async function toggleClientStatus(clientId) {
    if (state.currentUser?.rol !== "admin") return;
    const client = (state.clientsList || []).find((item) => item.id === clientId);
    if (!client) return;
    const action = client.activo === false ? "dar de alta" : "dar de baja";
    const confirmed = await showGenericConfirmModal("Confirmar acción", `¿Querés ${action} a ${client.nombre}?`);
    if (!confirmed) return;
    showLoader(true, `${action[0].toUpperCase()}${action.slice(1)} cliente...`);
    try {
        const { error } = await supabase.from("clientes").update({ activo: client.activo === false }).eq("id", clientId);
        if (error) throw error;
        showToast(`Cliente ${client.activo === false ? "dado de alta" : "dado de baja"}.`, "success");
        await loadClients();
    } catch (error) {
        console.error("Error al actualizar estado del cliente:", error);
        showToast("No se pudo actualizar el estado del cliente.", "error");
    } finally {
        showLoader(false);
    }
}

let selectedClient = null;
let clientUpdateBusy = false;

async function openClientDetail(clientId) {
    selectedClient = (state.clientsList || []).find((client) => client.id === clientId);
    if (!selectedClient) return;
    document.getElementById("client-detail-title").textContent = selectedClient.nombre;
    document.getElementById("detail-client-name").value = selectedClient.nombre || "";
    document.getElementById("detail-client-phone").value = selectedClient.telefono || "";
    document.getElementById("detail-client-email").value = selectedClient.email || "";
    document.getElementById("detail-client-notes").value = selectedClient.notas || "";
    setClientEditing(false);
    document.getElementById("client-detail-modal").classList.remove("hidden");
    document.getElementById("client-detail-history").innerHTML = "";
    document.getElementById("client-history-status").textContent = "Cargando...";

    try {
        const { data, error } = await supabase
            .from("turnos")
            .select("id, legacy_id, fecha, hora_inicio, servicio, estado, precio")
            .eq("cliente_id", clientId)
            .order("hora_inicio", { ascending: false });
        if (error) throw error;
        if (!data?.length) {
            document.getElementById("client-detail-history").innerHTML = '<span class="subtle-text">Todavía no hay turnos registrados.</span>';
            document.getElementById("client-history-status").textContent = "0 turnos";
            return;
        }
        document.getElementById("client-detail-history").innerHTML = data.map((appointment) => `
            <div class="client-history-item">
                <span><strong>${escapeHtml(appointment.servicio || "Turno")}</strong><br>${escapeHtml(formatClientDate(appointment.hora_inicio || appointment.fecha))}</span>
                <span>${escapeHtml(appointment.estado || "Provisional")}<br><strong>$${(Number(appointment.precio) || 0).toLocaleString("es-AR")}</strong></span>
            </div>
        `).join("");
        document.getElementById("client-history-status").textContent = `${data.length} turno${data.length === 1 ? "" : "s"}`;
    } catch (error) {
        console.error("Error al cargar historial de cliente:", error);
        document.getElementById("client-detail-history").innerHTML = '<span class="subtle-text">No se pudo cargar el historial.</span>';
        document.getElementById("client-history-status").textContent = "Error";
    }
}

function setClientEditing(editing) {
    const fields = document.getElementById("client-detail-fields");
    fields.disabled = !editing;
    document.getElementById("client-edit-btn").classList.toggle("hidden", editing);
    document.getElementById("client-cancel-btn").classList.toggle("hidden", !editing);
    document.getElementById("client-save-btn").classList.toggle("hidden", !editing);
}

function setAccountEditing(editing) {
    const form = document.getElementById("account-form");
    const editableFields = form?.querySelectorAll("#account-name, #account-email");
    editableFields?.forEach((field) => { field.readOnly = !editing; });
    
    const editBtn = document.getElementById("account-edit-btn");
    const actionsContainer = document.getElementById("account-actions-container");
    if (editBtn) editBtn.classList.toggle("hidden", editing);
    if (actionsContainer) actionsContainer.classList.toggle("hidden", !editing);
    
    // Deshabilitar/habilitar el botón de actualizar contraseña para asegurar exclusión mutua
    const showPasswordBtn = document.getElementById("show-change-password-btn");
    if (showPasswordBtn) showPasswordBtn.disabled = editing;
    
    if (!editing) populateAccountForm();
}

function setAccountPasswordEditing(editing) {
    const currentPasswordInput = document.getElementById("account-current-password");
    const passwordInput = document.getElementById("account-password");
    const confirmPasswordInput = document.getElementById("account-confirm-password");
    const passwordForm = document.getElementById("account-password-form");
    const showPasswordBtn = document.getElementById("show-change-password-btn");
    
    if (passwordForm) passwordForm.classList.toggle("hidden", !editing);
    if (showPasswordBtn) showPasswordBtn.classList.toggle("hidden", editing);
    
    // Deshabilitar/habilitar el botón de editar perfil para asegurar exclusión mutua
    const profileEditBtn = document.getElementById("account-edit-btn");
    if (profileEditBtn) profileEditBtn.disabled = editing;
    
    if (!editing) {
        // Limpiar campos de contraseña al cancelar/guardar
        if (currentPasswordInput) {
            currentPasswordInput.value = "";
            currentPasswordInput.type = "password";
        }
        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.type = "password";
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.value = "";
            confirmPasswordInput.type = "password";
        }
        // Restablecer iconos de ojo
        document.querySelectorAll(".password-reveal-btn i").forEach(icon => {
            icon.className = "fa-solid fa-eye";
        });
    }
}

function closeClientDetail() {
    if (clientUpdateBusy) return;
    document.getElementById("client-detail-modal").classList.add("hidden");
    selectedClient = null;
}

function formatClientDate(value) {
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

async function handleClientUpdate(event) {
    event.preventDefault();
    if (clientUpdateBusy || !selectedClient || event.currentTarget.dataset.confirming === "true") return;
    const form = event.currentTarget;
    const clientId = selectedClient.id;
    const formData = new FormData(form);
    const name = String(formData.get("nombre") || "").trim();
    if (!name) {
        showToast("El nombre del cliente es obligatorio.", "error");
        return;
    }

    form.dataset.confirming = "true";
    const confirmed = await showGenericConfirmModal("Confirmar cambios", `Se actualizarán los datos de ${name}. ¿Confirmás?`);
    form.dataset.confirming = "false";
    if (!confirmed) return;

    clientUpdateBusy = true;
    form.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    showLoader(true, "Guardando datos del cliente...");

    try {
        const { error } = await supabase.from("clientes").update({
            nombre: name,
            telefono: String(formData.get("telefono") || "").trim() || null,
            email: String(formData.get("email") || "").trim().toLowerCase() || null,
            notas: String(formData.get("notas") || "").trim() || null
        }).eq("id", clientId);
        if (error) throw error;
        showToast("Datos del cliente actualizados.", "success");
        await loadClients();
        updateClientAutocomplete();
        clientUpdateBusy = false;
        closeClientDetail();
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        showToast("No se pudieron actualizar los datos del cliente.", "error");
    } finally {
        form.dataset.confirming = "false";
        clientUpdateBusy = false;
        form.querySelectorAll("input, button").forEach((element) => { element.disabled = false; });
        showLoader(false);
    }
}

async function handleClientSubmit(event) {
    event.preventDefault();
    if (!supabase || !state.currentUser?.authId) {
        showToast("La sección Clientes requiere Supabase.", "error");
        return;
    }

    const nameInput = document.getElementById("client-record-name");
    const name = nameInput.value.trim();
    const phone = document.getElementById("client-record-phone").value.trim();
    const email = document.getElementById("client-record-email").value.trim().toLowerCase();
    const notes = document.getElementById("client-record-notes").value.trim();

    if (!name) {
        showToast("Ingresá el nombre de la clienta.", "error");
        nameInput.focus();
        return;
    }

    try {
        const { error } = await supabase.from("clientes").insert({
            nombre: name,
            telefono: phone || null,
            email: email || null,
            notas: notes || null
        });
        if (error) {
            if (error.code === "23505") throw new Error("Ya existe una clienta con ese nombre.");
            throw error;
        }

        event.currentTarget.reset();
        showToast("Cliente agregado correctamente.", "success");
        await loadClients();
        updateClientAutocomplete();
    } catch (error) {
        console.error("Error al agregar cliente:", error);
        showToast(error.message || "No se pudo agregar el cliente.", "error");
    }
}

function updateCajasTabVisibility() {
    const cajasBtn = document.getElementById("nav-btn-cajas");
    const chkCajasTab = document.getElementById("chk-allow-cajas-tab");
    const isAdmin = state.currentUser && state.currentUser.rol === "admin";
    const shouldShowCajasTab = isAdmin && state.allowCajasTab;

    if (chkCajasTab) {
        chkCajasTab.checked = !!state.allowCajasTab;
    }

    if (cajasBtn) {
        cajasBtn.classList.toggle("hidden", !shouldShowCajasTab);
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
    populateAccountForm();
}

function populateAccountForm() {
    const nameInput = document.getElementById("account-name");
    const emailInput = document.getElementById("account-email");
    const currentPasswordInput = document.getElementById("account-current-password");
    const passwordInput = document.getElementById("account-password");
    if (nameInput) nameInput.value = state.currentUser?.nombre || "";
    if (emailInput) emailInput.value = state.currentUser?.email || "";
    if (currentPasswordInput) currentPasswordInput.value = "";
    if (passwordInput) passwordInput.value = "";
}

async function handleAccountSubmit(event) {
    if (event) event.preventDefault();

    if (!state.currentUser) {
        showToast("Iniciá sesión para actualizar tus datos.", "error");
        return;
    }

    if (!supabase || !state.currentUser.authId) {
        showToast("La actualización de datos requiere una cuenta de Supabase.", "error");
        return;
    }

    const name = document.getElementById("account-name").value.trim();
    const email = document.getElementById("account-email").value.trim().toLowerCase();
    const currentEmail = (state.currentUser.email || "").trim().toLowerCase();
    const emailChanged = email !== currentEmail;

    if (!name || !email) {
        showToast("Completá tu nombre y email.", "error");
        return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast("Ingresá un formato de email válido.", "error");
        return;
    }

    const confirmed = await showGenericConfirmModal(
        "Confirmar cambios",
        emailChanged
            ? "Se modificará tu correo electrónico. Deberás verificar la nueva dirección para iniciar sesión. ¿Confirmás los cambios?"
            : "¿Confirmás los cambios en tu perfil?"
    );
    if (!confirmed) return;

    showLoader(true, "Actualizando tus datos...");

    try {
        const { error: profileError } = await supabase
            .from("perfiles")
            .update({ nombre: name })
            .eq("id", state.currentUser.authId);
        if (profileError) throw profileError;

        let accountEmail = currentEmail;
        if (emailChanged) {
            const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({ email });
            if (authError) throw authError;

            accountEmail = updatedAuth.user?.email || currentEmail;
            if (accountEmail === email) {
                const { error: emailProfileError } = await supabase
                    .from("perfiles")
                    .update({ email })
                    .eq("id", state.currentUser.authId);
                if (emailProfileError) throw emailProfileError;
            }
        }

        state.currentUser = { ...state.currentUser, nombre: name, email: accountEmail };
        localStorage.setItem("evolet_session_v4", JSON.stringify(state.currentUser));
        document.getElementById("user-display-name").textContent = name;
        populateAccountForm();
        showToast(
            emailChanged && accountEmail !== email
                ? "Datos actualizados. Revisá tu email para confirmar la nueva dirección."
                : "Tus datos se actualizaron correctamente.",
            "success"
        );
        setAccountEditing(false);
    } catch (error) {
        console.error("Error al actualizar datos de cuenta:", error);
        showToast(error.message || "No se pudieron actualizar tus datos.", "error");
    } finally {
        showLoader(false);
    }
}

async function handlePasswordSubmit(event) {
    if (event) event.preventDefault();

    if (!state.currentUser) {
        showToast("Iniciá sesión para cambiar tu contraseña.", "error");
        return;
    }

    if (!supabase || !state.currentUser.authId) {
        showToast("La actualización de contraseña requiere una cuenta de Supabase.", "error");
        return;
    }

    const currentPassword = document.getElementById("account-current-password").value;
    const password = document.getElementById("account-password").value;
    const confirmPassword = document.getElementById("account-confirm-password").value;

    if (!currentPassword || !password || !confirmPassword) {
        showToast("Ingresá tu contraseña actual, la nueva contraseña y su confirmación.", "error");
        return;
    }

    if (password.length < 8) {
        showToast("La nueva contraseña debe tener al menos 8 caracteres.", "error");
        return;
    }

    if (password !== confirmPassword) {
        showToast("La nueva contraseña y su confirmación no coinciden.", "error");
        return;
    }

    const confirmed = await showGenericConfirmModal(
        "Confirmar cambio de contraseña",
        "Se modificará tu contraseña de acceso. ¿Confirmás el cambio?"
    );
    if (!confirmed) return;

    showLoader(true, "Cambiando contraseña...");

    try {
        const currentEmail = (state.currentUser.email || "").trim().toLowerCase();
        const { data: reauthenticated, error: reauthError } = await supabase.auth.signInWithPassword({
            email: currentEmail,
            password: currentPassword
        });
        if (reauthError || !reauthenticated.user) {
            throw new Error("La contraseña actual no es correcta. No se modificó la contraseña.");
        }

        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;

        showToast("Tu contraseña se actualizó correctamente.", "success");
        setAccountPasswordEditing(false);
    } catch (error) {
        console.error("Error al cambiar la contraseña:", error);
        showToast(error.message || "No se pudo cambiar la contraseña.", "error");
    } finally {
        showLoader(false);
    }
}

function switchTab(tabId) {
    if (state.isEditingPrices && tabId !== "precios") {
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
    } else if (tabId === "clientes") {
        loadClients();
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
    } else if (tabId === "precios") {
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

    try {
        const supabaseUser = await signInWithSupabase(email, password);
        if (supabaseUser) {
            state.currentUser = supabaseUser;
            localStorage.setItem("evolet_session_v4", JSON.stringify(state.currentUser));
            document.getElementById("user-display-name").textContent = state.currentUser.nombre;
            showToast(`¡Bienvenida de vuelta, ${state.currentUser.nombre}!`, "success");
            showAppScreen();
            loadServicesData();
            loadPricesFromCloud();
            loadExpenses();
            loadCajaMovements();
            loadClients();
            loadAppointments();
            checkAdminAccess();
            return;
        }

        if (!CONFIG_SHEET_URL) {
            showToast("No se pudo iniciar sesión con Supabase. Verifica tus credenciales.", "error");
            return;
        }

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
            loadClients();
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

    const pricesNavButton = document.getElementById("nav-btn-config");
    if (pricesNavButton) pricesNavButton.classList.add("hidden");

    // Ocultar accesos administrativos al cerrar sesión
    const accountMenu = document.getElementById("account-menu");
    const accountMenuButton = document.getElementById("btn-header-menu");
    if (accountMenu) accountMenu.classList.add("hidden");
    if (accountMenuButton) accountMenuButton.setAttribute("aria-expanded", "false");

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

    // Descontar solo una seña pendiente y efectivamente pagada.
    let senaAmount = 0;
    if (state.linkedAppointment && state.linkedAppointment.cliente === clientName) {
        const pendingSena = state.servicesList.find(s => s && s.servicio &&
            s.servicio.toString().toLowerCase().includes('seña') &&
            s.cliente === clientName &&
            (s.usuario ? s.usuario.toString().toLowerCase() : '') === (state.currentUser ? state.currentUser.email.toString().toLowerCase() : '') &&
            (s.metodoPago ? s.metodoPago.toString().toLowerCase() : '') !== 'fiado' &&
            (!s.completado || (s.completado.toString().toLowerCase() !== 'sí' && s.completado.toString().toLowerCase() !== 'si'))
        );
        if (pendingSena) {
            senaAmount = Number(pendingSena.precio) || 0;
        }
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
    if (serviceRegistrationBusy) return;
    document.getElementById("confirm-modal").classList.add("hidden");
    state.pendingTransaction = null;
    showToast("Registro cancelado", "info");
}

async function confirmServiceRegistration() {
    if (serviceRegistrationBusy) return;
    serviceRegistrationBusy = true;
    document.getElementById("modal-btn-confirm").disabled = true;
    document.getElementById("modal-btn-cancel").disabled = true;
    document.getElementById("confirm-modal").classList.add("hidden");

    if (!state.pendingTransaction) {
        serviceRegistrationBusy = false;
        document.getElementById("modal-btn-confirm").disabled = false;
        document.getElementById("modal-btn-cancel").disabled = false;
        return;
    }

    const transaction = state.pendingTransaction;
    state.pendingTransaction = null;

    showLoader(true, "Registrando servicio en la nube...");

    try {
        // Si estamos cobrando un turno vinculado, intentar actualizar una seña existente
        if (state.linkedAppointment) {
            const apt = state.linkedAppointment;
            // Buscar servicio tipo 'Seña' no completado para este cliente/usuario
            const senaCandidate = state.servicesList.find(s => s && s.servicio && s.servicio.toString().toLowerCase().includes('seña') &&
                s.cliente === transaction.cliente &&
                (s.usuario ? s.usuario.toString().toLowerCase() : '') === (state.currentUser ? state.currentUser.email.toString().toLowerCase() : '') &&
                (s.metodoPago ? s.metodoPago.toString().toLowerCase() : '') !== 'fiado' &&
                (!s.completado || s.completado.toString().toLowerCase() !== 'sí' && s.completado.toString().toLowerCase() !== 'si')
            );

            if (senaCandidate) {
                // Actualizar la fila de servicio existente en lugar de crear una nueva
                const editPayload = {
                    action: 'edit_service',
                    id: senaCandidate.id,
                    servicio: transaction.servicio,
                    precio: transaction.precio,
                    seña: transaction.seña,
                    metodoPago: transaction.metodoPago || senaCandidate.metodoPago,
                    completado: 'Sí'
                };

                const respData = supabase && state.currentUser.authId
                    ? { success: !!(await updateServiceRecord(senaCandidate.id, {
                        servicio: transaction.servicio,
                        precio: transaction.precio,
                        sena: transaction.seña,
                        metodo_pago: transaction.metodoPago.toLowerCase(),
                        completado: true
                    })) }
                    : await apiPost(CONFIG_SHEET_URL, editPayload, { showLoading: true, loadingText: 'Actualizando servicio...', swallowError: true });

                if (respData && respData.success) {
                    // Actualizar cache local del servicio editado
                    const idx = state.servicesList.findIndex(x => x.id === senaCandidate.id);
                    if (idx !== -1) {
                        state.servicesList[idx].precio = transaction.precio;
                        state.servicesList[idx].servicio = transaction.servicio;
                        state.servicesList[idx].seña = transaction.seña;
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
                        const updateData = supabase && state.currentUser.authId
                            ? await updateAppointmentInSupabase(aptId, { estado: 'completado', precio: transaction.precio })
                            : await apiPost(CONFIG_SHEET_URL, {
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
        const data = supabase && state.currentUser.authId && !CONFIG_SHEET_URL
            ? await registerServiceDirectly(transaction)
            : await apiPost(CONFIG_SHEET_URL, { action: "add_service", ...transaction }, { showLoading: true, loadingText: 'Registrando servicio...' });

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
                    const updateData = supabase && state.currentUser.authId
                        ? await updateAppointmentInSupabase(aptId, { estado: 'completado', precio: transaction.precio })
                        : await apiPost(CONFIG_SHEET_URL, {
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
        serviceRegistrationBusy = false;
        document.getElementById("modal-btn-confirm").disabled = false;
        document.getElementById("modal-btn-cancel").disabled = false;
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

    document.getElementById("detail-metodo").textContent = (item.metodoPago || '').toLowerCase() === 'fiado' ? 'Pendiente de pago' : item.metodoPago;

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
            <div class="list-empty-state">
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

    try {
        let data;
        if (supabase && state.currentUser?.authId) {
            const { data: movements, error } = await supabase.from('movimientos_caja').select('id, legacy_id, fecha, tipo, monto, concepto, origen, destino, perfiles(email)').order('fecha', { ascending: false });
            if (error) throw error;
            data = { success: true, movements: movements.map(movement => ({
                id: movement.legacy_id || movement.id,
                fecha: movement.fecha,
                tipo: movement.tipo === 'retiro' ? 'extraccion' : movement.tipo,
                monto: movement.monto,
                concepto: movement.concepto,
                origen: movement.origen,
                destino: movement.destino,
                usuario: movement.perfiles?.email || state.currentUser.email
            })) };
        } else if (CONFIG_SHEET_URL) {
            data = await apiGet(`${CONFIG_SHEET_URL}?action=get_caja_movements`, { showLoading: true, loadingText: 'Cargando movimientos de caja...', swallowError: true });
        } else {
            return;
        }
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

    const confirmed = await showGenericConfirmModal(
        "Confirmar movimiento de caja",
        `Tipo: ${tipo === "deposito" ? "Depósito" : "Retiro"}\nImporte: $${monto.toLocaleString("es-AR")}\nFecha: ${fecha}\nConcepto: ${concepto}\nOrigen: ${movimiento.origen}\nDestino: ${movimiento.destino}\n\n¿Confirmas registrar este movimiento?`
    );
    if (!confirmed) return;

    try {
        let data;
        if (supabase && state.currentUser.authId) {
            const { data: movement, error } = await supabase.from('movimientos_caja').insert({
                legacy_id: movimiento.id,
                usuario_id: state.currentUser.authId,
                fecha: movimiento.fecha,
                tipo: movimiento.tipo === 'extraccion' ? 'retiro' : movimiento.tipo,
                monto: movimiento.monto,
                concepto: movimiento.concepto,
                origen: movimiento.origen,
                destino: movimiento.destino
            }).select('id, legacy_id, fecha, tipo, monto, concepto, origen, destino').single();
            if (error) throw error;
            data = { success: true, movement: { ...movimiento, id: movement.legacy_id || movement.id } };
        } else {
            data = await apiPost(CONFIG_SHEET_URL, movimiento, { showLoading: true, loadingText: 'Registrando movimiento de caja...' });
        }

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

    const normalizedServices = state.servicesList.map(normalizeServiceRecord);
    const clientsWithFinalServiceSena = new Set(
        normalizedServices
            .filter(item => {
                const serviceName = (item.servicio || '').toString().toLowerCase();
                const completed = (item.completado || '').toString().toLowerCase();
                return !serviceName.includes('seña') &&
                    !serviceName.includes('sena') &&
                    Number(item.seña) > 0 &&
                    (completed === 'sí' || completed === 'si' || completed === 'yes' || completed === 'true');
            })
            .map(item => (item.cliente || '').toString().trim().toLowerCase())
    );

    // Sumar ingresos (servicios) desde la fecha de referencia por método de pago
    let periodEfectivoIncome = 0;
    let periodMpIncome = 0;

    normalizedServices.forEach(item => {
        if (item.fecha) {
            const itemDateStr = item.fecha.substring(0, 10);
            if (itemDateStr >= initialBalanceDate) {
                const precio = Number(item.precio) || 0;
                const seña = Number(item.seña) || 0;
                const neto = precio - seña;
                const paymentMethod = (item.metodoPago || '').toString().trim().toLowerCase();
                const serviceName = (item.servicio || '').toString().toLowerCase();
                const clientKey = (item.cliente || '').toString().trim().toLowerCase();
                const isDuplicateSena = (serviceName.includes('seña') || serviceName.includes('sena')) &&
                    clientsWithFinalServiceSena.has(clientKey);

                if (!isDuplicateSena && paymentMethod === "efectivo") {
                    periodEfectivoIncome += neto;
                } else if (!isDuplicateSena && paymentMethod === "transferencia") {
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
    let totalMonthFiado = 0;
    let totalWeekIncome = 0;
    let totalWeekExpenses = 0;
    let servicesCountMonth = 0;
    const categoryIncomeSums = {
        "Semi": 0,
        "Kapping": 0,
        "Softgel": 0,
        "Esculpidas": 0,
        "Personalizado": 0,
        "Retiro": 0,
        "Otro": 0
    };

    const incomeCategory = (service, category) => {
        const normalized = (service || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalized.includes("semi")) return "Semi";
        if (normalized.includes("kapping")) return "Kapping";
        if (normalized.includes("softgel") || normalized.includes("soft gel")) return "Softgel";
        if (normalized.includes("esculpid")) return "Esculpidas";
        if (normalized.includes("remoc") || normalized.includes("retiro")) return "Retiro";
        const fallback = (category || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (fallback.includes("semi")) return "Semi";
        if (fallback.includes("kapping")) return "Kapping";
        if (fallback.includes("softgel") || fallback.includes("soft gel")) return "Softgel";
        if (fallback.includes("esculpid")) return "Esculpidas";
        if (fallback.includes("personal") || fallback.includes("otro")) return "Personalizado";
        if (fallback.includes("remoc") || fallback.includes("retiro")) return "Retiro";
        return "Otro";
    };

    let cashSum = 0;
    let transfeSum = 0;

    const serviceCounts = {};

    normalizedServices.forEach(item => {
        const date = normalizeDateValue(item.fecha);
        const precio = Number(item.precio) || 0;
        const paymentMethod = (item.metodoPago || '').toString().trim().toLowerCase();
        const serviceName = (item.servicio || '').toString().toLowerCase();
        const clientKey = (item.cliente || '').toString().trim().toLowerCase();
        const isStandaloneSena = serviceName.includes('seña') || serviceName.includes('sena');
        const isDuplicateSena = isStandaloneSena && clientsWithFinalServiceSena.has(clientKey);

        const isThisMonth = date && date >= startDate && date <= endDate;
        const isThisWeek = date && date >= startOfWeek;

        if (isThisMonth) {
            if (paymentMethod === 'fiado') {
                totalMonthFiado += precio;
            } else if (!isDuplicateSena) {
                totalMonthIncome += precio;
                servicesCountMonth++;
                if (!isStandaloneSena) {
                    categoryIncomeSums[incomeCategory(item.servicio, item.categoria)] += precio;
                }

                serviceCounts[item.servicio] = (serviceCounts[item.servicio] || 0) + 1;

                if (paymentMethod === "efectivo") cashSum += precio;
                else if (paymentMethod === "transferencia") transfeSum += precio;
            }
        }

        if (isThisWeek && paymentMethod !== 'fiado' && !isDuplicateSena) {
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
        if (date && date >= startOfWeek) {
            totalWeekExpenses += Number(item.monto) || 0;
        }
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
    const fiadoEl = document.getElementById("stat-month-fiado");
    if (fiadoEl) fiadoEl.textContent = `$${totalMonthFiado.toLocaleString("es-AR")}`;
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
    const weekExpensesEl = document.getElementById("stat-week-expenses");
    if (weekExpensesEl) weekExpensesEl.textContent = `$${totalWeekExpenses.toLocaleString("es-AR")}`;
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

        sortedCats.forEach(cat => {
            const pct = totalMonthExpenses > 0 ? Math.round((cat.sum / totalMonthExpenses) * 100) : 0;

            const row = document.createElement("div");
            row.className = "payment-stat-row";
            row.innerHTML = `
                <div class="payment-stat-label">${cat.name}</div>
                <div class="payment-progress-bar">
                    <div class="progress" style="width: ${pct}%"></div>
                </div>
                <div class="payment-stat-val">$${cat.sum.toLocaleString("es-AR")} (${pct}%)</div>
            `;
            catStatsContainer.appendChild(row);
        });
    }

    const incomeStatsContainer = document.getElementById("category-income-stats");
    if (incomeStatsContainer) {
        incomeStatsContainer.innerHTML = "";
        Object.entries(categoryIncomeSums)
            .map(([name, sum]) => ({ name, sum }))
            .sort((a, b) => b.sum - a.sum)
            .forEach(category => {
                const pct = totalMonthIncome > 0 ? Math.round((category.sum / totalMonthIncome) * 100) : 0;
                const row = document.createElement("div");
                row.className = "payment-stat-row";
                row.innerHTML = `
                    <div class="payment-stat-label">${category.name}</div>
                    <div class="payment-progress-bar">
                        <div class="progress income-progress" style="width: ${pct}%"></div>
                    </div>
                    <div class="payment-stat-val">$${category.sum.toLocaleString("es-AR")} (${pct}%)</div>
                `;
                incomeStatsContainer.appendChild(row);
            });
    }

    renderPopularServices(serviceCounts);
    renderDebtorsList();
    renderCajaMovementsList();
}

// Renderizar el listado dinámico de pagos pendientes
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

let pendingDebtCollection = null;
let debtCollectionBusy = false;

function collectDebt(debt) {
    pendingDebtCollection = debt;
    document.getElementById("collect-debt-client").textContent = debt.cliente;
    document.getElementById("collect-debt-service").textContent = debt.servicio;
    document.getElementById("collect-debt-amount").textContent = `$${Number(debt.precio).toLocaleString("es-AR")}`;
    document.querySelector('input[name="collect-debt-payment"][value="Efectivo"]').checked = true;
    document.getElementById("collect-debt-modal").classList.remove("hidden");
}

function closeCollectDebtModal() {
    if (debtCollectionBusy) return;
    pendingDebtCollection = null;
    document.getElementById("collect-debt-modal").classList.add("hidden");
}

async function confirmDebtCollection() {
    if (!pendingDebtCollection || debtCollectionBusy) return;

    debtCollectionBusy = true;
    document.getElementById("collect-debt-btn-confirm").disabled = true;
    document.getElementById("collect-debt-btn-cancel").disabled = true;
    const debt = pendingDebtCollection;
    const metodo = document.querySelector('input[name="collect-debt-payment"]:checked').value;
    document.getElementById("collect-debt-modal").classList.add("hidden");

    try {
        const data = supabase && state.currentUser.authId && !CONFIG_SHEET_URL
            ? { success: !!(await updateServiceRecord(debt.id, { metodo_pago: metodo.toLowerCase(), fecha: new Date().toISOString() })) }
            : await apiPost(CONFIG_SHEET_URL, { action: "edit_service", id: debt.id, metodoPago: metodo, fecha: new Date().toISOString() }, { showLoading: true, loadingText: 'Registrando pago de deuda...' });
        if (data && data.success) {
            showToast("¡Pago pendiente cobrado e ingresado a la caja correctamente!", "success");

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
        debtCollectionBusy = false;
        document.getElementById("collect-debt-btn-confirm").disabled = false;
        document.getElementById("collect-debt-btn-cancel").disabled = false;
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
            loadExpenses();
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
    try {
        let data;
        if (supabase && state.currentUser?.authId) {
            const { data: prices, error } = await supabase.from('precios').select('categoria, nombre, precio').order('categoria').order('nombre');
            if (error) throw error;
            data = { success: true, prices: prices.map(price => ({ categoria: price.categoria, name: price.nombre, price: price.precio })) };
        } else if (CONFIG_SHEET_URL) {
            const url = `${CONFIG_SHEET_URL}?action=get_prices`;
            data = await apiGet(url, { showLoading: true, loadingText: 'Cargando precios...', swallowError: true });
        } else {
            return;
        }

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
        console.error("No se pudieron cargar los precios desde Supabase.", error);
    }
}

// Chequear acceso de administrador y ajustar visibilidad del botón de Ajustes e importación
function checkAdminAccess() {
    const pricesNavButton = document.getElementById("nav-btn-config");
    const syncBtn = document.getElementById("btn-sync-history");
    const isAdmin = state.currentUser && state.currentUser.rol === "admin";

    if (pricesNavButton) pricesNavButton.classList.toggle("hidden", !isAdmin);

    if (!isAdmin) {
        const activeTabBtn = document.querySelector(".nav-item.active");
        if (activeTabBtn && ["precios", "ajustes"].includes(activeTabBtn.getAttribute("data-tab"))) {
            switchTab("calendario");
        }
    }

    const settingsMenuItem = document.getElementById("menu-ajustes");
    if (settingsMenuItem) settingsMenuItem.classList.toggle("hidden", !isAdmin);

    if (syncBtn) {
        syncBtn.classList.add("hidden");
    }

    updateRegisterTabVisibility();
    updateCajasTabVisibility();
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

// Guardar precios modificados
async function savePricesToCloud() {
    if (!state.currentUser || state.currentUser.rol !== "admin") {
        showToast("No tienes permisos de administrador", "error");
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
        let data;
        if (supabase && state.currentUser.authId && !CONFIG_SHEET_URL) {
            const { error } = await supabase.from('precios').upsert(updatedPrices.map(price => ({
                categoria: price.categoria,
                nombre: price.name,
                precio: price.price,
                actualizado_por: state.currentUser.authId
            })), { onConflict: 'categoria,nombre' });
            if (error) throw error;
            data = { success: true };
        } else {
            data = await apiPost(CONFIG_SHEET_URL, { action: "update_prices", email: state.currentUser.email, prices: updatedPrices }, { showLoading: true, loadingText: 'Guardando lista de precios...' });
        }

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

// Estado único del modal genérico de confirmación.
let genericConfirmState = null;
let serviceRegistrationBusy = false;

function setGenericConfirmBusy(isBusy) {
    const confirmButton = document.getElementById("generic-modal-btn-confirm");
    const cancelButton = document.getElementById("generic-modal-btn-cancel");
    if (confirmButton) confirmButton.disabled = isBusy;
    if (cancelButton) cancelButton.disabled = isBusy;
}

function closeGenericConfirmModal() {
    document.getElementById("generic-confirm-modal").classList.add("hidden");
    setGenericConfirmBusy(false);
    genericConfirmState = null;
}

function showGenericConfirmModal(title, subtitle, onConfirm = null) {
    const titleEl = document.getElementById("generic-modal-title");
    const subEl = document.getElementById("generic-modal-sub");

    if (titleEl) titleEl.innerHTML = `${title} <i class="fa-solid fa-circle-question" style="color: var(--barbie-pink);"></i>`;
    if (subEl) subEl.textContent = subtitle;

    const modal = document.getElementById("generic-confirm-modal");
    if (!modal) return Promise.resolve(false);

    if (genericConfirmState) {
        genericConfirmState.resolve(false);
    }

    setGenericConfirmBusy(false);
    return new Promise((resolve) => {
        genericConfirmState = { resolve, onConfirm, busy: false };
        modal.classList.remove("hidden");
    });
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
            <div class="no-appointments-placeholder empty-schedule-state" style="cursor: pointer;" id="btn-empty-schedule">
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
    const defaultSena = Number(apt && apt.precio) || 0;
    if (amt) amt.value = defaultSena > 0 ? String(defaultSena) : "2500";

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

    const amountInput = document.getElementById("sena-modal-amount");
    if (!amountInput) {
        showToast("No se pudo cargar la información de la seña del turno.", "error");
        return;
    }

    const apt = currentSenaAppointment;
    const sena = Number(amountInput.value) || 0;
    const paymentInput = document.querySelector('input[name="sena-modal-payment"]:checked');
    const metodo = paymentInput ? paymentInput.value : "Transferencia";

    if (sena < 0) {
        showToast("Ingresá un monto de seña válido para confirmar el turno.", "error");
        amountInput.focus();
        amountInput.select();
        return;
    }

    if (sena > 0 && sena < 1000) {
        window.alert('La seña debe ser 0 o mayor a 1000. Revisá el monto ingresado antes de guardar.');
        amountInput.focus();
        amountInput.select();
        return;
    }

    const confirmed = await showGenericConfirmModal(
        "Confirmar reserva",
        `Clienta: ${apt.cliente}\nTurno: ${apt.fecha || "-"}\nSeña: $${sena.toLocaleString("es-AR")}\nMétodo de pago: ${metodo}\n\n¿Confirmas cambiar el turno a Reservado y registrar la seña?`
    );
    if (!confirmed) return;

    const newStatus = "Reservado";

    closeSenaModal();
    showLoader(true, "Actualizando turno en la nube...");

    try {
        const data = supabase && state.currentUser.authId
            ? await updateAppointmentInSupabase(apt.id, { estado: newStatus.toLowerCase(), precio: sena })
            : await apiPost(CONFIG_SHEET_URL, { action: "edit_appointment", id: apt.id, cliente: apt.cliente, fecha: apt.fecha, estado: newStatus, precio: sena }, { showLoading: false, swallowError: true });
        if (data && data.success) {
            apt.estado = newStatus;
            apt.precio = sena;
            state.appointmentsList = normalizeAppointmentList(state.appointmentsList);

            const calendarSync = await syncAppointmentWithGoogleCalendar('update', {
                ...apt,
                eventId: apt.eventId || apt.event_id || null,
                id: apt.id
            });
            if (!calendarSync.success && calendarSync.warning) {
                showToast("Turno guardado en Supabase; la sincronización con Google Calendar falló.", "warning");
            }

            await registerServiceDirectly({
                id: "serv_" + new Date().getTime(),
                fecha: new Date().toISOString(),
                usuario: state.currentUser ? state.currentUser.email : "Evolet",
                cliente: apt.cliente,
                servicio: "Seña",
                categoria: "Otro",
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

    const confirmed = await showGenericConfirmModal(
        "Confirmar reagendamiento",
        `Clienta: ${apt.cliente}\nFecha actual: ${apt.fecha || "-"}\nNueva fecha: ${newDate}\nNueva hora: ${newTime}\n\n¿Confirmas modificar este turno?`
    );
    if (!confirmed) return;

    closeRescheduleModal();
    showLoader(true, "Reagendando turno en la nube y Google Calendar...");

    try {
        const data = supabase && state.currentUser.authId
            ? await updateAppointmentInSupabase(apt.id, { fecha: newDate, hora_inicio: startDate.toISOString(), hora_fin: endIso })
            : await apiPost(CONFIG_SHEET_URL, { action: "edit_appointment", id: apt.id, fecha: newDate, horaInicio: startDate.toISOString(), horaFin: endIso }, { showLoading: false, swallowError: true });
        if (data && data.success) {
            apt.fecha = newDate;
            apt.horaInicio = startDate.toISOString();
            apt.horaFin = endIso;

            const calendarSync = await syncAppointmentWithGoogleCalendar('update', {
                ...apt,
                eventId: apt.eventId || apt.event_id || null,
                id: apt.id,
                fecha: newDate,
                horaInicio: startDate.toISOString(),
                horaFin: endIso
            });
            if (!calendarSync.success && calendarSync.warning) {
                showToast("Turno guardado en Supabase; no pudo actualizarse en Google Calendar.", "warning");
            }

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

    if (!supabase || !state.currentUser.authId) {
        showToast("Para agendar un turno necesitás una clienta registrada en Supabase.", "error");
        return;
    }

    const { data: registeredClient, error: clientLookupError } = await supabase
        .from("clientes")
        .select("id, nombre, activo")
        .eq("nombre_normalizado", cliente.toLowerCase())
        .maybeSingle();
    if (clientLookupError) {
        console.error("Error validando cliente del turno:", clientLookupError);
        showToast("No se pudo validar la clienta. Intentá nuevamente.", "error");
        return;
    }
    if (!registeredClient || registeredClient.activo === false) {
        document.getElementById("schedule-new-client-panel")?.classList.remove("hidden");
        showToast("Elegí una clienta activa o registrá esta clienta para continuar.", "error");
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

    const scheduleModal = document.getElementById("schedule-modal");
    if (scheduleModal) scheduleModal.classList.add("hidden");

    const confirmed = await showGenericConfirmModal(
        "Confirmar turno",
        `Clienta: ${cliente}\nFecha: ${dateVal}\nHora: ${timeVal}\nEstado: ${statusVal}\nSeña: $${senaAmount.toLocaleString("es-AR")}\nMétodo de pago de seña: ${senaPaymentMethod}\n\n¿Confirmas agendar este turno?`
    );
    if (!confirmed) {
        if (scheduleModal) scheduleModal.classList.remove("hidden");
        return;
    }

    // Resetear formulario para siguientes llamadas
    document.getElementById("schedule-form").reset();
    document.getElementById("schedule-sena-fields").classList.add("hidden");
    showLoader(true, "Agendando turno y sincronizando con Google Calendar...");

    try {
        let data;

        if (supabase && state.currentUser.authId) {
            let { data: clientRecord, error: clientError } = await supabase
                .from('clientes')
                .select('id')
                .eq('nombre_normalizado', cliente.toLowerCase())
                .maybeSingle();

            if (clientError) throw clientError;

            if (!clientRecord) {
                const { data: newClient, error: newClientError } = await supabase
                    .from('clientes')
                    .insert({ nombre: cliente })
                    .select('id')
                    .single();
                if (newClientError) throw newClientError;
                clientRecord = newClient;
            }

            const { data: insertedAppointment, error: appointmentError } = await supabase
                .from('turnos')
                .insert({
                    legacy_id: appointmentData.id,
                    cliente_id: clientRecord.id,
                    usuario_id: state.currentUser.authId,
                    fecha: appointmentData.fecha,
                    hora_inicio: appointmentData.horaInicio,
                    hora_fin: appointmentData.horaFin,
                    servicio: appointmentData.servicio,
                    precio: appointmentData.precio,
                    estado: appointmentData.estado.toLowerCase(),
                    event_id: null
                })
                .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, clientes(nombre), perfiles(email)')
                .single();

            if (appointmentError) throw appointmentError;
            data = { success: true, appointment: {
                id: insertedAppointment.legacy_id || insertedAppointment.id,
                fecha: insertedAppointment.fecha,
                horaInicio: insertedAppointment.hora_inicio,
                horaFin: insertedAppointment.hora_fin,
                cliente,
                servicio: insertedAppointment.servicio,
                precio: insertedAppointment.precio,
                usuario: state.currentUser.email,
                estado: insertedAppointment.estado,
                eventId: insertedAppointment.event_id
            }};
        } else {
            data = await apiPost(CONFIG_SHEET_URL, appointmentData, { showLoading: true, loadingText: 'Agendando turno y sincronizando con Google Calendar...' });
        }

        if (data && data.success) {
            const normalizedAppointment = {
                ...(data.appointment || appointmentData),
                estado: statusVal,
                precio: statusVal === "Reservado" ? senaAmount : 0,
                id: appointmentData.id,
                eventId: data.appointment?.eventId || null
            };

            const calendarSync = await syncAppointmentWithGoogleCalendar('create', normalizedAppointment);
            if (!calendarSync.success && calendarSync.warning) {
                showToast("Turno guardado en Supabase; la sincronización con Google Calendar falló.", "warning");
            } else {
                showToast("¡Turno agendado y sincronizado con éxito!", "success");
            }

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
                    categoria: "Otro",
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
                const data = supabase && state.currentUser.authId && !CONFIG_SHEET_URL
                    ? await deleteAppointmentInSupabase(id)
                    : await apiPost(CONFIG_SHEET_URL, { action: "delete_appointment", id: id, email: state.currentUser.email }, { showLoading: true, loadingText: 'Cancelando turno...' });

                if (data && data.success) {
                    const existingAppointment = state.appointmentsList.find(apt => apt.id === id) || {};
                    const calendarSync = await syncAppointmentWithGoogleCalendar('delete', {
                        id,
                        eventId: existingAppointment.eventId || existingAppointment.event_id || null,
                        cliente: existingAppointment.cliente || clientName
                    });

                    if (!calendarSync.success && calendarSync.warning) {
                        showToast("Turno eliminado de Supabase; la eliminación del evento en Google Calendar falló.", "warning");
                    } else {
                        showToast("Turno cancelado correctamente.", "success");
                    }

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

    try {
        let data;
        if (supabase && state.currentUser?.authId) {
            const { data: expenses, error } = await supabase.from('gastos').select('id, legacy_id, fecha, concepto, monto, metodo_pago, categoria, perfiles(email)').order('fecha', { ascending: false });
            if (error) throw error;
            data = { success: true, expenses: expenses.map(expense => ({
                id: expense.legacy_id || expense.id,
                fecha: expense.fecha,
                concepto: expense.concepto,
                monto: expense.monto,
                metodoPago: expense.metodo_pago,
                categoria: expense.categoria,
                usuario: expense.perfiles?.email || state.currentUser.email
            })) };
        } else if (CONFIG_SHEET_URL) {
            data = await apiGet(`${CONFIG_SHEET_URL}?action=get_expenses`, { showLoading: true, loadingText: 'Cargando gastos...', swallowError: true });
        } else {
            return;
        }

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

// Renderizar el listado completo de gastos
function renderExpensesList() {
    const container = document.getElementById("expenses-list");
    if (!container) return;

    container.innerHTML = "";

    const now = new Date();
    const activePeriod = document.querySelector("[data-expense-period].active");
    const activeCategory = document.querySelector("[data-expense-category].active");
    const period = activePeriod?.dataset.expensePeriod || "todos";
    const category = activeCategory?.dataset.expenseCategory || "todos";
    const search = document.getElementById("expenses-search")?.value.trim().toLowerCase() || "";
    const expenses = state.expensesList.filter((item) => {
        const date = normalizeDateValue(item.fecha);
        const searchable = `${item.concepto || ""} ${item.categoria || ""} ${item.metodoPago || ""}`.toLowerCase();
        if (search && !searchable.includes(search)) return false;
        if (category !== "todos" && (item.categoria || "").toLowerCase() !== category) return false;
        if (period === "hoy" && (!date || date.toDateString() !== now.toDateString())) return false;
        if (period === "semana") {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            if (!date || date < weekAgo) return false;
        }
        if (period === "mes" && (!date || date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false;
        return true;
    });

    expenses.sort((a, b) => {
        const dateA = normalizeDateValue(a.fecha);
        const dateB = normalizeDateValue(b.fecha);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });



    if (expenses.length === 0) {
        container.innerHTML = `
            <div class="list-empty-state">
                <i class="fa-solid fa-receipt" style="font-size: 20px; color: var(--text-light); margin-bottom: 5px; display: block;"></i>
                No hay gastos que coincidan con los filtros
            </div>
        `;
        return;
    }

    expenses.forEach(exp => {

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

    const confirmed = await showGenericConfirmModal(
        "Confirmar gasto",
        `Concepto: ${concepto}\nImporte: $${monto.toLocaleString("es-AR")}\nFecha: ${fecha}\nCategoría: ${categoria}\nMétodo de pago: ${metodoPago}\n\n¿Confirmas registrar este gasto?`
    );
    if (!confirmed) return;

    try {
        let data;
        if (supabase && state.currentUser.authId) {
            const { data: expense, error } = await supabase.from('gastos').insert({
                legacy_id: expenseData.id,
                usuario_id: state.currentUser.authId,
                fecha: expenseData.fecha,
                concepto: expenseData.concepto,
                monto: expenseData.monto,
                metodo_pago: expenseData.metodoPago.toLowerCase(),
                categoria: expenseData.categoria
            }).select('id, legacy_id, fecha, concepto, monto, metodo_pago, categoria').single();
            if (error) throw error;
            data = { success: true, expense: { ...expenseData, id: expense.legacy_id || expense.id, metodoPago: expense.metodo_pago, monto: expense.monto } };
        } else {
            data = await apiPost(CONFIG_SHEET_URL, expenseData, { showLoading: true, loadingText: 'Registrando gasto en la planilla...' });
        }

        if (data && data.success) {
            showToast("¡Gasto registrado con éxito!", "success");

            // Limpiar formulario y preparar la fecha del próximo registro
            const expenseForm = document.getElementById("expense-form");
            if (expenseForm) expenseForm.reset();
            const expenseDate = document.getElementById("expense-date");
            if (expenseDate) expenseDate.value = new Date().toISOString().split('T')[0];

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
                let data;
                if (supabase && state.currentUser.authId) {
                    const { error } = await supabase.from('gastos').delete().eq('legacy_id', id);
                    if (error) throw error;
                    data = { success: true };
                } else {
                    data = await apiPost(CONFIG_SHEET_URL, { action: "delete_expense", id: id }, { showLoading: true, loadingText: 'Eliminando gasto...' });
                }

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
