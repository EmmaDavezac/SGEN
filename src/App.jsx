import React, { useEffect, useState, useCallback, useRef } from 'react';
import { signInWithSupabase, supabase } from './supabase.js';
import AppLayout from './components/AppLayout.jsx';
import Button, { DetailActionButton, PanelCancelButton, PanelSaveButton } from './components/Button.jsx';
import WriteProgressOverlay from './components/WriteProgressOverlay.jsx';
import { runSteps, createSteps } from './progressTask.js';
import Toast from './components/Toast.jsx';
import { ToastProvider, useToast } from './components/ToastContext.jsx';
import { pedirAbrirCliente } from './clienteNav.js';
import { pressVisibleBackButton } from './backNavigation.js';
import { subscribeToFormGuard, useFormGuard } from './formGuard.js';
import CalendarBoard from './components/CalendarBoard.jsx';
import RegisterServiceForm from './components/RegisterServiceForm.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ExpensesPanel from './components/ExpensesPanel.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import ClientsPanel from './components/ClientsPanel.jsx';
import PricesPanel from './components/PricesPanel.jsx';
import CashBoxesPanel from './components/CashBoxesPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UsersPanel from './components/UsersPanel.jsx';
import AppFooter from './components/AppFooter.jsx';
import { ConfirmModal } from './components/Modal.jsx';
import { getPathForTab, getTabFromPath, isKnownPath } from './router.js';
import {
    readLoginRateState,
    registerFailedLoginAttempt,
    clearLoginAttempts,
    formatRemainingTime,
    describeLoginFailure,
} from './loginRateLimit.js';

const SESSION_KEY = 'evolet_session_v4';
const SETTINGS_KEY = 'evolet_settings_v4';

const TABS_BASE = ['calendario', 'historial', 'clientes', 'gastos', 'estadisticas', 'cuenta'];
const TABS_ADMIN = ['precios', 'ajustes', 'usuarios'];
const DEFAULT_TAB = 'calendario';

function RouteNotFound({ onGoHome }) {
    return (
        <main className="route-not-found-page">
            <div className="route-not-found-layout">
                <div className="route-not-found-brand" aria-hidden="true">
                    <img src="/icons/favicon.svg?v=2" alt="" />
                </div>
                <section className="route-not-found-copy" aria-labelledby="route-not-found-title">
                    <div className="route-not-found-eyebrow">Evolet Studio</div>
                    <h1 className="route-not-found-code">404</h1>
                    <h2 id="route-not-found-title">Página no encontrada</h2>
                    <p>No encontramos la página que buscabas. Volvé al inicio para continuar.</p>
                    <button type="button" className="home-link" onClick={onGoHome}>
                        <i className="fa-solid fa-house" aria-hidden="true" /> Volver a la página principal
                    </button>
                </section>
            </div>
            <AppFooter compact />
        </main>
    );
}

function isValidTab(tab, isAdmin, settings = {}, allowCheckout = false) {
    if (TABS_BASE.includes(tab)) return true;
    if (isAdmin && TABS_ADMIN.includes(tab)) return true;
    // "Registrar" no es una pestaña de la navegación: solo es alcanzable al
    // cobrar un turno, y mientras dure ese checkout (allowCheckout) la pantalla
    // se considera válida. Al terminar, la URL de /registrar vuelve a Agenda.
    if (allowCheckout && tab === 'registrar') return true;
    if (isAdmin && settings.allowCajasTab && tab === 'cajas') return true;
    return false;
}

function readStoredSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('No se pudo leer la sesión guardada:', error);
        return null;
    }
}

function isPasswordRecoveryRedirect() {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
}

function defaultSettings() {
    return {
        allowFiado: true,
        allowCajasTab: false,
        allowDaySearch: false,
        allowDayFilter: false,
    };
}

function readStoredSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaultSettings();
        // Se normaliza a las claves vigentes: así cualquier ajuste viejo
        // persistido (p. ej. la eliminada `allowRegisterTab`) se descarta en vez
        // de quedar como dato basura compartido entre usuarios.
        const parsed = JSON.parse(raw) || {};
        return {
            allowFiado: parsed.allowFiado !== undefined ? !!parsed.allowFiado : true,
            allowCajasTab: !!parsed.allowCajasTab,
            allowDaySearch: !!parsed.allowDaySearch,
            allowDayFilter: !!parsed.allowDayFilter,
        };
    } catch (error) {
        console.warn('No se pudieron leer los ajustes guardados:', error);
        return defaultSettings();
    }
}

/**
 * Conecta el `notify` de App con el ToastContext. Sin este puente, los mensajes
 * que App envía al estado `toast` nunca llegaban al `<Toast />` renderizado
 * dentro del ToastProvider y se perdían en silencio.
 */
function ToastBridge({ notifyRef }) {
    const { notify } = useToast();
    notifyRef.current = notify;
    return null;
}

function App() {
    const [session, setSession] = useState(() => readStoredSession());
    // `false` hasta validar la sesión guardada contra Supabase Auth. Evita que
    // los paneles monten (y pisen el caché con []) con una sesión rancia.
    const [authReady, setAuthReady] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Tarea de escritura en curso para la pantalla de progreso unificada.
    // null = nada en curso; { title, steps } = overlay visible.
    // steps: null/[]  => modo indeterminado (corazón + texto)
    // steps: [...]    => modo por-pasos (checklist con el estado real)
    const [task, setTask] = useState(null);
    // Derivado para no romper los `busy={loading}` de los botones existentes.
    const loading = !!task;
    const [confirmation, setConfirmation] = useState(null);
    // true cuando algún panel tiene un formulario de creación/edición abierto.
    const [formGuardActive, setFormGuardActive] = useState(false);
    const toastNotifyRef = useRef(null);

    const initialSession = readStoredSession();
    const initialSettings = readStoredSettings();
    const initialIsAdmin = initialSession && (initialSession.rol === 'admin' || initialSession.rol === 'superadmin');
    const initialRouteTab = getTabFromPath(window.location.pathname);
    const initialTab = isValidTab(initialRouteTab || DEFAULT_TAB, initialIsAdmin, initialSettings)
        ? (initialRouteTab || DEFAULT_TAB)
        : DEFAULT_TAB;
    const [activeTab, setActiveTabState] = useState(initialTab);
    const [routeNotFound, setRouteNotFound] = useState(() => !isKnownPath(window.location.pathname));
    const [checkoutAppointment, setCheckoutAppointment] = useState(null);
    // Pestaña activa "al día" en el mismo tick: la necesita el handler de popstate
    // (botón atrás del navegador/móvil) apenas se presiona un Volver que además
    // cambia de pestaña.
    const activeTabRef = useRef(activeTab);

    const setActiveTab = useCallback((tab) => {
        activeTabRef.current = tab;
        const nextPath = getPathForTab(tab);
        if (window.location.pathname !== nextPath) {
            window.history.pushState({ tab }, '', nextPath);
        }
        setRouteNotFound(false);
        setActiveTabState(tab);
    }, []);

    // Cambio de pestaña "protegido": si algún panel tiene un formulario abierto,
    // pide confirmación antes de cambiar (el cambio desmonta el panel y perdería
    // los datos ingresados). Es la misma red de seguridad que ya tienen los
    // botones `Volver` con sus confirmaciones de descarte.
    const requestTabChange = useCallback((tab) => {
        if (tab === activeTabRef.current) return;
        if (formGuardActive) {
            setConfirmation({
                title: 'Cambiar de pestaña',
                message: 'Hay datos sin guardar en el formulario actual. ¿Querés salir igual y cambiar de pestaña?',
                onConfirm: () => setActiveTab(tab),
            });
            return;
        }
        setActiveTab(tab);
    }, [formGuardActive, setActiveTab]);

    // Suscripción al guardia global de formularios (ver src/formGuard.js).
    useEffect(() => subscribeToFormGuard(setFormGuardActive), []);

    // Normaliza la ruta si la PWA o el navegador abre directamente desde /index.html.
    useEffect(() => {
        if (window.location.pathname === '/index.html') {
            window.history.replaceState({ tab: DEFAULT_TAB }, '', getPathForTab(DEFAULT_TAB));
        }
    }, []);

    // "Consultar ficha de la clienta" desde una venta: lleva a Clientes y le pide abrir
    // la ficha. ClientsPanel escucha el evento, así que tiene que estar montado
    // cuando llega (por eso se dispara después de cambiar de pestaña).
    const verCliente = useCallback((clienteId) => {
        if (!clienteId) return;
        setActiveTab('clientes');
        pedirAbrirCliente(clienteId);
    }, [setActiveTab]);

    const [settings, setSettings] = useState(() => initialSettings);

    const [profileEditing, setProfileEditing] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');

    const [passwordEditing, setPasswordEditing] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordResetMode, setPasswordResetMode] = useState(isPasswordRecoveryRedirect);
    const [resetPassword, setResetPassword] = useState('');
    const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // "Mi cuenta" también es un formulario: mientras se edite el perfil o la
    // contraseña, el guardia pide confirmación antes de cambiar de pestaña.
    useFormGuard(profileEditing || passwordEditing);

    // Al dejar la pestaña se descarta la edición de perfil (el usuario ya
    // confirmó que podía perder los datos): así el guardia no queda activo en
    // pantallas donde el formulario ya no se ve.
    useEffect(() => {
        if (activeTab === 'cuenta') return;
        setProfileEditing(false);
        setPasswordEditing(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setProfileName(session?.nombre || '');
        setProfileEmail(session?.email || '');
    }, [activeTab, session]);

    // Rate limit del ingreso: se renueva en pantalla cada segundo mientras dure el bloqueo.
    const [loginRate, setLoginRate] = useState(() => readLoginRateState());
    const loginLocked = loginRate.lockedMs > 0;

    useEffect(() => {
        if (!loginLocked) return undefined;
        const timer = window.setInterval(() => setLoginRate(readLoginRateState()), 1000);
        return () => window.clearInterval(timer);
    }, [loginLocked]);

    useEffect(() => {
        if (session) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            setProfileName(session.nombre || '');
            setProfileEmail(session.email || '');
        } else {
            localStorage.removeItem(SESSION_KEY);
        }
    }, [session]);

    useEffect(() => {
        if (!supabase) {
            setAuthReady(true);
            return undefined;
        }

        let isActive = true;

        // Al abrir la PWA (también al volver tras horas en segundo plano) se
        // valida la sesión guardada contra Supabase Auth:
        // - Sin sesión de Supabase -> se limpia la sesión local (la UI vuelve
        //   al login en vez de mostrar listados vacíos que no se recuperan).
        // - Con sesión -> se intenta renovar el token (puede haber expirado) y
        //   se rehidrata el perfil. Si el perfil ya no es legible (RLS), se
        //   limpia la sesión local para forzar un login fresco.
        const validateStoredSession = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (!isActive) return;
                const authUser = error ? null : data.session?.user;
                if (!authUser) {
                    if (readStoredSession()) setSession(null);
                    return;
                }
                try {
                    const refreshed = await supabase.auth.refreshSession();
                    if (!isActive) return;
                    if (refreshed.error || !refreshed.data.session?.user) {
                        setSession(null);
                        return;
                    }
                } catch (refreshError) {
                    // Sin red (PWA offline): se conserva la sesión guardada y
                    // los paneles muestran su caché; no se cierra sesión.
                    console.warn('No se pudo renovar la sesión (posible offline):', refreshError);
                    return;
                }
                const { data: profile, error: profileError } = await supabase
                    .from('perfiles')
                    .select('id, email, nombre, rol')
                    .eq('id', authUser.id)
                    .maybeSingle();
                if (!isActive) return;
                if (profileError || !profile) {
                    setSession(null);
                    return;
                }
                setSession({ ...profile, authId: authUser.id });
            } finally {
                if (isActive) setAuthReady(true);
            }
        };

        validateStoredSession();

        const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                if (isActive) {
                    setSession(null);
                    setAuthReady(true);
                }
                return;
            }
            if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                validateStoredSession();
                return;
            }
            if (event === 'PASSWORD_RECOVERY') {
                setSession(null);
                setPasswordResetMode(true);
                const callbackUrl = new URL(window.location.href);
                callbackUrl.hash = '';
                callbackUrl.searchParams.delete('type');
                callbackUrl.searchParams.delete('code');
                window.history.replaceState({}, document.title, `${callbackUrl.pathname}${callbackUrl.search}`);
            }
        });

        // La PWA puede volver del segundo plano con el JWT ya vencido: al
        // hacerse visible se revalida la sesión (renueva el token) en vez de
        // dejar los listados consultando como anónimo (RLS -> [] en caché).
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') validateStoredSession();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            isActive = false;
            authListener.subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    const isAdmin = session && (session.rol === 'admin' || session.rol === 'superadmin');
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);
    useEffect(() => {
        const handlePopState = () => {
            const currentTab = activeTabRef.current;
            const currentPath = getPathForTab(currentTab);

            // Con un modal (o confirmación) abierto, el "atrás" no navega: la
            // decisión le pertenece al modal. Solo reafirmamos la URL activa.
            if (document.querySelector('.modal-overlay')) {
                if (window.location.pathname !== currentPath) {
                    window.history.pushState({ tab: currentTab }, '', currentPath);
                }
                return;
            }

            // El botón "atrás" del navegador/móvil también aprieta el Volver de la
            // pantalla actual (ficha, formularios, Historial, Precios, …). Si se usó
            // para eso, hay que devolverle a la historia la URL de la pestaña activa:
            // el "atrás" cerró la subpantalla, no cambió de pestaña.
            if (pressVisibleBackButton()) {
                if (window.location.pathname !== currentPath) {
                    window.history.pushState({ tab: currentTab }, '', currentPath);
                }
                return;
            }

            // Sin subpantalla abierta, el "atrás" lleva a la pestaña principal
            // (Agenda), pasando por el mismo guard que el clic en la navegación.
            if (currentTab !== DEFAULT_TAB) {
                requestTabChange(DEFAULT_TAB);
                // Si el guard pidió confirmación y el usuario cancela, la URL
                // vuelve a la de la pestaña activa; si confirma, setActiveTab
                // empuja la de Agenda.
                const activePath = getPathForTab(activeTabRef.current);
                if (window.location.pathname !== activePath) {
                    window.history.pushState({ tab: activeTabRef.current }, '', activePath);
                }
                return;
            }

            // Ya en Agenda: si el pop cayó en una entrada vieja de otra pestaña,
            // reafirmamos la de Agenda para que el historial drene; si la URL ya
            // es la de Agenda, el back sigue su curso normal (salir de la app).
            if (window.location.pathname !== currentPath) {
                window.history.replaceState({ tab: DEFAULT_TAB }, '', currentPath);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [requestTabChange]);

    // Tecla Esc: aprieta el botón Volver visible de la pantalla actual; si no hay
    // ninguno, lleva a la pestaña principal (Agenda). Si hay un modal (o
    // confirmación) abierto, el Esc le pertenece al propio Modal.
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (document.querySelector('.modal-overlay')) return;
            if (pressVisibleBackButton()) return;
            if (activeTabRef.current !== DEFAULT_TAB) {
                requestTabChange(DEFAULT_TAB);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [requestTabChange]);

    useEffect(() => {
        // Registrar sigue siendo alcanzable mientras dura el cobro de un turno
        // (checkoutAppointment), ya no por un ajuste persistido.
        if (!isValidTab(activeTab, isAdmin, settings, !!checkoutAppointment)) {
            setActiveTabState(DEFAULT_TAB);
        }
    }, [activeTab, isAdmin, settings, checkoutAppointment]);

    const notify = useCallback((message, type = 'info') => {
        if (toastNotifyRef.current) {
            toastNotifyRef.current(message, type);
            return;
        }
        console.warn('notify llamado sin ToastProvider montado:', message);
    }, []);

    // Modo indeterminado: una sola operación sin pasos que mostrar (login,
    // recuperación, perfil, contraseña). Muestra el corazón + texto, igual que
    // el loader original.
    const showLoader = useCallback((show, text = 'Cargando...') => {
        setTask(show ? { title: text, steps: null } : null);
    }, []);

    // Modo por-pasos: ejecuta una lista de pasos reales mostrando el avance.
    // Si un paso falla, lo marca en rojo un instante y RE-LANZA el error para
    // que el llamador muestre su aviso actual; la info del formulario se
    // conserva (el overlay es solo visual y no toca el estado de los datos).
    const runTask = useCallback(async ({ title, steps }) => {
        setTask({ title, steps: createSteps(steps) });
        try {
            const result = await runSteps(steps, (updatedSteps) => {
                setTask((prev) => (prev ? { ...prev, steps: updatedSteps } : prev));
            });
            return result;
        } catch (error) {
            // Deja ver el paso en rojo ~900ms antes de cerrar, para que se
            // entienda qué falló.
            await new Promise((resolve) => setTimeout(resolve, 900));
            throw error;
        } finally {
            setTask(null);
        }
    }, []);

    useEffect(() => {
        // Cuando una consulta detecta sesión expirada (RLS devolvía [] sin
        // error), se limpia la sesión local y la UI vuelve al login con aviso.
        const handleSessionExpired = () => {
            setSession(null);
            setAuthReady(true);
            notify('Tu sesión expiró. Volvé a iniciar sesión.', 'error');
        };
        window.addEventListener('evolet:sesion-expirada', handleSessionExpired);
        return () => window.removeEventListener('evolet:sesion-expirada', handleSessionExpired);
    }, [notify]);

    const handleLogin = async (event) => {
        event.preventDefault();

        const currentRate = readLoginRateState();
        if (currentRate.lockedMs > 0) {
            setLoginRate(currentRate);
            notify(`Demasiados intentos fallidos. Reintentá en ${formatRemainingTime(currentRate.lockedMs)}.`, 'error');
            return;
        }

        const cleanEmail = email.trim();
        const cleanPassword = password.trim();

        if (!cleanEmail || !cleanPassword) {
            notify('Ingresá email y contraseña para continuar.', 'error');
            return;
        }

        showLoader(true, 'Verificando credenciales...');

        try {
            const user = await signInWithSupabase(cleanEmail, cleanPassword);
            if (user) {
                clearLoginAttempts();
                setLoginRate(readLoginRateState());
                setSession(user);
                notify(`¡Bienvenida de vuelta, ${user.nombre}!`, 'success');
                setEmail('');
                setPassword('');
                return;
            }
            // Credenciales rechazadas: cuenta para el rate limit.
            setLoginRate(registerFailedLoginAttempt());
            notify(describeLoginFailure(readLoginRateState()), 'error');
        } catch (error) {
            // Un fallo de red no es un intento de credenciales: no suma al bloqueo.
            console.error('Error en login React:', error);
            notify('No se pudo iniciar sesión. Verificá tus credenciales o la conexión.', 'error');
        } finally {
            showLoader(false);
        }
    };

    const handlePasswordRecoveryRequest = async (event) => {
        event.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
            notify('Ingresá tu email para recibir el enlace de recuperación.', 'error');
            return;
        }

        showLoader(true, 'Enviando enlace de recuperación...');
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: new URL('/?type=recovery', window.location.origin).toString(),
            });
            if (error) throw error;
            notify('Si el email está registrado, recibirás un enlace para recuperar el acceso.', 'success');
        } catch (error) {
            console.error('Error solicitando recuperación de contraseña:', error);
            notify('No se pudo enviar el enlace de recuperación. Intentá nuevamente.', 'error');
        } finally {
            showLoader(false);
        }
    };

    const handlePasswordRecoverySave = async (event) => {
        event.preventDefault();
        if (resetPassword.length < 8) {
            notify('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
            return;
        }
        if (resetPassword !== resetPasswordConfirmation) {
            notify('La nueva contraseña y su confirmación no coinciden.', 'error');
            return;
        }

        showLoader(true, 'Actualizando contraseña...');
        try {
            const { error } = await supabase.auth.updateUser({ password: resetPassword });
            if (error) throw error;
            await supabase.auth.signOut();
            setPasswordResetMode(false);
            setResetPassword('');
            setResetPasswordConfirmation('');
            notify('Contraseña actualizada. Ya podés iniciar sesión.', 'success');
        } catch (error) {
            console.error('Error actualizando contraseña recuperada:', error);
            notify(error.message || 'No se pudo actualizar la contraseña.', 'error');
        } finally {
            showLoader(false);
        }
    };

    const handleLogout = () => {
        setConfirmation({
            title: 'Cerrar sesión',
            message: '¿Confirmás que querés cerrar sesión?',
            onConfirm: () => {
                setSession(null);
                setEmail('');
                setPassword('');
                setCheckoutAppointment(null);
                setActiveTab(DEFAULT_TAB);
                notify('Sesión cerrada con éxito.', 'info');

                // Cerramos también la sesión real de Supabase Auth. Si no, el token
                // JWT sigue en localStorage y el useEffect de getSession() reinicia
                // la sesión automáticamente al recargar la página.
                if (supabase) {
                    supabase.auth.signOut().catch((error) => {
                        console.error('No se pudo cerrar la sesión de Supabase:', error);
                    });
                }
            }
        });
    };

    const requestConfirmation = (title, message, onConfirm) => {
        setConfirmation({ title, message, onConfirm });
    };

    const confirmPendingAction = async () => {
        const action = confirmation?.onConfirm;
        setConfirmation(null);
        if (action) await action();
    };

    const cancelConfirmation = () => setConfirmation(null);

    const handleProfileSave = async (e) => {
        if (e) e.preventDefault();
        if (!session?.authId || !supabase) return;

        const name = profileName.trim();
        const mail = profileEmail.trim().toLowerCase();
        const currentEmail = (session.email || "").trim().toLowerCase();
        const emailChanged = mail !== currentEmail;

        if (!name || !mail) {
            notify('Completá tu nombre y email.', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mail)) {
            notify('Ingresá un formato de email válido.', 'error');
            return;
        }

        const msg = emailChanged
            ? "Se modificará tu correo electrónico. Deberás verificar la nueva dirección para iniciar sesión. ¿Confirmás los cambios?"
            : "¿Confirmás los cambios en tu perfil?";
        
        requestConfirmation('Confirmar cambios de perfil', msg, () => handleProfileSaveConfirmed({ name, mail, currentEmail, emailChanged }));
        return;
    };

    const handleProfileSaveConfirmed = async ({ name, mail, currentEmail, emailChanged }) => {

        showLoader(true, 'Actualizando tus datos...');

        try {
            const { error: profileError } = await supabase
                .from("perfiles")
                .update({ nombre: name })
                .eq("id", session.authId);
            if (profileError) throw profileError;

            let accountEmail = currentEmail;
            if (emailChanged) {
                const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({ email: mail });
                if (authError) throw authError;

                accountEmail = updatedAuth.user?.email || currentEmail;
                if (accountEmail === mail) {
                    const { error: emailProfileError } = await supabase
                        .from("perfiles")
                        .update({ email: mail })
                        .eq("id", session.authId);
                    if (emailProfileError) throw emailProfileError;
                }
            }

            const updatedSession = { ...session, nombre: name, email: accountEmail };
            setSession(updatedSession);
            notify(
                emailChanged && accountEmail !== mail
                    ? "Datos actualizados. Revisá tu email para confirmar la nueva dirección."
                    : "Tus datos se actualizaron correctamente.",
                "success"
            );
            setProfileEditing(false);
        } catch (error) {
            console.error("Error al actualizar datos de cuenta React:", error);
            notify(error.message || "No se pudieron actualizar tus datos.", "error");
        } finally {
            showLoader(false);
        }
    };

    const handlePasswordSave = async (e) => {
        if (e) e.preventDefault();
        if (!session?.authId || !supabase) return;

        if (!currentPassword || !newPassword || !confirmPassword) {
            notify('Ingresá tu contraseña actual, la nueva contraseña y su confirmación.', 'error');
            return;
        }

        if (newPassword.length < 8) {
            notify('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            notify('La nueva contraseña y su confirmación no coinciden.', 'error');
            return;
        }

        requestConfirmation(
            'Confirmar cambio de contraseña',
            'Se modificará tu contraseña de acceso. ¿Confirmás el cambio?',
            () => handlePasswordSaveConfirmed({ currentPassword, newPassword })
        );
        return;
    };

    const handlePasswordSaveConfirmed = async ({ currentPassword, newPassword }) => {

        showLoader(true, 'Cambiando contraseña...');

        try {
            const currentEmail = (session.email || "").trim().toLowerCase();
            const { data: reauthenticated, error: reauthError } = await supabase.auth.signInWithPassword({
                email: currentEmail,
                password: currentPassword
            });
            if (reauthError || !reauthenticated.user) {
                throw new Error("La contraseña actual no es correcta. No se modificó la contraseña.");
            }

            const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
            if (authError) throw authError;

            notify('Tu contraseña se actualizó correctamente.', 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordEditing(false);
        } catch (error) {
            console.error("Error al cambiar la contraseña React:", error);
            notify(error.message || "No se pudo cambiar la contraseña.", "error");
        } finally {
            showLoader(false);
        }
    };

    const handleChangeSettings = useCallback((key, checked) => {
        setSettings((prev) => ({ ...prev, [key]: !!checked }));
    }, []);

    return (
        <>
            <ConfirmModal
                open={!!confirmation}
                title={confirmation?.title}
                message={confirmation?.message}
                confirmText="Confirmar"
                onConfirm={confirmPendingAction}
                onCancel={cancelConfirmation}
            />
            <ToastProvider>
                <ToastBridge notifyRef={toastNotifyRef} />
                <Toast />
            </ToastProvider>
            <WriteProgressOverlay task={task} />

            {routeNotFound ? (
                <RouteNotFound onGoHome={() => setActiveTab(DEFAULT_TAB)} />
            ) : !authReady ? (
                <section className="login-screen active" aria-label="Verificando sesión">
                    <div className="sparkles-bg" aria-hidden="true" />
                    <div className="login-card">
                        <div className="brand-logo-container">
                            <div className="logo-circle">
                                <img id="logo-img" src="/icons/favicon.svg" alt="Evolet Studio" />
                            </div>
                        </div>
                        <h1>Evolet Studio</h1>
                        <p className="subtitle">Verificando tu sesión…</p>
                    </div>
                </section>
            ) : !session ? (
                <section className="login-screen active" aria-label="Login de Evolet Studio">
                    <div className="sparkles-bg" aria-hidden="true" />
                    <div className="login-card">
                        <div className="brand-logo-container">
                            <div className="logo-circle">
                                <img
                                    id="logo-img"
                                    src="/icons/favicon.svg"
                                    alt="Evolet Studio"
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        if (target && target.parentNode) {
                                            const fallback = document.createElement('i');
                                            fallback.className = 'fa-solid fa-crown logo-fallback';
                                            fallback.style.color = 'var(--barbie-pink)';
                                            fallback.setAttribute('aria-hidden', 'true');
                                            target.parentNode.replaceChild(fallback, target);
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <h1>Evolet Studio</h1>
                        <p className="subtitle">Sistema de Contabilidad</p>

                        {passwordResetMode === true ? (
                            <form className="retro-form" onSubmit={handlePasswordRecoverySave}>
                                <p className="login-form-heading">Elegí una nueva contraseña para continuar.</p>
                                <div className="form-group">
                                    <label htmlFor="react-reset-password">Nueva contraseña <span className="field-required">(obligatorio)</span></label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-lock input-icon" aria-hidden="true"></i>
                                        <input
                                            id="react-reset-password"
                                            type="password"
                                            value={resetPassword}
                                            onChange={(event) => setResetPassword(event.target.value)}
                                            placeholder="Mínimo 8 caracteres"
                                            minLength="8"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="react-reset-password-confirmation">Confirmar contraseña <span className="field-required">(obligatorio)</span></label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-lock input-icon" aria-hidden="true"></i>
                                        <input
                                            id="react-reset-password-confirmation"
                                            type="password"
                                            value={resetPasswordConfirmation}
                                            onChange={(event) => setResetPasswordConfirmation(event.target.value)}
                                            placeholder="Repetí la contraseña"
                                            minLength="8"
                                            required
                                        />
                                    </div>
                                </div>
                                <Button type="submit" className="btn-block" busy={loading}>
                                    Actualizar contraseña
                                </Button>
                            </form>
                        ) : passwordResetMode === 'request' ? (
                            <form className="retro-form password-recovery-form" onSubmit={handlePasswordRecoveryRequest}>
                                <p className="login-form-heading">Te enviaremos un enlace temporal a tu email.</p>
                                <div className="form-group">
                                    <label htmlFor="react-recovery-email">Email <span className="field-required">(obligatorio)</span></label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-envelope input-icon" aria-hidden="true"></i>
                                        <input
                                            id="react-recovery-email"
                                            type="email"
                                            value={email}
                                            onChange={(event) => setEmail(event.target.value)}
                                            placeholder="ejemplo@correo.com"
                                            required
                                        />
                                    </div>
                                </div>
                                <Button type="submit" className="btn-block" busy={loading}>
                                    Enviar enlace
                                </Button>
                                <Button type="button" variant="secondary" className="btn-block login-secondary-action" onClick={() => setPasswordResetMode(false)}>
                                    Volver al inicio de sesión
                                </Button>
                            </form>
                        ) : (
                        <form className="retro-form" onSubmit={handleLogin}>
                            <div className="form-group">
                                <label htmlFor="react-login-email">
                                    Email <span className="field-required">(obligatorio)</span>
                                </label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-envelope input-icon" aria-hidden="true"></i>
                                    <input
                                        id="react-login-email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="ejemplo@correo.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="react-login-password">
                                    Contraseña <span className="field-required">(obligatorio)</span>
                                </label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-lock input-icon" aria-hidden="true"></i>
                                    <input
                                        id="react-login-password"
                                        type="password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            {loginLocked && (
                                <p className="login-rate-limit-note" role="alert">
                                    <i className="fa-solid fa-clock" aria-hidden="true"></i>
                                    Demasiados intentos fallidos. El ingreso está bloqueado; reintentá en {formatRemainingTime(loginRate.lockedMs)}.
                                </p>
                            )}

                            <Button type="submit" className="btn-block" disabled={loginLocked}>
                                Ingresar
                            </Button>
                            <Button type="button" variant="secondary" className="btn-block login-secondary-action" onClick={() => setPasswordResetMode('request')}>
                                Olvidé mi contraseña
                            </Button>
                        </form>
                        )}
                        <AppFooter compact />
                    </div>
                </section>
            ) : (
                <AppLayout
                    session={session}
                    onLogout={handleLogout}
                    activeTab={activeTab}
                    setActiveTab={requestTabChange}
                    settings={settings}
                >
                    {activeTab === 'registrar' && (
                        <RegisterServiceForm 
                            session={session}
                            initialAppointment={checkoutAppointment}
                            onBack={() => {
                                setCheckoutAppointment(null);
                                setActiveTab('calendario');
                            }}
                            settings={settings}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                            onRegisterSuccess={() => {
                                setCheckoutAppointment(null);
                                setActiveTab('calendario');
                            }}
                        />
                    )}

                    {activeTab === 'historial' && (
                        <HistoryPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                            onBack={() => setActiveTab('calendario')}
                            onVerCliente={verCliente}
                        />
                    )}

                    {activeTab === 'calendario' && (
                        <CalendarBoard
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                            settings={settings}
                            onGoHistory={() => setActiveTab('historial')}
                            onVerCliente={verCliente}
                            onCheckoutFromAppointment={(apt) => {
                                setCheckoutAppointment(apt);
                                setActiveTab('registrar');
                                notify('Completá el servicio y el cobro del turno seleccionado.', 'info');
                            }}
                        />
                    )}

                    {activeTab === 'clientes' && (
                        <ClientsPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                        />
                    )}

                    {activeTab === 'gastos' && (
                        <ExpensesPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                        />
                    )}

                    {activeTab === 'estadisticas' && (
                        <StatsPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                        />
                    )}

                    {isAdmin && (
                        <div style={{ display: activeTab === 'precios' ? undefined : 'none' }}>
                            <PricesPanel
                                session={session}
                                notify={notify}
                                showLoader={showLoader}
                                runTask={runTask}
                            />
                        </div>
                    )}

                    {isAdmin && settings.allowCajasTab && activeTab === 'cajas' && (
                        <CashBoxesPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                        />
                    )}

                    {isAdmin && activeTab === 'ajustes' && (
                        <SettingsPanel
                            settings={settings}
                            onChangeSettings={handleChangeSettings}
                            notify={notify}
                        />
                    )}

                    {isAdmin && activeTab === 'usuarios' && (
                        <UsersPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            runTask={runTask}
                        />
                    )}

                    {activeTab === 'cuenta' && (
                        <section id="tab-cuenta" className="panel-stack view-enter">
                            <div className="section-title section-title-with-back">
                                <button
                                    type="button"
                                    onClick={() => requestTabChange('calendario')}
                                    className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only"
                                    aria-label="Volver al calendario"
                                >
                                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                                    <span className="mobile-action-label">Volver</span>
                                </button>
                                <div className="section-title-text">
                                    <h3>Mi cuenta</h3>
                                    <p>Actualizá tus datos de perfil.</p>
                                </div>
                            </div>

                            <form id="account-form" className="cute-form account-readonly-form account-profile-form chart-section" onSubmit={handleProfileSave}>
                                <h4><i className="fa-solid fa-user panel-heading-icon" aria-hidden="true"></i>Perfil</h4>
                                <div className="form-group">
                                    <label htmlFor="account-name">Nombre <span className="field-required">(obligatorio)</span></label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-user input-icon"></i>
                                        <input 
                                            type="text" 
                                            id="account-name" 
                                            placeholder="Ej. Camila Silva"
                                            value={profileName} 
                                            onChange={(e) => setProfileName(e.target.value)}
                                            required 
                                            readOnly={!profileEditing} 
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="account-email">Email <span className="field-required">(obligatorio)</span></label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-envelope input-icon"></i>
                                        <input 
                                            type="email" 
                                            id="account-email" 
                                            placeholder="ejemplo@correo.com"
                                            value={profileEmail} 
                                            onChange={(e) => setProfileEmail(e.target.value)}
                                            required 
                                            readOnly={!profileEditing} 
                                        />
                                    </div>
                                </div>
                                {/* Acciones del grupo editable, justo debajo de él:
                                    al editar, Cancelar/Guardar; si no, el botón
                                    Editar que lo habilita — igual que las fichas. */}
                                <div className="detail-form-actions">
                                    {profileEditing ? (
                                        <>
                                            <PanelCancelButton
                                                onClick={() => {
                                                    setProfileEditing(false);
                                                    setProfileName(session.nombre || '');
                                                    setProfileEmail(session.email || '');
                                                }}
                                            />
                                            <PanelSaveButton type="submit" />
                                        </>
                                    ) : (
                                        <DetailActionButton
                                            icon="fa-pen-to-square"
                                            label="Editar"
                                            aria-label="Editar perfil"
                                            onClick={() => setProfileEditing(true)}
                                            disabled={passwordEditing}
                                        />
                                    )}
                                </div>
                            </form>

                            {!passwordEditing ? (
                                <div className="chart-section">
                                    <h4><i className="fa-solid fa-lock panel-heading-icon" aria-hidden="true"></i>Contraseña</h4>
                                    <button 
                                        type="button" 
                                        id="show-change-password-btn" 
                                        className="btn btn-secondary btn-block account-password-trigger"
                                        onClick={() => setPasswordEditing(true)}
                                        disabled={profileEditing}
                                    >
                                        <i className="fa-solid fa-key"></i> Actualizar contraseña
                                    </button>
                                </div>
                            ) : (
                                <form id="account-password-form" className="cute-form account-security-section chart-section" onSubmit={handlePasswordSave}>
                                    <h4><i className="fa-solid fa-lock panel-heading-icon" aria-hidden="true"></i>Cambiar contraseña</h4>

                                    <div className="form-group password-field-group">
                                        <label htmlFor="account-current-password">Contraseña actual <span className="field-required">(obligatorio)</span></label>
                                        <div className="password-input-wrapper">
                                            <i className="fa-solid fa-shield-halved input-icon" />
                                            <input 
                                                type={showCurrentPassword ? 'text' : 'password'} 
                                                id="account-current-password" 
                                                minLength="6" 
                                                required
                                                placeholder="Ingresá tu contraseña actual" 
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="password-input"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn"
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            >
                                                <i className={`fa-solid ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group password-field-group">
                                        <label htmlFor="account-password">Nueva contraseña <span className="field-required">(obligatorio)</span></label>
                                        <div className="password-input-wrapper">
                                            <i className="fa-solid fa-lock input-icon" />
                                            <input 
                                                type={showNewPassword ? 'text' : 'password'} 
                                                id="account-password" 
                                                minLength="8" 
                                                required
                                                placeholder="Mínimo 8 caracteres" 
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="password-input"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn"
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                            >
                                                <i className={`fa-solid ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group password-field-group">
                                        <label htmlFor="account-confirm-password">Confirmar nueva contraseña <span className="field-required">(obligatorio)</span></label>
                                        <div className="password-input-wrapper">
                                            <i className="fa-solid fa-lock-open input-icon" />
                                            <input 
                                                type={showConfirmPassword ? 'text' : 'password'} 
                                                id="account-confirm-password" 
                                                minLength="8" 
                                                required
                                                placeholder="Repetí la nueva contraseña" 
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="password-input"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            >
                                                <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="detail-form-actions">
                                        <PanelCancelButton
                                            onClick={() => {
                                                setPasswordEditing(false);
                                                setCurrentPassword('');
                                                setNewPassword('');
                                                setConfirmPassword('');
                                            }}
                                        />
                                        <PanelSaveButton type="submit" />
                                    </div>
                                </form>
                            )}
                        </section>
                    )}

                    {!isValidTab(activeTab, isAdmin, settings, !!checkoutAppointment) && (
                        <div className="route-not-found-inline">
                            <div className="route-not-found-inline-icon">
                                <i className="fa-solid fa-magnifying-glass"></i>
                            </div>
                            <h3 className="route-not-found-inline-title">
                                Sección no encontrada
                            </h3>
                            <p className="route-not-found-inline-description">
                                La pestaña que buscaste no existe o no tenés permiso para acceder. Volvamos al inicio.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm route-not-found-inline-action"
                                onClick={() => setActiveTab(DEFAULT_TAB)}
                            >
                                <i className="fa-solid fa-house"></i>
                                Ir a Agenda
                            </button>
                        </div>
                    )}
                </AppLayout>
            )}
        </>
    );
}

export default App;
