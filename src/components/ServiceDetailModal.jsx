import React, { useRef } from 'react';
import Modal from './Modal.jsx';
import TicketCanvas, { shareServiceTicketAsImage } from './TicketCanvas.jsx';

const formatPrice = (value) => Number(value || 0).toLocaleString('es-AR');

const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
};

function ServiceDetailModal({ service, open, onClose, onPay, notify, sizeClass = '' }) {
    const ticketCanvasRef = useRef(null);

    if (!service) return null;

    const shareTicket = async () => {
        await shareServiceTicketAsImage(service, ticketCanvasRef, notify);
    };

    const isPending = (service.metodoPago || '').toLowerCase() === 'fiado';

    return (
        <>
            <Modal
                open={open}
                title="Detalle del Servicio"
                subtitle={`Comprobante #${service.id?.toString().slice(-6) || ''}`}
                onClose={onClose}
                sizeClass={sizeClass}
                actions={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cerrar
                        </button>
                        {isPending && onPay && (
                            <button type="button" className="btn btn-primary" onClick={onPay}>
                                <i className="fa-solid fa-sack-dollar" /> Cobrar
                            </button>
                        )}
                        <button type="button" className="btn btn-primary" onClick={shareTicket}>
                            <i className="fa-solid fa-share-nodes" /> Compartir comprobante
                        </button>
                    </>
                }
            >
                <div className="service-detail-content">
                    <div className="confirm-item">
                        <span className="confirm-label">Cliente</span>
                        <strong>{service.cliente}</strong>
                    </div>
                    <div className="confirm-item">
                        <span className="confirm-label">Servicio</span>
                        <strong>{service.servicio}</strong>
                    </div>
                    <div className="confirm-item">
                        <span className="confirm-label">Categoría</span>
                        <strong>{service.categoria || 'Otro'}</strong>
                    </div>
                    <div className="confirm-item">
                        <span className="confirm-label">Fecha y hora</span>
                        <strong>{formatDateTime(service.fecha || service.horaInicio)}</strong>
                    </div>
                    {service.horaFin && (
                        <div className="confirm-item">
                            <span className="confirm-label">Fin</span>
                            <strong>{formatDateTime(service.horaFin)}</strong>
                        </div>
                    )}
                    <div className="confirm-item">
                        <span className="confirm-label">Método de pago</span>
                        <strong>{service.metodoPago || (service.estado === 'Completado' ? 'Transferencia' : 'Pendiente')}</strong>
                    </div>
                    {Number(service.sena) > 0 && (
                        <div className="confirm-item">
                            <span className="confirm-label">Seña pagada</span>
                            <strong>${formatPrice(service.sena)}</strong>
                        </div>
                    )}
                    {Number(service.vuelto) > 0 && (
                        <div className="confirm-item">
                            <span className="confirm-label">Vuelto</span>
                            <strong>${formatPrice(service.vuelto)}</strong>
                        </div>
                    )}
                    <div className="confirm-item">
                        <span className="confirm-label">Completado</span>
                        <strong>{service.completado || service.estado}</strong>
                    </div>
                    <div className="cash-summary-card">
                        <div className="cash-summary-row cash-summary-row--highlight">
                            <span>Total</span>
                            <strong>${formatPrice(service.precio)}</strong>
                        </div>
                    </div>
                </div>
            </Modal>
            <TicketCanvas ref={ticketCanvasRef} />
        </>
    );
}

export default ServiceDetailModal;
