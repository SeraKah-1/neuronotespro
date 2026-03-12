/* eslint-disable no-restricted-globals */
const self = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (globalThis));

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple fetch listener to satisfy PWA requirements
  // We don't cache anything for now to keep it simple
  return;
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  const { type, payload } = event.data;

  if (type === 'SCHEDULE_REMINDER') {
    const { title, body, delayMs } = payload;
    
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: 'https://lucide.dev/icons/brain-circuit.svg',
        tag: 'study-reminder',
        badge: 'https://lucide.dev/icons/brain-circuit.svg',
      });
    }, delayMs);
  }

  if (type === 'SEND_NOTIFICATION') {
    const { title, body, tag } = payload;
    self.registration.showNotification(title, {
      body,
      icon: 'https://lucide.dev/icons/brain-circuit.svg',
      tag: tag || 'neuronote-general',
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
