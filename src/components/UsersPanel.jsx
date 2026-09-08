import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import Button from './Button.jsx';
import { ConfirmModal } from './Modal.jsx';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  rol: 'manicurista',
  telefono: '',
  dni: '',
  comision_pct: '0'
};

function normalizeProfile(profile) {
  return {
    ...profile,
    nombre: profile?.nombre || 'Sin nombre',
    email: profile?.email || '',
    rol: profile?.rol || 'manicurista',
    activo: profile?.activo !== false,
    comision_pct: Number(profile?.comision_pct || 0)
  };
}

function UsersPanel({ session, notify, showLoader }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const loadUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, email, nombre, rol, telefono, dni, comision_pct, activo, creado_en, actualizado_en')
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
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || 'No se pudo completar la operación.');
    return data;
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      email: form.email.trim().toLowerCase(),
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim(),
      dni: form.dni.trim(),
      comision_pct: Number(form.comision_pct || 0)
    };
    if (!payload.nombre || !payload.email) {
      notify?.('Completá nombre y email para invitar al usuario.', 'error');
      return;
    }
    setSaving(true);
    showLoader?.(true, 'Enviando invitación...');
    try {
      await invokeAdminFunction('invite-user', payload);
      notify?.('Invitación enviada correctamente.', 'success');
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await loadUsers();
    } catch (error) {
      console.error('Error invitando usuario:', error);
      notify?.(error.message || 'No se pudo enviar la invitación.', 'error');
    } finally {
      setSaving(false);
      showLoader?.(false);
    }
  };

  const manageUser = async (action, user, extra = {}) => {
    setSaving(true);
    showLoader?.(true, 'Actualizando usuario...');
    try {
      await invokeAdminFunction('manage-user', { accion: action, id: user.id, ...extra });
      notify?.('Usuario actualizado correctamente.', 'success');
      await loadUsers();
    } catch (error) {
      console.error('Error gestionando usuario:', error);
      notify?.(error.message || 'No se pudo actualizar el usuario.', 'error');
    } finally {
      setSaving(false);
      showLoader?.(false);
    }
  };

  const askToggle = (user) => {
    setConfirmation({
      title: user.activo ? 'Desactivar usuario' : 'Activar usuario',
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

  const confirmAction = async () => {
    const action = confirmation?.action;
    setConfirmation(null);
    if (action) await action();
  };

  return (
    <section className="users-panel" aria-labelledby="users-title">
      <ConfirmModal
        open={!!confirmation}
        title={confirmation?.title}
        message={confirmation?.message}
        onConfirm={confirmAction}
        onCancel={() => setConfirmation(null)}
        busy={saving}
      />

      <div className="section-title users-panel-header">
        <div>
          <h3 id="users-title">Usuarios</h3>
          <p>Administrá accesos, roles y estado del equipo.</p>
        </div>
        <Button type="button" className="btn-sm" onClick={() => setFormOpen((value) => !value)}>
          <i className={`fa-solid ${formOpen ? 'fa-xmark' : 'fa-user-plus'}`} aria-hidden="true" />
          {formOpen ? 'Cerrar' : 'Invitar'}
        </Button>
      </div>

      {formOpen && (
        <form className="cute-form users-invite-form" onSubmit={submitInvite}>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="user-name">Nombre</label>
              <input id="user-name" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
            </div>
            <div className="form-group">
              <label htmlFor="user-email">Email</label>
              <input id="user-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="user-role">Rol</label>
              <select id="user-role" value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value })}>
                <option value="manicurista">Manicurista</option>
                <option value="admin">Administradora</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="user-commission">Comisión (%)</label>
              <input id="user-commission" type="number" min="0" max="100" step="0.01" value={form.comision_pct} onChange={(event) => setForm({ ...form, comision_pct: event.target.value })} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="user-phone">Teléfono</label>
              <input id="user-phone" type="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="user-dni">DNI</label>
              <input id="user-dni" value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value })} />
            </div>
          </div>
          <Button type="submit" className="btn-block" busy={saving}>
            <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Enviar invitación
          </Button>
        </form>
      )}

      <div className="users-list" aria-live="polite">
        {loading && <div className="list-empty-state"><p>Cargando usuarios...</p></div>}
        {!loading && users.length === 0 && <div className="list-empty-state"><p>No hay usuarios registrados.</p></div>}
        {!loading && users.map((user) => (
          <article className={`user-card ${user.activo ? '' : 'is-inactive'}`} key={user.id}>
            <div className="user-card-avatar" aria-hidden="true"><i className="fa-solid fa-user" /></div>
            <div className="user-card-info">
              <strong>{user.nombre}</strong>
              <span>{user.email}</span>
              <small>{user.rol === 'admin' ? 'Administradora' : 'Manicurista'} · {user.activo ? 'Activo' : 'Inactivo'}</small>
            </div>
            <div className="user-card-actions">
              <button type="button" className="btn-view-detail" title={user.activo ? 'Desactivar usuario' : 'Activar usuario'} onClick={() => askToggle(user)} disabled={saving || user.id === session?.authId}>
                <i className={`fa-solid ${user.activo ? 'fa-user-slash' : 'fa-user-check'}`} aria-hidden="true" />
              </button>
              <button type="button" className="btn-view-detail" title="Enviar recuperación de contraseña" onClick={() => askReset(user)} disabled={saving}>
                <i className="fa-solid fa-key" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default UsersPanel;
