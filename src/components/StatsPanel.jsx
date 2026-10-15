import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePullToRefreshHandler } from '../pullToRefresh.js';
import SkeletonList, { useSearching } from './SkeletonList.jsx';
import { supabase } from '../supabase.js';
import { completePendingPayment, loadExpensesFromDatabase, loadServicesFromDatabase, saveExpenseToDatabase } from '../services.js';
import Modal, { ConfirmModal, ModalCancelButton, ModalConfirmButton } from '../components/Modal.jsx';
import { ListIconButton } from './Button.jsx';

const INCOME_CATEGORIES = ['semi', 'kapping', 'softgel', 'esculpidas', 'personalizado', 'remocion'];
const INCOME_CATEGORY_LABELS = {
    semi: 'Semi',
    kapping: 'Kapping',
    softgel: 'Softgel',
    esculpidas: 'Esculpidas',
    personalizado: 'Personalizado',
    remocion: 'Remoción'
};

const EXPENSE_CATEGORY_OPTIONS = ['Insumos', 'Servicios', 'Comida', 'Gasto propio', 'Otro'];

const normalizeCategory = (value) => {
    const normalized = (value || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes('semi')) return 'semi';
    if (normalized.includes('kapping')) return 'kapping';
    if (normalized.includes('softgel') || normalized.includes('soft gel')) return 'softgel';
    if (normalized.includes('esculpid')) return 'esculpidas';
    if (normalized.includes('personal') || normalized.includes('otro')) return 'personalizado';
    if (normalized.includes('remoc') || normalized.includes('retiro')) return 'remocion';
    return normalized;
};

const normalizePaymentMethod = (raw) => {
    const key = (raw || '').toString().trim().toLowerCase();
    const map = {
        efectivo: 'Efectivo',
        transferencia: 'Transferencia',
        combinado: 'Combinado',
        fiado: 'Fiado'
    };
    return map[key] || raw || 'Transferencia';
};

const normalizeServiceRecord = (item) => {
    return {
        id: item?.legacy_id || item?.id || `svc_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        rawId: item?.id,
        turnoId: item?.turno_id || null,
        clienteId: item?.cliente_id || null,
        fecha: item?.fecha || new Date().toISOString(),
        cliente: item?.clientes?.nombre || item?.cliente || 'Cliente',
        servicio: item?.servicio || 'Servicio',
        categoria: item?.categoria || 'Otro',
        precio: Number(item?.precio) || 0,
        sena: Number(item?.sena) || 0,
        vuelto: Number(item?.vuelto) || 0,
        metodoPago: normalizePaymentMethod(item?.metodo_pago || item?.metodoPago),
        montoEfectivo: Number(item?.monto_efectivo ?? item?.montoEfectivo) || 0,
        montoTransferencia: Number(item?.monto_transferencia ?? item?.montoTransferencia) || 0,
        saldoPendiente: Number(item?.saldo_pendiente ?? item?.saldoPendiente) || 0
    };
};

/**
 * Deuda pendiente de un servicio: 0 si ya está cobrado.
 * - Fiado puro: precio menos la seña (la seña ya se cobró al reservar).
 * - Combinado: la porción fiada que quedó al registrar.
 */
const pendingAmountOf = (svc) => {
    const metodo = (svc?.metodoPago || '').toLowerCase();
    if (metodo === 'combinado') return Math.max(0, Number(svc?.saldoPendiente) || 0);
    if (metodo === 'fiado') return Math.max(0, Number(svc?.precio || 0) - Number(svc?.sena || 0));
    return 0;
};

/**
 * Cuánto dinero entró realmente por un servicio (para los KPI de ingresos):
 * - Fiado puro: nada todavía (todo queda como pendiente).
 * - Combinado: lo cobrado en efectivo + transferencia, más la seña previa.
 * - Resto: precio completo.
 */
const collectedAmountOf = (svc) => {
    const metodo = (svc?.metodoPago || '').toLowerCase();
    if (metodo === 'fiado') return 0;
    if (metodo === 'combinado') {
        return (Number(svc?.montoEfectivo) || 0)
            + (Number(svc?.montoTransferencia) || 0)
            + (Number(svc?.sena) || 0);
    }
    return Number(svc?.precio) || 0;
};

const normalizeExpenseRecord = (item) => {
    return {
        id: item?.id || `exp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        fecha: item?.fecha || new Date().toISOString(),
        concepto: item?.concepto || 'Gasto',
        categoria: item?.categoria || 'Otro',
        monto: Number(item?.monto) || 0,
        metodoPago: (item?.metodo_pago || item?.metodoPago || 'Efectivo').toString().trim()
    };
};

const formatPrice = (n) => Number(n || 0).toLocaleString('es-AR');

// Cuenta progresiva: anima un número desde su valor actual hasta `target` con
// una curva ease-out. Al montar arranca en 0 y, si el objetivo cambia (refresh
// de datos), re-anima desde la cifra que se está mostrando en lugar de reiniciar.
function useCountUp(target, duration = 900) {
    const goal = Number(target) || 0;
    const [value, setValue] = useState(0);
    const valueRef = useRef(0);
    const rafRef = useRef(null);

    useEffect(() => {
        const from = valueRef.current;
        if (from === goal) return undefined;

        let start = null;
        const step = (now) => {
            if (start === null) start = now;
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            const current = from + (goal - from) * eased;
            valueRef.current = current;
            setValue(current);
            if (t < 1) rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [goal, duration]);

    return value;
}

// Cifra KPI animada. `numeric` es el valor objetivo y `prefix` el signo a
// mostrar ('$' para montos, '' para contadores). Reutiliza formatPrice para que
// el formato de miles coincida con el resto del sistema.
function AnimatedStatValue({ numeric, prefix = '$', duration = 900 }) {
    const animated = useCountUp(numeric, duration);
    return <>{prefix}{formatPrice(Math.round(animated))}</>;
}

// Barra de distribución animada: arranca en 0% y crece hasta `percent` al
// montarse. La transición de ancho vive en el estilo inline (coherente con
// useCountUp); el requestAnimationFrame garantiza un repintado en 0 antes de
// fijar el ancho final, de modo que la animación se dispara también en el
// primer render y al refrescar los datos (React reutilizaría el nodo y una
// transición CSS plana no arrancaría desde 0 en el montaje).
function AnimatedProgressBar({ percent, className = '', duration = 900 }) {
    const target = Math.max(0, Math.min(100, Number(percent) || 0));
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setWidth(target));
        return () => cancelAnimationFrame(raf);
    }, [target]);

    return (
        <div
            className={`progress ${className}`.trim()}
            style={{ width: `${width}%`, transition: `width ${duration}ms ease-out` }}
        ></div>
    );
}

const summarizeService = (services) => {
    const names = [...new Set(services.map((service) => service.servicio).filter(Boolean))];
    if (names.length === 0) return 'Servicio pendiente';
    const summary = names.slice(0, 2).map((name) => name.length > 28 ? `${name.slice(0, 28)}…` : name).join(' + ');
    return names.length > 2 ? `${summary} + ${names.length - 2} más` : summary;
};

const isSameMonth = (dateValue, ref) => {
    const d = new Date(dateValue);
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
};

const isSameWeek = (dateValue, ref) => {
    const d = new Date(dateValue);
    const weekAgo = new Date(ref);
    weekAgo.setDate(ref.getDate() - 7);
    return d >= weekAgo && d <= ref;
};

const isWithinLast30Days = (dateValue, ref) => {
    const date = new Date(dateValue);
    const start = new Date(ref);
    start.setDate(start.getDate() - 30);
    return date >= start && date <= ref;
};

const StatsPanel = ({ session, notify, showLoader, runTask }) => {
    const [services, setServices] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(false);

    const [payConfirmOpen, setPayConfirmOpen] = useState(false);
    const [payDetailsOpen, setPayDetailsOpen] = useState(false);
    const [debtorToPay, setDebtorToPay] = useState(null);
    const [payMethod, setPayMethod] = useState('Efectivo');
    const [payAmount, setPayAmount] = useState('');
    const [returnMethod, setReturnMethod] = useState('Efectivo');
    const [paying, setPaying] = useState(false);
    const [payDiscardConfirmOpen, setPayDiscardConfirmOpen] = useState(false);
    const [search, setSearch] = useState('');
    const isSearching = useSearching(search);
    const [showFilters, setShowFilters] = useState(false);
    const [debtOrder, setDebtOrder] = useState('mayor');
    const payInitialRef = React.useRef(null);

    const now = new Date();

    const refreshServices = async () => {
        if (!session?.authId || !supabase) return;
        setLoading(true);
        try {
            const [servicesData, expensesData] = await Promise.all([
                loadServicesFromDatabase(),
                loadExpensesFromDatabase()
            ]);
            setServices(servicesData.map(normalizeServiceRecord));
            setExpenses(expensesData.map(normalizeExpenseRecord));
        } catch (err) {
            console.error('Error cargando estadísticas:', err);
        } finally {
            setLoading(false);
        }
    };

    // Deslizar hacia abajo recarga servicios y gastos de las estadísticas.
    usePullToRefreshHandler(refreshServices);

    useEffect(() => {
        let ignore = false;

        const load = async () => {
            if (!session?.authId || !supabase) return;
            setLoading(true);
            try {
                const [servicesData, expensesData] = await Promise.all([
                    loadServicesFromDatabase(),
                    loadExpensesFromDatabase()
                ]);

                const normalizedSvcs = servicesData.map(normalizeServiceRecord);
                const normalizedExps = expensesData.map(normalizeExpenseRecord);

                if (!ignore) {
                    setServices(normalizedSvcs);
                    setExpenses(normalizedExps);
                }
            } catch (err) {
                console.error('Error cargando estadísticas:', err);
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        load();
        return () => { ignore = true; };
    }, [session]);

    const stats = useMemo(() => {
        const recentServices = services.filter((s) => isWithinLast30Days(s.fecha, now));
        const recentExpenses = expenses.filter((e) => isWithinLast30Days(e.fecha, now));

        const sum = (arr, key) => arr.reduce((acc, x) => acc + Number(x[key] || 0), 0);

        // Ingresos = dinero realmente cobrado. Los fiados puros no aportan y
        // los combinados solo su porción cobrada (+ seña previa).
        const recentIncome = recentServices.reduce((acc, s) => acc + collectedAmountOf(s), 0);
        const recentFiado = recentServices.reduce((acc, s) => acc + pendingAmountOf(s), 0);
        const recentExpenseTotal = sum(recentExpenses, 'monto');
        const netBalance = recentIncome - recentExpenseTotal;
        const ticketCount = recentServices.filter((s) => collectedAmountOf(s) > 0).length;
        const avgTicket = ticketCount > 0 ? recentIncome / ticketCount : 0;

        return {
            recentIncome,
            recentFiado,
            recentExpenseTotal,
            netBalance,
            recentServicesCount: recentServices.length,
            avgTicket,
            recentServices,
            recentExpenses
        };
    }, [services, expenses, now]);

    const debtors = useMemo(() => {
        const map = new Map();
        stats.recentServices
            .filter((s) => pendingAmountOf(s) > 0)
            .forEach((s) => {
                const key = s.cliente || 'Sin nombre';
                if (!map.has(key)) {
                    map.set(key, { cliente: key, total: 0, servicios: [] });
                }
                const entry = map.get(key);
                entry.total += pendingAmountOf(s);
                entry.servicios.push(s);
            });
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [services]);

    const debtorsFiltrados = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = !query ? [...debtors] : debtors.filter((d) =>
            d.cliente.toLowerCase().includes(query)
            || d.servicios.some((s) => (s.servicio || '').toLowerCase().includes(query))
        );
        return filtered.sort((a, b) => debtOrder === 'mayor' ? b.total - a.total : a.total - b.total);
    }, [debtors, search, debtOrder]);

    const incomeByCategory = useMemo(() => {
        const totals = {};
        INCOME_CATEGORIES.forEach((c) => { totals[c] = 0; });
        stats.recentServices
            .forEach((s) => {
                const cobrado = collectedAmountOf(s);
                if (cobrado <= 0) return;
                const cat = normalizeCategory(s.categoria);
                if (totals[cat] !== undefined) {
                    totals[cat] += cobrado;
                } else {
                    totals.personalizado += cobrado;
                }
            });
        const entries = Object.entries(totals).map(([key, val]) => ({ key, label: INCOME_CATEGORY_LABELS[key] || key, value: val }));
        const max = Math.max(1, ...entries.map((e) => e.value));
        return entries.map((e) => ({ ...e, percent: (e.value / max) * 100 }));
    }, [stats.recentServices]);

    const expensesByCategory = useMemo(() => {
        const totals = {};
        EXPENSE_CATEGORY_OPTIONS.forEach((c) => { totals[c] = 0; });
        stats.recentExpenses.forEach((e) => {
            const cat = e.categoria || 'Otro';
            if (totals[cat] !== undefined) {
                totals[cat] += Number(e.monto || 0);
            } else {
                totals['Otro'] += Number(e.monto || 0);
            }
        });
        const entries = Object.entries(totals).map(([key, val]) => ({ key, label: key, value: val }));
        const max = Math.max(1, ...entries.map((e) => e.value));
        return entries.map((e) => ({ ...e, percent: (e.value / max) * 100 }));
    }, [stats.recentExpenses]);

    const confirmPayDebtor = async () => {
        if (!debtorToPay || !supabase || !session?.authId) return;
        setPaying(true);
        const ids = debtorToPay.servicios.map((s) => s.rawId || s.id);
        const change = Math.max(0, (Number(payAmount) || 0) - debtorToPay.total);
        try {
            await runTask({
                title: 'Registrando cobro',
                steps: [
                    {
                        // Solo hay vuelto si el monto entregado supera la deuda.
                        label: 'Registrando el vuelto',
                        run: async () => {
                            if (change <= 0) return;
                            await saveExpenseToDatabase({
                                usuario_id: session.authId,
                                fecha: new Date().toISOString().slice(0, 10),
                                concepto: `Vuelto de ${debtorToPay.cliente}`,
                                monto: change,
                                metodo_pago: returnMethod.toLowerCase(),
                                categoria: 'Vuelto'
                            });
                        }
                    },
                    {
                        label: 'Cancelando la deuda',
                        run: async () => {
                            await Promise.all(ids.map((serviceId, index) => {
                                const match = services.find((service) => (service.rawId || service.id) === serviceId);
                                if (!match) return;
                                const esCombinado = (match.metodoPago || '').toLowerCase() === 'combinado';
                                // Cada servicio se salda por su deuda real: en el
                                // combinado solo falta su porción fiada; en el fiado
                                // puro, precio menos la seña.
                                const deuda = pendingAmountOf(match);
                                return completePendingPayment({
                                    serviceId,
                                    serviceOverride: {
                                        id: match.rawId || match.id,
                                        legacy_id: match.id,
                                        turno_id: match.turnoId || null,
                                        cliente_id: match.clienteId || null,
                                        fecha: match.fecha,
                                        servicio: match.servicio,
                                        precio: match.precio,
                                        metodo_pago: payMethod.toLowerCase(),
                                        monto_efectivo: match.montoEfectivo || 0,
                                        monto_transferencia: match.montoTransferencia || 0,
                                        saldo_pendiente: match.saldoPendiente || 0,
                                        completado: true
                                    },
                                    paymentMethod: payMethod.toLowerCase(),
                                    amount: deuda,
                                    combined: esCombinado,
                                    vuelto: index === 0 ? change : 0,
                                    finalizeTurno: true,
                                    usuarioId: session.authId
                                });
                            }));
                        }
                    },
                    {
                        label: 'Actualizando el resumen',
                        run: async () => {
                            setServices((prev) =>
                                prev.map((x) => {
                                    const index = ids.indexOf(x.rawId || x.id);
                                    if (index === -1) return x;
                                    const esCombinado = (x.metodoPago || '').toLowerCase() === 'combinado';
                                    return esCombinado
                                        ? {
                                            ...x,
                                            montoEfectivo: payMethod === 'Efectivo'
                                                ? (x.montoEfectivo || 0) + pendingAmountOf(x)
                                                : x.montoEfectivo,
                                            montoTransferencia: payMethod === 'Transferencia'
                                                ? (x.montoTransferencia || 0) + pendingAmountOf(x)
                                                : x.montoTransferencia,
                                            saldoPendiente: 0,
                                            vuelto: index === 0 ? change : 0
                                        }
                                        : { ...x, metodoPago: payMethod, vuelto: index === 0 ? change : 0, completado: true };
                                })
                            );
                            await refreshServices();
                        }
                    }
                ]
            });

            if (notify) notify('Cobro registrado y pago pendiente actualizado.', 'success');
            setPayConfirmOpen(false);
            setDebtorToPay(null);
        } catch (err) {
            console.error(err);
            if (notify) notify(err?.message || 'No se pudo actualizar el pago pendiente.', 'error');
        } finally {
            setPaying(false);
        }
    };

    const requestPayDebtor = (debtor) => {
        setDebtorToPay(debtor);
        setPayMethod('Efectivo');
        setReturnMethod('Efectivo');
        setPayAmount(String(debtor.total));
        payInitialRef.current = JSON.stringify({ amount: String(debtor.total), method: 'Efectivo', returnMethod: 'Efectivo' });
        setPayDetailsOpen(true);
    };

    const submitPayDetails = (event) => {
        event.preventDefault();
        const amount = Number(payAmount) || 0;
        if (!debtorToPay || amount < debtorToPay.total) {
            return;
        }
        setPayDetailsOpen(false);
        setPayConfirmOpen(true);
    };

    const discardPayDetails = () => {
        setPayDiscardConfirmOpen(false);
        setPayDetailsOpen(false);
        setPayConfirmOpen(false);
        setDebtorToPay(null);
        setPayAmount('');
    };

    const cancelPay = () => {
        if (paying) return;
        if (payDetailsOpen && payInitialRef.current) {
            const current = JSON.stringify({ amount: payAmount, method: payMethod, returnMethod });
            if (current !== payInitialRef.current) {
                setPayDiscardConfirmOpen(true);
                return;
            }
        }
        setPayDetailsOpen(false);
        setPayConfirmOpen(false);
        setDebtorToPay(null);
        setPayAmount('');
    };

    const kpiCards = [
        {
            id: 'kpi-month-income',
            icon: 'fa-arrow-trend-up',
            iconColor: 'var(--barbie-pink)',
            label: 'Recaudado últimos 30 días',
            numeric: Number(stats.recentIncome) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-pending',
            icon: 'fa-hand-holding-hand',
            iconColor: '#ff4d4d',
            label: 'Pagos pendientes últimos 30 días',
            numeric: Number(stats.recentFiado) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-month-expenses',
            icon: 'fa-arrow-trend-down',
            iconColor: '#ff4d4d',
            label: 'Gastos últimos 30 días',
            numeric: Number(stats.recentExpenseTotal) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-net-balance',
            icon: 'fa-scale-balanced',
            iconColor: 'var(--gold)',
            label: 'Balance Neto',
            numeric: Number(stats.netBalance) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-week-income',
            icon: 'fa-regular fa-calendar',
            iconColor: 'var(--barbie-pink)',
            label: 'Ingresos últimos 30 días',
            numeric: Number(stats.recentIncome) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-week-expenses',
            icon: 'fa-receipt',
            iconColor: '#ff4d4d',
            label: 'Gastos últimos 30 días',
            numeric: Number(stats.recentExpenseTotal) || 0,
            prefix: '$'
        },
        {
            id: 'kpi-services-month',
            icon: 'fa-star',
            iconColor: 'var(--gold)',
            label: 'Servicios últimos 30 días',
            numeric: Number(stats.recentServicesCount) || 0,
            prefix: ''
        },
        {
            id: 'kpi-average-ticket',
            icon: 'fa-hand-holding-dollar',
            iconColor: 'var(--barbie-pink)',
            label: 'Ticket Promedio',
            numeric: Number(stats.avgTicket) || 0,
            prefix: '$'
        }
    ];

    return (
        <section id="tab-estadisticas" className="panel-stack view-enter">
            <ConfirmModal
                open={payDiscardConfirmOpen}
                title="Descartar cobro"
                message="Hay datos sin confirmar en el cobro pendiente. ¿Querés descartarlos?"
                confirmText="Descartar"
                confirmVariant="danger"
                onConfirm={discardPayDetails}
                onCancel={() => setPayDiscardConfirmOpen(false)}
            />
            <div className="section-title">
                <h3>Estadísticas Evolet</h3>
                <p>Tus finanzas brillando y en orden.</p>
            </div>

            <div className="stats-cards-grid">
                {kpiCards.map((kpi) => (
                    <div key={kpi.id} id={kpi.id} className="stat-card pink-glow">
                        <span className="stat-icon">
                            <i className={`fa-solid ${kpi.icon} stats-kpi-icon ${kpi.id}`}></i>
                        </span>
                        <div className="stat-info">
                            <span className="stat-label">{kpi.label}</span>
                            <h2><AnimatedStatValue numeric={kpi.numeric} prefix={kpi.prefix} /></h2>
                        </div>
                    </div>
                ))}
            </div>

            {debtors.length > 0 && (
                <>
                    <div className="filters-container">
                        <div className={`search-box-container${search ? ' has-text' : ''}`}>
                            <i className="fa-solid fa-magnifying-glass search-icon"></i>
                            <input
                                type="search"
                                placeholder="Buscar cliente..."
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
                            title="Filtrar deudores"
                            aria-label="Filtrar deudores"
                            aria-expanded={showFilters}
                            onClick={() => setShowFilters((v) => !v)}
                        >
                            <i className="fa-solid fa-filter"></i>
                        </button>
                        {showFilters && (
                            <div className="filter-button-panel">
                                <div className="filter-button-group">
                                    {[
                                        { key: 'mayor', label: 'Mayor deuda' },
                                        { key: 'menor', label: 'Menor deuda' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            className={`filter-choice ${debtOrder === opt.key ? 'active' : ''}`}
                                            onClick={() => setDebtOrder(opt.key)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="chart-section stats-panel list-section-gap">
                        <div className="panel-subsection-header pending-debtors-header">
                            <h4 className="panel-subsection-title">Clientes con pagos pendientes</h4>
                        </div>
                        <div className="day-appointments-container unified-list list-scroll list-section-gap">
                            {(loading || isSearching) && <SkeletonList count={5} />}
                            {!loading && !isSearching && debtorsFiltrados.length === 0 ? (
                                <div className="list-empty-state"><p>No se encontraron clientes que coincidan con la búsqueda.</p></div>
                            ) : (
                                !loading && !isSearching && debtorsFiltrados.map((d) => (
                                    <div key={d.cliente} className="appointment-card client-card pending-debtor-card unified-card">
                                        <div className="client-avatar" aria-hidden="true">
                                            <i className="fa-solid fa-user"></i>
                                        </div>
                                        <div className="appointment-info-col client-info-col">
                                            <div className="appointment-client-name">{d.cliente}</div>
                                            <div className="appointment-service-name client-contact-row">
                                                {summarizeService(d.servicios)} · {d.servicios.length} servicio{d.servicios.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <div className="client-actions-col pending-debtor-actions">
                                            <div className="card-price pending-debtor-amount">
                                                ${formatPrice(d.total)}
                                            </div>
                                            <ListIconButton
                                                icon="fa-sack-dollar"
                                                label="Cobrar"
                                                title={`Cobrar a ${d.cliente}`}
                                                variant="success"
                                                onClick={() => requestPayDebtor(d)}
                                                aria-label={`Cobrar a ${d.cliente}`}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            <div className="stats-distribution-grid">
                <div className="chart-section stats-panel stats-distribution-section">
                    <h4>Distribución de Ingresos de los últimos 30 días</h4>
                    <div className="payment-stats-container">
                        {incomeByCategory.map((row) => (
                            <div key={row.key} className="payment-stat-row">
                                <span className="payment-stat-label">{row.label}</span>
                                <div className="payment-progress-bar">
                                    <AnimatedProgressBar
                                        percent={row.percent}
                                        className="income-progress"
                                    />
                                </div>
                                <span className="payment-stat-val">${formatPrice(row.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="chart-section stats-panel stats-distribution-section">
                    <h4>Distribución de Gastos de los últimos 30 días</h4>
                    <div className="payment-stats-container">
                        {expensesByCategory.map((row) => (
                            <div key={row.key} className="payment-stat-row">
                                <span className="payment-stat-label">{row.label}</span>
                                <div className="payment-progress-bar">
                                    <AnimatedProgressBar
                                        percent={row.percent}
                                        className="expense-progress"
                                    />
                                </div>
                                <span className="payment-stat-val">${formatPrice(row.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Modal
                open={payDetailsOpen && !!debtorToPay}
                title="Registrar cobro"
                subtitle={debtorToPay ? `${debtorToPay.cliente} · Total pendiente: $${formatPrice(debtorToPay.total)}` : ''}
                onClose={cancelPay}
                closeOnBackdrop={!paying}
                actions={
                    <>
                        <ModalCancelButton onClick={cancelPay} disabled={paying} />
                        <ModalConfirmButton
                            label="Continuar"
                            type="submit"
                            form="pending-payment-form"
                            disabled={paying}
                        />
                    </>
                }
            >
                <form id="pending-payment-form" className="cute-form" onSubmit={submitPayDetails}>
                    <div className="form-group">
                        <label htmlFor="pending-payment-method">Método de pago</label>
                        <div className="input-wrapper">
                            <i className="fa-solid fa-credit-card input-icon" />
                            <select id="pending-payment-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Transferencia">Transferencia</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="pending-payment-amount">¿Cuánto entregó la clienta? <span className="field-required">(obligatorio)</span></label>
                        <div className="input-wrapper">
                            <i className="fa-solid fa-dollar-sign input-icon" />
                            <input
                                id="pending-payment-amount"
                                type="number"
                                inputMode="numeric"
                                min={debtorToPay?.total || 0}
                                step="1"
                                placeholder="Ej. 15000"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    {debtorToPay && Number(payAmount) > debtorToPay.total && (
                        <>
                            <p className="subtle-text">Vuelto: ${formatPrice(Number(payAmount) - debtorToPay.total)}</p>
                            <div className="form-group">
                                <label htmlFor="pending-return-method">Método para devolver el vuelto</label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-arrow-rotate-left input-icon" />
                                    <select id="pending-return-method" value={returnMethod} onChange={(e) => setReturnMethod(e.target.value)}>
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Transferencia">Transferencia</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}
                </form>
            </Modal>

            <ConfirmModal
                open={payConfirmOpen && !!debtorToPay}
                title="Confirmar cobro"
                message={debtorToPay ? `¿Registrar el cobro de $${formatPrice(debtorToPay.total)} para ${debtorToPay.cliente} mediante ${payMethod}? Importe entregado: $${formatPrice(payAmount)}. Vuelto: $${formatPrice(Math.max(0, Number(payAmount) - debtorToPay.total))}${Number(payAmount) > debtorToPay.total ? ` devuelto por ${returnMethod}` : ''}.` : ''}
                confirmText="Registrar cobro"
                confirmVariant="primary"
                busy={paying}
                onConfirm={confirmPayDebtor}
                onCancel={cancelPay}
            />
        </section>
    );
};

export default StatsPanel;
