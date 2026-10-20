import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { ConfirmModal } from './Modal.jsx';
import { PanelSaveButton } from './Button.jsx';
import SkeletonList, { useSearching } from './SkeletonList.jsx';
import { useFormGuard } from '../formGuard.js';
import { usePullToRefreshHandler } from '../pullToRefresh.js';
import { loadExpensesFromDatabase, saveExpenseToDatabase } from '../services.js';

const EXPENSE_PERIOD_OPTIONS = [
    { key: 'todos', label: 'Todos' },
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' }
];

const EXPENSE_CATEGORY_OPTIONS = [
    { key: 'todos', label: 'Todas' },
    { key: 'Insumos', label: 'Insumos' },
    { key: 'Servicios', label: 'Servicios' },
    { key: 'Comida', label: 'Comida' },
    { key: 'Gasto propio', label: 'Gasto propio' },
    { key: 'Otro', label: 'Otro' }
];

const CATEGORY_SELECT_OPTIONS = ['Insumos', 'Servicios', 'Comida', 'Gasto propio', 'Otro'];

const normalizeExpenseRecord = (item) => {
    return {
        id: item?.id || `exp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        fecha: item?.fecha || new Date().toISOString(),
        concepto: (item?.concepto || 'Gasto').toString().trim() || 'Gasto',
        categoria: (item?.categoria || 'Otro').toString().trim() || 'Otro',
        monto: Number(item?.monto) || 0,
        metodoPago: (item?.metodo_pago || item?.metodoPago || 'Efectivo').toString().trim() || 'Efectivo'
    };
};

const formatDateTime = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatPrice = (n) => Number(n || 0).toLocaleString('es-AR');

const todayISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const ExpensesPanel = ({ session, notify, showLoader }) => {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(false);

    const [concepto, setConcepto] = useState('');
    const [categoria, setCategoria] = useState('Otro');
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(todayISO());
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [submitting, setSubmitting] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    // Formulario de egreso abierto: cambiar de pestaña pide confirmación.
    useFormGuard(formOpen);
    const [confirmation, setConfirmation] = useState(null);
    const confirmBypassRef = useRef(false);

    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [period, setPeriod] = useState('todos');
    const [filterCategory, setFilterCategory] = useState('todos');
    const isSearching = useSearching(search);
    const expenseListRef = useRef(null);

    // Depende solo del authId (no del objeto `session` completo): si App
    // recrea el objeto sesión con los mismos datos, no disparamos otra carga.
    const authId = session?.authId;
    const loadExpenses = useCallback(async () => {
        if (!authId || !supabase) return;
        setLoading(true);
        try {
            const data = await loadExpensesFromDatabase();
            setExpenses(data.map(normalizeExpenseRecord));
        } catch (err) {
            console.error(err);
            if (notify) notify('No se pudo cargar el listado de gastos.', 'error');
        } finally {
            setLoading(false);
        }
    }, [authId, notify]);

    useEffect(() => {
        loadExpenses();
    }, [loadExpenses]);

    // Deslizar hacia abajo recarga el listado de gastos.
    usePullToRefreshHandler(loadExpenses);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        return expenses.filter((e) => {
            const concepto = (e.concepto || '').toLowerCase();
            const cat = (e.categoria || '').toLowerCase();
            if (q && !concepto.includes(q) && !cat.includes(q)) return false;

            if (filterCategory !== 'todos' && (e.categoria || '') !== filterCategory) return false;

            const d = new Date(e.fecha);
            if (period === 'hoy' && d < todayStart) return false;
            if (period === 'semana' && d < weekStart) return false;
            if (period === 'mes' && d < monthStart) return false;
            return true;
        });
    }, [expenses, search, filterCategory, period]);

    useEffect(() => {
        if (expenseListRef.current) {
            expenseListRef.current.scrollTop = 0;
        }
    }, [expenses, search, filterCategory, period]);

    const resetForm = () => {
        setConcepto('');
        setCategoria('Otro');
        setMonto('');
        setFecha(todayISO());
        setMetodoPago('Efectivo');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!session?.authId || !supabase) return;
        if (!concepto.trim() || !monto || Number(monto) <= 0) {
            if (notify) notify('Completá concepto y monto válidos.', 'error');
            return;
        }
        if (!confirmBypassRef.current) {
            setConfirmation({
                title: 'Registrar gasto',
                message: `¿Confirmás registrar el gasto de $${Number(monto).toLocaleString('es-AR')} por ${concepto.trim()}?`,
                action: () => handleSubmit({ preventDefault() {} })
            });
            return;
        }
        confirmBypassRef.current = false;

        setSubmitting(true);
        if (showLoader) showLoader(true, 'Guardando gasto...');
        try {
            const data = await saveExpenseToDatabase({
                    usuario_id: session.authId,
                    concepto: concepto.trim(),
                    categoria: categoria,
                    monto: Number(monto),
                    metodo_pago: metodoPago,
                    fecha: new Date(fecha).toISOString()
                });
            if (!data) throw new Error('Supabase no devolvió el gasto creado.');
            const newExpense = normalizeExpenseRecord(data);
            setExpenses((prev) => [newExpense, ...prev]);
            resetForm();
            setFormOpen(false);
            if (notify) notify('Gasto registrado con éxito.', 'success');
        } catch (err) {
            console.error(err);
            if (notify) notify(err?.message || 'No se pudo guardar el gasto.', 'error');
        } finally {
            setSubmitting(false);
            if (showLoader) showLoader(false);
        }
    };

    const paymentIcon = (method) => {
        const m = (method || '').toLowerCase();
        if (m === 'efectivo') return 'fa-money-bill-wave';
        return 'fa-mobile-screen-button';
    };

    const categoryIcon = (cat) => {
        const c = (cat || '').toLowerCase();
        if (c === 'insumos') return 'fa-flask';
        if (c === 'servicios') return 'fa-briefcase';
        if (c === 'comida') return 'fa-utensils';
        if (c.includes('propio')) return 'fa-user';
        return 'fa-receipt';
    };

    const closeExpenseForm = () => {
        const hasChanges = Boolean(
            concepto.trim() ||
            monto ||
            categoria !== 'Otro' ||
            metodoPago !== 'Efectivo' ||
            fecha !== todayISO()
        );
        if (!hasChanges) {
            setFormOpen(false);
            return;
        }
        setConfirmation({
            title: 'Descartar gasto',
            message: 'Hay datos sin guardar en el gasto. ¿Querés descartarlos?',
            action: () => {
                resetForm();
                setFormOpen(false);
            }
        });
    };

    const toggleExpenseForm = () => {
        if (formOpen) {
            closeExpenseForm();
            return;
        }
        setFormOpen(true);
    };

    return (
        <section id="tab-gastos" className="panel-stack view-enter">
            <div className={`section-title ${formOpen ? 'section-title-with-back' : 'section-title-with-action'}`}>
                <div className="section-title-text">
                    <h3>Registro de Gastos</h3>
                    <p>Controla tus egresos diarios para optimizar tu negocio.</p>
                </div>
                <button
                    type="button"
                    className={`btn btn-primary btn-sm panel-header-action mobile-icon-only${formOpen ? ' btn-back' : ''}`}
                    onClick={toggleExpenseForm}
                    aria-expanded={formOpen}
                    aria-controls="expense-registration-form"
                    aria-label={formOpen ? 'Volver' : 'Registrar nuevo gasto'}
                >
                    <i className={`fa-solid ${formOpen ? 'fa-arrow-left' : 'fa-plus'}`} aria-hidden="true" />
                    <span className="mobile-action-label">{formOpen ? 'Volver' : 'Nuevo'}</span>
                </button>
            </div>

            {formOpen && <div className="chart-section">
                <h4>Registrar Nuevo Gasto</h4>
                <form id="expense-registration-form" className="cute-form panel-form-spaced" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="expense-concept">Concepto / Descripción <span className="field-required">(obligatorio)</span></label>
                        <div className="input-wrapper">
                            <i className="fa-solid fa-pen input-icon"></i>
                            <input
                                type="text"
                                id="expense-concept"
                                placeholder="Ej: Luz, Esmaltes..."
                                value={concepto}
                                onChange={(e) => setConcepto(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="expense-category">Categoría</label>
                        <div className="input-wrapper">
                            <i className="fa-solid fa-tags input-icon"></i>
                            <select
                                id="expense-category"
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                required
                            >
                                {CATEGORY_SELECT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-row-2">
                        <div className="form-group">
                            <label htmlFor="expense-amount">Monto ($) <span className="field-required">(obligatorio)</span></label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-dollar-sign input-icon"></i>
                                <input
                                    type="number"
                                    id="expense-amount"
                                    placeholder="0"
                                    min="1"
                                    value={monto}
                                    onChange={(e) => setMonto(e.target.value)}
                                    inputMode="numeric"
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="expense-date">Fecha <span className="field-required">(obligatorio)</span></label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-calendar-day input-icon"></i>
                                <input
                                    type="date"
                                    id="expense-date"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Método de Pago</label>
                        <div className="payment-method-selector">
                            <label className="pay-btn">
                                <input
                                    type="radio"
                                    name="expense-payment-form"
                                    value="Efectivo"
                                    checked={metodoPago === 'Efectivo'}
                                    onChange={() => setMetodoPago('Efectivo')}
                                />
                                <div className="pay-btn-content">
                                    <i className="fa-solid fa-money-bill-wave pay-icon"></i>
                                    Efectivo
                                </div>
                            </label>
                            <label className="pay-btn">
                                <input
                                    type="radio"
                                    name="expense-payment-form"
                                    value="Transferencia"
                                    checked={metodoPago === 'Transferencia'}
                                    onChange={() => setMetodoPago('Transferencia')}
                                />
                                <div className="pay-btn-content">
                                    <i className="fa-solid fa-mobile-screen-button pay-icon"></i>
                                    Transferencia
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="form-actions">
                        <PanelSaveButton type="submit" busy={submitting} busyLabel="Guardando…" disabled={submitting} iconOnlyOnMobile={false} />
                    </div>
                </form>
            </div>}

            {!formOpen && <>
                <div className="filters-container">
                    <div className={`search-box-container${search ? ' has-text' : ''}`}>
                        <i className="fa-solid fa-magnifying-glass search-icon"></i>
                        <input
                            type="search"
                            placeholder="Buscar gasto..."
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
                        title="Filtrar gastos"
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        <i className="fa-solid fa-filter"></i>
                    </button>

                    {showFilters && (
                        <div className="filter-button-panel">
                            <div className="filter-button-group">
                                {EXPENSE_PERIOD_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`filter-choice ${period === opt.key ? 'active' : ''}`}
                                        onClick={() => setPeriod(opt.key)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="filter-button-group">
                                {EXPENSE_CATEGORY_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`filter-choice ${filterCategory === opt.key ? 'active' : ''}`}
                                        onClick={() => setFilterCategory(opt.key)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div ref={expenseListRef} id="expenses-list" className="expense-list unified-list list-scroll list-section-gap">
                    {(loading || isSearching) && <SkeletonList count={6} />}
                    {!loading && !isSearching && filtered.length === 0 && (
                        <div className="list-empty-state">
                            <p>No se encontraron gastos que coincidan con la búsqueda.</p>
                        </div>
                    )}

                    {!loading && !isSearching && filtered.map((exp) => (
                    <div key={exp.id} className="expense-card unified-card">
                        <div className="client-avatar expense-avatar" aria-hidden="true">
                            <i className={`fa-solid ${categoryIcon(exp.categoria)}`}></i>
                        </div>
                        <div className="card-details">
                            <div className="card-client expense-name">{exp.concepto}</div>
                            <div className="card-service expense-category">{exp.categoria}</div>
                            <div className="card-meta">
                                <span>
                                    <i className="fa-regular fa-calendar card-meta-icon"></i>
                                    {formatDateTime(exp.fecha)}
                                </span>
                                <span className="pay-badge" title="Método de pago">
                                    <i className={`fa-solid ${paymentIcon(exp.metodoPago)}`}></i>
                                    {' '}
                                    {exp.metodoPago}
                                </span>
                            </div>
                        </div>
                        <div className="card-amount-box">
                            <div className="card-price expense-amount">
                                -${formatPrice(exp.monto)}
                            </div>
                        </div>
                    </div>
                ))}
                </div>
            </>}

            <ConfirmModal
                open={!!confirmation}
                title={confirmation?.title}
                message={confirmation?.message}
                confirmText="Confirmar"
                onConfirm={() => {
                    const action = confirmation?.action;
                    setConfirmation(null);
                    confirmBypassRef.current = true;
                    if (action) action();
                }}
                onCancel={() => setConfirmation(null)}
            />
        </section>
    );
};

export default ExpensesPanel;
