/* Network-only PWA worker. Never cache API replies, sign-in sessions or learner data. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
// Only an opaque installation binding and period hashes are persisted here.
// No credentials, billing dates, API responses, or learner content are cached.
function renewalStore(action) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hudhud-renewal', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('state', 'readwrite');
      let result;
      action(tx.objectStore('state'), value => { result = value; });
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'RENEWAL_BINDING') return;
  event.waitUntil((async () => {
    try {
      await renewalStore((store, done) => {
        store.put(event.data.id || null, 'binding');
        done(null);
      });
      if (!event.data.id) {
        for (const notice of await self.registration.getNotifications()) notice.close();
      }
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  })());
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || Date.parse(payload.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(payload.expiresAt))) return;
    const allowed = await renewalStore((store, done) => {
      const binding = store.get('binding');
      binding.onsuccess = () => {
        if (binding.result !== payload.binding) { done(false); return; }
        const seen = store.get(payload.period);
        seen.onsuccess = () => {
          if (seen.result) { done(false); return; }
          // Claim before display, so duplicate push events cannot race.
          store.put(true, payload.period);
          done(true);
        };
      };
    });
    if (!allowed) return;
    await self.registration.showNotification(payload.title, {
      body: payload.body, icon: new URL('icons/icon-192.png', self.registration.scope).href,
      tag: `renewal-${payload.period}`, data: { renewal: true },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('premium', self.registration.scope).href));
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#104C3D"><title>هدهد — لا يوجد اتصال</title><style>body{font-family:system-ui,sans-serif;background:#F7F8F5;color:#192B27;min-height:85vh;display:grid;place-items:center;margin:0;padding:24px}main{max-width:360px;text-align:center;line-height:1.9}button{background:#176B55;color:white;border:0;padding:14px 28px;border-radius:16px;font:inherit;cursor:pointer}</style><main><h1>هدهد يحتاج إلى اتصال</h1><p>تحقّق من الإنترنت ثم أعد المحاولة. لن نعرض بيانات تعلّم قديمة أو بيانات حساب آخر.</p><p lang="en" dir="ltr">You’re offline. Connect to the internet to continue learning.</p><form><button type="submit">إعادة المحاولة · Retry</button></form></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )));
});
