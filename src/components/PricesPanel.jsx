import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureAuthSession, supabase } from '../supabase.js';
import { notifySessionExpired } from '../services.js';
import { ListIconButton, PanelCancelButton, PanelSaveButton } from './Button.jsx';
import { ConfirmModal } from './Modal.jsx';
import {
    cloneServiceCatalog,
    createCategoryKey,
    DEFAULT_SERVICE_CATEGORIES,
    DEFAULT_SERVICE_CATALOG
} from '../serviceCatalog.js';
import { useFormGuard } from '../formGuard.js';
import { usePullToRefreshHandler } from '../pullToRefresh.js';

function PricesPanel({ session, notify, showLoader }) {
    const [categories, setCategories] = useState(DEFAULT_SERVICE_CATEGORIES);
    const [catalog, setCatalog] = useState(() => cloneServiceCatalog(DEFAULT_SERVICE_CATALOG));
    const [pendingChanges, setPendingChanges] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    // Modo edición de precios: cambiar de pestaña pide confirmación (mismo
    // comportamiento que tenía el switchTab del legado).
    useFormGuard(isEditing);
    const [selectedCategoryKey, setSelectedCategoryKey] = useState(null);
    const [categoryNameDraft, setCategoryNameDraft] = useState('');
    const [isEditingCategoryName, setIsEditingCategoryName] = useState(false);
    const [serviceDraft, setServiceDraft] = useState({ name: '', price: '0' });
    const [editingServiceIndex, setEditingServiceIndex] = useState(null);
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [pendingCategoryToggle, setPendingCategoryToggle] = useState(null);
    const [pendingServiceToggle, setPendingServiceToggle] = useState(null);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    // Borrador de servicio sin guardar pendiente de confirmar antes de descartar.
    // 'form' cierra solo el formulario; 'categories' vuelve además a la lista.
    const [serviceDiscard, setServiceDiscard] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterStatus, setFilterStatus] = useState('todos');

    const isAdmin = session?.rol === 'admin' || session?.rol === 'superadmin';

    const loadCatalog = useCallback(async () => {
        if (!supabase) return;
        try {
            // Con el JWT vencido RLS devuelve [] sin error: validar antes para
            // no mostrar el catálogo por defecto como si fuera el real.
            try {
                await ensureAuthSession();
            } catch (authError) {
                notifySessionExpired();
                throw authError;
            }
            const [categoryResult, priceResult] = await Promise.all([
                supabase.from('categorias_servicio').select('clave, nombre, activo').order('nombre'),
                supabase.from('precios').select('categoria, nombre, precio, activo').order('categoria').order('nombre')
            ]);
            if (categoryResult.error) throw categoryResult.error;
            if (priceResult.error) throw priceResult.error;

            const loadedCategories = (categoryResult.data || []).length
                ? categoryResult.data
                : DEFAULT_SERVICE_CATEGORIES;
            const loadedCatalog = {};
            loadedCategories.forEach(category => { loadedCatalog[category.clave || category.key] = []; });
            (priceResult.data || []).forEach(price => {
                if (!loadedCatalog[price.categoria]) loadedCatalog[price.categoria] = [];
                loadedCatalog[price.categoria].push({
                    name: price.nombre,
                    price: Number(price.precio) || 0,
                    active: price.activo !== false
                });
            });
            if (!(priceResult.data || []).length) {
                Object.assign(loadedCatalog, cloneServiceCatalog(DEFAULT_SERVICE_CATALOG));
            }
            setCategories(loadedCategories.map(category => ({
                key: category.clave || category.key,
                name: category.nombre || category.name,
                active: category.activo !== false
            })));
            setCatalog(loadedCatalog);
        } catch (err) {
            console.error('Error cargando el catálogo:', err);
            setLoadError('No se pudo cargar el catálogo. Aplicá la migración 20260823000023_manage_service_catalog.sql y volvé a intentar.');
        }
    }, []);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    // Deslizar hacia abajo recarga el catálogo de servicios y precios.
    usePullToRefreshHandler(loadCatalog);

    const orderedCategories = useMemo(() => [...categories].sort((a, b) => {
        if (a.key === 'personalizado') return 1;
        if (b.key === 'personalizado') return -1;
        return a.name.localeCompare(b.name, 'es');
    }), [categories]);

    const normalizedSearch = search.trim().toLowerCase();
    const matchesStatusFilter = (isActive) => filterStatus === 'todos'
        || (filterStatus === 'activos' ? isActive : !isActive);
    const categoriasFiltradas = orderedCategories.filter((category) => {
        const matchesSearch = !normalizedSearch
            || category.name.toLowerCase().includes(normalizedSearch)
            || (catalog[category.key] || []).some((service) =>
                service.name.toLowerCase().includes(normalizedSearch));
        return matchesSearch && matchesStatusFilter(category.active !== false);
    });
    const readonlyCategories = orderedCategories
        .filter(category => matchesStatusFilter(category.active !== false))
        .map(category => {
            const activeServices = (catalog[category.key] || []).filter(service => service.active !== false);
            const categoryMatches = normalizedSearch && category.name.toLowerCase().includes(normalizedSearch);
            const matchingServices = normalizedSearch
                ? activeServices.filter(service => service.name.toLowerCase().includes(normalizedSearch))
                : [];
            if (normalizedSearch && !categoryMatches && matchingServices.length === 0) return null;
            return {
                category,
                activeServices,
                categoryMatches,
                servicesToShow: normalizedSearch
                    ? (categoryMatches ? activeServices : matchingServices)
                    : activeServices
            };
        })
        .filter(Boolean);

    const selectedCategory = selectedCategoryKey
        ? categories.find(category => category.key === selectedCategoryKey)
        : null;

    const openCategoryEditor = (categoryKey) => {
        const category = categories.find(item => item.key === categoryKey);
        if (!category) return;
        setCategoryNameDraft(category.name);
        setIsEditingCategoryName(false);
        setSelectedCategoryKey(categoryKey);
        setServiceDraft({ name: '', price: '0' });
        setEditingServiceIndex(null);
    };

    const resetCategorySelection = () => {
        setSelectedCategoryKey(null);
        setCategoryNameDraft('');
        setIsEditingCategoryName(false);
        setServiceDraft({ name: '', price: '0' });
        setEditingServiceIndex(null);
    };

    /* El nombre se edita en dos pasos: "Editar" habilita el input y "Descartar"
       lo vuelve al nombre guardado sin aplicar. Así no se borra por accidente. */
    const startCategoryNameEdit = () => {
        if (!selectedCategory) return;
        setCategoryNameDraft(selectedCategory.name);
        setIsEditingCategoryName(true);
    };

    const cancelCategoryNameEdit = () => {
        if (selectedCategory) {
            setCategoryNameDraft(selectedCategory.name);
        }
        setIsEditingCategoryName(false);
    };

    const finishEditing = () => {
        setIsEditing(false);
        resetCategorySelection();
        setShowNewCategory(false);
        setNewCategoryName('');
        setCategoryNameDraft('');
        setIsEditingCategoryName(false);
    };

    /* Con guardado inmediato, "sin guardar" = un fallo de sincronización
       (pendingChanges), un renombrar abierto y sin aplicar, o el borrador de un
       servicio a medio cargar (nuevo o editado) que se perdería al descartar. */
    const appliedRenameName = selectedCategory ? selectedCategory.name : null;
    const pendingRename = isEditingCategoryName
        && appliedRenameName !== null
        && categoryNameDraft.trim() !== ''
        && categoryNameDraft.trim() !== appliedRenameName;
    const serviceDraftHasData = editingServiceIndex === -1
        ? (serviceDraft.name.trim() !== '' || Number(serviceDraft.price) > 0)
        : editingServiceIndex !== null
            ? (() => {
                const original = (catalog[selectedCategoryKey] || [])[editingServiceIndex];
                return !!original && (
                    serviceDraft.name.trim() !== original.name
                    || String(serviceDraft.price) !== String(original.price)
                );
            })()
            : false;
    const hasUnsavedChanges = pendingChanges || pendingRename || serviceDraftHasData;

    /* Aviso nativo del navegador si se cierra la pestaña con cambios sin guardar. */
    useEffect(() => {
        if (!isEditing || !hasUnsavedChanges) return undefined;
        const warnBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [isEditing, hasUnsavedChanges]);

    const requestFinishEditing = () => {
        if (!hasUnsavedChanges) {
            finishEditing();
            return;
        }
        setShowExitConfirm(true);
    };

    /* Descartar = re-sincronizar desde la nube y salir de la edición. Solo
       quedan "sin guardar" fallos de sync o renombrares sin aplicar, así que
       recargar el catálogo descarta exactamente lo que no se guardó. */
    const discardAndExit = async () => {
        setShowExitConfirm(false);
        await loadCatalog();
        setPendingChanges(false);
        finishEditing();
    };

    /* Cerrar el formulario de servicio (Volver de la cabecera o Cancelar):
       si hay borrador a medio cargar, se confirma antes de descartar. */
    const requestCloseServiceForm = () => {
        if (!serviceDraftHasData) {
            setEditingServiceIndex(null);
            setServiceDraft({ name: '', price: '0' });
            return;
        }
        setServiceDiscard('form');
    };

    /* Volver de "Modificar categoría" a la lista: si además hay un servicio a
       medio cargar, ese borrador también pide confirmación. */
    const requestBackToCategories = () => {
        if (!serviceDraftHasData) {
            resetCategorySelection();
            return;
        }
        setServiceDiscard('categories');
    };

    const confirmServiceDiscard = () => {
        if (serviceDiscard === 'categories') {
            resetCategorySelection();
        } else {
            setEditingServiceIndex(null);
            setServiceDraft({ name: '', price: '0' });
        }
        setServiceDiscard(null);
    };

    const handleEdit = () => {
        setIsEditing(true);
        resetCategorySelection();
    };

    const handleCategoryNameChange = (value) => {
        setCategoryNameDraft(value);
    };

    const addCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        if (categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
            notify && notify('Ya existe una categoría con ese nombre.', 'error');
            return;
        }
        const key = createCategoryKey(name, categories.map(category => category.key));
        const nextCategory = { key, name, active: true };
        setCategories(previous => [...previous, nextCategory]);
        setCatalog(previous => ({ ...previous, [key]: [] }));
        setNewCategoryName('');
        setShowNewCategory(false);
        const persisted = await persistCategoryRow({ clave: key, nombre: name, activo: true });
        if (persisted) notify && notify('Categoría creada.', 'success');
    };

    const saveCurrentCategory = () => {
        const categoryKey = selectedCategoryKey;
        const category = categories.find(item => item.key === categoryKey);
        const newName = categoryNameDraft.trim();
        if (!category || !newName) {
            notify && notify('Ingresá un nombre válido para la categoría.', 'error');
            return false;
        }
        if (categories.some(item => item.key !== categoryKey && item.name.toLowerCase() === newName.toLowerCase())) {
            notify && notify('Ya existe una categoría con ese nombre.', 'error');
            return false;
        }

        const updatedCategory = { ...category, name: newName };
        setCategories(previous => previous.map(item =>
            item.key === categoryKey ? updatedCategory : item
        ));
        setCategoryNameDraft(newName);
        setIsEditingCategoryName(false);
        return persistCategoryRow({ clave: categoryKey, nombre: newName, activo: updatedCategory.active !== false });
    };

    /* Upsert de una fila de categorias_servicio. Marca pendingChanges cuando
       la sincronización falla, para que "Terminar edición" pueda avisar. */
    const persistCategoryRow = async (row) => {
        if (!supabase || !session?.authId) {
            notify && notify('No hay conexión a la nube; el cambio no se guardó.', 'error');
            setPendingChanges(true);
            return false;
        }
        if (showLoader) showLoader(true, 'Guardando categoría...');
        try {
            const { error } = await supabase
                .from('categorias_servicio')
                .upsert({ ...row, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
            if (error) throw error;
            setPendingChanges(false);
            return true;
        } catch (err) {
            console.error('Error guardando categoría:', err);
            notify && notify(err.message || 'No se pudo guardar la categoría.', 'error');
            setPendingChanges(true);
            return false;
        } finally {
            if (showLoader) showLoader(false);
        }
    };

    /* Upsert de los servicios de una categoría en `precios`. */
    const persistCategoryServices = async (categoryKey, services) => {
        if (!supabase || !session?.authId) {
            notify && notify('No hay conexión a la nube; los cambios no se guardaron en la nube.', 'error');
            setPendingChanges(true);
            return;
        }
        const serviceRows = (services || []).map(service => ({
            categoria: categoryKey,
            nombre: service.name,
            precio: Number(service.price) || 0,
            activo: service.active !== false,
            actualizado_por: session.authId
        }));
        if (!serviceRows.length) return;
        if (showLoader) showLoader(true, 'Guardando servicios...');
        try {
            const { error } = await supabase
                .from('precios')
                .upsert(serviceRows, { onConflict: 'categoria,nombre' });
            if (error) throw error;
            setPendingChanges(false);
        } catch (err) {
            console.error('Error guardando servicios:', err);
            notify && notify(err.message || 'No se pudieron guardar los servicios.', 'error');
            setPendingChanges(true);
        } finally {
            if (showLoader) showLoader(false);
        }
    };

    const toggleCategory = (key) => {
        const category = categories.find(item => item.key === key);
        if (!category) return;
        setPendingCategoryToggle({
            key,
            nextActive: !category.active,
            name: category.name
        });
    };

    const confirmCategoryToggle = async () => {
        if (!pendingCategoryToggle) return;
        const toggled = { ...pendingCategoryToggle };
        setCategories(previous => previous.map(category =>
            category.key === toggled.key
                ? { ...category, active: toggled.nextActive }
                : category
        ));
        setPendingCategoryToggle(null);
        await persistCategoryRow({ clave: toggled.key, nombre: toggled.name, activo: toggled.nextActive });
    };

    const addService = (event) => {
        event.preventDefault();
        const name = serviceDraft.name.trim();
        const price = Number(serviceDraft.price);
        if (!name || !Number.isFinite(price) || price < 0) {
            notify && notify('Ingresá un nombre y un precio válido.', 'error');
            return;
        }
        if ((catalog[selectedCategoryKey] || []).some(service => service.name.toLowerCase() === name.toLowerCase())) {
            notify && notify('Ese servicio ya existe en la categoría.', 'error');
            return;
        }
        const updatedServices = [...(catalog[selectedCategoryKey] || []), { name, price, active: true }];
        setCatalog(previous => ({
            ...previous,
            [selectedCategoryKey]: updatedServices
        }));
        setServiceDraft({ name: '', price: '0' });
        setEditingServiceIndex(null);
        persistCategoryServices(selectedCategoryKey, updatedServices);
    };

    const beginEditService = (index) => {
        const service = catalog[selectedCategoryKey]?.[index];
        if (!service) return;
        setEditingServiceIndex(index);
        setServiceDraft({
            name: service.name,
            price: String(service.price)
        });
    };

    const saveEditedService = (event) => {
        event.preventDefault();
        if (editingServiceIndex === null || !selectedCategoryKey) return;
        const name = serviceDraft.name.trim();
        const price = Number(serviceDraft.price);
        if (!name || !Number.isFinite(price) || price < 0) {
            notify && notify('Ingresá un nombre y un precio válido.', 'error');
            return;
        }
        const updatedServices = (catalog[selectedCategoryKey] || []).map((service, index) =>
            index === editingServiceIndex ? { ...service, name, price } : service
        );
        setCatalog(previous => ({
            ...previous,
            [selectedCategoryKey]: updatedServices
        }));
        setEditingServiceIndex(null);
        setServiceDraft({ name: '', price: '0' });
        persistCategoryServices(selectedCategoryKey, updatedServices);
    };

    const toggleService = (index) => {
        const service = catalog[selectedCategoryKey]?.[index];
        if (!service) return;
        setPendingServiceToggle({ index, nextActive: service.active === false, name: service.name });
    };

    const confirmServiceToggle = () => {
        if (!pendingServiceToggle || !selectedCategoryKey) return;
        const updatedServices = (catalog[selectedCategoryKey] || []).map((service, index) =>
            index === pendingServiceToggle.index
                ? { ...service, active: pendingServiceToggle.nextActive }
                : service
        );
        setCatalog(previous => ({
            ...previous,
            [selectedCategoryKey]: updatedServices
        }));
        persistCategoryServices(selectedCategoryKey, updatedServices);
        setPendingServiceToggle(null);
    };

    const canShowServices = selectedCategoryKey && !showNewCategory;

    if (!isAdmin) {
        return (
            <div id="tab-precios" className="tab-pane active">
                <div className="section-title">
                    <div>
                        <h3>Lista de Precios</h3>
                        <p>Consultá los valores de cada servicio.</p>
                    </div>
                </div>
                <div className="chart-section prices-access-denied">
                    <i className="fa-solid fa-lock prices-access-icon"></i>
                    <h4 className="prices-access-title">Sólo administradores</h4>
                    <p className="text-muted prices-access-description">No tenés permiso para visualizar o editar este panel.</p>
                </div>
            </div>
        );
    }

    return (
        <div id="tab-precios" className="tab-pane active">
            {!selectedCategoryKey && (
                <div className="section-title section-title-with-action">
                    <div>
                        <h3>Categorías y servicios</h3>
                        <p>Administrá las categorías y sus servicios.</p>
                    </div>
                    {!isEditing && (
                        <button
                            type="button"
                            id="btn-edit-mode"
                            className="btn btn-secondary btn-sm prices-edit-action mobile-icon-only"
                            onClick={handleEdit}
                            aria-label="Editar catálogo"
                        >
                            <i className="fa-solid fa-pen-to-square"></i>
                            <span className="mobile-action-label">Editar</span>
                        </button>
                    )}
                    {isEditing && (
                        <button
                            type="button"
                            id="btn-finish-edit-mode"
                            className="btn btn-primary btn-sm prices-edit-action mobile-icon-only"
                            onClick={requestFinishEditing}
                            aria-label="Terminar edición"
                        >
                            <i className="fa-solid fa-check"></i>
                            <span className="mobile-action-label">Terminar edición</span>
                        </button>
                    )}
                </div>
            )}

            {loadError && <div className="form-error-message" role="alert">{loadError}</div>}

            {!selectedCategoryKey && (
                <div className="filters-container">
                    <div className={`search-box-container${search ? ' has-text' : ''}`}>
                        <i className="fa-solid fa-magnifying-glass search-icon"></i>
                        <input
                            type="search"
                            placeholder="Buscar servicio o categoría..."
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
                        title="Filtrar catálogo"
                        aria-label="Filtrar catálogo"
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
                                    { key: 'activos', label: 'Activos' },
                                    { key: 'inactivos', label: 'Inactivos' }
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        className={`filter-choice ${filterStatus === opt.key ? 'active' : ''}`}
                                        onClick={() => setFilterStatus(opt.key)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!isEditing && (
                <div className="prices-list-readonly unified-list list-scroll list-section-gap view-enter">
                    {readonlyCategories.length === 0 && (
                        <div className="list-empty-state"><p>No se encontraron servicios que coincidan con la búsqueda.</p></div>
                    )}
                    {readonlyCategories.map(({ category, activeServices, categoryMatches, servicesToShow }) => (
                        <div key={category.key} className="appointment-card client-card unified-card price-category-group">
                            <div className="client-avatar" aria-hidden="true">
                                <i className="fa-solid fa-tags"></i>
                            </div>
                            <div className="appointment-info-col client-info-col">
                                <div className="appointment-client-name">{category.name}</div>
                                <div className="appointment-service-name client-contact-row">
                                    {activeServices.length} servicios
                                </div>
                            </div>
                            {category.active === false && (
                                <div className="client-actions-col">
                                    <span className="status-tag señado">Inactiva</span>
                                </div>
                            )}
                            <div className="client-card-details price-category-services">
                            {servicesToShow.map(service => (
                                <div key={`${category.key}-${service.name}`} className="price-item-row">
                                    <span className="catalog-service-label">{service.name}</span>
                                    <span className="price-val-label">${Number(service.price).toLocaleString('es-AR')}</span>
                                </div>
                            ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isEditing && !selectedCategoryKey && (
                <>
                    <div className="catalog-list-header">
                        <strong>Categorías</strong>
                        <button
                            type="button"
                            className={`btn btn-primary btn-sm panel-header-action mobile-icon-only${showNewCategory ? ' btn-back' : ''}`}
                            onClick={() => {
                                if (showNewCategory) {
                                    setNewCategoryName('');
                                    setShowNewCategory(false);
                                } else {
                                    setShowNewCategory(true);
                                }
                            }}
                            aria-expanded={showNewCategory}
                            aria-label={showNewCategory ? 'Volver' : 'Nueva categoría'}
                        >
                            <i className={`fa-solid ${showNewCategory ? 'fa-arrow-left' : 'fa-plus'}`} aria-hidden="true"></i>
                            <span className="mobile-action-label">{showNewCategory ? 'Volver' : 'Nuevo'}</span>
                        </button>
                    </div>

                    <div className="prices-category-list unified-list list-scroll list-section-gap view-enter">
                        {showNewCategory && (
                            <div className="catalog-management-form catalog-new-category-form view-enter">
                                <label htmlFor="new-service-category">Nombre de la categoría <span className="field-required">(obligatorio)</span></label>
                                <div className="catalog-name-row">
                                <input
                                    id="new-service-category"
                                    value={newCategoryName}
                                    onChange={(event) => setNewCategoryName(event.target.value)}
                                    maxLength={60}
                                    placeholder="Ej. Nail art"
                                    autoFocus
                                />
                                <PanelSaveButton
                                    type="button"
                                    label="Guardar"
                                    iconOnlyOnMobile={false}
                                    onClick={addCategory}
                                    disabled={!newCategoryName.trim()}
                                />
                            </div>
                        </div>
                        )}

                        {categoriasFiltradas.length === 0 && !showNewCategory && (
                            <div className="list-empty-state"><p>No se encontraron categorías que coincidan con la búsqueda.</p></div>
                        )}
                        {categoriasFiltradas.map(category => {
                            return (
                                <div
                                    key={category.key}
                                    className="appointment-card client-card unified-card"
                                >
                                    <div className="client-avatar" aria-hidden="true">
                                        <i className="fa-solid fa-folder-open"></i>
                                    </div>
                                    <div className="appointment-info-col client-info-col">
                                        <div className="appointment-client-name">{category.name}</div>
                                        <div className="appointment-service-name client-contact-row">
                                            {(catalog[category.key] || []).length} servicios
                                            {category.active !== false ? '' : ' · Inactiva'}
                                        </div>
                                    </div>
                                    <div className="client-actions-col">
                                        <ListIconButton
                                            icon={category.active === false ? 'fa-rotate-left' : 'fa-box-archive'}
                                            label={category.active === false ? 'Reactivar' : 'Archivar'}
                                            variant='secondary'
                                            title={category.active === false ? `Reactivar ${category.name}` : `Dar de baja ${category.name}`}
                                            onClick={() => toggleCategory(category.key)}
                                        />
                                        <ListIconButton
                                            icon="fa-pen-to-square"
                                            label="Editar"
                                            variant="primary"
                                            title={`Editar ${category.name}`}
                                            onClick={() => openCategoryEditor(category.key)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {isEditing && canShowServices && (
                <div className="prices-category-detail view-enter" key={selectedCategoryKey}>
                    <div className="section-title section-title-with-back">
                        <button
                            type="button"
                            className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only"
                            onClick={requestBackToCategories}
                            aria-label="Volver a categorías"
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                            <span className="mobile-action-label">Volver</span>
                        </button>
                        <div className="section-title-text">
                            <h3>Modificar categoría</h3>
                            <p>Renombrala y administrá sus servicios.</p>
                        </div>
                    </div>

                    <form
                        className="catalog-category-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            saveCurrentCategory();
                        }}
                    >
                        <label htmlFor="rename-category-input">Nombre de la categoría <span className="field-required">(obligatorio)</span></label>
                        <div className="catalog-category-form-row">
                            <input
                                key={isEditingCategoryName ? 'edit' : 'view'}
                                id="rename-category-input"
                                placeholder="Ej. Nail art"
                                value={categoryNameDraft}
                                onChange={(event) => handleCategoryNameChange(event.target.value)}
                                onFocus={(event) => event.target.select()}
                                readOnly={!isEditingCategoryName}
                                maxLength={60}
                                aria-label="Nombre de la categoría"
                                autoFocus={isEditingCategoryName}
                            />
                            {isEditingCategoryName ? (
                                <>
                                    <PanelCancelButton
                                        label="Descartar"
                                        onClick={cancelCategoryNameEdit}
                                    />
                                    <PanelSaveButton type="submit" disabled={!pendingRename} />
                                </>
                            ) : (
                                <PanelCancelButton
                                    label="Editar"
                                    icon="fa-pen"
                                    onClick={startCategoryNameEdit}
                                />
                            )}
                        </div>
                    </form>

                    <div className="catalog-services-header">
                        <h4>Servicios</h4>
                        {editingServiceIndex === -1 ? (
                            <button type="button" className="btn btn-primary btn-sm panel-header-action mobile-icon-only btn-back" onClick={requestCloseServiceForm} aria-label="Volver">
                                <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
                                <span className="mobile-action-label">Volver</span>
                            </button>
                        ) : (
                            <button type="button" className="btn btn-primary btn-sm panel-header-action mobile-icon-only" onClick={() => setEditingServiceIndex(-1)} aria-label="Agregar servicio">
                                <i className="fa-solid fa-plus" aria-hidden="true"></i>
                                <span className="mobile-action-label">Agregar servicio</span>
                            </button>
                        )}
                    </div>

                    {editingServiceIndex !== null && (
                        <form className="catalog-management-form view-enter" onSubmit={editingServiceIndex === -1 ? addService : saveEditedService}>
                            <label htmlFor="service-name">Nombre del servicio <span className="field-required">(obligatorio)</span></label>
                            <div className="catalog-service-form-grid">
                                <input
                                    id="service-name"
                                    value={serviceDraft.name}
                                    onChange={(event) => setServiceDraft(previous => ({ ...previous, name: event.target.value }))}
                                    maxLength={80}
                                    placeholder="Ej. Uñas con diseño"
                                    autoFocus
                                />
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    step="1"
                                    value={serviceDraft.price}
                                    onChange={(event) => setServiceDraft(previous => ({ ...previous, price: event.target.value }))}
                                    placeholder="Ej. 3500"
                                    aria-label="Precio del servicio"
                                />
                            </div>
                            <div className="form-actions">
                                {editingServiceIndex !== -1 && (
                                    <PanelCancelButton onClick={requestCloseServiceForm} />
                                )}
                                <PanelSaveButton
                                    type="submit"
                                    label={editingServiceIndex === -1 ? 'Guardar' : 'Guardar servicio'}
                                    iconOnlyOnMobile={editingServiceIndex !== -1}
                                />
                            </div>
                        </form>
                    )}

                    <div className="catalog-services-list">
                        {(catalog[selectedCategoryKey] || []).map((service, index) => (
                            <div key={`${selectedCategoryKey}-${service.name}-${index}`} className={`price-item-row ${service.active === false ? 'catalog-item-inactive' : ''}`}>
                                <div className="catalog-service-label">
                                    <span className="price-item-name">{service.name}</span>
                                    {service.active === false && <span className="catalog-status-label">Inactivo</span>}
                                </div>
                                <div className="catalog-service-actions">
                                    <div className="price-input-wrapper">
                                        <span>$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={service.price}
                                            readOnly
                                            tabIndex={-1}
                                            aria-label={`Precio de ${service.name}`}
                                        />
                                    </div>
                                    <ListIconButton
                                        icon="fa-pen"
                                        label="Editar"
                                        variant="primary"
                                        title={`Editar ${service.name}`}
                                        onClick={() => beginEditService(index)}
                                    />
                                    <ListIconButton
                                        icon={service.active === false ? 'fa-rotate-left' : 'fa-box-archive'}
                                        label={service.active === false ? 'Reactivar' : 'Archivar'}
                                        variant='secondary'
                                        title={service.active === false ? `Reactivar ${service.name}` : `Archivar ${service.name}`}
                                        onClick={() => toggleService(index)}
                                    />
                                </div>
                            </div>
                        ))}
                        {!((catalog[selectedCategoryKey] || []).length) && (
                            <p className="catalog-empty-note">Todavía no hay servicios en esta categoría.</p>
                        )}
                    </div>
                </div>
            )}

            <ConfirmModal
                open={showExitConfirm}
                title="Terminar edición"
                message="Hay cambios sin guardar (un fallo al sincronizar, un renombrar sin aplicar o un servicio a medio cargar). ¿Descartarlos y salir?"
                confirmText="Descartar cambios"
                confirmVariant="danger"
                cancelText="Seguir editando"
                onConfirm={discardAndExit}
                onCancel={() => setShowExitConfirm(false)}
            />

            <ConfirmModal
                open={Boolean(serviceDiscard)}
                title="Descartar servicio"
                message="Hay un servicio a medio cargar que todavía no se guardó. ¿Descartarlo?"
                confirmText="Descartar"
                confirmVariant="danger"
                cancelText="Seguir editando"
                onConfirm={confirmServiceDiscard}
                onCancel={() => setServiceDiscard(null)}
            />

            <ConfirmModal
                open={Boolean(pendingCategoryToggle)}
                title={pendingCategoryToggle?.nextActive ? 'Reactivar categoría' : 'Dar de baja categoría'}
                message={pendingCategoryToggle
                    ? `¿${pendingCategoryToggle.nextActive ? 'Reactivás' : 'Dás de baja'} la categoría ${pendingCategoryToggle.name}?`
                    : ''}
                confirmText={pendingCategoryToggle?.nextActive ? 'Reactivar' : 'Dar de baja'}
                confirmVariant={pendingCategoryToggle?.nextActive ? 'primary' : 'danger'}
                onConfirm={confirmCategoryToggle}
                onCancel={() => setPendingCategoryToggle(null)}
            />

            <ConfirmModal
                open={Boolean(pendingServiceToggle)}
                title={pendingServiceToggle?.nextActive ? 'Reactivar servicio' : 'Dar de baja servicio'}
                message={pendingServiceToggle
                    ? `¿${pendingServiceToggle.nextActive ? 'Reactivás' : 'Dás de baja'} el servicio ${pendingServiceToggle.name}?`
                    : ''}
                confirmText={pendingServiceToggle?.nextActive ? 'Reactivar' : 'Dar de baja'}
                confirmVariant={pendingServiceToggle?.nextActive ? 'primary' : 'danger'}
                onConfirm={confirmServiceToggle}
                onCancel={() => setPendingServiceToggle(null)}
            />
        </div>
    );
}

export default PricesPanel;
