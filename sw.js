/* ============================================================
   sw.js — Service Worker لمنصة الفلك
   Cache-first للأصول الثابتة + Network-first للبيانات
   ============================================================ */

const CACHE_NAME = 'falak-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.png'
];

/* تثبيت - cache الأصول الثابتة */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

/* تفعيل - حذف الـ caches القديمة */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* الطلبات - استراتيجية ذكية */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Firebase / Firestore / Auth - دايماً من الـ network */
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('lh3.googleusercontent.com') ||
    url.hostname.includes('drive.google.com')
  ) {
    return; /* let browser handle */
  }

  /* Google Fonts - cache */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            cache.put(e.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  /* الملفات الثابتة - cache first */
  if (e.request.method === 'GET' && (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  )) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  /* الـ HTML - network first مع fallback */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('./index.html')
      )
    );
  }
});
