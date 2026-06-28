// ===== Astronomy and Space - Service Worker =====
const CACHE_NAME = 'astronomy-space-v3';
const STATIC_CACHE = 'astronomy-static-v3';
const DYNAMIC_CACHE = 'astronomy-dynamic-v3';

// ===== الملفات اللي هتتحفظ دايماً (Shell) =====
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-144x144.png',
  '/icon-96x96.png',
  '/offline.html'
];

// ===== الدومينات اللي مش هنكاشها (بتحتاج auth) =====
const SKIP_CACHE_DOMAINS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseapp.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'googleapis.com/identitytoolkit',
  'pagead2.googlesyndication.com',
  'googletagmanager.com',
  'res.cloudinary.com',
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'googleapis.com',
  'gstatic.com/firebasejs'
];

// ===== تثبيت الـ SW =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Some static assets failed:', err));
    }).then(() => self.skipWaiting())
  );
});

// ===== تفعيل الـ SW وحذف الكاش القديم =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== هل الـ URL ده لازم نتخطاه؟ =====
function shouldSkipCache(url) {
  return SKIP_CACHE_DOMAINS.some(domain => url.includes(domain));
}

// ===== استراتيجية الـ fetch =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // تجاهل طلبات غير HTTP
  if (!url.startsWith('http')) return;

  // تجاهل طلبات Firebase وباقي الـ APIs
  if (shouldSkipCache(url)) {
    return; // بيروح للنت مباشرة
  }

  // تجاهل طلبات POST/PUT/DELETE
  if (request.method !== 'GET') return;

  // ===== استراتيجية: Network First للـ HTML =====
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match('/offline.html'));
        })
    );
    return;
  }

  // ===== استراتيجية: Cache First للـ CSS/JS/Images =====
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ===== باقي الطلبات: Network First =====
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ===== رسائل من الـ app =====
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
