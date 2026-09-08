import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../supabase.js';
import { finalizeRegisteredService, registerServiceDirectly, saveExpenseToDatabase } from '../services.js';
import Button from './Button.jsx';
import Modal, { ConfirmModal } from './Modal.jsx';

const DEFAULT_CATALOG = {
    semi: [
        { name: "Semipermanente Basic", price: 12000 },
        { name: "Semipermanente Full", price: 14000 }
    ],
    kapping: [
        { name: "Kapping", price: 12500 },
        { name: "Kapping Basic", price: 14000 },
        { name: "Kapping Full", price: 15500 },
        { name: "Kapping con Polygel Basic", price: 15500 },
        { name: "Kapping con Polygel Full", price: 17000 }
    ],
    softgel: [
        { name: "Soft Gel Basic", price: 16500 },
        { name: "Soft Gel Full", price: 18000 }
    ],
    esculpidas: [
        { name: "Esculpidas en Polygel Basic", price: 17500 },
        { name: "Esculpidas en Polygel Full", price: 19000 }
    ],
    remocion: [
        { name: "Retiro Servicio Propio", price: 0 },
        { name: "Remoción Semipermanente", price: 4500 },
        { name: "Remoción Kapping", price: 5000 },
        { name: "Remoción Softgel", price: 5500 },
        { name: "Remoción Polygel", price: 6000 },
        { name: "Remoción Acrilico", price: 6500 }
    ],
    personalizado: [
        { name: "Servicio Personalizado", price: 0 }
    ]
};

const CATEGORY_LABELS = {
    semi: "Semi",
    kapping: "Kapping",
    softgel: "Soft Gel",
    esculpidas: "Esculpidas",
    remocion: "Remoción",
    personalizado: "Otro"
};

function hasSuspiciousPrice(rawValue) {
    const num = Number(rawValue);
    if (!Number.isFinite(num) || num <= 0) return false;
    return num > 0 && num < 1000;
}

function RegisterServiceForm({ session, onBack, initialAppointment = null, onRegisterSuccess, allowFiado = true, notify, showLoader }) {
    const [clients, setClients] = useState([]);
    const [clientName, setClientName] = useState('');
    const [catalog, setCatalog] = useState(DEFAULT_CATALOG);

    const [selectedCategory, setSelectedCategory] = useState('semi');
    const [selectedSubService, setSelectedSubService] = useState(null);

    const [combinedService1, setCombinedService1] = useState('');
    const [combinedCount1, setCombinedCount1] = useState(7);
    const [combinedService2, setCombinedService2] = useState('');

    const [serviceName, setServiceName] = useState('');
    const [servicePrice, setServicePrice] = useState(0);

    const [hasExternalRemoval, setHasExternalRemoval] = useState(false);
    const [selectedRemoval, setSelectedRemoval] = useState(null);

    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [loading, setLoading] = useState(false);

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showRegisterDiscardConfirm, setShowRegisterDiscardConfirm] = useState(false);
    const [showCashModal, setShowCashModal] = useState(false);
    const [showCashDiscardConfirm, setShowCashDiscardConfirm] = useState(false);
    const [amountGiven, setAmountGiven] = useState('');

    const [pendingSubmitData, setPendingSubmitData] = useState(null);
    const [cashVuelto, setCashVuelto] = useState(0);
    const [cashAmountGivenNum, setCashAmountGivenNum] = useState(0);
    const [sena, setSena] = useState('');
    const [vueltoReturnMethod, setVueltoReturnMethod] = useState('Efectivo');
    const cashInitialRef = useRef(null);

    const priceInputRef = useRef(null);

    useEffect(() => {
        async function fetchClients() {
            try {
                const { data, error } = await supabase
                    .from('clientes')
                    .select('nombre')
                    .order('nombre');
                if (!error && data) {
                    setClients(data.map(c => c.nombre));
                }
            } catch (err) {
                console.warn("Error fetching clients list:", err);
            }
        }
        fetchClients();
    }, []);

    useEffect(() => {
        async function fetchPrices() {
            try {
                const { data, error } = await supabase
                    .from('precios')
                    .select('categoria, nombre, precio')
                    .order('categoria');
                if (!error && data && data.length > 0) {
                    const newCatalog = {};
                    data.forEach(p => {
                        if (!newCatalog[p.categoria]) {
                            newCatalog[p.categoria] = [];
                        }
                        newCatalog[p.categoria].push({ name: p.nombre, price: Number(p.precio) || 0 });
                    });
                    if (!newCatalog.personalizado) {
                        newCatalog.personalizado = DEFAULT_CATALOG.personalizado;
                    }
                    setCatalog(newCatalog);
                }
            } catch (err) {
                console.warn("Error fetching prices catalog:", err);
            }
        }
        fetchPrices();
    }, []);

    const allBasicOptions = useMemo(() => {
        const list = [];
        Object.keys(catalog).forEach(cat => {
            if (cat !== 'remocion' && cat !== 'personalizado') {
                catalog[cat].forEach(item => {
                    list.push({ ...item, category: cat });
                });
            }
        });
        return list;
    }, [catalog]);

    useEffect(() => {
        if (!initialAppointment && allBasicOptions.length > 0) {
            setCombinedService1(allBasicOptions[0].name);
            if (allBasicOptions.length > 1) {
                setCombinedService2(allBasicOptions[1].name);
            } else {
                setCombinedService2(allBasicOptions[0].name);
            }
        }
    }, [allBasicOptions]);

    useEffect(() => {
        if (!initialAppointment && selectedCategory === 'personalizado' && combinedService1 && combinedService2) {
            const count1 = Number(combinedCount1) || 7;
            const count2 = 10 - count1;

            const s1 = allBasicOptions.find(o => o.name === combinedService1);
            const s2 = allBasicOptions.find(o => o.name === combinedService2);

            if (s1 && s2) {
                const combinedName = `${s1.name} (${count1} ${count1 === 1 ? 'uña' : 'uñas'}) + ${s2.name} (${count2} ${count2 === 1 ? 'uña' : 'uñas'})`;
                const combinedPrice = Math.round(((s1.price * count1) + (s2.price * count2)) / 10);

                setServiceName(combinedName);
                setServicePrice(combinedPrice);
            }
        }
    }, [selectedCategory, combinedService1, combinedService2, combinedCount1, allBasicOptions]);

    useEffect(() => {
        if (!initialAppointment && selectedCategory !== 'personalizado') {
            const subservices = catalog[selectedCategory] || [];
            if (subservices.length > 0) {
                setSelectedSubService(subservices[0]);
                setServiceName(subservices[0].name);
                setServicePrice(subservices[0].price);
            }
        }
        if (selectedCategory === 'remocion') {
            setHasExternalRemoval(false);
            setSelectedRemoval(null);
        }
    }, [selectedCategory, catalog]);

    useEffect(() => {
        if (initialAppointment?.cliente) {
            setClientName(initialAppointment.cliente);
            setServiceName('');
            setServicePrice(0);
            setSena(Number(initialAppointment.precio) || 0);
        }
    }, [initialAppointment]);

    const selectSubService = (service) => {
        setSelectedSubService(service);
        setServiceName(service.name);
        setServicePrice(service.price);
    };

    const finalPrice = useMemo(() => {
        let base = Number(servicePrice) || 0;
        if (hasExternalRemoval && selectedRemoval) {
            base += Number(selectedRemoval.price) || 0;
        }
        return base;
    }, [servicePrice, hasExternalRemoval, selectedRemoval]);

    const removalOptions = useMemo(() => {
        const rems = catalog.remocion || [];
        return rems.filter(rem => rem.name !== "Retiro Servicio Propio");
    }, [catalog]);

    useEffect(() => {
        if (hasExternalRemoval && removalOptions.length > 0 && !selectedRemoval) {
            setSelectedRemoval(removalOptions[0]);
        }
    }, [hasExternalRemoval, removalOptions, selectedRemoval]);

    const handlePriceBlur = (e) => {
        const input = e.target;
        const val = input.value;
        if (!input.dataset.priceAlertShown && hasSuspiciousPrice(val)) {
            input.dataset.priceAlertShown = "true";
            window.alert('Hay un error en el monto ingresado... el valor parece demasiado bajo. Verificá si incluiste las centenas (ej: 12000 en lugar de 12).');
        }
    };

    const handlePriceFocus = (e) => {
        const input = e.target;
        delete input.dataset.priceAlertShown;
    };

    const paymentMethods = allowFiado
        ? ['Transferencia', 'Efectivo', 'Fiado']
        : ['Transferencia', 'Efectivo'];

    const netoACobrar = useMemo(() => {
        const base = Number(finalPrice) || 0;
        const s = Number(sena) || 0;
        return Math.max(0, base - s);
    }, [finalPrice, sena]);

    const computedCashChange = useMemo(() => {
        const given = Number(amountGiven) || 0;
        return Math.max(0, given - netoACobrar);
    }, [amountGiven, netoACobrar]);

    const initiateSubmit = (e) => {
        e.preventDefault();
        if (loading) return;

        const client = clientName.trim();
        if (!client || !serviceName || finalPrice <= 0) {
            if (notify) notify('Completá los datos del cliente y precio correctamente.', 'error');
            return;
        }

        if (hasSuspiciousPrice(finalPrice)) {
            window.alert('Hay un error en el monto ingresado. Verificá que el valor sea 9.000, 10.000 o similar, no 9 o 10.');
            priceInputRef.current?.focus();
            priceInputRef.current?.select();
            return;
        }

        const submitPayload = {
            cliente: client,
            servicio: serviceName,
            categoria: selectedCategory,
            precio: finalPrice,
            seña: Number(sena) || 0,
            metodoPago: paymentMethod
        };

        setPendingSubmitData(submitPayload);

        if (paymentMethod === 'Efectivo') {
            setAmountGiven(String(netoACobrar));
            cashInitialRef.current = JSON.stringify({ amount: String(netoACobrar), returnMethod: 'Efectivo' });
            setShowCashModal(true);
        } else {
            setShowConfirmModal(true);
        }
    };

    const handleCashConfirm = () => {
        const givenNum = Number(amountGiven) || 0;
        const vuelto = computedCashChange;
        setCashAmountGivenNum(givenNum);
        setCashVuelto(vuelto);
        if (vuelto > 0 && !vueltoReturnMethod) {
            setVueltoReturnMethod('Efectivo');
        }
        setShowCashModal(false);
        setShowConfirmModal(true);
    };

    const handleCashCancel = () => {
        const current = JSON.stringify({ amount: amountGiven, returnMethod: vueltoReturnMethod });
        if (cashInitialRef.current && current !== cashInitialRef.current) {
            setShowCashDiscardConfirm(true);
            return;
        }
        setShowCashModal(false);
    };

    const discardCashEntry = () => {
        setShowCashDiscardConfirm(false);
        setShowCashModal(false);
        setAmountGiven('');
        setVueltoReturnMethod('Efectivo');
    };

    const doFinalSubmit = async () => {
        if (!pendingSubmitData) return;
        setShowConfirmModal(false);
        setLoading(true);

        const senaNum = Number(pendingSubmitData.seña) || 0;
        const neto = Math.max(0, Number(pendingSubmitData.precio) - senaNum);
        const vueltoNum = pendingSubmitData.metodoPago === 'Efectivo' ? cashVuelto : 0;
        const vueltoReturn = vueltoNum > 0 ? (vueltoReturnMethod || 'Efectivo') : null;

        const transaction = {
            id: `service_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            turno_id: initialAppointment?.rawId || initialAppointment?.id || null,
            fecha: new Date().toISOString(),
            cliente: pendingSubmitData.cliente,
            servicio: pendingSubmitData.servicio,
            categoria: pendingSubmitData.categoria,
            precio: pendingSubmitData.precio,
            seña: senaNum,
            metodoPago: pendingSubmitData.metodoPago,
            usuario_id: session?.authId,
            completado: true,
            vuelto: vueltoNum
        };

        try {
            const resp = await registerServiceDirectly(transaction);
            if (!resp || !resp.success) {
                if (notify) notify('No se pudo registrar el servicio en la base de datos.', 'error');
                return;
            }

            const appointmentDatabaseId = initialAppointment?.rawId;
            const appointmentLegacyId = initialAppointment?.legacy_id || (!appointmentDatabaseId ? initialAppointment?.id : null);
            if ((appointmentDatabaseId || appointmentLegacyId) && session?.authId) {
                await finalizeRegisteredService({
                    turnoId: appointmentDatabaseId,
                    turnoLegacyId: appointmentLegacyId,
                    precio: pendingSubmitData.precio,
                    serviceId: resp.service?.rawId || null,
                    paymentAmount: pendingSubmitData.metodoPago === 'Fiado' ? 0 : neto,
                    paymentMethod: pendingSubmitData.metodoPago,
                    usuarioId: session.authId
                });
                if (notify) notify('Turno actualizado a completado.', 'success');
            }

            if (vueltoNum > 0 && vueltoReturn && vueltoReturn !== 'Efectivo' && supabase && session?.authId) {
                try {
                    await saveExpenseToDatabase({
                        legacy_id: `exp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                        usuario_id: session.authId,
                        fecha: new Date().toISOString(),
                        concepto: `Vuelto - ${pendingSubmitData.cliente} - ${pendingSubmitData.servicio}`,
                        monto: vueltoNum,
                        metodo_pago: vueltoReturn.toLowerCase(),
                        categoria: 'Vuelto'
                    });
                    if (notify) notify('Vuelto registrado correctamente.', 'success');
                } catch (gErr) {
                    console.warn('No se pudo registrar el egreso de vuelto en gastos:', gErr);
                    if (notify) notify('Se registró el servicio, pero falló el vuelto.', 'warning');
                }
            }

            setClientName('');
            setSena('');
            setSelectedCategory('semi');
            setHasExternalRemoval(false);
            setSelectedRemoval(null);
            setPaymentMethod('Transferencia');
            setVueltoReturnMethod('Efectivo');
            if (priceInputRef.current) {
                delete priceInputRef.current.dataset.priceAlertShown;
            }
            if (notify) notify('Servicio registrado con éxito.', 'success');
            if (onRegisterSuccess) onRegisterSuccess();
        } catch (err) {
            console.error('Error submitting service form React:', err);
            if (notify) notify(err?.message || 'No se pudo registrar el servicio.', 'error');
        } finally {
            setLoading(false);
            setPendingSubmitData(null);
            setCashVuelto(0);
            setCashAmountGivenNum(0);
        }
    };

    const handleConfirmCancel = () => {
        setShowConfirmModal(false);
        setPendingSubmitData(null);
        setCashVuelto(0);
        setCashAmountGivenNum(0);
    };

    const handleRegisterBack = () => {
        const hasChanges = Boolean(
            clientName.trim() ||
            sena ||
            paymentMethod !== 'Transferencia' ||
            hasExternalRemoval ||
            selectedRemoval
        );
        if (!hasChanges) {
            onBack?.();
            return;
        }
        setShowRegisterDiscardConfirm(true);
    };

    const confirmMessageLines = pendingSubmitData ? (
        <>
            <div className="confirm-item">
                <span className="confirm-label">Clienta</span>
                <strong>{pendingSubmitData.cliente}</strong>
            </div>
            <div className="confirm-item">
                <span className="confirm-label">Servicio</span>
                <strong>{pendingSubmitData.servicio}</strong>
            </div>
            <div className="confirm-item">
                <span className="confirm-label">Precio total</span>
                <strong>${Number(pendingSubmitData.precio).toLocaleString("es-AR")}</strong>
            </div>
            {(pendingSubmitData.seña || 0) > 0 && (
                <div className="confirm-item">
                    <span className="confirm-label">Seña</span>
                    <strong>${Number(pendingSubmitData.seña).toLocaleString("es-AR")}</strong>
                </div>
            )}
            {(pendingSubmitData.seña || 0) > 0 && (
                <div className="confirm-item">
                    <span className="confirm-label">Neto</span>
                    <strong>${Math.max(0, Number(pendingSubmitData.precio) - Number(pendingSubmitData.seña || 0)).toLocaleString("es-AR")}</strong>
                </div>
            )}
            <div className="confirm-item">
                <span className="confirm-label">Método</span>
                <strong>
                    {pendingSubmitData.metodoPago === 'Fiado' ? 'Pendiente de pago' : pendingSubmitData.metodoPago}
                    {pendingSubmitData.metodoPago === 'Efectivo' && cashVuelto > 0 && (
                        <span className="cash-change-note">
                            (Vuelto: ${Number(cashVuelto).toLocaleString("es-AR")}{vueltoReturnMethod && vueltoReturnMethod !== 'Efectivo' ? ` · ${vueltoReturnMethod}` : ''})
                        </span>
                    )}
                </strong>
            </div>
        </>
    ) : null;

    return (
        <div id="tab-registrar" className="tab-pane active">
            <div className="section-title section-title-with-action">
                <div>
                    <h3>Registrar Servicio</h3>
                    <p>Agrega un nuevo trabajo realizado en segundos.</p>
                </div>
                {onBack && (
                    <button
                        type="button"
                        id="btn-cancel-checkout"
                        className="btn btn-secondary btn-sm btn-back"
                        onClick={handleRegisterBack}
                    >
                        <i className="fa-solid fa-arrow-left"></i> Volver
                    </button>
                )}
            </div>

            <form id="service-form" className="cute-form" onSubmit={initiateSubmit}>
                {initialAppointment && Number(initialAppointment.precio) > 0 && (
                    <div className="checkout-sena-banner">
                        <i className="fa-solid fa-circle-info" />
                        Turno reservado. Seña de <strong>${Number(initialAppointment.precio).toLocaleString("es-AR")}</strong> ya cobrada; se descontará del total automáticamente.
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="client-name">Nombre de la Clienta</label>
                    <div className="input-wrapper">
                        <i className="fa-solid fa-user input-icon" />
                        <input
                            type="text"
                            id="client-name"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            list="past-clients-list"
                            placeholder="Ej. Camila Silva"
                            required
                            readOnly={!!initialAppointment}
                            autoComplete="off"
                        />
                    </div>
                    <datalist id="past-clients-list">
                        {clients.map(c => <option key={c} value={c} />)}
                    </datalist>
                </div>

                <div className="form-group">
                    <label><i className="fa-solid fa-tags"></i> Selecciona una Categoría</label>
                    <div className="category-grid">
                        {Object.keys(CATEGORY_LABELS).map((catKey) => (
                            <button
                                key={catKey}
                                type="button"
                                className={`btn-cat ${selectedCategory === catKey ? 'active' : ''}`}
                                onClick={() => setSelectedCategory(catKey)}
                            >
                                {CATEGORY_LABELS[catKey]}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedCategory !== 'personalizado' ? (
                    <div className="form-group" id="services-grid-wrapper">
                        <label id="services-grid-label">Servicio Específico</label>
                        <div id="services-grid" className="services-grid">
                            {(catalog[selectedCategory] || []).map((service) => (
                                <button
                                    key={service.name}
                                    type="button"
                                    className={`btn-service ${selectedSubService?.name === service.name ? 'active' : ''}`}
                                    onClick={() => selectSubService(service)}
                                >
                                    <span>{service.name}</span>
                                    <span className="price-tag">${service.price.toLocaleString("es-AR")}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div id="combined-service-builder" className="combined-service-builder">
                        <div className="combined-service-heading">
                            <i className="fa-solid fa-puzzle-piece combined-service-icon"></i>
                            Combinación de 2 Servicios (10 uñas en total)
                        </div>

                        <div className="form-row-2 custom-service-row combined-service-row--first">
                            <div className="form-group combined-service-field">
                                <label className="combined-service-label">Servicio 1 (Principal)</label>
                                <select
                                    value={combinedService1}
                                    onChange={(e) => setCombinedService1(e.target.value)}
                                    className="filter-select combined-service-select"
                                >
                                    {allBasicOptions.map(o => (
                                        <option key={`c1-${o.name}`} value={o.name} data-price={o.price}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group combined-service-field">
                                <label className="combined-service-label">Uñas Serv. 1</label>
                                <select
                                    value={combinedCount1}
                                    onChange={(e) => setCombinedCount1(Number(e.target.value))}
                                    className="filter-select combined-service-select"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <option key={n} value={n}>{n} {n === 1 ? 'uña' : 'uñas'}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-row-2 custom-service-row combined-service-row--second">
                            <div className="form-group combined-service-field">
                                <label className="combined-service-label">Servicio 2 (Secundario)</label>
                                <select
                                    value={combinedService2}
                                    onChange={(e) => setCombinedService2(e.target.value)}
                                    className="filter-select combined-service-select"
                                >
                                    {allBasicOptions.map(o => (
                                        <option key={`c2-${o.name}`} value={o.name} data-price={o.price}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group combined-service-field">
                                <label className="combined-service-label">Uñas Serv. 2</label>
                                <select
                                    value={10 - combinedCount1}
                                    className="filter-select combined-service-select combined-service-select--disabled"
                                    disabled
                                >
                                    <option value={10 - combinedCount1}>{10 - combinedCount1} {10 - combinedCount1 === 1 ? 'uña' : 'uñas'}</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label>Precio Total ($)</label>
                        <div className="input-wrapper">
                            <i className="fa-solid fa-dollar-sign input-icon" />
                            <input
                                ref={priceInputRef}
                                type="number"
                                value={finalPrice}
                                onChange={(e) => setServicePrice(Number(e.target.value))}
                                onBlur={handlePriceBlur}
                                onFocus={handlePriceFocus}
                                placeholder="0"
                                required
                                inputMode="numeric"
                            />
                    </div>
                </div>

                {selectedCategory !== 'remocion' && (
                    <>
                        <div className="form-group external-removal-group">
                            <div className="cute-toggle-card external-removal-card">
                                <span className="external-removal-label">
                                    ¿Tiene retiro previo externo?
                                </span>
                                <label className="switch-toggle external-removal-toggle">
                                    <input
                                        type="checkbox"
                                        checked={hasExternalRemoval}
                                        onChange={(e) => setHasExternalRemoval(e.target.checked)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>

                        {hasExternalRemoval && (
                            <div className="sub-services-section">
                                <span className="sub-services-label">
                                    Tipo de Retiro:
                                </span>
                                <div className="sub-services-grid">
                                    {removalOptions.map((rem) => (
                                        <button
                                            key={rem.name}
                                            type="button"
                                            className={`btn-service ${selectedRemoval?.name === rem.name ? 'active' : ''}`}
                                            onClick={() => setSelectedRemoval(rem)}
                                        >
                                            <span>{rem.name}</span>
                                            <span className="price-tag">+${rem.price.toLocaleString("es-AR")}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div className="form-group">
                    <label>Método de Pago</label>
                    <div className="payment-method-selector">
                        {paymentMethods.map((method) => (
                            <label
                                key={method}
                                className={`pay-btn ${!allowFiado && method === 'Fiado' ? 'pay-btn-hidden' : ''}`}
                                id={method === 'Fiado' ? 'pay-btn-fiado-wrapper' : undefined}
                            >
                                <input
                                    type="radio"
                                    name="payment-method"
                                    value={method}
                                    checked={paymentMethod === method}
                                    onChange={() => setPaymentMethod(method)}
                                />
                                <div className="pay-btn-content">
                                    <span className="pay-icon">
                                        {method === 'Transferencia' && <i className="fa-solid fa-mobile-screen-button"></i>}
                                        {method === 'Efectivo' && <i className="fa-solid fa-money-bill-wave"></i>}
                                        {method === 'Fiado' && <i className="fa-solid fa-hand-holding-hand"></i>}
                                    </span>
                                    <span>{method === 'Fiado' ? 'Pendiente de pago' : method}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                <Button type="submit" className="btn-block" disabled={loading}>
                    <i className="fa-solid fa-check"></i> {loading ? 'Registrando...' : 'Registrar'}
                </Button>
            </form>

            <Modal
                open={showCashModal}
                title="Cobro en Efectivo"
                subtitle="Ingresá el monto que entrega la clienta"
                onClose={handleCashCancel}
                closeOnBackdrop={false}
                actions={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={handleCashCancel}>
                            Cancelar
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleCashConfirm}>
                            Confirmar
                        </button>
                    </>
                }
            >
                <div className="form-group form-group--flush">
                    <label htmlFor="cash-amount-given">Entrega de clienta ($)</label>
                    <div className="input-wrapper">
                        <i className="fa-solid fa-hand-holding-dollar input-icon" />
                        <input
                            id="cash-amount-given"
                            type="number"
                            min="0"
                            step="1"
                            value={amountGiven}
                            onChange={(e) => setAmountGiven(e.target.value)}
                            placeholder="Ej. 20000"
                            inputMode="numeric"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="cash-summary-card">
                    <div className="cash-summary-row">
                        <span>Total servicio</span>
                        <strong id="cash-summary-total">${Number(finalPrice).toLocaleString("es-AR")}</strong>
                    </div>
                    {(Number(sena) || 0) > 0 && (
                        <div className="cash-summary-row">
                            <span>Seña (anticipo)</span>
                            <strong className="deposit-amount">-${Number(sena || 0).toLocaleString("es-AR")}</strong>
                        </div>
                    )}
                    <div className="cash-summary-row">
                        <span>Neto a cobrar</span>
                        <strong id="cash-summary-due">${Number(netoACobrar).toLocaleString("es-AR")}</strong>
                    </div>
                    <div className="cash-summary-row">
                        <span>Entrega clienta</span>
                        <strong id="cash-summary-given">${Number(amountGiven || 0).toLocaleString("es-AR")}</strong>
                    </div>
                    <div className="cash-summary-row cash-summary-row--highlight">
                        <span><strong>Vuelto</strong></span>
                        <strong id="cash-summary-change">${Number(computedCashChange).toLocaleString("es-AR")}</strong>
                    </div>
                </div>

                {computedCashChange > 0 && (
                    <div className="cash-payment-section">
                        <label className="cash-payment-label">
                            <i className="fa-solid fa-sack-dollar cash-payment-icon"></i>
                            Modo de entrega del vuelto
                        </label>
                        <div className="cash-return-method-grid">
                            <label
                                className={`pay-btn ${vueltoReturnMethod === 'Efectivo' ? 'is-selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="cash-return-method"
                                    value="Efectivo"
                                    checked={vueltoReturnMethod === 'Efectivo'}
                                    onChange={() => setVueltoReturnMethod('Efectivo')}
                                />
                                <div className="pay-btn-content">
                                    <span className="pay-icon"><i className="fa-solid fa-money-bill-wave"></i></span>
                                    <span>Efectivo</span>
                                </div>
                            </label>
                            <label
                                className={`pay-btn ${vueltoReturnMethod === 'Transferencia' ? 'is-selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="cash-return-method"
                                    value="Transferencia"
                                    checked={vueltoReturnMethod === 'Transferencia'}
                                    onChange={() => setVueltoReturnMethod('Transferencia')}
                                />
                                <div className="pay-btn-content">
                                    <span className="pay-icon"><i className="fa-solid fa-mobile-screen-button"></i></span>
                                    <span>Transferencia</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                <p className="cash-helper-text cash-helper-text--spaced">
                    <i className="fa-solid fa-circle-info cash-payment-icon"></i>
                    Verificá bien el monto de entrega antes de confirmar.
                </p>
            </Modal>

            <ConfirmModal
                open={showRegisterDiscardConfirm}
                title="Descartar registro"
                message="Hay datos ingresados en el servicio. ¿Querés salir y descartarlos?"
                confirmText="Descartar"
                confirmVariant="danger"
                onConfirm={() => {
                    setShowRegisterDiscardConfirm(false);
                    onBack?.();
                }}
                onCancel={() => setShowRegisterDiscardConfirm(false)}
            />

            <ConfirmModal
                open={showCashDiscardConfirm}
                title="Descartar cobro"
                message="Hay datos sin confirmar en el cobro en efectivo. ¿Querés descartarlos?"
                confirmText="Descartar"
                confirmVariant="danger"
                onConfirm={discardCashEntry}
                onCancel={() => setShowCashDiscardConfirm(false)}
            />

            <ConfirmModal
                open={showConfirmModal}
                title="Confirmar registro"
                message={<div className="confirm-message-content">{confirmMessageLines}</div>}
                confirmText="Registrar"
                onConfirm={doFinalSubmit}
                onCancel={handleConfirmCancel}
                busy={loading}
            />
        </div>
    );
}

export default RegisterServiceForm;
