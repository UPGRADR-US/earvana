const CACHE = "tinnitus-relief-v49";

const PRECACHE = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/TR-bg.png",
  "/TopBanner+title.png",
  "/SpkrIcon.png",
  "/PLAY_ON.png",
  "/PLAY_standby.png",
  "/Settings_Sprocket.png",
  "/SliderSlot_Base.png",
  "/SliderKnob.png",
  "/VolSldrBase.png",
  "/VolSldr_LEDS.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept cross-origin requests (fonts, etc.)
  if (url.origin !== location.origin) return;

  // Audio files: network-first so new uploads are always fresh
  if (url.pathname.startsWith("/sounds/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests (HTML) and index: always network-first so new deploys
  // are picked up immediately. Falls back to cache only if offline.
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (hashed JS/CSS bundles, images): cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) => cached ?? fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
    )
  );
});
