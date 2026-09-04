import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { normalizeAppointmentList, normalizeAppointmentRecord, createStableAppointmentId, updateAppointmentInSupabase, deleteAppointmentInSupabase, syncAppointmentWithGoogleCalendar } from '../appointments.js';
import { supabase } from '../supabase.js';
import { registerServiceDirectly } from '../services.js';
import Modal, { ConfirmModal } from './Modal.jsx';
import Button from './Button.jsx';

function formatDateLabel(dateValue) {
    if (!dateValue) return 'Sin fecha';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: 'short' });
}

function formatTime(dateValue) {
    if (!dateValue) return '--:--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function getStateStyle(stateStr) {
    const s = (stateStr || 'Provisional').toString().trim().toLowerCase();
    if (s === 'completado' || s === 'cobrado' || s === 'pagado' || s === 'completed')
        return { label: 'Completado', color: '#8bc34a' };
    if (s === 'reservado') return { label: 'Reservado', color: 'var(--barbie-pink)' };
    if (s === 'cancelado') return { label: 'Cancelado', color: '#ef5350' };
    return { label: 'Provisional', color: '#FFB347' };
}

const DEFAULT_APPT = {
    id: '',
    fecha: '',
    horaInicio: '',
    horaFin: '',
    cliente: '',
    servicio: 'Turno',
    precio: 0,
    estado: 'Provisional'
};

function AgendaBoard({ session, notify = () => {}, showLoader = () => {} }) {
    const isAdmin = session && session.rol === 'admin';
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState([]);

    // Formulario NUEVO turno
    const [createOpen, setCreateOpen] = useState(false);
    const [createDraft, setCreateDraft] = useState(() => ({ ...DEFAULT_APPT }));
    const [createSena, setCreateSena] = useState('');
    const [createSenaPayment, setCreateSenaPayment] = useState('Transferencia');
    const [createSuggestions, setCreateSuggestions] = useState([]);
    const [createSubmitting, setCreateSubmitting] = useState(false);

    // Confirm modales generales
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({ title: '', message: '', action: null, variant: 'primary', busy: false });

    // Modal SEÑA
    const [senaOpen, setSenaOpen] = useState(false);
    const [senaAppt, setSenaAppt] = useState(null);
    const [senaAmount, setSenaAmount] = useState('');
    const [senaPayment, setSenaPayment] = useState('Transferencia');
    const [senaBusy, setSenaBusy] = useState(false);

    // Modal REAGENDAR
    const [reschedOpen, setReschedOpen] = useState(false);
    const [reschedAppt, setReschedAppt] = useState(null);
    const [reschedDate, setReschedDate] = useState('');
    const [reschedTime, setReschedTime] = useState('');
    const [reschedBusy, setReschedBusy] = useState(false);

    // Menú de acciones de un turno
    const [menuOpenId, setMenuOpenId] = useState(null);

    const loadAgenda = useCallback(async () => {
        if (!session?.authId || !supabase) {
            setAppointments([]);
            return;
        }
        setLoading(true);
        try {
            const cacheKey = `evolet_appointments_v4_${session.email}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    const normalized = normalizeAppointmentList(parsed);
                    setAppointments(normalized);
                } catch { /* ignore */ }
            }

            const { data, error } = await supabase
                .from('turnos')
                .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, clientes(nombre), perfiles(email)')
                .order('hora_inicio', { ascending: true });
            if (error) throw error;

            const normalized = normalizeAppointmentList(
                (data || []).map((item) => normalizeAppointmentRecord({
                    id: item.legacy_id || item.id,
                    fecha: item.fecha,
                    horaInicio: item.hora_inicio,
                    horaFin: item.hora_fin,
                    cliente: item.clientes?.nombre || 'Cliente',
                    servicio: item.servicio,
                    precio: item.precio,
                    estado: item.estado,
                    eventId: item.event_id,
                    usuario: item.perfiles?.email || session.email
                }))
            );
            setAppointments(normalized);
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
        } catch (error) {
            console.error('Error cargando agenda React:', error);
            notify('No se pudieron cargar los turnos.', 'error');
        } finally {
            setLoading(false);
        }
    }, [session, notify]);

    const loadClients = useCallback(async () => {
        if (!supabase || !session?.authId) return;
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('id, nombre, activo')
                .order('nombre');
            if (error) return;
            setClients((data || []).filter(c => c.activo !== false));
        } catch { /* ignore */ }
    }, [session]);

    useEffect(() => {
        loadAgenda();
        loadClients();
    }, [loadAgenda, loadClients]);

    const grouped = useMemo(() => {
        return appointments.reduce((acc, apt) => {
            const key = apt.fecha || apt.horaInicio || 'Sin fecha';
            if (!acc[key]) acc[key] = [];
            acc[key].push(apt);
            return acc;
        }, {});
    }, [appointments]);

    // ====== Helpers para form NUEVO turno ======
    const openCreate = (prefill) => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setCreateDraft({
            ...DEFAULT_APPT,
            fecha: prefill?.fecha || `${yyyy}-${mm}-${dd}`,
            horaInicio: prefill?.horaInicio || '09:00',
            horaFin: prefill?.horaFin || '',
            servicio: 'Turno',
            estado: 'Provisional'
        });
        setCreateSena('');
        setCreateSenaPayment('Transferencia');
        setCreateSuggestions([]);
        setCreateOpen(true);
    };

    const closeCreate = () => {
        setCreateOpen(false);
        setCreateDraft({ ...DEFAULT_APPT });
        setCreateSena('');
        setCreateSenaPayment('Transferencia');
        setCreateSuggestions([]);
    };

    const handleCreateClientInput = (value) => {
        setCreateDraft(prev => ({ ...prev, cliente: value }));
        const v = value.trim().toLowerCase();
        if (v.length === 0) {
            setCreateSuggestions([]);
            return;
        }
        const matches = clients
            .filter(c => c.nombre.toLowerCase().includes(v))
            .slice(0, 6);
        setCreateSuggestions(matches);
    };

    const handleCreateSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const cliente = (createDraft.cliente || '').trim();
        const fecha = createDraft.fecha;
        const horaInicio = createDraft.horaInicio;
        if (!cliente || !fecha || !horaInicio) {
            notify('Completá clienta, fecha y hora para agendar.', 'error');
            return;
        }
        if (!supabase || !session?.authId) {
            notify('No hay conexión con Supabase.', 'error');
            return;
        }
        const senaRaw = Number(createSena);
        const senaNum = senaRaw || 0;
        const estado = createDraft.estado || 'Provisional';
        if (estado === 'Reservado' && senaRaw !== 0 && senaRaw < 1000) {
            notify('La seña debe ser 0 o mayor a $1000.', 'error');
            return;
        }

        setConfirmConfig({
            title: 'Confirmar turno',
            variant: 'primary',
            message:
`Clienta: ${cliente}\nFecha: ${fecha}\nHora: ${horaInicio}\nEstado: ${estado}\nSeña: $${senaNum.toLocaleString('es-AR')}${estado === 'Reservado' ? `\nMétodo de pago de seña: ${createSenaPayment}` : ''}\n\n¿Confirmás agendar este turno?`,
            busy: false,
            action: async () => {
                setCreateSubmitting(true);
                showLoader(true, 'Agendando turno y sincronizando con Google Calendar...');
                try {
                    let clientRecord;
                    {
                        const { data: lookupClient, error: lookupErr } = await supabase
                            .from('clientes')
                            .select('id, nombre, activo')
                            .eq('nombre_normalizado', cliente.toLowerCase())
                            .maybeSingle();
                        if (lookupErr) throw lookupErr;
                        if (lookupClient && lookupClient.activo === false) {
                            notify('La clienta no está activa.', 'error');
                            return;
                        }
                        if (lookupClient) {
                            clientRecord = lookupClient;
                        } else {
                            const { data: newClient, error: ncErr } = await supabase
                                .from('clientes')
                                .insert({ nombre: cliente })
                                .select('id, nombre')
                                .single();
                            if (ncErr) throw ncErr;
                            clientRecord = newClient;
                        }
                    }

                    const start = new Date(`${fecha}T${horaInicio}`);
                    const duration = 90;
                    const startISO = start.toISOString();
                    const endISO = new Date(start.getTime() + duration * 60000).toISOString();
                    const legacyId = `app_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                    const precio = estado === 'Reservado' ? senaNum : (Number(createDraft.precio) || 0);

                    const { data: inserted, error: insErr } = await supabase
                        .from('turnos')
                        .insert({
                            legacy_id: legacyId,
                            cliente_id: clientRecord.id,
                            usuario_id: session.authId,
                            fecha: fecha,
                            hora_inicio: startISO,
                            hora_fin: createDraft.horaFin ? new Date(`${fecha}T${createDraft.horaFin}`).toISOString() : endISO,
                            servicio: (createDraft.servicio || 'Turno').toString().trim(),
                            precio: precio,
                            estado: estado.toString().toLowerCase(),
                            event_id: null
                        })
                        .select('id, legacy_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id')
                        .single();
                    if (insErr) throw insErr;

                    const normalizedAppointment = normalizeAppointmentRecord({
                        id: inserted.legacy_id || inserted.id,
                        legacy_id: inserted.legacy_id,
                        fecha: inserted.fecha,
                        horaInicio: inserted.hora_inicio,
                        horaFin: inserted.hora_fin,
                        cliente,
                        servicio: inserted.servicio,
                        precio: inserted.precio,
                        estado: estado,
                        eventId: inserted.event_id,
                        usuario: session.email
                    });

                    const sync = await syncAppointmentWithGoogleCalendar('create', normalizedAppointment);
                    if (!sync.success && sync.warning) {
                        notify('Turno guardado; la sincronización con Google Calendar falló.', 'warning');
                    } else {
                        notify('¡Turno agendado y sincronizado con éxito! ✨', 'success');
                    }

                    if (estado === 'Reservado' && senaNum > 0) {
                        showLoader(true, 'Registrando seña en la contabilidad...');
                        await registerServiceDirectly({
                            id: `serv_${Date.now()}`,
                            fecha: new Date().toISOString(),
                            usuario: session.email,
                            cliente,
                            servicio: 'Seña',
                            categoria: 'Otro',
                            precio: senaNum,
                            seña: 0,
                            metodoPago: createSenaPayment,
                            completado: true,
                            vuelto: 0
                        });
                    }

                    closeCreate();
                    await loadAgenda();
                } catch (error) {
                    console.error('Error al agendar turno React:', error);
                    notify(error?.message || 'Error de conexión al agendar turno.', 'error');
                } finally {
                    showLoader(false);
                    setCreateSubmitting(false);
                    setConfirmOpen(false);
                    setConfirmConfig(c => ({ ...c, busy: false }));
                }
            }
        });
        setConfirmOpen(true);
    };

    // ====== SEÑA ======
    const openSena = (appt) => {
        setSenaAppt(appt);
        setSenaAmount(Number(appt?.precio || 0) > 0 ? String(Number(appt.precio)) : '');
        setSenaPayment('Transferencia');
        setSenaOpen(true);
    };

    const closeSena = () => {
        setSenaOpen(false);
        setSenaAppt(null);
        setSenaAmount('');
        setSenaBusy(false);
    };

    const submitSena = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!senaAppt || !supabase) return;
        const monto = Number(senaAmount);
        if (!monto || monto < 1000) {
            notify('La seña debe ser mayor a $999.', 'error');
            return;
        }
        setSenaBusy(true);
        showLoader(true, 'Guardando seña...');
        try {
            const res = await updateAppointmentInSupabase(senaAppt.id, {
                precio: monto,
                estado: 'reservado'
            });
            if (!res?.success) throw new Error('No se actualizó el turno.');

            const updated = normalizeAppointmentRecord({ ...senaAppt, precio: monto, estado: 'Reservado' });
            await syncAppointmentWithGoogleCalendar('update', updated);

            await registerServiceDirectly({
                id: `serv_${Date.now()}`,
                fecha: new Date().toISOString(),
                usuario: session.email,
                cliente: senaAppt.cliente,
                servicio: 'Seña',
                categoria: 'Otro',
                precio: monto,
                seña: 0,
                metodoPago: senaPayment,
                completado: true
            });

            notify('¡Seña guardada con éxito! 💖', 'success');
            closeSena();
            loadAgenda();
        } catch (err) {
            console.error(err);
            notify('No se pudo registrar la seña.', 'error');
        } finally {
            showLoader(false);
            setSenaBusy(false);
        }
    };

    // ====== REAGENDAR ======
    const openResched = (appt) => {
        setReschedAppt(appt);
        const d = new Date(appt.horaInicio || appt.fecha);
        if (isNaN(d.getTime())) {
            setReschedDate('');
            setReschedTime('');
        } else {
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            setReschedDate(`${d.getFullYear()}-${mm}-${dd}`);
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            setReschedTime(`${hh}:${mi}`);
        }
        setReschedOpen(true);
    };

    const closeResched = () => {
        setReschedOpen(false);
        setReschedAppt(null);
        setReschedDate('');
        setReschedTime('');
        setReschedBusy(false);
    };

    const submitResched = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!reschedAppt) return;
        if (!reschedDate || !reschedTime) {
            notify('Completá la nueva fecha y hora.', 'error');
            return;
        }
        setReschedBusy(true);
        showLoader(true, 'Reagendando turno...');
        try {
            const start = new Date(`${reschedDate}T${reschedTime}`);
            const end = new Date(start.getTime() + 90 * 60000);
            const res = await updateAppointmentInSupabase(reschedAppt.id, {
                fecha: reschedDate,
                hora_inicio: start.toISOString(),
                hora_fin: end.toISOString()
            });
            if (!res?.success) throw new Error('No se actualizó el turno.');
            const updated = normalizeAppointmentRecord({
                ...reschedAppt,
                fecha: reschedDate,
                horaInicio: start.toISOString(),
                horaFin: end.toISOString()
            });
            const sync = await syncAppointmentWithGoogleCalendar('update', updated);
            if (!sync.success && sync.warning) {
                notify('Turno actualizado; falló la sincronización con Google Calendar.', 'warning');
            } else {
                notify('Turno reagendado correctamente ✨', 'success');
            }
            closeResched();
            await loadAgenda();
        } catch (err) {
            console.error(err);
            notify(err?.message || 'No se pudo reagendar el turno.', 'error');
        } finally {
            showLoader(false);
            setReschedBusy(false);
        }
    };

    // ====== CAMBIAR ESTADO ======
    const changeState = async (appt, newEstado) => {
        setMenuOpenId(null);
        if (!supabase) return;
        showLoader(true, `Cambiando estado a ${newEstado}...`);
        (async () => {
            try {
                const res = await updateAppointmentInSupabase(appt.id, { estado: newEstado.toLowerCase() });
                if (!res?.success) throw new Error('No se actualizó el turno.');
                const updated = normalizeAppointmentRecord({ ...appt, estado: newEstado });
                await syncAppointmentWithGoogleCalendar('update', updated);
                notify(`Estado actualizado a ${newEstado}.`, 'success');
                await loadAgenda();
            } catch (err) {
                console.error(err);
                notify('No se pudo actualizar el estado.', 'error');
            } finally {
                showLoader(false);
            }
        })();
    };

    // ====== CANCELAR / ELIMINAR ======
    const requestCancel = (appt) => {
        setMenuOpenId(null);
        if (!isAdmin) {
            notify('Solo administradoras pueden cancelar turnos.', 'error');
            return;
        }
        setConfirmConfig({
            title: 'Cancelar Turno',
            variant: 'danger',
            message: `¿Segura de cancelar el turno de ${appt.cliente}? También se eliminará de tu Google Calendar.`,
            busy: false,
            action: async () => {
                setConfirmConfig(c => ({ ...c, busy: true }));
                showLoader(true, 'Cancelando turno...');
                try {
                    const sync = await syncAppointmentWithGoogleCalendar('delete', appt);
                    const del = await deleteAppointmentInSupabase(appt.id);
                    if (!del?.success) throw new Error('No se eliminó el turno.');
                    if (!sync.success && sync.warning) {
                        notify('Turno eliminado de Supabase; falló la eliminación en Google Calendar.', 'warning');
                    } else {
                        notify('Turno cancelado correctamente.', 'success');
                    }
                    setConfirmOpen(false);
                    setConfirmConfig(c => ({ ...c, busy: false }));
                    await loadAgenda();
                } catch (err) {
                    console.error(err);
                    notify(err?.message || 'No se pudo cancelar el turno.', 'error');
                    setConfirmOpen(false);
                    setConfirmConfig(c => ({ ...c, busy: false }));
                } finally {
                    showLoader(false);
                }
            }
        });
        setConfirmOpen(true);
    };

    return (
        <section aria-label="Agenda de turnos" style={{ display: 'grid', gap: '18px' }}>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div>
                    <h3>Agenda y turnos</h3>
                    <p>Vista reactiva de los próximos turnos sincronizados con Supabase.</p>
                </div>
                <Button onClick={() => openCreate({})} style={{ width: 'auto', padding: '8px 16px', whiteSpace: 'nowrap', fontSize: '13px' }}>
                    <i className="fa-solid fa-calendar-plus"></i> Nuevo turno
                </Button>
            </div>

            {loading && <p className="subtle-text">Cargando turnos...</p>}

            {!loading && (!appointments || appointments.length === 0) && (
                <div className="modal-card" style={{ padding: '20px', borderRadius: '18px' }}>
                    <p className="subtle-text" style={{ margin: 0 }}>No hay turnos cargados para esta sesión.</p>
                </div>
            )}

            {!loading && Object.entries(grouped).map(([dayKey, dayAppointments]) => (
                <div key={dayKey} className="modal-card" style={{ padding: '18px', borderRadius: '18px' }}>
                    <h4 style={{ margin: '0 0 12px', color: 'var(--barbie-dark)' }}>{formatDateLabel(dayKey)}</h4>
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {dayAppointments.map((appt) => {
                            const s = getStateStyle(appt.estado);
                            const menuOpen = menuOpenId === appt.id;
                            return (
                                <div
                                    key={appt.id}
                                    style={{
                                        border: '1px solid rgba(255,105,180,0.2)',
                                        background: '#fff8fb',
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        display: 'grid',
                                        gap: '4px',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                        <div>
                                            <strong style={{ color: 'var(--barbie-dark)' }}>{appt.cliente}</strong>
                                            <div style={{ fontSize: '12px', color: '#5e5e5e', marginTop: '2px' }}>
                                                {appt.servicio || 'Turno'} · {formatTime(appt.horaInicio || appt.fecha)}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#5e5e5e' }}>
                                                Precio: ${Number(appt.precio || 0).toLocaleString('es-AR')}
                                            </div>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    background: s.color,
                                                    color: '#fff',
                                                    marginTop: '6px'
                                                }}
                                            >
                                                {s.label}
                                            </span>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                type="button"
                                                title="Acciones"
                                                style={{
                                                    border: 'none',
                                                    background: 'rgba(255,105,180,0.12)',
                                                    width: '28px', height: '28px',
                                                    borderRadius: '50%',
                                                    color: 'var(--barbie-pink)',
                                                    cursor: 'pointer',
                                                    padding: 0
                                                }}
                                                onClick={() => setMenuOpenId(menuOpen ? null : appt.id)}
                                            >
                                                <i className="fa-solid fa-ellipsis-vertical"></i>
                                            </button>
                                            {menuOpen && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        top: '34px',
                                                        zIndex: 20,
                                                        background: '#fff',
                                                        border: '1px solid rgba(255,105,180,0.25)',
                                                        borderRadius: '12px',
                                                        padding: '6px',
                                                        boxShadow: '0 6px 14px rgba(150, 60, 120, 0.15)',
                                                        minWidth: '200px',
                                                        display: 'grid',
                                                        gap: '2px'
                                                    }}
                                                    onBlur={() => setMenuOpenId(null)}
                                                >
                                                    <MenuItem label={<><i className="fa-solid fa-peso-sign"></i> Cargar seña</>} onClick={() => openSena(appt)} />
                                                    <MenuItem label={<><i className="fa-solid fa-calendar-day"></i> Reagendar</>} onClick={() => openResched(appt)} />
                                                    <MenuItem
                                                        label={<><i className="fa-regular fa-clock"></i> Provisional</>}
                                                        onClick={() => changeState(appt, 'Provisional')}
                                                    />
                                                    <MenuItem
                                                        label={<><i className="fa-solid fa-bookmark"></i> Reservado</>}
                                                        onClick={() => changeState(appt, 'Reservado')}
                                                    />
                                                    <MenuItem
                                                        label={<><i className="fa-solid fa-circle-check"></i> Completado</>}
                                                        onClick={() => changeState(appt, 'Completado')}
                                                    />
                                                    <MenuItem
                                                        label={<><i className="fa-solid fa-xmark-circle"></i> Cancelado</>}
                                                        onClick={() => changeState(appt, 'Cancelado')}
                                                    />
                                                    {isAdmin && <Divider />}
                                                    {isAdmin && (
                                                        <MenuItem
                                                            danger
                                                            label={<><i className="fa-solid fa-trash-can"></i> Cancelar / Eliminar</>}
                                                            onClick={() => requestCancel(appt)}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Modal: Crear turno */}
            <Modal open={createOpen} onClose={closeCreate} title="Agendar turno">
                <form onSubmit={(e) => { e.preventDefault(); handleCreateSubmit(e); }} className="cute-form" style={{ display: 'grid', gap: '12px' }}>
                    <div className="form-group">
                        <label><i className="fa-solid fa-user"></i> Clienta</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={createDraft.cliente}
                                onChange={(e) => handleCreateClientInput(e.target.value)}
                                placeholder="Nombre de clienta"
                                list={createSuggestions.length ? undefined : undefined}
                                autoComplete="off"
                                required
                            />
                            {createSuggestions.length > 0 && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0, right: 0, top: '100%', marginTop: '4px',
                                        background: '#fff',
                                        border: '1px solid rgba(255,105,180,0.2)',
                                        borderRadius: '10px',
                                        padding: '4px',
                                        zIndex: 50,
                                        maxHeight: '180px',
                                        overflowY: 'auto'
                                    }}
                                >
                                    {createSuggestions.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '8px 10px',
                                                border: 'none',
                                                background: 'transparent',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                fontSize: '14px'
                                            }}
                                            onClick={() => {
                                                setCreateDraft(prev => ({ ...prev, cliente: c.nombre }));
                                                setCreateSuggestions([]);
                                            }}
                                        >
                                            {c.nombre}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-calendar-day"></i> Fecha</label>
                            <input
                                type="date"
                                value={createDraft.fecha}
                                onChange={(e) => setCreateDraft(prev => ({ ...prev, fecha: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-clock"></i> Hora inicio</label>
                            <input
                                type="time"
                                value={createDraft.horaInicio}
                                onChange={(e) => setCreateDraft(prev => ({ ...prev, horaInicio: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-clock"></i> Hora fin (opcional)</label>
                            <input
                                type="time"
                                value={createDraft.horaFin}
                                onChange={(e) => setCreateDraft(prev => ({ ...prev, horaFin: e.target.value }))}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-list-check"></i> Estado</label>
                            <select
                                value={createDraft.estado}
                                onChange={(e) => setCreateDraft(prev => ({ ...prev, estado: e.target.value }))}
                            >
                                <option value="Provisional">Provisional</option>
                                <option value="Reservado">Reservado</option>
                                <option value="Completado">Completado</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label><i className="fa-solid fa-spray-can-sparkles"></i> Servicio</label>
                        <input
                            type="text"
                            value={createDraft.servicio}
                            onChange={(e) => setCreateDraft(prev => ({ ...prev, servicio: e.target.value }))}
                            placeholder="Ej. Turno, Semipermanente, etc."
                        />
                    </div>

                    {createDraft.estado === 'Reservado' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label><i className="fa-solid fa-hand-holding-dollar"></i> Monto seña ($)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={createSena}
                                        onChange={(e) => setCreateSena(e.target.value)}
                                        placeholder="0 o mayor a 1000"
                                    />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label><i className="fa-solid fa-credit-card"></i> Método de pago</label>
                                    <select value={createSenaPayment} onChange={(e) => setCreateSenaPayment(e.target.value)}>
                                        <option value="Transferencia">Transferencia</option>
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Fiado">Fiado</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <Button type="button" variant="secondary" onClick={closeCreate}>Cancelar</Button>
                        <Button type="submit" busy={createSubmitting}>Agendar</Button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Cargar seña */}
            <Modal open={senaOpen} onClose={closeSena} title="Cargar seña">
                <form onSubmit={submitSena} className="cute-form" style={{ display: 'grid', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                        Clienta: <strong>{senaAppt?.cliente || ''}</strong>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-hand-holding-dollar"></i> Monto ($)</label>
                            <input
                                type="number"
                                min="1000"
                                step="1"
                                value={senaAmount}
                                onChange={(e) => setSenaAmount(e.target.value)}
                                placeholder="Mayor a 999"
                                required
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-credit-card"></i> Método de pago</label>
                            <select value={senaPayment} onChange={(e) => setSenaPayment(e.target.value)}>
                                <option value="Transferencia">Transferencia</option>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Fiado">Fiado</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <Button type="button" variant="secondary" onClick={closeSena}>Cancelar</Button>
                        <Button type="submit" busy={senaBusy}>Guardar seña</Button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Reagendar */}
            <Modal open={reschedOpen} onClose={closeResched} title="Reagendar turno">
                <form onSubmit={submitResched} className="cute-form" style={{ display: 'grid', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                        Turno: <strong>{reschedAppt?.cliente || ''}</strong>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-calendar-day"></i> Nueva fecha</label>
                            <input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} required />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label><i className="fa-solid fa-clock"></i> Nueva hora</label>
                            <input type="time" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} required />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <Button type="button" variant="secondary" onClick={closeResched}>Cancelar</Button>
                        <Button type="submit" busy={reschedBusy}>Reagendar</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                open={confirmOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmVariant={confirmConfig.variant}
                onCancel={() => { setConfirmOpen(false); setConfirmConfig(c => ({ ...c, busy: false })); }}
                onConfirm={() => confirmConfig.action && confirmConfig.action()}
                busy={confirmConfig.busy}
            />
        </section>
    );
}

function MenuItem({ label, onClick, danger }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 10px',
                border: 'none',
                borderRadius: '8px',
                background: 'transparent',
                fontSize: '13px',
                color: danger ? '#ef5350' : 'var(--text-muted)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%'
            }}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,105,180,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
            {label}
        </button>
    );
}

function Divider() {
    return <div style={{ height: '1px', background: 'rgba(150, 60, 120, 0.15)', margin: '4px 0' }} />;
}

export default AgendaBoard;
