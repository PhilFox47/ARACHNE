/* ARACHNE service worker.
 *
 * Goal is narrow: previously loaded data stays readable with no signal. It is
 * not an offline-write layer — logging a weight needs the server, and pretending
 * otherwise would mean silently dropping entries.
 *
 * Pages: network-first, falling back to the last good copy.
 * Static assets: cache-first.
 */

const VERSION = "arachne-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache auth or health — a stale login response is worse than an error.
  if (url.pathname.startsWith("/api/auth") || url.pathname === "/api/health") return;

  const isAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";

  if (isAsset) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) (await caches.open(ASSETS)).put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) (await caches.open(PAGES)).put(request, res.clone());
          return res;
        } catch {
          const hit = await caches.match(request);
          if (hit) return hit;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
              "<style>body{background:#0A0D16;color:#8A92A6;font:14px/1.6 system-ui;display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center;padding:2rem}" +
              "h1{color:#EDEBE8;font-size:1.1rem;letter-spacing:.16em;text-transform:uppercase;margin:0 0 .5rem}</style>" +
              "<h1>Off the grid</h1><p>No connection, and nothing cached for this screen.</p>",
            { headers: { "content-type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
  }
});
