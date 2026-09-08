import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import Modal, { ConfirmModal } from './Modal.jsx';
import ServiceDetailModal from './ServiceDetailModal.jsx';
import Button from './Button.jsx';
import { deleteClientFromDatabase, loadAppointmentsFromDatabase, loadClientsFromDatabase, saveClientToDatabase, updateClientInDatabase } from '../services.js';

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
  const rawEstado = (apt.estado || 'provisional').toString().trim().toLowerCase();
  let estado = 'Provisional';
  if (rawEstado === 'completado' || rawEstado === 'completed' || rawEstado === 'cobrado' || rawEstado === 'pagado') estado = 'Completado';
  else if (rawEstado === 'reservado' || rawEstado === 'reserved') estado = 'Reservado';

  return {
    id: apt.legacy_id || apt.id,
    rawId: apt.id,
    fecha: apt.fecha,
    horaInicio: apt.hora_inicio,
    horaFin: apt.hora_fin,
    servicio: apt.servicio || 'Turno',
    precio: Number(apt.precio) || 0,
    estado,
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

function statusBadgeClass(estado) {
  const low = (estado || '').toString().toLowerCase();
  if (low === 'completado') return 'completado';
  if (low === 'reservado') return 'reservado';
  if (low === 'provisional') return 'provisional';
  return 'reservado';
}

function ClientsPanel({ session, notify, showLoader }) {
  const email = session?.email || '';
  const cacheKeyClients = `evolet_clients_v4_${email}`;
  const cacheKeyAppointments = `evolet_appointments_v4_${email}`;
  const isAdmin = session?.rol === 'admin';

  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [newClient, setNewClient] = useState({ nombre: '', telefono: '', email: '', notas: '' });
  const [creating, setCreating] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('activos');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

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
    try {
      if (!forceRefresh) {
        try {
          const cached = localStorage.getItem(cacheKeyClients);
          if (cached) setClients(JSON.parse(cached));
        } catch (e) { /* ignore */ }
      }
      const data = await loadClientsFromDatabase();
      const records = data.map(normalizeClientRecord).filter(Boolean);
      setClients(records);
      try { localStorage.setItem(cacheKeyClients, JSON.stringify(records)); } catch (e) { /* ignore */ }
    } catch (error) {
      console.error('Error cargando clientes React:', error);
      if (notify) notify(error.message || 'No se pudo cargar la lista de clientes.', 'error');
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
    if (!isAdmin) {
      if (notify) notify('Solo los administradores pueden eliminar clientas.', 'error');
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
    <div id="tab-clientes">
      <div className="section-title section-title-with-action">
        <div>
          <h3>Clientes</h3>
          <p>Consultá y agregá las clientas de Evolet Nails.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm panel-header-action"
          onClick={toggleRegistrationForm}
          aria-expanded={registrationOpen}
          aria-controls="client-registration-form"
        >
          <i className={`fa-solid ${registrationOpen ? 'fa-xmark' : 'fa-user-plus'}`} aria-hidden="true" />
          {registrationOpen ? 'Cerrar' : 'Nueva clienta'}
        </button>
      </div>

      {registrationOpen && <form id="client-registration-form" className="cute-form client-registration-form client-registration-form--spaced" onSubmit={submitNewClient}>
        <div className="client-detail-fields-stack">
          <div className="form-group">
            <label htmlFor="client-record-name">
              Nombre
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
              />
            </div>
          </div>
          <div className="form-group client-phone-field">
            <label htmlFor="client-record-phone">
              Teléfono
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-phone input-icon" />
              <input
                id="client-record-phone"
                type="tel"
                inputMode="tel"
                placeholder="Opcional"
                value={newClient.telefono}
                onChange={(e) => setNewClient(p => ({ ...p, telefono: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <Button type="submit" className="btn-block" busy={creating}>
          <><i className="fa-solid fa-floppy-disk" />Guardar</>
        </Button>
      </form>}

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
              <button
                type="button"
                className={`filter-choice ${filterStatus === 'todos' ? 'active' : ''}`}
                onClick={() => setFilterStatus('todos')}
              >
                Todos
              </button>
            </div>
          </div>
        )}
      </div>

      <div id="clients-list" className="history-list list-scroll">
        {filteredClients.length === 0 && (
          <div className="list-empty-state">
            <p>No se encontraron clientas que coincidan con la búsqueda.</p>
          </div>
        )}

        {filteredClients.map(client => (
          <div key={client.id} className={`appointment-card client-card ${client.activo !== true ? 'provisional' : ''}`}>
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
              <div className="appointment-service-name client-contact-row">
                {client.telefono && (
                  <span className="client-phone-value" title="Teléfono">
                    <i className="fa-solid fa-phone client-contact-icon" />
                    {client.telefono}
                    <a
                      className="whatsapp-link"
                      href={whatsappUrl(client.telefono)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir WhatsApp de ${client.nombre}`}
                      title="Contactar por WhatsApp"
                    >
                      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
                    </a>
                  </span>
                )}
                {client.notas && (
                  <span title="Notas">
                    <i className="fa-solid fa-note-sticky client-contact-icon" />
                    {client.notas}
                  </span>
                )}
              </div>
            </div>

            <div className="client-actions-col">
              <button
                type="button"
                className="btn-view-detail"
                title="Ver detalle"
                onClick={() => openClientDetail(client)}
              >
                <i className="fa-solid fa-eye" />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  title={client.activo ? 'Dar de baja' : 'Reactivar clienta'}
                  onClick={() => askToggleStatus(client)}
                  className={`client-status-btn btn-view-detail ${client.activo ? 'is-active' : 'is-inactive'}`}
                >
                  <i className={`fa-solid ${client.activo ? 'fa-user-slash' : 'fa-user-check'}`} />
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="btn-delete-card"
                  title="Eliminar clienta"
                  onClick={() => askDeleteClient(client)}
                >
                  <i className="fa-solid fa-trash-can" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!detailClient}
        onClose={handleDetailClose}
        closeOnBackdrop={!detailEditing && !detailSaving}
        sizeClass="client-detail-modal-card"
        title="Ficha de cliente"
      >
        {detailClient && (
          <div>
            <div className="modal-header-row client-detail-header">
              <div className="client-detail-header-actions">
                <button
                  type="button"
                  onClick={handleDetailClose}
                  className="btn btn-secondary btn-sm client-detail-action"
                  disabled={detailSaving}
                >
                  <i className="fa-solid fa-arrow-left" /> Volver
                </button>
                {!detailEditing && (
                  <button
                    type="button"
                    onClick={() => setDetailEditing(true)}
                    className="btn btn-secondary btn-sm client-detail-action client-detail-action--edit"
                  >
                    <i className="fa-solid fa-pen-to-square" /> Editar
                  </button>
                )}
              </div>
            </div>

            <form className="cute-form account-readonly-form client-detail-form" onSubmit={(e) => { e.preventDefault(); saveDetailClient(); }}>
              <fieldset id="client-detail-fields" className="client-detail-fields" disabled={!detailEditing}>
                <div className="client-detail-fields-stack">
                  <div className="form-group">
                    <label htmlFor="detail-client-name">Nombre</label>
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
                    <label htmlFor="detail-client-phone">Teléfono</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-phone input-icon" />
                      <input
                        id="detail-client-phone"
                        name="telefono"
                        type="tel"
                        inputMode="tel"
                        value={detailForm.telefono}
                        onChange={(e) => setDetailForm(p => ({ ...p, telefono: e.target.value }))}
                        placeholder="Sin teléfono registrado"
                        readOnly={!detailEditing}
                      />
                    </div>
                  </div>
                </div>
              </fieldset>
              <div className="client-modal-actions">
                {detailEditing && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={cancelDetailEdit}
                      disabled={detailSaving}
                    >
                    <i className="fa-solid fa-xmark" /> Cancelar
                    </button>
                    <Button
                      type="submit"
                      busy={detailSaving}
                    >
                      <><i className="fa-solid fa-floppy-disk" /> Guardar</>
                    </Button>
                  </>
                )}
              </div>
            </form>

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
                      <span className={`status-tag client-history-status-tag ${statusBadgeClass(apt.estado)}`}>{apt.estado}</span>
                    </div>
                  </div>
                  <div className="client-history-item-side">
                    <div className="client-history-price">
                      {formatCurrencyARS(apt.precio)}
                    </div>
                    <button
                      type="button"
                      className="client-history-more"
                      title="Ver más"
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
          </div>
        )}
      </Modal>

      <ServiceDetailModal
        open={!!selectedHistoryService}
        service={selectedHistoryService}
        notify={notify}
        sizeClass="client-service-detail-modal-card"
        onClose={() => setSelectedHistoryService(null)}
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
