import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import Modal, { ConfirmModal } from './Modal.jsx';

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

  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('activos');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const [detailClient, setDetailClient] = useState(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailForm, setDetailForm] = useState({ nombre: '', telefono: '', email: '', notas: '' });
  const [detailHistory, setDetailHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);

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
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .order('nombre', { ascending: true });
      if (error) throw error;
      const records = (data || []).map(normalizeClientRecord).filter(Boolean);
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
      const { data, error } = await supabase
        .from('turnos')
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id')
        .order('hora_inicio', { ascending: false });
      if (error) {
        return;
      }
      const records = (data || []).map(normalizeAppointmentRecord).filter(Boolean).map(r => ({
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
      const { data, error } = await supabase
        .from('clientes')
        .insert(payload)
        .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
        .single();
      if (error) throw error;
      const record = normalizeClientRecord(data);
      setClients(prev => {
        const next = [...prev.filter(c => c.id !== record.id), record];
        next.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        try { localStorage.setItem(cacheKeyClients, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      setNewClient({ nombre: '', telefono: '', email: '', notas: '' });
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
        (c.email || '').toLowerCase().includes(search) ||
        (c.notas || '').toLowerCase().includes(search)
      );
    });
  }, [clients, searchText, filterStatus]);

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
    try {
      let historyRaw = appointments.filter(a => a.cliente_id === client.id);
      if (historyRaw.length === 0 && supabase && session?.authId) {
        const { data, error } = await supabase
          .from('turnos')
          .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id')
          .eq('cliente_id', client.id)
          .order('hora_inicio', { ascending: false });
        if (!error && Array.isArray(data)) {
          historyRaw = data.map(normalizeAppointmentRecord).filter(Boolean);
        }
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
      const { error } = await supabase
        .from('clientes')
        .update(updates)
        .eq('id', detailClient.id);
      if (error) throw error;
      const updated = { ...detailClient, ...updates, actualizado_en: new Date().toISOString() };
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
      if (notify) notify('Guardá o descartá los cambios antes de cerrar la ficha.', 'info');
      return;
    }
    setDetailClient(null);
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
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', deleteConfirm.id);
      if (error) throw error;
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
      const { error } = await supabase
        .from('clientes')
        .update({ activo: nextActivo })
        .eq('id', statusToggleConfirm.id);
      if (error) throw error;
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
    <div>
      <div className="section-title">
        <h3>Clientes</h3>
        <p>Consultá y agregá las clientas de Evolet Nails.</p>
      </div>

      <form className="cute-form client-registration-form" onSubmit={submitNewClient} style={{ marginBottom: '20px' }}>
        <div className="form-row-2">
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
        <div className="form-row-2">
          <div className="form-group">
            <label htmlFor="client-record-email">
              Email
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-envelope input-icon" />
              <input
                id="client-record-email"
                type="email"
                placeholder="Opcional"
                value={newClient.email}
                onChange={(e) => setNewClient(p => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group client-registration-notes-field">
            <label htmlFor="client-record-notes">
              Notas
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-note-sticky input-icon" />
              <textarea
                id="client-record-notes"
                rows="1"
                placeholder="Opcional"
                value={newClient.notas}
                onChange={(e) => setNewClient(p => ({ ...p, notas: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={creating}>
          {creating ? 'Guardando…' : (<><i className="fa-solid fa-user-plus" /> Agregar cliente</>)}
        </button>
      </form>

      <div className="filters-container">
        <div className="search-box-container">
          <i className="fa-solid fa-magnifying-glass search-icon" />
          <input
            type="search"
            className="search-input"
            placeholder="Buscar por nombre, teléfono, email o notas..."
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

      <div id="clients-list" className="history-list">
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

            <div className="appointment-info-col" style={{ paddingLeft: '12px' }}>
              <div className="appointment-client-name">
                {client.nombre}
                {client.activo !== true && (
                  <span className="status-tag provisional" style={{ marginLeft: '8px' }}>
                    Dada de baja
                  </span>
                )}
              </div>
              <div className="appointment-service-name" style={{ marginTop: '4px' }}>
                {client.telefono && (
                  <span title="Teléfono" style={{ marginRight: '10px' }}>
                    <i className="fa-solid fa-phone" style={{ marginRight: '4px', color: 'var(--barbie-pink)' }} />
                    {client.telefono}
                  </span>
                )}
                {client.email && (
                  <span title="Email" style={{ marginRight: '10px' }}>
                    <i className="fa-solid fa-envelope" style={{ marginRight: '4px', color: 'var(--barbie-pink)' }} />
                    {client.email}
                  </span>
                )}
                {client.notas && (
                  <span title="Notas">
                    <i className="fa-solid fa-note-sticky" style={{ marginRight: '4px', color: 'var(--barbie-pink)' }} />
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
                  className="client-status-btn btn-view-detail"
                  title={client.activo ? 'Dar de baja' : 'Reactivar clienta'}
                  onClick={() => askToggleStatus(client)}
                  style={{ color: client.activo ? 'var(--text-light)' : 'var(--barbie-dark)' }}
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
            <div className="modal-header-row" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="client-avatar">{clientInitials(detailClient.nombre)}</div>
                <div>
                  <h3 style={{ textAlign: 'left', marginBottom: 0, fontSize: '18px' }}>
                    {detailClient.nombre}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '50%' }}
                onClick={handleDetailClose}
                title="Cerrar"
                disabled={detailSaving}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form className="cute-form account-readonly-form" onSubmit={(e) => { e.preventDefault(); saveDetailClient(); }} style={{ marginBottom: '15px' }}>
              <fieldset id="client-detail-fields" disabled={!detailEditing} style={{ border: 'none', padding: 0, margin: 0 }}>
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
                <div className="form-group client-detail-single-field">
                  <label htmlFor="detail-client-email">Email</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-envelope input-icon" />
                    <input
                      id="detail-client-email"
                      name="email"
                      type="email"
                      value={detailForm.email}
                      onChange={(e) => setDetailForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="Sin email registrado"
                      readOnly={!detailEditing}
                    />
                  </div>
                </div>
                <div className="form-group client-detail-notes-field">
                  <label htmlFor="detail-client-notes">Notas</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-note-sticky input-icon" />
                    <textarea
                      id="detail-client-notes"
                      name="notas"
                      value={detailForm.notas}
                      onChange={(e) => setDetailForm(p => ({ ...p, notas: e.target.value }))}
                      readOnly={!detailEditing}
                      rows="4"
                      placeholder="Sin notas registradas"
                    />
                  </div>
                </div>
              </fieldset>
              <div className="client-modal-actions">
                {!detailEditing ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setDetailEditing(true)}
                  >
                    <i className="fa-solid fa-pen-to-square" /> Actualizar datos
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={cancelDetailEdit}
                      disabled={detailSaving}
                    >
                      Deshacer cambios
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={detailSaving}
                    >
                      {detailSaving ? 'Guardando…' : (<><i className="fa-solid fa-floppy-disk" /> Confirmar cambios</>)}
                    </button>
                  </>
                )}
              </div>
            </form>

            <div className="client-history-heading">
              <strong>Historial de turnos</strong>
              <span id="client-history-status" className="subtle-text" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {detailLoading ? 'Cargando…' : `${detailHistory.length} registros`}
              </span>
            </div>
            <div id="client-detail-history" className="client-history-list">
              {detailLoading && (
                <div className="list-empty-state" style={{ padding: '12px' }}>
                  <p>Cargando historial de la clienta…</p>
                </div>
              )}
              {!detailLoading && detailHistory.length === 0 && (
                <div className="list-empty-state" style={{ padding: '12px' }}>
                  <p>Esta clienta no tiene turnos registrados.</p>
                </div>
              )}
              {!detailLoading && detailHistory.map(apt => (
                <div key={apt.rawId || apt.id} className="client-history-item">
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--text-color)' }}>
                      {apt.servicio || 'Turno'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      <i className="fa-regular fa-calendar" style={{ marginRight: '3px' }} />
                      {formatDateTimeArgentina(apt.horaInicio || apt.fecha)}
                      {' · '}
                      <span className={`status-tag ${statusBadgeClass(apt.estado)}`} style={{ fontSize: '10px' }}>{apt.estado}</span>
                    </div>
                  </div>
                  <div style={{ fontWeight: '700', color: 'var(--barbie-dark)' }}>
                    {formatCurrencyARS(apt.precio)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

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
