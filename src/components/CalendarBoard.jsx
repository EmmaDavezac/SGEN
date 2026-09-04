import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase.js';
import Modal, { ConfirmModal } from './Modal.jsx';

const ESTADOS_VALIDOS = ['provisional', 'reservado', 'completado'];
const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function normalizeAppointmentRecord(apt, clienteNombre) {
  if (!apt || typeof apt !== 'object') return null;
  const rawEstado = (apt.estado || 'provisional').toString().trim().toLowerCase();
  let estado = 'Provisional';
  if (rawEstado === 'completado' || rawEstado === 'completed' || rawEstado === 'cobrado' || rawEstado === 'pagado') estado = 'Completado';
  else if (rawEstado === 'reservado' || rawEstado === 'reserved') estado = 'Reservado';

  const inicio = new Date(apt.hora_inicio || apt.fecha);
  const fin = new Date(apt.hora_fin || apt.hora_inicio || apt.fecha);

  return {
    id: apt.legacy_id || apt.id,
    rawId: apt.id,
    legacy_id: apt.legacy_id,
    cliente: clienteNombre || apt.cliente || 'Cliente',
    cliente_id: apt.cliente_id,
    servicio: apt.servicio || 'Turno',
    precio: Number(apt.precio) || 0,
    sena: 0,
    estado,
    fecha: apt.fecha || (inicio.toISOString ? inicio.toISOString().split('T')[0] : ''),
    horaInicio: inicio.toISOString ? inicio.toISOString() : inicio,
    horaFin: fin.toISOString ? fin.toISOString() : fin,
    eventId: apt.event_id,
    usuario_id: apt.usuario_id
  };
}

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

function formatDateInput(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTimeLabel(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrencyARS(val) {
  return `$${Number(val || 0).toLocaleString('es-AR')}`;
}

function isSameDay(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const weekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - weekday);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

function capitalizeMonthYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  const text = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusBadgeClass(estado) {
  const low = (estado || '').toString().toLowerCase();
  if (low === 'completado') return 'completado';
  if (low === 'reservado') return 'reservado';
  if (low === 'provisional') return 'provisional';
  return 'reservado';
}

function statusEventPillClass(estado) {
  const low = (estado || '').toString().toLowerCase();
  if (low === 'completado') return 'completado';
  if (low === 'reservado') return 'reservado';
  if (low === 'provisional') return 'provisional';
  return 'provisional';
}

function clientInitials(nombre) {
  const words = (nombre || '?').toString().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  const first = words[0].charAt(0).toUpperCase();
  const second = words.length > 1 ? words[words.length - 1].charAt(0).toUpperCase() : '';
  return first + second;
}

function emptyFormAppointment(selectedDay) {
  const today = selectedDay || new Date();
  return {
    clientName: '',
    clientId: null,
    fecha: formatDateInput(today),
    horaInicio: '10:00',
    servicio: 'Turno',
    precio: 0,
    estado: 'Provisional',
    sena: 0,
    senaPayment: 'Transferencia'
  };
}

function CalendarBoard({ session, notify, showLoader, onCheckoutFromAppointment, onGoHistory }) {
  const email = session?.email || '';
  const cacheKeyAppointments = `evolet_appointments_v4_${email}`;
  const cacheKeyClients = `evolet_clients_v4_${email}`;
  const isAdmin = session?.rol === 'admin';

  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptyFormAppointment(selectedDay));
  const [scheduleSuggestions, setScheduleSuggestions] = useState([]);
  const [scheduleQuickPanel, setScheduleQuickPanel] = useState(false);
  const [quickClient, setQuickClient] = useState({ telefono: '', email: '' });
  const [savingAppointment, setSavingAppointment] = useState(false);

  const [senaOpen, setSenaOpen] = useState(false);
  const [senaTarget, setSenaTarget] = useState(null);
  const [senaAmount, setSenaAmount] = useState(0);
  const [senaPayment, setSenaPayment] = useState('Transferencia');
  const [savingSena, setSavingSena] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const loadAll = async (forceRefresh = false) => {
    if (!session?.authId || !supabase) return;

    if (forceRefresh) setRefreshing(true);

    try {
      if (!forceRefresh) {
        try {
          const cachedAppts = localStorage.getItem(cacheKeyAppointments);
          const cachedClients = localStorage.getItem(cacheKeyClients);
          if (cachedAppts) setAppointments(JSON.parse(cachedAppts));
          if (cachedClients) setClients(JSON.parse(cachedClients));
        } catch (e) {
          console.warn('No se pudo leer el caché:', e);
        }
      }

      const [apptRes, clientRes] = await Promise.all([
        supabase
          .from('turnos')
          .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id, usuario_id')
          .order('hora_inicio', { ascending: true }),
        supabase
          .from('clientes')
          .select('id, nombre, telefono, email, notas, activo, creado_en, actualizado_en')
          .order('nombre', { ascending: true })
      ]);

      if (apptRes.error) throw apptRes.error;
      if (clientRes.error) throw clientRes.error;

      const clientesNorm = (clientRes.data || []).map(normalizeClientRecord).filter(Boolean);
      const clienteById = new Map(clientesNorm.map(c => [c.id, c.nombre]));

      const turnosNorm = (apptRes.data || [])
        .map(apt => normalizeAppointmentRecord(apt, clienteById.get(apt.cliente_id)))
        .filter(Boolean);

      setClients(clientesNorm);
      setAppointments(turnosNorm);

      try {
        localStorage.setItem(cacheKeyClients, JSON.stringify(clientesNorm));
        localStorage.setItem(cacheKeyAppointments, JSON.stringify(turnosNorm));
      } catch (e) { /* ignore */ }
    } catch (error) {
      console.error('Error cargando agenda React:', error);
      if (notify) notify(error.message || 'No se pudo cargar la agenda.', 'error');
    } finally {
      if (forceRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadAll().then(() => { if (!mounted) return; });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const today = new Date();
  const monthGrid = useMemo(() => getMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()), [calendarMonth]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map();
    for (const apt of appointments) {
      const key = formatDateInput(apt.fecha || apt.horaInicio);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(apt);
    }
    return map;
  }, [appointments]);

  const selectedKey = formatDateInput(selectedDay);
  const selectedDayAppointments = useMemo(() => {
    const list = appointmentsByDate.get(selectedKey) || [];
    return [...list].sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
  }, [appointmentsByDate, selectedKey]);

  const openNewAppointment = () => {
    setScheduleForm({ ...emptyFormAppointment(selectedDay), servicio: 'Turno' });
    setScheduleSuggestions([]);
    setScheduleQuickPanel(false);
    setQuickClient({ telefono: '', email: '' });
    setScheduleOpen(true);
  };

  const handleScheduleClientChange = (value) => {
    setScheduleForm(prev => ({ ...prev, clientName: value, clientId: null }));
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      setScheduleSuggestions([]);
      setScheduleQuickPanel(false);
      return;
    }
    const matches = clients.filter(c =>
      c.activo !== false &&
      ((c.nombre || '').toLowerCase().includes(trimmed) ||
        (c.telefono || '').includes(trimmed) ||
        (c.email || '').toLowerCase().includes(trimmed))
    ).slice(0, 6);
    setScheduleSuggestions(matches);
    const exactMatch = clients.find(c => c.nombre && c.nombre.toLowerCase() === trimmed);
    setScheduleQuickPanel(!exactMatch && trimmed.length >= 2);
  };

  const pickScheduleClient = (client) => {
    setScheduleForm(prev => ({ ...prev, clientName: client.nombre, clientId: client.id }));
    setScheduleSuggestions([]);
    setScheduleQuickPanel(false);
  };

  const registerQuickClient = async () => {
    if (!supabase || !session?.authId) return null;
    const nombre = scheduleForm.clientName.trim();
    if (!nombre) {
      if (notify) notify('Ingresá un nombre de clienta para registrarla.', 'error');
      return null;
    }
    if (!confirmBypassRef.current) {
      requestConfirmation('Registrar clienta', `¿Confirmás registrar a ${nombre} como nueva clienta?`, () => registerQuickClient());
      return null;
    }
    confirmBypassRef.current = false;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({
          nombre,
          telefono: quickClient.telefono || null,
          email: quickClient.email || null,
          notas: ''
        })
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
      setScheduleForm(prev => ({ ...prev, clientId: record.id, clientName: record.nombre }));
      setScheduleSuggestions([]);
      setScheduleQuickPanel(false);
      if (notify) notify('Clienta registrada. Podés agendar su turno.', 'success');
      return record;
    } catch (error) {
      console.error('Error creando clienta rápida:', error);
      if (notify) notify(error.message || 'No se pudo registrar la clienta.', 'error');
      return null;
    }
  };

  const resolveClientId = async () => {
    if (scheduleForm.clientId) return scheduleForm.clientId;
    const nombre = scheduleForm.clientName.trim();
    if (!nombre) return null;
    const existente = clients.find(c => (c.nombre || '').toLowerCase() === nombre.toLowerCase());
    if (existente) return existente.id;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ nombre, telefono: null, email: null, notas: '' })
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
      return record.id;
    } catch (error) {
      console.error('Error creando clienta implícita:', error);
      return null;
    }
  };

  const submitNewAppointment = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !session?.authId) return;

    const clientName = scheduleForm.clientName.trim();
    if (!clientName) {
      if (notify) notify('Ingresá el nombre de la clienta.', 'error');
      return;
    }
    if (!scheduleForm.fecha || !scheduleForm.horaInicio) {
      if (notify) notify('Completá fecha y hora de inicio.', 'error');
      return;
    }
    if (!confirmBypassRef.current) {
      requestConfirmation('Agendar turno', `¿Confirmás agendar el turno de ${clientName} para el ${scheduleForm.fecha} a las ${scheduleForm.horaInicio}?`, () => submitNewAppointment());
      return;
    }
    confirmBypassRef.current = false;
    setSavingAppointment(true);
    try {
      const clienteId = await resolveClientId();
      if (!clienteId) throw new Error('No se pudo asociar la clienta al turno.');

      const horaInicio = new Date(`${scheduleForm.fecha}T${scheduleForm.horaInicio}:00`);
      const horaFin = new Date(horaInicio.getTime() + 60 * 60 * 1000);
      const senaAmountFinal = 0;
      const { data, error } = await supabase
        .from('turnos')
        .insert({
          cliente_id: clienteId,
          usuario_id: session.authId,
          fecha: scheduleForm.fecha,
          hora_inicio: horaInicio.toISOString(),
          hora_fin: horaFin.toISOString(),
          servicio: 'Turno',
          precio: 0,
          estado: 'provisional'
        })
        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, cliente_id, usuario_id')
        .single();
      if (error) throw error;

      const clienteNombre = (clients.find(c => c.id === clienteId)?.nombre) || clientName;
      const newApt = { ...normalizeAppointmentRecord(data, clienteNombre), sena: senaAmountFinal };

      if (senaAmountFinal > 0) {
        try {
          await supabase
            .from('pagos')
            .insert({
              servicio_id: null,
              turno_id: data.id,
              usuario_id: session.authId,
              fecha: new Date().toISOString(),
              monto: senaAmountFinal,
              metodo_pago: (scheduleForm.senaPayment || 'Transferencia').toLowerCase() === 'efectivo' ? 'efectivo' : 'transferencia',
              tipo: 'sena'
            });
        } catch (senaErr) {
          console.warn('No se pudo registrar el pago de seña en pagos:', senaErr);
        }
      }

      try {
        await supabase.functions.invoke('google-calendar', {
          body: {
            action: 'create',
            appointment: {
              id: newApt.id,
              legacy_id: newApt.legacy_id,
              cliente: newApt.cliente,
              fecha: newApt.fecha,
              hora_inicio: newApt.horaInicio,
              hora_fin: newApt.horaFin,
              servicio: newApt.servicio,
              estado: newApt.estado,
              precio: newApt.precio,
              event_id: newApt.eventId
            }
          }
        });
      } catch (gcErr) {
        console.warn('Google Calendar sync falló (create):', gcErr);
      }

      setAppointments(prev => {
        const next = [...prev, newApt].sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });

      if (notify) notify('Turno agendado correctamente.', 'success');
      setScheduleOpen(false);
      setScheduleForm(emptyFormAppointment(selectedDay));
    } catch (error) {
      console.error('Error creando turno:', error);
      if (notify) notify(error.message || 'No se pudo guardar el turno.', 'error');
    } finally {
      setSavingAppointment(false);
    }
  };

  const openSenaModal = (apt) => {
    setSenaTarget(apt);
    setSenaAmount(Math.round(Number(apt.precio || 0) / 2));
    setSenaPayment('Transferencia');
    setSenaOpen(true);
  };

  const submitSena = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !senaTarget || !session?.authId) return;
    const amount = Number(senaAmount || 0);
    if (amount <= 0) {
      if (notify) notify('Ingresá un monto de seña mayor a 0.', 'error');
      return;
    }
    if (!confirmBypassRef.current) {
      requestConfirmation('Confirmar reserva', `¿Confirmás reservar el turno y registrar una seña de $${amount.toLocaleString('es-AR')}?`, () => submitSena());
      return;
    }
    confirmBypassRef.current = false;
    setSavingSena(true);
    try {
      const updates = {
        estado: 'reservado',
        precio: amount
      };
      const { error } = await supabase
        .from('turnos')
        .update(updates)
        .eq('id', senaTarget.rawId);
      if (error) throw error;

      try {
        await supabase
          .from('pagos')
          .insert({
            servicio_id: null,
            turno_id: senaTarget.rawId,
            usuario_id: session.authId,
            fecha: new Date().toISOString(),
            monto: amount,
            metodo_pago: senaPayment.toLowerCase() === 'efectivo' ? 'efectivo' : 'transferencia',
            tipo: 'sena'
          });
      } catch (senaErr) {
        console.warn('No se pudo registrar el pago de seña en pagos:', senaErr);
      }

      setAppointments(prev => {
        const next = prev.map(a =>
          a.rawId === senaTarget.rawId ? { ...a, estado: 'Reservado', sena: amount } : a
        );
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      if (notify) notify('Seña cargada y turno reservado.', 'success');
      setSenaOpen(false);
      setSenaTarget(null);
    } catch (error) {
      console.error('Error actualizando seña:', error);
      if (notify) notify(error.message || 'No se pudo guardar la seña.', 'error');
    } finally {
      setSavingSena(false);
    }
  };

  const openRescheduleModal = (apt) => {
    setRescheduleTarget(apt);
    setRescheduleDate(formatDateInput(apt.fecha || apt.horaInicio));
    setRescheduleTime(formatTimeInput(apt.horaInicio));
    setRescheduleOpen(true);
  };

  const submitReschedule = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !session?.authId) {
      if (notify) notify('La sesión no está disponible. Volvé a ingresar para reagendar.', 'error');
      return;
    }
    if (!rescheduleTarget) {
      if (notify) notify('No se encontró el turno a reagendar.', 'error');
      return;
    }
    const databaseId = rescheduleTarget.rawId;
    const legacyId = rescheduleTarget.legacy_id || (!databaseId ? rescheduleTarget.id : null);
    if (!databaseId && !legacyId) {
      if (notify) notify('No se pudo identificar el turno a reagendar.', 'error');
      return;
    }
    if (!rescheduleDate || !rescheduleTime) {
      if (notify) notify('Completá fecha y hora nuevas.', 'error');
      return;
    }
    if (!confirmBypassRef.current) {
      requestConfirmation('Reagendar turno', `¿Confirmás reagendar el turno para el ${rescheduleDate} a las ${rescheduleTime}?`, () => submitReschedule());
      return;
    }
    confirmBypassRef.current = false;
    setSavingReschedule(true);
    try {
      const inicio = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const durMs = new Date(rescheduleTarget.horaFin) - new Date(rescheduleTarget.horaInicio);
      const fin = new Date(inicio.getTime() + (durMs > 0 ? durMs : 60 * 60 * 1000));
      let updateQuery = supabase
        .from('turnos')
        .update({
          fecha: rescheduleDate,
          hora_inicio: inicio.toISOString(),
          hora_fin: fin.toISOString()
        });
      updateQuery = databaseId ? updateQuery.eq('id', databaseId) : updateQuery.eq('legacy_id', legacyId);
      const { data: updatedRows, error } = await updateQuery.select('id').maybeSingle();
      if (error) throw error;
      if (!updatedRows) throw new Error('No se encontró el turno para actualizar. Recargá la agenda e intentá nuevamente.');

      setAppointments(prev => {
        const next = prev.map(a =>
          (a.rawId || a.legacy_id || a.id) === (databaseId || legacyId)
            ? { ...a, fecha: rescheduleDate, horaInicio: inicio.toISOString(), horaFin: fin.toISOString() }
            : a
        ).sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      if (notify) notify('Turno reagendado correctamente.', 'success');
      setRescheduleOpen(false);
      setRescheduleTarget(null);
    } catch (error) {
      console.error('Error reagendando turno:', error);
      if (notify) notify(error.message || 'No se pudo reagendar el turno.', 'error');
    } finally {
      setSavingReschedule(false);
    }
  };

  const askDeleteAppointment = (apt) => {
    if (!isAdmin) {
      if (notify) notify('Solo los administradores pueden cancelar turnos.', 'error');
      return;
    }
    setDeleteConfirm(apt);
  };

  const confirmDeleteAppointment = async () => {
    if (!deleteConfirm || !supabase || !session?.authId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('turnos')
        .update({ estado: 'cancelado' })
        .eq('id', deleteConfirm.rawId);
      if (error) throw error;
      setAppointments(prev => {
        const next = prev.filter(a => a.rawId !== deleteConfirm.rawId);
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });
      if (notify) notify('Turno cancelado.', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error cancelando turno:', error);
      if (notify) notify(error.message || 'No se pudo cancelar el turno.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const checkout = (apt) => {
    if (typeof onCheckoutFromAppointment === 'function') {
      onCheckoutFromAppointment(apt);
    }
  };

  const refreshBtnStyleInline = { width: 'auto', padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' };
  const historyBtnStyleInline = { width: 'auto', padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' };
  const sectionTitleStyleInline = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' };
  const turnosHeaderStyleInline = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' };
  const selectedDayDateStyleInline = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' };
  const calendarCardStyleInline = { position: 'relative', marginTop: '20px' };
  const headerBtnsWrapperStyleInline = { display: 'flex', gap: '8px', flexWrap: 'wrap' };

  const selectedDayTitleText = `Turnos del ${selectedDay.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
  const selectedDayDateShort = `${String(selectedDay.getDate()).padStart(2, '0')}/${String(selectedDay.getMonth() + 1).padStart(2, '0')}/${selectedDay.getFullYear()}`;

  return (
    <div id="tab-calendario" className="tab-pane active">
      <div className="section-title" style={sectionTitleStyleInline}>
        <div>
          <h3>Agenda de Turnos</h3>
          <p>Visualiza y organiza tus citas sincronizadas en la nube.</p>
        </div>
        <div style={headerBtnsWrapperStyleInline}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={refreshBtnStyleInline}
            onClick={() => loadAll(true)}
            disabled={refreshing}
            title="Actualizar agenda"
          >
            <i className={refreshing ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'} />
          </button>
          {typeof onGoHistory === 'function' && (
            <button
              type="button"
              id="btn-view-history"
              className="btn btn-secondary btn-sm"
              style={historyBtnStyleInline}
              onClick={onGoHistory}
            >
              <i className="fa-solid fa-clock-rotate-left" /> Historial
            </button>
          )}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: '20px' }}>
        <div style={turnosHeaderStyleInline}>
          <h4 id="selected-day-title" style={{ marginBottom: 0 }}>{selectedDayTitleText}</h4>
          <span id="selected-day-date" style={selectedDayDateStyleInline}>
            {selectedDayDateShort}
          </span>
        </div>

        <div id="day-appointments-container" className="day-appointments-container">
          {selectedDayAppointments.length === 0 && (
            <div
              className="no-appointments-placeholder empty-schedule-state"
              style={{ cursor: 'pointer' }}
              id="btn-empty-schedule"
              onClick={openNewAppointment}
            >
              <i className="fa-solid fa-calendar-plus" style={{ fontSize: '24px', color: 'var(--barbie-pink)', marginBottom: '8px', display: 'block' }} />
              No hay turnos agendados para este día.
              <span style={{ fontSize: '11px', color: 'var(--barbie-dark)', fontWeight: 700, display: 'block', marginTop: '4px' }}>
                <i className="fa-solid fa-plus"></i> Presiona aquí para agendar
              </span>
            </div>
          )}

          {selectedDayAppointments.map(apt => {
            const estadoLower = (apt.estado || 'Provisional').toLowerCase();
            const aptSena = Number(apt.sena || apt.precio) || 0;
            let estadoTextoLegacy = 'Provisional';
            if (estadoLower === 'reservado') estadoTextoLegacy = `Reservado (Seña: $${aptSena.toLocaleString('es-AR')})`;
            else if (estadoLower === 'completado' || estadoLower === 'completed' || estadoLower === 'cobrado' || estadoLower === 'pagado') estadoTextoLegacy = 'Cobrado';

            return (
              <div key={apt.rawId || apt.id} className={`appointment-card ${statusBadgeClass(apt.estado)}`}>
                <div className="appointment-time-col">
                  <span className="appointment-time-start">{formatTimeLabel(apt.horaInicio)}</span>
                </div>
                <div className="appointment-info-col">
                  <div className="appointment-client-name">{apt.cliente || 'Cliente'}</div>
                  <div className="appointment-service-name">
                    <i className="fa-solid fa-sparkles" style={{ color: 'var(--barbie-pink)', fontSize: '9px' }}></i>
                    {' '}{estadoTextoLegacy}
                  </div>
                </div>
                <div className="appointment-actions-col" style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                  {estadoLower !== 'completado' && estadoLower !== 'completed' && estadoLower !== 'cobrado' && estadoLower !== 'pagado' && (
                    <button
                      type="button"
                      className="btn-reschedule-appointment"
                      title="Reagendar Turno"
                      onClick={() => openRescheduleModal(apt)}
                      style={{ background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <i className="fa-regular fa-calendar-plus" style={{ fontSize: '11px' }}></i>
                    </button>
                  )}
                  {estadoLower === 'provisional' && (
                    <button
                      type="button"
                      className="btn-confirm-appointment-sena"
                      title="Cargar Seña"
                      onClick={() => openSenaModal(apt)}
                      style={{ background: '#e3f2fd', color: '#0d47a1', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <i className="fa-solid fa-check-double" style={{ fontSize: '11px' }}></i>
                    </button>
                  )}
                  {estadoLower === 'reservado' && (
                    <button
                      type="button"
                      className="btn-checkout-appointment"
                      title="Cobrar Turno"
                      onClick={() => checkout(apt)}
                      style={{ background: '#e8f5e9', color: '#2e7d32', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <i className="fa-solid fa-dollar-sign" style={{ fontSize: '11px' }}></i>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-delete-appointment"
                      title="Cancelar Turno"
                      onClick={() => askDeleteAppointment(apt)}
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-card" style={calendarCardStyleInline}>
        <div className="calendar-header">
          <button
            type="button"
            className="btn-cal-nav"
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <h4 id="calendar-month-year">{capitalizeMonthYear(calendarMonth)}</h4>
          <button
            type="button"
            className="btn-cal-nav"
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        </div>

        <div className="calendar-weekdays">
          {DAYS_OF_WEEK.map(d => <div key={d}>{d}</div>)}
        </div>

        <div id="calendar-days-grid" className="calendar-days-grid">
          {monthGrid.map((week, wIdx) => (
            <React.Fragment key={`week-${wIdx}`}>
              {week.map(day => {
                const inMonth = day.getMonth() === calendarMonth.getMonth();
                const key = formatDateInput(day);
                const dayAppts = appointmentsByDate.get(key) || [];
                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDay);

                const classes = ['calendar-day'];
                if (!inMonth) classes.push('empty');
                if (isToday) classes.push('today');
                if (isSelected) classes.push('selected');
                if (inMonth && dayAppts.length > 0) classes.push('has-appointments');

                return (
                  <div
                    key={key}
                    className={classes.join(' ')}
                    onClick={() => {
                      if (inMonth) {
                        if (isSameDay(day, selectedDay)) {
                          openNewAppointment();
                        } else {
                          setSelectedDay(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
                        }
                      }
                    }}
                  >
                    <span className="day-number">{day.getDate()}</span>
                    {inMonth && dayAppts.length > 0 && (
                      <div className="day-events-preview">
                        {dayAppts.slice(0, 2).map((apt, i) => (
                          <div
                            key={`${apt.rawId || apt.id}-${i}`}
                            className={`event-preview-pill ${statusEventPillClass(apt.estado)}`}
                          >
                            {(apt.cliente || '').toString()}
                          </div>
                        ))}
                        {dayAppts.length > 2 && (
                          <div className="event-preview-pill more">+{dayAppts.length - 2}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <button
          type="button"
          id="btn-open-schedule"
          className="calendar-add-btn"
          title="Nuevo Turno"
          onClick={openNewAppointment}
        >
          <i className="fa-solid fa-calendar-plus" />
        </button>
      </div>

      <Modal
        open={scheduleOpen}
        onClose={() => !savingAppointment && setScheduleOpen(false)}
        closeOnBackdrop={!savingAppointment}
        title="Agendar Turno"
        subtitle="Completa los datos para agendar la cita:"
        sizeClass=""
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setScheduleOpen(false)}
              disabled={savingAppointment}
            >
              <i className="fa-solid fa-xmark" /> Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitNewAppointment}
              disabled={savingAppointment}
            >
              {savingAppointment ? 'Guardando…' : (<><i className="fa-solid fa-check" /> Agendar</>)}
            </button>
          </>
        }
      >
        <form className="cute-form" onSubmit={submitNewAppointment} style={{ marginTop: 0 }}>
          <div className="form-group schedule-client-field">
            <label htmlFor="schedule-client-name">
              <i className="fa-solid fa-user" /> Cliente
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-user input-icon" />
              <input
                id="schedule-client-name"
                type="text"
                placeholder="Nombre de la clienta"
                value={scheduleForm.clientName}
                onChange={(e) => handleScheduleClientChange(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            {scheduleSuggestions.length > 0 && (
              <div className="client-suggestions" style={{ position: 'static' }}>
                {scheduleSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="client-suggestion"
                    onClick={() => pickScheduleClient(c)}
                  >
                    <strong>{c.nombre}</strong>
                    {(c.telefono || c.email) && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {c.telefono && <span><i className="fa-solid fa-phone" style={{ marginRight: '4px' }} />{c.telefono}</span>}
                        {c.telefono && c.email && <span style={{ margin: '0 6px' }}>·</span>}
                        {c.email && <span><i className="fa-solid fa-envelope" style={{ marginRight: '4px' }} />{c.email}</span>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {scheduleQuickPanel && (
              <div className="quick-client-panel">
                <strong><i className="fa-solid fa-user-plus" /> Clienta no encontrada</strong>
                <p>Registrala como activa para poder agendarle un turno.</p>
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="schedule-new-client-phone">Teléfono</label>
                    <input
                      id="schedule-new-client-phone"
                      type="tel"
                      inputMode="tel"
                      value={quickClient.telefono}
                      onChange={(e) => setQuickClient(p => ({ ...p, telefono: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="schedule-new-client-email">Email</label>
                    <input
                      id="schedule-new-client-email"
                      type="email"
                      value={quickClient.email}
                      onChange={(e) => setQuickClient(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={registerQuickClient}
                >
                  <i className="fa-solid fa-user-check" /> Registrar clienta
                </button>
              </div>
            )}
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="schedule-date">
                <i className="fa-solid fa-calendar-day" /> Fecha
              </label>
              <div className="input-wrapper">
                <i className="fa-solid fa-calendar-day input-icon" />
                <input
                  id="schedule-date"
                  type="date"
                  value={scheduleForm.fecha}
                  onChange={(e) => setScheduleForm(p => ({ ...p, fecha: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="schedule-time">
                <i className="fa-solid fa-clock" /> Hora de Inicio
              </label>
              <div className="input-wrapper">
                <i className="fa-solid fa-clock input-icon" />
                <input
                  id="schedule-time"
                  type="time"
                  value={scheduleForm.horaInicio}
                  onChange={(e) => setScheduleForm(p => ({ ...p, horaInicio: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>

          {statusBadgeClass(scheduleForm.estado) === 'reservado' && (
            <div>
              <div className="form-group">
                <label htmlFor="schedule-sena-amount">
                  <i className="fa-solid fa-dollar-sign" /> Monto de la Seña ($)
                </label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-dollar-sign input-icon" />
                  <input
                    id="schedule-sena-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={scheduleForm.sena}
                    onChange={(e) => setScheduleForm(p => ({ ...p, sena: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Método de Pago de la Seña</label>
                <div className="payment-method-selector">
                  <label className="pay-btn">
                    <input
                      type="radio"
                      name="schedule-payment-react"
                      value="Efectivo"
                      checked={scheduleForm.senaPayment === 'Efectivo'}
                      onChange={() => setScheduleForm(p => ({ ...p, senaPayment: 'Efectivo' }))}
                    />
                    <div className="pay-btn-content">
                      <i className="fa-solid fa-money-bill-wave pay-icon" />
                      Efectivo
                    </div>
                  </label>
                  <label className="pay-btn">
                    <input
                      type="radio"
                      name="schedule-payment-react"
                      value="Transferencia"
                      checked={scheduleForm.senaPayment === 'Transferencia'}
                      onChange={() => setScheduleForm(p => ({ ...p, senaPayment: 'Transferencia' }))}
                    />
                    <div className="pay-btn-content">
                      <i className="fa-solid fa-mobile-screen-button pay-icon" />
                      Transferencia
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={senaOpen}
        onClose={() => !savingSena && setSenaOpen(false)}
        closeOnBackdrop={!savingSena}
        title="Cargar Seña y Reservar"
        subtitle={senaTarget ? `Turno de ${senaTarget.cliente || 'Cliente'} · ${formatDateArgentina(senaTarget.fecha)} ${formatTimeLabel(senaTarget.horaInicio)}` : ''}
        sizeClass=""
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSenaOpen(false)}
              disabled={savingSena}
            >
              <i className="fa-solid fa-xmark" /> Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitSena}
              disabled={savingSena}
            >
              {savingSena ? 'Guardando…' : (<><i className="fa-solid fa-check" /> Confirmar Reserva</>)}
            </button>
          </>
        }
      >
        <form className="cute-form" onSubmit={submitSena} style={{ marginTop: 0 }}>
          <div className="form-group">
            <label htmlFor="sena-amount-input">
              <i className="fa-solid fa-dollar-sign" /> Monto de la Seña ($)
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-dollar-sign input-icon" />
              <input
                id="sena-amount-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={senaAmount}
                onChange={(e) => setSenaAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Método de Pago de la Seña</label>
            <div className="payment-method-selector">
              <label className="pay-btn">
                <input
                  type="radio"
                  name="sena-payment-react"
                  value="Transferencia"
                  checked={senaPayment === 'Transferencia'}
                  onChange={() => setSenaPayment('Transferencia')}
                />
                <div className="pay-btn-content">
                  <i className="fa-solid fa-mobile-screen-button pay-icon" />
                  Transferencia
                </div>
              </label>
              <label className="pay-btn">
                <input
                  type="radio"
                  name="sena-payment-react"
                  value="Efectivo"
                  checked={senaPayment === 'Efectivo'}
                  onChange={() => setSenaPayment('Efectivo')}
                />
                <div className="pay-btn-content">
                  <i className="fa-solid fa-money-bill-wave pay-icon" />
                  Efectivo
                </div>
              </label>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={rescheduleOpen}
        onClose={() => !savingReschedule && setRescheduleOpen(false)}
        closeOnBackdrop={!savingReschedule}
        title="Reagendar Turno"
        subtitle={rescheduleTarget ? `${rescheduleTarget.cliente || 'Cliente'} · ${rescheduleTarget.servicio || 'Turno'}` : ''}
        sizeClass=""
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRescheduleOpen(false)}
              disabled={savingReschedule}
            >
              <i className="fa-solid fa-xmark" /> Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitReschedule}
              disabled={savingReschedule}
            >
              {savingReschedule ? 'Guardando…' : (<><i className="fa-solid fa-calendar-check" /> Reagendar</>)}
            </button>
          </>
        }
      >
        <form className="cute-form" onSubmit={submitReschedule} style={{ marginTop: 0 }}>
          <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="reschedule-date-input">
                <i className="fa-solid fa-calendar-day" /> Nueva Fecha
              </label>
              <div className="input-wrapper">
                <i className="fa-solid fa-calendar-day input-icon" />
                <input
                  id="reschedule-date-input"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="reschedule-time-input">
                <i className="fa-solid fa-clock" /> Nueva Hora
              </label>
              <div className="input-wrapper">
                <i className="fa-solid fa-clock input-icon" />
                <input
                  id="reschedule-time-input"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </form>
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
        title="¿Cancelar Turno?"
        message={
          deleteConfirm
            ? `Se cancelará el turno de ${deleteConfirm.cliente || 'Cliente'} para el ${formatDateArgentina(deleteConfirm.fecha)} a las ${formatTimeLabel(deleteConfirm.horaInicio)}. Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Cancelar Turno"
        cancelText="Volver"
        confirmVariant="danger"
        onConfirm={confirmDeleteAppointment}
        onCancel={() => setDeleteConfirm(null)}
        busy={deleting}
      />

      {showLoader && typeof showLoader === 'function' ? null : null}
    </div>
  );
}

export default CalendarBoard;
