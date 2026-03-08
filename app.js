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

// Credenciales locales
const LOCAL_CREDENTIALS = {
    usuario: 'admin',
    password: 'pamora2026'
};

// Seguridad para Rentabilidad
let isRentabilidadAuth = false;

// ─── SESSION PERSISTENCE ────────────────────────────────────
const SESSION_KEY = 'pamora_session';
const SESSION_HOURS = 8; // stay logged in for a full work day

function saveSession(user) {
    const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user, expiry }));
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const { user, expiry } = JSON.parse(raw);
        if (Date.now() > expiry) { localStorage.removeItem(SESSION_KEY); return null; }
        return user;
    } catch { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

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
    if (!name) return '🐄';
    const n = name.toLowerCase();
    if (n.includes('ternero') || n.includes('ternera')) return '👶';
    if (n.includes('toro')) return '🐃';
    if (n.includes('novilla')) return '🐂';
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
    initIdleTimer();
    initFormListeners();
    verificarBodega();
});

let idleTimer;
const IDLE_LIMIT = 10 * 60 * 1000; // 10 minutes

function initIdleTimer() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, true);
    });
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (currentUser) {
        idleTimer = setTimeout(handleLogoutInactivity, IDLE_LIMIT);
    }
}

function handleLogoutInactivity() {
    if (currentUser) {
        showToast('Sesión cerrada por inactividad', 'warning');
        handleLogout();
    }
}

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
                // Check for local session fallback
                const sessionUser = loadSession();
                if (sessionUser) {
                    bootApp(sessionUser);
                } else if (!db) {
                    // Demo mode if no backend configured
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

// ─── UTILS: XSS PROTECTION ──────────────────────────────────
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── UTILS: SYNC PROGRESS ──────────────────────────────────
function updateSyncProgress(percent, status) {
    const container = document.getElementById('sync-progress-container');
    const fill = document.getElementById('sync-progress-fill');
    const statusText = document.getElementById('sync-status-text');
    const percentText = document.getElementById('sync-percent');

    if (!container) return;

    if (percent === null) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    fill.style.width = percent + '%';
    if (status) statusText.textContent = status;
    percentText.textContent = Math.round(percent) + '%';

    if (percent >= 100) {
        setTimeout(() => container.classList.add('hidden'), 1500);
    }
}

// ─── UTILS: NAVIGATION GUARD ────────────────────────────────
let hasUnsavedChanges = false;

function setDirty(value = true) {
    hasUnsavedChanges = value;
}

function initFormListeners() {
    // Global listener for ANY input or change in the application
    const excludedIds = ['search-animal', 'registros-mes', 'registros-anio', 'rentabilidad-mes', 'rentabilidad-anio', 'evento-tipo'];

    document.addEventListener('input', (e) => {
        // Ignore search bars, specific filters, or explicitly marked inputs via dot class
        if (e.target.id.includes('search') || excludedIds.includes(e.target.id) || e.target.classList.contains('no-dirty')) return;
        setDirty(true);
    });

    document.addEventListener('change', (e) => {
        if (e.target.id.includes('search') || excludedIds.includes(e.target.id) || e.target.classList.contains('no-dirty')) return;
        setDirty(true);
    });

    // Browser-level protection (refreshes, closing tab)
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = ''; // Required for Chrome
        }
    });
}

// ─── AUTH ───────────────────────────────────────────────────

async function bootApp(userName) {
    currentUser = { name: userName };
    showApp(userName);
    updateSyncProgress(10, 'Iniciando sesión...');

    try {
        const configSnap = await db.collection('config').doc('hato').get();
        updateSyncProgress(30, 'Descargando configuración básica...');
        if (configSnap.exists) {
            const hato = configSnap.data();
            if (hato && hato.animales) ANIMALES = hato.animales;
        }
    } catch (e) {
        console.error('Error loading config:', e);
    }

    updateSyncProgress(50, 'Sincronizando censo completo...');
    // CRITICAL: Await inventory loading before building grids/selectors
    await loadHerdInventory();

    updateSyncProgress(80, 'Preparando formularios...');
    buildAnimalInputs('ordeno-animal-grid', 'ordeno');
    buildAnimalSelectors();
    renderConfigAnimales();
    loadNotificationsFromFirebase();
    checkPartoAlerts();

    // AUTOMATIC SEEDING DISABLED: Prevented ghosting of deleted records
    if (db) {
        updateSyncProgress(90, 'Cargando registros recientes...');
        // Manual seeding should be used instead if needed.
    }

    updateSyncProgress(100, 'Sincronización terminada ✅');

    // Hide overlay only when EVERYTHING is done
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }, 1200);
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
            .then(() => {
                saveSession(email);
                showToast('¡Bienvenido!', 'success');
            })
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
        // [SECURITY NOTE] Demo mode fallback - Do not use in production
        setTimeout(() => {
            if (email === LOCAL_CREDENTIALS.usuario && pass === LOCAL_CREDENTIALS.password) {
                saveSession(email);
                bootApp(escapeHTML(email));
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
    clearSession();
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

    // Forzar siempre la pestaña de inicio al arrancar
    _doSwitchTab('inicio');
}


// ─── NAVIGATION ─────────────────────────────────────────────

function initNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

// Stores the pending tab navigation when nav guard modal is shown
let _pendingTabId = null;

function navGuardConfirm() {
    // User chose to leave — clear dirty flag and proceed
    setDirty(false);
    document.getElementById('modal-nav-guard').style.display = 'none';
    if (_pendingTabId) {
        const tabId = _pendingTabId;
        _pendingTabId = null;
        _doSwitchTab(tabId);
    }
}

function navGuardCancel() {
    _pendingTabId = null;
    document.getElementById('modal-nav-guard').style.display = 'none';
}

function switchTab(tabId) {
    // Intercepción de seguridad para Rentabilidad
    if (tabId === 'rentabilidad' && !isRentabilidadAuth) {
        document.getElementById('modal-rentabilidad-auth').style.display = 'flex';
        document.getElementById('rentabilidad-pass-input').focus();
        return;
    }

    if (hasUnsavedChanges) {
        _pendingTabId = tabId;
        document.getElementById('modal-nav-guard').style.display = 'flex';
        return; // Non-blocking: wait for user to choose in modal
    }
    _doSwitchTab(tabId);
}

// Saltos Rápidos
function goToNuevaInseminacion() {
    switchTab('eventos');
    const selectTipo = document.getElementById('evento-tipo');
    if (selectTipo) {
        selectTipo.value = 'Inseminación';
        toggleEventFields();
        switchEventoType('Inseminación');
    }
    showToast('Selecciona la vaca de la lista para registrar la monta/inseminación', 'info');
}

async function calcEditParto(partoId) {
    const parto = await db.collection('partos').doc(partoId).get();
    if (!parto.exists) {
        showToast('Parto no encontrado', 'error');
        return;
    }
    const data = parto.data();
    const animal = data.animal;
    const fechaParto = data.fecha;

    // Calculate next insemination date
    const nextInseminacionDate = new Date(fechaParto);
    nextInseminacionDate.setDate(nextInseminacionDate.getDate() + 60); // 60 days post-partum
    const nextInseminacionDateStr = nextInseminacionDate.toISOString().split('T')[0];

    // Calculate next dry-off date
    const nextSecadoDate = new Date(fechaParto);
    nextSecadoDate.setDate(nextSecadoDate.getDate() + 220); // 220 days post-partum
    const nextSecadoDateStr = nextSecadoDate.toISOString().split('T')[0];

    // Calculate next calving date
    const nextPartoDate = new Date(fechaParto);
    nextPartoDate.setDate(nextPartoDate.getDate() + 300); // 300 days post-partum
    const nextPartoDateStr = nextPartoDate.toISOString().split('T')[0];

    // Update animal in censo
    const animalRef = db.collection('animales').doc(animal);
    await animalRef.update({
        'proximo_servicio': nextInseminacionDateStr,
        'proximo_secado': nextSecadoDateStr,
        'proximo_parto': nextPartoDateStr,
        'estado': 'LACTANDO 🥛'
    });

    showToast(`Fechas de ${animal} actualizadas: Próximo Servicio: ${formatDate(nextInseminacionDateStr)}, Próximo Secado: ${formatDate(nextSecadoDateStr)}, Próximo Parto: ${formatDate(nextPartoDateStr)}`, 'success');
    loadHerdInventory(); // Refresh inventory to show updated status
}

// ─── SEGURIDAD RENTABILIDAD ──────────────────────────────────

function checkRentabilidadPass() {
    const input = document.getElementById('rentabilidad-pass-input');
    const error = document.getElementById('rentabilidad-auth-error');

    if (input.value === 'pamoraleche') {
        isRentabilidadAuth = true;
        input.value = '';
        error.style.display = 'none';
        document.getElementById('modal-rentabilidad-auth').style.display = 'none';
        _doSwitchTab('rentabilidad');
        showToast('🔓 Acceso concedido a Rentabilidad', 'success');
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
    }
}

function closeRentabilidadAuth() {
    document.getElementById('modal-rentabilidad-auth').style.display = 'none';
    document.getElementById('rentabilidad-pass-input').value = '';
    document.getElementById('rentabilidad-auth-error').style.display = 'none';
}

function _doSwitchTab(tabId) {
    // Reset dirty flag (in case it wasn't via guard)
    setDirty(false);

    // 1. Close all modals immediately (requested by user)
    closeAllModals();

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${tabId}`);
    if (panel) {
        panel.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Load data for specific tabs
    if (tabId === 'inicio') loadDashboardStats();
    if (tabId === 'ordeno') {
        const potreroInput = document.getElementById('ordeno-potrero');
        if (potreroInput && db) {
            // Obtenemos el registro más joven de producción
            db.collection('produccion').orderBy('fecha', 'desc').limit(1).get()
                .then(snapshot => {
                    if (!snapshot.empty) {
                        const ultimoReg = snapshot.docs[0].data();
                        if (ultimoReg.potrero && ultimoReg.potrero !== 'Sin Especificar') {
                            potreroInput.value = ultimoReg.potrero;
                        }
                    }
                }).catch(err => console.warn('No se pudo recuperar último potrero: ', err));
        }
    }
    if (tabId === 'rentabilidad') loadRentabilidad();
    if (tabId === 'historial') loadHistorial();
    if (tabId === 'explorador') {
        loadEventExplorer();
        loadCostosExplorer();
    }
    if (tabId === 'mi-hato') loadHerdInventory();
    if (tabId === 'gestacion') loadDashboardStats();
    if (tabId === 'vacunaciones') loadVacunaciones();
    if (tabId === 'config') renderConfigAnimales();
    if (tabId === 'registros') {
        initRegistrosSelectors();
        const mesSelect = document.getElementById('registros-mes');
        const anioSelect = document.getElementById('registros-anio');
        const today = new Date();
        if (mesSelect) mesSelect.value = today.getMonth().toString();
        if (anioSelect) anioSelect.value = today.getFullYear().toString();
        loadMilkRecords();
    }
}


// ─── DATE DEFAULTS ──────────────────────────────────────────

function initDateDefaults() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    ['ordeno-fecha', 'evento-fecha', 'gasto-fecha'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = dateStr;
    });

    // Restaurar el último potrero seleccionado para minimizar el trabajo diario del operario
    const lastPotrero = localStorage.getItem('last_ordeno_potrero');
    if (lastPotrero) {
        const potreroInput = document.getElementById('ordeno-potrero');
        if (potreroInput) potreroInput.value = lastPotrero;
    }

    const mesSelect = document.getElementById('rentabilidad-mes');
    const anioSelect = document.getElementById('rentabilidad-anio');
    if (mesSelect) mesSelect.value = today.getMonth().toString();

    // Costos Explorer Selectors
    const expMes = document.getElementById('costos-explorer-mes');
    const expAnio = document.getElementById('costos-explorer-anio');
    if (expMes) expMes.value = today.getMonth().toString();

    // Populate years dynamically from 2024 to current+1
    if (anioSelect || expAnio) {
        const currentYear = today.getFullYear();
        const yearsHTML = [];
        for (let y = 2024; y <= currentYear + 1; y++) {
            yearsHTML.push(`<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`);
        }
        if (anioSelect) anioSelect.innerHTML = yearsHTML.join('');
        if (expAnio) expAnio.innerHTML = yearsHTML.join('');
    }

    // Initialize registros selectors too
    initRegistrosSelectors();
}


// ─── BUILD ANIMAL INPUTS ────────────────────────────────────

function buildAnimalInputs(gridId, prefix) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    // Expert Filter: Only show animals currently in "LACTANDO 🥛" according to the censo
    // We search for animals that HAVE THE STATUS "LACTANDO 🥛" in the currentHerdCenso list
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.toUpperCase().includes('LACTANDO'));

    // If census is not yet loaded, try to filter from raw category name "Vaca (Producción)" if meta exists locally
    // but the BEST way is to wait for the censo status.
    const todayStr = new Date().toISOString().split('T')[0];

    grid.innerHTML = lactantes.map((animalObj, index) => {
        const animal = animalObj.nombre;
        let alertHtml = '';
        if (animalObj.retiroHasta && animalObj.retiroHasta >= todayStr) {
            alertHtml = `<span title="Retiro por antibióticos hasta el ${formatDate(animalObj.retiroHasta)}" style="font-size:0.75rem; color:#ef4444; background:rgba(239,68,68,0.1); padding:2px 6px; border-radius:10px; margin-left:6px; font-weight:700;">🔴 RETIRO</span>`;
        }

        return `
    <div class="animal-input-group" id="group-${prefix}-${animal}">
      <label>${getAnimalEmoji(animal)} ${animal} ${alertHtml}</label>
      <div class="d-flex gap-1 align-items-center">
        <input type="number" id="${prefix}-litros-${animal}" min="0" step="0.1" placeholder="0"
               data-animal="${animal}" class="${prefix}-litros-input form-control form-control-lg"
               oninput="updateTotal('${prefix}')"
               onkeydown="if(event.key==='Enter'){ event.preventDefault(); focusNextAnimal('${prefix}', ${index}); }">
        <button type="button" class="btn btn-sm btn-outline-success" 
                onclick="focusNextAnimal('${prefix}', ${index})" title="Siguiente">➡️</button>
      </div>
      <label class="sin-ordeno-check mt-1">
        <input type="checkbox" data-animal="${animal}" class="${prefix}-sin-ordeno"
               onchange="toggleSinOrdeno(this, '${prefix}')"> Sin ordeño
      </label>
    </div>
  `}).join('');
}

function focusNextAnimal(prefix, currentIndex) {
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO')).map(a => a.nombre);
    if (currentIndex < lactantes.length - 1) {
        const nextAnimal = lactantes[currentIndex + 1];
        const nextInput = document.getElementById(`${prefix}-litros-${nextAnimal}`);
        if (nextInput) {
            nextInput.focus();
            nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        const submitBtn = document.querySelector(`#panel-${prefix} button[type="submit"]`);
        if (submitBtn) {
            submitBtn.focus();
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
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
    // All selectors use the live census; celo-animal only shows cows and heifers
    const censo = currentHerdCenso || [];
    const allNames = censo.length > 0 ? censo.map(a => a.nombre) : ANIMALES;

    // Filter rules per selector
    const isCeloEligible = name => {
        const n = name.toLowerCase();
        return !n.includes('toro') && !n.includes('ternero');
    };

    const selectorRules = {
        'celo-animal': allNames.filter(isCeloEligible),
        'insem-animal': allNames.filter(isCeloEligible),
        'nac-madre': allNames.filter(isCeloEligible),
        'otro-animal': allNames
    };

    Object.entries(selectorRules).forEach(([selectId, names]) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">— Seleccionar —</option>';
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = `${getAnimalEmoji(name)} ${name}`;
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
        read: false // Changed from 'seen' to 'read' for consistency with renderNotifications
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
            // Removiendo .where('userId', '==', currentUser.name) para que sean globales
            .where('read', '==', false) // Changed from 'seen' to 'read'
            .orderBy('timestamp', 'desc')
            .limit(30) // Aumentamos límite para compartir
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
            .where('tipo', '==', 'inseminacion')
            .where('estado', '==', 'Preñada')
            .get();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        snapshot.forEach(doc => {
            const data = doc.data();
            const fechaIns = parseAnyDate(data.fecha);
            if (!isNaN(fechaIns)) {
                let fechaParto;
                if (data.fechaEstimadaParto) {
                    fechaParto = parseAnyDate(data.fechaEstimadaParto);
                } else {
                    fechaParto = new Date(fechaIns);
                    fechaParto.setDate(fechaParto.getDate() + 283);
                }

                const diffTime = fechaParto - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let notificationType = '';
                let prefix = '';

                if (diffDays === 30 || diffDays === 15 || (diffDays <= 5 && diffDays >= 0)) {
                    prefix = diffDays <= 5 ? '🚨 CRÍTICO' : diffDays <= 15 ? '🔔 RECORDATORIO' : '📅 PRÓXIMO';
                    const msg = `${prefix}: Parto de "${data.animal}" en ${diffDays} días (Est. ${formatDate(fechaParto)})`;

                    // Solo añadir si no existe ya para hoy (o texto exacto)
                    if (!notifications.some(n => n.text === msg)) {
                        addNotification(msg, 'parto'); // Changed type to 'parto'
                    }
                }
            }
        });
    } catch (e) { console.warn('Error checking birth alerts', e); }
}

async function checkPurgeAlerts() {
    if (!db || !currentUser) return;
    try {
        const snapshot = await db.collection('vacunaciones')
            .where('tipo', '==', 'Purga')
            .get();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        snapshot.forEach(doc => {
            const data = doc.data();
            const fechaPurga = parseAnyDate(data.fecha);
            if (!isNaN(fechaPurga)) {
                const diffTime = today - fechaPurga;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 8) {
                    const msg = `💉 PURGA (8 días): Revisar reacción o refuerzo para ${data.animal || 'el hato'}.`;
                    if (!notifications.some(n => n.text === msg)) {
                        addNotification(msg, 'vacuna'); // Changed type to 'vacuna'
                    }
                }
            }
        });
    } catch (e) { console.warn('Error checking purge alerts', e); }
}

function renderNotifications() {
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">No hay notificaciones nuevas</div>';
        return;
    }

    list.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? 'read' : ''}">
            <div class="notification-icon">${n.type === 'parto' ? '🐄' : n.type === 'vacuna' ? '💉' : '🔔'}</div>
            <div class="notification-body">
                <div class="notification-text">${escapeHTML(n.text)}</div>
                <div class="notification-time">${escapeHTML(n.time)}</div>
            </div>
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
    document.getElementById('vacunacion-fields').classList.toggle('hidden', tipo !== 'vacunacion');
    document.getElementById('otro-fields').classList.toggle('hidden', tipo !== 'otro');
}

// ─── FORM HANDLERS ──────────────────────────────────────────

async function handleEvento(e) {
    e.preventDefault();
    const tipo = document.getElementById('evento-tipo').value;

    if (tipo === 'vacunacion') {
        const btn = e.target.querySelector('button[type="submit"]');
        return handleVacunacion(btn);
    }

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
        payload.fechaDiagnostico = document.getElementById('insem-fecha-diag').value;

        let partoStr = document.getElementById('insem-fecha-parto').value;
        if (payload.estado === 'Preñada' && !partoStr) {
            const insemDateObj = new Date(payload.fecha + 'T12:00:00');
            insemDateObj.setDate(insemDateObj.getDate() + 283);
            const y = insemDateObj.getFullYear();
            const m = String(insemDateObj.getMonth() + 1).padStart(2, '0');
            const d = String(insemDateObj.getDate()).padStart(2, '0');
            partoStr = `${y}-${m}-${d}`;
        }
        payload.fechaEstimadaParto = partoStr;

        if (!payload.animal) {
            showToast('Selecciona el animal', 'error');
            return;
        }
    } else if (tipo === 'nacimiento') {
        payload.producto = document.getElementById('vacu-producto').value;
        payload.dosis = document.getElementById('vacu-dosis').value;
        payload.lote = document.getElementById('vacu-lote').value;
        payload.administrador = document.getElementById('vacu-administrador').value;
        payload.observaciones = document.getElementById('vacu-observaciones').value;
        const diasRetiro = parseInt(document.getElementById('vacu-dias-retiro')?.value) || 0;
        payload.diasRetiro = diasRetiro;

        if (diasRetiro > 0) {
            const dateRetiro = new Date(payload.fecha);
            dateRetiro.setDate(dateRetiro.getDate() + diasRetiro);
            payload.fechaLiberacion = dateRetiro.toISOString().split('T')[0];

            // Actualizar la vaca en hato_detalle
            if (payload.animal) {
                if (db) {
                    db.collection('hato_detalle').doc(getAnimalDocId(payload.animal)).update({
                        retiroHasta: payload.fechaLiberacion
                    }).catch(err => console.warn('No se pudo actualizar retiro en hato_detalle', err));
                }
            } else {
                // Si fue el hato entero
                if (currentHerdCenso) {
                    currentHerdCenso.forEach(a => {
                        if (db) {
                            db.collection('hato_detalle').doc(getAnimalDocId(a.nombre)).update({
                                retiroHasta: payload.fechaLiberacion
                            }).catch(err => console.warn('No se pudo actualizar retiro en hato', err));
                        }
                    });
                }
            }
            showToast(`Atención: Retiro de leche de ${diasRetiro} días guardado.`, 'warning');
        }

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
    await saveToCloud(payload, btn, 'evento-success', 'evento-form');
}

// Initial badge update
document.addEventListener('DOMContentLoaded', () => {
    updateNotificationBadge();
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
    await saveToCloud(payload, btn, 'gasto-success', 'gasto-form');
}


// ─── API & FIREBASE COMMUNICATION ──────────────────────────

async function saveToCloud(data, btn, successId, formId) {
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

            setDirty(false); // Clear dirty flag on success
            showSyncSuccess(successId);
            if (formId) resetForm(formId);
            showToast('🔥 Guardado en Firebase', 'success');
            return;
        }

        if (APPS_SCRIPT_URL === 'TU_URL_DE_APPS_SCRIPT_AQUI') {
            await new Promise(r => setTimeout(r, 800));
            if (formId) resetForm(formId);
            setDirty(false);
            showSyncSuccess(successId);
            showToast('✅ Registro guardado (modo demo)', 'success');
            return;
        }

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            setDirty(false);
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
                'vacunaciones': 'vacunaciones',
                'rentabilidad': 'produccion',
                'gastos_mes': 'gastos'
            };
            const coll = collectionMap[accion];
            if (!coll) return getDemoData(accion);

            // ─── CRITICAL FIX: Filter produccion by month and year ───────────
            let fetchPromise;
            if ((accion === 'produccion_mes' || accion === 'rentabilidad' || accion === 'gastos_mes') && params.mes !== undefined && params.anio !== undefined) {
                const mes = parseInt(params.mes);
                const anio = parseInt(params.anio);
                // Build date range for the month
                const firstDay = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
                const lastDay = new Date(anio, mes + 1, 0);
                const lastDayStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

                let tgtColl = coll;
                if (accion === 'gastos_mes') tgtColl = 'gastos';

                fetchPromise = db.collection(tgtColl)
                    .where('fecha', '>=', firstDay)
                    .where('fecha', '<=', lastDayStr)
                    .orderBy('fecha', 'desc')
                    .get();
            } else {
                fetchPromise = db.collection(coll).get();
            }

            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Fetch Sheets')), 5000));
            const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
            const filas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // If it's the events collection, filter by the requested event type
                if (coll === 'eventos') {
                    const tipoMap = {
                        'inseminaciones': ['Inseminación', 'inseminacion'],
                        'nacimientos': ['Nacimiento', 'nacimiento'],
                        'celos': ['Celo', 'celo']
                    };

                    const validTypes = tipoMap[accion] || [];
                    if (validTypes.includes(data.tipo)) {
                        data.id = doc.id;
                        filas.push(data);
                    }
                } else {
                    data.id = doc.id; // Asegurar que todas las demás colecciones (incluyendo gastos) tengan ID
                    filas.push(data);
                }
            });
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
    const nac = await fetchFromSheets('nacimientos');
    const vac = await fetchFromSheets('vacunaciones');

    let totalMes = 0;
    let diasUnicos = new Set();

    if (prod?.filas) {
        prod.filas.forEach(f => {
            totalMes += f.total || 0;
            if (f.fecha) diasUnicos.add(f.fecha);
        });
    }

    const dias = diasUnicos.size > 0 ? diasUnicos.size : 1;
    setStatText('stat-total-litros', totalMes.toFixed(0));
    setStatText('stat-promedio', (totalMes / dias).toFixed(1));
    const activeAnimals = (currentHerdCenso || []).filter(a => a.status !== 'Retirado');
    setStatText('stat-animales', activeAnimals.length > 0 ? activeAnimals.length : ANIMALES.length);

    let prenadas = 0;
    if (insem?.filas) {
        const latestInsem = {};
        insem.filas.forEach(f => {
            if (!f.animal || !f.fecha) return;
            const d = new Date(f.fecha);
            if (isNaN(d)) return;
            if (!latestInsem[f.animal] || d > new Date(latestInsem[f.animal].fecha)) {
                latestInsem[f.animal] = f;
            }
        });
        prenadas = Object.values(latestInsem).filter(f => f.estado === 'Preñada').length;
    }
    setStatText('stat-prenadas', prenadas);

    loadGestacion(insem);
    checkPartoAlerts();
    checkPurgeAlerts();
    renderDashboardUpdates(nac, vac, insem);
}

function renderDashboardUpdates(nac, vac, insem) {
    const container = document.getElementById('dashboard-novedades-list');
    if (!container) return;

    const updates = [];
    const hoy = new Date();
    const hace7dias = new Date(hoy.getTime() - (7 * 24 * 60 * 60 * 1000));

    // 1. Nacimientos recientes (7 días)
    if (nac?.filas) {
        nac.filas.forEach(f => {
            const fNac = parseAnyDate(f.fecha);
            if (fNac >= hace7dias) {
                updates.push({
                    icon: '🍼',
                    title: `Nacimiento reciente: ${f.cria}`,
                    desc: `Madre: ${f.madre} | Fecha: ${formatDate(fNac)}`,
                    type: 'success',
                    date: fNac
                });
            }
        });
    }

    // 2. PRÓXIMOS 2 PARTOS (Sin importar la fecha, usando el último registro por animal)
    if (insem?.filas) {
        // Group to get only the latest "Preñada" status per animal
        const latestPregnancy = {};
        insem.filas.forEach(f => {
            if (f.estado === 'Preñada' && f.fechaEstimadaParto) {
                const d = new Date(f.fecha);
                if (!latestPregnancy[f.animal] || d > new Date(latestPregnancy[f.animal].fecha)) {
                    latestPregnancy[f.animal] = {
                        ...f,
                        fParto: parseAnyDate(f.fechaEstimadaParto)
                    };
                }
            }
        });

        const proximosPartos = Object.values(latestPregnancy)
            .filter(f => f.fParto >= new Date(hoy.getTime() - (2 * 24 * 60 * 60 * 1000))) // Allow 2 days overdue to stay on dashboard
            .sort((a, b) => a.fParto - b.fParto)
            .slice(0, 2); // Solo los 2 más cercanos

        proximosPartos.forEach(f => {
            const diff = Math.ceil((f.fParto - hoy) / (1000 * 60 * 60 * 24));
            updates.push({
                icon: '🐄',
                title: `Próximo parto: ${f.animal}`,
                desc: `Fecha estimada: ${formatDate(f.fParto)} (${diff} días restantes)`,
                type: 'warning',
                date: new Date(hoy.getTime() + 1000000), // Force to top by giving a "future" importance
                priority: 1 // Custom field to ensure they stay at top
            });
        });
    }

    // 3. Vacunas recientes (7 días)
    if (vac?.filas) {
        vac.filas.forEach(f => {
            const fVac = parseAnyDate(f.fecha);
            if (fVac >= hace7dias) {
                updates.push({
                    icon: '💉',
                    title: `${f.tipo}: ${f.tratamiento}`,
                    desc: `Animal: ${f.animal || 'Hato'} | ${formatDate(fVac)}`,
                    type: 'info',
                    date: fVac
                });
            }
        });
    }

    if (updates.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-muted">Sin novedades relevantes.</div>';
        return;
    }

    // Render logic (Sorted by priority then date)
    container.innerHTML = updates
        .sort((a, b) => {
            if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);
            return b.date - a.date;
        })
        .map(up => `
        <div class="update-item" style="border-left: 4px solid var(--${up.type}); margin-bottom: 10px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 1.5rem;">${up.icon}</div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.95rem;">${up.title}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">${up.desc}</div>
            </div>
        </div>
    `).join('');
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
        const fInsem = parseAnyDate(f.fecha);
        let fParto;
        if (f.fechaEstimadaParto) {
            fParto = parseAnyDate(f.fechaEstimadaParto);
        } else {
            fParto = new Date(fInsem.getTime() + (283 * 24 * 60 * 60 * 1000));
        }
        const diffTime = fParto - hoy;
        const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...f, fParto, diasRestantes };
    }).sort((a, b) => {
        // Strict chronological order for gestation table (next to calve first)
        if (isNaN(a.fParto)) return 1;
        if (isNaN(b.fParto)) return -1;
        return a.fParto - b.fParto; // Show closest to calving first
    });

    preneces.forEach(p => {
        const isOld = p.diasRestantes < -60;
        if (isOld) return;

        let statusBadge = `<span class="badge bg-secondary">${p.estado}</span>`;
        if (p.estado === 'Preñada') statusBadge = `<span class="badge bg-success">Preñada</span>`;
        if (p.estado === 'Vacía') statusBadge = `<span class="badge bg-danger">Vacía</span>`;

        let diasBadge = `${p.diasRestantes} días`;
        if (p.diasRestantes < 0) diasBadge = `Hace ${Math.abs(p.diasRestantes)} días`;

        let rowClass = '';
        if (p.estado === 'Preñada' && p.diasRestantes <= 30 && p.diasRestantes >= -5) {
            let alertMsg = '';
            let alertLevel = 'info';

            if (p.diasRestantes <= 5 && p.diasRestantes >= 0) {
                alertLevel = 'danger';
                alertMsg = `⚠️ CRÍTICO: Faltan ${p.diasRestantes} días para el parto.`;
            } else if (p.diasRestantes <= 15) {
                alertLevel = 'warning';
                alertMsg = `🔔 RECORDATORIO: Faltan ${p.diasRestantes} días (revisar ubre).`;
            } else if (p.diasRestantes <= 30) {
                alertLevel = 'info';
                alertMsg = `📅 PRÓXIMO: Faltan ${p.diasRestantes} días (preparar lugar).`;
            }

            if (alertMsg) {
                rowClass = alertLevel === 'danger' ? 'table-danger' : alertLevel === 'warning' ? 'table-warning' : 'table-info';
                hasAlerts = true;
                alertsHtml += `
            <div class="stat-card" style="border-left: 4px solid var(--${alertLevel === 'danger' ? 'danger' : 'warning'});">
                <div class="stat-icon" style="background:${alertLevel === 'danger' ? '#fee2e2' : '#fef3c7'}; color:${alertLevel === 'danger' ? '#ef4444' : '#d97706'};">🐄</div>
                <div>
                    <div class="stat-label">${escapeHTML(p.animal)}</div>
                    <div class="stat-value" style="font-size:1.1rem; color:${alertLevel === 'danger' ? '#ef4444' : '#b45309'};">${escapeHTML(alertMsg)}</div>
                    <div style="font-size:0.8rem; color:#6b7280;">Parto est: ${formatDate(p.fParto)}</div>
                </div>
            </div>`;
            }
        }

        html += `<tr class="${rowClass}">
            <td><strong>${getAnimalEmoji(p.animal)} ${p.animal}</strong></td>
            <td>${formatDate(p.fecha)}</td>
            <td>${p.toro || '-'}</td>
            <td><strong>${formatDate(p.fParto)}</strong></td>
            <td>${diasBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditInsemModal('${p.id || ''}')" title="Editar">📝</button>
                <button class="btn btn-sm btn-outline-danger" style="padding:2px 6px; font-size:0.75rem; margin-left:4px;" onclick="eliminarGestacion('${p.id || ''}')" title="Eliminar Registro">🗑️</button>
            </td>
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

function updatePrecioPorKg() {
    const bulto = parseFloat(document.getElementById('concentrado-precio-bulto').value) || 0;
    const kg = bulto / 40;
    document.getElementById('concentrado-precio-kg').value = kg.toFixed(0);
    recalcRentabilidad();
}

// ─── ANÁLISIS AUTOMÁTICO DEL MES ───────────────────────────

const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

async function generarAnalisisMes() {
    if (!lastRentabilidadData) {
        lastRentabilidadData = {
            totalLitros: 0,
            ingresos: 0,
            gastos: 0,
            ganancia: 0,
            margen: 0,
            mejorVaca: 'N/A',
            peorVaca: 'N/A',
            precioVenta: 0,
            costoPorLitro: 0
        };
    }

    // These fields are now always set by renderRentabilidad() or the fallback above
    const { totalLitros = 0, ingresos = 0, gastos = 0, ganancia = 0, margen = 0, mejorVaca = 'N/A', peorVaca = 'N/A', precioVenta = 0, costoPorLitro = 0 } = lastRentabilidadData;

    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const mesNombre = mesEl ? MESES_NOMBRES[parseInt(mesEl.value)] : '';
    const anio = anioEl ? anioEl.value : '';

    // Read investor total from the new per-cow section
    const totalInversionistas = document.getElementById('inversores-total-pago')?.textContent || '$0';

    let semaforoMsg = "🔴 <strong>Estatus Financiero: PÉRDIDA / CRÍTICO.</strong> El margen es negativo. Se recomienda revisar urgentemente los costos operativos o la eficiencia de producción.";
    if (margen > 30) {
        semaforoMsg = "🟢 <strong>Estatus Financiero: ÓPTIMO.</strong> El hato presenta una salud financiera excelente con un margen superior al 30%. Es un momento ideal para reinversión.";
    } else if (margen >= 10) {
        semaforoMsg = "🟡 <strong>Estatus Financiero: ADECUADO.</strong> La operación es rentable y cubre costos, aunque el margen neto sugiere que hay espacio para optimizar el gasto en concentrado o insumos.";
    }

    const analisis = `
        <h3 style="margin-top:0;">👨‍🏫 Informe de Auditoría Contable — ${mesNombre} ${anio}</h3>
        <p>${semaforoMsg}</p>
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:15px 0;">
        <div style="font-size: 0.9rem; line-height: 1.6;">
            <p><strong>1. Desempeño Operativo:</strong> Se registraron <strong>${formatNumber(totalLitros)} litros</strong> de producción total. Con un precio unitario de $${formatNumber(precioVenta || 0)}, el ingreso bruto consolidado es de <strong>$${formatNumber(ingresos)}</strong>.</p>
            
            <p><strong>2. Eficiencia de Costos:</strong> El costo de producción por litro se sitúa en <strong>$${formatNumber(costoPorLitro || 0)}</strong>. El margen de contribución neta post-operación es del <strong>${(margen || 0).toFixed(1)}%</strong>. Gastos totales: $${formatNumber(gastos)}.</p>
            
            <p><strong>3. Rendimiento Individual:</strong> La unidad productiva más eficiente fue <strong>${mejorVaca || '(sin datos)'}</strong>. Se sugiere auditar el manejo de <strong>${peorVaca || '(sin datos)'}</strong> para identificar fugas de rentabilidad por alimentación excedente.</p>
            
            <p><strong>4. Retribución a Capital:</strong> La utilidad neta líquida disponible para socios (según configuración de inversores) asciende a <strong>${totalInversionistas}</strong> para este cierre contable.</p>
            
            <p><strong>Conclusión:</strong> Basado en el flujo de caja, el proyecto se encuentra en una posición ${(ganancia || 0) > 0 ? "sostenible" : "de riesgo"}. Se adjunta desglose por categorías en el reporte PDF para su debida revisión.</p>
        </div>
    `;

    const card = document.getElementById('analisis-card');
    const texto = document.getElementById('analisis-texto');

    if (card && texto) {
        texto.innerHTML = analisis;
        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast('✅ Auditoría generada', 'success');
}


// ─── EXPORTAR REPORTE PDF COMPLETO ──────────────────────────

async function exportarReportePDF() {
    if (!lastRentabilidadData) {
        lastRentabilidadData = {
            totalLitros: 0,
            ingresos: 0,
            gastos: 0,
            ganancia: 0,
            margen: 0,
            mejorVaca: 'N/A',
            peorVaca: 'N/A',
            precioVenta: 0,
            costoPorLitro: 0
        };
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
        const { totalLitros = 0, ingresos = 0, gastos = 0, ganancia = 0, margen = 0, costoPorLitro = 0 } = lastRentabilidadData;
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        const kpis = [
            [`Total Litros: ${formatNumber(totalLitros)} L`, `Ingresos: $${formatNumber(ingresos)}`],
            [`Gastos: $${formatNumber(gastos)}`, `Ganancia: $${formatNumber(ganancia)}`],
            [`Margen: ${formatNumber(margen)}%`, `Costo/Litro: $${formatNumber(costoPorLitro)}`],
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
            const rawText = analisisEl.textContent.replace(/\s+/g, ' ').trim();
            const lines = pdf.splitTextToSize(rawText, 180);
            pdf.text(lines, 15, y);
            y += lines.length * 5 + 5;
        }

        // Capture charts
        const reportContainer = document.getElementById('reporte-container');
        if (reportContainer) {
            // Temporarily hide elements not needed in PDF
            const toHide = document.querySelectorAll('.btn-pamora, .section-header select, .section-header button');
            toHide.forEach(el => el.style.visibility = 'hidden');

            // Critical CSS override to prevent cutting off long analysis text
            const ogHeight = reportContainer.style.height;
            const ogOverflow = reportContainer.style.overflow;
            const ogMaxHeight = reportContainer.style.maxHeight;

            reportContainer.style.height = 'auto';
            reportContainer.style.maxHeight = 'none';
            reportContainer.style.overflow = 'visible';

            try {
                // Ensure charts are rendered with high quality and a white background for printing (saves ink and looks cleaner)
                const canvas = await html2canvas(reportContainer, {
                    backgroundColor: '#ffffff', // White background for PDF
                    scale: 2, // Higher resolution
                    useCORS: true,
                    logging: false,
                    scrollY: -window.scrollY, // Prevent cutoff from scrolling
                    windowWidth: document.documentElement.offsetWidth,
                    windowHeight: reportContainer.scrollHeight + 100 // Force canvas to see everything
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgWidth = 190; // Slightly larger to use more page width
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                if (y + imgHeight > 280) {
                    pdf.addPage();
                    y = 15;
                } else {
                    y += 10;
                }

                pdf.setFontSize(14);
                pdf.setTextColor(34, 197, 94);
                pdf.text('📊 Desglose Visual', 15, y);
                y += 8;

                pdf.addImage(imgData, 'JPEG', 10, y, imgWidth, imgHeight);
            } catch (canvasErr) {
                console.error('Error capturing charts for PDF:', canvasErr);
            }

            // Restore elements and scroll
            toHide.forEach(el => el.style.visibility = 'visible');
            reportContainer.style.height = ogHeight;
            reportContainer.style.overflow = ogOverflow;
            reportContainer.style.maxHeight = ogMaxHeight;
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


let herdInventoryMeta = {}; // Stores animal category, breed, birthdate
// Helper to avoid Firestore path issues with names like "Hércules/Ranger"
function getAnimalDocId(name) {
    if (!name) return 'unknown';
    return name.toString().replace(/\//g, '_').trim();
}

let currentHerdCenso = [];  // To allow CSV export

async function loadHerdInventory() {
    if (!db) {
        showToast('Inventario requiere Firebase', 'warning');
        return;
    }

    // Auto-cleanup header rows if they exist
    cleanupHeaderRows();

    const tbody = document.getElementById('hato-inventory-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:20px;">🔍 Analizando hato y eventos...</td></tr>';

    try {
        updateSyncProgress(75, 'Obteniendo metadatos del hato...');

        // Use a 10s timeout for Firestore queries to avoid infinite hang
        const fetchPromise = db.collection('hato_detalle').get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Firestore Detail')), 10000));

        updateSyncProgress(80, 'Descargando detalles del hato...');
        const metaSnap = await Promise.race([fetchPromise, timeoutPromise]);

        updateSyncProgress(90, 'Procesando censo...');
        herdInventoryMeta = {};
        const allAnimalNamesInMeta = [];
        metaSnap.forEach(doc => {
            const data = doc.data();
            // Index by nombre (real name) not doc.id (sanitized), with fallback to doc.id
            const realName = data.nombre || doc.id.replace(/_/g, '/');
            herdInventoryMeta[realName] = data;
            allAnimalNamesInMeta.push(realName);
        });

        // 2. Determine physiological state
        const hatoDetalle = [];
        let countProduccion = 0;
        let countNoProd = 0;
        let countActivos = 0;

        // Use all real names from metadata for the census (source of truth)
        for (const animal of allAnimalNamesInMeta) {
            let meta = herdInventoryMeta[animal] || {};
            if (meta.status !== 'Retirado') countActivos++;

            let idAnimal = meta.idAnimal || '—';
            let raza = meta.raza || '—';
            let fechaNac = meta.fechaNacimiento ? formatDate(meta.fechaNacimiento) : '—';
            let padre = meta.padre || '—';
            let madre = meta.madre || '—';
            let registro = meta.registro || '—';
            let fechaBaja = meta.fechaRetiro ? formatDate(meta.fechaRetiro) : '—';
            let causaBaja = meta.motivoRetiro || '—';
            let category = meta.categoria || 'Vaca (Producción)';

            // Expert Classification Logic (Standardized)
            let estado = 'LACTANDO 🥛';
            let colorEstado = '#4ade80';

            if (meta.status === 'Retirado' || category === 'Vendida' || category === 'Baja') {
                estado = meta.motivoRetiro ? `VENDIDA/BAJA (${meta.motivoRetiro})` : 'VENDIDA/BAJA';
                colorEstado = '#ef4444';
            } else {
                // Default to category name as state
                estado = category;
                if (category === 'Vaca (Producción)') {
                    estado = 'LACTANDO 🥛';
                    colorEstado = '#4ade80';
                } else if (category === 'Vaca (Secando)') {
                    estado = 'SECANDO 💤';
                    colorEstado = '#f59e0b';
                } else if (category === 'Próxima parto') {
                    estado = 'PRÓXIMA PARTO 🐄';
                    colorEstado = '#a78bfa';
                } else if (['Ternera', 'Novilla'].includes(category)) {
                    estado = 'TERNERA 🌱';
                    colorEstado = '#60a5fa';
                } else if (category === 'Ternero') {
                    estado = 'TERNERO 🐃';
                    colorEstado = '#fb7185';
                }
            }

            if (estado.includes('LACTANDO')) {
                countProduccion++;
            } else if (meta.status !== 'Retirado') {
                countNoProd++;
            }

            hatoDetalle.push({
                idAnimal,
                nombre: animal,
                raza,
                fechaNac,
                padre,
                madre,
                registro,
                estado: estado,
                color: colorEstado,
                baja: (meta.status === 'Retirado' || category === 'Vendida' || category === 'Baja') ? `${fechaBaja} (${causaBaja})` : '—'
            });
        }

        // Update Global Animal List (Source of Truth)
        ANIMALES = hatoDetalle.map(a => a.nombre);

        currentHerdCenso = hatoDetalle;
        renderHerdInventory(hatoDetalle, countProduccion, countNoProd, countActivos);

        // Refresh all UI pickers and grids
        buildAnimalInputs('ordeno-animal-grid', 'ordeno');
        buildAnimalSelectors();
        renderConfigAnimales();

        // After loading inventory, trigger a rentability recalc
        buildDietInputs(); // Ensure diet grid is built
        recalcRentabilidad();

    } catch (e) {
        console.error('Error in loadHerdInventory:', e);
        showToast('Error al procesar censo dinámico', 'error');
    } finally {
        updateSyncProgress(100, 'Sincronización terminada ✅');
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'none';
            updateSyncProgress(null);
        }, 800);
    }
}

function openImportExcelModal() {
    document.getElementById('import-excel-data').value = '';
    document.getElementById('modal-import-excel').style.display = 'flex';
}

function closeImportExcelModal() {
    document.getElementById('modal-import-excel').style.display = 'none';
}

// Helper for robust TSV parsing (handles quotes and multiline cells from Excel)
function parseTSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === '\t') {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentCell.trim());
                if (currentRow.length > 1 || currentRow[0] !== "") {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    return rows;
}

async function processExcelImport() {
    const rawData = document.getElementById('import-excel-data').value.trim();
    if (!rawData) {
        showToast('Pega datos de Excel primero', 'warning');
        return;
    }

    const rows = parseTSV(rawData);
    const newAnimalsList = [];
    const metaBatch = {};

    rows.forEach((cols, index) => {
        // Skip header row if detected
        if (index === 0 && (cols[0]?.toLowerCase().includes('id') || cols[1]?.toLowerCase().includes('nombre'))) {
            return;
        }

        if (cols.length >= 2) {
            const id = cols[0] || '';
            const name = cols[1];
            if (!name) return;

            const raza = cols[2] || '';
            const birth = cols[3] || '';
            const father = cols[4] || '';
            const mother = cols[5] || '';
            const register = cols[6] || '';
            const rawStatus = (cols[7] || '').toLowerCase().trim();
            const dateRetiro = cols[8] || '';
            const causeValue = cols[9] || '';
            const notes = cols[10] || '';

            // Detect Category from rawStatus (Spanish values)
            let category = 'Vaca (Producción)'; // default
            if (rawStatus.includes('lactando')) {
                category = 'Vaca (Producción)';
            } else if (rawStatus.includes('secando') || rawStatus.includes('secas')) {
                category = 'Vaca (Secando)';
            } else if (rawStatus.includes('próxima parto') || rawStatus.includes('proxima parto')) {
                category = 'Próxima parto';
            } else if (rawStatus.includes('ternero')) {
                category = 'Ternero';
            } else if (rawStatus.includes('ternera')) {
                category = 'Ternera';
            } else if (rawStatus.includes('novilla')) {
                category = 'Novilla';
            } else if (rawStatus.includes('toro')) {
                category = 'Toro';
            } else if (rawStatus.includes('vendida') || rawStatus.includes('vendido')) {
                category = 'Vendida';
            } else if (rawStatus.includes('baja')) {
                category = 'Baja';
            }

            // Detect Retire Status
            let status = 'Activo';
            if (rawStatus.includes('vendida') || rawStatus.includes('vendido') || rawStatus.includes('baja') || dateRetiro) {
                status = 'Retirado';
            }

            newAnimalsList.push(name);

            metaBatch[name] = {
                idAnimal: id,
                nombre: name,
                raza: raza,
                fechaNacimiento: birth,
                padre: father,
                madre: mother,
                registro: register,
                status: status,
                fechaRetiro: dateRetiro,
                motivoRetiro: causeValue || (rawStatus.includes('vendida') ? 'Venta' : (rawStatus.includes('baja') ? 'Baja' : '')),
                notas: notes,
                categoria: category
            };
        }
    });

    if (Object.keys(metaBatch).length === 0) {
        showToast('No se encontraron registros válidos', 'error');
        return;
    }

    if (!db) {
        showToast('Modo demo: No se puede guardar en Firestore', 'warning');
        return;
    }

    try {
        showToast(`Importando ${Object.keys(metaBatch).length} animales...`, 'info');

        // 1. Update global animal list in Firestore
        await db.collection('config').doc('hato').set({ animales: newAnimalsList }, { merge: true });

        // 2. Batch update animal details
        const batch = db.batch();
        for (const [name, data] of Object.entries(metaBatch)) {
            const docRef = db.collection('hato_detalle').doc(getAnimalDocId(name));
            batch.set(docRef, { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        await batch.commit();

        ANIMALES = newAnimalsList;
        showToast('Censo sincronizado con éxito ✅', 'success');
        closeImportExcelModal();

        // Force complete refresh of the app state
        await loadHerdInventory();
    } catch (e) {
        console.error('Import error:', e);
        showToast('Error en la sincronización: ' + e.message, 'error');
    }
}

async function exportAllDataToCSV() {
    if (!db) { showToast('No hay conexión con la base de datos', 'warning'); return; }
    showToast('Generando reporte total...', 'info');

    try {
        const inventory = await db.collection('hato_detalle').get();
        const events = await db.collection('eventos').get();
        const vaccines = await db.collection('vacunaciones').get();

        let csv = '\uFEFF';
        csv += '--- CENSO DEL HATO ---\n';
        csv += 'ID Animal,Nombre,Raza,Fecha Nacimiento,Padre,Madre,Registro,Estado,Notas\n';
        inventory.forEach(doc => {
            const d = doc.data();
            csv += `"${d.idAnimal || ''}","${d.nombre || ''}","${d.raza || ''}","${d.fechaNacimiento || ''}","${d.padre || ''}","${d.madre || ''}","${d.registro || ''}","${d.estado || ''}","${(d.notas || '').replace(/"/g, '""')}"\n`;
        });

        csv += '\n--- REGISTRO DE NACIMIENTOS ---\n';
        csv += 'Fecha,Madre,Cria,Sexo,Peso,Complicaciones,Notas\n';
        events.forEach(doc => {
            const d = doc.data();
            if (d.tipo === 'Nacimiento') {
                csv += `"${d.fecha || ''}","${d.madre || d.animal || ''}","${d.cria || ''}","${d.sexo || ''}","${d.peso || ''}","${(d.complicaciones || '').replace(/"/g, '""')}","${(d.observaciones || '').replace(/"/g, '""')}"\n`;
            }
        });

        csv += '\n--- REGISTRO SANITARIO (VACUNAS/PURGAS) ---\n';
        csv += 'Fecha,Animal,Tipo,Tratamiento,Dosis,Administrador,Notas\n';
        vaccines.forEach(doc => {
            const d = doc.data();
            csv += `"${d.fecha || ''}","${d.animal || ''}","${d.tipo || ''}","${d.tratamiento || ''}","${d.dosis || ''}","${d.administrador || ''}","${(d.observaciones || '').replace(/"/g, '""')}"\n`;
        });

        csv += '\n--- CONTROL DE GESTACIÓN ---\n';
        csv += 'Animal,Fecha Insem,Toro,F. Est Parto,Estado\n';
        events.forEach(doc => {
            const d = doc.data();
            if (d.tipo === 'Inseminación' && d.estado !== 'No Preñada') {
                csv += `"${d.animal || ''}","${d.fecha || ''}","${d.toro || ''}","${d.fechaEstimadaParto || ''}","${d.estado || ''}"\n`;
            }
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'Reporte_Total_Pamora_' + new Date().toISOString().split('T')[0] + '.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Reporte CSV descargado ✅', 'success');
    } catch (e) {
        console.error('Export error:', e);
        showToast('Error al exportar datos', 'error');
    }
}

function renderHerdInventory(items, prod, noprod, activos) {
    const tbody = document.getElementById('hato-inventory-tbody');
    if (!tbody) return;

    document.getElementById('censo-total').textContent = activos || items.length;
    document.getElementById('censo-produccion').textContent = prod;
    document.getElementById('censo-no-productivo').textContent = noprod;

    tbody.innerHTML = items.map(item => {
        const notas = herdInventoryMeta[item.nombre]?.notas || '';
        const notasHtml = notas ? `<span title="${escapeHTML(notas)}" style="cursor:help; color:#60a5fa;">📝</span>` : '';
        const escapedName = item.nombre.replace(/'/g, "\\'");

        return `
            <tr>
                <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.idAnimal) || '—'}</td>
                <td><strong>${escapeHTML(item.nombre)}</strong></td>
                <td>${escapeHTML(item.raza)}</td>
                <td style="font-size:0.8rem;">${escapeHTML(item.fechaNac)}</td>
                <td style="font-size:0.8rem;">${escapeHTML(item.padre)}</td>
                <td style="font-size:0.8rem;">${escapeHTML(item.madre)}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(item.registro)}</td>
                <td><span style="color:${item.color}; font-weight:600;">${escapeHTML(item.estado)}</span></td>
                <td style="font-size:0.75rem; color:#ef4444;">${item.baja}</td>
                <td>${notasHtml}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditAnimalModal('${escapedName}')" title="Editar">📝</button>
                        <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem; background:#ef4444;" onclick="openRemoveAnimalModal('${escapedName}')" title="Retirar">📤</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ─── ALTA Y BAJA DE ANIMALES ────────────────────────────────

function openAddAnimalModal() {
    document.getElementById('add-animal-name').value = '';
    document.getElementById('add-animal-breed').value = '';
    document.getElementById('modal-add-animal').style.display = 'flex';
}

function closeAddAnimalModal() {
    document.getElementById('modal-add-animal').style.display = 'none';
}

async function seedInitialHerd() {
    if (!confirm('¿Desea cargar el hato completo (20 animales)? Esto reemplazará los registros existentes con datos actualizados.')) return;
    if (!db) { showToast('Acción no disponible en modo Demo', 'warning'); return; }

    // ─── HATO COMPLETO (Actualizado Marzo 2026) ────────────────────────────────
    const initialHerd = [
        { name: 'Moli', id: '', breed: 'Holstein', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Dulce', id: '', breed: 'Ayrshire', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Morocha', id: '', breed: 'Angus', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Miel', id: '2115', breed: 'Montbeliarde/Holstein', birth: '2023-04-07', father: 'N19', mother: '1690-Montbeliarde', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Mapi', id: '2102', breed: 'Holstein', birth: '2023-01-09', father: 'Porsche 556HO1303', mother: '1981', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Hércules/Ranger', id: '', breed: 'Montbeliarde', birth: '2025-04-29', father: 'Ranger Red 7HO12344', mother: 'Miel', cat: 'Ternera', status: 'Activo', notes: '11/06/2025 cambio a 5 litros. 23/06/2025 cambio a 4 litros diarios. 24/07/2025 2L mañana 1L tarde. 29/07/2025 2L/día. 4 Agosto desteto Bambi y Tato, se les compra concentrado.' },
        { name: 'Conny', id: '', breed: 'Jersey', birth: '2024-11-27', cat: 'Ternera', status: 'Activo' },
        { name: 'Martina', id: '', breed: 'Holstein', birth: '2023-06-26', cat: 'Vendida', status: 'Retirado', reason: 'Baja Produccion', dateRet: '2026-02-14' },
        { name: 'Sol', id: '2112', breed: 'Holstein', birth: '2023-03-27', father: 'Gurú 14HO7794', mother: '2010', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Nube', id: '2114', breed: 'Holstein', birth: '2023-03-29', father: 'Gurú 14HO7794', mother: '2005', cat: 'Vaca (Producción)', status: 'Activo' },
        { name: 'Bambi', id: '', breed: 'Angus', birth: '2025-04-16', father: 'Holstein', mother: 'Morocha', cat: 'Ternera', status: 'Activo' },
        { name: 'Mandarina', id: '', breed: 'Normando', cat: 'Vendida', status: 'Retirado', reason: 'Cambio', dateRet: '2026-02-14', notes: '01/10/2025 aborto, 4 meses aprox.' },
        { name: 'Gurú', id: '', breed: 'Holstein', birth: '2025-06-13', father: 'Quick Work', mother: 'Nube', cat: 'Ternero', status: 'Activo' },
        { name: 'Augusto', id: '', breed: 'Angus', birth: '2025-06-06', cat: 'Vendida', status: 'Retirado', reason: 'Venta para crianza', dateRet: '2025-06-10' },
        { name: 'Lulu', id: '', breed: 'Holstein', birth: '2025-06-26', father: 'River Red 17HO16781', mother: 'Sol 2112', cat: 'Ternera', status: 'Activo', notes: 'destete lulu 15/10/2025: 2 tasas concentrado y 1 suplemento por ración' },
        { name: 'Consentida', id: '', breed: 'Holstein Red', birth: '2025-08-08', mother: 'Moli', cat: 'Ternera', status: 'Activo', notes: '24/10/2025 baja a 2.5L. 01/11/2025 1 taza concentrado. Destete 14/11/2025, 2 tazas concentrado.' },
        { name: 'MacFly', id: '', breed: 'Holstein Red', birth: '2025-09-23', father: 'Desconocido', mother: 'Martina', cat: 'Vendida', status: 'Retirado', reason: 'Venta para crianza' },
        { name: 'Chilindrina', id: '2143', breed: 'Holstein', birth: '2023-12-18', father: 'BUTLER 7HO12195', mother: '1881', cat: 'Próxima parto', status: 'Activo' },
        { name: 'Miel (2159)', id: '2159', breed: 'Montbeliarde/Holstein', birth: '2024-03-10', father: 'Ranger-Red 7HO12344', mother: '1690', cat: 'Próxima parto', status: 'Activo' },
        { name: 'Regalo', id: '', breed: 'Holstein', birth: '2026-02-10', father: 'FOX 0200H010911', mother: '2092', cat: 'Ternera', status: 'Activo' },
    ];

    try {
        showToast('Cargando hato inicial...', 'info');
        const batch = db.batch();
        const activeNames = [];

        initialHerd.forEach(a => {
            const ref = db.collection('hato_detalle').doc(getAnimalDocId(a.name));
            const data = {
                idAnimal: a.id || '',
                nombre: a.name,
                raza: a.breed || '',
                fechaNacimiento: a.birth || '',
                padre: a.father || '',
                madre: a.mother || '',
                registro: a.register || '',
                categoria: a.cat,
                status: a.status || 'Activo',
                motivoRetiro: a.reason || '',
                fechaRetiro: a.dateRet || '',
                notas: a.notes || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(ref, data, { merge: true });
            if (data.status === 'Activo') activeNames.push(a.name);
        });

        await batch.commit();

        // Update Global Config — replace with the complete active names list
        await db.collection('config').doc('hato').set({ animales: activeNames }, { merge: false });

        ANIMALES = activeNames;
        showToast('Hato inicial cargado con éxito 🚀', 'success');
        updateSyncProgress(95, 'Refrescando inventario...');
        await loadHerdInventory();
    } catch (e) {
        console.error('Error seeding herd:', e);
        showToast('Error en la carga inicial', 'error');
    }
}

async function saveNewAnimal() {
    const id = document.getElementById('add-animal-id').value.trim();
    const name = document.getElementById('add-animal-name').value.trim();
    const category = document.getElementById('add-animal-category').value;
    const breed = document.getElementById('add-animal-breed').value.trim();
    const birth = document.getElementById('add-animal-birth').value;
    const father = document.getElementById('add-animal-father').value.trim();
    const mother = document.getElementById('add-animal-mother').value.trim();
    const register = document.getElementById('add-animal-register').value.trim();

    if (!name) {
        showToast('Ingrese el nombre del animal', 'warning');
        return;
    }

    if (!db) {
        showToast('Modo demo: No se puede guardar', 'warning');
        return;
    }

    try {
        // 1. Add to global list if not exists
        if (!ANIMALES.includes(name)) {
            ANIMALES.push(name);
            await db.collection('config').doc('hato').set({ animales: ANIMALES }, { merge: true });
        }

        // 2. Save metadata
        const docId = getAnimalDocId(name);
        await db.collection('hato_detalle').doc(docId).set({
            idAnimal: id,
            nombre: name,
            categoria: category,
            raza: breed,
            fechaNacimiento: birth,
            padre: father,
            madre: mother,
            registro: register,
            status: 'Activo',
            notas: '',
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`${name} registrado con éxito 🐄`, 'success');
        setDirty(false);
        closeAddAnimalModal();
        loadHerdInventory();
    } catch (e) {
        console.error('Error adding animal:', e);
        showToast('Error al registrar animal', 'error');
    }
}

function openRemoveAnimalModal(name) {
    if (!name) return;
    requestQuickDelete('hato_detalle', getAnimalDocId(name), `Retirar animal: ${name}`);
}

async function removeAnimal(name) {
    if (!db) return;
    try {
        const motivo = prompt(`Motivo del retiro para ${name} (Venta, Baja, Muerte):`, 'Venta');
        if (!motivo) return;

        // 1. Remove from active list
        ANIMALES = ANIMALES.filter(a => a !== name);
        await db.collection('config').doc('hato').set({ animales: ANIMALES });

        // 2. DELETE from Firebase completely (as requested)
        const docId = getAnimalDocId(name);
        await db.collection('hato_detalle').doc(docId).delete();

        showToast(`${name} ha sido eliminado del sistema.`, 'info');
        loadHerdInventory();
    } catch (e) {
        console.error('Error removing animal:', e);
        showToast('Error al eliminar animal de Firebase', 'error');
    }
}

function openEditAnimalModal(name) {
    console.log('Opening edit animal modal for:', name);
    try {
        const meta = herdInventoryMeta[name] || {};
        const titleEl = document.getElementById('edit-animal-title');
        if (!titleEl) throw new Error('No se encontró el título del modal de animal');

        document.getElementById('edit-animal-name-hidden').value = name;
        titleEl.textContent = `🐄 Editar ${name}`;

        document.getElementById('edit-animal-id').value = meta.idAnimal || '';
        document.getElementById('edit-animal-name').value = name;
        document.getElementById('edit-animal-category').value = meta.categoria || 'Vaca (Producción)';
        document.getElementById('edit-animal-breed').value = meta.raza || '';
        document.getElementById('edit-animal-birth').value = meta.fechaNacimiento || '';
        document.getElementById('edit-animal-father').value = meta.padre || '';
        document.getElementById('edit-animal-mother').value = meta.madre || '';
        document.getElementById('edit-animal-register').value = meta.registro || '';
        document.getElementById('edit-animal-notes').value = meta.notas || '';

        const modal = document.getElementById('modal-edit-animal');
        if (!modal) throw new Error('No se encontró el elemento modal-edit-animal');
        modal.style.display = 'flex';
    } catch (e) {
        console.error('Error opening animal modal:', e);
        showToast('Error al abrir editor de animal: ' + e.message, 'error');
    }
}

function closeEditAnimalModal() {
    document.getElementById('modal-edit-animal').style.display = 'none';
}

async function saveAnimalMetadata() {
    const oldName = document.getElementById('edit-animal-name-hidden').value;
    const newName = document.getElementById('edit-animal-name').value.trim();
    const id = document.getElementById('edit-animal-id').value.trim();
    const category = document.getElementById('edit-animal-category').value;
    const breed = document.getElementById('edit-animal-breed').value.trim();
    const birth = document.getElementById('edit-animal-birth').value;
    const father = document.getElementById('edit-animal-father').value.trim();
    const mother = document.getElementById('edit-animal-mother').value.trim();
    const register = document.getElementById('edit-animal-register').value.trim();
    const notas = document.getElementById('edit-animal-notes').value.trim();

    if (!newName) {
        showToast('El nombre no puede estar vacío', 'warning');
        return;
    }

    if (!db) {
        showToast('Modo demo: No se puede guardar metadatos', 'warning');
        closeEditAnimalModal();
        return;
    }

    try {
        const docId = getAnimalDocId(newName);
        const dataToSave = {
            idAnimal: id,
            nombre: newName,
            categoria: category,
            raza: breed,
            fechaNacimiento: birth,
            padre: father,
            madre: mother,
            registro: register,
            notas: notas,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (oldName !== newName) {
            // Update global config array
            const hatoDoc = await db.collection('config').doc('hato').get();
            if (hatoDoc.exists) {
                let animales = hatoDoc.data().animales || [];
                animales = animales.map(a => a === oldName ? newName : a);
                await db.collection('config').doc('hato').update({ animales });
            }

            // Delete old record
            const oldDocId = getAnimalDocId(oldName);
            await db.collection('hato_detalle').doc(oldDocId).delete();
        }

        await db.collection('hato_detalle').doc(docId).set(dataToSave, { merge: true });

        showToast(`Datos de ${newName} actualizados ✅`, 'success');
        setDirty(false);
        closeEditAnimalModal();
        loadHerdInventory(); // Reload table
    } catch (e) {
        console.error('Error saving animal meta:', e);
        showToast('Error al guardar datos', 'error');
    }
}

function exportHerdInventoryExcel() {
    if (!currentHerdCenso || currentHerdCenso.length === 0) {
        showToast('No hay datos en el censo para exportar', 'warning');
        return;
    }

    try {
        const headers = ['ID Animal', 'Nombre', 'Raza', 'Fecha Nacimiento', 'Padre', 'Madre', 'Registro', 'Estado Actual', 'Baja/Causa', 'Notas'];
        const rows = currentHerdCenso.map(item => {
            const meta = herdInventoryMeta[item.nombre] || {};
            const esc = v => `"${(v || '').toString().replace(/"/g, '""')}"`;
            return [
                esc(item.idAnimal),
                esc(item.nombre),
                esc(item.raza),
                esc(item.fechaNac),
                esc(item.padre),
                esc(item.madre),
                esc(item.registro),
                esc(item.estado),
                esc(item.baja),
                esc(meta.notas || '')
            ];
        });

        let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
        csvContent += headers.map(h => `"${h}"`).join(',') + '\n';
        rows.forEach(row => { csvContent += row.join(',') + '\n'; });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Censo_Hato_PaMora_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Inventario exportado ✅', 'success');
    } catch (e) {
        console.error('Export error:', e);
        showToast('Error al exportar censo', 'error');
    }
}

// ─── PANEL ADMINISTRATIVO Y ELIMINACIÓN DOBLE ───────────────

let pendingDeleteData = null;

// ─── GESTIÓN DE ELIMINACIÓN CENTRALIZADA ───────────────
// (Integrada en Explorador de Eventos)

function requestQuickDelete(col, id, info) {
    pendingDeleteData = { col, id };
    document.getElementById('delete-info-text').textContent = info;
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('modal-confirm-delete').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('modal-confirm-delete').style.display = 'none';
    pendingDeleteData = null;
}

async function executeFinalDelete() {
    const input = document.getElementById('delete-confirm-input').value;
    if (input.trim().toUpperCase() !== 'ELIMINAR') {
        showToast('Debe escribir ELIMINAR para confirmar', 'warning');
        return;
    }

    if (!pendingDeleteData || !db) return;

    try {
        const { col, id } = pendingDeleteData;
        await db.collection(col).doc(id).delete();

        showToast('Registro eliminado 🗑️', 'success');
        closeDeleteModal();

        // Refresh relevant sections automatically
        loadVacunaciones();
        loadHistorial();
        loadDashboardStats();
        if (typeof loadGestacion === 'function') {
            const insemData = await fetchFromSheets('inseminaciones');
            loadGestacion(insemData);
        }
        if (col === 'eventos' || col === 'gastos' || col === 'ordenos' || col === 'produccion') {
            loadRentabilidad();
            loadEventExplorer();
        }

    } catch (e) {
        console.error('Delete error:', e);
        showToast('No se pudo eliminar el registro', 'error');
    }
}


function updatePrecioPorKg() {
    const bulto = parseFloat(document.getElementById('concentrado-precio-bulto').value) || 0;
    const kg = bulto / 40;
    document.getElementById('concentrado-precio-kg').value = kg.toFixed(0);
}

function buildDietInputs() {
    const grid = document.getElementById('grid-dietas-animales');
    if (!grid) return;

    // Filter: Only Lactating
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));

    grid.innerHTML = lactantes.map(animal => `
        <div class="animal-input-group" style="padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.02);">
            <label style="font-size: 0.9rem;">${getAnimalEmoji(animal.nombre)} ${animal.nombre}</label>
            <div class="input-group input-group-sm">
                <input type="number" id="diet-kg-${animal.nombre}" class="form-control diet-input" 
                       min="0" step="0.1" value="0" placeholder="kg/día" 
                       onchange="recalcRentabilidad()">
                <span class="input-group-text">kg</span>
            </div>
        </div>
    `).join('');
}

async function guardarParametrosRentabilidad() {
    const params = {
        mes: document.getElementById('rentabilidad-mes').value,
        anio: document.getElementById('rentabilidad-anio').value
    };
    const id = `${params.anio}-${params.mes}`;

    const precioBulto = parseFloat(document.getElementById('concentrado-precio-bulto').value) || 0;
    const precioLitro = parseFloat(document.getElementById('precio-venta-litro').value) || 0;
    const mantenimientoNoProd = parseFloat(document.getElementById('costo-mantenimiento-no-prod').value) || 0;
    const costoTerneras = parseFloat(document.getElementById('costo-concentrado-terneras').value) || 0;

    const dietas = {};
    // Use census animals (not static ANIMALES) to match inputs built by buildDietInputs()
    const lactantesSave = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
    lactantesSave.forEach(a => {
        const el = document.getElementById(`diet-kg-${a.nombre}`);
        if (el) dietas[a.nombre] = parseFloat(el.value) || 0;
    });

    if (!db) {
        showToast('Modo demo: No se puede guardar configuración', 'warning');
        return;
    }

    try {
        await db.collection('rentabilidad_config').doc(id).set({
            precioBulto,
            precioLitro,
            mantenimientoNoProd,
            costoTerneras,
            dietas,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast('Configuración del mes guardada ✅', 'success');
        setDirty(false);
        recalcRentabilidad();
    } catch (e) {
        console.error('Error saving rentability config:', e);
        showToast('Error al guardar configuración', 'error');
    }
}
async function loadRentabilidad() {
    const params = {
        mes: document.getElementById('rentabilidad-mes').value,
        anio: document.getElementById('rentabilidad-anio').value
    };

    setStatText('rentabilidad-periodo', 'Cargando datos contables...');

    if (db) {
        const id = `${params.anio}-${params.mes}`;
        try {
            const doc = await db.collection('rentabilidad_config').doc(id).get();
            if (doc.exists) {
                const config = doc.data();
                document.getElementById('precio-venta-litro').value = config.precioLitro || 2500;
                document.getElementById('concentrado-precio-bulto').value = config.precioBulto || 72000;
                document.getElementById('costo-mantenimiento-no-prod').value = config.mantenimientoNoProd || 50000;
                document.getElementById('costo-concentrado-terneras').value = config.costoTerneras || 0;

                const diets = config.dietas || {};
                // Use census animals (not static ANIMALES) to match inputs built by buildDietInputs()
                const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
                lactantes.forEach(a => {
                    const el = document.getElementById(`diet-kg-${a.nombre}`);
                    if (el) el.value = diets[a.nombre] || 0;
                });
            }
        } catch (e) { console.error('Error loading config:', e); }
    }
    updatePrecioPorKg();

    buildDietInputs(); // Generate inputs before setting values
    // Fetch production data for the month — now correctly filtered by month/year in fetchFromSheets
    const rawData = await fetchFromSheets('produccion_mes', params);

    // Fetch gastos directos del mes para el calculo del CIF
    const rawGastos = await fetchFromSheets('gastos_mes', params);
    let totalGastosMes = 0;
    if (rawGastos && rawGastos.filas) {
        rawGastos.filas.forEach(g => {
            totalGastosMes += (parseFloat(g.monto) || 0);
        });
    }

    // Transform raw {filas:[...]} into the aggregated format renderRentabilidad expects
    lastRentabilidadData = procesarProduccionMes(rawData, parseInt(params.mes), parseInt(params.anio));
    lastRentabilidadData._gastosMes = totalGastosMes;
    recalcRentabilidad();
}

/**
 * Converts raw `{ filas: [{fecha, horario, litros, total, ...}] }` from Firebase
 * into the aggregated object that renderRentabilidad() and buildProduccionAnimalChart() need.
 */
function procesarProduccionMes(rawData, mes, anio) {
    const filas = rawData?.filas || [];

    if (!filas.length) {
        const produccionPorAnimal = {};
        ANIMALES.forEach(a => { produccionPorAnimal[a] = { total: 0, count: 0 }; });
        return { totalLitros: 0, diasRegistrados: 0, produccionPorAnimal, porCategoria: {} };
    }

    let totalLitros = 0;
    const produccionPorAnimal = {};

    filas.forEach(row => {
        const litros = row.litros || {};
        const rowTotal = typeof row.total === 'number' ? row.total
            : Object.values(litros).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        totalLitros += rowTotal;

        Object.entries(litros).forEach(([animal, val]) => {
            if (!produccionPorAnimal[animal]) produccionPorAnimal[animal] = { total: 0, count: 0 };
            produccionPorAnimal[animal].total += parseFloat(val) || 0;
            produccionPorAnimal[animal].count++;
        });
    });

    const uniqueDates = new Set(filas.map(r => r.fecha));
    const mesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return {
        totalLitros: parseFloat(totalLitros.toFixed(1)),
        diasRegistrados: uniqueDates.size,
        produccionPorAnimal,
        porCategoria: {},
        periodo: `${mesNombres[mes] || mes} ${anio}`
    };
}

function recalcRentabilidad() {
    renderRentabilidad();
}

function renderRentabilidad() {
    if (!lastRentabilidadData) return;
    const data = lastRentabilidadData;

    const precioLitro = parseFloat(document.getElementById('precio-venta-litro').value) || 2500;
    const precioBulto = parseFloat(document.getElementById('concentrado-precio-bulto').value) || 72000;
    const precioKg = precioBulto / 40;
    // Use real calendar days for accurate cost projections
    const selMes = parseInt(document.getElementById('rentabilidad-mes')?.value ?? new Date().getMonth());
    const selAnio = parseInt(document.getElementById('rentabilidad-anio')?.value ?? new Date().getFullYear());
    const daysInMonth = new Date(selAnio, selMes + 1, 0).getDate();

    const ingresos = data.totalLitros * precioLitro;

    let totalCostoConcentradoAudit = 0;
    let missingCows = [];

    // Audit only lactating cows
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));

    lactantes.forEach(animal => {
        const kgDiaInput = document.getElementById(`diet-kg-${animal.nombre}`);
        const kgDia = kgDiaInput ? parseFloat(kgDiaInput.value) : 0;
        const isProducing = (data.produccionPorAnimal?.[animal.nombre]?.total || 0) > 0;
        if (isProducing && kgDia <= 0) missingCows.push(animal.nombre);
        totalCostoConcentradoAudit += (kgDia * daysInMonth * precioKg);
    });

    const mantOtros = parseFloat(document.getElementById('costo-mantenimiento-no-prod').value) || 0;
    const costTerneras = parseFloat(document.getElementById('costo-concentrado-terneras').value) || 0;
    const countNoProd = (currentHerdCenso || []).filter(a => !a.estado.includes('LACTANDO')).length;

    const totalGastosAudit = totalCostoConcentradoAudit + (countNoProd * mantOtros) + costTerneras;
    const utilidadOperativa = ingresos - totalGastosAudit;
    const margenAudit = ingresos > 0 ? (utilidadOperativa / ingresos) * 100 : 0;

    // Update KPI UI
    document.getElementById('kpi-ingresos').textContent = '$' + formatNumber(ingresos);
    document.getElementById('kpi-gastos').textContent = '$' + formatNumber(totalGastosAudit);
    const utilEl = document.getElementById('kpi-ganancia');
    utilEl.textContent = '$' + formatNumber(utilidadOperativa);
    utilEl.className = 'kpi-value ' + (utilidadOperativa >= 0 ? 'positive' : 'negative');
    setStatText('kpi-margen', 'Margen Obj: ' + margenAudit.toFixed(1) + '%');

    // Semaphore
    const semaforo = document.getElementById('semaforo-circulo');
    const vTexto = document.getElementById('veredicto-texto');
    let color = "#ef4444", status = "CRÍTICO", emoji = "🔴";

    if (margenAudit > 25) {
        color = "#22c55e"; status = "ÓPTIMO"; emoji = "🟢";
    } else if (margenAudit >= 5) {
        color = "#eab308"; status = "ADECUADO"; emoji = "🟡";
    }

    // Convert hard lock into a warning to allow the user to read the rest of the report
    if (missingCows.length > 0) {
        color = "#f59e0b"; status = "INFO INCOMPLETA"; emoji = "⚠️";
    }

    if (semaforo) { semaforo.style.background = color; semaforo.textContent = emoji; }
    if (vTexto) { vTexto.textContent = status; vTexto.style.color = color; }

    // Charts
    buildProduccionAnimalChart(data);

    // Compute cost per litre for the cost-vs-sale chart
    const costoPorLitro = data.totalLitros > 0 ? parseFloat((totalGastosAudit / data.totalLitros).toFixed(2)) : 0;
    data._dPrecioVenta = precioLitro;
    data._costoPorLitro = costoPorLitro;
    buildCostoVsVentaChart(data);

    // Build real category breakdown for the donut
    const gastosCats = {
        'Concentrado': parseFloat(totalCostoConcentradoAudit.toFixed(0)),
        'Mantenimiento': parseFloat((countNoProd * mantOtros).toFixed(0)),
        'Terneras': parseFloat(costTerneras.toFixed(0)),
        'Otros (Manuales)': parseFloat((data._gastosMes || 0).toFixed(0))
    };
    // Filter out zero categories to keep the chart clean
    const filteredCats = Object.fromEntries(Object.entries(gastosCats).filter(([, v]) => v > 0));
    buildGastosCategoriaChart({ porCategoria: filteredCats });

    // Populate Per Cow Production Table
    const perCowTbody = document.getElementById('per-cow-tbody');
    if (perCowTbody) {
        const lactantesList = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
        perCowTbody.innerHTML = lactantesList.map(animal => {
            const prodInfo = data.produccionPorAnimal?.[animal.nombre] || { total: 0, count: 0 };
            const promedio = prodInfo.count > 0 ? (prodInfo.total / prodInfo.count).toFixed(1) : '0.0';
            const kgDiaInput = document.getElementById(`diet-kg-${animal.nombre}`);
            const kgDia = kgDiaInput ? parseFloat(kgDiaInput.value) : 0;
            const costoConc = (kgDia * daysInMonth * precioKg);
            const ingreso = prodInfo.total * precioLitro;
            const balance = ingreso - costoConc;

            return `<tr>
                <td><strong>${getAnimalEmoji(animal.nombre)} ${animal.nombre}</strong></td>
                <td>${prodInfo.total.toFixed(1)} L</td>
                <td>${promedio} L/ord.</td>
                <td>${kgDia.toFixed(1)} kg</td>
                <td>$${formatNumber(ingreso)}</td>
                <td>$${formatNumber(costoConc)}</td>
                <td style="color:${balance >= 0 ? '#22c55e' : '#ef4444'}; font-weight:bold;">$${formatNumber(balance)}</td>
                <td style="text-align:center;">${balance >= 0 ? '\u2705' : '\u26a0\ufe0f'}</td>
            </tr>`;
        }).join('');
    }

    // --- Persist KPIs so generarAnalisisMes and investor calc can read them ---
    // Determine best/worst cow
    const prodEntries = Object.entries(data.produccionPorAnimal || {});
    const mejorVaca = prodEntries.length > 0 ? prodEntries.sort((a, b) => b[1].total - a[1].total)[0][0] : '(sin datos)';
    const peorVaca = prodEntries.length > 0 ? prodEntries.sort((a, b) => a[1].total - b[1].total)[0][0] : '(sin datos)';

    Object.assign(lastRentabilidadData, {
        ingresos: parseFloat(ingresos.toFixed(0)),
        gastos: parseFloat(totalGastosAudit.toFixed(0)),
        ganancia: parseFloat(utilidadOperativa.toFixed(0)),
        margen: parseFloat(margenAudit.toFixed(2)),
        costoPorLitro,
        precioVenta: precioLitro,
        precioKg,
        daysInMonth,
        mejorVaca,
        peorVaca
    });

    // Render per-cow investor table
    renderInversoresPorVaca();
}

async function updateConcentradoVaca(animal, value) {
    recalcRentabilidad();
}

// ─── INVESTOR SECTION ────────────────────────────────────────

function renderInversoresPorVaca() {
    const tbody = document.getElementById('inversores-tbody');
    const totalGananciaEl = document.getElementById('inversores-total-ganancia');
    const totalPagoEl = document.getElementById('inversores-total-pago');
    if (!tbody || !lastRentabilidadData) return;

    const { produccionPorAnimal, precioVenta, precioKg, daysInMonth } = lastRentabilidadData;
    if (!precioVenta || !precioKg) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:16px;color:var(--text-muted);">Ingresa precio de leche y concentrado primero</td></tr>';
        return;
    }

    // Load saved config from localStorage
    const savedConfig = JSON.parse(localStorage.getItem('pamora_inversores_config') || '{}');

    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
    if (!lactantes.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:16px;color:var(--text-muted);">No hay vacas en producción este mes</td></tr>';
        return;
    }

    let totalGanancia = 0;
    let totalPago = 0;

    tbody.innerHTML = lactantes.map(animal => {
        const prodInfo = produccionPorAnimal?.[animal.nombre] || { total: 0, count: 0 };
        const kgDiaEl = document.getElementById(`diet-kg-${animal.nombre}`);
        const kgDia = kgDiaEl ? parseFloat(kgDiaEl.value) || 0 : 0;

        const ingresoBruto = prodInfo.total * precioVenta;
        const costoConc = kgDia * (daysInMonth || 30) * precioKg;
        const gananciaNeta = ingresoBruto - costoConc;

        const savedCow = savedConfig[animal.nombre] || {};
        const isChecked = savedCow.incluir !== false; // Default: included
        const pct = savedCow.pct || 50;

        const pago = isChecked ? Math.max(0, gananciaNeta * (pct / 100)) : 0;
        if (isChecked) {
            totalGanancia += gananciaNeta;
            totalPago += pago;
        }

        return `<tr>
            <td style="text-align:center;">
                <input type="checkbox" id="inv-check-${animal.nombre}" ${isChecked ? 'checked' : ''} 
                       onchange="onInversorChange()" class="no-dirty" style="width:16px;height:16px;">
            </td>
            <td><strong>${getAnimalEmoji(animal.nombre)} ${animal.nombre}</strong></td>
            <td>${prodInfo.total.toFixed(1)} L</td>
            <td>$${formatNumber(ingresoBruto)}</td>
            <td style="color:#f59e0b;">$${formatNumber(costoConc)}</td>
            <td style="color:${gananciaNeta >= 0 ? '#4ade80' : '#ef4444'}; font-weight:700;">$${formatNumber(gananciaNeta)}</td>
            <td>
                <div class="input-group input-group-sm">
                    <input type="number" id="inv-pct-${animal.nombre}" value="${pct}" min="0" max="100" step="1"
                           class="form-control no-dirty" style="max-width:70px;" onchange="onInversorChange()">
                    <span class="input-group-text">%</span>
                </div>
            </td>
            <td style="color:#4ade80; font-weight:800;">$${formatNumber(pago)}</td>
        </tr>`;
    }).join('');

    if (totalGananciaEl) totalGananciaEl.textContent = '$' + formatNumber(totalGanancia);
    if (totalPagoEl) totalPagoEl.textContent = '$' + formatNumber(totalPago);
}

function onInversorChange() {
    // Save current states before re-rendering
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
    const config = {};
    lactantes.forEach(animal => {
        const checkEl = document.getElementById(`inv-check-${animal.nombre}`);
        const pctEl = document.getElementById(`inv-pct-${animal.nombre}`);
        if (checkEl && pctEl) {
            config[animal.nombre] = {
                incluir: checkEl.checked,
                pct: parseInt(pctEl.value) || 50
            };
        }
    });
    localStorage.setItem('pamora_inversores_config', JSON.stringify(config));

    // Rerender totals immediately when a checkbox or % changes
    renderInversoresPorVaca();
}

function guardarConfigInversores() {
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.includes('LACTANDO'));
    const config = {};
    lactantes.forEach(animal => {
        const chk = document.getElementById(`inv-check-${animal.nombre}`);
        const pctEl = document.getElementById(`inv-pct-${animal.nombre}`);
        config[animal.nombre] = {
            incluir: chk ? chk.checked : true,
            pct: pctEl ? parseFloat(pctEl.value) || 50 : 50
        };
    });
    localStorage.setItem('pamora_inversores_config', JSON.stringify(config));
    showToast('Configuración de inversores guardada ✅', 'success');
}

function buildProduccionAnimalChart(data) {
    const ctx = document.getElementById('chart-produccion-animal');
    if (!ctx) return;
    if (ctx._chart) ctx._chart.destroy();

    const labels = ANIMALES;
    const totals = ANIMALES.map(a => data.produccionPorAnimal?.[a]?.total || 0);
    const colors = ['#1C4D38', '#6eea8e', '#826cf6', '#006600', '#4ade80', '#6366f1', '#10b981'];

    ctx._chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Litros / Mes',
                data: totals,
                backgroundColor: colors.map(c => c + 'cc'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 8,
                barThickness: 25
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

function buildCostoVsVentaChart(data) {
    const ctx = document.getElementById('chart-costo-vs-venta');
    if (!ctx) return;
    if (ctx._chart) ctx._chart.destroy();

    const dias = data.diasRegistrados || 15;
    const costoLabels = [];
    const costoData = [];
    const ventaData = [];
    // Use the dynamically computed cost per litre (_costoPorLitro) set by renderRentabilidad
    const costoPorLitro = data._costoPorLitro || data.costoPorLitro || 0;
    const precioVenta = data._dPrecioVenta || data.precioVentaLitro || 0;

    for (let i = 1; i <= dias; i++) {
        costoLabels.push('Día ' + i);
        costoData.push(costoPorLitro);
        ventaData.push(precioVenta);
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
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#f59e0b',
                    pointBorderWidth: 2
                },
                {
                    label: 'Precio Venta',
                    data: ventaData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    fill: false,
                    tension: 0,
                    borderWidth: 3,
                    borderDash: [10, 5],
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
    // Modern palette for expenses (SaaS Premium 3.0)
    const categColors = ['#1C4D38', '#6eea8e', '#826cf6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

    ctx._chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categorias,
            datasets: [{
                data: montos,
                backgroundColor: categColors.slice(0, categorias.length).map(c => c + 'dd'),
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#4b5563',
                        font: { size: 12, weight: '600' },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    ...tooltipStyle(),
                    callbacks: {
                        label: function (item) {
                            const val = item.raw;
                            const total = item.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((val / total) * 100).toFixed(1);
                            return `${item.label}: $${formatNumber(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

function chartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#6b7280', font: { size: 11, weight: '500' } }
            },
            y: {
                grid: { color: '#f1f5f9' },
                ticks: {
                    color: '#6b7280',
                    font: { size: 10 },
                    callback: function (value) { return value >= 1000 ? '$' + formatNumber(value) : value; }
                },
                beginAtZero: true,
                border: { dash: [4, 4] }
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
    await saveToCloud(payload, btn, 'config-success', null);
}


// Standard parser for different date formats (2026-03-03, 03/03/2026, etc)
function parseAnyDate(str) {
    if (!str || typeof str !== 'string') return new Date();
    // Case 2026-03-03 or 2026/03/03
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts[0].length === 4) return new Date(parts[0], parts[1] - 1, parts[2]);
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts[2].length === 4) return new Date(parts[2], parts[1] - 1, parts[0]);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(str);
}

// ─── HISTORIAL ──────────────────────────────────────────────

async function loadHistorial() {
    const insem = await fetchFromSheets('inseminaciones');
    const nac = await fetchFromSheets('nacimientos');
    const celos = await fetchFromSheets('celos');

    // Inseminations table (Newest first)
    const insemTbody = document.getElementById('historial-insem-tbody');
    if (insemTbody) {
        if (!insem?.filas?.length) {
            insemTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            const sortedInsem = [...insem.filas].sort((a, b) => parseAnyDate(b.fecha) - parseAnyDate(a.fecha));
            insemTbody.innerHTML = sortedInsem.map(f => {
                const badgeClass = f.estado === 'Preñada' ? 'badge-success' :
                    f.estado === 'No Preñada' ? 'badge-danger' : 'badge-warning';
                return `<tr>
          <td>${formatDate(f.fecha)}</td>
          <td><strong>🐮 ${f.animal}</strong></td>
          <td>${f.toro}</td>
          <td>${f.tecnico}</td>
          <td><span style="font-size:0.85rem; color:var(--text-muted);">${f.observaciones || '—'}</span></td>
          <td><span class="badge-pamora ${badgeClass}">${f.estado}</span></td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditInsemModal('${f.id}')" title="Editar">📝</button>
              <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem; background:#ef4444;" onclick="requestQuickDelete('eventos','${f.id}','Insem. ${f.animal}')" title="Borrar">🗑</button>
            </div>
          </td>
        </tr>`;
            }).join('');
        }
    }

    // Births table (Newest first)
    const nacTbody = document.getElementById('historial-nac-tbody');
    if (nacTbody) {
        if (!nac?.filas?.length) {
            nacTbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            const sortedNac = [...nac.filas].sort((a, b) => parseAnyDate(b.fecha) - parseAnyDate(a.fecha));
            nacTbody.innerHTML = sortedNac.map((f, i) => {
                const sexBadge = f.sexo === 'Hembra' ?
                    '<span class="badge" style="background:#fce7f3; color:#db2777; border:1px solid #fbcfe8;">♀ Hembra</span>' :
                    f.sexo === 'Macho' ?
                        '<span class="badge" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd;">♂ Macho</span>' :
                        `<span class="badge bg-light text-dark">${f.sexo}</span>`;

                const evenRowStyle = i % 2 === 0 ? 'background: rgba(255,255,255,0.03);' : '';

                return `
                <tr style="${evenRowStyle}">
                  <td>${formatDate(f.fecha)}</td>
                  <td><strong>🐮 ${f.madre}</strong></td>
                  <td><span style="font-weight:600; color:var(--primary);">${f.cria}</span></td>
                  <td>${sexBadge}</td>
                  <td><span style="font-family:monospace;">${f.peso || '—'} kg</span></td>
                  <td style="font-size:0.85rem; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${f.observaciones || ''}">${f.observaciones || '—'}</td>
                  <td>
                    <div class="d-flex gap-1">
                      <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditNacModal('${f.id}')" title="Editar">📝</button>
                      <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem; background:#ef4444;" onclick="requestQuickDelete('eventos','${f.id}','Nacim. ${f.cria}')" title="Borrar">🗑</button>
                    </div>
                  </td>
                </tr>`;
            }).join('');
        }
    }

    // Celos table (Newest first)
    const celoTbody = document.getElementById('historial-celo-tbody');
    if (celoTbody) {
        if (!celos?.filas?.length) {
            celoTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:30px;color:var(--text-muted);">Sin registros</td></tr>';
        } else {
            const sortedCelos = [...celos.filas].sort((a, b) => parseAnyDate(b.fecha) - parseAnyDate(a.fecha));
            celoTbody.innerHTML = sortedCelos.map(f => {
                const badgeClass = f.intensidad === 'Fuerte' ? 'badge-danger' :
                    f.intensidad === 'Leve' ? 'badge-success' : 'badge-warning';
                return `<tr>
          <td>${formatDate(f.fecha)}</td>
          <td>${f.animal}</td>
          <td><span class="badge-pamora ${badgeClass}">${f.intensidad}</span></td>
          <td>${f.duracion} h</td>
          <td>${f.accionItem}</td>
          <td>${f.observaciones || '—'}</td>
          <td>
            <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem; background:#ef4444;" onclick="requestQuickDelete('eventos','${f.id || ''}','Celo ${f.animal}')" title="Borrar">🗑</button>
          </td>
        </tr>`;
            }).join('');
        }
    }
}



// ─── EXPLORADOR DE EVENTOS (Admin) ─────────────────────────

let explorerFullData = [];

async function loadEventExplorer() {
    if (!db) {
        showToast('Explorador solo disponible con Firebase', 'warning');
        return;
    }

    const tbody = document.getElementById('explorer-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">🔍 Consultando base de datos global...</td></tr>';

    try {
        const snapshot = await db.collection('eventos').orderBy('timestamp', 'desc').get();
        explorerFullData = [];
        snapshot.forEach(doc => {
            explorerFullData.push({ id: doc.id, ...doc.data() });
        });

        filterExplorer(); // Renderiza según filtros actuales
    } catch (e) {
        console.error('Error loading explorer:', e);
        showToast('Error al cargar explorador', 'error');
    }
}

function filterExplorer() {
    const search = document.getElementById('explorer-search').value.toLowerCase();
    const typeFilter = document.getElementById('explorer-filter-type').value;
    const tbody = document.getElementById('explorer-tbody');

    const filtered = explorerFullData.filter(ev => {
        const matchText = (ev.animal || '').toLowerCase().includes(search) ||
            (ev.tipo || '').toLowerCase().includes(search) ||
            (ev.detalles || '').toLowerCase().includes(search);

        const matchType = typeFilter === 'todos' || ev.tipo === typeFilter;

        return matchText && matchType;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No se encontraron eventos con esos filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(ev => {
        const dateStr = ev.fecha || (ev.timestamp ? ev.timestamp.toDate().toLocaleDateString() : '---');
        const coll = ev.collection || 'eventos'; // Fallback for old records
        const docId = ev.id || '';
        const label = ev.animal || ev.tipo || 'evento';

        return `
            <tr>
                <td>${dateStr}</td>
                <td><strong>${ev.animal || '---'}</strong></td>
                <td><span class="badge-${(ev.tipo || '').toLowerCase()}">${ev.tipo || 'Evento'}</span></td>
                <td>${ev.detalles || ev.observaciones || '---'}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${ev.registradoPor || ev.usuario || 'Sistema'}</td>
                <td style="text-align:right;">
                    <button class="btn-pamora" 
                            style="padding:2px 8px; background:#ef4444; font-size:0.7rem;" 
                            onclick="requestQuickDelete('${coll}', '${docId}', '${label}')">
                        🗑️ Borrar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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
                    { id: 'demo-insem-1', fecha: '2025-06-01', animal: 'Yohana', toro: 'Brahman Elite', tecnico: 'Dr. Pérez', observaciones: '¡PRÓXIMO PARTO!', estado: 'Preñada', fechaEstimadaParto: '2026-03-10' },
                    { id: 'demo-insem-2', fecha: '2026-01-20', animal: 'Dulce', toro: 'Holstein Prime', tecnico: 'Dr. Pérez', observaciones: '', estado: 'Pendiente' },
                    { id: 'demo-insem-3', fecha: '2026-02-05', animal: 'Nube', toro: 'Jersey Gold', tecnico: 'Dr. López', observaciones: 'No preñada todavía', estado: 'No Preñada' },
                    { id: 'demo-insem-4', fecha: '2026-02-10', animal: 'Morocha', toro: 'Gyr Superior', tecnico: 'Dr. Pérez', observaciones: '', estado: 'Preñada', fechaEstimadaParto: '2026-11-20' }
                ]
            };

        case 'nacimientos':
            return {
                filas: [
                    { id: 'demo-nac-1', fecha: '2026-02-12', madre: 'Yohana', cria: 'Esperanza', sexo: 'Hembra', peso: 32, observaciones: 'Parto normal, sin complicaciones' },
                    { id: 'demo-nac-2', fecha: '2026-02-20', madre: 'Moli', cria: 'Trueno', sexo: 'Macho', peso: 35, observaciones: 'Parto asistido' }
                ]
            };

        case 'celos':
            return {
                filas: [
                    { id: 'demo-celo-1', fecha: '2026-02-14', animal: 'Sol', intensidad: 'Fuerte', duracion: '16', accionItem: 'Programar inseminación', observaciones: 'Mugidos y monta a otras vacas' },
                    { id: 'demo-celo-2', fecha: '2026-02-25', animal: 'Nube', intensidad: 'Moderado', duracion: '8', accionItem: 'Sin acción', observaciones: 'Flujo claro' }
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
        el.style.fontSize = '1.2rem';
        el.style.padding = '15px';
        el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
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
    toast.className = `toast ${type}`;

    // UI Upgrade: Modales súper perceptibles para éxitos
    if (type === 'success') {
        toast.style.padding = '20px 30px';
        toast.style.fontSize = '1.2rem';
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
    }

    toast.innerHTML = `<span>${icons[type] || ''}</span> <span style="margin-left:8px;">${message}</span>`;
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

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


async function guardarParametrosRentabilidad() {
    if (!lastRentabilidadData) return;

    const btn = document.querySelector('button[onclick="guardarParametrosRentabilidad()"]');
    const originalHTML = btn ? btn.innerHTML : '💾 Guardar Precios del Mes';

    const mesEl = document.getElementById('rentabilidad-mes');
    const anioEl = document.getElementById('rentabilidad-anio');
    const mes = mesEl ? mesEl.value : '0';
    const anio = anioEl ? anioEl.value : '2024';

    const params = {
        precioVentaLitro: parseFloat(document.getElementById('precio-venta-litro').value) || 2500,
        precioBultoConcentrado: parseFloat(document.getElementById('concentrado-precio-bulto').value) || 72000,
        precioKgConcentrado: parseFloat(document.getElementById('concentrado-precio-kg').value) || 1800,
        costoConcentradoTerneras: parseFloat(document.getElementById('costo-concentrado-terneras').value) || 0,
        concentradoPerAnimal: concentradoPerAnimal
    };

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Guardando...';
    }

    try {
        if (db) {
            // 1. Save specific month config
            await db.collection('rentabilidad_config').doc(`${anio}_${mes}`).set(params);

            // 2. Save to global hato config for cow kg/day persistence
            const doc = await db.collection('config').doc('hato').get();
            let currentHato = doc.exists ? doc.data() : { animales: ANIMALES };
            currentHato.concentradoPerAnimal = concentradoPerAnimal;
            await db.collection('config').doc('hato').set(currentHato);

            showToast('✅ Parámetros guardados en la nube', 'success');
        } else {
            // Legacy/Demo fallback
            if (APPS_SCRIPT_URL !== 'TU_URL_DE_APPS_SCRIPT_AQUI') {
                await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ tipo: 'parametros_rentabilidad', token: API_TOKEN, ...params, mes, anio })
                });
                showToast('✅ Parámetros guardados en Firebase', 'success');
            } else {
                showToast('Modo Demo: No se guardó permanentemente', 'warning');
            }
        }
    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

// ─── CERRAR TODOS LOS MODALES ────────────────────────────────────────────────

function closeAllModals() {
    [
        'modal-add-animal',
        'modal-edit-animal',
        'modal-confirm-delete',
        'modal-import-excel',
        'modal-edit-vacunacion',
        'modal-edit-inseminacion',
        'modal-edit-nacimiento'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// ─── FILTRO MI HATO ──────────────────────────────────────────────────────────

let currentHerdFilter = 'all';

function filterHerdInventory(filter) {
    currentHerdFilter = filter;

    // Highlight active filter card
    ['filter-all', 'filter-produccion', 'filter-secas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.boxShadow = ''; el.style.border = ''; }
    });
    const activeId = filter === 'all' ? 'filter-all' : filter === 'lactando' ? 'filter-produccion' : 'filter-secas';
    const activeEl = document.getElementById(activeId);
    if (activeEl) { activeEl.style.boxShadow = '0 0 0 2px #4ade80'; activeEl.style.border = '1px solid #4ade80'; }

    if (!currentHerdCenso) return;
    let filtered;
    if (filter === 'all') filtered = currentHerdCenso;
    else if (filter === 'lactando') filtered = currentHerdCenso.filter(a => a.estado.includes('LACTANDO'));
    else if (filter === 'secas') filtered = currentHerdCenso.filter(a => !a.estado.includes('LACTANDO') && !a.estado.includes('VENDIDA') && !a.estado.includes('BAJA'));
    else filtered = currentHerdCenso;

    const tbody = document.getElementById('hato-inventory-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.map(item => {
        const n = herdInventoryMeta[item.nombre]?.notas || '';
        const notasHtml = n ? `<span title="${n.replace(/"/g, '&quot;')}" style="cursor:help; color:#60a5fa;">📝</span>` : '';
        const escapedName = item.nombre.replace(/'/g, "\\'");
        return `<tr>
            <td style="font-family:monospace; font-weight:700;">${item.idAnimal || '—'}</td>
            <td><strong>${item.nombre}</strong></td>
            <td>${item.raza}</td>
            <td style="font-size:0.8rem;">${item.fechaNac}</td>
            <td style="font-size:0.8rem;">${item.padre}</td>
            <td style="font-size:0.8rem;">${item.madre}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${item.registro}</td>
            <td><span style="color:${item.color}; font-weight:600;">${item.estado}</span></td>
            <td style="font-size:0.75rem; color:#ef4444;">${item.baja}</td>
            <td>${notasHtml}</td>
            <td><div class="d-flex gap-1">
                <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditAnimalModal('${escapedName}')" title="Editar">📝</button>
                <button class="btn-pamora" style="padding:4px 8px; font-size:0.75rem; background:#ef4444;" onclick="openRemoveAnimalModal('${escapedName}')" title="Retirar">📤</button>
            </div></td>
        </tr>`;
    }).join('');
}

// ─── VACUNACIONES ─────────────────────────────────────────────────────────────

async function loadVacunaciones() {
    const tbody = document.getElementById('vacunaciones-tbody');
    if (!tbody) return;
    if (!db) { tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px; color:var(--text-muted);">Solo disponible con Firebase conectado</td></tr>'; return; }
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:30px;">Cargando...</td></tr>';

    try {
        const snap = await db.collection('vacunaciones').orderBy('fecha', 'desc').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px; color:var(--text-muted);">Sin registros. Usa "Cargar Historial" o registra en la pestaña Eventos.</td></tr>';
            return;
        }
        const rows = [];
        snap.forEach(doc => {
            const d = doc.data();
            const fDisplay = d.fecha ? d.fecha.replace(/-/g, '/') : '—';
            rows.push(`<tr>
                <td>${fDisplay}</td>
                <td><strong>${d.animal || 'Todo hato'}</strong></td>
                <td><span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; background:rgba(139,92,246,0.2); color:#a78bfa;">${d.tipo || 'Vacuna'}</span></td>
                <td>${d.tratamiento || ''}</td>
                <td style="font-size:0.85rem;">${d.dosis || '—'}</td>
                <td style="font-size:0.85rem;">${d.administrador || '—'}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${d.observaciones || ''}</td>
                <td>
                  <div class="d-flex gap-1">
                    <button class="btn-pamora" style="padding:3px 7px; font-size:0.75rem;" onclick="openEditVacuModal('${doc.id}')">📝</button>
                    <button class="btn-pamora" style="padding:3px 7px; font-size:0.75rem; background:#ef4444;" onclick="requestQuickDelete('vacunaciones','${doc.id}','${(d.tratamiento || '').replace(/'/g, "\\'")}')">🗑</button>
                  </div>
                </td>
            </tr>`);
        });
        tbody.innerHTML = rows.join('');
    } catch (e) {
        console.error('Error loading vacunaciones:', e);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:20px; color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}

// ─── EXPLORADOR DE COSTOS ───────────────────────────────────────────────────

async function loadCostosExplorer() {
    const tbody = document.getElementById('costos-explorer-tbody');
    const totalEl = document.getElementById('costos-explorer-total');
    if (!tbody) return;

    const mes = parseInt(document.getElementById('costos-explorer-mes').value);
    const anio = parseInt(document.getElementById('costos-explorer-anio').value);

    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px;">🔍 Consultando base de datos...</td></tr>';

    try {
        const raw = await fetchFromSheets('gastos_mes', { mes, anio });
        const gastos = raw.filas || [];

        if (gastos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px; color:var(--text-muted);">No hay gastos registrados en este mes.</td></tr>';
            if (totalEl) totalEl.textContent = '$0';
            return;
        }

        // Logic for 2-month restriction
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Month diff calculation
        const monthDiff = (currentYear - anio) * 12 + (currentMonth - mes);
        const canDelete = monthDiff <= 1; // Current month or previous month only

        let totalSuma = 0;
        tbody.innerHTML = gastos.map(g => {
            const monto = parseFloat(g.monto) || 0;
            totalSuma += monto;
            const delBtn = canDelete ?
                `<button class="btn-action btn-delete" onclick="eliminarGastoExplorer('${g.id}')" title="Eliminar Gasto">🗑️</button>` :
                `<span title="Cerrado para edición" style="opacity:0.3; cursor:not-allowed;">🔒</span>`;

            return `
                <tr>
                    <td>${g.fecha || '—'}</td>
                    <td><span class="badge-pamora" style="background:rgba(59,130,246,0.1); color:#3b82f6;">${g.categoria || 'Gasto'}</span></td>
                    <td style="font-size:0.9rem;">${g.descripcion || '—'}</td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${g.registradoPor || '—'}</td>
                    <td style="text-align:right; font-weight:700;">$${formatNumber(monto)}</td>
                    <td style="text-align:center;">${delBtn}</td>
                </tr>
            `;
        }).join('');

        if (totalEl) totalEl.textContent = '$' + formatNumber(totalSuma);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}

async function eliminarGastoExplorer(id) {
    requestQuickDelete('gastos', id, 'Gasto Reportado');
}

async function handleVacunacion(btn) {
    if (!db) { showToast('Modo demo: No disponible', 'warning'); return; }
    const fecha = document.getElementById('evento-fecha').value;
    const animal = document.getElementById('vacu-animal').value;
    const tipo = document.getElementById('vacu-tipo').value;
    const tratamiento = document.getElementById('vacu-producto').value.trim();
    const dosis = document.getElementById('vacu-dosis').value.trim();
    const lote = document.getElementById('vacu-lote').value.trim();
    const administrador = document.getElementById('vacu-administrador').value.trim();
    const observaciones = document.getElementById('vacu-observaciones').value.trim();

    if (!fecha || !tratamiento) { showToast('Completa fecha y nombre del producto', 'warning'); return; }

    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    }
    showLoading(true);

    try {
        await db.collection('vacunaciones').add({
            fecha, animal, tipo, tratamiento, dosis, lote, administrador, observaciones,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`${tipo} registrada ✅`, 'success');
        setDirty(false);
        showSyncSuccess('evento-success');
        ['vacu-producto', 'vacu-dosis', 'vacu-lote', 'vacu-administrador'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('vacu-observaciones').value = '';
    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'error');
    } finally {
        showLoading(false);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

async function seedVacunaciones(silent = false) {
    if (!db) return;
    if (!silent && !confirm('¿Cargar el historial de vacunaciones y purgas?')) return;

    const data = [
        { fecha: '2025-05-21', animal: 'Conny', tipo: 'Vacuna', tratamiento: 'Vacuna Bruselosis/Aftosa', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-05-21', animal: 'Martina', tipo: 'Vacuna', tratamiento: 'Vacuna Aftosa', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-05-20', animal: 'Conny', tipo: 'Purga', tratamiento: 'Purga Boves', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-05-20', animal: 'Martina', tipo: 'Purga', tratamiento: 'Purga Boves', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-06-16', animal: 'Nube', tipo: 'Vacuna', tratamiento: 'Aftosa', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-06-16', animal: 'Dulce', tipo: 'Vacuna', tratamiento: 'Aftosa', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
        { fecha: '2025-06-16', animal: 'Mapi', tipo: 'Vacuna', tratamiento: 'Aftosa', dosis: '', lote: '', administrador: 'Umata', observaciones: '' },
    ];

    try {
        const batch = db.batch();
        let added = 0;
        for (const d of data) {
            // Check for duplicate by Animal + Fecha + Tratamiento
            const snap = await db.collection('vacunaciones')
                .where('animal', '==', d.animal)
                .where('fecha', '==', d.fecha)
                .where('tratamiento', '==', d.tratamiento)
                .get();

            if (snap.empty) {
                batch.set(db.collection('vacunaciones').doc(), { ...d, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
                added++;
            }
        }
        if (added > 0) {
            await batch.commit();
            if (!silent) showToast(`✅ ${added} vacunaciones cargadas`, 'success');
            loadVacunaciones();
        }
    } catch (e) { if (!silent) console.error('Seed error:', e); }
}

async function seedNacimientos(silent = false) {
    if (!db) return;
    const data = [
        { fecha: '2024-06-26', animal: 'Moli', cria: 'N.A', sexo: 'Macho', madre: 'Moli', tipoParto: 'Normal', complicaciones: 'Ninguna', peso: 'Sin información', observaciones: 'Se vende el ternero' },
        { fecha: '2025-04-16', animal: 'Morocha', cria: 'Bambi', sexo: 'Hembra', madre: 'Morocha', tipoParto: 'Normal', complicaciones: 'Ninguna', peso: 'Sin información', observaciones: '' },
        { fecha: '2025-04-17', animal: 'Dulce', cria: 'N.A', sexo: 'Gemelos', madre: 'Dulce', tipoParto: 'Normal', complicaciones: 'Retención de placenta-Edema abdominal por embarazo gemelar', peso: 'Sin información', observaciones: 'Embarazo gemelar. Una de las crias muere durante el parto' },
        { fecha: '2025-04-29', animal: 'Miel', cria: 'Tato', sexo: 'Macho', madre: 'Miel', tipoParto: 'Normal', complicaciones: 'Ninguna', peso: 'Sin información', observaciones: '' },
        { fecha: '2025-05-13', animal: 'Nube', cria: 'Gurú', sexo: 'Macho', madre: 'Nube', tipoParto: 'Normal', complicaciones: 'Ninguna', peso: 'Sin información', observaciones: '' },
        { fecha: '2025-06-06', animal: 'Mapi', cria: 'Augusto', sexo: 'Macho', madre: 'Mapi', tipoParto: 'Normal', complicaciones: 'La vaca tiene dificultades para levantarse, se aplican diversos medicamentos, vitamina, calcio, entre otros.', peso: 'Sin información', observaciones: 'Se vende el ternero.' },
        { fecha: '2025-06-26', animal: 'Sol', cria: 'Lulu', sexo: 'Hembra', madre: 'Sol', tipoParto: 'Normal', complicaciones: 'Ninguna', peso: 'Sin información', observaciones: '' },
        { fecha: '2025-08-08', animal: 'Moli', cria: 'Consentida', sexo: 'Hembra', madre: 'Moli', tipoParto: 'Normal', complicaciones: 'Retención de placenta, requiere lavado.', peso: 'Sin información', observaciones: '' },
        { fecha: '2025-09-23', animal: 'Martina', cria: 'MacFly', sexo: 'Macho', madre: 'Martina', tipoParto: 'Normal', complicaciones: 'Laceraciones por parto dificil.', peso: 'Sin información', observaciones: 'se vende ternero' }
    ];

    try {
        const batch = db.batch();
        let added = 0;
        for (const d of data) {
            const snap = await db.collection('eventos')
                .where('madre', '==', d.madre)
                .where('fecha', '==', d.fecha)
                .where('tipo', '==', 'Nacimiento')
                .get();

            if (snap.empty) {
                batch.set(db.collection('eventos').doc(), { ...d, tipo: 'Nacimiento', addedAt: firebase.firestore.FieldValue.serverTimestamp() });
                added++;
            }
        }
        if (added > 0) {
            await batch.commit();
            if (!silent) showToast(`✅ ${added} nacimientos cargados`, 'success');
            loadHistorial();
        }
    } catch (e) { if (!silent) console.error('Seed Nac error:', e); }
}

// ─── SEMILLA INSEMINACIONES HISTÓRICAS ────────────────────────────────────────

async function seedInseminaciones(silent = false) {
    if (!db) return;
    if (!silent && !confirm('¿Cargar historial completo?')) return;

    const data = [
        { fecha: '2024-08-06', animal: 'Nube', tipo: 'Inseminación', toro: 'Quick Work', tecnico: 'Sin información', estado: 'Preñada', fechaEstimadaParto: '2025-05-15', observaciones: '' },
        { fecha: '2024-08-30', animal: 'Mapi', tipo: 'Inseminación', toro: 'CINCH Angus Rojo', tecnico: 'Sin información', estado: 'Preñada', fechaEstimadaParto: '2025-06-08', observaciones: '' },
        { fecha: '2024-09-18', animal: 'Sol', tipo: 'Inseminación', toro: 'River Red 17HO16781', tecnico: 'Sin información', estado: 'Preñada', fechaEstimadaParto: '2025-06-27', observaciones: '' },
        { fecha: '2024-11-04', animal: 'Moli', tipo: 'Inseminación', toro: 'Holstein Rojo', tecnico: 'Orlando', estado: 'Preñada', fechaEstimadaParto: '2025-08-04', observaciones: '' },
        { fecha: '2025-06-03', animal: 'Morocha', tipo: 'Inseminación', toro: 'Altariled up-red', tecnico: 'Orlando', estado: 'No Preñada', fechaEstimadaParto: '2026-03-03', observaciones: '' },
        { fecha: '2025-06-15', animal: 'Miel', tipo: 'Inseminación', toro: 'Galore Red Holstein rojo', tecnico: 'Orlando', estado: 'No Preñada', fechaEstimadaParto: '2026-03-15', observaciones: '' },
        { fecha: '2025-09-08', animal: 'Dulce', tipo: 'Inseminación', toro: '', tecnico: 'Santiago', estado: 'No Preñada', fechaEstimadaParto: '2026-06-08', observaciones: 'Entra en calor el 29 de septiembre' },
        { fecha: '2025-09-08', animal: 'Yohana', tipo: 'Inseminación', toro: '', tecnico: 'Santiago', estado: 'Preñada', fechaEstimadaParto: '2026-06-18', observaciones: '' },
        { fecha: '2025-09-08', animal: 'Mapi', tipo: 'Inseminación', toro: '', tecnico: 'Santiago', estado: 'No Preñada', fechaEstimadaParto: '2026-06-18', observaciones: '' },
        { fecha: '2025-09-08', animal: 'Sol', tipo: 'Inseminación', toro: '', tecnico: 'Santiago', estado: 'No Preñada', fechaEstimadaParto: '2026-06-18', observaciones: 'Se aplica hormona para entrar en calor el 26/11/2025' },
        { fecha: '2025-09-08', animal: 'Nube', tipo: 'Inseminación', toro: '', tecnico: 'Santiago', estado: 'No Preñada', fechaEstimadaParto: '2026-06-18', observaciones: 'Se aplica hormona para entrar en calor el 26/11/2025' },
        { fecha: '2025-09-30', animal: 'Dulce', tipo: 'Inseminación', toro: 'Toro Girolando (Hector Julio)', tecnico: '', estado: 'No Preñada', fechaEstimadaParto: '2026-07-10', observaciones: 'Tuvo un calor el 22 de Octubre' },
        { fecha: '2025-10-17', animal: 'Moli', tipo: 'Inseminación', toro: 'Altariled up red', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-07-27', observaciones: '' },
        { fecha: '2025-11-04', animal: 'Mandarina', tipo: 'Inseminación', toro: 'Toro don martines', tecnico: '', estado: 'Pendiente', fechaEstimadaParto: '2026-08-14', observaciones: 'Vendida' },
        { fecha: '2025-11-12', animal: 'Mapi', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-08-22', observaciones: '' },
        { fecha: '2025-11-16', animal: 'Dulce', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-08-26', observaciones: '' },
        { fecha: '2025-11-30', animal: 'Martina', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'No Preñada', fechaEstimadaParto: '2026-09-09', observaciones: 'Vendida' },
        { fecha: '2026-01-07', animal: 'Martina', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-10-17', observaciones: '' },
        { fecha: '2026-02-04', animal: 'Nube', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-11-14', observaciones: 'Se aplica Gestar inyectado' },
        { fecha: '2026-02-16', animal: 'Sol', tipo: 'Inseminación', toro: 'Inseminación', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-11-26', observaciones: '' },
        { fecha: '2026-02-18', animal: 'Moli', tipo: 'Inseminación', toro: 'Altariled up red', tecnico: 'Orlando', estado: 'Pendiente', fechaEstimadaParto: '2026-11-28', observaciones: '' },
    ];

    try {
        const batch = db.batch();
        let added = 0;
        for (const d of data) {
            const snap = await db.collection('eventos')
                .where('animal', '==', d.animal)
                .where('fecha', '==', d.fecha)
                .where('tipo', '==', 'Inseminación')
                .get();

            if (snap.empty) {
                batch.set(db.collection('eventos').doc(), { ...d, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
                added++;
            }
        }
        if (added > 0) {
            await batch.commit();
            if (!silent) showToast(`✅ ${added} inseminaciones cargadas`, 'success');
            loadHistorial();
        }
    } catch (e) { if (!silent) console.error('Seed error:', e); }
}

// ─── EDIT MODALS LOGIC ────────────────────────────────────────────────────────

let currentEditVacuId = null;
let currentEditInsemId = null;

function openEditVacuModal(id) {
    console.log('Opening edit vacuum modal for ID:', id);
    if (!id || id === 'undefined' || id === 'null') {
        showToast('ID de registro no válido para Vacuna', 'warning');
        return;
    }
    if (id.startsWith('demo-')) {
        showToast('Registro de demostración: No se puede editar físicamente', 'info');
        const modal = document.getElementById('modal-edit-vacunacion');
        if (modal) modal.style.display = 'flex';
        return;
    }
    if (!db) {
        showToast('Base de datos no disponible', 'error');
        return;
    }
    try {
        currentEditVacuId = id;
        db.collection('vacunaciones').doc(id).get().then(doc => {
            if (!doc.exists) {
                showToast('No se encontró el registro de vacuna en Firebase', 'warning');
                return;
            }
            const d = doc.data();
            const idInput = document.getElementById('edit-vacu-id');
            if (idInput) idInput.value = id;

            if (document.getElementById('edit-vacu-fecha')) document.getElementById('edit-vacu-fecha').value = d.fecha || '';
            if (document.getElementById('edit-vacu-tipo')) document.getElementById('edit-vacu-tipo').value = d.tipo || 'Vacuna';
            if (document.getElementById('edit-vacu-producto')) document.getElementById('edit-vacu-producto').value = d.tratamiento || '';
            if (document.getElementById('edit-vacu-obs')) document.getElementById('edit-vacu-obs').value = d.observaciones || '';

            // Populate animal select
            const sel = document.getElementById('edit-vacu-animal');
            if (sel) {
                sel.innerHTML = '<option value="">Todo el hato</option>' + ANIMALES.map(a => `<option value="${a}">${a}</option>`).join('');
                sel.value = d.animal || '';
            }

            const modal = document.getElementById('modal-edit-vacunacion');
            if (modal) modal.style.display = 'flex';
            else throw new Error('ID modal-edit-vacunacion no encontrado');
        }).catch(err => {
            console.error('Firestore Error:', err);
            showToast('Error de Firebase: ' + err.message, 'error');
        });
    } catch (e) {
        console.error('Error in openEditVacuModal:', e);
        showToast('Error al procesar modal de vacuna: ' + e.message, 'error');
    }
}

function closeEditVacuModal() {
    document.getElementById('modal-edit-vacunacion').style.display = 'none';
}

async function saveEditVacunacion() {
    const id = document.getElementById('edit-vacu-id').value;
    const data = {
        fecha: document.getElementById('edit-vacu-fecha').value,
        animal: document.getElementById('edit-vacu-animal').value,
        tipo: document.getElementById('edit-vacu-tipo').value,
        tratamiento: document.getElementById('edit-vacu-producto').value,
        dosis: (document.getElementById('edit-vacu-dosis') || {}).value || '',
        administrador: (document.getElementById('edit-vacu-admin') || {}).value || '',
        observaciones: document.getElementById('edit-vacu-obs').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('vacunaciones').doc(id).update(data);
        showToast('Registro actualizado ✅', 'success');
        closeEditVacuModal();
        loadVacunaciones();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function openEditInsemModal(id) {
    console.log('Opening edit insem modal for ID:', id);
    if (!id || id === 'undefined' || id === 'null') {
        showToast('ID de registro no válido para Inseminación', 'warning');
        return;
    }
    if (id.startsWith('demo-')) {
        showToast('Registro de demostración: No se puede editar físicamente', 'info');
        const modal = document.getElementById('modal-edit-inseminacion');
        if (modal) modal.style.display = 'flex';
        return;
    }
    if (!db) {
        showToast('Base de datos no disponible', 'error');
        return;
    }
    try {
        currentEditInsemId = id;
        db.collection('eventos').doc(id).get().then(doc => {
            if (!doc.exists) {
                showToast('Registro de inseminación no encontrado', 'warning');
                return;
            }
            const d = doc.data();
            const idInput = document.getElementById('edit-insem-id');
            if (idInput) idInput.value = id;

            if (document.getElementById('edit-insem-fecha')) document.getElementById('edit-insem-fecha').value = d.fecha || '';
            if (document.getElementById('edit-insem-estado')) document.getElementById('edit-insem-estado').value = d.estado || 'Pendiente';
            if (document.getElementById('edit-insem-toro')) document.getElementById('edit-insem-toro').value = d.toro || '';
            if (document.getElementById('edit-insem-parto')) document.getElementById('edit-insem-parto').value = d.fechaEstimadaParto || '';
            if (document.getElementById('edit-insem-tecnico')) document.getElementById('edit-insem-tecnico').value = d.tecnico || '';
            if (document.getElementById('edit-insem-obs')) document.getElementById('edit-insem-obs').value = d.observaciones || '';

            const sel = document.getElementById('edit-insem-animal');
            if (sel) {
                sel.innerHTML = ANIMALES.map(a => `<option value="${a}">${a}</option>`).join('');
                sel.value = d.animal || '';
            }

            const modal = document.getElementById('modal-edit-inseminacion');
            if (modal) modal.style.display = 'flex';
            else throw new Error('ID modal-edit-inseminacion no encontrado');
        }).catch(err => {
            console.error('Firestore Error:', err);
            showToast('Error de Firebase al cargar inseminación: ' + err.message, 'error');
        });
    } catch (e) {
        console.error('Error in openEditInsemModal:', e);
        showToast('Error al procesar modal de inseminación: ' + e.message, 'error');
    }
}

function closeEditInsemModal() {
    document.getElementById('modal-edit-inseminacion').style.display = 'none';
}

function autoCalcInsemParto() {
    const fechaInsemInput = document.getElementById('edit-insem-fecha');
    const partoInput = document.getElementById('edit-insem-parto');
    if (fechaInsemInput && fechaInsemInput.value && partoInput) {
        const insemDate = new Date(fechaInsemInput.value + 'T12:00:00');
        insemDate.setDate(insemDate.getDate() + 283);
        const y = insemDate.getFullYear();
        const m = String(insemDate.getMonth() + 1).padStart(2, '0');
        const d = String(insemDate.getDate()).padStart(2, '0');
        partoInput.value = `${y}-${m}-${d}`;
    }
}

async function saveEditInseminacion() {
    const id = document.getElementById('edit-insem-id').value;
    const data = {
        fecha: document.getElementById('edit-insem-fecha').value,
        animal: document.getElementById('edit-insem-animal').value,
        estado: document.getElementById('edit-insem-estado').value,
        toro: document.getElementById('edit-insem-toro').value,
        tecnico: (document.getElementById('edit-insem-tecnico') || {}).value || '',
        fechaEstimadaParto: document.getElementById('edit-insem-parto').value,
        observaciones: (document.getElementById('edit-insem-obs') || {}).value || '',
        tipo: 'Inseminación',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('eventos').doc(id).update(data);
        showToast('Inseminación actualizada ✅', 'success');
        closeEditInsemModal();
        loadHistorial();

        // Comprehensive refresh for Gestacion panel
        const insemData = await fetchFromSheets('inseminaciones');
        if (typeof loadGestacion === 'function') { // Corrected typeof check
            loadGestacion(insemData);
        }

    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function eliminarGestacion(id) {
    if (!id || id === 'undefined' || id === 'null') return;
    requestQuickDelete('eventos', id, 'Registro de Gestación/Insem.');
}

function openEditNacModal(id) {
    console.log('Opening edit nacim modal for ID:', id);
    if (!id || id === 'undefined' || id === 'null') {
        showToast('ID de registro no válido para Nacimiento', 'warning');
        return;
    }
    if (id.startsWith('demo-')) {
        showToast('Registro de demostración: No se puede editar físicamente', 'info');
        const modal = document.getElementById('modal-edit-nacimiento');
        if (modal) modal.style.display = 'flex';
        return;
    }
    if (!db) {
        showToast('Base de datos no disponible', 'error');
        return;
    }
    try {
        db.collection('eventos').doc(id).get().then(doc => {
            if (!doc.exists) {
                showToast('Registro de nacimiento no encontrado en Firebase', 'warning');
                return;
            }
            const d = doc.data();
            const idInput = document.getElementById('edit-nac-id');
            if (idInput) idInput.value = id;

            if (document.getElementById('edit-nac-fecha')) document.getElementById('edit-nac-fecha').value = d.fecha || '';
            if (document.getElementById('edit-nac-cria')) document.getElementById('edit-nac-cria').value = d.cria || '';
            if (document.getElementById('edit-nac-sexo')) document.getElementById('edit-nac-sexo').value = d.sexo || 'Hembra';
            if (document.getElementById('edit-nac-peso')) document.getElementById('edit-nac-peso').value = d.peso || '';

            const sel = document.getElementById('edit-nac-madre');
            if (sel) {
                sel.innerHTML = ANIMALES.map(a => `<option value="${a}">${a}</option>`).join('');
                sel.value = d.madre || d.animal || '';
            }

            const modal = document.getElementById('modal-edit-nacimiento');
            if (modal) modal.style.display = 'flex';
            else throw new Error('ID modal-edit-nacimiento no encontrado');
        }).catch(err => {
            console.error('Firestore Error:', err);
            showToast('Error de Firebase al cargar nacimiento: ' + err.message, 'error');
        });
    } catch (e) {
        console.error('Error in openEditNacModal:', e);
        showToast('Error al procesar modal de nacimiento: ' + e.message, 'error');
    }
}

function closeEditNacModal() {
    document.getElementById('modal-edit-nacimiento').style.display = 'none';
}

async function saveEditNacimiento() {
    const id = document.getElementById('edit-nac-id').value;
    const data = {
        fecha: document.getElementById('edit-nac-fecha').value,
        madre: document.getElementById('edit-nac-madre').value,
        cria: document.getElementById('edit-nac-cria').value,
        sexo: document.getElementById('edit-nac-sexo').value,
        peso: document.getElementById('edit-nac-peso').value,
        tipo: 'Nacimiento'
    };

    try {
        await db.collection('eventos').doc(id).update(data);
        showToast('Nacimiento actualizado ✅', 'success');
        closeEditNacModal();
        loadHistorial();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── REGISTRO DE ORDEÑO (handleOrdeno) ───────────────────────────────────────
// NOTA: Esta función estaba referenciada en el HTML pero no existía en app.js.
// Es el handler principal del formulario de ordeño.

async function handleOrdeno(e) {
    e.preventDefault();
    const fecha = document.getElementById('ordeno-fecha').value;
    const horario = document.getElementById('ordeno-horario').value;
    const notas = document.getElementById('ordeno-notas')?.value || '';

    if (!fecha) {
        showToast('Selecciona la fecha del ordeño', 'error');
        return;
    }

    // Collect litros per animal from inputs
    const litros = {};
    let total = 0;
    const lactantes = (currentHerdCenso || []).filter(a => a.estado.toUpperCase().includes('LACTANDO'));

    lactantes.forEach(animal => {
        const input = document.getElementById(`ordeno-litros-${animal.nombre}`);
        const sinOrdeno = document.querySelector(`.ordeno-sin-ordeno[data-animal="${animal.nombre}"]`);
        if (input) {
            const val = sinOrdeno?.checked ? 0 : (parseFloat(input.value) || 0);
            litros[animal.nombre] = val;
            total += val;
        }
    });

    if (total <= 0) {
        showToast('Ingresa al menos un litro para registrar el ordeño', 'warning');
        return;
    }

    // Build the date parts for querying
    const fechaDate = new Date(fecha + 'T12:00:00');
    const mes = fechaDate.getMonth();     // 0-indexed
    const anio = fechaDate.getFullYear();

    const potrero = document.getElementById('ordeno-potrero')?.value || 'Sin Especificar';

    if (potrero && potrero !== 'Sin Especificar') {
        localStorage.setItem('last_ordeno_potrero', potrero);
    }

    const payload = {
        tipo: 'produccion',
        fecha,
        horario,
        potrero,
        litros,
        total: parseFloat(total.toFixed(1)),
        notas,
        mes,
        anio,
        token: API_TOKEN
    };

    const btn = document.getElementById('ordeno-submit-btn');
    await saveToCloud(payload, btn, 'ordeno-success', 'ordeno-form');
}


// ─── REGISTROS TAB: SELECTORS + DATA LOADER ──────────────────────────────────

function initRegistrosSelectors() {
    const today = new Date();
    const mesSelect = document.getElementById('registros-mes');
    const anioSelect = document.getElementById('registros-anio');

    if (mesSelect && !mesSelect.value) {
        mesSelect.value = today.getMonth().toString();
    }

    if (anioSelect) {
        const currentYear = today.getFullYear();
        if (anioSelect.options.length === 0) {
            for (let y = 2024; y <= currentYear + 1; y++) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                if (y === currentYear) opt.selected = true;
                anioSelect.appendChild(opt);
            }
        }
    }
}

async function loadMilkRecords() {
    initRegistrosSelectors();

    const mesEl = document.getElementById('registros-mes');
    const anioEl = document.getElementById('registros-anio');
    if (!mesEl || !anioEl) return;

    const mes = parseInt(mesEl.value);
    const anio = parseInt(anioEl.value);

    const tbody = document.getElementById('registros-tbody');
    const thead = document.getElementById('registros-thead');
    const perVacaTbody = document.getElementById('registros-por-vaca-tbody');

    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding:30px;">🔍 Cargando registros de Firebase...</td></tr>';

    if (!db) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:30px; color:var(--text-muted);">Registros solo disponibles con Firebase conectado.</td></tr>';
        return;
    }

    try {
        const firstDay = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
        const lastDayDate = new Date(anio, mes + 1, 0);
        const lastDay = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

        const snapshot = await db.collection('produccion')
            .where('fecha', '>=', firstDay)
            .where('fecha', '<=', lastDay)
            .orderBy('fecha', 'asc')
            .get();

        // Logic check: is the loaded month editable? (Current or Prev Month)
        const hoy = new Date();
        const loadedDate = new Date(anio, mes, 1);
        const diffMonths = (hoy.getFullYear() - loadedDate.getFullYear()) * 12 + (hoy.getMonth() - loadedDate.getMonth());
        const isEditable = diffMonths <= 1;
        const isExcel = isEditable && isExcelModeActive;

        if (snapshot.empty && !isExcel) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:40px; color:var(--text-muted);">📭 No hay registros para ${MESES_NOMBRES[mes]} ${anio}.<br><small>Registra ordeños desde la pestaña "Ordeño".</small></td></tr>`;
            if (perVacaTbody) perVacaTbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:20px; color:var(--text-muted);">Sin datos</td></tr>';
            // Reset stats
            ['reg-total-am', 'reg-total-pm', 'reg-total-mes', 'reg-dias-registrados'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '0';
            });
            const editBtn = document.getElementById('btn-edit-milk-month');
            if (editBtn) editBtn.style.display = isEditable ? 'block' : 'none';
            const saveBtn = document.getElementById('btn-save-milk-edits');
            if (saveBtn) saveBtn.style.display = 'none';
            return;
        }

        let registros = [];
        snapshot.forEach(doc => registros.push({ id: doc.id, ...doc.data() }));

        // Virtual Grid for Excel Mode
        if (isExcel) {
            const existingMap = {};
            registros.forEach(r => existingMap[`${r.fecha}_${r.horario}`] = r);
            registros = [];
            for (let d = 1; d <= lastDayDate.getDate(); d++) {
                const f = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                ['AM', 'PM'].forEach(horario => {
                    const key = `${f}_${horario}`;
                    if (existingMap[key]) {
                        registros.push(existingMap[key]);
                    } else {
                        registros.push({
                            id: `virtual_${key}`,
                            fecha: f,
                            horario: horario,
                            litros: {}
                        });
                    }
                });
            }
        }

        // Collect all unique animal names across all records
        const animalNamesSet = new Set();
        registros.forEach(r => {
            if (r.litros && typeof r.litros === 'object') {
                Object.keys(r.litros).forEach(a => animalNamesSet.add(a));
            }
        });
        // Sort by lactante order
        const lactantes = (currentHerdCenso || [])
            .filter(a => a.estado.toUpperCase().includes('LACTANDO'))
            .map(a => a.nombre);

        // Add any animals in Firebase not in current censo that have records
        animalNamesSet.forEach(n => { if (!lactantes.includes(n)) lactantes.push(n); });

        // Build dynamic header
        if (thead) {
            thead.innerHTML = `<tr>
                <th>Fecha</th>
                <th>Turno</th>
                ${lactantes.map(a => `<th style="font-size:0.8rem;">${getAnimalEmoji(a)} ${a}</th>`).join('')}
                <th style="font-weight:700; color:var(--text-accent);">Total (L)</th>
                <th>Notas</th>
                <th style="width:60px;">⚙️</th>
            </tr>`;
        }

        // Compute stats aggregates
        let totalAM = 0, totalPM = 0, totalMes = 0;
        const perVaca = {};
        lactantes.forEach(a => { perVaca[a] = { am: 0, pm: 0, count: 0 }; });

        const editBtn = document.getElementById('btn-edit-milk-month');
        if (editBtn) editBtn.style.display = (isEditable && !isExcel) ? 'block' : 'none';

        const saveBtn = document.getElementById('btn-save-milk-edits');
        if (saveBtn) saveBtn.style.display = isExcel ? 'block' : 'none';

        // Render rows
        const rows = registros.map(r => {
            const litros = r.litros || {};
            const turno = r.horario || '—';
            const isAM = turno === 'AM';

            let rowTotal = 0;
            lactantes.forEach(a => {
                const val = parseFloat(litros[a]) || 0;
                rowTotal += val;
                if (!perVaca[a]) perVaca[a] = { am: 0, pm: 0, count: 0 };
                if (isAM) perVaca[a].am += val;
                else perVaca[a].pm += val;
                perVaca[a].count++;
            });

            if (isAM) totalAM += rowTotal; else totalPM += rowTotal;
            totalMes += rowTotal;

            const dateDisplay = r.fecha ? r.fecha.split('-').reverse().join('/') : '—';
            const turnoIcon = isAM ? '☀️ AM' : '🌙 PM';
            const turnoStyle = isAM
                ? 'background: rgba(251,191,36,0.15); color:#f59e0b; font-weight:700;'
                : 'background: rgba(99,102,241,0.15); color:#818cf8; font-weight:700;';

            return `<tr>
                <td style="font-weight:600;">${dateDisplay}</td>
                <td><span style="${turnoStyle} padding:2px 8px; border-radius:4px; font-size:0.85rem;">${turnoIcon}</span></td>
                ${lactantes.map(a => {
                const val = parseFloat(litros[a]) || 0;
                if (isExcel) {
                    return `<td><input type="number" step="0.1" class="form-control milk-edit-input" data-docid="${r.id}" data-vaca="${a}" data-fecha="${r.fecha}" data-horario="${r.horario}" value="${val > 0 ? val : ''}" style="width:60px; padding:2px 4px; border:1px solid transparent; background:rgba(255,255,255,0.05); color:var(--text-color); font-size:1rem; text-align:center;" onchange="setDirty(true)" onfocus="this.style.border='1px solid var(--primary-color)'" onblur="this.style.border='1px solid transparent'"></td>`;
                } else {
                    const style = val > 0 ? 'color: #4ade80; font-weight:600;' : 'color:var(--text-muted);';
                    return `<td style="${style}">${val > 0 ? val.toFixed(1) : '—'}</td>`;
                }
            }).join('')}
                <td style="font-weight:700; color:var(--text-accent);">${rowTotal.toFixed(1)} L</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(r.notas || '')} ${r.potrero ? `[${r.potrero}]` : ''}</td>
                <td>
                    ${isExcel && !r.id.startsWith('virtual_') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteOrdeno('${r.id}')" title="Eliminar registro">🗑️</button>` : (!isExcel && isEditable ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteOrdeno('${r.id}')" title="Eliminar registro">🗑️</button>` : `<span title="Liquidado Histórico">🔒</span>`)}
                </td>
            </tr>`;
        });

        if (tbody) tbody.innerHTML = rows.join('');

        // Populate stats
        document.getElementById('reg-total-am').textContent = totalAM.toFixed(1);
        document.getElementById('reg-total-pm').textContent = totalPM.toFixed(1);
        document.getElementById('reg-total-mes').textContent = (totalAM + totalPM).toFixed(1);

        // Unique days count based on date grouping
        const unqDias = new Set(registros.map(r => r.fecha)).size;
        document.getElementById('reg-dias-registrados').textContent = unqDias;

        // Render per-animal summary in its separate table snippet
        if (perVacaTbody) {
            perVacaTbody.innerHTML = lactantes.map(a => {
                const dataObj = perVaca[a] || { am: 0, pm: 0, count: 0 };
                const totalObj = dataObj.am + dataObj.pm;
                const avgObj = dataObj.count > 0 ? (totalObj / dataObj.count).toFixed(1) : '0.0';
                return `<tr>
                    <td><strong>${getAnimalEmoji(a)} ${a}</strong></td>
                    <td style="color:#f59e0b;">${dataObj.am.toFixed(1)}</td>
                    <td style="color:#818cf8;">${dataObj.pm.toFixed(1)}</td>
                    <td style="color:#4ade80; font-weight:700;">${totalObj.toFixed(1)}</td>
                    <td>${avgObj} L</td>
                </tr>`;
            }).join('');
        }

        // ─── NUEVO: Generar gráfico de potreros (Rentabilidad/Mes) ───
        if (typeof buildPotreroChart === 'function') {
            buildPotreroChart(registros);
        }

        showToast(`✅ ${registros.length} registros cargados`, 'success');

    } catch (e) {
        console.error('Error loading milk records:', e);
        // If Firestore index error, provide helpful message
        const msg = e.message?.includes('index')
            ? 'Se requiere crear un índice en Firebase. Verifica la consola Firebase para el link.'
            : e.message;
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color:#ef4444; padding:20px;">⚠️ Error: ${escapeHTML(msg)}</td></tr>`;
        showToast('Error al cargar registros: ' + msg, 'error');
    }
}

// ─── GUARDADO MASIVO DE ORDEÑOS (EXCEL STYLE) ─────────────────────────
let isExcelModeActive = false;
function enableExcelMode() {
    isExcelModeActive = true;
    loadMilkRecords();
}

async function saveMilkEdits() {
    const inputs = document.querySelectorAll('.milk-edit-input');
    if (inputs.length === 0) return;

    const btn = document.getElementById('btn-save-milk-edits');
    const oriHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Guardando...';
    btn.disabled = true;

    // Build payload structure mapping by docId
    const updates = {};
    inputs.forEach(inp => {
        const docId = inp.dataset.docid;
        const vaca = inp.dataset.vaca;
        const val = parseFloat(inp.value) || 0;

        if (!updates[docId]) {
            updates[docId] = {
                litros: {},
                isVirtual: docId.startsWith('virtual_'),
                fecha: inp.dataset.fecha,
                horario: inp.dataset.horario
            };
        }
        updates[docId].litros[vaca] = val;
    });

    try {
        const batch = db.batch();
        Object.keys(updates).forEach(docId => {
            const data = updates[docId];
            const hasMilk = Object.values(data.litros).some(v => v > 0);

            if (data.isVirtual) {
                if (hasMilk) {
                    const docRef = db.collection('produccion').doc();
                    batch.set(docRef, {
                        fecha: data.fecha,
                        horario: data.horario,
                        litros: data.litros,
                        registradoPor: typeof currentUser !== 'undefined' && currentUser ? currentUser.name : 'Sistema',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } else {
                const docRef = db.collection('produccion').doc(docId);
                batch.set(docRef, { litros: data.litros }, { merge: true });
            }
        });

        await batch.commit();
        setDirty(false); // Clean up guard state
        isExcelModeActive = false;
        showToast('Toda la tabla se actualizó correctamente ✅', 'success');
        loadMilkRecords(); // Reload to refresh totals and stats
    } catch (e) {
        showToast('Error al guardar masivamente: ' + e.message, 'error');
    } finally {
        btn.innerHTML = oriHTML;
        btn.disabled = false;
    }
}


// ─── LIMPIEZA FILAS ENCABEZADO ────────────────────────────────────────────────

async function cleanupHeaderRows() {
    if (!db) return;
    const HEADER_IDS = [
        'ID_Animal', 'Nombre', 'Raza', 'Fecha_Nacimiento', 'Padre', 'Madre', 'Registro', 'Estado_Actual',
        'ID Animal', 'Fecha Nacimiento', 'VENDIDA/BAJA (no aplica)', '2 /3/2026 (no aplica)', '📝',
        'ID ANIMAL Nombre raza', 'ID Animal Nombre Raza'
    ];
    try {
        const batch = db.batch();
        HEADER_IDS.forEach(h => {
            batch.delete(db.collection('hato_detalle').doc(h));
            // Also try with spaces replaced by underscores for good measure if needed
            if (h.includes(' ')) batch.delete(db.collection('hato_detalle').doc(h.replace(/ /g, '_')));
        });
        await batch.commit();
    } catch (e) { /* silent */ }
}

// ─── LÓGICA DE BODEGA E INVENTARIO ──────────────────────────────────────────
function verificarBodega() {
    const stockStr = localStorage.getItem('pamora_bodega_stock');
    let stock = stockStr ? parseInt(stockStr) : 0;
    document.getElementById('bodega-stock').textContent = stock;

    // Calcular consumo diario aproximado (lactantes * kg/dia / 40kg)
    let lactantesEnCenso = 0;
    if (typeof currentHerdCenso !== 'undefined' && currentHerdCenso.length > 0) {
        lactantesEnCenso = currentHerdCenso.filter(a => a.estado.toUpperCase().includes('LACTANDO')).length;
    } else if (typeof ANIMALES !== 'undefined') {
        lactantesEnCenso = ANIMALES.length; // fallback
    }

    // Asumiendo un promedio de 5kg por vaca (puede ajustarse a dinamico con la config real)
    const consumoDiarioKg = lactantesEnCenso * 5;
    const consumoDiarioBultos = consumoDiarioKg / 40;

    let diasRestantes = 0;
    if (consumoDiarioBultos > 0) diasRestantes = Math.floor(stock / consumoDiarioBultos);

    const diasEl = document.getElementById('bodega-dias-restantes');
    if (diasEl) {
        diasEl.textContent = `Quedan ~${diasRestantes} días de alimento`;
        if (diasRestantes <= 5) {
            diasEl.style.color = '#ef4444';
            diasEl.style.fontWeight = 'bold';
            showToast('🚨 Alerta: Inventario de concentrado crítico (< 5 días)', 'warning');
        } else {
            diasEl.style.color = 'var(--text-muted)';
            diasEl.style.fontWeight = 'normal';
        }
    }
}

function actualizarBodega() {
    const input = document.getElementById('bodega-input');
    if (!input || input.value === '') {
        showToast('Ingresa una cantidad válida', 'error');
        return;
    }
    const newValue = parseInt(input.value);
    localStorage.setItem('pamora_bodega_stock', newValue);
    input.value = '';
    showToast('📦 Inventario de bodega actualizado', 'success');
    verificarBodega();
}

// ─── ELIMINAR REGISTROS DE ORDEÑO ───────────────────────────────────────────
async function deleteOrdeno(id) {
    if (!id) return;
    requestQuickDelete('produccion', id, 'Registro de Ordeño');
}

// ELIMINAR ANIMAL DEL HATO centralizado en nav superior

// ─── GRÁFICO DE POTREROS (Rentabilidad) ─────────────────────────────────────
let chartPotreroInstance = null;
function buildPotreroChart(registros) {
    const canvas = document.getElementById('chart-potreros');
    if (!canvas) return;

    const potreroData = {};
    registros.forEach(r => {
        const potrero = r.potrero || 'Sin Especificar';
        if (!potreroData[potrero]) potreroData[potrero] = 0;
        potreroData[potrero] += (parseFloat(r.total) || 0);
    });

    // Sort descending by total production
    const list = Object.entries(potreroData).sort((a, b) => b[1] - a[1]);
    const labels = list.map(item => item[0]);
    const data = list.map(item => parseFloat(item[1].toFixed(1)));

    if (chartPotreroInstance) {
        chartPotreroInstance.destroy();
    }

    chartPotreroInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Litros Producidos',
                data: data,
                backgroundColor: 'rgba(34, 197, 94, 0.6)',
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.toLocaleString()} Litros`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}
