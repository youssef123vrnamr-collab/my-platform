
  // ========== Firebase Config ==========
  const firebaseConfig = {
    apiKey: "AIzaSyCAgFi4D9hwtuK391fLsbnDuh5AtTDIHKU",
    authDomain: "planning-with-ai-390af.firebaseapp.com",
    projectId: "planning-with-ai-390af",
    storageBucket: "planning-with-ai-390af.firebasestorage.app",
    messagingSenderId: "601755857673",
    appId: "1:601755857673:web:b9d7d63e13035412a819d8"
  };
  try { firebase.initializeApp(firebaseConfig); } catch(e) { console.error(e); }
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
// ========== User Roles Functions ==========
async function createUserRole(userId, role, creatorId = null) {
  if (!userId) return false;
  if (creatorId) {
    const creatorDoc = await db.collection("users").doc(creatorId).get();
    if (creatorDoc.exists && creatorDoc.data().role !== 'super_admin') {
      showToast("❌ فقط السوبر أدمن يمكنه تعيين الأدوار");
      return false;
    }
  }
  await db.collection("users").doc(userId).set({ role, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

async function getUserRole(userId) {
  if (!userId) return 'student';
  const doc = await db.collection("users").doc(userId).get();
  return doc.exists ? doc.data().role : 'student';
}

async function isAdminUser(userId) {
  const role = await getUserRole(userId);
  return role === 'admin' || role === 'super_admin';
}

  // ========== Global Variables ==========
  const onlineUsersRef = db.collection("online_users");
  let isAdmin = false, isSuperAdmin = false, videos = [], exams = [], examResults = [], aiKnowledgeBase = [], uploadWidget = null, apps = [];
  let unsubscribeVideos = null, unsubscribeExams = null, unsubscribeExamResults = null, unsubscribeAIKnowledge = null, unsubscribeMaintenance = null, unsubscribeApps = null;
  // ===== Paid courses access control =====
  let unsubscribeCoursesAccess = null, unsubscribeUserEnrollmentsAccess = null;
  let paidCourseVideoIds = new Set();   // videos that appear in any paid course (price > 0)
  let freeCourseVideoIds = new Set();   // videos that appear in any free course (price == 0)
  let userUnlockedVideoIds = new Set(); // videos unlocked by current user's enrollments
  let paidCoursesData = []; // [{id, title, videoIds, price}] for grouping in library view
  let pendingVideoInfo = null, currentEditVideoId = null, currentExam = null, currentVideoIdForExam = null, currentExamAnswers = {}, examTimer = null, examTimeRemaining = 0;
  let progressInterval = null, metadataListener = null, lastWatchedData = null, currentUser = null, currentUserPhone = null, currentUserId = null, chatUnsubscribe = null;
  let mediaRecorder = null, audioChunks = [], recordingTimer = null, localStream = null, callTimer = null, callSeconds = 0, unreadMessages = 0, isRecording = false;
  let currentAudio = null, currentAudioBtn = null, userPresenceRef = null, onlineUnsubscribe = null, presenceInterval = null, maintenanceTimerInterval = null, tickInterval = null;
  let maintenanceEndTime = null, uploadStartTime = 0, lastUploadedBytes = 0, lastTime = 0;
  let voiceSettings = { voiceURI: null, rate: 1, pitch: 1 };
  let isLoadingVideos = true;
  let googleUser = null;
  let deferredPrompt = null;
  let feedbacksUnsubscribe = null;
  let loadAttemptFailed = false;

  // EmailJS settings
  let emailSettings = { publicKey: "", serviceId: "", templateId: "" };

  const CLOUDINARY_CONFIG = { cloudName: "dnnsna4il", uploadPreset: "falak_upload", apiKey: "364194664384272" };

  // ========== VALIDATION FUNCTIONS (محسّنة) ==========

  // تنظيف أي مدخل من HTML/XSS مع الإبقاء على النص العادي (عربي/إنجليزي/أرقام)
  function sanitizeInput(str) {
    if (!str) return '';
    return str
      .replace(/<[^>]*>/g, '')           // إزالة أي HTML tag
      .replace(/javascript\s*:/gi, '')   // منع javascript: URLs
      .replace(/on\w+\s*=/gi, '')       // منع onclick= وأمثالها
      .replace(/[<>]/g, '')              // إزالة < و > المتبقية
      .trim();
  }

  // تنظيف الرسائل الطويلة مع حد أقصى
  function sanitizeMessage(str) {
    if (!str) return '';
    return sanitizeInput(str).substring(0, 2000);
  }

  // التحقق من البريد الإلكتروني
  function validateEmail(email) {
    if (!email) return false;
    const trimmed = email.trim();
    if (trimmed.length < 5 || trimmed.length > 100) return false;
    // regex دقيق يقبل الصيغ الشائعة فقط
    const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return re.test(trimmed);
  }

  // ========== خريطة أكواد الدول — لكل كود: الأرقام المسموح بها كبادئة محلية ==========
  // key = كود الدولة (مثل '+20')، value = مصفوفة من البادئات المحلية الصحيحة (2 رقم أو أكثر)
  const COUNTRY_PREFIX_MAP = {
    '+20':  ['01','02','03'],           // مصر
    '+966': ['05','011','012','013'],    // السعودية
    '+971': ['05','02','03','04','06','07','09'], // الإمارات
    '+962': ['07','02','03','05','06','08'],       // الأردن
    '+961': ['03','07','01','04','05','06','08','09'], // لبنان
    '+963': ['09','011','021','031','041','051','061'], // سوريا
    '+964': ['07','078','079','075','076','077'],   // العراق
    '+965': ['05','06','09','18'],       // الكويت
    '+968': ['07','09','22','23','24','25','26'],   // عُمان
    '+974': ['33','30','31','32','55','50','44','66','77'],  // قطر
    '+973': ['3','6','17'],              // البحرين
    '+967': ['07','01','02','03','04','05','06'],   // اليمن
    '+249': ['09','01','18','11','12','13','14','15','16','17'], // السودان
    '+212': ['06','07','05','08'],       // المغرب
    '+213': ['05','06','07','03'],       // الجزائر
    '+216': ['2','3','4','5','7','9'],   // تونس
    '+218': ['09','02','21','22','23','24','25','26','27','28','29'], // ليبيا
    '+252': ['06','07','61','62','63','65','66'],   // الصومال
    '+253': ['07','77'],                 // جيبوتي
    '+255': ['07','06'],                 // تنزانيا
    '+251': ['09','07'],                 // إثيوبيا
    '+254': ['07','01'],                 // كينيا
    '+234': ['07','08','09','080','070','090'], // نيجيريا
    '+27':  ['06','07','08'],            // جنوب أفريقيا
    '+1':   ['2','3','4','5','6','7','8','9'], // أمريكا/كندا
    '+44':  ['07','01','02','03'],       // بريطانيا
    '+33':  ['06','07','01','02','03','04','05','08','09'], // فرنسا
    '+49':  ['01','015','016','017'],    // ألمانيا
    '+39':  ['3','02','06','081'],       // إيطاليا
    '+34':  ['6','7','9'],               // إسبانيا
    '+7':   ['9','8'],                   // روسيا
    '+86':  ['1'],                       // الصين
    '+91':  ['6','7','8','9'],           // الهند
    '+92':  ['03','021','042','051'],    // باكستان
    '+55':  ['9','11','21','31','41','51','61','71','81','91'], // البرازيل
    '+81':  ['0'],                       // اليابان
    '+82':  ['01','010','011'],          // كوريا الجنوبية
    '+90':  ['05','0212','0216'],        // تركيا
    '+98':  ['09','021'],                // إيران
    '+62':  ['08','021','022'],          // إندونيسيا
    '+60':  ['01','03'],                 // ماليزيا
    '+65':  ['6','8','9'],               // سنغافورة
  };

  // التحقق من رقم الهاتف — يشترط أن يبدأ الرقم المُدخَل بالبادئة الصحيحة لكود الدولة
  function validatePhone(phone, countryCode = '+20') {
    if (!phone) return false;
    let clean = phone.toString().replace(/[\s\-().]/g, '').replace(/[^\d+]/g, '');

    // إذا كان يبدأ بـ + تحقق مباشرة
    if (clean.startsWith('+')) {
      const phoneRegex = /^\+\d{7,15}$/;
      if (!phoneRegex.test(clean)) return false;
      // تحقق أن الرقم يبدأ بكود الدولة المختار
      if (!clean.startsWith(countryCode)) return false;
      return clean;
    }

    // الرقم محلي (بدون +) — تحقق من البادئة المحلية
    const localPrefixes = COUNTRY_PREFIX_MAP[countryCode] || [];
    if (localPrefixes.length > 0) {
      const cleanNoZero = clean; // لا نحذف الصفر لأننا نتحقق من البادئة
      const hasValidPrefix = localPrefixes.some(pfx => cleanNoZero.startsWith(pfx));
      if (!hasValidPrefix) return false; // ❌ البادئة غير مطابقة لكود الدولة
    }

    // بناء الرقم الكامل
    let full = countryCode + clean.replace(/^0+/, '');
    const phoneRegex = /^\+\d{7,15}$/;
    if (!phoneRegex.test(full)) return false;
    return full;
  }

  // تطبيع رقم الهاتف (إضافة رمز الدولة وإزالة الصفر البادئ)
  function normalizePhone(phone, countryCode = '+20') {
    let cleaned = phone.toString().replace(/[\s\-().]/g, '').replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    return countryCode + cleaned.replace(/^0+/, '');
  }

  // دالة مساعدة: تُرجع اسم الدولة من كودها
  function getCountryName(code) {
    const names = {
      '+20':'مصر','+966':'السعودية','+971':'الإمارات','+962':'الأردن','+961':'لبنان',
      '+963':'سوريا','+964':'العراق','+965':'الكويت','+968':'عُمان','+974':'قطر',
      '+973':'البحرين','+967':'اليمن','+249':'السودان','+212':'المغرب','+213':'الجزائر',
      '+216':'تونس','+218':'ليبيا','+1':'أمريكا/كندا','+44':'بريطانيا','+33':'فرنسا',
      '+49':'ألمانيا','+39':'إيطاليا','+34':'إسبانيا','+7':'روسيا','+86':'الصين',
      '+91':'الهند','+92':'باكستان','+55':'البرازيل','+81':'اليابان','+82':'كوريا الجنوبية',
      '+90':'تركيا','+98':'إيران','+62':'إندونيسيا','+60':'ماليزيا','+65':'سنغافورة',
      '+252':'الصومال','+254':'كينيا','+234':'نيجيريا','+27':'جنوب أفريقيا'
    };
    return names[code] || '';
  }

  // التحقق من الاسم: يجب أن يحتوي على حروف عربية أو إنجليزية
  function isValidName(name) {
    if (!name) return false;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) return false;
    // منع HTML/Script
    if (/<[^>]*>/.test(trimmed) || /javascript\s*:/i.test(trimmed)) return false;
    // يجب أن يحتوي على حرف واحد على الأقل (عربي أو إنجليزي)
    if (!/[\u0600-\u06FFa-zA-Z]/.test(trimmed)) return false;
    return true;
  }

  // ========== تحقق لحظي من المدخلات (يُظهر ✅ أو ❌ أثناء الكتابة) ==========

  function _setFieldState(inputId, hintId, ok, msg) {
    let el = document.getElementById(inputId);
    let hint = document.getElementById(hintId);
    if (el) { el.classList.toggle('v-ok', ok); el.classList.toggle('v-err', !ok && msg !== null); }
    if (hint && msg !== null) {
      hint.className = 'field-hint ' + (ok ? 'hint-ok' : 'hint-err');
      hint.innerHTML = ok
        ? '<i class="fas fa-check-circle"></i> ' + msg
        : '<i class="fas fa-exclamation-circle"></i> ' + msg;
    }
  }

  function liveValidateName(inputId, hintId) {
    let val = (document.getElementById(inputId) || {value:''}).value.trim();
    if (!val) { _setFieldState(inputId, hintId, false, null); return; }
    if (val.length < 2) return _setFieldState(inputId, hintId, false, 'الاسم قصير جداً (2 حروف على الأقل)');
    if (val.length > 50) return _setFieldState(inputId, hintId, false, 'الاسم طويل جداً (50 حرف كحد أقصى)');
    if (/<[^>]*>|javascript\s*:/i.test(val)) return _setFieldState(inputId, hintId, false, 'الاسم يحتوي على محتوى غير مسموح');
    if (!/[\u0600-\u06FFa-zA-Z]/.test(val)) return _setFieldState(inputId, hintId, false, 'يجب أن يحتوي الاسم على حروف');
    _setFieldState(inputId, hintId, true, 'الاسم صحيح ✓');
  }

  function liveValidatePhone(inputId, codeId, hintId) {
    let phone = (document.getElementById(inputId) || {value:''}).value.trim();
    let code  = (document.getElementById(codeId)  || {value:'+20'}).value;
    if (!phone) { _setFieldState(inputId, hintId, false, null); return; }
    let result = validatePhone(phone, code);
    if (result) {
      _setFieldState(inputId, hintId, true, 'رقم الهاتف صحيح ✓');
    } else {
      let prefixes = (COUNTRY_PREFIX_MAP[code] || []).slice(0,3).join('، ');
      let country = getCountryName(code);
      let msg = prefixes ? 'رقم غير صحيح لـ' + country + ' — يجب أن يبدأ بـ: ' + prefixes + '...' : 'رقم الهاتف غير صحيح — تأكد من اختيار الدولة';
      _setFieldState(inputId, hintId, false, msg);
    }
  }

  function liveValidateEmail(inputId, hintId) {
    let val = (document.getElementById(inputId) || {value:''}).value.trim();
    if (!val) { _setFieldState(inputId, hintId, false, null); return; }
    validateEmail(val)
      ? _setFieldState(inputId, hintId, true, 'البريد الإلكتروني صحيح ✓')
      : _setFieldState(inputId, hintId, false, 'صيغة البريد غير صحيحة — مثال: name@gmail.com');
  }

  // عداد حروف textarea في فورم التقييم
  document.addEventListener('DOMContentLoaded', function() {
    let msgEl = document.getElementById('fbMessage');
    let cntEl = document.getElementById('fbMsgCount');
    if (msgEl && cntEl) {
      msgEl.addEventListener('input', function() { cntEl.textContent = this.value.length; });
    }
  });

  function xorEncryptDecrypt(str, key = "Falak2024!@#") {
    let result = "";
    for (let i = 0; i < str.length; i++) {
      let charCode = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  // ====== صلاحيات المشرف عبر حساب Google (لا يوجد كلمات مرور في الكود) ======
  // المشرفون يُحدَّدون عبر مجموعة Firestore: admin_accounts (key = email, fields: { email, role: 'admin'|'super_admin', addedAt, addedBy })
  const ADMIN_ACCOUNTS_COL = "admin_accounts";
  function _normEmail(e){ return (e||"").toString().trim().toLowerCase(); }

  // ====== مفتاح الذكاء الاصطناعي (يُحفظ على السيرفر في Firestore: system/ai_settings) ======
  // قابل للتغيير من قائمة الترس بواسطة المشرف فقط، بدون لمس الكود.
  const AI_KEY_DEFAULT = "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";
  let _currentAiKey = AI_KEY_DEFAULT;
  let _aiKeyUnsub = null;
  function _maskKey(k){
    const s = (k || "").toString();
    if (s.length <= 10) return s ? s[0] + "••••" : "(غير محدّد)";
    return s.slice(0, 5) + "•".repeat(Math.min(20, Math.max(6, s.length - 10))) + s.slice(-5);
  }
  function getAiApiKey(){ return (_currentAiKey && String(_currentAiKey).trim()) || AI_KEY_DEFAULT; }
  function listenAiKey(){
    try {
      if (_aiKeyUnsub) { _aiKeyUnsub(); _aiKeyUnsub = null; }
      _aiKeyUnsub = db.collection("system").doc("ai_settings").onSnapshot(
        snap => {
          const d = snap.exists ? (snap.data() || {}) : {};
          _currentAiKey = (d.groqApiKey && String(d.groqApiKey).trim()) || AI_KEY_DEFAULT;
          const disp = document.getElementById("currentAiKeyDisplay");
          if (disp) disp.textContent = _maskKey(_currentAiKey);
        },
        err => { console.warn("ai_settings listener err", err); }
      );
    } catch(e){ console.warn("listenAiKey failed", e); }
  }
  async function loadAiKeyOnce(){
    try {
      const snap = await db.collection("system").doc("ai_settings").get();
      const d = snap.exists ? (snap.data() || {}) : {};
      _currentAiKey = (d.groqApiKey && String(d.groqApiKey).trim()) || AI_KEY_DEFAULT;
    } catch(e){ console.warn("loadAiKeyOnce failed", e); }
  }
  function openAiKeyModal(){
    if (!isAdmin) { SoundEffects && SoundEffects.error && SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    const disp = document.getElementById("currentAiKeyDisplay");
    if (disp) disp.textContent = _maskKey(_currentAiKey);
    const inp = document.getElementById("newAiKeyInput");
    if (inp) { inp.value = ""; inp.type = "password"; }
    const eye = document.getElementById("aiKeyEyeIcon"); if (eye) { eye.classList.remove("fa-eye-slash"); eye.classList.add("fa-eye"); }
    document.getElementById("aiKeyModal").classList.add("active");
  }
  function closeAiKeyModal(){ document.getElementById("aiKeyModal").classList.remove("active"); }
  function toggleAiKeyVisibility(){
    const inp = document.getElementById("newAiKeyInput"); if (!inp) return;
    const eye = document.getElementById("aiKeyEyeIcon");
    if (inp.type === "password") { inp.type = "text"; eye && eye.classList.remove("fa-eye"); eye && eye.classList.add("fa-eye-slash"); }
    else { inp.type = "password"; eye && eye.classList.remove("fa-eye-slash"); eye && eye.classList.add("fa-eye"); }
  }
  function _validateGroqKeyShape(k){
    const v = (k || "").trim();
    if (!v) return "اكتب المفتاح أولاً";
    if (v.length < 20) return "المفتاح قصير جداً (تأكد من نسخه كاملاً)";
    if (!/^gsk_/i.test(v)) return "المفتاح المتوقع يبدأ بـ gsk_";
    if (/\s/.test(v)) return "المفتاح يحتوي على مسافات";
    return null;
  }
  async function saveAiKey(){
    if (!isAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    const inp = document.getElementById("newAiKeyInput");
    const v = (inp && inp.value || "").trim();
    const err = _validateGroqKeyShape(v);
    if (err) { SoundEffects.error(); showToast("⚠️ " + err); return; }
    try {
      await db.collection("system").doc("ai_settings").set({
        groqApiKey: v,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: _normEmail(auth.currentUser && auth.currentUser.email) || "unknown"
      }, { merge: true });
      _currentAiKey = v;
      const disp = document.getElementById("currentAiKeyDisplay");
      if (disp) disp.textContent = _maskKey(v);
      if (inp) inp.value = "";
      SoundEffects.success();
      showToast("✅ تم حفظ المفتاح الجديد على السيرفر");
    } catch(e){
      console.error("saveAiKey err", e);
      let msg = "❌ فشل الحفظ";
      const code = (e && (e.code || e.message)) || "";
      if (/permission|denied|insufficient/i.test(code)) {
        msg = "❌ صلاحيات Firestore لا تسمح بالكتابة في system/ai_settings";
      }
      showToast(msg);
    }
  }
  async function testAiKey(){
    if (!isAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    const inp = document.getElementById("newAiKeyInput");
    const candidate = (inp && inp.value || "").trim() || _currentAiKey;
    const err = _validateGroqKeyShape(candidate);
    if (err) { SoundEffects.error(); showToast("⚠️ " + err); return; }
    showToast("⏳ جاري اختبار المفتاح...");
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + candidate, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      });
      if (r.ok) { SoundEffects.success(); showToast("✅ المفتاح يعمل بنجاح"); }
      else if (r.status === 401) { SoundEffects.error(); showToast("❌ المفتاح غير صالح (401)"); }
      else if (r.status === 429) { SoundEffects.error(); showToast("⚠️ المفتاح صالح لكن تجاوز الحد المسموح (429)"); }
      else { SoundEffects.error(); showToast("❌ فشل الاختبار (HTTP " + r.status + ")"); }
    } catch(e){ console.error(e); SoundEffects.error(); showToast("❌ فشل الاتصال بالسيرفر"); }
  }
  async function resetAiKey(){
    if (!isAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    if (!confirm("هل تريد إرجاع المفتاح إلى القيمة الافتراضية؟")) return;
    try {
      await db.collection("system").doc("ai_settings").set({
        groqApiKey: AI_KEY_DEFAULT,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: _normEmail(auth.currentUser && auth.currentUser.email) || "unknown"
      }, { merge: true });
      _currentAiKey = AI_KEY_DEFAULT;
      const disp = document.getElementById("currentAiKeyDisplay"); if (disp) disp.textContent = _maskKey(AI_KEY_DEFAULT);
      SoundEffects.success(); showToast("✅ تم إرجاع المفتاح الافتراضي");
    } catch(e){ console.error(e); SoundEffects.error(); showToast("❌ فشل الإرجاع"); }
  }
  window.openAiKeyModal = openAiKeyModal;
  window.closeAiKeyModal = closeAiKeyModal;
  window.toggleAiKeyVisibility = toggleAiKeyVisibility;
  window.saveAiKey = saveAiKey;
  window.testAiKey = testAiKey;
  window.resetAiKey = resetAiKey;


  const MAX_VIDEO_SIZE = 104857600;
  const CHUNK_SIZE = 10485760;
  const MAX_STORAGE = 26843545600;
  const STORAGE_KEY = "falak_last_watched";

  // ========== Helper Functions ==========
  function showToast(msg) { const t = document.getElementById("toast"); t && (t.textContent = msg, t.classList.add("show"), setTimeout(() => t.classList.remove("show"), 4000)); }
  function formatDuration(sec) { if (!sec && sec !== 0) return "0:00"; const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ":" + (s < 10 ? "0" : "") + s; }
  function formatSize(b) { return b ? b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB" : "0 B"; }
  function escapeHtml(unsafe) { const div = document.createElement("div"); div.textContent = unsafe; return div.innerHTML; }

  // ========== Sound Effects (مبسط) ==========
  const SoundEffects = {
    audioContext: null,
    init() { if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); },
    send() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.setValueAtTime(800, this.audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.1); g.gain.setValueAtTime(0.3, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1); o.start(); o.stop(this.audioContext.currentTime + 0.1); },
    receive() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.setValueAtTime(600, this.audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.15); g.gain.setValueAtTime(0.3, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15); o.start(); o.stop(this.audioContext.currentTime + 0.15); },
    delete() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.setValueAtTime(400, this.audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.2); g.gain.setValueAtTime(0.3, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2); o.start(); o.stop(this.audioContext.currentTime + 0.2); },
    success() { this.init(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.value = f; g.gain.setValueAtTime(0, this.audioContext.currentTime + 0.05 * i); g.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.05 * i + 0.02); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05 * i + 0.15); o.start(this.audioContext.currentTime + 0.05 * i); o.stop(this.audioContext.currentTime + 0.05 * i + 0.15); }); },
    error() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.type = "sawtooth"; o.frequency.setValueAtTime(200, this.audioContext.currentTime); o.frequency.linearRampToValueAtTime(150, this.audioContext.currentTime + 0.1); g.gain.setValueAtTime(0.3, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2); o.start(); o.stop(this.audioContext.currentTime + 0.2); },
    tick() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.value = 600; g.gain.setValueAtTime(0.1, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.03); o.start(); o.stop(this.audioContext.currentTime + 0.03); },
    recordStart() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.value = 1000; g.gain.setValueAtTime(0.2, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1); o.start(); o.stop(this.audioContext.currentTime + 0.1); },
    recordStop() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.value = 500; g.gain.setValueAtTime(0.2, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1); o.start(); o.stop(this.audioContext.currentTime + 0.1); },
    join() { this.init(); const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.2, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2); o.start(); o.stop(this.audioContext.currentTime + 0.2); }
  };

  // ========== User Data Management ==========
  async function loadUserDataFromFirebase(userId) { try { const userDoc = await db.collection("user_progress").doc(userId).get(); if (userDoc.exists) { const data = userDoc.data(); if (data.username) currentUser = data.username; if (data.phone) currentUserPhone = data.phone; if (data.voiceSettings) voiceSettings = data.voiceSettings; if (data.lastWatched) { lastWatchedData = data.lastWatched; setTimeout(() => checkForResume(), 1000); } if (currentUser) localStorage.setItem("falak_username", currentUser); if (currentUserPhone) localStorage.setItem("falak_userphone", currentUserPhone); return true; } } catch (e) { console.error("Error loading user data:", e); } return false; }
  async function saveUserDataToFirebase(userId) { if (!userId) return; try { const data = {}; if (currentUser) data.username = currentUser; if (currentUserPhone) data.phone = currentUserPhone; if (voiceSettings) data.voiceSettings = voiceSettings; if (lastWatchedData) data.lastWatched = lastWatchedData; data.lastUpdated = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("user_progress").doc(userId).set(data, { merge: true }); if (currentUser) localStorage.setItem("falak_username", currentUser); if (currentUserPhone) localStorage.setItem("falak_userphone", currentUserPhone); } catch (e) { console.error("Error saving user data:", e); } }
  async function saveWatchProgressToFirebase(userId, videoId, currentTime, duration) { if (!userId || !videoId) return; try { const watchData = { videoId, title: videos.find(v => v.id === videoId)?.title || "", currentTime, duration, timestamp: Date.now() }; await db.collection("user_progress").doc(userId).set({ lastWatched: watchData, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); lastWatchedData = watchData; } catch (e) { console.error("Error saving watch progress:", e); } }

  // ====== تسجيل مشاهدة فيديو (موحّد لكل أنواع الفيديوهات) ======
  // يستخدم Doc ID ثابت = userId_videoId لمنع التكرار، ويعمل بدون قراءة سابقة
  // ويتعامل مع فيديوهات YouTube والفيديوهات العادية بنفس الطريقة.
  let __markingWatched = new Set();
  async function markVideoAsWatched(videoId) {
    try {
      // ضمان إن currentUserId موجود من Firebase Auth
      if (!currentUserId && auth && auth.currentUser) {
        currentUserId = auth.currentUser.uid;
      }
      if (!currentUserId || !videoId) return;
      const key = currentUserId + "_" + videoId;
      if (__markingWatched.has(key)) return;
      __markingWatched.add(key);
      const docRef = db.collection("watch_history").doc(key);
      const existing = await docRef.get();
      if (existing.exists) { __markingWatched.delete(key); return; }
      await docRef.set({
        userId: currentUserId,
        videoId: videoId,
        title: (videos.find(v => v.id === videoId) || {}).title || "",
        watchedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // ====== ضمان وجود ملف الطالب في user_progress ======
      // إذا كان المشرف قد حذف ملف الطالب سابقاً، نُعيد إنشاءه تلقائياً
      // عند تسجيل أي مشاهدة جديدة حتى يظهر الطالب مرة أخرى في قائمة المتابعة.
      try {
        const userPatch = { lastUpdated: firebase.firestore.FieldValue.serverTimestamp() };
        if (currentUser) userPatch.username = currentUser;
        if (currentUserPhone) userPatch.phone = currentUserPhone;
        try {
          const au = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : null;
          if (au) {
            if (au.email) userPatch.email = au.email;
            if (au.displayName && !userPatch.username) userPatch.username = au.displayName;
            if (au.photoURL) userPatch.photoURL = au.photoURL;
          }
        } catch(_){}
        await db.collection("user_progress").doc(currentUserId).set(userPatch, { merge: true });
      } catch (e) { console.warn("user_progress upsert (on watch) failed", e); }
      try { await addPoints(currentUserId, 5, "مشاهدة فيديو كاملة"); } catch (e) { console.warn("addPoints failed", e); }
      try {
        const enrollments = await db.collection("course_enrollments").where("userId", "==", currentUserId).get();
        for (const enroll of enrollments.docs) {
          const ed = enroll.data();
          const course = await db.collection("courses").doc(ed.courseId).get();
          if (course.exists && (course.data().videoIds || []).includes(videoId)) {
            if (!(ed.completedVideosIds || []).includes(videoId)) {
              const completed = (ed.completedVideos || 0) + 1;
              await enroll.ref.update({
                completedVideos: completed,
                completedVideosIds: firebase.firestore.FieldValue.arrayUnion(videoId)
              });
            }
          }
        }
      } catch (e) { console.warn("course progress update failed", e); }
      try { if (typeof showToast === "function") showToast("✅ تم تسجيل مشاهدة الفيديو في تقدمك"); } catch(_){}
      // ✅ تحديث بيانات تقدم الطالب إذا كان المودال مفتوح
      try {
        const progModal = document.getElementById('studentProgressModal');
        if (progModal && progModal.classList.contains('active') && typeof openStudentProgress === 'function') {
          setTimeout(openStudentProgress, 600);
        }
      } catch(_) {}
      __markingWatched.delete(key);
    } catch (e) {
      console.error("markVideoAsWatched failed:", e);
      try { __markingWatched.delete(currentUserId + "_" + videoId); } catch(_){}
    }
  }
  window.markVideoAsWatched = markVideoAsWatched;

  // ====== تحميل YouTube IFrame API مرة واحدة ======
  let __ytApiReadyPromise = null;
  function loadYouTubeAPI() {
    if (__ytApiReadyPromise) return __ytApiReadyPromise;
    __ytApiReadyPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      window.onYouTubeIframeAPIReady = function() { resolve(window.YT); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
    return __ytApiReadyPromise;
  }

  // ====== متتبع فيديوهات YouTube (يسجل المشاهدة عند 80% أو عند الانتهاء) ======
  let __ytPlayer = null;
  let __ytWatchTimer = null;
  function setupYouTubeProgressTracking(videoId) {
    if (__ytWatchTimer) { clearInterval(__ytWatchTimer); __ytWatchTimer = null; }
    if (__ytPlayer) { try { __ytPlayer.destroy(); } catch(_){} __ytPlayer = null; }
    loadYouTubeAPI().then((YT) => {
      const iframe = document.getElementById("videoPlayer");
      if (!iframe || iframe.tagName !== "IFRAME") return;
      try {
        __ytPlayer = new YT.Player(iframe, {
          events: {
            onStateChange: function(e) {
              if (e.data === YT.PlayerState.ENDED) {
                markVideoAsWatched(videoId);
              }
            }
          }
        });
        __ytWatchTimer = setInterval(() => {
          try {
            if (!__ytPlayer || typeof __ytPlayer.getCurrentTime !== "function") return;
            const cur = __ytPlayer.getCurrentTime() || 0;
            const dur = __ytPlayer.getDuration() || 0;
            if (dur > 0 && cur / dur >= 0.8) {
              markVideoAsWatched(videoId);
              clearInterval(__ytWatchTimer);
              __ytWatchTimer = null;
            }
          } catch(_){}
        }, 3000);
      } catch (e) { console.warn("YT.Player init failed:", e); }
    });
  }

  // ========== Voice Functions ==========
  function speakText(text) { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "ar-SA"; u.rate = voiceSettings.rate; u.pitch = voiceSettings.pitch; if (voiceSettings.voiceURI) { const v = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI); v && (u.voice = v); } window.speechSynthesis.speak(u); }
  function populateVoiceList() { const v = window.speechSynthesis.getVoices(), sel = document.getElementById("voiceSelect"); if (!sel) return; sel.innerHTML = ""; v.forEach(v => { const o = document.createElement("option"); o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o); }); voiceSettings.voiceURI && (sel.value = voiceSettings.voiceURI); }
  function saveVoiceSettings() { voiceSettings.voiceURI = document.getElementById("voiceSelect").value; voiceSettings.rate = parseFloat(document.getElementById("rateRange").value); voiceSettings.pitch = parseFloat(document.getElementById("pitchRange").value); localStorage.setItem("falak_voice_settings", JSON.stringify(voiceSettings)); if (currentUserId) saveUserDataToFirebase(currentUserId); closeVoiceSettings(); showToast("✅ تم حفظ إعدادات الصوت"); }
  function loadVoiceSettings() { const s = localStorage.getItem("falak_voice_settings"); if (s) try { voiceSettings = JSON.parse(s); document.getElementById("rateRange").value = voiceSettings.rate; document.getElementById("pitchRange").value = voiceSettings.pitch; document.getElementById("rateValue").textContent = voiceSettings.rate; document.getElementById("pitchValue").textContent = voiceSettings.pitch; } catch(e) {} }
  function openVoiceSettings() { populateVoiceList(); loadVoiceSettings(); document.getElementById("voiceSettingsModal").classList.add("active"); }
  function closeVoiceSettings() { document.getElementById("voiceSettingsModal").classList.remove("active"); }
  document.addEventListener("input", function(e) { if (e.target.id === "rateRange") document.getElementById("rateValue").textContent = e.target.value; else if (e.target.id === "pitchRange") document.getElementById("pitchValue").textContent = e.target.value; });

  // ========== Admin & UI ==========
async function updateAdminUI() {
    if (googleUser && googleUser.getIdTokenResult) {
        try {
            const tokenResult = await googleUser.getIdTokenResult();
            window.isAdminClaim = tokenResult.claims.admin === true;
        } catch(e) { console.warn("token error", e); }
    }
    if (window.isAdminClaim === true) isAdmin = true;

    const isGoogleUser = !!googleUser;
    const uploadZone = document.getElementById("uploadZone");
    const storageBar = document.getElementById("storageBar");

    // ===== بناء الـ menu من الصفر حسب نوع المستخدم =====
    const menu = document.getElementById("settingsMenu");
    if (menu) {
        menu.innerHTML = "";

        function addItem(id, icon, label, onclick, extraClass) {
            const d = document.createElement("div");
            d.className = "settings-menu-item" + (extraClass ? " " + extraClass : "");
            d.id = id;
            d.innerHTML = `<i class="${icon}"></i> ${label}`;
            if (onclick) d.addEventListener("click", onclick);
            menu.appendChild(d);
        }

        if (isAdmin) {
            // ===== أيتمز المشرف فقط =====
            if (!isPWAInstalled()) {
                addItem("installAppMenuItem","fas fa-download","تثبيت التطبيق", () => { menu.classList.remove("active"); installApp(); });
            }
            if (isGoogleUser) addItem("googleLogoutMenuItem","fab fa-google","تسجيل الخروج من جوجل", () => { menu.classList.remove("active"); googleLogout(); });
            addItem("setAdminsMenuItem","fas fa-users-cog","تحديد المشرفين", () => { menu.classList.remove("active"); openSetAdminsModal(); });
            addItem("aiKeyMenuItem","fas fa-key","مفتاح الذكاء الاصطناعي", () => { menu.classList.remove("active"); openAiKeyModal(); });
            addItem("teachAIMenuItem","fas fa-robot","تعليم الذكاء الاصطناعي", () => { menu.classList.remove("active"); openTeachAICircleModal(); });
            addItem("manageAppsMenuItem","fas fa-th-large","إدارة التطبيقات", () => { menu.classList.remove("active"); openManageAppsModal(); });
            addItem("viewFeedbacksMenuItem","fas fa-chart-simple","معرفة رأي الجمهور", () => { menu.classList.remove("active"); openViewFeedbacksModal(); });
            addItem("emailSettingsMenuItem","fas fa-envelope","إعدادات البريد الإلكتروني", () => { menu.classList.remove("active"); openEmailSettingsModal(); });
            addItem("zoomLinkMenuItem","fas fa-video","رابط Zoom للمحاضرات", () => { menu.classList.remove("active"); openZoomLinkSettings(); });
            addItem("supervisorPayoutMenuItem","fas fa-credit-card","ربط استلام المدفوعات (مشرف)", () => { menu.classList.remove("active"); openSupervisorPayoutModal(); });
            addItem("logoutMenuItem","fas fa-sign-out-alt","خروج المشرف", () => { menu.classList.remove("active"); logout(); });
            addItem("maintenanceMenuItem","fas fa-tools","تحديث المحتوى", () => { menu.classList.remove("active"); openMaintenanceModal(); });
            addItem("chatBgMenuItem","fas fa-palette","تغيير خلفية الدردشة", () => { menu.classList.remove("active"); openChatBgModal(); });
            if (isSuperAdmin) addItem("groupAdminMenuItem","fas fa-users-cog","إدارة المحادثة الجماعية", () => { menu.classList.remove("active"); openGroupChatAdminPanel(); });
            addItem("pdfFilesMenuItem","fas fa-file-pdf","إدارة ملفات PDF", () => { menu.classList.remove("active"); openPdfManagerModal(); });
            addItem("manageCoursesMenuItem","fas fa-graduation-cap","إدارة الكورسات", () => { menu.classList.remove("active"); showCoursesList(); });
            addItem("manageCertificatesMenuItem","fas fa-certificate","إدارة شهادات الكورسات", () => { menu.classList.remove("active"); openCertificatesManager(); });
            addItem("appsMenuItem","fas fa-th-large","تطبيقات المنصة", () => { menu.classList.remove("active"); openAppsModal(); });
            addItem("aiPersonaMenuItem","fas fa-user-astronaut","تغيير شخصية الذكاء الاصطناعي", () => { menu.classList.remove("active"); window.openPersonaModal && window.openPersonaModal(); });
            addItem("myToolsMenuItem","fas fa-toolbox","أدواتي 🛠️", () => { menu.classList.remove("active"); openToolsLibraryModal(); });

            if (uploadZone) uploadZone.classList.add("active");
            if (storageBar) storageBar.style.display = "block";
            updateStorageBar();
            loadAIKnowledgeFromFirebase();
            const cancelBtn = document.getElementById("cancelMaintenanceBtn");
            if (cancelBtn && document.getElementById("maintenanceOverlay")?.classList.contains("active")) cancelBtn.classList.add("active");
        } else {
            // ===== أيتمز المستخدم العادي فقط =====
            if (!isPWAInstalled()) {
                addItem("installAppMenuItem","fas fa-download","تثبيت التطبيق", () => { menu.classList.remove("active"); installApp(); });
            }
            addItem("smartLearnMenuItem","fas fa-brain","التعلم الذكي 🧠", () => { menu.classList.remove("active"); openSelfLearning(); }, "sl-menu-item");
            addItem("chatBgMenuItem","fas fa-palette","تغيير خلفية الدردشة", () => { menu.classList.remove("active"); openChatBgModal(); });
            addItem("appsMenuItem","fas fa-th-large","تطبيقات المنصة", () => { menu.classList.remove("active"); openAppsModal(); });
            addItem("aiPersonaMenuItem","fas fa-user-astronaut","تغيير شخصية الذكاء الاصطناعي", () => { menu.classList.remove("active"); window.openPersonaModal && window.openPersonaModal(); });
            addItem("myToolsMenuItem","fas fa-toolbox","أدواتي 🛠️", () => { menu.classList.remove("active"); openToolsLibraryModal(); });
            addItem("feedbackMenuItem","fas fa-star","تقييم المنصة", () => { menu.classList.remove("active"); openFeedbackModal(); });
            addItem("howToUseMenuItem","fas fa-circle-question","كيفية استخدام المنصة", () => { menu.classList.remove("active"); openHowToUseModal(); });
            if (isGoogleUser) addItem("googleLogoutMenuItem","fab fa-google","تسجيل الخروج من جوجل", () => { menu.classList.remove("active"); googleLogout(); });
            addItem("adminLoginMenuItem","fas fa-lock","دخول المشرف", () => { menu.classList.remove("active"); showLogin(); });

            if (uploadZone) uploadZone.classList.remove("active");
            if (storageBar) storageBar.style.display = "none";
        }
    }

    updateGoogleLogoutButtonsVisibility();
    const createCourseBtn = document.getElementById("createCourseBtn");
    if (createCourseBtn) createCourseBtn.style.display = isAdmin ? "inline-flex" : "none";
}
  function loadAdminPreference() {
    // محاولة عرض واجهة المشرف فوراً من الكاش (تجربة المستخدم)، ثم التحقق الحقيقي من Firestore
    if (localStorage.getItem("falak_admin") === "true") { isAdmin = true; updateAdminUI(); }
    try { refreshAdminStatusFromFirestore(); } catch(_){}
  }
  function updateGoogleLogoutButtonsVisibility() { const g1 = document.getElementById("googleLogoutBtn"); const g2 = document.getElementById("googleLogoutNavBtn"); if (g1) g1.style.display = (!isAdmin && googleUser) ? "block" : "none"; if (g2) g2.style.display = (!isAdmin && googleUser) ? "flex" : "none"; }

  // ✅ تحميل بيانات Dashboard الطالب
  async function loadUserDashboard() {
    if (!currentUserId) return;
    try {
      // عدد الفيديوهات المشاهدة
      const watchSnap = await db.collection("watch_history").where("userId", "==", currentUserId).get();
      const watchedCount = watchSnap.size;
      const watchedEl = document.getElementById("userWatchedVideos");
      if (watchedEl) watchedEl.textContent = watchedCount;

      // النقاط
      try {
        const ptDoc = await db.collection("user_points").doc(currentUserId).get();
        const pts = ptDoc.exists ? (ptDoc.data().points || 0) : 0;
        const ptEl = document.getElementById("userPoints");
        if (ptEl) ptEl.textContent = pts;
      } catch(e) {}

      // تقدم الكورسات
      const enrollSnap = await db.collection("course_enrollments").where("userId", "==", currentUserId).get();
      let courseHtml = "";
      for (const doc of enrollSnap.docs) {
        const ed = doc.data();
        const courseDoc = await db.collection("courses").doc(ed.courseId).get().catch(()=>null);
        if (!courseDoc || !courseDoc.exists) continue;
        const cd = courseDoc.data();
        const total = cd.videoIds ? cd.videoIds.length : (ed.totalVideos || 0);
        const done = ed.completedVideos || 0;
        const pct = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
        courseHtml += `<div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.4rem;font-size:.9rem">
            <span><i class="fas fa-graduation-cap" style="color:#6366f1"></i> ${escapeHtml(cd.title||'كورس')}</span>
            <span style="color:#10b981;font-weight:700">${pct}%</span>
          </div>
          <div style="background:rgba(255,255,255,.1);border-radius:6px;height:8px;overflow:hidden">
            <div style="height:100%;background:linear-gradient(90deg,#6366f1,#10b981);width:${pct}%;border-radius:6px;transition:width .5s"></div>
          </div>
          <div style="font-size:.75rem;color:#888;margin-top:.25rem">${done} من ${total} فيديو</div>
        </div>`;
      }
      const coursesList = document.getElementById("coursesProgressList");
      if (coursesList) coursesList.innerHTML = courseHtml || '<p style="color:#888;font-size:.85rem">لم تسجّل في أي كورس بعد</p>';

      // آخر النشاطات (آخر 5 فيديوهات مشاهدة)
      const recent = [];
      watchSnap.forEach(d => recent.push(d.data()));
      recent.sort((a, b) => {
        const ta = a.watchedAt ? a.watchedAt.toDate().getTime() : 0;
        const tb = b.watchedAt ? b.watchedAt.toDate().getTime() : 0;
        return tb - ta;
      });
      let actHtml = "";
      for (const r of recent.slice(0, 5)) {
        const v = (videos || []).find(x => x.id === r.videoId);
        const title = v ? v.title : (r.title || 'فيديو');
        const dateStr = r.watchedAt ? r.watchedAt.toDate().toLocaleDateString("ar-EG", {day:"numeric",month:"short"}) : '';
        actHtml += `<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
          <span style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-check" style="font-size:.75rem"></i></span>
          <span style="flex:1;font-size:.85rem;color:#ddd">${escapeHtml(title)}</span>
          <span style="font-size:.75rem;color:#888">${dateStr}</span>
        </div>`;
      }
      const actEl = document.getElementById("recentActivities");
      if (actEl) actEl.innerHTML = actHtml || '<p style="color:#888;font-size:.85rem">لا يوجد نشاط بعد</p>';

    } catch(e) { console.warn("loadUserDashboard failed", e); }
  }

  function listenToVideosWithRetry(maxAttempts = 5) {
    if (unsubscribeVideos) unsubscribeVideos();
    let attempt = 0;
    const attemptFn = () => {
      attempt++;
      unsubscribeVideos = db.collection("videos").orderBy("createdAt", "asc").onSnapshot(snap => {
        videos = [];
        snap.forEach(d => {
          let v = d.data();
          v.id = d.id;
          videos.push(v);
        });
        if (isLoadingVideos) isLoadingVideos = false;
        loadAttemptFailed = false;
        renderVideos();
        updateStorageBar();
        checkForResume();
        checkUrlForShare();
        if (attempt > 1) showToast("✅ تم استعادة الاتصال بقاعدة البيانات");
      }, err => {
        console.error("Error loading videos (attempt " + attempt + "):", err);
        if (attempt < maxAttempts) {
          setTimeout(attemptFn, 3000 * attempt);
        } else {
          isLoadingVideos = false;
          loadAttemptFailed = true;
          renderVideos(); 
          showToast("⚫ تعذر الاتصال بالخادم. يبدو أن الثقب الأسود ابتلع البيانات!");
        }
      });
    };
    attemptFn(); 
  }

  // ===== Listen to courses to know which videos are locked behind a paid course =====
  function listenToCoursesAccess() {
    if (unsubscribeCoursesAccess) unsubscribeCoursesAccess();
    unsubscribeCoursesAccess = db.collection("courses").onSnapshot(snap => {
      const paidSet = new Set();
      const freeSet = new Set();
      const paidArr = [];
      snap.forEach(d => {
        const c = d.data() || {};
        const ids = Array.isArray(c.videoIds) ? c.videoIds : [];
        const isPaid = (c.price || 0) > 0;
        ids.forEach(id => {
          if (isPaid) paidSet.add(id);
          else freeSet.add(id);
        });
        // كل الكورسات تظهر كبطاقات في المكتبة (مدفوعة ومجانية)
        if (ids.length) {
          paidArr.push({ id: d.id, title: c.title || 'كورس بدون اسم', videoIds: ids, price: c.price || 0, imageUrl: c.imageUrl || "" });
        }
      });
      paidCourseVideoIds = paidSet;
      freeCourseVideoIds = freeSet;
      paidCoursesData = paidArr;
      // زرار الكورسات اتشال
      renderVideos();
    }, err => console.error("Error loading courses access:", err));
  }
  // ===== Listen to current user's enrollments to unlock paid course videos =====
  function listenToUserEnrollmentsAccess() {
    if (unsubscribeUserEnrollmentsAccess) unsubscribeUserEnrollmentsAccess();
    if (!currentUserId) { userUnlockedVideoIds = new Set(); renderVideos(); return; }
    unsubscribeUserEnrollmentsAccess = db.collection("course_enrollments")
      .where("userId", "==", currentUserId)
      .onSnapshot(async snap => {
        try {
          const courseIds = [];
          snap.forEach(d => { const data = d.data() || {}; if (data.courseId) courseIds.push(data.courseId); });
          const unlocked = new Set();
          // Fetch each enrolled course and union its videoIds
          const fetches = courseIds.map(cid => db.collection("courses").doc(cid).get().catch(() => null));
          const docs = await Promise.all(fetches);
          docs.forEach(doc => {
            if (!doc || !doc.exists) return;
            const ids = (doc.data() && doc.data().videoIds) || [];
            ids.forEach(id => unlocked.add(id));
          });
          userUnlockedVideoIds = unlocked;
          renderVideos();
        } catch (e) {
          console.error("Error computing unlocked videos:", e);
        }
      }, err => console.error("Error loading user enrollments:", err));
  }
  function stopUserEnrollmentsAccess() {
    if (unsubscribeUserEnrollmentsAccess) { unsubscribeUserEnrollmentsAccess(); unsubscribeUserEnrollmentsAccess = null; }
    userUnlockedVideoIds = new Set();
    renderVideos();
  }
  // Helper: should this video be hidden from the current viewer?
  function isVideoHiddenForViewer(v) {
    // Never hide paid videos - show with locked overlay instead
    return false;
  }
  // Helper: is this video locked (paid) for the current user?
  function isPaidLockedForViewer(v) {
    if (isAdmin) return false;
    if (!v || !v.id) return false;
    if (!paidCourseVideoIds.has(v.id)) return false;
    if (freeCourseVideoIds.has(v.id)) return false;
    return !userUnlockedVideoIds.has(v.id);
  }
  // Get the paid course data for a video (first match)
  function getPaidCourseForVideo(videoId) {
    return paidCoursesData.find(c => c.videoIds.includes(videoId)) || null;
  }

  function loadExamsFromFirebase() { unsubscribeExams && unsubscribeExams(); unsubscribeExams = db.collection("exams").onSnapshot(snap => { exams = []; snap.forEach(d => exams.push({ id: d.id, ...d.data() })); renderVideos(); }, e => console.error("Error loading exams:", e)); }
  function loadExamResultsFromFirebase() { unsubscribeExamResults && unsubscribeExamResults(); unsubscribeExamResults = db.collection("exam_results").orderBy("submittedAt", "desc").onSnapshot(snap => { examResults = []; snap.forEach(d => examResults.push({ id: d.id, ...d.data() })); }, e => console.error("Error loading exam results:", e)); }
  function loadAIKnowledgeFromFirebase() { unsubscribeAIKnowledge && unsubscribeAIKnowledge(); unsubscribeAIKnowledge = db.collection("ai_knowledge").orderBy("createdAt", "desc").onSnapshot(snap => { aiKnowledgeBase = []; snap.forEach(d => aiKnowledgeBase.push({ id: d.id, ...d.data() })); if (isAdmin && document.getElementById("teachAICircleModal")?.classList.contains("active")) renderAIKnowledgeList(); }, e => console.error("Error loading AI knowledge:", e)); }
  function listenToMaintenance() { unsubscribeMaintenance && unsubscribeMaintenance(); unsubscribeMaintenance = db.collection("system").doc("maintenance").onSnapshot(doc => { if (doc.exists && doc.data().status === "maintenance") { maintenanceEndTime = doc.data().endTime ? doc.data().endTime.toDate() : null; showMaintenanceScreen(doc.data().message || "جاري تحديث المنصة...", maintenanceEndTime); } else hideMaintenanceScreen(); }, e => console.error("Error listening to maintenance:", e)); }
  function showMaintenanceScreen(msg, end) { const ov = document.getElementById("maintenanceOverlay"), msgEl = document.getElementById("maintenanceMessage"), cancelBtn = document.getElementById("cancelMaintenanceBtn"), endEl = document.getElementById("maintenanceEndTime"); document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; if (ov && !ov._scrollLocked) { ov._scrollLocked = true; ov.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true }); } ov && msgEl && cancelBtn && (msgEl.textContent = msg, ov.classList.add("active"), cancelBtn.classList.toggle("active", isAdmin), maintenanceTimerInterval && clearInterval(maintenanceTimerInterval), end && (maintenanceTimerInterval = setInterval(() => { const now = Date.now(), diff = end.getTime() - now; if (diff <= 0) { clearInterval(maintenanceTimerInterval); autoEndMaintenance(); return; } updateTimerDisplay(diff); }, 1000)), tickInterval || (tickInterval = setInterval(() => SoundEffects.tick(), 1000)), endEl && (endEl.textContent = "ينتهي عند: " + end.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))); }
  function hideMaintenanceScreen() { const ov = document.getElementById("maintenanceOverlay"); ov && ov.classList.remove("active"); document.body.style.overflow = ""; document.documentElement.style.overflow = ""; maintenanceTimerInterval && (clearInterval(maintenanceTimerInterval), maintenanceTimerInterval = null); tickInterval && (clearInterval(tickInterval), tickInterval = null); }
  function updateTimerDisplay(ms) { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); const elH = document.getElementById("timerHours"); elH && (elH.textContent = h.toString().padStart(2, "0")); const elM = document.getElementById("timerMinutes"); elM && (elM.textContent = m.toString().padStart(2, "0")); const elS = document.getElementById("timerSeconds"); elS && (elS.textContent = s.toString().padStart(2, "0")); }
  function autoEndMaintenance() { SoundEffects.success(); db.collection("system").doc("maintenance").update({ status: "active" }).catch(console.error); }
  function openMaintenanceModal() { isAdmin && (document.getElementById("maintenanceModal").classList.add("active"), document.getElementById("maintenanceMinutes").value = 5, document.getElementById("maintenanceMessageInput").value = ""); }
  function closeMaintenanceModal() { document.getElementById("maintenanceModal").classList.remove("active"); }

  // ============================================================
  // CHAT BACKGROUND CHANGER
  // ============================================================
  const CHAT_BACKGROUNDS = {
    ai: [
      { id:'ai1', name:'كون أزرق', style:'linear-gradient(160deg,#0a0a2e 0%,#0d1b4b 40%,#0a2a4a 100%)' },
      { id:'ai2', name:'مجرة بنفسجية', style:'linear-gradient(135deg,#0f0a1a 0%,#1a0a2e 50%,#2d1b4e 100%)' },
      { id:'ai3', name:'شفق قطبي', style:'linear-gradient(160deg,#001a0a 0%,#003320 50%,#001433 100%)' },
      { id:'ai4', name:'غروب فضائي', style:'linear-gradient(160deg,#1a0a0a 0%,#2e0d1a 50%,#1a0a2e 100%)' },
      { id:'ai5', name:'ثقب أسود', style:'radial-gradient(ellipse at center,#0a0a0a 0%,#1a0a2e 40%,#0a0a0a 100%)' },
    ],
    public: [
      { id:'pub1', name:'فضاء نجمي', style:'linear-gradient(135deg,#03030a 0%,#0f0a1a 50%,#1a1a3e 100%)' },
      { id:'pub2', name:'سديم وردي', style:'linear-gradient(135deg,#1a0a1a 0%,#2e0a2e 50%,#1a1a3e 100%)' },
      { id:'pub3', name:'مريخ', style:'linear-gradient(160deg,#2e1a0a 0%,#3e1a0a 50%,#1a0a0a 100%)' },
      { id:'pub4', name:'المحيط الكوني', style:'linear-gradient(160deg,#000a1a 0%,#001a2e 50%,#000a1a 100%)' },
      { id:'pub5', name:'ليلة صافية', style:'linear-gradient(180deg,#050308 0%,#0a0a1a 60%,#050308 100%)' },
    ],
    private: [
      { id:'prv1', name:'فجر الكون', style:'linear-gradient(135deg,#1a0a2e 0%,#ff6b35 40%,#f7c59f 100%)' },
      { id:'prv2', name:'مياه عميقة', style:'linear-gradient(160deg,#001a2e 0%,#006994 50%,#001a1a 100%)' },
      { id:'prv3', name:'غابة ليلية', style:'linear-gradient(160deg,#0a1a0a 0%,#1a3a1a 45%,#0a0a1a 100%)' },
      { id:'prv4', name:'لهب بارد', style:'linear-gradient(135deg,#0a0a2e 0%,#1a0a4e 40%,#4e0a1a 100%)' },
      { id:'prv5', name:'ذهب داكن', style:'linear-gradient(160deg,#1a1200 0%,#3d2e00 50%,#1a0e00 100%)' },
    ]
  };
  const BG_STORAGE_KEY_PREFIX = 'falak_chat_bg_';
  let currentBgTab = 'ai';

  function getBgStorageKey(forUid) {
    // مفتاح خاص بكل مستخدم — دايماً نستخدم الـ uid الفعلي لتجنب التداخل بين الحسابات
    const uid = forUid || currentUserId || (typeof currentUser !== 'undefined' && currentUser ? 'local_' + currentUser : 'guest');
    return BG_STORAGE_KEY_PREFIX + uid;
  }
  function getChatBgSettings() {
    try { return JSON.parse(localStorage.getItem(getBgStorageKey()) || '{}'); } catch(e) { return {}; }
  }
  function saveChatBgSetting(type, bgStyle) {
    const s = getChatBgSettings();
    s[type] = bgStyle;
    localStorage.setItem(getBgStorageKey(), JSON.stringify(s));
    applyChatBg(type, bgStyle);
  }
  function applyChatBg(type, bgStyle) {
    const targets = { ai: '#aiChatMessages', public: '#chatMessages', private: '#pacMessages' };
    const el = document.querySelector(targets[type]);
    if (el) el.style.background = bgStyle || '';
  }
  function applyAllChatBgs() {
    const s = getChatBgSettings();
    Object.keys(s).forEach(t => applyChatBg(t, s[t]));
  }
  // مسح خلفيات الدردشة من الشاشة فوراً عند تسجيل الخروج (بدون حذف الإعدادات من localStorage)
  function clearAllChatBgsFromScreen() {
    ['ai', 'public', 'private'].forEach(t => applyChatBg(t, ''));
  }
  function openChatBgModal() {
    document.getElementById('chatBgModal').classList.add('active');
    switchBgTab('ai', document.querySelector('.chat-bg-tab'));
  }
  function closeChatBgModal() { document.getElementById('chatBgModal').classList.remove('active'); }
  function switchBgTab(tab, el) {
    currentBgTab = tab;
    document.querySelectorAll('.chat-bg-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderBgGrid();
  }
  function renderBgGrid() {
    const grid = document.getElementById('chatBgGrid');
    if (!grid) return;
    const bgs = CHAT_BACKGROUNDS[currentBgTab];
    const saved = getChatBgSettings()[currentBgTab] || '';
    grid.innerHTML = bgs.map(bg => {
      const esc = bg.style.replace(/'/g, String.fromCharCode(92)+String.fromCharCode(39));
      return '<div class="chat-bg-item '+(saved===bg.style?'selected':'')+'" '
        + 'style="background:'+bg.style+'" '
        + 'onmouseenter="previewChatBg(\'' + currentBgTab + '\',\''+esc+'\');return false" '
        + 'onmouseleave="cancelPreviewChatBg(\'' + currentBgTab + '\')" '
        + 'onclick="selectChatBg(\'' + bg.id + '\',\'' + currentBgTab + '\',\''+esc+'\',this)">'
        + '<span>'+bg.name+'</span></div>';
    }).join('');
  }
  let _previewBgPrev = {};
  function previewChatBg(type, style) {
    const targets = { ai: '#aiChatMessages', public: '#chatMessages', private: '#pacMessages' };
    const el = document.querySelector(targets[type]);
    if (!el) return;
    _previewBgPrev[type] = el.style.background;
    el.style.transition = 'background .25s ease';
    el.style.background = style;
  }
  function cancelPreviewChatBg(type) {
    const saved = getChatBgSettings()[type] || '';
    const targets = { ai: '#aiChatMessages', public: '#chatMessages', private: '#pacMessages' };
    const el = document.querySelector(targets[type]);
    if (!el) return;
    el.style.transition = 'background .25s ease';
    el.style.background = saved || '';
  }
  function selectChatBg(id, type, style, el) {
    document.querySelectorAll('#chatBgGrid .chat-bg-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    const tgts = { ai: '#aiChatMessages', public: '#chatMessages', private: '#pacMessages' };
    const tgt = document.querySelector(tgts[type]);
    if (tgt) { tgt.style.transition = 'background .3s ease'; tgt.style.background = style; }
    saveChatBgSetting(type, style);
    showToast('✅ تم تغيير الخلفية');
  }
  function resetChatBg() {
    const s = getChatBgSettings();
    delete s[currentBgTab];
    localStorage.setItem(getBgStorageKey(), JSON.stringify(s));
    applyChatBg(currentBgTab, '');
    renderBgGrid();
    showToast('✅ تمت إعادة الخلفية الافتراضية');
  }
  // Apply on page load — بيتأجل عشان currentUserId يكون جاهز بعد تسجيل الدخول
  // تم استبدال setTimeout هنا بحدث userLoggedIn أسفل
  // ============================================================
  function startMaintenance() { if (!isAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; } let minutes = parseInt(document.getElementById("maintenanceMinutes").value) || 5; if (minutes < 1 || minutes > 10080) { showToast("❌ المدة يجب أن تكون بين 1 و 10080 دقيقة (أسبوع)"); return; } let msg = document.getElementById("maintenanceMessageInput").value.trim() || "جاري تحديث المحتوى، يرجى الانتظار..."; let end = new Date(Date.now() + minutes * 60 * 1000); db.collection("system").doc("maintenance").set({ status: "maintenance", endTime: firebase.firestore.Timestamp.fromDate(end), message: msg }, { merge: true }).then(() => { SoundEffects.recordStart(); showToast("✅ تم بدء التحديث"); closeMaintenanceModal(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل بدء التحديث"); }); }
  function cancelMaintenance() { isAdmin ? (confirm("هل أنت متأكد؟") && db.collection("system").doc("maintenance").update({ status: "active" }).then(() => { SoundEffects.success(); showToast("✅ تم إلغاء التحديث"); }).catch(e => { SoundEffects.error(); showToast("❌ فشل إلغاء التحديث"); })) : showToast("❌ المشرف فقط يستطيع إلغاء التحديث"); }
  function updateStorageBar() { if (!isAdmin) return; let used = videos.reduce((acc, v) => acc + (v.size || 0), 0); let percent = Math.min(used / MAX_STORAGE * 100, 100); let remaining = MAX_STORAGE - used; document.getElementById("usedSpace").textContent = (used / 1073741824).toFixed(2) + " GB"; document.getElementById("percentage").textContent = percent.toFixed(2) + "%"; document.getElementById("remainingText").textContent = "المتبقي: " + (remaining / 1073741824).toFixed(2) + " GB"; document.getElementById("videosCount").textContent = videos.length + " فيديو"; let bar = document.getElementById("storageProgress"); bar.style.width = percent + "%"; bar.classList.remove("low", "medium", "high"); if (percent < 50) bar.classList.add("low"); else if (percent < 80) bar.classList.add("medium"); else bar.classList.add("high"); document.getElementById("storageBar").style.display = "block"; }


  // ========== Cloudinary Widget Helpers ==========
  function _buildWidgetConfig() {
    return {
      cloudName: CLOUDINARY_CONFIG.cloudName,
      uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
      apiKey: CLOUDINARY_CONFIG.apiKey,
      sources: ["local", "url", "camera"],
      resourceType: "video",
      maxFileSize: 104857600,
      language: "ar",
      text: {
        "ar": {
          "or": "أو",
          "back": "رجوع",
          "close": "إغلاق",
          "no_results": "لا توجد نتائج",
          "upload_more": "رفع المزيد",
          "done": "تم",
          "local": { "title": "من الجهاز", "browse": "تصفح" },
          "url": { "inner_title": "رابط الفيديو", "input_placeholder": "http://..." }
        }
      },
      styles: {
        palette: {
          window: "#1a1025",
          windowBorder: "#6366f1",
          tabIcon: "#6366f1",
          menuIcons: "#c5c5c5",
          textDark: "#ffffff",
          textLight: "#ffffff",
          link: "#6366f1",
          action: "#6366f1",
          inactiveTabIcon: "#8b8b8b",
          error: "#ef4444",
          inProgress: "#6366f1",
          complete: "#10b981",
          sourceBg: "#0f0a1a"
        },
        fonts: { default: { active: true } }
      },
      eager: [
        { format: "mp4", transformation: [{ quality: "auto", fetch_format: "auto" }] },
        { width: 480, height: 270, crop: "fill", start_offset: "1", format: "jpg" }
      ],
      eager_async: true,
      chunk_size: 10485760
    };
  }

  function _widgetCallback(error, result) {
    if (error) {
      if (error.message && error.message.includes("focus")) return;
      console.error("Cloudinary widget error:", error);
      SoundEffects.error();
      showToast("❌ حدث خطأ في واجهة الرفع");
      return;
    }
    if (!result || !result.event) return;
    if (result.event === "upload-added") {
      uploadStartTime = Date.now();
      lastUploadedBytes = 0;
      lastTime = Date.now();
      document.getElementById("uploadProgressContainer").style.display = "block";
    }
    if (result.event === "progress") {
      updateUploadProgress(result.info);
    }
    if (result.event === "success") {
      document.getElementById("uploadProgressContainer").style.display = "none";
      pendingVideoInfo = result.info;
      let titleInput = document.getElementById("videoTitleInput");
      let descInput  = document.getElementById("videoDescriptionInput");
      if (titleInput) titleInput.value = result.info.original_filename || "";
      if (descInput)  descInput.value  = "";
      let charCount = document.getElementById("descCharCount");
      if (charCount) charCount.textContent = "(0 / 5000 حرف)";
      document.getElementById("descriptionModal").classList.add("active");
      SoundEffects.success();
      showToast("✅ تم الرفع! أضف العنوان والوصف.");
    }
    if (result.event === "close") {
      document.getElementById("uploadProgressContainer").style.display = "none";
    }
  }

  function _loadCloudinaryScript(callback) {
    if (window.cloudinary && typeof window.cloudinary.createUploadWidget === "function") {
      callback(); return;
    }
    var existing = document.querySelector('script[src*="cloudinary.com/global/all.js"]');
    if (existing) {
      existing.addEventListener("load", callback, { once: true });
      existing.addEventListener("error", function() {
        console.warn("Cloudinary script failed to load");
      }, { once: true });
      return;
    }
    _injectCloudinaryScript(callback);
  }

  function _injectCloudinaryScript(callback) {
    var s = document.createElement("script");
    s.src = "https://upload-widget.cloudinary.com/global/all.js";
    s.onload = callback;
    s.onerror = function() { console.warn("Cloudinary inject failed"); };
    document.head.appendChild(s);
  }

  // ========== Cloudinary Widget ==========
  // ── Pre-warm الـ widget في الخلفية بعد login (اختياري) ──
  function initCloudinaryWidget() {
    _loadCloudinaryScript(function() {
      if (uploadWidget) return; // already initialized
      try {
        uploadWidget = cloudinary.createUploadWidget(_buildWidgetConfig(), _widgetCallback);
        console.log("✅ Cloudinary widget pre-warmed");
      } catch(e) {
        if (!e.message?.includes("focus")) console.warn("initCloudinaryWidget failed silently:", e);
        uploadWidget = null;
      }
    });
  }


  function openCloudinaryWidget() {
    if (!isAdmin) { showToast("❌ المشرف فقط يمكنه الرفع"); return; }

    // لو الـ widget جاهز افتحه مباشرة
    if (uploadWidget && typeof uploadWidget.open === "function") {
      try { uploadWidget.open(); return; } catch(e) {
        if (!e.message?.includes("focus")) console.warn("Widget open error, rebuilding...", e);
        uploadWidget = null;
      }
    }

    // تأكد إن الـ script محملة أولاً
    _loadCloudinaryScript(function() {
      try {
        uploadWidget = cloudinary.createUploadWidget(_buildWidgetConfig(), _widgetCallback);
        uploadWidget.open();
      } catch(err) {
        if (err.message && err.message.includes("focus")) return;
        console.error("Failed to create widget:", err);
        SoundEffects.error();
        showToast("❌ تعذر فتح واجهة الرفع، جرب مرة تانية");
        uploadWidget = null;
      }
    });
  }
  function updateUploadProgress(info) { if (!info) return; let prog = info.progress || 0, uploaded = info.uploadedBytes || 0, total = info.totalBytes || 1; let now = Date.now(), dt = (now - lastTime) / 1000; let speed = dt > 0 ? (uploaded - lastUploadedBytes) / dt / 1048576 : 0; let remaining = speed > 0 ? (total - uploaded) / (speed * 1024 * 1024) : 0; let fill = document.getElementById("uploadProgressFill"); fill && (fill.style.width = prog + "%"); let pct = document.getElementById("uploadProgressPercent"); pct && (pct.textContent = Math.round(prog) + "%"); let sp = document.getElementById("uploadSpeed"); sp && (sp.textContent = speed.toFixed(2) + " MB/s"); let tr = document.getElementById("uploadTimeRemaining"); if (tr) { if (remaining > 60) { let m = Math.floor(remaining / 60), s = Math.floor(remaining % 60); tr.textContent = m + ":" + s.toString().padStart(2, "0") + " دقيقة متبقية"; } else tr.textContent = remaining > 0 ? Math.floor(remaining) + " ثانية متبقية" : "جاري إكمال الرفع..."; } lastTime = now; lastUploadedBytes = uploaded; }
  function saveVideoWithDescription() { if (!pendingVideoInfo) { showToast("⚠️ لا توجد معلومات فيديو"); closeDescriptionModal(); return; } let info = pendingVideoInfo; let title = document.getElementById("videoTitleInput").value.trim() || "فيديو بدون عنوان"; let desc = document.getElementById("videoDescriptionInput").value.trim() || ""; let used = videos.reduce((acc, v) => acc + (v.size || 0), 0); if (used + info.bytes > MAX_STORAGE) { SoundEffects.error(); showToast("❌ لا توجد مساحة كافية"); return; } let optimizedUrl = info.secure_url.replace("/upload/", "/upload/q_auto,f_auto,vc_auto/"); let thumbnail = null; if (info.eager && info.eager[1] && info.eager[1].secure_url) thumbnail = info.eager[1].secure_url; else if (info.public_id) thumbnail = "https://res.cloudinary.com/" + CLOUDINARY_CONFIG.cloudName + "/video/upload/so_1,f_jpg/" + info.public_id + ".jpg"; let videoData = { title: title, description: desc, type: "cloudinary", url: optimizedUrl, originalUrl: info.secure_url, thumbnail: thumbnail, publicId: info.public_id || "", format: info.format, duration: info.duration, width: info.width, height: info.height, size: info.bytes, createdAt: firebase.firestore.FieldValue.serverTimestamp(), cloudinaryData: { assetId: info.asset_id, version: info.version_id }, optimized: true, private: false }; db.collection("videos").add(videoData).then(async () => { SoundEffects.success(); showToast("✅ تم الرفع والحفظ بنجاح!"); closeDescriptionModal(); pendingVideoInfo = null; }).catch(e => { console.error("Error saving to Firebase:", e); SoundEffects.error(); showToast("⚠️ تم الرفع لكن فشل الحفظ"); }); }
  function closeDescriptionModal() { document.getElementById("descriptionModal").classList.remove("active"); pendingVideoInfo = null; }
  function editVideoTitle(id) { if (!isAdmin) { SoundEffects.error(); showToast("❌ المشرف فقط يستطيع التعديل"); return; } let v = videos.find(v => v.id === id); if (v) { currentEditVideoId = id; document.getElementById("editVideoTitleInput").value = v.title || ""; document.getElementById("editVideoDescriptionInput").value = v.description || ""; document.getElementById("editDescCharCount").textContent = "(" + (v.description || "").length + " / 5000 حرف)"; document.getElementById("editVideoModal").classList.add("active"); } }
  function closeEditVideoModal() { document.getElementById("editVideoModal").classList.remove("active"); currentEditVideoId = null; }
  function saveVideoEdit() { if (!currentEditVideoId || !isAdmin) return; let title = document.getElementById("editVideoTitleInput").value.trim(); let desc = document.getElementById("editVideoDescriptionInput").value.trim(); if (!title) { SoundEffects.error(); showToast("⚠️ العنوان لا يمكن أن يكون فارغاً"); return; } db.collection("videos").doc(currentEditVideoId).update({ title: title, description: desc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { SoundEffects.success(); showToast("✅ تم التعديل"); closeEditVideoModal(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل التعديل"); }); }
  function togglePrivate(videoId, currentPrivate) { if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; } db.collection("videos").doc(videoId).update({ private: !currentPrivate }).then(() => { SoundEffects.success(); showToast(!currentPrivate ? "🔒 الفيديو أصبح خاصاً (لا يمكن تشغيله إلا بواسطتك)" : "🔓 الفيديو أصبح عاماً (يمكن للجميع تشغيله)"); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل التحديث"); }); }

  // دالة عرض الفيديوهات مع رسالة الثقب الأسود الاحترافية
  function renderVideos() {
    let container = document.getElementById("videosContainer");
    let empty = document.getElementById("emptyState");
    let loading = document.getElementById("loadingIndicator");
    let countSpan = document.getElementById("videoCount");
    if (!container || !empty || !countSpan || !loading) return;
    if (isLoadingVideos) {
      container.innerHTML = "";
      empty.style.display = "none";
      loading.style.display = "block";
      countSpan.textContent = "0 فيديو";
      return;
    }
    loading.style.display = "none";
    if (videos.length === 0) {
      container.innerHTML = "";
      if (loadAttemptFailed) {
        empty.innerHTML = `<div class="black-hole-loader"><div class="black-hole"><div class="accretion-disk"></div><div class="gravitational-lens"></div><div class="black-core"></div></div></div><h3>⚫ الثقب الأسود ابتلع البيانات!</h3><p>تعذر الاتصال بالخادم أو لا توجد فيديوهات حالياً. حاول تحديث الصفحة أو تأكد من اتصالك بالإنترنت.</p><button class="retry-btn" onclick="refreshPage()"><i class="fas fa-sync-alt"></i> محاولة السحب من الثقب مرة أخرى</button>`;
      } else {
        empty.innerHTML = `<div class="black-hole-loader" style="transform: scale(0.8);"><div class="black-hole"><div class="accretion-disk" style="animation-duration: 2s;"></div><div class="gravitational-lens"></div><div class="black-core"></div></div></div><h3>⚫ لا توجد فيديوهات بعد</h3><p>يبدو أن الكون فارغ حالياً... عُد لاحقاً لمشاهدة محتوى جديد.</p>`;
      }
      empty.style.display = "block";
      countSpan.textContent = "0 فيديو";
      return;
    }
    const visibleVideos = videos.filter(v => !isVideoHiddenForViewer(v));
    if (visibleVideos.length === 0) {
      container.innerHTML = "";
      empty.innerHTML = `<div class="black-hole-loader" style="transform: scale(0.8);"><div class="black-hole"><div class="accretion-disk" style="animation-duration: 2s;"></div><div class="gravitational-lens"></div><div class="black-core"></div></div></div><h3>⚫ لا توجد فيديوهات متاحة لك</h3><p>الفيديوهات المدفوعة تظهر بعد الاشتراك في الكورس.</p>`;
      empty.style.display = "block";
      countSpan.textContent = "0 فيديو";
      return;
    }
    empty.style.display = "none";
    countSpan.textContent = visibleVideos.length + " فيديو";
    // ======= جمع IDs الفيديوهات المحجوزة لكورسات =======
    const usedInCourse = new Set();
    paidCoursesData.forEach(course => course.videoIds.forEach(id => usedInCourse.add(id)));

    // ======= بطاقات الكورسات =======
    let coursesCardsHtml = "";
    if (paidCoursesData.length > 0) {
      const courseCards = paidCoursesData.map(course => {
        const price = course.price || 0;
        const isPaid = price > 0;
        const isUnlocked = !isPaidLockedForViewer({ id: course.videoIds[0] || "" }) || !isPaid;
        // صورة الكورس: أولوية لـ imageUrl المحفوظ، وإلا أول thumbnail للفيديوهات
        const firstThumb = (() => {
          if (course.imageUrl) return convertDriveUrl(course.imageUrl);
          for (const vid of course.videoIds) {
            const v = videos.find(x => x.id === vid);
            if (!v) continue;
            if (v.thumbnail) return v.thumbnail;
            if (v.type === "youtube" && v.videoId) return `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
          }
          return "";
        })();
        const thumbInner = firstThumb
          ? `<img src="${firstThumb}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;"><div style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#1a1025,#2d1b4e);align-items:center;justify-content:center;"><i class='fas fa-photo-film' style='font-size:2rem;color:#6366f1;opacity:.5'></i></div>`
          : `<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#1a1025,#2d1b4e);display:flex;align-items:center;justify-content:center;"><i class='fas fa-photo-film' style='font-size:2rem;color:#6366f1;opacity:.5'></i></div>`;
        const adminDeleteBtn = isAdmin ? `<button onclick="event.stopPropagation();deleteCourse('${course.id}','${escapeHtml(course.title).replace(/'/g,"\\'")}'); document.getElementById('courseLibrarySection') && document.getElementById('courseLibrarySection').remove();" style="position:absolute;top:.5rem;left:.5rem;width:30px;height:30px;border-radius:50%;border:none;background:rgba(239,68,68,.85);color:#fff;font-size:.78rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;box-shadow:0 2px 8px rgba(239,68,68,.5)"><i class="fas fa-trash"></i></button>` : "";
        const statusBadge = isPaid
          ? `<span style="position:absolute;top:.5rem;right:.5rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:.2rem .55rem;border-radius:8px;font-size:.7rem;font-weight:700;z-index:5"><i class="fas fa-lock" style="font-size:.6rem"></i> ${price} جنيه</span>`
          : `<span style="position:absolute;top:.5rem;right:.5rem;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:.2rem .55rem;border-radius:8px;font-size:.7rem;font-weight:700;z-index:5"><i class="fas fa-unlock" style="font-size:.6rem"></i> مجاني</span>`;
        return `<div class="video-card" onclick="openPaidCourseModal('${course.id}')" style="cursor:pointer;position:relative">
          <div class="video-thumbnail" style="position:relative;overflow:hidden;background:#1a1025;">
            ${thumbInner}
            ${statusBadge}
            ${adminDeleteBtn}
            <div class="play-overlay" style="position:relative;z-index:2;"><div class="play-btn" style="${isPaid ? 'background:rgba(245,158,11,.85);border-color:rgba(255,255,255,.9)' : ''}"><i class="fas ${isPaid ? 'fa-lock' : 'fa-play'}"></i></div></div>
          </div>
          <div class="video-info">
            <h4 class="video-title">${escapeHtml(course.title)}</h4>
            <div class="video-meta"><span><i class="fas fa-photo-film"></i> ${course.videoIds.length} فيديو</span><span style="color:${isPaid ? "#f59e0b" : "#10b981"};font-weight:700">${isPaid ? price + " جنيه" : "مجاني"}</span></div>
          </div>
        </div>`;
      }).join("");
      coursesCardsHtml = `<section class="course-section" id="courseLibrarySection">
        <header class="course-section-header">
          <div class="course-section-title"><i class="fas fa-graduation-cap" style="color:#f59e0b"></i> الكورسات</div>
          <span class="course-section-count">${paidCoursesData.length} كورس</span>
        </header>
        <div class="course-section-grid">${courseCards}</div>
      </section>`;
    }

    // ======= الفيديوهات العامة (غير المرتبطة بكورس) =======
    const ungrouped = visibleVideos.filter(v => !usedInCourse.has(v.id));
    let ungroupedHtml = "";
    if (ungrouped.length) {
      const cardsHtml = ungrouped.map(renderVideoCardHtml).join("");
      const headerHtml = paidCoursesData.length > 0 ? `<header class="course-section-header"><div class="course-section-title"><i class="fas fa-photo-film"></i> فيديوهات عامة</div><span class="course-section-count">${ungrouped.length} فيديو</span></header>` : "";
      ungroupedHtml = `<section class="course-section">${headerHtml}<div class="course-section-grid">${cardsHtml}</div></section>`;
    }
    container.innerHTML = coursesCardsHtml + ungroupedHtml;
    return;
  }

  function renderVideoCardHtml(v) {
    return (function() {
      // Check if this video is locked for the current user (paid course, not enrolled)
      const isLocked = isPaidLockedForViewer(v);
      if (isLocked) {
        const paidCourse = getPaidCourseForVideo(v.id);
        const courseId = paidCourse ? paidCourse.id : '';
        const courseTitle = paidCourse ? escapeHtml(paidCourse.title) : 'كورس مدفوع';
        const coursePrice = paidCourse ? paidCourse.price : '';
        let duration = v.duration ? formatDuration(v.duration) : "";
        let thumb = v.thumbnail;
        if (!thumb && v.type === "youtube") thumb = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
        let thumbHtml = thumb ? `<img src="${thumb}" alt="${escapeHtml(v.title)}" class="bg-image" width="400" height="225" loading="lazy" onerror="if(this.src.includes('hqdefault')){this.src=this.src.replace('hqdefault','mqdefault');}else{this.style.display='none';this.parentNode.querySelector('.fallback-icon').style.display='flex';}">` : "";
        return `<div class="video-card" onclick="openPaidCourseModal('${courseId}')" style="cursor:pointer"><div class="video-thumbnail">${thumbHtml}<div class="fallback-icon" style="display:${thumb ? "none" : "flex"}; position:absolute; z-index:2;"><i class="fas fa-film"></i></div>${duration ? '<div class="video-duration"><i class="fas fa-clock"></i> ' + duration + "</div>" : ""}<div style="position:absolute;top:7px;right:7px;z-index:5;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:.18rem .55rem;border-radius:8px;font-size:.72rem;font-weight:700;display:flex;align-items:center;gap:.3rem;box-shadow:0 2px 8px rgba(245,158,11,.5)"><i class="fas fa-lock" style="font-size:.65rem"></i> مدفوع</div><div class="play-overlay"><div class="play-btn" style="background:rgba(245,158,11,.85);border-color:rgba(255,255,255,.9)"><i class="fas fa-lock"></i></div></div></div><div class="video-info"><h4 class="video-title">${escapeHtml(v.title)}</h4><div style="display:flex;align-items:center;gap:.35rem;margin-top:.3rem;font-size:.78rem;color:#f59e0b;font-weight:600"><i class="fas fa-graduation-cap"></i> ${courseTitle}${coursePrice ? ' · ' + coursePrice + ' جنيه' : ''}</div></div></div>`;
      }
      let duration = v.duration ? formatDuration(v.duration) : "";
      let thumb = v.thumbnail;
      if (!thumb && v.type === "youtube") thumb = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
      let hasExam = exams.some(e => e.videoId === v.id);
      let adminButtons = isAdmin ? `<button class="delete-btn" onclick="event.stopPropagation(); deleteVideo('${v.id}', '${v.publicId || ""}')"><i class="fas fa-trash"></i> حذف</button><button class="edit-title-btn" onclick="event.stopPropagation(); editVideoTitle('${v.id}')"><i class="fas fa-edit"></i> تعديل</button><button class="private-toggle-btn" onclick="event.stopPropagation(); togglePrivate('${v.id}', ${v.private || false})"><i class="fas ${v.private ? 'fa-lock' : 'fa-lock-open'}"></i> ${v.private ? 'خاص' : 'عام'}</button>` : "";
      let privateBadge = v.private ? '<div class="private-badge"><i class="fas fa-lock"></i> خاص</div>' : "";
      let examButtons = "";
      if (isAdmin) {
        if (hasExam) examButtons = `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;"><button class="quiz-btn" onclick="event.stopPropagation(); openAddExamModal('${v.id}')" style="background: linear-gradient(135deg, #f59e0b, #d97706);"><i class="fas fa-edit"></i> تعديل الامتحان</button><button class="delete-quiz-btn" onclick="event.stopPropagation(); deleteExam('${v.id}')"><i class="fas fa-trash"></i> حذف الامتحان</button><button class="view-results-btn" onclick="event.stopPropagation(); openViewResultsModal('${v.id}')"><i class="fas fa-chart-bar"></i> نتائج الامتحانات</button></div>`; else examButtons = `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;"><button class="quiz-btn" onclick="event.stopPropagation(); openAddExamModal('${v.id}')" style="background: linear-gradient(135deg, #10b981, #059669);"><i class="fas fa-plus-circle"></i> إضافة امتحان</button><button class="view-results-btn" onclick="event.stopPropagation(); openViewResultsModal('${v.id}')"><i class="fas fa-chart-bar"></i> نتائج الامتحانات</button></div>`; 
      } else {
        if (hasExam && !v.private) { examButtons = `<button class="quiz-btn" onclick="event.stopPropagation(); openTakeExamModal('${v.id}')" style="margin-top:0.5rem;"><i class="fas fa-clipboard-check"></i> دخول الامتحان</button>`; }
      }
      let thumbHtml = thumb ? `<img src="${thumb}" alt="${escapeHtml(v.title)}" class="bg-image" width="400" height="225" loading="lazy" onerror="if(this.src.includes('hqdefault')){this.src=this.src.replace('hqdefault','mqdefault');}else{this.style.display='none';this.parentNode.querySelector('.fallback-icon').style.display='flex';}">` : "";
      return `<div class="video-card" onclick="playVideo('${v.id}')"><div class="video-thumbnail">${thumbHtml}<div class="fallback-icon" style="display:${thumb ? "none" : "flex"}; position:absolute; z-index:2;"><i class="fas ${v.type === 'youtube' ? 'fa-youtube' : 'film'}"></i></div>${duration ? '<div class="video-duration"><i class="fas fa-clock"></i> ' + duration + "</div>" : ""}${hasExam ? '<div class="gif-badge" style="background:#10b981;"><i class="fas fa-question-circle"></i> يوجد امتحان</div>' : ""}${privateBadge}<div class="play-overlay"><div class="play-btn"><i class="fas fa-play"></i></div></div>${adminButtons}</div><div class="video-info"><h4 class="video-title">${escapeHtml(v.title)} ${v.size > 104857600 ? '<span style="color:#ec4899; font-size:0.8rem;"> <i class="fas fa-hd"></i> HD</span>' : ''}</h4>${v.description ? '<div class="video-description">' + escapeHtml(v.description) + "</div>" : ""}${examButtons}<div class="video-meta"><span><i class="fas fa-calendar"></i> ${v.createdAt ? new Date(v.createdAt.toDate()).toLocaleDateString("ar-EG") : "الآن"}</span>${v.type !== 'youtube' && v.type !== 'gdrive' ? `<span><i class="fas fa-hdd"></i> ${formatSize(v.size)}</span>` : v.type === 'gdrive' ? '<span><i class="fab fa-google-drive" style="color:#34a853"></i> Google Drive</span>' : '<span><i class="fab fa-youtube"></i> YouTube</span>'}${v.width ? '<span><i class="fas fa-expand"></i> ' + v.width + "x" + v.height + "</span>" : ""}</div></div></div>`;
    })();
  }
  function deleteVideo(id, publicId) { if (confirm("هل أنت متأكد من الحذف؟")) db.collection("videos").doc(id).delete().then(() => { SoundEffects.delete(); showToast("🗑️ تم الحذف"); }).catch(e => { SoundEffects.error(); showToast("❌ فشل الحذف"); }); }

  function playVideo(id, startTime = 0) {
  // ✅ منع تشغيل الفيديو إذا لم يكن هناك مستخدم مسجل بحساب Google
  if (!googleUser) {
    showToast("❌ يجب تسجيل الدخول بحساب Google أولاً لمشاهدة الفيديوهات");
    googleLogin();
    return;
  }

  let v = videos.find(v => v.id === id);
  if (!v) return;
  if (!isAdmin && v.private) {
    SoundEffects.error();
    showToast("🔒 هذا الفيديو خاص ولا يمكن تشغيله");
    return;
  }

  const playerContainer = document.getElementById("videoPlayerContainer");
  const modal = document.getElementById("videoModal");
  if (playerContainer) playerContainer.classList.add("video-playing");
  if (modal) modal.classList.add("video-active");

  let oldVideo = document.getElementById("videoPlayer");
  if (oldVideo && oldVideo.tagName === "VIDEO") oldVideo.pause();

  if (v.type === "youtube") {
    let iframe = document.createElement("iframe");
    iframe.classList.add("youtube-iframe");
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;position:absolute;top:0;left:0;";
    iframe.src = `https://www.youtube.com/embed/${v.videoId}?autoplay=1&start=${Math.floor(startTime)}&enablejsapi=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&cc_load_policy=0`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope";
    iframe.allowFullscreen = true;
    iframe.id = "videoPlayer";
    playerContainer.innerHTML = "";
    // ── Overlay يخفي controls يوتيوب ──
    let wrapper = document.createElement("div");
    wrapper.className = "yt-wrapper";
    wrapper.style.cssText = "position:relative;width:100%;height:100%;";
    wrapper.appendChild(iframe);
    // overlay علوي (channel name / CC / settings / share)
    let topOverlay = document.createElement("div");
    topOverlay.className = "yt-overlay yt-overlay-top";
    wrapper.appendChild(topOverlay);
    // overlay سفلي (لوجو YouTube / watermark)
    let botOverlay = document.createElement("div");
    botOverlay.className = "yt-overlay yt-overlay-bot";
    wrapper.appendChild(botOverlay);
    playerContainer.appendChild(wrapper);
    if (currentUserId) setupYouTubeProgressTracking(id);
  } else if (v.type === "gdrive") {
    let iframe = document.createElement("iframe");
    iframe.classList.add("youtube-iframe");
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;position:absolute;top:0;left:0;";
    iframe.src = `https://drive.google.com/file/d/${v.fileId}/preview`;
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    iframe.id = "videoPlayer";
    playerContainer.innerHTML = "";
    let wrapper = document.createElement("div");
    wrapper.className = "yt-wrapper";
    wrapper.style.cssText = "position:relative;width:100%;height:100%;";
    wrapper.appendChild(iframe);
    playerContainer.appendChild(wrapper);
  } else {
    let video = document.createElement("video");
    video.controls = true;
    video.src = v.url;
    video.poster = v.thumbnail || "";
    video.className = "video-player";
    video.id = "videoPlayer";
    video.playsInline = true;
    playerContainer.innerHTML = "";
    playerContainer.appendChild(video);
    if (startTime > 0) video.currentTime = startTime;
    video.addEventListener("ended", () => { markVideoAsWatched(id); });
    setupProgressTracking(id);
  }

  document.getElementById("videoModal").classList.add("active");
  setTimeout(() => { try { initDrawingBoard(); } catch(e) { console.warn("drawing init failed", e); } }, 100);

  let quizContainer = document.getElementById("videoQuizContainer");
  if (exams.some(e => e.videoId === id)) {
    quizContainer.style.display = "block";
    quizContainer.innerHTML = `<div style="padding:2rem; text-align:center; background:rgba(16,185,129,0.1); border-top:1px solid rgba(16,185,129,0.3);"><h3 style="color:#10b981; margin-bottom:1rem;"><i class="fas fa-clipboard-check"></i> يوجد امتحان لهذا الفيديو</h3><p style="color:#aaa; margin-bottom:1.5rem;">اختبر فهمك لمشاهدتك من خلال امتحان تفاعلي</p><button class="quiz-btn" onclick="closeModal(); setTimeout(()=>openTakeExamModal('${id}'),300);"><i class="fas fa-play-circle"></i> دخول الامتحان الآن</button></div>`;
  } else {
    quizContainer.style.display = "none";
    quizContainer.innerHTML = "";
  }
}

  let __drawCtx = null, __drawing = false, __drawLastX = 0, __drawLastY = 0;
  let __drawTool = "pen", __drawColor = "#ff4d6d", __drawWidth = 3, __drawHasContent = false;
  function initDrawingBoard() {
    // يستدعي النسخة المحسّنة إذا كانت محملة، وإلا ينتظر ويحاول مجدداً
    if (typeof window.initEnhancedDrawing === 'function') {
      window.initEnhancedDrawing();
    } else {
      setTimeout(() => { if (typeof window.initEnhancedDrawing === 'function') window.initEnhancedDrawing(); }, 500);
    }
  }
  function setDrawTool(t) {
    __drawTool = t;
    document.querySelectorAll(".drawing-toolbar .db-btn[data-tool]").forEach(b => {
      b.classList.toggle("active", b.dataset.tool === t);
    });
  }
  function setDrawColor(c) {
    __drawColor = c;
    const sw = document.getElementById("drawColorSwatch");
    if (sw) sw.style.background = c;
    setDrawTool("pen");
  }
  function setDrawWidth(w) { __drawWidth = parseInt(w) || 3; }
  function clearDrawing() {
    if (!__drawCtx) return;
    __drawCtx.fillStyle = "#fdfdfd";
    __drawCtx.fillRect(0, 0, __drawCtx.canvas.width, __drawCtx.canvas.height);
    __drawHasContent = false;
    const hint = document.getElementById("drawingEmptyHint");
    if (hint) hint.classList.remove("hidden");
  }
  function toggleDrawingBoard() {
    const board = document.getElementById("drawingBoard");
    const btn = document.getElementById("drawToggleBtn");
    if (!board) return;
    board.classList.toggle("collapsed");
    if (btn) btn.innerHTML = board.classList.contains("collapsed") ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
  }

  function closeModal() {
    saveVideoProgress();
    let p = document.getElementById("videoPlayer");
    if (p && p.tagName === "VIDEO") p.pause();
    // قبل إغلاق المشغل: لو فيديو يوتيوب وصلنا فيه لنسبة معقولة سجّله كمشاهَد
    try {
      if (__ytPlayer && typeof __ytPlayer.getCurrentTime === "function") {
        const cur = __ytPlayer.getCurrentTime() || 0;
        const dur = __ytPlayer.getDuration() || 0;
        const iframe = document.getElementById("videoPlayer");
        if (iframe && iframe.tagName === "IFRAME") {
          const m = (iframe.src || "").match(/embed\/([^?&]+)/);
          if (m && m[1]) {
            const v = videos.find(x => x.type === "youtube" && x.videoId === m[1]);
            if (v && dur > 0 && (cur / dur) >= 0.8) markVideoAsWatched(v.id);
          }
        }
      }
    } catch(_){}
    if (__ytWatchTimer) { clearInterval(__ytWatchTimer); __ytWatchTimer = null; }
    if (__ytPlayer) { try { __ytPlayer.destroy(); } catch(_){} __ytPlayer = null; }
    const playerContainer = document.getElementById("videoPlayerContainer");
    const modal = document.getElementById("videoModal");
    if (playerContainer) playerContainer.classList.remove("video-playing");
    if (modal) modal.classList.remove("video-active");
    document.getElementById("videoModal").classList.remove("active");
    document.getElementById("videoPlayerContainer").innerHTML = '<video class="video-player" controls id="videoPlayer" playsinline preload="none"></video>';
    document.getElementById("videoQuizContainer").style.display = "none";
  }

  async function saveVideoProgress() { let p = document.getElementById("videoPlayer"); if (!p || !p.src || p.tagName !== "VIDEO" || p.paused) return; if (!currentUserId && auth && auth.currentUser) currentUserId = auth.currentUser.uid; let v = videos.find(v => v.url === p.src || v.originalUrl === p.src); if (v && currentUserId) { await saveWatchProgressToFirebase(currentUserId, v.id, p.currentTime, p.duration || 0); } else if (v) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ videoId: v.id, title: v.title, thumbnail: v.thumbnail || "", currentTime: p.currentTime, duration: p.duration || 0, timestamp: Date.now() })); } }

  function checkForResume() { let d = localStorage.getItem(STORAGE_KEY); if (!d && !lastWatchedData) return; try { let data = lastWatchedData || JSON.parse(d); if (!videos.some(v => v.id === data.videoId)) { localStorage.removeItem(STORAGE_KEY); return; } if (data.duration > 0 && data.currentTime / data.duration > 0.95) { localStorage.removeItem(STORAGE_KEY); return; } document.getElementById("resumeVideoTitle").textContent = data.title; document.getElementById("resumeTimeDisplay").textContent = "توقفت عند: " + formatDuration(data.currentTime); document.getElementById("resumeNotification").style.display = "flex"; } catch (e) { localStorage.removeItem(STORAGE_KEY); } }

  function resumeWatching() { let data = lastWatchedData || (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) { return null; } })(); if (!data) return; if (!videos.find(v => v.id === data.videoId)) { showToast("❌ الفيديو غير متوفر"); dismissResume(); return; } playVideo(data.videoId, data.currentTime); dismissResume(); }
  function dismissResume() { document.getElementById("resumeNotification").style.display = "none"; }
  function setupProgressTracking(videoIdForWatch) {
  let p = document.getElementById("videoPlayer");
  if (!p || p.tagName !== "VIDEO") { console.warn("setupProgressTracking: video element not found"); return; }
  if (p._timeupdateHandler) p.removeEventListener("timeupdate", p._timeupdateHandler);
  if (p._endedHandler) p.removeEventListener("ended", p._endedHandler);
  if (p._pauseHandler) p.removeEventListener("pause", p._pauseHandler);
  if (window._beforeUnloadHandler) window.removeEventListener("beforeunload", window._beforeUnloadHandler);
  let watchedFlag = false;
  p._timeupdateHandler = function() { if (!watchedFlag && p.duration > 0 && (p.currentTime / p.duration) >= 0.8) { watchedFlag = true; markVideoAsWatched(videoIdForWatch); } };
  p._endedHandler = function() { if (!watchedFlag) markVideoAsWatched(videoIdForWatch); if (currentUserId) saveUserDataToFirebase(currentUserId); else localStorage.removeItem(STORAGE_KEY); };
  p._pauseHandler = saveVideoProgress;
  window._beforeUnloadHandler = saveVideoProgress;
  p.addEventListener("timeupdate", p._timeupdateHandler);
  p.addEventListener("ended", p._endedHandler);
  p.addEventListener("pause", p._pauseHandler);
  window.addEventListener("beforeunload", window._beforeUnloadHandler);
}
  function toggleFullscreenVideo() { const video = document.getElementById("videoPlayer"); if (!video) return; if (video.requestFullscreen) video.requestFullscreen(); else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen(); else if (video.msRequestFullscreen) video.msRequestFullscreen(); }
  function shareCurrentTime() { let currentTime = 0; let videoId = null; let video = document.getElementById("videoPlayer"); if (video && video.tagName === "VIDEO" && video.src) { currentTime = Math.floor(video.currentTime); let foundVideo = videos.find(v => v.url === video.src || v.originalUrl === video.src); if (foundVideo) videoId = foundVideo.id; } if (!videoId) { let iframe = document.getElementById("videoPlayer"); if (iframe && iframe.tagName === "IFRAME" && iframe.src) { let match = iframe.src.match(/embed\/([^?&]+)/); if (match && match[1]) { let foundVideo = videos.find(v => v.type === "youtube" && v.videoId === match[1]); if (foundVideo) videoId = foundVideo.id; } } } if (!videoId) { showToast("⚠️ لا يمكن مشاركة هذا الفيديو"); return; } let exp = Date.now() + 60000; let url = window.location.href.split("?")[0] + "?video=" + videoId + "&t=" + currentTime + "&exp=" + exp; navigator.clipboard.writeText(url).then(() => { showToast("🔗 تم نسخ الرابط مع التوقيت (" + formatDuration(currentTime) + ") — صالح لمدة دقيقة"); SoundEffects.success(); }).catch(() => { showToast("⚠️ تعذر نسخ الرابط"); }); }
  function checkUrlForShare() { let params = new URLSearchParams(window.location.search); let vid = params.get("video"); let t = params.get("t"); let exp = params.get("exp"); if (vid && videos.length > 0) { if (exp && Date.now() > parseInt(exp)) { window.history.replaceState({}, document.title, window.location.href.split("?")[0]); showToast("❌ انتهت صلاحية هذا الرابط (أكثر من دقيقة)"); return; } if (videos.find(v => v.id === vid)) { window.history.replaceState({}, document.title, window.location.href.split("?")[0]); playVideo(vid, parseInt(t) || 0); } else showToast("❌ الفيديو غير موجود"); } }

  // ===================== نظام دخول المشرف عبر حساب Google =====================
  // لا يوجد كلمات مرور في الكود إطلاقاً. الحسابات المسموح لها تُحفظ في Firestore (admin_accounts).
  async function fetchMyAdminInfo(){
    try {
      const au = (typeof auth !== "undefined" && auth && auth.currentUser) ? auth.currentUser : null;
      const email = _normEmail(au && au.email);
      const uid = au && au.uid;
      console.log("🔍 fetchMyAdminInfo — auth.currentUser:", au ? au.email : "NULL", "| uid:", uid);
      if (!au || typeof db === "undefined" || !db) {
        console.warn("⚠️ fetchMyAdminInfo: auth.currentUser is NULL أو db غير جاهز");
        return { isAdmin:false, isSuperAdmin:false, email: email || "" };
      }
      // Check by email first
      if (email) {
        const snap = await db.collection(ADMIN_ACCOUNTS_COL).doc(email).get();
        console.log("🔍 email check:", email, "| exists:", snap.exists, snap.exists ? snap.data() : "");
        if (snap.exists) {
          const role = (snap.data() || {}).role || "admin";
          return { isAdmin:true, isSuperAdmin: role === "super_admin", email };
        }
      }
      // Check by UID
      if (uid) {
        const snapUid = await db.collection("admin_accounts_uid").doc(uid).get();
        console.log("🔍 UID check:", uid, "| exists:", snapUid.exists);
        if (snapUid.exists) {
          const role = (snapUid.data() || {}).role || "admin";
          return { isAdmin:true, isSuperAdmin: role === "super_admin", email: email || uid };
        }
      }
      // Fallback: scan all admin_accounts for matching email (handles random-ID docs)
      if (email) {
        const allSnap = await db.collection(ADMIN_ACCOUNTS_COL).get();
        console.log("🔍 Scanning all admin_accounts:", allSnap.docs.map(d => d.id));
        for (const doc of allSnap.docs) {
          const storedEmail = (doc.data().email || doc.id || "").trim().toLowerCase();
          if (storedEmail === email) {
            const role = (doc.data() || {}).role || "admin";
            console.log("✅ Found via scan:", storedEmail, "role:", role);
            // ✅ إصلاح تلقائي: إذا كان المستند بمعرف عشوائي، أنشئ واحداً بالبريد كمفتاح وأزل القديم
            if (doc.id !== email) {
              console.log("🔧 Auto-fix: إنشاء مستند بالبريد ومسح المعرف العشوائي:", doc.id);
              try {
                await db.collection(ADMIN_ACCOUNTS_COL).doc(email).set({
                  email, uid: uid || doc.data().uid || "", role,
                  addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: "auto_fix"
                });
                await doc.ref.delete();
                // تحديث admin_accounts_uid أيضاً
                if (uid) {
                  await db.collection("admin_accounts_uid").doc(uid).set({
                    uid, email, role,
                    addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: "auto_fix"
                  });
                }
                console.log("✅ Auto-fix اكتمل بنجاح");
              } catch(fixErr) { console.warn("Auto-fix failed:", fixErr); }
            }
            return { isAdmin:true, isSuperAdmin: role === "super_admin", email };
          }
        }
      }
      return { isAdmin:false, isSuperAdmin:false, email: email || "" };
    } catch(e){ console.warn("fetchMyAdminInfo failed", e); return { isAdmin:false, isSuperAdmin:false, email:"" }; }
  }
  async function refreshAdminStatusFromFirestore(){
    const info = await fetchMyAdminInfo();
    isAdmin = !!info.isAdmin;
    isSuperAdmin = !!info.isSuperAdmin;
    if (isAdmin) localStorage.setItem("falak_admin","true"); else localStorage.removeItem("falak_admin");
    try { updateAdminUI(); } catch(_){}
    try { updateGoogleLogoutButtonsVisibility(); } catch(_){}
    return info;
  }

  // ✅ دالة إصلاح صلاحيات المشرف الرئيسي — تُستدعى تلقائياً أو من Console
  window.fixSuperAdminDocs = async function() {
    const au = (typeof auth !== "undefined" && auth && auth.currentUser) ? auth.currentUser : null;
    if (!au) { alert("الرجاء تسجيل الدخول بـ Google أولاً"); return; }
    const email = _normEmail(au.email);
    const uid = au.uid;
    try {
      const allDocs = await db.collection(ADMIN_ACCOUNTS_COL).get();
      for (const doc of allDocs.docs) {
        if (doc.id !== email) { await doc.ref.delete(); console.log("deleted old doc:", doc.id); }
      }
      await db.collection(ADMIN_ACCOUNTS_COL).doc(email).set({
        email, uid, role: "super_admin",
        addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: "fix_auto"
      });
      await db.collection("admin_accounts_uid").doc(uid).set({
        uid, email, role: "super_admin",
        addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: "fix_auto"
      });
      isAdmin = true; isSuperAdmin = true;
      localStorage.setItem("falak_admin","true");
      try { updateAdminUI(); renderVideos(); } catch(_){}
      console.log("fixSuperAdminDocs: done");
      showToast("تم إصلاح الصلاحيات. أعِد التحميل إذا لزم.");
    } catch(e) { console.error("fixSuperAdminDocs failed:", e); showToast("فشل الإصلاح: " + (e.message||e)); }
  };
  async function adminAccountsCount(){
    try { const s = await db.collection(ADMIN_ACCOUNTS_COL).limit(1).get(); return s.size; } catch(e){ return -1; }
  }
  async function showLogin(){
    const modal = document.getElementById("loginModal");
    const body = document.getElementById("adminLoginBody");
    if (!modal || !body) return;
    modal.classList.add("active");
    body.innerHTML = '';
    const au = (typeof auth !== "undefined" && auth && auth.currentUser) ? auth.currentUser : null;
    if (!au || !au.email) {
      body.innerHTML = '<p style="color:#ddd;text-align:center;margin-bottom:1rem;line-height:1.7">سجّل الدخول بحساب Google أولاً، وسيتم التحقق تلقائياً من صلاحياتك كمشرف.</p>'
        + '<button class="google-btn" onclick="closeLogin();googleLogin();" style="width:100%"><i class="fab fa-google"></i> تسجيل الدخول بحساب Google</button>'
        + '<button onclick="closeLogin()" style="width:100%;background:0 0;border:none;color:#888;margin-top:1rem;cursor:pointer;font-family:Cairo">إلغاء</button>';
      return;
    }
    const email = _normEmail(au.email);
    const info = await fetchMyAdminInfo();
    if (info.isAdmin) {
      isAdmin = true; isSuperAdmin = !!info.isSuperAdmin;
      localStorage.setItem("falak_admin","true");
      try { updateAdminUI(); renderVideos(); loadAIKnowledgeFromFirebase(); } catch(_){}
      if (document.getElementById("maintenanceOverlay")?.classList.contains("active")) document.getElementById("cancelMaintenanceBtn")?.classList.add("active");
      closeLogin();
      SoundEffects.success(); showToast("🔓 مرحباً أيها المشرف!");
      updateGoogleLogoutButtonsVisibility();
      return;
    }
    const cnt = await adminAccountsCount();
    if (cnt === 0) {
      const uid = au && au.uid ? au.uid : "غير متاح";
      body.innerHTML = '<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:.9rem;margin-bottom:1rem;color:#86efac;font-size:.92rem;line-height:1.7">'
        + '<i class="fas fa-info-circle"></i> لا يوجد أي مشرف مسجَّل بعد. سيتم تسجيلك كأول مشرف رئيسي عبر الـ UID.'
        + '</div>'
        + '<p style="color:#ccc;margin-bottom:.4rem;font-size:.9rem">الـ UID الحالي:</p>'
        + '<div style="background:rgba(255,255,255,.04);padding:.85rem;border-radius:10px;border:1px solid rgba(255,255,255,.08);color:#fff;text-align:center;font-family:monospace;direction:ltr;margin-bottom:.7rem;overflow-wrap:anywhere;font-size:.85rem">'+escapeHtml(uid)+'</div>'
        + '<p style="color:#ccc;margin-bottom:.4rem;font-size:.9rem">البريد الإلكتروني:</p>'
        + '<div style="background:rgba(255,255,255,.04);padding:.85rem;border-radius:10px;border:1px solid rgba(255,255,255,.08);color:#fff;text-align:center;font-family:monospace;direction:ltr;margin-bottom:1rem;overflow-wrap:anywhere;font-size:.85rem">'+escapeHtml(email)+'</div>'
        + '<button class="btn btn-success" onclick="bootstrapFirstAdmin()" style="width:100%"><i class="fas fa-user-shield"></i> تسجيل كأول مشرف رئيسي</button>'
        + '<button onclick="closeLogin()" style="width:100%;background:0 0;border:none;color:#888;margin-top:1rem;cursor:pointer;font-family:Cairo">إلغاء</button>';
      return;
    }
    body.innerHTML = '<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:.9rem;margin-bottom:1rem;color:#fca5a5;font-size:.92rem;line-height:1.7">'
      + '<i class="fas fa-exclamation-triangle"></i> هذا البريد <b>غير مسجَّل</b> ضمن قائمة المشرفين المعتمدين على السيرفر.'
      + '</div>'
      + '<p style="color:#ccc;margin-bottom:.6rem">البريد الإلكتروني الحالي:</p>'
      + '<div style="background:rgba(255,255,255,.04);padding:.85rem;border-radius:10px;border:1px solid rgba(255,255,255,.08);color:#fff;text-align:center;font-family:monospace;direction:ltr;margin-bottom:1rem;overflow-wrap:anywhere">'+escapeHtml(email)+'</div>'
      + '<p style="color:#aaa;font-size:.88rem;text-align:center;margin-bottom:1rem;line-height:1.6">إذا كنت مشرفاً جديداً، اطلب من المشرف الرئيسي إضافة هذا البريد إلى قائمة المشرفين من شاشة "إدارة حسابات المشرفين".</p>'
      + '<button class="btn btn-primary" onclick="showLogin()" style="width:100%"><i class="fas fa-sync"></i> إعادة المحاولة</button>'
      + '<button onclick="closeLogin()" style="width:100%;background:0 0;border:none;color:#888;margin-top:1rem;cursor:pointer;font-family:Cairo">إغلاق</button>';
  }
  function closeLogin(){ document.getElementById("loginModal").classList.remove("active"); }
  async function bootstrapFirstAdmin(){
    const au = (typeof auth !== "undefined" && auth && auth.currentUser) ? auth.currentUser : null;
    const uid = au && au.uid;
    const email = _normEmail(au && au.email);
    if (!uid) { SoundEffects.error(); showToast("❌ سجّل الدخول بحساب Google أولاً"); return; }
    try {
      // ✅ تنظيف: حذف أي مستندات قديمة بمعرف عشوائي في admin_accounts
      try {
        const allOld = await db.collection(ADMIN_ACCOUNTS_COL).get();
        for (const doc of allOld.docs) {
          // احذف أي مستند ليس مفتاحه البريد الإلكتروني الصحيح
          if (email && doc.id !== email) {
            await doc.ref.delete();
            console.log("🗑️ حُذف مستند قديم:", doc.id);
          }
        }
        // حذف أي مستندات uid قديمة أيضاً
        const allUid = await db.collection("admin_accounts_uid").get();
        for (const doc of allUid.docs) {
          if (doc.id !== uid) {
            await doc.ref.delete();
            console.log("🗑️ حُذف uid قديم:", doc.id);
          }
        }
      } catch(cleanErr) { console.warn("تنظيف المستندات القديمة:", cleanErr); }

      const cnt = await adminAccountsCount();
      const uidSnap = await db.collection("admin_accounts_uid").doc(uid).get();
      if (cnt !== 0 || uidSnap.exists) {
        // إذا وُجد مستند بالبريد الصحيح أو بالـ UID — أكمل كمشرف
        const info = await fetchMyAdminInfo();
        if (info.isAdmin) {
          isAdmin = true; isSuperAdmin = !!info.isSuperAdmin;
          localStorage.setItem("falak_admin","true");
          closeLogin();
          try { updateAdminUI(); renderVideos(); loadAIKnowledgeFromFirebase(); } catch(_){}
          SoundEffects.success(); showToast("✅ تم التعرف عليك كمشرف رئيسي");
          updateGoogleLogoutButtonsVisibility(); return;
        }
        showToast("⚠️ يوجد مشرف مسجَّل بالفعل"); showLogin(); return;
      }

      // تسجيل بالبريد الإلكتروني كمفتاح (ID) أولاً — هذا هو الأساس
      if (email) {
        await db.collection(ADMIN_ACCOUNTS_COL).doc(email).set({
          email: email, uid: uid, role: "super_admin",
          addedAt: firebase.firestore.FieldValue.serverTimestamp(),
          addedBy: "bootstrap"
        });
      }

      // تسجيل بالـ UID أيضاً كطبقة ثانية
      await db.collection("admin_accounts_uid").doc(uid).set({
        uid: uid,
        email: email || "",
        role: "super_admin",
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        addedBy: "bootstrap"
      });

      isAdmin = true; isSuperAdmin = true;
      localStorage.setItem("falak_admin","true");
      closeLogin();
      try { updateAdminUI(); renderVideos(); loadAIKnowledgeFromFirebase(); } catch(_){}
      SoundEffects.success();
      showToast("🎉 تم تسجيلك كمشرف رئيسي بنجاح");
      updateGoogleLogoutButtonsVisibility();
    } catch(e){
      console.error("bootstrap admin failed", e);
      let msg = "❌ فشل التسجيل";
      const code = (e && (e.code || e.message)) || "";
      if (/permission|denied|insufficient/i.test(code)) {
        msg = "❌ صلاحيات Firestore لا تسمح. تأكد من Rules الـ admin_accounts و admin_accounts_uid.";
      }
      SoundEffects.error();
      showToast(msg);
    }
  }
  function logout() {
    isAdmin = false; isSuperAdmin = false;
    localStorage.removeItem("falak_admin");
    updateAdminUI();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    renderVideos();
    SoundEffects.recordStop();
    showToast("👋 تم تسجيل خروج المشرف");
    updateGoogleLogoutButtonsVisibility();
  }
  async function openSetAdminsModal(){
    if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    if (!isSuperAdmin) {
      // إعادة التحقق من Firestore مباشرة
      const info = await fetchMyAdminInfo();
      isSuperAdmin = !!info.isSuperAdmin;
      // إذا فشل التحقق عبر Google، نتحقق إذا كان هو المشرف الرئيسي الوحيد
      if (!isSuperAdmin) {
        try {
          const snap = await db.collection(ADMIN_ACCOUNTS_COL).get();
          const allAdmins = snap.docs.map(d => d.data());
          const superAdmins = allAdmins.filter(a => a.role === 'super_admin');
          // إذا كان في مشرف رئيسي واحد فقط وهو المسجّل حالياً
          if (superAdmins.length === 1) {
            const au = (typeof auth !== "undefined" && auth && auth.currentUser) ? auth.currentUser : null;
            const myEmail = au && au.email ? au.email.trim().toLowerCase() : null;
            if (myEmail && superAdmins[0].email && superAdmins[0].email.trim().toLowerCase() === myEmail) {
              isSuperAdmin = true;
            }
          }
          // إذا كانت قائمة المشرفين فارغة تماماً وأنت مشرف = أنت الأول
          if (allAdmins.length === 0 && isAdmin) {
            isSuperAdmin = true;
          }
        } catch(e) { console.warn("openSetAdminsModal fallback check failed", e); }
      }
      if (!isSuperAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف الرئيسي فقط"); return; }
    }
    document.getElementById("setAdminsModal").classList.add("active");
    const inp = document.getElementById("newAdminEmailInput"); if (inp) inp.value = "";
    await renderAdminAccountsList();
  }
  function closeSetAdminsModal(){ document.getElementById("setAdminsModal").classList.remove("active"); }
  async function renderAdminAccountsList(){
    const el = document.getElementById("adminAccountsList");
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;color:#aaa;padding:.5rem"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    try {
      const myEmail = _normEmail(auth.currentUser && auth.currentUser.email);
      const myUid = (auth.currentUser && auth.currentUser.uid) || null;
      const rows = [];

      // حسابات المشرفين بالبريد الإلكتروني
      const snap = await db.collection(ADMIN_ACCOUNTS_COL).get();
      snap.forEach(doc => {
        const d = doc.data() || {};
        const em = doc.id;
        const role = d.role || "admin";
        const isMe = em === myEmail;
        const roleBadge = role === "super_admin"
          ? '<span style="background:rgba(168,85,247,.2);color:#c4b5fd;padding:.2rem .6rem;border-radius:8px;font-size:.75rem">مشرف رئيسي</span>'
          : '<span style="background:rgba(59,130,246,.2);color:#93c5fd;padding:.2rem .6rem;border-radius:8px;font-size:.75rem">مشرف</span>';
        rows.push('<div style="display:flex;align-items:center;gap:.6rem;background:rgba(255,255,255,.04);padding:.7rem .85rem;border-radius:10px;margin-bottom:.5rem;border:1px solid rgba(255,255,255,.06)">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="color:#fff;direction:ltr;text-align:left;font-family:monospace;font-size:.92rem;overflow-wrap:anywhere">'+escapeHtml(em)+(isMe?' <span style="color:#86efac;font-size:.75rem">(أنت)</span>':'')+'</div>'
          + '<div style="margin-top:.3rem">'+roleBadge+'</div>'
          + '</div>'
          + '<button onclick="removeAdminAccount(\''+em.replace(/'/g,"\\'")+'\')" '+(isMe?'disabled title="لا يمكنك حذف نفسك"':'')+' style="background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;width:38px;height:38px;border-radius:8px;cursor:'+(isMe?'not-allowed':'pointer')+';opacity:'+(isMe?'.4':'1')+'"><i class="fas fa-trash"></i></button>'
          + '</div>');
      });

      // حسابات المشرفين بالـ UID
      let snapUid;
      try {
        snapUid = await db.collection("admin_accounts_uid").get();
        alert("✅ نجح الجلب\nعدد الحسابات بالـ UID: " + snapUid.size + "\nمن داخل الكاش؟ " + (snapUid.metadata ? snapUid.metadata.fromCache : "غير معروف"));
      } catch(uidErr) {
        alert("❌ فشل جلب حسابات الـ UID\nرسالة الخطأ: " + uidErr.message + "\nكود الخطأ: " + (uidErr.code || "غير محدد"));
        throw uidErr;
      }
      snapUid.forEach(doc => {
        const d = doc.data() || {};
        const uidVal = doc.id;
        const role = d.role || "admin";
        const isMe = myUid && uidVal === myUid;
        const roleBadge = role === "super_admin"
          ? '<span style="background:rgba(168,85,247,.2);color:#c4b5fd;padding:.2rem .6rem;border-radius:8px;font-size:.75rem">مشرف رئيسي</span>'
          : '<span style="background:rgba(59,130,246,.2);color:#93c5fd;padding:.2rem .6rem;border-radius:8px;font-size:.75rem">مشرف</span>';
        rows.push('<div style="display:flex;align-items:center;gap:.6rem;background:rgba(255,255,255,.04);padding:.7rem .85rem;border-radius:10px;margin-bottom:.5rem;border:1px solid rgba(255,255,255,.06)">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="color:#fff;direction:ltr;text-align:left;font-family:monospace;font-size:.92rem;overflow-wrap:anywhere">'+escapeHtml(uidVal)+(isMe?' <span style="color:#86efac;font-size:.75rem">(أنت)</span>':'')+'</div>'
          + '<div style="margin-top:.3rem">'+roleBadge+' <span style="background:rgba(34,211,238,.15);color:#67e8f9;padding:.2rem .5rem;border-radius:8px;font-size:.7rem;margin-right:.3rem">UID</span></div>'
          + '</div>'
          + '<button onclick="removeAdminAccountUid(\''+uidVal.replace(/'/g,"\\'")+'\')" '+(isMe?'disabled title="لا يمكنك حذف نفسك"':'')+' style="background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;width:38px;height:38px;border-radius:8px;cursor:'+(isMe?'not-allowed':'pointer')+';opacity:'+(isMe?'.4':'1')+'"><i class="fas fa-trash"></i></button>'
          + '</div>');
      });

      if (!rows.length) { el.innerHTML = '<div style="text-align:center;color:#aaa;padding:1rem">لا توجد حسابات مسجّلة بعد.</div>'; return; }
      el.innerHTML = rows.join("");
    } catch(e) {
      console.error(e);
      el.innerHTML = '<div style="color:#fca5a5;text-align:center;padding:1rem">❌ فشل التحميل</div>';
    }
  }
  async function addAdminAccount(){
    if (!isSuperAdmin) { SoundEffects.error(); showToast("❌ المشرف الرئيسي فقط"); return; }
    const inp = document.getElementById("newAdminEmailInput");
    const roleSel = document.getElementById("newAdminRoleSelect");
    const rawVal = (inp && inp.value) ? inp.value.trim() : "";
    const role = (roleSel && roleSel.value) || "admin";
    if (!rawVal) { SoundEffects.error(); showToast("❌ أدخل البريد الإلكتروني أو الـ UID"); return; }
    // detect if it looks like an email or a UID
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawVal);
    const email = isEmail ? _normEmail(rawVal) : null;
    const uid = !isEmail ? rawVal : null;
    if (isEmail && !email) { SoundEffects.error(); showToast("❌ بريد إلكتروني غير صالح"); return; }
    try {
      if (isEmail) {
        const ref = db.collection(ADMIN_ACCOUNTS_COL).doc(email);
        const ex = await ref.get();
        if (ex.exists) { showToast("⚠️ هذا البريد مسجَّل بالفعل"); return; }
        await ref.set({ email: email, role: role, addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: _normEmail(auth.currentUser && auth.currentUser.email) || "unknown" });
      } else {
        // add by uid: store in admin_accounts_uid collection
        const ref = db.collection("admin_accounts_uid").doc(uid);
        const ex = await ref.get();
        if (ex.exists) { showToast("⚠️ هذا الـ UID مسجَّل بالفعل"); return; }
        await ref.set({ uid: uid, role: role, addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: _normEmail(auth.currentUser && auth.currentUser.email) || "unknown" });
      }
      if (inp) inp.value = "";
      SoundEffects.success();
      showToast("✅ تمت إضافة المشرف");
      renderAdminAccountsList();
    } catch(e){ console.error(e); showToast("❌ فشل الإضافة (تحقق من قواعد Firestore)"); }
  }
  async function addAdminByUid(){
    if (!isSuperAdmin) { SoundEffects.error(); showToast("❌ المشرف الرئيسي فقط"); return; }
    const inp = document.getElementById("newAdminUidInput");
    const roleSel = document.getElementById("newAdminUidRoleSelect");
    const uid = (inp && inp.value) ? inp.value.trim() : "";
    const role = (roleSel && roleSel.value) || "admin";
    if (!uid || uid.length < 10) { SoundEffects.error(); showToast("❌ أدخل UID صالح"); return; }
    try {
      const ref = db.collection("admin_accounts_uid").doc(uid);
      const ex = await ref.get();
      if (ex.exists) { showToast("⚠️ هذا الـ UID مسجَّل بالفعل"); return; }
      await ref.set({ uid: uid, role: role, addedAt: firebase.firestore.FieldValue.serverTimestamp(), addedBy: _normEmail(auth.currentUser && auth.currentUser.email) || "unknown" });
      if (inp) inp.value = "";
      SoundEffects.success();
      showToast("✅ تمت إضافة المشرف بالـ UID");
      renderAdminAccountsList();
    } catch(e){ console.error(e); showToast("❌ فشل الإضافة"); }
  }
  async function removeAdminAccount(email){
    if (!isSuperAdmin) { SoundEffects.error(); showToast("❌ المشرف الرئيسي فقط"); return; }
    email = _normEmail(email);
    const myEmail = _normEmail(auth.currentUser && auth.currentUser.email);
    if (email === myEmail) { showToast("❌ لا يمكنك حذف نفسك"); return; }
    if (!confirm("حذف " + email + " من قائمة المشرفين؟")) return;
    try {
      await db.collection(ADMIN_ACCOUNTS_COL).doc(email).delete();
      SoundEffects.delete();
      showToast("🗑️ تم الحذف");
      renderAdminAccountsList();
    } catch(e){ console.error(e); showToast("❌ فشل الحذف"); }
  }
  async function removeAdminAccountUid(uidVal){
    if (!isSuperAdmin) { SoundEffects.error(); showToast("❌ المشرف الرئيسي فقط"); return; }
    const myUid = (auth.currentUser && auth.currentUser.uid) || null;
    if (myUid && uidVal === myUid) { showToast("❌ لا يمكنك حذف نفسك"); return; }
    if (!confirm("حذف " + uidVal + " من قائمة المشرفين؟")) return;
    try {
      await db.collection("admin_accounts_uid").doc(uidVal).delete();
      SoundEffects.delete();
      showToast("🗑️ تم الحذف");
      renderAdminAccountsList();
    } catch(e){ console.error(e); showToast("❌ فشل الحذف"); }
  }
  // Stubs (للحفاظ على التوافق مع المراجع القديمة في window.onclick / Escape)
  function closeAdminPasswordModal(){ const m = document.getElementById("adminPasswordModal"); if (m) m.classList.remove("active"); }
  function verifyAdminPassword(){ openSetAdminsModal(); }
  function saveAdminCount(){ closeSetAdminsModal(); }
  // كشف على window للوصول من onclick handlers في HTML
  window.showLogin = showLogin; window.closeLogin = closeLogin;
  window.bootstrapFirstAdmin = bootstrapFirstAdmin;
  window.openSetAdminsModal = openSetAdminsModal; window.closeSetAdminsModal = closeSetAdminsModal;
  window.addAdminAccount = addAdminAccount; window.removeAdminAccount = removeAdminAccount;
  window.addAdminByUid = addAdminByUid; window.removeAdminAccountUid = removeAdminAccountUid;
  window.refreshAdminStatusFromFirestore = refreshAdminStatusFromFirestore;
  window.fetchMyAdminInfo = fetchMyAdminInfo;
  window.closeAdminPasswordModal = closeAdminPasswordModal;
  window.verifyAdminPassword = verifyAdminPassword;
  window.saveAdminCount = saveAdminCount;
  window.logout = logout;

  // App Management
  function loadAppsFromFirebase() { if (unsubscribeApps) unsubscribeApps(); unsubscribeApps = db.collection("apps").orderBy("createdAt", "asc").onSnapshot(snap => { apps = []; snap.forEach(d => apps.push({ id: d.id, ...d.data() })); renderAppsList(); renderAppsManageList(); }, err => console.error("Error loading apps:", err)); }
  function renderAppsList() { const container = document.getElementById("appsList"); if (!container) return; if (apps.length === 0) { container.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">لا توجد تطبيقات مضافة بعد</p>'; return; } container.innerHTML = apps.map(app => `<div class="app-item"><div class="app-icon">${app.iconUrl ? `<img src="${escapeHtml(app.iconUrl)}" alt="icon">` : `<i class="fas ${app.icon || 'fa-rocket'}"></i>`}</div><div class="app-info"><div class="app-name">${escapeHtml(app.name)}</div><div class="app-desc">${escapeHtml(app.desc || '')}</div></div><button class="app-link" onclick="openApp('${escapeHtml(app.url)}')">فتح <i class="fas fa-external-link-alt"></i></button></div>`).join(""); }
  function renderAppsManageList() { const container = document.getElementById("appsManageList"); if (!container) return; if (apps.length === 0) { container.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">لا توجد تطبيقات. أضف تطبيقاً جديداً.</p>'; return; } container.innerHTML = apps.map(app => `<div class="app-item"><div class="app-icon">${app.iconUrl ? `<img src="${escapeHtml(app.iconUrl)}" alt="icon">` : `<i class="fas ${app.icon || 'fa-rocket'}"></i>`}</div><div class="app-info"><div class="app-name">${escapeHtml(app.name)}</div><div class="app-desc">${escapeHtml(app.desc || '')}</div><div style="font-size:0.7rem;color:#888;direction:ltr;word-break:break-all;">${escapeHtml(app.url)}</div></div><div class="app-actions"><button class="app-edit-btn" onclick="editApp('${app.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="app-delete-btn" onclick="deleteApp('${app.id}')" title="حذف"><i class="fas fa-trash"></i></button></div></div>`).join(""); }
  function openManageAppsModal() { if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; } renderAppsManageList(); document.getElementById("manageAppsModal").classList.add("active"); }
  function closeManageAppsModal() { document.getElementById("manageAppsModal").classList.remove("active"); }
  function showAddAppForm() { document.getElementById("addAppModalTitle").innerHTML = '<i class="fas fa-plus"></i> إضافة تطبيق'; document.getElementById("appNameInput").value = ""; document.getElementById("appDescInput").value = ""; document.getElementById("appUrlInput").value = ""; document.getElementById("appIconUrlInput").value = ""; document.getElementById("iconPreviewContainer").style.display = "none"; document.getElementById("editAppId").value = ""; document.getElementById("addAppModal").classList.add("active"); }
  function editApp(appId) { const app = apps.find(a => a.id === appId); if (!app) return; document.getElementById("addAppModalTitle").innerHTML = '<i class="fas fa-edit"></i> تعديل تطبيق'; document.getElementById("appNameInput").value = app.name; document.getElementById("appDescInput").value = app.desc || ""; document.getElementById("appUrlInput").value = app.url; document.getElementById("appIconUrlInput").value = app.iconUrl || ""; document.getElementById("editAppId").value = appId; if (app.iconUrl) { document.getElementById("iconPreviewImg").src = app.iconUrl; document.getElementById("iconPreviewContainer").style.display = "block"; } else { document.getElementById("iconPreviewContainer").style.display = "none"; } document.getElementById("addAppModal").classList.add("active"); }
  function previewAppIcon() { const url = document.getElementById("appIconUrlInput").value.trim(); if (!url) { showToast("⚠️ أدخل رابط الصورة أولاً"); return; } const previewDiv = document.getElementById("iconPreviewContainer"); const img = document.getElementById("iconPreviewImg"); img.src = url; previewDiv.style.display = "block"; img.onerror = () => { showToast("⚠️ الرابط غير صالح أو الصورة لا تظهر"); previewDiv.style.display = "none"; }; }
  function saveApp() { const name = document.getElementById("appNameInput").value.trim(); const desc = document.getElementById("appDescInput").value.trim(); const url = document.getElementById("appUrlInput").value.trim(); const iconUrl = document.getElementById("appIconUrlInput").value.trim(); const editId = document.getElementById("editAppId").value; if (!name || !url) { showToast("⚠️ الاسم والرابط مطلوبان"); return; } if (!url.startsWith("http://") && !url.startsWith("https://")) { showToast("⚠️ الرابط يجب أن يبدأ بـ http:// أو https://"); return; } const appData = { name, desc, url, icon: "fa-rocket", iconUrl: iconUrl || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }; if (editId) { db.collection("apps").doc(editId).update(appData).then(() => { SoundEffects.success(); showToast("✅ تم تعديل التطبيق"); closeAddAppModal(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل التعديل"); }); } else { appData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); appData.createdBy = currentUser || "مشرف"; db.collection("apps").add(appData).then(() => { SoundEffects.success(); showToast("✅ تم إضافة التطبيق"); closeAddAppModal(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل الإضافة"); }); } }
  function deleteApp(appId) { if (confirm("هل أنت متأكد من حذف هذا التطبيق؟")) { db.collection("apps").doc(appId).delete().then(() => { SoundEffects.delete(); showToast("🗑️ تم حذف التطبيق"); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل الحذف"); }); } }
  function closeAddAppModal() { document.getElementById("addAppModal").classList.remove("active"); document.getElementById("editAppId").value = ""; }
  function openApp(url) { window.open(url, "_blank", "noopener,noreferrer"); }

  // Exam Functions
  function openAddExamModal(videoId) { if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; } let sel = document.getElementById("quizVideoSelect"); sel.innerHTML = '<option value="">-- اختر فيديو --</option>'; videos.forEach(v => { let o = document.createElement("option"); o.value = v.id; o.textContent = v.title; sel.appendChild(o); }); if (videoId) { sel.value = videoId; let existing = exams.find(e => e.videoId === videoId); if (existing) loadExamForEditing(existing); else { document.getElementById("questionsContainer").innerHTML = ""; addQuestion(); } } else { document.getElementById("questionsContainer").innerHTML = ""; addQuestion(); } document.getElementById("addQuizModal").classList.add("active"); }
  function closeAddExamModal() { document.getElementById("addQuizModal").classList.remove("active"); }
  function loadExamForEditing(exam) { let cont = document.getElementById("questionsContainer"); cont.innerHTML = ""; exam.questions.forEach((q, idx) => { let card = document.createElement("div"); card.className = "question-card"; card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;"><span style="color:#6366f1; font-weight:600;">السؤال ${idx + 1}</span>${idx > 0 ? '<button onclick="this.closest(\'.question-card\').remove()" style="background:#ef4444; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer;"><i class="fas fa-times"></i></button>' : ""}</div><input type="text" class="question-input" value="${escapeHtml(q.question)}" placeholder="نص السؤال..." style="width:100%; padding:0.75rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; font-family:'Cairo'; margin-bottom:1rem;">${q.imageUrl ? `<div class="question-image-preview-container"><img src="${q.imageUrl}" class="question-image-preview" style="max-width:100%; max-height:200px; border-radius:12px; margin:1rem 0; border:2px solid rgba(99,102,241,0.5);"><button class="remove-image-btn" onclick="removeQuestionImage(this)"><i class="fas fa-times"></i> إزالة الصورة</button></div>` : ""}<input type="file" accept="image/*" class="question-image-upload" style="display:none;" data-question-index="${idx}" onchange="uploadImageForQuestion(this)"><button class="upload-image-btn" onclick="document.querySelectorAll('.question-image-upload')[${idx}].click()"><i class="fas fa-image"></i> إضافة صورة (اختياري)</button><div class="options-container">${q.options.map((opt, optIdx) => `<div class="quiz-option-input"><input type="radio" name="correct-${idx}" value="${optIdx}" ${q.correctAnswer === optIdx ? "checked" : ""} style="width:20px; height:20px; accent-color:#10b981;"><input type="text" value="${escapeHtml(opt)}" placeholder="الخيار ${optIdx + 1}" class="option-input"></div>`).join("")}</div><p style="color:#888; font-size:0.85rem; margin-top:0.5rem;"><i class="fas fa-info-circle"></i> اختر الإجابة الصحيحة بالنقر على الدائرة</p>`; cont.appendChild(card); }); }
  function addQuestion() { let cont = document.getElementById("questionsContainer"); let idx = cont.children.length; let card = document.createElement("div"); card.className = "question-card"; card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;"><span style="color:#6366f1; font-weight:600;">السؤال ${idx + 1}</span>${idx > 0 ? '<button onclick="this.closest(\'.question-card\').remove()" style="background:#ef4444; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer;"><i class="fas fa-times"></i></button>' : ""}</div><input type="text" class="question-input" placeholder="نص السؤال..." style="width:100%; padding:0.75rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; font-family:'Cairo'; margin-bottom:1rem;"><input type="file" accept="image/*" class="question-image-upload" style="display:none;" data-question-index="${idx}" onchange="uploadImageForQuestion(this)"><button class="upload-image-btn" onclick="this.previousElementSibling.click()"><i class="fas fa-image"></i> إضافة صورة (اختياري)</button><div class="options-container"><div class="quiz-option-input"><input type="radio" name="correct-${idx}" value="0" style="width:20px; height:20px; accent-color:#10b981;"><input type="text" placeholder="الخيار الأول" class="option-input"></div><div class="quiz-option-input"><input type="radio" name="correct-${idx}" value="1" style="width:20px; height:20px; accent-color:#10b981;"><input type="text" placeholder="الخيار الثاني" class="option-input"></div><div class="quiz-option-input"><input type="radio" name="correct-${idx}" value="2" style="width:20px; height:20px; accent-color:#10b981;"><input type="text" placeholder="الخيار الثالث" class="option-input"></div><div class="quiz-option-input"><input type="radio" name="correct-${idx}" value="3" style="width:20px; height:20px; accent-color:#10b981;"><input type="text" placeholder="الخيار الرابع" class="option-input"></div></div><p style="color:#888; font-size:0.85rem; margin-top:0.5rem;"><i class="fas fa-info-circle"></i> اختر الإجابة الصحيحة بالنقر على الدائرة</p>`; cont.appendChild(card); }
  async function uploadImageForQuestion(input) { let file = input.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { showToast("⚠️ حجم الصورة يجب أن أقل من 5 ميجا"); return; } showToast("⏳ جاري رفع الصورة..."); let fd = new FormData(); fd.append("file", file); fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset); fd.append("cloud_name", CLOUDINARY_CONFIG.cloudName); try { let resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, { method: "POST", body: fd }); let data = await resp.json(); if (!data.secure_url) throw new Error("لم يتم استلام الرابط"); let card = input.closest(".question-card"); let old = card.querySelector(".question-image-preview-container"); old && old.remove(); let div = document.createElement("div"); div.className = "question-image-preview-container"; div.innerHTML = `<img src="${data.secure_url}" class="question-image-preview" style="max-width:100%; max-height:200px; border-radius:12px; margin:1rem 0; border:2px solid rgba(99,102,241,0.5);"><button class="remove-image-btn" onclick="removeQuestionImage(this)"><i class="fas fa-times"></i> إزالة الصورة</button>`; card.querySelector(".upload-image-btn").insertAdjacentElement("beforebegin", div); showToast("✅ تم رفع الصورة"); } catch (e) { console.error(e); SoundEffects.error(); showToast("❌ فشل رفع الصورة"); } }
  function removeQuestionImage(btn) { btn.closest(".question-image-preview-container").remove(); }
  function saveExam() { let videoId = document.getElementById("quizVideoSelect").value; if (!videoId) { showToast("⚠️ اختر فيديو أولاً"); return; } let cards = document.querySelectorAll("#questionsContainer .question-card"); let questions = []; for (let i = 0; i < cards.length; i++) { let card = cards[i]; let qText = card.querySelector(".question-input").value.trim(); if (!qText) { showToast("⚠️ أكمل جميع الأسئلة"); return; } let imgUrl = null; let preview = card.querySelector(".question-image-preview"); if (preview) imgUrl = preview.src; let opts = card.querySelectorAll(".option-input"); let options = []; let correct = -1; opts.forEach((opt, idx) => { let val = opt.value.trim(); if (val) options.push(val); let radio = card.querySelector(`input[name="correct-${i}"][value="${idx}"]`); if (radio && radio.checked) correct = idx; }); if (options.length < 2) { showToast("⚠️ كل سؤال يحتاج خيارين على الأقل"); return; } if (correct === -1) { showToast("⚠️ اختر الإجابة الصحيحة لكل سؤال"); return; } questions.push({ question: qText, options: options, correctAnswer: correct, imageUrl: imgUrl }); } if (questions.length === 0) { showToast("⚠️ أضف سؤالاً واحداً على الأقل"); return; } let existing = exams.find(e => e.videoId === videoId); if (existing) { db.collection("exams").doc(existing.id).update({ questions: questions, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { SoundEffects.success(); showToast("✅ تم تحديث الامتحان"); closeAddExamModal(); if(document.getElementById('courseExamsManagerModal')){const m=document.getElementById('courseExamsManagerModal');const ci=m.dataset.courseId;const ct=m.dataset.courseTitle;if(ci)showCourseExamsManager(ci,ct);}; }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل تحديث الامتحان"); }); } else { db.collection("exams").add({ videoId: videoId, questions: questions, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser || "مشرف" }).then(() => { SoundEffects.success(); showToast("✅ تم حفظ الامتحان"); closeAddExamModal(); if(document.getElementById('courseExamsManagerModal')){const m=document.getElementById('courseExamsManagerModal');const ci=m.dataset.courseId;const ct=m.dataset.courseTitle;if(ci)showCourseExamsManager(ci,ct);}; }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل حفظ الامتحان"); }); } }
  function deleteExam(videoId) { if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; } if (!confirm("⚠️ هل أنت متأكد؟ حذف الامتحان سيؤدي لحذف جميع نتائج الطلاب!")) return; let exam = exams.find(e => e.videoId === videoId); if (!exam) { showToast("⚠️ لا يوجد امتحان"); return; } let batch = db.batch(); db.collection("exam_results").where("videoId", "==", videoId).get().then(snap => { snap.docs.forEach(d => batch.delete(d.ref)); batch.delete(db.collection("exams").doc(exam.id)); return batch.commit(); }).then(() => { SoundEffects.delete(); showToast("✅ تم الحذف"); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل الحذف"); }); }
  function openViewResultsModal(videoId) { if (!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; } let sel = document.getElementById("resultsVideoSelect"); sel.innerHTML = '<option value="">-- اختر فيديو --</option>'; videos.forEach(v => { let o = document.createElement("option"); o.value = v.id; o.textContent = v.title; sel.appendChild(o); }); if (videoId) { sel.value = videoId; loadResultsForVideo(); } document.getElementById("viewResultsModal").classList.add("active"); }
  function closeViewResultsModal() { document.getElementById("viewResultsModal").classList.remove("active"); }
  function loadResultsForVideo() { let vid = document.getElementById("resultsVideoSelect").value; let cont = document.getElementById("resultsContainer"); if (!cont) return; if (!vid) { cont.innerHTML = '<p style="text-align:center; color:#888; padding:2rem;">اختر فيديو لعرض النتائج</p>'; return; } let filtered = examResults.filter(r => r.videoId === vid); if (filtered.length === 0) { cont.innerHTML = '<p style="text-align:center; color:#888; padding:2rem;">لا توجد نتائج بعد</p>'; return; } let exam = exams.find(e => e.videoId === vid); cont.innerHTML = filtered.map(r => { let correctCount = r.answers.filter((ans, idx) => { let q = exam?.questions?.[idx]; return q && ans === q.correctAnswer; }).length; let total = exam?.questions?.length || r.answers.length; let percent = Math.round(correctCount / total * 100); let visible = r.resultVisible || false; return `<div class="result-item"><div class="result-student-name"><i class="fas fa-user-graduate"></i> ${escapeHtml(r.studentName)}<span class="result-phone" style="background:rgba(99,102,241,0.2); padding:0.3rem 0.8rem; border-radius:20px; display:inline-block; font-size:0.9rem; direction:ltr; margin-right:0.5rem; border:1px solid #6366f1;"><i class="fas fa-phone"></i> ${escapeHtml(r.studentPhone)}</span></div><div class="result-details"><span><i class="fas fa-calendar"></i> ${r.submittedAt ? new Date(r.submittedAt.toDate()).toLocaleDateString("ar-EG") : "الآن"}</span><span><i class="fas fa-check-circle" style="color:#10b981;"></i> ${correctCount}/${total}</span><span><i class="fas fa-percentage" style="color:#6366f1;"></i> ${percent}%</span></div><div class="result-answers">${r.answers.map((ans, idx) => { let q = exam?.questions?.[idx]; let correct = q && ans === q.correctAnswer; return `<div class="answer-item ${correct ? "correct" : "incorrect"}"><strong>س${idx + 1}:</strong> ${correct ? "✓ صحيح" : "✗ خطأ"} ${q ? "(الإجابة: " + escapeHtml(q.options[q.correctAnswer]) + ")" : ""}</div>`; }).join("")}</div>${visible ? '<div class="grade-sent"><i class="fas fa-check-circle"></i> تم إرسال النتيجة</div>' : `<button class="send-grade-btn" onclick="sendResultToStudent('${r.id}')"><i class="fas fa-paper-plane"></i> إرسال النتيجة للطالب</button>`}</div>`; }).join(""); }
  function sendResultToStudent(resultId) { if (!isAdmin) { SoundEffects.error(); showToast("❌ هذه الصلاحية للمشرف فقط"); return; } db.collection("exam_results").doc(resultId).update({ resultVisible: true }).then(() => { SoundEffects.success(); showToast("✅ تم إرسال النتيجة للطالب"); loadResultsForVideo(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل إرسال النتيجة"); }); }
  function getStudentIdentifier() { if (currentUserPhone) return currentUserPhone; try { if (typeof googleUser !== "undefined" && googleUser && googleUser.email) return googleUser.email; } catch(_){} return ""; }
  function openTakeExamModal(videoId) { let exam = exams.find(e => e.videoId === videoId); if (!exam) { showToast("⚠️ لا يوجد امتحان"); return; } let video = videos.find(v => v.id === videoId); if (!isAdmin && video && video.private) { SoundEffects.error(); showToast("🔒 هذا الامتحان خاص ولا يمكن الدخول إليه"); return; } currentExam = exam; currentVideoIdForExam = videoId; currentExamAnswers = {}; document.getElementById("studentNameSection").style.display = "block"; document.getElementById("quizSection").style.display = "none"; document.getElementById("studentNameInput").value = currentUser || ""; const phInput = document.getElementById("studentPhoneInput"); phInput.value = getStudentIdentifier(); if (currentUserId && getStudentIdentifier().includes("@")) { phInput.placeholder = "البريد الإلكتروني"; phInput.type = "email"; } else { phInput.placeholder = "رقم الهاتف"; phInput.type = "tel"; } document.getElementById("takeQuizModal").classList.add("active"); }
  function closeTakeExamModal() { if (examTimer) { clearInterval(examTimer); examTimer = null; } document.getElementById("takeQuizModal").classList.remove("active"); currentExam = null; currentExamAnswers = {}; }
  function startExam() { let name = document.getElementById("studentNameInput").value.trim(); let phone = document.getElementById("studentPhoneInput").value.trim(); let countryCode = (document.getElementById("examCountryCode") || {value:'+20'}).value; if (!name) { showToast("⚠️ أدخل اسمك الكامل أولاً"); return; } if (!isValidName(name)) { showToast("⚠️ الاسم يجب أن يحتوي على حروف (2-50 حرف) ولا يحتوي على رموز غير صالحة"); return; } if (!phone) { showToast("⚠️ أدخل رقم الهاتف أو البريد الإلكتروني"); return; } let normalizedPhone; if (phone.includes("@")) { if (!validateEmail(phone)) { showToast("⚠️ البريد الإلكتروني غير صحيح — مثال: name@gmail.com"); return; } normalizedPhone = phone.toLowerCase().trim(); } else { normalizedPhone = normalizePhone(phone, countryCode); if (!validatePhone(phone, countryCode)) { let pfx=(COUNTRY_PREFIX_MAP[countryCode]||[]).slice(0,3).join("، "); let cn=getCountryName(countryCode); showToast("⚠️ رقم غير صحيح لـ"+cn+" — يجب أن يبدأ بـ: "+pfx+"..."); return; } } currentExamAnswers = {}; if (examResults.find(r => r.videoId === currentVideoIdForExam && r.studentName === name && r.studentPhone === normalizedPhone && r.submittedAt && Date.now() - r.submittedAt.toDate().getTime() < 86400000)) { showToast("⚠️ لقد قمت بهذا الامتحان مؤخراً"); return; } document.getElementById("studentNameSection").style.display = "none"; let qSec = document.getElementById("quizSection"); qSec.style.display = "block"; qSec.innerHTML = '<div class="quiz-header"><div class="quiz-title"><i class="fas fa-clipboard-list"></i> امتحان الفيديو</div><div class="quiz-timer" id="quizTimer"><i class="fas fa-clock"></i> <span id="timerDisplay">10:00</span></div></div>'; currentExam.questions.forEach((q, idx) => { let div = document.createElement("div"); div.className = "question-card"; div.innerHTML = `<div class="question-number"><i class="fas fa-question-circle"></i> السؤال ${idx + 1}</div>${q.imageUrl ? `<img src="${q.imageUrl}" class="question-image-preview" style="max-width:100%; max-height:200px; border-radius:12px; margin:1rem 0;">` : ""}<div class="question-text">${escapeHtml(q.question)}</div><div class="options-list">${q.options.map((opt, optIdx) => `<label class="option-label" onclick="selectExamAnswer(${idx}, ${optIdx})"><input type="radio" name="q${idx}" value="${optIdx}"><span class="option-text">${escapeHtml(opt)}</span></label>`).join("")}</div>`; qSec.appendChild(div); }); let btn = document.createElement("button"); btn.className = "quiz-submit-btn"; btn.innerHTML = '<i class="fas fa-check-circle"></i> تسليم الامتحان'; btn.onclick = submitExam; qSec.appendChild(btn); examTimeRemaining = 600; updateExamTimer(); if (examTimer) clearInterval(examTimer); examTimer = setInterval(() => { examTimeRemaining--; updateExamTimer(); if (examTimeRemaining <= 0) { clearInterval(examTimer); submitExam(); } }, 1000); }
  function updateExamTimer() { let mins = Math.floor(examTimeRemaining / 60); let secs = examTimeRemaining % 60; let d = document.getElementById("timerDisplay"); d && (d.textContent = mins + ":" + secs.toString().padStart(2, "0")); let timer = document.getElementById("quizTimer"); timer && (examTimeRemaining < 60 ? timer.classList.add("warning") : timer.classList.remove("warning")); }
  function selectExamAnswer(q, a) { currentExamAnswers[q] = a; }
  function submitExam() {
  if (examTimer) {
    clearInterval(examTimer);
    examTimer = null;
  }
  let name = document.getElementById("studentNameInput").value.trim();
  let phone = document.getElementById("studentPhoneInput").value.trim();
  let countryCode = '+20';
  let normalizedPhone = phone.includes("@") ? phone.toLowerCase() : normalizePhone(phone, countryCode);
  let total = currentExam.questions.length;
  let answered = Object.keys(currentExamAnswers).length;
  if (answered < total && !confirm(`لم تجب على ${total - answered} سؤال. هل تريد التسليم؟`)) {
    examTimeRemaining = Math.max(examTimeRemaining, 1);
    examTimer = setInterval(() => {
      examTimeRemaining--;
      updateExamTimer();
      if (examTimeRemaining <= 0) {
        clearInterval(examTimer);
        submitExam();
      }
    }, 1000);
    return;
  }
  let correct = 0;
  let ansList = [];
  for (let i = 0; i < total; i++) {
    let a = currentExamAnswers[i] !== undefined ? currentExamAnswers[i] : -1;
    ansList.push(a);
    if (a === currentExam.questions[i].correctAnswer) correct++;
  }
  let percent = Math.round(correct / total * 100);
  db.collection("exam_results").add({
    examId: currentExam.id,
    videoId: currentVideoIdForExam,
    studentName: sanitizeInput(name),
    studentPhone: normalizedPhone,
    userId: currentUserId,          // ✅ هذا هو التعديل الوحيد الذي أضفته
    answers: ansList,
    score: correct,
    totalQuestions: total,
    percentage: percent,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    gradeSent: false,
    resultVisible: false
  }).then(() => {
    SoundEffects.success();
    showExamResult(correct, total, percent);
  }).catch(e => {
    console.error(e);
    SoundEffects.error();
    showToast("❌ فشل التسليم");
  });
}
  function showExamResult(correct, total, percent) { let qSec = document.getElementById("quizSection"); if (!qSec) return; let msg = "", icon = ""; if (percent >= 90) { msg = "ممتاز! أداء رائع جداً"; icon = "🏆"; } else if (percent >= 75) { msg = "جيد جداً! استمر في التقدم"; icon = "👏"; } else if (percent >= 60) { msg = "جيد، يمكنك تحسين أدائك"; icon = "👍"; } else { msg = "حاول مرة أخرى، يمكنك التحسن"; icon = "💪"; } qSec.innerHTML = `<div class="quiz-result"><div class="result-icon">${icon}</div><div class="result-score">${percent}%</div><div class="result-message">${msg}</div><p style="color:#aaa; margin-bottom:1rem;">إجابات صحيحة: ${correct} من ${total}</p><button class="quiz-btn" onclick="closeTakeExamModal()"><i class="fas fa-times"></i> إغلاق</button></div>`; }

  // AI Functions
  function openTeachAICircleModal() { isAdmin ? (document.getElementById("teachAICircleModal").classList.add("active"), renderAIKnowledgeList()) : showToast("❌ هذه الصلاحية للمشرف فقط"); }
  function closeTeachAICircleModal() { document.getElementById("teachAICircleModal").classList.remove("active"); }
  function renderAIKnowledgeList() { let list = document.getElementById("aiKnowledgeList"); if (!list) return; if (aiKnowledgeBase.length === 0) list.innerHTML = '<p style="text-align:center; color:#888; padding:2rem;">لا توجد معلومات بعد</p>'; else list.innerHTML = aiKnowledgeBase.map(k => `<div class="ai-knowledge-item"><div class="ai-knowledge-content"><div class="ai-knowledge-question"><i class="fas fa-question-circle"></i> ${escapeHtml(k.question)}</div><div class="ai-knowledge-answer">${escapeHtml(k.answer)}</div></div><button class="ai-knowledge-delete" onclick="deleteAIKnowledge('${k.id}')" title="حذف"><i class="fas fa-trash"></i></button></div>`).join(""); }
  function saveAIKnowledge() { let q = document.getElementById("aiQuestionInput").value.trim(); let a = document.getElementById("aiAnswerInput").value.trim(); if (!q || !a) { showToast("⚠️ أدخل السؤال والإجابة"); return; } db.collection("ai_knowledge").add({ question: q, answer: a, createdBy: currentUser || "مشرف", createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => { SoundEffects.success(); showToast("✅ تم تعليم الذكاء الاصطناعي"); document.getElementById("aiQuestionInput").value = ""; document.getElementById("aiAnswerInput").value = ""; }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل الحفظ"); }); }
  function deleteAIKnowledge(id) { if (confirm("هل أنت متأكد؟")) db.collection("ai_knowledge").doc(id).delete().then(() => { SoundEffects.delete(); showToast("🗑️ تم الحذف"); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل الحذف"); }); }
  function openAIChat() {
    var modal = document.getElementById("aiChatModal");
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
    var msgs = document.getElementById("aiChatMessages");
    if (msgs.children.length === 0) displayAIMessage("مرحباً! أنا مساعد Astronomy.", "ai");
    setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; setupChatKeyboard("aiChatModal"); }, 150);
  }
  function closeAIChat() {
    document.getElementById("aiChatModal").classList.remove("active");
    document.body.style.overflow = "";
    teardownChatKeyboard("aiChatModal");
  }

  /* ===== MOBILE KEYBOARD HANDLER — v3 (fixed input above keyboard) ===== */
  var _kbCleanups = {};

  function setupChatKeyboard(modalId) {
    teardownChatKeyboard(modalId);
    var modal     = document.getElementById(modalId);
    if (!modal) return;
    var container = modal.querySelector(".chat-container");
    var msgs      = modal.querySelector(".chat-messages");
    var inputArea = modal.querySelector(".chat-input-area");
    var textarea  = modal.querySelector(".unified-textarea") || modal.querySelector("textarea");
    if (!container || !msgs || !inputArea) return;

    // ── الفكرة الجديدة ──
    // نثبّت الـ inputArea بـ position:fixed فوق الكيبورد مباشرة
    // ونحسب ارتفاع الـ msgs بحيث ما يتغطاش

    function getVV() { return window.visualViewport || null; }

    function applyLayout() {
      var vv = getVV();
      var vpTop    = vv ? vv.offsetTop  : 0;
      var vpLeft   = vv ? vv.offsetLeft : 0;
      var vpHeight = vv ? vv.height     : window.innerHeight;
      var vpWidth  = vv ? vv.width      : window.innerWidth;

      // inputArea: ثابت في أسفل الـ visualViewport
      inputArea.style.position = "fixed";
      inputArea.style.bottom   = "0";
      inputArea.style.left     = vpLeft + "px";
      inputArea.style.width    = vpWidth + "px";
      inputArea.style.zIndex   = "99999";

      // ارتفاع inputArea الفعلي بعد ما اتحسبت
      var iaHeight = inputArea.offsetHeight || 70;

      // container: يأخذ ارتفاع الـ viewport كله
      container.style.height    = vpHeight + "px";
      container.style.maxHeight = vpHeight + "px";

      // msgs: كل المساحة إلا الـ header والـ inputArea
      var header = container.querySelector(".chat-header");
      var headerH = header ? header.offsetHeight : 70;
      msgs.style.height    = (vpHeight - headerH - iaHeight) + "px";
      msgs.style.maxHeight = (vpHeight - headerH - iaHeight) + "px";
      msgs.style.paddingBottom = "0";

      // scroll لآخر رسالة
      setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; }, 60);
    }

    function onVVResize()  { applyLayout(); }
    function onVVScroll()  { applyLayout(); }

    var vv = getVV();
    if (vv) {
      vv.addEventListener("resize", onVVResize);
      vv.addEventListener("scroll", onVVScroll);
    }
    // أول مرة
    applyLayout();

    // auto-resize textarea
    function autoResize() {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
      applyLayout();
    }
    if (textarea) {
      textarea.addEventListener("input", autoResize);
    }

    _kbCleanups[modalId] = function() {
      if (vv) {
        vv.removeEventListener("resize", onVVResize);
        vv.removeEventListener("scroll", onVVScroll);
      }
      if (textarea) textarea.removeEventListener("input", autoResize);
      // إعادة كل الستايلات
      inputArea.style.position = "";
      inputArea.style.bottom   = "";
      inputArea.style.left     = "";
      inputArea.style.width    = "";
      inputArea.style.zIndex   = "";
      container.style.height   = "";
      container.style.maxHeight= "";
      msgs.style.height        = "";
      msgs.style.maxHeight     = "";
      msgs.style.paddingBottom = "";
    };
  }

  function teardownChatKeyboard(modalId) {
    if (_kbCleanups[modalId]) { _kbCleanups[modalId](); delete _kbCleanups[modalId]; }
  }
  window.setupChatKeyboard    = setupChatKeyboard;
  window.teardownChatKeyboard = teardownChatKeyboard;

  /* ===== FULLSCREEN: إعادة تفعيل الـ keyboard fix ===== */
  function onFullscreenChange() {
    var activeChats = ["aiChatModal", "chatModal"];
    activeChats.forEach(function(id) {
      var m = document.getElementById(id);
      if (m && m.classList.contains("active")) {
        setTimeout(function(){ setupChatKeyboard(id); }, 300);
      }
    });
  }
  document.addEventListener("fullscreenchange",       onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  document.addEventListener("mozfullscreenchange",    onFullscreenChange);
  function clearAIChat() { if (!confirm("مسح كل المحادثة مع الذكاء الاصطناعي؟")) return; const c = document.getElementById("aiChatMessages"); if(c) c.innerHTML=""; if(window.speechSynthesis) window.speechSynthesis.cancel(); showToast("🗑️ تم مسح المحادثة"); }
  // ========== Image Generation via Vercel Proxy ==========
  async function generateAndDisplayImage(prompt) {
    const cont = document.getElementById("aiChatMessages");
    if (!cont) return;

    const seed = Math.floor(Math.random() * 9999999);
    const time = new Date().toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit" });
    const uid  = "ig_" + seed;

    // رسالة انتظار
    const msgEl = document.createElement("div");
    msgEl.className = "message received";
    msgEl.innerHTML =
      `<div class="message-sender" style="color:#06b6d4;"><i class="fas fa-robot"></i> مساعد Astronomy</div>
       <div id="${uid}_st" class="message-content" style="display:flex;align-items:center;gap:8px;">
         <span style="width:9px;height:9px;border-radius:50%;background:#06b6d4;flex-shrink:0;animation:pulse 1s infinite"></span>
         <span id="${uid}_tx">✨ جاري توليد الصورة...</span>
       </div>
       <div id="${uid}_box" style="margin-top:8px;min-height:40px;"></div>
       <div class="message-time">${time}</div>`;
    cont.appendChild(msgEl);
    cont.scrollTop = cont.scrollHeight;

    // ترجمة (6 ثواني timeout)
    let enPrompt = "";
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { "Authorization": "Bearer " + getAiApiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "Translate Arabic to English for AI image generation. Reply ONLY with a concise English description, max 20 words. No quotes, no explanation." },
            { role: "user", content: prompt }
          ],
          max_tokens: 60, temperature: 0.3
        })
      });
      const d = await r.json();
      enPrompt = (d?.choices?.[0]?.message?.content || "").trim();
    } catch(e) {}

    if (!enPrompt) enPrompt = prompt.substring(0, 100);
    const finalPrompt = `epic space astronomy ${enPrompt} cinematic dramatic 8k ultra detailed`;

    // استدعاء Vercel proxy بدل Pollinations مباشرة
    await _doGenerate(finalPrompt, uid, prompt, cont, seed, 1);
  }

  async function _doGenerate(finalPrompt, uid, origPrompt, cont, seed, attempt) {
    const stEl = document.getElementById(uid + "_st");
    const txEl = document.getElementById(uid + "_tx");
    const box  = document.getElementById(uid + "_box");
    if (!stEl || !box) return;

    const safeP = encodeURIComponent(origPrompt);

    if (attempt > 3) {
      stEl.innerHTML =
        `❌ فشل توليد الصورة.
         <button onclick="generateAndDisplayImage(decodeURIComponent('${safeP}'))"
           style="background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;border:none;
                  border-radius:20px;padding:5px 14px;cursor:pointer;font-family:inherit;
                  font-size:.85rem;margin-top:6px;display:inline-block;">
           <i class="fas fa-redo"></i> إعادة المحاولة
         </button>`;
      box.innerHTML = "";
      return;
    }

    if (txEl) txEl.textContent = attempt === 1 ? "🎨 جاري توليد الصورة..." : `🔄 محاولة ${attempt}/3...`;

    let secs = 0;
    const ticker = setInterval(() => {
      secs++;
      if (txEl) txEl.textContent = `🎨 يولد... ${secs}s`;
    }, 1000);

    // Pollinations.ai — مجاني 100% بدون API key
    const pollinationsModels = ["flux", "flux-realism", "turbo"];
    const chosenModel = pollinationsModels[attempt - 1] || "flux";
    const encodedPrompt = encodeURIComponent(finalPrompt);
    const imgSeed = seed + attempt;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${chosenModel}&seed=${imgSeed}&width=768&height=512&nologo=true&enhance=true`;

    try {
      // نعمل preload للصورة عشان نعرف لو نجحت ولا لا
      await new Promise((resolve, reject) => {
        const testImg = new Image();
        const timeout = setTimeout(() => reject(new Error("timeout")), 50000);
        testImg.onload = () => { clearTimeout(timeout); resolve(); };
        testImg.onerror = () => { clearTimeout(timeout); reject(new Error("load error")); };
        testImg.src = imageUrl;
      });

      clearInterval(ticker);

      const img = document.createElement("img");
      img.style.cssText = "max-width:100%;border-radius:14px;display:block;cursor:pointer;box-shadow:0 4px 28px rgba(6,182,212,.45);";
      img.onclick = function() { if (typeof viewImage === "function") viewImage(imageUrl); };
      img.src = imageUrl;
      img.loading = "lazy";

      if (txEl) txEl.textContent = "";
      stEl.innerHTML =
        `🎨 تم التوليد!
         <button onclick="generateAndDisplayImage(decodeURIComponent('${safeP}'))"
           style="background:rgba(255,255,255,.07);color:#aaa;border:none;border-radius:20px;
                  padding:3px 10px;cursor:pointer;font-family:inherit;font-size:.72rem;">
           <i class="fas fa-sync"></i> صورة جديدة
         </button>`;
      box.innerHTML = "";
      box.appendChild(img);
      if (cont) cont.scrollTop = cont.scrollHeight;

    } catch (err) {
      clearInterval(ticker);
      console.warn("_doGenerate pollinations error:", err);
      if (attempt < 3) {
        _doGenerate(finalPrompt, uid, origPrompt, cont, seed, attempt + 1);
      } else {
        stEl.innerHTML = `❌ فشل توليد الصورة.
          <button onclick="generateAndDisplayImage(decodeURIComponent('${safeP}'))"
            style="background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;border:none;
                   border-radius:20px;padding:5px 14px;cursor:pointer;font-family:inherit;
                   font-size:.85rem;margin-top:6px;display:inline-block;">
            <i class="fas fa-redo"></i> إعادة المحاولة
          </button>`;
      }
    }
  }
  const IMAGE_GEN_TRIGGERS = [
    // فصحى
    "ارسم","ارسم لي","رسم","ارسملي","ارسمي",
    "ولد صورة","ولد صوره","توليد صورة","توليد صوره",
    "اعمل صورة","اعمل صوره","أعمل صورة","أعمل صوره",
    "انشئ صورة","انشئ صوره","أنشئ صورة","أنشئ صوره","انشاء صورة",
    "صمم صورة","صمم صوره","تصميم صورة","تصميم صوره",
    "صور لي","صورة لي","صورة لـ","صورة ل","صوره لي",
    "ابتكر صورة","ابتكر صوره","اصنع صورة","اصنع صوره",
    "generate image","generate a photo","generate picture",
    "draw","draw me","draw a","create image","create a picture",
    "make image","make a picture","make me a picture",
    // مصري
    "عايز صوره","عايز صورة","عاوز صوره","عاوز صورة",
    "اعمللي صوره","اعمللي صورة","ارسملي صوره","ارسملي صورة",
    "هات صوره","هات صورة","هاتلي صوره","هاتلي صورة",
    "جيبلي صوره","جيبلي صورة","جيب صوره","جيب صورة",
    "اعطني صوره","اعطني صورة","اديني صوره","اديني صورة",
    "ورني صوره","ورني صورة","وريني صوره","وريني صورة",
    "عمل صوره","عمل صورة","شيل صوره","شيل صورة",
    // خليجي
    "ابي صوره","ابي صورة","ابغى صوره","ابغى صورة",
    "بغيت صوره","بغيت صورة","ابا صوره","ابا صورة",
    "واجد صوره","واجد صورة","سوي لي صوره","سوي لي صورة",
    "سويلي صوره","سويلي صورة","طلعلي صوره","طلعلي صورة",
    "بي صوره","بي صورة","اريد صوره","اريد صورة",
    // شامي / لبناني
    "رسملي","رسم لي","ارسمي لي","فوتو","صورني",
    "عملي صورة","عملي صوره","اعطيني صورة","اعطيني صوره",
    // مغربي / تونسي
    "دير لي صورة","دير لي صوره","دير صورة","دير صوره",
    "صاور لي","صاورلي","عطيني صورة","عطيني صوره",
    // تعابير إضافية
    "صوره بتاعت","صورة بتاعت","اعمل لي رسمه","اعمل لي رسمة",
    "ارسم صورة","ارسم صوره","رسمه","رسمة",
    "خلق صورة","خلق صوره","ولدلي صورة","ولدلي صوره",
    "صوره من","صورة من","حط صوره","حط صورة"
  ];

  function isImageRequest(text) {
    const t = text.trim().toLowerCase();
    return IMAGE_GEN_TRIGGERS.some(trigger => t.startsWith(trigger) || t.includes(trigger));
  }

  function extractImagePrompt(text) {
    const t = text.trim();
    for (const trigger of IMAGE_GEN_TRIGGERS) {
      const idx = t.toLowerCase().indexOf(trigger);
      if (idx !== -1) {
        const after = t.slice(idx + trigger.length).trim().replace(/^[:\-,\s]+/, '');
        if (after) return after;
      }
    }
    return t;
  }

  async function sendAIMessage() {
    let input = document.getElementById("aiChatInput");
    let text = input.value.trim();
    if (!text) return;
    const sendBtn = document.querySelector("#aiChatModal .chat-send-btn");
    if (sendBtn) { sendBtn.classList.remove("sending"); void sendBtn.offsetWidth; sendBtn.classList.add("sending"); setTimeout(() => sendBtn.classList.remove("sending"), 600); }
    displayAIMessage(text, "user");
    input.value = "";

    // لو الرسالة طلب توليد صورة
    if (isImageRequest(text)) {
      const prompt = extractImagePrompt(text);
      await generateAndDisplayImage(prompt);
      return;
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + getAiApiKey(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "أنت مساعد متخصص في الفلك. جاوب بالعربية بدقة." },
            { role: "user", content: text }
          ],
          max_tokens: 8000,
          temperature: 0.3
        })
      });
      const data = await response.json();
      const answer = data.choices[0].message.content;
      displayAIMessage(answer, "ai");
      speakText(answer);
    } catch (error) {
      console.error(error);
      displayAIMessage("عذراً، فشل الاتصال بالذكاء الاصطناعي.", "ai");
    }
  }
  function displayAIMessage(text, sender) { let cont = document.getElementById("aiChatMessages"); if (!cont) return; let msg = document.createElement("div"); msg.className = "message " + (sender === "user" ? "sent" : "received"); let time = new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); let html = ""; if (sender === "received") html += '<div class="message-sender" style="color:#06b6d4;"><i class="fas fa-robot"></i> مساعد Astronomy</div>'; html += '<div class="message-content">' + escapeHtml(text) + '</div><div class="message-time">' + time + '</div>'; msg.innerHTML = html; cont.appendChild(msg); cont.scrollTop = cont.scrollHeight; }
  function handleAIKeyPress(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAIMessage(); } }

  // ========== Chat Functions with Validation ==========
  async function checkIfUserAlreadyActive(name, phone) { try { const activeUserQuery = await db.collection("active_sessions").where("name", "==", name).where("phone", "==", phone).where("active", "==", true).get(); if (!activeUserQuery.empty) { const currentDeviceId = localStorage.getItem("falak_device_id"); if (!currentDeviceId) { for (const doc of activeUserQuery.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } return { allowed: true }; } const session = activeUserQuery.docs[0].data(); if (session.deviceId !== currentDeviceId) { for (const doc of activeUserQuery.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } return { allowed: true }; } } return { allowed: true }; } catch (error) { console.error("Error checking active user:", error); return { allowed: true }; } }
  async function registerActiveSession(name, phone) { try { let deviceId = localStorage.getItem("falak_device_id"); if (!deviceId) { deviceId = "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9); localStorage.setItem("falak_device_id", deviceId); } const existingSessions = await db.collection("active_sessions").where("name", "==", name).where("phone", "==", phone).get(); for (const doc of existingSessions.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } await db.collection("active_sessions").add({ name: name, phone: phone, deviceId: deviceId, active: true, userAgent: navigator.userAgent, startedAt: firebase.firestore.FieldValue.serverTimestamp(), lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); startSessionHeartbeat(name, phone, deviceId); } catch (error) { console.error("Error registering active session:", error); } }
  function startSessionHeartbeat(name, phone, deviceId) { if (window.sessionHeartbeatInterval) { clearInterval(window.sessionHeartbeatInterval); } window.sessionHeartbeatInterval = setInterval(async () => { try { const sessions = await db.collection("active_sessions").where("name", "==", name).where("phone", "==", phone).where("active", "==", true).get(); sessions.forEach(async (doc) => { await db.collection("active_sessions").doc(doc.id).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); }); } catch (error) { console.error("Heartbeat error:", error); } }, 30000); }
  async function endUserSession(name, phone) { try { const sessions = await db.collection("active_sessions").where("name", "==", name).where("phone", "==", phone).where("active", "==", true).get(); sessions.forEach(async (doc) => { await db.collection("active_sessions").doc(doc.id).update({ active: false, endedAt: firebase.firestore.FieldValue.serverTimestamp() }); }); if (window.sessionHeartbeatInterval) { clearInterval(window.sessionHeartbeatInterval); window.sessionHeartbeatInterval = null; } } catch (error) { console.error("Error ending session:", error); } }
  async function cleanupOldSessions() { const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); try { const oldSessions = await db.collection("active_sessions").where("active", "==", true).where("lastSeen", "<", oneHourAgo).get(); oldSessions.forEach(async (doc) => { await db.collection("active_sessions").doc(doc.id).update({ active: false, endedAt: firebase.firestore.FieldValue.serverTimestamp(), reason: "timeout" }); }); } catch (error) { console.error("Cleanup error:", error); } }
  async function checkIfUserAlreadyActiveGoogle(email, phone) { try { const activeUserQuery = await db.collection("active_sessions").where("email", "==", email).where("active", "==", true).get(); if (!activeUserQuery.empty) { const currentDeviceId = localStorage.getItem("falak_device_id"); if (!currentDeviceId) { for (const doc of activeUserQuery.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } return { allowed: true }; } const session = activeUserQuery.docs[0].data(); if (session.deviceId !== currentDeviceId) { for (const doc of activeUserQuery.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } return { allowed: true }; } } return { allowed: true }; } catch (error) { console.error("Error checking active user:", error); return { allowed: true }; } }
  async function registerActiveSessionGoogle(email, name, phone) { try { let deviceId = localStorage.getItem("falak_device_id"); if (!deviceId) { deviceId = "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9); localStorage.setItem("falak_device_id", deviceId); } const existingSessions = await db.collection("active_sessions").where("email", "==", email).get(); for (const doc of existingSessions.docs) { await db.collection("active_sessions").doc(doc.id).delete(); } await db.collection("active_sessions").add({ email: email, name: name, phone: phone, deviceId: deviceId, active: true, loginType: "google", userAgent: navigator.userAgent, startedAt: firebase.firestore.FieldValue.serverTimestamp(), lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); startGoogleSessionHeartbeat(email, deviceId); } catch (error) { console.error("Error registering Google session:", error); } }
  function startGoogleSessionHeartbeat(email, deviceId) { if (window.googleSessionHeartbeat) { clearInterval(window.googleSessionHeartbeat); } window.googleSessionHeartbeat = setInterval(async () => { try { const sessions = await db.collection("active_sessions").where("email", "==", email).where("active", "==", true).get(); sessions.forEach(async (doc) => { await db.collection("active_sessions").doc(doc.id).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); }); } catch (error) { console.error("Google heartbeat error:", error); } }, 30000); }
  async function googleLogin() { 
    try { 
        showToast("⏳ جاري تسجيل الدخول..."); 
        const result = await auth.signInWithPopup(provider); 
        googleUser = result.user; 
        currentUserId = googleUser.uid; 
        let name = googleUser.displayName; 
        let email = googleUser.email; 
        let phone = googleUser.phoneNumber || ""; 
        const checkResult = await checkIfUserAlreadyActiveGoogle(email, phone); 
        if (!checkResult.allowed) { 
            SoundEffects.error(); 
            showToast(checkResult.message); 
            await auth.signOut(); 
            googleUser = null; 
            currentUserId = null; 
            return; 
        } 
        currentUser = name; 
        currentUserPhone = phone || ""; 

        // ✅ التعديل الجديد: التحقق من أول مشرف وتعيين صلاحيات Super Admin تلقائياً
        const adminSnap = await db.collection("admin_accounts").limit(1).get();
        if (adminSnap.empty) {
            // أول مستخدم في النظام يصبح Super Admin
            await db.collection("admin_accounts").doc(email).set({
                email: email,
                role: "super_admin",
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                addedBy: "auto_first_user"
            });
            console.log("✅ تم تعيين أول مستخدم كمشرف رئيسي:", email);
            isSuperAdmin = true;
            isAdmin = true;
            localStorage.setItem("falak_admin", "true");
        } else {
            // التحقق من دور المستخدم الحالي
            const myDoc = await db.collection("admin_accounts").doc(email).get();
            if (myDoc.exists && myDoc.data().role === "super_admin") {
                isSuperAdmin = true;
                isAdmin = true;
                localStorage.setItem("falak_admin", "true");
            } else if (myDoc.exists) {
                isAdmin = true;
                isSuperAdmin = false;
                localStorage.setItem("falak_admin", "true");
            } else {
                isAdmin = false;
                isSuperAdmin = false;
                localStorage.removeItem("falak_admin");
            }
        }

        await loadUserDataFromFirebase(currentUserId); 
        if (!currentUser) { 
            currentUser = name; 
            currentUserPhone = phone || ""; 
            await saveUserDataToFirebase(currentUserId); 
        } 
        await registerActiveSessionGoogle(email, currentUser, currentUserPhone); 
        if (currentUser) localStorage.setItem("falak_username", currentUser); 
        if (currentUserPhone) localStorage.setItem("falak_userphone", currentUserPhone); 
        document.getElementById("landingPage").style.display = "none"; 
        document.getElementById("appWrapper").style.display = "flex"; 
        document.getElementById("googleUserInfo").style.display = "flex"; 
        document.getElementById("googleUserInfo").innerHTML = `<i class="fas fa-user-circle"></i> ${escapeHtml(googleUser.displayName)}`; 
        document.getElementById("googleLogoutBtn").style.display = "block"; 
        updateGoogleLogoutButtonsVisibility(); 
        SoundEffects.join(); 
        try { await refreshAdminStatusFromFirestore(); } catch(_){} 
        loadAdminPreference(); 
        listenToVideosWithRetry(); 
        listenToCoursesAccess(); 
        listenToUserEnrollmentsAccess(); 
        listenToMaintenance(); 
        loadAIKnowledgeFromFirebase(); 
        loadExamsFromFirebase(); 
        loadExamResultsFromFirebase(); 
        loadAppsFromFirebase(); 
        checkUrlForShare(); 
        loadEmailSettingsFromFirestore(); 
        updateAdminUI(); 
        showToast(`مرحباً بعودتك ${currentUser}! 🚀`);
        // ── تطبيق خلفيات الدردشة الخاصة بهذا الحساب ──
        const _loginUid = currentUserId;
        setTimeout(function() { try { if (currentUserId === _loginUid) applyAllChatBgs(); } catch(_){} }, 800);
        // ── تحميل الـ dashboard بعد login ناجح ──
        setTimeout(function() { loadUserDashboard().catch(function(){}); }, 300);
        // ── Cloudinary خارج الـ try/catch — لو فشل مش يأثر على login ──
        setTimeout(function() { try { initCloudinaryWidget(); } catch(_){} }, 500);
    } catch(error) { 
        // تحقق إن المستخدم مش بالفعل لوغن (بيحصل لما popup يتقفل بدون error حقيقي)
        if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
            showToast("⚠️ تم إغلاق نافذة تسجيل الدخول");
            return;
        }
        if (auth.currentUser) {
            // المستخدم لوغن فعلاً — الـ error من خطوة تانية مش من الـ auth
            console.warn("Login succeeded but post-login step failed:", error);
            return;
        }
        console.error("Login error:", error);
        SoundEffects.error(); 
        showToast("❌ فشل تسجيل الدخول: " + (error.message || "حاول مرة أخرى")); 
    } 
}
  // loadUserDashboard() — يتعمل من داخل googleLogin بعد login ناجح فقط
  async function googleLogout() { if (currentUserId) await saveUserDataToFirebase(currentUserId); if (googleUser && googleUser.email) { try { const sessions = await db.collection("active_sessions").where("email", "==", googleUser.email).where("active", "==", true).get(); sessions.forEach(async (doc) => { await db.collection("active_sessions").doc(doc.id).update({ active: false, endedAt: firebase.firestore.FieldValue.serverTimestamp() }); }); } catch(e) { console.error("Error ending Google session:", e); } } if (window.googleSessionHeartbeat) { clearInterval(window.googleSessionHeartbeat); window.googleSessionHeartbeat = null; } stopUserEnrollmentsAccess(); try { clearAllChatBgsFromScreen(); } catch(_){} auth.signOut().then(() => { googleUser = null; currentUserId = null; localStorage.removeItem("falak_username"); localStorage.removeItem("falak_userphone"); localStorage.removeItem("falak_device_id"); currentUser = null; currentUserPhone = null; document.getElementById("landingPage").style.display = "flex"; document.getElementById("appWrapper").style.display = "none"; document.getElementById("googleUserInfo").style.display = "none"; document.getElementById("googleLogoutBtn").style.display = "none"; if (isAdmin) logout(); SoundEffects.recordStop(); showToast("👋 تم تسجيل الخروج من Google"); updateGoogleLogoutButtonsVisibility(); updateAdminUI(); }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ فشل تسجيل الخروج"); }); }
  function loadUserDataFromStorage() { let savedName = localStorage.getItem("falak_username"); let savedPhone = localStorage.getItem("falak_userphone"); if (savedName && savedPhone) { currentUser = savedName; currentUserPhone = savedPhone; return true; } return false; }
  function saveUserDataToStorage(name, phone) { if (!name || !phone) return false; localStorage.setItem("falak_username", name); localStorage.setItem("falak_userphone", phone); currentUser = name; currentUserPhone = phone; if (currentUserId) saveUserDataToFirebase(currentUserId); return true; }
  function checkUserName() { if (currentUser && currentUserPhone) return true; return loadUserDataFromStorage(); }
  function openChat() {
  if (googleUser && currentUserId) {
    document.getElementById("chatModal").classList.add("active");
    document.body.style.overflow = "hidden";
    document.getElementById("chatBadge").style.display = "none";
    unreadMessages = 0;
    loadMessages();
    scrollToBottom();
    initPresenceSystem();
    setTimeout(function(){ if(window.setupChatKeyboard) setupChatKeyboard("chatModal"); }, 150);
  } else {
    showToast("❌ يجب تسجيل الدخول بحساب Google أولاً للمشاركة في الدردشة");
    googleLogin();
  }
}
  function closeChat() { document.getElementById("chatModal").classList.remove("active"); document.body.style.overflow = ""; if(window.teardownChatKeyboard) teardownChatKeyboard("chatModal"); if (currentAudio) { currentAudio.pause(); currentAudio = null; } removePresence(); if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; } }
  async function saveUserName() { let name = document.getElementById("userNameInput").value.trim(); let countryCode = document.getElementById("userCountryCode").value; let phoneNumber = document.getElementById("userPhoneInput").value.trim(); if (!name) { SoundEffects.error(); showToast("⚠️ أدخل اسمك الكامل"); return; } if (!isValidName(name)) { SoundEffects.error(); showToast("⚠️ الاسم يجب أن يحتوي على حروف (2-20 حرف) ولا يحتوي على رموز"); return; } if (!phoneNumber) { SoundEffects.error(); showToast("⚠️ رقم الهاتف مطلوب"); return; } let fullPhone = normalizePhone(phoneNumber, countryCode); if (!validatePhone(fullPhone, countryCode)) { SoundEffects.error(); showToast("⚠️ رقم الهاتف غير صحيح — اختر الدولة وأدخل الأرقام بدون صفر في البداية"); return; } showToast("⏳ جاري التحقق من البيانات..."); const checkResult = await checkIfUserAlreadyActive(name, fullPhone); if (!checkResult.allowed) { SoundEffects.error(); showToast(checkResult.message); return; } saveUserDataToStorage(name, fullPhone); if (currentUserId) await saveUserDataToFirebase(currentUserId); await registerActiveSession(name, fullPhone); document.getElementById("nameModal").classList.remove("active"); document.getElementById("chatModal").classList.add("active"); SoundEffects.join(); initPresenceSystem(); loadMessages(); db.collection("chat_users").add({ name: name, phone: fullPhone, userId: currentUserId || null, joinedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(err => console.warn("Could not save chat user:", err)); updateAdminUI(); }
  // loadUserDashboard() — يتعمل بعد تسجيل دخول ناجح فقط
  function loadMessages() { let cont = document.getElementById("chatMessages"); if (!cont) return; cont.innerHTML = '<div style="text-align:center;color:#666;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الرسائل...</div>'; if (chatUnsubscribe) chatUnsubscribe(); chatUnsubscribe = db.collection("messages").orderBy("timestamp", "asc").limitToLast(100).onSnapshot(snap => { cont.innerHTML = ""; snap.forEach(d => displayMessage(d.id, d.data())); scrollToBottom(); }, err => { console.error("Error loading messages:", err); cont.innerHTML = '<div style="text-align:center;color:#ef4444;padding:2rem;">⚠️ خطأ في تحميل الرسائل: ' + err.message + '</div>'; }); }
  function displayMessage(id, data) { if (data.type === "system") return; let cont = document.getElementById("chatMessages"); if (!cont) return; let isMe = data.sender === currentUser; let msgDiv = document.createElement("div"); msgDiv.className = "message " + (isMe ? "sent" : "received"); msgDiv.id = "msg-" + id; let html = ""; if (!isMe) { let senderDisplay = escapeHtml(data.sender); if (data.senderPhone && !data.senderPhone.includes('@')) { senderDisplay += ` <span style="font-size: 0.7rem; color: #aaa; direction: ltr; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 12px;">${escapeHtml(data.senderPhone)}</span>`; } html += '<div class="message-sender">' + senderDisplay + "</div>"; } if (isAdmin || data.sender === currentUser) { let title = isAdmin ? "حذف (مشرف)" : "حذف رسالتك"; html += '<button class="message-delete-btn ' + (isAdmin ? "admin" : "") + '" onclick="deleteMessage(\'' + id + "', '" + escapeHtml(data.sender) + '\')" title="' + title + '"><i class="fas fa-times"></i></button>'; } if (data.text) html += '<div class="message-content">' + escapeHtml(data.text) + "</div>"; if (data.imageUrl) html += '<img src="' + data.imageUrl + '" class="message-image" onclick="viewImage(this.src)">'; if (data.audioUrl) html += '<div class="voice-message" id="voice-' + id + '"><button class="voice-play-btn" onclick="playVoiceMessage(this, \'' + data.audioUrl + "', '" + id + '\')"><i class="fas fa-play"></i></button><div class="voice-slider" onclick="seekVoice(event, this, \'' + id + '\')"><div class="voice-progress" id="progress-' + id + '"></div></div><span class="voice-time" id="time-' + id + '">0:00</span></div><audio id="audio-' + id + '" src="' + data.audioUrl + '" preload="metadata" style="display:none;"></audio>'; html += '<div class="message-time">' + (data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "") + "</div>"; msgDiv.innerHTML = html; if (!isMe && document.getElementById("chatModal") && !document.getElementById("chatModal").classList.contains("active")) { unreadMessages++; let badge = document.getElementById("chatBadge"); badge && (badge.textContent = unreadMessages, badge.style.display = "flex"); SoundEffects.receive(); } cont.appendChild(msgDiv); }
  function deleteMessage(id, sender) { if (!isAdmin && (!currentUser || !sender || sender.trim() !== currentUser.trim())) { SoundEffects.error(); showToast("❌ لا يمكنك حذف هذه الرسالة"); return; } if (!confirm(isAdmin ? "هل أنت متأكد من حذف هذه الرسالة؟ (أنت مشرف)" : "هل أنت متأكد من حذف رسالتك؟")) return; if (!id) { SoundEffects.error(); showToast("❌ معرف الرسالة غير صالح"); return; } db.collection("messages").doc(id).delete().then(() => { SoundEffects.delete(); showToast("🗑️ تم حذف الرسالة"); let el = document.getElementById("msg-" + id); el && el.remove(); }).catch(e => { console.error(e); SoundEffects.error(); if (e.code === "permission-denied") showToast("❌ صلاحية الحذف غير كافية"); else if (e.code === "not-found") showToast("❌ الرسالة غير موجودة"); else showToast("❌ فشل الحذف"); }); }
  function playVoiceMessage(btn, url, id) { let audio = document.getElementById("audio-" + id); let prog = document.getElementById("progress-" + id); let time = document.getElementById("time-" + id); if (!audio || !prog || !time) return; if (currentAudio && currentAudio !== audio) { currentAudio.pause(); currentAudio.currentTime = 0; if (currentAudioBtn) { currentAudioBtn.innerHTML = '<i class="fas fa-play"></i>'; currentAudioBtn.classList.remove("playing"); } } if (audio.paused) { audio.play().then(() => { currentAudio = audio; currentAudioBtn = btn; btn.innerHTML = '<i class="fas fa-pause"></i>'; btn.classList.add("playing"); audio.ontimeupdate = () => { let p = (audio.currentTime / audio.duration) * 100; prog.style.width = p + "%"; let m = Math.floor(audio.currentTime / 60); let s = Math.floor(audio.currentTime % 60); time.textContent = m + ":" + s.toString().padStart(2, "0"); }; audio.onended = () => { btn.innerHTML = '<i class="fas fa-play"></i>'; btn.classList.remove("playing"); prog.style.width = "0%"; time.textContent = "0:00"; currentAudio = null; currentAudioBtn = null; }; }).catch(e => { console.error(e); SoundEffects.error(); showToast("❌ لا يمكن تشغيل الصوت"); }); } else { audio.pause(); btn.innerHTML = '<i class="fas fa-play"></i>'; btn.classList.remove("playing"); } }
  function seekVoice(e, slider, id) { let audio = document.getElementById("audio-" + id); if (!audio || !audio.duration) return; let rect = slider.getBoundingClientRect(); let pos = (e.clientX - rect.left) / rect.width; audio.currentTime = pos * audio.duration; }
  function sendMessage() {
  let inp = document.getElementById("messageInput");
  if (!inp) return;
  let text = inp.value.trim();
  if (!text) return;
  const sendBtn = document.querySelector("#chatModal .chat-send-btn");
  if (sendBtn) { sendBtn.classList.remove("sending"); void sendBtn.offsetWidth; sendBtn.classList.add("sending"); setTimeout(() => sendBtn.classList.remove("sending"), 600); }
  // يقبل Google أو الاسم+هاتف العادي
  const senderName = (googleUser && googleUser.displayName) || currentUser || "مجهول";
  const senderPhone = (googleUser && googleUser.phoneNumber) || currentUserPhone || "";
  if (!senderName || senderName === "مجهول" && !senderPhone) { showToast("⚠️ الرجاء تسجيل الدخول أولاً"); return; }
  db.collection("messages").add({
    type: "text",
    text: text,
    sender: senderName,
    senderPhone: senderPhone,
    userId: currentUserId,
    senderId: currentUserId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    SoundEffects.send();
    inp.value = "";
  }).catch(() => {
    SoundEffects.error();
    showToast("فشل الإرسال");
  });
}
  window.sendMessage = sendMessage;
  function handleKeyPress(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
  function sendImage(input) {
  let file = input.files[0];
  if (!file || !googleUser) return;
  if (file.size > 5 * 1024 * 1024) {
    SoundEffects.error();
    showToast("الصورة كبيرة (الحد 5 ميجا)");
    return;
  }
  showToast("جاري الرفع...");
  let fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  fd.append("cloud_name", CLOUDINARY_CONFIG.cloudName);
  fetch("https://api.cloudinary.com/v1_1/" + CLOUDINARY_CONFIG.cloudName + "/image/upload", {
    method: "POST",
    body: fd
  }).then(r => r.json()).then(d => {
    db.collection("messages").add({
      type: "image",
      imageUrl: d.secure_url,
      sender: googleUser.displayName,
      senderPhone: googleUser.phoneNumber || "",
      userId: currentUserId,
      senderId: currentUserId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    SoundEffects.send();
    showToast("تم إرسال الصورة");
    input.value = "";
  }).catch(() => {
    SoundEffects.error();
    showToast("فشل الرفع");
  });
}
  async function toggleRecording() { if (isRecording) stopRecording(); else await startRecording(); }
  async function startRecording() { if (!currentUser) { showToast("❌ سجل دخولك أولاً"); return; } try { let stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(stream); audioChunks = []; mediaRecorder.ondataavailable = e => e.data.size && audioChunks.push(e.data); mediaRecorder.onstop = () => { uploadVoice(new Blob(audioChunks, { type: "audio/webm" })); stream.getTracks().forEach(t => t.stop()); }; mediaRecorder.start(); isRecording = true; document.getElementById("recordBtn").classList.add("recording"); document.getElementById("recordingIndicator").classList.add("active"); SoundEffects.recordStart(); let sec = 0; recordingTimer = setInterval(() => { sec++; let el = document.getElementById("recordingTime"); el && (el.textContent = Math.floor(sec / 60) + ":" + (sec % 60).toString().padStart(2, "0")); if (sec >= 60) stopRecording(); }, 1000); } catch (e) { showToast("❌ لا يمكن الوصول للميكروفون"); } }
  function stopRecording() { if (mediaRecorder && isRecording) { mediaRecorder.stop(); clearInterval(recordingTimer); isRecording = false; document.getElementById("recordBtn").classList.remove("recording"); document.getElementById("recordingIndicator").classList.remove("active"); document.getElementById("recordingTime").textContent = "0:00"; } }
  async function uploadVoice(blob) {
  if (!googleUser) {
    showToast("❌ يجب تسجيل الدخول أولاً");
    return;
  }
  showToast("📤 جاري رفع الرسالة الصوتية...");
  let fd = new FormData();
  fd.append("file", blob, "voice.webm");
  fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  fd.append("cloud_name", CLOUDINARY_CONFIG.cloudName);
  try {
    let res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`, {
      method: "POST",
      body: fd
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data = await res.json();
    if (!data.secure_url) throw new Error("لم يتم استلام الرابط");
    await db.collection("messages").add({
      type: "voice",
      audioUrl: data.secure_url,
      sender: googleUser.displayName,
      senderPhone: googleUser.phoneNumber || "",
      userId: currentUserId,
      senderId: currentUserId,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    SoundEffects.send();
    showToast("✅ تم إرسال الرسالة الصوتية");
  } catch (e) {
    console.error(e);
    SoundEffects.error();
    showToast("❌ فشل إرسال الصوت");
  }
}
  async function startVoiceCall() { if (!currentUser) return; try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); document.getElementById("callModal").classList.add("active"); document.getElementById("callStatus").textContent = "مكالمة - " + currentUser; callSeconds = 0; callTimer = setInterval(() => { callSeconds++; let el = document.getElementById("callTimer"); if (el) el.textContent = Math.floor(callSeconds / 60).toString().padStart(2, "0") + ":" + (callSeconds % 60).toString().padStart(2, "0"); }, 1000); SoundEffects.join(); } catch (e) { SoundEffects.error(); showToast("لا يمكن الوصول للميكروفون"); } }
  function toggleMute() { if (!localStream) return; let track = localStream.getAudioTracks()[0]; track.enabled = !track.enabled; let btn = document.getElementById("muteBtn"); btn && (btn.classList.toggle("active"), btn.innerHTML = track.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>'); }
  function endCall() { if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } clearInterval(callTimer); document.getElementById("callModal").classList.remove("active"); document.getElementById("callTimer").textContent = "00:00"; }
  function viewImage(src) { let viewer = document.getElementById("imageViewer"); let img = document.getElementById("viewerImage"); viewer && img && (img.src = src, viewer.classList.add("active")); }
  function closeImageViewer() { document.getElementById("imageViewer").classList.remove("active"); }
  function scrollToBottom() { let c = document.getElementById("chatMessages"); c && (c.scrollTop = c.scrollHeight); }
  function initPresenceSystem() { if (!currentUser) return; let uid = localStorage.getItem("falak_user_id"); if (!uid) { uid = "user_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now(); localStorage.setItem("falak_user_id", uid); } userPresenceRef = onlineUsersRef.doc(uid); userPresenceRef.set({ name: currentUser, userId: currentUserId || null, joinedAt: firebase.firestore.FieldValue.serverTimestamp(), lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(console.error); presenceInterval = setInterval(() => { userPresenceRef && userPresenceRef.update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(console.error); }, 20000); listenToOnlineUsers(); }
  function removePresence() { if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; } if (userPresenceRef) { userPresenceRef.delete().catch(console.error); userPresenceRef = null; } if (onlineUnsubscribe) { onlineUnsubscribe(); onlineUnsubscribe = null; } }
  function listenToOnlineUsers() { if (onlineUnsubscribe) onlineUnsubscribe(); onlineUnsubscribe = onlineUsersRef.onSnapshot(snap => { let cutoff = Date.now() - 120000; let online = []; snap.forEach(d => { let data = d.data(); if (data.lastSeen) { let time = (typeof data.lastSeen.toDate === "function") ? data.lastSeen.toDate().getTime() : data.lastSeen.seconds ? data.lastSeen.seconds * 1000 : new Date(data.lastSeen).getTime(); if (!isNaN(time) && time > cutoff) online.push(data); } }); let count = online.length; let text = count === 0 ? "لا أحد متصل" : count === 1 ? "متصل واحد" : count === 2 ? "متصلان" : count + " متصلين"; document.getElementById("onlineCount").textContent = text; }, err => { document.getElementById("onlineCount").textContent = "خطأ في التحميل"; }); }

  // Exam Result Functions
  function openExamResultModal() { document.getElementById("examResultModal").classList.add("active"); document.getElementById("examResultName").value = currentUser || ""; const ep = document.getElementById("examResultPhone"); ep.value = getStudentIdentifier(); if (currentUserId && ep.value.includes("@")) { ep.placeholder = "البريد الإلكتروني"; ep.type = "email"; } else { ep.placeholder = "رقم الهاتف"; ep.type = "tel"; } }
  function closeExamResultModal() { document.getElementById("examResultModal").classList.remove("active"); }
  function checkExamResult() {
  let name  = document.getElementById("examResultName").value.trim();
  let phone = document.getElementById("examResultPhone").value.trim();
  let countryCode = (document.getElementById("examResultCountryCode") || {value:'+20'}).value;
  if (!name)  { showToast("⚠️ أدخل اسمك الكامل"); return; }
  if (!isValidName(name)) { showToast("⚠️ الاسم غير صالح — يجب أن يحتوي على حروف"); return; }
  if (!phone) { showToast("⚠️ أدخل رقم الهاتف أو البريد الإلكتروني"); return; }
  let normalizedPhone;
  if (phone.includes("@")) {
    if (!validateEmail(phone)) { showToast("⚠️ البريد الإلكتروني غير صحيح — مثال: name@gmail.com"); return; }
    normalizedPhone = phone.toLowerCase().trim();
  } else {
    normalizedPhone = normalizePhone(phone, countryCode);
    if (!validatePhone(phone, countryCode)) { let pfx=(COUNTRY_PREFIX_MAP[countryCode]||[]).slice(0,3).join("، "); let cn=getCountryName(countryCode); showToast("⚠️ رقم غير صحيح لـ"+cn+" — يجب أن يبدأ بـ: "+pfx+"..."); return; }
  }

  // ✅ تم حذف السطر الذي يضيف مستند "exam-result-queries"

  db.collection("exam_results")
    .where("studentName", "==", name)
    .where("studentPhone", "==", normalizedPhone)
    .where("resultVisible", "==", true)
    .get()
    .then(snap => {
      if (snap.empty) {
        alert("لم يتم العثور على نتيجة لك بعد. يرجى التواصل مع المشرف.");
        closeExamResultModal();
        return;
      }
      let results = [];
      snap.forEach(d => results.push({ id: d.id, ...d.data() }));
      results.sort((a, b) => {
        let ta = a.submittedAt ? a.submittedAt.toDate().getTime() : 0;
        let tb = b.submittedAt ? b.submittedAt.toDate().getTime() : 0;
        return tb - ta;
      });
      let r = results[0];
      alert(`نتيجة الامتحان: ${r.score} من ${r.totalQuestions} (${r.percentage}%) - تهانينا ${name}!`);
      closeExamResultModal();
    })
    .catch(e => {
      console.error("Error fetching exam result:", e);
      alert("حدث خطأ أثناء البحث عن النتيجة. الرجاء التحقق من اتصالك بالإنترنت أو المحاولة لاحقاً.");
    });
}

  // YouTube Functions
  function extractYouTubeId(url) { const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/; const match = url.match(regExp); return (match && match[2].length === 11) ? match[2] : null; }
  async function addYouTubeVideo() { if (!isAdmin) { showToast("❌ المشرف فقط يمكنه الإضافة"); return; } const urlInput = document.getElementById("youtubeUrlInput"); const rawUrl = urlInput.value.trim(); if (!rawUrl) { showToast("⚠️ أدخل رابط صحيح"); return; }
    // Check if Google Drive
    const gdriveMath = rawUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (gdriveMath) {
      const fileId = gdriveMath[1];
      const title = prompt("أدخل عنوان الفيديو:", "فيديو من Google Drive");
      if (!title) return;
      const description = prompt("أدخل وصف الفيديو (اختياري):", "");
      const videoData = { title: sanitizeInput(title), description: sanitizeInput(description) || "", type: "gdrive", fileId: fileId, thumbnail: "", createdAt: firebase.firestore.FieldValue.serverTimestamp(), private: false };
      try { await db.collection("videos").add(videoData); showToast("✅ تم إضافة فيديو Google Drive"); urlInput.value = ""; } catch(e) { console.error(e); SoundEffects.error(); showToast("❌ فشل إضافة الفيديو"); }
      return;
    }
    // YouTube
    const videoId = extractYouTubeId(rawUrl); if (!videoId) { showToast("⚠️ الرابط غير صالح — يجب أن يكون YouTube أو Google Drive"); return; } const title = prompt("أدخل عنوان الفيديو:", "فيديو من يوتيوب"); if (!title) return; const description = prompt("أدخل وصف الفيديو (اختياري):", ""); const videoData = { title: sanitizeInput(title), description: sanitizeInput(description) || "", type: "youtube", videoId: videoId, thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, createdAt: firebase.firestore.FieldValue.serverTimestamp(), private: false }; try { await db.collection("videos").add(videoData); showToast("✅ تم إضافة فيديو يوتيوب"); urlInput.value = ""; } catch(e) { console.error(e); SoundEffects.error(); showToast("❌ فشل إضافة الفيديو"); } }

  function localLogout() { if (confirm("هل تريد تسجيل الخروج من حسابك المحلي؟ سيتم مسح اسمك ورقم هاتفك من هذه المتصفح.")) { if (currentUser && currentUserPhone) { endUserSession(currentUser, currentUserPhone); } localStorage.removeItem("falak_username"); localStorage.removeItem("falak_userphone"); localStorage.removeItem("falak_device_id"); currentUser = null; currentUserPhone = null; updateAdminUI(); location.reload(); } }

  // EmailJS settings
  async function loadEmailSettingsFromFirestore() {
    let doc = await db.collection("system").doc("email_settings").get();
    if(doc.exists) {
      let data = doc.data();
      emailSettings = { publicKey: data.publicKey || "", serviceId: data.serviceId || "", templateId: data.templateId || "" };
      localStorage.setItem("falak_email_settings", JSON.stringify(emailSettings));
    } else {
      let saved = localStorage.getItem("falak_email_settings");
      if(saved) {
        try { emailSettings = JSON.parse(saved); } catch(e) {}
      }
    }
  }
  function openEmailSettingsModal() { if(!isAdmin) { showToast("❌ للمشرف فقط"); return; } document.getElementById("emailPublicKey").value = emailSettings.publicKey; document.getElementById("emailServiceId").value = emailSettings.serviceId; document.getElementById("emailTemplateId").value = emailSettings.templateId; document.getElementById("emailSettingsModal").classList.add("active"); }
  function closeEmailSettingsModal() { document.getElementById("emailSettingsModal").classList.remove("active"); }
  function saveEmailSettings() {
    emailSettings.publicKey = document.getElementById("emailPublicKey").value.trim();
    emailSettings.serviceId = document.getElementById("emailServiceId").value.trim();
    emailSettings.templateId = document.getElementById("emailTemplateId").value.trim();
    localStorage.setItem("falak_email_settings", JSON.stringify(emailSettings));
    db.collection("system").doc("email_settings").set(emailSettings, { merge: true }).catch(console.error);
    showToast("✅ تم حفظ إعدادات البريد");
    closeEmailSettingsModal();
  }

  // ========== Feedback Functions with Validation ==========
  async function sendAutoReplyEmail(userEmail, userName) {
    if(!emailSettings.publicKey || !emailSettings.serviceId || !emailSettings.templateId) {
      console.warn("EmailJS settings missing, auto-reply not sent");
      return;
    }
    try {
      emailjs.init(emailSettings.publicKey);
      await emailjs.send(emailSettings.serviceId, emailSettings.templateId, {
        to_name: userName,
        to_email: userEmail,
        reply_message: "شكراً لتقييمك لمنصة Astronomy and space. تم استلام رأيك وسيتم الرد عليك قريباً إن شاء الله.\n\nفريق Astronomy and space",
        original_feedback: ""
      });
      console.log("Auto-reply email sent to", userEmail);
    } catch(e) {
      console.error("Failed to send auto-reply email:", e);
    }
  }

  function openFeedbackModal() { document.getElementById("feedbackModal").classList.add("active"); }
  function openHowToUseModal() { const m = document.getElementById("howToUseModal"); if (m) { m.classList.add("active"); const menu = document.getElementById("settingsMenu"); if (menu) menu.classList.remove("active"); } }
  function closeHowToUseModal() { const m = document.getElementById("howToUseModal"); if (m) m.classList.remove("active"); }
  window.openHowToUseModal = openHowToUseModal;
  window.closeHowToUseModal = closeHowToUseModal;
  function closeFeedbackModal() { document.getElementById("feedbackModal").classList.remove("active"); }
  async function submitFeedback() {
    let name     = document.getElementById("fbName").value.trim();
    let phone    = document.getElementById("fbPhone").value.trim();
    let email    = document.getElementById("fbEmail").value.trim();
    let countryCode = (document.getElementById("fbCountryCode") || {value: '+20'}).value;
    let governorate = document.getElementById("fbGovernorate").value.trim();
    let village  = document.getElementById("fbVillage").value.trim();
    let message  = document.getElementById("fbMessage").value.trim();

    // التحقق من الحقول المطلوبة
    if (!name)    { showToast("⚠️ الاسم الكامل مطلوب");                    document.getElementById("fbName").focus();    return; }
    if (!isValidName(name)) { showToast("⚠️ الاسم يجب أن يحتوي على حروف (2-50 حرف) ولا يحتوي على كود"); document.getElementById("fbName").focus(); return; }
    if (!phone)   { showToast("⚠️ رقم الهاتف مطلوب");                       document.getElementById("fbPhone").focus();   return; }
    let normalizedPhone = normalizePhone(phone, countryCode);
    if (!validatePhone(phone, countryCode)) { let pfx=(COUNTRY_PREFIX_MAP[countryCode]||[]).slice(0,3).join("، "); let cn=getCountryName(countryCode); showToast("⚠️ رقم غير صحيح لـ"+cn+" — يجب أن يبدأ بـ: "+pfx+"..."); document.getElementById("fbPhone").focus(); return; }
    if (!email)   { showToast("⚠️ البريد الإلكتروني مطلوب");                document.getElementById("fbEmail").focus();   return; }
    if (!validateEmail(email)) { showToast("⚠️ البريد الإلكتروني غير صحيح — مثال: name@gmail.com"); document.getElementById("fbEmail").focus(); return; }
    if (!message) { showToast("⚠️ الرجاء كتابة رأيك وتقييمك");              document.getElementById("fbMessage").focus(); return; }
    if (message.length < 5) { showToast("⚠️ التقييم قصير جداً، يرجى الكتابة بشكل أوضح"); return; }

    try {
      await db.collection("feedbacks").add({
        name:        sanitizeInput(name),
        phone:       normalizedPhone,
        countryCode: countryCode,
        email:       email.toLowerCase().trim(),
        governorate: sanitizeInput(governorate),
        village:     sanitizeInput(village),
        message:     sanitizeInput(message),
        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
        replied:     false
      });
      await sendAutoReplyEmail(email, name);
      showToast("✅ شكراً لتقييمك! تم إرسال تأكيد إلى بريدك الإلكتروني.");
      closeFeedbackModal();
      ["fbName","fbPhone","fbEmail","fbGovernorate","fbVillage","fbMessage"].forEach(id => {
        let el = document.getElementById(id); if (el) { el.value = ""; el.classList.remove("v-ok","v-err"); }
      });
      let msgCount = document.getElementById("fbMsgCount"); if (msgCount) msgCount.textContent = "0";
    } catch(e) { console.error(e); showToast("❌ فشل إرسال التقييم — تحقق من الاتصال بالإنترنت"); }
  }

  function openViewFeedbacksModal() {
    if(!isAdmin) { showToast("❌ هذه الصلاحية للمشرف فقط"); return; }
    document.getElementById("viewFeedbacksModal").classList.add("active");
    loadFeedbacksList();
  }
  function closeViewFeedbacksModal() { document.getElementById("viewFeedbacksModal").classList.remove("active"); if(feedbacksUnsubscribe) feedbacksUnsubscribe(); }
  function loadFeedbacksList() {
    if(feedbacksUnsubscribe) feedbacksUnsubscribe();
    feedbacksUnsubscribe = db.collection("feedbacks").orderBy("createdAt", "desc").onSnapshot(snap => {
      let container = document.getElementById("feedbacksListContainer");
      if(!container) return;
      if(snap.empty) { container.innerHTML = "<p style='text-align:center;color:#888;padding:2rem'>لا توجد تقييمات بعد</p>"; return; }
      let html = "";
      snap.forEach(doc => {
        let f = doc.data();
        let repliedBadge = f.replied ? '<span style="background:#10b981; padding:2px 8px; border-radius:20px; font-size:0.7rem;">✓ تم الرد</span>' : '';
        html += `
          <div class="feedback-card" data-id="${doc.id}">
            <div class="feedback-header">
              <div class="feedback-user">
                <span class="feedback-name"><i class="fas fa-user"></i> ${escapeHtml(f.name)}</span>
                <span class="feedback-phone"><i class="fas fa-phone"></i> ${escapeHtml(f.phone)}</span>
                <span class="feedback-email"><i class="fas fa-envelope"></i> ${escapeHtml(f.email)}</span>
              </div>
              ${repliedBadge}
            </div>
            <div class="feedback-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(f.governorate || '')} - ${escapeHtml(f.village || '')}</div>
            <div class="feedback-message">${escapeHtml(f.message)}</div>
            <div class="feedback-actions">
              <button class="reply-btn" onclick="prepareReply('${doc.id}', '${escapeHtml(f.name)}', '${escapeHtml(f.email)}')"><i class="fas fa-reply"></i> رد</button>
              <button class="delete-feedback-btn" onclick="deleteFeedback('${doc.id}')"><i class="fas fa-trash"></i> حذف</button>
            </div>
            ${f.replied ? `<div class="reply-status"><i class="fas fa-check-circle"></i> تم إرسال الرد إلى البريد الإلكتروني</div>` : ''}
          </div>
        `;
      });
      container.innerHTML = html;
    }, err => { console.error("خطأ في تحميل التقييمات:", err); document.getElementById("feedbacksListContainer").innerHTML = `<p style="color:#ef4444;text-align:center;padding:2rem">❌ خطأ: ${err.message}</p>`; });
  }
  let currentReplyFeedbackId = null, currentReplyEmail = null, currentReplyName = null;
  function prepareReply(id, name, email) {
    currentReplyFeedbackId = id;
    currentReplyName = name;
    currentReplyEmail = email;
    document.getElementById("replyToName").textContent = name;
    document.getElementById("replyToEmail").textContent = email;
    document.getElementById("replyMessage").value = "";
    document.getElementById("replyFeedbackModal").classList.add("active");
  }
  function closeReplyModal() { document.getElementById("replyFeedbackModal").classList.remove("active"); currentReplyFeedbackId = null; }
  async function sendReplyEmail() {
    let replyText = document.getElementById("replyMessage").value.trim();
    if(!replyText) { showToast("⚠️ اكتب نص الرد"); return; }
    if(!emailSettings.publicKey || !emailSettings.serviceId || !emailSettings.templateId) {
      showToast("⚠️ يرجى ضبط إعدادات البريد الإلكتروني أولاً من قائمة الإعدادات");
      return;
    }
    try {
      emailjs.init(emailSettings.publicKey);
      await emailjs.send(emailSettings.serviceId, emailSettings.templateId, {
        to_name: currentReplyName,
        to_email: currentReplyEmail,
        reply_message: replyText,
        original_feedback: document.querySelector(`.feedback-card[data-id="${currentReplyFeedbackId}"] .feedback-message`)?.innerText || ""
      });
      await db.collection("feedbacks").doc(currentReplyFeedbackId).update({ replied: true, repliedAt: firebase.firestore.FieldValue.serverTimestamp(), replyText: replyText });
      showToast("✅ تم إرسال الرد بنجاح");
      closeReplyModal();
      loadFeedbacksList();
    } catch(e) { console.error(e); showToast("❌ فشل إرسال البريد، تأكد من إعدادات EmailJS"); }
  }
  async function deleteFeedback(id) {
    if(confirm("هل أنت متأكد من حذف هذا التقييم؟")) {
      await db.collection("feedbacks").doc(id).delete();
      showToast("🗑️ تم الحذف");
    }
  }

  // PWA Install — يدعم كل المتصفحات
  let pwaInstalled = false;
  // تحقق لو التطبيق مثبَّت فعلاً (standalone mode)
  function isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://') ||
           pwaInstalled;
  }
  function updateInstallMenuVisibility() {
    // نعيد بناء الـ menu عشان يظهر/يختفي زر التثبيت حسب حالة PWA
    updateAdminUI();
  }
  function isIOSSafari() {
    const ua = navigator.userAgent;
    return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/.test(ua);
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallMenuVisibility();
  });
  window.addEventListener("appinstalled", () => {
    pwaInstalled = true;
    deferredPrompt = null;
    updateInstallMenuVisibility();
    showToast("✅ تم تثبيت التطبيق بنجاح!");
  });
  function installApp() {
    if (isPWAInstalled()) {
      showToast("✅ التطبيق مثبَّت بالفعل على جهازك!");
      updateAdminUI();
      return;
    }
    // افتح الـ modal دايماً — بيعرض الصورة + الخطوات + زرار التثبيت المباشر لو متاح
    openPwaModal();
  }
  // تحقق من الحالة عند التحميل
  window.addEventListener("load", function() { setTimeout(updateInstallMenuVisibility, 1000); });

  function initAuthState() { auth.onAuthStateChanged(async user => { if (user && !isAdmin) { googleUser = user; currentUserId = user.uid; let name = user.displayName; let email = user.email; let phone = user.phoneNumber || ""; currentUser = name; currentUserPhone = phone || ""; await loadUserDataFromFirebase(currentUserId); if (!currentUser) { currentUser = name; currentUserPhone = phone || ""; await saveUserDataToFirebase(currentUserId); } if (currentUser) localStorage.setItem("falak_username", currentUser); if (currentUserPhone) localStorage.setItem("falak_userphone", currentUserPhone); document.getElementById("landingPage").style.display = "none"; document.getElementById("appWrapper").style.display = "flex"; document.getElementById("googleUserInfo").style.display = "flex"; document.getElementById("googleUserInfo").innerHTML = `<i class="fas fa-user-circle"></i> ${escapeHtml(user.displayName)}`; document.getElementById("googleLogoutBtn").style.display = "block"; updateGoogleLogoutButtonsVisibility(); try { await refreshAdminStatusFromFirestore(); } catch(_){ updateAdminUI(); } loadAdminPreference(); listenToVideosWithRetry(); listenToCoursesAccess(); listenToUserEnrollmentsAccess(); listenToMaintenance(); loadAIKnowledgeFromFirebase(); loadExamsFromFirebase(); loadExamResultsFromFirebase(); loadAppsFromFirebase(); initCloudinaryWidget(); checkUrlForShare(); loadEmailSettingsFromFirestore(); const _authUid = user.uid; setTimeout(function(){ try { if(currentUserId === _authUid) applyAllChatBgs(); } catch(_){} }, 800); setTimeout(function(){ loadUserDashboard().catch(function(){}); }, 500);

        } else if (!user && !isAdmin) { try { clearAllChatBgsFromScreen(); } catch(_){} document.getElementById("landingPage").style.display = "flex"; document.getElementById("appWrapper").style.display = "none"; googleUser = null; currentUserId = null; currentUser = null; currentUserPhone = null; localStorage.removeItem("falak_username"); localStorage.removeItem("falak_userphone"); updateGoogleLogoutButtonsVisibility(); updateAdminUI(); } }); }

  function refreshPage() { SoundEffects.success(); const refreshBtn = document.querySelector('.refresh-btn i'); if (refreshBtn) { refreshBtn.style.transform = 'rotate(360deg)'; setTimeout(() => { if(refreshBtn) refreshBtn.style.transform = ''; }, 500); } location.reload(); }
  function hideLoader() { document.getElementById("loader")?.classList.add("hidden"); }
  function requestFullscreenAutomatically() { const elem = document.documentElement; const requestFullscreen = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen; if (requestFullscreen) { requestFullscreen.call(elem).catch(err => { console.warn("تعذر الدخول إلى وضع ملء الشاشة تلقائياً: ", err); }); } }

  function toggleSettingsMenu(e) { e.stopPropagation(); const menu = document.getElementById("settingsMenu"); if (menu) menu.classList.toggle("active"); }
  function closeSettingsMenuOnClickOutside(e) { const dropdown = document.getElementById("settingsDropdown"); const menu = document.getElementById("settingsMenu"); if (dropdown && menu && !dropdown.contains(e.target)) { menu.classList.remove("active"); } }
  function openAppsModal() { document.getElementById("appsModal").classList.add("active"); renderAppsList(); }
  function closeAppsModal() { document.getElementById("appsModal").classList.remove("active"); }

  document.addEventListener("DOMContentLoaded", function() {
    const dropdownBtn = document.getElementById("settingsDropdownBtn"); if (dropdownBtn) dropdownBtn.addEventListener("click", toggleSettingsMenu);
    document.addEventListener("click", closeSettingsMenuOnClickOutside);
  });

  window.addEventListener("load", function() {
    // الأخبار تتجدد دايماً عند كل دخول للمنصة — امسح الكاش القديم
    try { localStorage.removeItem('falak_news_cache'); } catch(e){}
    _newsCache = null; _newsTime = 0;
    loadUserDataFromStorage(); hideLoader(); requestFullscreenAutomatically(); setTimeout(requestFullscreenAutomatically, 1000); initAuthState(); loadEmailSettingsFromFirestore(); try { loadAiKeyOnce(); listenAiKey(); } catch(_){} document.getElementById("googleSignInBtn").onclick = googleLogin; document.getElementById("googleLogoutBtn").onclick = googleLogout; setTimeout(() => updateAdminUI(), 500); setInterval(cleanupOldSessions, 60 * 60 * 1000); });
  setTimeout(hideLoader, 5000);
  window.addEventListener("unload", function() { if (currentUserId) saveUserDataToFirebase(currentUserId); if (unsubscribeVideos) unsubscribeVideos(); if (unsubscribeExams) unsubscribeExams(); if (unsubscribeExamResults) unsubscribeExamResults(); if (unsubscribeAIKnowledge) unsubscribeAIKnowledge(); if (unsubscribeMaintenance) unsubscribeMaintenance(); if (unsubscribeApps) unsubscribeApps(); if(feedbacksUnsubscribe) feedbacksUnsubscribe(); removePresence(); });
  window.onclick = function(e) { if (e.target.classList.contains("modal")) { if (e.target.id === "videoModal") closeModal(); else if (e.target.id === "loginModal") closeLogin(); else if (e.target.id === "adminPasswordModal") closeAdminPasswordModal(); else if (e.target.id === "setAdminsModal") closeSetAdminsModal(); else if (e.target.id === "teachAICircleModal") closeTeachAICircleModal(); else if (e.target.id === "descriptionModal") closeDescriptionModal(); else if (e.target.id === "editVideoModal") closeEditVideoModal(); else if (e.target.id === "chatModal") closeChat(); else if (e.target.id === "aiChatModal") closeAIChat(); else if (e.target.id === "imageViewer") closeImageViewer(); else if (e.target.id === "maintenanceModal") closeMaintenanceModal(); else if (e.target.id === "chatBgModal") closeChatBgModal(); else if (e.target.id === "addQuizModal") closeAddExamModal(); else if (e.target.id === "viewResultsModal") closeViewResultsModal(); else if (e.target.id === "takeQuizModal") closeTakeExamModal(); else if (e.target.id === "voiceSettingsModal") closeVoiceSettings(); else if (e.target.id === "examResultModal") closeExamResultModal(); else if (e.target.id === "emailSettingsModal") closeEmailSettingsModal(); else if (e.target.id === "supervisorPayoutModal") closeSupervisorPayoutModal(); else if (e.target.id === "appsModal") closeAppsModal(); else if (e.target.id === "manageAppsModal") closeManageAppsModal(); else if (e.target.id === "addAppModal") closeAddAppModal(); else if (e.target.id === "feedbackModal") closeFeedbackModal(); else if (e.target.id === "viewFeedbacksModal") closeViewFeedbacksModal(); else if (e.target.id === "replyFeedbackModal") closeReplyModal(); } };
  document.addEventListener("keydown", function(e) { if (e.key === "Escape") { closeModal(); closeLogin(); closeAdminPasswordModal(); closeSetAdminsModal(); closeTeachAICircleModal(); closeDescriptionModal(); closeEditVideoModal(); closeChat(); closeAIChat(); closeAddExamModal(); closeViewResultsModal(); closeTakeExamModal(); if (document.getElementById("callModal")?.classList.contains("active")) endCall(); closeImageViewer(); closeMaintenanceModal(); closeVoiceSettings(); closeExamResultModal(); closeEmailSettingsModal(); closeSupervisorPayoutModal(); closeAppsModal(); closeManageAppsModal(); closeAddAppModal(); closeFeedbackModal(); closeViewFeedbacksModal(); closeReplyModal(); } });
  // ========== Dashboard Functions ==========


async function addPoints(userId, points, reason) {
  const pointsRef = db.collection("user_points").doc(userId);
  await db.runTransaction(async (t) => {
    const doc = await t.get(pointsRef);
    const current = doc.exists ? doc.data().points : 0;
    t.set(pointsRef, { points: current + points, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
  await db.collection("activities").add({ userId, message: `+${points} نقطة: ${reason}`, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
}

// ========== Courses Functions ==========
function openSupervisorPayoutModal() {
  if (!isAdmin) { showToast("❌ للمشرفين فقط"); return; }
  document.getElementById("supervisorPayoutModal").classList.add("active");
  loadSupervisorPayoutSettings();
}
function closeSupervisorPayoutModal() { document.getElementById("supervisorPayoutModal").classList.remove("active"); }
async function loadSupervisorPayoutSettings() {
  try {
    const doc = await db.collection("system").doc("supervisor_payout").get();
    const d = doc.exists ? doc.data() : {};
    document.getElementById("supervisorDefaultPaymentLink").value = d.defaultPaymentLink || "";
    document.getElementById("supervisorPayoutNote").value = d.payoutNote || "";
  } catch (e) { console.error(e); showToast("تعذر تحميل الإعدادات"); }
}
async function saveSupervisorPayoutSettings() {
  if (!isAdmin) return;
  const defaultPaymentLink = document.getElementById("supervisorDefaultPaymentLink").value.trim();
  const payoutNote = document.getElementById("supervisorPayoutNote").value.trim();
  if (defaultPaymentLink && !/^https?:\/\//i.test(defaultPaymentLink)) { showToast("رابط الدفع يجب أن يبدأ بـ https://"); return; }
  try {
    await db.collection("system").doc("supervisor_payout").set({
      defaultPaymentLink: defaultPaymentLink || null,
      payoutNote: payoutNote || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast("✅ تم حفظ إعدادات استلام المدفوعات");
    closeSupervisorPayoutModal();
  } catch (e) { console.error(e); showToast("❌ فشل الحفظ"); }
}

let currentEditingCourseId = null;

function closeCoursesListModal() {
  document.querySelectorAll(".modal.courses-list-modal").forEach(function (el) { el.remove(); });
}

function showCreateCourseModal() {
  if (!isAdmin && !(isAdminUser(currentUserId))) { showToast("❌ غير مصرح"); return; }
  closeCoursesListModal();
  document.getElementById("courseModalTitle").innerText = "إنشاء كورس جديد";
  document.getElementById("courseName").value = "";
  document.getElementById("courseDesc").value = "";
  document.getElementById("coursePrice").value = 0;
  const cpl = document.getElementById("coursePaymentLink");
  if (cpl) cpl.value = "";
  const imgEl = document.getElementById("courseImageUrl");
  if (imgEl) imgEl.value = "";
  const prevWrap = document.getElementById("courseImagePreview");
  if (prevWrap) prevWrap.style.display = "none";
  currentEditingCourseId = null;
  let container = document.getElementById("courseVideosChecklist");
  container.innerHTML = "";
  videos.forEach(v => {
    container.innerHTML += `<label style="display: block;"><input type="checkbox" value="${v.id}"> ${escapeHtml(v.title)}</label>`;
  });
  document.getElementById("courseModal").classList.add("active");
}

// معاينة صورة الكورس لحظياً
function previewCourseImage(url) {
  const wrap = document.getElementById("courseImagePreview");
  const img  = document.getElementById("courseImagePreviewImg");
  if (!wrap || !img) return;
  if (!url || !url.trim()) { wrap.style.display = "none"; img.src = ""; return; }
  // تحويل رابط Google Drive تلقائياً
  const converted = convertDriveUrl(url.trim());
  img.onerror = () => { wrap.style.display = "none"; };
  img.onload  = () => { wrap.style.display = "block"; };
  img.src = converted;
}

// تحويل رابط Google Drive لرابط عرض مباشر
function convertDriveUrl(url) {
  if (!url) return url;
  // https://drive.google.com/file/d/FILE_ID/view  → direct
  let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  // https://drive.google.com/open?id=FILE_ID
  m = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  // إذا كان بالفعل uc?export=view
  if (url.includes("uc?export=view")) return url;
  return url;
}

async function saveCourse() {
  const name = document.getElementById("courseName").value.trim();
  const desc = document.getElementById("courseDesc").value.trim();
  const price = parseInt(document.getElementById("coursePrice").value) || 0;
  const paymentLink = (document.getElementById("coursePaymentLink") && document.getElementById("coursePaymentLink").value.trim()) || "";
  const rawImageUrl = (document.getElementById("courseImageUrl") && document.getElementById("courseImageUrl").value.trim()) || "";
  const imageUrl = convertDriveUrl(rawImageUrl) || "";
  const selectedVideos = Array.from(document.querySelectorAll("#courseVideosChecklist input:checked")).map(cb => cb.value);
  if (!name) { showToast("⚠️ أدخل اسم الكورس"); return; }
  if (selectedVideos.length === 0) { showToast("⚠️ اختر فيديو واحد على الأقل"); return; }
  if (price > 0 && !paymentLink) { showToast("⚠️ أدخل رابط دفع آمن للكورس المدفوع أو اجعل السعر 0"); return; }
  const courseData = { title: name, description: desc, videoIds: selectedVideos, price, paymentLink: paymentLink || null, imageUrl: imageUrl || null, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (currentEditingCourseId) {
    await db.collection("courses").doc(currentEditingCourseId).update(courseData);
    showToast("✅ تم تحديث الكورس");
  } else {
    await db.collection("courses").add(courseData);
    showToast("✅ تم إنشاء الكورس");
  }
  closeCourseModal();
  showCoursesList();
}

function closeCourseModal() { document.getElementById("courseModal").classList.remove("active"); }

// ===== فتح مودال تفاصيل الكورس المدفوع مع قائمة الفيديوهات =====
// ===== إدارة الكورسات للمشرف =====
window.openManageCoursesAdmin = async function() {
  try {
    const snap = await db.collection('courses').get();
    if (snap.empty) { showToast('لا توجد كورسات بعد'); return; }
    let rows = '';
    snap.forEach(doc => {
      const c = doc.data() || {};
      const price = c.price || 0;
      const nV = (c.videoIds || []).length;
      const safeTitle = escapeHtml(c.title || '').replace(/'/g,"\\'");
      rows += `<div style="display:flex;align-items:center;gap:.75rem;padding:.8rem 1rem;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.07);margin-bottom:.6rem">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.95rem;color:#e2e8f0">${escapeHtml(c.title||'بدون اسم')}</div>
          <div style="font-size:.78rem;color:#94a3b8;margin-top:.2rem"><i class="fas fa-photo-film"></i> ${nV} فيديو &nbsp;·&nbsp; <span style="color:${price>0?'#f59e0b':'#10b981'}">${price>0?price+' جنيه':'مجاني'}</span></div>
        </div>
        <button onclick="if(confirm('حذف كورس ${safeTitle}؟')){db.collection('courses').doc('${doc.id}').delete().then(()=>{showToast('🗑️ تم الحذف');this.closest('div').parentElement.remove()}).catch(()=>showToast('❌ فشل'))}" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.5);color:#f87171;border-radius:8px;padding:.4rem .75rem;cursor:pointer;font-family:Cairo;font-size:.82rem;white-space:nowrap"><i class="fas fa-trash"></i> حذف</button>
      </div>`;
    });
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '10010';
    modal.innerHTML = `<div class="modal-content" style="max-width:520px">
      <div class="modal-header" style="background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(217,119,6,.12));border-bottom:1px solid rgba(245,158,11,.3)">
        <h3 style="color:#fbbf24"><i class="fas fa-graduation-cap"></i> إدارة الكورسات</h3>
        <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:1rem;display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end">
          <button onclick="if(confirm('حذف كل الكورسات المدفوعة؟')){deleteAllPaidCourses()}" class="btn btn-warning" style="font-size:.82rem"><i class="fas fa-coins"></i> مسح المدفوعة</button>
          <button onclick="if(confirm('حذف كل الكورسات؟')){deleteAllCourses()}" class="btn btn-danger" style="font-size:.82rem"><i class="fas fa-trash"></i> مسح الكل</button>
        </div>
        <div>${rows}</div>
      </div>
    </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) { console.error(e); showToast('❌ فشل تحميل الكورسات'); }
};

window.openPaidCourseModal = async function(courseId) {
  if (!courseId) { showCoursesList(); return; }
  try {
    const doc = await db.collection('courses').doc(courseId).get();
    if (!doc.exists) { showCoursesList(); return; }
    const c = doc.data() || {};
    const videoIds = Array.isArray(c.videoIds) ? c.videoIds : [];
    const price = c.price || 0;
    const paymentLink = c.paymentLink || '';
    const title = c.title || 'كورس';
    const desc = c.description || '';

    // بناء قائمة الفيديوهات
    // هل المستخدم مشترك بالفعل؟
    let isEnrolled = false;
    if (currentUserId) {
      try {
        const enSnap = await db.collection('course_enrollments')
          .where('userId','==',currentUserId).where('courseId','==',courseId).limit(1).get();
        isEnrolled = !enSnap.empty;
      } catch(_) {}
    }
    const courseVideos = videoIds.map(id => videos.find(v => v.id === id)).filter(Boolean);

    let videosHtml = courseVideos.map(v => {
      let thumb = v.thumbnail;
      if (!thumb && v.type === 'youtube') thumb = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
      const duration = v.duration ? formatDuration(v.duration) : '';
      if (isEnrolled) {
        // مشترك → قابل للضغط والتشغيل مباشرة
        return `<div onclick="this.closest('.modal').remove(); playVideo('${v.id}')" style="display:flex;align-items:center;gap:.85rem;padding:.75rem;background:rgba(99,102,241,.08);border-radius:12px;border:1px solid rgba(99,102,241,.2);cursor:pointer;transition:background .2s" onmouseover="this.style.background='rgba(99,102,241,.2)'" onmouseout="this.style.background='rgba(99,102,241,.08)'">
          <div style="position:relative;width:90px;min-width:90px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#0a0512">
            ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#555"><i class="fas fa-film"></i></div>'}
            <div style="position:absolute;inset:0;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center"><i class="fas fa-play-circle" style="color:#fff;font-size:1.6rem;opacity:.9"></i></div>
            ${duration ? `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.8);color:#fff;font-size:.65rem;padding:.1rem .35rem;border-radius:4px">${duration}</div>` : ''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:600;color:#e2e8f0;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(v.title)}</div>
            ${v.description ? `<div style="font-size:.75rem;color:#94a3b8;margin-top:.2rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical">${escapeHtml(v.description)}</div>` : ''}
          </div>
          <i class="fas fa-play" style="color:#6366f1;font-size:1rem;flex-shrink:0"></i>
        </div>`;
      } else {
        // غير مشترك → مقفول
        return `<div style="display:flex;align-items:center;gap:.85rem;padding:.75rem;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.07)">
          <div style="position:relative;width:90px;min-width:90px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#0a0512">
            ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;filter:blur(2px)" loading="lazy">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#555"><i class="fas fa-film"></i></div>'}
            <div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center"><i class="fas fa-lock" style="color:#f59e0b;font-size:1rem"></i></div>
            ${duration ? `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.8);color:#fff;font-size:.65rem;padding:.1rem .35rem;border-radius:4px">${duration}</div>` : ''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.88rem;font-weight:600;color:#94a3b8;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(v.title)}</div>
          </div>
          <i class="fas fa-lock" style="color:#f59e0b;font-size:.9rem;flex-shrink:0"></i>
        </div>`;
      }
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'paidCourseDetailModal';
    modal.style.zIndex = '10010';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:580px">
        <div class="modal-header" style="background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(217,119,6,.12));border-bottom:1px solid rgba(245,158,11,.3)">
          <h3 style="color:#fbbf24"><i class="fas fa-graduation-cap"></i> ${escapeHtml(title)}</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          ${desc ? `<p style="color:#cbd5e1;font-size:.92rem;line-height:1.7;margin-bottom:1.25rem;padding:.75rem 1rem;background:rgba(255,255,255,.04);border-radius:10px;border-right:3px solid #f59e0b">${escapeHtml(desc)}</p>` : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
            <span style="font-size:.9rem;color:#94a3b8"><i class="fas fa-photo-film" style="color:#6366f1"></i> ${courseVideos.length} فيديو في الكورس</span>
            <span style="background:linear-gradient(135deg,${price>0?'#f59e0b,#d97706':'#10b981,#059669'});color:#fff;padding:.25rem .85rem;border-radius:20px;font-size:.85rem;font-weight:700">${price > 0 ? price + ' جنيه' : 'مجاني'}</span>
          </div>
          ${isEnrolled ? `<div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:10px;padding:.6rem 1rem;margin-bottom:.75rem;color:#6ee7b7;font-size:.85rem;font-weight:600"><i class="fas fa-check-circle"></i> مشترك — اضغط على أي فيديو لتشغيله</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:.6rem;max-height:340px;overflow-y:auto;padding-left:.25rem;scrollbar-width:thin;scrollbar-color:rgba(99,102,241,.4) transparent;margin-bottom:1.25rem">
            ${videosHtml || '<p style="color:#666;text-align:center;padding:1rem">لا توجد فيديوهات</p>'}
          </div>
          ${!isEnrolled
            ? `<button onclick="this.closest('.modal').remove(); enrollInCourseAndOpen('${courseId}')" style="width:100%;padding:1rem;background:${price > 0 ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)'};color:#fff;border:none;border-radius:14px;font-family:Cairo;font-size:1.05rem;font-weight:700;cursor:pointer;box-shadow:0 6px 20px ${price>0?'rgba(245,158,11,.4)':'rgba(16,185,129,.4)'};display:flex;align-items:center;justify-content:center;gap:.6rem"><i class="fas ${price > 0 ? 'fa-shopping-cart' : 'fa-unlock'}"></i> ${price > 0 ? 'اشترك الآن · ' + price + ' جنيه' : 'ادخل مجاناً'}</button>`
            : (c.certificateUrl ? `<button class="cert-btn" onclick="checkAndShowCertificate('${courseId}',this)" style="width:100%;margin-top:.5rem"><i class="fas fa-certificate"></i> 🏆 استلام شهادتك</button>` : '')
          }
        </div>
      </div>`;
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) {
    console.error('openPaidCourseModal error:', e);
    showCoursesList();
  }
};


// ===== إدارة امتحانات الكورس =====
async function showCourseExamsManager(courseId, courseTitle) {
  if (!isAdmin) { showToast('❌ هذه الصلاحية للمشرف فقط'); return; }

  // جلب بيانات الكورس من Firestore
  let videoIds = [];
  try {
    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (courseDoc.exists) videoIds = courseDoc.data().videoIds || [];
  } catch(e) { console.warn(e); }
  if (videoIds.length === 0) { showToast('⚠️ لا توجد فيديوهات في هذا الكورس'); return; }

  let courseExams = {};
  try {
    for (let i = 0; i < videoIds.length; i += 10) {
      const chunk = videoIds.slice(i, i + 10);
      const s = await db.collection('exams').where('videoId', 'in', chunk).get();
      s.forEach(d => { courseExams[d.data().videoId] = { id: d.id, ...d.data() }; });
    }
  } catch(e) { console.warn(e); }

  let rowsHtml = videoIds.map(vid => {
    const v = videos.find(x => x.id === vid);
    const vTitle = v ? escapeHtml(v.title) : '(فيديو محذوف)';
    const hasExam = !!courseExams[vid];
    const examQCount = hasExam ? (courseExams[vid].questions || []).length : 0;
    const examId = hasExam ? courseExams[vid].id : '';
    const safeCourseTitleJs = courseTitle.replace(/'/g, "\\'");
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;padding:.85rem 1rem;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:.6rem">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:#e0e7ff;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          <i class="fas fa-play-circle" style="color:#6366f1;margin-left:.4rem"></i>${vTitle}
        </div>
        ${hasExam
          ? `<div style="color:#10b981;font-size:.78rem;margin-top:.25rem"><i class="fas fa-check-circle"></i> يوجد امتحان — ${examQCount} سؤال</div>`
          : `<div style="color:#94a3b8;font-size:.78rem;margin-top:.25rem"><i class="fas fa-times-circle" style="color:#ef4444"></i> لا يوجد امتحان</div>`
        }
      </div>
      <div style="display:flex;gap:.5rem;flex-shrink:0">
        ${hasExam
          ? `<button onclick="openAddExamModal('${vid}')"
               style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:10px;padding:.4rem .85rem;font-family:Cairo;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.35rem">
               <i class="fas fa-edit"></i> تعديل</button>
             <button onclick="deleteCourseVideoExam('${examId}','${vid}','${courseId}','${safeCourseTitleJs}')"
               style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:10px;padding:.4rem .75rem;font-family:Cairo;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.35rem">
               <i class="fas fa-trash"></i></button>`
          : `<button onclick="openAddExamModal('${vid}')"
               style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;padding:.4rem .85rem;font-family:Cairo;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.35rem">
               <i class="fas fa-plus-circle"></i> إضافة امتحان</button>`
        }
      </div>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'courseExamsManagerModal';
  modal.className = 'modal active';
  modal.style.cssText = 'z-index:10060;align-items:center;justify-content:center;background:rgba(0,0,0,.8);padding:1rem';
  modal.dataset.courseId = courseId;
  modal.dataset.courseTitle = courseTitle;
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a1025,#0f0a1a);border:1px solid rgba(99,102,241,.4);border-radius:20px;width:95%;max-width:600px;max-height:88dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.6)">
      <div style="padding:1.1rem 1.25rem;background:linear-gradient(135deg,rgba(99,102,241,.2),rgba(139,92,246,.15));border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-shrink:0">
        <h3 style="margin:0;font-size:1.05rem;color:#e0e7ff;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <i class="fas fa-clipboard-list" style="color:#6366f1"></i>
          امتحانات كورس:
          <span style="color:#a5b4fc">${escapeHtml(courseTitle)}</span>
        </h3>
        <button onclick="closeCourseExamsManager()" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#f87171;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div style="padding:1rem 1.1rem;overflow-y:auto;flex:1">
        <p style="color:#94a3b8;font-size:.85rem;margin-bottom:1rem;line-height:1.6">
          <i class="fas fa-info-circle" style="color:#6366f1"></i>
          يمكنك إضافة أو تعديل امتحان لكل فيديو في هذا الكورس.
        </p>
        ${rowsHtml}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeCourseExamsManager(); });
}

function closeCourseExamsManager() {
  const m = document.getElementById('courseExamsManagerModal');
  if (m) m.remove();
}

async function deleteCourseVideoExam(examId, videoId, courseId, courseTitle) {
  if (!confirm('هل تريد حذف امتحان هذا الفيديو؟')) return;
  try {
    await db.collection('exams').doc(examId).delete();
    showToast('🗑️ تم حذف الامتحان');
    closeCourseExamsManager();
    showCourseExamsManager(courseId, courseTitle);
  } catch(e) { console.warn(e); showToast('❌ فشل الحذف'); }
}

async function showCoursesList() {
  const coursesSnap = await db.collection("courses").get();
  if (coursesSnap.empty) { showToast("لا توجد كورسات بعد"); return; }

  // جلب اشتراكات المستخدم الحالي
  let userEnrolledCourseIds = new Set();
  if (currentUserId) {
    try {
      const enSnap = await db.collection("course_enrollments").where("userId", "==", currentUserId).get();
      enSnap.forEach(d => { const data = d.data(); if (data.courseId) userEnrolledCourseIds.add(data.courseId); });
    } catch(e) {}
  }

  let payoutNote = "";
  try {
    const ps = await db.collection("system").doc("supervisor_payout").get();
    if (ps.exists && ps.data().payoutNote) payoutNote = String(ps.data().payoutNote);
  } catch (e) { console.warn(e); }
  let listHtml = `<div class="courses-list-inner" style="display: flex; flex-direction: column; gap: 1.25rem; margin-top: 0.25rem;">`;
  if (payoutNote) listHtml += `<div style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.35);border-radius:12px;padding:.75rem 1rem;font-size:.9rem;color:#cbd5e1;line-height:1.6"><i class="fas fa-info-circle" style="color:#6366f1"></i> ${escapeHtml(payoutNote)}</div>`;
  if (isAdmin) listHtml += `<div style="display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap"><button type="button" class="btn btn-danger" onclick="deleteAllPaidCourses()"><i class="fas fa-coins"></i> امسح كل الكورسات المدفوعة</button><button type="button" class="btn btn-danger" onclick="deleteAllCourses()"><i class="fas fa-trash"></i> امسح كل الكورسات</button></div>`;
  for (const doc of coursesSnap.docs) {
    const c = doc.data();
    const paid = (c.price || 0) > 0;
    const nLessons = (c.videoIds && c.videoIds.length) ? c.videoIds.length : 0;
    const safeTitle = escapeHtml(c.title || '').replace(/'/g, "\\'");
    const isEnrolledInThis = userEnrolledCourseIds.has(doc.id);
    const paidBadge = paid ? `<span style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:.15rem .55rem;border-radius:8px;font-size:.7rem;margin-right:.4rem;vertical-align:middle">مدفوع</span>` : '';
    const enrolledBadge = isEnrolledInThis ? `<span style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:.15rem .55rem;border-radius:8px;font-size:.7rem;margin-right:.4rem;vertical-align:middle"><i class="fas fa-check" style="font-size:.6rem"></i> مشترك</span>` : '';
    listHtml += `<div class="course-card-item" style="position:relative; background: rgba(255,255,255,0.06); border-radius: 20px; overflow:hidden; border: 1px solid ${isEnrolledInThis ? 'rgba(16,185,129,.4)' : paid ? 'rgba(245,158,11,.35)' : 'rgba(255,255,255,.08)'};padding:0;">
      ${c.imageUrl ? `<div style="width:100%;height:160px;overflow:hidden;position:relative;"><img src="${escapeHtml(c.imageUrl)}" alt="${escapeHtml(c.title)}" loading="lazy" onerror="this.parentElement.style.display='none'" style="width:100%;height:100%;object-fit:cover;display:block;"></div>` : ''}
      <div style="padding:1.25rem 1.5rem;">
      ${isAdmin ? `<button type="button" aria-label="حذف الكورس" title="حذف الكورس" onclick="deleteCourse('${doc.id}','${safeTitle}')" style="position:absolute;top:.65rem;left:.65rem;width:34px;height:34px;border-radius:50%;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(239,68,68,.4);z-index:2"><i class="fas fa-times"></i></button>` : ''}
      <h4 style="font-size:1.25rem;margin-bottom:.5rem;${isAdmin ? 'padding-left:2.5rem;' : ''}"><i class="fas fa-book-open"></i> ${escapeHtml(c.title)} ${paidBadge}${enrolledBadge}</h4>
      <p style="line-height:1.7;color:#ddd">${escapeHtml(c.description || '')}</p>
      <p style="margin-top:.75rem"><strong>عدد الدروس:</strong> ${nLessons}</p>
      <p><strong>السعر:</strong> ${c.price === 0 ? "مجاني" : c.price + " جنيه"}${paid && c.paymentLink ? ' <span style="color:#10b981;font-size:.85rem">(دفع عبر رابط آمن)</span>' : ''}</p>
      <div style="display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem">
      ${isEnrolledInThis
        ? `<button type="button" onclick="this.closest('.modal').remove(); openPaidCourseModal('${doc.id}')" style="padding:.65rem 1.2rem;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:12px;font-family:Cairo;font-size:.95rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:.5rem;box-shadow:0 4px 14px rgba(16,185,129,.4)"><i class="fas fa-play-circle"></i> مشاهدة الفيديوهات <i class="fas fa-check-circle" style="font-size:.8rem;opacity:.85"></i></button>`
        : `<button type="button" class="btn btn-primary" onclick="enrollInCourseFromList('${doc.id}')"><i class="fas fa-lock-open"></i> اشترك الآن</button>`
      }
      ${isEnrolledInThis && c.certificateUrl ? `<div id="certBtnContainer_${doc.id}" style="width:100%"><button class="cert-btn" onclick="checkAndShowCertificate('${doc.id}',this)"><i class="fas fa-certificate"></i> 🏆 استلام شهادتك</button></div>` : ''}
      ${isAdmin ? `<button type="button" class="btn btn-warning" onclick="editCourse('${doc.id}')"><i class="fas fa-edit"></i> تعديل</button>` : ''}
      ${isAdmin ? `<button type="button" class="btn btn-info" onclick="showCourseExamsManager('${doc.id}','${safeTitle}')"><i class="fas fa-clipboard-list"></i> امتحانات الكورس</button>` : ''}
      ${isAdmin && paid ? `<button type="button" class="btn btn-danger" onclick="deleteCourse('${doc.id}','${safeTitle}')" style="background:linear-gradient(135deg,#ef4444,#b91c1c);font-weight:700"><i class="fas fa-trash"></i> حذف الكورس المدفوع</button>` : ''}
      ${isAdmin && !paid ? `<button type="button" class="btn btn-danger" onclick="deleteCourse('${doc.id}','${safeTitle}')"><i class="fas fa-trash"></i> حذف</button>` : ''}
      </div>
      </div>
    </div>`;
  }
  listHtml += `</div>`;
  const modal = document.createElement("div");
  modal.className = "modal active courses-list-modal";
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3><i class="fas fa-layer-group"></i> قائمة الكورسات</h3><button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body">${listHtml}</div></div>`;
  document.body.appendChild(modal);
}

async function editCourse(courseId) {
  if (!isAdmin) { showToast("❌ غير مصرح"); return; }
  closeCoursesListModal();
  const doc = await db.collection("courses").doc(courseId).get();
  if (!doc.exists) return;
  const data = doc.data();
  document.getElementById("courseModalTitle").innerText = "تعديل الكورس";
  document.getElementById("courseName").value = data.title;
  document.getElementById("courseDesc").value = data.description || "";
  document.getElementById("coursePrice").value = data.price;
  const cplEl = document.getElementById("coursePaymentLink");
  if (cplEl) cplEl.value = data.paymentLink || "";
  const imgEl = document.getElementById("courseImageUrl");
  if (imgEl) { imgEl.value = data.imageUrl || ""; previewCourseImage(data.imageUrl || ""); }
  currentEditingCourseId = courseId;
  const container = document.getElementById("courseVideosChecklist");
  container.innerHTML = "";
  const vidIds = data.videoIds || [];
  videos.forEach(v => {
    const checked = vidIds.includes(v.id) ? "checked" : "";
    container.innerHTML += `<label style="display: block;"><input type="checkbox" value="${v.id}" ${checked}> ${escapeHtml(v.title)}</label>`;
  });
  document.getElementById("courseModal").classList.add("active");
}

async function deleteCourse(courseId, courseTitle) {
  if (!isAdmin) { showToast("❌ غير مصرح"); return; }
  const ok = confirm(`هل تريد حذف الكورس "${courseTitle || ''}" نهائياً؟\n\nسيتم حذف جميع اشتراكات الطلاب في هذا الكورس أيضاً.`);
  if (!ok) return;
  try {
    const enrollSnap = await db.collection("course_enrollments").where("courseId", "==", courseId).get();
    const batch = db.batch();
    enrollSnap.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection("courses").doc(courseId));
    await batch.commit();
    showToast("✅ تم حذف الكورس");
    closeCoursesListModal();
    showCoursesList().catch(()=>{});
  } catch (e) { console.error(e); showToast("❌ فشل حذف الكورس"); }
}

async function deleteAllPaidCourses() {
  if (!isAdmin) { showToast("❌ غير مصرح"); return; }
  const ok = confirm("⚠️ هل تريد حذف جميع الكورسات المدفوعة فقط؟\n\nالكورسات المجانية لن تتأثر.");
  if (!ok) return;
  try {
    const coursesSnap = await db.collection("courses").get();
    const paidDocs = coursesSnap.docs.filter(d => (d.data().price || 0) > 0);
    if (paidDocs.length === 0) { showToast("لا توجد كورسات مدفوعة"); return; }
    const paidIds = paidDocs.map(d => d.id);
    let enrollDocs = [];
    for (let i = 0; i < paidIds.length; i += 10) {
      const chunk = paidIds.slice(i, i + 10);
      const snap = await db.collection("course_enrollments").where("courseId", "in", chunk).get();
      enrollDocs.push(...snap.docs);
    }
    const allDocs = [...paidDocs, ...enrollDocs];
    while (allDocs.length) {
      const batchChunk = allDocs.splice(0, 400);
      const batch = db.batch();
      batchChunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    showToast(`✅ تم حذف ${paidDocs.length} كورس مدفوع`);
    closeCoursesListModal();
    showCoursesList().catch(()=>{});
  } catch (e) { console.error(e); showToast("❌ فشل حذف الكورسات المدفوعة"); }
}

async function deleteAllCourses() {
  if (!isAdmin) { showToast("❌ غير مصرح"); return; }
  const ok1 = confirm("⚠️ هل أنت متأكد أنك تريد حذف جميع الكورسات؟\n\nهذا الإجراء لا يمكن التراجع عنه.");
  if (!ok1) return;
  const confirmText = prompt('للتأكيد اكتب: حذف الكل');
  if (confirmText !== 'حذف الكل') { showToast("تم الإلغاء"); return; }
  try {
    const coursesSnap = await db.collection("courses").get();
    if (coursesSnap.empty) { showToast("لا توجد كورسات"); return; }
    const enrollSnap = await db.collection("course_enrollments").get();
    const allDocs = [...coursesSnap.docs, ...enrollSnap.docs];
    while (allDocs.length) {
      const chunk = allDocs.splice(0, 400);
      const batch = db.batch();
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    showToast("✅ تم حذف جميع الكورسات");
    closeCoursesListModal();
  } catch (e) { console.error(e); showToast("❌ فشل حذف الكورسات"); }
}

async function getGlobalPaymentLink() {
  try {
    const doc = await db.collection("system").doc("supervisor_payout").get();
    if (doc.exists && doc.data().defaultPaymentLink) return String(doc.data().defaultPaymentLink).trim();
  } catch (e) { console.error(e); }
  return "";
}
// ===== اشتراك من داخل موديل الكورس ثم فتح الفيديوهات مباشرة =====
async function enrollInCourseAndOpen(courseId) {
  if (!currentUserId) { showToast("سجل دخولك أولاً"); return; }
  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) return;
  const courseData = courseDoc.data();
  const existing = await db.collection("course_enrollments")
    .where("userId","==",currentUserId).where("courseId","==",courseId).get();
  if (!existing.empty) {
    // مشترك بالفعل → افتح مباشرة
    openPaidCourseModal(courseId);
    return;
  }
  if (courseData.price > 0) {
    let link = (courseData.paymentLink && String(courseData.paymentLink).trim()) || "";
    if (!link) link = await getGlobalPaymentLink();
    if (!link) { showToast("لم يُضبط رابط دفع"); return; }
    try {
      const w = window.open(link, "_blank", "noopener,noreferrer");
      if (!w) showToast("اسمح بالنوافذ المنبثقة لإتمام الدفع");
    } catch(e) { showToast("تعذر فتح صفحة الدفع"); return; }
    const ok = confirm("هل أكملت الدفع في الصفحة الآمنة التي فُتحت؟");
    if (!ok) { showToast("يمكنك الضغط على اشترك مرة أخرى بعد إتمام الدفع"); return; }
    await db.collection("course_enrollments").add({
      userId: currentUserId, courseId,
      enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedVideos: 0, totalVideos: courseData.videoIds.length,
      completedVideosIds: [], paidEnrollment: true
    });
  } else {
    await db.collection("course_enrollments").add({
      userId: currentUserId, courseId,
      enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedVideos: 0, totalVideos: courseData.videoIds.length,
      completedVideosIds: []
    });
  }
  showToast("✅ تم الاشتراك بنجاح");
  // افتح الكورس مباشرة بعد الاشتراك مع الفيديوهات
  openPaidCourseModal(courseId);
}

async function enrollInCourseFromList(courseId) {
  // نفس enrollInCourse بس بعد النجاح يفتح الفيديوهات مباشرة
  if (!currentUserId) { showToast("سجل دخولك أولاً"); return; }
  const courseDoc = await db.collection("courses").doc(courseId).get();
  const courseData = courseDoc.data();
  const existing = await db.collection("course_enrollments").where("userId", "==", currentUserId).where("courseId", "==", courseId).get();
  if (!existing.empty) {
    // مشترك بالفعل → افتح الفيديوهات مباشرة
    document.querySelectorAll('.courses-list-modal').forEach(m => m.remove());
    openPaidCourseModal(courseId);
    return;
  }
  if (courseData.price > 0) {
    let link = (courseData.paymentLink && String(courseData.paymentLink).trim()) || "";
    if (!link) link = await getGlobalPaymentLink();
    if (!link) { showToast("لم يُضبط رابط دفع. المشرف يضيفه من الإعدادات أو من بيانات الكورس"); return; }
    try {
      const w = window.open(link, "_blank", "noopener,noreferrer");
      if (!w) showToast("اسمح بالنوافذ المنبثقة لإتمام الدفع");
    } catch (e) { console.error(e); showToast("تعذر فتح صفحة الدفع"); return; }
    const ok = confirm("هل أكملت الدفع في الصفحة الآمنة التي فُتحت؟\n\nسيتم تفعيل اشتراكك في المنصة. يُفضّل أن يتحقق المشرف من استلام المبلغ عند مزوّد الدفع.");
    if (!ok) { showToast("يمكنك الضغط على اشتراك مرة أخرى بعد إتمام الدفع"); return; }
    await db.collection("course_enrollments").add({
      userId: currentUserId,
      courseId: courseId,
      enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedVideos: 0,
      totalVideos: courseData.videoIds.length,
      completedVideosIds: [],
      paidEnrollment: true
    });
    showToast("✅ تم تفعيل اشتراكك");
    // افتح الفيديوهات مباشرة
    document.querySelectorAll('.courses-list-modal').forEach(m => m.remove());
    openPaidCourseModal(courseId);
    return;
  }
  await db.collection("course_enrollments").add({
    userId: currentUserId,
    courseId: courseId,
    enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
    completedVideos: 0,
    totalVideos: courseData.videoIds.length,
    completedVideosIds: []
  });
  showToast("✅ تم التسجيل في الكورس بنجاح");
  // افتح الفيديوهات مباشرة
  document.querySelectorAll('.courses-list-modal').forEach(m => m.remove());
  openPaidCourseModal(courseId);
}

async function enrollInCourse(courseId) {
  if (!currentUserId) { showToast("سجل دخولك أولاً"); return; }
  const courseDoc = await db.collection("courses").doc(courseId).get();
  const courseData = courseDoc.data();
  const existing = await db.collection("course_enrollments").where("userId", "==", currentUserId).where("courseId", "==", courseId).get();
  if (!existing.empty) { return; } // مشترك بالفعل — بدون رسالة
  if (courseData.price > 0) {
    let link = (courseData.paymentLink && String(courseData.paymentLink).trim()) || "";
    if (!link) link = await getGlobalPaymentLink();
    if (!link) { showToast("لم يُضبط رابط دفع. المشرف يضيفه من الإعدادات أو من بيانات الكورس"); return; }
    try {
      const w = window.open(link, "_blank", "noopener,noreferrer");
      if (!w) showToast("اسمح بالنوافذ المنبثقة لإتمام الدفع");
    } catch (e) { console.error(e); showToast("تعذر فتح صفحة الدفع"); return; }
    const ok = confirm("هل أكملت الدفع في الصفحة الآمنة التي فُتحت؟\n\nسيتم تفعيل اشتراكك في المنصة. يُفضّل أن يتحقق المشرف من استلام المبلغ عند مزوّد الدفع.");
    if (!ok) { showToast("يمكنك الضغط على اشتراك مرة أخرى بعد إتمام الدفع"); return; }
    await db.collection("course_enrollments").add({
      userId: currentUserId,
      courseId: courseId,
      enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedVideos: 0,
      totalVideos: courseData.videoIds.length,
      completedVideosIds: [],
      paidEnrollment: true
    });
    showToast("✅ تم تفعيل اشتراكك بعد الدفع");
    return;
  }
  await db.collection("course_enrollments").add({
    userId: currentUserId,
    courseId: courseId,
    enrolledAt: firebase.firestore.FieldValue.serverTimestamp(),
    completedVideos: 0,
    totalVideos: courseData.videoIds.length,
    completedVideosIds: []
  });
  showToast("✅ تم التسجيل في الكورس بنجاح");
}


/* ========================================== */


    let studentProgressTab = 'videos';
let studentProgressView = 'me';
let __allStudentsCache = null;
let __studentDetailFor = null;
let progressRefreshInterval = null;

async function openStudentProgress() {
  document.getElementById('studentProgressModal').classList.add('active');
  if (typeof SoundEffects !== 'undefined' && SoundEffects.click) { try { SoundEffects.click(); } catch(_){} }

  studentProgressView = (typeof isAdmin !== 'undefined' && isAdmin) ? 'all' : 'me';
  __studentDetailFor = null;
  studentProgressTab = 'videos';

  if (!currentUserId && !(currentUser && currentUserPhone)) {
    document.getElementById('studentProgressBody').innerHTML = `
      <div class="progress-login-warn">
        <i class="fas fa-user-lock"></i>
        <h4 style="margin:0 0 .5rem;font-size:1.1rem;">سجّل الدخول لعرض التقدم</h4>
        <p style="margin:0;color:#cfc9dd;font-size:.9rem;line-height:1.7">عشان تقدر تتابع رحلتك ومستوى تقدمك في الفيديوهات والامتحانات، لازم تسجّل دخولك أولاً.</p>
      </div>`;
    return;
  }

  if (progressRefreshInterval) clearInterval(progressRefreshInterval);
  progressRefreshInterval = setInterval(() => {
    const modal = document.getElementById('studentProgressModal');
    if (!modal || !modal.classList.contains('active')) {
      if (progressRefreshInterval) clearInterval(progressRefreshInterval);
      return;
    }
    if (studentProgressView === 'all') {
      loadAllStudentsData().then(renderAllStudents).catch(e => console.error(e));
    } else {
      loadStudentProgressData({ name: currentUser, phone: currentUserPhone, userId: currentUserId })
        .then(renderStudentProgress).catch(e => console.error(e));
    }
  }, 30000);

  document.getElementById('studentProgressBody').innerHTML =
    `<div class="progress-empty"><i class="fas fa-spinner fa-spin"></i><h4>جاري تحميل البيانات...</h4></div>`;

  try {
    if (studentProgressView === 'all') {
      const data = await loadAllStudentsData();
      renderAllStudents(data);
    } else {
      const data = await loadStudentProgressData({ name: currentUser, phone: currentUserPhone, userId: currentUserId });
      renderStudentProgress(data);
    }
  } catch (e) {
    console.error('Error loading progress:', e);
    document.getElementById('studentProgressBody').innerHTML =
      `<div class="progress-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i><h4>تعذر تحميل البيانات</h4><p>حاول مرة أخرى بعد قليل.</p></div>`;
  }
}

function closeStudentProgress() {
  document.getElementById('studentProgressModal').classList.remove('active');
  __studentDetailFor = null;
  if (progressRefreshInterval) {
    clearInterval(progressRefreshInterval);
    progressRefreshInterval = null;
  }
}

function setProgressView(v) {
  studentProgressView = v;
  __studentDetailFor = null;
  studentProgressTab = 'videos';
  document.getElementById('studentProgressBody').innerHTML =
    `<div class="progress-empty"><i class="fas fa-spinner fa-spin"></i><h4>جاري تحميل البيانات...</h4></div>`;
  if (v === 'all') {
    loadAllStudentsData().then(renderAllStudents).catch(e => { console.error(e); });
  } else {
    loadStudentProgressData({ name: currentUser, phone: currentUserPhone, userId: currentUserId })
      .then(renderStudentProgress).catch(e => console.error(e));
  }
}

async function loadStudentProgressData(student) {
  const watched = [];
  const watchedIds = new Set();

  // إذا كان لدينا userId، نستعمل الاستعلام المباشر
  if (student.userId) {
    try {
      const snap = await db.collection("watch_history").where("userId", "==", student.userId).get();
      snap.forEach(d => {
        const x = d.data();
        if (!watchedIds.has(x.videoId)) {
          watchedIds.add(x.videoId);
          watched.push({ videoId: x.videoId, watchedAt: x.watchedAt?.toDate?.() || new Date() });
        }
      });
    } catch (e) { console.warn('watch_history read failed', e); }
  }

  let myExamResults = [];
  if (student.userId) {
    try {
      const snap = await db.collection("exam_results").where("userId", "==", student.userId).get();
      myExamResults = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          submittedDate: data.submittedAt?.toDate?.() || new Date(),
        };
      });
    } catch (e) { console.warn('exam_results read failed', e); }
  } else {
    // فقط للتوافق مع الإصدارات القديمة (إذا لم يكن هناك userId)
    try {
      const norm = s => String(s || '').replace(/[^\d+]/g, '');
      const studentPhone = norm(student.phone);
      myExamResults = (examResults || []).filter(r => {
        const sameName = (r.studentName || '').trim() === (student.name || '').trim();
        const samePhone = norm(r.studentPhone) === studentPhone && studentPhone.length > 0;
        return sameName || samePhone;
      }).map(r => ({ ...r, submittedDate: r.submittedAt?.toDate?.() || new Date() }));
    } catch (e) { console.warn('exam results filter failed', e); }
  }

  let points = 0;
  if (student.userId) {
    try {
      const userDoc = await db.collection("user_progress").doc(student.userId).get();
      if (userDoc.exists) points = userDoc.data().points || 0;
    } catch (e) { /* silent */ }
  }

  const totalVideos = (videos || []).filter(v => !v.private).length;
  const watchedCount = watched.length;
  const examCount = myExamResults.length;
  const avgScore = examCount ? Math.round(myExamResults.reduce((s, r) => s + (r.percentage || 0), 0) / examCount) : 0;
  const overallPct = totalVideos ? Math.min(100, Math.round((watchedCount / totalVideos) * 100)) : 0;

  return { student, watched, myExamResults, points, totalVideos, watchedCount, examCount, avgScore, overallPct };
}
async function loadAllStudentsData() {
  const studentsMap = new Map();
  try {
    const wh = await db.collection('watch_history').get();
    wh.forEach(d => {
      const x = d.data() || {};
      const uid = x.userId;
      if (!uid) return;
      let entry = studentsMap.get(uid);
      if (!entry) {
        entry = {
          userId: uid,
          name: '',
          phone: '',
          watchedIds: new Set(),
          examResults: [],
          points: 0,
          lastActivity: null,
        };
        studentsMap.set(uid, entry);
      }
      if (x.videoId) entry.watchedIds.add(x.videoId);
      const wDate = x.watchedAt && x.watchedAt.toDate ? x.watchedAt.toDate() : null;
      if (wDate && (!entry.lastActivity || wDate > entry.lastActivity)) entry.lastActivity = wDate;
    });
  } catch (e) { console.warn('watch_history read failed', e); }

  const uids = Array.from(studentsMap.keys());
  await Promise.all(uids.map(async (uid) => {
    try {
      const doc = await db.collection('user_progress').doc(uid).get();
      if (!doc.exists) {
        studentsMap.delete(uid);
        return;
      }
      const u = doc.data() || {};
      const name = (u.username || u.name || u.displayName || '').trim();
      const phone = (u.phone || '').trim();
      if (!name && !phone) {
        studentsMap.delete(uid);
        return;
      }
      const entry = studentsMap.get(uid);
      entry.name = name || 'بدون اسم';
      entry.phone = phone;
      entry.points = u.points || 0;
      const lu = u.lastUpdated && u.lastUpdated.toDate ? u.lastUpdated.toDate() : null;
      if (lu && (!entry.lastActivity || lu > entry.lastActivity)) entry.lastActivity = lu;
    } catch (e) {
      console.warn('user_progress doc read failed', uid, e);
    }
  }));

  const norm = s => String(s || '').replace(/[^\d+]/g, '');
  (examResults || []).forEach(r => {
    const phoneN = norm(r.studentPhone);
    const nameN = (r.studentName || '').trim();
    let entry = null;
    if (r.userId && studentsMap.has(r.userId)) {
      entry = studentsMap.get(r.userId);
    }
    if (!entry && phoneN.length >= 6) {
      for (const v of studentsMap.values()) {
        if (v.phone && norm(v.phone) === phoneN) { entry = v; break; }
      }
    }
    if (!entry && nameN.length >= 3) {
      for (const v of studentsMap.values()) {
        if (v.name && v.name.trim() === nameN) { entry = v; break; }
      }
    }
    if (!entry) return;
    const sDate = r.submittedAt && r.submittedAt.toDate ? r.submittedAt.toDate() : null;
    entry.examResults.push({ ...r, submittedDate: sDate || new Date() });
    if (sDate && (!entry.lastActivity || sDate > entry.lastActivity)) entry.lastActivity = sDate;
  });

  const totalVideos = (videos || []).filter(v => !v.private).length;
  const list = Array.from(studentsMap.values()).map(s => {
    const watchedCount = s.watchedIds.size;
    const examCount = s.examResults.length;
    const avgScore = examCount ? Math.round(s.examResults.reduce((a, r) => a + (r.percentage || 0), 0) / examCount) : 0;
    const overallPct = totalVideos ? Math.min(100, Math.round((watchedCount / totalVideos) * 100)) : 0;
    return { ...s, watchedCount, examCount, avgScore, overallPct };
  }).filter(s => s.watchedCount > 0);

  list.sort((a, b) => (b.overallPct - a.overallPct) || (b.avgScore - a.avgScore));
  __allStudentsCache = { list, totalVideos };
  return __allStudentsCache;
}

function getStudentLevel(pct, points) {
  if (pct >= 80 || points >= 200) return { name: 'مستكشف خبير', icon: 'fa-rocket' };
  if (pct >= 50 || points >= 100) return { name: 'مستكشف نشط', icon: 'fa-meteor' };
  if (pct >= 20 || points >= 30) return { name: 'مستكشف صاعد', icon: 'fa-star' };
  return { name: 'مستكشف مبتدئ', icon: 'fa-seedling' };
}

function adminToggleHtml() {
  if (typeof isAdmin === 'undefined' || !isAdmin) return '';
  return `
    <div class="progress-admin-toggle">
      <button class="progress-tab ${studentProgressView==='all'?'active':''}" onclick="setProgressView('all')"><i class="fas fa-users"></i> كل الطلاب</button>
      <button class="progress-tab ${studentProgressView==='me'?'active':''}" onclick="setProgressView('me')"><i class="fas fa-user"></i> تقدمي</button>
    </div>`;
}

function renderStudentProgress(data) {
  const { student, watched, myExamResults, points, totalVideos, watchedCount, examCount, avgScore, overallPct } = data;
  const level = getStudentLevel(overallPct, points);
  const displayName = student.name || currentUser || 'الطالب';
  const initial = (displayName || '?').trim().charAt(0).toUpperCase();
  document.getElementById('studentProgressTitle').innerHTML =
    `<i class="fas fa-trophy" style="color:#fde047"></i> ${__studentDetailFor ? 'تقدم: ' + escapeHtml(displayName) : 'تقدم الطالب'}`;

  const backBtn = __studentDetailFor
    ? `<button class="progress-back-btn" onclick="setProgressView('all')"><i class="fas fa-arrow-right"></i> رجوع لكل الطلاب</button>`
    : '';

  const isOtherStudent = !!__studentDetailFor && student.userId !== currentUserId;
  const friendBtnHtml = isOtherStudent ? `<button class="btn btn-friend-add" id="hero-friend-btn" onclick="sendFriendRequest(decodeURIComponent('${encodeURIComponent(student.userId || '')}'),decodeURIComponent('${encodeURIComponent(displayName)}'), this)" style="margin-top:.75rem;display:inline-flex;align-items:center;gap:.5rem;"><i class="fas fa-user-plus"></i> إضافة صديق</button>` : '';

  const hero = `
    <div class="progress-hero">
      <div class="progress-hero-row">
        <div class="progress-avatar">${escapeHtml(initial)}</div>
        <div class="progress-hero-info">
          <h3>${escapeHtml(displayName)}</h3>
          <p>${student.phone ? escapeHtml(student.phone) : 'رحلتك في عالم الفلك والفضاء'}</p>
          <span class="progress-level-badge"><i class="fas ${level.icon}"></i> ${level.name}</span>
          ${friendBtnHtml}
        </div>
      </div>
    </div>`;

  const stats = `
    <div class="progress-stats-grid">
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#6366f1;--c2:#8b5cf6"><i class="fas fa-play-circle"></i></div>
        <div class="progress-stat-num">${watchedCount}</div>
        <div class="progress-stat-label">فيديو مكتمل</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#10b981;--c2:#06b6d4"><i class="fas fa-clipboard-check"></i></div>
        <div class="progress-stat-num">${examCount}</div>
        <div class="progress-stat-label">امتحان</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#fbbf24;--c2:#f59e0b"><i class="fas fa-percentage"></i></div>
        <div class="progress-stat-num">${avgScore}%</div>
        <div class="progress-stat-label">متوسط الدرجات</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#ec4899;--c2:#a855f7"><i class="fas fa-gem"></i></div>
        <div class="progress-stat-num">${points}</div>
        <div class="progress-stat-label">نقطة</div>
      </div>
    </div>`;

  const overall = `
    <div class="progress-overall">
      <div class="progress-overall-label">
        <span class="progress-overall-label-text"><i class="fas fa-chart-line"></i> نسبة إكمال المكتبة</span>
        <span class="progress-overall-pct">${overallPct}%</span>
      </div>
      <div class="progress-overall-bar"><div class="progress-overall-fill" style="width:${overallPct}%"></div></div>
      <div style="margin-top:.55rem;font-size:.8rem;color:#9690a8">${watchedCount} من أصل ${totalVideos} فيديو</div>
    </div>`;

  const tabs = `
    <div class="progress-tabs">
      <button class="progress-tab ${studentProgressTab === 'videos' ? 'active' : ''}" onclick="switchProgressTab('videos')"><i class="fas fa-video"></i> الفيديوهات</button>
      <button class="progress-tab ${studentProgressTab === 'exams' ? 'active' : ''}" onclick="switchProgressTab('exams')"><i class="fas fa-clipboard-list"></i> الامتحانات</button>
    </div>`;

  let listHtml = '';
  if (studentProgressTab === 'videos') {
    if (!watched.length) {
      listHtml = `<div class="progress-empty"><i class="fas fa-video"></i><h4>لم يشاهد أي فيديو بعد</h4><p>بعد بدء المشاهدة، الفيديوهات هتظهر هنا.</p></div>`;
    } else {
      watched.sort((a, b) => b.watchedAt - a.watchedAt);
      listHtml = `<div class="progress-list">` + watched.map(w => {
        const v = (videos || []).find(x => x.id === w.videoId);
        if (!v) return '';
        const thumb = v.thumbnail ? `<img src="${escapeHtml(v.thumbnail)}" alt="">` : `<i class="fas ${v.type === 'youtube' ? 'fa-youtube' : 'fa-film'}"></i>`;
        const date = w.watchedAt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        const isMe = !__studentDetailFor;
        return `
          <div class="progress-item" ${isMe ? `onclick="closeStudentProgress(); setTimeout(()=>playVideo('${v.id}'),250);" style="cursor:pointer"` : ''}>
            <div class="progress-item-thumb">${thumb}</div>
            <div class="progress-item-body">
              <h4 class="progress-item-title">${escapeHtml(v.title || 'فيديو')}</h4>
              <div class="progress-item-meta"><span><i class="fas fa-calendar"></i>${date}</span><span><i class="fas fa-check-circle" style="color:#10b981"></i>تم الإكمال</span></div>
            </div>
            <span class="progress-item-badge done"><i class="fas fa-check"></i></span>
          </div>`;
      }).join('') + `</div>`;
    }
  } else {
    if (!myExamResults.length) {
      listHtml = `<div class="progress-empty"><i class="fas fa-clipboard-list"></i><h4>لا توجد امتحانات بعد</h4><p>بعد إكمال أول امتحان، النتائج هتظهر هنا.</p></div>`;
    } else {
      myExamResults.sort((a, b) => b.submittedDate - a.submittedDate);
      listHtml = `<div class="progress-list">` + myExamResults.map(r => {
        const v = (videos || []).find(x => x.id === r.videoId);
        const title = v ? v.title : 'امتحان';
        const pct = r.percentage || 0;
        const cls = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
        const date = r.submittedDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        return `
          <div class="progress-item">
            <div class="progress-item-thumb" style="background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(99,102,241,.15));color:#10b981"><i class="fas fa-clipboard-check"></i></div>
            <div class="progress-item-body">
              <h4 class="progress-item-title">${escapeHtml(title)}</h4>
              <div class="progress-item-meta"><span><i class="fas fa-calendar"></i>${date}</span><span><i class="fas fa-check"></i>${r.score || 0}/${r.totalQuestions || 0}</span></div>
            </div>
            <span class="progress-item-badge ${cls}">${pct}%</span>
          </div>`;
      }).join('') + `</div>`;
    }
  }

  document.getElementById('studentProgressBody').innerHTML =
    adminToggleHtml() + backBtn + hero + stats + overall + tabs + listHtml;
}

function renderAllStudents(data) {
  const { list, totalVideos } = data;
  document.getElementById('studentProgressTitle').innerHTML =
    `<i class="fas fa-users" style="color:#fde047"></i> تقدم كل الطلاب`;

  const totalStudents = list.length;
  const activeStudents = list.filter(s => s.watchedCount > 0).length;
  const totalWatchEvents = list.reduce((a, s) => a + s.watchedCount, 0);
  const totalExams = list.reduce((a, s) => a + s.examCount, 0);

  const summary = `
    <div class="progress-stats-grid">
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#6366f1;--c2:#8b5cf6"><i class="fas fa-users"></i></div>
        <div class="progress-stat-num">${totalStudents}</div>
        <div class="progress-stat-label">إجمالي الطلاب</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#10b981;--c2:#06b6d4"><i class="fas fa-user-check"></i></div>
        <div class="progress-stat-num">${activeStudents}</div>
        <div class="progress-stat-label">طلاب نشطون</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#fbbf24;--c2:#f59e0b"><i class="fas fa-play-circle"></i></div>
        <div class="progress-stat-num">${totalWatchEvents}</div>
        <div class="progress-stat-label">فيديوهات تمت مشاهدتها</div>
      </div>
      <div class="progress-stat-card">
        <div class="progress-stat-icon" style="--c1:#ec4899;--c2:#a855f7"><i class="fas fa-clipboard-check"></i></div>
        <div class="progress-stat-num">${totalExams}</div>
        <div class="progress-stat-label">إجمالي الامتحانات</div>
      </div>
    </div>`;

  const search = `
    <div class="progress-search-row">
      <div class="progress-search-input"><i class="fas fa-search"></i><input type="text" id="progressSearchInput" placeholder="ابحث باسم الطالب أو رقم الهاتف..." oninput="filterStudentsList()"></div>
    </div>`;

  let listHtml = '';
  if (!list.length) {
    listHtml = `<div class="progress-empty"><i class="fas fa-users-slash"></i><h4>لا يوجد نشاط بعد</h4><p>الطلاب لم يبدأوا المشاهدة أو الامتحانات بعد.</p></div>`;
  } else {
    listHtml = `<div class="progress-list" id="allStudentsList">` + list.map((s, idx) => {
      const lvl = getStudentLevel(s.overallPct, s.points);
      const initial = (s.name || '?').trim().charAt(0).toUpperCase();
      const lastDate = s.lastActivity ? s.lastActivity.toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' }) : '—';
      const cls = s.overallPct >= 75 ? 'high' : s.overallPct >= 40 ? 'mid' : 'low';
      const rankIcon = idx === 0 ? '<i class="fas fa-crown" style="color:#fde047"></i>' : idx === 1 ? '<i class="fas fa-medal" style="color:#cbd5e1"></i>' : idx === 2 ? '<i class="fas fa-medal" style="color:#fb923c"></i>' : `<span style="color:#9690a8;font-size:.85rem">#${idx+1}</span>`;
      return `
        <div class="progress-student-row" data-uid="${escapeHtml(s.userId || '')}" data-search="${escapeHtml((s.name + ' ' + s.phone).toLowerCase())}">
          <div class="progress-rank" onclick="openStudentDetail('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}','${encodeURIComponent(s.phone || '')}')">${rankIcon}</div>
          <div class="progress-avatar small" onclick="openStudentDetail('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}','${encodeURIComponent(s.phone || '')}')">${escapeHtml(initial)}</div>
          <div class="progress-student-info" onclick="openStudentDetail('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}','${encodeURIComponent(s.phone || '')}')">
            <h4>${escapeHtml(s.name)}</h4>
            <div class="progress-student-meta">
              <span><i class="fas fa-phone"></i> ${escapeHtml(s.phone || '—')}</span>
              <span><i class="fas ${lvl.icon}"></i> ${lvl.name}</span>
              <span><i class="fas fa-clock"></i> آخر نشاط: ${lastDate}</span>
            </div>
            <div class="progress-mini-bar"><div class="progress-mini-fill" style="width:${s.overallPct}%"></div></div>
          </div>
          <div class="progress-student-stats" onclick="openStudentDetail('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}','${encodeURIComponent(s.phone || '')}')">
            <div class="psm"><b>${s.watchedCount}</b><span>فيديو</span></div>
            <div class="psm"><b>${s.examCount}</b><span>امتحان</span></div>
            <div class="psm"><b>${s.avgScore}%</b><span>متوسط</span></div>
            <span class="progress-item-badge ${cls}">${s.overallPct}%</span>
          </div>
          <button class="student-add-friend-btn" id="friend-btn-${escapeHtml(s.userId || '')}" title="إضافة صديق" onclick="event.stopPropagation(); sendFriendRequest('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}', this)">
            <i class="fas fa-user-plus"></i>
          </button>
          <button class="student-delete-btn" title="حذف بيانات الطالب" onclick="event.stopPropagation(); deleteStudentRecord('${encodeURIComponent(s.userId || '')}','${encodeURIComponent(s.name || '')}','${encodeURIComponent(s.phone || '')}')">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>`;
    }).join('') + `</div>`;
  }

  document.getElementById('studentProgressBody').innerHTML =
    adminToggleHtml() + summary + search + listHtml;
}

function filterStudentsList() {
  const q = (document.getElementById('progressSearchInput').value || '').trim().toLowerCase();
  document.querySelectorAll('#allStudentsList .progress-student-row').forEach(row => {
    const txt = row.getAttribute('data-search') || '';
    row.style.display = !q || txt.includes(q) ? '' : 'none';
  });
}

async function openStudentDetail(uid, name, phone) {
  uid = decodeURIComponent(uid || '');
  name = decodeURIComponent(name || '');
  phone = decodeURIComponent(phone || '');
  __studentDetailFor = { userId: uid, name, phone };
  studentProgressTab = 'videos';
  document.getElementById('studentProgressBody').innerHTML =
    `<div class="progress-empty"><i class="fas fa-spinner fa-spin"></i><h4>جاري تحميل بيانات الطالب...</h4></div>`;
  try {
    const data = await loadStudentProgressData({ userId: uid, name, phone });
    renderStudentProgress(data);
  } catch (e) {
    console.error(e);
    document.getElementById('studentProgressBody').innerHTML =
      `<div class="progress-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i><h4>تعذر تحميل البيانات</h4></div>`;
  }
}

async function deleteStudentRecord(uidEnc, nameEnc, phoneEnc) {
  const uid = decodeURIComponent(uidEnc || '');
  const name = decodeURIComponent(nameEnc || '');
  const phone = decodeURIComponent(phoneEnc || '');
  if (!uid && !name && !phone) { showToast('⚠️ بيانات الطالب غير متاحة'); return; }
  const ok = confirm('هل تريد حذف بيانات الطالب "' + (name || 'بدون اسم') + '" نهائياً؟\n\nسيتم مسح:\n• ملف الطالب\n• كل سجل المشاهدة\n• كل نتائج الامتحانات\n\nلا يمكن التراجع عن هذا الإجراء.');
  if (!ok) return;
  const row = document.querySelector('#allStudentsList .progress-student-row[data-uid="' + uid + '"]');
  if (row) row.style.opacity = '0.4';
  try {
    const tasks = [];
    if (uid) tasks.push(db.collection('user_progress').doc(uid).delete().catch(e => console.warn('user_progress delete', e)));
    if (uid) {
      tasks.push((async () => {
        const snap = await db.collection('watch_history').where('userId', '==', uid).get();
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        if (!snap.empty) await batch.commit();
      })().catch(e => console.warn('watch_history delete', e)));
    }
    const norm = s => String(s || '').replace(/[^\d+]/g, '');
    const phoneN = norm(phone);
    const nameT = (name || '').trim();
    tasks.push((async () => {
      const toDelete = new Set();
      if (uid) {
        const s1 = await db.collection('exam_results').where('userId', '==', uid).get();
        s1.forEach(d => toDelete.add(d.id));
      }
      (examResults || []).forEach(r => {
        const matchPhone = phoneN.length >= 6 && norm(r.studentPhone) === phoneN;
        const matchName = nameT.length >= 3 && (r.studentName || '').trim() === nameT;
        if (matchPhone || matchName) toDelete.add(r.id);
      });
      const ids = Array.from(toDelete).filter(Boolean);
      for (let i = 0; i < ids.length; i += 400) {
        const batch = db.batch();
        ids.slice(i, i + 400).forEach(id => batch.delete(db.collection('exam_results').doc(id)));
        await batch.commit();
      }
    })().catch(e => console.warn('exam_results delete', e)));
    await Promise.all(tasks);
    if (__allStudentsCache && Array.isArray(__allStudentsCache.list)) {
      __allStudentsCache.list = __allStudentsCache.list.filter(s => s.userId !== uid);
    }
    showToast('✅ تم حذف بيانات الطالب');
    const data = await loadAllStudentsData();
    renderAllStudents(data);
  } catch (e) {
    console.error(e);
    if (row) row.style.opacity = '';
    showToast('⚠️ حصل خطأ أثناء الحذف');
  }
}

function switchProgressTab(tab) {
  studentProgressTab = tab;
  if (__studentDetailFor) {
    loadStudentProgressData(__studentDetailFor).then(renderStudentProgress).catch(e => console.error(e));
  } else if (currentUserId || (currentUser && currentUserPhone)) {
    loadStudentProgressData({ name: currentUser, phone: currentUserPhone, userId: currentUserId })
      .then(renderStudentProgress).catch(e => console.error(e));
  }
}
        
  

/* ========================================== */


(function(){
  const COSMOS_DATA = {
    stars: { title:'النجوم', icon:'fa-star', color:'#fbbf24', intro:'النجوم كرات هائلة من البلازما تتوهج بفعل الاندماج النووي في نواتها. يقدّر العلماء عدد النجوم في الكون المرئي بأكثر من 200 سكستيليون نجم — رقم يفوق حبات الرمل على كل شواطئ الأرض.', items:[
      {img:'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=900&q=70', tag:'نجمنا الأم', title:'الشمس', text:'نجم قزم أصفر عمره ≈ 4.6 مليار سنة، تبلغ حرارة سطحه 5,500°م ونواته 15 مليون درجة. تنتج طاقتها بدمج 600 مليون طن هيدروجين كل ثانية، وتمدّ كل أشكال الحياة على الأرض بالطاقة.'},
      {img:'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=900&q=70', tag:'العملاق الأحمر', title:'منكب الجوزاء (Betelgeuse)', text:'عملاق أحمر في كوكبة الجبار، أكبر من شمسنا بـ 700 مرة. لو وُضع مكان الشمس لابتلع المريخ! يُتوقّع أن ينفجر كمستعر أعظم خلال 100,000 سنة قادمة، وسيكون أسطع من القمر في سمائنا.'},
      {img:'https://images.unsplash.com/photo-1504333638930-c8787321eee0?w=900&q=70', tag:'الأقرب إلينا', title:'بروكسيما سنتوري', text:'أقرب نجم لنا بعد الشمس، يبعد 4.24 سنة ضوئية. قزم أحمر صغير يدور حوله كوكب صخري شبيه بالأرض اسمه "بروكسيما ب" يقع في النطاق الصالح للحياة.'},
      {img:'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&q=70', tag:'النجم القطبي', title:'الجدي (Polaris)', text:'النجم الذي ظلّ البحارة يهتدون به آلاف السنين لأنه يقع تقريباً فوق القطب الشمالي للأرض. هو فعلياً نظام ثلاثي النجوم يبعد 433 سنة ضوئية.'},
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'حضانة النجوم', title:'سُدُم تكوّن النجوم', text:'النجوم تولد داخل سحب جزيئية ضخمة من الغاز والغبار تُعرف بـ"السدم". أشهرها سديم الجبار (Orion Nebula) المرئي بالعين المجردة، حيث وُلدت آلاف النجوم خلال آخر مليون سنة.'},
      {img:'https://images.unsplash.com/photo-1608178398319-48f814d0750c?w=900&q=70', tag:'النجوم النيوترونية', title:'النابضات (Pulsars)', text:'بقايا نجوم انفجرت كمستعرات عظمى. كثافتها مهولة: ملعقة شاي منها تزن ملياري طن! تدور آلاف الدورات في الثانية وتُطلق نبضات راديوية منتظمة كمنارة كونية.'}
    ]},
    planets: { title:'الكواكب', icon:'fa-globe', color:'#3b82f6', intro:'يضم نظامنا الشمسي 8 كواكب، 4 صخرية داخلية و4 غازية عملاقة. وقد رصد علماء الفلك أكثر من 5,500 كوكب خارج المجموعة الشمسية حتى الآن، بعضها قد يكون صالحاً للحياة.', items:[
      {img:'https://images.unsplash.com/photo-1614313913007-2b4ae8ce32d6?w=900&q=70', tag:'كوكبنا', title:'الأرض', text:'الكوكب الوحيد المعروف بإيوائه الحياة. عمره 4.54 مليار سنة، يدور حول الشمس بسرعة 107,000 كم/س. سطحه مغطى 71% بالمياه السائلة، ولديه قمر طبيعي واحد يُثبّت ميلانه ويهبنا الفصول.'},
      {img:'https://images.unsplash.com/photo-1545156521-77bd85671d30?w=900&q=70', tag:'الكوكب الأحمر', title:'المريخ', text:'يُسمّى الكوكب الأحمر بسبب أكسيد الحديد على سطحه. يضم أعلى جبل في النظام الشمسي (أوليمبوس مونس بارتفاع 22 كم) وأطول وادٍ (فاليس مارينيريس بطول 4,000 كم). دلائل قوية على وجود ماء سائل في ماضيه.'},
      {img:'https://images.unsplash.com/photo-1611270629569-8b357cb88da9?w=900&q=70', tag:'الجبّار', title:'المشتري', text:'أكبر كواكب النظام الشمسي — حجمه يفوق الأرض بـ 1,300 مرة. البقعة الحمراء العظيمة عاصفة دائرة منذ 350 سنة على الأقل وتسع كرتنا الأرضية كاملة. لديه 95 قمراً معروفاً!'},
      {img:'https://images.unsplash.com/photo-1639921884918-8d28ab2e39a4?w=900&q=70', tag:'سيد الحلقات', title:'زحل', text:'مشهور بحلقاته المهيبة المكوّنة من مليارات قطع الجليد والصخر. كثافته أقل من كثافة الماء — لو وضعته في محيط ضخم لطفا! يضم 146 قمراً، أكبرها تيتان الذي له غلاف جوي وبحيرات ميثان.'},
      {img:'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=900&q=70', tag:'الأقرب للشمس', title:'عطارد', text:'أصغر كواكب المجموعة وأقربها للشمس. يومه أطول من سنته! درجة الحرارة تتراوح بين 430°م نهاراً و-180°م ليلاً، أكبر فارق حراري في المنظومة الشمسية.'},
      {img:'https://images.unsplash.com/photo-1534527489986-3e3394ca569c?w=900&q=70', tag:'كواكب خارجية', title:'TRAPPIST-1 system', text:'نظام نجمي يبعد 40 سنة ضوئية يضم 7 كواكب صخرية بحجم الأرض، 3 منها في النطاق الصالح للحياة. أحد أكثر الاكتشافات إثارة في تاريخ علم الفلك (2017).'}
    ]},
    universe: { title:'الكون', icon:'fa-infinity', color:'#a855f7', intro:'الكون: كل ما هو موجود من مادة وطاقة وزمن ومكان. عمره ≈ 13.8 مليار سنة، ويتمدّد منذ الانفجار العظيم. الجزء المرئي منه قطره 93 مليار سنة ضوئية، لكن قد يكون أكبر من ذلك بكثير — ربما لانهائياً.', items:[
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'البداية', title:'الانفجار العظيم (Big Bang)', text:'قبل 13.8 مليار سنة، انبثق الكون كله من نقطة فائقة الكثافة والحرارة. في أول جزء من الثانية تمدّد بسرعة تفوق سرعة الضوء (التضخم الكوني)، ثم بدأت الذرات والنجوم والمجرات تتشكل.'},
      {img:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70', tag:'السر الأعظم', title:'المادة المظلمة', text:'تُشكّل 27% من الكون لكن لم نرها ولم نمسكها — نعرف بوجودها فقط من تأثير جاذبيتها على المجرات. بدونها كانت المجرات ستتفكك وتتطاير في الفضاء.'},
      {img:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70', tag:'الطاقة الخفية', title:'الطاقة المظلمة', text:'68% من الكون عبارة عن "طاقة مظلمة" تدفعه ليتسارع في التمدّد. أكبر لغز في الفيزياء الحديثة — لا أحد يعرف ما هي بالضبط.'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'الإشعاع القديم', title:'إشعاع الخلفية الكونية', text:'صدى الانفجار العظيم لا يزال مسموعاً! إشعاع ميكروويف يملأ الكون بحرارة 2.7 كلفن فقط، رصده العلماء عام 1964 وأثبت نظرية الانفجار العظيم.'},
      {img:'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70', tag:'الأرقام', title:'حجم الكون المرصود', text:'يحتوي الكون المرصود على 2 تريليون مجرة، تضم كل واحدة منها مئات المليارات من النجوم. لو عددت نجمة كل ثانية لاحتجت أكثر من 3 تريليون سنة!'},
      {img:'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70', tag:'النهاية الممكنة', title:'مصير الكون', text:'هناك نظريات: التمدّد الأبدي حتى الموت الحراري (Big Freeze)، أو انهيار عظيم (Big Crunch)، أو تمزّق عظيم (Big Rip). أرجح السيناريوهات حالياً: التمدّد الأبدي مع فقدان كل المجرات للاتصال.'}
    ]},
    galaxies: { title:'المجرات', icon:'fa-circle-notch', color:'#8b5cf6', intro:'المجرات تجمعات هائلة من النجوم والغاز والغبار والمادة المظلمة، يربطها الجاذبية. تتفاوت من أقزام تضم بضعة ملايين نجم إلى عمالقة بمئات تريليونات النجوم.', items:[
      {img:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70', tag:'مجرتنا', title:'درب التبانة', text:'مجرة حلزونية قطرها 100,000 سنة ضوئية تضم 100-400 مليار نجم. شمسنا تقع في أحد أذرعها وتدور حول مركزها كل 230 مليون سنة. في مركزها ثقب أسود هائل اسمه "Sagittarius A*".'},
      {img:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70', tag:'الجارة الكبرى', title:'مجرة أندروميدا (M31)', text:'أقرب مجرة حلزونية كبيرة، تبعد 2.5 مليون سنة ضوئية. ضعف حجم درب التبانة وستصطدم بمجرتنا خلال 4.5 مليار سنة لتشكلا مجرة بيضاوية واحدة اسمها "Milkomeda".'},
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'القلب النشط', title:'الكوازارات', text:'أكثر الأجسام إشعاعاً في الكون — مراكز مجرات نشطة تحوي ثقباً أسود فائقاً يبتلع المادة. كوازار واحد يضيء أكثر من تريليون شمس!'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'تصادم كوني', title:'مجرات متصادمة', text:'المجرات تتصادم باستمرار! تستغرق العملية مئات ملايين السنين، لكن النجوم نادراً ما تصطدم لأن المسافات بينها هائلة. ينتج عنها انفجارات تكوّن نجوم جديدة بكثافة.'},
      {img:'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70', tag:'الأبعد', title:'مجرة JADES-GS-z14-0', text:'أبعد مجرة رصدها تلسكوب جيمس ويب (2024). نراها كما كانت بعد 290 مليون سنة فقط من الانفجار العظيم — رحلة ضوئها لنا استغرقت 13.5 مليار سنة.'}
    ]},
    blackholes: { title:'الثقوب السوداء', icon:'fa-circle', color:'#6366f1', intro:'الثقوب السوداء مناطق في الزمكان تكون جاذبيتها قوية جداً لدرجة أن لا شيء، حتى الضوء، يستطيع الإفلات منها. تتشكل عندما ينهار نجم ضخم على نفسه عند موته.', items:[
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'أول صورة', title:'M87* — أول صورة لثقب أسود', text:'في 2019 نشر تلسكوب أفق الحدث (EHT) أول صورة في التاريخ لثقب أسود، يقع في مركز مجرة M87 ويبعد 53 مليون سنة ضوئية. كتلته 6.5 مليار شمس!'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'في قلب مجرتنا', title:'Sagittarius A*', text:'الثقب الأسود الهائل في مركز درب التبانة. كتلته 4.3 مليون شمس وقطره 23 مليون كيلومتر. تم تصويره عام 2022، وهو الأقرب لنا (26,000 سنة ضوئية).'},
      {img:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70', tag:'الفيزياء الغريبة', title:'تمدد الزمن', text:'بقرب الثقب الأسود، الزمن يتباطأ بشكل دراماتيكي بسبب الجاذبية الهائلة (نسبية أينشتاين). ساعة عند أفق الحدث تتوقف فعلياً من منظور مراقب بعيد!'},
      {img:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70', tag:'إشعاع هوكينغ', title:'الثقوب السوداء تتبخّر', text:'اكتشف ستيفن هوكينغ عام 1974 أن الثقوب السوداء تُشِع طاقة وتفقد كتلتها ببطء شديد. ثقب بحجم الشمس يحتاج 10⁶⁷ سنة ليتبخر تماماً.'},
      {img:'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70', tag:'موجات الجاذبية', title:'GW150914', text:'في 2015 رصد LIGO أول موجة جاذبية في التاريخ، نتجت عن اندماج ثقبين أسودين قبل 1.3 مليار سنة. أكدت تنبؤات أينشتاين بعد قرن من نظرية النسبية.'}
    ]},
    missions: { title:'مهمات فضائية', icon:'fa-rocket', color:'#ef4444', intro:'منذ أول قمر صناعي عام 1957، أرسلت البشرية مئات المهمات الفضائية لاستكشاف الكواكب والأقمار والكويكبات والشمس والنجوم البعيدة.', items:[
      {img:'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70', tag:'أبولو 11', title:'الهبوط على القمر — 1969', text:'في 20 يوليو 1969، وضع نيل أرمسترونغ أول قدم بشرية على سطح القمر قائلاً جملته الشهيرة. مهمة أبولو 11 احتاجت 400,000 شخص و8 سنوات عمل وميزانية تعادل 280 مليار دولار حالياً.'},
      {img:'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=900&q=70', tag:'فوييجر', title:'فوييجر 1 و 2', text:'أُطلقتا عام 1977. فوييجر 1 الآن أبعد جسم صنعه الإنسان (24 مليار كم)، خرجت من النظام الشمسي عام 2012 وما زالت ترسل بيانات. تحملان قرصاً ذهبياً يحوي تحية الأرض إلى أي حضارة فضائية تجدها.'},
      {img:'https://images.unsplash.com/photo-1630839437035-dac17da580d0?w=900&q=70', tag:'علم المريخ', title:'مهمات المريخ', text:'هبط على المريخ مسبارات مثل Curiosity (2012) وPerseverance (2021). الأخير يحمل مروحية Ingenuity التي طارت في غلاف المريخ — أول طيران بمحرك على كوكب آخر!'},
      {img:'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70', tag:'محطة فضائية', title:'محطة الفضاء الدولية ISS', text:'منذ 2000 ومحطة الفضاء الدولية مأهولة باستمرار. تدور 400 كم فوق الأرض بسرعة 28,000 كم/س، وتشاهد 16 شروقاً وغروباً يومياً. تكلفت 150 مليار دولار وتعدّ أكبر مشروع علمي تعاوني في التاريخ.'},
      {img:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70', tag:'تلسكوب جيمس ويب', title:'JWST', text:'أُطلق ديسمبر 2021، ثاني أكبر تلسكوب فضائي ويعمل بالأشعة تحت الحمراء. يقع 1.5 مليون كم من الأرض. يكشف مجرات لم تُرَ من قبل من فجر الكون، وأول صورة وضعها (2022) صعقت العالم.'},
      {img:'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70', tag:'سبيس إكس', title:'برنامج Starship', text:'أكبر صاروخ صنعه الإنسان (120م ارتفاع، 5,000 طن) تطوّره SpaceX لنقل البشر إلى المريخ. أنجز اختبارات إعادة هبوط ناجحة عام 2024 — ثورة في اقتصاد رحلات الفضاء.'}
    ]},
    astronauts: { title:'رواد الفضاء', icon:'fa-user-astronaut', color:'#10b981', intro:'منذ يوري غاغارين عام 1961، صعد أكثر من 670 إنساناً إلى الفضاء. لكل واحد منهم قصة شجاعة وإنجاز غيّرت نظرتنا للأرض ومكاننا في الكون.', items:[
      {img:'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70', tag:'الأول في الفضاء', title:'يوري غاغارين', text:'رائد فضاء سوفييتي أصبح أول إنسان يصعد للفضاء في 12 أبريل 1961. أكمل دورة كاملة حول الأرض في 108 دقائق على متن "فوستوك 1". قال جملته الشهيرة: "الأرض زرقاء... كم هي جميلة!".'},
      {img:'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70', tag:'القمر', title:'نيل أرمسترونغ', text:'أول إنسان يطأ القمر، 20 يوليو 1969. مهندس وطيار اختبار قبل أن يصبح رائد فضاء. تواضعه بعد المهمة أصبح مضرب أمثال — ابتعد عن الأضواء طوال حياته.'},
      {img:'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70', tag:'أول امرأة', title:'فالنتينا تيريشكوفا', text:'أول امرأة في الفضاء (1963). كانت عاملة نسيج تطوّعت بعد رحلة غاغارين، فأصبحت قائدة "فوستوك 6" بعمر 26. أكملت 48 دورة حول الأرض خلال 3 أيام.'},
      {img:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70', tag:'الإمارات', title:'هزاع المنصوري', text:'أول رائد فضاء عربي يصعد لمحطة الفضاء الدولية (سبتمبر 2019). قضى 8 أيام في الفضاء وحمل علم الإمارات وقرآناً وصور أدبائها. مهمته فتحت الباب لجيل عربي جديد من رواد الفضاء.'},
      {img:'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=900&q=70', tag:'السعودية', title:'الأمير سلطان بن سلمان', text:'أول رائد فضاء عربي ومسلم في التاريخ (1985)، على متن المكوك "ديسكفري". قضى 7 أيام في الفضاء، أجرى تجارب علمية وصلّى من المدار، وألهم جيلاً عربياً كاملاً.'},
      {img:'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70', tag:'القياسي', title:'سكوت كيلي', text:'قضى 340 يوماً متواصلاً في محطة الفضاء الدولية (2015-2016) في "مهمة السنة". قارنت ناسا تغيراته الجينية بشقيقه التوأم على الأرض لدراسة آثار الفضاء على الجسم البشري.'}
    ]},
    news: { title:'أخبار الكون', icon:'fa-newspaper', color:'#ec4899', intro:'كل يوم يكشف العلماء أسراراً جديدة عن الكون. هذه أبرز الاكتشافات والأخبار الفلكية المثيرة في السنوات الأخيرة.', items:[
      {img:'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=900&q=70', tag:'2024', title:'تلسكوب جيمس ويب يرصد أقدم مجرة', text:'رصد JWST مجرة "JADES-GS-z14-0" تكوّنت بعد 290 مليون سنة فقط من الانفجار العظيم. هذا أبعد ما رآه الإنسان حتى الآن، ويتحدّى نماذجنا عن سرعة تكوّن المجرات الأولى.'},
      {img:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70', tag:'2024', title:'علامات حياة محتملة على K2-18b', text:'رصد العلماء جزيء "ثنائي ميثيل السلفيد" في غلاف الكوكب الخارجي K2-18b — جزيء على الأرض لا تنتجه إلا الكائنات الحية. الكوكب يبعد 124 سنة ضوئية ويُعدّ من أفضل المرشحين لاحتواء حياة.'},
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'2023', title:'هيئة فلكية جديدة لأينشتاين', text:'مرصد NANOGrav رصد لأول مرة "خلفية موجات جاذبية" تنتج عن اندماج ثقوب سوداء فائقة الكتلة في كل أنحاء الكون — تأكيد جديد لنظرية النسبية بعد أكثر من قرن.'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'2024', title:'مهمة Europa Clipper تنطلق', text:'في أكتوبر 2024 أطلقت ناسا مسبار Europa Clipper نحو قمر المشتري "أوروبا" الذي يحتوي على محيط مائي ضخم تحت سطحه الجليدي — قد يكون أفضل مكان للبحث عن حياة في النظام الشمسي.'},
      {img:'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70', tag:'2024', title:'رواد فضاء عرب جدد', text:'أكملت رائدتا الفضاء العربيتان نورا المطروشي ومحمد الملا تدريباتهما مع ناسا (2024) ضمن برنامج رواد الفضاء، تمهيداً لمهمات على محطة الفضاء الدولية وربما القمر.'},
      {img:'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70', tag:'2024', title:'كسوف شمسي كلي يجتاح أمريكا', text:'في 8 أبريل 2024 شهدت أمريكا الشمالية كسوفاً شمسياً كلياً عبور 31 مليون شخص. الكسوف الكلي التالي بهذا الحجم سيكون عام 2044 — حدث نادر يحدث في كل بقعة كل 375 سنة في المتوسط.'}
    ]},
    telescopes: { title:'التلسكوبات', icon:'fa-search', color:'#06b6d4', intro:'التلسكوبات عيوننا على الكون. منذ أول تلسكوب صنعه غاليليو عام 1609 إلى التلسكوبات الفضائية العملاقة اليوم، غيّرت فهمنا لمكاننا في الكون.', items:[
      {img:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70', tag:'الفضائي الأول', title:'تلسكوب هابل', text:'أُطلق 1990، يدور حول الأرض على ارتفاع 540 كم. التقط أكثر من 1.5 مليون صورة غيّرت علم الفلك. حدّد عمر الكون بدقة (13.8 مليار سنة) ورصد أبعد المجرات في عصره. لا يزال يعمل بعد 35 سنة.'},
      {img:'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70', tag:'الجيل الجديد', title:'جيمس ويب JWST', text:'أكبر تلسكوب فضائي في التاريخ، مرآته 6.5م. تكلف 10 مليار دولار واحتاج 30 سنة تطوير. يرى الأشعة تحت الحمراء فيخترق الغبار الكوني ويصل لأقدم المجرات.'},
      {img:'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70', tag:'الراديو', title:'تلسكوب FAST الصيني', text:'أكبر تلسكوب راديوي في العالم — طبق بقطر 500م في الصين! يبحث عن نبضات راديوية من نجوم نيوترونية وعن إشارات حضارات فضائية محتملة (SETI).'},
      {img:'https://images.unsplash.com/photo-1614314107768-6018061e5e10?w=900&q=70', tag:'تحت الأرض', title:'مرصد LIGO', text:'يرصد موجات الجاذبية بدقة لا تصدّق — يقيس تغيرات أصغر من قطر بروتون! اكتشف اندماج ثقوب سوداء ونجوم نيوترونية وفتح نافذة جديدة كاملة على الكون.'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'القادم', title:'مرصد فيرا روبين', text:'يبدأ العمل 2025 في تشيلي، وسيرصد كل سماء الجنوب كل 3 ليالٍ. سيكتشف ملايين الكواكب الخارجية، الكويكبات الخطرة، ويصوّر الكون بدقة لم يسبق لها مثيل.'}
    ]},
    phenomena: { title:'ظواهر فلكية', icon:'fa-bolt', color:'#f59e0b', intro:'الكون مليء بالظواهر المذهلة، بعضها يحدث أمام أعيننا وبعضها يشاهَد مرة في العمر. هذه أبرز ما يمكن أن تختبره من ظواهر.', items:[
      {img:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70', tag:'كل عام', title:'زخات الشهب', text:'لما تعبر الأرض ذيل مذنّب، يحترق الغبار في غلافنا الجوي ويشكّل "نجوم متساقطة". أشهرها: شهب البرشاويات (أغسطس) وشهب التوأميات (ديسمبر) — تصل إلى 100 شهاب في الساعة!'},
      {img:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70', tag:'نادر', title:'الكسوف الكلي', text:'عندما يحجب القمر الشمس بالكامل لدقائق معدودة. يحدث في بقعة معينة على الأرض كل 375 سنة في المتوسط. أحد أكثر التجارب البصرية إذهالاً للبشر — السماء تظلم نهاراً!'},
      {img:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70', tag:'القطبي', title:'الشفق القطبي', text:'الجسيمات المشحونة من الشمس تصطدم بالغلاف الجوي قرب القطبين فتُنتج هذه الستائر الضوئية الراقصة. أفضل أوقات المشاهدة في النرويج وأيسلندا وألاسكا خلال أشهر الشتاء.'},
      {img:'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70', tag:'كل 76 سنة', title:'مذنّب هالي', text:'أشهر مذنّب في التاريخ، يزور الأرض كل 76 سنة. آخر زيارة كانت 1986 والقادمة 2061. لاحظه الإنسان منذ 240 ق.م.، وذُكر في أعمال شكسبير ورُسم في معركة هيستينغز 1066.'},
      {img:'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70', tag:'انفجار كوني', title:'المستعر الأعظم (Supernova)', text:'موت نجم ضخم في انفجار يفوق سطوعه مجرة كاملة لأسابيع! أنتج كل العناصر الثقيلة (ذهب، حديد، فضة) في أجسامنا. كما قال كارل ساغان: "نحن من غبار النجوم".'},
      {img:'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70', tag:'لحظات نادرة', title:'اقتران الكواكب', text:'أحياناً تبدو كواكب متعددة قريبة جداً من بعضها في السماء. اقتران المشتري وزحل عام 2020 (نجمة الميلاد العظمى) كان الأقرب منذ 1623 — ظاهرة بصرية ساحرة بالعين المجردة.'}
    ]}
  };

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // ============================================================
  // AI-POWERED DYNAMIC CONTENT SYSTEM
  // يولد محتوى فلكي عربي جديد بالذكاء الاصطناعي كل 6 ساعات
  // ============================================================
  const _aiContentCache = {};
  const AI_CONTENT_TTL = 6 * 60 * 60 * 1000; // 6 ساعات
  const STATIC_ROTATE_TTL = 30 * 60 * 1000;   // 30 دقيقة دوران للبيانات الثابتة
  let _staticRotateTimers = {};

  const AI_CATEGORY_PROMPTS = {
    stars:      'اكتب 6 بطاقات معلوماتية مثيرة ومتنوعة عن النجوم والفلك لعام 2025. كل بطاقة لها: title (عنوان قصير مثير)، text (فقرة 2-3 جمل معلومات علمية دقيقة ومشوقة بالعربي)، tag (وسم قصير مثل "عملاق أحمر" أو "اكتشاف 2025"). أعد JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    planets:    'اكتب 6 بطاقات معلومات مثيرة ومتنوعة عن الكواكب وعلوم الفضاء عام 2025. كل بطاقة: title، text (2-3 جمل علمية دقيقة مشوقة)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    galaxies:   'اكتب 6 بطاقات معلومات مشوقة ومتنوعة عن المجرات والكون عام 2025. كل بطاقة: title، text (2-3 جمل علمية)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    blackholes: 'اكتب 6 بطاقات معلومات مثيرة ومتنوعة عن الثقوب السوداء وظواهر الجاذبية عام 2025. كل بطاقة: title، text (2-3 جمل علمية دقيقة)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    astronauts: 'اكتب 6 بطاقات معلومات متنوعة عن رواد فضاء ومهمات بشرية في الفضاء (قديمة وحديثة 2025). كل بطاقة: title، text (2-3 جمل قصة مثيرة)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    missions:   'اكتب 6 بطاقات معلومات متنوعة عن مهمات فضائية مثيرة قديمة وحديثة 2025 (ناسا، SpaceX، ESA، إلخ). كل بطاقة: title، text (2-3 جمل علمية)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    telescopes: 'اكتب 6 بطاقات معلومات متنوعة عن التلسكوبات والمراصد الفلكية الحديثة والتاريخية. كل بطاقة: title، text (2-3 جمل علمية)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    phenomena:  'اكتب 6 بطاقات معلومات عن ظواهر فلكية مذهلة متنوعة (شهب، كسوف، شفق، مستعرات، إلخ). كل بطاقة: title، text (2-3 جمل علمية مشوقة)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    universe:   'اكتب 6 بطاقات معلومات متنوعة مثيرة عن الكون وأسراره (انفجار عظيم، مادة مظلمة، طاقة مظلمة، نظريات حديثة 2025). كل بطاقة: title، text (2-3 جمل)، tag. JSON فقط: [{"title":"...","text":"...","tag":"..."}]',
    news:       'اكتب 6 بطاقات أخبار فلكية وفضائية مثيرة ومتنوعة كأنها أخبار حديثة 2025. كل بطاقة: title، text (2-3 جمل خبر علمي مشوق)، tag (سنة أو وصف). JSON فقط: [{"title":"...","text":"...","tag":"..."}]'
  };

  const COSMOS_IMG_POOL = [
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70',
    'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
    'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70',
    'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=900&q=70',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70',
    'https://images.unsplash.com/photo-1614314107768-6018061e5e10?w=900&q=70',
    'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70',
    'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70',
    'https://images.unsplash.com/photo-1630839437035-dac17da580d0?w=900&q=70',
    'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=900&q=70',
    'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70',
    'https://images.unsplash.com/photo-1539593395743-7da5ee10ff07?w=900&q=70',
    'https://images.unsplash.com/photo-1628458483547-6c399d07a598?w=900&q=70',
    'https://images.unsplash.com/photo-1504192010706-dd7f569ee2be?w=900&q=70',
    'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=900&q=70',
    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=900&q=70',
    'https://images.unsplash.com/photo-1636819488537-a9b1980df19f?w=900&q=70',
    'https://images.unsplash.com/photo-1494022299300-899b96e49893?w=900&q=70',
    'https://images.unsplash.com/photo-1608178398319-48f814d0750c?w=900&q=70'
  ];

  function getShuffledImgs(count) {
    const pool = [...COSMOS_IMG_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  async function fetchAIContent(key) {
    const cached = _aiContentCache[key];
    if (cached && (Date.now() - cached.time) < AI_CONTENT_TTL) return cached.data;
    const prompt = AI_CATEGORY_PROMPTS[key];
    if (!prompt) return null;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const text = data.content && data.content[0] && data.content[0].text;
      if (!text) return null;
      const clean = text.replace(/```json|```/g, '').trim();
      const items = JSON.parse(clean);
      if (!Array.isArray(items) || !items.length) return null;
      const imgs = getShuffledImgs(items.length);
      const enriched = items.map((it, i) => ({ ...it, img: imgs[i] || COSMOS_IMG_POOL[i % COSMOS_IMG_POOL.length] }));
      _aiContentCache[key] = { data: enriched, time: Date.now() };
      return enriched;
    } catch(e) {
      console.warn('AI content fetch failed for', key, e);
      return null;
    }
  }

  function renderAICards(items, color, key) {
    if (!items || !items.length) return '';
    const now = new Date().toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="cosmos-cards" id="aiCards_${key}">
        ${items.map((it, i) => `
          <article class="cosmos-card ai-generated-card" style="animation-delay:${i * 0.08}s">
            <div class="cosmos-card-img" style="background-image:url('${encodeURI(it.img)}')">
              <span class="cosmos-card-tag floating" style="background:rgba(99,102,241,.85);border-color:rgba(167,139,250,.6)">
                <i class="fas fa-robot" style="color:#a78bfa"></i> ${escapeHtml(it.tag || 'ذكاء اصطناعي')}
              </span>
              <span class="cosmos-card-time"><i class="fas fa-clock-rotate-left"></i> ${now}</span>
            </div>
            <div class="cosmos-card-body">
              <h4 style="color:#e2e8f0">${escapeHtml(it.title)}</h4>
              <p>${escapeHtml(it.text)}</p>
              <span class="cosmos-read-more" style="color:#a78bfa;font-size:.78rem">
                <i class="fas fa-brain"></i> محتوى مولّد بالذكاء الاصطناعي
              </span>
            </div>
          </article>
        `).join('')}
      </div>
      <p style="font-size:.78rem;color:#9ca3af;margin-top:.65rem;text-align:center">
        <i class="fas fa-robot" style="color:#a78bfa"></i> محتوى مولَّد بالذكاء الاصطناعي Claude • يتجدد كل 6 ساعات
        <span id="aiRefreshBadge_${key}" style="margin-right:.5rem;color:#10b981;font-size:.74rem"></span>
      </p>`;
  }

  // Rotate static content items every 30 min (shuffle which 6 items shown from the full list)
  function getRotatedStaticItems(cat) {
    const all = cat.items;
    if (!all || all.length <= 6) return all;
    const seed = Math.floor(Date.now() / STATIC_ROTATE_TTL);
    // deterministic shuffle based on time seed
    const indices = all.map((_, i) => i);
    let s = seed;
    for (let i = indices.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, 6).map(i => all[i]);
  }

  function renderStaticCosmos(cat) {
    const items = getRotatedStaticItems(cat);
    return `
      <div class="cosmos-modal-intro"><i class="fas fa-info-circle" style="color:${cat.color};margin-left:.5rem"></i>${escapeHtml(cat.intro)}</div>
      <div class="cosmos-cards" id="staticCards_${cat.title}">
        ${items.map(it=>`
          <article class="cosmos-card">
            <div class="cosmos-card-img" style="background-image:url('${encodeURI(it.img)}')">
              ${it.tag?`<span class="cosmos-card-tag floating"><i class="fas fa-tag"></i> ${escapeHtml(it.tag)}</span>`:''}
            </div>
            <div class="cosmos-card-body">
              <h4>${escapeHtml(it.title)}</h4>
              <p>${escapeHtml(it.text)}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  // Called when opening a category — loads AI content on top of static
  window._loadAIContentForCategory = async function(key, color, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    // Show shimmer/loading placeholder
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
        ${[1,2,3,4,5,6].map(()=>`
          <div style="background:rgba(99,102,241,.07);border-radius:16px;overflow:hidden;border:1px solid rgba(99,102,241,.2)">
            <div style="height:180px;background:linear-gradient(90deg,rgba(99,102,241,.1) 25%,rgba(139,92,246,.18) 50%,rgba(99,102,241,.1) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite"></div>
            <div style="padding:1rem">
              <div style="height:14px;background:rgba(255,255,255,.07);border-radius:6px;margin-bottom:.7rem;width:70%;animation:shimmer 1.5s infinite"></div>
              <div style="height:10px;background:rgba(255,255,255,.05);border-radius:4px;margin-bottom:.4rem;animation:shimmer 1.5s infinite 0.1s"></div>
              <div style="height:10px;background:rgba(255,255,255,.05);border-radius:4px;width:85%;animation:shimmer 1.5s infinite 0.2s"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <p style="text-align:center;color:#a78bfa;font-size:.85rem;margin-top:1rem"><i class="fas fa-robot"></i> يولّد الذكاء الاصطناعي محتوى جديد...</p>`;
    const items = await fetchAIContent(key);
    if (items && items.length) {
      container.innerHTML = renderAICards(items, color, key);
      container.style.opacity = '0';
      container.style.transition = 'opacity 0.5s';
      requestAnimationFrame(() => { container.style.opacity = '1'; });
    } else {
      container.innerHTML = '<div class="cosmos-empty"><i class="fas fa-satellite"></i><p>تعذّر توليد المحتوى الآن، جرّب التحديث.</p></div>';
    }
  };

  // Background preload AI content for all categories silently
  window._preloadAllAIContent = function() {
    const keys = Object.keys(AI_CATEGORY_PROMPTS);
    keys.forEach((key, i) => {
      setTimeout(() => fetchAIContent(key).catch(()=>{}), i * 8000);
    });
  };

  // Auto-rotate static content badge display every 30 min
  setInterval(() => {
    document.querySelectorAll('[id^="staticCards_"]').forEach(el => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(() => { el.style.opacity = '1'; }, 400);
    });
  }, STATIC_ROTATE_TTL);

  function timeAgo(dateStr){
    const d = new Date(dateStr); if(isNaN(d)) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'منذ لحظات';
    if (diff < 3600) return 'منذ ' + Math.floor(diff/60) + ' دقيقة';
    if (diff < 86400) return 'منذ ' + Math.floor(diff/3600) + ' ساعة';
    if (diff < 2592000) return 'منذ ' + Math.floor(diff/86400) + ' يوم';
    return d.toLocaleDateString('ar-EG', {year:'numeric', month:'long', day:'numeric'});
  }

  let _newsCache = null, _newsTime = 0, _newsDisplayOffset = 0;
  // اخلي _newsTime global عشان countdown يشوفه
  window._getNewsTime = function(){ return _newsTime; };
  const NEWS_TTL = 0; // تتجدد الأخبار عند كل فتح للمنصة
  const NEWS_PAGE_SIZE = 12;
  window._currentNewsTab = 'all';

  // جلب الأخبار من مصادر متعددة حقيقية
  async function fetchLiveNews(forceRefresh){
    if (!forceRefresh && _newsCache && _newsCache.length && (Date.now() - _newsTime) < NEWS_TTL) return _newsCache;

    const allArticles = [];
    const errors = [];

    // المصدر 1: Spaceflight News API (الأقوى — NASA, SpaceX, ESA, Sky&Tel)
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('https://api.spaceflightnewsapi.net/v4/articles/?limit=100&ordering=-published_at', { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json();
        (data.results || []).forEach(a => {
          allArticles.push({
            ...a,
            _source: 'spaceflight',
            _sourceName: a.news_site || 'Spaceflight News'
          });
        });
      }
    } catch(e) { errors.push('spaceflight: ' + e.message); }

    // المصدر 2: NASA News RSS عبر allorigins proxy
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 8000);
      const rssUrl = encodeURIComponent('https://www.nasa.gov/news/rss/');
      const res2 = await fetch(`https://api.allorigins.win/get?url=${rssUrl}`, { signal: ctrl2.signal });
      clearTimeout(t2);
      if (res2.ok) {
        const j = await res2.json();
        const parser = new DOMParser();
        const xml = parser.parseFromString(j.contents, 'text/xml');
        const items = xml.querySelectorAll('item');
        items.forEach(item => {
          const title = item.querySelector('title')?.textContent || '';
          const link = item.querySelector('link')?.textContent || '';
          const desc = item.querySelector('description')?.textContent?.replace(/<[^>]+>/g,'') || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          const img = item.querySelector('enclosure')?.getAttribute('url') || '';
          if (title && link) {
            allArticles.push({
              title, url: link, summary: desc.slice(0, 300),
              image_url: img,
              published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
              _source: 'nasa', _sourceName: 'NASA'
            });
          }
        });
      }
    } catch(e) { errors.push('nasa rss: ' + e.message); }

    // المصدر 3: ESA News RSS عبر allorigins proxy
    try {
      const ctrl3 = new AbortController();
      const t3 = setTimeout(() => ctrl3.abort(), 8000);
      const rssUrl3 = encodeURIComponent('https://www.esa.int/rssfeed/Our_Activities/Space_News');
      const res3 = await fetch(`https://api.allorigins.win/get?url=${rssUrl3}`, { signal: ctrl3.signal });
      clearTimeout(t3);
      if (res3.ok) {
        const j3 = await res3.json();
        const parser3 = new DOMParser();
        const xml3 = parser3.parseFromString(j3.contents, 'text/xml');
        const items3 = xml3.querySelectorAll('item');
        items3.forEach(item => {
          const title = item.querySelector('title')?.textContent || '';
          const link = item.querySelector('link')?.textContent || item.querySelector('guid')?.textContent || '';
          const desc = item.querySelector('description')?.textContent?.replace(/<[^>]+>/g,'') || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          const imgEl = item.querySelector('enclosure') || item.querySelector('thumbnail');
          const img = imgEl?.getAttribute('url') || '';
          if (title && link) {
            allArticles.push({
              title, url: link, summary: desc.slice(0, 300),
              image_url: img,
              published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
              _source: 'esa', _sourceName: 'ESA'
            });
          }
        });
      }
    } catch(e) { errors.push('esa rss: ' + e.message); }

    if (errors.length) console.warn('News fetch partial errors:', errors);

    // ترتيب حسب التاريخ (الأحدث أولاً) وإزالة التكرار
    const seen = new Set();
    const unique = allArticles
      .filter(a => { const k = a.url || a.title; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    if (unique.length > 0) {
      _newsCache = unique;
      _newsTime = Date.now();
      // حفظ في localStorage عشان يشتغل حتى لو الشبكة وقفت
      try { localStorage.setItem('falak_news_cache', JSON.stringify({articles: unique, time: _newsTime})); } catch(e){}
    } else {
      // جرب اللود من localStorage لو الشبكة فشلت
      try {
        const stored = JSON.parse(localStorage.getItem('falak_news_cache') || 'null');
        if (stored && stored.articles && stored.articles.length) {
          _newsCache = stored.articles;
          _newsTime = stored.time;
        }
      } catch(e){}
    }

    return _newsCache || [];
  }

  // تصفية الأخبار حسب المصدر
  function filterNewsBySource(articles, source) {
    if (!source || source === 'all') return articles;
    return articles.filter(a => a._source === source);
  }

  window.switchNewsTab = function(source, btn) {
    window._currentNewsTab = source;
    document.querySelectorAll('.news-tab-btn').forEach(b => {
      b.classList.remove('active-tab');
      b.style.background = '';
      b.style.borderColor = '';
      b.style.color = '';
    });
    if (btn) {
      btn.classList.add('active-tab');
      btn.style.background = 'rgba(236,72,153,.25)';
      btn.style.borderColor = 'rgba(236,72,153,.6)';
      btn.style.color = '#f9a8d4';
    }
    const filtered = filterNewsBySource(_newsCache || [], source);
    const c = document.getElementById('cosmosNewsContainer');
    if (c) c.innerHTML = renderNewsCards(filtered.length ? filtered : (_newsCache || []));
  };

  function getNewsPage(articles){
    if (!articles || !articles.length) return articles;
    const start = _newsDisplayOffset % articles.length;
    const page = [];
    for (let i = 0; i < NEWS_PAGE_SIZE && i < articles.length; i++) {
      page.push(articles[(start + i) % articles.length]);
    }
    _newsDisplayOffset = (_newsDisplayOffset + NEWS_PAGE_SIZE) % articles.length;
    return page;
  }

  const WIKI_TITLES = {
    planets:    ['عطارد','الزهرة','الأرض','المريخ','المشتري','زحل','أورانوس','نبتون'],
    stars:      ['الشمس','منكب الجوزاء','بروكسيما قنطورس','الشعرى اليمانية','نجم قطبي','نجم نيوتروني','قزم أبيض','مستعر أعظم'],
    galaxies:   ['درب التبانة','مجرة المرأة المسلسلة','مجرة المثلث','مجرة دوامة','مجرة سومبريرو','مجرة بيضوية','نشاط مجري'],
    blackholes: ['ثقب أسود','إم 87 (مجرة)','القوس A*','أفق الحدث','إشعاع هوكينغ','ثقب أسود فائق الكتلة','ثقب أسود نجمي'],
    astronauts: ['يوري غاغارين','نيل أرمسترونغ','فالنتينا تيريشكوفا','هزاع المنصوري','سلطان بن سلمان آل سعود','سكوت كيلي','بز ألدرين','كريستينا كوخ'],
    telescopes: ['تلسكوب هابل الفضائي','تلسكوب جيمس ويب الفضائي','تلسكوب فاست','مرصد ليغو','تلسكوب أفق الحدث','مرصد فيرا روبين','مصفوفة أتاكاما الكبيرة المليمترية'],
    phenomena:  ['زخة شهب','كسوف الشمس','خسوف القمر','شفق قطبي','مذنب هالي','اقتران كوكبي','عبور فلكي','نيزك']
  };

  const _wikiCache = {};
  async function fetchWikiCards(key){
    const TTL = 60 * 60 * 1000;
    const titles = WIKI_TITLES[key];
    if (!titles) return [];
    const cached = _wikiCache[key];
    if (cached && (Date.now() - cached.time) < TTL) return cached.data;
    const results = await Promise.all(titles.map(async title => {
      try{
        const ctrl = new AbortController();
        const t = setTimeout(()=>ctrl.abort(), 6000);
        const r = await fetch(`https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.extract) return null;
        return { title, data: d };
      }catch(e){ return null; }
    }));
    const data = results.filter(Boolean);
    _wikiCache[key] = { data, time: Date.now() };
    return data;
  }


  // خريطة صور ثابتة لكل موضوع - تمنع ويكيبيديا من جلب صور خاطئة
  const WIKI_IMAGE_MAP = {
    // كواكب
    'عطارد':                'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=900&q=70',
    'الزهرة':               'https://images.unsplash.com/photo-1614314215058-f5de81528b82?w=900&q=70',
    'الأرض':                'https://images.unsplash.com/photo-1614313913007-2b4ae8ce32d6?w=900&q=70',
    'المريخ':               'https://images.unsplash.com/photo-1545156521-77bd85671d30?w=900&q=70',
    'المشتري':              'https://images.unsplash.com/photo-1611270629569-8b357cb88da9?w=900&q=70',
    'زحل':                  'https://images.unsplash.com/photo-1639921884918-8d28ab2e39a4?w=900&q=70',
    'أورانوس':              'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=900&q=70',
    'نبتون':                'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    // نجوم
    'الشمس':                'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=900&q=70',
    'منكب الجوزاء':         'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=900&q=70',
    'بروكسيما قنطورس':      'https://images.unsplash.com/photo-1504333638930-c8787321eee0?w=900&q=70',
    'الشعرى اليمانية':      'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=70',
    'نجم قطبي':             'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&q=70',
    'نجم نيوتروني':         'https://images.unsplash.com/photo-1608178398319-48f814d0750c?w=900&q=70',
    'قزم أبيض':             'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'مستعر أعظم':           'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    // مجرات
    'درب التبانة':          'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    'مجرة المرأة المسلسلة': 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
    'مجرة المثلث':          'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'مجرة دوامة':           'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=900&q=70',
    'مجرة سومبريرو':        'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    'مجرة بيضوية':          'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'نشاط مجري':            'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70',
    // ثقوب سوداء
    'ثقب أسود':             'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'إم 87 (مجرة)':        'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
    'القوس A*':             'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    'أفق الحدث':            'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'إشعاع هوكينغ':         'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'ثقب أسود فائق الكتلة': 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'ثقب أسود نجمي':        'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
    // ظواهر
    'زخة شهب':              'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&q=70',
    'كسوف الشمس':           'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70',
    'خسوف القمر':           'https://images.unsplash.com/photo-1504333638930-c8787321eee0?w=900&q=70',
    'شفق قطبي':             'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=900&q=70',
    'مذنب هالي':            'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'اقتران كوكبي':         'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=70',
    'عبور فلكي':            'https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=900&q=70',
    'نيزك':                 'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=900&q=70',
    // رواد الفضاء
    'يوري غاغارين':         'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70',
    'نيل أرمسترونغ':        'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70',
    'فالنتينا تيريشكوفا':   'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70',
    'هزاع المنصوري':        'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70',
    'سلطان بن سلمان آل سعود': 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70',
    'سكوت كيلي':            'https://images.unsplash.com/photo-1517976487492-5750f3195933?w=900&q=70',
    'بز ألدرين':            'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=900&q=70',
    'كريستينا كوخ':         'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70',
    // تلسكوبات
    'تلسكوب هابل الفضائي':  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70',
    'تلسكوب جيمس ويب الفضائي': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=900&q=70',
    'تلسكوب فاست':          'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
    'مرصد ليغو':            'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70',
    'تلسكوب أفق الحدث':     'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=900&q=70',
    'مرصد فيرا روبين':      'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70',
    'مصفوفة أتاكاما الكبيرة المليمترية': 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
  };

  function renderWikiCards(items, accent){
    if (!items || !items.length) return '';
    const color = accent || '#3b82f6';
    const fallbacks = [
      'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70',
      'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=70',
      'https://images.unsplash.com/photo-1532798442725-41036acc7489?w=900&q=70',
      'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=900&q=70'
    ];
    return `<div class="cosmos-cards">${items.map((p,i)=>{
      const d = p.data;
      // استخدم الخريطة دايماً - امنع ويكيبيديا من جلب صور خاطئة
      const img = WIKI_IMAGE_MAP[p.title] || WIKI_IMAGE_MAP[d.title] || fallbacks[i % fallbacks.length];
      const extract = d.extract || '';
      const displayTitle = (d.titles && d.titles.normalized) || p.title;
      const url = (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || `https://ar.wikipedia.org/wiki/${encodeURIComponent(p.title)}`;
      return `
      <article class="cosmos-card" onclick="window.open('${encodeURI(url)}','_blank','noopener')" style="cursor:pointer">
        <div class="cosmos-card-img" style="background-image:url('${encodeURI(img)}')">
          <span class="cosmos-card-tag floating"><i class="fas fa-satellite-dish"></i> محدّث</span>
        </div>
        <div class="cosmos-card-body">
          <h4><i class="fas fa-bookmark" style="color:${color}"></i> ${escapeHtml(displayTitle)}</h4>
          <p>${escapeHtml(extract.slice(0,260))}${extract.length>260?'…':''}</p>
          <span class="cosmos-read-more"><i class="fas fa-up-right-from-square"></i> اقرأ المزيد على ويكيبيديا</span>
        </div>
      </article>`;
    }).join('')}</div>
    <p style="font-size:.78rem;color:#9ca3af;margin-top:.65rem;text-align:center"><i class="fas fa-circle-info"></i> المصدر: ويكيبيديا العربية (محتوى محدَّث باستمرار)</p>`;
  }

  let _apodCache = null, _apodTime = 0;
  async function fetchAPOD(){
    const TTL = 60 * 60 * 1000;
    if (_apodCache && (Date.now() - _apodTime) < TTL) return _apodCache;
    const r = await fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
    if (!r.ok) throw new Error('apod fetch failed');
    _apodCache = await r.json();
    _apodTime = Date.now();
    return _apodCache;
  }

  function renderAPODCard(a){
    if (!a) return '';
    const isImg = (a.media_type === 'image');
    return `<article class="cosmos-card" style="grid-column:1/-1;max-width:900px;margin:0 auto 1.25rem">
      <div class="cosmos-card-img" style="height:340px;${isImg?`background-image:url('${encodeURI(a.hdurl||a.url||'')}')`:''}">
        <span class="cosmos-card-tag floating"><i class="fas fa-camera"></i> صورة اليوم — ناسا</span>
        <span class="cosmos-card-time"><i class="far fa-calendar"></i> ${escapeHtml(a.date||'')}</span>
        ${!isImg && a.url ? `<iframe src="${encodeURI(a.url)}" style="width:100%;height:100%;border:none" allowfullscreen></iframe>` : ''}
      </div>
      <div class="cosmos-card-body">
        <h4>${escapeHtml(a.title||'')}</h4>
        <p>${escapeHtml((a.explanation||'').slice(0,420))}${(a.explanation||'').length>420?'…':''}</p>
        <p style="font-size:.75rem;color:#9ca3af;margin-top:.5rem"><i class="fas fa-circle-info"></i> المصدر: NASA Astronomy Picture of the Day (APOD)</p>
      </div>
    </article>`;
  }

  let _launchesCache = null, _launchesTime = 0;
  async function fetchUpcomingLaunches(){
    const TTL = 30 * 60 * 1000;
    if (_launchesCache && (Date.now() - _launchesTime) < TTL) return _launchesCache;
    const r = await fetch('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=list');
    if (!r.ok) throw new Error('launches fetch failed');
    const d = await r.json();
    _launchesCache = d.results || [];
    _launchesTime = Date.now();
    return _launchesCache;
  }

  function renderLaunchCards(launches){
    if (!launches || !launches.length) return '';
    return `<div class="cosmos-cards">${launches.map(l=>{
      const dt = l.net ? new Date(l.net) : null;
      const when = dt && !isNaN(dt) ? dt.toLocaleString('ar-EG', {dateStyle:'medium', timeStyle:'short'}) : '';
      return `<article class="cosmos-card">
        <div class="cosmos-card-img" style="background-image:url('${encodeURI((l.image)||'https://images.unsplash.com/photo-1517976547714-720226b864c1?w=900&q=70')}')">
          <span class="cosmos-card-tag floating"><i class="fas fa-rocket"></i> إطلاق قادم</span>
          <span class="cosmos-card-time"><i class="far fa-clock"></i> ${escapeHtml(when)}</span>
        </div>
        <div class="cosmos-card-body">
          <h4>${escapeHtml(l.name||'')}</h4>
          <p><strong>الوكالة:</strong> ${escapeHtml((l.launch_service_provider && l.launch_service_provider.name)||'—')}</p>
          <p><strong>الحالة:</strong> ${escapeHtml((l.status && l.status.name)||'—')}</p>
        </div>
      </article>`;
    }).join('')}</div>
    <p style="font-size:.78rem;color:#9ca3af;margin-top:.65rem;text-align:center"><i class="fas fa-circle-info"></i> المصدر: The Space Devs (Launch Library 2)</p>`;
  }

  // مصادر مقفولة / تحتاج login — نوجّه المستخدم لصفحة بحث بدلها
  const PAYWALLED_DOMAINS = ['x.com','twitter.com','nytimes.com','wsj.com','ft.com','bloomberg.com','theatlantic.com','wired.com'];
  function isBehindWall(url) {
    try { const h = new URL(url).hostname.replace('www.',''); return PAYWALLED_DOMAINS.some(d => h === d || h.endsWith('.'+d)); } catch(e){ return false; }
  }
  function safeNewsUrl(a) {
    const raw = a.url || '';
    if (!raw || raw === '#') return '#';
    if (isBehindWall(raw)) {
      // fallback: Google News search بعنوان الخبر
      return 'https://news.google.com/search?q=' + encodeURIComponent(a.title || 'space news') + '&hl=ar';
    }
    return raw;
  }

  function renderNewsCards(articles){
    if (!articles || !articles.length) {
      return '<div class="cosmos-empty"><i class="fas fa-satellite"></i><p>لا توجد أخبار متاحة حالياً، جرّب التحديث أو تأكد من الاتصال.</p></div>';
    }
    const fallback = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=70';
    const sourceColors = { nasa: '#fc3d21', esa: '#003087', spaceflight: '#ec4899', default: '#6366f1' };
    const sourceIcons  = { nasa: 'fa-meteor', esa: 'fa-satellite', default: 'fa-rss' };
    return `<div class="cosmos-cards cosmos-news-grid">${articles.map(a=>{
      const url     = safeNewsUrl(a);
      const isWall  = isBehindWall(a.url || '');
      const img     = a.image_url || fallback;
      const src     = a._source || 'spaceflight';
      const srcName = a._sourceName || a.news_site || 'Space News';
      const srcColor= sourceColors[src] || sourceColors.default;
      const srcIcon = sourceIcons[src]  || sourceIcons.default;
      const ago     = escapeHtml(timeAgo(a.published_at));
      return `
      <a class="cosmos-card cosmos-news-card" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="cosmos-card-img" style="background-image:url('${encodeURI(img)}')" onerror="this.style.backgroundImage='url(${fallback})'">
          <span class="cosmos-card-tag floating" style="background:${srcColor}"><i class="fas ${srcIcon}"></i> ${escapeHtml(srcName)}</span>
          <span class="cosmos-card-time"><i class="far fa-clock"></i> ${ago}</span>
          ${isWall ? '<span class="cosmos-wall-badge"><i class="fas fa-search"></i> بحث Google</span>' : ''}
        </div>
        <div class="cosmos-card-body">
          <h4 class="cosmos-news-title">${escapeHtml(a.title||'')}</h4>
          <p class="cosmos-news-summary">${escapeHtml((a.summary||'').slice(0, 200))}${(a.summary||'').length>200?'…':''}</p>
          <span class="cosmos-read-more"><i class="fas fa-up-right-from-square"></i> ${isWall ? 'بحث عن الخبر' : 'اقرأ من المصدر'}</span>
        </div>
      </a>`;
    }).join('')}</div>
    <p class="cosmos-news-footer"><i class="fas fa-circle-info"></i> Spaceflight News · NASA · ESA — تتجدد تلقائياً عند كل دخول</p>`;
  }

  window.openCosmosCategory = async function(key){
    const titleEl = document.getElementById('cosmosModalTitle');
    const body = document.getElementById('cosmosModalBody');
    const m = document.getElementById('cosmosModal');

    if (key === 'news') {
      titleEl.innerHTML = `<i class="fas fa-newspaper" style="color:#ec4899"></i> أخبار الكون — مباشرة`;
      body.innerHTML = `
        <div class="cosmos-modal-intro" style="background:rgba(236,72,153,.08);border:1px solid rgba(236,72,153,.35);display:flex;align-items:center;flex-wrap:wrap;gap:.75rem">
          <span style="display:flex;align-items:center;gap:.5rem;flex:1">
            <i class="fas fa-satellite-dish" style="color:#ec4899;font-size:1.1rem"></i>
            <strong style="color:#e2e8f0">أخبار الفضاء والفلك — مصادر عالمية موثوقة</strong>
          </span>
          <span style="font-size:.78rem;color:#9ca3af">NASA · SpaceX · ESA · Sky&amp;Tel · Universe Today</span>
          <button class="cosmos-refresh-btn" onclick="refreshLiveNews(event)"><i class="fas fa-rotate"></i> تحديث الآن</button>
          <span id="newsCountdown" style="margin-right:.5rem;font-size:.78rem;color:#a78bfa;display:inline-flex;align-items:center;gap:.3rem"><i class="far fa-clock"></i> آخر تحديث: <strong id="newsCountdownSec">—</strong></span>
        </div>
        <div id="newsReadingBar" style="margin-bottom:.75rem;background:rgba(255,255,255,.07);border-radius:12px;padding:.55rem .85rem;display:flex;align-items:center;gap:.75rem;border:1px solid rgba(236,72,153,.25)">
          <span id="newsReadingIcon" style="font-size:1rem">📖</span>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
              <span style="font-size:.75rem;color:#d1d5db" id="newsReadingLabel">اقرأ لمدة 10 ثواني لإكمال المهمة</span>
              <span style="font-size:.75rem;color:#ec4899;font-weight:700" id="newsReadingSec">10</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.1);border-radius:6px;overflow:hidden">
              <div id="newsReadingProgress" style="height:100%;width:0%;background:linear-gradient(90deg,#ec4899,#a855f7);border-radius:6px;transition:width .9s linear"></div>
            </div>
          </div>
        </div>
        <div id="newsSourceTabs" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
          <button class="cosmos-refresh-btn news-tab-btn active-tab" style="background:rgba(236,72,153,.25);border-color:rgba(236,72,153,.6);color:#f9a8d4" onclick="switchNewsTab('all',this)"><i class="fas fa-globe"></i> الكل</button>
          <button class="cosmos-refresh-btn news-tab-btn" onclick="switchNewsTab('spaceflight',this)"><i class="fas fa-rss"></i> Spaceflight News</button>
          <button class="cosmos-refresh-btn news-tab-btn" onclick="switchNewsTab('nasa',this)"><i class="fas fa-meteor"></i> NASA</button>
          <button class="cosmos-refresh-btn news-tab-btn" onclick="switchNewsTab('esa',this)"><i class="fas fa-satellite"></i> ESA</button>
        </div>
        <div id="cosmosNewsContainer">
          <div class="cosmos-loading"><div class="black-hole" style="width:80px;height:80px;margin:0 auto 1rem"><div class="accretion-disk"></div><div class="gravitational-lens"></div><div class="black-core"></div></div><p style="color:#aaa">جاري جلب آخر الأخبار من مصادرها الرسمية...</p></div>
        </div>`;
      m.classList.add('active');
      document.body.style.overflow = 'hidden';
      window._openCategoryKey = 'news';
      _startNewsCountdown();
      window._currentNewsTab = 'all';
      // ── مهمة "اقرأ خبر فضائي": المدة تزيد 10 ثواني كل يوم ──
      clearTimeout(window._newsQuestTimer);
      clearInterval(window._newsReadInterval);
      var _dqState = (function(){ try { return JSON.parse(localStorage.getItem('dq_v1')) || {}; } catch(e){ return {}; } })();
      var _totalDays = _dqState.totalDays || 1;
      var _newsReadSec = _totalDays * 10;
      var _newsReadTotal = _newsReadSec;
      // تحديث النص عشان يعكس المدة الفعلية
      var labelEl = document.getElementById('newsReadingLabel');
      var secEl = document.getElementById('newsReadingSec');
      if (labelEl) labelEl.textContent = 'اقرأ لمدة ' + _newsReadSec + ' ثانية لإكمال المهمة (اليوم ' + _totalDays + ')';
      if (secEl) secEl.textContent = _newsReadSec;
      // شغّل الـ progress bar
      setTimeout(function(){
        var bar = document.getElementById('newsReadingProgress');
        if (bar) bar.style.transitionDuration = _newsReadTotal + 's';
        if (bar) bar.style.width = '100%';
      }, 50);
      window._newsReadInterval = setInterval(function(){
        _newsReadSec--;
        var secEl2 = document.getElementById('newsReadingSec');
        var barEl = document.getElementById('newsReadingProgress');
        if (secEl2) secEl2.textContent = _newsReadSec > 0 ? _newsReadSec : '✓';
        if (_newsReadSec <= 0) {
          clearInterval(window._newsReadInterval);
          var barBox = document.getElementById('newsReadingBar');
          if (barBox) {
            barBox.style.background = 'rgba(16,185,129,.15)';
            barBox.style.borderColor = 'rgba(16,185,129,.5)';
          }
          var label2 = document.getElementById('newsReadingLabel');
          if (label2) label2.textContent = 'أحسنت! تم إكمال مهمة القراءة ✅';
          var icon = document.getElementById('newsReadingIcon');
          if (icon) icon.textContent = '🏅';
          if (barEl) barEl.style.background = 'linear-gradient(90deg,#10b981,#06b6d4)';
        }
      }, 1000);
      window._newsQuestTimer = setTimeout(function(){
        if (window._openCategoryKey === 'news')
          document.dispatchEvent(new Event('dqNewsSeen'));
      }, _newsReadTotal * 1000);
      try {
        const articles = await fetchLiveNews();
        document.getElementById('cosmosNewsContainer').innerHTML = renderNewsCards(articles);
        const ts = document.getElementById('newsCountdownSec');
        if (ts && _newsTime) ts.textContent = new Date(_newsTime).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
      } catch(e){
        console.error(e);
        document.getElementById('cosmosNewsContainer').innerHTML = '<div class="cosmos-empty"><i class="fas fa-triangle-exclamation"></i><p>تعذّر جلب الأخبار الآن. تحقق من الاتصال وحاول مرة أخرى.</p></div>';
      }
      return;
    }

    const cat = COSMOS_DATA[key]; if(!cat) return;

    // ── Header: اسم القسم + أيقونة + زرار تحديث
    titleEl.innerHTML = `<i class="fas ${cat.icon}" style="color:${cat.color}"></i> ${escapeHtml(cat.title)}`;

    const liveContainerId = `cosmosLive_${key}`;

    // ── Skeleton placeholders — تظهر فوراً قبل ما تيجي الأخبار
    const skeletonCards = [1,2,3,4,5,6].map(() => `
      <div class="cat-skeleton-card">
        <div class="cat-skeleton-img"></div>
        <div class="cat-skeleton-body">
          <div class="cat-skeleton-line w70"></div>
          <div class="cat-skeleton-line w90"></div>
          <div class="cat-skeleton-line w50"></div>
        </div>
      </div>`).join('');

    body.innerHTML = `
      <div class="cat-page-header" style="--cat-color:${cat.color}">
        <div class="cat-page-badge">
          <i class="fas ${cat.icon}"></i>
          <span>${escapeHtml(cat.title)}</span>
        </div>
        <p class="cat-page-intro">${escapeHtml(cat.intro)}</p>
        <div class="cat-page-meta">
          <span class="cat-source-pill"><i class="fas fa-satellite-dish"></i> NASA</span>
          <span class="cat-source-pill"><i class="fas fa-globe"></i> ESA</span>
          <span class="cat-source-pill"><i class="fas fa-rss"></i> Spaceflight News</span>
          <button class="cat-refresh-btn" onclick="refreshLiveCategory('${key}', event)">
            <i class="fas fa-rotate"></i> تحديث
          </button>
        </div>
      </div>
      <div id="${liveContainerId}" class="cat-live-container">
        <div class="cosmos-news-grid">${skeletonCards}</div>
      </div>`;

    window._openCategoryKey = key;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';

    loadLiveCategoryData(key, cat.color);
  };

  // كلمات مفتاحية لكل قسم لفلترة الأخبار
  const CATEGORY_KEYWORDS = {
    stars:      ['star','stellar','supernova','neutron','pulsar','sun','solar','نجم','شمس','مستعر'],
    planets:    ['planet','mars','venus','jupiter','saturn','mercury','uranus','neptune','exoplanet','كوكب','مريخ','مشتري','زحل'],
    galaxies:   ['galaxy','galaxies','milky way','andromeda','hubble','مجرة','درب التبانة'],
    blackholes: ['black hole','blackhole','event horizon','singularity','gravitational','ثقب أسود','جاذبية'],
    missions:   ['mission','launch','rocket','spacex','nasa mission','spacecraft','probe','مهمة','إطلاق','مركبة'],
    astronauts: ['astronaut','cosmonaut','crew','spacewalk','iss','station','رائد فضاء','محطة'],
    telescopes: ['telescope','observatory','hubble','webb','james webb','تلسكوب','مرصد'],
    phenomena:  ['meteor','eclipse','aurora','comet','asteroid','phenomenon','شهاب','كسوف','مذنب','كويكب','شفق'],
    universe:   ['universe','cosmos','big bang','dark matter','dark energy','cosmic','كون','كوزموس','طاقة مظلمة']
  };

  // مصطلح بحث مخصص لكل قسم في Spaceflight News API
  const CATEGORY_SEARCH_TERM = {
    stars:      'star OR stellar OR supernova OR pulsar OR neutron',
    planets:    'planet OR mars OR venus OR jupiter OR saturn OR exoplanet',
    galaxies:   'galaxy OR galaxies OR milky way OR andromeda',
    blackholes: 'black hole OR event horizon OR singularity',
    missions:   'mission OR launch OR rocket OR spacecraft OR probe',
    astronauts: 'astronaut OR cosmonaut OR crew OR spacewalk OR ISS',
    telescopes: 'telescope OR observatory OR Webb OR Hubble',
    phenomena:  'meteor OR eclipse OR aurora OR comet OR asteroid',
    universe:   'universe OR big bang OR dark matter OR dark energy OR cosmic'
  };

  // cache مستقل لكل قسم
  const _catNewsCache = {};
  const CAT_NEWS_TTL = 0; // تتجدد عند كل فتح

  async function fetchCategoryNews(key) {
    // cache مخصص لكل قسم
    const cached = _catNewsCache[key];
    if (cached && (Date.now() - cached.time) < CAT_NEWS_TTL) return cached.data;

    const keywords = CATEGORY_KEYWORDS[key];
    const searchTerm = CATEGORY_SEARCH_TERM[key];
    if (!keywords || !searchTerm) return [];

    const results = [];

    // جلب مباشر من Spaceflight News بـ search term مخصص لهذا القسم فقط
    try {
      const term = encodeURIComponent(searchTerm);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(
        `https://api.spaceflightnewsapi.net/v4/articles/?limit=30&ordering=-published_at&search=${term}`,
        { signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        (data.results || []).forEach(a => {
          results.push({ ...a, _source: 'spaceflight', _sourceName: a.news_site || 'Spaceflight News' });
        });
      }
    } catch(e) { console.warn('cat news fetch failed:', key, e.message); }

    // فلترة صارمة: الخبر لازم يحتوي كلمة مفتاحية خاصة بالقسم
    const lower = keywords.map(k => k.toLowerCase());
    const filtered = results.filter(a => {
      const txt = ((a.title || '') + ' ' + (a.summary || '')).toLowerCase();
      return lower.some(kw => txt.includes(kw));
    });

    // لو مفيش نتايج خالص بعد الفلترة، نعرض نتايج الـ API بدون فلترة (أحسن من مزج)
    const final = filtered.length > 0 ? filtered : results.slice(0, 9);

    // احفظ في cache القسم — مش في الـ cache العام
    _catNewsCache[key] = { data: final, time: Date.now() };
    return final;
  }

  async function loadLiveCategoryData(key, color){
    const container = document.getElementById(`cosmosLive_${key}`);
    if (!container) return;
    try {
      const cat = COSMOS_DATA[key];
      const parts = [];

      // ── 1: أخبار مخصصة للقسم — دايماً تتجدد
      const catNews = await fetchCategoryNews(key);
      if (catNews && catNews.length) {
        parts.push(renderNewsCards(catNews.slice(0, 12)));
      }

      // ── 2: محتوى إضافي حسب القسم
      if (key === 'universe') {
        try {
          const apod = await fetchAPOD();
          if (apod) parts.push(`<div class="cat-section-divider"><i class="fas fa-camera"></i> صورة اليوم — ناسا</div>` + renderAPODCard(apod));
        } catch(e){}
      } else if (key === 'missions') {
        try {
          const launches = await fetchUpcomingLaunches();
          if (launches && launches.length) parts.push(`<div class="cat-section-divider"><i class="fas fa-rocket"></i> إطلاقات قادمة</div>` + renderLaunchCards(launches));
        } catch(e){}
      }

      // ── 3: Wikipedia cards كمعلومات تكميلية
      if (WIKI_TITLES[key]) {
        const items = await fetchWikiCards(key);
        if (items.length) parts.push(`<div class="cat-section-divider"><i class="fas fa-book-open"></i> معلومات علمية</div>` + renderWikiCards(items, color));
      }

      if (parts.length) {
        container.innerHTML = parts.join('');
        // fade-in animation
        container.style.opacity = '0';
        requestAnimationFrame(() => {
          container.style.transition = 'opacity .4s ease';
          container.style.opacity = '1';
          setTimeout(() => { container.style.transition = ''; }, 500);
        });
      } else {
        container.innerHTML = `
          <div class="cosmos-empty">
            <i class="fas fa-satellite-dish" style="font-size:3rem;color:#6366f1;margin-bottom:1rem;display:block"></i>
            <p>لا توجد أخبار متاحة الآن لهذا القسم</p>
            <p style="font-size:.82rem;color:#666;margin-top:.5rem">تأكد من الاتصال بالإنترنت وحاول التحديث</p>
          </div>`;
      }
    } catch (e) {
      console.error('live category fetch failed', e);
      const container2 = document.getElementById(`cosmosLive_${key}`);
      if (container2) container2.innerHTML = `
        <div class="cosmos-empty">
          <i class="fas fa-triangle-exclamation" style="font-size:2.5rem;color:#f59e0b;margin-bottom:1rem;display:block"></i>
          <p>تعذّر جلب الأخبار — تأكد من الاتصال</p>
          <button class="cat-refresh-btn" style="margin-top:1rem" onclick="refreshLiveCategory('${key}',event)"><i class="fas fa-rotate"></i> إعادة المحاولة</button>
        </div>`;
    }
  }

  window.refreshLiveCategory = async function(key, ev){
    if (ev) ev.stopPropagation();
    delete _wikiCache[key];
    if (key === 'universe') { _apodCache = null; }
    else if (key === 'missions') { _launchesCache = null; }
    // مسح cache الأخبار الخاص بالقسم
    if (typeof _catNewsCache !== 'undefined') delete _catNewsCache[key];
    const c = document.getElementById(`cosmosLive_${key}`);
    if (c) c.innerHTML = '<div class="cosmos-loading"><div class="black-hole" style="width:60px;height:60px;margin:0 auto 1rem"><div class="accretion-disk"></div><div class="gravitational-lens"></div><div class="black-core"></div></div><p style="color:#aaa">جاري التحديث...</p></div>';
    const cat = COSMOS_DATA[key];
    await loadLiveCategoryData(key, cat ? cat.color : '#3b82f6');
  };

  window.refreshLiveNews = async function(ev){
    if (ev) ev.stopPropagation();
    _newsCache = null;
    _newsTime = 0;
    const c = document.getElementById('cosmosNewsContainer');
    if (c) c.innerHTML = '<div class="cosmos-loading"><div class="black-hole" style="width:80px;height:80px;margin:0 auto 1rem"><div class="accretion-disk"></div><div class="gravitational-lens"></div><div class="black-core"></div></div><p style="color:#aaa">جاري جلب أحدث الأخبار من المصادر الرسمية...</p></div>';
    try {
      const articles = await fetchLiveNews(true);
      const tab = window._currentNewsTab || 'all';
      const filtered = filterNewsBySource(articles, tab);
      if (c) c.innerHTML = renderNewsCards(filtered.length ? filtered : articles);
      const ts = document.getElementById('newsCountdownSec');
      if (ts && _newsTime) ts.textContent = new Date(_newsTime).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
    } catch(e){
      if (c) c.innerHTML = '<div class="cosmos-empty"><i class="fas fa-triangle-exclamation"></i><p>تعذّر التحديث الآن. تأكد من الاتصال.</p></div>';
    }
  };

  window._refreshAICategory = async function(key, color, containerId, ev) {
    if (ev) ev.stopPropagation();
    delete _aiContentCache[key];
    if (typeof window._loadAIContentForCategory === 'function') {
      await window._loadAIContentForCategory(key, color, containerId);
    }
  };

  window.openAdminChat = function(){
    if (typeof window.openChat === 'function') {
      window.openChat();
    } else {
      const btn = document.getElementById('chatBtn');
      if (btn) btn.click();
    }
  };

  window.closeCosmosModal = function(){
    window._openCategoryKey = null;
    clearTimeout(window._newsQuestTimer);
    clearInterval(window._newsReadInterval);
    const cm = document.getElementById('cosmosModal');
    if (!cm) return;
    // إغلاق فوري بدون تأخير
    cm.style.transition = 'opacity .15s ease';
    cm.style.opacity = '0';
    requestAnimationFrame(() => {
      cm.classList.remove('active');
      cm.style.opacity = '';
      cm.style.transition = '';
      document.body.style.overflow = '';
    });
  };

  window.scrollCosmosCarousel = function(dir){
    const el = document.getElementById('cosmosCarousel'); if(!el) return;
    const amount = 320 * dir;
    el.scrollBy({left: amount, behavior: 'smooth'});
  };

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      const m = document.getElementById('cosmosModal');
      if (m && m.classList.contains('active')) window.closeCosmosModal();
    }
  });
})();


/* ========================================== */


(function(){
  const PAC_COL = 'private_admin_chats';
  let pacUnsubMessages = null;
  let pacUnsubThreads = null;
  let pacUnsubBadge = null;
  let pacCurrentThreadUserId = null;
  let pacIsAdminView = false;

  function pacGetDb(){ return (typeof db !== 'undefined') ? db : (window.firebase && firebase.firestore ? firebase.firestore() : null); }
  function pacIsAdmin(){
    try { if (typeof isAdmin !== 'undefined' && isAdmin) return true; } catch(e){}
    if (window.isAdmin) return true;
    try { if (localStorage.getItem('falak_admin') === 'true') return true; } catch(e){}
    return false;
  }
  function pacUserId(){
    try { if (typeof currentUserId !== 'undefined' && currentUserId) return currentUserId; } catch(e){}
    try { if (typeof googleUser !== 'undefined' && googleUser && googleUser.uid) return googleUser.uid; } catch(e){}
    if (window.currentUserId) return window.currentUserId;
    if (window.googleUser && window.googleUser.uid) return window.googleUser.uid;
    try {
      if (firebase && firebase.auth) {
        const u = firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
      }
    } catch(e){}
    return null;
  }
  function pacUserName(){
    try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch(e){}
    try { if (typeof googleUser !== 'undefined' && googleUser && googleUser.displayName) return googleUser.displayName; } catch(e){}
    return window.currentUser || (window.googleUser && window.googleUser.displayName) || 'مستخدم';
  }
  function pacUserEmail(){
    try { if (typeof googleUser !== 'undefined' && googleUser && googleUser.email) return googleUser.email; } catch(e){}
    return (window.googleUser && window.googleUser.email) || '';
  }
  function pacUserPhone(){
    try { if (typeof currentUserPhone !== 'undefined' && currentUserPhone) return currentUserPhone; } catch(e){}
    return window.currentUserPhone || '';
  }

  function pacEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function pacFmtTime(ts){
    let d; if (!ts) return ''; if (ts.toDate) d = ts.toDate(); else if (ts instanceof Date) d = ts; else d = new Date(ts);
    if (isNaN(d)) return '';
    const diff = (Date.now() - d.getTime())/1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return 'منذ ' + Math.floor(diff/60) + 'د';
    if (diff < 86400) return 'منذ ' + Math.floor(diff/3600) + 'س';
    if (diff < 7*86400) return 'منذ ' + Math.floor(diff/86400) + 'ي';
    return d.toLocaleDateString('ar-EG', {year:'numeric', month:'short', day:'numeric'});
  }
  function pacFmtFull(ts){
    let d; if (!ts) return ''; if (ts.toDate) d = ts.toDate(); else if (ts instanceof Date) d = ts; else d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleString('ar-EG', {hour:'2-digit', minute:'2-digit', day:'numeric', month:'short'});
  }

  function pacInitials(name){
    const n = (name||'').trim(); if (!n) return '؟';
    const parts = n.split(/\s+/); return (parts[0][0] + (parts[1]?parts[1][0]:'')).toUpperCase();
  }

  function pacUnsubAll(){
    if (pacUnsubMessages) { try{pacUnsubMessages();}catch(e){} pacUnsubMessages = null; }
    if (pacUnsubThreads) { try{pacUnsubThreads();}catch(e){} pacUnsubThreads = null; }
  }

  window.openPrivateAdminChat = async function(){
    const modal = document.getElementById('privateAdminChatModal');
    const adminList = document.getElementById('pacAdminList');
    const chatView = document.getElementById('pacChatView');
    const loginNotice = document.getElementById('pacLoginNotice');
    const backBtn = document.getElementById('pacBackBtn');
    const subtitle = document.getElementById('pacSubtitle');
    const title = document.getElementById('pacTitle');
    const dbi = pacGetDb();

    pacUnsubAll();
    backBtn.style.display = 'none';
    pacCurrentThreadUserId = null;

    if (!dbi) { if (window.showToast) showToast('❌ قاعدة البيانات غير متاحة'); return; }

    if (pacIsAdmin()) {
      pacIsAdminView = true;
      title.innerHTML = '<i class="fas fa-inbox" style="color:#22c55e"></i> محادثات المستخدمين الخاصة';
      subtitle.textContent = 'هذه قائمة بالمحادثات الخاصة المرسلة إليكم من المستخدمين. اضغط على أي محادثة لفتحها.';
      adminList.style.display = 'flex';
      chatView.style.display = 'none';
      loginNotice.style.display = 'none';
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      pacListenAdminThreads();
      // تطبيق خلفية الدردشة الخاصة
      try { const _s = getChatBgSettings(); if (_s.private) { const _el = document.getElementById('pacMessages'); if (_el) _el.style.background = _s.private; } } catch(e){}
      return;
    }

    pacIsAdminView = false;
    const uid = pacUserId();
    if (!uid) {
      title.innerHTML = '<i class="fas fa-user-shield" style="color:#22c55e"></i> تواصل خاص مع المشرفين';
      subtitle.textContent = 'محادثتك خاصة تماماً، لا يراها أي مستخدم آخر — فقط أنت والمشرفون.';
      adminList.style.display = 'none';
      chatView.style.display = 'none';
      loginNotice.style.display = 'block';
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      return;
    }

    title.innerHTML = '<i class="fas fa-user-shield" style="color:#22c55e"></i> تواصل خاص مع المشرفين';
    subtitle.textContent = 'محادثتك خاصة تماماً، لا يراها أي مستخدم آخر — فقط أنت والمشرفون.';
    adminList.style.display = 'none';
    chatView.style.display = 'flex';
    loginNotice.style.display = 'none';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    // تطبيق خلفية الدردشة الخاصة
    setTimeout(() => { try { const _s = getChatBgSettings(); if (_s.private) { const _el = document.getElementById('pacMessages'); if (_el) _el.style.background = _s.private; } } catch(e){} }, 100);

    try {
      await dbi.collection(PAC_COL).doc(uid).set({
        userName: pacUserName(),
        userEmail: pacUserEmail(),
        userPhone: pacUserPhone(),
        unreadByUser: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch(e){ console.warn('pac thread upsert failed', e); }

    pacOpenThread(uid);
  };

  window.closePrivateAdminChat = function(){
    pacUnsubAll();
    pacCurrentThreadUserId = null;
    document.getElementById('privateAdminChatModal').classList.remove('active');
    document.body.style.overflow = '';
  };

  window.pacAdminSendAsUser = function(){
    const uid = pacUserId();
    if (!uid) { if (window.showToast) showToast('❌ سجّل دخولك بحساب جوجل أولاً'); return; }
    pacIsAdminView = false;
    document.getElementById('pacAdminList').style.display = 'none';
    document.getElementById('pacChatView').style.display = 'flex';
    document.getElementById('pacBackBtn').style.display = 'flex';
    document.getElementById('pacTitle').innerHTML = '<i class="fas fa-pen" style="color:#22c55e"></i> إرسال رسالة للمشرفين';
    document.getElementById('pacSubtitle').textContent = 'أنت ترسل كمستخدم. أي مشرف آخر سيستلم رسالتك في صندوق الوارد الخاص.';
    const dbi = pacGetDb();
    if (dbi) {
      dbi.collection(PAC_COL).doc(uid).set({
        userName: pacUserName(),
        userEmail: pacUserEmail(),
        userPhone: pacUserPhone(),
        unreadByUser: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(()=>{});
    }
    pacOpenThread(uid);
  };

  window.pacTriggerGoogleLogin = async function(){
    try {
      if (typeof googleLogin === 'function') {
        window.closePrivateAdminChat();
        await googleLogin();
        setTimeout(()=>{ try { window.openPrivateAdminChat(); } catch(e){} }, 600);
        return;
      }
      const btn = document.getElementById('googleSignInBtn');
      if (btn) { window.closePrivateAdminChat(); btn.click(); }
    } catch(e){ console.error('pac google login failed', e); if (window.showToast) showToast('❌ فشل تسجيل الدخول'); }
  };

  window.pacBackToList = function(){
    if (!pacIsAdminView) { window.closePrivateAdminChat(); return; }
    if (pacUnsubMessages) { try{pacUnsubMessages();}catch(e){} pacUnsubMessages = null; }
    pacCurrentThreadUserId = null;
    document.getElementById('pacBackBtn').style.display = 'none';
    document.getElementById('pacAdminList').style.display = 'flex';
    document.getElementById('pacChatView').style.display = 'none';
    document.getElementById('pacTitle').innerHTML = '<i class="fas fa-inbox" style="color:#22c55e"></i> محادثات المستخدمين الخاصة';
    document.getElementById('pacSubtitle').textContent = 'هذه قائمة بالمحادثات الخاصة المرسلة إليكم من المستخدمين.';
  };

  function pacListenAdminThreads(){
    const dbi = pacGetDb(); if (!dbi) return;
    const cont = document.getElementById('pacAdminThreads');
    cont.innerHTML = '<div class="pac-empty-list"><i class="fas fa-spinner fa-spin"></i><p>جاري تحميل المحادثات...</p></div>';
    pacUnsubThreads = dbi.collection(PAC_COL).orderBy('lastMessageTime','desc').onSnapshot(snap => {
      if (snap.empty) {
        cont.innerHTML = '<div class="pac-empty-list"><i class="fas fa-inbox"></i><p>لا توجد محادثات خاصة حتى الآن.</p></div>';
        return;
      }
      const items = [];
      snap.forEach(doc => { items.push({ id: doc.id, ...doc.data() }); });
      cont.innerHTML = items.map(t => {
        const unread = (t.unreadByAdmin || 0);
        return `
          <div class="pac-thread" onclick="pacAdminOpenThread('${pacEsc(t.id)}', ${JSON.stringify(t.userName||'مستخدم').replace(/"/g,'&quot;')})">
            <div class="pac-thread-avatar">${pacEsc(pacInitials(t.userName))}</div>
            <div class="pac-thread-info">
              <div class="pac-thread-name">${pacEsc(t.userName||'مستخدم')} ${t.userEmail?`<span style="font-weight:500;color:#9ca3af;font-size:.78rem">· ${pacEsc(t.userEmail)}</span>`:''}</div>
              <div class="pac-thread-preview">${pacEsc((t.lastMessage||'لا توجد رسائل بعد').slice(0,90))}</div>
            </div>
            <div class="pac-thread-meta">
              <span class="pac-thread-time">${pacEsc(pacFmtTime(t.lastMessageTime))}</span>
              ${unread>0?`<span class="pac-thread-unread">${unread}</span>`:''}
            </div>
          </div>`;
      }).join('');
    }, err => { console.error('pac threads snap err', err); cont.innerHTML = '<div class="pac-empty-list"><i class="fas fa-triangle-exclamation"></i><p>خطأ في تحميل المحادثات.</p></div>'; });
  }

  window.pacAdminOpenThread = function(userId, userName){
    pacCurrentThreadUserId = userId;
    document.getElementById('pacAdminList').style.display = 'none';
    document.getElementById('pacChatView').style.display = 'flex';
    document.getElementById('pacBackBtn').style.display = 'flex';
    document.getElementById('pacTitle').innerHTML = `<i class="fas fa-user-circle" style="color:#22c55e"></i> ${pacEsc(userName||'مستخدم')}`;
    document.getElementById('pacSubtitle').textContent = 'محادثة خاصة — ردّ المشرف يصل للمستخدم فقط.';
    pacOpenThread(userId);
    const dbi = pacGetDb();
    if (dbi) { dbi.collection(PAC_COL).doc(userId).set({ unreadByAdmin: 0 }, { merge: true }).catch(()=>{}); }
  };

  function pacOpenThread(threadUserId){
    pacCurrentThreadUserId = threadUserId;
    const dbi = pacGetDb(); if (!dbi) return;
    const msgsEl = document.getElementById('pacMessages');
    msgsEl.innerHTML = '<div class="pac-empty"><i class="fas fa-spinner fa-spin"></i><p>جاري التحميل...</p></div>';

    if (pacUnsubMessages) { try{pacUnsubMessages();}catch(e){} pacUnsubMessages = null; }

    pacUnsubMessages = dbi.collection(PAC_COL).doc(threadUserId).collection('messages').orderBy('timestamp','asc').onSnapshot(snap => {
      if (snap.empty) {
        msgsEl.innerHTML = `<div class="pac-empty"><i class="fas fa-comments"></i><h4>ابدأ المحادثة</h4><p>${pacIsAdminView?'لم يرسل هذا المستخدم أي رسالة بعد.':'اكتب رسالتك أدناه — سيردّ عليك المشرفون قريباً.'}</p></div>`;
        return;
      }
      const me = pacIsAdminView ? 'admin' : 'user';
      const html = [];
      snap.forEach(doc => {
        const m = doc.data();
        if (m.sender === 'system') {
          html.push(`<div class="pac-msg system">${pacEsc(m.text||'')}</div>`);
        } else {
          const mine = m.sender === me;
          const cls = mine ? 'me' : 'them';
          const senderName = m.senderName || (m.sender==='admin' ? 'مشرف' : 'مستخدم');
          const senderIcon = m.sender==='admin' ? 'fa-user-shield' : 'fa-user';
          const canDelete = pacIsAdminView ? true : mine;
          const deleteBtn = canDelete ? `<button class="pac-msg-delete" title="حذف الرسالة" aria-label="حذف الرسالة" onclick="event.stopPropagation(); pacDeleteMessage('${doc.id}', ${mine ? 'true' : 'false'})"><i class="fas fa-trash"></i></button>` : '';
          html.push(`
            <div class="pac-msg ${cls}" data-msg-id="${doc.id}">
              <div class="pac-msg-meta"><i class="fas ${senderIcon}"></i> ${pacEsc(senderName)} ${deleteBtn}</div>
              <div class="pac-msg-text">${pacEsc(m.text||'')}</div>
              <span class="pac-msg-time">${pacEsc(pacFmtFull(m.timestamp))}</span>
            </div>`);
        }
      });
      msgsEl.innerHTML = html.join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;

      try {
        const upd = pacIsAdminView ? { unreadByAdmin: 0 } : { unreadByUser: 0 };
        dbi.collection(PAC_COL).doc(threadUserId).set(upd, { merge: true });
      } catch(e){}
    }, err => { console.error('pac msgs snap err', err); msgsEl.innerHTML = '<div class="pac-empty"><i class="fas fa-triangle-exclamation"></i><p>تعذّر تحميل الرسائل.</p></div>'; });
  }

  window.pacInputKeydown = function(ev){
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); window.pacSendMessage(); }
  };
window.pacSendMessage = async function(){
  const input = document.getElementById('pacInput');
  const text = (input.value || '').trim();
  if (!text) return;
  const dbi = pacGetDb(); if (!dbi) return;
  const threadId = pacCurrentThreadUserId;
  if (!threadId) { if (window.showToast) showToast('❌ لم يتم اختيار محادثة'); return; }
  const sender = pacIsAdminView ? 'admin' : 'user';
  const senderName = pacIsAdminView ? 'المشرف' : pacUserName();
  input.value = '';
  input.style.height = 'auto';
  try {
    await dbi.collection(PAC_COL).doc(threadId).collection('messages').add({
      text, sender, senderName,
      senderId: currentUserId,   // ✅ هذا هو التعديل الوحيد
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    const meta = {
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      lastSender: sender
    };
    if (pacIsAdminView) {
      meta.unreadByUser = firebase.firestore.FieldValue.increment(1);
      meta.unreadByAdmin = 0;
    } else {
      meta.unreadByAdmin = firebase.firestore.FieldValue.increment(1);
      meta.unreadByUser = 0;
      meta.userName = pacUserName();
      meta.userEmail = pacUserEmail();
      meta.userPhone = pacUserPhone();
    }
    await dbi.collection(PAC_COL).doc(threadId).set(meta, { merge: true });
    if (window.SoundEffects && SoundEffects.success) try{SoundEffects.success();}catch(e){}
  } catch(e){
    console.error('pac send err', e);
    let msg = '❌ فشل إرسال الرسالة';
    const code = (e && (e.code || e.message)) || '';
    if (/permission|denied|insufficient/i.test(code)) {
      msg = '❌ صلاحيات Firestore لا تسمح بإرسال الرسالة. أضف القاعدة المناسبة في Firebase Console → Firestore → Rules.';
      alert(msg);
    } else if (/network|offline|unavailable/i.test(code)) {
      msg = '❌ تحقق من اتصال الإنترنت';
    }
    if (window.showToast) showToast(msg.split('\n')[0]);
    input.value = text;
  }
};
  window.pacAdminClearAllThreads = async function(){
    if (!pacIsAdmin()) { if (window.showToast) showToast('❌ صلاحيات المشرف فقط'); return; }
    const dbi = pacGetDb();
    if (!dbi) { if (window.showToast) showToast('❌ قاعدة البيانات غير متاحة'); return; }
    if (!confirm('هل أنت متأكد من حذف جميع المحادثات الخاصة نهائياً؟\n\nسيتم مسح كل المحادثات والرسائل من جميع المستخدمين، ولا يمكن التراجع عن هذا الإجراء.')) return;
    const btn = document.getElementById('pacClearAllBtn');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المسح...'; }
    try {
      const threadsSnap = await dbi.collection(PAC_COL).get();
      let total = 0;
      for (const threadDoc of threadsSnap.docs) {
        try {
          const msgsSnap = await threadDoc.ref.collection('messages').get();
          if (!msgsSnap.empty) {
            const msgs = msgsSnap.docs;
            for (let i = 0; i < msgs.length; i += 400) {
              const batch = dbi.batch();
              msgs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
          await threadDoc.ref.delete();
          total++;
        } catch (e) { console.warn('clear thread failed', threadDoc.id, e); }
      }
      if (window.showToast) showToast('🗑️ تم مسح ' + total + ' محادثة بنجاح');
    } catch(e) {
      console.error('pac clear all err', e);
      let msg = '❌ فشل المسح';
      const code = (e && (e.code || e.message)) || '';
      if (/permission|denied|insufficient/i.test(code)) {
        msg = '❌ صلاحيات Firestore لا تسمح بالحذف. تأكد من قواعد private_admin_chats.';
      }
      if (window.showToast) showToast(msg);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
    }
  };

  window.pacDeleteMessage = async function(msgId, isMine){
    if (!msgId) return;
    const dbi = pacGetDb(); if (!dbi) { if (window.showToast) showToast('❌ تعذر الاتصال بقاعدة البيانات'); return; }
    const threadId = pacCurrentThreadUserId;
    if (!threadId) { if (window.showToast) showToast('❌ لم يتم اختيار محادثة'); return; }
    if (!pacIsAdminView && !isMine) { if (window.showToast) showToast('❌ لا يمكنك حذف رسائل الآخرين'); return; }
    if (!confirm('هل تريد حذف هذه الرسالة نهائياً؟')) return;
    try {
      await dbi.collection(PAC_COL).doc(threadId).collection('messages').doc(msgId).delete();
      if (window.SoundEffects && SoundEffects.delete) try{SoundEffects.delete();}catch(e){}
      if (window.showToast) showToast('🗑️ تم حذف الرسالة');
    } catch(e) {
      console.error('pac delete err', e);
      let msg = '❌ فشل حذف الرسالة';
      const code = (e && (e.code || e.message)) || '';
      if (/permission|denied|insufficient/i.test(code)) {
        msg = '❌ صلاحيات Firestore لا تسمح بالحذف. تأكد من قواعد private_admin_chats.';
      }
      if (window.showToast) showToast(msg);
    }
  };

  // Auto-grow composer
  document.addEventListener('input', function(e){
    if (e.target && e.target.id === 'pacInput') {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
  });

  // Unread badge on the carousel pill
  function pacStartBadgeWatcher(){
    const dbi = pacGetDb(); if (!dbi) return;
    if (pacUnsubBadge) { try{pacUnsubBadge();}catch(e){} pacUnsubBadge = null; }
    const badge = document.getElementById('privateAdminChatBadge');
    if (!badge) return;

    if (pacIsAdmin()) {
      pacUnsubBadge = dbi.collection(PAC_COL).onSnapshot(snap => {
        let total = 0;
        snap.forEach(d => { total += (d.data().unreadByAdmin || 0); });
        if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.style.display = 'inline-flex'; }
        else { badge.style.display = 'none'; }
      }, err => { console.warn('pac badge admin err', err); });
    } else {
      const uid = pacUserId(); if (!uid) { badge.style.display = 'none'; return; }
      pacUnsubBadge = dbi.collection(PAC_COL).doc(uid).onSnapshot(d => {
        const n = (d.data() || {}).unreadByUser || 0;
        if (n > 0) { badge.textContent = n > 99 ? '99+' : n; badge.style.display = 'inline-flex'; }
        else { badge.style.display = 'none'; }
      }, err => { console.warn('pac badge user err', err); });
    }
  }

  // Re-arm badge watcher whenever auth/admin state likely changed
  let _pacBadgeInterval = setInterval(pacStartBadgeWatcher, 5000);
  document.addEventListener('DOMContentLoaded', () => setTimeout(pacStartBadgeWatcher, 2000));
  setTimeout(pacStartBadgeWatcher, 3500);


  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      const m = document.getElementById('privateAdminChatModal');
      if (m && m.classList.contains('active')) window.closePrivateAdminChat();
    }
  });
})();


/* ========================================== */


// ===== Hamburger Sections Menu =====
function toggleSectionsMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('sectionsMenu');
  const btn  = document.getElementById('sectionsDropdownBtn');
  if (menu) menu.classList.toggle('active');
  if (btn)  btn.classList.toggle('open');
}
function closeSectionsMenu() {
  const menu = document.getElementById('sectionsMenu');
  const btn  = document.getElementById('sectionsDropdownBtn');
  if (menu) menu.classList.remove('active');
  if (btn)  btn.classList.remove('open');
}
document.addEventListener('click', function(e) {
  const dd = document.getElementById('sectionsDropdown');
  const menu = document.getElementById('sectionsMenu');
  const btn  = document.getElementById('sectionsDropdownBtn');
  if (dd && menu && !dd.contains(e.target)) {
    menu.classList.remove('active');
    if (btn) btn.classList.remove('open');
  }
});
function scrollToSectionAndOpen(cat) {
  // scroll to cosmos section then open category
  const sec = document.getElementById('cosmosCarouselSection');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => {
    if (typeof openCosmosCategory === 'function') openCosmosCategory(cat);
  }, 300);
}
window.addAdminByUid = window.addAdminByUid || (typeof addAdminByUid !== 'undefined' ? addAdminByUid : function(){});

// ===== Group Chat Admin Panel =====
function openGroupChatAdminPanel() {
  const modal = document.getElementById('groupChatAdminModal');
  if (!modal) return;
  modal.classList.add('active');
  renderGroupChatAdminPanel();
}
function closeGroupChatAdminPanel() {
  const modal = document.getElementById('groupChatAdminModal');
  if (modal) modal.classList.remove('active');
}

async function renderGroupChatAdminPanel() {
  const content = document.getElementById('gcAdminContent');
  if (!content) return;

  // First user to open this becomes super admin automatically if no super_admin exists
  const currentUid = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null;
  const currentEmail = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : null;

  if (!currentUid) {
    content.innerHTML = '<p style="color:#aaa;text-align:center;padding:2rem"><i class="fas fa-lock"></i> يجب تسجيل الدخول أولاً</p>';
    return;
  }

  content.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#aaa"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

  try {
    // Check if current user is admin
    const isCurrentAdmin = (typeof isAdmin !== 'undefined' && isAdmin) || (typeof isSuperAdmin !== 'undefined' && isSuperAdmin);

    // Check if there's any super admin in group chat admins
    const db2 = (typeof db !== 'undefined') ? db : null;
    if (!db2) { content.innerHTML = '<p style="color:#ef4444;text-align:center">❌ لا يوجد اتصال</p>'; return; }

    const gcAdminsSnap = await db2.collection('group_chat_admins').get();
    const gcAdmins = [];
    gcAdminsSnap.forEach(d => gcAdmins.push({ id: d.id, ...d.data() }));

    // If no gc admin exists at all, first person who opens becomes super admin
    if (gcAdmins.length === 0) {
      await db2.collection('group_chat_admins').doc(currentUid).set({
        uid: currentUid,
        email: currentEmail || '',
        name: (typeof currentUser !== 'undefined' && currentUser) || 'مشرف',
        role: 'super_admin',
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        addedBy: 'bootstrap'
      });
      gcAdmins.push({ id: currentUid, uid: currentUid, email: currentEmail, role: 'super_admin' });
      if (typeof SoundEffects !== 'undefined') SoundEffects.success();
      if (typeof showToast === 'function') showToast('🎉 أنت الآن مشرف رئيسي في المحادثة الجماعية');
    }

    const myGcAdmin = gcAdmins.find(a => a.uid === currentUid);
    const isSuperGcAdmin = myGcAdmin && myGcAdmin.role === 'super_admin';
    const isGcAdmin = !!myGcAdmin;

    // Build UI
    let html = '';

    // Show current user's role
    if (isGcAdmin) {
      const roleTxt = isSuperGcAdmin ? '🌟 مشرف رئيسي' : '🛡️ مشرف';
      html += `<div style="background:linear-gradient(135deg,rgba(34,197,94,.15),rgba(16,185,129,.1));border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:.85rem 1rem;margin-bottom:1.25rem;color:#86efac;font-size:.9rem;display:flex;align-items:center;gap:.5rem"><i class="fas fa-user-shield"></i> أنت مسجّل كـ <strong>${roleTxt}</strong> في المحادثة الجماعية</div>`;
    }

    // List of gc admins
    html += `<h4 style="color:#c4b5fd;margin-bottom:.75rem;font-size:.95rem"><i class="fas fa-users-cog"></i> مشرفو المحادثة الجماعية (${gcAdmins.length})</h4>`;
    html += `<div style="max-height:220px;overflow-y:auto;margin-bottom:1.25rem;border:1px solid rgba(255,255,255,.06);border-radius:12px;overflow:hidden">`;
    gcAdmins.forEach(a => {
      const isMe = a.uid === currentUid;
      const roleLabel = a.role === 'super_admin'
        ? '<span style="background:rgba(168,85,247,.2);color:#c4b5fd;padding:.15rem .5rem;border-radius:6px;font-size:.72rem">مشرف رئيسي</span>'
        : '<span style="background:rgba(59,130,246,.2);color:#93c5fd;padding:.15rem .5rem;border-radius:6px;font-size:.72rem">مشرف</span>';
      const deleteBtn = (isSuperGcAdmin && !isMe)
        ? `<button onclick="removeGcAdmin('${a.uid}')" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#ef4444;width:34px;height:34px;border-radius:8px;cursor:pointer;flex-shrink:0"><i class="fas fa-trash"></i></button>`
        : '';
      html += `<div style="display:flex;align-items:center;gap:.6rem;padding:.6rem .85rem;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.04)">
        <div style="flex:1;min-width:0">
          <div style="color:#fff;font-size:.88rem">${a.name || a.email || a.uid}${isMe?' <span style="color:#86efac;font-size:.72rem">(أنت)</span>':''}</div>
          <div style="margin-top:.25rem">${roleLabel}</div>
        </div>
        ${deleteBtn}
      </div>`;
    });
    html += '</div>';

    // Add new gc admin (super admin only)
    if (isSuperGcAdmin) {
      html += `<h4 style="color:#c4b5fd;margin-bottom:.6rem;font-size:.9rem"><i class="fas fa-user-plus"></i> إضافة مشرف جديد للمحادثة</h4>`;
      html += `<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
        <input id="gcNewAdminUid" placeholder="أدخل UID المستخدم" style="flex:1;min-width:180px;padding:.75rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:Cairo;font-size:.9rem;direction:ltr">
        <select id="gcNewAdminRole" style="padding:.75rem;background:rgba(20,20,30,.95);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:Cairo">
          <option value="admin">مشرف</option>
          <option value="super_admin">مشرف رئيسي</option>
        </select>
        <button onclick="addGcAdmin()" class="btn btn-success" style="padding:.75rem 1rem"><i class="fas fa-plus"></i> أضف</button>
      </div>
      <p style="font-size:.78rem;color:#888;margin-top:.5rem"><i class="fas fa-info-circle"></i> الـ UID هو معرّف المستخدم في Firebase (يمكن للمستخدم إيجاده في ملفه الشخصي)</p>`;
    }

    content.innerHTML = html;
  } catch(e) {
    console.error(e);
    content.innerHTML = `<p style="color:#ef4444;text-align:center;padding:1rem">❌ خطأ: ${e.message}</p>`;
  }
}

async function loadGcMembers() {
  const container = document.getElementById('gcMembersList');
  if (!container) return;
  const db2 = (typeof db !== 'undefined') ? db : null;
  if (!db2) return;
  try {
    // Get online users as "members" in the group chat
    const snap = await db2.collection('online_users').get();
    if (snap.empty) { container.innerHTML = '<p style="color:#888;text-align:center;padding:1rem">لا يوجد أعضاء متصلون حالياً</p>'; return; }
    let html = '';
    snap.forEach(d => {
      const data = d.data();
      const uid = d.id;
      html += `<div style="display:flex;align-items:center;gap:.6rem;padding:.55rem .85rem;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.04);border-radius:8px;margin-bottom:.3rem">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#ec4899);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0">${(data.name||'?').charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="color:#fff;font-size:.85rem">${data.name || 'مجهول'}</div>
          <div style="color:#888;font-size:.72rem;direction:ltr">${uid.substring(0,12)}...</div>
        </div>
        <button onclick="removeFromGroupChat('${uid}','${(data.name||'').replace(/'/g,"\\'")}'); this.closest('div[style]').remove();" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#ef4444;padding:.3rem .65rem;border-radius:8px;cursor:pointer;font-size:.78rem"><i class="fas fa-user-minus"></i> إزالة</button>
      </div>`;
    });
    container.innerHTML = html || '<p style="color:#888;text-align:center;padding:1rem">لا يوجد أعضاء</p>';
  } catch(e) {
    container.innerHTML = '<p style="color:#ef4444;padding:1rem">❌ فشل التحميل</p>';
  }
}

async function removeFromGroupChat(uid, name) {
  if (!confirm('إزالة ' + (name||uid) + ' من المحادثة؟')) return;
  const db2 = (typeof db !== 'undefined') ? db : null;
  if (!db2) return;
  try {
    await db2.collection('online_users').doc(uid).delete();
    if (typeof showToast === 'function') showToast('🗑️ تمت إزالة العضو من المحادثة');
  } catch(e) { if (typeof showToast === 'function') showToast('❌ فشل الإزالة'); }
}

async function addGcAdmin() {
  // المشرف الرئيسي فقط يقدر يضيف مشرفين
  const isCurrentSuperAdmin = (typeof isSuperAdmin !== 'undefined' && isSuperAdmin);
  if (!isCurrentSuperAdmin) {
    if (typeof showToast === 'function') showToast('❌ المشرف الرئيسي فقط يمكنه إضافة مشرفين');
    return;
  }
  const uidInp = document.getElementById('gcNewAdminUid');
  const roleInp = document.getElementById('gcNewAdminRole');
  const uid = uidInp ? uidInp.value.trim() : '';
  const role = roleInp ? roleInp.value : 'admin';
  if (!uid || uid.length < 5) { if (typeof showToast === 'function') showToast('❌ أدخل UID صالح'); return; }
  const db2 = (typeof db !== 'undefined') ? db : null;
  if (!db2) return;
  try {
    const ex = await db2.collection('group_chat_admins').doc(uid).get();
    if (ex.exists) { if (typeof showToast === 'function') showToast('⚠️ هذا المستخدم مضاف بالفعل'); return; }
    await db2.collection('group_chat_admins').doc(uid).set({
      uid, role,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
      addedBy: (auth && auth.currentUser) ? auth.currentUser.uid : 'unknown'
    });
    if (uidInp) uidInp.value = '';
    if (typeof SoundEffects !== 'undefined') SoundEffects.success();
    if (typeof showToast === 'function') showToast('✅ تمت إضافة المشرف للمحادثة');
    renderGroupChatAdminPanel();
  } catch(e) { if (typeof showToast === 'function') showToast('❌ فشل الإضافة'); }
}

async function removeGcAdmin(uid) {
  if (!uid) return;
  if (!confirm('حذف هذا المشرف من إدارة المحادثة؟')) return;
  const db2 = (typeof db !== 'undefined') ? db : null;
  if (!db2) return;
  try {
    await db2.collection('group_chat_admins').doc(uid).delete();
    if (typeof SoundEffects !== 'undefined') SoundEffects.delete();
    if (typeof showToast === 'function') showToast('🗑️ تم الحذف');
    renderGroupChatAdminPanel();
  } catch(e) { if (typeof showToast === 'function') showToast('❌ فشل الحذف'); }
}

// Close gc admin modal on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const m = document.getElementById('groupChatAdminModal');
    if (m && m.classList.contains('active')) closeGroupChatAdminPanel();
  }
});

// Expose
window.openGroupChatAdminPanel = openGroupChatAdminPanel;
window.closeGroupChatAdminPanel = closeGroupChatAdminPanel;
window.addGcAdmin = addGcAdmin;
window.removeGcAdmin = removeGcAdmin;
window.removeFromGroupChat = removeFromGroupChat;
window.toggleSectionsMenu = toggleSectionsMenu;
window.closeSectionsMenu = closeSectionsMenu;
window.scrollToSectionAndOpen = scrollToSectionAndOpen;

// ===== صوت زر المحادثة الجماعية =====
window.playChatSound = function() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // نغمة "تاك" خفيفة ومميزة
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch(e) {}
};


/* ========================================== */

// ── وظائف Panel الأدوات ──
window.toggleDrawTools = function() {
  const panel = document.getElementById('dbToolsPanel');
  const btn = document.getElementById('dbToggleToolsBtn');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  if (btn) btn.classList.toggle('open', !isOpen);
};

window.switchDrawTab = function(tab, el) {
  document.querySelectorAll('.db-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.db-tab-content').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('dbTab-' + tab);
  if (content) content.classList.add('active');
};

window.updateActiveToolLabel = function(label) {
  const el = document.getElementById('dbActiveTool');
  if (el) el.textContent = label;
  // إغلاق الـ panel بعد اختيار الأداة
  const panel = document.getElementById('dbToolsPanel');
  const btn = document.getElementById('dbToggleToolsBtn');
  if (panel) panel.classList.remove('open');
  if (btn) btn.classList.remove('open');
};

// ============================
// 1. DRAWING BOARD - ENHANCED (FIXED)
// ============================
(function() {
  let drawState = { tool: 'pen', color: '#ff4d6d', fill: 'transparent', width: 3, opacity: 1 };
  let drawHistory = [], drawRedo = [];
  let isDrawing = false, startX, startY, snapshot;
  let currentPath = [];

  // ── select / move state ──
  let selectMode = false;
  let selX = 0, selY = 0, selW = 0, selH = 0;
  let isDraggingSelect = false, selectSnapshot = null, selectImgData = null;
  let dragOffX = 0, dragOffY = 0;

  function getCanvas() { return document.getElementById('drawingCanvas'); }
  function getCtx() { const c = getCanvas(); return c ? c.getContext('2d') : null; }

  // ===== ضبط الأداة =====
  window.setDrawTool = function(tool) {
    drawState.tool = tool;
    document.querySelectorAll('.db-btn[data-tool]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.db-btn[data-tool="${tool}"]`).forEach(b => b.classList.add('active'));
    const canvas = getCanvas();
    if (canvas) {
      canvas.style.cursor =
        tool === 'eraser'  ? 'cell' :
        tool === 'select'  ? 'move' :
        (tool === 'text' || tool === 'textbox' || tool === 'stickyNote') ? 'text' : 'crosshair';
    }
    // إخفاء select box عند تغيير الأداة
    if (tool !== 'select') {
      const box = document.getElementById('dbSelectBox');
      if (box) box.style.display = 'none';
    }
  };

  window.setDrawColor = function(v) {
    drawState.color = v;
    const sw = document.getElementById('drawColorSwatch');
    if (sw) sw.style.background = v;
  };
  window.setDrawFill = function(v) {
    drawState.fill = v;
    const sw = document.getElementById('drawFillSwatch');
    if (sw) sw.style.background = v;
  };
  window.setDrawWidth = function(v) {
    drawState.width = parseInt(v) || 3;
    const el = document.getElementById('drawWidthVal');
    if (el) el.textContent = v;
  };
  window.setDrawOpacity = function(v) {
    drawState.opacity = parseFloat(v) || 1;
    const el = document.getElementById('drawOpacityVal');
    if (el) el.textContent = Math.round(parseFloat(v) * 100) + '%';
  };

  // ===== Undo / Redo =====
  window.undoDraw = function() {
    const ctx = getCtx(), canvas = getCanvas();
    if (!ctx || drawHistory.length === 0) { if (typeof showToast==='function') showToast('⚠️ لا يوجد شيء للتراجع عنه'); return; }
    drawRedo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(drawHistory.pop(), 0, 0);
  };
  window.redoDraw = function() {
    const ctx = getCtx(), canvas = getCanvas();
    if (!ctx || drawRedo.length === 0) { if (typeof showToast==='function') showToast('⚠️ لا يوجد شيء للإعادة'); return; }
    drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(drawRedo.pop(), 0, 0);
  };

  // ===== حفظ كصورة (يعمل على موبايل) =====
  window.saveDrawingAsImage = function() {
    const canvas = getCanvas(); if (!canvas) return;
    try {
      // طريقة 1: link download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'astronomy-drawing-' + Date.now() + '.png';
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (typeof showToast==='function') showToast('✅ تم تحميل الرسم');
    } catch(e) {
      if (typeof showToast==='function') showToast('⚠️ افتح الصورة في تبويب جديد للحفظ');
      try { window.open(canvas.toDataURL('image/png'), '_blank'); } catch(_) {}
    }
  };

  // ===== نسخ للـ Clipboard =====
  window.copyDrawingToClipboard = async function() {
    const canvas = getCanvas(); if (!canvas) return;
    // طريقة 1: Clipboard API الحديثة
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await new Promise((resolve, reject) => {
          canvas.toBlob(async (blob) => {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              if (typeof showToast==='function') showToast('✅ تم نسخ الرسم للحافظة');
              resolve();
            } catch(e) { reject(e); }
          }, 'image/png');
        });
        return;
      } catch(e) { /* fallback */ }
    }
    // طريقة 2: فتح في تبويب جديد (موبايل)
    try {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write('<img src="' + canvas.toDataURL() + '" style="max-width:100%">');
        win.document.title = 'Astronomy Drawing';
        if (typeof showToast==='function') showToast('📋 افتح الصورة في التبويب الجديد واحفظها');
      }
    } catch(e) {
      if (typeof showToast==='function') showToast('⚠️ يرجى استخدام زر التحميل');
    }
  };

  // ===== مسح الكل =====
  window.clearDrawing = function() {
    const ctx = getCtx(), canvas = getCanvas();
    if (!ctx) return;
    // حفظ في التاريخ قبل المسح
    drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (drawHistory.length > 50) drawHistory.shift();
    drawRedo = [];
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const hint = document.getElementById('drawingEmptyHint');
    if (hint) hint.classList.remove('hidden');
  };

  // ===== التهيئة الرئيسية =====
  function initEnhancedDrawing() {
    const canvas = getCanvas(); if (!canvas) return;
    // إزالة listeners قديمة باستخدام clone
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    const c = newCanvas;
    const ctx = c.getContext('2d');

    // ضبط حجم الـ canvas
    function resizeCanvas() {
      const wrap = document.getElementById('drawingCanvasWrap');
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      // حفظ المحتوى الحالي
      let saved = null;
      if (c.width > 0 && c.height > 0) {
        try { saved = ctx.getImageData(0, 0, c.width, c.height); } catch(_) {}
      }
      c.width = Math.floor(rect.width);
      c.height = Math.floor(rect.height);
      ctx.fillStyle = '#fdfdfd';
      ctx.fillRect(0, 0, c.width, c.height);
      if (saved) { try { ctx.putImageData(saved, 0, 0); } catch(_) {} }
    }
    resizeCanvas();
    try {
      const ro = new ResizeObserver(resizeCanvas);
      ro.observe(document.getElementById('drawingCanvasWrap'));
    } catch(_) {}

    function saveSnapshot() {
      drawHistory.push(ctx.getImageData(0, 0, c.width, c.height));
      if (drawHistory.length > 50) drawHistory.shift();
      drawRedo = [];
    }

    function getPos(e) {
      const r = c.getBoundingClientRect();
      const sx = c.width / r.width;
      const sy = c.height / r.height;
      const src = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
    }

    function applyCtxStyle() {
      ctx.globalAlpha = drawState.opacity;
      ctx.strokeStyle = drawState.color;
      ctx.lineWidth = drawState.tool === 'brush' ? drawState.width * 3 :
                      drawState.tool === 'marker' ? drawState.width * 2 :
                      drawState.tool === 'eraser' ? drawState.width * 4 : drawState.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (drawState.tool === 'marker') ctx.globalAlpha = Math.min(drawState.opacity * 0.55, 0.55);
      if (drawState.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function drawShapePreview(tool, x0, y0, x1, y1) {
      ctx.beginPath();
      const w = x1 - x0, h = y1 - y0;
      const cx = x0 + w / 2, cy = y0 + h / 2;
      const r = Math.sqrt(w * w + h * h) / 2;

      if (tool === 'line') {
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);

      } else if (tool === 'rect') {
        ctx.rect(x0, y0, w, h);

      } else if (tool === 'circle') {
        ctx.arc(cx, cy, r, 0, Math.PI * 2);

      } else if (tool === 'arrow') {
        const ang = Math.atan2(h, w);
        const len = Math.sqrt(w * w + h * h);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        const aLen = Math.min(len * 0.3, 30);
        ctx.lineTo(x1 - aLen * Math.cos(ang - 0.4), y1 - aLen * Math.sin(ang - 0.4));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - aLen * Math.cos(ang + 0.4), y1 - aLen * Math.sin(ang + 0.4));

      } else if (tool === 'arrow2') {
        // سهم مزدوج
        const ang = Math.atan2(h, w);
        const len = Math.sqrt(w * w + h * h);
        const aLen = Math.min(len * 0.25, 25);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        // رأس اليمين
        ctx.lineTo(x1 - aLen * Math.cos(ang - 0.4), y1 - aLen * Math.sin(ang - 0.4));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - aLen * Math.cos(ang + 0.4), y1 - aLen * Math.sin(ang + 0.4));
        // رأس اليسار
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + aLen * Math.cos(ang - 0.4 + Math.PI), y0 + aLen * Math.sin(ang - 0.4 + Math.PI));
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + aLen * Math.cos(ang + 0.4 + Math.PI), y0 + aLen * Math.sin(ang + 0.4 + Math.PI));

      } else if (tool === 'triangle') {
        ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();

      } else if (tool === 'star') {
        const outerR = r, innerR = r * 0.45;
        const points = 5;
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const rr = i % 2 === 0 ? outerR : innerR;
          const px = cx + rr * Math.cos(angle);
          const py = cy + rr * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();

      } else if (tool === 'heart') {
        const s = r * 0.9;
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 1.4, cy - s * 1.0, cx, cy - s * 0.4);
        ctx.bezierCurveTo(cx + s * 1.4, cy - s * 1.0, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.6);

      } else if (tool === 'diamond') {
        ctx.moveTo(cx, y0);
        ctx.lineTo(x1, cy);
        ctx.lineTo(cx, y1);
        ctx.lineTo(x0, cy);
        ctx.closePath();

      } else if (tool === 'pentagon') {
        const sides = 5;
        for (let i = 0; i < sides; i++) {
          const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();

      } else if (tool === 'stickyNote') {
        // مستطيل مع ظل
        ctx.rect(x0, y0, w, h);
      }
    }

    function startDraw(e) {
      e.preventDefault();
      const pos = getPos(e);
      startX = pos.x; startY = pos.y;

      // ── أداة التحريك / Select ──
      if (drawState.tool === 'select') {
        // هل الضغط داخل الـ selection الحالية؟
        if (selW > 0 && selH > 0 &&
            pos.x >= selX && pos.x <= selX + selW &&
            pos.y >= selY && pos.y <= selY + selH) {
          // ابدأ سحب
          isDraggingSelect = true;
          dragOffX = pos.x - selX;
          dragOffY = pos.y - selY;
          // احفظ المنطقة المحددة
          selectImgData = ctx.getImageData(selX, selY, selW, selH);
          // امسح من الـ canvas
          ctx.clearRect(selX, selY, selW, selH);
          ctx.fillStyle = '#fdfdfd';
          ctx.fillRect(selX, selY, selW, selH);
        } else {
          // ابدأ تحديد جديد
          isDraggingSelect = false;
          selectImgData = null;
          selX = pos.x; selY = pos.y; selW = 0; selH = 0;
          isDrawing = true;
          saveSnapshot();
          snapshot = ctx.getImageData(0, 0, c.width, c.height);
        }
        updateSelectBox();
        return;
      }

      // أداة النص
      if (drawState.tool === 'text' || drawState.tool === 'textbox') {
        const existing = document.getElementById('__drawTextInput');
        if (existing) existing.remove();
        const wrap = document.getElementById('drawingCanvasWrap');
        const inp = document.createElement('input');
        inp.id = '__drawTextInput';
        inp.type = 'text';
        inp.placeholder = 'اكتب ثم Enter أو Esc للإلغاء';
        const wrapRect = wrap ? wrap.getBoundingClientRect() : c.getBoundingClientRect();
        const xPx = startX / (c.width / wrapRect.width);
        const yPx = startY / (c.height / wrapRect.height) - 20;
        Object.assign(inp.style, {
          position: 'absolute',
          left: Math.min(xPx, wrapRect.width - 180) + 'px',
          top: Math.max(0, yPx) + 'px',
          zIndex: '9999',
          background: 'rgba(15,10,26,.97)',
          border: '2px solid ' + drawState.color,
          borderRadius: '8px',
          color: drawState.color,
          fontFamily: 'Cairo, sans-serif',
          fontSize: Math.max(12, drawState.width * 4 + 10) + 'px',
          padding: '4px 10px',
          minWidth: '150px',
          maxWidth: (wrapRect.width - xPx - 10) + 'px',
          outline: 'none',
          direction: 'rtl',
          boxShadow: '0 4px 20px rgba(0,0,0,.6)'
        });
        if (wrap) { wrap.style.position = 'relative'; wrap.appendChild(inp); }
        else document.body.appendChild(inp);
        requestAnimationFrame(() => inp.focus());
        const commit = () => {
          const txt = inp.value.trim();
          inp.remove();
          if (!txt) return;
          saveSnapshot();
          ctx.globalAlpha = drawState.opacity;
          ctx.globalCompositeOperation = 'source-over';
          ctx.font = `bold ${Math.max(12, drawState.width * 4 + 10)}px Cairo`;
          ctx.fillStyle = drawState.color;
          ctx.fillText(txt, startX, startY);
          ctx.globalAlpha = 1;
          const hint = document.getElementById('drawingEmptyHint');
          if (hint) hint.classList.add('hidden');
        };
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
          else if (ev.key === 'Escape') inp.remove();
        });
        inp.addEventListener('blur', commit);
        return;
      }

      saveSnapshot();
      snapshot = ctx.getImageData(0, 0, c.width, c.height);
      isDrawing = true;

      if (['pen','brush','marker','eraser'].includes(drawState.tool)) {
        applyCtxStyle();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
      }
      const hint = document.getElementById('drawingEmptyHint');
      if (hint) hint.classList.add('hidden');
    }

    function doDraw(e) {
      if (!isDrawing && !isDraggingSelect) return;
      e.preventDefault();
      const pos = getPos(e);

      // ── سحب الـ selection ──
      if (isDraggingSelect && selectImgData) {
        const newX = Math.round(pos.x - dragOffX);
        const newY = Math.round(pos.y - dragOffY);
        ctx.putImageData(snapshot || ctx.getImageData(0,0,c.width,c.height), 0, 0);
        ctx.putImageData(selectImgData, newX, newY);
        selX = newX; selY = newY;
        updateSelectBox();
        return;
      }

      // ── رسم selection box ──
      if (drawState.tool === 'select' && isDrawing) {
        selX = Math.min(startX, pos.x);
        selY = Math.min(startY, pos.y);
        selW = Math.abs(pos.x - startX);
        selH = Math.abs(pos.y - startY);
        updateSelectBox();
        return;
      }

      if (['pen','brush','marker','eraser'].includes(drawState.tool)) {
        applyCtxStyle();
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else {
        // أشكال: رسم preview
        ctx.putImageData(snapshot, 0, 0);
        applyCtxStyle();
        ctx.globalCompositeOperation = 'source-over';
        drawShapePreview(drawState.tool, startX, startY, pos.x, pos.y);
        ctx.stroke();
        if (drawState.fill && drawState.fill !== '#00000000' && drawState.tool !== 'line' && drawState.tool !== 'arrow') {
          ctx.fillStyle = drawState.fill;
          ctx.globalAlpha = drawState.opacity * 0.5;
          ctx.fill();
          ctx.globalAlpha = drawState.opacity;
        }
      }
    }

    function endDraw(e) {
      if (!isDrawing && !isDraggingSelect) return;

      if (isDraggingSelect) {
        isDraggingSelect = false;
        saveSnapshot();
        snapshot = ctx.getImageData(0, 0, c.width, c.height);
        return;
      }

      if (drawState.tool === 'select') {
        isDrawing = false;
        return;
      }

      isDrawing = false;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function updateSelectBox() {
      const box = document.getElementById('dbSelectBox');
      if (!box) return;
      const wrap = document.getElementById('drawingCanvasWrap');
      if (!wrap) return;
      const wRect = wrap.getBoundingClientRect();
      const scaleX = wRect.width / c.width;
      const scaleY = wRect.height / c.height;
      if (selW < 2 || selH < 2) { box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.style.left = (selX * scaleX) + 'px';
      box.style.top  = (selY * scaleY) + 'px';
      box.style.width  = (selW * scaleX) + 'px';
      box.style.height = (selH * scaleY) + 'px';
    }

    c.addEventListener('mousedown', startDraw);
    c.addEventListener('mousemove', doDraw);
    c.addEventListener('mouseup', endDraw);
    c.addEventListener('mouseleave', endDraw);
    c.addEventListener('touchstart', startDraw, { passive: false });
    c.addEventListener('touchmove', doDraw, { passive: false });
    c.addEventListener('touchend', endDraw);
    c.addEventListener('touchcancel', endDraw);
  }

  // تعريض initEnhancedDrawing للـ window حتى يمكن استدعاؤها من playVideo
  window.initEnhancedDrawing = initEnhancedDrawing;

  // تهيئة فورية عند تشغيل السكريبت (الـ DOM جاهز لأن السكريبت في آخر الصفحة)
  setTimeout(initEnhancedDrawing, 300);

  // تهيئة عند فتح مودال الفيديو عبر MutationObserver
  const vm = document.getElementById('videoModal');
  if (vm) {
    new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.target.classList.contains('active')) {
          setTimeout(initEnhancedDrawing, 300);
        }
      });
    }).observe(vm, { attributes: true, attributeFilter: ['class'] });
  }
})();

// ============================
// 2. AI CHAT - MUTE PER MESSAGE
// ============================
(function() {
  let aiIsMuted = false;
  // المتغير ده بيتتبع النص اللي بيتقرأ دلوقتي
  let _currentSpeakingBtn = null;

  function stopAllSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (_currentSpeakingBtn) {
      _currentSpeakingBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      _currentSpeakingBtn.classList.remove('muted');
      _currentSpeakingBtn = null;
    }
    // أوقف Groq/ElevenLabs TTS برضو
    if (typeof window.stopAllAISpeech === 'function') window.stopAllAISpeech();
  }

  // زرار الكتم/التشغيل العام في الـ header
  window.toggleAIMute = function() {
    aiIsMuted = !aiIsMuted;
    const btn = document.getElementById('aiGlobalMuteBtn');
    if (btn) {
      btn.innerHTML = aiIsMuted
        ? '<i class="fas fa-volume-mute"></i>'
        : '<i class="fas fa-volume-up"></i>';
      btn.style.color = aiIsMuted ? '#ef4444' : '#10b981';
      btn.title = aiIsMuted ? 'تشغيل الصوت' : 'كتم الصوت';
    }
    if (aiIsMuted) {
      stopAllSpeech();
      showToast('🔇 تم كتم الصوت');
    } else {
      showToast('🔊 تم تشغيل الصوت');
    }
  };

  // زرار الصوت على كل رسالة من الـ AI
  window.addAIMuteButton = function(msgEl, text) {
    if (!text || !text.trim()) return;
    const btn = document.createElement('button');
    btn.className = 'ai-msg-mute-btn';
    btn.title = 'اقرأ الرسالة';
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';

    btn.onclick = function(e) {
      e.stopPropagation();

      // لو الصوت مكتوم عالمياً
      if (aiIsMuted) {
        showToast('🔇 الصوت مكتوم — اضغط زرار الصوت في الأعلى لتشغيله');
        return;
      }

      const synth = window.speechSynthesis;
      if (!synth) { showToast('⚠️ الصوت غير مدعوم في هذا المتصفح'); return; }

      // لو الزرار ده نفسه بيقرأ → وقّف
      if (_currentSpeakingBtn === btn) {
        stopAllSpeech();
        return;
      }

      // وقّف أي قراءة تانية
      stopAllSpeech();

      // ابدأ القراءة
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'ar-SA';
      utt.rate = 0.9;
      utt.pitch = 1;

      utt.onstart = function() {
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        btn.classList.add('muted');
        btn.title = 'إيقاف القراءة';
        _currentSpeakingBtn = btn;
      };

      utt.onend = function() {
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
        btn.classList.remove('muted');
        btn.title = 'اقرأ الرسالة';
        if (_currentSpeakingBtn === btn) _currentSpeakingBtn = null;
      };

      utt.onerror = function() {
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
        btn.classList.remove('muted');
        if (_currentSpeakingBtn === btn) _currentSpeakingBtn = null;
      };

      synth.speak(utt);
    };

    msgEl.style.position = 'relative';
    msgEl.appendChild(btn);
  };

  // Watch for AI messages being added and attach mute button
  const aiMsgs = document.getElementById('aiChatMessages');
  if (aiMsgs) {
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList.contains('received')) {
            const txt = node.querySelector('.message-content');
            if (txt && !node.querySelector('.ai-msg-mute-btn')) {
              window.addAIMuteButton && window.addAIMuteButton(node, txt.textContent);
            }
          }
        });
      });
    });
    obs.observe(aiMsgs, { childList: true });
  }

  // Voice Input (mic in AI chat → transcribe to text box)
  let aiVoiceRecognition = null;
  window.toggleAIVoiceInput = function() {
    const btn = document.getElementById('aiVoiceInputBtn');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showToast('⚠️ التعرف على الصوت غير مدعوم');
      return;
    }
    if (aiVoiceRecognition) {
      try { aiVoiceRecognition.stop(); } catch(e) {}
      aiVoiceRecognition = null;
      if (btn) { btn.style.color = ''; btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    aiVoiceRecognition = new SR();
    aiVoiceRecognition.lang = 'ar-SA';
    aiVoiceRecognition.continuous = false;
    aiVoiceRecognition.onstart = () => { if (btn) { btn.style.color = '#ef4444'; btn.innerHTML = '<i class="fas fa-stop"></i>'; } };
    aiVoiceRecognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const inp = document.getElementById('aiChatInput');
      if (inp) inp.value = (inp.value + ' ' + text).trim();
    };
    aiVoiceRecognition.onend = () => {
      aiVoiceRecognition = null;
      if (btn) { btn.style.color = ''; btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
    };
    aiVoiceRecognition.onerror = () => {
      aiVoiceRecognition = null;
      if (btn) { btn.style.color = ''; btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
    };
    aiVoiceRecognition.start();
  };

  // Open/close AI voice chat modal
  window.openAIVoiceChat = function() {
    const m = document.getElementById('aiVoiceChatModal');
    if (m) m.classList.add('active');
  };
  window.closeAIVoiceChat = function() {
    const m = document.getElementById('aiVoiceChatModal');
    if (m) m.classList.remove('active');
    if (aiVoiceRecognition) { try { aiVoiceRecognition.stop(); } catch(e){} aiVoiceRecognition = null; }
  };

  // AI Voice Chat Modal - record and send to AI
  let aiVoiceActive = false;
  window.toggleAIVoiceRecord = function() {
    aiVoiceActive = !aiVoiceActive;
    const btn = document.getElementById('aiVoiceRecordBtn');
    const icon = document.getElementById('aiVoiceRecordIcon');
    const status = document.getElementById('aiVoiceStatus');
    const listening = document.getElementById('aiVoiceListening');
    const avatar = document.getElementById('aiVoiceAvatar');
    const transcript = document.getElementById('aiVoiceTranscript');

    if (aiVoiceActive) {
      if (btn) { btn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)'; btn.style.boxShadow = '0 0 30px rgba(239,68,68,.6)'; }
      if (icon) icon.className = 'fas fa-stop';
      if (status) status.textContent = 'جاري الاستماع...';
      if (listening) listening.style.display = 'block';
      if (avatar) avatar.style.animation = 'pulse 0.5s infinite';

      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('⚠️ غير مدعوم'); aiVoiceActive = false; return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      aiVoiceRecognition = new SR();
      aiVoiceRecognition.lang = 'ar-SA';
      aiVoiceRecognition.continuous = false;
      aiVoiceRecognition.onresult = async (ev) => {
        const text = ev.results[0][0].transcript;
        if (transcript) transcript.innerHTML += `<p style="color:#e2e8f0;margin-bottom:.4rem;text-align:right">🧑 ${text}</p>`;
        if (status) status.textContent = 'الذكاء الاصطناعي يفكر...';
        // أوقف الاستماع أثناء رد الـ AI
        aiVoiceActive = false;
        try { aiVoiceRecognition.stop(); } catch(e){}
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + (typeof getAiApiKey==='function'?getAiApiKey():''), 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role:'system', content:'أنت مساعد فلكي. أجب بالعربية بشكل مختصر وواضح.' }, { role:'user', content:text }], max_tokens: 400, temperature: 0.3 })
          });
          const data = await res.json();
          const answer = (data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content)||'عذراً، حدث خطأ.';
          if (transcript) { transcript.innerHTML += `<p style="color:#06b6d4;margin-bottom:.4rem;text-align:right">🤖 ${answer}</p>`; transcript.scrollTop = transcript.scrollHeight; }
          if (!aiIsMuted && window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(answer);
            u.lang='ar-SA'; u.rate=0.9;
            // ابدأ الاستماع تاني بس لما يخلص الكلام
            u.onend = () => {
              if (status) status.textContent = 'اضغط للتحدث';
              aiVoiceActive = true;
              try { aiVoiceRecognition.start(); } catch(e){}
            };
            window.speechSynthesis.speak(u);
          } else {
            if (status) status.textContent = 'اضغط للتحدث';
            aiVoiceActive = true;
            try { aiVoiceRecognition.start(); } catch(e){}
          }
        } catch(err) {
          if (transcript) transcript.innerHTML += `<p style="color:#ef4444;margin-bottom:.4rem">❌ فشل الاتصال</p>`;
          if (status) status.textContent = 'فشل - حاول مرة أخرى';
          aiVoiceActive = true;
          try { aiVoiceRecognition.start(); } catch(e){}
        }
      };
      aiVoiceRecognition.onend = () => { /* لا تعيد التشغيل تلقائياً — بيتحكم فيه onresult */ };
      aiVoiceRecognition.onerror = (e) => { if (e.error !== 'aborted') { if (status) status.textContent = 'خطأ: ' + e.error; } };
      aiVoiceRecognition.start();
    } else {
      if (btn) { btn.style.background = 'linear-gradient(135deg,#06b6d4,#0891b2)'; btn.style.boxShadow = '0 8px 25px rgba(6,182,212,.4)'; }
      if (icon) icon.className = 'fas fa-microphone';
      if (status) status.textContent = 'اضغط على الميكروفون للتحدث';
      if (listening) listening.style.display = 'none';
      if (avatar) avatar.style.animation = 'glow 3s infinite';
      if (aiVoiceRecognition) { try { aiVoiceRecognition.stop(); } catch(e){} aiVoiceRecognition = null; }
    }
  };
})();

// ============================
// 3. MESSAGE SECURITY FILTER
// ============================
(function() {
  const DANGEROUS_PATTERNS = [
    /<script[\s\S]*?>/i, /javascript:/i, /on\w+\s*=/i,
    /data:text\/html/i, /vbscript:/i, /eval\s*\(/i,
    /document\.cookie/i, /window\.location/i, /innerHTML\s*=/i,
    /fetch\s*\(/i, /XMLHttpRequest/i, /\.exe\b/i, /\.bat\b/i,
    /rm\s+-rf/i, /DROP\s+TABLE/i, /SELECT\s+\*/i
  ];

  window.secureValidateMessage = function(text) {
    if (!text || typeof text !== 'string') return { valid: false, error: 'رسالة فارغة' };
    const trimmed = text.trim();
    if (trimmed.length === 0) return { valid: false, error: 'رسالة فارغة' };
    if (trimmed.length > 2000) return { valid: false, error: '⚠️ الرسالة طويلة جداً (الحد 2000 حرف)' };
    for (const pat of DANGEROUS_PATTERNS) {
      if (pat.test(trimmed)) {
        console.warn('Blocked dangerous content:', pat);
        return { valid: false, error: '🚫 تم رفض الرسالة - تحتوي على محتوى غير مسموح به' };
      }
    }
    const clean = trimmed.replace(/[<>]/g, '').trim();
    return { valid: true, sanitized: clean };
  };

  // Patch all send functions to validate
  function patchSendFn(fnName) {
    const orig = window[fnName];
    if (typeof orig !== 'function') return;
    window[fnName] = function(...args) {
      // كل دالة بتستخدم الـ input الخاص بها
      const inputId = fnName === 'sendAIMessage' ? 'aiChatInput' : 'messageInput';
      const inputEl = document.getElementById(inputId);
      if (inputEl) {
        const v = window.secureValidateMessage(inputEl.value);
        if (!v.valid) {
          if (typeof showToast === 'function') showToast(v.error);
          return;
        }
      }
      return orig.apply(this, args);
    };
  }
  setTimeout(() => {
    ['sendAIMessage'].forEach(patchSendFn);
  }, 2000);

  // Realtime input monitoring
  document.addEventListener('input', function(e) {
    const el = e.target;
    if (!el || !['messageInput','aiChatInput','zoomChatInput'].includes(el.id)) return;
    for (const pat of DANGEROUS_PATTERNS) {
      if (pat.test(el.value)) {
        el.style.borderColor = '#ef4444';
        el.style.boxShadow = '0 0 0 2px rgba(239,68,68,.3)';
        const tip = document.createElement('div');
        tip.style.cssText = 'color:#ef4444;font-size:.75rem;margin-top:.25rem;position:absolute';
        tip.textContent = '⚠️ محتوى غير مسموح';
        setTimeout(() => tip.remove(), 2000);
        el.parentNode?.appendChild(tip);
        return;
      }
    }
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, true);
})();

// ============================
// 4. ZOOM VIDEO CONFERENCE
// ============================
(function() {
  let zoomLocalStream = null, zoomPeers = {}, zoomMicOn = true, zoomCameraOn = true;
  let zoomTimerInterval = null, zoomSeconds = 0, zoomIsRecording = false;
  let zoomSidebarOpen = false, zoomSidebarTab = 'chat', zoomChatCount = 0;
  let zoomHandRaised = false, zoomFullscreen = false;
  const zoomParticipants = new Map();

  window.openZoom = async function(title) {
    const m = document.getElementById('zoomModal');
    if (!m) return;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('zoomSessionTitle').textContent = title || 'محاضرة مباشرة';
    document.getElementById('zoomLocalName').textContent = (typeof currentUser !== 'undefined' ? currentUser : 'أنت') || 'أنت';
    
    // Start timer
    zoomSeconds = 0;
    clearInterval(zoomTimerInterval);
    zoomTimerInterval = setInterval(() => {
      zoomSeconds++;
      const h = Math.floor(zoomSeconds/3600).toString().padStart(2,'0');
      const min = Math.floor((zoomSeconds%3600)/60).toString().padStart(2,'0');
      const s = (zoomSeconds%60).toString().padStart(2,'0');
      const t = document.getElementById('zoomTimer');
      if (t) t.textContent = zoomSeconds >= 3600 ? `${h}:${min}:${s}` : `${min}:${s}`;
    }, 1000);

    // Get media
    try {
      zoomLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const vid = document.getElementById('zoomLocalVideo');
      if (vid) { vid.srcObject = zoomLocalStream; vid.play().catch(()=>{}); }
      document.getElementById('zoomHostBadge').style.display = 
        (typeof isAdmin !== 'undefined' && isAdmin) ? 'inline' : 'none';
    } catch(e) {
      console.warn('Camera/mic access denied', e);
      if (typeof showToast === 'function') showToast('⚠️ لم يتم الوصول للكاميرا/الميكروفون');
    }

    updateParticipantCount();
  };

  window.closeZoom = function() {
    if (typeof showToast === 'function') showToast('هل تريد إنهاء المحاضرة؟');
  };

  window.endZoomCall = function() {
    const m = document.getElementById('zoomModal');
    if (m) m.classList.remove('active');
    document.body.style.overflow = '';
    clearInterval(zoomTimerInterval);
    if (zoomLocalStream) { zoomLocalStream.getTracks().forEach(t => t.stop()); zoomLocalStream = null; }
    const vid = document.getElementById('zoomLocalVideo');
    if (vid) { vid.srcObject = null; }
    zoomMicOn = true; zoomCameraOn = true;
  };

  window.toggleZoomMic = function() {
    zoomMicOn = !zoomMicOn;
    if (zoomLocalStream) {
      zoomLocalStream.getAudioTracks().forEach(t => t.enabled = zoomMicOn);
    }
    const btn = document.getElementById('zoomMicBtn');
    const icon = document.getElementById('zoomMicIcon');
    if (btn) btn.classList.toggle('muted', !zoomMicOn);
    if (icon) icon.className = zoomMicOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  };

  window.toggleZoomCamera = function() {
    zoomCameraOn = !zoomCameraOn;
    if (zoomLocalStream) {
      zoomLocalStream.getVideoTracks().forEach(t => t.enabled = zoomCameraOn);
    }
    const btn = document.getElementById('zoomCameraBtn');
    const icon = document.getElementById('zoomCameraIcon');
    if (btn) btn.classList.toggle('muted', !zoomCameraOn);
    if (icon) icon.className = zoomCameraOn ? 'fas fa-video' : 'fas fa-video-slash';
    const vid = document.getElementById('zoomLocalVideo');
    if (vid) vid.style.opacity = zoomCameraOn ? '1' : '0.3';
  };

  window.toggleZoomSidebar = function(tab) {
    const sidebar = document.getElementById('zoomSidebar');
    if (!sidebar) return;
    if (zoomSidebarOpen && zoomSidebarTab === tab) {
      sidebar.style.width = '0';
      zoomSidebarOpen = false;
    } else {
      sidebar.style.width = '280px';
      zoomSidebarOpen = true;
      zoomSidebarTab = tab;
      switchZoomTab(tab);
    }
    if (tab === 'chat') zoomChatCount = 0;
    const badge = document.getElementById('zoomChatBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  };

  window.switchZoomTab = function(tab) {
    zoomSidebarTab = tab;
    const chatPanel = document.getElementById('zoomChatPanel');
    const partPanel = document.getElementById('zoomParticipantsPanel');
    const tabChat = document.getElementById('zoomTabChat');
    const tabPart = document.getElementById('zoomTabPart');
    if (chatPanel) chatPanel.style.display = tab === 'chat' ? 'flex' : 'none';
    if (partPanel) partPanel.style.display = tab === 'participants' ? 'block' : 'none';
    if (tabChat) { tabChat.style.background = tab === 'chat' ? 'rgba(99,102,241,.2)' : 'transparent'; tabChat.style.color = tab === 'chat' ? '#fff' : '#aaa'; }
    if (tabPart) { tabPart.style.background = tab === 'participants' ? 'rgba(99,102,241,.2)' : 'transparent'; tabPart.style.color = tab === 'participants' ? '#fff' : '#aaa'; }
    if (tab === 'participants') renderZoomParticipants();
  };

  window.sendZoomChat = function() {
    const inp = document.getElementById('zoomChatInput');
    if (!inp || !inp.value.trim()) return;
    const v = window.secureValidateMessage ? window.secureValidateMessage(inp.value) : { valid: true, sanitized: inp.value };
    if (!v.valid) { if (typeof showToast === 'function') showToast(v.error); return; }
    const msgs = document.getElementById('zoomChatMessages');
    if (msgs) {
      const name = (typeof currentUser !== 'undefined' ? currentUser : '') || 'أنت';
      const div = document.createElement('div');
      div.style.cssText = 'padding:.4rem .6rem;background:rgba(99,102,241,.15);border-radius:8px;margin-bottom:.25rem';
      div.innerHTML = `<span style="color:#a5b4fc;font-size:.75rem;font-weight:700">${name}</span><br><span style="font-size:.85rem">${v.sanitized}</span>`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }
    inp.value = '';
  };

  window.zoomRecord = function() {
    zoomIsRecording = !zoomIsRecording;
    const btn = document.getElementById('zoomRecordBtn');
    if (btn) {
      btn.innerHTML = zoomIsRecording 
        ? '<i class="fas fa-square"></i> إيقاف التسجيل' 
        : '<i class="fas fa-circle"></i> تسجيل';
      btn.style.background = zoomIsRecording ? 'rgba(239,68,68,.4)' : 'rgba(239,68,68,.15)';
    }
    if (typeof showToast === 'function') showToast(zoomIsRecording ? '🔴 جاري التسجيل...' : '⏹️ تم إيقاف التسجيل');
  };

  window.zoomShare = async function() {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const vid = document.getElementById('zoomLocalVideo');
      if (vid) vid.srcObject = screen;
      if (typeof showToast === 'function') showToast('🖥️ جاري مشاركة الشاشة');
      screen.getVideoTracks()[0].onended = () => {
        if (zoomLocalStream && vid) vid.srcObject = zoomLocalStream;
        if (typeof showToast === 'function') showToast('⏹️ توقفت مشاركة الشاشة');
      };
    } catch(e) { if (typeof showToast === 'function') showToast('⚠️ لم يتم مشاركة الشاشة'); }
  };

  window.toggleZoomHandRaise = function() {
    zoomHandRaised = !zoomHandRaised;
    const btn = document.getElementById('zoomHandBtn');
    if (btn) btn.classList.toggle('active', zoomHandRaised);
    if (typeof showToast === 'function') showToast(zoomHandRaised ? '✋ رفعت يدك' : '✋ أنزلت يدك');
  };

  window.toggleZoomBackground = function() {
    const vid = document.getElementById('zoomLocalVideo');
    if (!vid) return;
    const bgs = ['none','blur(8px)','blur(15px)'];
    const cur = bgs.indexOf(vid.style.filter || 'none');
    vid.style.filter = bgs[(cur + 1) % bgs.length];
    if (typeof showToast === 'function') showToast('🎨 تم تغيير الخلفية');
  };

  window.toggleZoomFullscreen = function() {
    zoomFullscreen = !zoomFullscreen;
    const m = document.getElementById('zoomModal');
    const icon = document.getElementById('zoomFsIcon');
    if (zoomFullscreen) {
      m?.requestFullscreen?.().catch(()=>{});
    } else {
      document.exitFullscreen?.().catch(()=>{});
    }
    if (icon) icon.className = zoomFullscreen ? 'fas fa-compress' : 'fas fa-expand';
  };

  function renderZoomParticipants() {
    const panel = document.getElementById('zoomParticipantsPanel');
    if (!panel) return;
    panel.innerHTML = `
      <div style="color:#fff;font-weight:700;margin-bottom:.75rem;font-size:.9rem"><i class="fas fa-users" style="color:#6366f1"></i> المشاركون (${zoomParticipants.size + 1})</div>
      <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem;background:rgba(99,102,241,.1);border-radius:8px;margin-bottom:.4rem">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700">أ</div>
        <span style="font-size:.85rem;flex:1">${(typeof currentUser !== 'undefined' ? currentUser : '') || 'أنت'}</span>
        <i class="fas ${zoomMicOn?'fa-microphone':'fa-microphone-slash'}" style="color:${zoomMicOn?'#10b981':'#ef4444'};font-size:.75rem"></i>
        <i class="fas ${zoomCameraOn?'fa-video':'fa-video-slash'}" style="color:${zoomCameraOn?'#10b981':'#ef4444'};font-size:.75rem"></i>
      </div>
    `;
  }

  function updateParticipantCount() {
    const el = document.getElementById('zoomParticipantCount');
    if (el) el.textContent = `${zoomParticipants.size + 1} مشاركين`;
    const grid = document.getElementById('zoomVideosGrid');
    if (!grid) return;
    const count = zoomParticipants.size + 1;
    grid.style.gridTemplateColumns = count <= 1 ? '1fr' : count <= 2 ? '1fr 1fr' : count <= 4 ? '1fr 1fr' : 'repeat(3,1fr)';
  }

  // Open zoom from group chat button
  window.openGroupVideoCall = function() { openZoom('محاضرة جماعية'); };

})();

// ============================
// 5. NEWS COUNTDOWN (display only — no auto-rotate)
// ============================
(function() {
  let _countdownInterval = null;

  window._startNewsCountdown = function() {
    if (_countdownInterval) clearInterval(_countdownInterval);
    // عرض وقت آخر تحديث فقط — بدون تدوير تلقائي
    function tick() {
      const el = document.getElementById('newsCountdownSec');
      const t = typeof window._getNewsTime === 'function' ? window._getNewsTime() : 0;
      if (el && t) {
        el.textContent = new Date(t).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
      }
    }
    tick();
    _countdownInterval = setInterval(tick, 30000);
  };
})();

// ============================
// 5b. NEWS AUTO-REFRESH — كل ساعة
(function() {
  const HOUR = 60 * 60 * 1000;
  window._openCategoryKey = null;

  // تحديث الأخبار الرئيسية كل ساعة
  setInterval(async () => {
    try {
      if (typeof fetchLiveNews !== 'function') return;
      await fetchLiveNews(true);
      // لو الموداال مفتوح على الأخبار، حدّث العرض
      const modal = document.getElementById('cosmosModal');
      const container = document.getElementById('cosmosNewsContainer');
      if (modal && modal.classList.contains('active') && container && window._openCategoryKey === 'news') {
        const tab = window._currentNewsTab || 'all';
        const all = (typeof _newsCache !== 'undefined' && _newsCache) ? _newsCache : [];
        const filtered = tab === 'all' ? all : all.filter(a => a._source === tab);
        if (typeof renderNewsCards === 'function')
          container.innerHTML = renderNewsCards(filtered.length ? filtered : all);
      }
    } catch(e) {}
  }, HOUR);

  // تحديث القسم المفتوح كل ساعة
  setInterval(async () => {
    try {
      const key = window._openCategoryKey;
      if (!key || key === 'news') return;
      const modal = document.getElementById('cosmosModal');
      if (!modal || !modal.classList.contains('active')) return;
      if (typeof _catNewsCache !== 'undefined') delete _catNewsCache[key];
      if (typeof _wikiCache !== 'undefined') delete _wikiCache[key];
      const color = (typeof COSMOS_DATA !== 'undefined' && COSMOS_DATA[key]) ? COSMOS_DATA[key].color : '#6366f1';
      if (typeof loadLiveCategoryData === 'function') await loadLiveCategoryData(key, color);
    } catch(e) {}
  }, HOUR);
})();

// ============================
// 6. GROUP VOICE CALL ROOM
// ============================
(function() {
  // ---- State ----
  // ============================================================
  // غرفة الصوت الجماعية — WebRTC Mesh عبر Firestore Signaling
  // كل مستخدم يعمل RTCPeerConnection مع كل مستخدم آخر
  // ============================================================
  const VOICE_STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  let voiceRoomStream = null;
  let voiceRoomActive = false;
  let voiceRoomParticipants = new Map(); // uid -> {name, muted}
  let voiceRoomPeers = {};              // uid -> RTCPeerConnection
  let voiceRoomAudioEls = {};          // uid -> <audio>
  let voiceRoomUnsubscribe = null;
  let voiceRoomSignalUnsub = null;
  let voiceRoomMyRef = null;
  let voiceRoomInterval = null;
  let myVoiceMuted = false;
  let myVoiceUID = null;

  const voiceRoomRef = () => db.collection('voice_room').doc('main_room');
  const signalRef = (from, to) => voiceRoomRef().collection('signals').doc(from + '__' + to);

  // ---- Open/Close Room ----
  window.openGroupVoiceRoom = async function() {
    if (!currentUser) { showToast('❌ يجب تسجيل الدخول أولاً'); return; }
    const modal = document.getElementById('groupVoiceRoomModal');
    if (modal) modal.classList.add('active');
    await joinVoiceRoom();
  };

  window.closeGroupVoiceRoom = function() {
    leaveVoiceRoom();
    const modal = document.getElementById('groupVoiceRoomModal');
    if (modal) modal.classList.remove('active');
  };

  // ---- Join Room ----
  async function joinVoiceRoom() {
    try {
      voiceRoomStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceRoomActive = true;
      myVoiceMuted = false;
      myVoiceUID = currentUserId || ('guest_' + Math.random().toString(36).substr(2,9));
      updateMyMuteUI();

      // سجّل نفسك في قائمة المشاركين
      voiceRoomMyRef = voiceRoomRef().collection('participants').doc(myVoiceUID);
      await voiceRoomMyRef.set({
        name: currentUser || 'مستخدم',
        uid: myVoiceUID,
        muted: false,
        isAdmin: !!isAdmin,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });

      // اسمع المشاركين الجدد وابدأ معهم WebRTC
      voiceRoomUnsubscribe = voiceRoomRef().collection('participants').onSnapshot(async snap => {
        const currentUIDs = new Set();
        snap.forEach(doc => {
          currentUIDs.add(doc.id);
          voiceRoomParticipants.set(doc.id, doc.data());
        });
        // احذف المغادرين
        for (const uid of voiceRoomParticipants.keys()) {
          if (!currentUIDs.has(uid)) { voiceRoomParticipants.delete(uid); closePeer(uid); }
        }
        renderVoiceParticipants();
        updateVoiceRoomBadge();

        // ابدأ اتصال مع كل مستخدم جديد (من جانبنا فقط لو uid أكبر)
        for (const uid of currentUIDs) {
          if (uid === myVoiceUID) continue;
          if (!voiceRoomPeers[uid]) {
            if (myVoiceUID > uid) {
              await createOffer(uid);
            }
          }
        }
      });

      // اسمع الـ signals الواردة لي
      voiceRoomSignalUnsub = voiceRoomRef().collection('signals')
        .where('to', '==', myVoiceUID)
        .onSnapshot(async snap => {
          for (const change of snap.docChanges()) {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data();
              if (!data) continue;
              try { await handleSignal(data, change.doc.id); } catch(e) { console.warn('signal error', e); }
            }
          }
        });

      // Heartbeat
      voiceRoomInterval = setInterval(() => {
        if (voiceRoomMyRef) voiceRoomMyRef.update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
      }, 10000);

      showToast('🎙️ انضممت للمكالمة الصوتية');
    } catch(e) {
      showToast('❌ لا يمكن الوصول للميكروفون: ' + (e.message || ''));
      voiceRoomActive = false;
    }
  }

  // ---- WebRTC: إنشاء Offer ----
  async function createOffer(remoteUID) {
    const pc = createPeerConnection(remoteUID);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signalRef(myVoiceUID, remoteUID).set({ from: myVoiceUID, to: remoteUID, type: 'offer', sdp: offer.sdp, ts: firebase.firestore.FieldValue.serverTimestamp() });
    } catch(e) { console.warn('createOffer error', e); }
  }

  // ---- WebRTC: معالجة Signal وارد ----
  async function handleSignal(data, docId) {
    const from = data.from;
    if (!from || from === myVoiceUID) return;

    if (data.type === 'offer') {
      let pc = voiceRoomPeers[from];
      if (!pc) pc = createPeerConnection(from);
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await signalRef(myVoiceUID, from).set({ from: myVoiceUID, to: from, type: 'answer', sdp: answer.sdp, ts: firebase.firestore.FieldValue.serverTimestamp() });
    }
    else if (data.type === 'answer') {
      const pc = voiceRoomPeers[from];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
      }
    }
    else if (data.type === 'candidate') {
      const pc = voiceRoomPeers[from];
      if (pc && data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
      }
    }
  }

  // ---- WebRTC: إنشاء PeerConnection ----
  function createPeerConnection(remoteUID) {
    if (voiceRoomPeers[remoteUID]) return voiceRoomPeers[remoteUID];
    const pc = new RTCPeerConnection(VOICE_STUN);
    voiceRoomPeers[remoteUID] = pc;

    // أضف الـ tracks بتاعتنا
    if (voiceRoomStream) {
      voiceRoomStream.getTracks().forEach(track => pc.addTrack(track, voiceRoomStream));
    }

    // لما نستقبل صوت المستخدم الآخر
    pc.ontrack = (event) => {
      let audio = voiceRoomAudioEls[remoteUID];
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        voiceRoomAudioEls[remoteUID] = audio;
      }
      audio.srcObject = event.streams[0];
    };

    // إرسال ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candRef = voiceRoomRef().collection('signals').doc(myVoiceUID + '__' + remoteUID + '_ice_' + Date.now());
        await candRef.set({ from: myVoiceUID, to: remoteUID, type: 'candidate', candidate: event.candidate.toJSON(), ts: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) { closePeer(remoteUID); }
    };

    return pc;
  }

  // ---- إغلاق اتصال مع مستخدم ----
  function closePeer(uid) {
    if (voiceRoomPeers[uid]) { try { voiceRoomPeers[uid].close(); } catch(e){} delete voiceRoomPeers[uid]; }
    if (voiceRoomAudioEls[uid]) { voiceRoomAudioEls[uid].srcObject = null; try { voiceRoomAudioEls[uid].remove(); } catch(e){} delete voiceRoomAudioEls[uid]; }
  }

  // ---- Leave Room ----
  async function leaveVoiceRoom() {
    voiceRoomActive = false;
    // أغلق كل الـ peers
    Object.keys(voiceRoomPeers).forEach(uid => closePeer(uid));
    // احذف الـ signals بتاعتنا
    try {
      const sigSnap = await voiceRoomRef().collection('signals').where('from','==',myVoiceUID).get();
      sigSnap.forEach(d => d.ref.delete());
      const sigSnap2 = await voiceRoomRef().collection('signals').where('to','==',myVoiceUID).get();
      sigSnap2.forEach(d => d.ref.delete());
    } catch(e){}
    if (voiceRoomStream) { voiceRoomStream.getTracks().forEach(t => t.stop()); voiceRoomStream = null; }
    if (voiceRoomInterval) { clearInterval(voiceRoomInterval); voiceRoomInterval = null; }
    if (voiceRoomUnsubscribe) { voiceRoomUnsubscribe(); voiceRoomUnsubscribe = null; }
    if (voiceRoomSignalUnsub) { voiceRoomSignalUnsub(); voiceRoomSignalUnsub = null; }
    if (voiceRoomMyRef) { try { await voiceRoomMyRef.delete(); } catch(e){} voiceRoomMyRef = null; }
    voiceRoomParticipants.clear();
    myVoiceUID = null;
    updateVoiceRoomBadge();
    showToast('📴 غادرت المكالمة');
  }

  // ---- Toggle Mute ----
  window.toggleVoiceMute = function() {
    if (!voiceRoomStream) return;
    myVoiceMuted = !myVoiceMuted;
    voiceRoomStream.getAudioTracks().forEach(t => t.enabled = !myVoiceMuted);
    if (voiceRoomMyRef) voiceRoomMyRef.update({ muted: myVoiceMuted }).catch(()=>{});
    updateMyMuteUI();
    showToast(myVoiceMuted ? '🔇 تم كتم صوتك' : '🎙️ تم تفعيل صوتك');
  };

  function updateMyMuteUI() {
    const btn = document.getElementById('voiceMuteBtn');
    if (!btn) return;
    btn.innerHTML = myVoiceMuted
      ? '<i class="fas fa-microphone-slash"></i><span>تفعيل الصوت</span>'
      : '<i class="fas fa-microphone"></i><span>كتم الصوت</span>';
    btn.style.background = myVoiceMuted ? 'rgba(239,68,68,.3)' : 'rgba(16,185,129,.25)';
    btn.style.color = myVoiceMuted ? '#ef4444' : '#10b981';
    btn.style.borderColor = myVoiceMuted ? 'rgba(239,68,68,.5)' : 'rgba(16,185,129,.5)';
  }

  // ---- Kick participant (admin only) ----
  window.kickVoiceParticipant = async function(uid, name) {
    if (!isAdmin) { showToast('❌ للمشرف فقط'); return; }
    if (!confirm(`هل تريد إخراج "${name}" من المكالمة؟`)) return;
    try {
      await voiceRoomRef().collection('participants').doc(uid).delete();
      await voiceRoomRef().collection('kicked').doc(uid).set({ kickedAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast(`✅ تم إخراج ${name}`);
    } catch(e) { showToast('❌ فشل الإخراج'); }
  };

  // ---- Render Participants ----
  function renderVoiceParticipants() {
    const container = document.getElementById('voiceParticipantsList');
    if (!container) return;
    if (voiceRoomParticipants.size === 0) {
      container.innerHTML = '<div style="text-align:center;color:#666;padding:2rem"><i class="fas fa-microphone-slash"></i><p>لا يوجد مشاركون</p></div>';
      return;
    }
    const myUid = myVoiceUID || '';
    let html = '';
    voiceRoomParticipants.forEach((p, uid) => {
      const isMe = uid === myUid;
      const initial = (p.name||'?').charAt(0).toUpperCase();
      const colors = ['#6366f1','#ec4899','#10b981','#f59e0b','#06b6d4','#8b5cf6'];
      const color = colors[Math.abs(uid.split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % colors.length];
      html += `<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem;background:rgba(255,255,255,.05);border-radius:12px;margin-bottom:.5rem;border:1px solid rgba(255,255,255,.08)">
        <div style="width:44px;height:44px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;flex-shrink:0;position:relative">
          ${initial}
          ${p.muted ? '<span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.55rem">🔇</span>' : '<span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.55rem">🎙</span>'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name||'مستخدم'}${isMe?' <span style="font-size:.75rem;color:#888">(أنت)</span>':''}</div>
          <div style="font-size:.78rem;color:${p.muted?'#ef4444':'#10b981'}">${p.muted?'🔇 صوت مكتوم':'🎙️ يتحدث'}</div>
        </div>
        ${(isAdmin && !isMe) ? `<button onclick="kickVoiceParticipant('${uid}','${(p.name||'').replace(/'/g,"\\'")}')" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#ef4444;border-radius:8px;padding:.3rem .7rem;cursor:pointer;font-size:.78rem;white-space:nowrap"><i class="fas fa-times"></i> إخراج</button>` : ''}
      </div>`;
    });
    container.innerHTML = html;
  }

  // ---- Badge on chat button ----
  function updateVoiceRoomBadge() {
    const badge = document.getElementById('voiceRoomBadge');
    const count = voiceRoomParticipants.size;
    if (badge) {
      if (count > 0) { badge.style.display = 'flex'; badge.textContent = count; }
      else { badge.style.display = 'none'; }
    }
  }

  // ---- Listen for kicks ----
  window.addEventListener('load', () => {
    const uid = currentUserId;
    if (!uid) return;
    db.collection('voice_room').doc('main_room').collection('kicked').doc(uid)
      .onSnapshot(snap => {
        if (snap.exists && voiceRoomActive) {
          showToast('🚫 تم إخراجك من المكالمة من قِبل المشرف');
          leaveVoiceRoom();
          const modal = document.getElementById('groupVoiceRoomModal');
          if (modal) modal.classList.remove('active');
          // Remove kick flag after reading
          snap.ref.delete().catch(()=>{});
        }
      });
  });

  // Show admin chat manage item in settings menu only for super admins
  setTimeout(() => {
    const adminMenuItem = document.getElementById('groupAdminMenuItem');
    if (adminMenuItem && typeof isSuperAdmin !== 'undefined' && isSuperAdmin) {
      adminMenuItem.style.display = 'flex';
    }
  }, 2000);

})();

// ============================
// 7. AI CHAT FIXES
// ============================
(function() {
  // Fix clearAIChat
  window.clearAIChat = function() {
    if (!confirm('هل تريد مسح المحادثة مع الذكاء الاصطناعي؟')) return;
    const cont = document.getElementById('aiChatMessages');
    if (cont) cont.innerHTML = '';
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    showToast('🗑️ تم مسح المحادثة');
  };

  // Fix handleAIFileSelect - ensure it works correctly
  window.handleAIFileSelect = function(input) {
    const file = input.files[0];
    if (!file) return;
    window._aiSelectedFile = file;
    const preview = document.getElementById('aiFilePreview');
    const name = document.getElementById('aiFilePreviewName');
    if (preview) preview.style.display = 'flex';
    if (name) name.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    input.value = '';
    showToast('📎 تم اختيار الملف، اضغط إرسال');
  };

  window.clearAIFile = function() {
    window._aiSelectedFile = null;
    const p = document.getElementById('aiFilePreview');
    if (p) p.style.display = 'none';
  };

  // File upload override — DISABLED (merged into unified sendAIMessage at end of file)
  const _baseAI = window.sendAIMessage;
  // window.sendAIMessage already handles files; skip this override
  if (false) window.sendAIMessage = async function() {
    if (window._aiSelectedFile) {
      const file = window._aiSelectedFile;
      window._aiSelectedFile = null;
      const p = document.getElementById('aiFilePreview');
      if (p) p.style.display = 'none';

      const msgs = document.getElementById('aiChatMessages');
      const inputEl = document.getElementById('aiChatInput');
      const userText = inputEl ? inputEl.value.trim() : '';

      if (file.type.startsWith('image/')) {
        // Show image bubble
        const reader = new FileReader();
        reader.onload = async function(e) {
          if (msgs) {
            const div = document.createElement('div');
            div.className = 'message sent';
            div.innerHTML = `<img src="${e.target.result}" style="max-width:180px;border-radius:10px;display:block;margin-bottom:.3rem"><div class="message-time">${new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</div>`;
            msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
          }
          // Ask AI about image
          if (inputEl) inputEl.value = userText ? userText : `صف هذه الصورة باللغة العربية: "${file.name}"`;
          if (_baseAI) await _baseAI.call(window);
          if (inputEl) inputEl.value = '';
        };
        reader.readAsDataURL(file);
      } else {
        // Text/PDF/DOC file
        const reader = new FileReader();
        reader.onload = async function(e) {
          const content = typeof e.target.result === 'string' ? e.target.result.substring(0, 3000) : '';
          if (inputEl) inputEl.value = userText
            ? `${userText}\n\n[محتوى الملف: "${file.name}"]\n${content}`
            : `حلل هذا الملف وأخبرني بأهم نقاطه:\n\n[اسم الملف: "${file.name}"]\n${content}`;
          if (_baseAI) await _baseAI.call(window);
          if (inputEl) inputEl.value = '';
        };
        reader.readAsText(file, 'UTF-8');
      }
      return;
    }
    if (_baseAI) await _baseAI.call(window);
  };
})();

console.log('✅ جميع الميزات الجديدة تم تحميلها بنجاح');
console.log('📋 الميزات: شريط رسم متحرك | ذكاء اصطناعي محسّن | زوم كامل | فلترة أمان | أخبار متجددة');


/* ========================================== */


// ===== ZOOM LINK FEATURE =====
(function() {
  const ZOOM_DOC = 'zoom_settings';
  const ZOOM_FIELD = 'zoomLink';
  const ZOOM_COL = 'system';

  // Listen to zoom link from Firestore and update button visibility
  function listenZoomLink() {
    if (!db) { setTimeout(listenZoomLink, 1000); return; }
    db.collection(ZOOM_COL).doc(ZOOM_DOC).onSnapshot(snap => {
      const link = snap.exists && snap.data()[ZOOM_FIELD] ? snap.data()[ZOOM_FIELD].trim() : '';
      const btn = document.getElementById('zoomJoinBtn');
      if (btn) btn.style.display = (link && window._zoomVisible !== false) ? 'flex' : 'none';
      // Save to window for use in joinZoomFromChat
      window._zoomLink = link;
      // Update status in modal if open
      const statusEl = document.getElementById('zoomCurrentStatus');
      if (statusEl) {
        if (link) {
          statusEl.style.display = 'block';
          statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981"></i> الرابط الحالي: <span style="color:#2d8cff;direction:ltr;word-break:break-all">' + link + '</span>';
        } else {
          statusEl.style.display = 'block';
          statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#ef4444"></i> لا يوجد رابط محفوظ حالياً';
        }
      }
    }, () => {});
  }

  window.openZoomLinkSettings = function() {
    const modal = document.getElementById('zoomLinkModal');
    if (modal) modal.classList.add('active');
    const inp = document.getElementById('zoomLinkInput');
    if (inp) inp.value = window._zoomLink || '';
    const statusEl = document.getElementById('zoomCurrentStatus');
    if (statusEl) {
      const link = window._zoomLink || '';
      if (link) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981"></i> الرابط الحالي: <span style="color:#2d8cff;direction:ltr;word-break:break-all">' + link + '</span>';
      } else {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#ef4444"></i> لا يوجد رابط محفوظ حالياً';
      }
    }
  };

  window.closeZoomLinkSettings = function() {
    const modal = document.getElementById('zoomLinkModal');
    if (modal) modal.classList.remove('active');
  };

  window.saveZoomLink = async function() {
    const inp = document.getElementById('zoomLinkInput');
    const link = inp ? inp.value.trim() : '';
    if (!link) { showToast('❌ أدخل الرابط أولاً'); return; }
    if (!link.startsWith('http')) { showToast('❌ رابط غير صالح'); return; }
    try {
      await db.collection(ZOOM_COL).doc(ZOOM_DOC).set({ [ZOOM_FIELD]: link, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      window._zoomLink = link;
      const btn = document.getElementById('zoomJoinBtn');
      if (btn) btn.style.display = (window._zoomVisible !== false) ? 'flex' : 'none';
      showToast('✅ تم حفظ رابط Zoom بنجاح');
      closeZoomLinkSettings();
    } catch(e) { console.error('saveZoomLink error:', e); showToast('❌ فشل الحفظ: ' + (e.message || e)); }
  };

  window.clearZoomLink = async function() {
    if (!confirm('هل تريد إزالة رابط Zoom؟ سيختفي الزرار من الدردشة.')) return;
    try {
      await db.collection(ZOOM_COL).doc(ZOOM_DOC).set({ [ZOOM_FIELD]: '', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      window._zoomLink = '';
      const btn = document.getElementById('zoomJoinBtn');
      if (btn) btn.style.display = 'none';
      const inp = document.getElementById('zoomLinkInput');
      if (inp) inp.value = '';
      showToast('🗑️ تم إزالة الرابط');
    } catch(e) { console.error('clearZoomLink error:', e); showToast('❌ فشل الحذف'); }
  };

  // ===== Zoom Visibility Toggle =====
  const ZOOM_VISIBLE_FIELD = 'zoomVisible';
  window._zoomVisible = true; // default visible

  function updateZoomVisibleUI(visible) {
    const btn = document.getElementById('zoomJoinBtn');
    const toggleBtn = document.getElementById('zoomVisibleToggleBtn');
    const icon = document.getElementById('zoomVisibleIcon');
    const label = document.getElementById('zoomVisibleLabel');
    const link = window._zoomLink || '';
    if (btn) btn.style.display = (link && visible) ? 'flex' : 'none';
    if (toggleBtn) {
      toggleBtn.style.background = visible
        ? 'linear-gradient(135deg,#10b981,#059669)'
        : 'linear-gradient(135deg,#64748b,#475569)';
    }
    if (icon) icon.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
    if (label) label.textContent = visible ? 'ظاهر' : 'مخفي';
  }

  // Listen to zoom visibility from Firestore
  function listenZoomVisible() {
    if (!db) { setTimeout(listenZoomVisible, 1000); return; }
    db.collection(ZOOM_COL).doc(ZOOM_DOC).onSnapshot(snap => {
      const v = snap.exists && snap.data()[ZOOM_VISIBLE_FIELD] !== undefined
        ? snap.data()[ZOOM_VISIBLE_FIELD] : true;
      window._zoomVisible = v;
      updateZoomVisibleUI(v);
    }, () => {});
  }
  setTimeout(listenZoomVisible, 2500);

  window.toggleZoomVisibility = async function() {
    const newVal = !window._zoomVisible;
    try {
      await db.collection(ZOOM_COL).doc(ZOOM_DOC).set(
        { [ZOOM_VISIBLE_FIELD]: newVal, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      window._zoomVisible = newVal;
      updateZoomVisibleUI(newVal);
      showToast(newVal ? '👁️ تم إظهار زرار المحاضرة' : '🙈 تم إخفاء زرار المحاضرة');
    } catch(e) { showToast('❌ فشل التحديث'); }
  };

  window.joinZoomFromChat = function() {
    const link = window._zoomLink || '';
    if (!link) { showToast('❌ لا يوجد رابط محاضرة حالياً'); return; }
    window.open(link, '_blank');
  };

  // Start listening when db is ready
  if (typeof db !== 'undefined' && db) {
    listenZoomLink();
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(listenZoomLink, 2000));
    setTimeout(listenZoomLink, 2000);
  }

  // Also show zoomLinkMenuItem for admins (hook into updateAdminUI)
  const _origUpdateAdminUI = window.updateAdminUI;
  window.updateAdminUI = function() {
    if (_origUpdateAdminUI) _origUpdateAdminUI.apply(this, arguments);
    const el = document.getElementById('zoomLinkMenuItem');
    if (el) el.style.display = (window.isAdmin) ? 'flex' : 'none';
  };
})();


/* ========================================== */


// ===== PDF Files Feature =====
(function() {
  const PDF_COL = 'pdf_files';

  // ---- Open/Close modals ----
  window.openPdfFilesModal = function() {
    const m = document.getElementById('pdfFilesModal');
    if (m) m.classList.add('active');
    loadPdfFilesForStudents();
  };
  window.closePdfFilesModal = function() {
    const m = document.getElementById('pdfFilesModal');
    if (m) m.classList.remove('active');
  };
  window.openPdfManagerModal = function() {
    const m = document.getElementById('pdfManagerModal');
    if (m) m.classList.add('active');
    loadPdfFilesForManager();
  };
  window.closePdfManagerModal = function() {
    const m = document.getElementById('pdfManagerModal');
    if (m) m.classList.remove('active');
  };
  window.closePdfViewerModal = function() {
    const m = document.getElementById('pdfViewerModal');
    if (m) m.classList.remove('active');
    const frame = document.getElementById('pdfViewerFrame');
    if (frame) frame.src = '';
  };

  // ---- Convert share link to direct/embed link ----
  function convertToEmbedUrl(url) {
    if (!url) return url;
    // Google Drive share link -> embed
    const gdriveMath = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (gdriveMath) return `https://drive.google.com/file/d/${gdriveMath[1]}/preview`;
    // Dropbox -> direct
    if (url.includes('dropbox.com')) return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
    return url;
  }

  function convertToDownloadUrl(url) {
    if (!url) return url;
    const gdriveMath = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (gdriveMath) return `https://drive.google.com/uc?export=download&id=${gdriveMath[1]}`;
    if (url.includes('dropbox.com')) return url.replace('?dl=0', '?dl=1');
    return url;
  }

  window._currentPdfDownloadUrl = '';

  window.downloadCurrentPdf = function() {
    if (window._currentPdfDownloadUrl) window.open(window._currentPdfDownloadUrl, '_blank');
  };

  // ---- Open PDF viewer ----
  window.openPdfViewer = function(title, url) {
    const m = document.getElementById('pdfViewerModal');
    const frame = document.getElementById('pdfViewerFrame');
    const titleEl = document.getElementById('pdfViewerTitle');
    if (!m || !frame) return;
    const embedUrl = convertToEmbedUrl(url);
    window._currentPdfDownloadUrl = convertToDownloadUrl(url);
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-file-pdf" style="color:#ef4444"></i> ' + title;
    frame.src = embedUrl;
    m.classList.add('active');
  };

  // ---- Load PDFs for students ----
  async function loadPdfFilesForStudents() {
    const loading = document.getElementById('pdfFilesLoading');
    const grid = document.getElementById('pdfFilesGrid');
    const empty = document.getElementById('pdfFilesEmpty');
    if (loading) loading.style.display = 'block';
    if (grid) grid.style.display = 'none';
    if (empty) empty.style.display = 'none';
    try {
      const snap = await db.collection(PDF_COL).orderBy('createdAt', 'desc').get();
      const files = [];
      snap.forEach(d => files.push({ id: d.id, ...d.data() }));
      if (loading) loading.style.display = 'none';
      if (!files.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = files.map(f => `
          <div class="pdf-card" onclick="openPdfViewer('${escapeHtml(f.title)}', '${escapeHtml(f.url)}')">
            <div style="display:flex;gap:0.75rem;align-items:flex-start">
              <div class="pdf-card-icon"><i class="fas fa-file-pdf"></i></div>
              <div class="pdf-card-info">
                <div class="pdf-card-title">${escapeHtml(f.title)}</div>
                ${f.description ? `<div class="pdf-card-desc">${escapeHtml(f.description)}</div>` : ''}
                <div class="pdf-card-meta"><i class="fas fa-calendar-alt"></i> ${f.createdAt?.toDate ? f.createdAt.toDate().toLocaleDateString('ar-EG') : ''}</div>
              </div>
            </div>
            <button class="pdf-open-btn"><i class="fas fa-eye"></i> فتح الملف</button>
          </div>
        `).join('');
      }
    } catch(e) {
      console.error('loadPdfFiles error:', e);
      if (loading) loading.innerHTML = '<p style="color:#ef4444">❌ فشل تحميل الملفات</p>';
    }
  }

  // ---- Load PDFs for manager ----
  async function loadPdfFilesForManager() {
    const loading = document.getElementById('pdfManagerLoading');
    const grid = document.getElementById('pdfManagerGrid');
    const empty = document.getElementById('pdfManagerEmpty');
    if (loading) loading.style.display = 'block';
    if (grid) grid.style.display = 'none';
    if (empty) empty.style.display = 'none';
    try {
      const snap = await db.collection(PDF_COL).orderBy('createdAt', 'desc').get();
      const files = [];
      snap.forEach(d => files.push({ id: d.id, ...d.data() }));
      if (loading) loading.style.display = 'none';
      if (!files.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = files.map(f => `
          <div class="pdf-card">
            <button class="pdf-delete-btn" onclick="event.stopPropagation();deletePdfFile('${f.id}','${escapeHtml(f.title)}')">
              <i class="fas fa-trash"></i>
            </button>
            <div style="display:flex;gap:0.75rem;align-items:flex-start">
              <div class="pdf-card-icon"><i class="fas fa-file-pdf"></i></div>
              <div class="pdf-card-info">
                <div class="pdf-card-title">${escapeHtml(f.title)}</div>
                ${f.description ? `<div class="pdf-card-desc">${escapeHtml(f.description)}</div>` : ''}
                <div class="pdf-card-meta"><i class="fas fa-calendar-alt"></i> ${f.createdAt?.toDate ? f.createdAt.toDate().toLocaleDateString('ar-EG') : ''}</div>
              </div>
            </div>
            <button class="pdf-open-btn" onclick="openPdfViewer('${escapeHtml(f.title)}', '${escapeHtml(f.url)}')"><i class="fas fa-eye"></i> معاينة</button>
          </div>
        `).join('');
      }
    } catch(e) {
      console.error('loadPdfManager error:', e);
      if (loading) loading.innerHTML = '<p style="color:#ef4444">❌ فشل التحميل</p>';
    }
  }

  // ---- Save PDF ----
  window.savePdfFile = async function() {
    if (!isAdmin) { showToast('❌ المشرف فقط يمكنه الإضافة'); return; }
    const title = document.getElementById('pdfTitleInput')?.value.trim();
    const desc  = document.getElementById('pdfDescInput')?.value.trim();
    const url   = document.getElementById('pdfUrlInput')?.value.trim();
    if (!title) { showToast('⚠️ أدخل عنوان الملف'); return; }
    if (!url)   { showToast('⚠️ أدخل رابط الملف'); return; }
    if (!url.startsWith('http')) { showToast('❌ الرابط غير صالح'); return; }
    try {
      await db.collection(PDF_COL).add({
        title, description: desc || '', url,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        addedBy: currentUser || 'مشرف'
      });
      document.getElementById('pdfTitleInput').value = '';
      document.getElementById('pdfDescInput').value = '';
      document.getElementById('pdfUrlInput').value = '';
      showToast('✅ تم إضافة الملف بنجاح');
      loadPdfFilesForManager();
    } catch(e) {
      console.error('savePdf error:', e);
      showToast('❌ فشل الحفظ: ' + (e.message || ''));
    }
  };

  // ---- Delete PDF ----
  window.deletePdfFile = async function(id, title) {
    if (!isAdmin) { showToast('❌ المشرف فقط'); return; }
    if (!confirm('حذف الملف: ' + title + '؟')) return;
    try {
      await db.collection(PDF_COL).doc(id).delete();
      showToast('🗑️ تم الحذف');
      loadPdfFilesForManager();
    } catch(e) {
      showToast('❌ فشل الحذف');
    }
  };

  // ---- Show PDF button in updateAdminUI ----
  const _origUpdateAdminUI2 = window.updateAdminUI;
  window.updateAdminUI = function() {
    if (_origUpdateAdminUI2) _origUpdateAdminUI2.apply(this, arguments);
    const el = document.getElementById('pdfFilesMenuItem');
    if (el) el.style.display = (window.isAdmin) ? 'flex' : 'none';
    const mcEl = document.getElementById('manageCoursesMenuItem');
    if (mcEl) mcEl.style.display = (window.isAdmin) ? 'flex' : 'none';
  };

})();


/* ========================================== */




// ===== Certificate Check & Show =====
window.checkAndShowCertificate = async function(courseId, btnEl) {
  if (!currentUserId) { showToast('❌ يجب تسجيل الدخول أولاً'); return; }
  btnEl.disabled = true;
  btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
  try {
    // Get course data
    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) { showToast('❌ الكورس غير موجود'); btnEl.disabled = false; return; }
    const courseData = courseDoc.data();
    const videoIds = courseData.videoIds || [];
    const certUrl = courseData.certificateUrl || '';
    if (!certUrl) { showToast('⚠️ لا توجد شهادة مرتبطة بهذا الكورس بعد'); btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-certificate"></i> 🏆 استلام شهادتك'; return; }
    if (videoIds.length === 0) { window.open(certUrl, '_blank'); return; }
    // Check watched videos
    const watchSnap = await db.collection('watch_history')
      .where('userId', '==', currentUserId)
      .get();
    const watchedIds = new Set();
    watchSnap.forEach(d => watchedIds.add(d.data().videoId));
    const allWatched = videoIds.every(id => watchedIds.has(id));
    if (allWatched) {
      // Show certificate modal
      showCertificateModal(courseData.title || 'الكورس', certUrl);
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="fas fa-certificate"></i> 🏆 استلام شهادتك';
    } else {
      const watched = videoIds.filter(id => watchedIds.has(id)).length;
      const remaining = videoIds.length - watched;
      showToast(`⏳ أكملت ${watched} من ${videoIds.length} فيديو — باقي ${remaining} فيديو للحصول على الشهادة`);
      btnEl.disabled = false;
      btnEl.innerHTML = '<i class="fas fa-certificate"></i> 🏆 استلام شهادتك';
    }
  } catch(e) { console.error(e); showToast('❌ حدث خطأ'); btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-certificate"></i> 🏆 استلام شهادتك'; }
};

function showCertificateModal(courseTitle, certUrl) {
  const old = document.getElementById('certViewModal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'certViewModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(8px)';
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a1025,#0f0a1a);border:2px solid rgba(245,158,11,.5);border-radius:24px;width:95%;max-width:440px;padding:2rem 1.5rem;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.7),0 0 60px rgba(245,158,11,.15);position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(245,158,11,.12),transparent 65%);pointer-events:none"></div>
      <div style="width:80px;height:80px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 1.25rem;box-shadow:0 10px 30px rgba(245,158,11,.5),0 0 0 8px rgba(245,158,11,.15)">🏆</div>
      <h2 style="font-size:1.35rem;font-weight:900;color:#fde68a;margin-bottom:.4rem">مبروك! 🎉</h2>
      <p style="color:#e0e7ff;font-size:.95rem;line-height:1.6;margin-bottom:1.5rem">
        أتممت كورس <b style="color:#fbbf24">${escapeHtml(courseTitle)}</b> بنجاح!<br>
        <span style="color:#94a3b8;font-size:.85rem">يمكنك الآن تحميل شهادتك</span>
      </p>
      <a href="${certUrl}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;justify-content:center;gap:.6rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:14px;padding:.85rem 1.5rem;font-family:Cairo;font-size:1rem;font-weight:700;cursor:pointer;text-decoration:none;margin-bottom:.75rem;box-shadow:0 8px 24px rgba(245,158,11,.45)">
        <i class="fas fa-download"></i> تحميل الشهادة PDF
      </a>
      <button onclick="document.getElementById('certViewModal').remove()"
        style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#aaa;border-radius:10px;padding:.6rem 1.5rem;font-family:Cairo;font-size:.9rem;cursor:pointer;width:100%">
        إغلاق
      </button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ===== CERTIFICATES FEATURE =====
(function() {

  window.openCertificatesManager = async function() {
    if (!isAdmin) { showToast('❌ المشرف فقط'); return; }
    document.getElementById('certificatesManagerModal').classList.add('active');
    await renderCertManagerList();
  };

  window.closeCertificatesManager = function() {
    document.getElementById('certificatesManagerModal').classList.remove('active');
  };

  async function renderCertManagerList() {
    const listEl = document.getElementById('certManagerList');
    if (!listEl) return;
    listEl.innerHTML = '<p style="color:#888;text-align:center"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>';
    try {
      const snap = await db.collection('courses').get();
      if (snap.empty) { listEl.innerHTML = '<p style="color:#888;text-align:center">لا توجد كورسات بعد</p>'; return; }
      let html = '';
      snap.forEach(doc => {
        const c = doc.data();
        const certUrl = c.certificateUrl || '';
        const hasCert = !!certUrl;
        html += `<div class="cert-manager-row ${hasCert ? 'has-cert' : ''}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:#e0e7ff;font-size:.9rem;margin-bottom:.4rem">
              <i class="fas fa-book-open" style="color:${hasCert ? '#f59e0b' : '#6366f1'};margin-left:.35rem"></i>
              ${escapeHtml(c.title || 'كورس بدون اسم')}
              ${hasCert ? '<span style="color:#f59e0b;font-size:.75rem;margin-right:.4rem"><i class="fas fa-certificate"></i> يوجد شهادة</span>' : ''}
            </div>
            <input
              id="certUrl_${doc.id}"
              type="url"
              placeholder="رابط PDF الشهادة..."
              value="${escapeHtml(certUrl)}"
              style="width:100%;padding:.55rem .75rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;font-family:Cairo;font-size:.82rem;direction:ltr"
              dir="ltr"
            >
          </div>
          <button onclick="saveCertUrl('${doc.id}')"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;padding:.5rem .85rem;font-family:Cairo;font-size:.8rem;font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">
            <i class="fas fa-save"></i> حفظ
          </button>
          ${hasCert ? `<button onclick="clearCertUrl('${doc.id}')"
            style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.4);color:#f87171;border-radius:10px;padding:.5rem .7rem;cursor:pointer;flex-shrink:0">
            <i class="fas fa-trash"></i></button>` : ''}
        </div>`;
      });
      listEl.innerHTML = html;
    } catch(e) { console.error(e); listEl.innerHTML = '<p style="color:#ef4444">❌ فشل التحميل</p>'; }
  }

  window.saveCertUrl = async function(courseId) {
    const inp = document.getElementById('certUrl_' + courseId);
    if (!inp) return;
    const url = inp.value.trim();
    if (url && !url.startsWith('http')) { showToast('❌ رابط غير صالح'); return; }
    try {
      await db.collection('courses').doc(courseId).update({ certificateUrl: url });
      showToast(url ? '✅ تم حفظ رابط الشهادة' : '🗑️ تم إزالة الشهادة');
      await renderCertManagerList();
    } catch(e) { console.error(e); showToast('❌ فشل الحفظ'); }
  };

  window.clearCertUrl = async function(courseId) {
    if (!confirm('هل تريد إزالة الشهادة من هذا الكورس؟')) return;
    try {
      await db.collection('courses').doc(courseId).update({ certificateUrl: '' });
      showToast('🗑️ تم إزالة الشهادة');
      await renderCertManagerList();
    } catch(e) { showToast('❌ فشل الحذف'); }
  };

  // Hook into updateAdminUI to show the menu item for admins
  const _origUI = window.updateAdminUI;
  window.updateAdminUI = function() {
    if (_origUI) _origUI.apply(this, arguments);
    const el = document.getElementById('manageCertificatesMenuItem');
    if (el) el.style.display = (window.isAdmin) ? 'flex' : 'none';
  };

  // Close on backdrop click
  document.addEventListener('DOMContentLoaded', () => {
    const m = document.getElementById('certificatesManagerModal');
    if (m) m.addEventListener('click', e => { if (e.target === m) closeCertificatesManager(); });
  });

})();



/* ========================================== */


// ===== DEEP TECH BACKGROUND — QUANTUM GRID =====
(function () {
  const canvas = document.getElementById('spaceCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, t = 0;
  let nodes = [], pulses = [], beams = [], hexes = [], scanLines = [];
  let mouseX = W / 2, mouseY = H / 2;

  /* ── utils ──────────────────────────────── */
  const r = (a, b) => Math.random() * (b - a) + a;
  const TAU = Math.PI * 2;

  /* ── CONFIG ──────────────────────────────── */
  const CFG = {
    bg:       '#03030a',
    // palette: deep navy → violet → electric blue → cyan
    colors: [
      [59,  130, 246],   // electric blue
      [99,  102, 241],   // indigo
      [139, 92,  246],   // violet
      [6,   182, 212],   // cyan
      [16,  185, 129],   // emerald (accent)
    ],
    nodeCount: 55,
    connectionDist: 210,
    gridOpacity: 0.032,
    beamInterval: 3200,
    hexRadius: 38,
  };

  /* ── RESIZE ──────────────────────────────── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildScene();
  }

  /* ── BUILD ───────────────────────────────── */
  function buildScene() {
    // Nodes (floating particles that connect)
    nodes = [];
    const count = Math.min(CFG.nodeCount, Math.floor(W * H / 14000));
    for (let i = 0; i < count; i++) {
      const ci = Math.floor(r(0, CFG.colors.length));
      nodes.push({
        x: r(0, W), y: r(0, H),
        vx: r(-0.18, 0.18), vy: r(-0.12, 0.12),
        r: r(1.5, 3.5),
        color: CFG.colors[ci],
        alpha: r(0.5, 1),
        pulse: r(0, TAU),
        pulseSpeed: r(0.008, 0.022),
      });
    }

    // Hex grid points (subtle background hex pattern)
    hexes = [];
    const hSize = CFG.hexRadius;
    const hW = hSize * 2;
    const hH = Math.sqrt(3) * hSize;
    for (let row = -1; row < H / hH + 2; row++) {
      for (let col = -1; col < W / hW + 2; col++) {
        const offset = (col % 2) * (hH / 2);
        hexes.push({
          x: col * hW * 0.75,
          y: row * hH + offset,
          r: hSize,
          alpha: r(0.012, 0.028),
          phase: r(0, TAU),
          speed: r(0.0008, 0.002),
        });
      }
    }

    // Scan lines (horizontal sweeping lines)
    scanLines = [];
    for (let i = 0; i < 3; i++) {
      scanLines.push({
        y: r(0, H),
        vy: r(0.3, 0.9),
        alpha: r(0.03, 0.07),
        width: r(1, 2.5),
        color: CFG.colors[Math.floor(r(0, CFG.colors.length))],
      });
    }
  }

  /* ── DRAW HEX ────────────────────────────── */
  function hexPath(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + size * Math.cos(a);
      const y = cy + size * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ── DRAW PERSPECTIVE GRID ───────────────── */
  function drawGrid(now) {
    const vp = { x: W * 0.5, y: H * 0.42 }; // vanishing point
    const cols = 18, rows = 14;
    const spread = W * 1.2;
    const depth  = H * 0.9;

    ctx.save();
    ctx.globalAlpha = CFG.gridOpacity;

    // Horizontal lines (receding)
    for (let i = 0; i <= rows; i++) {
      const t2 = i / rows;
      const ease = t2 * t2;
      const y = vp.y + ease * depth;
      const xLeft  = vp.x - ease * spread / 2;
      const xRight = vp.x + ease * spread / 2;
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.00045 - i * 0.4);
      ctx.strokeStyle = `rgba(99,102,241,${CFG.gridOpacity * 2 * pulse})`;
      ctx.lineWidth = 0.5 + ease * 0.8;
      ctx.beginPath(); ctx.moveTo(xLeft, y); ctx.lineTo(xRight, y); ctx.stroke();
    }

    // Vertical lines converging to vanishing point
    for (let i = 0; i <= cols; i++) {
      const frac = i / cols;
      const xBase = vp.x - spread / 2 + frac * spread;
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.0004 + i * 0.5);
      ctx.strokeStyle = `rgba(99,102,241,${CFG.gridOpacity * 1.8 * pulse})`;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(vp.x, vp.y);
      ctx.lineTo(xBase, vp.y + depth);
      ctx.stroke();
    }

    // Glowing horizon line
    const hg = ctx.createLinearGradient(0, vp.y, W, vp.y);
    hg.addColorStop(0,    'transparent');
    hg.addColorStop(0.25, `rgba(99,102,241,0.25)`);
    hg.addColorStop(0.5,  `rgba(139,92,246,0.45)`);
    hg.addColorStop(0.75, `rgba(99,102,241,0.25)`);
    hg.addColorStop(1,    'transparent');
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 0.0006);
    ctx.strokeStyle = hg;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, vp.y); ctx.lineTo(W, vp.y); ctx.stroke();

    ctx.restore();
  }

  /* ── DRAW HEX GRID ───────────────────────── */
  function drawHexGrid(now) {
    ctx.save();
    hexes.forEach(h => {
      h.phase += h.speed;
      const a = h.alpha * (0.6 + 0.4 * Math.sin(h.phase));
      ctx.globalAlpha = a;
      ctx.strokeStyle = `rgba(99,102,241,1)`;
      ctx.lineWidth = 0.4;
      hexPath(h.x, h.y, h.r);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ── AMBIENT GLOW ORBS ───────────────────── */
  function drawOrbs(now) {
    const orbs = [
      { x: W * 0.15, y: H * 0.2,  r: W * 0.25, c: [99,102,241],  a: 0.055 },
      { x: W * 0.85, y: H * 0.75, r: W * 0.28, c: [6,182,212],   a: 0.040 },
      { x: W * 0.5,  y: H * 0.5,  r: W * 0.35, c: [139,92,246],  a: 0.028 },
      { x: W * 0.7,  y: H * 0.15, r: W * 0.18, c: [16,185,129],  a: 0.030 },
    ];
    orbs.forEach((o, i) => {
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.00035 + i * 1.3);
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
      const [cr, cg, cb] = o.c;
      g.addColorStop(0,    `rgba(${cr},${cg},${cb},${o.a * 2.2})`);
      g.addColorStop(0.4,  `rgba(${cr},${cg},${cb},${o.a})`);
      g.addColorStop(1,    'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * pulse, 0, TAU); ctx.fill();
    });
  }

  /* ── NODE NETWORK ────────────────────────── */
  function drawNetwork(now) {
    // Move nodes
    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      if (n.y > H + 20) n.y = -20;
      n.pulse += n.pulseSpeed;
    });

    // Connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > CFG.connectionDist) continue;
        const strength = 1 - dist / CFG.connectionDist;
        const [cr, cg, cb] = a.color;
        ctx.globalAlpha = strength * 0.18;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},1)`;
        ctx.lineWidth = strength * 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        // Energy pulse dot travelling along connection
        if (Math.random() < 0.0008) {
          pulses.push({
            x: a.x, y: a.y,
            tx: b.x, ty: b.y,
            progress: 0, speed: r(0.012, 0.028),
            color: a.color,
          });
        }
      }
    }
    ctx.globalAlpha = 1;

    // Node dots
    nodes.forEach(n => {
      const tw = 0.6 + 0.4 * Math.sin(n.pulse);
      const [cr, cg, cb] = n.color;

      // Glow
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.3 * tw})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, TAU); ctx.fill();

      // Core
      ctx.globalAlpha = n.alpha * tw;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  /* ── ENERGY PULSES ───────────────────────── */
  function drawPulses() {
    pulses = pulses.filter(p => p.progress < 1);
    pulses.forEach(p => {
      p.progress += p.speed;
      const x = p.x + (p.tx - p.x) * p.progress;
      const y = p.y + (p.ty - p.y) * p.progress;
      const [cr, cg, cb] = p.color;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 4);
      g.addColorStop(0, `rgba(255,255,255,0.9)`);
      g.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.7)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    });
  }

  /* ── SCAN LINES ──────────────────────────── */
  function drawScanLines(now) {
    scanLines.forEach(sl => {
      sl.y += sl.vy;
      if (sl.y > H + 10) sl.y = -10;
      const [cr, cg, cb] = sl.color;
      const g = ctx.createLinearGradient(0, sl.y - 6, 0, sl.y + 6);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${sl.alpha})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, sl.y - 6, W, 12);
    });
  }

  /* ── DATA STREAMS (vertical falling code-like lines) ─── */
  let streams = [];
  function initStreams() {
    streams = [];
    const cols = Math.floor(W / 28);
    for (let i = 0; i < cols; i++) {
      if (Math.random() > 0.18) continue;
      streams.push({
        x: i * 28 + r(0, 28),
        y: r(-H, 0),
        speed: r(0.4, 1.1),
        length: r(40, 120),
        alpha: r(0.04, 0.09),
        color: CFG.colors[Math.floor(r(0, CFG.colors.length))],
      });
    }
  }
  function drawStreams() {
    streams.forEach(s => {
      s.y += s.speed;
      if (s.y - s.length > H) { s.y = r(-80, 0); s.x = r(0, W); }
      const [cr, cg, cb] = s.color;
      const g = ctx.createLinearGradient(s.x, s.y - s.length, s.x, s.y);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.7, `rgba(${cr},${cg},${cb},${s.alpha * 0.5})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},${s.alpha})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(s.x, s.y - s.length); ctx.lineTo(s.x, s.y); ctx.stroke();
      // bright tip
      ctx.globalAlpha = s.alpha * 2;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(s.x - 0.5, s.y - 1, 1, 3);
    });
    ctx.globalAlpha = 1;
  }

  /* ── CORNER FRAME ACCENTS ────────────────── */
  function drawCornerAccents() {
    const size = 40, lw = 1.5;
    const corners = [
      { x: 0,   y: 0,   sx: 1,  sy: 1  },
      { x: W,   y: 0,   sx: -1, sy: 1  },
      { x: 0,   y: H,   sx: 1,  sy: -1 },
      { x: W,   y: H,   sx: -1, sy: -1 },
    ];
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(99,102,241,0.8)';
    ctx.lineWidth = lw;
    corners.forEach(c => {
      ctx.beginPath();
      ctx.moveTo(c.x + c.sx * size, c.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(c.x, c.y + c.sy * size);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* ── MAIN DRAW ────────────────────────────── */
  function draw(now) {
    t = now;
    requestAnimationFrame(draw);

    // Background
    ctx.fillStyle = CFG.bg;
    ctx.fillRect(0, 0, W, H);

    // Layers (back to front)
    drawOrbs(now);
    drawGrid(now);
    drawHexGrid(now);
    drawStreams();
    drawScanLines(now);
  }

  /* ── INIT ──────────────────────────────────── */
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
  resize();
  initStreams();
  requestAnimationFrame(draw);
})();
// ===== END DEEP TECH BACKGROUND =====


/* ========================================== */


// ============================================================
// SELF LEARNING SYSTEM v2 — Infinite Stages + Random Answers + API
// ============================================================

// ---- Multilingual UI strings ----
const SL_STRINGS = {
  ar: {
    stage: 'المرحلة',
    question: 'السؤال',
    of: 'من',
    correct: '✨ إجابة صحيحة!',
    wrong: '😞 إجابة خاطئة',
    streakMsg: (n) => `🔥 رائع! سلسلة ${n}!`,
    stageComplete: (n) => `المرحلة ${n} اكتملت! 🎉`,
    accuracyHigh: '🔥 أداء رائع! واصل!',
    accuracyMid: '💪 جيد! ركّز أكثر في المرحلة القادمة',
    accuracyLow: '😅 حاول تحسين نتيجتك',
    loadingStage: '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...',
    nextStageBtn: 'المرحلة التالية <i class="fas fa-arrow-left"></i>',
    gameOverTitle: 'نفدت الأرواح!',
    gameOverSub: (n) => `وصلت للمرحلة ${n} — أعد المحاولة!`,
    badgeTiers: ['مبتدئ 🌙','مبتدئ 🌱','متوسط ⭐','متقدم 🚀','خبير 🏆'],
    badgeDescs: ['لا بأس! كل خبير كان مبتدئاً. واصل التعلم!','بداية جيدة! التدرب اليومي سيرفع مستواك بسرعة.','تقدم جيد! استمر في التعلم للوصول للمستوى المتقدم.','تقدم ممتاز! أنت تتقن المفاهيم الفلكية بشكل رائع.','مستوى استثنائي! أنت من أفضل المتعلمين في الفلك!'],
    levelNames: {beginner:'مبتدئ',intermediate:'متوسط',advanced:'متقدم',expert:'محترف'},
    optionLetters: ['أ','ب','ج','د'],
  },
  en: {
    stage: 'Stage',
    question: 'Question',
    of: 'of',
    correct: '✨ Correct answer!',
    wrong: '😞 Wrong answer',
    streakMsg: (n) => `🔥 Amazing! Streak ${n}!`,
    stageComplete: (n) => `Stage ${n} complete! 🎉`,
    accuracyHigh: '🔥 Excellent performance! Keep going!',
    accuracyMid: '💪 Good! Focus more in the next stage',
    accuracyLow: '😅 Try to improve your score',
    loadingStage: '<i class="fas fa-spinner fa-spin"></i> Loading...',
    nextStageBtn: 'Next Stage <i class="fas fa-arrow-right"></i>',
    gameOverTitle: 'Out of hearts!',
    gameOverSub: (n) => `You reached Stage ${n} — Try again!`,
    badgeTiers: ['Beginner 🌙','Beginner 🌱','Intermediate ⭐','Advanced 🚀','Expert 🏆'],
    badgeDescs: ['No worries! Every expert was once a beginner. Keep learning!','Good start! Daily practice will boost your level fast.','Good progress! Keep learning to reach the advanced level.','Excellent progress! You are mastering astronomy concepts.','Exceptional level! You are among the best astronomy learners!'],
    levelNames: {beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced',expert:'Expert'},
    optionLetters: ['A','B','C','D'],
  },
  de: {
    stage: 'Stufe',
    question: 'Frage',
    of: 'von',
    correct: '✨ Richtige Antwort!',
    wrong: '😞 Falsche Antwort',
    streakMsg: (n) => `🔥 Super! Serie ${n}!`,
    stageComplete: (n) => `Stufe ${n} abgeschlossen! 🎉`,
    accuracyHigh: '🔥 Ausgezeichnete Leistung! Weiter so!',
    accuracyMid: '💪 Gut! Konzentriere dich mehr in der nächsten Stufe',
    accuracyLow: '😅 Versuche dein Ergebnis zu verbessern',
    loadingStage: '<i class="fas fa-spinner fa-spin"></i> Wird geladen...',
    nextStageBtn: 'Nächste Stufe <i class="fas fa-arrow-right"></i>',
    gameOverTitle: 'Keine Herzen mehr!',
    gameOverSub: (n) => `Du hast Stufe ${n} erreicht — Versuche es erneut!`,
    badgeTiers: ['Anfänger 🌙','Anfänger 🌱','Mittel ⭐','Fortgeschritten 🚀','Experte 🏆'],
    badgeDescs: ['Kein Problem! Jeder Experte war einmal Anfänger. Weiter lernen!','Guter Start! Tägliches Üben wird dein Level schnell steigern.','Guter Fortschritt! Lerne weiter, um das fortgeschrittene Level zu erreichen.','Ausgezeichneter Fortschritt! Du beherrschst astronomische Konzepte hervorragend.','Außergewöhnliches Niveau! Du gehörst zu den besten Astronomie-Lernenden!'],
    levelNames: {beginner:'Anfänger',intermediate:'Mittel',advanced:'Fortgeschritten',expert:'Experte'},
    optionLetters: ['A','B','C','D'],
  }
};
function slT() { return SL_STRINGS[SL.lang] || SL_STRINGS['ar']; }

// ============================================================
// SL SOUND ENGINE — Cinematic & Unique
// ============================================================
const SLSound = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function osc(freq, type, start, dur, gainPeak, c) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gainPeak, start + dur * 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(c.destination);
    o.start(start); o.stop(start + dur + 0.01);
    return o;
  }
  function oscRamp(f1, f2, type, start, dur, gainPeak, c) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, start);
    o.frequency.exponentialRampToValueAtTime(f2, start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gainPeak, start + dur * 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(c.destination);
    o.start(start); o.stop(start + dur + 0.01);
    return o;
  }
  function noise(start, dur, gain, c) {
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), g = c.createGain();
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 1200; filt.Q.value = 0.8;
    src.buffer = buf;
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start(start); src.stop(start + dur + 0.01);
  }

  return {
    // صوت اختيار الإجابة — نبضة كونية عميقة فريدة
    select() {
      try {
        const c = ac(), now = c.currentTime;
        // طبقة 1: نبضة bass منخفضة
        oscRamp(180, 90, 'sine', now, 0.18, 0.22, c);
        // طبقة 2: نغمة فضائية متوسطة مع vibrato
        const o = c.createOscillator(), lfo = c.createOscillator(), lfoG = c.createGain(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = 520;
        lfo.type = 'sine'; lfo.frequency.value = 14;
        lfoG.gain.value = 12;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.12, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        o.connect(g); g.connect(c.destination);
        lfo.start(now); lfo.stop(now + 0.25);
        o.start(now); o.stop(now + 0.25);
        // طبقة 3: shimmer عالية خفيفة
        oscRamp(1800, 2400, 'sine', now, 0.15, 0.04, c);
      } catch(e) {}
    },

    // صوت الإجابة الصحيحة — انفجار نجمي احترافي
    correct() {
      try {
        const c = ac(), now = c.currentTime;
        // Chord صاعد: C-E-G-C
        [[261.6, 0], [329.6, 0.06], [392, 0.12], [523.2, 0.18], [783.9, 0.26]].forEach(([f, t]) => {
          osc(f, 'sine', now + t, 0.38, 0.18, c);
        });
        // Impact bass
        oscRamp(220, 55, 'sine', now, 0.25, 0.3, c);
        // Shimmer sparkle
        [[2100, 0.05], [2800, 0.12], [3500, 0.19]].forEach(([f, t]) => {
          osc(f, 'sine', now + t, 0.12, 0.05, c);
        });
        // Noise burst للتشبيع
        noise(now, 0.06, 0.08, c);
      } catch(e) {}
    },

    // صوت الإجابة الخاطئة — هبوط درامي كوني
    wrong() {
      try {
        const c = ac(), now = c.currentTime;
        // هبوط عميق
        oscRamp(280, 80, 'sawtooth', now, 0.35, 0.18, c);
        oscRamp(210, 60, 'sine', now + 0.04, 0.32, 0.14, c);
        // رعشة dissonant
        osc(155, 'square', now, 0.2, 0.06, c);
        // ضربة percussion
        oscRamp(300, 40, 'sine', now, 0.1, 0.25, c);
        noise(now, 0.08, 0.05, c);
      } catch(e) {}
    },

    // صوت اكتمال المرحلة — fanfare ملحمي
    stageComplete() {
      try {
        const c = ac(), now = c.currentTime;
        // Fanfare ملحمي متصاعد
        [[392, 0], [523.2, 0.1], [659.3, 0.2], [783.9, 0.3], [1046.5, 0.4]].forEach(([f, t]) => {
          osc(f, 'triangle', now + t, 0.45, 0.2, c);
          osc(f * 1.5, 'sine', now + t, 0.25, 0.06, c);
        });
        // Bass hit
        oscRamp(110, 55, 'sine', now, 0.5, 0.28, c);
        // Sparkle trail
        for (let i = 0; i < 6; i++) {
          osc(1200 + i * 300, 'sine', now + 0.08 * i, 0.12, 0.04, c);
        }
        noise(now, 0.05, 0.1, c);
      } catch(e) {}
    },

    // صوت الشارة الأسطورية — orchestral epic
    legendary() {
      try {
        const c = ac(), now = c.currentTime;
        // Timpani hit
        oscRamp(120, 40, 'sine', now, 0.6, 0.5, c);
        oscRamp(95, 35, 'sine', now + 0.02, 0.55, 0.35, c);
        noise(now, 0.12, 0.2, c);

        // Brass chord صاعد — epic
        [[174.6, 0, 0.22], [220, 0.07, 0.2], [261.6, 0.14, 0.22], [349.2, 0.21, 0.2], [440, 0.28, 0.18]].forEach(([f, t, g]) => {
          oscRamp(f * 0.8, f, 'sawtooth', now + t, 0.55, g, c);
          osc(f, 'square', now + t, 0.5, g * 0.3, c);
        });

        // String shimmer
        [[880, 0.3], [1100, 0.38], [1320, 0.46], [1760, 0.54]].forEach(([f, t]) => {
          const o = c.createOscillator(), vib = c.createOscillator(), vG = c.createGain(), g = c.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          vib.type = 'sine'; vib.frequency.value = 6;
          vG.gain.value = 8; vib.connect(vG); vG.connect(o.frequency);
          g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(0.07, now + t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.5);
          o.connect(g); g.connect(c.destination);
          vib.start(now + t); vib.stop(now + t + 0.55);
          o.start(now + t); o.stop(now + t + 0.55);
        });

        // Final power chord
        setTimeout(() => {
          const n2 = c.currentTime;
          [[130.8, 0.4], [196, 0.35], [261.6, 0.3], [392, 0.25], [523.2, 0.2]].forEach(([f, g]) => {
            oscRamp(f * 0.95, f, 'sawtooth', n2, 0.7, g, c);
          });
          noise(n2, 0.15, 0.25, c);
        }, 650);
      } catch(e) {}
    },

    // صوت game over — هبوط مأساوي
    gameOver() {
      try {
        const c = ac(), now = c.currentTime;
        oscRamp(440, 220, 'sine', now, 0.4, 0.2, c);
        oscRamp(330, 165, 'sine', now + 0.15, 0.5, 0.16, c);
        oscRamp(220, 110, 'sine', now + 0.35, 0.6, 0.14, c);
        osc(82, 'sawtooth', now + 0.5, 0.6, 0.12, c);
        noise(now + 0.5, 0.15, 0.06, c);
      } catch(e) {}
    }
  };
})();

// ---- Utilities ----
function slShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function slDecodeHTML(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
// Shuffle options & update correct-answer index
function slShuffleQ(q) {
  const correct = q.opts[q.ans];
  const shuffled = slShuffle(q.opts);
  return { ...q, opts: shuffled, ans: shuffled.indexOf(correct) };
}

// ---- Local Question Bank ----
const SL_QUESTIONS = {
  beginner: [
    {q:"كم عدد الكواكب في المجموعة الشمسية؟",icon:"🪐",opts:["6","8","10","12"],ans:1,exp:"المجموعة الشمسية تحتوي على 8 كواكب: عطارد، الزهرة، الأرض، المريخ، المشتري، زحل، أورانوس، نبتون."},
    {q:"ما هو أكبر كوكب في المجموعة الشمسية؟",icon:"🪐",opts:["زحل","المشتري","أورانوس","الأرض"],ans:1,exp:"المشتري هو أكبر كوكب في المجموعة الشمسية، حجمه أكبر من الأرض بأكثر من 1300 مرة!"},
    {q:"ما اسم أقرب نجم إلى الأرض بعد الشمس؟",icon:"⭐",opts:["سيريوس","نجم القطب","ألفا قنطوري","بيتلجوز"],ans:2,exp:"ألفا قنطوري (برو كسيما قنطوري) هو أقرب نجم للشمس، على بُعد حوالي 4.2 سنة ضوئية."},
    {q:"كم تستغرق الأرض لتدور حول الشمس؟",icon:"🌍",opts:["24 ساعة","30 يوم","365 يوم","12 ساعة"],ans:2,exp:"تدور الأرض حول الشمس في 365.25 يوماً، وهذا هو سبب وجود سنة كبيسة كل 4 سنوات."},
    {q:"ما هو النجم الأبرز في سماء الليل؟",icon:"🌟",opts:["القمر","المريخ","سيريوس (الشعرى اليمانية)","الزهرة"],ans:2,exp:"سيريوس هو ألمع نجم في السماء الليلية، ويقع في كوكبة الكلب الكبير."},
    {q:"كم عدد أيام القمر في الدورة الكاملة (الشهر القمري)؟",icon:"🌕",opts:["28 يوم","29.5 يوم","30 يوم","31 يوم"],ans:1,exp:"الشهر القمري يساوي تقريباً 29.5 يوماً، وهو الوقت الذي يستغرقه القمر لإتمام دورة كاملة حول الأرض."},
    {q:"ما سبب ظاهرة الليل والنهار؟",icon:"🌏",opts:["دوران الأرض حول الشمس","دوران الأرض حول نفسها","دوران القمر حول الأرض","بُعد الشمس"],ans:1,exp:"الليل والنهار ناتجان عن دوران الأرض حول نفسها (المحور)، وتستغرق هذه الدورة 24 ساعة."},
    {q:"ما لون الشمس الحقيقي من الفضاء؟",icon:"☀️",opts:["أصفر","برتقالي","أبيض","أحمر"],ans:2,exp:"الشمس في الفضاء تبدو بيضاء اللون! تبدو صفراء من الأرض بسبب تشتت الضوء في الغلاف الجوي."},
    {q:"ما هو الكوكب الأقرب إلى الشمس؟",icon:"🌡️",opts:["الزهرة","الأرض","عطارد","المريخ"],ans:2,exp:"عطارد هو أقرب الكواكب إلى الشمس، لكنه ليس الأكثر حرارة! الزهرة أكثر حرارة بسبب غلافها الجوي الكثيف."},
    {q:"ما الجرم الفضائي الذي يطوف حول الأرض طبيعياً؟",icon:"🌙",opts:["المريخ","كيرون","القمر","هاليبوب"],ans:2,exp:"القمر هو التابع الطبيعي الوحيد للأرض، ويبعد عنها حوالي 384,400 كيلومتر."},
    {q:"ما اسم المجرة التي تقع فيها الأرض؟",icon:"🌌",opts:["أندروميدا","درب التبانة","المثلث","سومبريرو"],ans:1,exp:"الأرض تقع في مجرة درب التبانة (Milky Way)، وهي مجرة حلزونية يُقدَّر عدد نجومها بمئات المليارات."},
    {q:"ما تعريف السنة الضوئية؟",icon:"💫",opts:["عمر الكون","المسافة التي يقطعها الضوء في سنة","سرعة الضوء","وحدة الزمن الفلكي"],ans:1,exp:"السنة الضوئية هي المسافة التي يقطعها الضوء في سنة واحدة، وتساوي تقريباً 9.46 تريليون كيلومتر."},
    {q:"ما الكوكب الذي يملك الحلقات الأشهر؟",icon:"💫",opts:["المشتري","أورانوس","زحل","نبتون"],ans:2,exp:"زحل مشهور بحلقاته الرائعة المصنوعة أساساً من جليد ومقتطفات صخرية."},
    {q:"ما حالة الشمس؟",icon:"☀️",opts:["غاز صلب","مادة كثيفة جداً","بلازما (غاز متأين)","سائل"],ans:2,exp:"الشمس عبارة عن بلازما (غاز متأين) أساساً من الهيدروجين والهيليوم، مع درجات حرارة هائلة."},
    {q:"كم تبلغ سرعة الضوء تقريباً؟",icon:"⚡",opts:["100,000 كم/ث","300,000 كم/ث","150,000 كم/ث","500,000 كم/ث"],ans:1,exp:"سرعة الضوء في الفراغ تبلغ تقريباً 299,792 كيلومتر في الثانية، أي ما يقارب 300,000 كم/ث."},
  ],
  intermediate: [
    {q:"ما العملية التي تُنتج طاقة الشمس؟",icon:"☀️",opts:["الانشطار النووي","الاندماج النووي","الاحتراق الكيميائي","التبادل الحراري"],ans:1,exp:"الشمس تُنتج طاقتها عبر الاندماج النووي، حيث تندمج ذرات الهيدروجين لتكوّن الهيليوم مع إطلاق كميات هائلة من الطاقة."},
    {q:"ما هو الثقب الأسود؟",icon:"⚫",opts:["نجم ميت يبرد","منطقة جاذبية هائلة لا يهرب منها الضوء","ثغرة في الفضاء","كوكب مظلم"],ans:1,exp:"الثقب الأسود منطقة في الفضاء حيث الجاذبية شديدة لدرجة أن لا شيء، حتى الضوء، يستطيع الإفلات منها."},
    {q:"ما اسم الظاهرة التي تحدث عندما تمر القمر بين الأرض والشمس؟",icon:"🌒",opts:["خسوف القمر","كسوف الشمس","العبور","التوهج الشمسي"],ans:1,exp:"كسوف الشمس يحدث عندما يمر القمر بين الأرض والشمس مما يحجب ضوء الشمس كلياً أو جزئياً."},
    {q:"ما هي المادة المظلمة؟",icon:"🌑",opts:["غبار كوني","مادة لا تصدر ضوءاً ولا تُرى لكن لها جاذبية","ثقوب سوداء صغيرة","مجرات بعيدة"],ans:1,exp:"المادة المظلمة مادة افتراضية لا تُصدر أو تعكس أو تمتص الضوء لكن يُستدل عليها من تأثيراتها الجاذبية."},
    {q:"ما تسلسل حياة النجم المشابه للشمس؟",icon:"⭐",opts:["سحابة → قزم أبيض → نجم → عملاق أحمر","سحابة → نجم رئيسي → عملاق أحمر → قزم أبيض","سحابة → نجم → ثقب أسود","سحابة → عملاق → مستعر أعظم"],ans:1,exp:"النجوم المشابهة للشمس تمر بمراحل: سحابة → نجم رئيسي (كالشمس حالياً) → عملاق أحمر → قزم أبيض."},
    {q:"ما مدة التحول الكامل لضوء الشمس قبل الوصول للأرض؟",icon:"💡",opts:["8 ثوانٍ","8 دقائق","8 ساعات","8 أيام"],ans:1,exp:"يستغرق الضوء من الشمس إلى الأرض حوالي 8 دقائق و20 ثانية بسرعته البالغة 300,000 كم/ث."},
    {q:"ما اسم المنطقة بين المريخ والمشتري؟",icon:"🪨",opts:["الفضاء العميق","حزام الكويكبات","سحابة أورت","حزام كايبر"],ans:1,exp:"حزام الكويكبات منطقة تقع بين مداري المريخ والمشتري وتحتوي على ملايين الكويكبات والصخور."},
    {q:"ما مبدأ دوبلر في الفلك؟",icon:"🔴",opts:["قياس درجة حرارة النجوم","تحول طيف الضوء بسبب الحركة","حساب مسافة النجوم","قياس الجاذبية"],ans:1,exp:"مبدأ دوبلر يُستخدم لقياس حركة الأجرام السماوية؛ الضوء يتحول للأحمر عند الابتعاد وللأزرق عند الاقتراب."},
    {q:"ما هو مستعر أعظم (Supernova)؟",icon:"💥",opts:["نجم يولد من جديد","انفجار ضخم لنجم ضخم في نهاية عمره","اصطدام مجرتين","تصادم ثقبين أسودين"],ans:1,exp:"المستعر الأعظم هو انفجار هائل يحدث للنجوم الضخمة في نهاية حياتها، وقد يُساوي سطوعه سطوع مجرة كاملة."},
    {q:"ما التعريف الصحيح للسنة الفلكية لبلوتو؟",icon:"🪐",opts:["88 يوماً أرضياً","165 سنة أرضية","248 سنة أرضية","17 يوماً"],ans:2,exp:"يستغرق بلوتو 248 سنة أرضية لإتمام دورة كاملة حول الشمس! هذا ما يجعل الفصول عليه طويلة جداً."},
    {q:"ما هو الرادار الكوني (CMB)؟",icon:"📡",opts:["إشارات راديو من المجرات","إشعاع الخلفية الكونية الميكروي (صدى الانفجار الكبير)","موجات الجاذبية","أشعة كونية"],ans:1,exp:"إشعاع الخلفية الكونية الميكروي هو الإشعاع المتبقي من الانفجار الكبير، ويملأ الكون في كل الاتجاهات."},
    {q:"ما الذي يحدد لون النجم؟",icon:"🌈",opts:["حجمه","عمره","درجة حرارته السطحية","مسافته عنا"],ans:2,exp:"لون النجم يحدده درجة حرارته: النجوم الزرقاء أشد حرارة، ثم البيضاء ثم الصفراء ثم البرتقالية ثم الحمراء."},
    {q:"ما سبب مد وجزر البحار؟",icon:"🌊",opts:["الرياح القوية","الجاذبية القمرية والشمسية","دوران الأرض","الحرارة الجوفية"],ans:1,exp:"المد والجزر ناتجان أساساً عن جاذبية القمر (وجزئياً الشمس) التي تسحب مياه المحيطات."},
    {q:"كم يبلغ قُطر الأرض تقريباً؟",icon:"🌍",opts:["6,371 كم","12,742 كم","100,000 كم","4,200 كم"],ans:1,exp:"قُطر الأرض يبلغ تقريباً 12,742 كيلومتر. أما نصف القطر فهو حوالي 6,371 كيلومتر."},
    {q:"ما هي الشفق القطبي؟",icon:"🌠",opts:["عاصفة كونية","ظاهرة ضوئية ناتجة عن تفاعل الرياح الشمسية مع الغلاف الجوي","نيازك ليلية","انعكاس ضوء القمر"],ans:1,exp:"الشفق القطبي (Aurora) ظاهرة ضوئية ترسمها الجسيمات المشحونة من الرياح الشمسية عند تفاعلها مع الغلاف الجوي."},
  ],
  advanced: [
    {q:"ما نظرية الانفجار الكبير؟",icon:"💥",opts:["اصطدام مجرتين كبيرتين","نقطة أولية بالغة الكثافة انفجرت وأوجدت الكون","انهيار نجم ضخم","نظرية فلسفية غير علمية"],ans:1,exp:"نظرية الانفجار الكبير تقول أن الكون بدأ من حالة بالغة الكثافة والحرارة قبل نحو 13.8 مليار سنة، ثم توسّع."},
    {q:"ما موجات الجاذبية وأين اكتُشفت؟",icon:"〰️",opts:["موجات ضوئية كونية، اكتُشفت 1905","تموجات في نسيج الزمكان، اكتُشفت 2015 بواسطة LIGO","أمواج صوتية فضائية","موجات راديو من الثقوب السوداء"],ans:1,exp:"موجات الجاذبية تموجات في نسيج الزمكان تنبأ بها آينشتاين 1916، وأُكدت عام 2015 بمرصد LIGO عند اندماج ثقبين أسودين."},
    {q:"ما الفرق بين النجم النيوتروني والثقب الأسود؟",icon:"⚫",opts:["لا فرق، هما نفس الشيء","النجم النيوتروني أصغر كثافة","كلاهما بقايا نجوم ضخمة، لكن الثقب الأسود يتجاوز كثافة النجم النيوتروني","الثقب الأسود يتوهج"],ans:2,exp:"كلاهما بقايا نجوم ضخمة انهارت. لكن إذا كانت الكتلة المتبقية أعلى من 3 كتل شمسية يتشكل ثقب أسود بدلاً من النجم النيوتروني."},
    {q:"ما أفق الحدث في الثقب الأسود؟",icon:"⚫",opts:["سطحه المرئي","الحد الذي بعده لا يمكن للضوء أو أي شيء الإفلات","طبقته الخارجية","نقطة التفرد"],ans:1,exp:"أفق الحدث هو الحد الكروي حول الثقب الأسود الذي بعده تكون الجاذبية أشد من سرعة الضوء، فلا شيء يُفلت."},
    {q:"ما نظرية النسبية الخاصة لآينشتاين؟",icon:"🔬",opts:["الجاذبية تُشوّه الزمكان","سرعة الضوء ثابتة والكتلة والطاقة متكافئتان (E=mc²)","الكون يتمدد","الفضاء والزمن مطلقان"],ans:1,exp:"النسبية الخاصة (1905): سرعة الضوء ثابتة للجميع، والزمن يتباطأ والكتلة تزداد مع السرعة، والطاقة والكتلة متكافئتان E=mc²."},
    {q:"ما سبب تمدد الكون المتسارع؟",icon:"🔭",opts:["الانفجارات النجمية المستمرة","الطاقة المظلمة","المادة المظلمة","الثقوب السوداء"],ans:1,exp:"الطاقة المظلمة (Dark Energy) هي القوة الغامضة المسؤولة عن تسارع تمدد الكون. تشكّل ~68% من محتواه الكلي."},
    {q:"ما مبدأ عدم اليقين لهايزنبرغ في الفيزياء الكمية الفلكية؟",icon:"⚛️",opts:["لا يمكن قياس موضع وزخم جسيم بدقة تامة في آن واحد","الجاذبية تؤثر على الزمن","الكون ثابت","النجوم تتحرك بشكل عشوائي"],ans:0,exp:"مبدأ عدم اليقين: لا يمكن معرفة الموضع والزخم (الكمية الحركية) لجسيم بدقة تامة في نفس الوقت، وهو من أسس الكم."},
    {q:"ما كميات تكوين الكون المرصود؟",icon:"📊",opts:["75% مادة، 25% طاقة","5% مادة عادية، 27% مادة مظلمة، 68% طاقة مظلمة","50% مادة، 50% طاقة","100% مادة عادية"],ans:1,exp:"الكون يتكوّن تقريباً من: 5% مادة عادية (ذرات)، 27% مادة مظلمة، 68% طاقة مظلمة. ما نراه لا يتجاوز 5%!"},
    {q:"ما ثابت هابل ودلالته؟",icon:"🔭",opts:["يقيس درجة حرارة الكون","يقيس معدل تمدد الكون (~70 كم/ث/ميغابارسك)","يقيس سرعة الضوء","يقيس حجم المجرات"],ans:1,exp:"ثابت هابل (H₀) يُعبّر عن معدل تمدد الكون: كل 1 ميغابارسك تُضاف ~70 كم/ث إلى سرعة ابتعاد المجرة."},
    {q:"ما ظاهرة العدسة الجاذبية؟",icon:"🌐",opts:["مرور الضوء عبر مواد شفافة","انحناء الضوء بسبب الجاذبية حول أجرام كبيرة","انعكاس الضوء على الغبار الكوني","تشتت الضوء في الغلاف الجوي"],ans:1,exp:"العدسة الجاذبية تحدث حين تُحني الجاذبية الضخمة لمجرة أو عنقود مجري مسار الضوء القادم من مصدر خلفه."},
    {q:"ما الفرق بين الكوار (Quasar) والنجوم العادية؟",icon:"✨",opts:["الكوار أكبر حجماً","الكوار أشد سطوعاً لأنه نواة مجرة نشطة يُغذيها ثقب أسود هائل","الكوار أبرد درجة","لا فرق بينهما"],ans:1,exp:"الكوار (Quasar) هو نواة مجرة بالغة اللمعان تتغذى على مادة تسقط في ثقب أسود ضخم. قد يكون أشد سطوعاً من 100 مجرة!"},
    {q:"ما الانهيار الجاذبي للنجوم الضخمة؟",icon:"💫",opts:["تبرّد النجم تدريجياً","انهيار ضغط الانصهار أمام الجاذبية مما ينتج نجماً نيوترونياً أو ثقباً أسود","تفتت النجم لكويكبات","توقف الإشعاع الشمسي"],ans:1,exp:"عندما ينضب وقود الانصهار في النجوم الضخمة، تتغلب الجاذبية وينهار النجم بسرعة هائلة منتجاً مستعراً أعظم ثم نجماً نيوترونياً أو ثقباً أسود."},
    {q:"ما الكشف الذي فاز بجائزة نوبل 2019 في الفيزياء الفلكية؟",icon:"🏆",opts:["اكتشاف موجات الجاذبية","اكتشاف كوكب خارج المجموعة الشمسية وقياس تمدد الكون","التصوير الأول لثقب أسود","اكتشاف النجوم النيوترونية"],ans:1,exp:"فاز عام 2019 بنوبل الفيزياء: ميشيل مايور ودومينيك كيلوز لاكتشاف أول كوكب خارج المجموعة، وجيم بيبلز لدراسة التطور الكوني."},
    {q:"ما أول صورة لثقب أسود وأين التُقطت؟",icon:"📸",opts:["مركز درب التبانة 2015","M87 عام 2019 بواسطة تلسكوب الأفق الحدثي (EHT)","ثقب أسود في أندروميدا 2010","صورة محاكاة حاسوبية فقط"],ans:1,exp:"أول صورة حقيقية لثقب أسود التُقطت عام 2019 لثقب مركز مجرة M87 بواسطة تلسكوب الأفق الحدثي (EHT)، ثم سبق Sgr A* عام 2022."},
    {q:"ما الفارق الجوهري بين الكون المرئي والكون الكلي؟",icon:"🌌",opts:["لا فارق، هما متطابقان","الكون المرئي ما يصلنا ضوؤه (46 مليار سنة ضوئية نصف قطره)، والكون الكلي قد يكون أكبر بلا نهاية","الكون الكلي أصغر","الكون المرئي هو ما يمكن رؤيته بالعين المجردة فقط"],ans:1,exp:"الكون المرئي محدود بسرعة الضوء منذ الانفجار الكبير (نصف قطره ~46 مليار سنة ضوئية)، أما الكون الكلي فربما لا حدود له."},
  ],
  expert: [
    {q:"ما نظرية أوتار (String Theory) وما أهميتها؟",icon:"🎻",opts:["نظرية عن حركة الكواكب","تقترح أن الجسيمات الأساسية أوتار مهتزة أحادية البُعد وتسعى لتوحيد قوى الطبيعة","نظرية عن تمدد الكون","نموذج لتكوين النجوم"],ans:1,exp:"نظرية الأوتار تقترح أن المكوّنات الأساسية للمادة أوتار مهتزة ضئيلة، وهي محاولة لتوحيد الجاذبية مع ميكانيكا الكم."},
    {q:"ما التناظر الزمني الفائق (Supersymmetry - SUSY) في فيزياء الجسيمات؟",icon:"⚛️",opts:["مبدأ تماثل الجسيمات وضدائدها","تقترح أن لكل جسيم معياري شريكاً فائقاً ثقيلاً لم يُكتشف بعد","قانون حفظ الطاقة الكمي","نموذج التوحيد الكبير"],ans:1,exp:"SUSY تتنبأ بأن لكل جسيم في النموذج المعياري جسيم شريك أثقل. إن صحّت، قد تفسر المادة المظلمة وتحل مشاكل التوحيد."},
    {q:"ما مفارقة المعلومات في الثقب الأسود؟",icon:"⚫",opts:["معلومات لا يمكن تشفيرها","تعارض بين ميكانيكا الكم (التي تحفظ المعلومات) وإشعاع هوكينج (الذي يبدو أنه يفقدها)","مبدأ عدم اليقين داخل الثقب الأسود","ظاهرة تشفير الضوء"],ans:1,exp:"مفارقة المعلومات: هل تُفقد المعلومات عند ابتلاع الثقب الأسود لها؟ ميكانيكا الكم تمنع ذلك لكن هوكينج رأى خلافه. لا يزال غير محلول."},
    {q:"ما مفهوم التضخم الكوني (Inflation) عقب الانفجار الكبير؟",icon:"💨",opts:["تمدد تدريجي عبر مليارات السنين","توسع هائل وسريع جداً للكون في الـ10⁻³² ثانية الأولى من عمره","تقلص الكون ثم تمدده","مرحلة التبريد الأولى للكون"],ans:1,exp:"التضخم الكوني هو مرحلة توسع أسي ضخم للكون في الفترة 10⁻³⁶ إلى 10⁻³² ثانية بعد الانفجار الكبير، ويفسر التوازن والتجانس المُلاحَظ."},
    {q:"ما إشعاع هوكينج وما المبدأ الذي قام عليه؟",icon:"🌡️",opts:["إشعاع النجوم النيوترونية","إشعاع حراري تُصدره الثقوب السوداء ناتج عن تفاعلات كمية عند أفق الحدث","أشعة غاما الكونية","الإشعاع الخلفي الكوني"],ans:1,exp:"إشعاع هوكينج ظاهرة كمية: عند أفق الحدث تتشكل أزواج جسيم-ضد جسيم، فيسقط أحدهما داخل الثقب ويُفلت الآخر كإشعاع يُفقد الثقب كتلة تدريجياً."},
    {q:"ما فرضية الكون الغشائي (Brane Cosmology) في نظرية M؟",icon:"🧬",opts:["الكون شبكة من الأوتار الكمية","كوننا ثلاثي الأبعاد غشاء (Brane) مغمور في فضاء أعلى أبعاد (Bulk)","الكون أسطواني الشكل","نظرية تبادل الجسيمات"],ans:1,exp:"في نظرية M، كوننا قد يكون غشاءً ثلاثي الأبعاد (Brane) طافياً في فضاء أعلى أبعاد. الجاذبية وحدها قد تنتقل بين هذه الأغشية."},
    {q:"ما مبدأ التكامل الكوني الهولوغرافي (Holographic Principle)؟",icon:"🌐",opts:["الكون صورة ثلاثية الأبعاد لسطح ثنائي","المعلومات الكاملة لحجم كوني يمكن ترميزها على سطحه الحدودي (2D)","مبدأ تضاعف المعلومات","قانون حفظ الزخم الكوني"],ans:1,exp:"المبدأ الهولوغرافي يقول إن كل المعلومات داخل حجم من الفضاء يمكن تمثيلها على سطحه الحدودي. يُلمح لطبيعة عميقة للزمكان والجاذبية."},
    {q:"ما نظرية تساوي الزمكان مع الشبكة (Loop Quantum Gravity - LQG)؟",icon:"🔗",opts:["نظرية تصف الكم على مستوى الأوتار","توصف الزمكان بشبكة منفصلة من الحلقات الكمية بدلاً من المستمر الأملس","نظرية تمدد الكون الكمي","نموذج حساب الجسيمات"],ans:1,exp:"LQG نظرية تتعامل مع الجاذبية كمياً عبر تقطيع الزمكان لشبكة من الحلقات المنفصلة. بديل محتمل لنظرية الأوتار."},
    {q:"ما الدليل الرئيسي على الانفجار الكبير؟",icon:"📡",opts:["مشاهدة الانفجار مباشرة بالتلسكوب","إشعاع الخلفية الكونية الميكروي (CMB) وتمدد الكون وتوفر عناصر خفيفة (H,He,Li)","وجود الكواكب والنجوم","سرعة دوران المجرات"],ans:1,exp:"الأدلة الثلاثة الكبرى: 1) CMB إشعاع الصدى من الانفجار الكبير. 2) تمدد الكون (قانون هابل). 3) توفر الهيدروجين والهيليوم والليثيوم بنسب منسجمة مع النموذج."},
    {q:"ما ثابت كوسمولوجي أينشتاين (Λ) ودوره في الكون؟",icon:"Λ",opts:["ثابت يقيس سرعة الضوء","ثابت أضافه آينشتاين لمعادلاته ليُنتج كوناً ثابتاً، ويُستخدم اليوم للتعبير عن الطاقة المظلمة","مقياس ثبات الكتلة","ثابت تمدد الجاذبية"],ans:1,exp:"الثابت الكوسمولوجي Λ أضافه آينشتاين لمعادلات المجال ليُنتج كوناً ساكناً. لاحقاً أُهمل، لكنه عاد اليوم كتعبير عن الطاقة المظلمة المسببة للتسارع."},
    {q:"ما مصفوفة كتلة النيوترينو وعلاقتها بعلم الكونيات؟",icon:"⚛️",opts:["تصف طيف النجوم النيوترونية","مصفوفة PMNS تصف تذبذب النيوترينو بين نكهاته الثلاثة وهي دليل أن له كتلة ولها تداعيات كونية","مقياس شدة الإشعاع الكوني","نموذج تفاعل النيوترينو مع المادة المظلمة"],ans:1,exp:"مصفوفة PMNS (Pontecorvo-Maki-Nakagawa-Sakata) تصف تذبذب النيوترينوات. كتلتها (غير صفرية) مهمة لنمذجة الكون المبكر وتوليد المادة على حساب المادة المضادة."},
    {q:"ما تضخم الكم (Stochastic Inflation) وكيف ينشئ الكون المتعدد؟",icon:"🔮",opts:["نظرية عن تضخم فقاعات الصابون","تقلبات كمية خلال التضخم قد تنتج جيوب كونية لا نهائية، كل منها كون مستقل (Multiverse)","نمذجة حرارية للكون المبكر","انهيار كمي للتضخم إلى ثقوب سوداء"],ans:1,exp:"التضخم الفوضوي يتنبأ بأن التقلبات الكمية أثناء التضخم تُنشئ جيوباً كونية لا تتوقف عن التمدد، مما ينتج عوالم متعددة لا حصر لها."},
    {q:"ما الفصل الأساسي بين ميكانيكا الكم ونظرية النسبية العامة؟",icon:"⚡",opts:["النسبية تُعامل الزمكان كخلفية ثابتة بينما الكم كميّ يُعامل الجسيمات في فضاء غير ديناميكي","الزمكان في النسبية العامة ديناميكي ومنحنٍ، بينما ميكانيكا الكم تعمل عادة على خلفية مسطحة ثابتة، والتوفيق بينهما عسير","لا خلاف فعلي","الكم أدق والنسبية أضخم فقط"],ans:1,exp:"الشق الأعمق: النسبية العامة تصف الزمكان ديناميكياً ومتصلاً، بينما الكم يفترض خلفية ثابتة. إيجاد نظرية جاذبية كمية متسقة هو التحدي الكبير للفيزياء الحديثة."},
    {q:"ما مدة بقاء الثقب الأسود بكتلة الشمس قبل التبخر الكامل عبر إشعاع هوكينج؟",icon:"⏳",opts:["بضعة مليارات سنة","أطول بكثير من عمر الكون الحالي — نحو 2×10⁶⁷ سنة","بضع تريليونات سنة","يتبخر فورياً عند توقف التغذية"],ans:1,exp:"ثقب أسود بكتلة الشمس يحتاج ~2×10⁶⁷ سنة لتبخّره الكامل بإشعاع هوكينج، أي أطول بأمدٍ هائل من عمر الكون الحالي (13.8 مليار سنة)."},
  ]
};

// ---- State ----
let SL = {
  level: null,
  stage: 1,
  pool: [],           // master local pool (all qs for level)
  unusedPool: [],     // qs not yet shown this rotation
  apiFetched: [],     // qs fetched from OpenTDB
  stageQuestions: [], // current 10-question stage
  currentQ: 0,
  hearts: 5,
  xp: 0,
  streak: 0,
  correctCount: 0,    // session total
  wrongCount: 0,
  stageCorrect: 0,    // this stage
  stageXP: 0,
  answered: false,
  sessionXP: 0,
  totalXP: 0,  // يتحمل من Firebase عند البدء — مش من localStorage
  totalSessions: parseInt(localStorage.getItem('sl_totalSessions') || '0'),
  bestStreak: parseInt(localStorage.getItem('sl_bestStreak') || '0'),
  PER_STAGE: 10,
  lang: 'ar',
};

// ---- Language Picker ----
function openSelfLearning() {
  // Show language picker overlay first
  let picker = document.getElementById('slLangPicker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'slLangPicker';
    picker.style.cssText = 'position:fixed;inset:0;z-index:10020;background:rgba(5,3,15,.92);backdrop-filter:blur(18px);display:flex;align-items:center;justify-content:center;padding:1.5rem;';
    picker.innerHTML = `
      <div style="background:linear-gradient(145deg,#111118,#1c1c2e);border:1px solid rgba(167,139,250,.3);border-radius:28px;padding:2rem 1.75rem;max-width:380px;width:100%;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.6);animation:slFadeIn .3s ease">
        <div style="font-size:2.5rem;margin-bottom:.75rem">🌍</div>
        <div style="font-size:1.3rem;font-weight:900;color:#ede9fe;margin-bottom:.4rem">اختر لغة الأسئلة</div>
        <div style="font-size:.85rem;color:#8b8aa0;margin-bottom:1.75rem">Choose the language of questions</div>
        <div style="display:flex;flex-direction:column;gap:.75rem">
          <button onclick="slSelectLang('ar')" style="display:flex;align-items:center;gap:1rem;width:100%;padding:1rem 1.25rem;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1));border:1px solid rgba(139,92,246,.4);border-radius:16px;cursor:pointer;color:#ede9fe;font-family:Cairo,sans-serif;font-size:1rem;font-weight:700;text-align:right;">
            <span style="font-size:1.8rem">🇸🇦</span>
            <div><div>العربية</div><div style="font-size:.75rem;color:#a78bfa">أسئلة مترجمة للعربية</div></div>
          </button>
          <button onclick="slSelectLang('en')" style="display:flex;align-items:center;gap:1rem;width:100%;padding:1rem 1.25rem;background:linear-gradient(135deg,rgba(6,182,212,.12),rgba(14,165,233,.08));border:1px solid rgba(6,182,212,.35);border-radius:16px;cursor:pointer;color:#ede9fe;font-family:Cairo,sans-serif;font-size:1rem;font-weight:700;text-align:right;">
            <span style="font-size:1.8rem">🇬🇧</span>
            <div><div>English</div><div style="font-size:.75rem;color:#06b6d4">Questions in English</div></div>
          </button>
          <button onclick="slSelectLang('de')" style="display:flex;align-items:center;gap:1rem;width:100%;padding:1rem 1.25rem;background:linear-gradient(135deg,rgba(245,158,11,.12),rgba(217,119,6,.08));border:1px solid rgba(245,158,11,.35);border-radius:16px;cursor:pointer;color:#ede9fe;font-family:Cairo,sans-serif;font-size:1rem;font-weight:700;text-align:right;">
            <span style="font-size:1.8rem">🇩🇪</span>
            <div><div>Deutsch</div><div style="font-size:.75rem;color:#f59e0b">Fragen auf Deutsch</div></div>
          </button>
        </div>
        <button onclick="document.getElementById('slLangPicker').style.display='none'" style="margin-top:1.25rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#8b8aa0;padding:.6rem 1.5rem;border-radius:99px;cursor:pointer;font-family:Cairo,sans-serif;font-size:.85rem;">إلغاء / Cancel</button>
      </div>
    `;
    document.body.appendChild(picker);
  }
  picker.style.display = 'flex';
}

function slSelectLang(lang) {
  SL.lang = lang;
  document.getElementById('slLangPicker').style.display = 'none';
  document.getElementById('selfLearningModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  slShowScreen('slWelcomeScreen');
  document.getElementById('slStatsBar').style.display = 'none';
  slLoadPrevStats();
}

function closeSelfLearning() {
  document.getElementById('selfLearningModal').style.display = 'none';
  document.body.style.overflow = '';
  slStopAllAnimations();
}
function slLoadPrevStats() {
  const box = document.getElementById('slPrevStats');
  if (SL.totalSessions > 0) {
    box.style.display = 'block';
    document.getElementById('slTotalXpStat').textContent = SL.totalXP;
    document.getElementById('slTotalSessionsStat').textContent = SL.totalSessions;
    document.getElementById('slBestStreakStat').textContent = SL.bestStreak;
  }
}

// ---- Screen management ----
function slShowScreen(id) {
  document.querySelectorAll('.sl-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---- Start full session ----
function startSelfLearning(level) {
  SL.level = level;
  SL.stage = 1;
  SL.hearts = 5;
  SL.xp = 0;
  SL.streak = 0;
  SL.correctCount = 0;
  SL.wrongCount = 0;
  SL.sessionXP = 0;
  SL.apiFetched = [];
  SL.unusedPool = [];
  // All questions come from internet only

  const colors = {beginner:'#10b981',intermediate:'#a78bfa',advanced:'#fbbf24',expert:'#f472b6'};
  const names = slT().levelNames;
  document.getElementById('slHeaderSub').innerHTML =
    `<span class="sl-level-badge" style="background:${colors[level]}22;color:${colors[level]};border:1px solid ${colors[level]}44">${names[level]}</span>`;
  document.getElementById('slStatsBar').style.display = 'flex';
  slUpdateStats();
  slLoadStage();
}

// ---- Cosmic fun facts shown while loading ----
const SL_FACTS = {
  ar: [
    "🌌 المجرة درب التبانة تحتوي على أكثر من 200 مليار نجم!",
    "☀️ الشمس تُنتج طاقة تعادل 386 مليار مليار ميغاواط في الثانية",
    "🪐 يوم واحد على المشتري يساوي 9.9 ساعة أرضية فقط",
    "⭐ النجوم الزرقاء أشد حرارة من الحمراء بعشرات الأضعاف",
    "🌑 الثقب الأسود الأقرب لنا يبعد عن الأرض 1000 سنة ضوئية",
    "🚀 الصوت لا ينتقل في الفضاء — الكون في صمت مطبق!",
    "🌙 القمر يبتعد عن الأرض بمقدار 3.8 سم كل سنة",
    "💫 المستعر الأعظم ينتج طاقة تفوق طاقة الشمس في حياتها كلها",
    "🔭 كوكب نبتون اكتُشف رياضياً قبل رؤيته بالتلسكوب",
    "🌠 الضوء الذي تراه من بعض النجوم انطلق قبل وجود الإنسان!",
  ],
  en: [
    "🌌 The Milky Way contains over 200 billion stars!",
    "☀️ The Sun produces 386 billion billion megawatts of energy per second",
    "🪐 A day on Jupiter lasts only 9.9 Earth hours",
    "⭐ Blue stars are tens of times hotter than red stars",
    "🌑 The nearest black hole to Earth is 1,000 light-years away",
    "🚀 Sound cannot travel in space — the universe is completely silent!",
    "🌙 The Moon moves 3.8 cm away from Earth every year",
    "💫 A supernova releases more energy than the Sun will in its entire lifetime",
    "🔭 Neptune was discovered mathematically before being seen through a telescope",
    "🌠 Light from distant stars you see tonight left before humans existed!",
  ],
  de: [
    "🌌 Die Milchstraße enthält über 200 Milliarden Sterne!",
    "☀️ Die Sonne erzeugt pro Sekunde 386 Milliarden Milliarden Megawatt Energie",
    "🪐 Ein Tag auf dem Jupiter dauert nur 9,9 Erdstunden",
    "⭐ Blaue Sterne sind zehnmal heißer als rote Sterne",
    "🌑 Das nächste schwarze Loch zur Erde ist 1.000 Lichtjahre entfernt",
    "🚀 Schall kann sich nicht im Weltraum ausbreiten — völlige Stille!",
    "🌙 Der Mond entfernt sich jedes Jahr 3,8 cm von der Erde",
    "💫 Eine Supernova setzt mehr Energie frei als die Sonne in ihrem gesamten Leben",
    "🔭 Neptun wurde mathematisch entdeckt, bevor er durch ein Teleskop gesehen wurde",
    "🌠 Das Licht ferner Sterne, das du siehst, startete noch vor der Menschheit!",
  ]
};

// ---- Show loading screen with animated facts ----
let _slFactTimer = null;
function slShowLoadingScreen() {
  slShowScreen('slLoadingScreen');
  const lang = SL.lang || 'ar';
  const facts = SL_FACTS[lang] || SL_FACTS['ar'];
  const factEl = document.getElementById('slLoadingFact');
  const titleEl = document.getElementById('slLoadingTitle');
  const subEl = document.getElementById('slLoadingSubtitle');

  // Localize loading text
  if (lang === 'en') {
    if (titleEl) titleEl.textContent = 'Summoning questions from the cosmos...';
    if (subEl) subEl.textContent = 'Gathering professional astronomy questions just for you';
  } else if (lang === 'de') {
    if (titleEl) titleEl.textContent = 'Fragen aus dem Kosmos werden geladen...';
    if (subEl) subEl.textContent = 'Professionelle Astronomiefragen werden für dich gesammelt';
  } else {
    if (titleEl) titleEl.textContent = 'جاري استدعاء الأسئلة من الكون...';
    if (subEl) subEl.textContent = 'نحن نجمع أسئلة فلكية احترافية خصيصاً لك';
  }

  // Rotate fun facts every 3s
  let factIdx = Math.floor(Math.random() * facts.length);
  if (factEl) factEl.textContent = facts[factIdx];
  if (_slFactTimer) clearInterval(_slFactTimer);
  _slFactTimer = setInterval(() => {
    factIdx = (factIdx + 1) % facts.length;
    if (factEl) {
      factEl.style.opacity = '0';
      setTimeout(() => {
        if (factEl) { factEl.textContent = facts[factIdx]; factEl.style.opacity = '1'; }
      }, 300);
    }
  }, 3000);
}
function slHideLoadingScreen() {
  if (_slFactTimer) { clearInterval(_slFactTimer); _slFactTimer = null; }
}

// ---- Load a stage — show loading immediately, fetch in background ----
async function slLoadStage() {
  SL.stageCorrect = 0;
  SL.stageXP = 0;
  SL.currentQ = 0;

  // Show loading screen immediately — never keep user waiting silently
  slShowLoadingScreen();

  // Fetch questions
  await slFetchAPI();
  slHideLoadingScreen();

  // If still not enough questions, show error
  if (SL.unusedPool.length < SL.PER_STAGE) {
    const factEl = document.getElementById('slLoadingFact');
    const titleEl = document.getElementById('slLoadingTitle');
    if (titleEl) titleEl.textContent = SL.lang === 'ar' ? '⚠️ تعذّر تحميل الأسئلة' : SL.lang === 'de' ? '⚠️ Laden fehlgeschlagen' : '⚠️ Failed to load questions';
    if (factEl) factEl.textContent = SL.lang === 'ar' ? 'تأكد من اتصالك بالإنترنت وأعد المحاولة' : SL.lang === 'de' ? 'Bitte Internetverbindung prüfen und erneut versuchen' : 'Please check your internet connection and try again';
    return;
  }

  // Pick PER_STAGE questions and start
  SL.stageQuestions = SL.unusedPool.splice(0, SL.PER_STAGE).map(q => slShuffleQ(q));
  slShowScreen('slQuestionScreen');
  slRenderQuestion();
}

// ---- Keywords that MUST appear for a question to be astronomy-related ----
const SL_SPACE_KEYWORDS = [
  // EN
  'star','planet','galaxy','universe','cosmos','space','moon','sun','solar','orbit','comet','asteroid',
  'nebula','black hole','supernova','neutron','pulsar','quasar','telescope','nasa','esa','astronaut',
  'spacecraft','satellite','meteor','aurora','gravity','light-year','parsec','redshift','exoplanet',
  'milky way','andromeda','hubble','jupiter','saturn','mars','venus','mercury','neptune','uranus',
  'pluto','asteroid belt','oort','kuiper','big bang','dark matter','dark energy','inflation','cosmic',
  'astronomical','astrophysics','interstellar','intergalactic','stellar','celestial','photon','radiation',
  'spectrum','wavelength','luminosity','magnitude','eclipse','transit','parallax','doppler',
  // AR
  'نجم','كوكب','مجرة','كون','فضاء','قمر','شمس','مدار','مذنب','كويكب','سديم','ثقب أسود','مستعر',
  'نيوتروني','تلسكوب','رائد فضاء','مركبة فضائية','قمر صناعي','شهاب','جاذبية','سنة ضوئية',
  'المشتري','زحل','المريخ','الزهرة','عطارد','نبتون','أورانوس','بلوتو','درب التبانة','أندروميدا',
  'انفجار كبير','مادة مظلمة','طاقة مظلمة','فلك','فلكي','نجمي','كوني','فوتون','إشعاع',
  'طيف','كسوف','خسوف','بارسك','كوازار','بولسار','هابل','ناسا',
  // DE
  'stern','planet','galaxie','universum','weltraum','mond','sonne','orbit','komet','asteroid',
  'nebel','schwarzes loch','supernova','neutron','teleskop','astronaut','raumsonde','satellit',
  'meteor','schwerkraft','lichtjahr','jupiter','saturn','mars','venus','merkur','neptun','uranus',
  'pluto','milchstraße','urknall','dunkle materie','dunkle energie','astronomie','astrophysik'
];

function slIsAstronomyQuestion(q, correct, incorrects) {
  const text = (q + ' ' + correct + ' ' + incorrects.join(' ')).toLowerCase();
  return SL_SPACE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ---- Fetch astronomy questions via Claude API ----
async function slFetchAPI() {
  const diffMap = {beginner:'easy', intermediate:'medium', advanced:'hard', expert:'expert'};
  const diff = diffMap[SL.level] || 'medium';
  const lang = SL.lang || 'ar';
  const langLabel = { ar: 'Arabic', en: 'English', de: 'German' }[lang] || 'Arabic';

  // Specific astronomy subtopics that rotate each stage
  const topicSets = [
    'the 8 planets of the solar system, their moons and properties',
    'stars: types (dwarf, giant, supergiant), life cycle, fusion, stellar evolution',
    'black holes, neutron stars, pulsars, quasars, supernovae',
    'galaxies: Milky Way, Andromeda, spiral/elliptical/irregular, galaxy clusters',
    'space exploration: NASA, ESA missions, ISS, Apollo, Mars rovers, telescopes (Hubble, Webb)',
    'cosmology: Big Bang, cosmic inflation, CMB, expansion of the universe',
    'exoplanets, stellar distances, light-years, parsecs, Doppler effect, spectroscopy',
    'orbital mechanics, gravity, Kepler laws, tides, eclipses, transits',
    'comets, asteroids, meteor showers, Kuiper belt, Oort cloud',
    'dark matter, dark energy, gravitational lensing, relativity in astronomy',
  ];
  const topics = topicSets[(SL.stage - 1) % topicSets.length];

  const diffDesc = {
    easy: 'beginner level — simple facts, well-known objects, no equations',
    medium: 'intermediate level — requires understanding of concepts, some terminology',
    hard: 'advanced level — detailed scientific knowledge, precise values, technical concepts',
    expert: 'expert level — deep astrophysics, cutting-edge research, quantitative details'
  }[diff] || 'intermediate level';

  const langInstruction = lang === 'ar'
    ? 'اكتب كل شيء باللغة العربية فقط. ممنوع أي كلمة إنجليزية في الأسئلة أو الإجابات أو الشروح.'
    : 'Write everything in ' + langLabel + ' only.';

  const systemPrompt = `You are an ASTRONOMY-ONLY quiz generator.

RULES:
1. ONLY astronomy/space topics — no exceptions.
2. FORBIDDEN: chemistry, biology, geography, history, literature, sports, politics, food, medicine.
3. LANGUAGE: You MUST write ALL text ONLY in the requested language. Arabic requests = Arabic script only, zero English words.
4. Return ONLY a valid JSON array. No markdown, no fences, no extra text.
5. Complete the full array — never stop in the middle.

Format: [{"q":"question","correct":"answer","incorrects":["w1","w2","w3"],"exp":"explanation"}]`;

  const userPrompt = `Generate 15 astronomy questions. Topic: ${topics}. Difficulty: ${diffDesc}.
LANGUAGE: ${langLabel} — ${langInstruction}
Output ONLY the JSON array starting with [`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) throw new Error('API ' + response.status);
    const data = await response.json();
    const fullText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = fullText.replace(/```json|```/g, '').trim();
    const si = clean.indexOf('['), ei = clean.lastIndexOf(']');
    if (si === -1 || ei === -1) throw new Error('No JSON');
    const items = JSON.parse(clean.slice(si, ei + 1));
    if (!Array.isArray(items) || items.length === 0) throw new Error('Empty');

    const converted = items
      .filter(it => {
        if (!it.q || !it.correct || !Array.isArray(it.incorrects) || it.incorrects.length < 3) return false;
        // Client-side astronomy filter — reject anything not space-related
        return slIsAstronomyQuestion(it.q, it.correct, it.incorrects);
      })
      .map(it => {
        const opts = slShuffle([it.correct, ...it.incorrects.slice(0, 3)]);
        return { q: it.q, icon: '🌌', opts, ans: opts.indexOf(it.correct), exp: it.exp || it.correct, fromAPI: true };
      });

    const existing = new Set(SL.unusedPool.map(q => q.q));
    const fresh = converted.filter(q => !existing.has(q.q));
    SL.unusedPool = [...SL.unusedPool, ...fresh];
    console.log(`✅ Got ${fresh.length} astronomy questions (filtered from ${items.length})`);
    return fresh.length > 0;

  } catch(e) {
    console.warn('Claude API error:', e);
    return await slFetchOpenTDB(diff, lang);
  }
}

// ---- Fallback: OpenTDB (space/science category) ----
async function slFetchOpenTDB(diff, lang) {
  try {
    // category=17 = Science & Nature (closest to space in OpenTDB)
    const res = await fetch(
      `https://opentdb.com/api.php?amount=20&category=17&difficulty=${diff === 'expert' ? 'hard' : diff}&type=multiple`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data.response_code === 0 && data.results && data.results.length > 0) {
      let items = data.results.map(r => {
        const correct = slDecodeHTML(r.correct_answer);
        const incorrects = r.incorrect_answers.map(slDecodeHTML);
        return { q: slDecodeHTML(r.question), correct, incorrects };
      });
      if (lang !== 'en') {
        items = await slTranslateQuestions(items, lang);
      }
      const correctLabel = lang === 'ar' ? '✅ الإجابة الصحيحة' : lang === 'de' ? '✅ Richtige Antwort' : '✅ Correct answer';
      const converted = items.map(item => {
        const opts = slShuffle([item.correct, ...item.incorrects]);
        return { q: item.q, icon: '🌌', opts, ans: opts.indexOf(item.correct), exp: `${correctLabel}: ${item.correct}`, fromAPI: true };
      });
      const existing = new Set(SL.unusedPool.map(q => q.q));
      const fresh = converted.filter(q => !existing.has(q.q));
      SL.unusedPool = [...SL.unusedPool, ...fresh];
      return true;
    }
  } catch(e) { console.warn('slFetchOpenTDB error:', e); }
  return false;
}

// ---- Translate questions via Groq API ----
async function slTranslateQuestions(items, lang) {
  const targetName = lang === 'ar' ? 'Arabic' : 'German';
  const apiKey = (typeof getAiApiKey === 'function') ? getAiApiKey() : '';
  if (!apiKey) { console.warn('No API key, skipping translation'); return items; }

  // Translate in chunks of 10 to avoid token limits
  const CHUNK = 10;
  const result = [...items];

  for (let start = 0; start < items.length; start += CHUNK) {
    const chunk = items.slice(start, start + CHUNK);
    const payload = chunk.map((it, i) => ({ id: start + i, q: it.q, correct: it.correct, incorrects: it.incorrects }));

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2000,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: 'You are a precise translator specializing in astronomy. Translate quiz questions to ' + targetName + '. Return ONLY a valid JSON array, no markdown, no extra text. Each element must have: id (number), q (string), correct (string), incorrects (array of 3 strings).'
            },
            {
              role: 'user',
              content: 'Translate to ' + targetName + ': ' + JSON.stringify(payload)
            }
          ]
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) { console.warn('Groq translate error:', resp.status); continue; }
      const d = await resp.json();
      const raw = (d.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      const translated = JSON.parse(raw);
      translated.forEach(t => {
        if (typeof t.id === 'number' && t.q && t.correct && Array.isArray(t.incorrects)) {
          result[t.id] = { q: t.q, correct: t.correct, incorrects: t.incorrects };
        }
      });
    } catch(e) {
      console.warn('Chunk translation failed:', e);
    }
  }
  return result;
}

// ---- Render Question ----
function slRenderQuestion() {
  const q = SL.stageQuestions[SL.currentQ];
  const total = SL.stageQuestions.length;

  // Header: stage + question number
  const t = slT();
  document.getElementById('slQNum').textContent =
    `${t.stage} ${SL.stage} — ${t.question} ${SL.currentQ + 1} ${t.of} ${total}` +
    (q.fromAPI ? '  🌐' : '');
  document.getElementById('slQIcon').textContent = q.icon || '⭐';
  document.getElementById('slQText').textContent = q.q;

  // Progress bar within stage
  document.getElementById('slProgressFill').style.width = ((SL.currentQ / total) * 100) + '%';

  // Options — already shuffled at load time
  const letters = t.optionLetters;
  const optsEl = document.getElementById('slOptions');
  optsEl.innerHTML = '';
  q.opts.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = 'sl-option';
    div.innerHTML = `<span class="sl-option-letter">${letters[i]}</span><span>${opt}</span>`;
    div.onclick = () => { SLSound.select(); slAnswer(i, div); };
    optsEl.appendChild(div);
  });

  // Reset feedback
  SL.answered = false;
  const fb = document.getElementById('slFeedback');
  fb.style.display = 'none';
  fb.className = 'sl-feedback';
  document.getElementById('slNextBtn').style.display = 'none';

  // Icon animation
  const iconEl = document.getElementById('slQIcon');
  iconEl.style.animation = 'none';
  setTimeout(() => { iconEl.style.animation = 'slQIconPop .5s cubic-bezier(.34,1.56,.64,1)'; }, 10);
}

// ---- Answer ----
function slAnswer(idx, el) {
  if (SL.answered) return;
  SL.answered = true;

  const q = SL.stageQuestions[SL.currentQ];
  const isCorrect = idx === q.ans;
  const opts = document.querySelectorAll('.sl-option');
  opts.forEach(o => { o.onclick = null; });

  if (isCorrect) {
    el.classList.add('correct');
    SL.correctCount++;
    SL.stageCorrect++;
    SL.streak++;
    const earned = slCalcXP();
    SL.xp += earned;
    SL.sessionXP += earned;
    SL.stageXP += earned;
    SLSound.correct();
    slShowFeedback(true, q.exp);
    slSpawnParticles(el);
    slShowXPPopup(earned, el);
    slCorrectBurst(el);
    if (SL.streak > SL.bestStreak) {
      SL.bestStreak = SL.streak;
      localStorage.setItem('sl_bestStreak', SL.bestStreak);
      const si = document.querySelector('.sl-streak-icon');
      if (si) { si.classList.add('sl-streak-fire'); setTimeout(()=>si.classList.remove('sl-streak-fire'),1000); }
    }
  } else {
    el.classList.add('wrong');
    opts[q.ans].classList.add('reveal-correct');
    SL.hearts = Math.max(0, SL.hearts - 1);
    SL.streak = 0;
    SL.wrongCount++;
    SLSound.wrong();
    slShowFeedback(false, q.exp);
    slHeartBreak();
  }

  slUpdateStats();
  document.getElementById('slNextBtn').style.display = 'block';
  if (isCorrect) setTimeout(() => { if (SL.answered) slNextQuestion(); }, 1800);
}

function slCalcXP() {
  const base = {beginner:10, intermediate:20, advanced:35, expert:50};
  return (base[SL.level] || 10) + Math.min(SL.streak, 5) * 2;
}

function slShowFeedback(correct, explanation) {
  const fb = document.getElementById('slFeedback');
  const t = slT();
  fb.style.display = 'flex';
  fb.className = 'sl-feedback ' + (correct ? 'correct-fb' : 'wrong-fb');
  document.getElementById('slFbIcon').textContent = correct ? '✅' : '❌';
  document.getElementById('slFbTitle').textContent = correct
    ? (SL.streak >= 3 ? t.streakMsg(SL.streak) : t.correct)
    : t.wrong;
  document.getElementById('slFbSub').textContent = explanation;
}

// ---- Next question / Stage end ----
function slNextQuestion() {
  SL.currentQ++;
  if (SL.hearts <= 0) {
    slShowGameOver();
    return;
  }
  if (SL.currentQ >= SL.stageQuestions.length) {
    slShowStageComplete();
  } else {
    slRenderQuestion();
  }
}

// ---- Stage Complete screen ----
function slShowStageComplete() {
  // Save session stats
  SL.totalXP += SL.stageXP;
  SL.totalSessions++;
  // ── XP يروح Firebase فقط (مش localStorage) لمنع التلاعب ──
  localStorage.setItem('sl_totalSessions', SL.totalSessions);
  localStorage.setItem('sl_bestStreak', SL.bestStreak);
  if (window.lbAddXP) window.lbAddXP(SL.stageXP);
  if (typeof addPoints === 'function' && typeof currentUserId !== 'undefined' && currentUserId) {
    addPoints(currentUserId, SL.stageXP, 'Self-Learning مرحلة ' + SL.stage).catch(function(){});
  }

  // Populate screen
  const emojis = ['🎯','🚀','🌟','🏆','⭐','🔥','💫','🌌','🎉','🌠'];
  const t = slT();
  document.getElementById('slStageEmoji').textContent = emojis[(SL.stage - 1) % emojis.length];
  document.getElementById('slStageTitle').textContent = t.stageComplete(SL.stage);
  const accuracy = Math.round((SL.stageCorrect / SL.stageQuestions.length) * 100);
  document.getElementById('slStageSub').textContent =
    accuracy >= 80 ? t.accuracyHigh : accuracy >= 50 ? t.accuracyMid : t.accuracyLow;
  document.getElementById('slStageCorrCount').textContent = `${SL.stageCorrect}/${SL.stageQuestions.length}`;
  document.getElementById('slStageXPCount').textContent = '+' + SL.stageXP;
  document.getElementById('slStageStreakCount').textContent = SL.streak;
  document.getElementById('slFetchingNotice').style.display = 'none';

  // Progress bar full then reset
  document.getElementById('slProgressFill').style.width = '100%';

  slShowScreen('slStageScreen');
  if (accuracy >= 70) slConfettiBurst();
  // Show progress badge on stage screen too
  slShowProgressBadge(accuracy, SL.totalXP, SL.level);
  // Sound: legendary for expert + high accuracy, otherwise stage complete fanfare
  const isLegendary = (SL.level === 'expert' && accuracy >= 80) || accuracy === 100;
  setTimeout(() => isLegendary ? SLSound.legendary() : SLSound.stageComplete(), 150);
}

// ---- Continue to next stage ----
async function slContinueToNextStage() {
  SL.stage++;
  if (SL.hearts < 5) SL.hearts = Math.min(5, SL.hearts + 2);
  slUpdateStats();
  document.getElementById('slProgressFill').style.width = '0%';
  await slLoadStage();
}

// ---- Progress Badge Helper ----
function slShowProgressBadge(accuracy, totalXP, level) {
  const badge = document.getElementById('slProgressBadge');
  const badgeEmoji = document.getElementById('slProgressBadgeEmoji');
  const badgeTitle = document.getElementById('slProgressBadgeTitle');
  const badgeDesc = document.getElementById('slProgressBadgeDesc');
  if (!badge) return;

  // Determine progress tier based on accuracy + XP + level
  const levelWeight = {beginner:0, intermediate:25, advanced:50, expert:75};
  const score = accuracy + (levelWeight[level] || 0) + Math.min(totalXP / 10, 25);
  const t = slT();

  let tierIdx, color, bg;
  if (score >= 140) {
    tierIdx = 4; color = '#fde047';
    bg = 'linear-gradient(135deg,rgba(253,224,71,.18),rgba(245,158,11,.12))';
  } else if (score >= 110) {
    tierIdx = 3; color = '#06b6d4';
    bg = 'linear-gradient(135deg,rgba(6,182,212,.18),rgba(14,165,233,.12))';
  } else if (score >= 75) {
    tierIdx = 2; color = '#a78bfa';
    bg = 'linear-gradient(135deg,rgba(167,139,250,.18),rgba(139,92,246,.12))';
  } else if (score >= 40) {
    tierIdx = 1; color = '#10b981';
    bg = 'linear-gradient(135deg,rgba(16,185,129,.18),rgba(5,150,105,.12))';
  } else {
    tierIdx = 0; color = '#8b8aa0';
    bg = 'linear-gradient(135deg,rgba(139,138,160,.12),rgba(100,116,139,.08))';
  }

  const tier = t.badgeTiers[tierIdx];
  const emoji = tier.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu)?.[0] || '⭐';
  const desc = t.badgeDescs[tierIdx];

  badge.style.background = bg;
  badge.style.border = `1px solid ${color}40`;
  badgeEmoji.textContent = emoji;
  badgeTitle.textContent = tier;
  badgeTitle.style.color = color;
  badgeDesc.textContent = desc;

  // Update stage screen mini badge too
  const stageBadgeTitle = document.getElementById('slStageBadgeTitle');
  if (stageBadgeTitle) { stageBadgeTitle.textContent = tier; stageBadgeTitle.style.color = color; }
  // Legendary sound for top tier badge
  if (tierIdx === 4) setTimeout(() => SLSound.legendary(), 300);
}

// ---- Game Over (lost all hearts) ----
function slShowGameOver() {
  SL.totalXP += SL.stageXP;
  SL.totalSessions++;
  // ── XP يروح Firebase فقط ──
  localStorage.setItem('sl_totalSessions', SL.totalSessions);
  localStorage.setItem('sl_bestStreak', SL.bestStreak);
  if (window.lbAddXP && SL.stageXP > 0) window.lbAddXP(SL.stageXP);
  if (typeof addPoints === 'function' && typeof currentUserId !== 'undefined' && currentUserId && SL.stageXP > 0) {
    addPoints(currentUserId, SL.stageXP, 'Self-Learning مرحلة ' + SL.stage + ' (game over)').catch(function(){});
  }

  const total = SL.currentQ;
  const accuracy = total > 0 ? Math.round((SL.correctCount / total) * 100) : 0;
  const t = slT();
  document.getElementById('slResultMascot').textContent = '💔';
  document.getElementById('slResultTitle').textContent = t.gameOverTitle;
  document.getElementById('slResultSub').textContent = t.gameOverSub(SL.stage);
  document.getElementById('slResCorrect').textContent = SL.correctCount + '/' + total;
  document.getElementById('slResXP').textContent = '+' + SL.sessionXP;
  document.getElementById('slResAccuracy').textContent = accuracy + '%';
  document.getElementById('slLevelUpMsg').style.display = 'none';
  document.getElementById('slProgressFill').style.width = '100%';
  slShowProgressBadge(accuracy, SL.totalXP, SL.level);
  slShowScreen('slResultScreen');
  setTimeout(() => SLSound.gameOver(), 100);
}

// ---- Stats Update ----
function slUpdateStats() {
  const h = Math.max(0, SL.hearts);
  document.getElementById('slHeartsIcons').textContent = '❤️'.repeat(h) + '🖤'.repeat(Math.max(0, 5 - h));
  document.getElementById('slXpVal').textContent = SL.xp;
  document.getElementById('slStreakVal').textContent = SL.streak;
}

// ---- Result screen buttons ----
function slPlayAgain() { startSelfLearning(SL.level); }
function slChangeLevel() {
  document.getElementById('slStatsBar').style.display = 'none';
  slShowScreen('slWelcomeScreen');
  slLoadPrevStats();
}

// ---- Animations ----
function slSpawnParticles(el) {
  const container = document.getElementById('slParticles');
  container.style.display = 'block';
  const rect = el.getBoundingClientRect();
  const colors = ['#10b981','#06b6d4','#fde047','#a78bfa','#f43f5e','#fff'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'sl-particle';
    p.style.cssText = `
      left:${rect.left + Math.random() * rect.width}px;
      top:${rect.top + Math.random() * rect.height}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      transform:translate(${(Math.random()-0.5)*80}px, ${(Math.random()-0.5)*80}px);
      animation-delay:${Math.random() * 0.2}s;
      animation-duration:${0.6 + Math.random() * 0.4}s;
      width:${6 + Math.random() * 8}px;
      height:${6 + Math.random() * 8}px;
    `;
    container.appendChild(p);
  }
  setTimeout(() => {
    container.innerHTML = '';
    container.style.display = 'none';
  }, 1200);
}

function slShowXPPopup(xp, el) {
  const rect = el.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'sl-xp-popup';
  popup.textContent = '+' + xp + ' XP';
  popup.style.left = (rect.left + rect.width / 2) + 'px';
  popup.style.top = (rect.top - 10) + 'px';
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1400);
}

function slCorrectBurst(el) {
  const rect = el.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'sl-correct-burst';
  burst.style.left = (rect.left + rect.width / 2) + 'px';
  burst.style.top = (rect.top + rect.height / 2) + 'px';
  const ring = document.createElement('div');
  ring.className = 'sl-burst-ring';
  burst.appendChild(ring);
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 700);
}

function slHeartBreak() {
  const heartsEl = document.getElementById('slHeartsIcons');
  heartsEl.classList.add('sl-heart-break');
  setTimeout(() => heartsEl.classList.remove('sl-heart-break'), 600);
}

function slConfettiBurst() {
  const container = document.getElementById('slParticles');
  container.style.display = 'block';
  const colors = ['#10b981','#06b6d4','#fde047','#a78bfa','#f43f5e','#ff6b6b','#4ecdc4','#ffe66d'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:absolute;
      left:${Math.random() * 100}%;
      top:${50 + Math.random() * 40}%;
      width:${8 + Math.random() * 8}px;
      height:${8 + Math.random() * 8}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      animation:slParticleFly ${1 + Math.random() * 1}s ease-out ${Math.random() * 0.5}s forwards;
      transform:translate(${(Math.random()-0.5)*200}px,${(Math.random()-0.5)*100}px);
    `;
    container.appendChild(p);
  }
  setTimeout(() => {
    container.innerHTML = '';
    container.style.display = 'none';
  }, 2500);
}

function slStopAllAnimations() {
  const container = document.getElementById('slParticles');
  if (container) { container.innerHTML = ''; container.style.display = 'none'; }
  document.querySelectorAll('.sl-xp-popup,.sl-correct-burst').forEach(el => el.remove());
}


/* ========================================== */


  function openPwaModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (!modal) return;
    // تحديد نوع الجهاز
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    document.getElementById('pwaAndroidSteps').style.display = isIOS ? 'none' : 'block';
    document.getElementById('pwaIOSSteps').style.display = isIOS ? 'block' : 'none';
    // لو في deferredPrompt (Chrome Android) اعرض زر التثبيت المباشر
    const directBtn = document.getElementById('pwaDirectInstallBtn');
    if (directBtn) directBtn.style.display = (deferredPrompt && !isIOS) ? 'flex' : 'none';
    // زرار APK — يظهر لو Android وملوش deferredPrompt
    const apkBtn = document.getElementById('pwaApkDownloadBtn');
    if (apkBtn) apkBtn.style.display = (!isIOS) ? 'flex' : 'none';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closePwaModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  function triggerDirectInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          pwaInstalled = true;
          showToast('✅ تم تثبيت التطبيق بنجاح!');
          closePwaModal();
        }
        deferredPrompt = null;
        updateAdminUI();
      });
    }
  }


/* ========================================== */


  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => console.log("SW registered", reg))
      .catch(err => console.log("SW error", err));
  }


/* ========================================== */


(function() {
  'use strict';

  // ===== 1. تعريف الشخصيات =====
  const AI_PERSONAS = [
    {
      id: 'cosmos',
      name: 'كوزموس',
      emoji: '🚀',
      desc: 'مساعد فلكي محترف — يجيبك بعلم وإثارة',
      systemPrompt: 'أنت كوزموس، مساعد فلكي خبير ومتحمس. تجيب بدقة علمية وبشكل مشوّق. تتكلم بأي لغة يستخدمها المستخدم. أكمل ردك دائماً حتى النهاية ولا تتوقف في المنتصف.',
      voiceStyle: { rate: 0.92, pitch: 0.85 },
      groqVoice: 'Fritz-PlayAI',   // صوت رجالي عميق وجدي
      badge: 'كل اللغات'
    },
    {
      id: 'orion',
      name: 'أوريون',
      emoji: '⭐',
      desc: 'معلم هادئ ومبسّط — يشرح الصعب ببساطة',
      systemPrompt: 'أنت أوريون، معلم هادئ وصبور. تشرح الأمور ببساطة وبأمثلة واضحة. تتكلم بأي لغة يستخدمها المستخدم. أكمل ردك دائماً حتى النهاية ولا تتوقف في المنتصف.',
      voiceStyle: { rate: 0.88, pitch: 0.80 },
      groqVoice: 'Calum-PlayAI',   // صوت هادئ ومريح
      badge: 'كل اللغات'
    },
    {
      id: 'nova',
      name: 'نوفا',
      emoji: '💫',
      desc: 'مساعد سريع ومباشر — إجابات موجزة ودقيقة',
      systemPrompt: 'أنت نوفا، مساعد ذكي وسريع. إجاباتك مباشرة ودقيقة ومكتملة. تتكلم بأي لغة يستخدمها المستخدم. أكمل ردك دائماً حتى النهاية ولا تتوقف في المنتصف.',
      voiceStyle: { rate: 1.0, pitch: 0.88 },
      groqVoice: 'Aaliyah-PlayAI', // صوت أنثوي نابض بالحياة
      badge: 'كل اللغات'
    },
    {
      id: 'galaxy',
      name: 'جالكسي',
      emoji: '🌌',
      desc: 'مستكشف الكون — يروي قصص الفضاء بأسلوب رائع',
      systemPrompt: 'أنت جالكسي، راوي قصص الفضاء. إجاباتك مليئة بالإثارة والتشويق والمعلومات الرائعة. تتكلم بأي لغة يستخدمها المستخدم. أكمل ردك دائماً حتى النهاية ولا تتوقف في المنتصف.',
      voiceStyle: { rate: 0.85, pitch: 0.78 },
      groqVoice: 'Angelo-PlayAI',  // صوت حكّاء رائع
      badge: 'كل اللغات'
    }
  ];

  // ===== 2. localStorage helpers =====
  var PKEY  = 'falak_ai_persona_id';
  var VKEY  = 'falak_ai_voice_uri';
  function getSavedId()     { try { return localStorage.getItem(PKEY); } catch(e){ return null; } }
  function savePId(id)      { try { localStorage.setItem(PKEY, id); } catch(e){} }
  function getSavedVURI()   { try { return localStorage.getItem(VKEY); } catch(e){ return null; } }
  function saveVURI(uri)    { try { if(uri) localStorage.setItem(VKEY, uri); } catch(e){} }

  // ===== 3. الشخصية الحالية =====
  var _persona = null;
  var _modalSel = null;
  var _voices   = [];
  var _selVoice = null;
  var _speakBtn = null;
  var _huaweiT  = null;

  function getById(id) { return AI_PERSONAS.find(function(p){ return p.id === id; }) || AI_PERSONAS[0]; }

  window.getCurrentAIPersona = function() {
    if (!_persona) { var s = getSavedId(); _persona = s ? getById(s) : null; }
    return _persona;
  };
  window.getAISystemPrompt = function() {
    var p = window.getCurrentAIPersona();
    return p ? p.systemPrompt : 'أنت مساعد فلكي ذكي. أجب بوضوح ودقة. تتكلم بأي لغة يستخدمها المستخدم.';
  };

  // ===== 4. تحميل الأصوات (هواوي compatible) =====
  function loadVoices() {
    var synth = window.speechSynthesis;
    if (!synth) return;
    function doLoad() {
      var v = synth.getVoices();
      if (v && v.length > 0) { _voices = v; pickBestVoice(); }
    }
    doLoad();
    if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = doLoad;
    // Huawei retry
    var tries = 0;
    var iv = setInterval(function() {
      if (_voices.length > 0 || tries > 20) { clearInterval(iv); return; }
      doLoad(); tries++;
    }, 250);
  }

  // اختيار أفضل صوت رجالي
  function pickBestVoice() {
    if (!_voices.length) return;
    var saved = getSavedVURI();
    if (saved) { var sv = _voices.find(function(v){ return v.voiceURI === saved; }); if (sv) { _selVoice = sv; return; } }

    var tests = [
      function(v){ return /ar/i.test(v.lang) && /male|man/i.test(v.name); },
      function(v){ return /ar/i.test(v.lang); },
      function(v){ return /google/i.test(v.name) && /en/i.test(v.lang); },
      function(v){ return /microsoft/i.test(v.name); },
      function(v){ return /google/i.test(v.name); },
      function(v){ return /david|mark|daniel|james|alex/i.test(v.name); },
      function(v){ return /en/i.test(v.lang); },
      function(v){ return true; }
    ];
    for (var i = 0; i < tests.length; i++) {
      var m = _voices.find(tests[i]);
      if (m) { _selVoice = m; saveVURI(m.voiceURI); return; }
    }
  }

  // ===== 5. اكتشاف اللغة =====
  function detectLang(text) {
    if (!text) return 'ar-SA';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar-SA';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
    if (/[\u3040-\u30FF]/.test(text)) return 'ja-JP';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr-FR';
    if (/[äöüß]/i.test(text)) return 'de-DE';
    if (/[áéíóúüñ]/i.test(text)) return 'es-ES';
    if (/[çğışöü]/i.test(text)) return 'tr-TR';
    return 'en-US';
  }

  function getVoiceForLang(lang) {
    if (!_voices.length) return _selVoice;
    var base = lang.split('-')[0].toLowerCase();
    var m = _voices.find(function(v){ return v.lang.toLowerCase().startsWith(base); });
    return m || _selVoice;
  }

  // ===== 6. Groq TTS — مجاني وأصوات AI حقيقية =====
  var _ttsAudio   = null;
  var _ttsBtn     = null;
  var _ttsActive  = false;

  function cleanForTTS(text) {
    return (text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`+([^`]*)`+/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function stopGroqTTS() {
    _ttsActive = false;
    if (_ttsAudio) {
      try { _ttsAudio.pause(); _ttsAudio.src = ''; } catch(e){}
      _ttsAudio = null;
    }
    if (_ttsBtn) {
      _ttsBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      _ttsBtn.classList.remove('muted');
      _ttsBtn = null;
    }
  }
  window.stopAllAISpeech = stopGroqTTS;

  window.aiSpeak = async function(text, btn) {
    if (btn && _ttsBtn === btn && _ttsActive) { stopGroqTTS(); return; }
    stopGroqTTS();

    var key = (typeof getAiApiKey === 'function') ? getAiApiKey() : '';
    if (!key) {
      if (typeof showToast === 'function') showToast('⚠️ ادخل مفتاح Groq API أولاً');
      if (typeof openAiKeyModal === 'function') openAiKeyModal();
      return;
    }

    var clean = cleanForTTS(text);
    if (!clean) return;

    var p = window.getCurrentAIPersona() || AI_PERSONAS[0];

    // اختيار الموديل والصوت حسب اللغة
    var isArabic = /[\u0600-\u06FF]/.test(clean);
    var model, voice;

    if (isArabic) {
      // موديل عربي سعودي — 4 أصوات متاحة
      model = 'canopylabs/orpheus-arabic-saudi';
      var arabicVoices = { cosmos: 'abdullah', orion: 'sultan', nova: 'noura', galaxy: 'lulwa' };
      voice = arabicVoices[p.id] || 'abdullah';
    } else {
      // موديل إنجليزي — 6 أصوات
      model = 'canopylabs/orpheus-v1-english';
      var englishVoices = { cosmos: 'tara', orion: 'leo', nova: 'mia', galaxy: 'dan' };
      voice = englishVoices[p.id] || 'tara';
    }

    _ttsActive = true;
    _ttsBtn    = btn || null;

    if (btn) {
      btn.innerHTML = '<span class="ai-speaking-wave"><span></span><span></span><span></span><span></span></span><i class="fas fa-stop"></i>';
      btn.classList.add('muted');
    }

    try {
      var resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          voice: voice,
          input: clean.slice(0, 3000),
          response_format: isArabic ? 'wav' : 'mp3'
        })
      });

      if (!resp.ok) {
        var err = await resp.json().catch(function(){ return {}; });
        var msg = (err.error && err.error.message) || ('HTTP ' + resp.status);
        console.warn('[TTS] Groq failed, trying ElevenLabs...', msg);
        await tryElevenLabsTTS(clean, btn, isArabic);
        return;
      }

      if (!_ttsActive) return;

      var blob  = await resp.blob();
      var url   = URL.createObjectURL(blob);
      var audio = new Audio(url);
      _ttsAudio = audio;

      audio.onended = function() { URL.revokeObjectURL(url); stopGroqTTS(); };
      audio.onerror = function() { URL.revokeObjectURL(url); stopGroqTTS(); };
      audio.play().catch(function(e) {
        console.warn('[TTS] play failed:', e);
        stopGroqTTS();
      });

    } catch(e) {
      console.error('[TTS] Groq error:', e);
      await tryElevenLabsTTS(clean, btn, isArabic);
    }
  };

  // ===== ElevenLabs Fallback TTS =====
  var ELEVENLABS_KEY = 'sk_fb9731db4191c0001f2b6609b4c0982d7fc9e5ca7c4a9455';
  // أصوات ElevenLabs — صوت مختلف لكل شخصية (multilingual يدعم العربي)
  var EL_VOICES = {
    cosmos:  'pNInz6obpgDQGcFmaJgB', // Adam  — رجالي عميق (كوزموس)
    orion:   'VR6AewLTigWG4xSOukaG', // Arnold — رجالي هادئ (أوريون)
    nova:    'EXAVITQu4vr4xnSDxMaL', // Sarah  — أنثوي (نوفا)
    galaxy:  'onwK4e9ZLuTAKqWW03F9'  // Daniel — رجالي حكّاء (جالكسي)
  };

  async function tryElevenLabsTTS(text, btn, isArabic) {
    if (!_ttsActive) return;
    try {
      var p = window.getCurrentAIPersona() || AI_PERSONAS[0];
      var voiceId = EL_VOICES[p.id] || EL_VOICES.cosmos;

      var resp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.slice(0, 2500),
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });

      if (!resp.ok) {
        var errData = await resp.json().catch(function(){ return {}; });
        var errMsg = errData.detail && errData.detail.message ? errData.detail.message : (errData.detail || JSON.stringify(errData));
        if (typeof showToast === 'function') showToast('ElevenLabs خطأ ' + resp.status + ': ' + errMsg);
        stopGroqTTS();
        return;
      }

      if (!_ttsActive) return;

      var blob = await resp.blob();
      var url  = URL.createObjectURL(blob);
      var audio = new Audio(url);
      _ttsAudio = audio;
      _ttsBtn   = btn || null;

      if (btn) {
        btn.innerHTML = '<span class="ai-speaking-wave"><span></span><span></span><span></span><span></span></span><i class="fas fa-stop"></i>';
        btn.classList.add('muted');
      }

      audio.onended = function() { URL.revokeObjectURL(url); stopGroqTTS(); };
      audio.onerror = function() { URL.revokeObjectURL(url); stopGroqTTS(); };
      audio.play().catch(function(e) {
        console.warn('[TTS] ElevenLabs play failed:', e);
        stopGroqTTS();
      });

    } catch(e) {
      console.error('[TTS] ElevenLabs error:', e);
      stopGroqTTS();
    }
  }

  // ===== 7. زرار الصوت على رسائل AI =====
  window.addAIMuteButton = function(msgEl, text) {
    if (!msgEl || !text || msgEl.querySelector('.ai-msg-mute-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'ai-msg-mute-btn';
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    btn.title = 'استمع للرسالة';
    btn.style.cssText = 'position:absolute;top:6px;left:-38px;width:30px;height:30px;border:none;border-radius:50%;background:linear-gradient(135deg,rgba(6,182,212,.25),rgba(99,102,241,.25));border:1px solid rgba(6,182,212,.4);color:#06b6d4;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.75rem;transition:all .2s;z-index:10;';
    btn.addEventListener('click', function(){ window.aiSpeak(text, btn); });
    btn.addEventListener('touchend', function(e){ e.preventDefault(); window.aiSpeak(text, btn); });
    msgEl.style.position = 'relative';
    msgEl.appendChild(btn);
  };

  // ===== 8. Modal بناء وتأكيد =====
  function buildGrid() {
    var grid = document.getElementById('personaGrid');
    if (!grid) return;
    var savedId = getSavedId();
    grid.innerHTML = AI_PERSONAS.map(function(p) {
      return '<div class="persona-card ' + (p.id === (savedId||'cosmos') ? 'selected' : '') + '" id="pcard_' + p.id + '" onclick="selectPersonaCard(\'' + p.id + '\')" ontouchend="event.preventDefault();selectPersonaCard(\'' + p.id + '\')">'
        + '<span class="persona-emoji">' + p.emoji + '</span>'
        + '<div class="persona-name">' + p.name + '</div>'
        + '<div class="persona-desc">' + p.desc + '</div>'
        + '<span class="persona-lang-badge">🌍 ' + p.badge + '</span>'
        + '</div>';
    }).join('');
    _modalSel = savedId || 'cosmos';
  }

  window.selectPersonaCard = function(id) {
    _modalSel = id;
    document.querySelectorAll('.persona-card').forEach(function(c){ c.classList.remove('selected'); });
    var card = document.getElementById('pcard_' + id);
    if (card) card.classList.add('selected');
  };

  window.confirmPersonaSelection = function() {
    if (!_modalSel) return;
    _persona = getById(_modalSel);
    savePId(_modalSel);
    pickBestVoice();
    var modal = document.getElementById('aiPersonaModal');
    if (modal) modal.classList.remove('active');
    updatePersonaUI();
    var welcome = 'أهلاً! أنا ' + _persona.name + '، مساعدك الذكي. جاهز أساعدك في أي وقت.';
    setTimeout(function(){ window.aiSpeak(welcome, null); }, 500);
    if (typeof showToast === 'function') showToast('✅ تم اختيار شخصية: ' + _persona.name + ' ' + _persona.emoji);
  };

  window.openPersonaModal = function() {
    buildGrid();
    var modal = document.getElementById('aiPersonaModal');
    if (modal) modal.classList.add('active');
  };

  function updatePersonaUI() {
    var p = _persona; if (!p) return;
    var avatar = document.querySelector('.ai-chat-container .chat-avatar, #aiChatModal .chat-avatar');
    if (avatar) avatar.innerHTML = p.emoji;
    var nameEl = document.querySelector('#aiChatModal .chat-header-text h3');
    if (nameEl) nameEl.textContent = p.name + ' ' + p.emoji;
    var actions = document.querySelector('#aiChatModal .chat-actions');
    if (actions && !actions.querySelector('.ai-persona-change-btn')) {
      var btn = document.createElement('button');
      btn.className = 'ai-persona-change-btn';
      btn.innerHTML = '<i class="fas fa-user-astronaut"></i> شخصية';
      btn.onclick = window.openPersonaModal;
      actions.insertBefore(btn, actions.firstChild);
    }
  }

  // ===== 9. Patch sendAIMessage — DISABLED (replaced by unified fix at end of file) =====
  function patchSendAI() {
    return; // The single clean sendAIMessage handles everything now.
    var iv = setInterval(function() {
      if (typeof window.sendAIMessage !== 'function') return;
      clearInterval(iv);

      window.sendAIMessage = async function() {
        var inp = document.getElementById('aiChatInput');
        if (!inp || !inp.value.trim()) return;
        var userMsg = inp.value.trim();
        inp.value = ''; inp.style.height = 'auto';

        var msgs = document.getElementById('aiChatMessages');
        if (msgs) {
          var ud = document.createElement('div');
          ud.className = 'message sent';
          ud.innerHTML = '<div class="message-content">' + userMsg + '</div>';
          msgs.appendChild(ud);
          msgs.scrollTop = msgs.scrollHeight;
        }

        var typingEl = null;
        if (msgs) {
          typingEl = document.createElement('div');
          typingEl.className = 'message received';
          typingEl.id = 'aiTypingIndicator';
          var pName = (_persona || AI_PERSONAS[0]).name;
          typingEl.innerHTML = '<div class="message-content" style="color:#888"><i class="fas fa-circle-notch fa-spin"></i> ' + pName + ' يفكر...</div>';
          msgs.appendChild(typingEl);
          msgs.scrollTop = msgs.scrollHeight;
        }

        var persona = window.getCurrentAIPersona() || AI_PERSONAS[0];
        var apiKey = typeof getAiApiKey === 'function' ? getAiApiKey() : '';

        // ✅ نحسب طول الرسالة ونضبط الـ history بناءً عليها
        var msgLen = userMsg.length;
        var histLimit = msgLen > 2000 ? 2 : msgLen > 800 ? 4 : 8;
        var histMsgs = (typeof aiChatHistory !== 'undefined' && Array.isArray(aiChatHistory))
          ? aiChatHistory.slice(-histLimit) : [];

        // ✅ نختار الموديل والـ max_tokens بناءً على حجم الرسالة
        var chosenModel = 'llama-3.3-70b-versatile';
        var chosenMaxTokens = 8000; // رفعنا من 2000 → 8000

        function buildPayload(model, maxTok, hist) {
          return {
            model: model,
            messages: [
              { role: 'system', content: persona.systemPrompt },
              ...hist,
              { role: 'user', content: userMsg }
            ],
            max_tokens: maxTok,
            temperature: 0.4
          };
        }

        // ✅ دالة الإرسال مع retry تلقائي لو فشل
        async function sendWithRetry() {
          // محاولة أولى بالموديل الكبير
          var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload(chosenModel, chosenMaxTokens, histMsgs))
          });
          var data = await res.json();

          // لو فشل بسبب context overflow → retry بموديل أخف وبدون history
          if (!res.ok && (res.status === 400 || res.status === 413 ||
              (data && data.error && /context|length|token/i.test(JSON.stringify(data.error))))) {
            console.warn('Context too large, retrying with llama-3.1-8b-instant and no history...');
            var res2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify(buildPayload('llama-3.1-8b-instant', 4000, []))
            });
            data = await res2.json();
            res = res2;
          }
          return { res: res, data: data };
        }

        try {
          var result = await sendWithRetry();
          var res = result.res, data = result.data;
          var answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
          if (!answer && data.error) throw new Error(JSON.stringify(data.error));
          if (!answer) answer = 'عذراً، حدث خطأ.';

          if (typeof aiChatHistory !== 'undefined') {
            aiChatHistory.push({ role: 'user', content: userMsg });
            aiChatHistory.push({ role: 'assistant', content: answer });
            if (aiChatHistory.length > 30) aiChatHistory.splice(0, 2);
          }

          if (typingEl) typingEl.remove();
          if (msgs) {
            var aiDiv = document.createElement('div');
            aiDiv.className = 'message received';
            aiDiv.innerHTML = '<div class="message-sender">' + persona.emoji + ' ' + persona.name + '</div><div class="message-content">' + answer + '</div>';
            msgs.appendChild(aiDiv);
            msgs.scrollTop = msgs.scrollHeight;
            var txt = aiDiv.querySelector('.message-content');
            if (txt) window.addAIMuteButton(aiDiv, txt.textContent);

            // نطق تلقائي لو مش مكتوم
            var isMuted = (typeof aiIsMuted !== 'undefined' && aiIsMuted);
            var muteBtn = document.getElementById('aiMuteBtn');
            if (muteBtn && muteBtn.classList.contains('muted')) isMuted = true;
            if (!isMuted) window.aiSpeak(answer, null);
          }
        } catch(err) {
          if (typingEl) typingEl.remove();
          if (msgs) { var ed = document.createElement('div'); ed.className = 'message received'; ed.innerHTML = '<div class="message-content" style="color:#ef4444">❌ فشل الاتصال بالمساعد</div>'; msgs.appendChild(ed); }
          console.error('AI send error:', err);
        }
      };
    }, 800);
  }

  // ===== 10. Patch voice chat TTS =====
  // لا نعمل override لـ speak لأن speakNextChunk عندها keep-alive خاص بيها
  // أي override هنا بيتعارض مع الـ onend chain ويوقف القراءة في المنتصف
  function patchVoiceChat() {
    // intentionally left empty — keep-alive handled inside speakNextChunk
  }

  // ===== 11. Init =====
  function init() {
    if (window.speechSynthesis) loadVoices();
    var saved = getSavedId();
    if (saved) {
      _persona = getById(saved);
      setTimeout(updatePersonaUI, 1200);
    } else {
      // انتظار فتح AI chat لعرض Modal الاختيار
      var targetModal = document.getElementById('aiChatModal');
      if (targetModal) {
        var obs = new MutationObserver(function(muts) {
          muts.forEach(function(mut) {
            if (mut.attributeName === 'class' && targetModal.classList.contains('active') && !getSavedId()) {
              obs.disconnect();
              setTimeout(function() { buildGrid(); document.getElementById('aiPersonaModal').classList.add('active'); }, 300);
            }
          });
        });
        obs.observe(targetModal, { attributes: true });
      }
    }
    patchSendAI();
    patchVoiceChat();
  }

  window.AI_PERSONAS = AI_PERSONAS;

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 600); }); }
  else { setTimeout(init, 600); }

})();


/* ========================================== */


(function(){
  var STORAGE_DQ = 'dq_v1';
  var TODAY = new Date().toDateString();
  var QUESTS = [
    { id:'watch',  icon:'📺', name:'شاهد فيديو فلكي',       desc:'افتح أي فيديو في المنصة',            xp:20 },
    { id:'quiz',   icon:'🧠', name:'جاوب على 3 أسئلة',      desc:'أكمل امتحان أي فيديو',               xp:30 },
    { id:'ai',     icon:'🤖', name:'اسأل الذكاء الاصطناعي', desc:'أرسل رسالة للمساعد الذكي',           xp:15 },
    { id:'news',   icon:'📰', name:'اقرأ خبر فضائي',        desc:'افتح قسم أخبار الفضاء',              xp:10 },
    { id:'login',  icon:'🌟', name:'مكافأة الدخول اليومي',  desc:'مجرد دخولك يكسبك نقاط',             xp:10 },
  ];
  var BADGES = [
    { id:'first_watch', emoji:'🎬', label:'أول مشاهدة',  xpReq:0,  questReq:'watch' },
    { id:'quiz_hero',   emoji:'🏅', label:'بطل الكويز',  xpReq:0,  questReq:'quiz'  },
    { id:'ai_fan',      emoji:'🤖', label:'صديق AI',     xpReq:0,  questReq:'ai'    },
    { id:'streak3',     emoji:'🔥', label:'3 أيام متواصلة', xpReq:0, streakReq:3   },
    { id:'xp50',        emoji:'⭐', label:'50 XP',       xpReq:50,  questReq:null  },
    { id:'xp150',       emoji:'💫', label:'150 XP',      xpReq:150, questReq:null  },
    { id:'xp300',       emoji:'🌟', label:'300 XP',      xpReq:300, questReq:null  },
    { id:'explorer',    emoji:'🚀', label:'مستكشف الفضاء', xpReq:500, questReq:null},
  ];

  // ── localStorage: للـ UI السريع فقط (completedToday + streak + badges) ──
  // ── الـ XP الحقيقي مصدره Firebase دايماً (مش localStorage) ──
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_DQ)) || {}; } catch(e){ return {}; }
  }
  function save(d) {
    // احفظ فقط البيانات غير الحساسة محلياً (للاستخدام offline وسرعة الـ UI)
    // الـ XP الحقيقي بيتحفظ في Firebase حصرياً
    var safe = {
      date: d.date,
      completedToday: d.completedToday,
      streak: d.streak,
      totalDays: d.totalDays,
      earnedBadges: d.earnedBadges
      // totalXP مش بيتخزن هنا — بيييجي من Firebase
    };
    localStorage.setItem(STORAGE_DQ, JSON.stringify(safe));
  }

  function getState() {
    var d = load();
    if (d.date !== TODAY) {
      var prevStreak = d.streak || 0;
      var yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      var wasYesterday = d.date === yesterday.toDateString();
      d.completedToday = {};
      d.date = TODAY;
      d.streak = wasYesterday ? prevStreak + 1 : 1;
      d.totalDays = (d.totalDays || 0) + 1;
      save(d);
      // ── مزامنة الـ streak مع Firebase ──
      _syncStreakToFirebase(d.streak);
    }
    d.completedToday = d.completedToday || {};
    d.earnedBadges = d.earnedBadges || [];
    return d;
  }

  // ── كتابة الـ streak في Firebase ──
  function _syncStreakToFirebase(streak) {
    var uid = (typeof currentUserId !== 'undefined') ? currentUserId : null;
    if (!uid || typeof db === 'undefined') return;
    db.collection('user_progress').doc(uid).set(
      { streak: streak, streakUpdated: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(function(e){ console.warn('streak sync error', e); });
  }

  // ── كتابة الشارات في Firebase ──
  function _syncBadgesToFirebase(badges) {
    var uid = (typeof currentUserId !== 'undefined') ? currentUserId : null;
    if (!uid || typeof db === 'undefined') return;
    db.collection('user_progress').doc(uid).set(
      { earnedBadges: badges, badgesUpdated: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(function(e){ console.warn('badges sync error', e); });
  }

  window.dqCompleteQuest = function(questId) {
    var d = getState();
    if (d.completedToday[questId]) return;
    var q = QUESTS.find(function(x){ return x.id === questId; });
    if (!q) return;
    d.completedToday[questId] = true;
    var prevBadgesLen = d.earnedBadges.length;
    checkBadges(d);
    save(d);
    // مزامنة الشارات الجديدة مع Firebase
    if (d.earnedBadges.length > prevBadgesLen) {
      _syncBadgesToFirebase(d.earnedBadges);
    }
    showXPPop('+' + q.xp + ' XP ⭐');
    refreshDQUI();
    // ── XP يتسجل في Firebase فقط — مش في localStorage ──
    if (window.lbAddXP) window.lbAddXP(q.xp);
    if (typeof addPoints === 'function' && typeof currentUserId !== 'undefined' && currentUserId) {
      addPoints(currentUserId, q.xp, 'مهمة يومية: ' + q.name).catch(function(){});
    }
  };

  function checkBadges(d) {
    BADGES.forEach(function(b) {
      if (d.earnedBadges.indexOf(b.id) !== -1) return;
      var earn = false;
      if (b.questReq && d.completedToday[b.questReq]) earn = true;
      if (b.xpReq && d.totalXP >= b.xpReq) earn = true;
      if (b.streakReq && d.streak >= b.streakReq) earn = true;
      if (earn) {
        d.earnedBadges.push(b.id);
        setTimeout(function(){ showBadgeToast(b); }, 400);
      }
    });
  }

  function showBadgeToast(b) {
    var t = document.createElement('div');
    t.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:.75rem 1.5rem;border-radius:20px;z-index:99999;font-family:Cairo;font-size:.95rem;font-weight:700;box-shadow:0 10px 30px rgba(99,102,241,.5);animation:dqXpUp 2.5s ease-out forwards;';
    t.textContent = '🏅 شارة جديدة: ' + b.emoji + ' ' + b.label;
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 2600);
  }

  function showXPPop(txt) {
    var p = document.createElement('div');
    p.className = 'dq-xp-pop';
    p.textContent = txt;
    p.style.left = (Math.random() * 60 + 20) + '%';
    p.style.bottom = '120px';
    document.body.appendChild(p);
    setTimeout(function(){ p.remove(); }, 1400);
  }

  function refreshDQUI() {
    var d = getState();
    var xpEl = document.getElementById('dqTotalXP');
    var strEl = document.getElementById('dqStreak');
    var listEl = document.getElementById('dqQuestList');
    var badgesEl = document.getElementById('dqBadgesGrid');
    if (!listEl) return;
    // جرب تعرض النقاط الحقيقية من Firebase
    if (xpEl) {
      // ── XP يييجي دايماً من Firebase (مش localStorage) — أمان كامل ──
      var uid = (typeof currentUserId !== 'undefined') ? currentUserId : null;
      if (uid && typeof db !== 'undefined') {
        xpEl.textContent = '... ⭐ XP';
        db.collection('user_points').doc(uid).get().then(function(doc){
          var pts = doc.exists ? (doc.data().points || 0) : 0;
          xpEl.textContent = pts + ' ⭐ XP';
        }).catch(function(){ xpEl.textContent = '0 ⭐ XP'; });
      } else {
        xpEl.textContent = '0 ⭐ XP';
      }
    }
    if (strEl) strEl.textContent = d.streak || 0;
    listEl.innerHTML = QUESTS.map(function(q){
      var done = !!d.completedToday[q.id];
      return '<div class="dq-quest' + (done?' done':'') + '">' +
        '<div class="dq-quest-icon">' + q.icon + '</div>' +
        '<div class="dq-quest-info"><div class="dq-quest-name">' + q.name + '</div><div class="dq-quest-desc">' + q.desc + '</div></div>' +
        '<div class="dq-quest-reward">+' + q.xp + ' XP</div>' +
        '<div class="dq-quest-check">' + (done ? '✅' : '⬜') + '</div>' +
        '</div>';
    }).join('');
    if (badgesEl) {
      badgesEl.innerHTML = BADGES.map(function(b){
        var earned = d.earnedBadges.indexOf(b.id) !== -1;
        return '<div class="dq-badge-item ' + (earned?'earned':'locked') + '" title="' + b.label + '">' +
          '<span class="dq-badge-emoji">' + b.emoji + '</span>' +
          '<div class="dq-badge-lbl">' + b.label + '</div></div>';
      }).join('');
    }
  }

  window.openDQ = function() {
    refreshDQUI();
    document.getElementById('dqModal').classList.add('active');
  };
  window.closeDQ = function() {
    document.getElementById('dqModal').classList.remove('active');
  };
  document.getElementById('dqModal').addEventListener('click', function(e){
    if (e.target === this) closeDQ();
  });

  // Auto-complete login quest on load
  setTimeout(function(){ window.dqCompleteQuest('login'); }, 1500);

  // Hook: watch video
  var origPlay = window.playVideo;
  window.playVideo = function() {
    var r = origPlay && origPlay.apply(this, arguments);
    setTimeout(function(){ window.dqCompleteQuest('watch'); }, 800);
    return r;
  };

  // Hook: AI send
  document.addEventListener('dqAiSent', function(){ window.dqCompleteQuest('ai'); });
  document.addEventListener('dqNewsSeen', function(){ window.dqCompleteQuest('news'); });
  document.addEventListener('dqQuizDone', function(){ window.dqCompleteQuest('quiz'); });

  window.dqGetTotalXP = function(){ return getState().totalXP || 0; };
})();


/* ========================================== */


(function(){

  /* ── helpers ── */
  function _weekStart() {
    var d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0,10); // "YYYY-MM-DD"
  }
  var MEDALS = ['🥇','🥈','🥉'];

  /* ── كتابة XP للـ Firebase بعد كل مهمة ── */
  window.lbAddXP = function(amt) {
    // currentUserId و db موجودين في الـ scope الرئيسي للصفحة
    var uid = (typeof currentUserId !== 'undefined') ? currentUserId : null;
    var name = (typeof currentUser !== 'undefined') ? currentUser : 'مجهول';
    if (!uid || typeof db === 'undefined') return;

    var ws = _weekStart();
    var ref = db.collection('user_points').doc(uid);
    db.runTransaction(function(t) {
      return t.get(ref).then(function(doc) {
        var data = doc.exists ? doc.data() : {};
        var totalPts = (data.points || 0) + amt;
        // نقاط الأسبوع: لو أسبوع جديد نبدأ من صفر
        var weekPts = (data.weekStart === ws) ? (data.weekPoints || 0) + amt : amt;
        t.set(ref, {
          points: totalPts,
          weekPoints: weekPts,
          weekStart: ws,
          username: name,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }).catch(function(e){ console.warn('lbAddXP error', e); });
  };

  /* ── رسم الـ Leaderboard من Firebase ── */
  var _curTab = 'week';

  async function renderLB(tab) {
    _curTab = tab;
    var list = document.getElementById('lbList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:#6366f1"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

    if (typeof db === 'undefined') {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444">⚠️ Firebase غير متصل</div>';
      return;
    }

    try {
      var field = (tab === 'week') ? 'weekPoints' : 'points';
      var snap = await db.collection('user_points').orderBy(field, 'desc').limit(10).get();

      var uid = (typeof currentUserId !== 'undefined') ? currentUserId : null;

      if (snap.empty) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:#94a3b8">لا توجد بيانات بعد 🌌</div>';
        return;
      }

      var ws = _weekStart();

      // جيب أسماء المستخدمين من user_progress لأنها أكثر اكتمالاً
      var userIds = snap.docs.map(function(d){ return d.id; });
      var nameMap = {};
      await Promise.all(userIds.map(async function(id) {
        try {
          var prog = await db.collection('user_progress').doc(id).get();
          if (prog.exists) {
            nameMap[id] = prog.data().username || prog.data().name || prog.data().displayName || null;
          }
        } catch(e){}
      }));

      list.innerHTML = snap.docs.map(function(doc, i) {
        var d = doc.data();
        var isMe = doc.id === uid;
        var score = (tab === 'week')
          ? ((d.weekStart === ws) ? (d.weekPoints || 0) : 0)
          : (d.points || 0);
        // اسم حقيقي: من user_progress أو user_points أو "طالب مجهول"
        var name = nameMap[doc.id] || d.username || d.name || null;
        if (!name || name.trim() === '' || name === 'مجهول') {
          // لو ما لقيناش اسم — نعرض آخر 4 حروف من الـ uid
          name = 'طالب #' + doc.id.slice(-4);
        }
        return '<div class="lb-item' + (isMe ? ' me' : '') + '">' +
          '<div class="lb-rank">' + (MEDALS[i] || (i + 1)) + '</div>' +
          '<div class="lb-avatar">🌟</div>' +
          '<div class="lb-info">' +
            '<div class="lb-name">' + name + (isMe ? ' <span style="color:#6366f1;font-size:.75rem">(أنت)</span>' : '') + '</div>' +
            '<div class="lb-xp">' + score + ' نقطة</div>' +
          '</div>' +
          '<div class="lb-score">' + score + '</div>' +
          '</div>';
      }).join('');

    } catch(e) {
      console.error('renderLB error', e);
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444">❌ فشل تحميل البيانات</div>';
    }
  }

  window.openLB = function() {
    document.getElementById('lbModal').classList.add('active');
    renderLB('week');
  };
  window.closeLB = function() {
    document.getElementById('lbModal').classList.remove('active');
  };
  window.lbTab = function(t, btn) {
    document.querySelectorAll('.lb-tab').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    renderLB(t);
  };

})();


/* ========================================== */


(function(){
  // ── Global history array (stays alive across turns) ──
  window.aiChatHistory = [];

  // ── Space context helpers ──
  var NASA_KEY = 'DEMO_KEY';
  var SPACE_TRIGGERS = ['اليوم','النهارده','الآن','الأخبار','أحدث','جديد','ايش في','إيه في','news','today','latest','launch','صاروخ','إطلاق','ناسا','nasa','تلسكوب','webb','جيمس ويب'];
  function hasTrigger(t){ var l=t.toLowerCase(); return SPACE_TRIGGERS.some(function(k){ return l.includes(k); }); }
  async function fetchNASAApod(){ try{ var r=await fetch('https://api.nasa.gov/planetary/apod?api_key='+NASA_KEY); return await r.json(); }catch(e){ return null; } }
  async function fetchSpaceNews(){ try{ var r=await fetch('https://api.spaceflightnewsapi.net/v4/articles/?limit=3&ordering=-published_at'); var d=await r.json(); return d.results||[]; }catch(e){ return []; } }

  // ── Wait until all previous patches have settled, then replace once ──
  var attempts = 0;
  var iv = setInterval(async function(){
    attempts++;
    if (attempts > 60) { clearInterval(iv); return; }
    // Wait until the persona patch (which registers getCurrentAIPersona) is done
    if (typeof window.getCurrentAIPersona !== 'function') return;
    clearInterval(iv);

    // ── THE ONE CLEAN sendAIMessage ──
    window.sendAIMessage = async function(injectedMsg) {
      var inp  = document.getElementById('aiChatInput');
      var msgs = document.getElementById('aiChatMessages');

      // ── Handle file upload if any ──
      if (window._aiSelectedFile) {
        var file = window._aiSelectedFile;
        window._aiSelectedFile = null;
        var preview = document.getElementById('aiFilePreview');
        if (preview) preview.style.display = 'none';
        var extraText = inp ? inp.value.trim() : '';
        if (inp) { inp.value = ''; inp.style.height = 'auto'; }

        if (file.type.startsWith('image/')) {
          var reader = new FileReader();
          reader.onload = async function(e) {
            if (msgs) {
              var div = document.createElement('div');
              div.className = 'message sent';
              div.innerHTML = '<img src="'+e.target.result+'" style="max-width:180px;border-radius:10px;display:block;margin-bottom:.3rem"><div class="message-time">'+new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div>';
              msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
            }
            await window.sendAIMessage(extraText || ('صف هذه الصورة باللغة العربية: "'+file.name+'"'));
          };
          reader.readAsDataURL(file);
        } else {
          var reader2 = new FileReader();
          reader2.onload = async function(e) {
            var content = typeof e.target.result === 'string' ? e.target.result.substring(0,3000) : '';
            var combined = extraText
              ? (extraText + '\n\n[محتوى الملف: "'+file.name+'"]\n'+content)
              : ('حلل هذا الملف وأخبرني بأهم نقاطه:\n\n[اسم الملف: "'+file.name+'"]\n'+content);
            await window.sendAIMessage(combined);
          };
          reader2.readAsText(file, 'UTF-8');
        }
        return;
      }

      // ── Read message ──
      var userMsg = injectedMsg !== undefined ? String(injectedMsg) : (inp ? inp.value.trim() : '');
      if (!userMsg) return;
      if (inp && injectedMsg === undefined) { inp.value = ''; inp.style.height = 'auto'; }

      // ── Image generation check ──
      if (typeof isImageRequest === 'function' && isImageRequest(userMsg)) {
        var imgPrompt = typeof extractImagePrompt === 'function' ? extractImagePrompt(userMsg) : userMsg;
        await generateAndDisplayImage(imgPrompt);
        return;
      }

      // ── Space context injection ──
      if (hasTrigger(userMsg)) {
        var apod = await fetchNASAApod();
        var news = await fetchSpaceNews();
        var ctx = '';
        if (apod && apod.title)
          ctx += '\n[صورة ناسا الفلكية اليوم]: العنوان: '+apod.title+'. الشرح: '+(apod.explanation||'').slice(0,300)+'\n';
        if (news.length) {
          ctx += '\n[أحدث أخبار الفضاء الحية]:\n';
          news.forEach(function(n,i){ ctx += (i+1)+'. '+n.title+' ('+(n.news_site||'')+') — '+(n.summary||'').slice(0,150)+'\n'; });
        }
        if (ctx) userMsg = userMsg + '\n\n--- معلومات حية الآن ---'+ctx+'---\nاستخدم المعلومات الحية أعلاه للإجابة إذا كانت ذات صلة.';
        document.dispatchEvent(new Event('dqNewsSeen'));
      }
      document.dispatchEvent(new Event('dqAiSent'));

      // ── Show user bubble ──
      if (msgs) {
        var ud = document.createElement('div');
        ud.className = 'message sent';
        ud.innerHTML = '<div class="message-content">'+userMsg+'</div><div class="message-time">'+new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div>';
        msgs.appendChild(ud); msgs.scrollTop = msgs.scrollHeight;
      }

      // ── Typing indicator ──
      var typingEl = null;
      if (msgs) {
        typingEl = document.createElement('div');
        typingEl.className = 'message received';
        var pNameT = (window.getCurrentAIPersona() || {name:'Astronomy AI'}).name;
        typingEl.innerHTML = '<div class="message-content" style="color:#888"><i class="fas fa-circle-notch fa-spin"></i> '+pNameT+' يفكر...</div>';
        msgs.appendChild(typingEl); msgs.scrollTop = msgs.scrollHeight;
      }

      // ── Persona & API key ──
      var persona  = window.getCurrentAIPersona() || { name:'Astronomy AI', emoji:'🔭', systemPrompt:'أنت مساعد متخصص في الفلك والفضاء. أجب بالعربية بدقة ووضوح.' };
      var apiKey   = typeof getAiApiKey === 'function' ? getAiApiKey() : '';

      // ── History slice (adaptive) ──
      var histLimit = userMsg.length > 2000 ? 2 : userMsg.length > 800 ? 4 : 8;
      var histMsgs  = window.aiChatHistory.slice(-histLimit);

      function buildPayload(model, maxTok, hist) {
        return {
          model: model,
          messages: [{ role:'system', content: persona.systemPrompt }].concat(hist).concat([{ role:'user', content: userMsg }]),
          max_tokens: maxTok,
          temperature: 0.4
        };
      }

      async function callGroq(model, maxTok, hist) {
        var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer '+apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(model, maxTok, hist))
        });
        var data = await res.json();
        return { res: res, data: data };
      }

      try {
        var result = await callGroq('llama-3.3-70b-versatile', 1500, histMsgs);
        // Retry with smaller model if context overflow
        if (!result.res.ok && (result.res.status===400||result.res.status===413||
            (result.data&&result.data.error&&/context|length|token/i.test(JSON.stringify(result.data.error))))) {
          result = await callGroq('llama-3.1-8b-instant', 4000, []);
        }
        var answer = (result.data.choices&&result.data.choices[0]&&result.data.choices[0].message&&result.data.choices[0].message.content) || null;
        if (!answer && result.data.error) throw new Error(JSON.stringify(result.data.error));
        if (!answer) answer = 'عذراً، حدث خطأ غير متوقع.';

        // ── Save to history ──
        window.aiChatHistory.push({ role:'user', content: userMsg });
        window.aiChatHistory.push({ role:'assistant', content: answer });
        if (window.aiChatHistory.length > 30) window.aiChatHistory.splice(0, 2);

        // ── Show AI bubble ──
        if (typingEl) typingEl.remove();
        if (msgs) {
          var aiDiv = document.createElement('div');
          aiDiv.className = 'message received';
          aiDiv.innerHTML = '<div class="message-sender" style="color:#06b6d4">'+persona.emoji+' '+persona.name+'</div><div class="message-content">'+answer+'</div><div class="message-time">'+new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+'</div>';
          msgs.appendChild(aiDiv); msgs.scrollTop = msgs.scrollHeight;
          if (typeof window.addAIMuteButton === 'function') {
            var txtEl = aiDiv.querySelector('.message-content');
            if (txtEl) window.addAIMuteButton(aiDiv, txtEl.textContent);
          }
          // Auto-speak if not muted
          var muteBtn = document.getElementById('aiMuteBtn') || document.getElementById('aiGlobalMuteBtn');
          var isMuted = (muteBtn && muteBtn.classList.contains('muted')) || (typeof aiIsMuted !== 'undefined' && aiIsMuted);
          if (!isMuted && typeof window.aiSpeak === 'function') {
            // نمرر النص النظيف بدون HTML أو markdown
            var cleanAnswer = answer
              .replace(/<[^>]*>/g, ' ')
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .replace(/\*([^*]+)\*/g, '$1')
              .replace(/`+([^`]*)`+/g, '$1')
              .replace(/\r?\n+/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
            window.aiSpeak(cleanAnswer, null);
          }
        }
      } catch(err) {
        if (typingEl) typingEl.remove();
        if (msgs) {
          var ed = document.createElement('div');
          ed.className = 'message received';
          ed.innerHTML = '<div class="message-content" style="color:#ef4444">❌ فشل الاتصال بالمساعد. تأكد من مفتاح API.</div>';
          msgs.appendChild(ed); msgs.scrollTop = msgs.scrollHeight;
        }
        console.error('AI send error:', err);
      }
    };

    // ── Also patch clearAIChat to reset history ──
    var _origClear = window.clearAIChat;
    window.clearAIChat = function() {
      window.aiChatHistory = [];
      if (_origClear) _origClear.call(this);
    };

    console.log('✅ sendAIMessage الموحّدة جاهزة — history + personas + space context + retry + TTS');
  }, 300);
})();


/* ========================================== */


(function(){
  // Override showCertificateModal to add QR + share buttons
  var _origShowCert = window.showCertificateModal;
  window.showCertificateModal = function(courseTitle, certUrl) {
    // Remove any old modal
    var old = document.getElementById('certViewModal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'certViewModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.87);display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(10px)';

    var verifyUrl = certUrl + '?v=' + encodeURIComponent(courseTitle);
    var linkedInUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(certUrl);
    var fbUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(certUrl);
    var waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent('🏆 أتممت كورس "' + courseTitle + '" بنجاح على منصة الفلك المتكاملة! ' + certUrl);

    modal.innerHTML =
      '<div style="background:linear-gradient(135deg,#1a1025,#0f0a1a);border:2px solid rgba(245,158,11,.5);border-radius:26px;width:95%;max-width:460px;padding:2rem 1.5rem;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.7),0 0 80px rgba(245,158,11,.12);position:relative;overflow:hidden;">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(245,158,11,.1),transparent 65%);pointer-events:none"></div>' +
        '<div style="width:80px;height:80px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 1rem;box-shadow:0 10px 30px rgba(245,158,11,.5),0 0 0 8px rgba(245,158,11,.12)">🏆</div>' +
        '<h2 style="font-size:1.3rem;font-weight:900;color:#fde68a;margin-bottom:.3rem">مبروك! 🎉</h2>' +
        '<p style="color:#e0e7ff;font-size:.92rem;line-height:1.6;margin-bottom:1.25rem">أتممت كورس <b style="color:#fbbf24">' + (courseTitle||'') + '</b> بنجاح!</p>' +
        // QR Code
        '<div style="background:#fff;border-radius:16px;padding:12px;display:inline-block;margin-bottom:1rem;box-shadow:0 4px 20px rgba(0,0,0,.4)">' +
          '<div id="certQRCode" style="width:140px;height:140px;"></div>' +
        '</div>' +
        '<p style="color:#94a3b8;font-size:.75rem;margin-bottom:1.25rem">امسح الـ QR Code للتحقق من شهادتك</p>' +
        // Download
        '<a href="' + certUrl + '" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:.6rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:14px;padding:.8rem 1.5rem;font-family:Cairo;font-size:.95rem;font-weight:700;cursor:pointer;text-decoration:none;margin-bottom:.75rem;box-shadow:0 8px 24px rgba(245,158,11,.4)">' +
          '<i class="fas fa-download"></i> تحميل الشهادة PDF</a>' +
        // Share buttons
        '<div style="margin-bottom:.75rem;">' +
          '<p style="color:#94a3b8;font-size:.8rem;margin-bottom:.6rem">شارك إنجازك 🎊</p>' +
          '<div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;">' +
            '<a href="' + linkedInUrl + '" target="_blank" style="display:flex;align-items:center;gap:.4rem;background:#0077b5;color:#fff;border-radius:10px;padding:.5rem .9rem;font-family:Cairo;font-size:.82rem;font-weight:700;text-decoration:none"><i class="fab fa-linkedin"></i> LinkedIn</a>' +
            '<a href="' + fbUrl + '" target="_blank" style="display:flex;align-items:center;gap:.4rem;background:#1877f2;color:#fff;border-radius:10px;padding:.5rem .9rem;font-family:Cairo;font-size:.82rem;font-weight:700;text-decoration:none"><i class="fab fa-facebook"></i> Facebook</a>' +
            '<a href="' + waUrl + '" target="_blank" style="display:flex;align-items:center;gap:.4rem;background:#25d366;color:#fff;border-radius:10px;padding:.5rem .9rem;font-family:Cairo;font-size:.82rem;font-weight:700;text-decoration:none"><i class="fab fa-whatsapp"></i> واتساب</a>' +
          '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'certViewModal\').remove()" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#aaa;border-radius:10px;padding:.6rem 1.5rem;font-family:Cairo;font-size:.9rem;cursor:pointer;width:100%">إغلاق</button>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });

    // Generate QR after insertion
    setTimeout(function(){
      var qrEl = document.getElementById('certQRCode');
      if (qrEl && window.QRCode) {
        new QRCode(qrEl, { text: verifyUrl, width:140, height:140, colorDark:'#1a1025', colorLight:'#ffffff', correctLevel: QRCode.CorrectLevel.M });
      }
    }, 300);
  };
})();


/* ========================================== */


(function(){
  // Stars removed

  // ── 5B: Lazy-load YouTube iframes with IntersectionObserver ──
  function lazyIframes(){
    if (!('IntersectionObserver' in window)) return;
    var iframes = document.querySelectorAll('iframe[data-src]');
    if (!iframes.length) return;
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          var el=entry.target;
          el.src=el.dataset.src;
          obs.unobserve(el);
        }
      });
    },{rootMargin:'200px'});
    iframes.forEach(function(el){ obs.observe(el); });
  }
  // Run after videos render
  setTimeout(lazyIframes, 3000);

  // ── 5C: Hook AI send button to fire dqAiSent event ──
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      var sendBtn = document.getElementById('aiSendBtn') || document.querySelector('.ai-send-btn') || document.querySelector('[onclick*="sendAI"]');
      if(sendBtn){
        sendBtn.addEventListener('click', function(){
          document.dispatchEvent(new Event('dqAiSent'));
        });
      }
      // Also hook quiz submit
      document.addEventListener('click', function(e){
        if(e.target && (e.target.classList.contains('quiz-submit-btn') || (e.target.closest && e.target.closest('.quiz-submit-btn')))){
          setTimeout(function(){ document.dispatchEvent(new Event('dqQuizDone')); }, 500);
        }
      });
    }, 2000);
  });
})();


/* ========================================== */


// ============================================================
// 👥 FRIEND SYSTEM — إضافة صديق
// ============================================================

let _friendAllStudents = null;
let _friendCurrentTab = 'search';

async function openAddFriendModal() {
  if (!currentUserId) {
    showToast('سجّل دخولك أولاً عشان تستخدم نظام الأصدقاء 🔐');
    return;
  }
  document.getElementById('addFriendModal').classList.add('active');
  switchFriendTab('search');
  // Load students cache for search
  try {
    if (!_friendAllStudents) {
      const snap = await db.collection('user_progress').get();
      _friendAllStudents = [];
      const seenKeys = new Set();
      snap.forEach(doc => {
        const d = doc.data();
        const name = (d.username || d.name || d.displayName || '').trim();
        if (!name || doc.id === currentUserId) return;
        // Normalize phone: keep digits only
        const rawPhone = (d.phone || '').replace(/\D/g, '').slice(-9);
        // Dedup key: use uid (each doc is unique per uid already)
        // But also dedup by normalized name+phone to avoid duplicate registrations
        const dedupKey = name.toLowerCase() + '|' + rawPhone;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);
        _friendAllStudents.push({ uid: doc.id, name, phone: d.phone || '' });
      });
    }
  } catch(e) { console.warn('friend students load failed', e); }
  updateFriendReqBadge();
}

function closeAddFriendModal() {
  document.getElementById('addFriendModal').classList.remove('active');
}

function switchFriendTab(tab) {
  _friendCurrentTab = tab;
  ['search','requests','friends'].forEach(t => {
    document.getElementById('friendTab' + t.charAt(0).toUpperCase() + t.slice(1))?.classList.toggle('active', t === tab);
    document.getElementById('friendPanel' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'requests') loadIncomingRequests();
  if (tab === 'friends') loadMyFriends();
  if (tab === 'search') {
    const inp = document.getElementById('friendSearchInput');
    if (inp) { inp.value = ''; }
    document.getElementById('friendSearchResults').innerHTML = '<p style="color:#888;text-align:center;padding:1.5rem">اكتب اسم الطالب للبحث...</p>';
  }
}

function searchStudentsForFriend() {
  const q = (document.getElementById('friendSearchInput')?.value || '').trim().toLowerCase();
  const container = document.getElementById('friendSearchResults');
  if (!q) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:1.5rem">اكتب اسم الطالب للبحث...</p>';
    return;
  }
  if (!_friendAllStudents) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:1.5rem"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>';
    return;
  }
  const results = _friendAllStudents.filter(s =>
    s.name.toLowerCase().includes(q) || s.phone.includes(q)
  ).slice(0, 10);
  if (!results.length) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:1.5rem">لم يتم إيجاد طلاب بهذا الاسم</p>';
    return;
  }
  container.innerHTML = results.map(s => friendUserCard(s, 'search')).join('');
}

function friendUserCard(s, mode, status) {
  const initial = (s.name || '?').trim().charAt(0).toUpperCase();
  let actionBtn = '';
  if (mode === 'search') {
    actionBtn = `<button onclick="sendFriendRequest('${encodeURIComponent(s.uid)}','${encodeURIComponent(s.name)}',this)" id="frBtn_${s.uid}" style="background:linear-gradient(135deg,#06b6d4,#6366f1);color:#fff;border:none;border-radius:10px;padding:.45rem 1rem;font-family:'Cairo',sans-serif;font-weight:700;font-size:.82rem;cursor:pointer;display:flex;align-items:center;gap:.4rem;white-space:nowrap;flex-shrink:0"><i class="fas fa-user-plus"></i> إضافة</button>`;
  } else if (mode === 'incoming') {
    actionBtn = `
      <button onclick="acceptFriendRequest('${encodeURIComponent(s.reqId)}','${encodeURIComponent(s.uid)}','${encodeURIComponent(s.name)}',this)" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;padding:.45rem .85rem;font-family:'Cairo',sans-serif;font-weight:700;font-size:.8rem;cursor:pointer;margin-left:6px"><i class="fas fa-check"></i> قبول</button>
      <button onclick="rejectFriendRequest('${encodeURIComponent(s.reqId)}',this)" style="background:rgba(239,68,68,.2);color:#ef4444;border:1px solid rgba(239,68,68,.4);border-radius:10px;padding:.45rem .85rem;font-family:'Cairo',sans-serif;font-weight:700;font-size:.8rem;cursor:pointer"><i class="fas fa-times"></i> رفض</button>`;
  } else if (mode === 'friend') {
    actionBtn = `<button onclick="removeFriend('${encodeURIComponent(s.uid)}','${encodeURIComponent(s.name)}',this)" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.35);border-radius:10px;padding:.45rem .85rem;font-family:'Cairo',sans-serif;font-weight:600;font-size:.8rem;cursor:pointer"><i class="fas fa-user-minus"></i> إزالة</button>`;
  }
  return `
    <div style="display:flex;align-items:center;gap:.85rem;background:rgba(255,255,255,.05);border:1px solid rgba(99,102,241,.18);border-radius:14px;padding:.75rem 1rem;">
      <div style="width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;flex-shrink:0">${escapeHtml(initial)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.name)}</div>
        ${s.phone ? `<div style="font-size:.78rem;color:#888">${escapeHtml(s.phone)}</div>` : ''}
      </div>
      <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">${actionBtn}</div>
    </div>`;
}

async function sendFriendRequest(encodedUid, encodedName, btnEl) {
  if (!currentUserId) { showToast('سجّل دخولك أولاً 🔐'); return; }
  const targetUid = decodeURIComponent(encodedUid);
  const targetName = decodeURIComponent(encodedName);
  if (!targetUid || targetUid === currentUserId) return;

  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    // Check if request already sent — بـ where واحد بس عشان مش نحتاج Composite Index
    const existingSnap = await db.collection('friend_requests')
      .where('from', '==', currentUserId)
      .get();
    const alreadySent = existingSnap.docs.some(d => d.data().to === targetUid);
    if (alreadySent) {
      showToast('أنت بعت طلب صداقة لـ ' + targetName + ' قبل كده ✅');
      if (btnEl) { btnEl.innerHTML = '<i class="fas fa-check"></i> مُرسَل'; btnEl.style.background = 'rgba(16,185,129,.25)'; btnEl.style.color = '#10b981'; }
      return;
    }
    const alreadyFriend = await db.collection('friendships')
      .where('users', 'array-contains', currentUserId)
      .get();
    const isFriend = alreadyFriend.docs.some(d => {
      const u = d.data().users || [];
      return u.includes(targetUid);
    });
    if (isFriend) {
      showToast(targetName + ' صديقك بالفعل 💙');
      if (btnEl) { btnEl.innerHTML = '<i class="fas fa-user-check"></i> صديق'; btnEl.style.background = 'rgba(99,102,241,.25)'; btnEl.style.color = '#a78bfa'; }
      return;
    }

    await db.collection('friend_requests').add({
      from: currentUserId,
      fromName: currentUser || '',
      to: targetUid,
      toName: targetName,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('تم إرسال طلب الصداقة لـ ' + targetName + ' 🚀');
    if (btnEl) { btnEl.innerHTML = '<i class="fas fa-check"></i> مُرسَل'; btnEl.style.background = 'rgba(16,185,129,.25)'; btnEl.style.color = '#10b981'; btnEl.disabled = true; }
  } catch(e) {
    console.error(e);
    showToast('حدث خطأ، حاول مرة أخرى');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-user-plus"></i> إضافة'; }
  }
}

async function loadIncomingRequests() {
  const container = document.getElementById('friendIncomingList');
  container.innerHTML = '<div style="text-align:center;color:#888;padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    // بـ where واحد بس عشان مش نحتاج Composite Index
    const snap = await db.collection('friend_requests')
      .where('to', '==', currentUserId)
      .get();
    const items = snap.docs
      .map(d => ({ ...d.data(), reqId: d.id }))
      .filter(r => r.status === 'pending');
    if (!items.length) {
      container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem"><i class="fas fa-inbox"></i><br>مفيش طلبات واردة حالياً</p>';
      return;
    }
    container.innerHTML = items.map(r => friendUserCard({
      uid: r.from, name: r.fromName || 'طالب', reqId: r.reqId
    }, 'incoming')).join('');
    // Update badge
    const badge = document.getElementById('incomingCount');
    if (badge) { badge.textContent = items.length; badge.style.display = items.length ? '' : 'none'; }
  } catch(e) {
    console.error('loadIncomingRequests error:', e);
    container.innerHTML = '<p style="color:#ef4444;text-align:center;padding:2rem">تعذر التحميل، حاول مرة أخرى</p>';
  }
}

async function acceptFriendRequest(encodedReqId, encodedUid, encodedName, btnEl) {
  const reqId = decodeURIComponent(encodedReqId);
  const fromUid = decodeURIComponent(encodedUid);
  const fromName = decodeURIComponent(encodedName);
  if (btnEl) btnEl.disabled = true;
  try {
    await db.collection('friend_requests').doc(reqId).update({ status: 'accepted' });
    await db.collection('friendships').add({
      users: [currentUserId, fromUid],
      names: { [currentUserId]: currentUser || '', [fromUid]: fromName },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('أصبحت أنت و' + fromName + ' أصدقاء 🎉');
    loadIncomingRequests();
    updateFriendReqBadge();
  } catch(e) {
    showToast('حدث خطأ أثناء القبول');
    if (btnEl) btnEl.disabled = false;
  }
}

async function rejectFriendRequest(encodedReqId, btnEl) {
  const reqId = decodeURIComponent(encodedReqId);
  try {
    await db.collection('friend_requests').doc(reqId).update({ status: 'rejected' });
    showToast('تم رفض الطلب');
    loadIncomingRequests();
    updateFriendReqBadge();
  } catch(e) { showToast('حدث خطأ'); }
}

async function loadMyFriends() {
  const container = document.getElementById('friendMyList');
  container.innerHTML = '<div style="text-align:center;color:#888;padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const snap = await db.collection('friendships')
      .where('users', 'array-contains', currentUserId)
      .get();
    if (snap.empty) {
      container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem"><i class="fas fa-user-friends"></i><br>مفيش أصدقاء لسه، ابدأ بإضافة أصدقاء!</p>';
      return;
    }
    const friends = snap.docs.map(d => {
      const data = d.data();
      const friendUid = (data.users || []).find(u => u !== currentUserId);
      const friendName = (data.names || {})[friendUid] || 'طالب';
      return { uid: friendUid, name: friendName, fsId: d.id };
    });
    container.innerHTML = friends.map(f => friendUserCard(f, 'friend')).join('');
  } catch(e) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem">تعذر التحميل</p>';
  }
}

async function removeFriend(encodedUid, encodedName, btnEl) {
  const friendUid = decodeURIComponent(encodedUid);
  const friendName = decodeURIComponent(encodedName);
  if (!confirm('هتحذف ' + friendName + ' من قائمة أصدقائك؟')) return;
  if (btnEl) btnEl.disabled = true;
  try {
    const snap = await db.collection('friendships').where('users', 'array-contains', currentUserId).get();
    const toDelete = snap.docs.find(d => (d.data().users || []).includes(friendUid));
    if (toDelete) await toDelete.ref.delete();
    showToast('تم حذف ' + friendName + ' من أصدقائك');
    loadMyFriends();
  } catch(e) {
    showToast('حدث خطأ');
    if (btnEl) btnEl.disabled = false;
  }
}

async function updateFriendReqBadge() {
  if (!currentUserId) return;
  try {
    // بـ where واحد بس عشان مش نحتاج Composite Index
    const snap = await db.collection('friend_requests')
      .where('to', '==', currentUserId)
      .get();
    const count = snap.docs.filter(d => d.data().status === 'pending').length;
    const badge = document.getElementById('friendReqBadge');
    const inBadge = document.getElementById('incomingCount');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
    if (inBadge) { inBadge.textContent = count; inBadge.style.display = count > 0 ? '' : 'none'; }
  } catch(e) { console.error('updateFriendReqBadge error:', e); }
}

// Check for incoming requests every 60 seconds when logged in
setInterval(() => { if (currentUserId) updateFriendReqBadge(); }, 60000);
// Check on login
document.addEventListener('userLoggedIn', () => setTimeout(updateFriendReqBadge, 2000));


/* ========================================== */


// ============================================================
// 💬 FRIEND PRIVATE CHAT SYSTEM
// ============================================================

let _pfcFriendUid = null;
let _pfcFriendName = null;
let _pfcUnsubscribe = null;

async function openFriendChatMenu() {
  if (!currentUserId) { showToast('سجّل دخولك أولاً 🔐'); return; }
  document.getElementById('friendChatMenuModal').classList.add('active');
  const container = document.getElementById('friendChatMenuList');
  container.innerHTML = '<div style="text-align:center;color:#888;padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const snap = await db.collection('friendships').where('users', 'array-contains', currentUserId).get();
    if (snap.empty) {
      container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem"><i class="fas fa-user-friends"></i><br>مفيش أصدقاء لسه!<br><small>روح لـ "إضافة صديق" وابدأ بإضافة أصدقاء</small></p>';
      return;
    }
    // Get unread counts per friend — بـ where واحد بس عشان مش نحتاج Composite Index
    const unreadMap = {};
    try {
      const unreadSnap = await db.collection('private_messages')
        .where('to', '==', currentUserId)
        .get();
      unreadSnap.docs.filter(d => d.data().read === false).forEach(d => {
        const from = d.data().from;
        unreadMap[from] = (unreadMap[from] || 0) + 1;
      });
    } catch(e) {}

    const friends = snap.docs.map(d => {
      const data = d.data();
      const fUid = (data.users || []).find(u => u !== currentUserId);
      const fName = (data.names || {})[fUid] || 'صديق';
      return { uid: fUid, name: fName };
    });

    container.innerHTML = friends.map(f => {
      const initial = (f.name || '?').trim().charAt(0).toUpperCase();
      const unread = unreadMap[f.uid] || 0;
      return `
        <div onclick="openPrivateFriendChat('${encodeURIComponent(f.uid)}','${encodeURIComponent(f.name)}')" style="display:flex;align-items:center;gap:.85rem;background:rgba(255,255,255,.05);border:1px solid rgba(244,114,182,.18);border-radius:14px;padding:.75rem 1rem;cursor:pointer;transition:all .2s" onmouseover="this.style.background='rgba(244,114,182,.1)'" onmouseout="this.style.background='rgba(255,255,255,.05)'">
          <div style="position:relative;flex-shrink:0">
            <div style="width:42px;height:42px;background:linear-gradient(135deg,#f472b6,#a855f7);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem">${escapeHtml(initial)}</div>
            ${unread ? `<span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:50%;width:18px;height:18px;font-size:.65rem;display:flex;align-items:center;justify-content:center;font-weight:800">${unread}</span>` : ''}
          </div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.95rem">${escapeHtml(f.name)}</div>
            <div style="font-size:.75rem;color:#a855f7">${unread ? `<span style="color:#ef4444">${unread} رسالة جديدة</span>` : 'اضغط للمحادثة'}</div>
          </div>
          <i class="fas fa-chevron-left" style="color:#a855f7;font-size:.85rem"></i>
        </div>`;
    }).join('');

    // Update nav badge
    const totalUnread = Object.values(unreadMap).reduce((a,b) => a+b, 0);
    const badge = document.getElementById('friendChatBadge');
    if (badge) { badge.textContent = totalUnread; badge.style.display = totalUnread > 0 ? '' : 'none'; }
  } catch(e) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:2rem">تعذر التحميل، حاول مرة أخرى</p>';
  }
}

function closeFriendChatMenu() {
  document.getElementById('friendChatMenuModal').classList.remove('active');
}

async function openPrivateFriendChat(encodedUid, encodedName) {
  _pfcFriendUid = decodeURIComponent(encodedUid);
  _pfcFriendName = decodeURIComponent(encodedName);
  const initial = (_pfcFriendName || '?').trim().charAt(0).toUpperCase();
  document.getElementById('pfcAvatar').textContent = initial;
  document.getElementById('pfcName').textContent = _pfcFriendName;
  document.getElementById('pfcMessages').innerHTML = '<div style="text-align:center;color:#888;padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>';
  document.getElementById('privateFriendChatModal').classList.add('active');
  closeFriendChatMenu();

  // Mark messages as read — بـ where واحد بس عشان مش نحتاج Composite Index
  try {
    const unread = await db.collection('private_messages')
      .where('to', '==', currentUserId)
      .get();
    const toMark = unread.docs.filter(d => d.data().from === _pfcFriendUid && d.data().read === false);
    if (toMark.length) {
      const batch = db.batch();
      toMark.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
    }
  } catch(e) {}

  // Real-time listener
  if (_pfcUnsubscribe) _pfcUnsubscribe();
  const chatId = [currentUserId, _pfcFriendUid].sort().join('_');
  _pfcUnsubscribe = db.collection('private_messages')
    .where('chatId', '==', chatId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const container = document.getElementById('pfcMessages');
      if (!snap.docs.length) {
        container.innerHTML = '<p style="color:#888;text-align:center;padding:3rem"><i class="fas fa-comment-dots" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>ابدأ المحادثة!</p>';
        return;
      }
      container.innerHTML = snap.docs.map(d => {
        const msg = d.data();
        const isMe = msg.from === currentUserId;
        const time = msg.createdAt?.toDate?.()?.toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) || '';
        return `
          <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'}">
            <div style="max-width:75%;padding:.65rem 1rem;border-radius:${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};background:${isMe ? 'linear-gradient(135deg,#f472b6,#a855f7)' : 'rgba(255,255,255,.1)'};color:#fff;font-size:.9rem;line-height:1.5;word-break:break-word">${escapeHtml(msg.text || '')}</div>
            <span style="font-size:.68rem;color:#666;margin-top:.2rem;padding:0 .3rem">${time}</span>
          </div>`;
      }).join('');
      container.scrollTop = container.scrollHeight;
    }, err => {
      if (err.code === 'failed-precondition') {
        document.getElementById('pfcMessages').innerHTML = '<p style="color:#f87171;text-align:center;padding:2rem;font-size:.85rem"><i class="fas fa-exclamation-triangle"></i><br>يحتاج إنشاء index في Firebase<br><small>تواصل مع المشرف</small></p>';
      }
    });
}

function closePrivateFriendChat() {
  document.getElementById('privateFriendChatModal').classList.remove('active');
  if (_pfcUnsubscribe) { _pfcUnsubscribe(); _pfcUnsubscribe = null; }
  _pfcFriendUid = null;
  _pfcFriendName = null;
}

async function sendPrivateFriendMsg() {
  const input = document.getElementById('pfcInput');
  const text = (input?.value || '').trim();
  if (!text || !_pfcFriendUid || !currentUserId) return;
  input.value = '';
  const chatId = [currentUserId, _pfcFriendUid].sort().join('_');
  try {
    await db.collection('private_messages').add({
      chatId,
      from: currentUserId,
      fromName: currentUser || '',
      to: _pfcFriendUid,
      text,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) {
    showToast('تعذر إرسال الرسالة');
    input.value = text;
  }
}

// Update friend chat badge periodically
async function updateFriendChatBadge() {
  if (!currentUserId) return;
  try {
    // بـ where واحد بس عشان مش نحتاج Composite Index
    const snap = await db.collection('private_messages')
      .where('to', '==', currentUserId)
      .get();
    const count = snap.docs.filter(d => d.data().read === false).length;
    const badge = document.getElementById('friendChatBadge');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
  } catch(e) { console.error('updateFriendChatBadge error:', e); }
}
setInterval(() => { if (currentUserId) updateFriendChatBadge(); }, 30000);
document.addEventListener('userLoggedIn', () => setTimeout(updateFriendChatBadge, 3000));

// ============================================================
// ✨ TOOLS LIBRARY SYSTEM — مكتبة أدوات المستخدم
// ============================================================

const ALL_TOOLS_LIBRARY = [
  // ── رسم ──
  { id:'pen',        cat:'✏️ رسم',    icon:'fas fa-pen',            label:'قلم',        onclick:"setDrawTool('pen');updateActiveToolLabel('قلم')" },
  { id:'marker',     cat:'✏️ رسم',    icon:'fas fa-highlighter',    label:'ماركر',      onclick:"setDrawTool('marker');updateActiveToolLabel('ماركر')" },
  { id:'brush',      cat:'✏️ رسم',    icon:'fas fa-paintbrush',     label:'فرشاة',      onclick:"setDrawTool('brush');updateActiveToolLabel('فرشاة')" },
  { id:'eraser',     cat:'✏️ رسم',    icon:'fas fa-eraser',         label:'ممحاة',      onclick:"setDrawTool('eraser');updateActiveToolLabel('ممحاة')" },
  { id:'select',     cat:'✏️ رسم',    icon:'fas fa-hand-pointer',   label:'تحريك',      onclick:"setDrawTool('select');updateActiveToolLabel('تحريك')" },
  // ── أشكال ──
  { id:'line',       cat:'🔷 أشكال', icon:'fas fa-minus',           label:'خط',         onclick:"setDrawTool('line');updateActiveToolLabel('خط')" },
  { id:'rect',       cat:'🔷 أشكال', icon:'far fa-square',          label:'مستطيل',     onclick:"setDrawTool('rect');updateActiveToolLabel('مستطيل')" },
  { id:'circle',     cat:'🔷 أشكال', icon:'far fa-circle',          label:'دائرة',      onclick:"setDrawTool('circle');updateActiveToolLabel('دائرة')" },
  { id:'triangle',   cat:'🔷 أشكال', icon:'fas fa-play',            label:'مثلث',       onclick:"setDrawTool('triangle');updateActiveToolLabel('مثلث')" },
  { id:'arrow',      cat:'🔷 أشكال', icon:'fas fa-arrow-right',     label:'سهم',        onclick:"setDrawTool('arrow');updateActiveToolLabel('سهم')" },
  { id:'arrow2',     cat:'🔷 أشكال', icon:'fas fa-arrows-left-right',label:'مزدوج',     onclick:"setDrawTool('arrow2');updateActiveToolLabel('سهم مزدوج')" },
  { id:'star',       cat:'🔷 أشكال', icon:'fas fa-star',            label:'نجمة',       onclick:"setDrawTool('star');updateActiveToolLabel('نجمة')" },
  { id:'heart',      cat:'🔷 أشكال', icon:'fas fa-heart',           label:'قلب',        onclick:"setDrawTool('heart');updateActiveToolLabel('قلب')" },
  { id:'diamond',    cat:'🔷 أشكال', icon:'',                       label:'معين',       onclick:"setDrawTool('diamond');updateActiveToolLabel('معين')",  emoji:'◇' },
  { id:'pentagon',   cat:'🔷 أشكال', icon:'',                       label:'خماسي',      onclick:"setDrawTool('pentagon');updateActiveToolLabel('خماسي')", emoji:'⬠' },
  // ── نص ──
  { id:'text',       cat:'🔤 نص',    icon:'fas fa-font',            label:'نص عادي',    onclick:"setDrawTool('text');updateActiveToolLabel('نص')" },
  { id:'textbox',    cat:'🔤 نص',    icon:'fas fa-text-width',      label:'مربع نص',    onclick:"setDrawTool('textbox');updateActiveToolLabel('مربع نص')" },
  { id:'stickyNote', cat:'🔤 نص',    icon:'fas fa-sticky-note',     label:'ملاحظة',     onclick:"setDrawTool('stickyNote');updateActiveToolLabel('ملاحظة')" },
  // ── إجراءات ──
  { id:'undo',       cat:'⚙️ إجراءات', icon:'fas fa-rotate-left',   label:'تراجع',      onclick:'undoDraw()' },
  { id:'redo',       cat:'⚙️ إجراءات', icon:'fas fa-rotate-right',  label:'إعادة',      onclick:'redoDraw()' },
  { id:'clear',      cat:'⚙️ إجراءات', icon:'fas fa-trash',         label:'مسح الكل',   onclick:'clearDrawing()' },
  { id:'save_img',   cat:'⚙️ إجراءات', icon:'fas fa-download',      label:'حفظ صورة',   onclick:'saveDrawingAsImage()' },
  { id:'copy_img',   cat:'⚙️ إجراءات', icon:'fas fa-copy',          label:'نسخ',        onclick:'copyDrawingToClipboard()' },
];

// الأدوات الافتراضية
const DEFAULT_USER_TOOLS = ['pen','eraser','line','rect','circle'];

let _userSelectedTools = [...DEFAULT_USER_TOOLS]; // الأدوات المختارة حالياً (مؤقتة في المودال)
let _savedUserTools    = [...DEFAULT_USER_TOOLS]; // الأدوات المحفوظة

// ── حد الأدوات حسب الجهاز ──
function getToolsMax() {
  return window.innerWidth >= 768 ? 10 : 5;
}

// ── تحميل الأدوات من Firestore ──
async function loadUserToolsFromFirestore() {
  if (!currentUserId) return;
  try {
    const doc = await db.collection('user_preferences').doc(currentUserId).get();
    if (doc.exists && doc.data().selectedTools && Array.isArray(doc.data().selectedTools)) {
      _savedUserTools = doc.data().selectedTools;
    }
  } catch(e) { console.warn('loadUserTools error:', e); }
  renderUserToolsStrip();
}

// ── حفظ الأدوات في Firestore ──
async function saveUserTools() {
  if (!currentUserId) { showToast('⚠️ سجل دخولك أولاً'); return; }
  const max = getToolsMax();
  if (_userSelectedTools.length > max) {
    showToast(`⚠️ الحد الأقصى ${max} أدوات على جهازك`);
    return;
  }
  try {
    await db.collection('user_preferences').doc(currentUserId).set(
      { selectedTools: _userSelectedTools },
      { merge: true }
    );
    _savedUserTools = [..._userSelectedTools];
    renderUserToolsStrip();
    closeToolsLibraryModal();
    showToast('✅ تم حفظ أدواتك!');
  } catch(e) {
    console.error('saveUserTools error:', e);
    showToast('❌ فشل الحفظ، حاول تاني');
  }
}

// ── رسم شريط الأدوات تحت الفيديو ──
function renderUserToolsStrip() {
  const strip = document.getElementById('utsTools');
  if (!strip) return;
  if (!_savedUserTools || !_savedUserTools.length) {
    strip.innerHTML = `<span class="uts-empty">اضغط ✏️ لإضافة أدواتك</span>`;
    return;
  }
  strip.innerHTML = _savedUserTools.map(toolId => {
    const t = ALL_TOOLS_LIBRARY.find(x => x.id === toolId);
    if (!t) return '';
    const iconHtml = t.emoji
      ? `<span style="font-size:1rem">${t.emoji}</span>`
      : `<i class="${t.icon}"></i>`;
    return `<button class="uts-tool-btn" onclick="${t.onclick};highlightUtsBtn(this)" title="${t.label}">${iconHtml}<span>${t.label}</span></button>`;
  }).join('');
}

function highlightUtsBtn(btn) {
  document.querySelectorAll('.uts-tool-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // فتح لوحة الرسم لو مش مفتوحة
  const panel = document.getElementById('dbToolsPanel');
  if (panel && !panel.classList.contains('open')) {
    toggleDrawTools && toggleDrawTools();
  }
}

// ── فتح مودال مكتبة الأدوات ──
function openToolsLibraryModal() {
  _userSelectedTools = [..._savedUserTools];
  renderToolsLibraryModal();
  document.getElementById('toolsLibraryModal').classList.add('active');
}

function closeToolsLibraryModal() {
  document.getElementById('toolsLibraryModal').classList.remove('active');
}

// ── رسم محتوى مودال مكتبة الأدوات ──
function renderToolsLibraryModal() {
  const max = getToolsMax();
  document.getElementById('tlmMaxLabel').textContent = max;
  updateTlmCounter();
  renderTlmCurrentStrip();
  renderTlmCategories();
}

function updateTlmCounter() {
  const max = getToolsMax();
  const el = document.getElementById('tlmSelectedCount');
  if (el) {
    el.textContent = `${_userSelectedTools.length} / ${max}`;
    el.style.color = _userSelectedTools.length >= max ? '#ef4444' : '#fbbf24';
  }
}

function renderTlmCurrentStrip() {
  const el = document.getElementById('tlmCurrentStrip');
  if (!el) return;
  if (!_userSelectedTools.length) {
    el.innerHTML = `<span style="color:#555;font-size:.8rem">لا توجد أدوات مختارة</span>`;
    return;
  }
  el.innerHTML = _userSelectedTools.map((id, idx) => {
    const t = ALL_TOOLS_LIBRARY.find(x => x.id === id);
    if (!t) return '';
    const iconHtml = t.emoji
      ? `<span style="font-size:.95rem">${t.emoji}</span>`
      : `<i class="${t.icon}" style="font-size:.85rem"></i>`;
    return `<div class="tlm-strip-chip" draggable="true" data-idx="${idx}" ondragstart="tlmDragStart(event,${idx})" ondragover="tlmDragOver(event)" ondrop="tlmDrop(event,${idx})">
      ${iconHtml}
      <span style="font-size:.72rem">${t.label}</span>
      <button onclick="tlmRemoveTool('${id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:0;font-size:.7rem;margin-right:2px;line-height:1"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');
}

function renderTlmCategories() {
  const container = document.getElementById('tlmCategories');
  if (!container) return;
  const cats = [...new Set(ALL_TOOLS_LIBRARY.map(t => t.cat))];
  container.innerHTML = cats.map(cat => {
    const tools = ALL_TOOLS_LIBRARY.filter(t => t.cat === cat);
    return `<div class="tlm-cat">
      <div class="tlm-cat-title">${cat}</div>
      <div class="tlm-cat-grid">
        ${tools.map(t => {
          const selected = _userSelectedTools.includes(t.id);
          const iconHtml = t.emoji
            ? `<span style="font-size:1.1rem">${t.emoji}</span>`
            : `<i class="${t.icon}"></i>`;
          return `<button class="tlm-tool-card ${selected ? 'selected' : ''}" id="tlmCard_${t.id}" onclick="tlmToggleTool('${t.id}')">
            <div class="tlm-tool-icon">${iconHtml}</div>
            <span class="tlm-tool-label">${t.label}</span>
            <div class="tlm-check"><i class="fas fa-check"></i></div>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function tlmToggleTool(id) {
  const max = getToolsMax();
  if (_userSelectedTools.includes(id)) {
    // إزالة
    _userSelectedTools = _userSelectedTools.filter(x => x !== id);
  } else {
    // إضافة
    if (_userSelectedTools.length >= max) {
      showToast(`⚠️ وصلت للحد الأقصى (${max} أدوات)`);
      // إزالة الأول وإضافة الجديد
      _userSelectedTools.shift();
    }
    _userSelectedTools.push(id);
  }
  // تحديث الكارت
  const card = document.getElementById(`tlmCard_${id}`);
  if (card) card.classList.toggle('selected', _userSelectedTools.includes(id));
  updateTlmCounter();
  renderTlmCurrentStrip();
}

function tlmRemoveTool(id) {
  _userSelectedTools = _userSelectedTools.filter(x => x !== id);
  const card = document.getElementById(`tlmCard_${id}`);
  if (card) card.classList.remove('selected');
  updateTlmCounter();
  renderTlmCurrentStrip();
}

// ── drag & drop لإعادة ترتيب الأدوات المختارة ──
let _tlmDragIdx = null;
function tlmDragStart(e, idx) { _tlmDragIdx = idx; e.dataTransfer.effectAllowed = 'move'; }
function tlmDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function tlmDrop(e, toIdx) {
  e.preventDefault();
  if (_tlmDragIdx === null || _tlmDragIdx === toIdx) return;
  const arr = [..._userSelectedTools];
  const [moved] = arr.splice(_tlmDragIdx, 1);
  arr.splice(toIdx, 0, moved);
  _userSelectedTools = arr;
  _tlmDragIdx = null;
  renderTlmCurrentStrip();
}

// ── تحميل الأدوات عند تسجيل الدخول ──
document.addEventListener('userLoggedIn', () => setTimeout(loadUserToolsFromFirestore, 2000));
