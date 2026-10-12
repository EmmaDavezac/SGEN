import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getValidSession, supabase } from '../supabase.js';
import Modal, { ConfirmModal, ModalCancelButton, ModalConfirmButton } from './Modal.jsx';
import { ListIconButton, PanelSaveButton } from './Button.jsx';
import { cancelAppointmentInDatabase, deleteAppointmentFromDatabase, hasLinkedServiceForTurno, hasSenaForTurno, loadAppointmentsFromDatabase, loadClientsFromDatabase, registerPaymentRecord, saveAppointmentToDatabase, saveClientToDatabase, updateAppointmentInDatabase } from '../services.js';
import SkeletonList, { useSearching } from './SkeletonList.jsx';
import VentaDetalleModal from './VentaDetalleModal.jsx';
import { estadoBadgeClass, estadoLabel, getAppointmentActions, getVisibleAppointmentActions, normalizeTurnoEstado } from '../appointmentActions.js';

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function normalizeAppointmentRecord(apt, clienteNombre) {
  if (!apt || typeof apt !== 'object') return null;
  // La normalización vive en appointmentActions.js: fuente única del flujo de
  // estados. Un estado vacío se trata como provisional (default de la tabla);
  // cualquier otro valor desconocido queda como cancelado, nunca provisional.
  const estado = estadoLabel(apt.estado || 'provisional');

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
    motivoCancelacion: apt.motivo_cancelacion || null,
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
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((weekday + daysInMonth) / 7);
  const gridStart = new Date(year, month, 1 - weekday);
  const weeks = [];
  for (let w = 0; w < weekCount; w++) {
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

function CalendarBoard({ session, notify, showLoader, onCheckoutFromAppointment, onGoHistory, onVerCliente = null }) {
  const email = session?.email || '';
  const cacheKeyAppointments = `evolet_appointments_v4_${email}`;
  const cacheKeyClients = `evolet_clients_v4_${email}`;
  const isAdmin = session?.rol === 'admin' || session?.rol === 'superadmin';
  const isSuperadmin = session?.rol === 'superadmin';
  const isLoggedIn = Boolean(session?.authId);
  // Contexto de la matriz de acciones (appointmentActions.js): la manicurista
  // llega como sesión logueada sin ser admin; el DELETE final lo autoriza RLS.
  const actionContext = { isAdmin, isSuperadmin, isLoggedIn };

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
  // Copia del formulario al abrirlo, para detectar cambios sin guardar.
  const scheduleInitialRef = useRef(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [syncingAppointmentId, setSyncingAppointmentId] = useState(null);

  const [senaOpen, setSenaOpen] = useState(false);
  const [senaTarget, setSenaTarget] = useState(null);
  const [senaAmount, setSenaAmount] = useState(0);
  const [senaPayment, setSenaPayment] = useState('Transferencia');
  const [savingSena, setSavingSena] = useState(false);
  const senaInitialRef = useRef(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [savingReschedule, setSavingReschedule] = useState(false);
  const rescheduleInitialRef = useRef(null);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);
  const cancelInitialRef = useRef(null);
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

      const [appointmentsData, clientsData] = await Promise.all([
        loadAppointmentsFromDatabase(),
        loadClientsFromDatabase()
      ]);

      const clientesNorm = clientsData.map(normalizeClientRecord).filter(Boolean);
      const clienteById = new Map(clientesNorm.map(c => [c.id, c.nombre]));

      const turnosNorm = appointmentsData
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

  const [daySearch, setDaySearch] = useState('');
  const isSearching = useSearching(daySearch);
  const [showDayFilters, setShowDayFilters] = useState(false);
  const [dayFilterStatus, setDayFilterStatus] = useState('todos');

  const dayAppointmentsFiltrados = useMemo(() => {
    const query = daySearch.trim().toLowerCase();
    return selectedDayAppointments.filter((apt) => {
      const matchesSearch = !query
        || (apt.cliente || '').toLowerCase().includes(query)
        || (apt.servicio || '').toLowerCase().includes(query);
      const matchesStatus = dayFilterStatus === 'todos'
        || normalizeTurnoEstado(apt.estado) === dayFilterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [selectedDayAppointments, daySearch, dayFilterStatus]);

  const openNewAppointment = () => {
    const nextForm = { ...emptyFormAppointment(selectedDay), servicio: 'Turno' };
    const nextQuickClient = { telefono: '', email: '' };
    setScheduleForm(nextForm);
    setScheduleSuggestions([]);
    setScheduleQuickPanel(false);
    setQuickClient(nextQuickClient);
    scheduleInitialRef.current = JSON.stringify({ form: nextForm, quick: nextQuickClient });
    setScheduleOpen(true);
  };

  const closeScheduleForm = () => {
    if (savingAppointment) return;
    const current = JSON.stringify({ form: scheduleForm, quick: quickClient });
    if (!scheduleInitialRef.current || current === scheduleInitialRef.current) {
      setScheduleOpen(false);
      return;
    }
    requestConfirmation(
      'Descartar turno',
      'Hay datos sin guardar en el nuevo turno. ¿Querés descartarlos?',
      () => {
        setScheduleForm(emptyFormAppointment(selectedDay));
        setScheduleSuggestions([]);
        setScheduleQuickPanel(false);
        setQuickClient({ telefono: '', email: '' });
        setScheduleOpen(false);
      }
    );
  };

  const syncAppointmentToGoogle = async (appointment) => {
    if (!supabase || !appointment?.rawId) return;
    setSyncingAppointmentId(appointment.rawId);
    try {
      const authSession = await getValidSession();
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'create',
          appointment: {
            database_id: appointment.rawId,
            id: appointment.id,
            legacy_id: appointment.legacy_id,
            cliente: appointment.cliente,
            fecha: appointment.fecha,
            hora_inicio: appointment.horaInicio,
            hora_fin: appointment.horaFin,
            servicio: appointment.servicio,
            estado: appointment.estado,
            precio: appointment.precio,
            event_id: appointment.eventId
          }
        },
        headers: { Authorization: `Bearer ${authSession.access_token}` }
      });
      if (error) {
        let details;
        try { details = await error.context?.json?.(); } catch {}
        throw new Error(details?.message || error.message);
      }
      if (!data?.success) throw new Error(data?.message || 'Google Calendar no confirmó la sincronización.');

      setAppointments((current) => {
        const next = current.map((item) => item.rawId === appointment.rawId ? { ...item, eventId: data.eventId } : item);
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      notify?.('Turno sincronizado con Google Calendar.', 'success');
    } catch (error) {
      console.error('Error sincronizando turno con Google Calendar:', error);
      notify?.(error.message || 'No se pudo sincronizar el turno con Google Calendar.', 'error');
    } finally {
      setSyncingAppointmentId(null);
    }
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
      const data = await saveClientToDatabase({
          nombre,
          telefono: quickClient.telefono || null,
          email: quickClient.email || null,
          notas: ''
      }, { usuarioId: session.authId });
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
      const data = await saveClientToDatabase({ nombre, telefono: null, email: null, notas: '' }, { usuarioId: session.authId });
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
      useToast().notify('Ingresá el nombre de la clienta.', 'error');
      return;
    }
    if (!scheduleForm.fecha || !scheduleForm.horaInicio) {
      useToast().notify('Completá fecha y hora de inicio.', 'error');
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
      const data = await saveAppointmentToDatabase({
          cliente_id: clienteId,
          usuario_id: session.authId,
          fecha: scheduleForm.fecha,
          hora_inicio: horaInicio.toISOString(),
          hora_fin: horaFin.toISOString(),
          servicio: 'Turno',
          precio: 0,
          estado: 'provisional'
      });

      const clienteNombre = (clients.find(c => c.id === clienteId)?.nombre) || clientName;
      let newApt = { ...normalizeAppointmentRecord(data, clienteNombre), sena: senaAmountFinal };

      if (senaAmountFinal > 0) {
        await registerPaymentRecord({
          turnoId: data.id,
          usuarioId: session.authId,
          amount: senaAmountFinal,
          paymentMethod: scheduleForm.senaPayment,
          type: 'sena'
        });
      }

      let calendarSyncError = null;
      try {
        const { data: calendarResult, error: calendarError } = await supabase.functions.invoke('google-calendar', {
          body: {
            action: 'create',
            appointment: {
              id: newApt.id,
              database_id: newApt.rawId,
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
        if (calendarError) {
          const details = await calendarError.context?.json?.().catch(() => null);
          throw new Error(details?.message || calendarError.message);
        }
        if (!calendarResult?.success) {
          throw new Error(calendarResult?.message || 'Google Calendar no confirmó la sincronización.');
        }
        newApt = { ...newApt, eventId: calendarResult.eventId || null };
      } catch (gcErr) {
        console.warn('Google Calendar sync falló (create):', gcErr);
        calendarSyncError = gcErr;
      }

      setAppointments(prev => {
        const next = [...prev, newApt].sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
        return next;
      });

      if (notify) {
        if (calendarSyncError) {
          notify(`Turno guardado. Google Calendar no está conectado: ${calendarSyncError.message || 'revisá la configuración OAuth de Supabase.'} Podés reintentar la sincronización desde el turno.`, 'error');
        } else {
          notify('Turno agendado y sincronizado con Google Calendar.', 'success');
        }
      }
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
    const initialAmount = Math.round(Number(apt.precio || 0) / 2);
    setSenaAmount(initialAmount);
    setSenaPayment('Transferencia');
    senaInitialRef.current = JSON.stringify({ amount: initialAmount, payment: 'Transferencia' });
    setSenaOpen(true);
  };

  const closeSenaModal = (force = false) => {
    if (savingSena) return;
    const current = JSON.stringify({ amount: Number(senaAmount) || 0, payment: senaPayment });
    if (!force && senaInitialRef.current && current !== senaInitialRef.current) {
      requestConfirmation(
        'Descartar seña',
        'Hay datos sin guardar en la seña. ¿Querés descartarlos?',
        () => closeSenaModal(true)
      );
      return;
    }
    setSenaOpen(false);
    setSenaTarget(null);
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
      await updateAppointmentInDatabase({ id: senaTarget.rawId, updates });

      await registerPaymentRecord({
        turnoId: senaTarget.rawId,
        usuarioId: session.authId,
        amount,
        paymentMethod: senaPayment,
        type: 'sena'
      });

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
    const initialDate = formatDateInput(apt.fecha || apt.horaInicio);
    const initialTime = formatTimeInput(apt.horaInicio);
    setRescheduleDate(initialDate);
    setRescheduleTime(initialTime);
    rescheduleInitialRef.current = JSON.stringify({ date: initialDate, time: initialTime });
    setRescheduleOpen(true);
  };

  const closeRescheduleModal = (force = false) => {
    if (savingReschedule) return;
    const current = JSON.stringify({ date: rescheduleDate, time: rescheduleTime });
    if (!force && rescheduleInitialRef.current && current !== rescheduleInitialRef.current) {
      requestConfirmation(
        'Descartar cambios',
        'Hay una nueva fecha u hora sin guardar. ¿Querés descartarla?',
        () => closeRescheduleModal(true)
      );
      return;
    }
    setRescheduleOpen(false);
    setRescheduleTarget(null);
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
      await updateAppointmentInDatabase({
        id: databaseId,
        legacyId,
        updates: {
          fecha: rescheduleDate,
          hora_inicio: inicio.toISOString(),
          hora_fin: fin.toISOString()
        }
      });

      // Con seña solo se puede reagendar: mover también el evento en Google Calendar.
      try {
        const authSession = await getValidSession();
        if (authSession?.access_token) {
          const { data: calendarResult, error: calendarError } = await supabase.functions.invoke('google-calendar', {
            body: {
              action: 'update',
              appointment: {
                database_id: databaseId,
                event_id: rescheduleTarget.eventId || null,
                fecha: rescheduleDate,
                hora_inicio: inicio.toISOString(),
                hora_fin: fin.toISOString(),
                cliente: rescheduleTarget.cliente,
                servicio: rescheduleTarget.servicio,
                precio: rescheduleTarget.precio,
                estado: rescheduleTarget.estado
              }
            }
          });
          if (calendarError) throw calendarError;
          if (calendarResult && calendarResult.success === false && !calendarResult.warning) throw new Error(calendarResult.message);
          if (calendarResult?.eventId && databaseId) {
            try { await updateAppointmentInDatabase({ id: databaseId, updates: { event_id: calendarResult.eventId } }); } catch { /* ignore */ }
          }
        }
      } catch (gcErr) {
        console.warn('Google Calendar update falló (reschedule):', gcErr);
        if (notify) notify(`Turno reagendado en app, pero no se movió en Google Calendar: ${gcErr.message || 'revisá conexión'}`, 'warning');
      }

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

  const askDeleteAppointment = async (apt) => {
    if (!apt) return;
    // La visibilidad la decide la matriz; si llegamos acá sin permiso es porque
    // cambió el rol en caliente o se invocó desde otro lugar.
    const eliminar = getAppointmentActions(apt, actionContext).find((action) => action.key === 'eliminar');
    if (!eliminar?.visible) {
      if (notify) notify(eliminar?.reason || 'No tenés permiso para eliminar este turno.', 'error');
      return;
    }
    // La seña vive en pagos y el cobro en servicios: ambos con FK al turno.
    // Si existen, el DELETE fallaría, así que lo avisamos antes de prometerlo.
    const turnoId = apt.rawId || apt.legacy_id || apt.id;
    try {
      const [tieneSena, tieneServicio] = await Promise.all([
        hasSenaForTurno(turnoId).catch(() => false),
        hasLinkedServiceForTurno(turnoId).catch(() => false)
      ]);
      if (tieneSena || tieneServicio) {
        if (notify) notify(
          tieneServicio
            ? 'El turno ya tiene un servicio cobrado asociado: eliminarlo rompería el historial de caja.'
            : 'El turno tiene una seña cargada, no se puede eliminar. Reagendalo para no perder el pago.',
          'error'
        );
        if (tieneSena && !tieneServicio) setRescheduleTarget(apt);
        return;
      }
    } catch {
      // Si falla el chequeo, pedimos confirmación y el DELETE validará por FK.
    }
    setDeleteConfirm(apt);
  };

  const confirmDeleteAppointment = async () => {
    if (!deleteConfirm || !supabase || !session?.authId) return;
    setDeleting(true);
    const target = deleteConfirm;
    const databaseId = target.rawId || target.legacy_id || target.id;
    // 1) Borrado total en Supabase primero (solo provisional/reservado sin seña).
    // Si la manicurista es dueña o es admin, RLS lo autoriza.
    try {
      await deleteAppointmentFromDatabase(databaseId);
    } catch (error) {
      console.error('Error eliminando turno:', error);
      const lower = (error.message || '').toLowerCase();
      const msg = lower.includes('foreign key')
        ? 'No se puede eliminar: tiene seña o servicio asociado. Reagendalo.'
        : lower.includes('row-level security') || lower.includes('permission') || lower.includes('no se encontró el turno')
          ? 'No tenés permiso para eliminar este turno (solo la dueña o una admin). Pedile a una admin que lo elimine.'
          : (error.message || 'No se pudo eliminar el turno.');
      if (notify) notify(msg, 'error');
      setDeleting(false);
      return;
    }
    setAppointments(prev => {
      const next = prev.filter(a => a.rawId !== target.rawId && a.id !== target.id);
      try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (e) { /* ignore */ }
      return next;
    });
    setDeleteConfirm(null);
    setDeleting(false);
    // 2) Borrar el evento en Google Calendar (best-effort, no bloquea ni revierte).
    // Se hace después para que un error 2000/400 de la Edge no impida borrar en la app.
    try {
      const authSession = await getValidSession();
      if (authSession?.access_token) {
        const { data: calendarResult, error: calendarError } = await supabase.functions.invoke('google-calendar', {
          body: {
            action: 'delete',
            appointment: {
              database_id: databaseId,
              event_id: target.eventId || null
            }
          }
        });
        const edgeMessage = calendarError?.message || (calendarResult && calendarResult.success === false ? calendarResult.message : null);
        if (notify) {
          if (edgeMessage) notify(`Turno eliminado de la app. No se pudo borrar en Google Calendar: ${edgeMessage}`, 'warning');
          else notify('Turno eliminado definitivamente y borrado de Google Calendar.', 'success');
        }
      } else if (notify) {
        notify('Turno eliminado definitivamente.', 'success');
      }
    } catch (gcErr) {
      console.warn('Google Calendar delete falló:', gcErr);
      if (notify) notify(`Turno eliminado de la app. No se pudo borrar en Google Calendar: ${gcErr.message || 'revisá la conexión'}`, 'warning');
    }
  };

  const checkout = (apt) => {
    if (typeof onCheckoutFromAppointment === 'function') {
      onCheckoutFromAppointment(apt);
    }
  };

  // Despacha la acción elegida en la tarjeta. Las reglas de qué se permite
  // están en appointmentActions.js; acá solo se enruta al flujo existente.
  const handleAppointmentAction = (key, apt) => {
    switch (key) {
      case 'consultar':
        setDetailTarget(apt);
        break;
      case 'confirmar':
        openSenaModal(apt);
        break;
      case 'reagendar':
        openRescheduleModal(apt);
        break;
      case 'cobrar':
        checkout(apt);
        break;
      case 'cancelar':
        openCancelModal(apt);
        break;
      case 'eliminar':
        askDeleteAppointment(apt);
        break;
      case 'sincronizar':
        syncAppointmentToGoogle(apt);
        break;
      default:
        break;
    }
  };

  // --- Cancelar turno (distinto de eliminar: queda el registro con su motivo) ---

  const openCancelModal = (apt) => {
    setCancelTarget(apt);
    setCancelReason('');
    cancelInitialRef.current = '';
    setCancelOpen(true);
  };

  const closeCancelModal = (force = false) => {
    if (savingCancel) return;
    if (!force && cancelReason.trim() !== (cancelInitialRef.current || '')) {
      requestConfirmation(
        'Descartar cancelación',
        'Escribiste un motivo sin guardar. ¿Querés descartarlo?',
        () => closeCancelModal(true)
      );
      return;
    }
    setCancelOpen(false);
    setCancelTarget(null);
    setCancelReason('');
  };

  const submitCancelAppointment = async (e) => {
    if (e) e.preventDefault();
    if (!supabase || !session?.authId) {
      if (notify) notify('La sesión no está disponible. Volvé a ingresar para cancelar.', 'error');
      return;
    }
    const motivo = cancelReason.trim();
    if (!cancelTarget) {
      if (notify) notify('No se encontró el turno a cancelar.', 'error');
      return;
    }
    if (!motivo) {
      if (notify) notify('Escribí el motivo de la cancelación.', 'error');
      return;
    }
    setSavingCancel(true);
    try {
      const databaseId = cancelTarget.rawId;
      const legacyId = cancelTarget.legacy_id || (!databaseId ? cancelTarget.id : null);
      await cancelAppointmentInDatabase({
        id: databaseId || null,
        legacyId,
        motivo
      });
      setAppointments(prev => {
        const next = prev.map(a =>
          (a.rawId || a.legacy_id || a.id) === (databaseId || legacyId)
            ? { ...a, estado: 'Cancelado', motivoCancelacion: motivo }
            : a
        );
        try { localStorage.setItem(cacheKeyAppointments, JSON.stringify(next)); } catch (err) { /* ignore */ }
        return next;
      });
      if (notify) notify('Turno cancelado. Quedó registrado con su motivo.', 'success');
      cancelInitialRef.current = '';
      setCancelOpen(false);
      setCancelTarget(null);
      setCancelReason('');
    } catch (error) {
      console.error('Error cancelando turno:', error);
      const lower = (error.message || '').toLowerCase();
      const msg = lower.includes('row-level security') || lower.includes('permission')
        ? 'No tenés permiso para cancelar este turno (solo la dueña o una admin).'
        : (error.message || 'No se pudo cancelar el turno.');
      if (notify) notify(msg, 'error');
    } finally {
      setSavingCancel(false);
    }
  };

  const selectedDayTitleText = `Turnos del ${selectedDay.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`;
  const selectedDayDateShort = `${String(selectedDay.getDate()).padStart(2, '0')}/${String(selectedDay.getMonth() + 1).padStart(2, '0')}/${selectedDay.getFullYear()}`;

  return (
    <div id="tab-calendario" className="tab-pane active">
      {/* Mientras la ficha de turno está abierta (ventana de pantalla), el
          calendario y el listado del día quedan ocultos: la pestaña muestra solo
          la ficha, igual que en la ficha de cliente (ClientsPanel). El botón
          Volver (onClose) repone la agenda; el resto del estado (día elegido,
          búsqueda, filtros) vive en este componente y no se pierde. */}
      {!detailTarget && (
        <>
      <div className="section-title section-title-with-action">
        <div>
          <h3>Agenda de Turnos</h3>
          <p>Visualiza y organiza tus citas sincronizadas en la nube.</p>
        </div>
        <div className="calendar-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm calendar-header-button mobile-icon-only"
            onClick={() => loadAll(true)}
            disabled={refreshing}
            title="Actualizar agenda"
            aria-label="Actualizar agenda"
          >
            <i className={refreshing ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate-right'} />
            <span className="mobile-action-label">Actualizar</span>
          </button>
          {typeof onGoHistory === 'function' && (
            <button
              type="button"
              id="btn-view-history"
              className="btn btn-secondary btn-sm calendar-header-button mobile-icon-only"
              onClick={onGoHistory}
              aria-label="Abrir historial"
            >
              <i className="fa-solid fa-clock-rotate-left" />
              <span className="mobile-action-label">Historial</span>
            </button>
          )}
        </div>
      </div>

      <div className="calendar-layout">
        <div className="chart-section calendar-day-section">
          <div className="calendar-selected-day-header">
            <h4 id="selected-day-title">{selectedDayTitleText}</h4>
            <span id="selected-day-date" className="calendar-selected-day-date">
              {selectedDayDateShort}
            </span>
          </div>

          {scheduleOpen && (
            <>
              <div className="section-title section-title-with-back">
                <button
                  type="button"
                  className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only"
                  onClick={closeScheduleForm}
                  disabled={savingAppointment}
                  aria-label="Volver a la agenda"
                >
                  <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
                  <span className="mobile-action-label">Volver</span>
                </button>
                <div className="section-title-text">
                  <h3>Nuevo Turno</h3>
                </div>
              </div>
              <form id="schedule-form" className="cute-form panel-form-spaced" onSubmit={submitNewAppointment}>
                <div className="form-group schedule-client-field">
                  <label htmlFor="schedule-client-name">
                    Cliente <span className="field-required">(obligatorio)</span>
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
                    <div className="client-suggestions client-suggestions--static">
                      {scheduleSuggestions.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="client-suggestion"
                          onClick={() => pickScheduleClient(c)}
                        >
                          <strong>{c.nombre}</strong>
                          {(c.telefono || c.email) && (
                            <div className="client-suggestion-meta">
                              {c.telefono && <span><i className="fa-solid fa-phone client-suggestion-icon" />{c.telefono}</span>}
                              {c.telefono && c.email && <span className="client-suggestion-separator">·</span>}
                              {c.email && <span><i className="fa-solid fa-envelope client-suggestion-icon" />{c.email}</span>}
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
                          <label htmlFor="schedule-new-client-phone">Teléfono <span className="field-optional">(opcional)</span></label>
                          <input
                            id="schedule-new-client-phone"
                            type="tel"
                            inputMode="tel"
                            placeholder="Ej. 11 2233 4455"
                            value={quickClient.telefono}
                            onChange={(e) => setQuickClient(p => ({ ...p, telefono: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="schedule-new-client-email">Email <span className="field-optional">(opcional)</span></label>
                          <input
                            id="schedule-new-client-email"
                            type="email"
                            placeholder="ejemplo@correo.com"
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
                        <i className="fa-solid fa-floppy-disk" /> Guardar Cliente
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="schedule-date">
                      Fecha <span className="field-required">(obligatorio)</span>
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
                  <div className="form-group">
                    <label htmlFor="schedule-time">
                      Hora de Inicio <span className="field-required">(obligatorio)</span>
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

                {estadoBadgeClass(scheduleForm.estado) === 'reservado' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="schedule-sena-amount">
                        Monto de la Seña ($) <span className="field-optional">(opcional)</span>
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
                  </>
                )}

                <div className="form-actions">
                  <PanelSaveButton
                    type="submit"
                    label="Guardar Turno"
                    busy={savingAppointment}
                    busyLabel="Guardando…"
                  />
                </div>
              </form>
            </>
          )}

          {!scheduleOpen && (
            <div className="filters-container">
              <div className="search-box-container">
                <i className="fa-solid fa-magnifying-glass search-icon"></i>
                <input
                  type="search"
                  placeholder="Buscar turno..."
                  className="search-input"
                  value={daySearch}
                  onChange={(e) => setDaySearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="filter-toggle-btn"
                title="Filtrar turnos"
                aria-label="Filtrar turnos"
                aria-expanded={showDayFilters}
                onClick={() => setShowDayFilters((v) => !v)}
              >
                <i className="fa-solid fa-filter"></i>
              </button>
              {showDayFilters && (
                <div className="filter-button-panel">
                  <div className="filter-button-group">
                    {[
                      { key: 'todos', label: 'Todos' },
                      { key: 'provisional', label: 'Provisionales' },
                      { key: 'reservado', label: 'Reservados' },
                      { key: 'completado', label: 'Cobrados' },
                      { key: 'cancelado', label: 'Cancelados' }
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`filter-choice ${dayFilterStatus === opt.key ? 'active' : ''}`}
                        onClick={() => setDayFilterStatus(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!scheduleOpen && (
          <div id="day-appointments-container" className="day-appointments-container unified-list list-scroll list-section-gap">
            {isSearching && <SkeletonList count={5} />}
            {!isSearching && selectedDayAppointments.length === 0 && (
              <div
                className="no-appointments-placeholder empty-schedule-state calendar-empty-schedule"
                id="btn-empty-schedule"
                onClick={openNewAppointment}
              >
                <i className="fa-solid fa-calendar-plus calendar-empty-icon" />
                No hay turnos agendados para este día.
                <span className="calendar-empty-action">
                  <i className="fa-solid fa-plus"></i> Presiona aquí para agendar
                </span>
              </div>
            )}

            {!isSearching && selectedDayAppointments.length > 0 && dayAppointmentsFiltrados.length === 0 && (
              <div className="list-empty-state"><p>No se encontraron turnos que coincidan con la búsqueda.</p></div>
            )}

            {!isSearching && dayAppointmentsFiltrados.map(apt => {
            const estadoTextoLegacy = estadoLabel(apt.estado);

            return (
              <div key={apt.rawId || apt.id} className={`appointment-card appointment-card--stacked unified-card ${estadoBadgeClass(apt.estado)}`}>
                <div className="appointment-time-col">
                  <span className="appointment-time-start">{formatTimeLabel(apt.horaInicio)}</span>
                </div>
                <div className="appointment-info-col">
                  <div className="appointment-client-name">{apt.cliente || 'Cliente'}</div>
                  <div className="appointment-service-name">
                    <i className="fa-solid fa-sparkles appointment-service-icon"></i>
                    {' '}{estadoTextoLegacy}
                  </div>
                </div>
                <div className="appointment-actions-col calendar-appointment-actions">
                  {getVisibleAppointmentActions(apt, actionContext).map((action) => {
                    const syncing = action.key === 'sincronizar' && syncingAppointmentId === apt.rawId;
                    return (
                      <ListIconButton
                        key={action.key}
                        icon={syncing ? 'fa-spinner fa-spin' : action.icon}
                        iconStyle={action.iconStyle}
                        label={action.label}
                        // Si la acción está bloqueada, el tooltip explica el porqué.
                        title={action.reason || action.title}
                        variant={action.variant}
                        onClick={() => handleAppointmentAction(action.key, apt)}
                        disabled={action.disabled || syncing}
                        aria-label={`${action.label} turno de ${apt.cliente || 'cliente'}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
          )}
      </div>

      <div className="calendar-card calendar-card-spaced">
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
                            className={`event-preview-pill ${estadoBadgeClass(apt.estado)}`}
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

        {!scheduleOpen && (
          <button
            type="button"
            id="btn-open-schedule"
            className="calendar-add-btn"
            title="Nuevo Turno"
            onClick={openNewAppointment}
          >
            <i className="fa-solid fa-calendar-plus" />
          </button>
        )}
      </div>
      </div>
        </>
      )}

      <Modal
        open={senaOpen}
        onClose={closeSenaModal}
        closeOnBackdrop={!savingSena}
        title="Cargar Seña y Reservar"
        subtitle={senaTarget ? `Turno de ${senaTarget.cliente || 'Cliente'} · ${formatDateArgentina(senaTarget.fecha)} ${formatTimeLabel(senaTarget.horaInicio)}` : ''}
        sizeClass=""
        actions={
          <>
            <ModalCancelButton
              onClick={closeSenaModal}
              disabled={savingSena}
            />
            <ModalConfirmButton
              label="Confirmar Reserva"
              busy={savingSena}
              busyLabel="Guardando…"
              onClick={submitSena}
            />
          </>
        }
      >
        <form className="cute-form modal-form" onSubmit={submitSena}>
          <div className="form-group">
            <label htmlFor="sena-amount-input">
              <i className="fa-solid fa-dollar-sign" /> Monto de la Seña ($) <span className="field-required">(obligatorio)</span>
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
        onClose={closeRescheduleModal}
        closeOnBackdrop={!savingReschedule}
        title="Reagendar Turno"
        subtitle={rescheduleTarget ? `${rescheduleTarget.cliente || 'Cliente'} · ${rescheduleTarget.servicio || 'Turno'}` : ''}
        sizeClass=""
        actions={
          <>
            <ModalCancelButton
              onClick={closeRescheduleModal}
              disabled={savingReschedule}
            />
            <ModalConfirmButton
              label="Reagendar"
              icon="fa-calendar-check"
              busy={savingReschedule}
              busyLabel="Guardando…"
              onClick={submitReschedule}
            />
          </>
        }
      >
        <form className="cute-form modal-form" onSubmit={submitReschedule}>
          <div className="form-group schedule-date-time-row">
            <div className="schedule-date-time-field">
              <label htmlFor="reschedule-date-input">
                <i className="fa-solid fa-calendar-day" /> Nueva Fecha <span className="field-required">(obligatorio)</span>
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
            <div className="schedule-date-time-field">
              <label htmlFor="reschedule-time-input">
                <i className="fa-solid fa-clock" /> Nueva Hora <span className="field-required">(obligatorio)</span>
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

      <Modal
        open={cancelOpen}
        onClose={closeCancelModal}
        closeOnBackdrop={!savingCancel}
        title="Cancelar Turno"
        subtitle={cancelTarget ? `Turno de ${cancelTarget.cliente || 'Cliente'} · ${formatDateArgentina(cancelTarget.fecha)} ${formatTimeLabel(cancelTarget.horaInicio)}` : ''}
        sizeClass=""
        actions={
          <>
            <ModalCancelButton onClick={closeCancelModal} disabled={savingCancel} />
            <ModalConfirmButton
              label="Cancelar Turno"
              icon="fa-ban"
              variant="danger"
              busy={savingCancel}
              busyLabel="Cancelando…"
              onClick={submitCancelAppointment}
            />
          </>
        }
      >
        <form className="cute-form modal-form" onSubmit={submitCancelAppointment}>
          <div className="cancel-reason-note">
            <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
            <span>
              El turno queda registrado como <strong>cancelado</strong> con este motivo, y la seña
              sigue visible para que la puedas devolver. No se borra nada.
            </span>
          </div>
          <div className="form-group">
            <label htmlFor="cancel-reason-input">
              <i className="fa-solid fa-comment-dots" /> Motivo de la cancelación <span className="field-required">(obligatorio)</span>
            </label>
            <div className="input-wrapper">
              <i className="fa-solid fa-comment-dots input-icon" />
              <textarea
                id="cancel-reason-input"
                rows="3"
                placeholder="Ej. La clienta avisó que no podía ir"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
              />
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
        title="¿Eliminar Turno definitivamente?"
        message={
          deleteConfirm
            ? `Se eliminará TOTALMENTE el turno de ${deleteConfirm.cliente || 'Cliente'} para el ${formatDateArgentina(deleteConfirm.fecha)} a las ${formatTimeLabel(deleteConfirm.horaInicio)}. También se borrará del Google Calendar.${isSuperadmin ? '' : ' Solo válido porque no tiene seña ni servicio cobrado.'} Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar Turno"
        cancelText="Volver"
        confirmVariant="danger"
        onConfirm={confirmDeleteAppointment}
        onCancel={() => setDeleteConfirm(null)}
        busy={deleting}
      />

      <VentaDetalleModal
        as="window"
        open={!!detailTarget}
        appointment={detailTarget}
        // El turno trae la seña agendada; el servicio real se completa al cobrar,
        // así que la ficha se arma con lo que hay del turno y el modal pide los
        // pagos a la base cuando existe turnoId.
        service={detailTarget ? {
            id: detailTarget.rawId || detailTarget.id,
            clienteId: detailTarget.cliente_id,
            cliente: detailTarget.cliente,
            servicio: detailTarget.servicio,
            categoria: null,
            fecha: detailTarget.horaInicio || detailTarget.fecha,
            precio: detailTarget.precio,
            sena: detailTarget.sena || 0,
            metodoPago: null,
            completado: false,
            vuelto: 0
        } : null}
        turnoId={detailTarget ? (detailTarget.rawId || detailTarget.id) : null}
        onClose={() => setDetailTarget(null)}
        onVerCliente={onVerCliente}
        isAdmin={isAdmin}
      />

      {showLoader && typeof showLoader === 'function' ? null : null}
    </div>
  );
}

export default CalendarBoard;
