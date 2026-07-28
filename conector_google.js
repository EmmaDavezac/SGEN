/**
 * =========================================================================
 *                   CONECTOR DE GOOGLE SHEETS PARA EVOLET NAILS
 * =========================================================================
 * 
 * INSTRUCCIONES DE CONFIGURACIÓN:
 * 
 * 1. Crea una nueva Planilla de Google (Google Sheets).
 * 2. Renombra la primera pestaña como "Servicios".
 * 3. En la primera fila (Fila 1), escribe los siguientes encabezados en las columnas A hasta J:
 *    A1: ID
 *    B1: Fecha
 *    C1: Usuario
 *    D1: Cliente
 *    E1: Servicio
 *    F1: Categoria
 *    G1: Precio
 *    H1: Seña
 *    I1: MetodoPago
 *    J1: Completado
 * 
 * 4. Crea una segunda pestaña haciendo clic en el botón "+" abajo a la izquierda y renombrala como "Usuarios".
 * 5. En la primera fila (Fila 1), escribe los siguientes encabezados en las columnas A hasta C:
 *    A1: Email
 *    B1: Password
 *    C1: Nombre
 * 
 * 6. Agrega al menos un usuario autorizado en la pestaña "Usuarios" (Fila 2):
 *    Email: elcorreo@ejemplo.com (en minúsculas)
 *    Password: tucontraseña
 *    Nombre: Tu Nombre (ej. Evolet)
 * 
 * 7. En el menú superior de la planilla, ve a: Extensiones > Apps Script.
 * 8. Borra todo el código que aparezca en el editor y pega todo el contenido de este archivo.
 * 9. Haz clic en el icono del disquete (Guardar proyecto).
 * 10. Arriba a la derecha, haz clic en: Implementar (Deploy) > Nueva implementación (New deployment).
 * 11. Haz clic en el engranaje "Seleccionar tipo" y elige "Aplicación web" (Web app).
 * 12. Configura los siguientes campos:
 *     - Descripción: Conector Evolet Nails App
 *     - Ejecutar como: Yo (tu correo de Google)
 *     - Quién tiene acceso: Cualquier persona (Anyone) -> IMPORTANTE para que la app móvil pueda conectarse.
 * 13. Haz clic en "Implementar".
 * 14. Google te pedirá autorizar permisos. Haz clic en "Autorizar acceso", selecciona tu cuenta, 
 *     luego haz clic en "Avanzado" (Advanced) y después en "Ir a Proyecto sin nombre (no seguro)" (Go to Untitled project). 
 *     Por último, haz clic en "Permitir" (Allow).
 * 15. Copia la "URL de la aplicación web" (debe terminar en "/exec").
 * 16. Pega esa URL en la configuración de la App de Contabilidad Móvil.
 */

// Manejo de solicitudes OPTIONS (Preflight) requerido por navegadores web
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Manejo de solicitudes GET
function doGet(e) {
  const action = e.parameter.action;
  
  if (!action) {
    return jsonResponse({ success: false, message: "Acción no especificada" });
  }
  
  try {
    if (action === "test") {
      return jsonResponse({ success: true, message: "Conexión exitosa con Google Sheets!" });
    }
    
    if (action === "login") {
      const email = e.parameter.email ? e.parameter.email.toLowerCase().trim() : "";
      const password = e.parameter.password ? e.parameter.password.trim() : "";
      return handleLogin(email, password);
    }
    
    if (action === "get_services") {
      const email = e.parameter.email ? e.parameter.email.toLowerCase().trim() : "";
      return getServices(email);
    }
    
    if (action === "get_prices") {
      return getPrices();
    }

    if (action === "get_appointments") {
      return getAppointments();
    }
  } catch (error) {
    return jsonResponse({ success: false, message: "Error en el servidor: " + error.toString() });
  }
  
  return jsonResponse({ success: false, message: "Acción GET no soportada" });
}

// Manejo de solicitudes POST
function doPost(e) {
  // Manejo inicial para peticiones con carga útil
  if (!e.postData || !e.postData.contents) {
    return jsonResponse({ success: false, message: "Datos no recibidos" });
  }
  
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === "login") {
      const email = data.email ? data.email.toLowerCase().trim() : "";
      const password = data.password ? data.password.trim() : "";
      return handleLogin(email, password);
    }
    
    if (action === "add_service") {
      return addService(data);
    }
    
    if (action === "delete_service") {
      return deleteService(data.id, data.email);
    }
    
    if (action === "get_services") {
      const email = data.email ? data.email.toLowerCase().trim() : "";
      return getServices(email);
    }
    
    if (action === "get_prices") {
      return getPrices();
    }
    
    if (action === "update_prices") {
      const email = data.email ? data.email.toLowerCase().trim() : "";
      if (!isAdmin(email)) {
        return jsonResponse({ success: false, message: "No tienes permisos de administrador para realizar esta acción" });
      }
      return updatePrices(data);
    }

    if (action === "get_appointments") {
      return getAppointments();
    }

    if (action === "add_appointment") {
      return addAppointment(data);
    }

    if (action === "delete_appointment") {
      return deleteAppointment(data.id, data.email);
    }
    
    return jsonResponse({ success: false, message: "Acción POST no soportada" });
    
  } catch (error) {
    return jsonResponse({ success: false, message: "Error al procesar la solicitud: " + error.toString() });
  }
}

// Formateador de respuesta JSON
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lógica de Login
function handleLogin(email, password) {
  if (!email || !password) {
    return jsonResponse({ success: false, message: "Email y contraseña son requeridos" });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Usuarios");
  
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Usuarios' no existe en la planilla de Google" });
  }
  
  const data = sheet.getDataRange().getValues();
  // data[0] son los encabezados: Email, Password, Nombre
  
  for (let i = 1; i < data.length; i++) {
    const rowEmail = data[i][0] ? data[i][0].toString().toLowerCase().trim() : "";
    const rowPassword = data[i][1] ? data[i][1].toString().trim() : "";
    const rowNombre = data[i][2] ? data[i][2].toString().trim() : "Manicurista";
    const rowRol = (data[i].length > 3 && data[i][3]) ? data[i][3].toString().trim().toLowerCase() : "manicurista";
    
    if (rowEmail === email && rowPassword === password) {
      // Login exitoso, generamos un token simple
      const token = Utilities.base64Encode(email + ":" + new Date().getTime());
      return jsonResponse({
        success: true,
        message: "Login correcto",
        user: {
          email: email,
          nombre: rowNombre,
          rol: rowRol,
          token: token
        }
      });
    }
  }
  
  return jsonResponse({ success: false, message: "Email o contraseña incorrectos" });
}

// Registrar un nuevo servicio
function addService(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Servicios");
  
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Servicios' no existe" });
  }
  
  const id = data.id || "evt_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  const fecha = data.fecha || new Date().toISOString();
  const usuario = data.usuario ? data.usuario.toLowerCase().trim() : "";
  const cliente = data.cliente || "Cliente Genérico";
  const servicio = data.servicio || "Servicio Personalizado";
  const categoria = data.categoria || "Otros";
  const precio = Number(data.precio) || 0;
  const seña = Number(data.seña) || 0;
  const metodoPago = data.metodoPago || "Efectivo";
  const completado = data.completado || "Sí"; // "Sí" o "No" (si es solo seña)
  
  // Agregar fila
  sheet.appendRow([
    id,
    fecha,
    usuario,
    cliente,
    servicio,
    categoria,
    precio,
    seña,
    metodoPago,
    completado
  ]);
  
  return jsonResponse({
    success: true,
    message: "Servicio registrado correctamente en la nube",
    service: { id, fecha, usuario, cliente, servicio, categoria, precio, seña, metodoPago, completado }
  });
}

// Obtener todos los servicios del usuario
function getServices(email) {
  if (!email) {
    return jsonResponse({ success: false, message: "Email requerido para traer servicios" });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Servicios");
  
  if (!sheet) {
    return jsonResponse({ success: true, services: [] }); // Pestaña vacía/no creada aún
  }
  
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return jsonResponse({ success: true, services: [] }); // Solo fila de encabezados
  }
  
  const services = [];
  
  // Encabezados en fila 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowUsuario = row[2] ? row[2].toString().toLowerCase().trim() : "";
    
    // Filtrar para que solo recupere los servicios del usuario logueado (o todos si se prefiere)
    if (rowUsuario === email) {
      services.push({
        id: row[0],
        fecha: row[1],
        usuario: row[2],
        cliente: row[3],
        servicio: row[4],
        categoria: row[5],
        precio: Number(row[6]) || 0,
        seña: Number(row[7]) || 0,
        metodoPago: row[8],
        completado: row[9]
      });
    }
  }
  
  // Ordenar de más reciente a más antiguo
  services.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
  return jsonResponse({
    success: true,
    services: services
  });
}

// Eliminar un servicio
function deleteService(id, email) {
  if (!id || !email) {
    return jsonResponse({ success: false, message: "Faltan datos para eliminar el registro" });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Servicios");
  
  if (!sheet) {
    return jsonResponse({ success: false, message: "Pestaña 'Servicios' no encontrada" });
  }
  
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    const rowId = rows[i][0];
    const rowUsuario = rows[i][2] ? rows[i][2].toString().toLowerCase().trim() : "";
    
    if (rowId === id && rowUsuario === email) {
      // Eliminar fila (i es index 0, las filas en sheets empiezan en 1, así que es i + 1)
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true, message: "Servicio eliminado correctamente de la nube" });
    }
  }
  
  return jsonResponse({ success: false, message: "No se encontró el registro para eliminar o no tienes permisos" });
}

// Verificar si el usuario es administrador
function isAdmin(email) {
  if (!email) return false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Usuarios");
  if (!sheet) return false;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowEmail = data[i][0] ? data[i][0].toString().toLowerCase().trim() : "";
    const rowRol = (data[i].length > 3 && data[i][3]) ? data[i][3].toString().trim().toLowerCase() : "manicurista";
    if (rowEmail === email && rowRol === "admin") {
      return true;
    }
  }
  return false;
}

// Obtener catálogo de precios
function getPrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Precios");
  
  // Si no existe, crear la pestaña con los valores por defecto oficiales
  if (!sheet) {
    sheet = ss.insertSheet("Precios");
    sheet.appendRow(["Categoria", "Nombre", "Precio"]);
    const defaultPrices = [
      ["semi", "Semipermanente Basic", 12000],
      ["semi", "Semipermanente Full", 14000],
      ["kapping", "Kapping", 12500],
      ["kapping", "Kapping Basic", 14000],
      ["kapping", "Kapping Full", 15500],
      ["kapping", "Kapping con Polygel Basic", 15500],
      ["kapping", "Kapping con Polygel Full", 17000],
      ["softgel", "Soft Gel Basic", 16500],
      ["softgel", "Soft Gel Full", 18000],
      ["esculpidas", "Esculpidas en Polygel Basic", 17500],
      ["esculpidas", "Esculpidas en Polygel Full", 19000],
      ["remocion", "Remoción Semipermanente", 4500],
      ["remocion", "Remoción Kapping", 5000],
      ["remocion", "Remoción Softgel", 5500],
      ["remocion", "Remoción Polygel", 6000],
      ["remocion", "Remoción Acrilico", 6500],
      ["personalizado", "Servicio Personalizado", 0]
    ];
    for (let i = 0; i < defaultPrices.length; i++) {
      sheet.appendRow(defaultPrices[i]);
    }
  }
  
  const data = sheet.getDataRange().getValues();
  const prices = [];
  for (let i = 1; i < data.length; i++) {
    prices.push({
      categoria: data[i][0].toString().trim(),
      name: data[i][1].toString().trim(),
      price: Number(data[i][2]) || 0
    });
  }
  
  return jsonResponse({ success: true, prices: prices });
}

// Actualizar catálogo de precios
function updatePrices(data) {
  const prices = data.prices;
  if (!prices || !Array.isArray(prices)) {
    return jsonResponse({ success: false, message: "Datos de precios inválidos" });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Precios");
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Precios' no existe" });
  }
  
  sheet.clearContents();
  sheet.appendRow(["Categoria", "Nombre", "Precio"]);
  
  for (let i = 0; i < prices.length; i++) {
    sheet.appendRow([
      prices[i].categoria,
      prices[i].name,
      prices[i].price
    ]);
  }
  
  return jsonResponse({ success: true, message: "Lista de precios actualizada con éxito en la nube" });
}

// Obtener el calendario de Google
function getCalendar() {
  try {
    const name = "Evolet Nails";
    const calendars = CalendarApp.getCalendarsByName(name);
    if (calendars.length > 0) {
      return calendars[0];
    }
    // Crear el calendario secundario dedicado
    return CalendarApp.createCalendar(name, {
      summary: "Turnos agendados desde la aplicación de Evolet Nails",
      color: CalendarApp.Color.PINK
    });
  } catch (error) {
    // Si falla por permisos (ej. no puede crear calendarios), usar el por defecto
    try {
      return CalendarApp.getDefaultCalendar();
    } catch (e) {
      return null;
    }
  }
}

// Obtener lista de turnos
function getAppointments() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Turnos");
  
  // Si la hoja no existe, la creamos vacía con las cabeceras
  if (!sheet) {
    sheet = ss.insertSheet("Turnos");
    sheet.appendRow(["ID", "Fecha", "HoraInicio", "HoraFin", "Cliente", "Servicio", "Precio", "Usuario", "EventID"]);
    return jsonResponse({ success: true, appointments: [] });
  }
  
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return jsonResponse({ success: true, appointments: [] });
  }
  
  const appointments = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue; // Fila vacía
    appointments.push({
      id: row[0],
      fecha: row[1],
      horaInicio: row[2],
      horaFin: row[3],
      cliente: row[4],
      servicio: row[5],
      precio: Number(row[6]) || 0,
      usuario: row[7],
      eventId: row[8]
    });
  }
  
  // Ordenar por fecha y hora de inicio de más cercano a más lejano
  appointments.sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
  
  return jsonResponse({ success: true, appointments: appointments });
}

// Agendar un nuevo turno
function addAppointment(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Turnos");
  
  if (!sheet) {
    sheet = ss.insertSheet("Turnos");
    sheet.appendRow(["ID", "Fecha", "HoraInicio", "HoraFin", "Cliente", "Servicio", "Precio", "Usuario", "EventID"]);
  }
  
  const id = data.id || "app_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  const fecha = data.fecha; // YYYY-MM-DD
  const horaInicio = data.horaInicio; // ISO string
  const horaFin = data.horaFin; // ISO string
  const cliente = data.cliente || "Cliente";
  const servicio = data.servicio || "Servicio";
  const precio = Number(data.precio) || 0;
  const usuario = data.usuario ? data.usuario.toLowerCase().trim() : "";
  
  let eventId = "";
  
  // Crear evento en Google Calendar
  try {
    const cal = getCalendar();
    if (cal) {
      const event = cal.createEvent(
        "Evolet Nails: " + cliente + " (" + servicio + ")",
        new Date(horaInicio),
        new Date(horaFin),
        {
          description: "Turno agendado para: " + cliente + "\nServicio: " + servicio + "\nPrecio: $" + precio + "\nRegistrado por: " + usuario
        }
      );
      eventId = event.getId();
    }
  } catch (e) {
    console.error("Error al crear evento en Google Calendar: " + e.toString());
  }
  
  sheet.appendRow([
    id,
    fecha,
    horaInicio,
    horaFin,
    cliente,
    servicio,
    precio,
    usuario,
    eventId
  ]);
  
  return jsonResponse({
    success: true,
    message: "Turno agendado correctamente en la nube",
    appointment: { id, fecha, horaInicio, horaFin, cliente, servicio, precio, usuario, eventId }
  });
}

// Cancelar un turno
function deleteAppointment(id, email) {
  if (!id) {
    return jsonResponse({ success: false, message: "Falta el ID del turno a eliminar" });
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Turnos");
  
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Turnos' no existe" });
  }
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowId = rows[i][0];
    const rowEventId = rows[i][8];
    
    if (rowId === id) {
      // Borrar evento en Google Calendar
      if (rowEventId) {
        try {
          const cal = getCalendar();
          if (cal) {
            const event = cal.getEventById(rowEventId);
            if (event) {
              event.deleteEvent();
            }
          }
        } catch (e) {
          console.error("Error al borrar evento de Google Calendar: " + e.toString());
        }
      }
      
      // Borrar fila en Sheets
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true, message: "Turno cancelado y eliminado correctamente" });
    }
  }
  
  return jsonResponse({ success: false, message: "No se encontró el turno especificado" });
}
