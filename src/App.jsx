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
import { ConfirmModal } from './components/Modal.jsx';

const SESSION_KEY = 'evolet_session_v4';
const SETTINGS_KEY = 'evolet_settings_v4';

const TABS_BASE = ['calendario', 'historial', 'clientes', 'gastos', 'estadisticas', 'cuenta'];
const TABS_ADMIN = ['precios', 'ajustes'];
const TABS_ADMIN_CON_SETTING = ['cajas', 'registrar'];
const DEFAULT_TAB = 'calendario';

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
    const initialTab = isValidTab('calendario', initialIsAdmin, initialSettings) ? 'calendario' : DEFAULT_TAB;
    const [activeTab, setActiveTab] = useState(initialTab);
    const [checkoutAppointment, setCheckoutAppointment] = useState(null);

    const [settings, setSettings] = useState(() => initialSettings);

    const [profileEditing, setProfileEditing] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');

    const [passwordEditing, setPasswordEditing] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

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
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    const isAdmin = session && session.rol === 'admin';
    useEffect(() => {
        const tabSettings = checkoutAppointment
            ? { ...settings, allowRegisterTab: true }
            : settings;
        if (!isValidTab(activeTab, isAdmin, tabSettings)) {
            setActiveTab(DEFAULT_TAB);
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

            {!session ? (
                <section className="login-screen active" aria-label="Login de Evolet Nails">
                    <div className="sparkles-bg" aria-hidden="true" />
                    <div className="login-card">
                        <div className="brand-logo-container">
                            <div className="logo-circle">
                                <img
                                    id="logo-img"
                                    src="/public/logo.png"
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
                        </form>
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
                                notify('¡Servicio registrado con éxito!', 'success');
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
                        />
                    )}

                    {activeTab === 'cuenta' && (
                        <div id="tab-cuenta" className="tab-pane active">
                            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                <div>
                                    <h3>Mi cuenta</h3>
                                    <p>Actualizá tus datos de perfil.</p>
                                </div>
                                {!profileEditing ? (
                                    <button 
                                        type="button" 
                                        id="account-edit-btn" 
                                        className="btn btn-secondary btn-sm"
                                        style={{ width: 'auto', padding: '8px 16px', whiteSpace: 'nowrap', fontSize: '13px' }}
                                        onClick={() => setProfileEditing(true)}
                                        disabled={passwordEditing}
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i> Editar
                                    </button>
                                ) : (
                                    <div id="account-actions-container" style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            type="button" 
                                            id="account-cancel-btn" 
                                            className="btn btn-secondary btn-sm"
                                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
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
                                            className="btn btn-primary btn-sm"
                                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
                                            onClick={handleProfileSave}
                                        >
                                            <i className="fa-solid fa-floppy-disk"></i> Guardar
                                        </button>
                                    </div>
                                )}
                            </div>

                            <form id="account-form" className="cute-form account-readonly-form" style={{ marginBottom: '15px' }} onSubmit={handleProfileSave}>
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
                                    className="btn btn-secondary btn-block" 
                                    style={{ marginBottom: '25px' }}
                                    onClick={() => setPasswordEditing(true)}
                                    disabled={profileEditing}
                                >
                                    <i className="fa-solid fa-key"></i> Actualizar contraseña
                                </button>
                            ) : (
                                <form id="account-password-form" className="cute-form account-security-section" onSubmit={handlePasswordSave}>
                                    <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '15px', borderBottom: 'none', paddingBottom: 0 }}>
                                        <h4 style={{ margin: 0, fontFamily: 'Comfortaa, sans-serif', fontSize: '16px', color: 'var(--barbie-pink)' }}>Cambiar contraseña</h4>
                                        <div id="account-password-actions-container" style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                type="button" 
                                                id="account-password-cancel-btn" 
                                                className="btn btn-secondary btn-sm"
                                                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
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
                                                className="btn btn-primary btn-sm"
                                                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
                                            >
                                                <i className="fa-solid fa-floppy-disk"></i> Guardar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ position: 'relative' }}>
                                        <label htmlFor="account-current-password">Contraseña actual</label>
                                        <div style={{ position: 'relative', width: '100%' }}>
                                            <i className="fa-solid fa-shield-halved input-icon" />
                                            <input 
                                                type={showCurrentPassword ? 'text' : 'password'} 
                                                id="account-current-password" 
                                                minLength="6" 
                                                required
                                                placeholder="Ingresá tu contraseña actual" 
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                style={{ paddingRight: '45px' }}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn" 
                                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10, padding: '4px' }}
                                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            >
                                                <i className={`fa-solid ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ position: 'relative' }}>
                                        <label htmlFor="account-password">Nueva contraseña</label>
                                        <div style={{ position: 'relative', width: '100%' }}>
                                            <i className="fa-solid fa-lock input-icon" />
                                            <input 
                                                type={showNewPassword ? 'text' : 'password'} 
                                                id="account-password" 
                                                minLength="8" 
                                                required
                                                placeholder="Mínimo 8 caracteres" 
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                style={{ paddingRight: '45px' }}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn" 
                                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10, padding: '4px' }}
                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                            >
                                                <i className={`fa-solid ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ position: 'relative' }}>
                                        <label htmlFor="account-confirm-password">Confirmar nueva contraseña</label>
                                        <div style={{ position: 'relative', width: '100%' }}>
                                            <i className="fa-solid fa-lock-open input-icon" />
                                            <input 
                                                type={showConfirmPassword ? 'text' : 'password'} 
                                                id="account-confirm-password" 
                                                minLength="8" 
                                                required
                                                placeholder="Repetí la nueva contraseña" 
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                style={{ paddingRight: '45px' }}
                                            />
                                            <button 
                                                type="button" 
                                                className="password-reveal-btn" 
                                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10, padding: '4px' }}
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
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '14px'
                        }}>
                            <div style={{
                                width: '110px',
                                height: '110px',
                                borderRadius: '50%',
                                background: 'rgba(255, 20, 147, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px dashed rgba(255, 20, 147, 0.35)'
                            }}>
                                <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '42px', color: 'var(--barbie-pink)' }}></i>
                            </div>
                            <h3 style={{ margin: 0, fontFamily: 'Comfortaa, sans-serif', color: 'var(--barbie-pink)', fontSize: '22px' }}>
                                Sección no encontrada
                            </h3>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', maxWidth: '360px' }}>
                                La pestaña que buscaste no existe o no tenés permiso para acceder. Volvamos al inicio.
                            </p>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setActiveTab(DEFAULT_TAB)}
                                style={{ marginTop: '6px', padding: '10px 20px' }}
                            >
                                <i className="fa-solid fa-house" style={{ marginRight: '6px' }}></i>
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
