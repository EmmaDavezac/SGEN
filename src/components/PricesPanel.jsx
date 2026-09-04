import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabase.js';
import { ConfirmModal } from './Modal.jsx';
import Button from './Button.jsx';

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

function PricesPanel({ session, notify, showLoader }) {
    const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
    const [originalCatalog, setOriginalCatalog] = useState(DEFAULT_CATALOG);
    const [isEditing, setIsEditing] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);

    const isAdmin = session?.rol === 'admin';

    const deepCloneCatalog = (cat) => {
        const cloned = {};
        Object.keys(cat).forEach(key => {
            cloned[key] = cat[key].map(item => ({ ...item }));
        });
        return cloned;
    };

    useEffect(() => {
        async function fetchPrices() {
            if (!supabase) return;
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
                    setOriginalCatalog(deepCloneCatalog(newCatalog));
                }
            } catch (err) {
                console.warn("Error fetching prices:", err);
            }
        }
        fetchPrices();
    }, []);

    const handleEdit = () => {
        setOriginalCatalog(deepCloneCatalog(catalog));
        setIsEditing(true);
    };

    const handleCancelRequest = () => {
        setShowCancelConfirm(true);
    };

    const handleCancelConfirm = () => {
        setCatalog(deepCloneCatalog(originalCatalog));
        setIsEditing(false);
        setShowCancelConfirm(false);
        notify && notify('Edición cancelada', 'info');
    };

    const handlePriceChange = (category, index, newPrice) => {
        const num = Number(newPrice);
        const val = Number.isFinite(num) ? Math.max(0, num) : 0;
        setCatalog(prev => {
            const next = { ...prev };
            next[category] = prev[category].map((item, i) =>
                i === index ? { ...item, price: val } : item
            );
            return next;
        });
    };

    const handleSaveRequest = () => {
        setShowSaveConfirm(true);
    };

    const handleSaveConfirm = async () => {
        setShowSaveConfirm(false);
        if (!supabase || !session?.authId) {
            notify && notify('No hay conexión a la nube.', 'error');
            return;
        }
        showLoader && showLoader(true, 'Guardando precios...');
        try {
            const rows = [];
            Object.keys(catalog).forEach(categoria => {
                catalog[categoria].forEach(item => {
                    rows.push({
                        categoria,
                        nombre: item.name,
                        precio: Number(item.price) || 0,
                        actualizado_por: session.authId
                    });
                });
            });
            const { error } = await supabase
                .from('precios')
                .upsert(rows, { onConflict: 'categoria,nombre' });
            if (error) throw error;

            setOriginalCatalog(deepCloneCatalog(catalog));
            setIsEditing(false);
            notify && notify('Precios guardados con éxito', 'success');
        } catch (err) {
            console.error('Error saving prices:', err);
            notify && notify(err.message || 'No se pudieron guardar los precios.', 'error');
        } finally {
            showLoader && showLoader(false);
        }
    };

    const orderedCategories = useMemo(() => {
        const order = ['semi', 'kapping', 'softgel', 'esculpidas', 'remocion', 'personalizado'];
        return order.filter(k => catalog[k]);
    }, [catalog]);

    if (!isAdmin) {
        return (
            <div id="tab-precios" className="tab-pane active">
                <div className="section-title">
                    <div>
                        <h3>Lista de Precios</h3>
                        <p>Consultá los valores de cada servicio.</p>
                    </div>
                </div>
                <div className="chart-section" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <i className="fa-solid fa-lock" style={{ fontSize: '48px', color: 'var(--barbie-pink)', marginBottom: '12px' }}></i>
                    <h4 style={{ color: 'var(--barbie-dark)' }}>Sólo administradores</h4>
                    <p className="text-muted" style={{ fontSize: '13px', marginTop: '8px' }}>
                        No tenés permiso para visualizar o editar este panel.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div id="tab-precios" className="tab-pane active">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div>
                    <h3>Lista de Precios</h3>
                    <p>Gestioná los valores de cada servicio.</p>
                </div>
                {!isEditing ? (
                    <button
                        type="button"
                        id="btn-edit-mode"
                        className="btn btn-secondary btn-sm"
                        style={{ width: 'auto', padding: '8px 16px', whiteSpace: 'nowrap', fontSize: '13px' }}
                        onClick={handleEdit}
                    >
                        <i className="fa-solid fa-pen-to-square"></i> Editar
                    </button>
                ) : (
                    <div id="edit-actions-container" style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            id="btn-cancel-prices"
                            className="btn btn-secondary btn-sm"
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
                            onClick={handleCancelRequest}
                        >
                            <i className="fa-solid fa-xmark"></i> Cancelar
                        </button>
                        <button
                            type="button"
                            id="btn-save-prices"
                            className="btn btn-primary btn-sm"
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', height: '32px' }}
                            onClick={handleSaveRequest}
                        >
                            <i className="fa-solid fa-floppy-disk"></i> Guardar
                        </button>
                    </div>
                )}
            </div>

            <div className="prices-editor-container">
                {orderedCategories.map(catKey => (
                    <div key={catKey} className="price-category-group">
                        <div className="price-category-title">
                            {CATEGORY_LABELS[catKey] || catKey}
                        </div>
                        {(catalog[catKey] || []).map((item, index) => (
                            <div key={`${catKey}-${item.name}`} className="price-item-row">
                                <span className="price-item-name">{item.name}</span>
                                {isEditing ? (
                                    <div className="price-input-wrapper">
                                        <span>$</span>
                                        <input
                                            type="number"
                                            className="price-input-field"
                                            value={item.price}
                                            min="0"
                                            step="1"
                                            onChange={(e) => handlePriceChange(catKey, index, e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <span className="price-val-label">
                                        ${Number(item.price).toLocaleString("es-AR")}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <ConfirmModal
                open={showCancelConfirm}
                title="Descartar cambios"
                message="Tenés cambios sin guardar. ¿Deseás cancelar la edición y perder los cambios?"
                confirmText="Descartar"
                confirmVariant="danger"
                onConfirm={handleCancelConfirm}
                onCancel={() => setShowCancelConfirm(false)}
            />

            <ConfirmModal
                open={showSaveConfirm}
                title="Guardar cambios"
                message="¿Confirmás que deseás guardar la nueva lista de precios en la nube?"
                confirmText="Guardar"
                onConfirm={handleSaveConfirm}
                onCancel={() => setShowSaveConfirm(false)}
            />
        </div>
    );
}

export default PricesPanel;
