const CACHE_VERSION = "acoustic-engineering-v1.0.0";

const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
    "./",
    "./index.html",
    "./register.html",
    "./app.html",
    "./admin.html",
    "./report.html",

    "./css/style.css",
    "./css/app.css",
    "./css/admin.css",

    "./js/config.js",
    "./js/firebase.js",
    "./js/auth.js",
    "./js/storage.js",
    "./js/geometry.js",
    "./js/speaker.js",
    "./js/engine.js",
    "./js/canvas.js",
    "./js/report.js",
    "./js/app.js",

    "./manifest.json",

    "./assets/icon-192.png",
    "./assets/icon-512.png"
];


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", event => {

    event.waitUntil(

        caches
            .open(STATIC_CACHE)
            .then(cache => {

                return cache.addAll(APP_SHELL);

            })
            .catch(error => {

                console.warn(
                    "[Acoustic SW] Cache install warning:",
                    error
                );

            })

    );

    /*
     * يسمح للنسخة الجديدة بالاستعداد مباشرة
     * بدلاً من انتظار إغلاق جميع التبويبات القديمة.
     */

    self.skipWaiting();

});


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener("activate", event => {

    event.waitUntil(

        caches.keys()
            .then(cacheNames => {

                return Promise.all(

                    cacheNames
                        .filter(cacheName => {

                            return (
                                cacheName.startsWith("acoustic-engineering-") &&
                                cacheName !== STATIC_CACHE &&
                                cacheName !== RUNTIME_CACHE
                            );

                        })
                        .map(cacheName => {

                            return caches.delete(cacheName);

                        })

                );

            })
            .then(() => {

                return self.clients.claim();

            })

    );

});


/* =========================================================
   FETCH
========================================================= */

self.addEventListener("fetch", event => {

    const request = event.request;

    /*
     * نتعامل فقط مع GET.
     */

    if (request.method !== "GET") {
        return;
    }


    const url = new URL(request.url);


    /*
     * لا نتدخل في Firebase أو الخدمات الخارجية.
     *
     * Firebase يحتاج اتصالاً مباشراً عندما تكون
     * المزامنة السحابية مفعلة.
     */

    if (
        url.hostname.includes("firebaseio.com") ||
        url.hostname.includes("googleapis.com") ||
        url.hostname.includes("gstatic.com") ||
        url.hostname.includes("googleusercontent.com")
    ) {

        return;

    }


    /*
     * CDN الخاصة بالمكتبات الخارجية:
     * Cache First بعد أول تحميل ناجح.
     */

    if (
        url.hostname.includes("cdnjs.cloudflare.com") ||
        url.hostname.includes("fonts.googleapis.com") ||
        url.hostname.includes("fonts.gstatic.com")
    ) {

        event.respondWith(

            caches.match(request)
                .then(cachedResponse => {

                    if (cachedResponse) {
                        return cachedResponse;
                    }


                    return fetch(request)
                        .then(response => {

                            if (
                                !response ||
                                response.status !== 200
                            ) {
                                return response;
                            }


                            const responseClone =
                                response.clone();


                            caches.open(RUNTIME_CACHE)
                                .then(cache => {

                                    cache.put(
                                        request,
                                        responseClone
                                    );

                                });


                            return response;

                        });

                })
                .catch(() => {

                    return caches.match(request);

                })

        );

        return;

    }


    /*
     * صفحات النظام:
     * Network First
     *
     * نحاول الحصول على أحدث نسخة،
     * وإذا لم يتوفر الإنترنت نستخدم النسخة المخزنة.
     */

    if (
        request.mode === "navigate" ||
        url.pathname.endsWith(".html")
    ) {

        event.respondWith(

            fetch(request)
                .then(response => {

                    if (
                        response &&
                        response.status === 200
                    ) {

                        const clone =
                            response.clone();

                        caches.open(RUNTIME_CACHE)
                            .then(cache => {

                                cache.put(
                                    request,
                                    clone
                                );

                            });

                    }

                    return response;

                })
                .catch(() => {

                    return caches.match(request)
                        .then(cached => {

                            return (
                                cached ||
                                caches.match("./index.html")
                            );

                        });

                })

        );

        return;

    }


    /*
     * ملفات JS / CSS / الصور:
     *
     * Cache First
     * مع تحديث الخلفية عند الحاجة.
     */

    event.respondWith(

        caches.match(request)
            .then(cachedResponse => {

                const networkRequest =
                    fetch(request)
                        .then(response => {

                            if (
                                response &&
                                response.status === 200 &&
                                response.type !== "opaque"
                            ) {

                                const clone =
                                    response.clone();

                                caches.open(RUNTIME_CACHE)
                                    .then(cache => {

                                        cache.put(
                                            request,
                                            clone
                                        );

                                    });

                            }

                            return response;

                        })
                        .catch(() => {

                            return cachedResponse;

                        });


                return cachedResponse || networkRequest;

            })

    );

});


/* =========================================================
   MESSAGE
========================================================= */

self.addEventListener("message", event => {

    if (!event.data) {
        return;
    }


    /*
     * إجبار Service Worker على تفعيل النسخة الجديدة.
     */

    if (
        event.data.type === "SKIP_WAITING"
    ) {

        self.skipWaiting();

    }


    /*
     * تنظيف جميع الـ caches.
     */

    if (
        event.data.type === "CLEAR_CACHE"
    ) {

        event.waitUntil(

            caches.keys()
                .then(cacheNames => {

                    return Promise.all(
                        cacheNames.map(name =>
                            caches.delete(name)
                        )
                    );

                })

        );

    }


    /*
     * إرجاع رقم إصدار الـ Service Worker.
     */

    if (
        event.data.type === "GET_VERSION"
    ) {

        event.source?.postMessage({

            type: "SW_VERSION",

            version: CACHE_VERSION

        });

    }

});