function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('CALENDAR_BRIDGE_SECRET');
    const payload = JSON.parse(e && e.postData && e.postData.contents || '{}');

    // El secreto es OPCIONAL: si no configurás CALENDAR_BRIDGE_SECRET, se acepta
    // cualquier llamada; si lo configurás, la petición debe traer ese mismo valor.
    if (expectedSecret && payload.secret !== expectedSecret) {
      return jsonResponse({ success: false, message: 'No autorizado' });
    }
    if (payload.action === 'delete_calendar_event') {
      return deleteCalendarEvent(payload.appointment || {}, payload.calendarId, properties);
    }
    if (payload.action !== 'sync_calendar_event' && payload.action !== 'update_calendar_event') {
      return jsonResponse({ success: false, message: 'Acción no soportada' });
    }

    return syncCalendarEvent(payload.appointment || {}, payload.calendarId, properties);
  } catch (error) {
    console.error('Error procesando la solicitud: ' + error);
    return jsonResponse({ success: false, message: String(error) });
  }
}

function resolveCalendar(properties, payloadCalendarId) {
  const calendarId = String(payloadCalendarId || properties.getProperty('CALENDAR_ID') || '').trim();
  const calendar = calendarId
    ? CalendarApp.getCalendarById(calendarId)
    : CalendarApp.getDefaultCalendar();
  return { calendar: calendar, calendarId: calendarId };
}

function syncCalendarEvent(appointment, payloadCalendarId, properties) {
  const appointmentId = String(appointment.id || '').trim();
  const clientName = String(appointment.cliente || '').trim();
  const start = new Date(appointment.horaInicio);
  const end = new Date(appointment.horaFin);

  if (!appointmentId || !clientName || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return jsonResponse({ success: false, message: 'Los datos del turno están incompletos o son inválidos.' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse({ success: false, message: 'Hay otra sincronización en curso; reintentá.' });
  }

  try {
    const resolved = resolveCalendar(properties, payloadCalendarId);
    const calendar = resolved.calendar;
    if (!calendar) {
      return jsonResponse({ success: false, message: 'No se encontró el calendario configurado.' });
    }

    const eventKey = 'CALENDAR_EVENT_' + appointmentId;
    const marker = 'ID Evolet: ' + appointmentId;
    const savedEventId = properties.getProperty(eventKey);
    let event = savedEventId ? calendar.getEventById(savedEventId) : null;

    if (!event) {
      event = calendar.getEvents(start, end).find(function (candidate) {
        return (candidate.getDescription() || '').indexOf(marker) >= 0;
      }) || null;
    }

    const title = 'Turno - ' + clientName;
    const description = [
      'Cliente: ' + clientName,
      'Servicio: ' + String(appointment.servicio || 'Turno'),
      'Estado: ' + String(appointment.estado || 'provisional'),
      'Precio: $' + (Number(appointment.precio) || 0),
      marker
    ].join('\n');

    if (event) {
      event.setTitle(title);
      event.setTime(start, end);
      event.setDescription(description);
    } else {
      event = calendar.createEvent(title, start, end, { description: description });
      try {
        event.removeAllReminders();
        event.addPopupReminder(30);
      } catch (reminderError) {
        console.warn('No se pudo configurar el recordatorio: ' + reminderError);
      }
    }

    const eventId = event.getId();
    properties.setProperty(eventKey, eventId);
    return jsonResponse({ success: true, eventId: eventId });
  } finally {
    lock.releaseLock();
  }
}

function deleteCalendarEvent(appointment, payloadCalendarId, properties) {
  const appointmentId = String(appointment.id || '').trim();
  const eventId = String(appointment.eventId || appointment.event_id || '').trim();
  if (!appointmentId && !eventId) {
    return jsonResponse({ success: false, message: 'Falta el ID del turno a eliminar.' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse({ success: false, message: 'Hay otra sincronización en curso; reintentá.' });
  }

  try {
    const resolved = resolveCalendar(properties, payloadCalendarId);
    const calendar = resolved.calendar;
    if (!calendar) {
      return jsonResponse({ success: false, message: 'No se encontró el calendario configurado.' });
    }

    const eventKey = appointmentId ? 'CALENDAR_EVENT_' + appointmentId : null;
    const savedEventId = eventKey ? properties.getProperty(eventKey) : null;
    let event = null;
    const candidates = [];
    if (eventId) candidates.push(eventId);
    if (savedEventId && savedEventId !== eventId) candidates.push(savedEventId);
    for (let i = 0; i < candidates.length; i++) {
      try {
        event = calendar.getEventById(candidates[i]);
      } catch (lookupError) {
        event = null;
      }
      if (event) break;
    }

    if (!event && appointmentId) {
      const marker = 'ID Evolet: ' + appointmentId;
      const now = new Date();
      const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const future = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const found = calendar.getEvents(past, future).filter(function (candidate) {
        return (candidate.getDescription() || '').indexOf(marker) >= 0;
      });
      if (found && found.length > 0) event = found[0];
    }

    if (event) {
      event.deleteEvent();
    }
    if (eventKey) properties.deleteProperty(eventKey);
    return jsonResponse({ success: true, deleted: Boolean(event) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
