/**
 * ============================================================
 *  GANADERÍA PAMORA — App Logic (Fases 1-5)
 * ============================================================
 *  Auth, forms (ordeño, eventos, gastos), charts, dashboard,
 *  API communication, and demo mode.
 * ============================================================
 */

// ─── CONFIGURATION ──────────────────────────────────────────
// ⚠️  REEMPLAZA estos valores con los tuyos:

const APPS_SCRIPT_URL = 'TU_URL_DE_APPS_SCRIPT_AQUI';
const API_TOKEN = 'pamora_secreto_2026';

// Credenciales locales (reemplazar por Firebase luego)
const LOCAL_CREDENTIALS = {
    usuario: 'admin',
    password: 'pamora2026'
};

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDVp5Vph7Li9QsOz4pGc6kFiXASDwC-6vM",
    authDomain: "pamoraleche.firebaseapp.com",
    projectId: "pamoraleche",
    storageBucket: "pamoraleche.firebasestorage.app",
    messagingSenderId: "526179598333",
    appId: "1:526179598333:web:2c46187cd0243f2dbfe394",
    measurementId: "G-4ZH0SRTS5D"
};


// ─── ANIMALES DEL HATO ──────────────────────────────────────
let ANIMALES = ['Yohana', 'Dulce', 'Nube', 'Morocha', 'Moli', 'Mapi', 'Sol', 'Martina'];

const ANIMAL_EMOJIS = {
    'Yohana': '🐄', 'Dulce': '🐮', 'Nube': '☁️', 'Morocha': '🟤',
    'Moli': '🌸', 'Mapi': '🍀', 'Sol': '☀️', 'Martina': '⭐'
};

function getAnimalEmoji(name) {
    return ANIMAL_EMOJIS[name] || '🐄';
}


// ─── INITIALIZATION ─────────────────────────────────────────
let db = null;
let auth = null;
let currentUser = null;
let isDemo = false;

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initNavigation();
    initDateDefaults();
});

function initFirebase() {
    const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'TU_API_KEY';
    if (isConfigured) {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        auth = firebase.auth();
        console.log('🔥 Firebase Auth + Firestore initialized');

        // Listen for auth state changes — this is the main entry point
        auth.onAuthStateChanged(user => {
            if (user) {
                // Logged in via Firebase
                bootApp(user.email);
            } else {
                // Demo mode if no backend configured
                if (!db) {
                    isDemo = true;
                    bootApp('Demo');
                } else {
                    showLogin();
                }
            }
        });
    } else {
        // No Firebase config — run in demo mode
        isDemo = true;
        bootApp('Demo');
    }
}


// ─── AUTH ───────────────────────────────────────────────────

async function bootApp(userName) {
    currentUser = { name: userName };
    showApp(userName);

    try {
        const hato = await fetchFromSheets('config');
        if (hato && hato.animales) ANIMALES = hato.animales;
    } catch (e) { console.warn('Could not load config', e) }

    buildAnimalInputs('ordeno-animal-grid', 'ordeno');
    buildAnimalSelectors();
    renderConfigAnimales();
    loadDashboardStats();
    updateNotificationBadge();
    loadNotificationsFromFirebase();
    checkPartoAlerts();
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.style.display = 'none';
    if (!email || !pass) {
        errorEl.textContent = 'Completa todos los campos';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando...';

    if (auth) {
        // Firebase Authentication
        auth.signInWithEmailAndPassword(email, pass)
            .then(() => { showToast('¡Bienvenido!', 'success'); })
            .catch(err => {
                const messages = {
                    'auth/user-not-found': 'Usuario no encontrado',
                    'auth/wrong-password': 'Contraseña incorrecta',
                    'auth/invalid-email': 'Correo inválido',
                    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.'
                };
                errorEl.textContent = messages[err.code] || 'Error de autenticación';
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = '🔓 Ingresar';
            });
    } else {
        // Demo mode fallback
        setTimeout(() => {
            if (email === LOCAL_CREDENTIALS.usuario && pass === LOCAL_CREDENTIALS.password) {
                bootApp(email);
                showToast('¡Bienvenido (modo demo)!', 'success');
            } else {
                errorEl.textContent = 'Usuario o contraseña incorrectos';
                errorEl.style.display = 'block';
            }
            btn.disabled = false;
            btn.innerHTML = '🔓 Ingresar';
        }, 600);
    }
}

function handleLogout() {
    if (auth) {
        auth.signOut().then(() => showToast('Sesión cerrada', 'info'));
    } else {
        currentUser = null;
        showLogin();
        showToast('Sesión cerrada', 'info');
    }
}


// ─── VIEW SWITCHING ─────────────────────────────────────────

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-layout').classList.remove('active');
}

function showApp(userName) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-layout').classList.add('active');
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = userName || '';
    if (isDemo) showToast('Modo demo — datos de ejemplo', 'info');
}


// ─── NAVIGATION ─────────────────────────────────────────────

function initNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${tabId}`);
    if (panel) panel.classList.add('active');

    // Load data for specific tabs
    if (tabId === 'inicio') loadDashboardStats();
    if (tabId === 'rentabilidad') loadRentabilidad();
    if (tabId === 'historial') loadHistorial();
    if (tabId === 'config') renderConfigAnimales();
    if (tabId === 'gestacion') loadDashboardStats(); // Reusa stats fetch para no duplicar llamadas
    if (tabId === 'costos') updateCostoPorLitro();
}


// ─── DATE DEFAULTS ──────────────────────────────────────────

function initDateDefaults() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    ['ordeno-fecha', 'evento-fecha', 'gasto-fecha'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = dateStr;
    });

    const mesSelect = document.getElementById('rentabilidad-mes');
    const anioSelect = document.getElementById('rentabilidad-anio');
    if (mesSelect) mesSelect.value = today.getMonth().toString();

    // Populate years dynamically from 2024 to current+1
    if (anioSelect) {
        const currentYear = today.getFullYear();
        anioSelect.innerHTML = '';
        for (let y = 2024; y <= currentYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            anioSelect.appendChild(opt);
        }
    }
}


// ─── BUILD ANIMAL INPUTS ────────────────────────────────────

function buildAnimalInputs(gridId, prefix) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = ANIMALES.map(animal => `
    <div class="animal-input-group">
      <label>${getAnimalEmoji(animal)} ${animal}</label>
      <input type="number" id="${prefix}-litros-${animal}" min="0" step="0.1" placeholder="0"
             data-animal="${animal}" class="${prefix}-litros-input"
             oninput="updateTotal('${prefix}')">
      <label class="sin-ordeno-check">
        <input type="checkbox" data-animal="${animal}" class="${prefix}-sin-ordeno"
               onchange="toggleSinOrdeno(this, '${prefix}')"> Sin ordeño
      </label>
    </div>
  `).join('');
}

function toggleSinOrdeno(checkbox, prefix) {
    const animal = checkbox.dataset.animal;
    const input = document.getElementById(`${prefix}-litros-${animal}`);
    if (checkbox.checked) {
        input.value = '0';
        input.disabled = true;
    } else {
        input.disabled = false;
        input.value = '';
    }
    updateTotal(prefix);
}

function updateTotal(prefix) {
    const inputs = document.querySelectorAll(`.${prefix}-litros-input`);
    let total = 0;
    inputs.forEach(input => { total += parseFloat(input.value) || 0; });
    const totalEl = document.getElementById(`${prefix}-total`);
    if (totalEl) totalEl.textContent = total.toFixed(1);
}

function buildAnimalSelectors() {
    ['insem-animal', 'nac-madre', 'celo-animal'].forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">— Seleccionar —</option>';
        ANIMALES.forEach(animal => {
            const opt = document.createElement('option');
            opt.value = animal;
            opt.textContent = `${getAnimalEmoji(animal)} ${animal}`;
            select.appendChild(opt);
        });
    });
}


// ─── HORARIO TOGGLE ─────────────────────────────────────────

function setHorario(btn) {
    document.querySelectorAll('.horario-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ordeno-horario').value = btn.dataset.horario;
}


// ─── NOTIFICATIONS ──────────────────────────────────────────
let notifications = JSON.parse(localStorage.getItem('pamora_notifications') || '[]');

function toggleNotifications() {
    const dropdown = document.getElementById('notification-dropdown');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
        renderNotifications();
    }
}

async function addNotification(text, type = 'info') {
    const fresh = {
        id: Date.now(),
        text,
        type,
        time: new Date().toLocaleString(),
        seen: false
    };
    notifications.unshift(fresh);
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();

    // Sync to Firebase
    if (db && currentUser) {
        try {
            await db.collection('notificaciones').add({
                ...fresh,
                userId: currentUser.name,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.warn('Error saving notification', e); }
    }
}

async function loadNotificationsFromFirebase() {
    if (!db) return;
    try {
        const snapshot = await db.collection('notificaciones')
            .where('seen', '==', false)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const fbNotifications = [];
        snapshot.forEach(doc => fbNotifications.push({ firestoreId: doc.id, ...doc.data() }));

        // Merge with local, avoid duplicates by id
        const localIds = new Set(notifications.map(n => n.id));
        fbNotifications.forEach(n => {
            if (!localIds.has(n.id)) notifications.push(n);
        });
        notifications.sort((a, b) => b.id - a.id);
        saveNotifications();
        updateNotificationBadge();
    } catch (e) { console.warn('Error loading notifications from Firebase', e); }
}

async function checkPartoAlerts() {
    if (!db || !currentUser) return;

    try {
        const snapshot = await db.collection('eventos')
            .where('tipo', '==', 'Inseminación')
            .get();

        const today = new Date();
        snapshot.forEach(doc => {
            const data = doc.data();
            const fechaIns = new Date(data.fecha || data.timestamp?.toDate());
            if (!isNaN(fechaIns)) {
                // Gestación promedio vaca: 283 días
                const fechaParto = new Date(fechaIns);
                fechaParto.setDate(fechaParto.getDate() + 283);

                const diffTime = fechaParto - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 0 && diffDays <= 30) {
                    const msg = `🤰 Recordatorio: Próximo parto para ${data.animal} aprox. el ${fechaParto.toLocaleDateString()} (en ${diffDays} días)`;
                    // Evitar duplicar si ya existe localmente esta notificación hoy
                    const exists = notifications.some(n => n.text === msg);
                    if (!exists) {
                        addNotification(msg, 'warning');
                    }
                }
            }
        });
    } catch (e) { console.warn('Error checking birth alerts', e); }
}

function renderNotifications() {
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">No hay notificaciones nuevas</div>';
        return;
    }

    list.innerHTML = notifications.map(n => `
        <div class="notification-item" style="border-left-color: ${n.type === 'alert' ? '#ef4444' : '#4ade80'}">
            <div class="time">${n.time}</div>
            <div class="text">${n.text}</div>
        </div>
    `).join('');
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    const unseen = notifications.length;
    if (unseen > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function clearNotifications() {
    notifications = [];
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
}

function saveNotifications() {
    localStorage.setItem('pamora_notifications', JSON.stringify(notifications));
}

// ─── EVENT TYPE SWITCH ──────────────────────────────────────

function switchEventoType(tipo) {
    document.getElementById('celo-fields').classList.toggle('hidden', tipo !== 'celo');
    document.getElementById('inseminacion-fields').classList.toggle('hidden', tipo !== 'inseminacion');
    document.getElementById('nacimiento-fields').classList.toggle('hidden', tipo !== 'nacimiento');
    document.getElementById('otro-fields').classList.toggle('hidden', tipo !== 'otro');
}

// ─── FORM HANDLERS ──────────────────────────────────────────

async function handleEvento(e) {
    e.preventDefault();
    const tipo = document.getElementById('evento-tipo').value;
    const fecha = document.getElementById('evento-fecha').value;
    let payload = { tipo, fecha, token: API_TOKEN };

    if (tipo === 'celo') {
        payload.animal = document.getElementById('celo-animal').value;
        payload.duracion = document.getElementById('celo-duracion').value;
        payload.accionItem = document.getElementById('celo-accion').value;
        payload.observaciones = document.getElementById('celo-observaciones').value;

        if (!payload.animal) {
            showToast('Selecciona el animal', 'error');
            return;
        }
    } else if (tipo === 'inseminacion') {
        payload.animal = document.getElementById('insem-animal').value;
        payload.toro = document.getElementById('insem-toro').value;
        payload.tecnico = document.getElementById('insem-tecnico').value;
        payload.observaciones = document.getElementById('insem-observaciones').value;
        payload.estado = document.getElementById('insem-estado').value;

        if (!payload.animal) {
            showToast('Selecciona el animal', 'error');
            return;
        }
    } else if (tipo === 'nacimiento') {
        payload.madre = document.getElementById('nac-madre').value;
        payload.cria = document.getElementById('nac-cria').value;
        payload.sexo = document.getElementById('nac-sexo').value;
        payload.peso = document.getElementById('nac-peso').value;
        payload.observaciones = document.getElementById('nac-observaciones').value;

        if (!payload.madre || !payload.cria) {
            showToast('Completa madre y nombre de la cría', 'error');
            return;
        }
    } else if (tipo === 'otro') {
        payload.descripcion = document.getElementById('otro-descripcion').value;
        payload.animal = document.getElementById('otro-animal').value;
        payload.observaciones = document.getElementById('otro-observaciones').value;

        if (!payload.descripcion) {
            showToast('Ingresa una descripción para el evento', 'error');
            return;
        }

        // Logic for Purge reminder
        if (payload.descripcion.toLowerCase().includes('purga')) {
            const datePurge = new Date(fecha);
            datePurge.setDate(datePurge.getDate() + 8);
            const reminderText = `Recordatorio: Re-purga para ${payload.animal || 'el hato'} el ${datePurge.toLocaleDateString()}`;
            addNotification(reminderText, 'alert');
        }
    }

    const btn = e.target.querySelector('button[type="submit"]');
    await submitToSheets(payload, btn, 'evento-success', 'evento-form');
}

// Initial badge update
document.addEventListener('DOMContentLoaded', () => {
    updateNotificationBadge();

    // Add animal names to the "Otro" animal selector
    const otroAnimal = document.getElementById('otro-animal');
    if (otroAnimal) {
        ANIMALES.forEach(animal => {
            const opt = document.createElement('option');
            opt.value = animal;
            opt.textContent = `${getAnimalEmoji(animal)} ${animal}`;
            otroAnimal.appendChild(opt);
        });
    }
});

async function handleGasto(e) {
    e.preventDefault();
    const payload = {
        tipo: 'gasto',
        fecha: document.getElementById('gasto-fecha').value,
        categoria: document.getElementById('gasto-categoria').value,
        descripcion: document.getElementById('gasto-descripcion').value,
        monto: document.getElementById('gasto-monto').value,
        token: API_TOKEN
    };

    if (!payload.monto || parseFloat(payload.monto) <= 0) {
        showToast('Ingresa un monto válido', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    await submitToSheets(payload, btn, 'gasto-success', 'gasto-form');
}


// ─── API & FIREBASE COMMUNICATION ──────────────────────────

async function submitToSheets(data, btn, successId, formId) {
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    showLoading(true);

    try {
        if (db) {
            // FIREBASE MODE
            const collectionMap = {
                'produccion': 'produccion',
                'celo': 'eventos',
                'inseminacion': 'eventos',
                'nacimiento': 'eventos',
                'otro': 'eventos',
                'gasto': 'gastos',
                'configuracion': 'config',
                'parametros_rentabilidad': 'rentabilidad_params'
            };

            const coll = collectionMap[data.tipo] || 'misc';
            await db.collection(coll).add({
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                user: currentUser.name
            });

            showSyncSuccess(successId);
            if (formId) resetForm(formId);
            showToast('🔥 Guardado en Firebase', 'success');
            return;
        }

        if (APPS_SCRIPT_URL === 'TU_URL_DE_APPS_SCRIPT_AQUI') {
            await new Promise(r => setTimeout(r, 800));
            showSyncSuccess(successId);
            if (formId) resetForm(formId);
            showToast('✅ Registro guardado (modo demo)', 'success');
            return;
        }

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            showSyncSuccess(successId);
            if (formId) resetForm(formId);
            showToast('☁️ Guardado en la nube', 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        showLoading(false);
    }
}

async function fetchFromSheets(accion, params = {}) {
    if (db) {
        try {
            if (accion === 'config') {
                const doc = await db.collection('config').doc('hato').get();
                return doc.exists ? doc.data() : { animales: ANIMALES };
            }
            // For production/events, we fetch and format
            const collectionMap = {
                'produccion_mes': 'produccion',
                'inseminaciones': 'eventos',
                'nacimientos': 'eventos',
                'celos': 'eventos',
                'rentabilidad': 'produccion' // simplistic for now
            };
            const coll = collectionMap[accion];
            if (!coll) return getDemoData(accion);

            const snapshot = await db.collection(coll).get();
            const filas = [];
            snapshot.forEach(doc => filas.push(doc.data()));
            return { filas };
        } catch (e) {
            console.error('Firebase fetch error', e);
            return getDemoData(accion);
        }
    }

    try {
        if (APPS_SCRIPT_URL === 'TU_URL_DE_APPS_SCRIPT_AQUI') return getDemoData(accion);
        const urlParams = new URLSearchParams({ accion, token: API_TOKEN, ...params });
        const response = await fetch(`${APPS_SCRIPT_URL}?${urlParams}`);
        const result = await response.json();
        return result.success ? result.data : getDemoData(accion);
    } catch (error) {
        return getDemoData(accion);
    }
}


// ─── EXPORTAR A GOOGLE SHEETS (CSV) ─────────────────────────

async function exportarCSV(coleccion) {
    if (!db) {
        showToast('Exportación solo disponible con Firebase activo', 'warning');
        return;
    }

    showToast('Generando CSV...', 'info');
    try {
        const snapshot = await db.collection(coleccion).orderBy('timestamp', 'desc').get();
        const filas = [];
        snapshot.forEach(doc => filas.push({ id: doc.id, ...doc.data() }));

        if (filas.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        const headers = Object.keys(filas[0]);
        const csv = [
            headers.join(','),
            ...filas.map(fila =>
                headers.map(h => {
                    const val = fila[h];
                    if (val === null || val === undefined) return '';
                    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return `"${str.replace(/"/g, '""')}"`;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PaMora_${coleccion}_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        showToast(`✅ ${filas.length} registros exportados`, 'success');
    } catch (e) {
        console.error('Export error:', e);
        showToast('Error al exportar: ' + e.message, 'error');
    }
}


// ─── DASHBOARD STATS ────────────────────────────────────────

async function loadDashboardStats() {
    const prod = await fetchFromSheets('produccion_mes');
    const insem = await fetchFromSheets('inseminaciones');

    let totalMes = 0;
    if (prod?.filas) prod.filas.forEach(f => { totalMes += f.total || 0; });

    const dias = prod?.filas?.length || 1;
    setStatText('stat-total-litros', totalMes.toFixed(0));
    setStatText('stat-promedio', (totalMes / dias).toFixed(1));
    setStatText('stat-animales', ANIMALES.length);

    let prenadas = 0;
    if (insem?.filas) prenadas = insem.filas.filter(f => f.estado === 'Preñada').length;
    setStatText('stat-prenadas', prenadas);

    loadGestacion(insem);
}

function loadGestacion(insem) {
    const tbody = document.getElementById('gestacion-tbody');
    const alertsContainer = document.getElementById('gestacion-alerts');
    const alertsWrapper = document.getElementById('alertas-parto-container');

    if (!tbody || !alertsContainer) return;

    let html = '';
    let alertsHtml = '';
    let hasAlerts = false;

    const hoy = new Date();

    if (!insem || !insem.filas || insem.filas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay registros de inseminación</td></tr>';
        if (alertsWrapper) alertsWrapper.style.display = 'none';
        return;
    }

    // Group to get only the latest insemination per animal, ignoring old ones if they re-inseminate
    const latestInsem = {};
    insem.filas.forEach(f => {
        if (!f.animal || !f.fecha) return;
        const d = new Date(f.fecha);
        if (isNaN(d)) return;
        if (!latestInsem[f.animal] || d > new Date(latestInsem[f.animal].fecha)) {
            latestInsem[f.animal] = f;
        }
    });

    const preneces = Object.values(latestInsem).map(f => {
        const fInsem = new Date(f.fecha);
        const fParto = new Date(fInsem.getTime() + (283 * 24 * 60 * 60 * 1000));
        const diffTime = fParto - hoy;
        const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...f, fParto, diasRestantes };
    }).sort((a, b) => a.diasRestantes - b.diasRestantes); // Order by closest to calving

    preneces.forEach(p => {
        // Hide very old records (more than 60 days post calving)
        const isOld = p.diasRestantes < -60;
        if (isOld) return;

        let statusBadge = `<span class="badge bg-secondary">${p.estado}</span>`;
        if (p.estado === 'Preñada') statusBadge = `<span class="badge bg-success">Preñada</span>`;
        if (p.estado === 'Vacía') statusBadge = `<span class="badge bg-danger">Vacía</span>`;

        let diasBadge = `${p.diasRestantes} días`;
        if (p.diasRestantes < 0) diasBadge = `Hace ${Math.abs(p.diasRestantes)} días`;

        let rowClass = '';
        if (p.estado === 'Preñada' && p.diasRestantes >= 0 && p.diasRestantes <= 30) {
            rowClass = 'table-warning';
            hasAlerts = true;
            alertsHtml += `
            <div class="stat-card" style="border-left: 4px solid #ef4444;">
                <div class="stat-icon" style="background:#fee2e2; color:#ef4444;">🚨</div>
                <div>
                    <div class="stat-label">¡Atención! ${p.animal}</div>
                    <div class="stat-value" style="font-size:1.2rem; color:#ef4444;">Faltan ${p.diasRestantes} días</div>
                    <div style="font-size:0.8rem; color:#6b7280;">Parto est: ${formatDate(p.fParto)}</div>
                </div>
            </div>`;
        }

        html += `<tr class="${rowClass}">
            <td><strong>${getAnimalEmoji(p.animal)} ${p.animal}</strong></td>
            <td>${formatDate(p.fecha)}</td>
            <td>${p.toro || '-'}</td>
            <td><strong>${formatDate(p.fParto)}</strong></td>
            <td>${diasBadge}</td>
            <td>${statusBadge}</td>
        </tr>`;
    });

    tbody.innerHTML = html || '<tr><td colspan="6" class="text-center text-muted">No hay gestaciones activas</td></tr>';

    if (hasAlerts && alertsWrapper) {
        alertsContainer.innerHTML = alertsHtml;
        alertsWrapper.style.display = 'block';
    } else if (alertsWrapper) {
        alertsWrapper.style.display = 'none';
        alertsContainer.innerHTML = '';
    }
}

function setStatText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}


// ─── RENTABILIDAD ───────────────────────────────────────────

let lastRentabilidadData = null;
let concentradoPerAnimal = {}; // Stores individual Kg/day configurations per animal

// ─── ANÁLISIS AUTOMÁTICO DEL MES ───────────────────────────

const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

async function generarAnalisisMes() {
    if (!lastRentabilidadData) {
        showToast('Carga primero los datos del mes', 'warning');
        return;
    }

    const { totalLitros, ingresos, gastos, ganancia, margen, mejorVaca, peorVaca, precioVenta, costoPorLitro } = lastRentabilidadData;
    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const mesNombre = mesEl ? MESES_NOMBRES[parseInt(mesEl.value)] : '';
    const anio = anioEl ? anioEl.value : '';

    const rentable = ganancia > 0;
    const margenStr = margen > 0 ? `${margen.toFixed(1)}%` : `${margen.toFixed(1)}%`;
    const emoji = rentable ? '✅' : '⚠️';
    const veredicto = rentable ? 'El hato fue RENTABLE este mes.' : 'El hato operó con PÉRDIDA este mes.';

    const analisis = `${emoji} <strong>${veredicto}</strong>
<br><br>
📅 <strong>Período analizado:</strong> ${mesNombre} ${anio}
<br>
🥛 <strong>Producción total:</strong> ${formatNumber(totalLitros)} litros — a un precio promedio de $${formatNumber(precioVenta)}/litro.
<br>
💵 <strong>Ingresos brutos estimados:</strong> $${formatNumber(ingresos)}
<br>
📉 <strong>Total de gastos registrados:</strong> $${formatNumber(gastos)}
<br>
🏆 <strong>Ganancia neta:</strong> $${formatNumber(ganancia)} — Margen: ${margenStr}
<br>
🧮 <strong>Costo de producción por litro:</strong> $${formatNumber(costoPorLitro)} ${costoPorLitro < precioVenta ? '(por debajo del precio de venta ✅)' : '(por encima del precio de venta ⚠️)'}
<br><br>
${mejorVaca ? `🐄 <strong>Vaca más rentable:</strong> ${mejorVaca}` : ''}
${peorVaca ? `<br>🔻 <strong>Vaca menos rentable:</strong> ${peorVaca}` : ''}
<br><br>
${rentable
            ? '💡 <em>Recomendación: Mantener el plan de alimentación actual. Considerar ampliar el hato si la demanda lo permite.</em>'
            : '💡 <em>Recomendación: Revisar costos de concentrado y verificar si alguna vaca está en período de baja producción. Ajustar precio de venta si el mercado lo permite.</em>'}`;

    const card = document.getElementById('analisis-card');
    const texto = document.getElementById('analisis-texto');
    if (card && texto) {
        texto.innerHTML = analisis;
        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast('✅ Análisis generado', 'success');
}


// ─── EXPORTAR REPORTE PDF COMPLETO ──────────────────────────

async function exportarReportePDF() {
    if (!lastRentabilidadData) {
        showToast('Genera primero el análisis del mes', 'warning');
        return;
    }

    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const mesNombre = mesEl ? MESES_NOMBRES[parseInt(mesEl.value)] : 'Mes';
    const anio = anioEl ? anioEl.value : '';

    showToast('Generando PDF...', 'info');

    // If html2canvas and jsPDF are available
    if (typeof html2canvas !== 'undefined' && typeof jspdf !== 'undefined') {
        const { jsPDF } = jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        let y = 15;

        // Header
        pdf.setFontSize(20);
        pdf.setTextColor(34, 197, 94);
        pdf.text('PaMora Leche', 15, y);
        y += 8;
        pdf.setFontSize(13);
        pdf.setTextColor(60, 60, 60);
        pdf.text(`Reporte de Rentabilidad — ${mesNombre} ${anio}`, 15, y);
        y += 6;
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, 15, y);
        y += 10;

        // KPIs
        const { totalLitros, ingresos, gastos, ganancia, margen, costoPorLitro } = lastRentabilidadData;
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        const kpis = [
            [`Total Litros: ${formatNumber(totalLitros)} L`, `Ingresos: $${formatNumber(ingresos)}`],
            [`Gastos: $${formatNumber(gastos)}`, `Ganancia: $${formatNumber(ganancia)}`],
            [`Margen: ${margen.toFixed(1)}%`, `Costo/Litro: $${formatNumber(costoPorLitro)}`],
        ];
        kpis.forEach(row => {
            pdf.text(row[0], 15, y);
            pdf.text(row[1], 110, y);
            y += 7;
        });
        y += 5;

        // Analysis text
        const analisisEl = document.getElementById('analisis-texto');
        if (analisisEl && analisisEl.textContent.trim()) {
            pdf.setFontSize(10);
            pdf.setTextColor(60, 60, 60);
            const lines = pdf.splitTextToSize(analisisEl.textContent.replace(/\s+/g, ' ').trim(), 180);
            pdf.text(lines, 15, y);
            y += lines.length * 5 + 5;
        }

        // Capture charts
        const reportContainer = document.getElementById('reporte-container');
        if (reportContainer) {
            // Temporarily hide elements not needed in PDF
            const toHide = document.querySelectorAll('.btn-pamora, .section-header select, .section-header button');
            toHide.forEach(el => el.style.visibility = 'hidden');

            const canvas = await html2canvas(reportContainer, {
                backgroundColor: '#0d1a0d',
                scale: 1.5,
                useCORS: true,
                logging: false
            });

            toHide.forEach(el => el.style.visibility = 'visible');

            const imgData = canvas.toDataURL('image/png');
            const imgHeight = (canvas.height * 180) / canvas.width;
            if (y + imgHeight > 280) { pdf.addPage(); y = 15; }
            pdf.addImage(imgData, 'PNG', 15, y, 180, imgHeight);
        }

        pdf.save(`PaMora_Rentabilidad_${mesNombre}_${anio}.pdf`);
        showToast('✅ PDF descargado', 'success');
    } else {
        // Fallback: simple window.print
        window.print();
    }
}


// ─── GRÁFICO DE TENDENCIA MENSUAL ───────────────────────────

let chartTendencia = null;

async function buildTendencialChart() {
    const canvas = document.getElementById('chart-tendencia-mensual');
    if (!canvas) return;

    // Get last 6 months of data
    const today = new Date();
    const labels = [];
    const valores = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        labels.push(MESES_NOMBRES[d.getMonth()].substring(0, 3) + ' ' + String(d.getFullYear()).substring(2));
        const mesData = await fetchFromSheets('produccion_mes', { mes: d.getMonth(), anio: d.getFullYear() });
        const total = (mesData?.filas || []).reduce((sum, r) => sum + (parseFloat(r[2]) || 0), 0);
        valores.push(parseFloat(total.toFixed(1)));
    }

    if (chartTendencia) chartTendencia.destroy();
    chartTendencia = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Litros totales',
                data: valores,
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74,222,128,0.15)',
                borderWidth: 2.5,
                pointBackgroundColor: '#4ade80',
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            ...chartOptions('Litros'),
            plugins: {
                legend: { display: false },
                tooltip: tooltipStyle()
            }
        }
    });
}


async function loadRentabilidad() {
    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const params = {};
    if (mesEl && anioEl) {
        params.mes = mesEl.value;
        params.anio = anioEl.value;
    }

    setStatText('rentabilidad-periodo', 'Cargando datos históricos...');
    const data = await fetchFromSheets('rentabilidad', params);
    lastRentabilidadData = data;

    // Reset per-animal concentrate configurations to prevent data bleeding between months
    concentradoPerAnimal = {};

    if (data.parametrosHistoricos) {
        document.getElementById('precio-venta-litro').value = data.parametrosHistoricos.precioVentaLitro || 2500;
        document.getElementById('concentrado-precio-kg').value = data.parametrosHistoricos.precioKgConcentrado || 1800;
        concentradoPerAnimal = data.parametrosHistoricos.concentradoPerAnimal || {};
    } else {
        // Reset global parameters to defaults if no history found for this month
        document.getElementById('precio-venta-litro').value = 2500;
        document.getElementById('concentrado-precio-kg').value = 1800;
    }

    renderRentabilidad();
}

function renderRentabilidad() {
    if (!lastRentabilidadData) return;
    const data = lastRentabilidadData;

    // Get config values
    const precioVenta = parseFloat(document.getElementById('precio-venta-litro').value) || data.precioVentaLitro || 2500;
    const confPrecioKg = parseFloat(document.getElementById('concentrado-precio-kg').value) || 1800;

    // Recalculate KPIs based on custom price and per-cow concentrate logic
    const ingresos = data.totalLitros * precioVenta;
    const ganancia = ingresos - data.totalGastos;
    const margen = ingresos > 0 ? ((ganancia / ingresos) * 100).toFixed(1) : 0;

    // Update KPIs
    setStatText('rentabilidad-periodo', data.periodo || 'Mes actual');
    document.getElementById('kpi-ingresos').textContent = '$' + formatNumber(ingresos);
    document.getElementById('kpi-gastos').textContent = '$' + formatNumber(data.totalGastos || 0);

    const gananciaEl = document.getElementById('kpi-ganancia');
    gananciaEl.textContent = '$' + formatNumber(ganancia);
    gananciaEl.className = 'kpi-value ' + (ganancia >= 0 ? 'positive' : 'negative');

    setStatText('kpi-margen', 'Margen: ' + margen + '%');

    // Configured cost per liter logic just reflects total expenses vs total liters produced
    const costoLitro = data.totalLitros > 0 ? (data.totalGastos / data.totalLitros).toFixed(0) : 0;
    document.getElementById('kpi-costo-litro').textContent = '$' + formatNumber(costoLitro);
    setStatText('kpi-precio-venta', 'Precio venta: $' + formatNumber(precioVenta));

    // Per Cow Table
    const perCowTbody = document.getElementById('per-cow-tbody');
    const dias = data.diasRegistrados || 1;
    let tableHtml = '';

    // We must recalculate total expenses for the period based on the sum of all individual concentrate costs
    let totalConcentradoCost = 0;

    ANIMALES.forEach(animal => {
        const prod = data.produccionPorAnimal?.[animal];
        if (!prod || prod.total === 0) return;

        const cowLiters = prod.total;
        const incomeBruto = cowLiters * precioVenta;

        // Concentrado calculations (configurable per cow)
        const cowKgDia = concentradoPerAnimal[animal] !== undefined ? concentradoPerAnimal[animal] : 4;
        const costoConcentradoVaca = cowKgDia * confPrecioKg * dias;
        totalConcentradoCost += costoConcentradoVaca;

        const gananciaVaca = incomeBruto - costoConcentradoVaca;

        const isRentable = gananciaVaca > 0;
        const badgeClass = isRentable ? 'badge-success' : 'badge-danger';
        const statusText = isRentable ? 'Rentable' : 'Pérdida';
        const colorClass = isRentable ? 'positive' : 'negative';

        tableHtml += `
                < tr >
          <td><strong>${ANIMAL_EMOJIS[animal]} ${animal}</strong></td>
          <td>${cowLiters} L</td>
          <td>${prod.promedioDiario} L/día</td>
          <td>
            <input type="number" class="form-control" style="width: 70px; padding: 4px; display: inline-block; font-size: 0.85rem;" 
                   min="0" step="0.5" value="${cowKgDia}" 
                   onchange="updateConcentradoVaca('${animal}', this.value)">
          </td>
          <td>$${formatNumber(incomeBruto)}</td>
          <td style="color:#f59e0b;">$${formatNumber(costoConcentradoVaca)}</td>
          <td class="${colorClass}"><strong>$${formatNumber(gananciaVaca)}</strong></td>
          <td><span class="badge-pamora ${badgeClass}">${statusText}</span></td>
        </tr > `;
    });

    if (tableHtml === '') tableHtml = '<tr><td colspan="8" class="text-center">Sin datos de producción</td></tr>';
    perCowTbody.innerHTML = tableHtml;

    // Charts
    buildProduccionAnimalChart(data);

    // Costo vs Venta dynamic update with new price
    data._dPrecioVenta = precioVenta;
    buildCostoVsVentaChart(data);

    // Update overall expenses chart using the new dynamic concentrate total
    const dynamicData = JSON.parse(JSON.stringify(data));
    if (dynamicData.porCategoria) {
        dynamicData.porCategoria['Concentrado'] = totalConcentradoCost;
    }

    // Also override global KPIs to reflect the sum of all individual concentrate configs
    const totalGastosExceptoConcentrado = Object.entries(data.porCategoria || {})
        .filter(([k, v]) => k !== 'Concentrado')
        .reduce((sum, [k, v]) => sum + v, 0);

    const recalculatedTotalGastos = totalGastosExceptoConcentrado + totalConcentradoCost;
    const recalculatedGanancia = ingresos - recalculatedTotalGastos;
    const recalculatedMargen = ingresos > 0 ? ((recalculatedGanancia / ingresos) * 100).toFixed(1) : 0;

    document.getElementById('kpi-gastos').textContent = '$' + formatNumber(recalculatedTotalGastos);
    const gananciaElUpdated = document.getElementById('kpi-ganancia');
    gananciaElUpdated.textContent = '$' + formatNumber(recalculatedGanancia);
    gananciaElUpdated.className = 'kpi-value ' + (recalculatedGanancia >= 0 ? 'positive' : 'negative');
    setStatText('kpi-margen', 'Margen: ' + recalculatedMargen + '%');

    const veredictoEmoji = document.getElementById('veredicto-emoji');
    const veredictoTexto = document.getElementById('veredicto-texto');
    const veredictoDetalle = document.getElementById('veredicto-detalle');

    if (recalculatedGanancia > 0) {
        veredictoEmoji.textContent = '🏆';
        veredictoTexto.textContent = 'El Hato es RENTABLE';
        veredictoTexto.style.color = '#4ade80';
        veredictoDetalle.textContent = `Generando utilidades con un margen del ${recalculatedMargen}% sobre los ingresos.`;
        document.getElementById('hato-veredicto').style.borderLeft = '6px solid #4ade80';
    } else {
        veredictoEmoji.textContent = '⚠️';
        veredictoTexto.textContent = 'El Hato NO es rentable actualmente';
        veredictoTexto.style.color = '#ef4444';
        veredictoDetalle.textContent = 'Los costos de operación superan los ingresos por producción lechera.';
        document.getElementById('hato-veredicto').style.borderLeft = '6px solid #ef4444';
    }

    buildGastosCategoriaChart(dynamicData);

    // Expose final calculated KPIs for generarAnalisisMes
    const allCowGains = ANIMALES.map(a => {
        const p = data.produccionPorAnimal?.[a];
        if (!p || p.total === 0) return null;
        return { animal: a, ganancia: (p.total * precioVenta) - ((concentradoPerAnimal[a] ?? 4) * confPrecioKg * (data.diasRegistrados || 1)) };
    }).filter(Boolean);
    allCowGains.sort((a, b) => b.ganancia - a.ganancia);

    lastRentabilidadData = {
        ...data,
        ingresos,
        gastos: recalculatedTotalGastos,
        ganancia: recalculatedGanancia,
        margen: parseFloat(recalculatedMargen),
        costoPorLitro: data.totalLitros > 0 ? recalculatedTotalGastos / data.totalLitros : 0,
        precioVenta,
        mejorVaca: allCowGains[0]?.animal,
        peorVaca: allCowGains[allCowGains.length - 1]?.animal
    };
}

function updateConcentradoVaca(animal, value) {
    concentradoPerAnimal[animal] = parseFloat(value) || 0;
    recalcRentabilidad();
}

function recalcRentabilidad() {
    renderRentabilidad();
}

function buildProduccionAnimalChart(data) {
    const ctx = document.getElementById('chart-produccion-animal');
    if (!ctx) return;
    if (ctx._chart) ctx._chart.destroy();

    const labels = ANIMALES;
    const totals = ANIMALES.map(a => data.produccionPorAnimal?.[a]?.total || 0);
    const promedios = ANIMALES.map(a => data.produccionPorAnimal?.[a]?.promedioDiario || 0);

    const colors = ['#4ade80', '#22c55e', '#16a34a', '#15803d', '#86efac', '#6fbf3a', '#5a9a30', '#3a6a1e'];

    ctx._chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Total litros',
                data: totals,
                backgroundColor: colors.map(c => c + '90'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: chartOptions('Litros')
    });
}

function buildCostoVsVentaChart(data) {
    const ctx = document.getElementById('chart-costo-vs-venta');
    if (!ctx) return;
    if (ctx._chart) ctx._chart.destroy();

    // Simulated daily data points (for demo)
    const dias = data.diasRegistrados || 15;
    const costoLabels = [];
    const costoData = [];
    const ventaData = [];

    for (let i = 1; i <= dias; i++) {
        costoLabels.push('Día ' + i);
        costoData.push(data.costoPorLitro || 0);
        ventaData.push(data._dPrecioVenta || data.precioVentaLitro || 0);
    }

    ctx._chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: costoLabels,
            datasets: [
                {
                    label: 'Costo / Litro',
                    data: costoData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 2
                },
                {
                    label: 'Precio Venta',
                    data: ventaData,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.08)',
                    fill: true,
                    tension: 0,
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...chartOptions('$/Litro'),
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12, padding: 10 }
                },
                tooltip: tooltipStyle()
            }
        }
    });
}

function buildGastosCategoriaChart(data) {
    const ctx = document.getElementById('chart-gastos-categoria');
    if (!ctx) return;
    if (ctx._chart) ctx._chart.destroy();

    const categorias = Object.keys(data.porCategoria || {});
    const montos = categorias.map(c => data.porCategoria[c]);
    const categColors = ['#4ade80', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    ctx._chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categorias,
            datasets: [{
                data: montos,
                backgroundColor: categColors.slice(0, categorias.length).map(c => c + 'cc'),
                borderColor: categColors.slice(0, categorias.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#9ca3af', font: { size: 11 }, padding: 10 }
                },
                tooltip: tooltipStyle()
            }
        }
    });
}

function chartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: tooltipStyle()
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#6b7280', font: { size: 10 } }
            },
            y: {
                grid: { color: 'rgba(90, 154, 48, 0.1)' },
                ticks: { color: '#6b7280', font: { size: 10 } },
                beginAtZero: true,
                title: { display: !!yLabel, text: yLabel, color: '#9ca3af', font: { size: 10 } }
            }
        }
    };
}

function tooltipStyle() {
    return {
        backgroundColor: 'rgba(31, 41, 55, 0.95)',
        titleColor: '#f8faf5',
        bodyColor: '#b0c4a0',
        borderColor: 'rgba(90, 154, 48, 0.3)',
        borderWidth: 1,
        cornerRadius: 8
    };
}


// ─── COSTO POR LITRO (COSTOS PANEL) ────────────────────────

async function updateCostoPorLitro() {
    const data = await fetchFromSheets('rentabilidad');
    const el = document.getElementById('costo-por-litro');
    if (el) el.textContent = formatNumber(data.costoConcentradoPorLitro || 0);
}


// ─── CONFIGURACION HATO ─────────────────────────────────────

function renderConfigAnimales() {
    const container = document.getElementById('lista-animales-activos');
    if (!container) return;

    container.innerHTML = ANIMALES.map((animal, index) => `
                < div class="badge-pamora" style = "font-size: 1rem; padding: 10px 15px; display: inline-flex; align-items: center; gap: 8px;" >
            <span>${getAnimalEmoji(animal)} ${animal}</span>
            <button class="btn-close btn-close-white" style="font-size: 0.6rem; cursor: pointer; filter: invert(1) grayscale(100%) brightness(200%);" onclick="quitarAnimal(${index})" title="Secar/Eliminar vaca"></button>
        </div >
                `).join('');
}

function agregarAnimal() {
    const input = document.getElementById('nuevo-animal-nombre');
    const animal = input.value.trim();

    if (!animal) {
        showToast('Debes ingresar un nombre', 'error');
        return;
    }

    const animalTitleCase = animal.charAt(0).toUpperCase() + animal.slice(1).toLowerCase();

    if (ANIMALES.includes(animalTitleCase)) {
        showToast('El animal ya existe en el hato', 'warning');
        return;
    }

    ANIMALES.push(animalTitleCase);
    input.value = '';
    renderConfigAnimales();
    buildAnimalInputs('ordeno-animal-grid', 'ordeno');
    buildAnimalSelectors();
    showToast(`${animalTitleCase} añadida al hato.No olvides guardar la configuración.`, 'info');
}

function quitarAnimal(index) {
    const animal = ANIMALES[index];
    if (confirm(`¿Estás seguro de secar / retirar a ${animal}? Ya no aparecerá en los nuevos reportes, pero su historial pasado se mantendrá.`)) {
        ANIMALES.splice(index, 1);
        renderConfigAnimales();
        buildAnimalInputs('ordeno-animal-grid', 'ordeno');
        buildAnimalSelectors();
        showToast(`${animal} retirada.No olvides guardar.`, 'info');
    }
}

async function guardarConfiguracion() {
    const payload = { tipo: 'configuracion', animales: ANIMALES, token: API_TOKEN };
    const btn = document.getElementById('btn-guardar-config');
    await submitToSheets(payload, btn, 'config-success', null);
}


// ─── HISTORIAL ──────────────────────────────────────────────

async function loadHistorial() {
    const insem = await fetchFromSheets('inseminaciones');
    const nac = await fetchFromSheets('nacimientos');
    const celos = await fetchFromSheets('celos');

    // Celos table
    const celoTbody = document.getElementById('historial-celo-tbody');
    if (celoTbody) {
        if (!celos?.filas?.length) {
            celoTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            celoTbody.innerHTML = celos.filas.map(f => {
                const badgeClass = f.intensidad === 'Fuerte' ? 'badge-danger' :
                    f.intensidad === 'Leve' ? 'badge-success' : 'badge-warning';
                return `< tr >
          <td>${formatDate(f.fecha)}</td>
          <td>${f.animal}</td>
          <td><span class="badge-pamora ${badgeClass}">${f.intensidad}</span></td>
          <td>${f.duracion} h</td>
          <td>${f.accionItem}</td>
          <td>${f.observaciones || '—'}</td>
        </tr > `;
            }).join('');
        }
    }

    // Inseminations table
    const insemTbody = document.getElementById('historial-insem-tbody');
    if (insemTbody) {
        if (!insem?.filas?.length) {
            insemTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            insemTbody.innerHTML = insem.filas.map(f => {
                const badgeClass = f.estado === 'Preñada' ? 'badge-success' :
                    f.estado === 'No Preñada' ? 'badge-danger' : 'badge-warning';
                return `< tr >
          <td>${formatDate(f.fecha)}</td>
          <td>${f.animal}</td>
          <td>${f.toro}</td>
          <td>${f.tecnico}</td>
          <td>${f.observaciones || '—'}</td>
          <td><span class="badge-pamora ${badgeClass}">${f.estado}</span></td>
        </tr > `;
            }).join('');
        }
    }

    // Births table
    const nacTbody = document.getElementById('historial-nac-tbody');
    if (nacTbody) {
        if (!nac?.filas?.length) {
            nacTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            nacTbody.innerHTML = nac.filas.map(f => `
                < tr >
          <td>${formatDate(f.fecha)}</td>
          <td>${f.madre}</td>
          <td>${f.cria}</td>
          <td>${f.sexo}</td>
          <td>${f.peso} kg</td>
          <td>${f.observaciones || '—'}</td>
        </tr > `).join('');
        }
    }
}


// ─── DEMO DATA ──────────────────────────────────────────────

function getDemoData(accion) {
    switch (accion) {
        case 'produccion_mes':
            return {
                mes: 'Febrero', anio: 2026, animales: ANIMALES,
                filas: Array.from({ length: 20 }, (_, i) => {
                    const litros = {};
                    let total = 0;
                    ANIMALES.forEach(a => {
                        const v = +(Math.random() * 8 + 2).toFixed(1);
                        litros[a] = v;
                        total += v;
                    });
                    return {
                        fecha: `2026-02 - ${String(i + 1).padStart(2, '0')} `,
                        horario: i % 2 === 0 ? 'AM' : 'PM',
                        litros, total: +total.toFixed(1), notas: ''
                    };
                })
            };

        case 'inseminaciones':
            return {
                filas: [
                    { fecha: '2025-06-01', animal: 'Yohana', toro: 'Brahman Elite', tecnico: 'Dr. Pérez', observaciones: '¡PRÓXIMO PARTO!', estado: 'Preñada' },
                    { fecha: '2026-01-20', animal: 'Dulce', toro: 'Holstein Prime', tecnico: 'Dr. Pérez', observaciones: '', estado: 'Pendiente' },
                    { fecha: '2026-02-05', animal: 'Nube', toro: 'Jersey Gold', tecnico: 'Dr. López', observaciones: 'No preñada todavía', estado: 'No Preñada' },
                    { fecha: '2026-02-10', animal: 'Morocha', toro: 'Gyr Superior', tecnico: 'Dr. Pérez', observaciones: '', estado: 'Preñada' }
                ]
            };

        case 'nacimientos':
            return {
                filas: [
                    { fecha: '2026-02-12', madre: 'Yohana', cria: 'Esperanza', sexo: 'Hembra', peso: 32, observaciones: 'Parto normal, sin complicaciones' },
                    { fecha: '2026-02-20', madre: 'Moli', cria: 'Trueno', sexo: 'Macho', peso: 35, observaciones: 'Parto asistido' }
                ]
            };

        case 'celos':
            return {
                filas: [
                    { fecha: '2026-02-14', animal: 'Sol', intensidad: 'Fuerte', duracion: '16', accionItem: 'Programar inseminación', observaciones: 'Mugidos y monta a otras vacas' },
                    { fecha: '2026-02-25', animal: 'Nube', intensidad: 'Moderado', duracion: '8', accionItem: 'Sin acción', observaciones: 'Flujo claro' }
                ]
            };

        case 'config':
            return { animales: ANIMALES };

        case 'costos_mes':
            return {
                periodo: 'Febrero 2026',
                filas: [
                    { fecha: '2026-02-01', categoria: 'Concentrado', concepto: '5 bultos concentrado lechero', monto: 750000 },
                    { fecha: '2026-02-05', categoria: 'Veterinaria', concepto: 'Desparasitación general', monto: 280000 },
                    { fecha: '2026-02-10', categoria: 'Jornales', concepto: 'Trabajador quincenal', monto: 500000 },
                    { fecha: '2026-02-12', categoria: 'Forraje', concepto: 'Mantenimiento pradera', monto: 300000 },
                    { fecha: '2026-02-15', categoria: 'Concentrado', concepto: '3 bultos concentrado lechero', monto: 450000 },
                    { fecha: '2026-02-20', categoria: 'Imprevistos', concepto: 'Reparación cerca', monto: 120000 },
                    { fecha: '2026-02-25', categoria: 'Arriendos', concepto: 'Arriendo lote 4', monto: 400000 }
                ],
                totalGastos: 2800000,
                porCategoria: { 'Concentrado': 1200000, 'Veterinaria': 280000, 'Jornales': 500000, 'Forraje': 300000, 'Arriendos': 400000, 'Imprevistos': 120000 }
            };

        case 'rentabilidad': {
            const prod = getDemoData('produccion_mes');
            let totalLitros = 0;
            prod.filas.forEach(f => { totalLitros += f.total; });

            const precioVenta = 2500;
            const ingresos = totalLitros * precioVenta;
            const totalGastos = 2800000;
            const ganancia = ingresos - totalGastos;
            const margen = ingresos > 0 ? +((ganancia / ingresos) * 100).toFixed(1) : 0;

            const produccionPorAnimal = {};
            ANIMALES.forEach(animal => {
                let ta = 0;
                prod.filas.forEach(f => { ta += f.litros[animal] || 0; });
                produccionPorAnimal[animal] = {
                    total: +ta.toFixed(1),
                    promedioDiario: +(ta / prod.filas.length).toFixed(1)
                };
            });

            return {
                periodo: 'Febrero 2026',
                totalLitros: +totalLitros.toFixed(1),
                precioVentaLitro: precioVenta,
                ingresos: +ingresos.toFixed(0),
                totalGastos,
                gananciaNetaMes: +ganancia.toFixed(0),
                margenRentabilidad: margen,
                costoPorLitro: +(totalGastos / totalLitros).toFixed(0),
                costoConcentradoPorLitro: +(1200000 / totalLitros).toFixed(0),
                porCategoria: { 'Concentrado': 1200000, 'Veterinaria': 280000, 'Jornales': 500000, 'Forraje': 300000, 'Arriendos': 400000, 'Imprevistos': 120000 },
                produccionPorAnimal,
                diasRegistrados: prod.filas.length
            };
        }

        default:
            return { filas: [] };
    }
}


// ─── UTILITIES ──────────────────────────────────────────────

function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) form.reset();
    initDateDefaults();

    // Reset ordeno-specific
    if (formId === 'ordeno-form') {
        document.querySelectorAll('.ordeno-litros-input').forEach(i => { i.value = ''; i.disabled = false; });
        document.querySelectorAll('.ordeno-sin-ordeno').forEach(c => { c.checked = false; });
        updateTotal('ordeno');
        const hBtns = document.querySelectorAll('.horario-btn');
        hBtns.forEach(b => b.classList.remove('active'));
        if (hBtns[0]) hBtns[0].classList.add('active');
        document.getElementById('ordeno-horario').value = 'AM';
    }
}

function showSyncSuccess(successId) {
    const el = document.getElementById(successId);
    if (el) {
        el.classList.remove('hidden');
        el.style.animation = 'none';
        el.offsetHeight; // trigger reflow
        el.style.animation = 'slideUp 0.4s ease-out';
        setTimeout(() => el.classList.add('hidden'), 5000);
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type} `;
    toast.innerHTML = `< span > ${icons[type]}</span > <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function formatDate(d) {
    const date = new Date(d);
    if (isNaN(date)) return d;
    return `${date.getDate()} /${date.getMonth() + 1}/${date.getFullYear()} `;
}

function formatNumber(n) {
    return new Intl.NumberFormat('es-CO').format(n);
}

async function guardarParametrosRentabilidad() {
    const btn = document.querySelector('button[onclick="guardarParametrosRentabilidad()"]');
    const originalHTML = btn ? btn.innerHTML : '💾 Guardar Parámetros del Mes';

    if (APPS_SCRIPT_URL === 'TU_URL_DE_APPS_SCRIPT_AQUI') {
        showToast('Modo Demo: No se guardará en la nube 🚫', 'error');
        return;
    }

    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const precioVenta = parseFloat(document.getElementById('precio-venta-litro').value) || 2500;
    const precioKgConcentrado = parseFloat(document.getElementById('concentrado-precio-kg').value) || 1800;

    if (!mesEl || !anioEl) return;

    const data = {
        tipo: 'parametros_rentabilidad',
        token: API_TOKEN,
        mes: mesEl.value,
        anio: anioEl.value,
        precioVenta: precioVenta,
        precioKgConcentrado: precioKgConcentrado,
        concentradoPerAnimal: concentradoPerAnimal
    };

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Guardando...';
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        try {
            const result = await response.json();
            if (result.success) {
                showToast('☁️ Parámetros guardados correctamente para ' + mesEl.options[mesEl.selectedIndex].text, 'success');
            } else {
                showToast('Error: ' + (result.error || 'Error desconocido'), 'error');
            }
        } catch {
            showToast('☁️ Parámetros enviados a Google Sheets', 'success');
        }
    } catch (error) {
        showToast('Error de conexión: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}
