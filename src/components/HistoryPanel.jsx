import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import { completePendingPayment, deleteServiceFromDatabase, loadServicesFromDatabase } from '../services.js';
import Modal, { ConfirmModal } from './Modal.jsx';
import { ListIconButton } from './Button.jsx';
import VentaDetalleModal from './VentaDetalleModal.jsx';
import SkeletonList, { useSearching } from './SkeletonList.jsx';

const PERIOD_OPTIONS = [
    { key: 'todos', label: 'Todos' },
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' }
];

const CATEGORY_OPTIONS = [
    { key: 'todos', label: 'Todas' },
    { key: 'semi', label: 'Semi' },
    { key: 'kapping', label: 'Kapping' },
    { key: 'softgel', label: 'Softgel' },
    { key: 'esculpidas', label: 'Esculpidas' },
    { key: 'personalizado', label: 'Personalizado' },
    { key: 'remocion', label: 'Remoción' }
];

const PAYMENT_OPTIONS = [
    { key: 'todos', label: 'Todos' },
    { key: 'efectivo', label: 'Efectivo' },
    { key: 'transferencia', label: 'Transferencia' },
    { key: 'fiado', label: 'Fiado' }
];

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
        metodoPago: normalizePaymentMethod(item?.metodo_pago || item?.metodoPago),
        completado: item?.completado ? 'Sí' : 'No',
        vuelto: Number(item?.vuelto) || 0
    };
};

const formatDateTime = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const d = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const t = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${d} ${t}`;
};

const formatPrice = (n) => Number(n || 0).toLocaleString('es-AR');

const paymentIcon = (method) => {
    const m = (method || '').toLowerCase();
    if (m === 'efectivo') return 'fa-money-bill-wave';
    if (m === 'transferencia') return 'fa-mobile-screen-button';
    return 'fa-hand-holding-hand';
};

const HistoryPanel = ({ session, notify, showLoader, onBack, onVerCliente = null }) => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [period, setPeriod] = useState('todos');
    const [category, setCategory] = useState('todos');
    const [payment, setPayment] = useState('todos');
    const isSearching = useSearching(search);

    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedService, setSelectedService] = useState(null);

    const [payConfirmOpen, setPayConfirmOpen] = useState(false);
    const [serviceToPay, setServiceToPay] = useState(null);
    const [paying, setPaying] = useState(false);

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const loadServices = async () => {
        if (!session?.authId || !supabase) return;
        setLoading(true);
        try {
            const data = await loadServicesFromDatabase();
            setServices(data.map(normalizeServiceRecord));
        } catch (err) {
            console.error(err);
            if (notify) notify('No se pudo cargar el historial de ventas.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let ignore = false;

        const load = async () => {
            if (!session?.authId || !supabase) return;
            await loadServices();
        };

        load();
        return () => { ignore = true; };
    }, [session, notify, showLoader]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        return services.filter((item) => {
            const cliente = (item.cliente || '').toLowerCase();
            const servicio = (item.servicio || '').toLowerCase();
            if (q && !cliente.includes(q) && !servicio.includes(q)) return false;

            if (category !== 'todos' && normalizeCategory(item.categoria) !== category) return false;
            if (payment !== 'todos' && (item.metodoPago || '').toLowerCase() !== payment) return false;

            const d = new Date(item.fecha);
            if (period === 'hoy' && d < todayStart) return false;
            if (period === 'semana' && d < weekStart) return false;
            if (period === 'mes' && d < monthStart) return false;
            return true;
        });
    }, [services, search, category, payment, period]);

    const isAdmin = session?.rol === 'admin' || session?.rol === 'superadmin';

    const openDetail = (svc) => {
        setSelectedService(svc);
        setDetailOpen(true);
    };

    const requestDelete = (svc) => {
        if (!isAdmin) return;
        setServiceToDelete(svc);
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!serviceToDelete) return;
        setDeleting(true);
        if (showLoader) showLoader(true, 'Eliminando...');
        try {
            await deleteServiceFromDatabase(serviceToDelete.id);
            setServices((prev) => prev.filter((x) => x.id !== serviceToDelete.id));
            if (notify) notify('Registro eliminado con éxito ✨', 'success');
        } catch (err) {
            console.error(err);
            if (notify) notify('No se pudo eliminar el registro.', 'error');
        } finally {
            setDeleting(false);
            setDeleteConfirmOpen(false);
            setServiceToDelete(null);
            if (showLoader) showLoader(false);
        }
    };

    const requestPayFiado = (svc) => {
        setServiceToPay(svc);
        setPayConfirmOpen(true);
    };

    const confirmPayFiado = async () => {
        if (!serviceToPay) return;
        setPaying(true);
        if (showLoader) showLoader(true, 'Registrando cobro...');
        try {
            const rawServiceId = serviceToPay.rawId || serviceToPay.id;
            await completePendingPayment({
                serviceId: rawServiceId,
                serviceOverride: {
                    id: rawServiceId,
                    legacy_id: serviceToPay.id,
                    turno_id: serviceToPay.turnoId || null,
                    cliente_id: serviceToPay.clienteId || null,
                    fecha: serviceToPay.fecha,
                    servicio: serviceToPay.servicio,
                    precio: serviceToPay.precio,
                    metodo_pago: 'transferencia',
                    completado: true
                },
                paymentMethod: 'transferencia',
                vuelto: 0,
                finalizeTurno: true,
                usuarioId: session.authId
            });

            setServices((prev) =>
                prev.map((x) => x.id === serviceToPay.id ? { ...x, metodoPago: 'Transferencia', completado: 'Sí' } : x)
            );
            await loadServices();
            if (notify) notify('Cobro registrado con éxito 💖', 'success');
        } catch (err) {
            console.error(err);
            if (notify) notify('No se pudo registrar el cobro.', 'error');
        } finally {
            setPaying(false);
            setPayConfirmOpen(false);
            setServiceToPay(null);
            if (showLoader) showLoader(false);
        }
    };

    return (
            <section id="tab-historial" className="panel-stack view-enter">
            <div className="section-title section-title-with-back">
                <button type="button" className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only" onClick={onBack} aria-label="Volver al calendario">
                    <i className="fa-solid fa-arrow-left"></i>
                    <span className="mobile-action-label">Volver</span>
                </button>
                <div className="section-title-text">
                    <h3>Historial de Ventas</h3>
                    <p>Visualiza y administra los servicios cargados.</p>
                </div>
            </div>

            <div className="filters-container">
                <div className={`search-box-container${search ? ' has-text' : ''}`}>
                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar clienta o servicio..."
                        className="search-input"
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
                    title="Filtrar ventas"
                    onClick={() => setShowFilters((v) => !v)}
                >
                    <i className="fa-solid fa-filter"></i>
                </button>

                {showFilters && (
                    <div className="filter-button-panel">
                        <div className="filter-button-group">
                            {PERIOD_OPTIONS.map((opt) => (
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
                            {CATEGORY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`filter-choice ${category === opt.key ? 'active' : ''}`}
                                    onClick={() => setCategory(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="filter-button-group">
                            {PAYMENT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`filter-choice ${payment === opt.key ? 'active' : ''}`}
                                    onClick={() => setPayment(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="history-list unified-list list-scroll list-section-gap">
                {(loading || isSearching) && <SkeletonList count={6} />}
                {!loading && !isSearching && filtered.length === 0 && (
                    <div className="list-empty-state"><p>No se encontraron registros 💔</p></div>
                )}

                {!loading && !isSearching && filtered.map((svc) => {
                    const isFiado = (svc.metodoPago || '').toLowerCase() === 'fiado';
                    return (
                        <div key={svc.id} className={`history-card unified-card ${isFiado ? 'card-pending' : ''}`}>
                            <div className="client-avatar" aria-hidden="true">
                                <i className="fa-solid fa-receipt"></i>
                            </div>
                            <div className="card-details">
                                <div className="card-client">{svc.cliente}</div>
                                <div className="card-service">{svc.servicio}</div>
                                <div className="card-meta">
                                    <span>
                                        <i className="fa-regular fa-calendar card-meta-icon"></i>
                                        {formatDateTime(svc.fecha)}
                                    </span>
                                    <span className="pay-badge" title="Método de pago">
                                        <i className={`fa-solid ${paymentIcon(svc.metodoPago)}`}></i>
                                        {' '}
                                        {isFiado ? 'Pendiente de pago' : svc.metodoPago}
                                    </span>
                                </div>
                            </div>
                            <div className="card-amount-box">
                                <div className="card-price history-card-price">
                                    ${formatPrice(svc.precio)}
                                </div>
                            </div>
                            <div className="card-actions-col">
                                <ListIconButton
                                  icon="fa-eye"
                                  label="Consultar"
                                  title="Consultar ficha"
                                  variant="primary"
                                  onClick={() => openDetail(svc)}
                                  aria-label="Consultar ficha"
                                />
                                {isAdmin && (
                                    <ListIconButton
                                      icon="fa-trash-can"
                                      label="Eliminar"
                                      title="Eliminar Registro"
                                      variant="danger"
                                      onClick={() => requestDelete(svc)}
                                      aria-label="Eliminar Registro"
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <VentaDetalleModal
                open={detailOpen && !!selectedService}
                service={selectedService}
                turnoId={selectedService?.turnoId || null}
                notify={notify}
                onClose={() => { setDetailOpen(false); setSelectedService(null); }}
                onPay={selectedService && (selectedService.metodoPago || '').toLowerCase() === 'fiado'
                    ? () => { setDetailOpen(false); requestPayFiado(selectedService); }
                    : null}
                onVerCliente={onVerCliente}
                isAdmin={isAdmin}
            />

            <ConfirmModal
                open={payConfirmOpen && !!serviceToPay}
                title="Confirmar cobro"
                message={serviceToPay ? `¿Registrar el cobro de $${formatPrice(serviceToPay.precio)} para ${serviceToPay.cliente}?` : ''}
                confirmText="Cobrar"
                confirmVariant="primary"
                busy={paying}
                onConfirm={confirmPayFiado}
                onCancel={() => { setPayConfirmOpen(false); setServiceToPay(null); setPaying(false); }}
            />

            <ConfirmModal
                open={deleteConfirmOpen && !!serviceToDelete}
                title="Eliminar registro"
                message={serviceToDelete ? `¿Estás segura de eliminar el servicio de ${serviceToDelete.cliente}? Esta acción no se puede deshacer.` : ''}
                confirmText="Eliminar"
                confirmVariant="danger"
                busy={deleting}
                onConfirm={confirmDelete}
                onCancel={() => { setDeleteConfirmOpen(false); setServiceToDelete(null); setDeleting(false); }}
            />

        </section>
    );
};

export default HistoryPanel;
