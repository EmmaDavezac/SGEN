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

const SPREADSHEET_ID = "REPLACE_WITH_YOUR_SHEET_ID";

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "REPLACE_WITH_YOUR_SHEET_ID") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.error("No se pudo abrir la planilla por ID, usando activo: " + e.toString());
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

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
      const email = e.parameter.email ? e.parameter.email.toLowerCase().trim() : "";
      return getAppointments(email);
    }

    if (action === "get_expenses") {
      return getExpenses();
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
    
    if (action === "edit_service") {
      return editService(data);
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
      const email = data.email ? data.email.toLowerCase().trim() : "";
      return getAppointments(email);
    }

    if (action === "add_appointment") {
      return addAppointment(data);
    }

    if (action === "delete_appointment") {
      return deleteAppointment(data.id, data.email);
    }

    if (action === "edit_appointment") {
      return editAppointment(data);
    }

    if (action === "import_services") {
      const email = data.email ? data.email.toLowerCase().trim() : "";
      return importServicesToAppointments(email);
    }

    if (action === "deduplicate") {
      const email = data.email ? data.email.toLowerCase().trim() : "";
      const fix = data.fix === true || data.fix === "true";
      return deduplicateUserData(email, fix);
    }

    if (action === "add_expense") {
      return addExpense(data);
    }

    if (action === "delete_expense") {
      return deleteExpense(data.id);
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

// Normalizar valor de completado para almacenarlo como "Sí" / "No"
function normalizeCompletado(val) {
  // Por defecto, si no se especifica, considerar NO completado (seña u otro)
  if (val === undefined || val === null) return "No";
  if (typeof val === 'boolean') return val ? "Sí" : "No";
  const s = val.toString().trim().toLowerCase();
  if (s === "no" || s === "false" || s === "0") return "No";
  if (s === "si" || s === "sí" || s === "yes" || s === "true" || s === "1") return "Sí";
  // Cualquier otro valor ambiguo lo tratamos como No por seguridad
  return "No";
}

// Lógica de Login
function handleLogin(email, password) {
  if (!email || !password) {
    return jsonResponse({ success: false, message: "Email y contraseña son requeridos" });
  }
  
  const ss = getSpreadsheet();
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
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Servicios");
  
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Servicios' no existe" });
  }
  // Asegurar que exista la columna "Vuelto" (columna 11) para registrar cambios
  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.length < 11 || headers[10] !== "Vuelto") {
      sheet.getRange(1, 11).setValue("Vuelto");
    }
  } catch (e) {
    // no crítico
    console.error('Error asegurando encabezado Vuelto en Servicios: ' + e.toString());
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
  const completado = normalizeCompletado(data.completado); // "Sí" o "No"
  const vuelto = data.vuelto !== undefined ? Number(data.vuelto) : 0;
  
  // Prevención de duplicados: buscar un servicio muy similar registrado recientemente
  try {
    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rFecha = r[1] ? new Date(r[1]) : null;
      const rUsuario = r[2] ? r[2].toString().toLowerCase().trim() : "";
      const rCliente = r[3] ? r[3].toString().trim() : "";
      const rServicio = r[4] ? r[4].toString().trim() : "";
      const rPrecio = Number(r[6]) || 0;
      const rCompletado = r[9] ? r[9].toString().trim().toLowerCase() : "no";
      if (!rFecha) continue;
      // Si el registro coincide en usuario, cliente, servicio y precio y fue creado en los últimos 5 minutos, considerarlo duplicado
      const deltaMin = Math.abs(now.getTime() - rFecha.getTime()) / 60000;
      if (rUsuario === usuario && rCliente === cliente && rServicio === servicio && rPrecio === precio && deltaMin <= 5) {
        // Devolver el registro existente para que el cliente no genere duplicado
        return jsonResponse({
          success: true,
          message: "Registro existente detectado (evitando duplicado)",
          service: {
            id: r[0],
            fecha: r[1],
            usuario: r[2],
            cliente: r[3],
            servicio: r[4],
            categoria: r[5],
            precio: r[6],
            seña: r[7],
            metodoPago: r[8],
            completado: r[9],
            vuelto: r[10] !== undefined ? Number(r[10]) : 0
          }
        });
      }
      // Prevención adicional: si el nuevo registro viene como COMPLETADO, evitar crear otro COMPLETADO igual en la hoja
      if ((completado === "sí" || completado === "si") && rUsuario === usuario && rCliente === cliente && rPrecio === precio && (rCompletado === "sí" || rCompletado === "si")) {
        return jsonResponse({
          success: true,
          message: "Ya existe un pago completado similar (evitando duplicado)",
          service: {
            id: r[0],
            fecha: r[1],
            usuario: r[2],
            cliente: r[3],
            servicio: r[4],
            categoria: r[5],
            precio: r[6],
            seña: r[7],
            metodoPago: r[8],
            completado: r[9],
            vuelto: r[10] !== undefined ? Number(r[10]) : 0
          }
        });
      }
    }
  } catch (e) {
    console.error('Error comprobando duplicados en addService: ' + e.toString());
  }

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
    completado,
    vuelto
  ]);
  
  return jsonResponse({
    success: true,
    message: "Servicio registrado correctamente en la nube",
    service: { id, fecha, usuario, cliente, servicio, categoria, precio, seña, metodoPago, completado, vuelto }
  });
}

// Obtener todos los servicios del usuario
function getServices(email) {
  if (!email) {
    return jsonResponse({ success: false, message: "Email requerido para traer servicios" });
  }
  
  const ss = getSpreadsheet();
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
        completado: row[9],
        vuelto: row[10] !== undefined ? Number(row[10]) || 0 : 0
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
  
  const ss = getSpreadsheet();
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

// Editar o actualizar un servicio (ej. cobrar deuda o cambiar campos)
function editService(data) {
  const id = data.id;
  if (!id) {
    return jsonResponse({ success: false, message: "Falta el ID del servicio a editar" });
  }
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Servicios");
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Servicios' no existe" });
  }
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString().trim() === id.toString().trim()) {
      const rowNum = i + 1;
      
      // Si se provee una nueva fecha (ej. el día del cobro de la deuda)
      if (data.fecha) {
        sheet.getRange(rowNum, 2).setValue(data.fecha);
      }
      // Si se provee un nuevo método de pago (ej. cambiar de 'Fiado' a 'Efectivo' o 'Transferencia')
      if (data.metodoPago) {
        sheet.getRange(rowNum, 9).setValue(data.metodoPago);
      }
      // Si se provee un precio (opcional)
      if (data.precio !== undefined) {
        sheet.getRange(rowNum, 7).setValue(Number(data.precio));
      }
      // Si se provee una seña (opcional)
      if (data.seña !== undefined) {
        sheet.getRange(rowNum, 8).setValue(Number(data.seña));
      }
      // Si se provee un vuelto (cambio entregado al cliente)
      if (data.vuelto !== undefined) {
        sheet.getRange(rowNum, 11).setValue(Number(data.vuelto));
      }
      // Si se marca como completado
      if (data.completado !== undefined) {
        sheet.getRange(rowNum, 10).setValue(normalizeCompletado(data.completado));
      }
      
      return jsonResponse({ success: true, message: "Servicio actualizado correctamente en la planilla" });
    }
  }
  return jsonResponse({ success: false, message: "No se encontró el servicio a editar" });
}

// Verificar si el usuario es administrador
function isAdmin(email) {
  if (!email) return false;
  const ss = getSpreadsheet();
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
  const ss = getSpreadsheet();
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
  
  const ss = getSpreadsheet();
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

// Convertir un servicio histórico en un turno para la agenda
function convertServiceToAppointment(row) {
  const id = row[0] ? row[0].toString().trim() : "";
  const fecha = row[1] ? row[1].toString().trim() : "";
  const cliente = row[3] ? row[3].toString().trim() : "Cliente";
  const servicio = row[4] ? row[4].toString().trim() : "Servicio";
  const precio = Number(row[6]) || 0;
  const usuario = row[2] ? row[2].toString().toLowerCase().trim() : "";
  const completado = row[9] ? row[9].toString().trim().toLowerCase() : "";

  const lowerServicio = servicio.toLowerCase();
  if (lowerServicio.includes("seña") || lowerServicio.includes("sena") || lowerServicio.includes("deposito") || lowerServicio.includes("depósito")) {
    return null;
  }
  if (completado === "no") {
    return null;
  }

  const start = new Date(fecha);
  if (isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start.getTime() + 90 * 60000);
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  const fechaStr = `${yyyy}-${mm}-${dd}`;

  return {
    id: `svc_${id}`,
    fecha: fechaStr,
    horaInicio: start.toISOString(),
    horaFin: end.toISOString(),
    cliente: cliente,
    servicio: servicio,
    precio: precio,
    usuario: usuario,
    eventId: "",
    estado: "Completado"
  };
}

// Obtener lista de turnos
function getAppointments(email) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Turnos");
  
  // Si la hoja no existe, la creamos vacía con las cabeceras
  if (!sheet) {
    sheet = ss.insertSheet("Turnos");
    sheet.appendRow(["ID", "Fecha", "HoraInicio", "HoraFin", "Cliente", "Servicio", "Precio", "Usuario", "EventID", "Estado"]);
  }
  
  const rows = sheet.getDataRange().getValues();
  const appointments = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue; // Fila vacía

    const rowEmail = row[7] ? row[7].toString().toLowerCase().trim() : "";
    if (email && rowEmail !== email) continue;

    appointments.push({
      id: row[0],
      fecha: row[1],
      horaInicio: row[2],
      horaFin: row[3],
      cliente: row[4],
      servicio: row[5],
      precio: Number(row[6]) || 0,
      usuario: row[7],
      eventId: row[8],
      estado: row[9] || "Provisional"
    });
  }
  
  // Ordenar por fecha y hora de inicio de más cercano a más lejano
  appointments.sort((a, b) => new Date(a.horaInicio) - new Date(b.horaInicio));
  
  return jsonResponse({ success: true, appointments: appointments });
}

// Agendar un nuevo turno
function addAppointment(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Turnos");
  
  if (!sheet) {
    sheet = ss.insertSheet("Turnos");
    sheet.appendRow(["ID", "Fecha", "HoraInicio", "HoraFin", "Cliente", "Servicio", "Precio", "Usuario", "EventID", "Estado"]);
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
        cliente,
        new Date(horaInicio),
        new Date(horaFin),
        {
          description: "Turno agendado para: " + cliente + "\nServicio: " + servicio + "\nPrecio: $" + precio + "\nRegistrado por: " + usuario
        }
      );
      try {
        event.removeAllReminders();
        event.addPopupReminder(30);
      } catch (remErr) {
        console.error("Error al configurar recordatorio: " + remErr.toString());
      }
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
    eventId,
    data.estado || "Provisional"
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
  
  const ss = getSpreadsheet();
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

// Editar un turno (ej. cambiar estado, precio o eventId)
function editAppointment(data) {
  const id = data.id;
  if (!id) {
    return jsonResponse({ success: false, message: "Falta el ID del turno a editar" });
  }
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Turnos");
  if (!sheet) {
    return jsonResponse({ success: false, message: "La pestaña 'Turnos' no existe" });
  }
  
  const rows = sheet.getDataRange().getValues();
  
  const targetId = id ? id.toString().trim() : "";
  const targetEventId = data.eventId ? data.eventId.toString().trim() : "";
  const targetCliente = data.cliente ? data.cliente.toString().trim().toLowerCase() : "";

  for (let i = 1; i < rows.length; i++) {
    const rowId = rows[i][0] ? rows[i][0].toString().trim() : "";
    const rowEventId = rows[i][8] ? rows[i][8].toString().trim() : "";
    const rowCliente = rows[i][4] ? rows[i][4].toString().trim().toLowerCase() : "";
    const rowFecha = rows[i][1] ? rows[i][1].toString().trim() : "";

    const isMatch = (targetId && rowId === targetId) ||
                    (targetEventId && rowEventId === targetEventId) ||
                    (targetCliente && rowCliente === targetCliente && (!data.fecha || rowFecha === data.fecha));

    if (isMatch) {
      const rowNum = i + 1;
      
      if (data.estado) {
        sheet.getRange(rowNum, 10).setValue(data.estado);
      }
      if (data.precio !== undefined) {
        sheet.getRange(rowNum, 7).setValue(Number(data.precio));
      }
      if (data.servicio) {
        sheet.getRange(rowNum, 6).setValue(data.servicio);
      }
      if (data.fecha) {
        sheet.getRange(rowNum, 2).setValue(data.fecha);
      }
      if (data.horaInicio) {
        sheet.getRange(rowNum, 3).setValue(data.horaInicio);
      }
      if (data.horaFin) {
        sheet.getRange(rowNum, 4).setValue(data.horaFin);
      }
      if (data.eventId) {
        sheet.getRange(rowNum, 9).setValue(data.eventId);
      }
      
      // Actualizar evento en Google Calendar si existe rowEventId
      const rowEventId = rows[i][8];
      if (rowEventId) {
        try {
          const cal = getCalendar();
          if (cal) {
            const event = cal.getEventById(rowEventId);
            if (event) {
              const cliente = rows[i][4];
              const servicio = data.servicio || rows[i][5];
              const precio = data.precio !== undefined ? Number(data.precio) : Number(rows[i][6]);
              const usuario = rows[i][7];
              const estado = data.estado || rows[i][9] || "Provisional";
              
              if (data.horaInicio && data.horaFin) {
                event.setTime(new Date(data.horaInicio), new Date(data.horaFin));
              }
              // Actualizar título y descripción
              event.setTitle(cliente + (estado === "Provisional" ? " (Provisional)" : ""));
              event.setDescription("Turno " + estado + " para: " + cliente + "\nServicio: " + servicio + "\nPrecio: $" + precio + "\nRegistrado por: " + usuario);
            }
          }
        } catch (e) {
          console.error("Error al actualizar evento de Google Calendar: " + e.toString());
        }
      }
      
      return jsonResponse({ success: true, message: "Turno actualizado correctamente" });
    }
  }
  return jsonResponse({ success: false, message: "No se encontró el turno a editar" });
}

// Importar servicios históricos ya cobrados como turnos en el calendario
function importServicesToAppointments(email) {
  const ss = getSpreadsheet();
  let servicesSheet = ss.getSheetByName("Servicios");
  if (!servicesSheet) {
    return jsonResponse({ success: false, message: "No hay registros de servicios cobrados aún" });
  }
  
  let turnosSheet = ss.getSheetByName("Turnos");
  if (!turnosSheet) {
    turnosSheet = ss.insertSheet("Turnos");
    turnosSheet.appendRow(["ID", "Fecha", "HoraInicio", "HoraFin", "Cliente", "Servicio", "Precio", "Usuario", "EventID", "Estado"]);
  }
  
  // Obtener IDs de turnos existentes para evitar duplicados
  const turnosData = turnosSheet.getDataRange().getValues();
  const existingTurnosIds = {};
  for (let i = 1; i < turnosData.length; i++) {
    const rowId = turnosData[i][0] ? turnosData[i][0].toString().trim() : "";
    if (rowId) {
      existingTurnosIds[rowId] = true;
    }
  }
  
  const servicesData = servicesSheet.getDataRange().getValues();
  if (servicesData.length <= 1) {
    return jsonResponse({ success: true, message: "No hay servicios registrados para importar", importedCount: 0 });
  }
  
  const cal = getCalendar();
  let importedCount = 0;
  
  // Procesar filas de Servicios
  for (let i = 1; i < servicesData.length; i++) {
    const row = servicesData[i];
    const id = row[0] ? row[0].toString().trim() : "";
    const rowEmail = row[2] ? row[2].toString().toLowerCase().trim() : "";
    if (!id) continue; // Omitir fila vacía o sin ID
    if (email && rowEmail !== email) continue; // Solo importar los servicios del usuario actual

    const targetId = `svc_${id}`;
    if (existingTurnosIds[targetId] || existingTurnosIds[id]) continue; // Omitir si ya existe el turno importado o un turno con el mismo ID

    const fechaISO = row[1]; // Fecha/hora del servicio cobrado
    const cliente = row[3] ? row[3].toString().trim() : "Cliente";
    const servicio = row[4] ? row[4].toString().trim() : "Servicio";
    const precio = Number(row[6]) || 0;

    const lowerServicio = servicio.toLowerCase();
    const completadoRow = row[9] ? row[9].toString().trim().toLowerCase() : "no";
    if (lowerServicio.includes("seña") || lowerServicio.includes("senia") || lowerServicio.includes("deposito") || lowerServicio.includes("depósito")) {
      continue;
    }
    // Omitir filas que no estén marcadas como completadas
    if (!(completadoRow === "sí" || completadoRow === "si" || completadoRow === "yes" || completadoRow === "true")) {
      continue;
    }

    const start = new Date(fechaISO);
    if (isNaN(start.getTime())) {
      continue;
    }
    const end = new Date(start.getTime() + 90 * 60000);
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    let eventId = "";

    // Crear evento en Google Calendar
    if (cal) {
      try {
        const event = cal.createEvent(
          cliente,
          start,
          end,
          {
            description: "Turno importado de servicio ya cobrado.\nCliente: " + cliente + "\nServicio: " + servicio + "\nPrecio: $" + precio + "\nRegistrado por: " + rowEmail
          }
        );
        try {
          event.removeAllReminders();
          event.addPopupReminder(30);
        } catch (remErr) {
          console.error("Error al configurar recordatorio: " + remErr.toString());
        }
        eventId = event.getId();
      } catch (e) {
        console.error("Error importando evento a Calendar: " + e.toString());
      }
    }
    
    // Escribir en la hoja de Turnos
    // Antes de escribir, verificar si ya existe un turno similar (misma fecha/hora/cliente/servicio/usuario)
    try {
      const trows = turnosSheet.getDataRange().getValues();
      let exists = false;
      for (let j = 1; j < trows.length; j++) {
        const tr = trows[j];
        const trId = tr[0] ? tr[0].toString().trim() : "";
        const trFecha = tr[1] ? tr[1].toString().trim() : "";
        const trHora = tr[2] ? tr[2].toString().trim() : "";
        const trCliente = tr[4] ? tr[4].toString().trim() : "";
        const trServicio = tr[5] ? tr[5].toString().trim() : "";
        const trUsuario = tr[7] ? tr[7].toString().toLowerCase().trim() : "";
        if ((trId === targetId || (trFecha === fechaStr && trHora === start.toISOString() && trCliente === cliente && trServicio === servicio && trUsuario === rowEmail))) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        turnosSheet.appendRow([
          targetId,
          fechaStr,
          start.toISOString(),
          end.toISOString(),
          cliente,
          servicio,
          precio,
          rowEmail,
          eventId,
          "Completado"
        ]);
      }
    } catch (e) {
      // en caso de error, caer en la escritura directa
      turnosSheet.appendRow([
        targetId,
        fechaStr,
        start.toISOString(),
        end.toISOString(),
        cliente,
        servicio,
        precio,
        rowEmail,
        eventId,
        "Completado"
      ]);
    }
    
    importedCount++;
  }
  
  return jsonResponse({
    success: true,
    message: "Se importaron " + importedCount + " turnos cobrados con éxito al calendario",
    importedCount: importedCount
  });
}

// Obtener todos los gastos de la planilla
function getExpenses() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Gastos");
  if (!sheet) {
    return jsonResponse({ success: true, expenses: [] });
  }
  
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) {
    return jsonResponse({ success: true, expenses: [] });
  }
  
  const expenses = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue; // Fila vacía
    // Normalizar la fecha: soportar objetos Date en la hoja o cadenas
    let fechaVal = "";
    if (row[1]) {
      try {
        if (row[1] instanceof Date) {
          fechaVal = Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          const parsed = new Date(row[1].toString().trim());
          if (!isNaN(parsed.getTime())) {
            fechaVal = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          } else {
            fechaVal = row[1].toString().trim();
          }
        }
      } catch (e) {
        fechaVal = row[1].toString().trim();
      }
    }

    expenses.push({
      id: row[0].toString().trim(),
      fecha: fechaVal,
      concepto: row[2] ? row[2].toString().trim() : "",
      monto: Number(row[3]) || 0,
      metodoPago: row[4] ? row[4].toString().trim() : "",
      usuario: row[5] ? row[5].toString().toLowerCase().trim() : "",
      categoria: row[6] ? row[6].toString().trim() : "Otro"
    });
  }
  
  return jsonResponse({ success: true, expenses: expenses });
}

// Deduplicación segura entre Turnos y Servicios para un usuario
// Si fix=true, aplica correcciones (elimina turnos provisionales duplicados y elimina servicios de seña si existe cobro final)
function deduplicateUserData(email, fix) {
  if (!email) {
    return jsonResponse({ success: false, message: "Email requerido para deduplicación" });
  }

  const ss = getSpreadsheet();
  const turnosSheet = ss.getSheetByName("Turnos");
  const servicesSheet = ss.getSheetByName("Servicios");

  const report = {
    turnosChecked: 0,
    turnosDuplicates: [],
    servicesChecked: 0,
    servicesDuplicates: [],
    actions: []
  };

  // Procesar Turnos: buscar claves por fecha|horaInicio|cliente|servicio|usuario
  if (turnosSheet) {
    const rows = turnosSheet.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowEmail = row[7] ? row[7].toString().toLowerCase().trim() : "";
      if (email && rowEmail !== email) continue;
      const fecha = row[1] ? row[1].toString().trim() : "";
      const horaInicio = row[2] ? row[2].toString().trim() : "";
      const cliente = row[4] ? row[4].toString().toLowerCase().trim() : "";
      const servicio = row[5] ? row[5].toString().toLowerCase().trim() : "";
      const usuario = row[7] ? row[7].toString().toLowerCase().trim() : "";
      const key = `${fecha}|${horaInicio}|${cliente}|${servicio}|${usuario}`;
      if (!map[key]) map[key] = [];
      map[key].push({ index: i + 1, id: row[0], estado: row[9] ? row[9].toString().trim() : "Provisional", eventId: row[8] });
    }

    const toDeleteTurnoIndices = [];
    for (const k in map) {
      const group = map[k];
      if (group.length > 1) {
        report.turnosChecked += group.length;
        const hasCompleted = group.some(r => r.estado && r.estado.toString().toLowerCase() === "completado");
        if (hasCompleted) {
          // Marcar los provisionales como duplicados
          const provisionals = group.filter(r => !(r.estado && r.estado.toString().toLowerCase() === "completado"));
          provisionals.forEach(p => {
            report.turnosDuplicates.push(p);
            if (fix) toDeleteTurnoIndices.push(p.index);
          });
        }
      }
    }

    if (fix && toDeleteTurnoIndices.length > 0) {
      // En lugar de eliminar, actualizamos el estado a 'Completado' para mantener el historial en la agenda
      toDeleteTurnoIndices.sort((a, b) => b - a);
      toDeleteTurnoIndices.forEach(rowNum => {
        try {
          const rowRange = turnosSheet.getRange(rowNum, 1, 1, turnosSheet.getLastColumn());
          const row = rowRange.getValues()[0];
          const eventId = row[8];
          // Intentar actualizar evento en Calendar para marcarlo como completado (si es posible)
          if (eventId) {
            try {
              const cal = getCalendar();
              if (cal) {
                const ev = cal.getEventById(eventId);
                if (ev) {
                  try {
                    // Actualizar título/descripción para indicar completado
                    ev.setTitle(row[4] + " (Completado)");
                    ev.setDescription((ev.getDescription() || "") + "\nMarcado como completado por deduplicación.");
                  } catch (e) {
                    // no crítico
                    console.error('Error updating calendar event during dedup: ' + e.toString());
                  }
                }
              }
            } catch (e) {
              console.error('Error accessing calendar during dedup: ' + e.toString());
            }
          }
          // Marcar estado en la hoja
          turnosSheet.getRange(rowNum, 10).setValue('Completado');
          report.actions.push({ type: 'mark_turno_completado', row: rowNum });
        } catch (e) {
          console.error('Error marking turno row ' + rowNum + ' as completed: ' + e.toString());
        }
      });
    }
  }

  // Procesar Servicios: buscar por fecha|cliente|precio|usuario
  if (servicesSheet) {
    const srows = servicesSheet.getDataRange().getValues();
    const smap = {};
    for (let i = 1; i < srows.length; i++) {
      const row = srows[i];
      const rowEmail = row[2] ? row[2].toString().toLowerCase().trim() : "";
      if (email && rowEmail !== email) continue;
      const fecha = row[1] ? row[1].toString().trim() : "";
      const cliente = row[3] ? row[3].toString().toLowerCase().trim() : "";
      const precio = Number(row[6]) || 0;
      const key = `${fecha}|${cliente}|${precio}|${rowEmail}`;
      if (!smap[key]) smap[key] = [];
      smap[key].push({ index: i + 1, id: row[0], completado: row[9] ? row[9].toString().trim() : "No", seña: Number(row[7]) || 0 });
    }

    const toDeleteServiceIndices = [];
    for (const k in smap) {
      const group = smap[k];
      if (group.length > 1) {
        report.servicesChecked += group.length;
        const hasCompleted = group.some(r => r.completado && r.completado.toString().toLowerCase() === "sí" || r.completado.toString().toLowerCase() === "si");
        if (hasCompleted) {
          // eliminar las filas que no están completadas (señas) si ya existe un cobro final
          const toRemove = group.filter(r => !(r.completado && (r.completado.toString().toLowerCase() === "sí" || r.completado.toString().toLowerCase() === "si")));
          toRemove.forEach(r => {
            report.servicesDuplicates.push(r);
            if (fix) toDeleteServiceIndices.push(r.index);
          });
        }
      }
    }

    if (fix && toDeleteServiceIndices.length > 0) {
      toDeleteServiceIndices.sort((a, b) => b - a);
      toDeleteServiceIndices.forEach(rowNum => {
        try {
          servicesSheet.deleteRow(rowNum);
          report.actions.push({ type: 'delete_service', row: rowNum });
        } catch (e) {
          console.error('Error deleting service row ' + rowNum + ': ' + e.toString());
        }
      });
    }
  }

  return jsonResponse({ success: true, report: report });
}

// Registrar un nuevo gasto
function addExpense(data) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("Gastos");
  if (!sheet) {
    sheet = ss.insertSheet("Gastos");
    sheet.appendRow(["ID", "Fecha", "Concepto", "Monto", "MetodoPago", "Usuario", "Categoria"]);
  } else {
    // Si la hoja ya existe, validar si tiene el encabezado de Categoria (columna 7)
    // Esto previene que planillas viejas no tengan la columna Categoria
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.length < 7 || headers[6] !== "Categoria") {
      sheet.getRange(1, 7).setValue("Categoria");
    }
  }
  
  const id = data.id || "exp_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
  // Guardar la fecha como objeto Date para que Sheets la almacene correctamente.
  // Si se provee `data.fecha`, intentar parsearla; si es inválida, usar hoy.
  let fecha;
  if (data.fecha) {
    const parsed = new Date(data.fecha);
    fecha = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    fecha = new Date();
  }
  const concepto = data.concepto || "Varios";
  const monto = Number(data.monto) || 0;
  const metodoPago = data.metodoPago || "Efectivo";
  const usuario = data.usuario ? data.usuario.toLowerCase().trim() : "";
  const categoria = data.categoria || "Otro";
  
  sheet.appendRow([id, fecha, concepto, monto, metodoPago, usuario, categoria]);
  
  return jsonResponse({
    success: true,
    message: "Gasto registrado correctamente en la nube",
    expense: { id, fecha, concepto, monto, metodoPago, usuario, categoria }
  });
}

// Eliminar un gasto
function deleteExpense(id) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Gastos");
  if (!sheet) {
    return jsonResponse({ success: false, message: "No existe la hoja de Gastos" });
  }
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toString().trim() === id.toString().trim()) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true, message: "Gasto eliminado correctamente de la planilla" });
    }
  }
  return jsonResponse({ success: false, message: "No se encontró el gasto especificado" });
}

// Función de diagnóstico para forzar los permisos de Google Calendar
function testCalendarAccess() {
  // Llamada directa sin try-catch para obligar a Apps Script a mostrar el cartel de autorización
  const cal = CalendarApp.getDefaultCalendar();
  Logger.log("Calendario obtenido con éxito: " + cal.getName());
}
