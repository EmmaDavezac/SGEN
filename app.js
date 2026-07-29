/**
 * =========================================================================
 *                  LÓGICA DE APLICACIÓN - EVOLET NAILS
 * =========================================================================
 * 
 * CONFIGURACIÓN DE LA NUBE:
 * Pega la URL del Web App de Google (Apps Script) entre las comillas simples de abajo.
 */
const CONFIG_SHEET_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SHEET_URL) || 'https://script.google.com/macros/s/AKfycbxZT_wSTPClKAN78_TYAEnxBUj_b7BWPmQz2pwiKm4dkff5CgH_96xOLuj30IFdc0uUVg/exec';

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

// Estado General de la Aplicación
const state = {
    currentUser: null,          // { email, nombre, token }
    servicesList: [],           // Transacciones registradas
    selectedCategory: "semi",   // Categoría activa
    selectedService: null,      // Servicio específico activo
    pendingTransaction: null,   // Transacción en espera de confirmación
    pendingDeleteId: null,      // ID de registro en espera de eliminación
    isEditingPrices: false,     // Control del modo edición de precios
    appointmentsList: [],       // Lista de turnos agendados en la nube
    expensesList: [],           // Lista de gastos registrados
    calendarDate: new Date(),   // Mes visible en el calendario
    selectedCalendarDay: new Date(), // Día seleccionado en el calendario
    selectedExternalRemoval: null, // Objeto de remoción externa seleccionada
    allowFiado: localStorage.getItem("evolet_allow_fiado") === "true" // Opción de cobro fiado
};

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
        checkAdminAccess(); // Verificar si es admin para la pestaña Ajustes
    } else {
        showLoginScreen();
    }

    // Renderizar categorías y servicios iniciales en el formulario
    renderCategories();
    selectCategory("semi");
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

    // Modal de Confirmación de Eliminación
    document.getElementById("delete-btn-confirm").addEventListener("click", confirmDeleteServiceRecord);
    document.getElementById("delete-btn-cancel").addEventListener("click", cancelDeleteServiceRecord);

    // Historial - Buscador y Filtros
    document.getElementById("history-search").addEventListener("input", filterHistory);
    document.getElementById("history-filter").addEventListener("change", filterHistory);

    // Modales de Seña y Reagendamiento de Turnos
    document.getElementById("sena-form").addEventListener("submit", handleSenaSubmit);
    document.getElementById("sena-modal-btn-cancel").addEventListener("click", closeSenaModal);
    document.getElementById("reschedule-form").addEventListener("submit", handleRescheduleSubmit);
    document.getElementById("reschedule-modal-btn-cancel").addEventListener("click", closeRescheduleModal);

    // Cancelar cobro de turno y volver a Agenda
    const cancelCheckoutBtn = document.getElementById("btn-cancel-checkout");
    if (cancelCheckoutBtn) {
        cancelCheckoutBtn.addEventListener("click", cancelCheckoutAndReturnToAgenda);
    }

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
    updateFiadoPaymentVisibility();

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

    // Sincronizar historial de servicios cobrados
    document.getElementById("btn-sync-history").addEventListener("click", () => {
        showGenericConfirmModal(
            "Importar Historial",
            "¿Deseas importar todos los servicios cobrados históricos de tu planilla como turnos en tu calendario? Se sincronizarán también en tu Google Calendar.",
            importHistoryServices
        );
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

    showLoader(true, "Verificando credenciales...");

    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "login",
                email: email,
                password: password
            })
        });

        const data = await response.json();
        showLoader(false);

        if (data.success) {
            state.currentUser = data.user;
            localStorage.setItem("evolet_session_v4", JSON.stringify(state.currentUser));
            document.getElementById("user-display-name").textContent = state.currentUser.nombre;
            showToast(`¡Bienvenida de vuelta, ${data.user.nombre}!`, "success");
            showAppScreen();
            loadServicesData();
            loadPricesFromCloud(); // Cargar precios dinámicos
            loadExpenses(); // Cargar gastos registrados
            checkAdminAccess(); // Chequear permisos
        } else {
            showToast(data.message || "Email o contraseña incorrectos", "error");
        }
    } catch (error) {
        showLoader(false);
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

    renderSubServicesGrid(catKey);
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
    
    if (state.selectedCategory === "personalizado") {
        return;
    }
    
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
    const price = Number(document.getElementById("service-price").value) || 0;

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

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

    // Guardar en espera y desplegar modal de confirmación
    state.pendingTransaction = transaction;

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
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "add_service",
                ...transaction
            })
        });

        const data = await response.json();
        showLoader(false);

        if (data.success) {
            const wasLinked = !!state.linkedAppointment;
            state.servicesList.unshift(data.service);
            saveServicesCache();
            updateClientAutocomplete(); // Recargar el autocompletado
            showToast("¡Servicio guardado con éxito!", "success");
            
            // Si el servicio estaba vinculado a un turno, eliminar el turno
            if (state.linkedAppointment) {
                const aptId = state.linkedAppointment.id;
                
                // Borrar el turno de forma silenciosa de la nube
                try {
                    await fetch(CONFIG_SHEET_URL, {
                        method: "POST",
                        mode: "cors",
                        headers: { "Content-Type": "text/plain" },
                        body: JSON.stringify({
                            action: "delete_appointment",
                            id: aptId,
                            email: state.currentUser.email
                        })
                    });
                    
                    // Remover de la lista local
                    state.appointmentsList = state.appointmentsList.filter(x => x.id !== aptId);
                    const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
                    localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
                    
                    renderCalendar();
                    renderDayAppointments();
                } catch (delErr) {
                    console.error("Error al remover el turno después de cobrar:", delErr);
                }
            }
            
            clearCheckoutState();
            renderHistoryList();
            calculateAndRenderStats();
            resetServiceForm();

            // Si fue un cobro de turno o la manicurista no es admin, regresar a la Agenda
            const isAdmin = state.currentUser && state.currentUser.rol === "admin";
            if (wasLinked || !isAdmin) {
                switchTab("calendario");
            }
        } else {
            showToast(data.message || "Error al registrar en Google Sheets", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al registrar servicio:", error);
        saveOfflineTransaction(transaction);
        showToast("Error de conexión. Se guardó localmente en tu iPhone y se subirá luego.", "warning");
        resetServiceForm();
    }
}

async function registerServiceDirectly(transaction) {
    if (!CONFIG_SHEET_URL) {
        showToast("Por favor configura la URL de tu Google Sheet en app.js para poder guardar.", "error");
        return null;
    }
    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "add_service",
                ...transaction
            })
        });
        const data = await response.json();
        if (data.success) {
            state.servicesList.unshift(data.service);
            saveServicesCache();
            updateClientAutocomplete();
            renderHistoryList();
            calculateAndRenderStats();
            return data.service;
        } else {
            console.error("Error al registrar servicio directamente en Sheets:", data.message);
        }
    } catch (err) {
        console.error("Error al registrar servicio directamente:", err);
    }
    return null;
}

function resetServiceForm() {
    clearCheckoutState();
    selectCategory(state.selectedCategory);
    document.querySelector(".app-content").scrollTop = 0;
}

// =========================================================================
//                  LECTURA Y SINCRONIZACIÓN DE DATOS
// =========================================================================
async function loadServicesData() {
    const cachedServices = localStorage.getItem(`evolet_services_v4_${state.currentUser.email}`);
    if (cachedServices) {
        state.servicesList = JSON.parse(cachedServices);
        renderHistoryList();
        calculateAndRenderStats();
        updateClientAutocomplete();
    }

    if (!CONFIG_SHEET_URL) {
        showToast("Por favor, configura la URL de tu Google Sheet en app.js para sincronizar.", "error");
        return;
    }

    try {
        const response = await fetch(`${CONFIG_SHEET_URL}?action=get_services&email=${encodeURIComponent(state.currentUser.email)}`);
        const data = await response.json();

        if (data.success) {
            state.servicesList = data.services;
            saveServicesCache();
            renderHistoryList();
            calculateAndRenderStats();
            updateClientAutocomplete();
            checkAndSyncOfflineTransactions();
        }
    } catch (error) {
        console.error("Error al cargar servicios de la nube:", error);
        showToast("Historial cargado localmente (sin conexión).");
    }
}

// Guarda la base de datos de manera local rápida
function saveServicesCache() {
    if (state.currentUser) {
        localStorage.setItem(`evolet_services_v4_${state.currentUser.email}`, JSON.stringify(state.servicesList));
    }
}

// =========================================================================
//                  AUTOCOMPLETAR CLIENTAS
// =========================================================================
function updateClientAutocomplete() {
    const datalist = document.getElementById("past-clients-list");
    if (!datalist) return;

    // Extraer nombres de clientas únicos del historial
    const uniqueClients = [...new Set(state.servicesList.map(item => item.cliente.trim()))]
        .filter(name => name.length > 0)
        .sort((a, b) => a.localeCompare(b));

    datalist.innerHTML = uniqueClients
        .map(clientName => `<option value="${escapeHtml(clientName)}">`)
        .join("");
}

// =========================================================================
//                  HISTORIAL Y FILTRADOS
// =========================================================================
function renderHistoryList() {
    const listElement = document.getElementById("history-list");
    listElement.innerHTML = "";

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
        const card = document.createElement("div");
        card.className = "history-card";

        const dateObj = new Date(item.fecha);
        const formattedDate = dateObj.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit' }) + " " +
            dateObj.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' });

        // Icono de Método de Pago (FontAwesome)
        const payIcons = {
            Transferencia: '<i class="fa-solid fa-mobile-screen-button"></i>',
            Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>'
        };
        const payIcon = payIcons[item.metodoPago] || '<i class="fa-solid fa-money-check-dollar"></i>';

        const totalFormatted = `$${Number(item.precio).toLocaleString("es-AR")}`;

        const isAdmin = state.currentUser && state.currentUser.rol === "admin";

        card.innerHTML = `
            <div class="card-details">
                <div class="card-client">${escapeHtml(item.cliente)}</div>
                <div class="card-service">${escapeHtml(item.servicio)}</div>
                <div class="card-meta">
                    <span><i class="fa-regular fa-calendar" style="color: var(--barbie-pink); margin-right: 3px;"></i>${formattedDate}</span>
                    <span class="pay-badge" title="Método de pago">${payIcon} ${item.metodoPago}</span>
                </div>
            </div>
            <div class="card-amount-box">
                <div class="card-price" style="font-size: 18px; color: var(--barbie-dark);">${totalFormatted}</div>
            </div>
            ${isAdmin ? `
            <button class="btn-delete-card" onclick="app.deleteServiceRecord('${item.id}')" title="Eliminar Registro">
                <i class="fa-solid fa-trash-can"></i>
            </button>
            ` : ''}
        `;

        listElement.appendChild(card);
    });
}

function getFilteredHistory() {
    const searchVal = document.getElementById("history-search").value.toLowerCase().trim();
    const filterVal = document.getElementById("history-filter").value;

    return state.servicesList.filter(item => {
        const matchesSearch = item.cliente.toLowerCase().includes(searchVal) ||
            item.servicio.toLowerCase().includes(searchVal);

        if (!matchesSearch) return false;

        if (filterVal === "todos") return true;

        const date = new Date(item.fecha);
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

function filterHistory() {
    renderHistoryList();
}

// Eliminar un registro (Usando el modal personalizado - Solo Administradores)
function deleteServiceRecord(id) {
    if (!state.currentUser || state.currentUser.rol !== "admin") {
        showToast("Solo los administradores pueden eliminar registros.", "error");
        return;
    }
    state.pendingDeleteId = id;
    document.getElementById("delete-modal").classList.remove("hidden");
}

function cancelDeleteServiceRecord() {
    document.getElementById("delete-modal").classList.add("hidden");
    state.pendingDeleteId = null;
    showToast("Eliminación cancelada", "info");
}

async function confirmDeleteServiceRecord() {
    const id = state.pendingDeleteId;
    document.getElementById("delete-modal").classList.add("hidden");

    if (!id) return;
    state.pendingDeleteId = null;

    if (!CONFIG_SHEET_URL) {
        state.servicesList = state.servicesList.filter(x => x.id !== id);
        saveServicesCache();
        renderHistoryList();
        calculateAndRenderStats();
        updateClientAutocomplete();
        showToast("Registro eliminado localmente.", "success");
        return;
    }

    showLoader(true, "Eliminando de la nube...");

    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "delete_service",
                id: id,
                email: state.currentUser.email
            })
        });

        const data = await response.json();
        showLoader(false);

        if (data.success) {
            state.servicesList = state.servicesList.filter(x => x.id !== id);
            saveServicesCache();
            renderHistoryList();
            calculateAndRenderStats();
            updateClientAutocomplete();
            showToast("Registro eliminado con éxito", "success");
        } else {
            showToast(data.message || "No se pudo eliminar el registro", "error");
        }
    } catch (error) {
        showLoader(false);
        console.error("Error al borrar:", error);
        showToast("Error de conexión al intentar borrar. Inténtalo más tarde.", "error");
    }
}

// =========================================================================
//                  CÁLCULOS Y ESTADÍSTICAS
// =========================================================================
function calculateAndRenderStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Obtener hoy local YYYY-MM-DD
    const localDate = new Date();
    const localY = localDate.getFullYear();
    const localM = String(localDate.getMonth() + 1).padStart(2, '0');
    const localD = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${localY}-${localM}-${localD}`;

    // Sumar ingresos (servicios) a partir de HOY por método de pago
    let todayEfectivoIncome = 0;
    let todayMpIncome = 0;

    state.servicesList.forEach(item => {
        if (item.fecha) {
            const itemDateStr = item.fecha.substring(0, 10);
            if (itemDateStr >= todayStr) {
                const precio = Number(item.precio) || 0;
                const seña = Number(item.seña) || 0;
                const neto = precio - seña;
                
                if (item.metodoPago === "Efectivo") {
                    todayEfectivoIncome += neto;
                } else if (item.metodoPago === "Transferencia") {
                    todayMpIncome += neto;
                }
            }
        }
    });

    // Sumar egresos (gastos) a partir de HOY por método de pago
    let todayEfectivoExpenses = 0;
    let todayMpExpenses = 0;

    state.expensesList.forEach(item => {
        if (item.fecha) {
            const itemDateStr = item.fecha.substring(0, 10);
            if (itemDateStr >= todayStr) {
                const monto = Number(item.monto) || 0;
                if (item.metodoPago === "Efectivo") {
                    todayEfectivoExpenses += monto;
                } else if (item.metodoPago === "Transferencia") {
                    todayMpExpenses += monto;
                }
            }
        }
    });

    // Saldos iniciales fijos (no modificables)
    const initialEfectivo = 20300.00;
    const initialMp = 67921.85;

    // Calcular montos actuales
    const currentEfectivo = initialEfectivo + todayEfectivoIncome - todayEfectivoExpenses;
    const currentMp = initialMp + todayMpIncome - todayMpExpenses;
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
        const date = new Date(item.fecha);
        const precio = Number(item.precio) || 0;

        const isThisMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        const isThisWeek = date >= startOfWeek;

        if (isThisMonth) {
            totalMonthIncome += precio;
            servicesCountMonth++;

            // Frecuencia de servicios
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
        const date = new Date(item.fecha + "T00:00:00");
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
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
        
        // Ordenar categorías de mayor a menor gasto
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
    
    showLoader(true, "Registrando pago de deuda en la nube...");
    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "edit_service",
                id: debt.id,
                metodoPago: metodo,
                fecha: new Date().toISOString()
            })
        });
        const data = await response.json();
        if (data.success) {
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
                const response = await fetch(CONFIG_SHEET_URL, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        "Content-Type": "text/plain"
                    },
                    body: JSON.stringify({
                        action: "add_service",
                        ...transaction
                    })
                });
                const data = await response.json();
                if (!data.success) {
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
                const response = await fetch(CONFIG_SHEET_URL, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        "Content-Type": "text/plain"
                    },
                    body: JSON.stringify({
                        action: "add_expense",
                        ...expenseData
                    })
                });
                const data = await response.json();
                if (!data.success) {
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

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "slideInToast 0.4s reverse forwards";
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function showLoader(show, text = "Cargando...") {
    const overlay = document.getElementById("loader-overlay");
    const textEl = overlay.querySelector("p");
    textEl.textContent = text;

    if (show) {
        overlay.classList.remove("hidden");
    } else {
        overlay.classList.add("hidden");
    }
}

window.app = {
    deleteServiceRecord
};

// Cargar catálogo de precios desde Google Sheets
async function loadPricesFromCloud() {
    if (!CONFIG_SHEET_URL) return;
    try {
        const response = await fetch(`${CONFIG_SHEET_URL}?action=get_prices`);
        const data = await response.json();

        if (data.success && data.prices && data.prices.length > 0) {
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
    const registrarBtn = document.getElementById("nav-btn-registrar");
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

    if (registrarBtn) {
        if (isAdmin) {
            registrarBtn.classList.remove("hidden");
        } else {
            registrarBtn.classList.add("hidden");
            const activeTabBtn = document.querySelector(".nav-item.active");
            if (activeTabBtn && activeTabBtn.getAttribute("data-tab") === "registrar" && !state.linkedAppointment) {
                switchTab("calendario");
            }
        }
    }
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

    showLoader(true, "Guardando lista de precios en la nube...");

    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "update_prices",
                email: state.currentUser.email,
                prices: updatedPrices
            })
        });

        const data = await response.json();
        showLoader(false);

        if (data.success) {
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

// =========================================================================
//                   GESTIÓN DE TURNOS Y CALENDARIO
// =========================================================================

// Cargar turnos de la nube
async function loadAppointments() {
    if (!state.currentUser) return;
    
    // Carga inicial del caché local (PWA Offline)
    const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        state.appointmentsList = JSON.parse(cached);
        // Si estamos en la pestaña calendario, re-renderizar
        const activeTab = document.querySelector(".nav-item.active");
        if (activeTab && activeTab.getAttribute("data-tab") === "calendario") {
            renderCalendar();
            renderDayAppointments();
        }
    }
    
    if (!CONFIG_SHEET_URL) return;
    
    try {
        const response = await fetch(`${CONFIG_SHEET_URL}?action=get_appointments`);
        const data = await response.json();
        
        if (data.success) {
            state.appointmentsList = data.appointments;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            
            // Re-renderizar si estamos en la pestaña del calendario
            const activeTab = document.querySelector(".nav-item.active");
            if (activeTab && activeTab.getAttribute("data-tab") === "calendario") {
                renderCalendar();
                renderDayAppointments();
            }
        }
    } catch (error) {
        console.warn("No se pudieron cargar los turnos de la nube, usando caché local.", error);
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
            const aptDate = new Date(apt.horaInicio);
            return aptDate.getFullYear() === year && aptDate.getMonth() === month && aptDate.getDate() === day;
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
        const aptDate = new Date(apt.horaInicio);
        return aptDate.getFullYear() === yyyy && aptDate.getMonth() === selDate.getMonth() && aptDate.getDate() === selDate.getDate();
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
        
        card.innerHTML = `
            <div class="appointment-time-col">
                <span class="appointment-time-start">${timeStr}</span>
            </div>
            <div class="appointment-info-col">
                <div class="appointment-client-name">${escapeHtml(apt.cliente)}</div>
                <div class="appointment-service-name">
                    <i class="fa-solid fa-sparkles" style="color: var(--barbie-pink); font-size: 9px;"></i> 
                    ${apt.estado === "Reservado" ? `Reservado (Seña: $${apt.precio.toLocaleString("es-AR")})` : `Provisional`}
                </div>
            </div>
            <div class="appointment-actions-col" style="display: flex; gap: 8px; align-items: center;">
                <button class="btn-reschedule-appointment" title="Reagendar Turno" data-id="${apt.id}" style="background: #fff3e0; color: #e65100; border: none; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i class="fa-regular fa-calendar-plus" style="font-size: 11px;"></i>
                </button>
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
                <button class="btn-delete-appointment" title="Cancelar Turno" data-id="${apt.id}">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>
        `;
        
        // Evento de eliminar
        card.querySelector(".btn-delete-appointment").addEventListener("click", () => {
            cancelAppointment(apt.id, apt.cliente);
        });

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
    if (sub) sub.textContent = `Modificar estado o cargar seña de ${apt.cliente}:`;
    
    const statusSelect = document.getElementById("sena-modal-status");
    if (statusSelect) statusSelect.value = apt.estado || "Reservado";

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
    const newStatus = document.getElementById("sena-modal-status").value;
    const sena = Number(document.getElementById("sena-modal-amount").value) || 0;
    const metodo = document.querySelector('input[name="sena-modal-payment"]:checked').value;

    closeSenaModal();
    showLoader(true, "Actualizando turno en la nube...");

    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "edit_appointment",
                id: apt.id,
                cliente: apt.cliente,
                fecha: apt.fecha,
                estado: newStatus,
                precio: sena
            })
        });
        const data = await response.json();
        if (data.success) {
            apt.estado = newStatus;
            apt.precio = sena;

            if (newStatus === "Reservado" && sena > 0) {
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
            }

            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
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
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "edit_appointment",
                id: apt.id,
                fecha: newDate,
                horaInicio: startDate.toISOString(),
                horaFin: endIso
            })
        });
        const data = await response.json();
        if (data.success) {
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
    senaBanner.innerHTML = `<i class="fa-solid fa-circle-info"></i> Turno Reservado. Seña de <strong>$${apt.precio}</strong> ya cobrada será descontada del total automáticamente.`;
    senaBanner.classList.remove("hidden");
    
    switchTab("registrar");
    showToast(`Cobrando turno de ${apt.cliente} (Seña: -$${apt.precio})`, "info");
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
    const senaAmount = Number(document.getElementById("schedule-sena-amount").value) || 0;
    const paymentMethodEl = document.querySelector('input[name="schedule-payment"]:checked');
    const senaPaymentMethod = paymentMethodEl ? paymentMethodEl.value : "Transferencia";

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
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify(appointmentData)
        });
        
        const data = await response.json();
        showLoader(false);
        
        if (data.success) {
            showToast("¡Turno agendado y sincronizado con éxito!", "success");
            
            // Añadir localmente, ordenar y recargar
            state.appointmentsList.push(data.appointment || appointmentData);
            state.appointmentsList.sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
            
            const cacheKey = `evolet_appointments_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.appointmentsList));
            
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

// Cancelar Turno
function cancelAppointment(id, clientName) {
    showGenericConfirmModal(
        "Cancelar Turno",
        `¿Segura de que deseas cancelar el turno de ${clientName}? Se eliminará también de tu Google Calendar.`,
        async () => {
            showLoader(true, "Cancelando turno...");
            try {
                const response = await fetch(CONFIG_SHEET_URL, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        "Content-Type": "text/plain"
                    },
                    body: JSON.stringify({
                        action: "delete_appointment",
                        id: id,
                        email: state.currentUser.email
                    })
                });
                
                const data = await response.json();
                showLoader(false);
                
                if (data.success) {
                    showToast("Turno cancelado correctamente.", "success");
                    
                    // Remover de la lista local
                    state.appointmentsList = state.appointmentsList.filter(apt => apt.id !== id);
                    
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
    
    showLoader(true, "Importando cobrados y sincronizando en Google Calendar...");
    
    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                action: "import_services",
                email: state.currentUser.email
            })
        });
        
        const data = await response.json();
        showLoader(false);
        
        if (data.success) {
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
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        state.expensesList = JSON.parse(cached);
        const activeTab = document.querySelector(".nav-item.active");
        if (activeTab && activeTab.getAttribute("data-tab") === "gastos") {
            renderExpensesList();
        }
    }
    
    if (!CONFIG_SHEET_URL) return;
    
    try {
        const response = await fetch(`${CONFIG_SHEET_URL}?action=get_expenses`);
        const data = await response.json();
        
        if (data.success && data.expenses) {
            state.expensesList = data.expenses;
            localStorage.setItem(cacheKey, JSON.stringify(state.expensesList));
            
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
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Filtrar los gastos del mes actual
    const monthExpenses = state.expensesList.filter(item => {
        const date = new Date(item.fecha + "T00:00:00");
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    // Ordenar de más nuevo a más viejo
    monthExpenses.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
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
        
        const date = new Date(exp.fecha + "T00:00:00");
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
    
    showLoader(true, "Registrando gasto en la planilla...");
    
    try {
        const response = await fetch(CONFIG_SHEET_URL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify(expenseData)
        });
        
        const data = await response.json();
        showLoader(false);
        
        if (data.success) {
            showToast("¡Gasto registrado con éxito!", "success");
            
            // Limpiar formulario
            document.getElementById("expense-concept").value = "";
            document.getElementById("expense-amount").value = "";
            
            // Añadir localmente
            state.expensesList.push(data.expense || expenseData);
            
            const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
            localStorage.setItem(cacheKey, JSON.stringify(state.expensesList));
            
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
        
        state.expensesList.push(expenseData);
        const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
        localStorage.setItem(cacheKey, JSON.stringify(state.expensesList));
        
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
                const response = await fetch(CONFIG_SHEET_URL, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        "Content-Type": "text/plain"
                    },
                    body: JSON.stringify({
                        action: "delete_expense",
                        id: id
                    })
                });
                
                const data = await response.json();
                showLoader(false);
                
                if (data.success) {
                    showToast("Gasto eliminado correctamente.", "success");
                    
                    state.expensesList = state.expensesList.filter(exp => exp.id !== id);
                    const cacheKey = `evolet_expenses_v4_${state.currentUser.email}`;
                    localStorage.setItem(cacheKey, JSON.stringify(state.expensesList));
                    
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
        
        const dateObj = new Date(item.fecha + "T00:00:00");
        const formattedDate = dateObj.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit' });
        
        const payIcons = {
            Transferencia: '<i class="fa-solid fa-mobile-screen-button"></i>',
            Efectivo: '<i class="fa-solid fa-money-bill-wave"></i>'
        };
        const payIcon = payIcons[item.metodoPago] || '<i class="fa-solid fa-receipt"></i>';
        const totalFormatted = `$${Number(item.monto).toLocaleString("es-AR")}`;
        
        const isAdmin = state.currentUser && state.currentUser.rol === "admin";

        card.innerHTML = `
            <div class="card-details">
                <div class="card-client">${escapeHtml(item.concepto)}</div>
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
    const list = [...state.expensesList];
    list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    return list.filter(item => {
        const matchesSearch = item.concepto.toLowerCase().includes(searchVal) ||
            item.metodoPago.toLowerCase().includes(searchVal);
            
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
