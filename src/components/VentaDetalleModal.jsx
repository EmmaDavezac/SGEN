import React, { useEffect, useRef, useState } from 'react';
import Modal, { ModalButton } from './Modal.jsx';
import DetailWindow from './DetailWindow.jsx';
import { DetailActionButton } from './Button.jsx';
import { loadTurnoDetail } from '../services.js';
import { estadoLabel, estadoBadgeClass } from '../appointmentActions.js';
import TicketCanvas, { shareServiceTicketAsImage } from './TicketCanvas.jsx';

const formatPrice = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

// 'YYYY-MM-DD' sin hora se interpreta en UTC según la spec: en Argentina
// (UTC-3) eso mostraba el día anterior. Esas fechas se arman como fecha local.
const parseDate = (value) => {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(value);
};

// Fecha corta ("10/10/2026"): ni el día de la semana ni la versión con día y
// mes largos aportaban información nueva a la ficha; la hora va en su propia fila.
const formatDateLong = (value) => {
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatDateTime = (value) => {
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`;
};

const formatStartTime = (value) => {
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`;
};

const TIPO_PAGO_LABEL = { sena: 'Seña', cobro: 'Cobro', ajuste: 'Ajuste' };

const formatMetodoPago = (value) => {
    const low = (value || '').toString().trim().toLowerCase();
    if (low === 'efectivo') return 'Efectivo';
    if (low === 'transferencia') return 'Transferencia';
    if (low === 'combinado') return 'Combinado';
    if (low === 'fiado') return 'Fiado (pendiente)';
    return value || '—';
};

const Fila = ({ label, children }) => (
    <div className="detail-row">
        <span className="detail-row-label">{label}</span>
        <strong>{children}</strong>
    </div>
);

/**
 * Ficha única de una venta, compartida por el Historial y por los turnos.
 *
 * Antes habían dos fichas que mostraban el mismo hecho con datos y formatos
 * distintos: ServiceDetailModal (historial) y AppointmentDetailModal (turnos).
 * Esta las reemplaza: recibe el servicio y, si existe, el turnoId, y arma el
 * relato completo con secciones que aparecen según lo que haya pasado.
 *
 * `appointment` es opcional y solo lo pasa el calendario, para sumar el contexto
 * del turno (fecha y horario de inicio, estado) arriba de la venta. Cuando se abre
 * desde el historial de una venta sin turno, esa parte no se dibuja.
 *
 * El turnoId se usa para traer los pagos (seña, cobros, ajustes) y el motivo de
 * cancelación, que no están en `servicios` sino en `pagos` y `turnos`.
 *
 * `as` define la presentación: `'window'` (la ficha consultada desde el
 * calendario de turnos) la abre como ventana de pantalla (`DetailWindow`), con
 * el mismo formato que las otras fichas: `Volver` en la cabecera, secciones en
 * una sola columna y acciones al pie; `'modal'` (Historial y Clientes)
 * conserva el modal con overlay y bloqueo de scroll, con las acciones también al
 * fondo.
 */
function VentaDetalleModal({
    service,
    appointment = null,
    turnoId = null,
    as = 'modal',
    open,
    onClose,
    onPay = null,
    onVerCliente = null,
    notify = null,
    // Quién registró el servicio (y cuándo) solo lo ven admins, igual que en el
    // Historial: los paneles pasan el flag derivado de session.rol.
    isAdmin = false
}) {
    const ticketCanvasRef = useRef(null);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!open || !service || !turnoId) {
            setDetail(null);
            return undefined;
        }
        setLoading(true);
        loadTurnoDetail(turnoId)
            .then((data) => { if (!cancelled) setDetail(data); })
            .catch(() => { if (!cancelled) setDetail({ pagos: [], servicio: null }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, service, turnoId]);

    if (!service) return null;

    const pagos = detail?.pagos || [];
    const senas = pagos.filter((pago) => (pago.tipo || '').toLowerCase() === 'sena');
    const cobros = pagos.filter((pago) => (pago.tipo || '').toLowerCase() === 'cobro');
    // Con más de un pago, "Movimientos del turno" ya lista cada seña con su
    // fecha y método: la sección Seña standalone se oculta para no repetirla.
    const hayMovimientos = pagos.length > 1;
    const totalSena = senas.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
    const estaCancelado = appointment ? estadoBadgeClass(appointment.estado) === 'cancelado' : false;

    // La consulta desde el calendario arma el servicio con lo que trae el turno
    // (sin método de pago ni servicio real): lo que no traiga se completa con la
    // fila de `servicios` que trae loadTurnoDetail, y a falta de método propio,
    // con el del último cobro registrado.
    const dbServicio = detail?.servicio || null;
    const servicioRealizado = dbServicio?.servicio || service.servicio || '—';
    const metodoPago = service.metodoPago
        || dbServicio?.metodo_pago
        || (cobros.length ? cobros[cobros.length - 1].metodo_pago : null);
    const completadoResuelto = service.completado === true
        || service.completado === 'Sí'
        || dbServicio?.completado === true;

    const precio = Number(service.precio) || Number(dbServicio?.precio) || 0;
    // La seña la toma del servicio; si no está, de la fila o de los pagos tipo seña.
    const senaDescontada = Number(service.sena) > 0
        ? Number(service.sena)
        : (Number(dbServicio?.sena) > 0 ? Number(dbServicio.sena) : totalSena);
    const vuelto = Number(service.vuelto) || Number(dbServicio?.vuelto) || 0;
    // Descuento aplicado al cobro: de la fila del servicio o de la ficha.
    const descuentoPct = Number(service.descuentoPct ?? dbServicio?.descuento_pct) || 0;
    const descuentoMonto = Number(service.descuentoMonto ?? dbServicio?.descuento_monto) || 0;
    const hayCobro = Boolean(metodoPago) || cobros.length > 0;
    const esFiado = (metodoPago || '').toLowerCase() === 'fiado';
    const esCombinado = (metodoPago || '').toLowerCase() === 'combinado';
    // Deuda restante: en un combinado es su porción fiada; en un fiado puro,
    // precio menos la seña (misma cuenta que Historial y Estadísticas).
    const saldoPendiente = esCombinado
        ? Math.max(0, Number(service.saldoPendiente ?? dbServicio?.saldo_pendiente) || 0)
        : (esFiado ? Math.max(0, precio - senaDescontada) : 0);
    const repartoEfectivo = Number(service.montoEfectivo ?? dbServicio?.monto_efectivo) || 0;
    const repartoTransferencia = Number(service.montoTransferencia ?? dbServicio?.monto_transferencia) || 0;
    const estaPago = !esFiado && precio > 0;
    // El share nativo se usa solo en móvil/táctil (igual que en
    // shareServiceTicketAsImage): en desktop el ticket se descarga,
    // aunque exista navigator.share.
    const puedeCompartir = typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;

    const compartirTicket = async () => {
        // La ficha resuelve servicio/método/seña desde `servicios` + `pagos`
        // (desde el calendario `service` llega crudo: metodoPago null, etc.).
        // El ticket usa esos valores resueltos para no fallar ni salir vacío.
        await shareServiceTicketAsImage({
            ...service,
            servicio: servicioRealizado,
            metodoPago: metodoPago || service.metodoPago || '—',
            seña: senaDescontada,
        }, ticketCanvasRef, notify);
    };

    // Secciones de la ficha, compartidas por el modo modal y el modo ventana.
    const fichaSections = (
        <>
                {appointment && (
                    <div className="detail-block">
                        <h4>Turno</h4>
                        <div className="detail-block-rows">
                            {/* Fecha y hora de inicio juntas: la hora de fin no
                                aporta y la ficha ya es larga. */}
                            <Fila label="Fecha y horario">
                                {`${formatDateLong(appointment.fecha || appointment.horaInicio)} · ${formatStartTime(appointment.horaInicio)}`}
                            </Fila>
                            <Fila label="Estado del turno">
                                <span className={`status-tag ${estadoBadgeClass(appointment.estado)}`}>
                                    {estadoLabel(appointment.estado)}
                                </span>
                            </Fila>
                        </div>
                    </div>
                )}

                {estaCancelado && (
                    <div className="detail-block detail-block--cancel">
                        <h4>Cancelación</h4>
                        <div className="detail-block-rows">
                            <Fila label="Motivo">
                                {appointment.motivoCancelacion || 'Sin motivo registrado'}
                            </Fila>
                        </div>
                    </div>
                )}

                <div className="detail-block">
                    <h4>Servicio realizado</h4>
                    <div className="detail-block-rows">
                        {/* El atajo a la ficha de la cliente vive junto a su
                            nombre (no en la cabecera), como en las listas. */}
                        <Fila label="Cliente">
                            {service.cliente || 'Cliente'}
                            {onVerCliente && service.clienteId && (
                                <DetailActionButton
                                    icon="fa-eye"
                                    label="Consultar"
                                    title="Consultar ficha de la cliente"
                                    className="client-ficha-shortcut"
                                    onClick={() => onVerCliente(service.clienteId)}
                                />
                            )}
                        </Fila>
                        <Fila label="Qué se hizo">{servicioRealizado}</Fila>
                        {isAdmin && <Fila label="Registrado">{formatDateTime(service.fecha)}</Fila>}
                        {isAdmin && detail?.servicio?.perfiles?.nombre && (
                            <Fila label="Lo registró">{detail.servicio.perfiles.nombre}</Fila>
                        )}
                    </div>
                </div>

                {!loading && !hayMovimientos && senas.length > 0 && (
                    <div className="detail-block">
                        <h4>Seña</h4>
                        <div className="detail-block-rows">
                            <Fila label="Monto">{formatPrice(totalSena)}</Fila>
                            {senas.map((pago, index) => (
                                <Fila key={pago.id || index} label={`Pagada el ${formatDateTime(pago.fecha)}`}>
                                    {formatMetodoPago(pago.metodo_pago)}
                                </Fila>
                            ))}
                        </div>
                    </div>
                )}

                <div className="detail-block">
                    <h4>Cobro</h4>
                    <div className="detail-block-rows">
                        {descuentoPct > 0 && (
                            <Fila label="Descuento aplicado">
                                {descuentoPct}% (−{formatPrice(descuentoMonto)})
                            </Fila>
                        )}
                        <Fila label="Precio total">{formatPrice(precio)}</Fila>
                        {/* La seña ya se detalla en su sección (pago único) o en
                            Movimientos (más de un pago): aquí solo su total. */}
                        {senaDescontada > 0 && <Fila label="Seña descontada">{formatPrice(senaDescontada)}</Fila>}
                        {/* Sobrepago: cuánto entregó (resto después de la seña + vuelto)
                            y cuánto se le devolvió. Si no hubo exceso no se muestra,
                            porque sería repetir el resto con otro nombre. */}
                        {vuelto > 0 && (
                            <>
                                <Fila label="Entregó">
                                    {formatPrice(Math.max(precio - senaDescontada, 0) + vuelto)}
                                </Fila>
                                <Fila label="Le devolvió">{formatPrice(vuelto)}</Fila>
                            </>
                        )}
                        {/* El método ya lo lista cada fila de Movimientos cuando hay
                            más de un pago: aquí solo se muestra sin ese detalle. */}
                        {!hayMovimientos && (
                        <Fila label="Cómo pagó">
                            {esCombinado
                                ? `Combinado · Efectivo $${formatPrice(repartoEfectivo)} + Transferencia $${formatPrice(repartoTransferencia)}`
                                : formatMetodoPago(metodoPago)}
                        </Fila>
                        )}
                        <Fila label="Estado del pago">
                            {!hayCobro
                                ? 'Pendiente de cobro'
                                : esFiado
                                    ? (completadoResuelto ? 'Fiado saldado' : 'Fiado pendiente')
                                    : (saldoPendiente > 0
                                        ? `Pago parcial · falta $${formatPrice(saldoPendiente)}`
                                        : 'Pago completo')}
                        </Fila>
                    </div>
                </div>

                {!loading && hayMovimientos && (
                    <div className="detail-block">
                        <h4>Movimientos del turno</h4>
                        <ul className="detail-payments">
                            {pagos.map((pago, index) => (
                                <li key={pago.id || index}>
                                    <span>{TIPO_PAGO_LABEL[(pago.tipo || '').toLowerCase()] || pago.tipo}</span>
                                    <strong>{formatPrice(pago.monto)}</strong>
                                    <em>{formatMetodoPago(pago.metodo_pago)}</em>
                                    <small>{formatDateTime(pago.fecha)}</small>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
        </>
    );

    // El subtítulo describe el contenido (como en la ficha de cliente y de
    // usuario): cliente y fecha ya aparecen en las secciones de abajo
    // ("Cliente", "Fecha y horario" / "Registrado"), no hace falta repetirlos.
    const fichaSubtitle = appointment
        ? 'Datos del turno, cobro y pagos'
        : 'Datos de la venta, cobro y pagos';

    // La ficha de turno/venta consultada desde el calendario se abre como
    // ventana de pantalla (DetailWindow), con el mismo formato que la ficha de
    // cliente y de usuario: cabecera solo con Volver, secciones en una sola
    // columna en el cuerpo de la ventana y acciones al pie
    // (.detail-window-footer). Sin clases ni layouts propios.
    if (as === 'window') {
        return (
            <>
                {open && (
                    <DetailWindow
                        title={appointment ? 'Ficha de turno' : 'Ficha de venta'}
                        subtitle={fichaSubtitle}
                        onClose={onClose}
                    >
                        {fichaSections}
                        {(estaPago || (saldoPendiente > 0 && onPay)) && (
                            <div className="detail-window-footer">
                                {estaPago && (
                                    <DetailActionButton
                                        icon="fa-share-nodes"
                                        variant="primary"
                                        label={puedeCompartir ? 'Compartir comprobante' : 'Descargar comprobante'}
                                        className="detail-btn-full-mobile"
                                        iconOnlyOnMobile={false}
                                        onClick={compartirTicket}
                                    />
                                )}
                                {saldoPendiente > 0 && onPay && (
                                    <DetailActionButton
                                        icon="fa-sack-dollar"
                                        variant="primary"
                                        label="Cobrar"
                                        onClick={onPay}
                                    />
                                )}
                            </div>
                        )}
                    </DetailWindow>
                )}
                <TicketCanvas ref={ticketCanvasRef} />
            </>
        );
    }

    return (
        <>
            <Modal
                open={open}
                title={appointment ? 'Ficha de turno' : 'Ficha de venta'}
                subtitle={fichaSubtitle}
                onClose={onClose}
                sizeClass="detail-modal-card"
                actions={
                    <>
                        <ModalButton variant="secondary" icon="fa-arrow-left" onClick={onClose}>
                            Volver
                        </ModalButton>
                        {estaPago && (
                            <ModalButton variant="primary" icon="fa-share-nodes" onClick={compartirTicket}>
                                {puedeCompartir ? 'Compartir comprobante' : 'Descargar comprobante'}
                            </ModalButton>
                        )}
                        {saldoPendiente > 0 && onPay && (
                            <ModalButton variant="primary" icon="fa-sack-dollar" onClick={onPay}>
                                Cobrar
                            </ModalButton>
                        )}
                    </>
                }
            >
                {fichaSections}
            </Modal>
            <TicketCanvas ref={ticketCanvasRef} />
        </>
    );
}

export default VentaDetalleModal;
