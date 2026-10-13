import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import Button, { PanelSaveButton } from './Button.jsx';
import { ConfirmModal } from './Modal.jsx';
import SkeletonList, { useSearching } from './SkeletonList.jsx';
import { useFormGuard } from '../formGuard.js';
import { loadCashboxDataFromDatabase, saveCashMovementToDatabase } from '../services.js';

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function CashBoxesPanel({ session, notify, showLoader }) {
    const [movimientos, setMovimientos] = useState([]);
    const [totalEfectivo, setTotalEfectivo] = useState(0);
    const [totalMP, setTotalMP] = useState(0);

    const [tipo, setTipo] = useState('deposito');
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(todayISO());
    const [concepto, setConcepto] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    // Formulario de movimiento abierto: cambiar de pestaña pide confirmación.
    useFormGuard(formOpen);
    const [confirmation, setConfirmation] = useState(null);
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterTipo, setFilterTipo] = useState('todos');
    const isSearching = useSearching(search);

    const normalizedSearch = search.trim().toLowerCase();
    const movimientosFiltrados = movimientos.filter((m) => {
        const fechaStr = m.fecha ? String(m.fecha) : '';
        const texto = `${m.concepto || ''} ${m.tipo || ''} ${fechaStr}`.toLowerCase();
        const matchesSearch = !normalizedSearch || texto.includes(normalizedSearch);
        const matchesTipo = filterTipo === 'todos' || (m.tipo || '') === filterTipo;
        return matchesSearch && matchesTipo;
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        if (!supabase) return;
        showLoader && showLoader(true, 'Cargando caja...');
        try {
            const { services, movements, expenses } = await loadCashboxDataFromDatabase();

            let cash = 0;
            let mp = 0;

            if (Array.isArray(services)) {
                services.forEach(s => {
                    const metodo = (s.metodo_pago || 'transferencia').toLowerCase();
                    const neto = Math.max(0, Number(s.precio) - Number(s.sena));
                    if (metodo === 'efectivo') cash += neto;
                    else if (metodo === 'transferencia') mp += neto;
                    else if (metodo === 'fiado') {
                    }
                });
            }

            if (Array.isArray(expenses)) {
                expenses.forEach(g => {
                    const metodo = (g.metodo_pago || 'efectivo').toLowerCase();
                    const m = Number(g.monto) || 0;
                    if (metodo === 'efectivo') cash -= m;
                    else mp -= m;
                });
            }

            if (Array.isArray(movements)) {
                movements.forEach(m => {
                    const monto = Number(m.monto) || 0;
                    if (m.tipo === 'deposito') {
                        cash -= monto;
                        mp += monto;
                    } else if (m.tipo === 'retiro') {
                        cash += monto;
                        mp -= monto;
                    }
                });
                setMovimientos(movements);
            }

            setTotalEfectivo(Math.max(0, cash));
            setTotalMP(Math.max(0, mp));
        } catch (err) {
            console.warn('Error loading cashbox data:', err);
        } finally {
            showLoader && showLoader(false);
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        const montoNum = Number(monto);
        if (!montoNum || montoNum <= 0) {
            notify && notify('Ingresá un monto mayor a 0.', 'error');
            return;
        }
        if (!concepto.trim()) {
            notify && notify('Ingresá un concepto.', 'error');
            return;
        }

        setSubmitting(true);
        showLoader && showLoader(true, 'Guardando movimiento...');
        try {
            if (!supabase || !session?.authId) {
                throw new Error('Sin conexión a la nube.');
            }

            const origen = tipo === 'deposito' ? 'efectivo' : 'mp';
            const destino = tipo === 'deposito' ? 'mp' : 'efectivo';

            await saveCashMovementToDatabase({
                usuario_id: session.authId,
                fecha: fecha || todayISO(),
                tipo,
                monto: montoNum,
                concepto: concepto.trim(),
                origen,
                destino
            });

            notify && notify('Movimiento registrado con éxito', 'success');
            setMonto('');
            setConcepto('');
            setFecha(todayISO());
            setFormOpen(false);
            await loadData();
        } catch (err) {
            console.error('Error inserting movimiento:', err);
            notify && notify(err.message || 'No se pudo registrar el movimiento.', 'error');
        } finally {
            setSubmitting(false);
            showLoader && showLoader(false);
        }
    };

    const total = totalEfectivo + totalMP;

    const resetMovementForm = () => {
        setTipo('deposito');
        setMonto('');
        setConcepto('');
        setFecha(todayISO());
    };

    const closeMovementForm = () => {
        const hasChanges = Boolean(
            monto ||
            concepto.trim() ||
            tipo !== 'deposito' ||
            fecha !== todayISO()
        );
        if (!hasChanges) {
            setFormOpen(false);
            return;
        }
        setConfirmation({
            title: 'Descartar movimiento',
            message: 'Hay datos sin guardar en el movimiento. ¿Querés descartarlos?',
            action: () => {
                resetMovementForm();
                setFormOpen(false);
            }
        });
    };

    const toggleMovementForm = () => {
        if (formOpen) {
            closeMovementForm();
            return;
        }
        setFormOpen(true);
    };

    return (
        <div id="tab-cajas" className="tab-pane active">
            <ConfirmModal
                open={!!confirmation}
                title={confirmation?.title}
                message={confirmation?.message}
                onConfirm={() => {
                    const action = confirmation?.action;
                    setConfirmation(null);
                    action?.();
                }}
                onCancel={() => setConfirmation(null)}
            />
            <div className={`section-title ${formOpen ? 'section-title-with-back' : 'section-title-with-action'}`}>
                <div className="section-title-text">
                    <h3>Gestión de Caja</h3>
                    <p>Control de efectivo y medios de pago.</p>
                </div>
                <button
                    type="button"
                    className={`btn btn-primary btn-sm panel-header-action mobile-icon-only${formOpen ? ' btn-back' : ''}`}
                    onClick={toggleMovementForm}
                    aria-expanded={formOpen}
                    aria-controls="cash-movement-form"
                    aria-label={formOpen ? 'Volver' : 'Nuevo movimiento'}
                >
                    <i className={`fa-solid ${formOpen ? 'fa-arrow-left' : 'fa-plus'}`} aria-hidden="true" />
                    <span className="mobile-action-label">{formOpen ? 'Volver' : 'Nuevo'}</span>
                </button>
            </div>

            <div className="stats-cards-grid cash-total-grid">
                <div className="stat-card pink-glow cash-total-card">
                    <div className="stat-icon">
                        <i className="fa-solid fa-piggy-bank cash-pink-icon"></i>
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Dinero total</span>
                        <h2>${Number(total).toLocaleString("es-AR")}</h2>
                        <span className="stat-label cash-breakdown-label">
                            <i className="fa-solid fa-money-bill-wave cash-cash-icon"></i>
                            Efectivo: ${Number(totalEfectivo).toLocaleString("es-AR")}
                            <span className="cash-breakdown-separator">|</span>
                            <i className="fa-solid fa-mobile-screen-button cash-transfer-icon"></i>
                            Mercado Pago: ${Number(totalMP).toLocaleString("es-AR")}
                        </span>
                        <span className="cash-helper-text cash-helper-text--spaced">
                            Es la suma de tu plata en efectivo y en Mercado Pago, ya descontando los gastos.
                        </span>
                    </div>
                </div>
            </div>

            {formOpen && <div className="chart-section">
                <h4><i className="fa-solid fa-right-left panel-heading-icon"></i>Nuevo Movimiento</h4>
                <form id="cash-movement-form" className="cute-form caja-movement-form panel-form-top-spaced" onSubmit={handleSubmit}>
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Tipo de Movimiento</label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-arrow-trend-up input-icon"></i>
                                <select
                                    value={tipo}
                                    onChange={(e) => setTipo(e.target.value)}
                                >
                                    <option value="deposito">Depósito (Efectivo → Mercado Pago)</option>
                                    <option value="retiro">Extracción (Mercado Pago → Efectivo)</option>
                                </select>
                            </div>
                            <p className="cash-helper-text cash-helper-text--left">
                                Usá <strong>Depósito</strong> cuando pasás plata del efectivo a Mercado Pago, y <strong>Extracción</strong> cuando la retirás de Mercado Pago al efectivo.
                            </p>
                        </div>
                        <div className="form-group">
                            <label>Fecha <span className="field-required">(obligatorio)</span></label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-calendar-day input-icon"></i>
                                <input
                                    type="date"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Monto ($) <span className="field-required">(obligatorio)</span></label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-sack-dollar input-icon"></i>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={monto}
                                    onChange={(e) => setMonto(e.target.value)}
                                    placeholder="Ej. 15000"
                                    required
                                    inputMode="numeric"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Concepto <span className="field-required">(obligatorio)</span></label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-file-lines input-icon"></i>
                                <input
                                    type="text"
                                    value={concepto}
                                    onChange={(e) => setConcepto(e.target.value)}
                                    placeholder="Ej. Depósito banco"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <PanelSaveButton
                            type="submit"
                            label="Guardar"
                            iconOnlyOnMobile={false}
                            busy={submitting}
                            busyLabel="Guardando..."
                            disabled={submitting}
                        />
                    </div>
                </form>
            </div>}

            {!formOpen && (
                <div className="filters-container">
                    <div className={`search-box-container${search ? ' has-text' : ''}`}>
                        <i className="fa-solid fa-magnifying-glass search-icon"></i>
                        <input
                            type="search"
                            placeholder="Buscar movimiento..."
                            className="search-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                type="button"
                                className="search-clear-btn"
                                title="Limpiar búsqueda"
                                aria-label="Limpiar búsqueda"
                                onClick={() => setSearch('')}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="filter-toggle-btn"
                        title="Filtrar movimientos"
                        aria-label="Filtrar movimientos"
                        aria-expanded={showFilters}
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        <i className="fa-solid fa-filter"></i>
                    </button>
                    {showFilters && (
                        <div className="filter-button-panel">
                            <div className="filter-button-group">
                                {[
                                    { key: 'todos', label: 'Todos' },
                                    { key: 'deposito', label: 'Depósitos' },
                                    { key: 'retiro', label: 'Extracciones' }
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`filter-choice ${filterTipo === opt.key ? 'active' : ''}`}
                                        onClick={() => setFilterTipo(opt.key)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!formOpen && <div className="chart-section list-section-gap">
                <h4><i className="fa-solid fa-clock-rotate-left panel-heading-icon"></i>Movimientos Recientes</h4>
                <div className="day-appointments-container unified-list list-scroll list-section-gap">
                    {isSearching && <SkeletonList count={5} />}
                    {!isSearching && movimientosFiltrados.length === 0 ? (
                        <div className="list-empty-state">
                            <p>{movimientos.length === 0 ? 'No hay movimientos registrados todavía.' : 'No se encontraron movimientos que coincidan con la búsqueda.'}</p>
                        </div>
                    ) : (
                        !isSearching && movimientosFiltrados.map((m) => {
                            const isDeposito = m.tipo === 'deposito';
                            const dateObj = m.fecha ? new Date(String(m.fecha).includes('T') ? m.fecha : `${m.fecha}T00:00:00`) : new Date();
                            const fechaStr = isNaN(dateObj.getTime()) ? String(m.fecha) : dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return (
                                <div key={m.id || m.legacy_id} className="appointment-card unified-card">
                                    <div className="appointment-time-col">
                                        <div className={`appointment-time-start cash-movement-icon ${isDeposito ? 'is-deposit' : 'is-withdrawal'}`}>
                                            <i className={`fa-solid ${isDeposito ? 'fa-arrow-up-right-dots' : 'fa-arrow-down-wide-short'}`}></i>
                                        </div>
                                        <div className="appointment-time-duration">{fechaStr}</div>
                                    </div>
                                    <div className="appointment-info-col">
                                        <div className="appointment-client-name">
                                            {isDeposito ? 'Depósito a Mercado Pago' : 'Extracción de Mercado Pago'}
                                        </div>
                                        <div className="appointment-service-name">
                                            {m.concepto || 'Sin concepto'}
                                            <span className="cash-movement-separator">·</span>
                                            <span className="cash-movement-route">
                                                {isDeposito ? 'Efectivo' : 'Mercado Pago'} → {isDeposito ? 'Mercado Pago' : 'Efectivo'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="card-amount-box">
                                        <div className={`card-price cash-movement-amount ${isDeposito ? 'is-deposit' : 'is-withdrawal'}`}>
                                            ${Number(m.monto).toLocaleString("es-AR")}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>}
        </div>
    );
}

export default CashBoxesPanel;
