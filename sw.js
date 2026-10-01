/* ============================================================
   Acoustic Engineering — Service Worker v1.1.0
   ============================================================ */
const CACHE_VERSION = "acoustic-engineering-v1.1.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
    "./", "./index.html", "./offline.html",
    "./css/style.css", "./js/config.js", "./js/api.js",
    "./js/app.js", "./manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(STATIC_CACHE);
        await Promise.allSettled(
            APP_SHELL.map(url =>
                cache.add(url).catch(e => console.warn("Skip:", url, e))
            )
        );
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(n => n.startsWith("acoustic-engineering-")
                          && n !== STATIC_CACHE
                          && n !== RUNTIME_CACHE)
                .map(n => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (!url.protocol.startsWith("http")) return;

    // Firebase / Google APIs — network only
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
        event.respondWith((async () => {
            const cached = await caches.match(request);
            if (cached) return cached;
            try {
                const res = await fetch(request);
                if (res && (res.status === 200 || res.type === "opaque")) {
                    const cache = await caches.open(RUNTIME_CACHE);
                    cache.put(request, res.clone());
                }
                return res;
            } catch {
                return new Response("", { status: 504, statusText: "Offline" });
            }
        })());
        return;
    }

    // HTML — Network First with offline fallback
    if (request.mode === "navigate" || url.pathname.endsWith(".html")) {
        event.respondWith((async () => {
            try {
                const res = await fetch(request);
                if (res && res.status === 200) {
                    const cache = await caches.open(RUNTIME_CACHE);
                    cache.put(request, res.clone());
                }
                return res;
            } catch {
                const cached = await caches.match(request);
                if (cached) return cached;
                const offline = await caches.match("./offline.html");
                return offline || new Response("Offline", {
                    status: 503,
                    headers: { "Content-Type": "text/plain; charset=utf-8" }
                });
            }
        })());
        return;
    }

    // JS/CSS/Images — Cache First + Revalidate
    event.respondWith((async () => {
        const cached = await caches.match(request);
        const networkPromise = fetch(request).then(async (res) => {
            if (res && res.status === 200 && res.type !== "opaque") {
                const cache = await caches.open(RUNTIME_CACHE);
                cache.put(request, res.clone());
            }
            return res;
        }).catch(() => null);

        if (cached) {
            networkPromise.catch(() => {});
            return cached;
        }
        const res = await networkPromise;
        return res || new Response("", { status: 504, statusText: "Offline" });
    })());
});

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
    if (event.data?.type === "CLEAR_CACHE") {
        event.waitUntil(
            caches.keys().then(names => Promise.all(
                names
                    .filter(n => n.startsWith("acoustic-engineering-"))
                    .map(n => caches.delete(n))
            ))
        );
    }
});