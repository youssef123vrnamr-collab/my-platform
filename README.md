# 📱 ملفات PWA - Astronomy and Space
## طريقة التثبيت (خطوتين بس)

### الخطوة 1 — ارفع الملفات دي كلها على Vercel
الملفات المطلوبة:
- manifest.json
- sw.js
- offline.html
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

(حطّهم في نفس مجلد index.html على GitHub وـ Vercel هيعملهم deploy تلقائي)

### الخطوة 2 — تأكد إن sw.js بيتسجّل في script.js
في آخر الـ script.js لازم يكون فيه:
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
(موجود بالفعل ✅)

---

## النتيجة على الموبايل ✅
- أول ما حد يفتح الموقع على Chrome للأندرويد
- هيطلعله بانر "إضافة إلى الشاشة الرئيسية"
- يضغط عليه → ينزل التطبيق بالأيقونة على الشاشة
- بيشتغل زي تطبيق حقيقي من غير شريط المتصفح
