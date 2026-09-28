/* ============================================================
   Acoustic Engineering — Service Worker v1.0.0
   ============================================================ */
const CACHE_VERSION = "acoustic-engineering-v1.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
    "./", "./index.html", "./register.html", "./app.html",
    "./admin.html", "./report.html",
    "./css/style.css", "./css/app.css", "./css/admin.css",
    "./js/config.js", "./js/api.js", "./js/backend.js",
    "./js/firebase.js", "./js/auth.js", "./js/storage.js",
    "./js/geometry.js", "./js/speaker.js", "./js/engine.js",
    "./js/canvas.js", "./js/report.js", "./js/app.js",
    "./manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(APP_SHELL).catch(e => console.warn("Cache warn:", e)))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.filter(n => n.startsWith("acoustic-engineering-") && n !== STATIC_CACHE && n !== RUNTIME_CACHE)
                .map(n => caches.delete(n))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Firebase — always network
    if (
        url.hostname.includes("firebaseio.com") ||
        url.hostname.includes("googleapis.com") ||
        url.hostname.includes("gstatic.com") ||
        url.hostname.includes("googleusercontent.com") ||
        url.hostname.includes("firebasedatabase.app")
    ) {
        return;
    }

    // CDN — Cache First
    if (
        url.hostname.includes("cdnjs.cloudflare.com") ||
        url.hostname.includes("fonts.googleapis.com") ||
        url.hostname.includes("fonts.gstatic.com")
    ) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
                }
                return res;
            }).catch(() => cached))
        );
        return;
    }

    // HTML — Network First
    if (request.mode === "navigate" || url.pathname.endsWith(".html")) {
        event.respondWith(
            fetch(request).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
                }
                return res;
            }).catch(() => caches.match(request).then(c => c || caches.match("./index.html")))
        );
        return;
    }

    // JS/CSS/Images — Cache First
    event.respondWith(
        caches.match(request).then(cached => {
            const fetchPromise = fetch(request).then(res => {
                if (res && res.status === 200 && res.type !== "opaque") {
                    const clone = res.clone();
                    caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
    if (event.data?.type === "CLEAR_CACHE") {
        event.waitUntil(caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))));
    }
});