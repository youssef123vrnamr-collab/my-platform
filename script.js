(function(){
"use strict";

/* ============ FIREBASE ============
   Same Firebase project as the game (auth + database only — nothing
   about the game itself is reused here). */
const firebaseConfig = {
  apiKey: "AIzaSyC_1ZPw0NMw2YznMO0PE9vZGzFVa0f7jvQ",
  authDomain: "ai-prime-f9017.firebaseapp.com",
  projectId: "ai-prime-f9017",
  storageBucket: "ai-prime-f9017.firebasestorage.app",
  messagingSenderId: "932445525165",
  appId: "1:932445525165:web:425c870176b2091d12e224",
  databaseURL: "https://ai-prime-f9017-default-rtdb.europe-west1.firebasedatabase.app"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

/* ============ SECURITY (الدرع + الكيل-سويتش) — مراجع Realtime Database ============ */
const securityAiPauseRef = db.ref('security/aiPause');
const securityBroadcastRef = db.ref('security/broadcast');
const securityReportsRef = db.ref('security/emergencyReports');
window.__aiPaused = false;

/* ============ SHARE TARGET ============
   لما المستخدم يعمل "مشاركة" من تطبيق تاني (واتساب، المتصفح، ...) ويختار
   Digital Mind من قائمة المشاركة، النظام بيفتح index.html ومعاه ?title=&text=&url=
   (متعرّف في manifest.json تحت share_target). هنا بنلقط القيم دي أول ما
   الصفحة تفتح، بننضّف الرابط عشان أي ريفريش بعد كده ميكررش نفس النص، وبنسيبها
   جاهزة في pendingSharedText لحد ما المحادثة تبقى جاهزة نحطها في صندوق الكتابة. */
let pendingSharedText = '';
try{
  const __shareParams = new URLSearchParams(window.location.search);
  const __sTitle = (__shareParams.get('title') || '').trim();
  const __sText = (__shareParams.get('text') || '').trim();
  const __sUrl = (__shareParams.get('url') || '').trim();
  if(__sTitle || __sText || __sUrl){
    pendingSharedText = [__sTitle, __sText, __sUrl].filter(Boolean).join('\n\n');
    history.replaceState(null, '', window.location.pathname);
  }
}catch(e){ /* لو حصل أي خطأ في قراءة الرابط، منكملش عادي من غير مشاركة */ }
function applyPendingSharedTextIfAny(){
  if(!pendingSharedText) return;
  composerInput.value = pendingSharedText;
  composerInput.style.height = 'auto';
  composerInput.style.height = Math.min(140, composerInput.scrollHeight) + 'px';
  composerInput.focus();
  pendingSharedText = '';
}
// ── التحكم في إيقاف الرد: كل رسالة بتتبعت بتاخد AbortController جديد،
//    وأي fetch شغال في المعالجة (بحث، قراءة رابط، أي مزوّد ذكاء اصطناعي)
//    بيتربط بنفس الـ signal بتاعه، عشان ضغطة "إيقاف" توقف كل حاجة فورًا ──
let currentAbortController = null;
function isAbortError(e){ return e && e.name === 'AbortError'; }
// ── أي إلغاء عمومًا (يدوي أو بسبب خمول) — الإشارة نفسها بقت "ميتة" فمفيش
//    فايدة نعيد المحاولة بيها تاني، لازم ننتقل فورًا للخطوة اللي بعدها ──
function isAnyAbortError(e){ return e && (e.name === 'AbortError' || e.name === 'TimeoutError'); }
// ── بنفرّق بين إيقاف يدوي (المستخدم دوس زرار الإيقاف) وبين إلغاء تلقائي
//    (واتشدوج/تايم آوت)، عشان الرسالة اللي بتظهر تكون واضحة وصح في الحالتين ──
let __manualStopRequested = false;

// ── تحميل كسول (Lazy Loading) للمكتبات الثقيلة (pdf.js / mammoth / xlsx / jszip):
//    كل مكتبة بتتحمّل من الـ CDN مرة واحدة بس، وبس لما المستخدم فعلاً يرفع ملف
//    من نوعها — بدل ما الأربعة يتحمّلوا مقدمًا مع كل فتحة للتطبيق ويبطّئوا التحميل الأولي ──
const __loadedScripts = {};
function loadScriptOnce(url){
  if (__loadedScripts[url]) return __loadedScripts[url];
  __loadedScripts[url] = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve(true);
    s.onerror = () => { delete __loadedScripts[url]; reject(new Error('فشل تحميل مكتبة: ' + url)); };
    document.head.appendChild(s);
  });
  return __loadedScripts[url];
}
const LIB_URLS = {
  pdfjs:  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  mammoth:'https://cdnjs.cloudflare.com/ajax/libs/mammoth.js/1.7.2/mammoth.browser.min.js',
  xlsx:   'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jszip:  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
};

// ── مرونة الشبكة (Network Resilience): دمج إشارتين Abort في واحدة (زرار الإيقاف
//    اليدوي + مهلة الطلب Timeout)، عشان أي طلب يتقفل تلقائيًا لو الشبكة اتعلقت
//    بدل ما يفضل معلّق للأبد، وبرضه يتقفل فورًا لو المستخدم دوس "إيقاف" ──
function combineSignals(signals){
  const valid = signals.filter(Boolean);
  if (!valid.length) return undefined;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(valid);
  const controller = new AbortController();
  valid.forEach(s=>{
    if (s.aborted) controller.abort(s.reason);
    else s.addEventListener('abort', ()=>controller.abort(s.reason), { once:true });
  });
  return controller.signal;
}
// مهلة موحّدة لكل طلبات الشبكة (30 ثانية) بدل ما تفضل معلّقة من غير حد أقصى
function requestSignal(extraMs){
  const timeoutSignal = (typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(extraMs || 30000) : null;
  return combineSignals([currentAbortController ? currentAbortController.signal : null, timeoutSignal]);
}
// ── مهلة خمول (Idle Timeout) للطلبات اللي بتستريم (تفكير عميق + رد):
//    مهلة إجمالية ثابتة على كل الطلب (زي requestSignal) بتقفل الاتصال حتى
//    لو لسه بيوصل منه بيانات فعليًا، وده اللي كان بيحصل مع تفكير عميق
//    بياخد وقت أطول من المهلة — النظام كان بيوقف العملية فجأة رغم إنها شغالة.
//    هنا بدل كده: بنوقف الطلب بس لو فعلاً "سكت" ومفيش ولا بايت جديد وصل
//    خلال مدة معينة، وكل جزء جديد بيوصل من الستريم بيصفّر العداد من الأول ──
function createIdleAbortSignal(idleMs){
  const controller = new AbortController();
  let timer = setTimeout(()=>controller.abort(new DOMException('استغرق الاتصال وقت طويل من غير رد', 'TimeoutError')), idleMs);
  return {
    signal: combineSignals([currentAbortController ? currentAbortController.signal : null, controller.signal]),
    bump(){ clearTimeout(timer); timer = setTimeout(()=>controller.abort(new DOMException('استغرق الاتصال وقت طويل من غير رد', 'TimeoutError')), idleMs); },
    clear(){ clearTimeout(timer); }
  };
}
// ── إعادة محاولة تلقائية بتأخير متزايد (Exponential Backoff): بتتعمل بس على
//    فشل الاتصال الأولي (قبل ما البث يبدأ) — لو الفشل حصل بعد ما البث بدأ
//    والنص اتجمّع جزء منه، بنكمل من نفس النقطة (Auto-Resume) مش بنعيد الاتصال ──
async function fetchWithRetry(url, options, maxRetries){
  maxRetries = (maxRetries == null) ? 2 : maxRetries;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++){
    try{
      return await fetch(url, options);
    } catch(e){
      lastErr = e;
      if (isAnyAbortError(e)) throw e; // إيقاف يدوي أو خمول — الإشارة ماتت، منعيدش المحاولة بيها
      if (attempt === maxRetries) throw e;
      const delay = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s...
      await new Promise(r=>setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Firestore بتاع مشروع محفوظات نفسه (مش فلك) — هنا هنخزّن "الذاكرة الدائمة" (غرفة 3):
//    تقييمات الردود 👍👎 اللي بتغذي دروس مستفادة وردود عجبت الناس، خاصة بمحفوظات بس ──
const ownDb = firebase.firestore();

/* ============ SHARED AI KEYS (من نفس Firestore بتاع منصة فلك) ============
   منصة فلك (مشروع Firebase: planning-with-ai-390af) بتخزّن كل مفاتيح
   الذكاء الاصطناعي (Groq / Gemini / OpenRouter / Vercel AI Gateway / Tavily) في
   Firestore هنا: system/ai_settings — بنفس الطريقة دي بالظبط، المنصة
   الجديدة دي بتتصل بنفس المشروع (كـ "secondary app"، من غير ما تلمس أو
   تعدل حاجة في فلك نفسها) وتقرا نفس المفاتيح لحظة بلحظة، وتستخدم نفس
   نظام التوزيع والتبديل التلقائي (fallback) اللي فلك بتستخدمه بالظبط:
   Groq → Gemini → OpenRouter → Vercel AI Gateway لو اللي قبله فشل. */
const falakConfig = {
  apiKey: "AIzaSyCAgFi4D9hwtuK391fLsbnDuh5AtTDIHKU",
  authDomain: "planning-with-ai-390af.firebaseapp.com",
  projectId: "planning-with-ai-390af",
  storageBucket: "planning-with-ai-390af.firebasestorage.app",
  messagingSenderId: "601755857673",
  appId: "1:601755857673:web:b9d7d63e13035412a819d8"
};
const falakApp = firebase.initializeApp(falakConfig, "falak");
const falakDb = falakApp.firestore();

/* ============ ApiKeyPool (نفس نسخة فلك حرفيًا) ============
   لو فيه أكتر من مفتاح لنفس المزوّد، بيوزّع الطلبات بينهم (Round-Robin)،
   ولو مفتاح فشل مرتين على التوالي بيتجنّبه لمدة 5 دقايق ويستخدم غيره. */
const ApiKeyPool = {
  create(){
    const state = { keys: [], idx: 0, status: {} };
    return {
      setKeys(arr){
        state.keys = (arr||[]).map(k=>(k||'').toString().trim()).filter(Boolean);
        if (state.idx >= state.keys.length) state.idx = 0;
      },
      count(){ return state.keys.length; },
      next(){
        if (!state.keys.length) return null;
        const n = state.keys.length;
        for (let i=0;i<n;i++){
          const k = state.keys[state.idx % n];
          state.idx = (state.idx+1) % n;
          const s = state.status[k];
          const degraded = s && s.consecFail>=2 && (Date.now()-s.lastFailAt) < 300000;
          if (!degraded) return k;
        }
        return state.keys[0];
      },
      report(key, ok){
        if (!key) return;
        const s = state.status[key] || (state.status[key] = { consecFail:0, lastFailAt:0 });
        if (ok) s.consecFail = 0; else { s.consecFail++; s.lastFailAt = Date.now(); }
      }
    };
  }
};
const GroqKeyPool = ApiKeyPool.create();
const GeminiKeyPool = ApiKeyPool.create();
const OpenRouterKeyPool = ApiKeyPool.create();
const VercelGatewayKeyPool = ApiKeyPool.create();
let globalAiInstructions = "";
let tavilyApiKey = "";

falakDb.collection("system").doc("ai_settings").onSnapshot(
  snap => {
    const d = snap.exists ? (snap.data() || {}) : {};
    const soloGroq = (d.groqApiKey && String(d.groqApiKey).trim()) || "";
    const soloGemini = (d.geminiApiKey && String(d.geminiApiKey).trim()) || "";
    globalAiInstructions = (d.globalAiInstructions && String(d.globalAiInstructions).trim()) || "";
    tavilyApiKey = (d.tavilyApiKey && String(d.tavilyApiKey).trim()) || "";
    globalDailyTokenBudget = (d.dailyTokenBudget && Number(d.dailyTokenBudget) > 0) ? Number(d.dailyTokenBudget) : DEFAULT_DAILY_TOKEN_BUDGET;
    updateUsageWindowUI();
    GroqKeyPool.setKeys(Array.isArray(d.groqApiKeys) && d.groqApiKeys.length ? d.groqApiKeys : (soloGroq ? [soloGroq] : []));
    GeminiKeyPool.setKeys(Array.isArray(d.geminiApiKeys) && d.geminiApiKeys.length ? d.geminiApiKeys : (soloGemini ? [soloGemini] : []));
    OpenRouterKeyPool.setKeys(Array.isArray(d.openrouterApiKeys) ? d.openrouterApiKeys : []);
    VercelGatewayKeyPool.setKeys(Array.isArray(d.vercelApiKeys) ? d.vercelApiKeys : []);
  },
  err => {
    // الأغلب لو ده ظهر: صلاحيات Firestore بتاعة فلك مش سامحة بالقراءة من
    // مشروع تاني. الحل: من إعدادات Firestore Rules في مشروع فلك، تسمح
    // بقراءة system/ai_settings (زي ما هي مسموحة أصلاً لمستخدمي فلك نفسها).
    console.warn("مقدرش أقرا مفاتيح الذكاء الاصطناعي من فلك:", err);
  }
);

/* ============ الذاكرة الدائمة (غرفة 3) — دروس من 👎 وردود عجبت الناس 👍 ============
   بتتخزن في Firestore بتاع محفوظات نفسها (ownDb)، مش فلك — عشان تبقى خاصة
   بمحفوظات وبمستخدميها بس، بنفس فكرة فلك بالظبط لكن قاعدة بيانات منفصلة. */
let lessonsList = [];   // ردود اتقيّمت 👎 — دروس متتكررش
let goodAnswersList = []; // ردود اتقيّمت 👍 — حافظ على نفس المستوى
ownDb.collection("ai_feedback").where("liked","==",false).orderBy("createdAt","desc").limit(8)
  .onSnapshot(snap => { lessonsList = snap.docs.map(d=>d.data()); }, err => console.warn("lessons feed err", err));
ownDb.collection("ai_feedback").where("liked","==",true).orderBy("createdAt","desc").limit(8)
  .onSnapshot(snap => { goodAnswersList = snap.docs.map(d=>d.data()); }, err => console.warn("good answers feed err", err));

function submitAIFeedback(liked, question, answer){
  try{
    ownDb.collection("ai_feedback").add({
      userId: (currentUser && currentUser.uid) || null,
      question: String(question||"").slice(0,500),
      answer: String(answer||"").slice(0,2000),
      liked: !!liked,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e=>console.error("feedback add err", e));
  } catch(e){ console.error("submitAIFeedback err", e); }
}

const AI_DISPLAY_NAME = "AlalaGyGyAgha V2.6";
// النظام تلقائي بس دلوقتي — مفيش اختيار يدوي لموديل معيّن ولا متغيّر بيتفحص
// قيمته، عشان المستخدم دايمًا ياخد نفس تجربة "خطوط الدفاع"
// (Groq → Gemini → OpenRouter → Vercel) بالترتيب الثابت في getAIResponse.

/* ============ القراءة الصوتية (Text-to-Speech) — كانت موجودة في فلك وناقصة هنا ============
   بتقرا رد الذكاء بصوت عربي لو متاح على الجهاز، مع زرار توقف لو المستخدم عايز يقاطع. */
let voiceSettings = { voiceURI: null, rate: 1, pitch: 1 };
let availableVoices = [];
let currentUtterance = null;

function loadArabicVoices(){
  if (!('speechSynthesis' in window)) return;
  availableVoices = window.speechSynthesis.getVoices() || [];
  if (!voiceSettings.voiceURI){
    const ar = availableVoices.find(v => /^ar/i.test(v.lang));
    if (ar) voiceSettings.voiceURI = ar.voiceURI;
  }
}
if ('speechSynthesis' in window){
  loadArabicVoices();
  window.speechSynthesis.onvoiceschanged = loadArabicVoices;
}

// ── بيشيل الماركداون/كتل الكود من النص قبل ما ينطقه، عشان الصوت يبقى مفهوم ──
function stripForSpeech(raw){
  return String(raw||'')
    .replace(/```[\s\S]*?```/g, ' جزء كود، اضغط على البطاقة عشان تشوفه. ')
    .replace(/\[\[color:[a-zA-Z]+\]\]([\s\S]*?)\[\[\/color\]\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/https?:\/\/\S+/g, ' رابط. ')
    .replace(/[*_>~]/g, '')
    .trim();
}

function speakText(text, btnEl){
  if (!('speechSynthesis' in window)){
    showToastSafe('⚠️ المتصفح ده مش بيدعم القراءة الصوتية');
    return;
  }
  const wasSpeaking = window.speechSynthesis.speaking;
  window.speechSynthesis.cancel();
  document.querySelectorAll('.cosmos-action-btn.speaking').forEach(b=>{
    b.classList.remove('speaking'); b.innerHTML = '<i class="fas fa-volume-high"></i>';
  });
  if (wasSpeaking && btnEl && btnEl.dataset.wasActive === '1'){ btnEl.dataset.wasActive = '0'; return; }

  const clean = stripForSpeech(text);
  if (!clean) return;
  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = voiceSettings.rate; utter.pitch = voiceSettings.pitch;
  const voice = availableVoices.find(v => v.voiceURI === voiceSettings.voiceURI);
  if (voice) utter.voice = voice; else utter.lang = 'ar-EG';
  if (btnEl){
    btnEl.classList.add('speaking'); btnEl.innerHTML = '<i class="fas fa-stop"></i>'; btnEl.dataset.wasActive = '1';
  }
  utter.onend = utter.onerror = ()=>{
    if (btnEl){ btnEl.classList.remove('speaking'); btnEl.innerHTML = '<i class="fas fa-volume-high"></i>'; btnEl.dataset.wasActive = '0'; }
    currentUtterance = null;
  };
  currentUtterance = utter;
  window.speechSynthesis.speak(utter);
}
function showToastSafe(msg){ showToast(msg); }

// ── نظام إشعارات Toast مع تصنيف نوع الخطأ (شبكة / تجاوز حدود / ملف غير مدعوم / نجاح / عام) —
//    كل نوع له أيقونة ولون مميز، وaria-live عشان قارئات الشاشة تعلن الرسالة تلقائيًا ──
const TOAST_TYPES = {
  error:      { icon:'fa-circle-exclamation', cls:'toast-error' },
  network:    { icon:'fa-wifi', cls:'toast-network' },
  limit:      { icon:'fa-gauge-high', cls:'toast-limit' },
  unsupported:{ icon:'fa-file-circle-xmark', cls:'toast-unsupported' },
  success:    { icon:'fa-circle-check', cls:'toast-success' },
  info:       { icon:'fa-circle-info', cls:'toast-info' }
};
let __toastTimer = null;
function showToast(msg, type){
  const meta = TOAST_TYPES[type] || TOAST_TYPES.info;
  let el = document.getElementById('mahfoozat-toast');
  if (!el){
    el = document.createElement('div');
    el.id = 'mahfoozat-toast';
    el.className = 'app-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = 'app-toast ' + meta.cls;
  el.innerHTML = '<i class="fas '+meta.icon+'" aria-hidden="true"></i><span></span>';
  el.querySelector('span').textContent = msg;
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(()=>{ el.classList.remove('show'); }, 3200);
}

/* ============ غرفة 1: التفكير العميق — نفس تعليمات فلك بالظبط + دفعها لتفكير احترافي حقيقي ============ */
function buildReasoningRoomBlock(){
  return '\n\n--- غرفة التفكير العميق (Deep Thinking Room) — تفكيرك الداخلي الحقيقي، منفصل عن الرد النهائي ---\n' +
    'ملاحظة مهمة: النظام بيفصل تفكيرك (reasoning) عن ردك النهائي (content) تلقائيًا ويعرض تفكيرك في صندوق منفصل قابل للفتح للمستخدم — يعني اكتب تفكيرك بحرية وبالتفصيل هنا، ومتقلقش إنه هيظهر في الرد النهائي لأنه مش هيظهر فيه.\n' +
    'استخدم المساحة دي زي مهندس/خبير محترف بيفكر فعلاً قبل ما يجاوب، مش بس ملخص سريع. لو السؤال عن كود أو نظام تقني: افهم المطلوب بالظبط الأول (حتى لو محتاج تفترض حاجة غامضة، اذكرها لنفسك)، فكر في أكتر من طريقة ممكنة لحل المشكلة وقارن بينهم بصراحة (مميزات/عيوب كل واحدة)، اختار أفضل حل وقول ليه هو الأنسب هنا تحديدًا، فكر في الحالات الحدّية (edge cases) والأخطاء المحتملة وإزاي هتتعامل معاها، وراجع الحل في دماغك خطوة بخطوة قبل ما تكتبه في الرد النهائي (يعني "شغّله وهميًا" في عقلك وشوف هل فعلاً هيشتغل صح). لو السؤال تحليلي أو معلوماتي: فكك المشكلة لأجزاء، اجمع المعطيات، وازن بين وجهات النظر المختلفة لو موجودة، ووصل لاستنتاج مبني على منطق واضح مش رأي عشوائي. الهدف إن الرد النهائي يطلع نتيجة تفكير عميق فعلي، مش مجرد إجابة سريعة من أول خاطر.';
}

/* ============ قاعدة إلزامية: كود بمستوى مهندس محترف (Senior Engineer) ============
   مش بس "الكود يشتغل" — المطلوب كود نضيف، منظم، وبمعايير احترافية حقيقية. */
function buildProCodeQualityBlock(){
  return '\n\nقاعدة إلزامية بخصوص جودة الكود: لما تكتب كود، اكتبه بمستوى مهندس Senior محترف مش مجرد كود "بيشتغل وخلاص":\n' +
    '- استخدم أفضل الممارسات (best practices) المعروفة للغة/الإطار (framework) اللي بتكتب بيه، وابتعد عن أي نمط قديم أو متروك (deprecated).\n' +
    '- سمّي المتغيرات والدوال بأسماء واضحة ومعبّرة عن معناها، مش أسماء عشوائية زي x أو temp من غير داعي.\n' +
    '- افصل المسؤوليات (separation of concerns) — كل دالة أو جزء ليه مهمة واحدة واضحة، من غير حشو كل حاجة في مكان واحد.\n' +
    '- تعامل مع الأخطاء المتوقعة (error handling) بدل ما تفترض إن كل حاجة هتنجح دايمًا (زي فشل طلب شبكة، إدخال غلط من المستخدم، قيمة فاضية أو null).\n' +
    '- غطّي الحالات الحدّية (edge cases) المنطقية للمشكلة، مش بس الحالة السعيدة (happy path).\n' +
    '- لو الكود فيه منطق مش بديهي أو قرار تصميمي مهم، حط تعليق قصير يشرح "ليه" مش بس "إيه" — من غير ما تبالغ في التعليقات على حاجات واضحة أصلاً.\n' +
    '- انتبه للأداء (performance) في الحاجات اللي منطقيًا ممكن تبقى مشكلة (زي حلقات متداخلة على بيانات كبيرة، أو طلبات شبكة زيادة عن اللزوم)، من غير ما تعقّد الكود بلا داعي في حاجات بسيطة.\n' +
    '- لو في اعتبار أمني واضح للسياق (زي مدخلات مستخدم، مفاتيح، صلاحيات)، خده بالك منه.\n' +
    'باختصار: تخيل إن الكود ده هيتراجع من مبرمج محترف تاني قبل ما يتنشر — لازم يبان إنه مكتوب باحتراف من أول قراءة، مش مجرد حل سريع.';
}

/* ============ قاعدة تلوين وتنسيق النص (ألوان متناسقة مع خلفية التطبيق + تنسيقات حرة) + منع اللاتكس الخام ============ */
function buildColorPolicyBlock(){
  return '\n\nقاعدة التلوين والتنسيق: عندك حرية إنك تلوّن وتنسّق أي جزء من ردك النصي (مش الكود) زي ما تحس إنه مناسب، لكن الألوان لازم تكون من مجموعة محددة ومظبوطة عشان تبان متناسقة مع خلفية التطبيق الغامقة الدافية، مش أي لون عشوائي ممكن يبان لاقع أو مش متناسق مع التصميم. استخدم الصيغة دي بالظبط: [[fmt:خصائص]]النص هنا[[/fmt]] — و"خصائص" قائمة مفصولة بفاصلة، ممكن تحط فيها لون واحد بس من القائمة المسموحة دي (وكل لون له معنى مقترح بس مش إلزامي تلتزم بيه):\n'
    + '- gold أو amber → تمييز أو تنبيه إيجابي أو نقطة مهمة\n'
    + '- sage → نجاح أو نقطة إيجابية\n'
    + '- rose → تحذير أو خطأ\n'
    + '- coral → تنبيه متوسط\n'
    + '- sky → معلومة أو ملاحظة\n'
    + '- lavender → حاجة مميزة أو غير عادية\n'
    + '- sand أو slate → تفاصيل ثانوية أقل أهمية\n'
    + 'وممكن تضيف مع اللون (أو من غيره) أي من دول: bold, italic, underline, strike, highlight — و highlight بتحط خلفية خفيفة شفافة بنفس اللون حوالين النص زي شارة (badge). مثال: [[fmt:rose,bold]]تحذير مهم[[/fmt]] أو [[fmt:gold,highlight]]نقطة مميزة[[/fmt]]. ممنوع تماما تستخدم أي لون تاني غير القائمة دي، وممنوع تكتب كود hex أو أسماء ألوان عادية زي red أو blue أو green مباشرة — استخدم الأسماء المتناسقة دي بس عشان تفضل شكل التطبيق موحّد وحلو. ومتلوّنش أو تنسّق الرد كله ولا كل سطر، استخدمها بس لما فعلاً تفيد. مهم جدًا: اكتب علامة الإغلاق بالظبط [[/fmt]] من غير أي مسافة جوه القوسين (يعني ممنوع [[ /fmt]] أو [[/ fmt]])، لأن أي مسافة زيادة ممكن تمنع التنسيق من الظهور صح.';
}
function buildNoRawLatexBlock(){
  return '\n\nقاعدة إلزامية: ممنوع تستخدم صيغة LaTeX الخام (زي \\frac{}{} أو \\sqrt{} أو \\gamma أو \\times) في أي معادلة رياضية، لأن واجهة المحادثة دي مفيهاش عارض LaTeX وهتظهر للمستخدم كرموز خام غريبة بدل معادلة واضحة. اكتب المعادلات بصيغة نصية عادية ومقروءة بس (زي x^2 أو (a+b)/c أو √x أو a/b أو γ = 1/√(1-v²/c²)).';
}
/* ============ قاعدة إلزامية: أكواد كاملة أبدًا مبتورة ============
   أكتر مشكلة بتحصل مع الموديلات: بتوقف الكود في نص الطريق أو تحط تعليق
   زي "// باقي الكود زي ما هو" بدل ما تكتبه فعليًا. القاعدة دي بتمنع ده. */
function buildCodeCompletenessBlock(){
  return '\n\nقاعدة إلزامية بخصوص الأكواد: لما تكتب كود جوه ```، لازم يكون الكود كامل 100% وشغّال من الأول للآخر، من غير أي اختصار أو حذف. ممنوع تماما تستخدم أي حاجة زي "// باقي الكود زي ما هو"، "// rest of the code"، "// ...", "/* نفس الكود اللي فات */"، أو أي جملة تلخيصية بدل ما تكتب الكود فعليًا — حتى لو الملف طويل. لو الكود طويل جدًا ومحتاج مساحة أكبر من اللي قدامك، اكتب أكبر قدر ممكن منه وسيبه بدون علامة إغلاق ``` في نهاية ردك (يعني متقفلش الكود الفاضي)، عشان النظام هيطلب منك تكمل تلقائيًا من نفس النقطة؛ أما لو خلصت الكود فعلاً، اقفله بـ ``` عادي. الأولوية دايمًا لكود كامل وصحيح، حتى لو ده معناه إجابة أطول.';
}
/* ============ قاعدة إلزامية: أي كود لازم يبقى جوه ``` بس، ممنوع يتكتب وسط الكلام ============
   المشكلة اللي بتحصل: الموديل أحيانًا بيكتب سطر كود أو اسم دالة أو أمر Terminal
   جوه جملة عادية من غير ما يحطه جوه ```، فالنظام (اللي بيعتمد على ``` عشان
   يعرف ده كود ويعرضه في بطاقة الكود المخصصة، ويظهر خطوة "بيجهّز الكود" في
   غرفة التفكير) مش بيتعرف عليه، فبيفضل يبان كنص عادي وسط الرد. القاعدة دي
   بتمنع ده نهائيًا. */
function buildCodeFencingRuleBlock(){
  return '\n\nقاعدة إلزامية وصارمة جدًا بخصوص مكان كتابة الكود: أي كود بأي حجم — حتى لو سطر واحد بس، أو اسم دالة، أو أمر Terminal، أو قيمة إعداد (config)، أو وسم HTML، أو أي رمز برمجي عمومًا — لازم يتحط دايمًا وبدون أي استثناء جوه ثلاث علامات ``` (يعني ```لغة الكود ثم سطر جديد ثم الكود ثم ``` في سطر لوحده)، حتى لو كان سطر واحد بس زي `git status` أو متغيّر زي `x = 5`. ممنوع منعًا باتًا تكتب أي رمز برمجي أو سطر كود جوه جملة عادية أو فقرة نصية أو حتى بعلامة تنصيص عادية `زي دي` بدون فتح كتلة ``` كاملة — النظام هنا مش زي شات عادي، فيه مكان مخصص بيعرض فيه الكود بشكل منفصل (بألوان الصياغة اللغوية، وزرار تشغيل/معاينة)، وأي كود يتكتب برا الـ ``` مش هيظهر في المكان ده خالص وهيبان غلط وسط الكلام. فلو مش متأكد إن الحاجة دي "كود" ولا لأ، افتكر: أي حاجة المفروض تتكتب بخط Monospace/ثابت العرض (اسم متغيّر، دالة، أمر، مسار ملف، JSON، HTML، CSS) — حطها جوه ``` على طول من غير تفكير زيادة.';
}

/* ============ محرك تشغيل الكود (أي لغة) — أساس زر "المعاينة/التشغيل" وحلقة التصحيح الذاتي ============
   1) HTML/XML (أو JS لوحده أو أي كود فيه <html>) → بيتحط جوه iframe (sandbox) حقيقي،
      وبيتقرا فيه أي خطأ فعلي عن طريق جسر بسيط (window.onerror + console.error) بيبعت
      الأخطاء لبره الـ iframe. لو visible=true، الـ iframe نفسه بيترجع عشان يتعرض
      كمعاينة حقيقية للمستخدم (مش بس فحص خلفي).
   2) أي لغة تانية (Python/C/C++/Java/PHP/Ruby/Go/Bash/SQL...) → بتتبعت لـ Piston
      (emkc.org) وهي API عامة ومجانية لتشغيل كود حقيقي بأمان على السيرفر بتاعها،
      وبترجع stdout/stderr فعليين — مش تخمين — عشان نعرضهم في "معاينة ترمنال".
   لغات زي CSS/JSON/YAML/Markdown مالهاش معنى "تشغيل" فعلي، فبترجع ok:null
   (يعني "مش قابل للتقييم" مش "فيه خطأ"). */
const PISTON_LANG_MAP = {
  py:'python', python:'python', ts:'typescript', typescript:'typescript',
  c:'c', cpp:'cpp', java:'java', php:'php', rb:'ruby', ruby:'ruby', go:'go',
  sh:'bash', bash:'bash', shell:'bash', sql:'sqlite3'
};
const PISTON_VERSION_HINT = { python:'3.10.0', typescript:'5.0.3', c:'10.2.0', cpp:'10.2.0', java:'15.0.2', php:'8.2.3', ruby:'3.0.1', go:'1.16.2', bash:'5.2.0', sqlite3:'3.36.0' };

async function runViaPiston(pistonLang, code){
  try{
    const res = await fetchWithRetry('https://emkc.org/api/v2/piston/execute', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ language: pistonLang, version: PISTON_VERSION_HINT[pistonLang] || '*', files:[{ content: code }] }),
      signal: requestSignal(20000)
    }, 1);
    const data = await res.json();
    const run = (data && data.run) || {};
    const compile = data && data.compile;
    const stderr = ((compile && compile.stderr) || '') + (run.stderr || '');
    const ok = !stderr.trim() && (run.code === 0 || run.code == null);
    return { ok, stdout: run.stdout || '', stderr: stderr.trim() || (run.signal ? ('العملية اتقفلت بإشارة: '+run.signal) : '') };
  } catch(e){
    if (isAbortError(e)) throw e;
    return { ok:null, stdout:'', stderr:'تعذّر الاتصال بخدمة تشغيل الأكواد دلوقتي (' + (e.message||e) + ')' };
  }
}

// ── اختبار/معاينة HTML أو JS جوه iframe معزول (sandbox)، بجسر بسيط بيوصّل أي خطأ فعلي
//    (onerror / console.error) من جوه الـ iframe لبرّه. لو visible=true بيرجع الـ iframe
//    نفسه عشان يتحط في الصفحة كمعاينة حقيقية شغالة (مش بس فحص)، ولو false بيتشال فورًا
//    بعد الاختبار (ده اللي بيستخدمه التصحيح التلقائي في الخلفية) ──
function runHtmlInIframe(htmlDoc, opts){
  opts = opts || {};
  return new Promise((resolve)=>{
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms');
    if (opts.visible){
      iframe.className = 'code-preview-iframe';
    } else {
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;';
    }
    const errors = [];
    let settled = false;
    window.__iframeErrorSink = window.__iframeErrorSink || {};
    const sinkId = 'sink' + Date.now() + Math.random().toString(36).slice(2);
    window.__iframeErrorSink[sinkId] = (msg)=> errors.push(msg);
    const bridge = '<script>window.onerror=function(m,s,l){try{parent.__iframeErrorSink["'+sinkId+'"]("خطأ: "+m+" (سطر "+l+")");}catch(e){}};'
      + 'var _ce=console.error;console.error=function(){try{_ce.apply(console,arguments);}catch(e){}try{parent.__iframeErrorSink["'+sinkId+'"](Array.prototype.slice.call(arguments).join(" "));}catch(e){}};</'+'script>';
    iframe.srcdoc = bridge + htmlDoc;
    document.body.appendChild(iframe);
    const finish = ()=>{
      if (settled) return; settled = true;
      delete window.__iframeErrorSink[sinkId];
      if (!opts.visible) iframe.remove();
      resolve({ ok: errors.length===0, stdout:'', stderr: errors.join('\n'), iframeEl: opts.visible ? iframe : null });
    };
    setTimeout(finish, opts.visible ? 2500 : 1800);
  });
}

function isWebLang(l){ return l==='html' || l==='htm' || l==='xml'; }
function isSkippedLang(l){ return l==='css' || l==='scss' || l==='json' || l==='yaml' || l==='yml' || l==='md' || l===''; }
function wrapCodeAsHtmlDoc(lang, code){
  const isFullPage = /<html[\s>]/i.test(code);
  if (isFullPage) return code;
  if (lang==='js' || lang==='javascript') return '<!DOCTYPE html><html><head></head><body><script>'+code+'</'+'script></body></html>';
  return '<!DOCTYPE html><html><head></head><body>'+code+'</body></html>';
}

// ── نقطة الدخول الموحّدة (فحص خلفي، مش معاينة مرئية): بتاخد اللغة والكود وترجع
//    { ok, stdout, stderr }. ok=true (شغال صح) / ok=false (فيه خطأ فعلي) / ok=null
//    (اللغة دي مالهاش معنى "تشغيل"، أو تعذّر الاختبار — منعتبرهاش خطأ في الحالتين) ──
async function runAnyCode(lang, code, visible){
  const l = (lang||'').toLowerCase().trim();
  if (isSkippedLang(l)) return { ok:null, stdout:'', stderr:'' };
  if (isWebLang(l) || l==='js' || l==='javascript' || /<html[\s>]/i.test(code)){
    return runHtmlInIframe(wrapCodeAsHtmlDoc(l, code), { visible: !!visible });
  }
  const pistonLang = PISTON_LANG_MAP[l];
  if (!pistonLang) return { ok:null, stdout:'', stderr:'' };
  return runViaPiston(pistonLang, code);
}
function extractCodeBlocksFromText(text){
  const blocks = [];
  const re = /```([a-zA-Z0-9]*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text||''))) blocks.push({ lang:(m[1]||'').trim(), code:m[2].replace(/\n$/,'') });
  return blocks;
}


/* ============ نظام كتابة الأكواد الذكي — بطاقة ملف لكل كتلة كود ============
   هيدر فيه أيقونة/اسم ملف/لغة/عدد أسطر + تلوين كود احترافي (highlight.js) + نسخ/تنزيل + تقييم 👍👎
   يغذي "غرفة كود دائمة" منفصلة عن غرفة النصوص، بنفس فكرة فلك بالظبط. */
window.__codeGroups = window.__codeGroups || {};
let _codeGidCounter = 0;

const CODE_EXT_MAP   = { html:'html', htm:'html', xml:'xml', css:'css', scss:'scss', js:'js', javascript:'js', jsx:'jsx', ts:'ts', typescript:'ts', json:'json', py:'py', python:'py', sql:'sql', sh:'sh', bash:'sh', shell:'sh', c:'c', cpp:'cpp', java:'java', php:'php', rb:'rb', ruby:'rb', go:'go', yaml:'yaml', yml:'yaml', md:'md' };
const CODE_LABEL_MAP = { html:'HTML', htm:'HTML', css:'CSS', scss:'SCSS', js:'JS', javascript:'JS', jsx:'JSX', ts:'TS', typescript:'TS', json:'JSON', py:'PY', python:'PY', sql:'SQL', sh:'SH', bash:'SH', shell:'SH', c:'C', cpp:'C++', java:'JAVA', php:'PHP', rb:'RUBY', ruby:'RUBY', go:'GO', yaml:'YAML', yml:'YAML', md:'MD' };
const CODE_NAME_MAP  = { html:'index', css:'style', js:'script', jsx:'app', ts:'app', json:'data', py:'main', sql:'query', sh:'script', c:'main', cpp:'main', java:'Main', php:'index', rb:'main', go:'main', md:'readme' };
const CODE_HLJS_MAP  = { html:'xml', htm:'xml', css:'css', scss:'scss', js:'javascript', javascript:'javascript', jsx:'javascript', ts:'typescript', typescript:'typescript', json:'json', py:'python', python:'python', sql:'sql', sh:'bash', bash:'bash', shell:'bash', c:'c', cpp:'cpp', java:'java', php:'php', rb:'ruby', ruby:'ruby', go:'go', yaml:'yaml', yml:'yaml', md:'markdown' };

function buildCodeFileCard(lang, code){
  const gid = 'cg' + (++_codeGidCounter) + '_' + Date.now();
  window.__codeGroups[gid] = code;
  const l = (lang||'').toLowerCase().trim();
  const ext = CODE_EXT_MAP[l] || 'txt';
  const label = CODE_LABEL_MAP[l] || (l ? l.toUpperCase() : 'TXT');
  const baseName = CODE_NAME_MAP[l] || 'file';
  const filename = baseName + '.' + ext;
  const title = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  window.__codeMeta = window.__codeMeta || {};
  window.__codeMeta[gid] = { filename, title, label, hljsLang: CODE_HLJS_MAP[l] || l || 'plaintext', origLang: l };
  // ── بطاقة بمقاس ثابت دايمًا (نفس الشكل/الطول/العرض) بغض النظر عن طول الكود —
  //    الضغط عليها بيفتح الكود كامل في نافذة منفصلة، مش بيوسّع جوه الشات ──
  return '<div class="code-file-card" data-gid="'+gid+'" onclick="openCodeFileModal(\''+gid+'\')" '
    + 'role="button" tabindex="0" aria-label="فتح كود '+label+'" '
    + 'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openCodeFileModal(\''+gid+'\');}">'
    + '<div class="code-file-icon"><i class="fas fa-code"></i></div>'
    + '<div class="code-file-meta"><div class="code-file-name" dir="ltr">'+title+'</div>'
    + '<div class="code-file-sub" dir="ltr">كود · '+label+'</div></div>'
    + '<i class="fas fa-chevron-left code-file-arrow"></i>'
    + '</div>';
}

// ── كارت الكود المصغّر (Code Snippet Card): لشرح جزء كود أو تعديل صغير —
//    بيظهر جوه الرسالة على طول (من غير فتح مودال)، بخلفية سوداء داكنة وحواف دائرية،
//    ورأس فيه اسم اللغة + زرار نسخ. النموذج له حرية كاملة يستدعيه ويكرره بأي عدد.
//    max-width:100% + overflow-x:auto جوه الكارت بس، عشان ميأثرش على عرض الشاشة. ──
function buildCodeSnippetCard(lang, code){
  const gid = 'sn' + (++_codeGidCounter) + '_' + Date.now();
  window.__codeGroups[gid] = code;
  const l = (lang||'').toLowerCase().trim();
  const label = CODE_LABEL_MAP[l] || (l ? l.toUpperCase() : 'TXT');
  const hljsLang = CODE_HLJS_MAP[l] || l || 'plaintext';
  return '<div class="code-snippet-card" data-gid="'+gid+'">'
    + '<div class="code-snippet-header">'
    + '<span class="code-snippet-lang" dir="ltr">'+label+'</span>'
    + '<button type="button" class="code-snippet-copy-btn" title="نسخ" onclick="copyCodeFile(\''+gid+'\',this)"><i class="fas fa-copy"></i></button>'
    + '</div>'
    + '<div class="code-snippet-body"><pre><code class="hljs language-'+hljsLang+'">'+escapeHtml(code)+'</code></pre></div>'
    + '</div>';
}
// ── معيار الاختيار بين الكارت المصغّر (Snippet) والكارت الكامل (File):
//    كود صغير (سطور قليلة وحروف قليلة) = Snippet Card مباشر، غير كده = File Card بالمودال ──
function isSmallSnippet(code){
  const lines = code.split('\n').length;
  return lines <= 8 && code.length <= 380;
}

window.openCodeFileModal = function(gid){
  const code = window.__codeGroups[gid];
  const meta = (window.__codeMeta || {})[gid];
  if (!code || !meta) return;
  document.querySelectorAll('.code-modal-overlay').forEach(el=>el.remove());
  const overlay = document.createElement('div');
  overlay.className = 'code-modal-overlay';
  overlay.setAttribute('data-gid', gid);
  overlay.innerHTML =
    '<div class="code-modal">'
    + '<div class="code-modal-header">'
    + '<button type="button" class="code-run-btn" title="تشغيل / معاينة" onclick="previewCodeFile(\''+gid+'\',this)"><i class="fas fa-play"></i></button>'
    + '<div class="code-modal-title" dir="ltr">'+meta.filename+'</div>'
    + '<div class="code-modal-actions">'
    + '<button type="button" class="code-modal-btn" title="نسخ" onclick="copyCodeFile(\''+gid+'\',this)"><i class="fas fa-copy"></i></button>'
    + '<button type="button" class="code-modal-btn" title="تنزيل" onclick="downloadCodeFile(\''+gid+'\',\''+meta.filename+'\')"><i class="fas fa-download"></i></button>'
    + '<button type="button" class="code-modal-btn" title="إغلاق" onclick="closeCodeModal(\''+gid+'\')"><i class="fas fa-times"></i></button>'
    + '</div></div>'
    + '<div class="code-modal-body"><pre><code class="hljs language-'+meta.hljsLang+'">'+escapeHtml(code)+'</code></pre></div>'
    + '<div class="code-preview-slot"></div>'
    + '<div class="code-rate-bar"><span class="code-rate-label">الكود ده عجبك؟</span>'
    + '<button type="button" class="code-rate-btn code-rate-good" onclick="rateCodeGood(\''+gid+'\',this)"><i class="fas fa-thumbs-up"></i></button>'
    + '<button type="button" class="code-rate-btn code-rate-bad" onclick="rateCodeBad(\''+gid+'\',this)"><i class="fas fa-thumbs-down"></i></button>'
    + '</div></div>';
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeCodeModal(gid); });
  document.body.appendChild(overlay);
  if (window.hljs){ overlay.querySelectorAll('pre code').forEach(b=> hljs.highlightElement(b)); }
};

// ── زرار "تشغيل/معاينة" جنب اسم الملف مباشرة: بيشغّل الكود فعليًا (مش تخمين) —
//    كود ويب (HTML/JS/كود فيه <html>) بيتعرض في iframe حي جوه المودال، وأي
//    لغة تانية (Python/C/Java/PHP/Bash/SQL...) بتتشغّل عبر Piston وبيتعرض
//    ناتجها (stdout/stderr) في صندوق شكله ترمنال حقيقي. ضغطة تانية على نفس
//    الزرار بتقفل المعاينة (toggle) ──
window.previewCodeFile = async function(gid, btnEl){
  const overlay = document.querySelector('.code-modal-overlay[data-gid="'+gid+'"]');
  if (!overlay) return;
  const slot = overlay.querySelector('.code-preview-slot');
  const code = window.__codeGroups[gid];
  const meta = (window.__codeMeta || {})[gid];
  if (!slot || !code || !meta) return;

  // ── لو المعاينة فاتحة بالفعل، الضغطة دي بتقفلها ──
  if (slot.dataset.open === '1'){
    slot.innerHTML = '';
    slot.dataset.open = '0';
    btnEl.innerHTML = '<i class="fas fa-play"></i>';
    btnEl.classList.remove('running');
    return;
  }

  btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  btnEl.classList.add('running');
  slot.dataset.open = '1';
  slot.innerHTML = '<div class="code-preview-loading"><i class="fas fa-spinner fa-spin"></i> بيشغّل الكود دلوقتي...</div>';

  try{
    const l = meta.origLang || '';
    if (isSkippedLang(l)){
      slot.innerHTML = '<div class="code-preview-note">اللغة دي (' + (meta.label||l) + ') مالهاش معنى "تشغيل" مباشر — هي بتوصف/تنسّق كود تاني مش بتتنفّذ لوحدها.</div>';
    } else {
      const result = await runAnyCode(l, code, true);
      if (result.iframeEl){
        // ── معاينة ويب حية: نفس الـ iframe اللي فعلاً اشتغل بيه الكود ──
        slot.innerHTML = '';
        const frameWrap = document.createElement('div');
        frameWrap.className = 'code-preview-frame-wrap';
        frameWrap.appendChild(result.iframeEl);
        slot.appendChild(frameWrap);
        if (result.stderr){
          const errBox = document.createElement('div');
          errBox.className = 'code-preview-terminal has-error';
          errBox.innerHTML = '<div class="code-preview-terminal-dots"><span></span><span></span><span></span></div>'
            + '<pre class="code-preview-terminal-body"></pre>';
          errBox.querySelector('.code-preview-terminal-body').textContent = result.stderr;
          slot.appendChild(errBox);
        }
      } else {
        // ── معاينة ترمنال: ناتج حقيقي من Piston (stdout/stderr) ──
        const term = document.createElement('div');
        term.className = 'code-preview-terminal' + (result.ok===false ? ' has-error' : '');
        term.innerHTML = '<div class="code-preview-terminal-dots"><span></span><span></span><span></span></div>'
          + '<pre class="code-preview-terminal-body"></pre>';
        const body = term.querySelector('.code-preview-terminal-body');
        const lines = [];
        if (result.stdout) lines.push(result.stdout.replace(/\n$/, ''));
        if (result.stderr) lines.push(result.stderr.replace(/\n$/, ''));
        if (!lines.length) lines.push(result.ok===null ? '(مفيش ناتج نصي لعرضه)' : '(اشتغل من غير أي ناتج)');
        body.textContent = lines.join('\n');
        slot.innerHTML = '';
        slot.appendChild(term);
      }
    }
  } catch(e){
    if (isAbortError(e)) return;
    slot.innerHTML = '<div class="code-preview-note code-preview-error">حصل خطأ وهو بيحاول يشغّل الكود: ' + escapeHtml(e.message||String(e)) + '</div>';
  } finally {
    btnEl.innerHTML = '<i class="fas fa-stop"></i>';
    btnEl.classList.remove('running');
    slot.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
};
window.closeCodeModal = function(gid){
  const overlay = document.querySelector('.code-modal-overlay[data-gid="'+gid+'"]');
  if (overlay) overlay.remove();
};
window.copyCodeFile = function(gid, btnEl){
  const code = window.__codeGroups[gid];
  if (!code || !navigator.clipboard) return;
  navigator.clipboard.writeText(code).then(()=>{
    const icon = btnEl.querySelector('i');
    icon.className = 'fas fa-check';
    setTimeout(()=>{ icon.className = 'fas fa-copy'; }, 1200);
  });
};
window.downloadCodeFile = function(gid, filename){
  const code = window.__codeGroups[gid];
  if (!code) return;
  const blob = new Blob([code], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

// ── تقييم الكود نفسه (منفصل عن تقييم الرد بالكامل) — بيغذي "دروس كود" دائمة ──
let goodCodeList = [], badCodeList = [];
ownDb.collection("ai_code_feedback").where("liked","==",true).orderBy("createdAt","desc").limit(6)
  .onSnapshot(snap => { goodCodeList = snap.docs.map(d=>d.data()); }, err => console.warn("good code feed err", err));
ownDb.collection("ai_code_feedback").where("liked","==",false).orderBy("createdAt","desc").limit(6)
  .onSnapshot(snap => { badCodeList = snap.docs.map(d=>d.data()); }, err => console.warn("bad code feed err", err));

window.rateCodeGood = function(gid, btnEl){
  const code = window.__codeGroups[gid];
  if (!code) return;
  const bar = btnEl.closest('.code-rate-bar');
  bar.querySelectorAll('.code-rate-btn').forEach(b=>b.classList.remove('active'));
  btnEl.classList.add('active');
  ownDb.collection("ai_code_feedback").add({
    userId: (currentUser && currentUser.uid) || null,
    code: code.slice(0,1500), liked: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e=>console.error(e));
};
window.rateCodeBad = function(gid, btnEl){
  const code = window.__codeGroups[gid];
  if (!code) return;
  const bar = btnEl.closest('.code-rate-bar');
  bar.querySelectorAll('.code-rate-btn').forEach(b=>b.classList.remove('active'));
  btnEl.classList.add('active');
  ownDb.collection("ai_code_feedback").add({
    userId: (currentUser && currentUser.uid) || null,
    code: code.slice(0,1500), liked: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e=>console.error(e));
};
function buildGoodCodeBlock(){
  if (!goodCodeList.length) return '';
  const list = goodCodeList.map(g => '```\n'+(g.code||'').slice(0,300)+'\n```').join('\n');
  return '\n\n--- أمثلة كود سابقة عجبت المستخدمين وقيّموها 👍 (حافظ على نفس الأسلوب والجودة) ---\n' + list + '\n---';
}
function buildBadCodeBlock(){
  if (!badCodeList.length) return '';
  const list = badCodeList.map(b => '```\n'+(b.code||'').slice(0,300)+'\n```').join('\n');
  return '\n\n--- أمثلة كود سابقة اتقيّمت سلبيًا 👎 (تجنب نفس الأسلوب ده) ---\n' + list + '\n---';
}

function buildLessonsBlock(){
  if (!lessonsList.length) return '';
  const list = lessonsList.map(l => '- سؤال: ' + (l.question||'') + '\n  رد اتقيّم سلبيًا: ' + (l.answer||'').slice(0,300)).join('\n');
  return '\n\n--- دروس مستفادة من تقييمات سابقة (تعلّم منها ولا تكرر نفس القصور) ---\n' + list +
    '\n---\nلو جالك سؤال شبيه بأي واحد من دول، خد بالك وحاول تجاوب بشكل أعمق وأدق ووضح من المرة اللي فاتت.';
}
function buildGoodAnswersBlock(){
  if (!goodAnswersList.length) return '';
  const list = goodAnswersList.map(g => '- سؤال: ' + (g.question||'') + '\n  رد عجب المستخدم: ' + (g.answer||'').slice(0,300)).join('\n');
  return '\n\n--- ردود سابقة عجبت المستخدمين وقيّموها 👍 (حافظ على نفس أسلوبها ومستوى وضوحها) ---\n' + list +
    '\n---\nخد بالك من الأسلوب والمستوى اللي عجب المستخدمين في الردود دي، وحاول تحافظ عليه أو تتخطاه.';
}

/* ============ تجميع "تعليمات النظام" الكاملة — دالة واحدة بتلزّق كل البلوكات فوق بعض ============
   كل بلوك (buildXBlock) مسؤول عن قاعدة واحدة بس (هوية، تفكير عميق، تلوين،
   جودة كود، دروس مستفادة...) والدالة دي بترتبهم بترتيب ثابت وواحد لكل رسالة:
   1) الهوية الأساسية  2) السياق الحي (وقت/موقع/صلاة)  3) غرفة التفكير العميق
   4) قواعد التلوين واللاتكس والكود  5) الدروس والردود الحلوة القديمة
   6) نتائج البحث (لو موجودة، بتتحط في الآخر عشان تبقى أقرب حاجة للسؤال)
   7) تعليمات إضافية من لوحة التحكم (globalAiInstructions). ترتيبهم مقصود:
   القواعد الثابتة الأول، والسياق اللي بيتغيّر كل رسالة (بحث/تعليمات إدارية) آخر حاجة. */
/* ============ اسم المستخدم ونوعه: عشان الذكاء الاصطناعي ينادي المستخدم باسمه
   ويخاطبه بصيغة الذكر أو الأنثى الصح في كل كلامه (الأفعال والضمائر) ============ */
function buildUserIdentityBlock(){
  const name = (currentUser && (currentUser.displayName || currentUser.email)) || '';
  if (!name) return '';
  const genderLine = currentUserGender === 'female'
    ? 'المستخدم ده أنثى — خاطبها بصيغة المؤنث في كل كلامك (الأفعال والضمائر، زي "عايزة، شايفة، حابة")، من غير ما تبالغ في تكرار اسمها في كل رد.'
    : 'المستخدم ده ذكر — خاطبه بصيغة المذكر في كل كلامك (الأفعال والضمائر، زي "عايز، شايف، حابب")، من غير ما تبالغ في تكرار اسمه في كل رد.';
  return '\n\nاسم المستخدم اللي بتكلمه هو "' + name + '". نادي عليه باسمه بشكل طبيعي بين حين وآخر مش في كل رسالة. ' + genderLine;
}

function buildSystemPrompt(searchResultsBlock){
  return 'اسمك "' + AI_DISPLAY_NAME + '". جاوب بالعربية بوضوح واحترافية. لو حد سألك مين انت، قول إنك مساعد ذكاء اصطناعي بس، من غير ما تحدد اسم شركة أو موديل معيّن (لأن الردود بتتوزّع تلقائيًا على أكتر من نموذج في الخلفية). ممنوع تقول إنك Claude أو ChatGPT أو أي هوية مختلفة عن دي.'
    + buildUserIdentityBlock()
    + buildLiveContextBlock()
    + buildReasoningRoomBlock()
    + buildColorPolicyBlock()
    + buildNoRawLatexBlock()
    + buildCodeCompletenessBlock()
    + buildCodeFencingRuleBlock()
    + buildProCodeQualityBlock()
    + buildLessonsBlock()
    + buildGoodAnswersBlock()
    + buildGoodCodeBlock()
    + buildBadCodeBlock()
    + (searchResultsBlock || '')
    + (globalAiInstructions ? ('\n\nتعليمات إضافية:\n' + globalAiInstructions) : '');
}

/* ============ الوقت / التاريخ / الهجري / مواعيد الصلاة / اتجاه القبلة (حقيقي، لحظي) ============
   بيانات الساعة والتاريخ بتتحسب محليًا (Intl) من غير أي نت. بيانات الموقع ومواعيد
   الصلاة واتجاه القبلة بتتجاب مرة واحدة في اليوم (لأول رسالة) عن طريق موقع
   المتصفح الجغرافي + Aladhan API (مواعيد الصلاة + التاريخ الهجري الدقيق + اتجاه
   القبلة) + BigDataCloud (اسم المدينة/الدولة) — كلها من غير أي مفتاح API. */
let geoState = { status:'idle', lat:null, lng:null, locationName:'', timings:null, hijriApi:null, qiblaDeg:null, qiblaCompass:null, fetchedDay:null };

function requestGeolocation(){
  return new Promise((resolve)=>{
    if (!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),
      { enableHighAccuracy:false, timeout:8000, maximumAge:600000 }
    );
  });
}

function bearingToCompass(deg){
  const dirs = ['شمال','شمال شرقي','شرق','جنوب شرقي','جنوب','جنوب غربي','غرب','شمال غربي'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

// ── بتتجاب مرة واحدة في اليوم بس (كاش بـ fetchedDay)، وبتفشل بهدوء لو المستخدم رفض إذن الموقع ──
async function refreshGeoContext(){
  const todayKey = new Date().toDateString();
  if (geoState.fetchedDay === todayKey && geoState.timings) return;
  if (geoState.status === 'denied' && geoState.fetchedDay === todayKey) return;

  const loc = await requestGeolocation();
  if (!loc){ geoState.status = 'denied'; geoState.fetchedDay = todayKey; return; }

  geoState.lat = loc.lat; geoState.lng = loc.lng; geoState.status = 'ok';
  try{
    const [geoRes, prayerRes, qiblaRes] = await Promise.all([
      fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+loc.lat+'&longitude='+loc.lng+'&localityLanguage=ar').then(r=>r.json()).catch(()=>null),
      fetch('https://api.aladhan.com/v1/timings/'+Math.floor(Date.now()/1000)+'?latitude='+loc.lat+'&longitude='+loc.lng+'&method=5').then(r=>r.json()).catch(()=>null),
      fetch('https://api.aladhan.com/v1/qibla/'+loc.lat+'/'+loc.lng).then(r=>r.json()).catch(()=>null)
    ]);
    if (geoRes){
      geoState.locationName = [geoRes.city || geoRes.locality, geoRes.principalSubdivision, geoRes.countryName].filter(Boolean).join('، ');
    }
    if (prayerRes && prayerRes.data){
      geoState.timings = prayerRes.data.timings;
      geoState.hijriApi = prayerRes.data.date && prayerRes.data.date.hijri;
    }
    if (qiblaRes && qiblaRes.data && typeof qiblaRes.data.direction === 'number'){
      geoState.qiblaDeg = qiblaRes.data.direction;
      geoState.qiblaCompass = bearingToCompass(qiblaRes.data.direction);
    }
    geoState.fetchedDay = todayKey;
  } catch(e){ console.warn('refreshGeoContext failed', e); }
}

// ── الساعة والتاريخ (ميلادي + هجري تقريبي) بيتحسبوا محليًا من غير نت، فبيبقوا جاهزين فورًا ──
function getLiveClockBlock(){
  const now = new Date();
  let weekdayAr = '', dateAr = '', timeAr = '', hijriAr = '';
  try{ weekdayAr = new Intl.DateTimeFormat('ar-EG', { weekday:'long' }).format(now); } catch(e){}
  try{ dateAr = new Intl.DateTimeFormat('ar-EG', { day:'numeric', month:'long', year:'numeric' }).format(now); } catch(e){}
  try{ timeAr = new Intl.DateTimeFormat('ar-EG', { hour:'numeric', minute:'2-digit', hour12:true }).format(now); } catch(e){}
  try{ hijriAr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day:'numeric', month:'long', year:'numeric' }).format(now); } catch(e){}
  return { weekdayAr, dateAr, timeAr, hijriAr };
}

function buildLiveContextBlock(){
  const c = getLiveClockBlock();
  let block = '\n\n--- الوقت والتاريخ الحاليين (بيانات حقيقية دلوقتي، اعتمد عليها دايمًا ولو مختلفة عن أي معلومة عندك من قبل) ---\n'
    + 'اليوم: ' + c.weekdayAr + '\n'
    + 'التاريخ الميلادي: ' + c.dateAr + '\n'
    + 'الساعة الحالية (بتوقيت جهاز المستخدم): ' + c.timeAr + '\n'
    + (c.hijriAr ? ('التاريخ الهجري (تقريبي): ' + c.hijriAr + '\n') : '');

  if (geoState.locationName) block += 'موقع المستخدم الحالي: ' + geoState.locationName + '\n';
  if (geoState.hijriApi && geoState.hijriApi.month){
    block += 'التاريخ الهجري الدقيق حسب موقع المستخدم: ' + geoState.hijriApi.day + ' ' + geoState.hijriApi.month.ar + ' ' + geoState.hijriApi.year + 'هـ\n';
  }
  if (geoState.timings){
    const t = geoState.timings;
    block += 'مواعيد الصلاة اليوم في موقع المستخدم: الفجر ' + t.Fajr + '، الشروق ' + t.Sunrise + '، الظهر ' + t.Dhuhr + '، العصر ' + t.Asr + '، المغرب ' + t.Maghrib + '، العشاء ' + t.Isha + '\n';
  }
  if (geoState.qiblaCompass){
    block += 'اتجاه القبلة من موقع المستخدم: ' + geoState.qiblaCompass + ' (بزاوية تقريبية ' + Math.round(geoState.qiblaDeg) + '° من الشمال)\n';
  }
  if (geoState.status === 'denied'){
    block += 'ملحوظة: المستخدم مسموحش (أو لسه) بالوصول لموقعه الجغرافي، فمعرفتش أجيب مواعيد الصلاة أو اتجاه القبلة أو اسم مدينته بالظبط — لو سأل عن حاجة من دي، قوله يسمح بإذن الموقع من المتصفح.\n';
  }
  block += 'تنبيه مهم: البيانات دي (الوقت، التاريخ، مواعيد الصلاة، الموقع، القبلة) اتحطت هنا عشان تستخدمها كمرجع لو المستخدم سأل عنها أو عن حاجة محتاجة منها فعلاً (زي "الساعة كام"، "الصلاة الجاية إمتى"، حساب مدة، أو أي سؤال مرتبط بالوقت/التاريخ/الموقع). متذكرهاش، متفتحش بيها الرد، ومتقولهاش للمستخدم من نفسك لو ما سألش عنها — حتى لو حسّيت إنها معلومة "مفيدة" تتقال، سيبها إلا لو هو اللي طلبها.\n';
  block += '---';
  return block;
}

/* ============ البحث الحقيقي في الإنترنت عبر Tavily (نفس فلك بالظبط) ============ */
function getTavilyApiKey(){ return (tavilyApiKey && String(tavilyApiKey).trim()) || ""; }

async function performWebSearch(query, includeDomains){
  const key = getTavilyApiKey();
  if (!key) return null;
  try{
    const body = {
      api_key: key,
      query: query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: false,
      include_images: true,
      include_image_descriptions: true
    };
    if (includeDomains && includeDomains.length) body.include_domains = includeDomains;
    const r = await fetchWithRetry('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal(30000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e){ if (isAbortError(e)) throw e; console.warn('performWebSearch failed', e); return null; }
}

/* ============ قرار "هل الرسالة محتاجة بحث؟" — مرحلتين، بنفس فكرة النظام التلقائي للموديلات ============
   المرحلة 1 (سريعة، من غير أي طلب شبكة): لو الرسالة فيها كلمة صريحة من
   WEB_SEARCH_TRIGGERS (زي "ابحث" أو "اخر اخبار")، القرار بيبقى "أيوه محتاجة
   بحث" فورًا من غير أي تأخير.
   المرحلة 2 (لو المرحلة 1 مقالتش حاجة): بنسأل نموذج صغير وسريع (Groq) يحكم
   هو نفسه بكلمة واحدة بس ("نعم"/"لا") هل الرسالة محتاجة معلومة حديثة أو
   حدث حالي، عشان نمسك الحالات اللي مفيهاش كلمة مفتاحية واضحة لكنها فعليًا
   محتاجة بحث (زي "مين رئيس وزراء بريطانيا؟" من غير ما يقول "ابحث"). */
// ── مرحلة أولى سريعة: كلمات صريحة بتدل على طلب بحث (رد فوري من غير انتظار) ──
const WEB_SEARCH_TRIGGERS = [
  'ابحث', 'دور لي', 'دور على', 'فتش', 'اخبار', 'أخبار', 'اخر اخبار', 'آخر أخبار',
  'احدث', 'أحدث', 'صحيح ان', 'صحيح إن', 'هل صحيح', 'اتأكد', 'تأكد من',
  'معلومات عن', 'ايه اخبار', 'إيه أخبار', 'اخر حاجة', 'جديد في',
  'اخر ', 'آخر ', 'اخره', 'آخره', 'امتى', 'إمتى', 'متى', 'حاليا', 'حاليًا',
  'دلوقتي', 'الان', 'الآن', 'لسه', 'لسة', 'اخر مرة', 'آخر مرة', 'اخر تحديث', 'آخر تحديث'
];
function shouldWebSearch(t){
  if (!t) return false;
  const l = String(t).toLowerCase();
  return WEB_SEARCH_TRIGGERS.some(k => l.includes(k));
}

// ── مرحلة تانية ذكية: لو مفيش كلمة صريحة، الذكاء الاصطناعي نفسه بيقرر ──
async function classifyNeedsSearch(userMsg){
  try{
    const apiKey = GroqKeyPool.next();
    if (!apiKey || !userMsg || userMsg.trim().length < 4) return false;
    const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        max_tokens: 3,
        temperature: 0,
        messages: [
          { role: 'system', content: 'رد بكلمة واحدة بس: "نعم" لو الرسالة محتاجة معلومة حديثة/حقيقية أو حدث حالي أو حاجة لازم تتأكد منها من الإنترنت (زي أخبار، أسعار، تواريخ قريبة، أسماء أشخاص أو شركات أو منتجات حالية، نتائج، إحصائيات، حاجة بتتغيّر بمرور الوقت). أو رد "لا" لو مجرد كلام عادي، تحية، سؤال عن مفهوم علمي/تاريخي ثابت، طلب مساعدة عامة، أو طلب برمجة/كود. رد بكلمة واحدة بس من غير أي شرح.' },
          { role: 'user', content: userMsg }
        ]
      }),
      signal: requestSignal(30000)
    });
    if (!r.ok) return false;
    const d = await r.json();
    const ans = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    return /نعم|yes/i.test(ans.trim());
  } catch(e){ if (isAbortError(e)) throw e; console.warn('classifyNeedsSearch failed', e); return false; }
}

// ── لو المستخدم بعت رابط صريح، بندخله فعليًا عبر Tavily Extract (مش بحث، قراءة رابط بعينه) ──
const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/g;
function extractFirstUrl(text){
  if (!text) return null;
  const m = String(text).match(URL_REGEX);
  return m && m[0] ? m[0] : null;
}
async function performUrlExtract(url){
  const key = getTavilyApiKey();
  if (!key) return null;
  try{
    const r = await fetchWithRetry('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // extract_depth: 'advanced' بيدّي فرصة أكبر لقراءة صفحات فيها جافاسكريبت
      // أو تنسيق معقّد (زي صفحات مشاركة Gemini/ChatGPT)، بدل الوضع الافتراضي البسيط
      body: JSON.stringify({ api_key: key, urls: [url], extract_depth: 'advanced' }),
      signal: requestSignal(30000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const item = d && d.results && d.results[0];
    return item ? { url: item.url || url, content: item.raw_content || '' } : null;
  } catch(e){ if (isAbortError(e)) throw e; console.warn('performUrlExtract failed', e); return null; }
}
// ── لو القراءة التلقائية فشلت (مثلاً صفحة بتتحمّل بجافاسكريبت زي روابط
//    مشاركة Gemini/ChatGPT ومبتظهرش في الـ HTML الخام)، بنبلّغ النموذج صراحة
//    بده بدل ما يسيبه يخمّن أو يرفض بشكل عام — عشان يوضّح للمستخدم بدقة
//    إن الرابط ده تحديدًا اتعذّرت قراءته ويطلب منه يلصق النص بنفسه ──
function buildUrlContentBlock(extracted, url){
  if (extracted && extracted.content){
    return '\n\n--- محتوى الرابط اللي بعته المستخدم (' + extracted.url + ') — استخدمه في ردك ---\n' +
      extracted.content.slice(0, 6000) + '\n---';
  }
  return '\n\n--- تنبيه للنظام (مش هيتشاف من المستخدم): المستخدم بعت رابط (' + url + ') لكن القراءة التلقائية له فشلت — على الأغلب الصفحة بتتحمّل محتواها بجافاسكريبت (زي صفحات مشاركة Gemini/ChatGPT) وأدوات القراءة الآلية مبتقدرش توصله. قوله بوضوح إنك مقدرتش تفتح الرابط ده تحديدًا لصعوبة تقنية في نوع الصفحة، واطلب منه ينسخ النص أو المحتوى المطلوب ويلصقه هنا مباشرة بدل الرابط. ---';
}

function buildSearchResultsBlock(results){
  if (!results || !results.results || !results.results.length) return '';
  const list = results.results.slice(0,5).map((r,i) => (i+1)+'. '+(r.title||'')+'\n   '+(r.url||'')+'\n   '+(r.content||'').slice(0,300)).join('\n');
  return '\n\n--- نتائج بحث حقيقية من الإنترنت الآن (استخدمها في ردك، وممنوع تتجاهلها أو تجاوب من معلوماتك العامة القديمة لو فيها تعارض) ---\n' + list + '\n---';
}

/* ============ خط الدفاع 1: Groq — Streaming + غرفة التفكير العميق الحية ============
   لو الرد اتقطع قبل ما يخلص (finish_reason === 'length' — بيحصل غالبًا مع أكواد
   طويلة)، بنكمّل تلقائيًا بطلب تاني من نفس النقطة، لحد ما يخلص فعلاً أو نوصل
   للحد الأقصى من المحاولات، بدل ما نسيب الكود مبتور. */
const CONTINUE_PROMPT = 'كمل بالظبط من نفس الحرف اللي وقفت عنده، من غير ما تعيد ولا حرف كتبته قبل كده، ومن غير أي مقدمة أو تعليق زيادة. لو كنت في نص كود، كمل الكود نفسه لحد ما يخلص ويتقفل بـ ``` — ممنوع تلخيص أو اختصار أي جزء.';
const MAX_CONTINUATIONS = 5;

async function callGroqChat(historyMsgs, onReasoningDelta, searchResultsBlock, onContentDelta){
  if (window.__aiPaused) throw new Error('AI_PAUSED_SECURITY_LOCK');
  if (!GroqKeyPool.count()) return null;
  const maxAttempts = Math.min(GroqKeyPool.count(), 3);
  const sys = buildSystemPrompt(searchResultsBlock || '');
  let runningMessages = [{ role:'system', content: sys }].concat(historyMsgs);
  let fullTotal = '', fullReasoning = '', usedTokensTotal = 0;
  let round0AllWere429 = true, round0TriedAny = false;

  for (let round = 0; round <= MAX_CONTINUATIONS; round++){
    let roundResult = null;
    for (let i=0;i<maxAttempts;i++){
      const key = GroqKeyPool.next();
      if (!key) break;
      const idle = createIdleAbortSignal(45000);
      try{
        const res = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b", messages: runningMessages, max_tokens: 8192, temperature: 0.4,
            stream: true, reasoning_effort: 'high', reasoning_format: 'parsed', stream_options: { include_usage: true }
          }),
          signal: idle.signal
        });
        if (!res.ok || !res.body){
          GroqKeyPool.report(key, res.status !== 429);
          if (round === 0){ round0TriedAny = true; if (res.status !== 429) round0AllWere429 = false; }
          if (res.status !== 429) { i = maxAttempts; break; }
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', full = '', reasoningPart = '', finishReason = null, usedTokens = 0;
        try{
          while (true){
            const { done, value } = await reader.read();
            if (done) break;
            idle.bump(); // ── وصل جزء جديد فعلاً: نصفّر مهلة الخمول من الأول ──
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines){
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try{
                const evt = JSON.parse(payload);
                if (evt.usage && evt.usage.total_tokens) usedTokens = evt.usage.total_tokens;
                const choice = evt.choices && evt.choices[0];
                if (!choice) continue;
                if (choice.finish_reason) finishReason = choice.finish_reason;
                const delta = choice.delta;
                if (!delta) continue;
                if (delta.content){ full += delta.content; if (onContentDelta) onContentDelta(fullTotal + full); }
                const rPiece = delta.reasoning || delta.reasoning_content;
                if (rPiece){ reasoningPart += rPiece; if (onReasoningDelta) onReasoningDelta(fullReasoning + reasoningPart); }
              } catch(e){ /* سطر ناقص، هيكمل في القراءة الجاية */ }
            }
          }
        } catch(streamErr){
          // ── انقطاع الشبكة أثناء البث نفسه: لو اتجمّع نص فعلاً، منرميهوش —
          //    بنعامله زي finish_reason:'length' عشان آلية الاستئناف التلقائي
          //    (Auto-Resume) تكمل بقية الرد من نفس النقطة بدل ما تبدأ من الصفر ──
          if (isAbortError(streamErr)) throw streamErr;
          console.warn("Groq stream interrupted mid-way, resuming from partial text", streamErr);
          if (full){ finishReason = 'length'; }
          else throw streamErr;
        }
        GroqKeyPool.report(key, true);
        if (round === 0){ round0TriedAny = true; round0AllWere429 = false; }
        roundResult = { text: full, reasoning: reasoningPart, finishReason, usedTokens };
        break;
      } catch(e){ console.warn("Groq call failed", e); GroqKeyPool.report(key, false); if (isAbortError(e)) throw e; }
      finally{ idle.clear(); }
    }
    if (!roundResult || !roundResult.text) break;
    fullTotal += roundResult.text;
    fullReasoning = round === 0 ? roundResult.reasoning : (fullReasoning + '\n' + roundResult.reasoning);
    usedTokensTotal += roundResult.usedTokens || 0;
    if (roundResult.finishReason !== 'length' || round === MAX_CONTINUATIONS) break;
    runningMessages = runningMessages.concat([
      { role:'assistant', content: roundResult.text },
      { role:'user', content: CONTINUE_PROMPT }
    ]);
  }
  if (fullTotal) return { text: fullTotal, reasoning: fullReasoning, usedTokens: usedTokensTotal };
  return (round0TriedAny && round0AllWere429) ? { quotaExhausted: true } : null;
}

/* ============ خط الدفاع 2: Gemini ============ */
async function callGeminiChat(historyMsgs, onReasoningDelta, onContentDelta){
  if (!GeminiKeyPool.count()) return null;
  const maxAttempts = Math.min(GeminiKeyPool.count(), 3);
  let contents = historyMsgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  let fullTotal = '', fullReasoning = '', usedTokensTotal = 0;
  let round0AllWere429 = true, round0TriedAny = false;

  // ── بيحاول يجيب "التفكير" (thoughts) مع الرد لو الموديل بيدعمها، ولو الموديل
  //    رفض الإعداد ده (خطأ 400) بيعيد المحاولة فورًا بنفس المفتاح من غير
  //    thinkingConfig، عشان الرد الأساسي مايتأثرش حتى لو التفكير مش مدعوم.
  //    بقت الآن Streaming حقيقي (SSE) بدل رد دفعة واحدة، عشان النص يظهر
  //    لحظة بلحظة زي باقي المزوّدين، وعشان مهلة الخمول تقدر تتابع الاتصال ──
  async function attempt(key, withThinking, onDelta){
    const genCfg = { temperature: 0.4, maxOutputTokens: 8192 };
    if (withThinking) genCfg.thinkingConfig = { includeThoughts: true };
    const idle = createIdleAbortSignal(45000);
    try{
      const res = await fetchWithRetry("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: buildSystemPrompt() }] }, generationConfig: genCfg }),
        signal: idle.signal
      });
      if (!res.ok || !res.body) return { ok:false, status: res.status, answerText:'', thoughtText:'', finishReason:null, usedTokens:0 };
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', answerText = '', thoughtText = '', finishReason = null, usedTokens = 0;
      while (true){
        const { done, value } = await reader.read();
        if (done) break;
        idle.bump(); // ── وصل جزء جديد فعلاً: نصفّر مهلة الخمول من الأول ──
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines){
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try{
            const evt = JSON.parse(payload);
            if (evt.usageMetadata && evt.usageMetadata.totalTokenCount) usedTokens = evt.usageMetadata.totalTokenCount;
            const cand = evt.candidates && evt.candidates[0];
            if (!cand) continue;
            if (cand.finishReason) finishReason = cand.finishReason;
            const parts = (cand.content && cand.content.parts) || [];
            parts.forEach(p=>{
              if (!p || !p.text) return;
              if (p.thought){ thoughtText += p.text; if (onReasoningDelta) onReasoningDelta(fullReasoning + thoughtText); }
              else { answerText += p.text; if (onDelta) onDelta(answerText); }
            });
          } catch(e){ /* سطر ناقص، هيكمل في القراءة الجاية */ }
        }
      }
      return { ok:true, status: res.status, answerText, thoughtText, finishReason, usedTokens };
    } finally { idle.clear(); }
  }

  for (let round = 0; round <= MAX_CONTINUATIONS; round++){
    let roundText = null, roundReasoning = '', roundFinish = null, roundUsedTokens = 0;
    for (let i=0;i<maxAttempts;i++){
      const key = GeminiKeyPool.next();
      if (!key) break;
      try{
        const onDelta = (acc)=>{ if (onContentDelta) onContentDelta(fullTotal + acc); };
        let r = await attempt(key, true, onDelta);
        if (!r.ok) r = await attempt(key, false, onDelta);
        GeminiKeyPool.report(key, r.status !== 429);
        if (round === 0){ round0TriedAny = true; if (r.status !== 429) round0AllWere429 = false; }
        if (r.answerText){
          roundText = r.answerText; roundReasoning = r.thoughtText; roundFinish = r.finishReason; roundUsedTokens = r.usedTokens || 0;
          break;
        }
        if (r.status !== 429) { i = maxAttempts; break; }
      } catch(e){ if (isAbortError(e)) throw e; console.warn("Gemini call failed", e); }
    }
    if (!roundText) break;
    fullTotal += roundText;
    fullReasoning = round === 0 ? roundReasoning : (fullReasoning + '\n' + roundReasoning);
    usedTokensTotal += roundUsedTokens || 0;
    if (roundFinish !== 'MAX_TOKENS' || round === MAX_CONTINUATIONS) break;
    contents = contents.concat([
      { role:'model', parts:[{ text: roundText }] },
      { role:'user', parts:[{ text: CONTINUE_PROMPT }] }
    ]);
  }
  if (fullTotal) return { text: fullTotal, reasoning: fullReasoning, usedTokens: usedTokensTotal };
  return (round0TriedAny && round0AllWere429) ? { quotaExhausted: true } : null;
}

/* ============ خط الدفاع 3: OpenRouter (موديلات مجانية) ============ */
let orFreeModelsCache = { list: [], key: null, at: 0 };
async function getFreeOpenRouterModels(key){
  if (orFreeModelsCache.key === key && orFreeModelsCache.list.length && (Date.now()-orFreeModelsCache.at) < 1800000) return orFreeModelsCache.list;
  try{
    const r = await fetchWithRetry("https://openrouter.ai/api/v1/models", { headers: { "Authorization": "Bearer " + key }, signal: requestSignal(30000) });
    const d = await r.json();
    const list = (d && d.data ? d.data : []).filter(m => m && m.pricing && Number(m.pricing.prompt)===0 && Number(m.pricing.completion)===0).map(m=>m.id).slice(0,3);
    if (list.length){ orFreeModelsCache = { list, key, at: Date.now() }; return list; }
    return [];
  } catch(e){ if (isAbortError(e)) throw e; return []; }
}
async function callOpenRouterChat(historyMsgs, onReasoningDelta, onContentDelta){
  if (!OpenRouterKeyPool.count()) return null;
  const baseMessages = [{ role:'system', content: buildSystemPrompt() }].concat(historyMsgs);
  const maxAttempts = Math.min(OpenRouterKeyPool.count(), 3);
  let triedAny = false, allWere429 = true;
  for (let i=0;i<maxAttempts;i++){
    const key = OpenRouterKeyPool.next();
    if (!key) break;
    let models = await getFreeOpenRouterModels(key);
    if (!models.length) models = ['meta-llama/llama-3.3-70b-instruct:free','mistralai/mistral-7b-instruct:free','google/gemma-2-9b-it:free'];
    let keyFailed429 = false;
    for (const model of models){
      try{
        let messages = baseMessages.slice();
        let fullTotal = '', fullReasoning = '', usedTokensTotal = 0;
        for (let round = 0; round <= MAX_CONTINUATIONS; round++){
          const idle = createIdleAbortSignal(45000);
          try{
          const r = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", "X-Title": "Mahfoozat" },
            body: JSON.stringify({ model, messages, max_tokens: 8192, temperature: 0.4, stream: true, reasoning: { effort: 'high' }, usage: { include: true } }),
            signal: idle.signal
          });
          if (!r.ok || !r.body){
            OpenRouterKeyPool.report(key, r.status !== 429);
            triedAny = true;
            if (r.status === 429) keyFailed429 = true; else allWere429 = false;
            break;
          }
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '', txt = '', reasoningPart = '', finishReason = null, usedTokens = 0;
          try{
            while (true){
              const { done, value } = await reader.read();
              if (done) break;
              idle.bump(); // ── وصل جزء جديد فعلاً: نصفّر مهلة الخمول من الأول ──
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();
              for (const line of lines){
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') continue;
                try{
                  const evt = JSON.parse(payload);
                  if (evt.usage && evt.usage.total_tokens) usedTokens = evt.usage.total_tokens;
                  const choice = evt.choices && evt.choices[0];
                  if (!choice) continue;
                  if (choice.finish_reason) finishReason = choice.finish_reason;
                  const delta = choice.delta;
                  if (!delta) continue;
                  if (delta.content){ txt += delta.content; if (onContentDelta) onContentDelta(fullTotal + txt); }
                  const rPiece = delta.reasoning || delta.reasoning_content;
                  if (rPiece){ reasoningPart += rPiece; if (onReasoningDelta) onReasoningDelta(fullReasoning + reasoningPart); }
                } catch(e){ /* سطر ناقص، هيكمل في القراءة الجاية */ }
              }
            }
          } catch(streamErr){
            // ── نفس مبدأ الاستئناف التلقائي: لو النص اتقطع فعلاً هنكمله من نفس النقطة ──
            if (isAbortError(streamErr)) throw streamErr;
            console.warn("OpenRouter stream interrupted mid-way, resuming from partial text", streamErr);
            if (txt) finishReason = 'length'; else throw streamErr;
          }
          OpenRouterKeyPool.report(key, true);
          triedAny = true; allWere429 = false;
          if (!txt) break;
          fullTotal += txt;
          fullReasoning = round === 0 ? reasoningPart : (fullReasoning + '\n' + reasoningPart);
          usedTokensTotal += usedTokens;
          if (finishReason !== 'length' || round === MAX_CONTINUATIONS) break;
          messages = messages.concat([
            { role:'assistant', content: txt },
            { role:'user', content: CONTINUE_PROMPT }
          ]);
          } finally{ idle.clear(); }
        }
        if (fullTotal) return { text: fullTotal, reasoning: fullReasoning, usedTokens: usedTokensTotal };
      } catch(e){ if (isAbortError(e)) throw e; console.warn("OpenRouter call failed", e); }
    }
    if (!keyFailed429) break;
  }
  if (triedAny && allWere429) return { quotaExhausted: true };
  return null;
}

/* ============ خط الدفاع 4: Vercel AI Gateway ============ */
async function callVercelChat(historyMsgs, onReasoningDelta, onContentDelta){
  if (!VercelGatewayKeyPool.count()) return null;
  const baseMessages = [{ role:'system', content: buildSystemPrompt() }].concat(historyMsgs);
  const models = ['openai/gpt-4o-mini','google/gemini-2.0-flash','anthropic/claude-haiku-4-5'];
  const maxAttempts = Math.min(VercelGatewayKeyPool.count(), 3);
  let triedAny = false, allWere429 = true;
  for (let i=0;i<maxAttempts;i++){
    const key = VercelGatewayKeyPool.next();
    if (!key) break;
    let keyFailed429 = false;
    for (const model of models){
      try{
        let messages = baseMessages.slice();
        let fullTotal = '', fullReasoning = '', usedTokensTotal = 0;
        for (let round = 0; round <= MAX_CONTINUATIONS; round++){
          const idle = createIdleAbortSignal(45000);
          try{
          const r = await fetchWithRetry("https://ai-gateway.vercel.sh/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, max_tokens: 8192, temperature: 0.4, stream: true, stream_options: { include_usage: true } }),
            signal: idle.signal
          });
          if (!r.ok || !r.body){
            VercelGatewayKeyPool.report(key, r.status !== 429);
            triedAny = true;
            if (r.status === 429) keyFailed429 = true; else allWere429 = false;
            break;
          }
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '', txt = '', reasoningPart = '', finishReason = null, usedTokens = 0;
          try{
            while (true){
              const { done, value } = await reader.read();
              if (done) break;
              idle.bump(); // ── وصل جزء جديد فعلاً: نصفّر مهلة الخمول من الأول ──
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();
              for (const line of lines){
                if (!line.startsWith('data: ')) continue;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') continue;
                try{
                  const evt = JSON.parse(payload);
                  if (evt.usage && evt.usage.total_tokens) usedTokens = evt.usage.total_tokens;
                  const choice = evt.choices && evt.choices[0];
                  if (!choice) continue;
                  if (choice.finish_reason) finishReason = choice.finish_reason;
                  const delta = choice.delta;
                  if (!delta) continue;
                  if (delta.content){ txt += delta.content; if (onContentDelta) onContentDelta(fullTotal + txt); }
                  const rPiece = delta.reasoning || delta.reasoning_content;
                  if (rPiece){ reasoningPart += rPiece; if (onReasoningDelta) onReasoningDelta(fullReasoning + reasoningPart); }
                } catch(e){ /* سطر ناقص، هيكمل في القراءة الجاية */ }
              }
            }
          } catch(streamErr){
            if (isAbortError(streamErr)) throw streamErr;
            console.warn("Vercel stream interrupted mid-way, resuming from partial text", streamErr);
            if (txt) finishReason = 'length'; else throw streamErr;
          }
          VercelGatewayKeyPool.report(key, true);
          triedAny = true; allWere429 = false;
          if (!txt) break;
          fullTotal += txt;
          fullReasoning = round === 0 ? reasoningPart : (fullReasoning + '\n' + reasoningPart);
          usedTokensTotal += usedTokens;
          if (finishReason !== 'length' || round === MAX_CONTINUATIONS) break;
          messages = messages.concat([
            { role:'assistant', content: txt },
            { role:'user', content: CONTINUE_PROMPT }
          ]);
          } finally{ idle.clear(); }
        }
        if (fullTotal) return { text: fullTotal, reasoning: fullReasoning, usedTokens: usedTokensTotal };
      } catch(e){ if (isAbortError(e)) throw e; console.warn("Vercel Gateway call failed", e); }
    }
    if (!keyFailed429) break;
  }
  if (triedAny && allWere429) return { quotaExhausted: true };
  return null;
}

/* ============ الموزّع الرئيسي: بحث عبر الإنترنت لو محتاج، بعدين يجرب كل خط دفاع بالترتيب ============
   onStep(text) بتتنادى عند كل خطوة حقيقية بتحصل هنا، عشان تتعرض للمستخدم
   لحظة بلحظة في مؤشر "بيشتغل دلوقتي" (مش نصوص وهمية — دي هي نفس الخطوات
   اللي الكود فعلاً بيمر بيها). */
async function getAIResponse(messageHistory, onReasoningDelta, onStep, onContentDelta){
  const lastUserText = (messageHistory[messageHistory.length-1] && messageHistory[messageHistory.length-1].text) || '';
  const messages = messageHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
  const step = (text)=>{ if (onStep) onStep(text); };

  let searchResultsBlock = '';
  const tavilyReady = !!getTavilyApiKey();

  // ── لو المستخدم بعت رابط صريح، ندخله ونقرا محتواه فعليًا بدل ما نعمل بحث عام ──
  const explicitUrl = extractFirstUrl(lastUserText);
  if (tavilyReady && explicitUrl){
    step('بيفتح الرابط اللي بعته ويقرا محتواه...');
    const extracted = await performUrlExtract(explicitUrl);
    searchResultsBlock = buildUrlContentBlock(extracted, explicitUrl);
  }

  // ── قرار البحث العام: كلمة صريحة الأول، وإلا نسأل الموديل نفسه (لو مفيش رابط اتقرا فعلاً) ──
  if (tavilyReady && !searchResultsBlock){
    const explicitNeed = shouldWebSearch(lastUserText);
    let needsSearch = explicitNeed;
    if (!needsSearch){
      step('بيقرر لو الرسالة محتاجة بحث في الإنترنت ولا لأ...');
      needsSearch = await classifyNeedsSearch(lastUserText);
    }
    if (needsSearch){
      step('بيبحث في الإنترنت...');
      const results = await performWebSearch(lastUserText);
      searchResultsBlock = buildSearchResultsBlock(results);
    }
  }

  const providers = [
    { id:'groq', label:'Groq', pool: GroqKeyPool, fn: (msgs)=>callGroqChat(msgs, onReasoningDelta, searchResultsBlock, onContentDelta) },
    { id:'gemini', label:'Gemini', pool: GeminiKeyPool, fn: (msgs)=>callGeminiChat(msgs, onReasoningDelta, onContentDelta) },
    { id:'openrouter', label:'OpenRouter', pool: OpenRouterKeyPool, fn: (msgs)=>callOpenRouterChat(msgs, onReasoningDelta, onContentDelta) },
    { id:'vercel', label:'Vercel Gateway', pool: VercelGatewayKeyPool, fn: (msgs)=>callVercelChat(msgs, onReasoningDelta, onContentDelta) }
  ];
  // النظام تلقائي دايمًا (مفيش اختيار يدوي لموديل)، فبنجرب المزوّدين بالترتيب
  // الافتراضي زي ما هو، وكل محاولة بتتعرض كخطوة حقيقية للمستخدم أول ما تبدأ.
  // كل مزوّد هنا بديل للي قبله في نفس "خدمة الكتابة" — أي فشل بيتعدّى بصمت
  // للمزوّد اللي بعده، من غير ما المستخدم يعرف أو يتقال له اسم مزوّد بعينه.
  // ── المفاتيح دي مشتركة مع منصة فلك بالكامل (نفس الـ Firestore)، فلو فلك
  //    بتستهلكها بكثافة في نفس اللحظة، ممكن كل المفاتيح ترجع 429 (Rate
  //    Limit) وقتيًا من غير ما يبقى فيه أي توكن "خلص" فعليًا. عشان كده،
  //    بدل ما نستسلم من أول جولة، بنجرب جولة تانية كاملة بعد تأخير بسيط —
  //    غالبًا الزحمة بتزول خلال ثواني وبيرجع يشتغل عادي ──
  async function tryAllProviders(){
    let configuredCount = 0, quotaExhaustedCount = 0;
    const failLog = [];
    for (const p of providers){
      if (!p.pool.count()){ failLog.push(p.label + ': مفيش مفتاح'); continue; }
      configuredCount++;
      step('بيجهّز الرد...');
      let result = null, thrown = null;
      try{ result = await p.fn(messages); }
      catch(e){ if (isAbortError(e)) throw e; thrown = e; }
      if (result && result.text){
        if (result.usedTokens) addTokensUsed(result.usedTokens);
        return { ok:true, text: result.text, reasoning: result.reasoning || '', provider: p.label };
      }
      if (result && result.quotaExhausted){
        quotaExhaustedCount++;
        failLog.push(p.label + ': Rate Limit (429)');
      } else if (thrown){
        failLog.push(p.label + ': ' + (thrown.message || thrown.name || 'خطأ غير معروف'));
      } else {
        failLog.push(p.label + ': رجع رد فاضي (مفيش نص)');
      }
      step('بيجرب طريقة تانية...');
    }
    return { ok:false, configuredCount, quotaExhaustedCount, failLog };
  }

  let attempt = await tryAllProviders();
  if (attempt.ok) return { text: attempt.text, reasoning: attempt.reasoning, provider: attempt.provider };

  if (!attempt.configuredCount){
    return { text: "لسه بجيب مفاتيح الذكاء الاصطناعي... جرب تاني بعد ثانية.", provider: null, reasoning: '' };
  }

  const allWereQuota = attempt.quotaExhaustedCount === attempt.configuredCount;
  if (allWereQuota){
    // محاولة تانية بعد تأخير بسيط — لو الزحمة مؤقتة هترد عادي من غير ما
    // المستخدم يحس بأي مشكلة أصلاً.
    step('الخدمة مزدحمة شوية، بيعيد المحاولة...');
    await new Promise(r=>setTimeout(r, 4000));
    attempt = await tryAllProviders();
    if (attempt.ok) return { text: attempt.text, reasoning: attempt.reasoning, provider: attempt.provider };
  }

  if (attempt.quotaExhaustedCount === attempt.configuredCount){
    // ده رايت-ليميت مؤقت على المفاتيح المشتركة، مش توكن "خلص" فعليًا —
    // فالرسالة بتوصف الحالة الحقيقية بدل ما توهم إن الرصيد انتهى.
    const err = new Error('كل مزوّدي خدمة الكتابة مزدحمين دلوقتي (Rate Limit)');
    err.serviceDown = 'خدمة الكتابة';
    throw err;
  }
  throw (function(){
    const err = new Error("كل مزوّدي الذكاء الاصطناعي فشلوا");
    err.providerDetails = attempt.failLog || [];
    return err;
  })();
}

/* ============ المراجعة الذاتية: بيشغّل كل كود كتبه فعليًا ويصلّح لوحده لحد ما يشتغل كامل ============
   بعد ما الموديل يكتب الرد، لو فيه كود جواه، بنشغّل كل كتلة كود فعليًا (iframe
   حقيقي للـ HTML/JS، Piston API لأي لغة تانية زي Python/C/Java/PHP...) من غير ما
   المستخدم يشوف حاجة. لو فيه أي خطأ حقيقي في أي كتلة، بنجمع كل الأخطاء مع
   بعض ونبعتها للموديل مرة واحدة ونطلب منه يصلّح الكود كله ويرجعه كامل تاني،
   ونكرر العملية من الأول (تشغيل + فحص) لحد ما كل كتل الكود تشتغل صح من غير
   أي خطأ — القاعدة: الرد ما يوصلش للمستخدم إلا لما كل الكود يبقى شغّال فعلاً
   زي ما هو مطلوب بالظبط، مش بس "شكله كويس". فيه سقف أمان عالي جدًا
   (MAX_SELF_FIX_ATTEMPTS) بس هو للحماية من حلقة تانية للأبد لو الكود محتاج
   حاجة مش قادرين نوفرها فعليًا (زي ملف خارجي أو اتصال إنترنت خاص)، مش سقف
   "بيستسلم بسرعة". */
const MAX_SELF_FIX_ATTEMPTS = 20;
async function selfCheckAndFixCode(reply, history, onReasoningDelta, onStep, onContentDelta){
  let current = reply;
  let runningHistory = history;
  for (let i = 0; i < MAX_SELF_FIX_ATTEMPTS; i++){
    const blocks = extractCodeBlocksFromText(current.text);
    if (!blocks.length) return current; // مفيش كود أصلاً، مفيش داعي لأي اختبار

    if (onStep) onStep('بيشغّل الكود فعليًا عشان يتأكد إنه شغّال صح...');
    const failures = [];
    for (const b of blocks){
      const result = await runAnyCode(b.lang, b.code, false);
      if (result.ok === false){
        failures.push({ block: b, result });
      }
    }
    if (!failures.length) return current; // كل الكود اللي اتقدر يتفحص شغال صح 100%

    if (onStep) onStep('لقى ' + failures.length + ' خطأ فعلي، بيصلّح الكود... (محاولة ' + (i+2) + ')');

    // ── بنجمع كل الأخطاء الحقيقية اللي طلعت من كل كتل الكود مع بعض في
    //    رسالة واحدة، عشان الموديل يصلّحهم كلهم مرة واحدة بدل ما نلف
    //    كتلة كتلة ونستهلك محاولات على الفاضي ──
    const errorsText = failures.map((f, idx)=>
      'الكود رقم ' + (idx+1) + ' (' + (f.block.lang || 'كود') + '):\n' + (f.result.stderr || 'خطأ غير محدد').slice(0, 2000)
    ).join('\n\n---\n\n');

    runningHistory = runningHistory.concat([
      { role:'assistant', text: current.text },
      { role:'user', text: 'شغّلت الكود ده فعليًا وطلعت الأخطاء دي:\n\n' + errorsText
          + '\n\nصلّح كل الأخطاء دي وابعت الكود كامل تاني من غير أي اختصار أو حذف (ماتلخصش، اكتب كل ملف/كتلة كود من الأول للآخر بعد التصحيح). لازم كل الكود يشتغل من غير أي خطأ.' }
    ]);
    current = await getAIResponse(runningHistory, onReasoningDelta, onStep, onContentDelta);
  }
  // ── خلصت المحاولات المسموحة (سقف أمان بس، مش استسلام مبكر) — بنرجّع آخر
  //    نسخة اتصلحت مع تنبيه واضح إن فيه خطأ مستحيل الظروف الحالية تحله ──
  if (onStep) onStep('حاول يصلّح الكود عدد كبير من المرات، هيبعت آخر نسخة وصلها');
  return current;
}

/* ============ تحليل الصور عبر Gemini Vision (زي فلك بالظبط) ============
   التدفق: 1) compressImage بتصغّر أي صورة لحد 900px وتضغطها jpeg 0.6 قبل
   أي حاجة تانية (تخزين أو إرسال) عشان الرسالة تفضل خفيفة. 2) الصور
   المضغوطة بتتحول لـ base64 وتتبعت لـ Gemini Vision مع نص السؤال (لو
   موجود) في analyzeImagesWithGemini، وبيرجع وصف/تحليل نصي للصور. */
// بنضغط الصورة (max 900px, jpeg 0.6) قبل الإرسال والتخزين، عشان الرسالة تفضل خفيفة في قاعدة البيانات
function compressImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    }; img.onerror = reject; img.src = reader.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function analyzeImagesWithGemini(dataUrls, promptText){
  if (!GeminiKeyPool.count()){
    return "لسه مفيش مفتاح Gemini متسجل على فلك، فمقدرش أحلل الصور دلوقتي.";
  }
  const list = Array.isArray(dataUrls) ? dataUrls : [dataUrls];
  const imageParts = list.map(dataUrl=>{
    const commaIdx = dataUrl.indexOf(',');
    const base64Data = commaIdx > -1 ? dataUrl.slice(commaIdx+1) : dataUrl;
    const mimeMatch = /^data:([^;]+);base64/.exec(dataUrl);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    return { inline_data: { mime_type: mimeType, data: base64Data } };
  });
  const fullPrompt = (promptText || (list.length > 1 ? 'صف الصور دي بالتفصيل باللغة العربية.' : 'صف هذه الصورة بالتفصيل باللغة العربية.')) +
    '\n\nجاوب بأسلوب احترافي منظم بنقاط عند الحاجة، من غير ماركداون خام زي ### أو --- أو جداول |.';
  const parts = [{ text: fullPrompt }].concat(imageParts);
  const maxAttempts = Math.min(GeminiKeyPool.count(), 3);
  let triedAny = false, allWere429 = true;
  for (let i=0;i<maxAttempts;i++){
    const key = GeminiKeyPool.next();
    if (!key) break;
    try{
      const res = await fetchWithRetry("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: requestSignal(30000)
      });
      const data = await res.json();
      const txt = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
      GeminiKeyPool.report(key, res.status !== 429);
      triedAny = true;
      if (res.status !== 429) allWere429 = false;
      if (txt){
        const used = data && data.usageMetadata && data.usageMetadata.totalTokenCount;
        if (used) addTokensUsed(used);
        return txt;
      }
      if (res.status !== 429) break;
    } catch(e){ if (isAbortError(e)) throw e; console.warn("Gemini vision failed", e); }
  }
  // خدمة تحليل الصور معندهاش بديل تاني (Gemini بس) — فلو خلص توكنها فعلاً،
  // بنقول للمستخدم صراحة كده بدل رسالة الخطأ العامة.
  if (triedAny && allWere429){
    const err = new Error('توكن خدمة تحليل الصور خلص');
    err.serviceDown = 'خدمة تحليل الصور';
    throw err;
  }
  return "عذراً، مقدرتش أحلل الصورة دلوقتي.";
}

/* ============ STATE ============ */
let currentUser = null;
let currentUserGender = null; // 'male' | 'female' | null — بيتحدد من بروفايل المستخدم في Firebase
let currentConvId = null;
let conversationsRef = null;
// ── ممكن تتراكم أكتر من مرفق مع بعض (صور و/أو ملفات)، كل واحد بصندوقه الخاص جنب التاني ──
let pendingAttachments = []; // [{ id, type:'image'|'file', dataUrl?, name, kind, note, extractedText, processing }]
let attachSeq = 0;

/* ============ قراءة/تحليل الملفات المرفقة (PDF / Word / Excel / صوت / ZIP / نصوص) ============
   كل دالة بترجع نص مستخرج من الملف، وده بيتحط جوه رسالة المستخدم كـ"سياق" يتقرا
   للذكاء الاصطناعي بس (من غير ما يتكدّس جوه فقاعة الرسالة اللي بتتعرض للمستخدم). */
const MAX_FILE_CONTEXT_CHARS = 18000;

const TEXT_EXTENSIONS = /\.(txt|md|json|csv|js|ts|jsx|tsx|py|java|c|cpp|h|cs|php|rb|go|rs|sql|sh|yaml|yml|xml|html|css|log)$/i;

/* ============ نظام معالجة المرفقات — فرز وتوجيه تلقائي، بنفس فكرة النظام التلقائي للموديلات بالظبط ============
   زي ما نظام الموديلات بيجرب المزوّدين بالترتيب من غير ما المستخدم يختار،
   نظام المرفقات ده بيكتشف نوع الملف تلقائيًا وبيوجّهه لأداة القراءة
   المناسبة له، من غير أي تدخل يدوي:
   1) getFileKind(file) — "الحكم": بيبص على امتداد الاسم ونوع MIME ويرجّع
      كلمة وحدة تصف نوع الملف (image/audio/pdf/docx/excel/zip/text/other).
   2) لكل نوع، فيه دالة استخراج مخصصة له بس (single responsibility):
      - extractPdfText   → PDF عن طريق pdf.js
      - extractDocxText  → Word عن طريق mammoth.js
      - extractExcelText → Excel/CSV عن طريق SheetJS، شيت شيت
      - transcribeAudio  → صوت عن طريق Groq Whisper (بيرجع نص التفريغ)
      - readZipFile      → ملف مضغوط، إما بيفكه ويقرا كل ملف نصي جواه أو
        بيسيبه مقفول وبيرجّع بس قائمة أسماء الملفات (حسب opts.extractZip)
      - readFileAsText   → أي ملف نصي/كود عادي مباشرة
   3) processAttachedFile(file, opts) — "الموزّع الرئيسي": بيستدعي
      getFileKind أول حاجة، وعلى حسب النتيجة بيستدعي دالة الاستخراج
      الصح، وبيرجّع شكل موحّد { kind, name, extractedText, note } جاهز
      إنه يتحط في سياق المحادثة للذكاء الاصطناعي، مهما كان نوع الملف. */
function getFileKind(file){
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|flac|aac)$/i.test(name)) return 'audio';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('spreadsheetml')) return 'excel';
  if (name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed') return 'zip';
  if (TEXT_EXTENSIONS.test(name) || type.startsWith('text/')) return 'text';
  return 'other';
}

function readFileAsText(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}
function readFileAsArrayBuffer(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

async function extractPdfText(file){
  await loadScriptOnce(LIB_URLS.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 40);
  for (let p=1; p<=maxPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(it=>it.str).join(' ') + '\n\n';
    if (text.length > MAX_FILE_CONTEXT_CHARS) break;
  }
  return text.trim();
}

async function extractDocxText(file){
  await loadScriptOnce(LIB_URLS.mammoth);
  const buf = await readFileAsArrayBuffer(file);
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || '').trim();
}

// ── معالجة Excel بتتم جوه Web Worker مستقل (بدل الـ Thread الرئيسي) عشان ملف
//    كبير ميجمّدش واجهة المستخدم أثناء التحليل. المكتبة نفسها بتتحمّل جوه الـ
//    Worker عن طريق importScripts، والنتيجة (نص CSV لكل شيت) بترجع بـ postMessage ──
let __xlsxWorker = null;
function getXlsxWorker(){
  if (__xlsxWorker) return __xlsxWorker;
  const workerSrc = `
    self.onmessage = async function(e){
      try{
        importScripts('${LIB_URLS.xlsx}');
        const wb = XLSX.read(e.data.buffer, { type:'array' });
        let out = '';
        wb.SheetNames.forEach(function(sheetName){
          out += '--- شيت: ' + sheetName + ' ---\\n';
          out += XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          out += '\\n\\n';
        });
        self.postMessage({ ok:true, text: out.trim() });
      } catch(err){
        self.postMessage({ ok:false, error: (err && err.message) || 'فشل تحليل ملف Excel' });
      }
    };
  `;
  const blob = new Blob([workerSrc], { type: 'application/javascript' });
  __xlsxWorker = new Worker(URL.createObjectURL(blob));
  return __xlsxWorker;
}
async function extractExcelText(file){
  const buf = await readFileAsArrayBuffer(file);
  const worker = getXlsxWorker();
  return new Promise((resolve, reject)=>{
    const onMsg = (e)=>{
      worker.removeEventListener('message', onMsg);
      if (e.data && e.data.ok) resolve(e.data.text);
      else reject(new Error(e.data && e.data.error || 'فشل تحليل ملف Excel'));
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ buffer: buf }, [buf]);
  });
}

async function transcribeAudio(file){
  const key = GroqKeyPool.next();
  if (!key) throw new Error('مفيش مفتاح Groq متاح للتفريغ الصوتي دلوقتي');
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-large-v3');
  // ── متفروضش اللغة عربي — سايبين Whisper يكتشف لغة الكلام لوحده، عشان
  //    التفريغ يبقى دقيق مهما كانت لغة المتكلم/الأغنية ──
  const res = await fetchWithRetry('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key },
    body: form
  });
  GroqKeyPool.report(key, res.ok);
  if (!res.ok) throw new Error('فشل تفريغ الصوت');
  const data = await res.json();
  return (data.text || '').trim();
}

/* ============ تحليل موسيقي/صوتي حقيقي عبر Gemini (بيسمع الملف فعلاً، مش تفريغ كلام) ============
   Whisper بيحوّل كلام لنص بس وما بيفهمش موسيقى. الدالة دي بتبعت الملف الصوتي
   نفسه (base64، زي ما بنعمل بالظبط مع الصور في analyzeImagesWithGemini) لـ
   Gemini، وهو فعلاً بيسمعه ويقدر يوصف الآلات، الإيقاع، جو الأغنية/المزاج،
   ونوعها، ومش بس ينطق اللي اتقال. */
function fileToBase64DataUrl(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function analyzeAudioWithGemini(file, promptText){
  if (!GeminiKeyPool.count()) return '';
  let dataUrl;
  try{ dataUrl = await fileToBase64DataUrl(file); } catch(e){ return ''; }
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx > -1 ? dataUrl.slice(commaIdx+1) : dataUrl;
  const mimeType = (file.type && file.type.startsWith('audio/')) ? file.type : 'audio/mpeg';
  const fullPrompt = (promptText ||
    'استمع للملف الصوتي ده كامل وحلله تحليل حقيقي مش مجرد تفريغ كلام. لو أغنية: قول نوعها/جنسها الموسيقي، الجو العام/المزاج، الآلات اللي واضحة، سرعة الإيقاع (سريع/متوسط/بطيء)، وملخص بسيط لموضوع الكلمات لو الغنا مفهوم. لو مجرد كلام/تسجيل عادي مش أغنية، قول كده صراحة من غير تخمين تفاصيل موسيقية مش موجودة.')
    + '\n\nجاوب باللغة العربية، بأسلوب منظم بنقاط عند الحاجة، من غير ماركداون خام زي ### أو --- أو جداول |.';
  const parts = [{ text: fullPrompt }, { inline_data: { mime_type: mimeType, data: base64Data } }];
  const maxAttempts = Math.min(GeminiKeyPool.count(), 3);
  for (let i=0;i<maxAttempts;i++){
    const key = GeminiKeyPool.next();
    if (!key) break;
    try{
      const res = await fetchWithRetry("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: requestSignal(45000)
      });
      const data = await res.json();
      const txt = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
      GeminiKeyPool.report(key, res.status !== 429);
      if (txt){
        const used = data && data.usageMetadata && data.usageMetadata.totalTokenCount;
        if (used) addTokensUsed(used);
        return txt;
      }
      if (res.status !== 429) break;
    } catch(e){ if (isAbortError(e)) throw e; console.warn("Gemini audio analysis failed", e); }
  }
  return '';
}

// ── ZIP: لو extract=true بنفك الضغط ونقرا كل ملف نصي جواه (بتخطي الملفات الثنائية/الكبيرة)،
//    ولو extract=false بنسيبه مضغوط ونكتفي بعرض قائمة الملفات اللي جواه للذكاء ──
async function readZipFile(file, extract){
  await loadScriptOnce(LIB_URLS.jszip);
  const zip = await window.JSZip.loadAsync(file);
  const entries = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  if (!extract){
    return { note: 'ملف مضغوط (' + entries.length + ' ملف) — سايبه زي ما هو من غير فك ضغط. قائمة الملفات:\n- ' + entries.slice(0,50).join('\n- '), zipEntries: entries };
  }
  let out = 'محتوى الملفات داخل الأرشيف المضغوط (' + entries.length + ' ملف):\n\n';
  let used = 0;
  for (const name of entries){
    if (used > MAX_FILE_CONTEXT_CHARS) { out += '\n... (باقي الملفات اتقطعت عشان المساحة)'; break; }
    if (!TEXT_EXTENSIONS.test(name) && !/\.(pdf|docx?|xlsx?)$/i.test(name)){
      out += '📁 ' + name + ' (ملف ثنائي، متقروش نصيًا)\n';
      continue;
    }
    try{
      const content = await zip.files[name].async('string');
      const trimmed = content.slice(0, 3000);
      out += '--- ' + name + ' ---\n' + trimmed + '\n\n';
      used += trimmed.length;
    } catch(e){ out += '⚠️ مقدرتش أقرا ' + name + '\n'; }
  }
  return { note: out.trim(), zipEntries: entries };
}

// ── تقسيم النصوص الطويلة لأجزاء (Text Chunking): بدل ما نقطع المستند فجأة عند
//    18000 حرف من غير ما نقول للمستخدم أو الذكاء إن فيه بقية، بنقسمه لأجزاء
//    مرتبة (على حدود فقرات لو أمكن) ونسيب باقي الأجزاء متاحة يتبعتوا مرحليًا
//    في رسائل تانية بدل ما يضيعوا خالص ──
function chunkText(text, maxLen){
  maxLen = maxLen || MAX_FILE_CONTEXT_CHARS;
  if (!text || text.length <= maxLen) return [text || ''];
  const paras = text.split(/\n{2,}/);
  const chunks = [];
  let cur = '';
  for (const p of paras){
    const piece = (cur ? cur + '\n\n' : '') + p;
    if (piece.length > maxLen){
      if (cur) { chunks.push(cur); cur = ''; }
      // فقرة واحدة أكبر من الحد نفسه: نقطعها بالحرف كملاذ أخير
      for (let i=0; i<p.length; i+=maxLen) chunks.push(p.slice(i, i+maxLen));
    } else {
      cur = piece;
      if (cur.length >= maxLen){ chunks.push(cur); cur = ''; }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}

// ── الموزّع الرئيسي: بياخد ملف ويرجع { kind, name, extractedText, note, chunks } جاهزة للإرفاق ──
async function processAttachedFile(file, opts){
  const kind = getFileKind(file);
  const result = { kind, name: file.name, extractedText: '', note: '', chunks: null };
  // ── حجم الملف بصيغة مقروءة (كيلوبايت أو ميجابايت حسب الحجم)، بنضيفه
  //    لكل نوع ملف بشكل موحّد عشان المستخدم يعرف حجم أي مرفق مهما كان نوعه ──
  function fileSizeLabel(){
    const kb = file.size / 1024;
    return kb < 1024 ? Math.round(kb) + ' كيلوبايت' : (kb/1024).toFixed(1) + ' ميجابايت';
  }
  function applyChunking(fullText, baseNote){
    const chunks = chunkText(fullText, MAX_FILE_CONTEXT_CHARS);
    result.extractedText = chunks[0] || '';
    if (chunks.length > 1){
      result.chunks = chunks;
      result.note = baseNote + ' — الملف طويل واتقسّم لـ ' + chunks.length + ' أجزاء، الجزء 1/' + chunks.length + ' هو اللي هيتبعت دلوقتي (استخدم أسهم التنقل في المرفق لاختيار جزء تاني قبل الإرسال)';
    } else {
      result.note = baseNote;
    }
  }
  if (kind === 'pdf'){
    applyChunking(await extractPdfText(file), 'ملف PDF (' + fileSizeLabel() + ')');
  } else if (kind === 'docx'){
    applyChunking(await extractDocxText(file), 'ملف Word (' + fileSizeLabel() + ')');
  } else if (kind === 'excel'){
    applyChunking(await extractExcelText(file), 'ملف Excel (' + fileSizeLabel() + ')');
  } else if (kind === 'audio'){
    const settled = await Promise.allSettled([
      transcribeAudio(file),
      analyzeAudioWithGemini(file)
    ]);
    const transcript = (settled[0].status === 'fulfilled' && settled[0].value) ? settled[0].value : '';
    const musicAnalysis = (settled[1].status === 'fulfilled' && settled[1].value) ? settled[1].value : '';
    if (settled[0].status === 'rejected') console.warn('transcribeAudio failed', settled[0].reason);
    if (settled[1].status !== 'fulfilled' || !settled[1].value) result.musicAnalysisFailed = true;

    let combined = '';
    if (transcript) combined += 'الكلام/الغنا اللي اتفهم من التسجيل:\n' + transcript + '\n\n';
    if (musicAnalysis) combined += 'تحليل موسيقي/صوتي حقيقي للملف (سمعه فعليًا):\n' + musicAnalysis;
    result.extractedText = combined.trim() || 'مقدرتش أطلع أي تفريغ أو تحليل من الملف الصوتي ده دلوقتي.';
    let noteParts = ['ملف صوتي (' + fileSizeLabel() + ')'];
    if (transcript) noteParts.push('اتعمله تفريغ كلام');
    if (musicAnalysis) noteParts.push('اتعمله تحليل موسيقي حقيقي');
    if (result.musicAnalysisFailed) noteParts.push('⚠️ التحليل الموسيقي فشل دلوقتي');
    result.note = noteParts.join(' — ');
  } else if (kind === 'zip'){
    const zr = await readZipFile(file, !!(opts && opts.extractZip));
    result.extractedText = zr.note;
    result.note = 'ملف مضغوط (' + fileSizeLabel() + ') — ' + ((opts && opts.extractZip) ? 'اتفك وقُريت محتوياته' : 'سايبه زي ما هو');
  } else if (kind === 'text'){
    applyChunking(await readFileAsText(file), 'ملف نصي/كود (' + fileSizeLabel() + ')');
  } else {
    result.note = 'ملف (' + (file.type || 'نوع غير معروف') + '، ' + fileSizeLabel() + ') — متقروش محتواه نصيًا، بس اسمه اتبعت للذكاء';
  }
  return result;
}

/* ============ ELEMENTS ============ */
const loadingScreen = document.getElementById('loading-screen');
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const conversationList = document.getElementById('conversation-list');
const newChatBtn = document.getElementById('new-chat-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameLabel = document.getElementById('user-name-label');
const conversationTitle = document.getElementById('conversation-title');

const messagesEl = document.getElementById('messages');
// ── لو حد ضغط على رابط جوه رد الذكاء (.msg-link)، بنفتحه إحنا بأنفسنا عن طريق
//    window.open بدل ما نسيب المتصفح يقرر — بعض المتصفحات/التطبيقات المغلّفة
//    بتتجاهل target="_blank" بصمت لو الرابط كان جوه عنصر اتبنى ديناميكيًا
//    (زي أنيميشن الكتابة التدريجي هنا)، فده بيضمن إن الضغط دايمًا هيفتح الرابط ──
messagesEl.addEventListener('click', (e)=>{
  const link = e.target.closest('a.msg-link');
  if (!link) return;
  e.preventDefault();
  window.open(link.href, '_blank', 'noopener,noreferrer');
});

// ============ سكرول تلقائي "لايف" وراء رد الذكاء + زرار "روح لتحت" ============
// autoFollowActive: لما مفعّل، حلقة followLoopStep تحت شغالة كل فريم وبتقرّب
// scrollTop تدريجيًا (easing، مش قفزة واحدة فجأة) من الهدف — وهو آخر حاجة
// ظهرت ناقص هامش بسيط (SCROLL_FOLLOW_GAP) عشان تبان خلفية الشاشة تحت غرفة
// التفكير بدل ما يلزق بالظبط في آخر سطر. دي بالظبط نفس فكرة السكرول الناعم
// اللي بتشوفه هنا وهو بيتابع رد كلود وهو بيتكتب: مش قفزة فورية كل ما سطر
// جديد يتضاف، لكن حركة مستمرة وناعمة كل فريم لحد ما توصل لآخر حاجة ظهرت.
// ولو المستخدم سحب بإيده لفوق قاصدًا (عشان يقرا حاجة قديمة)، بنوقف المتابعة
// التلقائية فورًا ونوريله زرار عائم يرجّعه لتحت لما يحب.
const SCROLL_FOLLOW_GAP = 90;
const SCROLL_FOLLOW_EASE = 0.18; // كل ما القيمة أكبر، اللحاق أسرع؛ 0.18 قريبة من إحساس السكرول الناعم في واجهات الشات المعروفة
let autoFollowActive = false;

(function runFollowLoop(){
  if (autoFollowActive){
    // ── لو فيه غرفة تفكير شغالة دلوقتي (thinking-full)، السكرول التلقائي
    //    ميجريش لآخر حاجة اتضافت تحتها (ده كان بيكسر الـ sticky ويخلي
    //    الغرفة تتزحلق من فوق وتختفي بعد أول رسالة)، لكن يوقف بالظبط عند
    //    أول ظهور للغرفة عشان تفضل ملزّقة فوق، والمساحة الفاضية تحتها
    //    تفضل بادية زي ما التصميم الأصلي يقصد. أول ما الرد يخلص وكلاس
    //    thinking-full يتشال، السكرول يرجع يجري عادي لآخر حاجة ──
    const activeThinking = messagesEl.querySelector('.msg-wrap.assistant.thinking-full');
    let target;
    if (activeThinking){
      const gap = messagesEl.scrollTop + (activeThinking.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top);
      target = Math.max(0, gap);
    } else {
      const maxScroll = messagesEl.scrollHeight - messagesEl.clientHeight;
      target = Math.max(0, maxScroll - SCROLL_FOLLOW_GAP);
    }
    const diff = target - messagesEl.scrollTop;
    // فرق بسيط جدًا (أقل من بكسل) بنقفله دفعة واحدة بدل ما يفضل يهتز للأبد من غير ما يوصل بالظبط
    if (Math.abs(diff) > 0.5) messagesEl.scrollTop += diff * SCROLL_FOLLOW_EASE;
    else if (diff !== 0) messagesEl.scrollTop = target;
  }
  requestAnimationFrame(runFollowLoop);
})();

// ============ سباسر السكرول: مساحة فاضية مؤقتة بتتحط آخر حاجة في الشات ============
// المشكلة اللي كانت بتحصل: scrollIntoView({block:'start'}) مقدرش يوصل برسالة
// المستخدم/غرفة التفكير لأول الشاشة تمامًا لو المحادثة لسه قصيرة، لأن مفيش
// محتوى كفاية تحتها يسمح للحاوية أصلاً إنها تتسكرول للمسافة المطلوبة (زي ما
// بيحصل بالظبط في واجهة كلود). الحل: نفتح مساحة فاضية بارتفاع الشاشة تقريبًا
// (scroll-spacer) فور ما نضيف الرسالة الجديدة، عشان يبقى فيه مساحة كافية
// تسمح بالسكرول، وبعدين نقفلها (height:0 بأنيميشن ناعم) أول ما الرد يخلص أو
// يتوقف، عشان محاولة السكرول الجاية تبدأ من غير أي مسافة فاضية زايدة متراكمة.
let scrollSpacerEl = null;
function ensureScrollSpacer(){
  if (!scrollSpacerEl || !scrollSpacerEl.isConnected){
    scrollSpacerEl = document.createElement('div');
    scrollSpacerEl.className = 'scroll-spacer';
  }
  messagesEl.appendChild(scrollSpacerEl); // لازم تفضل آخر عنصر دايمًا
  return scrollSpacerEl;
}
function openScrollSpacer(){
  const spacer = ensureScrollSpacer();
  spacer.style.transition = 'none'; // تفتح فورًا من غير أنيميشن عشان توصل قبل السكرول
  spacer.style.height = messagesEl.clientHeight + 'px';
  void spacer.offsetHeight; // نجبر المتصفح يطبّق القيمة فورًا قبل ما نرجّع الترانزيشن العادية
  spacer.style.transition = '';
}
function closeScrollSpacer(){
  if (scrollSpacerEl) scrollSpacerEl.style.height = '0px';
}

const scrollBottomBtn = document.createElement('button');
scrollBottomBtn.type = 'button';
scrollBottomBtn.id = 'scroll-bottom-btn';
scrollBottomBtn.className = 'scroll-bottom-btn';
scrollBottomBtn.setAttribute('aria-label', 'روح لآخر الشات');
scrollBottomBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
document.getElementById('chat-main').appendChild(scrollBottomBtn);

function updateScrollBottomBtn(){
  const farFromBottom = (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) > 160;
  scrollBottomBtn.classList.toggle('visible', farFromBottom);
}
messagesEl.addEventListener('scroll', updateScrollBottomBtn, { passive:true });
// لمسة/سكرول حقيقي من المستخدم (مش من كودنا) = بيقصد يقرا حاجة تانية، فنوقف المتابعة التلقائية
messagesEl.addEventListener('wheel', ()=>{ autoFollowActive = false; }, { passive:true });
messagesEl.addEventListener('touchmove', ()=>{ autoFollowActive = false; }, { passive:true });
scrollBottomBtn.addEventListener('click', ()=>{
  autoFollowActive = true;
});
const composer = document.getElementById('composer');
const composerInput = document.getElementById('composer-input');
const sendBtn = composer.querySelector('.send-btn');
const attachBtn = document.getElementById('attach-btn');
const attachInput = document.getElementById('attach-input');
const attachPreview = document.getElementById('attach-preview');

/* ============ CONVERSATION CONTEXT MENU + MODALS ELEMENTS ============ */
const contextMenu = document.getElementById('conv-context-menu');
const contextMenuBackdrop = document.getElementById('context-menu-backdrop');
const renameModal = document.getElementById('rename-modal');
const renameForm = document.getElementById('rename-form');
const renameInput = document.getElementById('rename-input');
const renameCancelBtn = document.getElementById('rename-cancel-btn');
const deleteModal = document.getElementById('delete-modal');
const deleteModalText = document.getElementById('delete-modal-text');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

/* ============ AUTH TABS ============ */
const genderMaleBtn = document.getElementById('gender-male-btn');
const genderFemaleBtn = document.getElementById('gender-female-btn');
const signupGenderInput = document.getElementById('signup-gender');
[genderMaleBtn, genderFemaleBtn].forEach(btn=>{
  btn.addEventListener('click', ()=>{
    genderMaleBtn.classList.toggle('active', btn===genderMaleBtn);
    genderFemaleBtn.classList.toggle('active', btn===genderFemaleBtn);
    signupGenderInput.value = btn.dataset.gender;
  });
});
/* ============ لغة شاشة الدخول (عربي/تركي) ============
   بتتعرّف تلقائيًا أول مرة على لغة الجهاز/المتصفح (لو تركي بيفتح تركي، غير
   كده عربي كافتراضي)، وبعد كده بتفتكر آخر اختيار يدوي للمستخدم في localStorage.
   الترجمة هنا مقصودة تبقى بس لشاشة الدخول/التسجيل زي ما اتطلب، مش التطبيق كله. */
/* ============ APP_I18N — نظام ترجمة موسّع لكل التطبيق (شاشة الدخول + الشات
   + صفحة الأمان + كل المودالز)، مش بس شاشة الدخول زي الأول. لسه بيتعرّف
   تلقائيًا أول مرة على لغة الجهاز (تركي بيفتح تركي، غير كده عربي)، وبيفتكر
   آخر اختيار يدوي للمستخدم، وبقى بيتطبّق على document كله مش على auth-screen بس. ============ */
const APP_I18N = {
  ar: {
    sub: 'مساحتك الخاصة، بتفتكر كل حاجة تقولها.',
    tabLogin: 'تسجيل الدخول', tabSignup: 'حساب جديد',
    email: 'البريد الإلكتروني', emailPlaceholder: 'name@example.com',
    password: 'كلمة المرور', passwordPlaceholder: '••••••••',
    loginBtn: 'دخول',
    name: 'الاسم', namePlaceholder: 'اسمك',
    gender: 'النوع', male: 'ذكر', female: 'أنثى',
    passwordMinPlaceholder: '٦ حروف على الأقل',
    signupBtn: 'إنشاء الحساب',
    langToggle: 'TR',
    newChat: 'محادثة جديدة', logout: 'تسجيل الخروج',
    composerPlaceholder: 'اكتب رسالتك...', attachLabel: 'إرفاق ملف',
    usageLockDefault: 'الجلسة النهارده خلصت.',
    renameTitle: 'تعديل اسم المحادثة', renamePlaceholder: 'اسم المحادثة',
    deleteTitle: 'حذف المحادثة؟', deleteText: 'هتتحذف المحادثة والرسائل اللي فيها نهائيًا، ومش هينفع ترجّعها تاني.',
    cancel: 'إلغاء', save: 'حفظ', delete: 'حذف',
    bioTitle: 'تأمين حسابك ببصمتك',
    bioText: 'عشان نضمن عدالة استخدام التوكنات اليومية بين كل المستخدمين، لازم تسجّل بصمة إصبعك (أو أي وسيلة تحقق بيومترية على جهازك) قبل ما تكمل.',
    bioTerms: 'تسجيل البصمة يربط حسابك بأمان بجهازك ويُستخدم حصريًا لمنع تكرار الحسابات الوهمية والتحايل على استهلاك الـ Tokens اليومية، لضمان عدالة الاستخدام للجميع. بصمتك بتتخزّن على جهازك بس عن طريق نظام تشغيله (WebAuthn) ومش بتتبعت لأي حد.',
    bioRegisterBtn: 'تسجيل البصمة دلوقتي',
    bioUnsupported: 'جهازك أو متصفحك مش داعم تسجيل بصمة (WebAuthn) دلوقتي — جرب متصفح تاني أو حدّث نظام التشغيل عشان تقدر تكمل.',
    secBtnLabel: 'الأمان والخصوصية',
    secTitle: 'درع الحماية الكامل', secSubtitle: 'نظام أمان شفاف، تحت سيطرتك بالكامل',
    secStep1Title: 'عزل بياناتك بالكامل',
    secStep1Text: 'كل محادثة وملف وسجل نشاط مربوط بحسابك بس، ومحدّش غيرك — حتى فريق التطبيق — يقدر يوصله من غير إذنك.',
    secStep2Title: 'يعمل بسلاسة مع أي VPN',
    secStep2Text: 'التطبيق مصمّم يشتغل بسلاسة تامة مع أي شبكة VPN تختارها، من غير أي حظر أو قيود. إحنا مش بنعمل تتبّع لموقعك أو شبكتك، ومفيش أي "بصمة تتبع" بتتسجّل عنك.',
    secStep3Title: 'لوحة بياناتك الخاصة',
    secStep3Text: 'تقدر تشوف بنفسك كل سجلات نشاطك المخزّنة على السيرفر في أي وقت.',
    secDashboardBtn: 'عرض سجلاتي',
    secPledgeTitle: 'التعهد الأمني المُلزم',
    secPledgeText: 'بنتعهد إن قواعد عزل بياناتك ووعود الخصوصية دي مش تفاوضية. لو حصل أي خرق أو مخالفة لأي قاعدة من دول — بأي شكل — إنت صاحب السلطة المباشرة إنك تُبلّغ فورًا، والسيرفر هيتصرف تلقائيًا زي ما هو موضّح تحت من غير ما ينتظر موافقة حد.',
    secEmergencyBtn: 'الإبلاغ عن خرق أمني طارئ',
    secEmergencyNote: 'الضغط هنا بيوقف خدمات الذكاء الاصطناعي تلقائيًا لمدة 24 ساعة للمراجعة، وبيتبعت تنبيه لكل المستخدمين المتصلين.',
    secConfirmTitle: 'تفعيل الإيقاف الطارئ؟',
    secConfirmText: 'ده هيوقف خدمات الذكاء الاصطناعي لكل المستخدمين لمدة 24 ساعة، وهيتبعت تنبيه عام للكل. استخدمه بس لو فعلاً في خرق أمني حقيقي.',
    secConfirmYes: 'أيوه، فعّل الإيقاف',
    secBack: 'رجوع', secDashboardTitle: 'سجل نشاطك',
    secDashboardEmpty: 'مفيش نشاط مسجّل لسه.',
    secAlreadyReported: 'إنت بلّغت قبل كده، وبلاغك لسه قيد المراجعة.',
    secReportError: 'حصل خطأ وإحنا بنبعت البلاغ، جرب تاني.',
    secLoginRequired: 'سجّل دخولك الأول عشان تقدر تشوف سجلاتك.',
    secBroadcastMsg: 'تنبيه أمني: تم تفعيل إجراء إيقاف طارئ — التطبيق تحت المراجعة الأمنية مؤقتًا.',
    secAiPausedMsg: 'خدمات الذكاء الاصطناعي متوقفة مؤقتًا (تحت المراجعة الأمنية) — هترجع تلقائيًا خلال 24 ساعة.',
    activityLabels: {
      login: 'تسجيل دخول', signup: 'إنشاء حساب', logout: 'تسجيل خروج',
      emergency_report: 'بلاغ أمني طارئ', biometric_registered: 'تسجيل بصمة'
    },
    errors: {
      'auth/email-already-in-use': 'البريد ده متسجل قبل كده.',
      'auth/invalid-email': 'صيغة البريد مش صح.',
      'auth/weak-password': 'كلمة المرور لازم تكون ٦ حروف على الأقل.',
      'auth/user-not-found': 'مفيش حساب بالبريد ده.',
      'auth/wrong-password': 'كلمة المرور غلط.',
      'auth/invalid-credential': 'البريد أو كلمة المرور غلط.',
      'auth/operation-not-allowed': 'تسجيل الدخول بالبريد وكلمة المرور مش مفعّل في المشروع.',
      'auth/unauthorized-domain': 'الدومين ده مش مُصرَّح له في إعدادات Firebase.',
      default: 'حصل خطأ، جرب تاني.'
    }
  },
  tr: {
    sub: 'Kişisel alanın, söylediğin her şeyi hatırlar.',
    tabLogin: 'Giriş Yap', tabSignup: 'Yeni Hesap',
    email: 'E-posta', emailPlaceholder: 'name@example.com',
    password: 'Şifre', passwordPlaceholder: '••••••••',
    loginBtn: 'Giriş',
    name: 'İsim', namePlaceholder: 'İsmin',
    gender: 'Cinsiyet', male: 'Erkek', female: 'Kadın',
    passwordMinPlaceholder: 'En az 6 karakter',
    signupBtn: 'Hesap Oluştur',
    langToggle: 'AR',
    newChat: 'Yeni sohbet', logout: 'Çıkış yap',
    composerPlaceholder: 'Mesajını yaz...', attachLabel: 'Dosya ekle',
    usageLockDefault: 'Bugünkü oturum bitti.',
    renameTitle: 'Sohbet adını düzenle', renamePlaceholder: 'Sohbet adı',
    deleteTitle: 'Sohbet silinsin mi?', deleteText: 'Bu sohbet ve içindeki tüm mesajlar kalıcı olarak silinecek, geri alınamaz.',
    cancel: 'İptal', save: 'Kaydet', delete: 'Sil',
    bioTitle: 'Hesabını parmak izinle güvence altına al',
    bioText: 'Günlük token kullanımının tüm kullanıcılar arasında adil olmasını sağlamak için devam etmeden önce parmak izini (veya cihazındaki başka bir biyometrik doğrulamayı) kaydetmen gerekiyor.',
    bioTerms: 'Parmak izi kaydı hesabını cihazına güvenli şekilde bağlar ve sadece sahte hesap oluşturmayı ve günlük token limitini aşmaya çalışmayı önlemek için kullanılır. Parmak izin sadece cihazının işletim sistemi (WebAuthn) üzerinden cihazında saklanır, hiçbir yere gönderilmez.',
    bioRegisterBtn: 'Şimdi Parmak İzi Kaydet',
    bioUnsupported: 'Cihazın veya tarayıcın şu an parmak izi kaydını (WebAuthn) desteklemiyor — devam edebilmek için başka bir tarayıcı dene veya işletim sistemini güncelle.',
    secBtnLabel: 'Güvenlik ve Gizlilik',
    secTitle: 'Tam Koruma Kalkanı', secSubtitle: 'Tamamen senin kontrolünde, şeffaf bir güvenlik sistemi',
    secStep1Title: 'Verilerin tamamen izole',
    secStep1Text: 'Her sohbet, dosya ve etkinlik kaydı sadece hesabına bağlıdır; senin iznin olmadan uygulama ekibi dahil hiç kimse ona erişemez.',
    secStep2Title: 'Her VPN ile sorunsuz çalışır',
    secStep2Text: 'Uygulama, seçtiğin herhangi bir VPN ağıyla hiçbir engelleme veya kısıtlama olmadan sorunsuz çalışacak şekilde tasarlandı. Konumunu veya ağını takip etmiyoruz; senin hakkında kaydedilen bir "izleme parmak izi" yok.',
    secStep3Title: 'Kişisel veri panelin',
    secStep3Text: 'Sunucuda kayıtlı tüm etkinlik kayıtlarını istediğin an kendin görebilirsin.',
    secDashboardBtn: 'Kayıtlarımı Göster',
    secPledgeTitle: 'Bağlayıcı Güvenlik Taahhüdü',
    secPledgeText: 'Veri izolasyonu kurallarının ve gizlilik sözlerinin pazarlık konusu olmadığını taahhüt ediyoruz. Bu kurallardan herhangi biri herhangi bir şekilde ihlal edilirse, bunu anında bildirme yetkisi doğrudan sende olur ve sunucu aşağıda belirtildiği gibi kimseden onay beklemeden otomatik olarak devreye girer.',
    secEmergencyBtn: 'Acil Güvenlik İhlali Bildir',
    secEmergencyNote: 'Buraya basmak, yapay zeka hizmetlerini inceleme için otomatik olarak 24 saatliğine durdurur ve bağlı tüm kullanıcılara bir uyarı gönderir.',
    secConfirmTitle: 'Acil durdurma etkinleştirilsin mi?',
    secConfirmText: 'Bu, tüm kullanıcılar için yapay zeka hizmetlerini 24 saatliğine durdurur ve herkese genel bir uyarı gönderir. Sadece gerçek bir güvenlik ihlali varsa kullan.',
    secConfirmYes: 'Evet, durdurmayı etkinleştir',
    secBack: 'Geri', secDashboardTitle: 'Etkinlik Kayıtların',
    secDashboardEmpty: 'Henüz kayıtlı bir etkinlik yok.',
    secAlreadyReported: 'Daha önce bildirimde bulundun, bildirimin hâlâ inceleniyor.',
    secReportError: 'Bildirim gönderilirken bir hata oluştu, tekrar dene.',
    secLoginRequired: 'Kayıtlarını görebilmek için önce giriş yapmalısın.',
    secBroadcastMsg: 'Güvenlik uyarısı: acil durdurma prosedürü etkinleştirildi — uygulama geçici olarak güvenlik incelemesi altında.',
    secAiPausedMsg: 'Yapay zeka hizmetleri geçici olarak durduruldu (güvenlik incelemesi) — 24 saat içinde otomatik olarak geri gelecek.',
    activityLabels: {
      login: 'Giriş yapıldı', signup: 'Hesap oluşturuldu', logout: 'Çıkış yapıldı',
      emergency_report: 'Acil güvenlik bildirimi', biometric_registered: 'Parmak izi kaydedildi'
    },
    errors: {
      'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı.',
      'auth/invalid-email': 'E-posta biçimi geçersiz.',
      'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
      'auth/user-not-found': 'Bu e-postayla bir hesap bulunamadı.',
      'auth/wrong-password': 'Şifre yanlış.',
      'auth/invalid-credential': 'E-posta veya şifre yanlış.',
      'auth/operation-not-allowed': 'E-posta ve şifre ile giriş bu projede etkin değil.',
      'auth/unauthorized-domain': 'Bu alan adı Firebase ayarlarında yetkili değil.',
      default: 'Bir hata oluştu, tekrar dene.'
    }
  }
};
// اسم قديم لسه محتفظين بيه عشان أي كود تاني بيرجع له (توافق خلفي)
const AUTH_I18N = APP_I18N;

function detectDefaultAuthLang(){
  const saved = localStorage.getItem('authLang');
  if (saved === 'ar' || saved === 'tr') return saved;
  const sysLang = ((navigator.language || navigator.userLanguage || '') + '').toLowerCase();
  return sysLang.startsWith('tr') ? 'tr' : 'ar';
}
let currentAuthLang = detectDefaultAuthLang();
let currentAppLang = currentAuthLang; // نفس القيمة، اسم أوضح للاستخدام في التطبيق كله

// t(key) — بترجع النص المترجم للمفتاح المطلوب باللغة الحالية، مع fallback للعربي
function t(key){
  const dict = APP_I18N[currentAppLang] || APP_I18N.ar;
  return (dict[key] !== undefined) ? dict[key] : ((APP_I18N.ar[key] !== undefined) ? APP_I18N.ar[key] : key);
}

function applyAuthLanguage(lang){
  currentAuthLang = (lang === 'tr') ? 'tr' : 'ar';
  currentAppLang = currentAuthLang;
  const dict = APP_I18N[currentAppLang];
  const dir = currentAppLang === 'tr' ? 'ltr' : 'rtl';

  // بيتطبّق على كل الصفحة دلوقتي (شاشة الدخول + التطبيق + صفحة الأمان)، مش بس auth-screen
  document.documentElement.setAttribute('lang', currentAppLang);
  authScreen.setAttribute('lang', currentAppLang);
  authScreen.setAttribute('dir', dir);
  appShell.setAttribute('lang', currentAppLang);
  appShell.setAttribute('dir', dir);
  const secModalEl = document.getElementById('security-modal');
  if (secModalEl){ secModalEl.setAttribute('lang', currentAppLang); secModalEl.setAttribute('dir', dir); }

  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] !== undefined) el.placeholder = dict[key];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{
    const key = el.getAttribute('data-i18n-aria');
    if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
  });

  const toggleBtn = document.getElementById('auth-lang-toggle');
  if (toggleBtn) toggleBtn.textContent = dict.langToggle;
  const appToggleLabel = document.getElementById('app-lang-toggle-label');
  if (appToggleLabel) appToggleLabel.textContent = dict.langToggle;

  localStorage.setItem('authLang', currentAppLang);

  // لو في تنبيهات أمان شغالة (كيل-سويتش/بث)، حدّث نصوصها بلغة جديدة فورًا
  if (typeof refreshSecurityBannersText === 'function') refreshSecurityBannersText();
}
document.getElementById('auth-lang-toggle').addEventListener('click', ()=>{
  applyAuthLanguage(currentAppLang === 'ar' ? 'tr' : 'ar');
});
document.getElementById('app-lang-toggle').addEventListener('click', ()=>{
  applyAuthLanguage(currentAppLang === 'ar' ? 'tr' : 'ar');
});
applyAuthLanguage(currentAppLang);

tabLogin.addEventListener('click', ()=>{
  tabLogin.classList.add('active'); tabSignup.classList.remove('active');
  loginForm.style.display='flex'; signupForm.style.display='none';
});
tabSignup.addEventListener('click', ()=>{
  tabSignup.classList.add('active'); tabLogin.classList.remove('active');
  signupForm.style.display='flex'; loginForm.style.display='none';
});

/* ============ SIGNUP ============ */
signupForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  signupError.textContent='';
  const name = document.getElementById('signup-name').value.trim();
  const gender = signupGenderInput.value === 'female' ? 'female' : 'male';
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn = signupForm.querySelector('.primary-btn');
  btn.disabled = true;
  try{
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name || email.split('@')[0] });
    await db.ref('users/'+cred.user.uid+'/profile').set({
      name: name || email.split('@')[0],
      gender,
      email,
      createdAt: Date.now()
    });
    // ── بنزوّد عداد المستخدمين المشترك (meta/usersCount) بمعاملة آمنة، عشان
    //    نصيب كل الناس من التوكن اليومي العام يتقسم تاني تلقائي على الكل ──
    db.ref('meta/usersCount').transaction(v => (v || 0) + 1).catch(()=>{});
    currentUserGender = gender;
    // onAuthStateChanged below handles the transition into the app.
  } catch(err){
    signupError.textContent = describeAuthError(err);
  } finally {
    btn.disabled = false;
  }
});

/* ============ LOGIN ============ */
loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  loginError.textContent='';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = loginForm.querySelector('.primary-btn');
  btn.disabled = true;
  try{
    await auth.signInWithEmailAndPassword(email, password);
  } catch(err){
    loginError.textContent = describeAuthError(err);
  } finally {
    btn.disabled = false;
  }
});

function describeAuthError(err){
  const dict = AUTH_I18N[currentAuthLang].errors;
  return dict[err.code] || dict.default;
}

/* ============ رصيد التوكن اليومي: توكن عام لكل التطبيق، بيتقسم بالتساوي على كل المستخدمين ============
   مفيش "ساعتين" ولا أي حد بالوقت خالص. فيه رصيد توكن يومي عام واحد (GLOBAL_DAILY_TOKEN_BUDGET
   كافتراضي، وقابل للتعديل من نفس مكان إعدادات فلك: system/ai_settings → dailyTokenBudget من
   غير ما نلمس كود)، وده بيتقسم بالتساوي على عدد المستخدمين المسجّلين (meta/usersCount في
   Realtime DB، بيتزوّد أوتوماتيك مع كل حساب جديد) — فكل مستخدم له "نصيب" ديناميكي، ولو
   انضم حد جديد النصيب ده بيتقسم تاني على الكل تلقائي. الاستهلاك الفعلي بيتسجل بعد كل رد
   حقيقي من الذكاء الاصطناعي بعدد التوكينز الحقيقي اللي الرد ده استهلكه (مش عداد وقت)،
   وبيتخزن تحت تاريخ اليوم زي القديم بالظبط عشان يرجع صفر لوحده كل يوم جديد. */
const DEFAULT_DAILY_TOKEN_BUDGET = 500000; // رقم احتياطي لو معندناش قيمة متظبطة من فلك
let globalDailyTokenBudget = DEFAULT_DAILY_TOKEN_BUDGET;
let totalUsersCount = 1;
let usageUsedTokens = 0;
let usageDayKey = null;
let usageLoaded = false;

db.ref('meta/usersCount').on('value', snap=>{
  totalUsersCount = Math.max(1, snap.val() || 1);
  updateUsageWindowUI();
});

function usageTodayKey(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function loadUsageForToday(){
  if (!currentUser) return;
  const key = usageTodayKey();
  usageDayKey = key;
  usageLoaded = false;
  db.ref('users/'+currentUser.uid+'/usage/'+key+'/tokensUsed').once('value')
    .then(snap=>{ usageUsedTokens = snap.val() || 0; usageLoaded = true; updateUsageWindowUI(); })
    .catch(()=>{ usageUsedTokens = 0; usageLoaded = true; updateUsageWindowUI(); });
}
function syncUsageToFirebase(){
  if (!currentUser || !usageDayKey) return;
  db.ref('users/'+currentUser.uid+'/usage/'+usageDayKey+'/tokensUsed').set(usageUsedTokens).catch(()=>{});
}
function formatTokenCount(n){ return Math.max(0, Math.round(n||0)).toLocaleString('en-US'); }
function usageShareTokens(){ return Math.max(1, Math.floor(globalDailyTokenBudget / totalUsersCount)); }
function usageRemainingTokens(){ return Math.max(0, usageShareTokens() - usageUsedTokens); }
function usageIsLocked(){ return !!currentUser && usageLoaded && usageRemainingTokens() <= 0; }
// بتتنادى بعد كل رد حقيقي من الذكاء الاصطناعي بعدد التوكينز اللي الرد ده استهلكها فعليًا
function addTokensUsed(n){
  if (!currentUser || !n || n <= 0) return;
  const key = usageTodayKey();
  if (key !== usageDayKey){ usageDayKey = key; usageUsedTokens = 0; } // يوم جديد = رصيد جديد
  usageUsedTokens += n;
  syncUsageToFirebase();
  updateUsageWindowUI();
}
function updateUsageWindowUI(){
  const bar = document.getElementById('usage-window-bar');
  if (!bar) return;
  const fill = document.getElementById('usage-window-fill');
  const label = document.getElementById('usage-window-label');
  const lockBanner = document.getElementById('usage-lock-banner');
  const lockText = document.getElementById('usage-lock-text');
  if (!currentUser || !usageLoaded){
    bar.classList.remove('locked');
    fill.style.width = '100%';
    label.textContent = formatTokenCount(usageShareTokens());
    lockBanner.style.display = 'none';
    return;
  }
  // ── لو الجهاز ده معروف إنه "حرق" توكناته قبل كده على حساب تاني (نفس بصمة
  //    الجهاز)، بنقفل الرصيد فورًا على أي حساب جديد يتسجّل بنفس الجهاز، بغض
  //    النظر إن الحساب ده لسه صفر — عشان يمنع الالتفاف على النظام بعمل حساب
  //    جديد كل ما رصيد القديم يخلص ──
  if (typeof deviceBlockedForThisAccount !== 'undefined' && deviceBlockedForThisAccount){
    bar.classList.add('locked');
    fill.style.width = '0%';
    label.textContent = '0';
    bar.title = 'التوكنات خلصت على الجهاز ده';
    lockText.textContent = 'التوكنات بتاعت الجهاز ده خلصت النهارده — عمل حساب جديد مش بيرجّع الرصيد.';
    lockBanner.style.display = 'flex';
    composerInput.disabled = true; sendBtn.disabled = true; attachBtn.disabled = true;
    return;
  }
  const share = usageShareTokens();
  const remaining = usageRemainingTokens();
  const pct = Math.max(0, Math.min(100, (remaining/share)*100));
  fill.style.width = pct + '%';
  label.textContent = formatTokenCount(remaining);
  if (remaining <= 0){
    bar.classList.add('locked');
    bar.title = 'التوكن بتاعك خلص النهارده';
    lockText.textContent = 'التوكن بتاعك خلص النهارده — هيرجع تاني بكرة.';
    lockBanner.style.display = 'flex';
    composerInput.disabled = true; sendBtn.disabled = true; attachBtn.disabled = true;
    markDeviceTokensExhausted(); // نسجّل على مستوى الجهاز إن الرصيد خلص، مش بس على الحساب
  } else {
    bar.classList.remove('locked');
    bar.title = 'متبقي ' + formatTokenCount(remaining) + ' توكن من نصيبك النهارده (' + formatTokenCount(share) + ')';
    lockBanner.style.display = 'none';
    composerInput.disabled = false; sendBtn.disabled = false; attachBtn.disabled = false;
  }
}
window.addEventListener('beforeunload', syncUsageToFirebase);
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='hidden') syncUsageToFirebase(); });

/* ============ ACTIVITY LOG — سجل نشاط المستخدم (يظهر في لوحة بياناته
   بعد الدخول من زرار الدرع). كل سطر مربوط بحسابه بس عن طريق قواعد أمان
   الـ Realtime Database (users/$uid قابل للقراءة/الكتابة لصاحبه فقط). ============ */
function logActivity(action, extra){
  const user = currentUser;
  if (!user) return;
  const entry = Object.assign({ action: action, at: Date.now() }, extra || {});
  db.ref('users/'+user.uid+'/activityLog').push(entry).catch(()=>{});
}

logoutBtn.addEventListener('click', ()=>{
  logActivity('logout');
  auth.signOut();
});

/* ============ AUTH STATE ============ */
auth.onAuthStateChanged(user=>{
  if (window.__markBootOk) window.__markBootOk(); // وصلنا هنا بنجاح = مفيش داعي لرسالة الخطأ بعد كده
  loadingScreen.classList.add('fade-out');
  setTimeout(()=>{ loadingScreen.style.display='none'; }, 450);
  if(user){
    currentUser = user;
    userNameLabel.textContent = user.displayName || user.email;
    authScreen.style.display='none';
    appShell.style.display='flex';
    db.ref('users/'+user.uid+'/profile/gender').once('value')
      .then(snap=>{ currentUserGender = snap.val() || null; })
      .catch(()=>{ currentUserGender = null; });
    loadUsageForToday();
    listenToConversations();
    refreshGeoContext(); // بيجيب الموقع/مواعيد الصلاة/القبلة في الخلفية، من غير ما يعطل حاجة
    enforceBiometricGate(); // بوابة البصمة البيومترية: حسابات جديدة وقديمة على السواء
    logActivity('login');
  } else {
    currentUser = null;
    currentUserGender = null;
    usageUsedTokens = 0; usageDayKey = null; usageLoaded = false;
    currentConvId = null;
    deviceBlockedForThisAccount = false;
    closeBiometricModal();
    if(conversationsRef) conversationsRef.off();
    authScreen.style.display='flex';
    appShell.style.display='none';
  }
});

/* ============ SECURITY MODAL — صفحة الأمان، لوحة البيانات، والإبلاغ الطارئ ============ */
const securityModal = document.getElementById('security-modal');
const securityViewInfo = document.getElementById('security-view-info');
const securityViewConfirm = document.getElementById('security-view-confirm');
const securityViewDashboard = document.getElementById('security-view-dashboard');
const activityLogList = document.getElementById('activity-log-list');
const broadcastBanner = document.getElementById('security-broadcast-banner');
const broadcastText = document.getElementById('security-broadcast-text');

function showSecurityView(view){
  [securityViewInfo, securityViewConfirm, securityViewDashboard].forEach(v=> v.classList.remove('active'));
  if (view === 'confirm') securityViewConfirm.classList.add('active');
  else if (view === 'dashboard') securityViewDashboard.classList.add('active');
  else securityViewInfo.classList.add('active');
}
function openSecurityModal(){
  showSecurityView('info');
  securityModal.classList.add('open');
}
function closeSecurityModal(){
  securityModal.classList.remove('open');
}
['security-shield-btn-auth','security-shield-btn-header'].forEach(id=>{
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', openSecurityModal);
});
document.getElementById('security-close-btn').addEventListener('click', closeSecurityModal);
securityModal.addEventListener('click', (e)=>{ if (e.target === securityModal) closeSecurityModal(); });

function loadActivityDashboard(){
  if (!currentUser){
    activityLogList.innerHTML = '<p class="activity-empty">'+t('secLoginRequired')+'</p>';
    return;
  }
  activityLogList.innerHTML = '<p class="activity-loading">…</p>';
  db.ref('users/'+currentUser.uid+'/activityLog').orderByChild('at').limitToLast(60).once('value')
    .then(snap=>{
      const items = [];
      snap.forEach(ch=>{ items.push(ch.val()); });
      items.reverse();
      if (!items.length){
        activityLogList.innerHTML = '<p class="activity-empty">'+t('secDashboardEmpty')+'</p>';
        return;
      }
      const labels = (APP_I18N[currentAppLang] || APP_I18N.ar).activityLabels || {};
      activityLogList.innerHTML = '';
      items.forEach(it=>{
        const row = document.createElement('div');
        row.className = 'activity-row';
        const label = labels[it.action] || it.action || '—';
        const d = new Date(it.at || 0);
        const timeStr = isNaN(d.getTime()) ? '' : d.toLocaleString(currentAppLang==='tr' ? 'tr-TR' : 'ar-EG');
        const actionSpan = document.createElement('span');
        actionSpan.className = 'activity-action';
        actionSpan.textContent = label;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'activity-time';
        timeSpan.textContent = timeStr;
        row.appendChild(actionSpan);
        row.appendChild(timeSpan);
        activityLogList.appendChild(row);
      });
    })
    .catch(()=>{ activityLogList.innerHTML = '<p class="activity-empty">'+t('secReportError')+'</p>'; });
}
document.getElementById('open-dashboard-btn').addEventListener('click', ()=>{
  showSecurityView('dashboard');
  loadActivityDashboard();
});
document.getElementById('dashboard-back-btn').addEventListener('click', ()=> showSecurityView('info'));

/* ============ EMERGENCY REPORT (كيل-سويتش) ============
   كل مستخدم مسموحله ببلاغ واحد نشط بس في نفس الوقت (مفتاح الكتابة uid ثابت)،
   عشان يمنع سبام/إساءة استخدام الزرار من نفس الحساب. البلاغ بيفعّل علَم
   security/aiPause اللي بيتقرا من الـ Cloud Function (index.js) قبل أي طلب
   ذكاء اصطناعي، وبيفعّل كمان security/broadcast اللي كل المستخدمين المتصلين
   شايفينه لايف عن طريق .on('value'). */
document.getElementById('emergency-report-btn').addEventListener('click', ()=> showSecurityView('confirm'));
document.getElementById('emergency-confirm-no').addEventListener('click', ()=> showSecurityView('info'));
document.getElementById('emergency-confirm-yes').addEventListener('click', async ()=>{
  const btn = document.getElementById('emergency-confirm-yes');
  if (!currentUser){ closeSecurityModal(); return; }
  btn.disabled = true;
  try{
    const myReportRef = securityReportsRef.child(currentUser.uid);
    const existing = await myReportRef.once('value');
    if (existing.exists()){
      showToast(t('secAlreadyReported'), 'info');
      showSecurityView('info');
      btn.disabled = false;
      return;
    }
    const now = Date.now();
    const until = now + 24*60*60*1000;
    await myReportRef.set({ at: now, uid: currentUser.uid });
    await securityAiPauseRef.set({ active: true, since: now, until: until, reportedBy: currentUser.uid });
    await securityBroadcastRef.set({ active: true, since: now, until: until });
    logActivity('emergency_report');
    showSecurityView('info');
    closeSecurityModal();
  }catch(err){
    console.error('emergency report error', err);
    showToast(t('secReportError'), 'error');
  }
  btn.disabled = false;
});

/* ============ WATCHERS — بث حي لكل المستخدمين المتصلين (شغالة من غير
   الحاجة لتسجيل دخول، عشان أي حد فاتح التطبيق يشوف التنبيه فورًا) ============ */
function refreshSecurityBannersText(){
  // بندوّر على العناصر بنفسها (مش من متغيرات const برّانية) عشان الدالة دي
  // ممكن تتنادى بدري (من applyAuthLanguage وقت تحميل السكربت) قبل ما
  // broadcastBanner/broadcastText يتعرّفوا لسه — التوصيل المباشر بيرمي
  // "Cannot access before initialization" (TDZ).
  const bb = document.getElementById('security-broadcast-banner');
  const bt = document.getElementById('security-broadcast-text');
  if (bb && bt && bb.style.display === 'flex') bt.textContent = t('secBroadcastMsg');
  if (window.__aiPaused){
    const lockText = document.getElementById('usage-lock-text');
    if (lockText) lockText.textContent = t('secAiPausedMsg');
  }
}
securityBroadcastRef.on('value', snap=>{
  const val = snap.val();
  const active = !!(val && val.active && (!val.until || val.until > Date.now()));
  if (active){
    broadcastText.textContent = t('secBroadcastMsg');
    broadcastBanner.style.display = 'flex';
  } else {
    broadcastBanner.style.display = 'none';
  }
});
securityAiPauseRef.on('value', snap=>{
  const val = snap.val();
  const active = !!(val && val.active && (!val.until || val.until > Date.now()));
  window.__aiPaused = active;
  document.querySelectorAll('.shield-btn').forEach(b=> b.classList.toggle('paused', active));
  if (active){
    const lockBanner = document.getElementById('usage-lock-banner');
    const lockText = document.getElementById('usage-lock-text');
    if (lockBanner && lockText){
      lockText.textContent = t('secAiPausedMsg');
      lockBanner.style.display = 'flex';
    }
    if (typeof composerInput !== 'undefined') composerInput.disabled = true;
    if (typeof sendBtn !== 'undefined') sendBtn.disabled = true;
  } else if (typeof updateUsageWindowUI === 'function' && currentUser){
    updateUsageWindowUI();
  }
});

/* ============ CONVERSATIONS ============ */
let conversationsCache = {};

function listenToConversations(){
  conversationsRef = db.ref('users/'+currentUser.uid+'/conversations');
  conversationsRef.on('value', snap=>{
    const data = snap.val() || {};
    conversationsCache = data;
    renderConversationList(data);
    const ids = Object.keys(data);
    if(!currentConvId && ids.length){
      openConversation(ids[ids.length-1]);
    } else if(!ids.length){
      startNewConversation();
    }
    applyPendingSharedTextIfAny();
  });
}

function renderConversationList(data){
  conversationList.innerHTML='';
  const entries = Object.entries(data).sort((a,b)=> (b[1].updatedAt||0)-(a[1].updatedAt||0));
  for(const [id, conv] of entries){
    const title = conv.title || 'محادثة جديدة';
    const item = document.createElement('div');
    item.className = 'conv-item' + (id===currentConvId ? ' active' : '');
    item.dataset.convId = id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'conv-item-title';
    titleSpan.textContent = title;
    item.appendChild(titleSpan);

    const kebabBtn = document.createElement('button');
    kebabBtn.type = 'button';
    kebabBtn.className = 'conv-kebab';
    kebabBtn.setAttribute('aria-label', 'خيارات المحادثة');
    kebabBtn.innerHTML = '<i class="fas fa-ellipsis-vertical"></i>';
    kebabBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openContextMenu(id, (conversationsCache[id]||{}).title || 'محادثة جديدة', kebabBtn.getBoundingClientRect());
    });
    item.appendChild(kebabBtn);

    attachConvItemGestures(item, id);
    conversationList.appendChild(item);
  }
}

/* ============ LONG-PRESS / RIGHT-CLICK ON A CONVERSATION ITEM ============
   لمسة عادية = فتح المحادثة. ضغطة مطوّلة (أو زر يمين على الديسكتوب أو ضغط
   أيقونة الثلاث نقط) = تفتح قائمة صغيرة فيها "تعديل الاسم" و"حذف المحادثة". */
function attachConvItemGestures(item, id){
  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 10;
  let timer = null, startX = 0, startY = 0, longPressed = false;

  function clearTimer(){ if(timer){ clearTimeout(timer); timer = null; } }
  function getTitle(){ return (conversationsCache[id]||{}).title || 'محادثة جديدة'; }

  item.addEventListener('touchstart', (e)=>{
    const t = e.touches && e.touches[0];
    if(!t) return;
    longPressed = false;
    startX = t.clientX; startY = t.clientY;
    clearTimer();
    item.classList.add('pressing');
    timer = setTimeout(()=>{
      longPressed = true;
      item.classList.remove('pressing');
      if(navigator.vibrate) navigator.vibrate(12);
      openContextMenu(id, getTitle(), item.getBoundingClientRect());
    }, LONG_PRESS_MS);
  }, {passive:true});

  item.addEventListener('touchmove', (e)=>{
    const t = e.touches && e.touches[0];
    if(!t) return;
    if(Math.abs(t.clientX-startX) > MOVE_TOLERANCE || Math.abs(t.clientY-startY) > MOVE_TOLERANCE){
      clearTimer();
      item.classList.remove('pressing');
    }
  }, {passive:true});

  item.addEventListener('touchend', ()=>{ clearTimer(); item.classList.remove('pressing'); });
  item.addEventListener('touchcancel', ()=>{ clearTimer(); item.classList.remove('pressing'); });

  item.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    openContextMenu(id, getTitle(), { left:e.clientX, top:e.clientY, right:e.clientX, bottom:e.clientY });
  });

  item.addEventListener('click', ()=>{
    if(longPressed){ longPressed = false; return; }
    openConversation(id);
  });
}

/* ============ CONTEXT MENU (تعديل الاسم / حذف) ============ */
function openContextMenu(id, title, anchorRect){
  contextMenu.innerHTML =
    '<button type="button" class="context-menu-item" data-action="rename"><i class="fas fa-pen"></i><span>تعديل اسم المحادثة</span></button>'+
    '<div class="context-menu-divider"></div>'+
    '<button type="button" class="context-menu-item danger" data-action="delete"><i class="fas fa-trash-can"></i><span>حذف المحادثة</span></button>';

  contextMenu.querySelector('[data-action="rename"]').addEventListener('click', ()=>{
    closeContextMenu();
    openRenameModal(id, title);
  });
  contextMenu.querySelector('[data-action="delete"]').addEventListener('click', ()=>{
    closeContextMenu();
    openDeleteModal(id, title);
  });

  contextMenu.style.display = 'block';
  contextMenuBackdrop.style.display = 'block';

  requestAnimationFrame(()=>{
    const mw = contextMenu.offsetWidth || 210;
    const mh = contextMenu.offsetHeight || 96;
    let left = anchorRect.left;
    let top = (anchorRect.bottom||anchorRect.top) + 6;
    if(left + mw > window.innerWidth - 10) left = window.innerWidth - mw - 10;
    if(left < 10) left = 10;
    if(top + mh > window.innerHeight - 10) top = anchorRect.top - mh - 6;
    if(top < 10) top = 10;
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
  });
}
function closeContextMenu(){
  contextMenu.style.display = 'none';
  contextMenuBackdrop.style.display = 'none';
}
contextMenuBackdrop.addEventListener('click', closeContextMenu);

/* ============ RENAME MODAL ============ */
let renameConvId = null;
function openRenameModal(id, title){
  renameConvId = id;
  renameInput.value = title;
  renameModal.classList.add('open');
  setTimeout(()=>{ renameInput.focus(); renameInput.select(); }, 60);
}
function closeRenameModal(){
  renameModal.classList.remove('open');
  renameConvId = null;
}
renameCancelBtn.addEventListener('click', closeRenameModal);
renameModal.addEventListener('click', (e)=>{ if(e.target === renameModal) closeRenameModal(); });
renameForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = renameConvId;
  const newTitle = renameInput.value.trim();
  closeRenameModal();
  if(!id || !newTitle) return;
  try{
    await db.ref('users/'+currentUser.uid+'/conversations/'+id).update({ title:newTitle });
    if(id === currentConvId) conversationTitle.textContent = newTitle;
  } catch(err){
    console.error('rename err', err);
    alert('معلش، مقدرتش أعدّل اسم المحادثة.');
  }
});

/* ============ DELETE MODAL ============ */
let deleteConvId = null;
function openDeleteModal(id, title){
  deleteConvId = id;
  deleteModalText.textContent = 'هتتحذف محادثة "'+title+'" والرسائل اللي فيها نهائيًا، ومش هينفع ترجّعها تاني.';
  deleteModal.classList.add('open');
}
function closeDeleteModal(){
  deleteModal.classList.remove('open');
  deleteConvId = null;
}
deleteCancelBtn.addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', (e)=>{ if(e.target === deleteModal) closeDeleteModal(); });
deleteConfirmBtn.addEventListener('click', async ()=>{
  const id = deleteConvId;
  if(!id) return;
  deleteConfirmBtn.disabled = true;
  try{
    await db.ref('users/'+currentUser.uid+'/conversations/'+id).remove();
    if(id === currentConvId){
      currentConvId = null;
      if(messagesRef) messagesRef.off();
      messagesEl.innerHTML = '';
      // مستمع listenToConversations هيفتح تاني محادثة موجودة، أو يبدأ واحدة جديدة لو مفيش حاجة باقية.
    }
  } catch(err){
    console.error('delete err', err);
    alert('معلش، مقدرتش أحذف المحادثة.');
  } finally {
    deleteConfirmBtn.disabled = false;
    closeDeleteModal();
  }
});

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    closeContextMenu();
    closeRenameModal();
    closeDeleteModal();
    // إغلاق أي نافذة كود مفتوحة كمان (دعم Esc للإغلاق زي المطلوب في الوصولية)
    document.querySelectorAll('.code-modal-overlay').forEach(el=>{
      const gid = el.getAttribute('data-gid');
      if (gid) closeCodeModal(gid);
    });
  }
  // Ctrl+Enter (أو Cmd+Enter على ماك) = إرسال الرسالة من أي مكان في التطبيق طول ما التركيز داخل صندوق الكتابة
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === composerInput){
    e.preventDefault();
    composer.requestSubmit ? composer.requestSubmit() : composer.dispatchEvent(new Event('submit', {cancelable:true}));
  }
});

function startNewConversation(){
  const ref = db.ref('users/'+currentUser.uid+'/conversations').push();
  ref.set({ title:'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now() });
  openConversation(ref.key);
}
newChatBtn.addEventListener('click', startNewConversation);

// ── Virtual Scrolling / تقسيم الرسائل (Pagination) لتخفيف عبء الـ DOM في
//    المحادثات الطويلة: أول ما نفتح محادثة، منحمّلش كل الرسائل التاريخية —
//    بنحمّل بس آخر MESSAGES_PAGE_SIZE رسالة، وبنسيب زرار "تحميل رسائل أقدم"
//    فوق يجيب دفعة زيادة عند الطلب (أو لو المستخدم سكرول لفوق) بدل ما الشاشة
//    كلها تتحمّل بمحتواها من أول رسالة اتبعتت في المحادثة ──
const MESSAGES_PAGE_SIZE = 40;
let oldestLoadedMsgKey = null;
let newestLoadedMsgKey = null;
let allOlderMessagesLoaded = false;
let loadOlderBtn = null;

function ensureLoadOlderBtn(){
  if (loadOlderBtn && loadOlderBtn.isConnected) return loadOlderBtn;
  loadOlderBtn = document.createElement('button');
  loadOlderBtn.type = 'button';
  loadOlderBtn.className = 'load-older-messages-btn';
  loadOlderBtn.innerHTML = '<i class="fas fa-clock-rotate-left"></i><span>تحميل رسائل أقدم</span>';
  loadOlderBtn.addEventListener('click', loadOlderMessages);
  messagesEl.insertBefore(loadOlderBtn, messagesEl.firstChild);
  return loadOlderBtn;
}

async function loadOlderMessages(){
  if (allOlderMessagesLoaded || !oldestLoadedMsgKey || !currentConvId) return;
  const btn = ensureLoadOlderBtn();
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>بيحمّل...</span>';
  try{
    const ref = db.ref('users/'+currentUser.uid+'/conversations/'+currentConvId+'/messages');
    const snap = await ref.orderByKey().endBefore(oldestLoadedMsgKey).limitToLast(MESSAGES_PAGE_SIZE).once('value');
    const data = snap.val() || {};
    const keys = Object.keys(data);
    if (!keys.length){
      allOlderMessagesLoaded = true;
      btn.remove();
      return;
    }
    // بنحافظ على مكان السكرول عشان الشاشة متقفزش لحظة ما نضيف رسائل فوق ──
    const prevScrollHeight = messagesEl.scrollHeight;
    const prevScrollTop = messagesEl.scrollTop;
    keys.forEach(k=> appendMessageBubble(data[k], { prepend:true, skipScroll:true }));
    oldestLoadedMsgKey = keys[0];
    messagesEl.scrollTop = prevScrollTop + (messagesEl.scrollHeight - prevScrollHeight);
    if (keys.length < MESSAGES_PAGE_SIZE){ allOlderMessagesLoaded = true; btn.remove(); }
    else { btn.disabled = false; btn.innerHTML = originalHtml; }
  } catch(e){
    console.warn('loadOlderMessages failed', e);
    btn.disabled = false; btn.innerHTML = originalHtml;
    showToast('⚠️ مقدرتش أحمّل رسائل أقدم', 'network');
  }
}

let messagesRef = null;
function openConversation(convId){
  if(messagesRef) messagesRef.off();
  currentConvId = convId;
  conversationTitle.textContent = (conversationsCache[convId] && conversationsCache[convId].title) || 'محادثة جديدة';
  messagesEl.innerHTML='';
  oldestLoadedMsgKey = null; newestLoadedMsgKey = null; allOlderMessagesLoaded = false; loadOlderBtn = null;

  const convMessagesRef = db.ref('users/'+currentUser.uid+'/conversations/'+convId+'/messages');
  messagesRef = convMessagesRef;

  // ── أول تحميل: آخر MESSAGES_PAGE_SIZE رسالة بس (مش كل تاريخ المحادثة) ──
  convMessagesRef.orderByKey().limitToLast(MESSAGES_PAGE_SIZE).once('value').then(snap=>{
    if (currentConvId !== convId) return; // المستخدم فتح محادثة تانية قبل ما الطلب يخلص
    const data = snap.val() || {};
    const keys = Object.keys(data);
    keys.forEach(k=> appendMessageBubble(data[k], { skipScroll:true }));
    if (keys.length){
      oldestLoadedMsgKey = keys[0];
      newestLoadedMsgKey = keys[keys.length-1];
    }
    if (keys.length < MESSAGES_PAGE_SIZE) allOlderMessagesLoaded = true;
    else ensureLoadOlderBtn();
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // ── من هنا وبعدين: بث حي بس للرسائل الجديدة اللي بتتضاف فعليًا بعد آخر
    //    رسالة حمّلناها، عشان مانكررش نفس الرسائل القديمة تاني ──
    let startAfterKey = newestLoadedMsgKey;
    const liveQuery = startAfterKey ? convMessagesRef.orderByKey().startAfter(startAfterKey) : convMessagesRef;
    liveQuery.on('child_added', liveSnap=>{
      const msg = liveSnap.val();
      if (msg && msg.ts && window.__locallyRendered && window.__locallyRendered.has(msg.ts)){
        window.__locallyRendered.delete(msg.ts);
        return;
      }
      appendMessageBubble(msg);
    });
    messagesRef = liveQuery; // عشان .off() في الفتح الجاي يقفل نفس الاستماع الصح
  });

  document.querySelectorAll('.conv-item').forEach(el=> el.classList.toggle('active', el.dataset.convId === convId));
  if(window.innerWidth <= 760) sidebar.classList.add('collapsed');
}

/* ============ MESSAGES UI ============ */
function formatTime(ts){
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── نفس فكرة formatAIAnswer بتاع فلك: تلوين مخصص، كتل كود، خطوط عريضة، عناوين،
//    صفوف جداول (بما إن مفيش عارض جداول حقيقي، بنحولها لسطر بنقط فاصلة زي فلك بالظبط) ──
// ── لوحة ألوان متناسقة مع خلفية التطبيق الغامقة الدافية (--bg:#1b1a17) — الذكاء
//    بيختار من الأسماء دي بس، مش أي لون خام، عشان يفضل الشكل موحّد وحلو دايمًا.
//    الأسماء القديمة (red/green/blue...) لسه متدعّمة عشان الرسائل المخزّنة قبل كده. ──
var STYLE_COLOR_PALETTE = {
  gold:'#d8a34c', amber:'#e8b768', coral:'#e0916d', rose:'#d98a8f',
  sage:'#9cb88a', mint:'#7fc4ad', sky:'#7fa8d0', lavender:'#b29bd6',
  sand:'#c9b28a', slate:'#9aa3b0',
  red:'#d98a8f', green:'#9cb88a', blue:'#7fa8d0', yellow:'#e8b768',
  orange:'#e0916d', purple:'#b29bd6', pink:'#d9a0ae', cyan:'#7fc4ad', teal:'#6fae9c'
};
function styleHexToRgba(hex, alpha){
  var h = hex.replace('#','');
  var r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

function formatAnswer(raw){
  if (!raw) return '';
  var s = String(raw);

  var styleBlocks = [];
  // ── بيتقبل الصيغة الجديدة [[fmt:خصائص]]...[[/fmt]] (لون + bold/italic/underline/strike/highlight)
  //    وكمان الصيغة القديمة [[color:اسم]]...[[/color]] للتوافق مع رسائل اتخزنت قبل كده —
  //    وبيتسامح مع مسافات زيادة جوه الأقواس (زي [[ /fmt ]] بدل [[/fmt]]) عشان لو النموذج
  //    كتبها بمسافة زيادة بالغلط، الرد يفضل يتنسّق صح بدل ما الأقواس تبان خام قدام المستخدم ──
  s = s.replace(/\[\[\s*(fmt|color)\s*:\s*([a-zA-Z, ]+?)\s*\]\]([\s\S]*?)\[\[\s*\/\s*\1\s*\]\]/g, function(m, tag, tokensRaw, inner){
    var tokens = tokensRaw.split(',').map(function(t){ return t.trim().toLowerCase(); }).filter(Boolean);
    var colorToken = tokens.filter(function(t){ return STYLE_COLOR_PALETTE[t]; })[0];
    var mods = {
      bold: tokens.indexOf('bold') > -1,
      italic: tokens.indexOf('italic') > -1,
      underline: tokens.indexOf('underline') > -1,
      strike: tokens.indexOf('strike') > -1,
      highlight: tokens.indexOf('highlight') > -1
    };
    var idx = styleBlocks.length;
    styleBlocks.push({ hex: colorToken ? STYLE_COLOR_PALETTE[colorToken] : null, mods: mods, text: inner });
    return '\u0000CL' + idx + '\u0000';
  });

  var codeBlocks = [];
  s = s.replace(/```([a-zA-Z0-9]*)\n?([\s\S]*?)```/g, function(m, lang, code){
    var idx = codeBlocks.length;
    codeBlocks.push({ lang: (lang||'').trim(), code: code.replace(/\n$/,'') });
    return '\u0000CB' + idx + '\u0000';
  });

  // ── روابط قابلة للضغط: بتتفتح في تاب جديد بالمتصفح مباشرة ──
  var linkBlocks = [];
  s = s.replace(/(https?:\/\/[^\s<>"')\u0000]+?)([.,;:!?]*)(?=\s|$)/g, function(m, url, trail){
    var idx = linkBlocks.length;
    linkBlocks.push(url);
    return '\u0000LK' + idx + '\u0000' + trail;
  });

  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  var lines = s.split('\n'), out = [];
  for (var i=0;i<lines.length;i++){
    var line = lines[i];
    if (/\u0000CB\d+\u0000/.test(line)) { out.push(line); continue; }
    var t = line.trim();
    if (/^[-=_]{3,}$/.test(t)) continue;
    if (/^\|?[\s:|-]{3,}\|?$/.test(t) && t.indexOf('-') > -1 && t.indexOf('|') > -1) continue;
    var hMatch = t.match(/^#{1,6}\s*(.+)$/);
    if (hMatch) { out.push('<b>' + hMatch[1].trim() + '</b>'); continue; }
    if (t.indexOf('|') > -1 && t.indexOf('|') !== t.lastIndexOf('|')) {
      var cells = t.split('|').map(c=>c.trim()).filter(c=>c.length);
      if (cells.length) { out.push(cells.join('  •  ')); continue; }
    }
    line = line.replace(/^(\s*)[-*]\s+/, '$1• ');
    out.push(line);
  }
  s = out.join('\n');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.08);padding:.1rem .3rem;border-radius:4px;direction:ltr;display:inline-block;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap">$1</code>');
  s = s.replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>');

  for (var ci=0; ci<styleBlocks.length; ci++){
    var cb = styleBlocks[ci];
    var esc = cb.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    esc = esc.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    var hex = cb.hex || '#d8a34c';
    var styleParts = [];
    if (cb.mods.highlight){
      styleParts.push('background:'+styleHexToRgba(hex,0.16));
      styleParts.push('color:'+hex);
      styleParts.push('padding:.05rem .4rem');
      styleParts.push('border-radius:6px');
    } else if (cb.hex){
      styleParts.push('color:'+hex);
    }
    if (cb.mods.bold) styleParts.push('font-weight:700');
    if (cb.mods.italic) styleParts.push('font-style:italic');
    var decorations = [];
    if (cb.mods.underline) decorations.push('underline');
    if (cb.mods.strike) decorations.push('line-through');
    if (decorations.length) styleParts.push('text-decoration:'+decorations.join(' '));
    var styleAttr = styleParts.length ? ' style="'+styleParts.join(';')+'"' : '';
    s = s.split('\u0000CL' + ci + '\u0000').join('<span'+styleAttr+'>'+esc+'</span>');
  }

  for (var bi=0; bi<codeBlocks.length; bi++){
    var blk = codeBlocks[bi];
    var cardHtml = isSmallSnippet(blk.code) ? buildCodeSnippetCard(blk.lang, blk.code) : buildCodeFileCard(blk.lang, blk.code);
    s = s.split('\u0000CB' + bi + '\u0000').join(cardHtml);
  }

  for (var lki=0; lki<linkBlocks.length; lki++){
    var url = linkBlocks[lki];
    var safeHref = url.replace(/"/g,'%22');
    s = s.split('\u0000LK' + lki + '\u0000').join('<a class="msg-link" href="'+safeHref+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(url)+'</a>');
  }

  return s;
}

// ── سطر تنبيه بسيط بيتحط بس تحت آخر رد من الذكاء الاصطناعي (مش تحت كل
//    رد)، زي أي نموذج كبير (كلود، شات جي بي تي...) بيوضّح إن الرد ممكن
//    يكون فيه غلط. لما رد جديد يوصل، بنشيل السطر ده من الرد اللي قبله
//    ونحطه بس تحت الجديد ──
function buildAiDisclaimer(){
  const note = document.createElement('div');
  note.className = 'ai-disclaimer';
  note.textContent = AI_DISPLAY_NAME + ' ممكن يخطئ. تأكد من المعلومات المهمة.';
  return note;
}
function clearAiDisclaimers(){
  messagesEl.querySelectorAll('.ai-disclaimer').forEach(el => el.remove());
}

// ── نفس شريط فلك بالظبط: نسخ / 👎 / 👍 — بيغذي غرفة 3 (الذاكرة الدائمة) ──
function buildActionBar(questionText, answerText){
  const bar = document.createElement('div');
  bar.className = 'cosmos-action-bar';

  function mkBtn(icon, title, handler){
    const b = document.createElement('button');
    b.className = 'cosmos-action-btn';
    b.type = 'button';
    b.title = title;
    b.innerHTML = '<i class="'+icon+'"></i>';
    b.addEventListener('click', (e)=>{ e.stopPropagation(); handler(b); });
    return b;
  }

  bar.appendChild(mkBtn('fas fa-copy', 'نسخ', (btn)=>{
    navigator.clipboard && navigator.clipboard.writeText(answerText).then(()=>{
      btn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(()=>{ btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1200);
    });
  }));
  bar.appendChild(mkBtn('fas fa-thumbs-down', 'مش مفيد', (btn)=>{
    const wasActive = btn.classList.contains('disliked');
    bar.querySelectorAll('.cosmos-action-btn').forEach(x=>x.classList.remove('liked','disliked'));
    if(!wasActive){
      btn.classList.add('disliked');
      submitAIFeedback(false, questionText, answerText);
    }
  }));
  bar.appendChild(mkBtn('fas fa-thumbs-up', 'مفيد', (btn)=>{
    const wasActive = btn.classList.contains('liked');
    bar.querySelectorAll('.cosmos-action-btn').forEach(x=>x.classList.remove('liked','disliked'));
    if(!wasActive){
      btn.classList.add('liked');
      submitAIFeedback(true, questionText, answerText);
    }
  }));
  bar.appendChild(mkBtn('fas fa-volume-high', 'قراءة صوتية', (btn)=>{
    speakText(answerText, btn);
  }));

  // ── إعادة الإرسال: بتحط نفس السؤال في صندوق الكتابة وتبعته تاني، عشان
  //    المستخدم يقدر ياخد رد جديد على نفس السؤال من غير ما يكتبه تاني ──
  bar.appendChild(mkBtn('fas fa-rotate-right', 'إعادة الإرسال', (btn)=>{
    if (!questionText){
      showToast('⚠️ مفيش سؤال محفوظ لإعادة إرساله', 'unsupported');
      return;
    }
    if (sendBtn.classList.contains('sending')){
      showToast('⏳ استنى الرد الحالي يخلص الأول', 'info');
      return;
    }
    composerInput.value = questionText;
    composerInput.style.height = 'auto';
    composerInput.style.height = Math.min(140, composerInput.scrollHeight) + 'px';
    if (typeof composer.requestSubmit === 'function') composer.requestSubmit();
    else composer.dispatchEvent(new Event('submit', { cancelable: true }));
  }));

  // ── مشاركة: بتفتح شاشة المشاركة الأصلية بتاعة الجهاز (لو متاحة) عشان
  //    المستخدم يقدر يبعت السؤال والرد لأي تطبيق تاني زي واتساب، أو حتى
  //    يلزقهم في محادثة تانية مع ChatGPT/Gemini. لو الجهاز/المتصفح مش
  //    داعم شاشة المشاركة، بننسخهم للحافظة بدالها ──
  bar.appendChild(mkBtn('fas fa-share-nodes', 'مشاركة', (btn)=>{
    const shareText = (questionText ? ('السؤال:\n' + questionText + '\n\n') : '') + 'الإجابة:\n' + answerText;
    if (navigator.share){
      navigator.share({ text: shareText }).catch(()=>{ /* المستخدم لغى المشاركة، مفيش داعي لأي رسالة خطأ */ });
      return;
    }
    if (navigator.clipboard){
      navigator.clipboard.writeText(shareText).then(()=>{
        btn.innerHTML = '<i class="fas fa-check"></i>';
        showToast('✅ اتنسخت المحادثة، تقدر تلزقها في أي تطبيق تاني زي ChatGPT أو Gemini', 'success');
        setTimeout(()=>{ btn.innerHTML = '<i class="fas fa-share-nodes"></i>'; }, 1500);
      }).catch(()=>{
        showToast('⚠️ مقدرتش أنسخ أو أشارك النص', 'error');
      });
    }
  }));
  return bar;
}

// ── لو الرد فيه ملفين كود أو أكتر، نضيف زرار "تحميل الكل ZIP" تحت آخر عنصر في الرسالة ──
function maybeAddZipAllButton(wrap){
  if (!window.JSZip) return;
  const cards = wrap.querySelectorAll('.code-file-card[data-gid]');
  if (cards.length < 2) return;
  const gids = Array.from(cards).map(c => c.dataset.gid);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cosmos-zip-all-btn';
  btn.innerHTML = '<i class="fas fa-file-zipper"></i><span>تحميل كل الملفات ('+gids.length+') كـ ZIP</span>';
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>بيضغط...</span>';
    try{
      await loadScriptOnce(LIB_URLS.jszip);
      const zip = new JSZip();
      gids.forEach(gid=>{
        const code = window.__codeGroups[gid];
        const meta = (window.__codeMeta || {})[gid];
        if (code && meta) zip.file(meta.filename, code);
      });
      const blob = await zip.generateAsync({ type:'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'digital-mind-files.zip';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e){ console.error(e); showToast('❌ مقدرتش أضغط الملفات', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = originalHtml; }
  });
  wrap.appendChild(btn);
}

// ── صندوق "غرفة التفكير العميق" القابل للفتح — نفس تصميم فلك ──
function buildDeepThinkBox(reasoningText){
  const box = document.createElement('div');
  box.className = 'cosmos-deep-think';
  box.innerHTML =
    '<button type="button" class="cosmos-deep-think-toggle">'+
    '<i class="fas fa-brain"></i><span>غرفة التفكير العميق</span><i class="fas fa-chevron-down cosmos-deep-think-chevron"></i>'+
    '</button>'+
    '<div class="cosmos-deep-think-body"><div class="cosmos-deep-think-inner">'+escapeHtml(reasoningText)+'</div></div>';
  box.querySelector('.cosmos-deep-think-toggle').addEventListener('click', ()=> box.classList.toggle('open'));
  return box;
}

// ── أنيميشن الكتابة التدريجي الثابت — نفس فلك بالظبط: بيفكك الـ HTML الجاهز (منسّق، ملوّن،
//    فيه بطاقات كود) لعمليات "حرف / فتح تاج / قفل تاج" وبيعيد بناءه تدريجيًا بسرعة هادية وثابتة،
//    من غير ما يعتمد على سرعة الشبكة. بطاقة الكود بتتحط دفعة واحدة جوه مكانها، مش حرف حرف ──
function typewriterReveal(container, html, onDone){
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const ops = [];
  (function walk(node){
    const kids = node.childNodes;
    for (let i=0;i<kids.length;i++){
      const child = kids[i];
      if (child.nodeType === 3){
        const t = child.nodeValue;
        for (let c=0;c<t.length;c++) ops.push({ type:'char', ch:t[c] });
      } else if (child.nodeType === 1){
        if (child.classList && child.classList.contains('code-file-card')){
          ops.push({ type:'block', node: child.cloneNode(true) });
        } else {
          ops.push({ type:'open', tag: child.tagName.toLowerCase(), attrs: child.attributes });
          walk(child);
          ops.push({ type:'close' });
        }
      }
    }
  })(temp);

  container.innerHTML = '';
  const caret = document.createElement('span');
  caret.className = 'cosmos-stream-cursor';
  caret.textContent = '▍';
  container.appendChild(caret);

  const stack = [container];
  let idx = 0;
  function tick(){
    try{
      let n = 3;
      while (n-- > 0 && idx < ops.length){
        const op = ops[idx++];
        const top = stack[stack.length-1];
        if (op.type === 'char'){
          if (top.lastChild && top.lastChild.nodeType === 3) top.lastChild.nodeValue += op.ch;
          else top.insertBefore(document.createTextNode(op.ch), top===container?caret:null);
        } else if (op.type === 'open'){
          const el = document.createElement(op.tag);
          if (op.attrs) for (let a=0;a<op.attrs.length;a++) el.setAttribute(op.attrs[a].name, op.attrs[a].value);
          top.insertBefore(el, top===container?caret:null);
          stack.push(el);
        } else if (op.type === 'block'){
          top.insertBefore(op.node, top===container?caret:null);
          if (window.hljs) op.node.querySelectorAll('pre code').forEach(el=>{ try{ window.hljs.highlightElement(el); }catch(e){} });
        } else {
          stack.pop();
        }
      }
    } catch(tickErr){
      // ── دي بتشتغل جوه setTimeout، فمفيش try/catch بره يقدر يمسكها — لو
      //    سبناها كده هتقف الأنيميشن في نص الطريق للأبد. بدل كده، بنقفلها
      //    فورًا ونعتبر الرسالة خلصت ──
      console.error('typewriterReveal: توقف نص الطريق، هنكمّل من غير أنيميشن', tickErr);
      caret.remove();
      if (onDone) onDone();
      return;
    }
    smartFollowScroll();
    if (idx < ops.length) setTimeout(tick, 10);
    else { caret.remove(); if (onDone) onDone(); }
  }
  tick();
}

// ── بتحوّل صندوق "بيفكر/بيتكتب حي" لنفس الرسالة النهائية، وتعمل عليها أنيميشن الكتابة
//    التدريجي فوق النص المنسّق والملوّن الكامل (مش النص الخام) — دي الخطوة اللي كانت ناقصة ──
function renderFinalAssistantMessage(wrap, msg){
  wrap.classList.remove('thinking-full'); // الرد النهائي يرجع لعرض الرسائل العادي، الاتساع Edge-to-edge لمرحلة التفكير بس
  wrap.querySelector('.thinking-steps')?.remove();
  wrap.querySelector('.cosmos-deep-think-live')?.remove();
  wrap.querySelector('.code-building-row')?.remove();
  wrap.querySelector('.cosmos-live-stream')?.remove();

  // ── شبكة أمان: لو حصل أي خطأ جوه التنسيق/الأنيميشن (formatAnswer أو
  //    typewriterReveal)، الرد الحقيقي اللي جاله فعلاً من الذكاء الاصطناعي
  //    ما يتضاعش — بنعرضه كنص عادي فورًا من غير تنسيق أو أنيميشن، بدل ما
  //    نرمي كل حاجة ونطلع "حصل خطأ في الرد" ورد صحيح موجود فعلاً معانا ──
  function finishBubbleChrome(){
    wrap.appendChild(buildActionBar(msg.question || '', msg.text));
    maybeAddZipAllButton(wrap);
    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.ts);
    wrap.appendChild(time);
    clearAiDisclaimers();
    wrap.appendChild(buildAiDisclaimer());
    smartFollowScroll();
    closeScrollSpacer();
  }

  try{
    if (msg.reasoning) wrap.appendChild(buildDeepThinkBox(msg.reasoning));
    const bubble = document.createElement('div');
    bubble.className = 'msg assistant';
    wrap.appendChild(bubble);
    typewriterReveal(bubble, formatAnswer(msg.text), finishBubbleChrome);
  } catch(renderErr){
    console.error('renderFinalAssistantMessage: التنسيق فشل، هنعرض نص عادي بدل ما نضيّع الرد', renderErr);
    wrap.querySelectorAll('.msg.assistant, .cosmos-deep-think').forEach(el=>el.remove());
    const bubble = document.createElement('div');
    bubble.className = 'msg assistant';
    bubble.textContent = msg.text || '';
    wrap.appendChild(bubble);
    finishBubbleChrome();
  }
}

// ── سكرول ذكي: بقت الحلقة المستمرة (runFollowLoop) فوق هي اللي بتتابع نمو
//    الرد كل فريم بحركة ناعمة، فمعدش محتاجين نسكرول يدويًا من هنا. سايبين
//    الدالة موجودة (فاضية) عشان أي استدعاء ليها في أماكن تانية من الكود
//    يفضل شغال من غير أي تعديل إضافي أو أخطاء ──
function smartFollowScroll(){}

function appendMessageBubble(msg, opts){
  opts = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + (msg.role==='user' ? 'user' : 'assistant');

  if(msg.role !== 'user'){
    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = '<span class="msg-avatar">'+AI_AVATAR_SVG+'</span><span class="msg-sender-name">'+AI_DISPLAY_NAME+'</span>';
    wrap.appendChild(header);
  }

  // ── مرفقات الرسالة (صور + ملفات): بقوا في صف واحد جنب بعض بدل ما الصور
  //    تتحط في بلوك لوحدها فوق بلوك الملفات ──
  const msgImages = msg.images && msg.images.length ? msg.images : (msg.image ? [msg.image] : []);
  const msgFiles = msg.files && msg.files.length ? msg.files : (msg.fileName ? [{ name: msg.fileName, kind: msg.fileKind, note: msg.fileNote }] : []);
  if(msgImages.length || msgFiles.length){
    const attRow = document.createElement('div');
    attRow.className = 'msg-attachments-row';
    msgImages.forEach(src=>{
      const imgEl = document.createElement('img');
      imgEl.className = 'msg-image';
      imgEl.src = src;
      imgEl.loading = 'lazy';
      attRow.appendChild(imgEl);
    });
    msgFiles.forEach(f=>{
      const chip = document.createElement('div');
      chip.className = 'attach-file-chip';
      chip.title = f.name + (f.note ? (' — ' + f.note) : '');
      const icon = FILE_KIND_ICON[f.kind] || 'fa-file';
      chip.innerHTML = '<div class="attach-file-icon"><i class="fas '+icon+'"></i></div>'+
        '<div class="attach-file-ext">'+escapeHtml(fileExtLabel(f.name))+'</div>';
      attRow.appendChild(chip);
    });
    wrap.appendChild(attRow);
  }

  if(msg.role !== 'user' && msg.reasoning){
    wrap.appendChild(buildDeepThinkBox(msg.reasoning));
  }

  if(msg.text){
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + (msg.role==='user' ? 'user' : 'assistant');
    if (msg.role==='user'){
      bubble.textContent = msg.text;
    } else {
      bubble.innerHTML = formatAnswer(msg.text);
      if (window.hljs){
        bubble.querySelectorAll('pre code').forEach(el=>{ try{ window.hljs.highlightElement(el); }catch(e){} });
      }
    }
    wrap.appendChild(bubble);
  }

  if(msg.role !== 'user' && msg.text){
    wrap.appendChild(buildActionBar(msg.question || '', msg.text));
    maybeAddZipAllButton(wrap);
  }

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(msg.ts);
  wrap.appendChild(time);

  if(msg.role !== 'user' && msg.text){
    clearAiDisclaimers();
    wrap.appendChild(buildAiDisclaimer());
  }

  if (opts.prepend){
    // بيتحط بعد زرار "تحميل رسائل أقدم" (لو موجود) وقبل أول رسالة كانت متحمّلة ──
    const anchor = (loadOlderBtn && loadOlderBtn.isConnected) ? loadOlderBtn.nextSibling : messagesEl.firstChild;
    messagesEl.insertBefore(wrap, anchor);
  } else {
    messagesEl.appendChild(wrap);
  }
  if (!opts.skipScroll){
    if (msg.role === 'user'){
      // ── لما المستخدم يبعت رسالة، نسكرول عشان رسالته هي اللي تبان فوق
      //    الشاشة، بدل ما تختفي فوق أول ما خطوات الرد تبدأ تتضاف تحتها،
      //    ونفعّل وضع "المتابعة التلقائية" عشان الشاشة تتابع نمو الرد بعدين ──
      autoFollowActive = true;
      openScrollSpacer();
      requestAnimationFrame(()=> wrap.scrollIntoView({ behavior:'smooth', block:'start' }));
    } else {
      smartFollowScroll();
    }
  }
}

/* ============ مؤشر "بيشتغل دلوقتي" — خطوات حقيقية بتتحدّث لحظة بلحظة، مش نصوص وهمية بتلف ============
   قبل كده كان في نصوص جاهزة بتتلف كل 1.4 ثانية من غير أي علاقة باللي بيحصل فعليًا.
   دلوقتي كل خطوة بتتضاف هنا هي خطوة حقيقية حصلت فعلاً في المنطق (getAIResponse،
   processAttachedFile، analyzeImagesWithGemini...): الخطوة اللي قبلها بتتعلّم
   "خلصت" (✓) والخطوة الجديدة بتتحط "شغالة دلوقتي" (نقط متحركة)، بالظبط زي أي
   نظام خطوات شفاف بيوضح للمستخدم النظام بيعمل إيه لحظة بلحظة. */
/* ============ مؤشر "بيشتغل دلوقتي" — خطوات حقيقية بتتحدّث لحظة بلحظة، مش نصوص وهمية بتلف ============
   قبل كده كان في نصوص جاهزة بتتلف كل 1.4 ثانية من غير أي علاقة باللي بيحصل فعليًا.
   دلوقتي كل خطوة بتتضاف هنا هي خطوة حقيقية حصلت فعلاً في المنطق (getAIResponse،
   processAttachedFile، analyzeImagesWithGemini...): الخطوة اللي قبلها بتاخد
   أيقونة "✓ خلصت"، والخطوة الشغالة دلوقتي بتاخد أيقونة تعبّر عن نوعها (بحث،
   رابط، مزوّد ذكاء اصطناعي...) بحلقة نابضة حواليها، بدل نقطة بسيطة واحدة
   لكل الأنواع — عشان الشكل يبان احترافي ومفهوم مش مجرد تحميل عام. */
// ── أيقونات SVG بدل أي ايموجي: كل الأيقونات هنا بتستخدم fill="currentColor"
//    عشان تورث اللون والحركة من الـ CSS بتاعة كل نوع خطوة (infinity-search،
//    infinity-fix...) زي ما كان بيحصل بالظبط مع حرف "∞" قبل كده، من غير ما
//    نضطر نلمس أي أنيميشن موجود ──
// ── أيقونة أفاتار المساعد (بدل نجمة ✦ اللي بعض الأجهزة بتعرضها كإيموجي ملوّن) ──
const AI_AVATAR_SVG = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/></svg>';
function stepKind(text){
  if (/الإنترنت/.test(text)) return 'search';
  if (/رابط/.test(text)) return 'link';
  if (/بيشغّل الكود فعليًا/.test(text)) return 'run';
  if (/بيصلّح الكود|يصلّح الكود/.test(text)) return 'fix';
  if (/كود/.test(text)) return 'code';
  if (/طريقة تانية/.test(text)) return 'retry';
  if (/بيجهّز الرد/.test(text)) return 'prepare';
  if (/صور/.test(text)) return 'image';
  if (/ملفات|ملف/.test(text)) return 'file';
  return 'general';
}
function appendThinkingIndicator(firstStepLabel){
  const wrap = document.createElement('div');
  // ── "thinking-full": تخلي صندوق التفكير يتمدد أفقيًا Edge-to-edge بدل ما
  //    يتحبس في نفس عرض رسائل المساعد العادية (92%) ──
  wrap.className = 'msg-wrap assistant thinking-full';
  // ── الهيدر + خطوات التفكير لفّوا جوه حاوية واحدة (.thinking-pinned) عشان
  //    يتثبّتوا مع بعض فوق (شوف position:sticky في الـ CSS) طول ما الرد
  //    شغال، بدل ما يتزحلقوا مع باقي المحادثة القديمة ──
  wrap.innerHTML =
    '<div class="thinking-pinned">'+
      '<div class="msg-header"><span class="msg-avatar">'+AI_AVATAR_SVG+'</span><span class="msg-sender-name">'+AI_DISPLAY_NAME+'</span></div>'+
      '<div class="thinking-steps"></div>'+
    '</div>';
  messagesEl.appendChild(wrap);
  // ── نسكرول فورًا عشان أول ظهور للغرفة يبقى في أول مساحة الرسائل المرئية
  //    بالظبط (مش نستنى المتابعة التلقائية توصلها بعد شوية)، وده هو المكان
  //    اللي هتفضل ملزّقة فيه (sticky) طول مدة التفكير والكتابة ──
  autoFollowActive = true;
  openScrollSpacer();
  requestAnimationFrame(()=> wrap.scrollIntoView({ behavior:'smooth', block:'start' }));
  const stepsEl = wrap.querySelector('.thinking-steps');

  function renderStep(text){
    const prevActive = stepsEl.querySelector('.thinking-step.active');
    if (prevActive){
      prevActive.classList.replace('active','done');
      prevActive.querySelector('.thinking-step-icon').innerHTML = '<i class="fas fa-check"></i>';
    }
    const step = document.createElement('div');
    step.className = 'thinking-step active';
    const kind = stepKind(text);
    step.innerHTML = '<span class="thinking-step-icon"><span class="infinity-glyph infinity-'+kind+'">∞</span></span><span class="thinking-step-text"></span>';
    step.querySelector('.thinking-step-text').textContent = text;
    stepsEl.appendChild(step);
    stepsEl.scrollTop = stepsEl.scrollHeight;
    if (wrap.isConnected) smartFollowScroll();
  }

  renderStep(firstStepLabel || 'بيقرا رسالتك...');
  // ── دالة عامة: أي جزء من المنطق يقدر يضيف خطوة جديدة حقيقية بيها ──
  wrap._addStep = (text)=>{ if (stepsEl.isConnected) renderStep(text); };
  wrap._clearStage = ()=>{
    const lastActive = stepsEl.querySelector('.thinking-step.active');
    if (lastActive){
      lastActive.classList.replace('active','done');
      lastActive.querySelector('.thinking-step-icon').innerHTML = '<i class="fas fa-check"></i>';
    }
  };
  // ── غرفة التفكير العميق اللايف: بتتبني أول ما أول جزء من التفكير الفعلي
  //    يوصل، وبتفضل بتتحدّث بالنص كامل أول بأول لحد ما الرد يخلص. الستريم
  //    ممكن يبعت عشرات الـ deltas في الثانية، فبدل ما نعمل تحديث DOM +
  //    scroll على كل واحدة فيهم (وده اللي كان بيسبب إحساس بالتجمد على
  //    الموبايل)، بنجمّع آخر نص وصل ونطبّقه مرة واحدة بس في كل
  //    requestAnimationFrame (أقصى تحديث ممكن ~ كل فريم شاشة) ──
  let __pendingReasoningText = null;
  wrap._setLiveReasoning = (fullReasoningText)=>{
    if (!fullReasoningText) return;
    const isFirstFrame = __pendingReasoningText === null;
    __pendingReasoningText = fullReasoningText;
    if (!isFirstFrame) return; // فيه فريم متجدول بالفعل هياخد آخر نص وقت ما يشتغل
    requestAnimationFrame(()=>{
      const textToRender = __pendingReasoningText;
      __pendingReasoningText = null;
      let liveBox = wrap.querySelector('.cosmos-deep-think-live');
      if (!liveBox){
        liveBox = document.createElement('div');
        liveBox.className = 'cosmos-deep-think-live'; // مقفولة افتراضيًا (من غير .open)
        liveBox.innerHTML =
          '<div class="cosmos-deep-think-live-label" role="button" tabindex="0" aria-expanded="false">'+
            '<i class="fas fa-brain"></i><span>بيفكر دلوقتي...</span>'+
            '<i class="fas fa-chevron-down cosmos-deep-think-live-chevron"></i>'+
          '</div>'+
          '<div class="cosmos-deep-think-live-body"><div class="cosmos-deep-think-live-text"></div></div>';
        const labelEl = liveBox.querySelector('.cosmos-deep-think-live-label');
        const toggleLive = ()=>{
          const opening = !liveBox.classList.contains('open');
          liveBox.classList.toggle('open');
          labelEl.setAttribute('aria-expanded', opening ? 'true' : 'false');
          if (opening){
            // أول ما تتفتح، نورّي النص من أوله مش من آخر حاجة اتكتبت لحد دلوقتي
            requestAnimationFrame(()=>{
              const textEl = liveBox.querySelector('.cosmos-deep-think-live-text');
              if (textEl) textEl.scrollTop = 0;
            });
          }
        };
        labelEl.addEventListener('click', toggleLive);
        labelEl.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleLive(); } });
        // ── بيتحط جوه .thinking-pinned مش مباشرة جوه wrap، عشان يفضل جزء من
        //    نفس الكتلة المثبّتة فوق مع الهيدر وخطوات التفكير ──
        (wrap.querySelector('.thinking-pinned') || wrap).appendChild(liveBox);
      }
      liveBox.querySelector('.cosmos-deep-think-live-text').textContent = textToRender;
      if (wrap.isConnected) smartFollowScroll();
    });
  };
  return wrap;
}

/* ============ ATTACHMENT (صور / PDF / Word / Excel / صوت / ZIP / أكواد) ============ */
const FILE_KIND_ICON = { image:'fa-image', audio:'fa-microphone', pdf:'fa-file-pdf', docx:'fa-file-word', excel:'fa-file-excel', zip:'fa-file-zipper', text:'fa-file-code', other:'fa-file' };

function clearAttachPreview(){
  pendingAttachments = [];
  attachPreview.style.display = 'none';
  attachPreview.innerHTML = '';
}

function removeAttachmentById(id){
  pendingAttachments = pendingAttachments.filter(a => a.id !== id);
  renderAttachPreview();
}

// ── اسم مختصر للملف بس بامتداده (PDF/DOCX/HTML..) عشان يتكتب جوه المربع
//    الصغير من غير ما ياخد مساحة أفقية؛ الاسم الكامل والتفاصيل بتتحطّ في
//    title (بيظهر بالـ hover في الديسكتوب، أو بالضغط المطوّل في الموبايل) ──
function fileExtLabel(name){
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '');
  return m ? m[1].toUpperCase() : 'FILE';
}

// ── بتعيد رسم كل المرفقات المعلّقة، كل واحد في صندوقه الخاص وزرار الإكس جواه هو نفسه،
//    وكلهم جنب بعض في صف واحد (flex-wrap) مش فوق بعض ──
function renderAttachPreview(){
  if (!pendingAttachments.length){
    attachPreview.style.display = 'none';
    attachPreview.innerHTML = '';
    return;
  }
  attachPreview.innerHTML = pendingAttachments.map(a=>{
    const removeBtn = '<button type="button" class="attach-remove-btn" data-remove-id="'+a.id+'"><i class="fas fa-xmark"></i></button>';
    if (a.type === 'image'){
      return '<div class="attach-item" data-attach-id="'+a.id+'"><img src="'+a.dataUrl+'">'+removeBtn+'</div>';
    }
    const icon = FILE_KIND_ICON[a.kind] || 'fa-file';
    const statusText = a.processing ? 'بيتقرا...' : (a.note || 'جاهز');
    // ── لو الملف طويل واتقسّم لأجزاء (Text Chunking)، بنضيف أسهم تنقل صغيرة
    //    (‹ 1/3 ›) تحت المربع عشان تختار أنهي جزء يتبعت في الرسالة دي ──
    let chunkNav = '';
    if (a.chunks && a.chunks.length > 1){
      chunkNav = '<div class="attach-chunk-nav" data-chunk-id="'+a.id+'">'+
        '<button type="button" class="attach-chunk-btn" data-chunk-dir="-1" '+((a.chunkIndex||0)<=0?'disabled':'')+'><i class="fas fa-chevron-right"></i></button>'+
        '<span>جزء '+((a.chunkIndex||0)+1)+'/'+a.chunks.length+'</span>'+
        '<button type="button" class="attach-chunk-btn" data-chunk-dir="1" '+((a.chunkIndex||0)>=a.chunks.length-1?'disabled':'')+'><i class="fas fa-chevron-left"></i></button>'+
        '</div>';
    }
    return '<div class="attach-item" data-attach-id="'+a.id+'">'+
      '<div class="attach-file-chip'+(a.processing?' processing':'')+'" title="'+escapeHtml(a.name+' — '+statusText)+'">'+
      '<div class="attach-file-icon"><i class="fas '+icon+'"></i></div>'+
      '<div class="attach-file-ext">'+escapeHtml(fileExtLabel(a.name))+'</div>'+
      '</div>'+
      chunkNav+
      removeBtn+'</div>';
  }).join('');
  attachPreview.style.display = 'flex';
  attachPreview.querySelectorAll('.attach-remove-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> removeAttachmentById(btn.dataset.removeId));
  });
  attachPreview.querySelectorAll('.attach-chunk-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const navEl = btn.closest('.attach-chunk-nav');
      const item = pendingAttachments.find(a=>a.id === navEl.dataset.chunkId);
      if (!item || !item.chunks) return;
      const dir = parseInt(btn.dataset.chunkDir, 10);
      item.chunkIndex = Math.max(0, Math.min(item.chunks.length-1, (item.chunkIndex||0) + dir));
      item.extractedText = item.chunks[item.chunkIndex];
      renderAttachPreview();
    });
  });
}

attachBtn.addEventListener('click', ()=> attachInput.click());
attachInput.addEventListener('change', async ()=>{
  const files = Array.from(attachInput.files || []);
  attachInput.value = '';
  if(!files.length) return;

  // ── بنعالج كل ملف على حدة وبنضيفه لصف المرفقات من غير ما نمسح اللي قبله ──
  for (const file of files){
    const kind = getFileKind(file);
    const id = 'a' + (++attachSeq);

    // ── الصور بتتحلل بـ Gemini Vision زي ما هي بالظبط ──
    if (kind === 'image'){
      try{
        const dataUrl = await compressImage(file);
        pendingAttachments.push({ id, type:'image', dataUrl });
        renderAttachPreview();
      } catch(e){ console.error(e); showToast('⚠️ مقدرتش أقرا الصورة دي', 'unsupported'); }
      continue;
    }

    // ── ZIP: نسأل المستخدم الأول يفك ولا يسيبه مضغوط، قبل ما نعالج الملف ──
    let extractZip = true;
    if (kind === 'zip'){
      extractZip = confirm('عايز أفك الضغط وأقرا اللي جوه ملف "'+file.name+'"؟\n"موافق" = هفكه وأحلل محتواه\n"إلغاء" = هسيبه مضغوط زي ما هو');
    }

    pendingAttachments.push({ id, type:'file', name:file.name, kind, processing:true });
    renderAttachPreview();

    try{
      const result = await processAttachedFile(file, { extractZip });
      const item = pendingAttachments.find(a=>a.id===id);
      if (item){
        item.processing = false;
        item.note = result.note || 'جاهز';
        item.extractedText = result.extractedText;
        item.chunks = result.chunks || null;
        item.chunkIndex = 0;
      }
      renderAttachPreview();
      // ── تحليل الموسيقى (Gemini) بيفشل أحيانًا (مفتاح خلص/شبكة) من غير ما
      //    يوقف باقي المعالجة — التفريغ لوحده كان بيكمل بصمت وكأن كل حاجة
      //    تمام، والمستخدم مايعرفش إن جزء من الملف اتفوّت. بنوريه تنبيه
      //    واضح هنا بدل ما يفضل مخبّي جوه tooltip الماوس بس ──
      if (result.musicAnalysisFailed){
        showToast('⚠️ الكلام اتفهم، لكن التحليل الموسيقي الحقيقي فشل دلوقتي', 'unsupported');
      }
    } catch(e){
      console.error(e);
      showToast('⚠️ مقدرتش أقرا الملف ده: ' + (e.message || ''), 'unsupported');
      removeAttachmentById(id);
    }
  }
});

/* ============ SEND ============ */
composerInput.addEventListener('input', ()=>{
  composerInput.style.height='auto';
  composerInput.style.height = Math.min(140, composerInput.scrollHeight)+'px';
  // بعد ما نغيّر الارتفاع، نجبر الصندوق يعمل scroll لمكان الكيرسور الحالي
  // عشان الكلام اللي بتكتبه دلوقتي يفضل ظاهر حتى لو النص أطول من 140px
  composerInput.scrollTop = composerInput.scrollHeight;
});

composer.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (window.__aiPaused){
    showToast(t('secAiPausedMsg'), 'error');
    return;
  }
  if (usageIsLocked()){
    updateUsageWindowUI();
    return;
  }
  // ── لو الزرار دلوقتي في وضع "إيقاف" (رد شغال)، ضغطة تانية عليه بتوقف
  //    الرد فورًا من غير ما تبعت رسالة جديدة ──
  if (sendBtn.classList.contains('sending')){
    __manualStopRequested = true;
    if (currentAbortController) currentAbortController.abort();
    return;
  }
  const text = composerInput.value.trim();
  const attachmentsSnapshot = pendingAttachments.slice();
  const images = attachmentsSnapshot.filter(a=>a.type==='image');
  const files = attachmentsSnapshot.filter(a=>a.type==='file');
  if((!text && !images.length && !files.length) || !currentConvId) return;

  // ── لو فيه مرفق (خصوصًا صوت، دلوقتي بياخد وقت أطول عشان بيتعمله تفريغ +
  //    تحليل موسيقي مع بعض) لسه بيتعالج ومخلصش، ومنسيبوش يتبعت ناقص —
  //    لأن ده كان بيخلي الرسالة تتبعت من غير fileContext خالص، فالذكاء
  //    الاصطناعي يوصل له مرفق فاضي ويردّ بردود عامة زي "مقدرش أسمع الصوت" ──
  if (files.some(f => f.processing)){
    showToast('⏳ لسه بيحلل الملف المرفق، استنى لحظة كمان وابعت تاني', 'info');
    return;
  }

  // ── فحص مسبق لحجم الطلب (Pre-request Validation): قبل ما نبعت طلب ضخم
  //    (دمج ملفات كتير/نص طويل جدًا) ونفاجئ المستخدم بانقطاع السيرفر، ننبهه
  //    وندّيله فرصة يقسّم الطلب أو يختار تنزيل ZIP بدل الإرسال دفعة واحدة ──
  const totalAttachChars = files.reduce((sum,f)=> sum + (f.extractedText ? f.extractedText.length : 0), 0);
  const HUGE_FILE_COUNT = 12, HUGE_CHAR_COUNT = 60000;
  if (files.length > HUGE_FILE_COUNT || totalAttachChars > HUGE_CHAR_COUNT){
    const ok = confirm(
      'الطلب ده كبير (' + files.length + ' ملف تقريبًا ' + Math.round(totalAttachChars/1000) + ' ألف حرف)، وطلبات بالحجم ده ممكن تفصل قبل ما تخلص.\n\n' +
      'تحب تكمل وتبعته زي ما هو؟ (لو عايز تتجنب الانقطاع، اضغط "إلغاء" وقسّم الملفات على أكتر من رسالة، أو نزّلها ZIP بدل ما تبعتها كلها مرة واحدة).'
    );
    if (!ok) return;
  }

  composerInput.value='';
  composerInput.style.height='auto';
  clearAttachPreview();
  __manualStopRequested = false;
  currentAbortController = new AbortController();
  sendBtn.classList.add('sending');
  const sendBtnIcon = document.getElementById('send-btn-icon');
  sendBtnIcon.className = 'fas fa-stop';
  // مؤقت أمان: لو لأي سبب غير متوقع الرد اتعلّق (شبكة واقفة، تبويب اتجمّد،
  // إلخ) ومكملش لحد الـ finally بتاعت الطلب، الزرار برضه هيرجع شغّال بدل
  // ما يفضل عالق "بيبعت" للأبد. المهلة اتزوّدت لـ 120 ثانية (بدل 45) عشان
  // reasoning_effort:'high' + الاستكمال التلقائي (Auto-Resume) ممكن ياخدوا
  // وقت طبيعي أطول من 45 ثانية من غير ما يبقى فيه أي مشكلة فعلية.
  clearTimeout(window.__sendWatchdog);
  window.__sendWatchdog = setTimeout(()=>{
    // ده إلغاء تلقائي بسبب طول الوقت، مش إيقاف يدوي من المستخدم — فبنسيب
    // __manualStopRequested زي ما هي (false) عشان الرسالة اللي هتظهر تبقى
    // "الرد بياخد وقت أطول من المعتاد" مش "تم إيقاف الرد".
    if (currentAbortController) currentAbortController.abort();
    sendBtn.classList.remove('sending');
    sendBtnIcon.className = 'fas fa-arrow-up';
  }, 120000);
  refreshGeoContext(); // مجرد محاولة تحديث في الخلفية لو لسه معندناش بيانات موقع/صلاة اليوم

  const convRef = db.ref('users/'+currentUser.uid+'/conversations/'+currentConvId);
  const userMsg = { role:'user', ts: Date.now() };
  if(text) userMsg.text = text;
  if(images.length) userMsg.images = images.map(i=>i.dataUrl);
  if(files.length){

    userMsg.files = files.map(f=>{
      const entry = { name: f.name, kind: f.kind, note: f.note || '' };
      if (f.extractedText) entry.fileContext = f.extractedText.slice(0, 8000);
      return entry;
    });
  }
  await convRef.child('messages').push(userMsg);
  await convRef.update({ updatedAt: Date.now() });

  // First message of a conversation becomes its title.
  const snap = await convRef.once('value');
  const conv = snap.val();
  if(conv && (!conv.title || conv.title==='محادثة جديدة')){
    await convRef.update({ title: (text || (files[0] && files[0].name) || (images.length ? 'صورة' : '')).slice(0,40) });
  }

  const thinkingEl = appendThinkingIndicator(images.length
    ? 'بيفتح الصور ويحللها...'
    : (files.length ? 'بيقرا محتوى الملفات المرفقة...' : 'بيقرا رسالتك...'));

  try{
    if(images.length){
      const replyText = await analyzeImagesWithGemini(images.map(i=>i.dataUrl), text);
      thinkingEl._clearStage();
      const replyTs = Date.now();
      const assistantMsg = { role:'assistant', text: replyText, provider:'Gemini Vision', ts: replyTs };
      window.__locallyRendered = window.__locallyRendered || new Set();
      window.__locallyRendered.add(replyTs);
      renderFinalAssistantMessage(thinkingEl, assistantMsg);
      await convRef.child('messages').push(assistantMsg);
      await convRef.update({ updatedAt: replyTs });
    } else {
      const historySnap = await convRef.child('messages').once('value');
      // ── لو فيه ملفات مرفقة (PDF/Word/Excel/صوت/ZIP/كود)، بنضيف محتواها المستخرج
      //    كسياق جوه نفس رسالة المستخدم اللي بتتبعت للذكاء، من غير ما يتحط
      //    جوه فقاعة الرسالة اللي المستخدم شايفها (اللي فضلت بس النص اللي كتبه) ──
      const history = Object.values(historySnap.val() || {})
        .filter(m=>m.text || (m.files && m.files.some(f=>f.fileContext)) || m.fileContext)
        .map(m=>{
          let content = m.text || '';
          if (m.files && m.files.length){
            m.files.forEach(f=>{
              if (f.fileContext){
                content += '\n\n--- محتوى ملف مرفق (' + (f.name||'ملف') + (f.note?' — '+f.note:'') + ') ---\n' + f.fileContext + '\n---';
              }
            });
          } else if (m.fileContext){
            content += '\n\n--- محتوى ملف مرفق (' + (m.fileName||'ملف') + (m.fileNote?' — '+m.fileNote:'') + ') ---\n' + m.fileContext + '\n---';
          }
          return { role: m.role, text: content };
        });

      // ── التفكير وكتابة الرد بيحصلوا في الخلفية، لكن غرفة التفكير العميق
      //    بترسم لايف أول بأول من onReasoningDelta وهي بتتحدّث، عشان المستخدم
      //    يشوف الموديل بيفكر فعليًا. الرد النهائي (content) لسه بيتعرض دفعة
      //    واحدة زي ما هو، النص الخام اللي بيتعرض لايف هو التفكير بس ──
      const onReasoningDelta = (fullReasoningText)=> thinkingEl._setLiveReasoning(fullReasoningText);
      const onStep = (text)=> thinkingEl._addStep(text);
      let answerStageShown = false;
      let codeStageShown = false;
      const onContentDelta = (fullText)=>{
        // ── أول حرف فعلي بيوصل من الرد (مش التفكير) — بنعرض خطوة "بيكتب
        //    الرد دلوقتي" فورًا في نفس اللحظة، بدون أي تأخير أو انتظار ──
        if (!answerStageShown){
          answerStageShown = true;
          thinkingEl._addStep('بيجهّز الرد ويكتبه دلوقتي...');
        }
        // ── أول ما علامة كتلة كود (```) تظهر في النص، بنبدّل فورًا لخطوة
        //    "بيجهّز الكود" (بلونها وحركتها المختلفة) في نفس اللحظة بالظبط ──
        if (!codeStageShown && fullText.indexOf('```') > -1){
          codeStageShown = true;
          thinkingEl._addStep('بيجهّز الكود...');
        }
      };

      let reply = await getAIResponse(history, onReasoningDelta, onStep, onContentDelta);
      reply = await selfCheckAndFixCode(reply, history, onReasoningDelta, onStep, onContentDelta);
      thinkingEl._clearStage();
      const replyTs = Date.now();
      const assistantMsg = { role:'assistant', text: reply.text, provider: reply.provider, ts: replyTs, question: text };
      if (reply.reasoning) assistantMsg.reasoning = reply.reasoning;
      window.__locallyRendered = window.__locallyRendered || new Set();
      window.__locallyRendered.add(replyTs);
      renderFinalAssistantMessage(thinkingEl, assistantMsg);
      await convRef.child('messages').push(assistantMsg);
      await convRef.update({ updatedAt: replyTs });
    }
  } catch(err){
    thinkingEl._clearStage();
    thinkingEl.querySelector('.cosmos-deep-think-live')?.remove();
    // ── الرد "وقف" هنا (خطأ أو إلغاء)، فبنشيل التثبيت فوق (thinking-full)
    //    وترجع الغرفة سكرول طبيعي زي أي رسالة تانية بدل ما تفضل ملزّقة ──
    thinkingEl.classList.remove('thinking-full');
    closeScrollSpacer();
    if (isAbortError(err)){
      const stopMsg = __manualStopRequested
        ? 'تم إيقاف الرد.'
        : 'الرد أخد وقت أطول من المعتاد فاتلغى تلقائيًا. جرب تاني، أو ابعت رسالة أقصر لو ممكن.';
      thinkingEl.querySelector('.thinking-steps')?.replaceWith(
        Object.assign(document.createElement('div'), { className:'msg assistant error-msg', textContent: stopMsg })
      );
    } else if (err && err.serviceDown){
      // مفيش أي بديل شغال دلوقتي — بعد ما جربنا كل المزوّدين مرتين (مع تأخير
      // بينهم). ده غالبًا رايت-ليميت مؤقت على المفاتيح المشتركة مع فلك،
      // مش إن رصيد التوكن بتاعك خلص فعليًا — فبنوصف الحالة صح للمستخدم.
      thinkingEl.querySelector('.thinking-steps')?.replaceWith(
        Object.assign(document.createElement('div'), { className:'msg assistant error-msg', textContent:'❌ ' + err.serviceDown + ' مزدحمة دلوقتي (مش إن التوكن خلص)، جرب تاني بعد شوية.' })
      );
    } else {
      const details = (err && err.providerDetails && err.providerDetails.length)
        ? '\n\n' + err.providerDetails.join('\n')
        : '';
      thinkingEl.querySelector('.thinking-steps')?.replaceWith(
        Object.assign(document.createElement('div'), { className:'msg assistant error-msg', textContent:'حصل خطأ في الرد، جرب تاني.' + details })
      );
      console.error(err, err && err.providerDetails);
    }
  } finally {
    clearTimeout(window.__sendWatchdog);
    currentAbortController = null;
    sendBtn.classList.remove('sending');
    document.getElementById('send-btn-icon').className = 'fas fa-arrow-up';
  }
});

/* ============ SIDEBAR TOGGLE (mobile) ============ */
sidebarToggle.addEventListener('click', ()=> sidebar.classList.toggle('collapsed'));

/* ============ نظام الأمان البيومتري (WebAuthn) + مكافحة التحايل على الـ Tokens ============
   ملاحظة تقنية مهمة: WebAuthn بتصميمه بيمنع أي موقع من مقارنة بصمة نفس الشخص
   بين حسابين مختلفين (كل عملية تسجيل بتولّد مفتاح جديد كليًا حتى على نفس
   الجهاز ونفس الإصبع — ده معمول قصدًا لحماية خصوصية المستخدمين في المعيار
   نفسه). يعني السيرفر مقدرش "يقارن البصمة" حرفيًا زي ما لو كانت صورة. اللي
   بيحصل فعليًا هنا: WebAuthn بيتأكد إن في إنسان حقيقي (مش بوت) بيوافق ببصمته/
   Face ID فعلاً وقت التسجيل، وبالتوازي بنستخدم معرّف جهاز ثابت (Device ID)
   مخزّن في التخزين المحلي للمتصفح، وده اللي بيفضل موجود حتى لو اتعمل حساب
   جديد بإيميل مختلف على نفس الجهاز — وعليه بيتم رفض إعطاء رصيد توكن جديد.
   ده حل واقعي جوه حدود متصفح بلا سيرفر خلفي حقيقي، ومش حماية 100% (لو
   المستخدم مسح بيانات المتصفح هيتغيّر معرّف الجهاز) — لو عايز صرامة أعلى
   محتاج Cloud Function + توقيع من السيرفر بدل التخزين المحلي وحده. */
const biometricModal = document.getElementById('biometric-modal');
const biometricRegisterBtn = document.getElementById('biometric-register-btn');
const biometricError = document.getElementById('biometric-error');
const biometricUnsupportedNote = document.getElementById('biometric-unsupported-note');
const biometricModalText = document.getElementById('biometric-modal-text');
let deviceBlockedForThisAccount = false;

function getDeviceId(){
  try{
    let id = localStorage.getItem('mhz_device_id');
    if (!id){
      id = (crypto.randomUUID ? crypto.randomUUID() : ('dev-'+Date.now()+'-'+Math.random().toString(16).slice(2)));
      localStorage.setItem('mhz_device_id', id);
    }
    return id;
  } catch(e){
    return 'dev-fallback';
  }
}
/* ============ بصمة جهاز (مش بصمة صباع) — Device/Browser Fingerprint ============
   ده مش بيانات بيومترية شخصية، وميعرفش يتعرّف على شخص المستخدم — هو مجرد
   توقيع تقني لخصائص الجهاز/المتصفح نفسه (كرت الرسومات، دقة الشاشة، عدد
   أنوية المعالج، المنطقة الزمنية...) بيتحسب برضه ولو المستخدم مسح
   localStorage، عكس mhz_device_id اللي بيروح لو البيانات اتمسحت. بنستخدمه
   كطبقة تانية أقوى بجانب معرّف الجهاز العادي، مش بديل عن نظام WebAuthn نفسه. */
function getCanvasFingerprint(){
  try{
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Tajawal', Arial";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 60, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Digital-Mind-FP 😀 محفوظات', 2, 15);
    ctx.strokeStyle = 'rgba(102,204,0,0.7)';
    ctx.beginPath(); ctx.arc(50, 20, 15, 0, Math.PI*2); ctx.stroke();
    return canvas.toDataURL();
  } catch(e){ return 'canvas-unsupported'; }
}
function getWebglFingerprint(){
  try{
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return vendor + '|' + renderer;
  } catch(e){ return 'webgl-error'; }
}
async function computeDeviceFingerprint(){
  const parts = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    (navigator.languages || []).join(','),
    String(navigator.hardwareConcurrency || ''),
    String(navigator.deviceMemory || ''),
    String(screen.width) + 'x' + String(screen.height) + 'x' + String(screen.colorDepth),
    String(window.devicePixelRatio || ''),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    String('ontouchstart' in window),
    getWebglFingerprint(),
    getCanvasFingerprint()
  ].join('###');
  try{
    const buf = new TextEncoder().encode(parts);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return arrayBufferToBase64(hashBuf).replace(/[+/=]/g, '');
  } catch(e){
    // ── fallback بسيط لو SubtleCrypto مش متاح (سياق غير آمن مثلاً) ──
    let h = 0;
    for (let i=0;i<parts.length;i++){ h = ((h<<5)-h+parts.charCodeAt(i))|0; }
    return 'fp' + Math.abs(h);
  }
}
let __cachedFingerprint = null;
async function getDeviceFingerprint(){
  if (__cachedFingerprint) return __cachedFingerprint;
  __cachedFingerprint = await computeDeviceFingerprint();
  return __cachedFingerprint;
}
function arrayBufferToBase64(buf){
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function isBiometricRegistered(uid){
  const snap = await db.ref('users/'+uid+'/security/biometric').once('value');
  return !!snap.val();
}
async function registerBiometricCredential(){
  if (!window.PublicKeyCredential){
    biometricUnsupportedNote.style.display = 'block';
    throw new Error('unsupported');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Digital Mind' },
      user: {
        id: new TextEncoder().encode(currentUser.uid),
        name: currentUser.email || currentUser.uid,
        displayName: currentUser.displayName || currentUser.email || 'مستخدم'
      },
      pubKeyCredParams: [{ alg:-7, type:'public-key' }, { alg:-257, type:'public-key' }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout: 60000,
      attestation: 'none'
    }
  });
  return arrayBufferToBase64(cred.rawId);
}
// بيفحص لو معرّف الجهاز أو بصمة الجهاز (fingerprint) دول اتسجّلوا قبل كده
// وحرقوا رصيدهم على حساب تاني، وبيحدّث السجلين بآخر حساب استخدمهم
async function checkDeviceAbuse(){
  const deviceId = getDeviceId();
  const fingerprint = await getDeviceFingerprint();

  const deviceRef = db.ref('deviceRegistry/'+deviceId);
  const fpRef = db.ref('deviceFingerprints/'+fingerprint);
  const [deviceSnap, fpSnap] = await Promise.all([
    deviceRef.once('value'),
    fpRef.once('value')
  ]);
  const deviceData = deviceSnap.val();
  const fpData = fpSnap.val();
  const blockedByDeviceId = !!(deviceData && deviceData.tokensExhausted && deviceData.uid !== currentUser.uid);
  // ── لو الـ localStorage اتمسح (deviceId جديد) بس بصمة الجهاز (هاردوير/
  //    متصفح) لسه نفسها زي جهاز حرق توكناته قبل كده، برضه بنرفض — ده اللي
  //    بيمنع الالتفاف بمسح بيانات المتصفح بس ──
  const blockedByFingerprint = !!(fpData && fpData.tokensExhausted && fpData.uid !== currentUser.uid);
  const blocked = blockedByDeviceId || blockedByFingerprint;

  await Promise.all([
    deviceRef.update({ uid: currentUser.uid, lastSeen: Date.now(), biometricRegistered: true, fingerprint }).catch(()=>{}),
    fpRef.update({ uid: currentUser.uid, lastSeen: Date.now() }).catch(()=>{})
  ]);
  // ── الربط العكسي: بنسجّل معرّف الجهاز وبصمة الجهاز جوه حساب المستخدم نفسه
  //    كمان (users/{uid}/security/devices/{deviceId})، مش بس العكس
  //    (deviceRegistry/deviceFingerprints اللي بيشاورا من الجهاز للحساب).
  //    كده كل حساب عنده قايمة بكل الأجهزة اللي استُخدم منها فعليًا ──
  const userDeviceRef = db.ref('users/'+currentUser.uid+'/security/devices/'+deviceId);
  userDeviceRef.transaction(existing=>{
    return { firstSeen: (existing && existing.firstSeen) || Date.now(), lastSeen: Date.now(), fingerprint };
  }).catch(()=>{});
  return blocked;
}
// ── بيرجّع true لو الجهاز الحالي معروف ومربوط فعلاً بحساب المستخدم الحالي
//    (يعني اتسجّل قبل كده على الأقل مرة واحدة تحت نفس الـ uid) ──
async function isDeviceLinkedToCurrentAccount(){
  if (!currentUser) return false;
  const snap = await db.ref('users/'+currentUser.uid+'/security/devices/'+getDeviceId()).once('value');
  return snap.exists();
}
async function markDeviceTokensExhausted(){
  if (!currentUser) return;
  const deviceId = getDeviceId();
  const fingerprint = await getDeviceFingerprint();
  db.ref('deviceRegistry/'+deviceId).update({
    tokensExhausted: true,
    uid: currentUser.uid,
    exhaustedAt: Date.now()
  }).catch(()=>{});
  db.ref('deviceFingerprints/'+fingerprint).update({
    tokensExhausted: true,
    uid: currentUser.uid,
    exhaustedAt: Date.now()
  }).catch(()=>{});
}
function openBiometricModal(forced){
  biometricError.textContent = '';
  biometricModalText.textContent = forced
    ? 'الحساب ده لسه مالوش بصمة مسجّلة على السيرفر — لازم تسجّلها دلوقتي عشان تقدر تكمل استخدام التطبيق.'
    : 'عشان نضمن عدالة استخدام التوكنات اليومية بين كل المستخدمين، لازم تسجّل بصمة إصبعك (أو أي وسيلة تحقق بيومترية على جهازك) قبل ما تكمل.';
  biometricModal.classList.add('open');
}
function closeBiometricModal(){
  biometricModal.classList.remove('open');
}
biometricRegisterBtn.addEventListener('click', async ()=>{
  biometricError.textContent = '';
  biometricRegisterBtn.disabled = true;
  biometricRegisterBtn.classList.add('registering');
  const icon = biometricRegisterBtn.querySelector('i');
  const originalIconClass = icon.className;
  icon.className = 'fas fa-spinner';
  try{
    const credId = await registerBiometricCredential();
    await db.ref('users/'+currentUser.uid+'/security/biometric').set({
      credentialId: credId,
      deviceId: getDeviceId(),
      registeredAt: Date.now()
    });
    closeBiometricModal();
    deviceBlockedForThisAccount = await checkDeviceAbuse().catch(()=>false);
    updateUsageWindowUI();
  } catch(err){
    biometricError.textContent = (err && err.name === 'NotAllowedError')
      ? 'اتلغى تسجيل البصمة أو رفضته — لازم توافق عليه عشان تكمل.'
      : 'حصل خطأ أثناء تسجيل البصمة، جرب تاني.';
  } finally {
    biometricRegisterBtn.disabled = false;
    biometricRegisterBtn.classList.remove('registering');
    icon.className = originalIconClass;
  }
});
// ── الفحص الرئيسي: بيتنادى بعد كل تسجيل دخول ناجح (حساب جديد أو قديم) ──
async function enforceBiometricGate(){
  const registered = await isBiometricRegistered(currentUser.uid).catch(()=>false);
  if (!registered){
    openBiometricModal(true);
    return; // المودال بيقفل الواجهة بالكامل (z-index أعلى من أي حاجة) لحد ما يسجّل بصمته
  }
  deviceBlockedForThisAccount = await checkDeviceAbuse().catch(()=>false);
  updateUsageWindowUI();
}

/* ============ التعامل الذكي مع لوحة المفاتيح (Keyboard Viewport Handling) ============
   لما لوحة المفاتيح تفتح على الموبايل، visualViewport.height بينقص بمقدار
   ارتفاعها تقريبًا. بنحوّل الفرق ده لمتغيّر CSS (--kb-offset) على <html>،
   والـ CSS بيستخدمه يرفع الجزيرة العائمة (composer-dock) فوق الكيبورد
   مباشرة بلا مسافات فاضية، ويزوّد padding-bottom لمنطقة الرسائل بنفس القيمة
   عشان آخر رسالة تفضل قابلة للقراءة والتمرير كاملة فوق الكيبورد. */
(function setupKeyboardViewportHandling(){
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv){ return; } // متصفحات قديمة جدًا: هيفضل الشريط في مكانه العادي تحت من غير أذية
  let rafPending = false;
  function applyOffset(){
    rafPending = false;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb-offset', kb + 'px');
    if (messagesEl && messagesEl.isConnected){
      // نضمن إن المستخدم يفضل شايف آخر رسالة وهو بيكتب حتى لو الكيبورد فتح فجأة
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }
  function scheduleApply(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(applyOffset);
  }
  vv.addEventListener('resize', scheduleApply);
  vv.addEventListener('scroll', scheduleApply);
  composerInput.addEventListener('focus', ()=> setTimeout(scheduleApply, 60));
  composerInput.addEventListener('blur', ()=> setTimeout(scheduleApply, 60));
  // مهم: كمان نعيد الحساب كل مرة صندوق الكتابة نفسه بيكبر (سطر جديد أثناء
  // الكتابة)، مش بس وقت فتح/قفل الكيبورد — عشان لو حصل أي فرق توقيت بين
  // تمدد الصندوق وتحديث ارتفاع الكيبورد، الموضع يتصحح فورًا ولا يتحجب
  // التولبار/زرار الإرسال تحت الكيبورد.
  composerInput.addEventListener('input', scheduleApply);
})();

})();
