import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ensureAuthSession, supabase } from '../supabase.js';
import { finalizeRegisteredService, notifySessionExpired, registerServiceDirectly, saveExpenseToDatabase } from '../services.js';
import { cloneServiceCatalog, DEFAULT_SERVICE_CATEGORIES, DEFAULT_SERVICE_CATALOG, sortCategoriesForDisplay } from '../serviceCatalog.js';
import { computeCombinedSplit } from '../paymentSplit.js';
import Button, { DetailActionButton } from './Button.jsx';
import Modal, { ConfirmModal, ModalCancelButton, ModalConfirmButton } from './Modal.jsx';
import { useFormGuard } from '../formGuard.js';

function hasSuspiciousPrice(rawValue) {
    const num = Number(rawValue);
    if (!Number.isFinite(num) || num <= 0) return false;
    return num > 0 && num < 1000;
}

function RegisterServiceForm({ session, onBack, initialAppointment = null, onRegisterSuccess, allowFiado: allowFiadoProp = true, settings = null, notify, showLoader, runTask }) {
    // App entrega `settings` (no `allowFiado`): el toggle de Ajustes gobierna
    // tanto el botón "Pendiente de pago" como la porción fiada del combinado.
    const allowFiado = settings && settings.allowFiado !== undefined
        ? !!settings.allowFiado
        : !!allowFiadoProp;
    const [clients, setClients] = useState([]);
    const [clientName, setClientName] = useState('');
    const [categories, setCategories] = useState(() => sortCategoriesForDisplay(DEFAULT_SERVICE_CATEGORIES));
    const [catalog, setCatalog] = useState(() => cloneServiceCatalog(DEFAULT_SERVICE_CATALOG));

    const [selectedCategory, setSelectedCategory] = useState('semi');
    const [selectedSubService, setSelectedSubService] = useState(null);
    const [useCombinedService, setUseCombinedService] = useState(false);

    const [combinedService1, setCombinedService1] = useState('');
    const [combinedCount1, setCombinedCount1] = useState(7);
    const [combinedService2, setCombinedService2] = useState('');

    const [serviceName, setServiceName] = useState('');
    const [servicePrice, setServicePrice] = useState(0);

    const [hasExternalRemoval, setHasExternalRemoval] = useState(false);
    const [selectedRemoval, setSelectedRemoval] = useState(null);

    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    // Reparto del cobro combinado: qué parte se cobra en efectivo y qué parte
    // en transferencia. El resto del neto queda como porción fiada (si los
    // pendientes están habilitados).
    const [splitEfectivo, setSplitEfectivo] = useState('');
    const [splitTransferencia, setSplitTransferencia] = useState('');
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

    // Bloquear scroll del fondo mientras haya modales de cobro/confirmación abiertos (mobile UX)
    useEffect(() => {
      const open = showCashModal || showConfirmModal || showCashDiscardConfirm || showRegisterDiscardConfirm;
      document.body.classList.toggle('no-scroll', open);
      return () => document.body.classList.remove('no-scroll');
    }, [showCashModal, showConfirmModal, showCashDiscardConfirm, showRegisterDiscardConfirm]);

    const priceInputRef = useRef(null);

    useEffect(() => {
        async function fetchClients() {
            try {
                // Evita autocompletado vacío por JWT vencido (RLS -> []).
                await ensureAuthSession().catch((authError) => {
                    notifySessionExpired();
                    throw authError;
                });
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
                // Evita catálogo por defecto por JWT vencido (RLS -> []).
                await ensureAuthSession().catch((authError) => {
                    notifySessionExpired();
                    throw authError;
                });
                const [categoryResult, priceResult] = await Promise.all([
                    supabase.from('categorias_servicio').select('clave, nombre, activo').eq('activo', true).order('nombre'),
                    supabase.from('precios').select('categoria, nombre, precio, activo').eq('activo', true).order('categoria').order('nombre')
                ]);
                if (categoryResult.error) throw categoryResult.error;
                if (priceResult.error) throw priceResult.error;

                const loadedCategories = categoryResult.data?.length ? categoryResult.data : DEFAULT_SERVICE_CATEGORIES;
                const newCatalog = Object.fromEntries(loadedCategories.map(category => [category.clave || category.key, []]));
                (priceResult.data || []).forEach(price => {
                    if (!newCatalog[price.categoria]) return;
                    newCatalog[price.categoria].push({ name: price.nombre, price: Number(price.precio) || 0, active: true });
                });
                if (!(priceResult.data || []).length) Object.assign(newCatalog, cloneServiceCatalog(DEFAULT_SERVICE_CATALOG));
                setCategories(sortCategoriesForDisplay(loadedCategories.map(category => ({
                    key: category.clave || category.key,
                    name: category.nombre || category.name,
                    active: category.activo !== false
                }))));
                setCatalog(newCatalog);
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
                catalog[cat].filter(item => item.active !== false).forEach(item => {
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
        if (!initialAppointment && selectedCategory === 'personalizado' && useCombinedService && combinedService1 && combinedService2) {
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
    }, [selectedCategory, useCombinedService, combinedService1, combinedService2, combinedCount1, allBasicOptions]);

    useEffect(() => {
        if (!initialAppointment && (selectedCategory !== 'personalizado' || !useCombinedService)) {
            const subservices = (catalog[selectedCategory] || []).filter(service => service.active !== false);
            if (subservices.length > 0) {
                setSelectedSubService(subservices[0]);
                setServiceName(subservices[0].name);
                setServicePrice(subservices[0].price);
            } else {
                setSelectedSubService(null);
                setServiceName('');
                setServicePrice(0);
            }
        }
        if (selectedCategory !== 'personalizado') setUseCombinedService(false);
        if (selectedCategory === 'remocion') {
            setHasExternalRemoval(false);
            setSelectedRemoval(null);
        }
    }, [selectedCategory, catalog, useCombinedService]);

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
        return rems.filter(rem => rem.name !== "Retiro Servicio Propio" && rem.active !== false);
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
        ? ['Transferencia', 'Efectivo', 'Combinado', 'Fiado']
        : ['Transferencia', 'Efectivo', 'Combinado'];

    const netoACobrar = useMemo(() => {
        const base = Number(finalPrice) || 0;
        const s = Number(sena) || 0;
        return Math.max(0, base - s);
    }, [finalPrice, sena]);

    // Reparto en vivo del cobro combinado: alimenta el resumen mientras se
    // tipea y la validación del submit (un solo lugar de cálculo, testeado).
    const combinedSplit = useMemo(() => computeCombinedSplit({
        neto: netoACobrar,
        efectivo: splitEfectivo,
        transferencia: splitTransferencia,
        allowFiado
    }), [netoACobrar, splitEfectivo, splitTransferencia, allowFiado]);

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

        if (paymentMethod === 'Combinado') {
            if (combinedSplit.error) {
                if (notify) notify(combinedSplit.error, 'error');
                return;
            }
            submitPayload.reparto = {
                efectivo: combinedSplit.efectivo,
                transferencia: combinedSplit.transferencia,
                pendiente: combinedSplit.pendiente
            };
        }

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
        const esCombinado = pendingSubmitData.metodoPago === 'Combinado';
        const reparto = pendingSubmitData.reparto || null;
        const vueltoNum = pendingSubmitData.metodoPago === 'Efectivo' ? cashVuelto : 0;
        const vueltoReturn = vueltoNum > 0 ? (vueltoReturnMethod || 'Efectivo') : null;
        // Flags compartidos entre los pasos del overlay y el toast final.
        let lastResp = null;
        let turnoFinalizado = false;
        let vueltoOk = false;

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
            // Reparto del cobro combinado (0 en los métodos únicos).
            montoEfectivo: reparto ? reparto.efectivo : 0,
            montoTransferencia: reparto ? reparto.transferencia : 0,
            saldoPendiente: reparto ? reparto.pendiente : 0,
            usuario_id: session?.authId,
            completado: true,
            vuelto: vueltoNum
        };

        try {
            await runTask({
                title: 'Registrando servicio',
                steps: [
                    {
                        label: 'Guardando el servicio',
                        run: async () => {
                            const resp = await registerServiceDirectly(transaction);
                            if (!resp || !resp.success) {
                                throw new Error('No se pudo registrar el servicio en la base de datos.');
                            }
                            lastResp = resp;
                        }
                    },
                    {
                        label: 'Actualizando el turno',
                        run: async () => {
                            const appointmentDatabaseId = initialAppointment?.rawId;
                            const appointmentLegacyId = initialAppointment?.legacy_id || (!appointmentDatabaseId ? initialAppointment?.id : null);
                            if ((appointmentDatabaseId || appointmentLegacyId) && session?.authId) {
                                await finalizeRegisteredService({
                                    turnoId: appointmentDatabaseId,
                                    turnoLegacyId: appointmentLegacyId,
                                    precio: pendingSubmitData.precio,
                                    serviceId: lastResp?.service?.rawId || null,
                                    paymentAmount: pendingSubmitData.metodoPago === 'Fiado' ? 0 : neto,
                                    paymentMethod: pendingSubmitData.metodoPago,
                                    // Combinado: una fila en pagos por cada medio
                                    // cobrado; la porción fiada no genera fila.
                                    payments: esCombinado && reparto
                                        ? [
                                            { amount: reparto.efectivo, method: 'Efectivo' },
                                            { amount: reparto.transferencia, method: 'Transferencia' }
                                        ].filter((entry) => entry.amount > 0)
                                        : null,
                                    usuarioId: session.authId
                                });
                                turnoFinalizado = true;
                            }
                        }
                    },
                    {
                        // Best-effort: el servicio y turno ya quedaron guardados;
                        // si falla el egreso de vuelto solo se avisa, no se aborta.
                        label: 'Registrando el vuelto',
                        run: async () => {
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
                                    vueltoOk = true;
                                } catch (gErr) {
                                    console.warn('No se pudo registrar el egreso de vuelto en gastos:', gErr);
                                }
                            }
                        }
                    }
                ]
            });

            if (turnoFinalizado) {
                if (notify) notify('Turno actualizado a completado.', 'success');
            }
            if (vueltoOk) {
                if (notify) notify('Vuelto registrado con éxito.', 'success');
            } else if (vueltoNum > 0 && vueltoReturn && vueltoReturn !== 'Efectivo') {
                if (notify) notify('Se registró el servicio, pero falló el vuelto.', 'warning');
            }

            setClientName('');
            setSena('');
            setSelectedCategory(categories.find(category => category.active)?.key || 'semi');
            setUseCombinedService(false);
            setHasExternalRemoval(false);
            setSelectedRemoval(null);
            setPaymentMethod('Transferencia');
            setSplitEfectivo('');
            setSplitTransferencia('');
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

    // Mismo criterio que el botón Volver: si hay datos cargados, salir los
    // descarta. El guardia avisa a App para pedir confirmación también cuando
    // se cambia de pestaña desde la navegación inferior.
    const hasUnsavedChanges = Boolean(
        clientName.trim() ||
        sena ||
        paymentMethod !== 'Transferencia' ||
        splitEfectivo ||
        splitTransferencia ||
        hasExternalRemoval ||
        selectedRemoval
    );
    useFormGuard(hasUnsavedChanges);

    const handleRegisterBack = () => {
        if (!hasUnsavedChanges) {
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
            {pendingSubmitData.metodoPago === 'Combinado' && pendingSubmitData.reparto && (
                <>
                    <div className="confirm-item">
                        <span className="confirm-label">Efectivo</span>
                        <strong>${Number(pendingSubmitData.reparto.efectivo).toLocaleString("es-AR")}</strong>
                    </div>
                    <div className="confirm-item">
                        <span className="confirm-label">Transferencia</span>
                        <strong>${Number(pendingSubmitData.reparto.transferencia).toLocaleString("es-AR")}</strong>
                    </div>
                    {pendingSubmitData.reparto.pendiente > 0 && (
                        <div className="confirm-item">
                            <span className="confirm-label">Pendiente (fiado)</span>
                            <strong>${Number(pendingSubmitData.reparto.pendiente).toLocaleString("es-AR")}</strong>
                        </div>
                    )}
                </>
            )}
        </>
    ) : null;

    return (
        <div id="tab-registrar" className="tab-pane active">
            <div className="section-title section-title-with-back">
                {onBack && (
                    <button
                        type="button"
                        id="btn-cancel-checkout"
                        className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only"
                        onClick={handleRegisterBack}
                        aria-label="Volver"
                    >
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                        <span className="mobile-action-label">Volver</span>
                    </button>
                )}
                <div className="section-title-text">
                    <h3>Registrar Servicio</h3>
                    <p>Agrega un nuevo trabajo realizado en segundos.</p>
                </div>
            </div>

            <form id="service-form" className="cute-form" onSubmit={initiateSubmit}>
                {initialAppointment && Number(initialAppointment.precio) > 0 && (
                    <div className="checkout-sena-banner">
                        <i className="fa-solid fa-circle-info" />
                        Turno reservado. Seña de <strong>${Number(initialAppointment.precio).toLocaleString("es-AR")}</strong> ya cobrada; se descontará del total automáticamente.
                    </div>
                )}
                <div className="form-group">
                    <label htmlFor="client-name">Nombre de la Clienta <span className="field-required">(obligatorio)</span></label>
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
                    <label><i className="fa-solid fa-tags"></i> Selecciona una Categoría <span className="field-required">(obligatorio)</span></label>
                    <div className="category-grid">
                        {categories.map((category) => (
                            <button
                                key={category.key}
                                type="button"
                                className={`btn-cat ${selectedCategory === category.key ? 'active' : ''}`}
                                onClick={() => setSelectedCategory(category.key)}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedCategory === 'personalizado' && !useCombinedService && (
                    <div className="form-group service-choice-row">
                        <DetailActionButton
                            icon="fa-puzzle-piece"
                            label="Armar combinación"
                            onClick={() => setUseCombinedService(true)}
                        />
                    </div>
                )}

                {(selectedCategory !== 'personalizado' || !useCombinedService) ? (
                    <div className="form-group" id="services-grid-wrapper">
                        <label id="services-grid-label">Servicio Específico <span className="field-required">(obligatorio)</span></label>
                        <div id="services-grid" className="services-grid">
                            {(catalog[selectedCategory] || []).filter(service => service.active !== false).map((service) => (
                                <button
                                    key={service.name}
                                    type="button"
                                    className={`btn-service ${selectedSubService?.name === service.name ? 'active' : ''}`}
                                    onClick={() => selectSubService(service)}
                                >
                                    <span className="service-name-label">{service.name}</span>
                                    <span className="price-tag">${service.price.toLocaleString("es-AR")}</span>
                                </button>
                            ))}
                        </div>
                        {(catalog[selectedCategory] || []).filter(service => service.active !== false).length === 0 && (
                            <p className="catalog-empty-note">No hay servicios activos en esta categoría.</p>
                        )}
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
                        <DetailActionButton
                            icon="fa-arrow-left"
                            label="Elegir servicio"
                            onClick={() => setUseCombinedService(false)}
                        />
                    </div>
                )}

                <div className="form-group">
                    <label>Precio Total ($) <span className="field-required">(obligatorio)</span></label>
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
                                        {method === 'Combinado' && <i className="fa-solid fa-layer-group"></i>}
                                        {method === 'Fiado' && <i className="fa-solid fa-hand-holding-hand"></i>}
                                    </span>
                                    <span>{method === 'Fiado' ? 'Pendiente de pago' : method}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {paymentMethod === 'Combinado' && (
                    <div className="combined-split-box">
                        <div className="combined-split-title">
                            <i className="fa-solid fa-layer-group"></i>
                            Reparto del cobro
                        </div>
                        <div className="form-row-2">
                            <div className="form-group">
                                <label htmlFor="split-efectivo">Efectivo ($)</label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-money-bill-wave input-icon" />
                                    <input
                                        id="split-efectivo"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={splitEfectivo}
                                        onChange={(e) => setSplitEfectivo(e.target.value)}
                                        placeholder="0"
                                        inputMode="numeric"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="split-transferencia">Transferencia ($)</label>
                                <div className="input-wrapper">
                                    <i className="fa-solid fa-mobile-screen-button input-icon" />
                                    <input
                                        id="split-transferencia"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={splitTransferencia}
                                        onChange={(e) => setSplitTransferencia(e.target.value)}
                                        placeholder="0"
                                        inputMode="numeric"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="combined-split-summary">
                            <div className="combined-split-row">
                                <span>Neto a cobrar</span>
                                <strong>${netoACobrar.toLocaleString("es-AR")}</strong>
                            </div>
                            <div className="combined-split-row">
                                <span>Cobrado ahora</span>
                                <strong>${combinedSplit.cobrado.toLocaleString("es-AR")}</strong>
                            </div>
                            <div className={`combined-split-row combined-split-row--pending ${combinedSplit.pendiente > 0 ? 'is-pending' : ''}`}>
                                <span>Pendiente (fiado)</span>
                                <strong>${combinedSplit.pendiente.toLocaleString("es-AR")}</strong>
                            </div>
                        </div>
                        {combinedSplit.error && (
                            <p className="combined-split-error">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                {combinedSplit.error}
                            </p>
                        )}
                    </div>
                )}

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
                        <ModalCancelButton onClick={handleCashCancel} />
                        <ModalConfirmButton onClick={handleCashConfirm} />
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
