import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import Modal, { ConfirmModal } from './Modal.jsx';
import VentaDetalleModal from './VentaDetalleModal.jsx';
import { CLIENTE_ABRIR_EVENTO, consumirClientePendiente } from '../clienteNav.js';
import DetailWindow from './DetailWindow.jsx';
import { DetailActionButton, ListIconButton, PanelCancelButton, PanelSaveButton } from './Button.jsx';
import { deleteClientFromDatabase, loadAppointmentsFromDatabase, loadClientsFromDatabase, saveClientToDatabase, updateClientInDatabase } from '../services.js';
import { estadoBadgeClass, estadoLabel } from '../appointmentActions.js';
import SkeletonList, { useSearching } from './SkeletonList.jsx';

function normalizeClientRecord(client) {
  if (!client || typeof client !== 'object') return null;
  return {
    id: client.id,
    nombre: (client.nombre || '').toString().trim(),
    telefono: (client.telefono || '').toString().trim(),
    email: (client.email || '').toString().trim().toLowerCase(),
    notas: (client.notas || '').toString().trim(),
    activo: client.activo !== false,
    creado_en: client.creado_en,
    actualizado_en: client.actualizado_en
  };
}

function normalizeAppointmentRecord(apt) {
  if (!apt || typeof apt !== 'object') return null;
  // Misma normalización que la agenda (appointmentActions.js): un estado
  // desconocido queda como cancelado, no como provisional.
  const estado = estadoLabel(apt.estado || 'provisional');

  return {
    id: apt.legacy_id || apt.id,
    rawId: apt.id,
    fecha: apt.fecha,
    horaInicio: apt.hora_inicio,
    horaFin: apt.hora_fin,
    servicio: apt.servicio || 'Turno',
    precio: Number(apt.precio) || 0,
    estado,
    motivoCancelacion: apt.motivo_cancelacion || null,
    eventId: apt.event_id
  };
}

function formatDateArgentina(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatDateTimeArgentina(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrencyARS(val) {
  return `$${Number(val || 0).toLocaleString('es-AR')}`;
}

function whatsappUrl(phone) {
  const digits = (phone || '').toString().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return `https://wa.me/${digits}`;
  if (digits.length === 10) return `https://wa.me/549${digits}`;
  if (digits.startsWith('0')) return `https://wa.me/549${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

function clientInitials(nombre) {
  const words = (nombre || '?').toString().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  const first = words[0].charAt(0).toUpperCase();
  const second = words.length > 1 ? words[words.length - 1].charAt(0).toUpperCase() : '';
  return first + second;
}

function ClientsPanel({ session, notify, showLoader }) {
  const email = session?.email || '';
  const cacheKeyClients = `evolet_clients_v4_${email}`;
  const cacheKeyAppointments = `evolet_appointments_v4_${email}`;
  const isAdmin = session?.rol === 'admin' || session?.rol === 'superadmin';
  const isSuperadmin = session?.rol === 'superadmin';

  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newClient, setNewClient] = useState({ nombre: '', telefono: '', email: '', notas: '' });
  const [creating, setCreating] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('activos');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const isSearching = useSearching(searchText);

  const [detailClient, setDetailClient] = useState(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailForm, setDetailForm] = useState({ nombre: '', telefono: '', email: '', notas: '' });
  const [detailHistory, setDetailHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [selectedHistoryService, setSelectedHistoryService] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [statusToggleConfirm, setStatusToggleConfirm] = useState(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const confirmBypassRef = useRef(false);

  const requestConfirmation = (title, message, action) => {
    setConfirmation({ title, message, action });
  };

  const confirmPendingAction = () => {
    const action = confirmation?.action;
    setConfirmation(null);
    if (action) {
      confirmBypassRef.current = true;
      action();
    }
  };

  const loadClients = async (forceRefresh = false) => {
    if (!session?.authId || !supabase) return;
    let hasCachedData = false;
    try {
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem(cacheKeyClients);
          if (cached) {
            setClients(JSON.parse(cached));
            hasCachedData = true;
          }
        } catch (e) { /* ignore */ }
      }
      // Solo mostramos skeleton si no hay caché que mostrar de inmediato.
      if (!hasCachedData) setLoading(true);
      const data = await loadClientsFromDatabase();
      const records = data.map(normalizeClientRecord).filter(Boolean);
      setClients(records);
      try { localStorage.setItem(cacheKeyClients, JSON.stringify(records)); } catch (e) { /* ignore */ }
    } catch (error) {
      console.error('Error cargando clientes React:', error);
      if (notify) notify(error.message || 'No se pudo cargar la lista de clientes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAppointmentsLight = async () => {
    if (!session?.authId || !supabase) return;
    try {
      try {
        const cached = localStorage.getItem(cacheKeyAppointments);
        if (cached) {
          const parsed = JSON.parse(cached);
          setAppointments(Array.isArray(parsed) ? parsed : []);
        }
      } catch (e) { /* ignore */ }
      const data = await loadAppointmentsFromDatabase();
      const records = data.map(normalizeAppointmentRecord).filter(Boolean).map(r => ({
        ...r,
        cliente_id: (data || []).find(x => (x.legacy_id || x.id) === (r.id || r.rawId))?.cliente_id
      }));
      setAppointments(records);
      try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(records)); } catch (e) { /* ignore */ }
    } catch (error) {
      console.warn('No se pudieron cargar turnos para historial de cliente:', error);
    }
  };

  useEffect(() => {
    loadClients();
    loadAppointmentsLight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // "Consultar ficha de la clienta" desde una venta: el Historial y la Agenda navegan a
  // esta pestaña y avisan qué clienta abrir. Se escucha por evento porque los
  // paneles no se conocen entre sí (App.jsx solo cambia de pestaña).
  // Se usa un ref para no re-suscribir el listener en cada render.
  const clientsRef = useRef([]);
  clientsRef.current = clients;

  const abrirFichaPorId = (clienteId) => {
    const encontrada = clientsRef.current.find(
      (c) => (c.rawId || c.id) === clienteId || c.id === clienteId
    );
    if (!encontrada) return false;
    openClientDetail(encontrada);
    return true;
  };

  useEffect(() => {
    const abrirFicha = (event) => {
      // El pendiente se consume siempre: si el evento lo atiende acá, no debe
      // volver a dispararse después cuando cargue la lista.
      const clienteId = event?.detail?.clienteId || consumirClientePendiente();
      if (!clienteId) return;
      if (!abrirFichaPorId(clienteId) && clientsRef.current.length && notify) {
        notify('No se encontró la ficha de esa clienta.', 'error');
      }
    };
    window.addEventListener(CLIENTE_ABRIR_EVENTO, abrirFicha);
    return () => window.removeEventListener(CLIENTE_ABRIR_EVENTO, abrirFicha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);

  // Si el pedido llegó antes de que este panel estuviera montado (el evento se
  // dispara en el mismo tick del cambio de pestaña) o antes de cargar las
  // clientas, queda pendiente y se atiende acá. Con la lista vacía no se avisa
  // nada todavía: puede que siga cargando.
  useEffect(() => {
    if (!clients.length) return;
    const pendiente = consumirClientePendiente();
    if (pendiente && !abrirFichaPorId(pendiente) && notify) {
      notify('No se encontró la ficha de esa clienta.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, notify]);

  const submitNewClient = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !session?.authId) return;
    const nombre = newClient.nombre.trim();
    if (!nombre) {
      if (notify) notify('Ingresá el nombre de la clienta.', 'error');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        nombre,
        telefono: newClient.telefono.trim() || null,
        email: newClient.email.trim().toLowerCase() || null,
        notas: newClient.notas.trim() || null
      };
      if (!confirmBypassRef.current) {
        requestConfirmation('Registrar clienta', `¿Confirmás registrar a ${nombre} como nueva clienta?`, () => submitNewClient());
        return;
      }
      confirmBypassRef.current = false;
      const data = await saveClientToDatabase(payload);
      const record = normalizeClientRecord(data);
      setClients(prev => {
        const next = [...prev.filter(c => c.id !== record.id), record];
        next.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        try { localStorage.setItem(cacheKeyClients, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      setNewClient({ nombre: '', telefono: '', email: '', notas: '' });
      setRegistrationOpen(false);
      if (notify) notify('Clienta agregada correctamente.', 'success');
    } catch (error) {
      console.error('Error creando clienta:', error);
      if (notify) notify(error.message || 'No se pudo guardar la clienta. Verificá que no exista previamente.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const filteredClients = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return clients.filter(c => {
      if (filterStatus === 'activos' && c.activo !== true) return false;
      if (filterStatus === 'baja' && c.activo !== false) return false;
      if (search.length === 0) return true;
      return (
        (c.nombre || '').toLowerCase().includes(search) ||
        (c.telefono || '').includes(search) ||
        (c.notas || '').toLowerCase().includes(search)
      );
    });
  }, [clients, searchText, filterStatus]);

  const closeRegistrationForm = () => {
    const hasChanges = Object.values(newClient).some((value) => value.trim());
    if (!hasChanges) {
      setRegistrationOpen(false);
      return;
    }
    setConfirmation({
      title: 'Descartar clienta',
      message: 'Hay datos sin guardar en la nueva clienta. ¿Querés descartarlos?',
      action: () => {
        setNewClient({ nombre: '', telefono: '', email: '', notas: '' });
        setRegistrationOpen(false);
      }
    });
  };

  const toggleRegistrationForm = () => {
    if (registrationOpen) {
      closeRegistrationForm();
      return;
    }
    setRegistrationOpen(true);
  };

  const openClientDetail = async (client) => {
    setDetailClient(client);
    setDetailEditing(false);
    setDetailForm({
      nombre: client.nombre,
      telefono: client.telefono,
      email: client.email,
      notas: client.notas
    });
    setDetailLoading(true);
    setDetailHistory([]);
    setSelectedHistoryService(null);
    try {
      let historyRaw = appointments.filter(a => a.cliente_id === client.id);
      if (historyRaw.length === 0 && supabase && session?.authId) {
        const data = await loadAppointmentsFromDatabase();
        historyRaw = data
          .filter((appointment) => appointment.cliente_id === client.id)
          .map(normalizeAppointmentRecord)
          .filter(Boolean);
      }
      setDetailHistory(historyRaw.sort((a, b) => new Date(b.horaInicio || b.fecha) - new Date(a.horaInicio || a.fecha)));
    } catch (error) {
      console.warn('No se pudo cargar el historial de la clienta:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDetailClient = async () => {
    if (!detailClient || !supabase || !session?.authId) return;
    const nombre = detailForm.nombre.trim();
    if (!nombre) {
      if (notify) notify('El nombre de la clienta no puede quedar vacío.', 'error');
      return;
    }
    if (!confirmBypassRef.current) {
      requestConfirmation('Guardar cambios', `¿Confirmás guardar los cambios de ${nombre}?`, () => saveDetailClient());
      return;
    }
    confirmBypassRef.current = false;
    setDetailSaving(true);
    try {
      const updates = {
        nombre,
        telefono: detailForm.telefono.trim() || null,
        email: detailForm.email.trim().toLowerCase() || null,
        notas: detailForm.notas.trim() || null
      };
      const saved = await updateClientInDatabase(detailClient.id, updates);
      const updated = normalizeClientRecord(saved);
      setClients(prev => {
        const next = prev.map(c => c.id === updated.id ? normalizeClientRecord(updated) : c);
        next.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        try { localStorage.setItem(cacheKeyClients, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      setDetailClient(normalizeClientRecord(updated));
      setDetailEditing(false);
      if (notify) notify('Datos de la clienta actualizados.', 'success');
    } catch (error) {
      console.error('Error actualizando clienta:', error);
      if (notify) notify(error.message || 'No se pudieron guardar los cambios.', 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const cancelDetailEdit = () => {
    if (!detailClient) return;
    setDetailForm({
      nombre: detailClient.nombre,
      telefono: detailClient.telefono,
      email: detailClient.email,
      notas: detailClient.notas
    });
    setDetailEditing(false);
  };

  const handleDetailClose = () => {
    if (detailSaving) return;
    if (detailEditing) {
      requestConfirmation(
        'Descartar cambios',
        'Tenés cambios sin guardar. ¿Querés descartarlos y cerrar la ficha?',
        () => {
          setDetailEditing(false);
          setDetailClient(null);
          setSelectedHistoryService(null);
        }
      );
      return;
    }
    setDetailClient(null);
    setSelectedHistoryService(null);
  };

  const askDeleteClient = (client) => {
    if (!isSuperadmin) {
      if (notify) notify('Solo el superadmin puede eliminar clientas.', 'error');
      return;
    }
    setDeleteConfirm(client);
  };

  const confirmDeleteClient = async () => {
    if (!deleteConfirm || !supabase || !session?.authId) return;
    setDeleting(true);
    try {
      await deleteClientFromDatabase(deleteConfirm.id);
      setClients(prev => {
        const next = prev.filter(c => c.id !== deleteConfirm.id);
        try { localStorage.setItem(cacheKeyClients, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      if (detailClient && detailClient.id === deleteConfirm.id) {
        setDetailClient(null);
      }
      if (notify) notify('Clienta eliminada del sistema.', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error eliminando clienta:', error);
      if (notify) notify(error.message || 'No se pudo eliminar la clienta. Quizá tenga turnos o pagos asociados.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const askToggleStatus = (client) => {
    if (!isAdmin) {
      if (notify) notify('Solo los administradores pueden cambiar el estado de las clientas.', 'error');
      return;
    }
    setStatusToggleConfirm(client);
  };

  const confirmToggleStatus = async () => {
    if (!statusToggleConfirm || !supabase || !session?.authId) return;
    setTogglingStatus(true);
    try {
      const nextActivo = statusToggleConfirm.activo !== true;
      await updateClientInDatabase(statusToggleConfirm.id, { activo: nextActivo });
      setClients(prev => {
        const next = prev.map(c => c.id === statusToggleConfirm.id ? { ...c, activo: nextActivo } : c);
        try { localStorage.setItem(cacheKeyClients, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      if (detailClient && detailClient.id === statusToggleConfirm.id) {
        setDetailClient(prev => prev ? { ...prev, activo: nextActivo } : null);
      }
      if (notify) notify(nextActivo ? 'Clienta dada de alta nuevamente.' : 'Clienta dada de baja.', 'success');
      setStatusToggleConfirm(null);
    } catch (error) {
      console.error('Error cambiando estado de clienta:', error);
      if (notify) notify(error.message || 'No se pudo actualizar el estado.', 'error');
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div id="tab-clientes" className="view-enter">
      {!detailClient && (
        <>
      <div className="section-title section-title-with-action">
        <div>
          <h3>Clientes</h3>
          <p>Consultá y agregá las clientas de Evolet Nails.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm panel-header-action mobile-icon-only"
          onClick={toggleRegistrationForm}
          aria-expanded={registrationOpen}
          aria-controls="client-registration-form"
          aria-label={registrationOpen ? 'Cerrar registro de clienta' : 'Registrar nueva clienta'}
        >
          <i className={`fa-solid ${registrationOpen ? 'fa-xmark' : 'fa-plus'}`} aria-hidden="true" />
          <span className="mobile-action-label">{registrationOpen ? 'Cerrar' : 'Nuevo'}</span>
        </button>
      </div>

      {registrationOpen ? <form id="client-registration-form" className="cute-form client-registration-form client-registration-form--spaced" onSubmit={submitNewClient}>
        <div className="client-registration-heading">
          <div>
            <h4>Datos de la clienta</h4>
            <p>Completá el nombre y agregá un teléfono si lo necesitás.</p>
          </div>
        </div>
        <div className="client-registration-fields">
          <div className="form-group">
            <label htmlFor="client-record-name">
              Nombre <span className="field-required">(obligatorio)</span>
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-user input-icon" />
              <input
                id="client-record-name"
                type="text"
                placeholder="Nombre de la clienta"
                value={newClient.nombre}
                onChange={(e) => setNewClient(p => ({ ...p, nombre: e.target.value }))}
                required
                aria-required="true"
              />
            </div>
          </div>
          <div className="form-group client-phone-field">
            <label htmlFor="client-record-phone">
              Teléfono <span className="field-optional">(opcional)</span>
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-phone input-icon" />
              <input
                id="client-record-phone"
                type="tel"
                inputMode="tel"
                placeholder="Ej. 11 2233 4455"
                value={newClient.telefono}
                onChange={(e) => setNewClient(p => ({ ...p, telefono: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="form-actions">
          <PanelCancelButton onClick={closeRegistrationForm} disabled={creating} />
          <PanelSaveButton type="submit" busy={creating} busyLabel="Guardando…" />
        </div>
      </form> : <>

      <div className="filters-container">
        <div className="search-box-container">
          <i className="fa-solid fa-magnifying-glass search-icon" />
          <input
            type="search"
            className="search-input"
            placeholder="Buscar por nombre o teléfono..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="filter-toggle-btn"
          title="Filtrar clientes"
          onClick={() => setFilterPanelOpen(v => !v)}
        >
          <i className="fa-solid fa-filter" />
        </button>
        {filterPanelOpen && (
          <div className="filter-button-panel">
            <div className="filter-button-group">
              <button
                type="button"
                className={`filter-choice ${filterStatus === 'todos' ? 'active' : ''}`}
                onClick={() => setFilterStatus('todos')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`filter-choice ${filterStatus === 'activos' ? 'active' : ''}`}
                onClick={() => setFilterStatus('activos')}
              >
                Activos
              </button>
              <button
                type="button"
                className={`filter-choice ${filterStatus === 'baja' ? 'active' : ''}`}
                onClick={() => setFilterStatus('baja')}
              >
                Dados de baja
              </button>
            </div>
          </div>
        )}
      </div>

      <div id="clients-list" className="history-list unified-list list-scroll list-section-gap">
        {(loading || isSearching) && <SkeletonList count={6} />}
        {!loading && !isSearching && filteredClients.length === 0 && (
          <div className="list-empty-state">
            <p>No se encontraron clientas que coincidan con la búsqueda.</p>
          </div>
        )}

        {!loading && !isSearching && filteredClients.map(client => (
          <div key={client.id} className={`appointment-card client-card unified-card ${client.activo !== true ? 'is-inactive' : ''}`}>
            <div className="client-avatar" title={client.nombre}>
              {clientInitials(client.nombre)}
            </div>

            <div className="appointment-info-col client-info-col">
              <div className="appointment-client-name">
                {client.nombre}
                {client.activo !== true && (
                  <span className="status-tag provisional client-status-tag">
                    Dada de baja
                  </span>
                )}
              </div>
              {client.notas && (
                <div className="appointment-service-name client-contact-row">
                  <span title="Notas">
                    <i className="fa-solid fa-note-sticky client-contact-icon" />
                    {client.notas}
                  </span>
                </div>
              )}
            </div>

            <div className="client-actions-col">
              <div className="client-card-actions-row">
                {client.telefono && whatsappUrl(client.telefono) && (
                  <ListIconButton
                    icon="fa-whatsapp"
                    iconStyle="brands"
                    label="WhatsApp"
                    title="Escribir por WhatsApp"
                    variant="whatsapp"
                    onClick={() => requestConfirmation(
                      'Abrir WhatsApp',
                      `¿Confirmás abrir el WhatsApp de ${client.nombre} en una pestaña nueva?`,
                      () => window.open(whatsappUrl(client.telefono), '_blank', 'noopener,noreferrer')
                    )}
                    aria-label={`Abrir WhatsApp de ${client.nombre}`}
                  />
                )}
                <ListIconButton
                  icon="fa-eye"
                  label="Consultar"
                  title="Consultar ficha"
                  variant="primary"
                  onClick={() => openClientDetail(client)}
                  aria-label={`Consultar ficha de ${client.nombre}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      </>}

      </>
      )}

      {detailClient && (
        <DetailWindow
          title="Ficha de cliente"
          subtitle="Datos, contacto e historial de turnos"
          onClose={handleDetailClose}
          closeDisabled={detailSaving}
        >
            <form className="cute-form account-readonly-form detail-form" onSubmit={(e) => { e.preventDefault(); saveDetailClient(); }}>
              <fieldset className="detail-fields" disabled={!detailEditing}>
                <div className="detail-fields-stack">
                  <div className="form-group">
                    <label htmlFor="detail-client-name">Nombre <span className="field-required">(obligatorio)</span></label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-user input-icon" />
                      <input
                        id="detail-client-name"
                        name="nombre"
                        type="text"
                        value={detailForm.nombre}
                        onChange={(e) => setDetailForm(p => ({ ...p, nombre: e.target.value }))}
                        placeholder="Nombre de la clienta"
                        required
                        readOnly={!detailEditing}
                      />
                    </div>
                  </div>
                  <div className="form-group client-phone-field">
                    <label htmlFor="detail-client-phone">Teléfono <span className="field-optional">(opcional)</span></label>
                    <div className="client-phone-input-row">
                      <div className="input-wrapper">
                        <i className="fa-solid fa-phone input-icon" />
                        <input
                          id="detail-client-phone"
                          name="telefono"
                          type="tel"
                          inputMode="tel"
                          placeholder="Ej. 11 2233 4455"
                          value={detailForm.telefono}
                          onChange={(e) => setDetailForm(p => ({ ...p, telefono: e.target.value }))}
                          readOnly={!detailEditing}
                        />
                      </div>
                      {(detailClient.telefono || detailForm.telefono) && whatsappUrl(detailClient.telefono || detailForm.telefono) && (
                        <DetailActionButton
                          icon="fa-whatsapp"
                          iconStyle="brands"
                          label="WhatsApp"
                          aria-label={`Abrir WhatsApp de ${detailClient.nombre}`}
                          title={detailEditing ? 'Terminá la edición para escribir por WhatsApp' : 'Escribir por WhatsApp'}
                          disabled={detailEditing}
                          onClick={() => {
                            if (detailEditing) return;
                            requestConfirmation(
                              'Abrir WhatsApp',
                              `¿Confirmás abrir el WhatsApp de ${detailClient.nombre} en una pestaña nueva?`,
                              () => window.open(
                                whatsappUrl(detailClient.telefono || detailForm.telefono),
                                '_blank',
                                'noopener,noreferrer'
                              )
                            );
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </fieldset>
              <div className="detail-form-actions">
                {detailEditing && (
                  <>
                    <PanelCancelButton
                      onClick={cancelDetailEdit}
                      disabled={detailSaving}
                    />
                    <PanelSaveButton
                      type="submit"
                      busy={detailSaving}
                      busyLabel="Guardando…"
                    />
                  </>
                )}
              </div>
              {/* Email y Creado: solo lectura permanente (no dependen de
                  detailEditing), por eso van fuera del fieldset y debajo de
                  Cancelar/Guardar — mismo patrón que la ficha de usuario. */}
              <div className="detail-fields-stack detail-readonly-fields">
                <div className="form-group">
                  <label htmlFor="detail-client-email">Email</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-envelope input-icon" />
                    <input
                      id="detail-client-email"
                      name="email"
                      type="email"
                      value={detailClient.email || ''}
                      placeholder="Sin email"
                      readOnly
                      disabled
                    />
                  </div>
                </div>
                {detailClient.creado_en && (
                  <div className="form-group">
                    <label htmlFor="detail-client-created">Creado</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-calendar input-icon" />
                      <input
                        id="detail-client-created"
                        name="creado"
                        type="text"
                        value={new Date(detailClient.creado_en).toLocaleDateString()}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                )}
              </div>
              {/* Estado: mismo patrón que la ficha de usuario — campo visible
                  para todos, con la acción de baja/reactivación integrada para
                  administradores (antes vivía solo en Opciones avanzadas). */}
              <div className="detail-fields-stack detail-change-fields">
                <div className="form-group">
                  {isAdmin ? (
                    <>
                      <label htmlFor="detail-client-status">Estado</label>
                      <div className="detail-change-row">
                        <div className="input-wrapper">
                          <i className="fa-solid fa-circle-check input-icon" />
                          <input
                            id="detail-client-status"
                            name="estado"
                            type="text"
                            value={detailClient.activo !== false ? 'Activo' : 'Inactivo'}
                            readOnly
                            disabled
                          />
                        </div>
                        <DetailActionButton
                          icon={detailClient.activo !== false ? 'fa-user-slash' : 'fa-user-check'}
                          label={detailClient.activo !== false ? 'Dar de baja' : 'Reactivar'}
                          title={detailClient.activo !== false ? `Desactivar acceso de ${detailClient.nombre}` : `Reactivar acceso de ${detailClient.nombre}`}
                          aria-label={detailClient.activo !== false ? 'Dar de baja' : 'Reactivar'}
                          disabled={detailSaving}
                          iconOnlyOnMobile={false}
                          onClick={() => askToggleStatus(detailClient)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <label htmlFor="detail-client-status">Estado</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-circle-check input-icon" />
                        <input
                          id="detail-client-status"
                          name="estado"
                          type="text"
                          value={detailClient.activo !== false ? 'Activo' : 'Inactivo'}
                          readOnly
                          disabled
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </form>

            {isSuperadmin && (
              <div className="detail-advanced">
                <h4>Opciones avanzadas</h4>
                <div className="detail-advanced-actions">
                  <DetailActionButton
                    icon="fa-trash-can"
                    label="Eliminar"
                    variant="danger"
                    title="Eliminar clienta"
                    aria-label="Eliminar clienta"
                    disabled={detailSaving}
                    onClick={() => askDeleteClient(detailClient)}
                  />
                </div>
              </div>
            )}

            <div className="client-history-heading">
              <strong>Historial de turnos</strong>
              <span id="client-history-status" className="subtle-text client-history-status">
                {detailLoading ? 'Cargando…' : `${detailHistory.length} registros`}
              </span>
            </div>
            <div id="client-detail-history" className="client-history-list">
              {detailLoading && (
                <div className="list-empty-state client-history-empty">
                  <p>Cargando historial de la clienta…</p>
                </div>
              )}
              {!detailLoading && detailHistory.length === 0 && (
                <div className="list-empty-state client-history-empty">
                  <p>Esta clienta no tiene turnos registrados.</p>
                </div>
              )}
              {!detailLoading && detailHistory.map(apt => (
                <div key={apt.rawId || apt.id} className="client-history-item">
                  <div>
                    <div className="client-history-service-name">
                      {apt.servicio || 'Turno'}
                    </div>
                    <div className="client-history-meta">
                      <i className="fa-regular fa-calendar client-history-calendar" />
                      {formatDateTimeArgentina(apt.horaInicio || apt.fecha)}
                      {' · '}
                      <span className={`status-tag client-history-status-tag ${estadoBadgeClass(apt.estado)}`}>{apt.estado}</span>
                    </div>
                  </div>
                  <div className="client-history-item-side">
                    <div className="client-history-price">
                      {formatCurrencyARS(apt.precio)}
                    </div>
                    <button
                      type="button"
                      className="client-history-more"
                      title="Consultar ficha"
                      onClick={() => setSelectedHistoryService({
                        ...apt,
                        cliente: detailClient.nombre,
                        categoria: 'Turno',
                        metodoPago: apt.estado === 'Completado' ? 'Transferencia' : 'Pendiente',
                        completado: apt.estado
                      })}
                    >
                      <i className="fa-solid fa-eye" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Acciones de la ventana al fondo, igual que en la ficha de
                turno/venta: la cabecera queda solo con Volver. */}
            {isAdmin && !detailEditing && (
              <div className="detail-window-footer">
                <DetailActionButton
                  icon="fa-pen-to-square"
                  label="Editar"
                  aria-label="Editar clienta"
                  onClick={() => setDetailEditing(true)}
                />
              </div>
            )}
        </DetailWindow>
      )}

      <VentaDetalleModal
        open={!!selectedHistoryService}
        service={selectedHistoryService}
        turnoId={selectedHistoryService?.turnoId || null}
        notify={notify}
        sizeClass="detail-modal-card"
        onClose={() => setSelectedHistoryService(null)}
        isAdmin={isAdmin}
      />

      <ConfirmModal
        open={!!confirmation}
        title={confirmation?.title}
        message={confirmation?.message}
        confirmText="Confirmar"
        onConfirm={confirmPendingAction}
        onCancel={() => setConfirmation(null)}
      />

      <ConfirmModal
        open={!!deleteConfirm}
        title="¿Eliminar Clienta?"
        message={
          deleteConfirm
            ? `Se eliminará permanentemente a ${deleteConfirm.nombre || 'la clienta'} del sistema. Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar clienta"
        cancelText="Volver"
        confirmVariant="danger"
        onConfirm={confirmDeleteClient}
        onCancel={() => setDeleteConfirm(null)}
        busy={deleting}
      />

      <ConfirmModal
        open={!!statusToggleConfirm}
        title={statusToggleConfirm?.activo ? '¿Dar de baja?' : '¿Reactivar clienta?'}
        message={
          statusToggleConfirm
            ? statusToggleConfirm.activo
              ? `Se marcará a ${statusToggleConfirm.nombre || 'la clienta'} como dada de baja. Seguirá apareciendo en historiales pero no en sugerencias ni búsquedas por defecto.`
              : `Se reactivará a ${statusToggleConfirm.nombre || 'la clienta'}, volviendo a aparecer en búsquedas y sugerencias.`
            : ''
        }
        confirmText={statusToggleConfirm?.activo ? 'Confirmar baja' : 'Confirmar alta'}
        cancelText="Volver"
        onConfirm={confirmToggleStatus}
        onCancel={() => setStatusToggleConfirm(null)}
        busy={togglingStatus}
      />
    </div>
  );
}

export default ClientsPanel;
