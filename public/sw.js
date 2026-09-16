/* Industry Gestionale — Web Push (Windows / macOS / PWA) */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Industry Gestionale";
  const href = data.href || "/app/dashboard";
  const tipo = data.tipo || "sistema";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      data: { href, tipo },
      tag: data.tag || `oi-${tipo}`,
      renotify: true,
      icon: "/Favicon.jpg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/app/dashboard";
  event.waitUntil(
    (async () => {
      const url = new URL(href, self.location.origin).href;
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          client.postMessage({ type: "oi-notifica-open", href });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
