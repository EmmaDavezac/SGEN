import React from 'react';
import { MODO_SISTEMA, MODO_SUPEROSCURO } from '../theme.js';
import { NOMBRES_TEMAS } from '../businessConfig.js';
// Colores de tema disponibles solo para superadmin.
// 'barbie' se muestra como "Rosa" (NOMBRES_TEMAS).
const TEMAS_SUPERADMIN = ['barbie', 'azul', 'blanco', 'rojo'];

function SettingsPanel({
    settings = {},
    onChangeSettings,
    onChangeModo,
    onChangeTema,
    onChangeHeaderColor,
    onChangeNavColor,
    modo,
    tema,
    headerColor = false,
    navColor = false,
    isSuperadmin = false,
    notify,
}) {
    const { allowFiado, allowCajasTab, allowDaySearch, allowDayFilter } = settings;

    const handleToggle = (key, checked) => {
        if (typeof onChangeSettings === 'function') {
            onChangeSettings(key, checked);
        }
        if (typeof notify === 'function') {
            let msg = '';
            if (key === 'allowFiado') {
                msg = checked ? 'Cobros pendientes (fiado) habilitados' : 'Cobros pendientes (fiado) deshabilitados';
            } else if (key === 'allowCajasTab') {
                msg = checked ? 'Pestaña Cajas habilitada' : 'Pestaña Cajas oculta';
            } else if (key === 'allowDaySearch') {
                msg = checked ? 'Buscador de turnos habilitado' : 'Buscador de turnos deshabilitado';
            } else if (key === 'allowDayFilter') {
                msg = checked ? 'Filtro de turnos habilitado' : 'Filtro de turnos deshabilitado';
            }
            notify(msg, 'info');
        }
    };

    return (
        <section id="tab-ajustes" className="panel-stack view-enter">
            <div className="section-title">
                <div className="section-title-text">
                    <h3>Ajustes</h3>
                    <p>Personalizá las opciones de la aplicación.</p>
                </div>
            </div>

            <div className="chart-section">
                <h4><i className="fa-solid fa-sliders panel-heading-icon"></i>Preferencias Generales</h4>

                <div className="setting-row">
                    <span>
                        <i className="fa-solid fa-hand-holding-hand setting-icon setting-icon--danger"></i>
                        Habilitar cobros pendientes (fiado)
                    </span>
                    <label className="switch-toggle">
                        <input
                            type="checkbox"
                            checked={!!allowFiado}
                            onChange={(e) => handleToggle('allowFiado', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="setting-row">
                    <span>
                        <i className="fa-solid fa-vault setting-icon"></i>
                        Habilitar pestaña Cajas
                    </span>
                    <label className="switch-toggle">
                        <input
                            type="checkbox"
                            checked={!!allowCajasTab}
                            onChange={(e) => handleToggle('allowCajasTab', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="setting-row">
                    <span>
                        <i className="fa-solid fa-magnifying-glass setting-icon"></i>
                        Buscar turno (turnos del día)
                    </span>
                    <label className="switch-toggle">
                        <input
                            type="checkbox"
                            checked={!!allowDaySearch}
                            onChange={(e) => handleToggle('allowDaySearch', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="setting-row">
                    <span>
                        <i className="fa-solid fa-filter setting-icon"></i>
                        Filtrar turnos (turnos del día)
                    </span>
                    <label className="switch-toggle">
                        <input
                            type="checkbox"
                            checked={!!allowDayFilter}
                            onChange={(e) => handleToggle('allowDayFilter', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="setting-row">
                    <span>
                        <i className="fa-solid fa-palette setting-icon"></i>
                        Apariencia
                    </span>
                    <select
                        className="setting-select"
                        value={modo || MODO_SISTEMA}
                        onChange={(e) => onChangeModo(e.target.value)}
                    >
                        <option value={MODO_SISTEMA}>Seguir el dispositivo (sistema)</option>
                        <option value="claro">Claro</option>
                        <option value="oscuro">Oscuro</option>
                        {isSuperadmin && (
                            <option value={MODO_SUPEROSCURO}>Súper oscuro (superadmin)</option>
                        )}
                    </select>
                </div>

                {isSuperadmin && (
                    <>
                        <div className="setting-row">
                            <span>
                                <i className="fa-solid fa-droplet setting-icon"></i>
                                Color del tema (superadmin)
                            </span>
                            <select
                                className="setting-select"
                                value={tema || 'barbie'}
                                onChange={(e) => typeof onChangeTema === 'function' && onChangeTema(e.target.value)}
                            >
                                {TEMAS_SUPERADMIN.map((clave) => (
                                    <option key={clave} value={clave}>
                                        {NOMBRES_TEMAS[clave] || clave}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="setting-row">
                            <span>
                                <i className="fa-solid fa-paint-roller setting-icon"></i>
                                Header con color principal (superadmin)
                            </span>
                            <label className="switch-toggle">
                                <input
                                    type="checkbox"
                                    checked={!!headerColor}
                                    onChange={(e) => typeof onChangeHeaderColor === 'function' && onChangeHeaderColor(e.target.checked)}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>

                        <div className="setting-row">
                            <span>
                                <i className="fa-solid fa-paintbrush setting-icon"></i>
                                Navbar con color principal (superadmin)
                            </span>
                            <label className="switch-toggle">
                                <input
                                    type="checkbox"
                                    checked={!!navColor}
                                    onChange={(e) => typeof onChangeNavColor === 'function' && onChangeNavColor(e.target.checked)}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    </>
                )}
            </div>

            <div className="card-info-box">
                <h5><i className="fa-solid fa-circle-info panel-heading-icon"></i>Información</h5>
                <p>
                    Los ajustes se guardan localmente en este dispositivo. Si usás la app en varios celulares,
                    deberás configurar las preferencias en cada uno.
                </p>
            </div>
        </section>
    );
}

export default SettingsPanel;
