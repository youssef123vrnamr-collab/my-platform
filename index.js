// Cloud Function — بروكسي Streaming لـ Groq بيخفي المفتاح تمامًا عن المتصفح،
// ومعاه حمايات حقيقية على مستوى السيرفر (مش بس واجهة قابلة للتخطي):
//   1) لازم توكن دخول Firebase صحيح — مفيش استخدام من غير حساب مسجّل.
//   2) Rate limit لكل مستخدم (بالدقيقة + باليوم) يمنع أي إساءة استخدام حتى
//      لو حد لعب في الفرونت إند وتخطى الحدود اللي في script.js.
//   3) تنضيف/تقييد الـ body اللي بيتبعت لـ Groq (نموذج مسموح بيه، حجم رسائل
//      محدود، مفيش حقول غريبة بتتمرر زي ما هي).
//   4) CORS مقفول على دومين التطبيق بس، مش مفتوح لأي حد.
// نفس الفكرة تتكرر لـ Gemini / OpenRouter / Vercel Gateway (URL + endpoint
// مختلفين بس) — لسه شغالين مباشرة من المتصفح دلوقتي، ولازم نفس المعاملة.
//
// نشر: firebase deploy --only functions:groqProxy
// المفتاح بيتحط كـ secret مش في الكود: firebase functions:secrets:set GROQ_API_KEY

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

// ============ CORS — دومينات التطبيق المسموح لها تنادي البروكسي ============
// ضيف هنا أي دومين شغال عليه التطبيق فعليًا (نطاق Vercel بتاعك + أي دومين
// مخصص + localhost وقت التطوير). أي دومين مش في القائمة هيتم رفضه.
const ALLOWED_ORIGINS = [
  "https://your-app.vercel.app",     // ⚠️ غيّرها لدومين الـ Vercel الحقيقي بتاعك
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

// ============ RATE LIMITS ============
const PER_MINUTE_LIMIT = 20;   // أقصى عدد طلبات لكل مستخدم في الدقيقة
const PER_DAY_LIMIT = 400;     // سقف يومي احتياطي لكل مستخدم (خط دفاع تاني غير حساب التوكنات في الفرونت إند)
const MAX_MESSAGES = 60;       // أقصى عدد رسائل في المحادثة الواحدة
const MAX_MESSAGE_CHARS = 20000; // أقصى طول نص لكل رسالة
const MAX_TOKENS_CAP = 8000;   // أقصى قيمة مسموح بيها لـ max_tokens حتى لو الفرونت طلب أكتر
const ALLOWED_MODELS = null;   // مثال: ["llama-3.3-70b-versatile","llama-3.1-8b-instant"] — سيبها null لو عايز تسمح بأي موديل

// ============ SECURITY KILL-SWITCH (الدرع → التعهد الأمني) ============
// قبل أي طلب لـ Groq، بنقرا security/aiPause من الـ Realtime Database. لو
// مستخدم بلّغ عن خرق أمني من صفحة الدرع، الفرونت إند بيحط active:true +
// until (بعد 24 ساعة)، وهنا السيرفر بيرفض أي طلب ذكاء اصطناعي طول ما العلَم
// شغال ولسه في وقته — ده اللي بيضمن إن "التعهد" فعلي على مستوى السيرفر
// مش بس واجهة، حتى لو حد لعب في الفرونت إند وتخطى القفل اللي في script.js.
async function isAiPaused() {
  try {
    const snap = await admin.database().ref("security/aiPause").once("value");
    const val = snap.val();
    if (!val || !val.active) return false;
    if (val.until && val.until <= Date.now()) {
      // انتهت الـ 24 ساعة — نشيل العلَم تلقائيًا عشان الخدمة ترجع لوحدها
      await admin.database().ref("security/aiPause").update({ active: false });
      await admin.database().ref("security/broadcast").update({ active: false });
      return false;
    }
    return true;
  } catch (err) {
    console.error("isAiPaused check failed", err);
    return false; // فشل القراءة نفسه مايوقفش الخدمة عن الكل
  }
}

// ============ AUTH — لازم Firebase ID token صحيح ============
// المتصفح لازم يبعت: Authorization: Bearer <idToken بتاع firebase.auth().currentUser>
async function verifyCaller(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded; // فيه decoded.uid
  } catch (err) {
    console.warn("verifyIdToken failed", err.message);
    return null;
  }
}

// ============ RATE LIMIT — عدّاد لكل مستخدم في الـ Realtime Database ============
// بنستخدم transaction عشان لو جالك طلبين في نفس اللحظة ميحصلش race condition.
async function checkAndBumpRateLimit(uid) {
  const now = Date.now();
  const minuteKey = Math.floor(now / 60000);
  const dayKey = Math.floor(now / 86400000);
  const ref = admin.database().ref(`rateLimit/${uid}`);

  const result = await ref.transaction(current => {
    const data = current || {};
    // نضيّق البيانات القديمة (دقيقة/يوم فاتوا) عشان النود ميكبرش من غير داعي
    const minuteCount = (data.minuteKey === minuteKey) ? (data.minuteCount || 0) : 0;
    const dayCount = (data.dayKey === dayKey) ? (data.dayCount || 0) : 0;
    return {
      minuteKey, minuteCount: minuteCount + 1,
      dayKey, dayCount: dayCount + 1,
    };
  });

  if (!result.committed) return { ok: true }; // فشل نادر في الـ transaction — منسيبش المستخدم يتقفل بسببه
  const data = result.snapshot.val() || {};
  if (data.minuteCount > PER_MINUTE_LIMIT) {
    return { ok: false, reason: "rate_limited_minute" };
  }
  if (data.dayCount > PER_DAY_LIMIT) {
    return { ok: false, reason: "rate_limited_day" };
  }
  return { ok: true };
}

// ============ تنضيف الـ body قبل ما يتبعت لـ Groq ============
function sanitizePayload(body) {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  if (!Array.isArray(body.messages) || !body.messages.length) return { error: "messages_required" };
  if (body.messages.length > MAX_MESSAGES) return { error: "too_many_messages" };

  for (const m of body.messages) {
    if (!m || typeof m !== "object") return { error: "invalid_message" };
    if (typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS) {
      return { error: "message_too_long" };
    }
  }

  if (ALLOWED_MODELS && !ALLOWED_MODELS.includes(body.model)) {
    return { error: "model_not_allowed" };
  }

  // بنمرّر الحقول المعروفة بس (whitelist) — أي حقل غريب بيتشال
  const clean = {
    model: body.model,
    messages: body.messages,
    stream: !!body.stream,
  };
  if (typeof body.temperature === "number") clean.temperature = body.temperature;
  if (typeof body.top_p === "number") clean.top_p = body.top_p;
  if (body.max_tokens != null) {
    clean.max_tokens = Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP);
  }
  if (body.tools) clean.tools = body.tools;
  if (body.tool_choice) clean.tool_choice = body.tool_choice;

  return { data: clean };
}

exports.groqProxy = onRequest(
  { secrets: [GROQ_API_KEY], cors: ALLOWED_ORIGINS, timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    // 1) تسجيل الدخول
    const decoded = await verifyCaller(req);
    if (!decoded) {
      res.status(401).json({ error: "unauthorized", message: "Missing or invalid ID token." });
      return;
    }

    // 2) الكيل-سويتش
    if (await isAiPaused()) {
      res.status(503).json({
        error: "ai_paused",
        message: "AI services are temporarily paused for an emergency security review (up to 24h)."
      });
      return;
    }

    // 3) الـ Rate Limit
    const rl = await checkAndBumpRateLimit(decoded.uid);
    if (!rl.ok) {
      res.status(429).json({ error: rl.reason, message: "Too many requests — try again shortly." });
      return;
    }

    // 4) تنضيف الطلب
    const sanitized = sanitizePayload(req.body);
    if (sanitized.error) {
      res.status(400).json({ error: sanitized.error });
      return;
    }

    try {
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY.value(), // ← المفتاح بيتحط هنا بس، في السيرفر
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitized.data),
      });

      // بنمرّر نفس حالة الاستجابة والـ Content-Type (بما فيها البث Streaming)
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");

      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      console.error("groqProxy error", err);
      res.status(502).json({ error: "upstream_failed", message: err.message });
    }
  }
);
