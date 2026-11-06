/**
 * TajerTrack Web Push Service Worker
 * Scope: /
 * Handles background push notifications and notification clicks.
 */

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all active clients immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[SW]: Push event received without data payload.');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    console.warn('[SW]: Failed to parse push payload as JSON. Fallback to text.');
    data = { body: event.data.text() };
  }

  const title = (data.title || 'تحديث جديد على شحنتك 📦').slice(0, 100);
  const body = (data.body || 'تم تسجيل تحديث جديد على حالة شحنتك. اضغط هنا للمتابعة.').slice(0, 250);
  const trackingUrl = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  const eventId = data.eventId || String(Date.now());

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: `tajertrack-status-${eventId}`,
    renotify: false,
    requireInteraction: false,
    dir: 'rtl',
    lang: 'ar',
    data: {
      url: trackingUrl,
      eventId,
      receivedAt: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification.data?.url || '/';
  // Strictly enforce same-origin navigation against SSRF/open redirects
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If an existing matching tracking tab is already open, focus it
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      // 2. Otherwise find any existing TajerTrack window and navigate it
      for (const client of windowClients) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }

      // 3. If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort handler for when browser auto-rotates or updates subscription keys
  console.info('[SW]: Push subscription changed by browser push service.');
});

