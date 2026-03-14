// ─── GANADERÍA PAMORA — Service Worker ───────────────────────
// Caches the app shell so the app loads without internet.
// Uses Cache-First for shell assets, Network-First for API calls.

const CACHE_NAME = 'pamora-v1';
const SHELL_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './vaca.jpg',
    './Logo 1.png',
    './Logo 2.png',
    // Firebase SDK (compat bundles from CDN)
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

// Install — cache the shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Cache local assets reliably; CDN assets are best-effort
            const localAssets = SHELL_ASSETS.filter(url => !url.startsWith('http'));
            const cdnAssets   = SHELL_ASSETS.filter(url =>  url.startsWith('http'));
            return cache.addAll(localAssets).then(() =>
                Promise.allSettled(cdnAssets.map(url => cache.add(url)))
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate — remove old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch — Cache-First for shell, Network-First for everything else
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Never intercept Firebase, Firestore, or Google APIs — let SDK handle those
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('script.google.com')) {
        return; // passthrough
    }

    // Cache-First for local shell assets
    if (url.origin === location.origin || url.hostname.includes('gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached =>
                cached || fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
            ).catch(() => caches.match('./index.html'))
        );
    }
});
