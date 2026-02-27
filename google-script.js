/**
 * ============================================================
 *  GANADERÍA PAMORA — Google Apps Script (code.gs)
 *  Fases 1-5: Backend Completo
 * ============================================================
 *  Instrucciones de instalación:
 *  1. Abre tu Google Sheet principal → Extensiones → Apps Script
 *  2. Borra el contenido de Code.gs y pega todo este código
 *  3. Implementar → Nueva implementación → App web
 *     - Ejecutar como: Tu cuenta
 *     - Acceso: Cualquiera
 *  4. Copia la URL generada y pégala en app.js (APPS_SCRIPT_URL)
 *  5. Cambia el API_TOKEN aquí y en app.js para que coincidan
 * ============================================================
 */

// ─── CONFIGURACIÓN ──────────────────────────────────────────
const CONFIG = {
  // 🔑 Token de seguridad — cámbialo por uno propio
  API_TOKEN: 'pamora_secreto_2026',

  // Nombre del spreadsheet externo de eventos (debe ser Google Sheet, no .xlsx)
  SPREADSHEET_EVENTOS: 'Registro de animales e inseminaciones',

  // Nombres de hojas
  PRODUCCION_PREFIX: 'Leche diaria',
  HOJA_INSEMINACIONES: 'Registro de Inseminaciones',
  HOJA_NACIMIENTOS: 'Registro de Nacimientos',
  HOJA_CELOS: 'Registro de Celos',
  HOJA_ANALISIS: 'Análisis Dinámico',
  HOJA_COSTOS: 'Costos',
  HOJA_GASTOS: 'Gastos',
  HOJA_CONFIG: 'Configuración',
  HOJA_PARAMETROS: 'Parámetros Mensuales',

  // Animales del hato (orden por defecto si la configuración está vacía)
  ANIMALES: ['Yohana', 'Dulce', 'Nube', 'Morocha', 'Moli', 'Mapi', 'Sol', 'Martina'],

  // Meses en español
  MESES: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ],

  // Precio de venta por litro (ajustar según mercado)
  PRECIO_VENTA_LITRO: 2500
};


// ─── SEGURIDAD ──────────────────────────────────────────────

/**
 * Valida el token de autorización.
 * @param {string} token - Token recibido en el request
 * @returns {boolean}
 */
function validarToken(token) {
  return token === CONFIG.API_TOKEN;
}


// ─── ENDPOINT POST (ESCRITURA) ──────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Verificar token
    if (!validarToken(data.token)) {
      return jsonResponse(false, null, 'Token inválido. Acceso denegado.');
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    let result;

    switch (data.tipo) {
      case 'produccion':
        result = escribirProduccion(data);
        break;
      case 'inseminacion':
        result = escribirInseminacion(data);
        break;
      case 'nacimiento':
        result = escribirNacimiento(data);
        break;
      case 'celo':
        result = escribirCelo(data);
        break;
      case 'gasto':
        result = escribirGasto(data);
        break;
      case 'configuracion':
        result = escribirConfig(data);
        break;
      case 'parametros_rentabilidad':
        result = escribirParametrosRentabilidad(data);
        break;
      default:
        throw new Error('Tipo de registro no reconocido: ' + data.tipo);
    }

    lock.releaseLock();
    return jsonResponse(true, result, null);

  } catch (error) {
    return jsonResponse(false, null, error.message);
  }
}


// ─── ENDPOINT GET (LECTURA) ─────────────────────────────────

function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const token = params.token || '';

    // Verificar token
    if (!validarToken(token)) {
      return jsonResponse(false, null, 'Token inválido. Acceso denegado.');
    }

    const accion = params.accion || 'dashboard';
    let data;

    switch (accion) {
      case 'dashboard':
        data = leerAnalisisDinamico();
        break;
      case 'produccion_mes':
        data = leerProduccionMes(params.mes, params.anio);
        break;
      case 'inseminaciones':
        data = leerInseminaciones();
        break;
      case 'nacimientos':
        data = leerNacimientos();
        break;
      case 'celos':
        data = leerCelos();
        break;
      case 'config':
        data = leerConfig();
        break;
      case 'costos_mes':
        data = leerCostosMes(params.mes, params.anio);
        break;
      case 'rentabilidad':
        data = calcularRentabilidad(params.mes, params.anio);
        break;
      default:
        data = leerAnalisisDinamico();
    }

    return jsonResponse(true, data, null);

  } catch (error) {
    return jsonResponse(false, null, error.message);
  }
}


// ─── FUNCIONES DE ESCRITURA ─────────────────────────────────

/**
 * Escribe un registro de producción de leche.
 * Coloca dinámicamente las columnas si se agregan animales nuevos.
 *
 * @param {Object} data - { fecha, horario, litros: {...}, notas, animalesActivos: [...] }
 */
function escribirProduccion(data) {
  const fecha = new Date(data.fecha);
  const nombreHoja = getSheetNameProduccion(fecha);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nombreHoja);

  const animalesActivos = Array.isArray(data.animalesActivos) && data.animalesActivos.length > 0
    ? data.animalesActivos
    : CONFIG.ANIMALES;

  if (!sheet) {
    sheet = crearHojaProduccionDinamica(ss, nombreHoja, animalesActivos);
  }

  // Leer cabeceras actuales para alinear y detectar nuevos animales
  let cabeceras = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let animalesEnHoja = cabeceras.slice(2, cabeceras.length - 2); // Excluir Fecha, Horario, Total, Notas

  let actualizados = false;
  animalesActivos.forEach(a => {
    if (!animalesEnHoja.includes(a)) {
      sheet.insertColumnBefore(sheet.getLastColumn() - 1); // Insertar justo antes de 'Total'
      animalesEnHoja.push(a);
      actualizados = true;
    }
  });

  if (actualizados) {
    cabeceras = ['Fecha', 'Horario', ...animalesEnHoja, 'Total', 'Notas'];
    sheet.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    formatHeader(sheet, cabeceras.length);
  }

  const litros = data.litros || {};
  let total = 0;

  const fila = [fecha, data.horario || 'AM'];

  // Alinear valores exactos según las columnas de la hoja
  animalesEnHoja.forEach(animal => {
    const valor = parseFloat(litros[animal]) || 0;
    fila.push(valor);
    total += valor;
  });

  fila.push(total);
  fila.push(data.notas || '');

  sheet.appendRow(fila);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy');

  return { mensaje: 'Producción registrada en "' + nombreHoja + '" — Total: ' + total + ' litros' };
}

/**
 * Escribe un registro de inseminación en el spreadsheet externo.
 * @param {Object} data - { fecha, animal, toro, tecnico, observaciones, estado }
 */
function escribirInseminacion(data) {
  const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
  let sheet = ss.getSheetByName(CONFIG.HOJA_INSEMINACIONES);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_INSEMINACIONES);
    sheet.appendRow(['Fecha', 'Animal', 'Toro / Pajilla', 'Técnico', 'Observaciones', 'Estado']);
    formatHeader(sheet, 6);
  }

  const fila = [
    new Date(data.fecha),
    data.animal || '',
    data.toro || '',
    data.tecnico || '',
    data.observaciones || '',
    data.estado || 'Pendiente'
  ];

  sheet.appendRow(fila);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy');

  // También escribir en el sheet local si existe
  try {
    const ssLocal = SpreadsheetApp.getActiveSpreadsheet();
    let sheetLocal = ssLocal.getSheetByName(CONFIG.HOJA_INSEMINACIONES);
    if (sheetLocal) {
      sheetLocal.appendRow(fila);
      const lr = sheetLocal.getLastRow();
      sheetLocal.getRange(lr, 1).setNumberFormat('dd/MM/yyyy');
    }
  } catch (e) { /* ignore if local sheet doesn't exist */ }

  return { mensaje: 'Inseminación de ' + data.animal + ' registrada correctamente' };
}

/**
 * Escribe un registro de nacimiento en el spreadsheet externo.
 * @param {Object} data - { fecha, madre, cria, sexo, peso, observaciones }
 */
function escribirNacimiento(data) {
  const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
  let sheet = ss.getSheetByName(CONFIG.HOJA_NACIMIENTOS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_NACIMIENTOS);
    sheet.appendRow(['Fecha', 'Madre', 'Nombre Cría', 'Sexo', 'Peso (kg)', 'Observaciones']);
    formatHeader(sheet, 6);
  }

  const fila = [
    new Date(data.fecha),
    data.madre || '',
    data.cria || '',
    data.sexo || '',
    parseFloat(data.peso) || 0,
    data.observaciones || ''
  ];

  sheet.appendRow(fila);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy');

  return { mensaje: 'Nacimiento de ' + data.cria + ' (madre: ' + data.madre + ') registrado' };
}

/**
 * Escribe un registro de celo en el spreadsheet externo.
 * @param {Object} data - { fecha, animal, intensidad, duracion, accionItem, observaciones }
 */
function escribirCelo(data) {
  const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
  let sheet = ss.getSheetByName(CONFIG.HOJA_CELOS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_CELOS);
    sheet.appendRow(['Fecha', 'Animal', 'Intensidad', 'Duración (h)', 'Acción', 'Observaciones']);
    formatHeader(sheet, 6);
  }

  const fila = [
    new Date(data.fecha),
    data.animal || '',
    data.intensidad || '',
    data.duracion || '',
    data.accionItem || '',
    data.observaciones || ''
  ];

  sheet.appendRow(fila);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy');

  return { mensaje: 'Celo de ' + data.animal + ' detectado y registrado' };
}

/**
 * Escribe un registro de gasto.
 * @param {Object} data - { fecha, categoria, descripcion, monto }
 */
function escribirGasto(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.HOJA_COSTOS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_COSTOS);
    sheet.appendRow(['Fecha', 'Categoría', 'Concepto', 'Monto', 'Período']);
    formatHeader(sheet, 5);
  }

  const fecha = new Date(data.fecha);
  const periodo = CONFIG.MESES[fecha.getMonth()] + ' ' + fecha.getFullYear();

  const fila = [
    fecha,
    data.categoria || '',
    data.descripcion || '',
    parseFloat(data.monto) || 0,
    periodo
  ];

  sheet.appendRow(fila);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(lastRow, 4).setNumberFormat('$#,##0');

  return { mensaje: 'Gasto de $' + data.monto + ' registrado en "' + data.categoria + '"' };
}

/**
 * Guarda los parámetros de rentabilidad para un mes específico.
 */
function escribirParametrosRentabilidad(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.HOJA_PARAMETROS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_PARAMETROS);
    sheet.appendRow(['Periodo', 'Precio Leche', 'Precio Concentrado', 'Consumo (JSON)']);
    formatHeader(sheet, 1);
  }

  const periodo = data.mes + ' ' + data.anio;
  const precioVenta = parseFloat(data.precioVenta) || CONFIG.PRECIO_VENTA_LITRO;
  const precioConcentrado = parseFloat(data.precioKgConcentrado) || 1800;
  const consumoJson = JSON.stringify(data.concentradoPerAnimal || {});

  const datos = sheet.getDataRange().getValues();
  let filaExistente = -1;
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === periodo) {
      filaExistente = i + 1;
      break;
    }
  }

  const valores = [periodo, precioVenta, precioConcentrado, consumoJson];
  if (filaExistente > -1) {
    sheet.getRange(filaExistente, 1, 1, 4).setValues([valores]);
  } else {
    sheet.appendRow(valores);
  }

  return { mensaje: 'Parámetros guardados para ' + periodo };
}

/**
 * Escribe y guarda la configuración de animales del hato.
 */
function escribirConfig(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.HOJA_CONFIG);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.HOJA_CONFIG);
  }

  sheet.clear();
  sheet.appendRow(['Animales Activos']);
  formatHeader(sheet, 1);

  const animales = data.animales || [];
  animales.forEach(a => sheet.appendRow([a]));

  return { mensaje: 'Configuración de hato guardada. ' + animales.length + ' animales activos.' };
}

// ─── FUNCIONES DE LECTURA ───────────────────────────────────

/**
 * Lee los datos consolidados de "Análisis Dinámico".
 */
function leerAnalisisDinamico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.HOJA_ANALISIS);

  if (!sheet) return { mensaje: 'Hoja "Análisis Dinámico" no encontrada', filas: [] };

  const datos = sheet.getDataRange().getValues();
  if (datos.length < 2) return { mensaje: 'Sin datos', filas: [] };

  const cabeceras = datos[0];
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    const obj = {};
    cabeceras.forEach((cab, j) => { obj[cab] = datos[i][j]; });
    filas.push(obj);
  }

  return { cabeceras: cabeceras, filas: filas };
}

/**
 * Lee los parámetros históricos de un mes.
 */
function leerParametrosMensuales(mes, anio) {
  const ahora = new Date();
  const mesNum = mes !== undefined ? parseInt(mes) : ahora.getMonth();
  const anioNum = anio ? parseInt(anio) : ahora.getFullYear();
  const nombreMes = CONFIG.MESES[mesNum];
  const periodo = nombreMes + ' ' + anioNum;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.HOJA_PARAMETROS);
  if (!sheet) return null;

  const datos = sheet.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === periodo) {
      try {
        return {
          precioVentaLitro: parseFloat(datos[i][1]),
          precioKgConcentrado: parseFloat(datos[i][2]),
          concentradoPerAnimal: JSON.parse(datos[i][3])
        };
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

/**
 * Lee la producción del mes indicado (incluye horario y notas).
 */
function leerProduccionMes(mes, anio) {
  const ahora = new Date();
  const mesNum = mes !== undefined ? parseInt(mes) : ahora.getMonth();
  const anioNum = anio ? parseInt(anio) : ahora.getFullYear();

  const nombreMes = CONFIG.MESES[mesNum];
  const nombreHoja = CONFIG.PRODUCCION_PREFIX + ' ' + nombreMes + ' ' + anioNum;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(nombreHoja);

  if (!sheet) {
    return {
      mensaje: 'Hoja "' + nombreHoja + '" no encontrada',
      filas: [],
      animales: CONFIG.ANIMALES,
      mes: nombreMes,
      anio: anioNum
    };
  }

  const cabeceras = datos[0];
  const animalesHoja = cabeceras.length > 4 ? cabeceras.slice(2, cabeceras.length - 2) : CONFIG.ANIMALES;
  const filas = [];

  for (let i = 1; i < datos.length; i++) {
    const fila = {
      fecha: datos[i][0],
      horario: datos[i][1],
      litros: {}
    };
    animalesHoja.forEach((animal, j) => {
      fila.litros[animal] = datos[i][j + 2] || 0;
    });
    fila.total = datos[i][animalesHoja.length + 2] || 0;
    fila.notas = datos[i][animalesHoja.length + 3] || '';
    filas.push(fila);
  }

  return { mes: nombreMes, anio: anioNum, animales: animalesHoja, filas: filas };
}

/**
 * Lee todos los registros de inseminación del spreadsheet externo.
 */
function leerInseminaciones() {
  try {
    const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
    const sheet = ss.getSheetByName(CONFIG.HOJA_INSEMINACIONES);
    if (!sheet) return { filas: [] };

    const datos = sheet.getDataRange().getValues();
    const filas = [];
    for (let i = 1; i < datos.length; i++) {
      filas.push({
        fecha: datos[i][0],
        animal: datos[i][1],
        toro: datos[i][2],
        tecnico: datos[i][3],
        observaciones: datos[i][4],
        estado: datos[i][5]
      });
    }
    return { filas: filas };
  } catch (e) {
    // Fallback: try local sheet
    return leerInseminacionesLocal();
  }
}

function leerInseminacionesLocal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.HOJA_INSEMINACIONES);
  if (!sheet) return { filas: [] };

  const datos = sheet.getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < datos.length; i++) {
    filas.push({
      fecha: datos[i][0], animal: datos[i][1], toro: datos[i][2],
      tecnico: datos[i][3], observaciones: datos[i][4], estado: datos[i][5]
    });
  }
  return { filas: filas };
}

/**
 * Lee todos los registros de nacimientos.
 */
function leerNacimientos() {
  try {
    const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
    const sheet = ss.getSheetByName(CONFIG.HOJA_NACIMIENTOS);
    if (!sheet) return { filas: [] };

    const datos = sheet.getDataRange().getValues();
    const filas = [];
    for (let i = 1; i < datos.length; i++) {
      filas.push({
        fecha: datos[i][0], madre: datos[i][1], cria: datos[i][2],
        sexo: datos[i][3], peso: datos[i][4], observaciones: datos[i][5]
      });
    }
    return { filas: filas };
  } catch (e) {
    return { filas: [], error: e.message };
  }
}

/**
 * Lee todos los registros de celo.
 */
function leerCelos() {
  try {
    const ss = getExternalSpreadsheet(CONFIG.SPREADSHEET_EVENTOS);
    const sheet = ss.getSheetByName(CONFIG.HOJA_CELOS);
    if (!sheet) return { filas: [] };

    const datos = sheet.getDataRange().getValues();
    const filas = [];
    for (let i = 1; i < datos.length; i++) {
      filas.push({
        fecha: datos[i][0], animal: datos[i][1], intensidad: datos[i][2],
        duracion: datos[i][3], accionItem: datos[i][4], observaciones: datos[i][5]
      });
    }
    return { filas: filas };
  } catch (e) {
    return { filas: [], error: e.message };
  }
}

/**
 * Lee la tabla de Configuración. Retorna animales activos.
 */
function leerConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.HOJA_CONFIG);
  if (!sheet) return { animales: CONFIG.ANIMALES };

  const datos = sheet.getDataRange().getValues();
  if (datos.length < 2) return { animales: CONFIG.ANIMALES };

  const animales = [];
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0]) animales.push(String(datos[i][0]).trim());
  }
  return { animales: animales.length > 0 ? animales : CONFIG.ANIMALES };
}

/**
 * Lee los costos/gastos del mes indicado.
 */
function leerCostosMes(mes, anio) {
  const ahora = new Date();
  const mesNum = mes !== undefined ? parseInt(mes) : ahora.getMonth();
  const anioNum = anio ? parseInt(anio) : ahora.getFullYear();
  const periodo = CONFIG.MESES[mesNum] + ' ' + anioNum;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.HOJA_COSTOS);

  if (!sheet) return { periodo: periodo, filas: [], totalGastos: 0, porCategoria: {} };

  const datos = sheet.getDataRange().getValues();
  const filas = [];
  let totalGastos = 0;
  const porCategoria = {};

  for (let i = 1; i < datos.length; i++) {
    if (datos[i][4] === periodo) {
      const monto = parseFloat(datos[i][3]) || 0;
      const cat = datos[i][1] || 'Otro';
      filas.push({
        fecha: datos[i][0], categoria: cat,
        concepto: datos[i][2], monto: monto
      });
      totalGastos += monto;
      porCategoria[cat] = (porCategoria[cat] || 0) + monto;
    }
  }

  return { periodo: periodo, filas: filas, totalGastos: totalGastos, porCategoria: porCategoria };
}

/**
 * Calcula la rentabilidad cruzando producción con gastos.
 */
function calcularRentabilidad(mes, anio) {
  const produccion = leerProduccionMes(mes, anio);
  const costos = leerCostosMes(mes, anio);

  // Total litros del mes
  let totalLitros = 0;
  if (produccion.filas) {
    produccion.filas.forEach(f => { totalLitros += f.total || 0; });
  }

  // Ingresos estimados
  const ingresos = totalLitros * CONFIG.PRECIO_VENTA_LITRO;
  const totalGastos = costos.totalGastos || 0;
  const gananciaNetaMes = ingresos - totalGastos;
  const margenRentabilidad = ingresos > 0 ? ((gananciaNetaMes / ingresos) * 100) : 0;

  // Costo por litro
  const costoPorLitro = totalLitros > 0 ? (totalGastos / totalLitros) : 0;
  const costoConcentrado = costos.porCategoria['Concentrado'] || 0;
  const costoConcentradoPorLitro = totalLitros > 0 ? (costoConcentrado / totalLitros) : 0;

  // Producción por animal (promedio diario)
  const produccionPorAnimal = {};
  const dias = produccion.filas ? produccion.filas.length : 0;
  const animalesDelMes = produccion.animales || CONFIG.ANIMALES;

  animalesDelMes.forEach(animal => {
    let totalAnimal = 0;
    if (produccion.filas) {
      produccion.filas.forEach(f => { totalAnimal += (f.litros && f.litros[animal]) || 0; });
    }
    produccionPorAnimal[animal] = {
      total: +totalAnimal.toFixed(1),
      promedioDiario: dias > 0 ? +(totalAnimal / dias).toFixed(1) : 0
    };
  });

  const parametrosHistoricos = leerParametrosMensuales(mes, anio);

  return {
    periodo: produccion.mes + ' ' + produccion.anio,
    parametrosHistoricos: parametrosHistoricos,
    totalLitros: +totalLitros.toFixed(1),
    precioVentaLitro: CONFIG.PRECIO_VENTA_LITRO,
    ingresos: +ingresos.toFixed(0),
    totalGastos: +totalGastos.toFixed(0),
    gananciaNetaMes: +gananciaNetaMes.toFixed(0),
    margenRentabilidad: +margenRentabilidad.toFixed(1),
    costoPorLitro: +costoPorLitro.toFixed(0),
    costoConcentradoPorLitro: +costoConcentradoPorLitro.toFixed(0),
    porCategoria: costos.porCategoria,
    produccionPorAnimal: produccionPorAnimal,
    diasRegistrados: dias
  };
}


// ─── HELPERS ────────────────────────────────────────────────

/**
 * Genera nombre de hoja de producción: "Leche diaria Febrero 2026"
 */
function getSheetNameProduccion(fecha) {
  return CONFIG.PRODUCCION_PREFIX + ' ' + CONFIG.MESES[fecha.getMonth()] + ' ' + fecha.getFullYear();
}

/**
 * Crea hoja de producción con cabeceras formateadas y dinámicas.
 * Columnas: Fecha | Horario | [Animales] | Total | Notas
 */
function crearHojaProduccionDinamica(ss, nombre, animales) {
  const sheet = ss.insertSheet(nombre);
  const cabeceras = ['Fecha', 'Horario', ...animales, 'Total', 'Notas'];
  sheet.appendRow(cabeceras);
  formatHeader(sheet, cabeceras.length);

  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 80);
  for (let i = 3; i <= animales.length + 2; i++) sheet.setColumnWidth(i, 85);
  sheet.setColumnWidth(animales.length + 3, 80);
  sheet.setColumnWidth(animales.length + 4, 150);

  return sheet;
}

/**
 * Busca un spreadsheet externo en Drive por nombre.
 */
function getExternalSpreadsheet(nombre) {
  const files = DriveApp.getFilesByName(nombre);
  if (!files.hasNext()) {
    throw new Error('No se encontró el archivo "' + nombre + '" en Drive. Asegúrate de que exista como Google Sheet.');
  }
  const file = files.next();
  return SpreadsheetApp.open(file);
}

/**
 * Formatea la cabecera de una hoja.
 */
function formatHeader(sheet, numCols) {
  const rango = sheet.getRange(1, 1, 1, numCols);
  rango.setFontWeight('bold');
  rango.setBackground('#2d5016');
  rango.setFontColor('#ffffff');
  rango.setHorizontalAlignment('center');
}

/**
 * Helper para respuestas JSON consistentes.
 */
function jsonResponse(success, data, error) {
  const payload = { success: success };
  if (data) payload.data = data;
  if (error) payload.error = error;

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
