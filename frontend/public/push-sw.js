/* global self, clients */
/**
 * Mara custom SW extensions — Web Push (Phase 2 P2.1.4).
 *
 * This script is pulled into the Workbox-generated service worker via
 * `workbox.importScripts` so we can own the `push` and `notificationclick`
 * event handlers without switching to the `injectManifest` strategy.
 *
 * Contract with the backend:
 *   payload = JSON.stringify({ title, body, url?, tag?, icon?, data?: {...} })
 * Produced by `server/push/vapid.ts -> sendToUser()`.
 */

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Mara', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Mara';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.icon || '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: {
      url: data.url || '/',
      relatedId: (data.data && data.data.relatedId) || null,
      kind: (data.data && data.data.kind) || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an existing tab if any same-origin tab is open; otherwise open
      // a new one. We don't try to navigate existing tabs — jumping the
      // user's current scroll position mid-read is disruptive.
      for (const client of all) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});
