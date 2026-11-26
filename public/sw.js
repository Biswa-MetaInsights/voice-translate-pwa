importScripts("/voice-note-share.js");
const CACHE = "voice-translate-v26-voice-note";
const ASSETS = ["/", "/index.html", "/install.html", "/privacy.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable.svg", "/voice-note.html", "/voice-note-share.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === "/voice-note.html") {
    event.respondWith(self.receiveVoiceNoteShare(event.request));
    return;
  }
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/src/")) return;

  // Handoff tokens belong only in page memory, never in cache keys or network requests.
  const request = url.pathname === "/voice-note.html"
    ? new Request(new URL("/voice-note.html", self.location.origin), { method: "GET" })
    : event.request;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("/") : Response.error())))
  );
});

