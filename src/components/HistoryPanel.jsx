import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import { updateLinkedTurnoStatus } from '../services.js';
import Modal, { ConfirmModal } from './Modal.jsx';
import TicketCanvas, { shareServiceTicketAsImage, downloadServiceTicketAsPng } from './TicketCanvas.jsx';

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

const HistoryPanel = ({ session, notify, showLoader, onBack }) => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [period, setPeriod] = useState('todos');
    const [category, setCategory] = useState('todos');
    const [payment, setPayment] = useState('todos');

    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedService, setSelectedService] = useState(null);

    const [payConfirmOpen, setPayConfirmOpen] = useState(false);
    const [serviceToPay, setServiceToPay] = useState(null);
    const [paying, setPaying] = useState(false);

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const ticketCanvasRef = useRef(null);

    useEffect(() => {
        let ignore = false;

        const load = async () => {
            if (!session?.authId || !supabase) return;
            setLoading(true);
            if (showLoader) showLoader(true, 'Cargando historial...');
            try {
                const { data, error } = await supabase
                    .from('servicios')
                    .select('id, legacy_id, turno_id, cliente_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre), perfiles(nombre, email)')
                    .order('fecha', { ascending: false });

                if (error) throw error;

                const normalized = (data || []).map(normalizeServiceRecord);
                if (!ignore) setServices(normalized);
            } catch (err) {
                console.error(err);
                if (notify) notify('No se pudo cargar el historial de ventas.', 'error');
            } finally {
                if (!ignore) {
                    setLoading(false);
                    if (showLoader) showLoader(false);
                }
            }
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

    const isAdmin = session?.rol === 'admin';

    const openDetail = (svc) => {
        setSelectedService(svc);
        setDetailOpen(true);
    };

    const shareTicket = async (svc) => {
        await shareServiceTicketAsImage(svc, ticketCanvasRef, notify);
    };

    const downloadTicket = async (svc) => {
        await downloadServiceTicketAsPng(svc, ticketCanvasRef, notify);
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
            const { error } = await supabase
                .from('servicios')
                .delete()
                .eq('legacy_id', serviceToDelete.id);
            if (error) throw error;
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
            const { error } = await supabase
                .from('servicios')
                .update({ metodo_pago: 'transferencia', completado: true })
                .eq('id', rawServiceId)
                .or(`legacy_id.eq.${serviceToPay.id}`);
            if (error) throw error;

            await updateLinkedTurnoStatus(rawServiceId, {
                id: rawServiceId,
                turno_id: serviceToPay.turnoId || null,
                cliente_id: serviceToPay.clienteId || null,
                fecha: serviceToPay.fecha,
                servicio: serviceToPay.servicio,
                precio: serviceToPay.precio
            });

            setServices((prev) =>
                prev.map((x) => x.id === serviceToPay.id ? { ...x, metodoPago: 'Transferencia', completado: 'Sí' } : x)
            );
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
        <section style={{ display: 'grid', gap: '18px' }}>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div>
                    <h3>Historial de Ventas</h3>
                    <p>Visualiza y administra los servicios cargados.</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={onBack} style={{ width: 'auto', padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <i className="fa-solid fa-arrow-left"></i> Volver
                </button>
            </div>

            <div className="filters-container">
                <div className="search-box-container">
                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar clienta o servicio..."
                        className="search-input"
                    />
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

            <div className="history-list">
                {loading && filtered.length === 0 && (
                    <div className="list-empty-state"><p>Cargando registros...</p></div>
                )}
                {!loading && filtered.length === 0 && (
                    <div className="list-empty-state"><p>No se encontraron registros 💔</p></div>
                )}

                {filtered.map((svc) => {
                    const isFiado = (svc.metodoPago || '').toLowerCase() === 'fiado';
                    return (
                        <div key={svc.id} className={`history-card ${isFiado ? 'card-pending' : ''}`}>
                            <div className="card-details">
                                <div className="card-client">{svc.cliente}</div>
                                <div className="card-service">{svc.servicio}</div>
                                <div className="card-meta">
                                    <span>
                                        <i className="fa-regular fa-calendar" style={{ color: 'var(--barbie-pink)', marginRight: '3px' }}></i>
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
                                <div className="card-price" style={{ fontSize: '18px', color: 'var(--barbie-dark)' }}>
                                    ${formatPrice(svc.precio)}
                                </div>
                            </div>
                            <div className="card-actions-col">
                                <button className="btn-view-detail" title="Ver Detalle" onClick={() => openDetail(svc)}>
                                    <i className="fa-solid fa-eye"></i>
                                </button>
                                {isAdmin && (
                                    <button className="btn-delete-card" title="Eliminar Registro" onClick={() => requestDelete(svc)}>
                                        <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal
                open={detailOpen && !!selectedService}
                title="Detalle del Servicio"
                subtitle={`Comprobante #${selectedService?.id?.toString().slice(-6) || ''}`}
                onClose={() => { setDetailOpen(false); setSelectedService(null); }}
                actions={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => { setDetailOpen(false); setSelectedService(null); }}>
                            Cerrar
                        </button>
                        {selectedService && (selectedService.metodoPago || '').toLowerCase() === 'fiado' && (
                            <button type="button" className="btn btn-primary" onClick={() => { setDetailOpen(false); requestPayFiado(selectedService); }}>
                                <i className="fa-solid fa-sack-dollar"></i> Cobrar
                            </button>
                        )}
                        {selectedService && (
                            <button type="button" className="btn btn-secondary" onClick={() => downloadTicket(selectedService)}>
                                <i className="fa-solid fa-file-image"></i> Descargar PNG
                            </button>
                        )}
                        {selectedService && (
                            <button type="button" className="btn btn-primary" onClick={() => shareTicket(selectedService)}>
                                <i className="fa-solid fa-share-nodes"></i> Compartir
                            </button>
                        )}
                    </>
                }
            >
                {selectedService && (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div className="confirm-item">
                            <span className="confirm-label">Cliente</span>
                            <strong>{selectedService.cliente}</strong>
                        </div>
                        <div className="confirm-item">
                            <span className="confirm-label">Servicio</span>
                            <strong>{selectedService.servicio}</strong>
                        </div>
                        <div className="confirm-item">
                            <span className="confirm-label">Categoría</span>
                            <strong>{selectedService.categoria}</strong>
                        </div>
                        <div className="confirm-item">
                            <span className="confirm-label">Fecha y hora</span>
                            <strong>{formatDateTime(selectedService.fecha)}</strong>
                        </div>
                        <div className="confirm-item">
                            <span className="confirm-label">Método de pago</span>
                            <strong>{selectedService.metodoPago}</strong>
                        </div>
                        {selectedService.sena > 0 && (
                            <div className="confirm-item">
                                <span className="confirm-label">Seña pagada</span>
                                <strong>${formatPrice(selectedService.sena)}</strong>
                            </div>
                        )}
                        {selectedService.vuelto > 0 && (
                            <div className="confirm-item">
                                <span className="confirm-label">Vuelto</span>
                                <strong>${formatPrice(selectedService.vuelto)}</strong>
                            </div>
                        )}
                        <div className="confirm-item">
                            <span className="confirm-label">Completado</span>
                            <strong>{selectedService.completado}</strong>
                        </div>
                        <div className="cash-summary-card">
                            <div className="cash-summary-row cash-summary-row--highlight">
                                <span>Total</span>
                                <strong>${formatPrice(selectedService.precio)}</strong>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

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

            <TicketCanvas ref={ticketCanvasRef} />
        </section>
    );
};

export default HistoryPanel;
