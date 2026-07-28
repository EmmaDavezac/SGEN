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
    currentUser: null,        // { email, nombre, token }
    servicesList: [],         // Transacciones registradas
    selectedCategory: "semi", // Categoría activa
    selectedService: null,    // Servicio específico activo
    pendingTransaction: null, // Transacción en espera de confirmación
    pendingDeleteId: null,    // ID de registro en espera de eliminación
    isEditingPrices: false    // Control del modo edición de precios
};

// =========================================================================
//                  INICIALIZACIÓN DE LA APLICACIÓN
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    // Registrar Service Worker para PWA Offline
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker registrado con éxito'))
            .catch(err => console.warn('Error al registrar Service Worker:', err));
    }

    // Verificar Sesión Activa (v4)
    const savedSession = localStorage.getItem("evolet_session_v4");
    if (savedSession) {
        state.currentUser = JSON.parse(savedSession);
        document.getElementById("user-display-name").textContent = state.currentUser.nombre;
        showAppScreen();
        loadServicesData();
        loadPricesFromCloud(); // Cargar precios dinámicos
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

    // Logout Directo
    document.getElementById("btn-logout").addEventListener("click", handleLogout);

    // Formulario de Registro - Categorías
    document.querySelector(".category-grid").addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-cat")) {
            const cat = e.target.getAttribute("data-cat");
            selectCategory(cat);
        }
    });

    // Envío de Formulario de Servicio
    document.getElementById("service-form").addEventListener("submit", handleServiceSubmit);

    // Modal de Confirmación de Registro
    document.getElementById("modal-btn-confirm").addEventListener("click", confirmServiceRegistration);
    document.getElementById("modal-btn-cancel").addEventListener("click", cancelServiceRegistration);

    // Modal de Confirmación de Eliminación
    document.getElementById("delete-btn-confirm").addEventListener("click", confirmDeleteServiceRecord);
    document.getElementById("delete-btn-cancel").addEventListener("click", cancelDeleteServiceRecord);

    // Historial - Buscador y Filtros
    document.getElementById("history-search").addEventListener("input", filterHistory);
    document.getElementById("history-filter").addEventListener("change", filterHistory);

    // Ajustes de precios (Admin)
    document.getElementById("btn-edit-mode").addEventListener("click", () => {
        state.isEditingPrices = true;
        document.getElementById("edit-actions-container").classList.remove("hidden");
        document.getElementById("btn-edit-mode").classList.add("hidden");
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
    // Cambiar estado en navegación inferior
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        if (item.getAttribute("data-tab") === tabId) {
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
    } else if (tabId === "configuracion") {
        renderPricesEditor();
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
    const serviceName = document.getElementById("service-name-input").value.trim();
    const price = Number(document.getElementById("service-price").value) || 0;
    
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    if (!clientName || !serviceName || price <= 0) {
        showToast("Completa los datos del cliente y precio correctamente.", "error");
        return;
    }

    // Estructura de transacción pre-cobrada por completo (seña=0, completado="Sí")
    const transaction = {
        id: "evt_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000),
        fecha: new Date().toISOString(),
        usuario: state.currentUser.email,
        cliente: clientName,
        servicio: serviceName,
        categoria: state.selectedCategory,
        precio: price,
        seña: 0,
        metodoPago: paymentMethod,
        completado: "Sí"
    };

    // Guardar en espera y desplegar modal de confirmación
    state.pendingTransaction = transaction;

    document.getElementById("confirm-client").textContent = transaction.cliente;
    document.getElementById("confirm-service").textContent = transaction.servicio;
    document.getElementById("confirm-price").textContent = `$${transaction.precio.toLocaleString("es-AR")}`;
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
            state.servicesList.unshift(data.service);
            saveServicesCache();
            updateClientAutocomplete(); // Recargar el autocompletado
            showToast("¡Servicio guardado con éxito!", "success");
            renderHistoryList();
            calculateAndRenderStats();
            resetServiceForm();
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

function resetServiceForm() {
    document.getElementById("client-name").value = "";
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
            <button class="btn-delete-card" onclick="app.deleteServiceRecord('${item.id}')" title="Eliminar Registro">
                <i class="fa-solid fa-trash-can"></i>
            </button>
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

// Eliminar un registro (Usando el modal personalizado)
function deleteServiceRecord(id) {
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

    document.getElementById("stat-month-income").textContent = `$${totalMonthIncome.toLocaleString("es-AR")}`;
    document.getElementById("stat-week-income").textContent = `$${totalWeekIncome.toLocaleString("es-AR")}`;
    document.getElementById("stat-count-month").textContent = servicesCountMonth;
    document.getElementById("stat-average-ticket").textContent = `$${averageTicket.toLocaleString("es-AR")}`;

    const totalPayments = cashSum + transfeSum;
    const pctCash = totalPayments > 0 ? Math.round((cashSum / totalPayments) * 100) : 0;
    const pctTransfe = totalPayments > 0 ? Math.round((transfeSum / totalPayments) * 100) : 0;

    document.getElementById("bar-cash").style.width = `${pctCash}%`;
    document.getElementById("bar-transfe").style.width = `${pctTransfe}%`;

    document.getElementById("text-cash").textContent = `$${cashSum.toLocaleString("es-AR")} (${pctCash}%)`;
    document.getElementById("text-transfe").textContent = `$${transfeSum.toLocaleString("es-AR")} (${pctTransfe}%)`;

    renderPopularServices(serviceCounts);
}

function renderPopularServices(serviceCounts) {
    const listElement = document.getElementById("popular-services-list");
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

    const queueKey = `evolet_offline_v4_${state.currentUser.email}`;
    const offlineQueue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    
    if (offlineQueue.length === 0) return;

    console.log(`Sincronizando ${offlineQueue.length} registros offline...`);
    
    const failedQueue = [];

    for (const transaction of offlineQueue) {
        try {
            const response = await fetch(CONFIG_SHEET_URL, {
                method: "POST",
                mode: "cors",
                body: JSON.stringify({
                    action: "add_service",
                    ...transaction
                })
            });
            const data = await response.json();
            if (!data.success) {
                failedQueue.push(transaction);
            }
        } catch (e) {
            failedQueue.push(transaction);
        }
    }

    if (failedQueue.length === 0) {
        localStorage.removeItem(queueKey);
        showToast("¡Todos los registros offline fueron sincronizados!", "success");
        loadServicesData();
    } else {
        localStorage.setItem(queueKey, JSON.stringify(failedQueue));
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

// Chequear acceso de administrador y ajustar visibilidad del botón de Ajustes
function checkAdminAccess() {
    const configBtn = document.getElementById("nav-btn-config");
    if (!configBtn) return;
    
    if (state.currentUser && state.currentUser.rol === "admin") {
        configBtn.classList.remove("hidden");
    } else {
        configBtn.classList.add("hidden");
        const activeTabBtn = document.querySelector(".nav-item.active");
        if (activeTabBtn && activeTabBtn.getAttribute("data-tab") === "configuracion") {
            switchTab("registrar");
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
