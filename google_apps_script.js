/**
 * PaMora Leche - Backend Script for Google Apps Script
 * 
 * Instructions:
 * 1. Open Google Sheets.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any existing code and paste this script.
 * 4. Replace the SERVICE_TOKEN with yours.
 * 5. Click "Deploy" > "New Deployment".
 * 6. Select Type: "Web App".
 * 7. Set "Execute as": Me.
 * 8. Set "Who has access": Anyone.
 * 9. Copy the Web App URL and paste it into app.js.
 */

const SERVICE_TOKEN = 'pamora_secreto_2026';
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        if (data.token !== SERVICE_TOKEN) throw new Error('Unauthorized');

        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheetName = '';
        let rowData = [];

        switch (data.tipo) {
            case 'produccion':
                sheetName = 'Produccion';
                processProduccion(ss, data);
                break;
            case 'celo':
                sheetName = 'Eventos';
                appendRow(ss, sheetName, [data.fecha, 'Celo', data.animal, '', '', data.observaciones]);
                break;
            case 'inseminacion':
                sheetName = 'Eventos';
                appendRow(ss, sheetName, [data.fecha, 'Inseminacion', data.animal, data.toro, data.estado, data.observaciones]);
                break;
            case 'nacimiento':
                sheetName = 'Eventos';
                appendRow(ss, sheetName, [data.fecha, 'Nacimiento', data.madre, data.cria, data.sexo, data.observaciones]);
                break;
            case 'otro':
                sheetName = 'Eventos';
                appendRow(ss, sheetName, [data.fecha, 'Otro: ' + data.descripcion, data.animal || '', '', '', data.observaciones]);
                break;
            case 'gasto':
                sheetName = 'Gastos';
                appendRow(ss, sheetName, [data.fecha, data.categoria, data.descripcion, data.monto]);
                break;
            case 'configuracion':
                saveConfig(ss, data.animales);
                break;
            case 'parametros_rentabilidad':
                saveRentabilidadParams(ss, data);
                break;
        }

        return ContentService.createTextOutput(JSON.stringify({ success: true, data: { mensaje: 'Datos guardados' } })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    try {
        const accion = e.parameter.accion;
        const token = e.parameter.token;
        if (token !== SERVICE_TOKEN) throw new Error('Unauthorized');

        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let result = {};

        switch (accion) {
            case 'config':
                result = { animales: getConfig(ss) };
                break;
            // Add more getters for charts and rentability
        }

        return ContentService.createTextOutput(JSON.stringify({ success: true, data: result })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
}

function appendRow(ss, sheetName, row) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    sheet.appendRow(row);
}

function processProduccion(ss, data) {
    const sheetName = 'Produccion';
    const animales = Object.keys(data.litros);
    animales.forEach(animal => {
        appendRow(ss, sheetName, [data.fecha, data.horario, animal, data.litros[animal], data.notas]);
    });
}

function saveConfig(ss, animales) {
    let sheet = ss.getSheetByName('Config');
    if (!sheet) sheet = ss.insertSheet('Config');
    sheet.clear();
    sheet.appendRow(['Animales']);
    animales.forEach(a => sheet.appendRow([a]));
}

function getConfig(ss) {
    const sheet = ss.getSheetByName('Config');
    if (!sheet) return ['Yohana', 'Dulce', 'Nube', 'Morocha', 'Moli', 'Mapi', 'Sol', 'Martina'];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).map(r => r[0]);
}

function saveRentabilidadParams(ss, data) {
    let sheet = ss.getSheetByName('RentabilidadParams');
    if (!sheet) sheet = ss.insertSheet('RentabilidadParams');
    sheet.appendRow([data.mes, data.anio, data.precioVenta, data.precioKgConcentrado, JSON.stringify(data.concentradoPerAnimal)]);
}
