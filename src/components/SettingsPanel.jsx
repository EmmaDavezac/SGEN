import React from 'react';

function SettingsPanel({ settings = {}, onChangeSettings, notify, onBack }) {
    const { allowFiado, allowRegisterTab, allowCajasTab } = settings;

    const handleToggle = (key, checked) => {
        if (typeof onChangeSettings === 'function') {
            onChangeSettings(key, checked);
        }
        if (typeof notify === 'function') {
            let msg = '';
            if (key === 'allowFiado') {
                msg = checked ? 'Cobros pendientes (fiado) habilitados' : 'Cobros pendientes (fiado) deshabilitados';
            } else if (key === 'allowRegisterTab') {
                msg = checked ? 'Pestaña Registrar visible' : 'Pestaña Registrar oculta';
            } else if (key === 'allowCajasTab') {
                msg = checked ? 'Pestaña Cajas habilitada' : 'Pestaña Cajas oculta';
            }
            notify(msg, 'info');
        }
    };

    return (
        <div id="tab-ajustes" className="tab-pane active">
            <div className="section-title section-title-with-action">
                <div>
                    <h3>Ajustes</h3>
                    <p>Personalizá las opciones de la aplicación.</p>
                </div>
                {onBack && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-back"
                        onClick={onBack}
                    >
                        <i className="fa-solid fa-arrow-left" /> Volver
                    </button>
                )}
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
                        <i className="fa-solid fa-circle-plus setting-icon"></i>
                        Mostrar siempre pestaña Registrar
                    </span>
                    <label className="switch-toggle">
                        <input
                            type="checkbox"
                            checked={!!allowRegisterTab}
                            onChange={(e) => handleToggle('allowRegisterTab', e.target.checked)}
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
            </div>

            <div className="card-info-box">
                <h5><i className="fa-solid fa-circle-info panel-heading-icon"></i>Información</h5>
                <p>
                    Los ajustes se guardan localmente en este dispositivo. Si usás la app en varios celulares,
                    deberás configurar las preferencias en cada uno.
                </p>
            </div>
        </div>
    );
}

export default SettingsPanel;
