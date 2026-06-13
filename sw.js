/* ============================================================
   sw.js — Service Worker لمنصة الفلك  |  v6
   ============================================================ */

const CACHE_NAME = 'falak-v7';

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
  '/192-maskable.png',
  '/256.png',
  '/512.png',
  '/512-maskable.png',
  '/1024.png'
];

/* ── صفحة أوف لاين مدمجة (بدون Google Fonts عشان تشتغل بدون نت) ── */
const OFFLINE_HTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f0a1a">
<title>منصة الفلك — بدون إنترنت</title>
<style>
@import url('data:text/css,');
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:#0f0a1a;
  color:#fff;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;min-height:100dvh;
  text-align:center;padding:2rem;
  background-image:radial-gradient(ellipse at 20% 30%,rgba(99,102,241,.15) 0%,transparent 50%),
                   radial-gradient(ellipse at 80% 70%,rgba(168,85,247,.1) 0%,transparent 50%)
}
.wrap{max-width:340px}
.icon{
  width:110px;height:110px;
  background:linear-gradient(135deg,#6366f1,#a855f7);
  border-radius:28px;
  display:flex;align-items:center;justify-content:center;
  margin:0 auto 1.5rem;
  font-size:3.2rem;
  box-shadow:0 16px 48px rgba(99,102,241,.5);
}
h1{
  font-size:1.6rem;font-weight:900;margin-bottom:.75rem;
  background:linear-gradient(135deg,#fff,#c4b5fd);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text
}
p{color:#9ca3af;font-size:.95rem;line-height:1.8;margin-bottom:2rem}
.tip{
  background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);
  border-radius:12px;padding:.85rem 1rem;margin-bottom:1.5rem;
  font-size:.85rem;color:#c4b5fd;line-height:1.7
}
button{
  background:linear-gradient(135deg,#6366f1,#a855f7);
  color:#fff;border:none;padding:.85rem 2.5rem;
  border-radius:14px;font-size:1rem;
  font-family:inherit;cursor:pointer;font-weight:700;
  box-shadow:0 10px 28px rgba(99,102,241,.45);
  transition:transform .2s,opacity .2s;width:100%
}
button:active{transform:scale(.96);opacity:.9}
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">🔭</div>
  <h1>لا يوجد اتصال بالإنترنت</h1>
  <p>تحتاج إلى اتصال للوصول للمحتوى الجديد.<br>بعض المحتوى المحفوظ قد يكون متاحاً.</p>
  <div class="tip">
    💡 لتصفح التطبيق بدون نت بشكل كامل، افتحه مرة واحدة وهو متصل بالنت ليتم تحميل كل المحتوى.
  </div>
  <button onclick="location.reload()">🔄 إعادة المحاولة</button>
</div>
</body>
</html>`;

/* ── تثبيت ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW cache partial:', err);
        // Try caching files one by one to avoid total failure
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('Skip:', url, e)))
        );
      })
    )
  );
  self.skipWaiting();
});

/* ── تفعيل: احذف الكاشات القديمة + إشعار بالتحديث ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
  self.clients.claim();
});

/* ── استقبال الطلبات ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* APIs خارجية — network only */
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
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('emailjs.com') ||
    e.request.method !== 'GET'
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
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  /* CDN resources (FontAwesome, Firebase, etc.) — cache first */
  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('upload-widget.cloudinary.com')
  ) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  /* ملفات static — cache first, network fallback */
  if (/\.(css|js|png|jpg|jpeg|webp|ico|woff2|woff|svg|json)$/.test(url.pathname)) {
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

/* ── استقبال رسائل من التطبيق ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then(cache => cache.addAll(urls));
  }
});
