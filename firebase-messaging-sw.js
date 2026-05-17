// ============================================================
// firebase-messaging-sw.js
// ضعه في نفس مجلد index.html (الجذر / root)
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCAgFi4D9hwtuK391fLsbnDuh5AtTDIHKU",
  authDomain: "planning-with-ai-390af.firebaseapp.com",
  projectId: "planning-with-ai-390af",
  storageBucket: "planning-with-ai-390af.firebasestorage.app",
  messagingSenderId: "601755857673",
  appId: "1:601755857673:web:b9d7d63e13035412a819d8"
});

const messaging = firebase.messaging();

// ── إشعار لما التطبيق في الخلفية أو مغلق ──────────────────
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'إشعار جديد';
  const notificationOptions = {
    body:  payload.notification?.body  || '',
    icon:  '/icon.png',
    badge: '/icon.png',
    dir:   'rtl',
    lang:  'ar',
    tag:   payload.data?.tag || 'default',
    data:  payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open',    title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ── لما المستخدم يضغط على الإشعار ─────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // لو التطبيق مفتوح → ركز عليه
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // لو مغلق → افتحه
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
