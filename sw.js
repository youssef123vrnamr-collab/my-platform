/* ============================================================
   sw.js — Service Worker لمنصة الفلك  |  v5
   ============================================================ */

const CACHE_NAME = 'falak-v5';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/48.png',
  '/72.png',
  '/96.png',
  '/128.png',
  '/144.png',
  '/152.png',
  '/180.png',
  '/192.png',
  '/256.png',
  '/512.png'
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>منصة الفلك — بدون إنترنت</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f0a1a;color:#fff;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
.wrap{max-width:340px}
.icon{width:100px;height:100px;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:3rem;box-shadow:0 16px 48px rgba(99,102,241,.5)}
h1{font-size:1.6rem;font-weight:900;margin-bottom:.75rem;background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#9ca3af;font-size:.95rem;line-height:1.8;margin-bottom:2rem}
button{background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;border:none;padding:.85rem 2.5rem;border-radius:14px;font-size:1rem;font-family:inherit;cursor:pointer;font-weight:700;box-shadow:0 10px 28px rgba(99,102,241,.45);transition:transform .2s}
button:active{transform:scale(.96)}
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">🔭</div>
  <h1>لا يوجد اتصال بالإنترنت</h1>
  <p>تحتاج إلى اتصال للوصول لمنصة الفلك.<br>تحقق من الإنترنت وحاول مجدداً.</p>
  <button onclick="location.reload()">🔄 إعادة المحاولة</button>
</div>
</body>
</html>`;

/* ── تثبيت ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => console.warn('SW cache partial:', err))
    )
  );
  self.skipWaiting();
});

/* ── تفعيل: احذف الكاشات القديمة ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── استقبال الطلبات ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* APIs خارجية — network only, لا تتدخل */
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('lh3.googleusercontent.com') ||
    url.hostname.includes('drive.google.com') ||
    url.hostname.includes('pagead2.googlesyndication.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('img.youtube.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('anthropic.com')
  ) { return; }

  /* Google Fonts — cache first */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  /* ملفات static — cache first, network fallback */
  if (
    e.request.method === 'GET' &&
    /\.(css|js|png|jpg|jpeg|webp|ico|woff2|woff|svg)$/.test(url.pathname)
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  /* HTML navigation — network first, offline fallback */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          // خزّن نسخة حديثة في الكاش
          if (resp.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(() =>
          caches.match('/index.html').then(cached =>
            cached || new Response(OFFLINE_HTML, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            })
          )
        )
    );
  }
});
