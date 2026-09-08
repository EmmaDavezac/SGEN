import React, { useEffect, useState, useCallback } from 'react';
import { signInWithSupabase, supabase } from './supabase.js';
import AppLayout from './components/AppLayout.jsx';
import Button from './components/Button.jsx';
import Loader from './components/Loader.jsx';
import Toast from './components/Toast.jsx';
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

const SESSION_KEY = 'evolet_session_v4';
const SETTINGS_KEY = 'evolet_settings_v4';

const TABS_BASE = ['calendario', 'historial', 'clientes', 'gastos', 'estadisticas', 'cuenta'];
const TABS_ADMIN = ['precios', 'ajustes', 'usuarios'];
const TABS_ADMIN_CON_SETTING = ['cajas', 'registrar'];
const DEFAULT_TAB = 'calendario';

function RouteNotFound({ onGoHome }) {
    return (
        <main className="route-not-found-page">
            <div className="route-not-found-layout">
                <div className="route-not-found-brand" aria-hidden="true">
                    <img src="/icons/favicon.svg?v=2" alt="" />
                </div>
                <section className="route-not-found-copy" aria-labelledby="route-not-found-title">
                    <div className="route-not-found-eyebrow">Evolet Nails</div>
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

function isValidTab(tab, isAdmin, settings = {}) {
    if (TABS_BASE.includes(tab)) return true;
    if (isAdmin && TABS_ADMIN.includes(tab)) return true;
    if (isAdmin && settings.allowRegisterTab && tab === 'registrar') return true;
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

function readStoredSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : {
            allowFiado: true,
            allowRegisterTab: false,
            allowCajasTab: false,
        };
    } catch (error) {
        console.warn('No se pudieron leer los ajustes guardados:', error);
        return {
            allowFiado: true,
            allowRegisterTab: false,
            allowCajasTab: false,
        };
    }
}

function App() {
    const [session, setSession] = useState(() => readStoredSession());
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [loaderText, setLoaderText] = useState('Verificando credenciales...');
    const [toast, setToast] = useState(null);
    const [confirmation, setConfirmation] = useState(null);

    const initialSession = readStoredSession();
    const initialSettings = readStoredSettings();
    const initialIsAdmin = initialSession && initialSession.rol === 'admin';
    const initialRouteTab = getTabFromPath(window.location.pathname);
    const initialTab = isValidTab(initialRouteTab || DEFAULT_TAB, initialIsAdmin, initialSettings)
        ? (initialRouteTab || DEFAULT_TAB)
        : DEFAULT_TAB;
    const [activeTab, setActiveTabState] = useState(initialTab);
    const [routeNotFound, setRouteNotFound] = useState(() => !isKnownPath(window.location.pathname));
    const [checkoutAppointment, setCheckoutAppointment] = useState(null);

    const setActiveTab = useCallback((tab) => {
        const nextPath = getPathForTab(tab);
        if (window.location.pathname !== nextPath) {
            window.history.pushState({ tab }, '', nextPath);
        }
        setRouteNotFound(false);
        setActiveTabState(tab);
    }, []);

    const [settings, setSettings] = useState(() => initialSettings);

    const [profileEditing, setProfileEditing] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');

    const [passwordEditing, setPasswordEditing] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordResetMode, setPasswordResetMode] = useState(false);
    const [resetPassword, setResetPassword] = useState('');
    const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
        if (!supabase) return undefined;
        const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') setPasswordResetMode(true);
        });
        return () => authListener.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    const isAdmin = session && session.rol === 'admin';
    useEffect(() => {
        const handlePopState = () => {
            const tab = getTabFromPath(window.location.pathname);
            setRouteNotFound(!tab);
            if (tab) setActiveTabState(tab);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        const tabSettings = checkoutAppointment
            ? { ...settings, allowRegisterTab: true }
            : settings;
        if (!isValidTab(activeTab, isAdmin, tabSettings)) {
            setActiveTabState(DEFAULT_TAB);
        }
    }, [activeTab, isAdmin, settings, checkoutAppointment]);

    const notify = useCallback((message, type = 'info') => {
        const nextToast = { id: `${Date.now()}-${Math.random()}`, message, type };
        setToast(nextToast);
        window.setTimeout(() => setToast(null), 3500);
    }, []);

    const showLoader = useCallback((show, text = 'Cargando...') => {
        setLoading(!!show);
        setLoaderText(text);
    }, []);

    const handleLogin = async (event) => {
        event.preventDefault();
        const cleanEmail = email.trim();
        const cleanPassword = password.trim();

        if (!cleanEmail || !cleanPassword) {
            notify('Ingresá email y contraseña para continuar.', 'error');
            return;
        }

        setLoaderText('Verificando credenciales...');
        setLoading(true);

        try {
            const user = await signInWithSupabase(cleanEmail, cleanPassword);
            if (user) {
                setSession(user);
                notify(`¡Bienvenida de vuelta, ${user.nombre}!`, 'success');
                setEmail('');
                setPassword('');
                return;
            }
            notify('Email o contraseña incorrectos.', 'error');
        } catch (error) {
            console.error('Error en login React:', error);
            notify('No se pudo iniciar sesión. Verificá tus credenciales o la conexión.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordRecoveryRequest = async (event) => {
        event.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
            notify('Ingresá tu email para recibir el enlace de recuperación.', 'error');
            return;
        }

        setLoaderText('Enviando enlace de recuperación...');
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: window.location.origin,
            });
            if (error) throw error;
            notify('Si el email está registrado, recibirás un enlace para recuperar el acceso.', 'success');
        } catch (error) {
            console.error('Error solicitando recuperación de contraseña:', error);
            notify('No se pudo enviar el enlace de recuperación. Intentá nuevamente.', 'error');
        } finally {
            setLoading(false);
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

        setLoaderText('Actualizando contraseña...');
        setLoading(true);
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
            setLoading(false);
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
                setActiveTab('registrar');
                notify('Sesión cerrada con éxito.', 'info');
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

        setLoaderText('Actualizando tus datos...');
        setLoading(true);

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
            setLoading(false);
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

        setLoaderText('Cambiando contraseña...');
        setLoading(true);

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
            setLoading(false);
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
            <Toast toasts={toast ? [toast] : []} />
            <Loader show={loading} text={loaderText} />

            {routeNotFound ? (
                <RouteNotFound onGoHome={() => setActiveTab(DEFAULT_TAB)} />
            ) : !session ? (
                <section className="login-screen active" aria-label="Login de Evolet Nails">
                    <div className="sparkles-bg" aria-hidden="true" />
                    <div className="login-card">
                        <div className="brand-logo-container">
                            <div className="logo-circle">
                                <img
                                    id="logo-img"
                                    src="/icons/favicon.svg"
                                    alt="Evolet Nails"
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

                        <h1>Evolet Nails</h1>
                        <p className="subtitle">Sistema de Contabilidad</p>

                        {passwordResetMode === true ? (
                            <form className="retro-form" onSubmit={handlePasswordRecoverySave}>
                                <p className="login-form-heading">Elegí una nueva contraseña para continuar.</p>
                                <div className="form-group">
                                    <label htmlFor="react-reset-password">Nueva contraseña</label>
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
                                    <label htmlFor="react-reset-password-confirmation">Confirmar contraseña</label>
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
                                    <i className="fa-solid fa-key" aria-hidden="true"></i> Actualizar contraseña
                                </Button>
                            </form>
                        ) : passwordResetMode === 'request' ? (
                            <form className="retro-form password-recovery-form" onSubmit={handlePasswordRecoveryRequest}>
                                <p className="login-form-heading">Te enviaremos un enlace temporal a tu email.</p>
                                <div className="form-group">
                                    <label htmlFor="react-recovery-email">Email autorizado</label>
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
                                    <i className="fa-solid fa-envelope" aria-hidden="true"></i> Enviar enlace
                                </Button>
                                <button type="button" className="login-secondary-action" onClick={() => setPasswordResetMode(false)}>
                                    Volver al inicio de sesión
                                </button>
                            </form>
                        ) : (
                        <form className="retro-form" onSubmit={handleLogin}>
                            <div className="form-group">
                                <label htmlFor="react-login-email">
                                    Email Autorizado
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
                                    Contraseña
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

                            <Button type="submit" className="btn-block">
                                <i className="fa-solid fa-heart-pulse" aria-hidden="true"></i> Ingresar
                            </Button>
                            <button type="button" className="login-secondary-action" onClick={() => setPasswordResetMode('request')}>
                                Olvidé mi contraseña
                            </button>
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
                    setActiveTab={setActiveTab}
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
                            onBack={() => setActiveTab('calendario')}
                        />
                    )}

                    {activeTab === 'calendario' && (
                        <CalendarBoard
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                            onGoHistory={() => setActiveTab('historial')}
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
                        />
                    )}

                    {activeTab === 'gastos' && (
                        <ExpensesPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                        />
                    )}

                    {activeTab === 'estadisticas' && (
                        <StatsPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                        />
                    )}

                    {isAdmin && activeTab === 'precios' && (
                        <PricesPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                        />
                    )}

                    {isAdmin && settings.allowCajasTab && activeTab === 'cajas' && (
                        <CashBoxesPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                        />
                    )}

                    {isAdmin && activeTab === 'ajustes' && (
                        <SettingsPanel
                            settings={settings}
                            onChangeSettings={handleChangeSettings}
                            notify={notify}
                            onBack={() => setActiveTab('calendario')}
                        />
                    )}

                    {isAdmin && activeTab === 'usuarios' && (
                        <UsersPanel
                            session={session}
                            notify={notify}
                            showLoader={showLoader}
                        />
                    )}

                    {activeTab === 'cuenta' && (
                        <div id="tab-cuenta" className="tab-pane active">
                            <div className="section-title section-title-with-action">
                                <div>
                                    <h3>Mi cuenta</h3>
                                    <p>Actualizá tus datos de perfil.</p>
                                </div>
                                <div className="account-header-actions">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('calendario')}
                                        className="btn btn-secondary btn-sm btn-back"
                                    >
                                        <i className="fa-solid fa-arrow-left"></i> Volver
                                    </button>
                                    {!profileEditing ? (
                                        <button 
                                            type="button" 
                                            id="account-edit-btn" 
                                            className="btn btn-secondary btn-sm account-edit-action"
                                            onClick={() => setProfileEditing(true)}
                                            disabled={passwordEditing}
                                        >
                                            <i className="fa-solid fa-pen-to-square"></i> Editar
                                        </button>
                                    ) : (
                                        <div id="account-actions-container" className="account-form-actions">
                                        <button 
                                            type="button" 
                                            id="account-cancel-btn" 
                                            className="btn btn-secondary btn-sm account-small-action"
                                            onClick={() => {
                                                setProfileEditing(false);
                                                setProfileName(session.nombre || '');
                                                setProfileEmail(session.email || '');
                                            }}
                                        >
                                            <i className="fa-solid fa-xmark"></i> Cancelar
                                        </button>
                                        <button 
                                            type="button" 
                                            id="account-save-btn" 
                                            className="btn btn-primary btn-sm account-small-action"
                                            onClick={handleProfileSave}
                                        >
                                            <i className="fa-solid fa-floppy-disk"></i> Guardar
                                        </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <form id="account-form" className="cute-form account-readonly-form account-profile-form" onSubmit={handleProfileSave}>
                                <div className="form-group">
                                    <label htmlFor="account-name">Nombre</label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-user input-icon"></i>
                                        <input 
                                            type="text" 
                                            id="account-name" 
                                            value={profileName} 
                                            onChange={(e) => setProfileName(e.target.value)}
                                            required 
                                            readOnly={!profileEditing} 
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="account-email">Email</label>
                                    <div className="input-wrapper">
                                        <i className="fa-solid fa-envelope input-icon"></i>
                                        <input 
                                            type="email" 
                                            id="account-email" 
                                            value={profileEmail} 
                                            onChange={(e) => setProfileEmail(e.target.value)}
                                            required 
                                            readOnly={!profileEditing} 
                                        />
                                    </div>
                                </div>
                            </form>

                            {!passwordEditing ? (
                                <button 
                                    type="button" 
                                    id="show-change-password-btn" 
                                    className="btn btn-secondary btn-block account-password-trigger"
                                    onClick={() => setPasswordEditing(true)}
                                    disabled={profileEditing}
                                >
                                    <i className="fa-solid fa-key"></i> Actualizar contraseña
                                </button>
                            ) : (
                                <form id="account-password-form" className="cute-form account-security-section" onSubmit={handlePasswordSave}>
                                    <div className="section-title account-password-header">
                                        <h4>Cambiar contraseña</h4>
                                        <div id="account-password-actions-container" className="account-form-actions">
                                            <button 
                                                type="button" 
                                                id="account-password-cancel-btn" 
                                                className="btn btn-secondary btn-sm account-small-action"
                                                onClick={() => {
                                                    setPasswordEditing(false);
                                                    setCurrentPassword('');
                                                    setNewPassword('');
                                                    setConfirmPassword('');
                                                }}
                                            >
                                                <i className="fa-solid fa-xmark"></i> Cancelar
                                            </button>
                                            <button 
                                                type="submit" 
                                                id="account-password-save-btn" 
                                                className="btn btn-primary btn-sm account-small-action"
                                            >
                                                <i className="fa-solid fa-floppy-disk"></i> Guardar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group password-field-group">
                                        <label htmlFor="account-current-password">Contraseña actual</label>
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
                                        <label htmlFor="account-password">Nueva contraseña</label>
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
                                        <label htmlFor="account-confirm-password">Confirmar nueva contraseña</label>
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
                                </form>
                            )}
                        </div>
                    )}

                    {!isValidTab(activeTab, isAdmin, checkoutAppointment ? { ...settings, allowRegisterTab: true } : settings) && (
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
