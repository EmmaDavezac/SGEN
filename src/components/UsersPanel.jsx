import React, { useEffect, useState } from 'react';
import { getValidSession, supabase } from '../supabase.js';
import Button, { DetailActionButton, ListIconButton, PanelCancelButton, PanelSaveButton } from './Button.jsx';
import SkeletonList, { useSearching } from './SkeletonList.jsx';
import { ConfirmModal } from './Modal.jsx';
import DetailWindow from './DetailWindow.jsx';
import { useFormGuard } from '../formGuard.js';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  rol: 'manicurista',
  telefono: ''
};

function normalizeProfile(profile) {
  return {
    ...profile,
    nombre: profile?.nombre || 'Sin nombre',
    email: profile?.email || '',
    rol: profile?.rol || 'manicurista',
    activo: profile?.activo !== false,
    telefono: profile?.telefono || '',
  };
}

function UsersPanel({ session, notify, showLoader }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [viewedUserId, setViewedUserId] = useState(null);
  const [userEditing, setUserEditing] = useState(false);
  const [userForm, setUserForm] = useState({ nombre: '', telefono: '' });
  const [roleEditing, setRoleEditing] = useState(false);
  // Invitación abierta o ficha de usuario en edición: cambiar de pestaña pide confirmación.
  useFormGuard(formOpen || userEditing || roleEditing);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRole, setFilterRole] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const isSearching = useSearching(search);

  const currentProfile = users.find((user) => user.id === session?.authId);
  const isSuperadmin = currentProfile
    ? currentProfile.rol === 'superadmin' && currentProfile.activo
    : session?.rol === 'superadmin';
  const viewedUser = users.find((user) => user.id === viewedUserId);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const matchesSearch = !normalizedSearch
      || `${user.nombre} ${user.email}`.toLowerCase().includes(normalizedSearch);
    const matchesRole = filterRole === 'todos' || (user.rol || 'manicurista') === filterRole;
    const matchesStatus = filterStatus === 'todos'
      || (filterStatus === 'activos' ? user.activo : !user.activo);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const loadUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, email, nombre, rol, activo, telefono, creado_en, actualizado_en')
        .order('nombre', { ascending: true });
      if (error) throw error;
      setUsers((data || []).map(normalizeProfile));
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      notify?.(error.message || 'No se pudieron cargar los usuarios.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [session?.authId]);

  const invokeAdminFunction = async (functionName, body) => {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const session = await getValidSession();
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    if (error) {
      let details;
      try { details = await error.context?.json?.(); } catch {}
      throw new Error(details?.message || error.message);
    }
    if (!data?.ok) throw new Error(data?.message || 'No se pudo completar la operación.');
    return data;
  };

  const closeInviteForm = () => {
    const hasChanges = form.nombre !== EMPTY_FORM.nombre
      || form.email !== EMPTY_FORM.email
      || form.rol !== EMPTY_FORM.rol
      || form.telefono !== EMPTY_FORM.telefono;

    if (!hasChanges) {
      setForm(EMPTY_FORM);
      setFormOpen(false);
      return;
    }

    setConfirmation({
      title: 'Descartar invitación',
      message: 'Hay datos modificados en el formulario. ¿Querés descartarlos?',
      action: () => {
        setForm(EMPTY_FORM);
        setFormOpen(false);
      }
    });
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      email: form.email.trim().toLowerCase(),
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim()
    };
    if (!payload.nombre || !payload.email) {
      notify?.('Completá nombre y email para invitar al usuario.', 'error');
      return;
    }
    if (payload.rol === 'superadmin' && !isSuperadmin) {
      notify?.('Solo el superadmin puede asignar el rol superadmin.', 'error');
      return;
    }
    setConfirmation({
      title: 'Confirmar invitación',
      message: `Se enviará una invitación a ${payload.email} con el rol ${roleLabel(payload.rol)}. ¿Querés continuar?`,
      action: () => sendInvite(payload)
    });
  };

  const sendInvite = async (payload) => {
    setSaving(true);
    try {
      const result = await invokeAdminFunction('invite-user', payload);
      notify?.('Invitación enviada correctamente.', 'success');
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await loadUsers();
      return result;
    } catch (error) {
      console.error('Error invitando usuario:', error);
      notify?.(error.message || 'No se pudo enviar la invitación.', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const manageUser = async (action, user, extra = {}) => {
    setSaving(true);
    try {
      const result = await invokeAdminFunction('manage-user', { accion: action, id: user.id, ...extra });
      notify?.(result.message || successMessage(action), 'success');
      await loadUsers();
      return result;
    } catch (error) {
      console.error('Error gestionando usuario:', error);
      notify?.(error.message || 'No se pudo actualizar el usuario.', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const openUserDetail = (user) => {
    setViewedUserId(user.id);
    setUserEditing(false);
    setRoleEditing(false);
    setUserForm({ nombre: user.nombre || '', telefono: user.telefono || '' });
  };

  const cancelUserEdit = () => {
    if (!viewedUser) return;
    setUserForm({ nombre: viewedUser.nombre || '', telefono: viewedUser.telefono || '' });
    setUserEditing(false);
    setRoleEditing(false);
  };

  const saveUserDetail = () => {
    if (!viewedUser) return;
    const nombre = userForm.nombre.trim();
    if (!nombre) {
      notify?.('El nombre del usuario no puede quedar vacío.', 'error');
      return;
    }
    setConfirmation({
      title: 'Guardar cambios',
      message: `¿Confirmás guardar los cambios de ${nombre}?`,
      action: () => manageUser('update', viewedUser, {
        nombre,
        telefono: userForm.telefono.trim() || null
      }).then(() => setUserEditing(false))
    });
  };

  const handleUserDetailClose = () => {
    if (saving) return;
    if (userEditing) {
      setConfirmation({
        title: 'Descartar cambios',
        message: 'Tenés cambios sin guardar. ¿Querés descartarlos y cerrar la ficha?',
        action: () => {
          setUserEditing(false);
          setViewedUserId(null);
        }
      });
      return;
    }
    setViewedUserId(null);
  };

  const askToggle = (user) => {
    setConfirmation({
      title: user.activo ? 'Dar de baja' : 'Reactivar',
      message: user.activo
        ? `¿Querés desactivar el acceso de ${user.nombre}?`
        : `¿Querés activar nuevamente el acceso de ${user.nombre}?`,
      action: () => manageUser('toggle_activo', user, { activo: !user.activo })
    });
  };

  const askReset = (user) => {
    setConfirmation({
      title: 'Enviar recuperación',
      message: `Se enviará un email temporal de recuperación a ${user.email}. ¿Confirmás?`,
      action: () => manageUser('reset_password', user)
    });
  };

  const askRoleChange = (user, nextRole) => {
    if (nextRole === user.rol) return;

    setConfirmation({
      title: 'Cambiar rol',
      message: `¿Querés cambiar el rol de ${user.nombre} de ${roleLabel(user.rol)} a ${roleLabel(nextRole)}?`,
      action: () => manageUser('update', user, { rol: nextRole })
        .then(() => setRoleEditing(false))
    });
  };

  function roleLabel(role) {
    return role === 'superadmin' ? 'Superadmin' : role === 'admin' ? 'Administrador' : 'Manicurista';
  }

  function successMessage(action) {
    if (action === 'toggle_activo') return 'Estado del usuario actualizado correctamente.';
    if (action === 'reset_password') return 'Email de recuperación enviado correctamente.';
    return 'Usuario actualizado correctamente.';
  }

  const confirmAction = async () => {
    const action = confirmation?.action;
    if (!action) return setConfirmation(null);
    try {
      await action();
    } catch {
      // La operación ya muestra el mensaje de error en la notificación.
    } finally {
      setConfirmation(null);
    }
  };

  return (
    <section id="tab-usuarios" className="panel-stack view-enter" aria-labelledby="users-title">
      {viewedUser && (
        <DetailWindow
          title="Ficha de usuario"
          subtitle="Información y opciones de acceso"
          onClose={handleUserDetailClose}
          closeDisabled={saving}
        >
          <form className="cute-form account-readonly-form detail-form" onSubmit={(event) => { event.preventDefault(); saveUserDetail(); }}>
            <fieldset className="detail-fields" disabled={!userEditing}>
              <div className="detail-fields-stack">
                <div className="form-group">
                  <label htmlFor="detail-user-name">Nombre <span className="field-required">(obligatorio)</span></label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-user input-icon" />
                    <input
                      id="detail-user-name"
                      name="nombre"
                      type="text"
                      value={userForm.nombre}
                      onChange={(event) => setUserForm((previous) => ({ ...previous, nombre: event.target.value }))}
                      placeholder="Nombre del usuario"
                      required
                      readOnly={!userEditing}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="detail-user-phone">Teléfono <span className="field-optional">(opcional)</span></label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-phone input-icon" />
                    <input
                      id="detail-user-phone"
                      name="telefono"
                      type="tel"
                      inputMode="tel"
                      placeholder="Ej. 11 2233 4455"
                      value={userForm.telefono}
                      onChange={(event) => setUserForm((previous) => ({ ...previous, telefono: event.target.value }))}
                      readOnly={!userEditing}
                    />
                  </div>
                </div>
              </div>
            </fieldset>
            {/* Acciones del grupo editable, justo debajo de él: al editar,
                Cancelar/Guardar; si no, el botón Editar que lo habilita. */}
            {(userEditing || (isSuperadmin && viewedUser.id !== session?.authId)) && (
              <div className="detail-form-actions">
                {userEditing ? (
                  <>
                    <PanelCancelButton
                      onClick={cancelUserEdit}
                      disabled={saving}
                    />
                    <PanelSaveButton
                      type="submit"
                      busy={saving}
                      busyLabel="Guardando…"
                    />
                  </>
                ) : (
                  <DetailActionButton
                    icon="fa-pen-to-square"
                    label="Editar"
                    aria-label="Editar usuario"
                    onClick={() => setUserEditing(true)}
                  />
                )}
              </div>
            )}
            {/* Email y Creado: solo lectura permanente (no dependen de
                userEditing), por eso van fuera del fieldset y debajo de las
                acciones del grupo editable. */}
            <div className="detail-fields-stack detail-readonly-fields">
              <div className="form-group">
                <label htmlFor="detail-user-email">Email</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-envelope input-icon" />
                  <input
                    id="detail-user-email"
                    name="email"
                    type="email"
                    value={viewedUser.email || ''}
                    placeholder="Sin email"
                    readOnly
                    disabled
                  />
                </div>
              </div>
              {viewedUser.creado_en && (
                <div className="form-group">
                  <label htmlFor="detail-user-created">Creado</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-calendar input-icon" />
                    <input
                      id="detail-user-created"
                      name="creado"
                      type="text"
                      value={new Date(viewedUser.creado_en).toLocaleDateString()}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="detail-fields-stack detail-change-fields">
              <div className="form-group">
                {isSuperadmin && viewedUser.id !== session?.authId ? (
                  <>
                    <label htmlFor="user-detail-role">Rol</label>
                    <div className="detail-change-row">
                      <div className="input-wrapper">
                        <i className="fa-solid fa-user-tag input-icon" />
                        <select
                          id="user-detail-role"
                          className="user-role-select"
                          value={viewedUser.rol}
                          onChange={(event) => askRoleChange(viewedUser, event.target.value)}
                          disabled={saving || !roleEditing}
                        >
                          <option value="manicurista">Manicurista</option>
                          <option value="admin">Administrador</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </div>
                      <DetailActionButton
                        icon={roleEditing ? 'fa-lock' : 'fa-unlock'}
                        label={roleEditing ? 'Listo' : 'Cambiar rol'}
                        title={roleEditing
                          ? 'Volver a la vista de solo lectura'
                          : `Habilitar la modificación del rol de ${viewedUser.nombre}`}
                        aria-label={roleEditing ? 'Listo' : 'Cambiar rol'}
                        disabled={saving}
                        iconOnlyOnMobile={false}
                        onClick={() => setRoleEditing((current) => !current)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label htmlFor="detail-user-role-readonly">Rol</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-user-tag input-icon" />
                      <input
                        id="detail-user-role-readonly"
                        name="rol"
                        type="text"
                        value={roleLabel(viewedUser.rol)}
                        readOnly
                        disabled
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="form-group">
                {isSuperadmin && viewedUser.id !== session?.authId ? (
                  <>
                    <label htmlFor="detail-user-status">Estado</label>
                    <div className="detail-change-row">
                      <div className="input-wrapper">
                        <i className="fa-solid fa-circle-check input-icon" />
                        <input
                          id="detail-user-status"
                          name="estado"
                          type="text"
                          value={viewedUser.activo ? 'Activo' : 'Inactivo'}
                          readOnly
                          disabled
                        />
                      </div>
                      <DetailActionButton
                        icon={viewedUser.activo ? 'fa-user-slash' : 'fa-user-check'}
                        label={viewedUser.activo ? 'Dar de baja' : 'Reactivar'}
                        title={viewedUser.activo ? `Desactivar acceso de ${viewedUser.nombre}` : `Reactivar acceso de ${viewedUser.nombre}`}
                        aria-label={viewedUser.activo ? 'Dar de baja' : 'Reactivar'}
                        disabled={saving}
                        iconOnlyOnMobile={false}
                        onClick={() => askToggle(viewedUser)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label htmlFor="detail-user-status">Estado</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-circle-check input-icon" />
                      <input
                        id="detail-user-status"
                        name="estado"
                        type="text"
                        value={viewedUser.activo ? 'Activo' : 'Inactivo'}
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
                    icon="fa-key"
                    label="Enviar recuperación"
                    title="Enviar email de recuperación"
                    aria-label="Enviar recuperación"
                    disabled={saving}
                    iconOnlyOnMobile={false}
                    onClick={() => askReset(viewedUser)}
                  />
                </div>
              </div>
            )}
        </DetailWindow>
      )}

      <ConfirmModal
        open={!!confirmation}
        title={confirmation?.title}
        message={confirmation?.message}
        onConfirm={confirmAction}
        onCancel={() => setConfirmation(null)}
        busy={saving}
      />

      {!viewedUser && (
        <>
      <div className={`section-title ${formOpen ? 'section-title-with-back' : 'section-title-with-action'}`}>
        <div className="section-title-text">
          <h3 id="users-title">Usuarios</h3>
          <p>Administrá accesos, roles y estado del equipo.</p>
        </div>
        <Button
          type="button"
          className={`btn-sm panel-header-action mobile-icon-only${formOpen ? ' btn-back' : ''}`}
          onClick={() => (formOpen ? closeInviteForm() : setFormOpen(true))}
          aria-expanded={formOpen}
          aria-controls="users-invite-form"
          aria-label={formOpen ? 'Volver' : 'Invitar usuario'}
        >
          <i className={`fa-solid ${formOpen ? 'fa-arrow-left' : 'fa-plus'}`} aria-hidden="true" />
          <span className="mobile-action-label">{formOpen ? 'Volver' : 'Nuevo'}</span>
        </Button>
      </div>

      {formOpen && (
        <form id="users-invite-form" className="cute-form users-invite-form" onSubmit={submitInvite}>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="user-name">Nombre <span className="field-required">(obligatorio)</span></label>
              <input id="user-name" type="text" autoComplete="name" placeholder="Ej. Camila Silva" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="user-email">Email <span className="field-required">(obligatorio)</span></label>
              <input id="user-email" type="email" autoComplete="email" placeholder="ejemplo@correo.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="user-role">Rol</label>
              <select id="user-role" value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value })}>
                <option value="manicurista">Manicurista</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="user-phone">Teléfono <span className="field-optional">(opcional)</span></label>
              <input id="user-phone" type="tel" autoComplete="tel" placeholder="Ej. 11 2233 4455" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <PanelSaveButton
              type="submit"
              label="Guardar"
              iconOnlyOnMobile={false}
              busy={saving}
            />
          </div>
        </form>
      )}

      {!formOpen && (
        <div className="filters-container">
          <div className={`search-box-container${search ? ' has-text' : ''}`}>
            <i className="fa-solid fa-magnifying-glass search-icon" />
            <input
              type="search"
              className="search-input"
              placeholder="Buscar usuario..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
            title="Filtrar usuarios"
            aria-label="Filtrar usuarios"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <i className="fa-solid fa-filter" />
          </button>
          {showFilters && (
            <div className="filter-button-panel">
              <div className="filter-button-group">
                {[
                  { key: 'todos', label: 'Todos' },
                  { key: 'manicurista', label: 'Manicuristas' },
                  { key: 'admin', label: 'Administradores' },
                  { key: 'superadmin', label: 'Superadmin' }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`filter-choice ${filterRole === opt.key ? 'active' : ''}`}
                    onClick={() => setFilterRole(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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

      {!formOpen && <div className="users-list unified-list list-scroll list-section-gap" aria-live="polite">
        {(loading || isSearching) && <SkeletonList count={5} />}
        {!loading && !isSearching && users.length === 0 && <div className="list-empty-state"><p>No hay usuarios registrados.</p></div>}
        {!loading && !isSearching && users.length > 0 && visibleUsers.length === 0 && <div className="list-empty-state"><p>No se encontraron usuarios que coincidan con la búsqueda.</p></div>}
        {!loading && !isSearching && visibleUsers.map((user) => (
          <article className={`user-card unified-card ${user.activo ? '' : 'is-inactive'}`} key={user.id}>
            <div className="client-avatar" aria-hidden="true"><i className="fa-solid fa-user" /></div>
            <div className="user-card-info appointment-info-col">
              <div className="appointment-client-name">{user.nombre}</div>
              <div className="appointment-service-name">{user.email}{user.rol ? ` · ${user.rol}` : ''}</div>
            </div>
            <div className="user-card-actions">
              <ListIconButton
                icon="fa-eye"
                label="Consultar"
                title="Consultar ficha"
                variant="primary"
                onClick={() => openUserDetail(user)}
                aria-label={`Consultar ficha de ${user.nombre}`}
              />
            </div>
          </article>
        ))}
      </div>}
        </>
      )}
    </section>
  );
}

export default UsersPanel;
