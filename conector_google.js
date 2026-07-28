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
    
    if (rowEmail === email && rowPassword === password) {
      // Login exitoso, generamos un token simple
      const token = Utilities.base64Encode(email + ":" + new Date().getTime());
      return jsonResponse({
        success: true,
        message: "Login correcto",
        user: {
          email: email,
          nombre: rowNombre,
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
