/* ============================================================
   AI Chat Multi-File Upload Enhancements
   Supports: max 5 images OR 5 files, drag & drop, previews
   ============================================================ */

(function() {
  'use strict';

  // ── State ──
  window._aiAttachedFiles = [];
  const AI_MAX_FILES = 5;
  const AI_MAX_IMG_SIZE = 5 * 1024 * 1024;   // 5 MB for images
  const AI_MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10 MB for documents

  // ── Allowed MIME types ──
  function isAllowedFile(type, name) {
    if (type.startsWith('image/')) return true;
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ['txt','csv','json','md','js','py','html','css','log','pdf'].includes(ext);
  }

  // ── Render file preview chips ──
  function renderAIFilePreviews() {
    const container = document.getElementById('aiFilesPreview');
    if (!container) return;
    const files = window._aiAttachedFiles || [];
    if (!files.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = files.map((file, index) => {
      const isImage = file.type.startsWith('image/');
      const sizeStr = file.size > 1024 * 1024
        ? (file.size / (1024*1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(1) + ' KB';
      let iconHtml;
      if (isImage) {
        const url = URL.createObjectURL(file);
        iconHtml = `<img src="${url}" alt="" loading="lazy" onload="URL.revokeObjectURL('${url}')" onerror="URL.revokeObjectURL('${url}')">`;
      } else {
        const ext = file.name.split('.').pop().toLowerCase();
        const icons = { txt:'fa-file-lines', csv:'fa-file-csv', json:'fa-file-code', md:'fa-file-lines', js:'fa-file-code', py:'fa-file-code', html:'fa-file-code', css:'fa-file-code', log:'fa-file-lines', pdf:'fa-file-pdf' };
        iconHtml = '<i class="fas ' + (icons[ext] || 'fa-file') + '"></i>';
      }
      return '<div class="ai-file-chip" data-index="' + index + '">'
        + '<div class="ai-file-icon">' + iconHtml + '</div>'
        + '<div class="ai-file-info">'
        + '<span class="ai-file-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</span>'
        + '<span class="ai-file-size">' + sizeStr + '</span>'
        + '</div>'
        + '<button class="ai-file-remove" data-remove="' + index + '" onclick="removeAIFile(' + index + ')" title="إزالة"><i class="fas fa-times"></i></button>'
        + '</div>';
    }).join('');
    if (files.length >= AI_MAX_FILES) {
      container.innerHTML += '<div class="ai-file-chip-limit"><i class="fas fa-info-circle"></i> الحد الأقصى 5 ملفات</div>';
    }
  }

  // ── Remove a file by index ──
  function removeAIFile(index) {
    if (window._aiAttachedFiles && window._aiAttachedFiles[index]) {
      window._aiAttachedFiles.splice(index, 1);
      renderAIFilePreviews();
    }
  }

  // ── Clear all files ──
  function clearAIFiles() {
    window._aiAttachedFiles = [];
    const el = document.getElementById('aiFilesPreview');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  // ── Handle file selection (from input or drop) ──
  function handleAIFileSelect(files) {
    if (!files || !files.length) return;
    const current = window._aiAttachedFiles || [];
    let imagesCount = current.filter(f => f.type.startsWith('image/')).length;
    let docsCount = current.filter(f => !f.type.startsWith('image/')).length;
    const accepted = [];

    for (const file of files) {
      if (current.length + accepted.length >= AI_MAX_FILES) {
        showToast('⚠️ الحد الأقصى 5 ملفات فقط');
        break;
      }
      if (!isAllowedFile(file.type, file.name)) {
        showToast('⚠️ نوع الملف غير مدعوم: ' + file.name);
        continue;
      }
      if (file.type.startsWith('image/')) {
        if (imagesCount >= AI_MAX_FILES) {
          showToast('⚠️ الحد الأقصى 5 صور');
          break;
        }
        if (file.size > AI_MAX_IMG_SIZE) {
          showToast('⚠️ الصورة كبيرة (الحد 5 ميجا): ' + file.name);
          continue;
        }
        imagesCount++;
      } else {
        if (docsCount >= AI_MAX_FILES) {
          showToast('⚠️ الحد الأقصى 5 ملفات');
          break;
        }
        if (file.size > AI_MAX_FILE_SIZE) {
          showToast('⚠️ الملف كبير (الحد 10 ميجا): ' + file.name);
          continue;
        }
        docsCount++;
      }
      accepted.push(file);
    }

    if (!accepted.length) return;
    window._aiAttachedFiles = [...current, ...accepted];
    renderAIFilePreviews();
    showToast('📎 تمت إضافة ' + accepted.length + ' ملف(ات)');
  }

  // ── Read file as base64 data URL ──
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Send to Gemini API for vision ──
  async function sendToGemini(text, fileContents, apiKey) {
    try {
      const parts = [];
      if (text) parts.push({ text: text });
      for (const fc of fileContents) {
        if (fc.isImage) {
          const b64 = fc.data.split(',')[1] || fc.data;
          parts.push({ inlineData: { mimeType: fc.type || 'image/jpeg', data: b64 } });
        } else {
          try {
            const decoded = atob(fc.data.split(',')[1] || fc.data);
            parts.push({ text: '\n[ملف: ' + fc.name + ']\n' + decoded.substring(0, 3000) + '\n' });
          } catch(e) {
            parts.push({ text: '\n[ملف: ' + fc.name + ']\n' });
          }
        }
      }
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 8000, temperature: 0.3 } })
      });
      if (!resp.ok) throw new Error('Gemini error: ' + resp.status);
      const data = await resp.json();
      const answer = data.candidates && data.candidates[0] && data.candidates[0].content
        ? data.candidates[0].content.parts.map(p => p.text).join('\n')
        : 'عذراً، لم أستطع تحليل المرفقات.';
      hideAITyping();
      displayAIMessage(answer, 'ai');
      if (typeof speakText === 'function') speakText(answer);
    } catch (error) {
      console.error(error);
      hideAITyping();
      if (text) {
        try {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + (typeof getAiApiKey === 'function' ? getAiApiKey() : ''), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'openai/gpt-oss-120b',
              messages: [
                { role: 'system', content: 'أنت مساعد متخصص في الفلك. جاوب بالعربية بدقة.' },
                { role: 'user', content: text + '\n\n[تم إرفاق ' + fileContents.length + ' ملف(ات)]' }
              ],
              max_tokens: 8000, temperature: 0.3
            })
          });
          const d = await resp.json();
          const a = d.choices[0].message.content;
          displayAIMessage(a, 'ai');
          if (typeof speakText === 'function') speakText(a);
          return;
        } catch(e2) { console.error(e2); }
      }
      displayAIMessage('عذراً، فشل تحليل الملفات. تأكد من إعداد مفتاح Gemini.', 'ai');
    }
  }

  // ── Typing indicator ──
  function showAITyping() {
    const cont = document.getElementById('aiChatMessages');
    if (!cont) return;
    let el = document.getElementById('aiTypingIndicator');
    if (el) { el.classList.add('active'); cont.scrollTop = cont.scrollHeight; return; }
    el = document.createElement('div');
    el.className = 'ai-typing-indicator active';
    el.id = 'aiTypingIndicator';
    el.innerHTML = '<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>';
    cont.appendChild(el);
    cont.scrollTop = cont.scrollHeight;
  }
  function hideAITyping() {
    const el = document.getElementById('aiTypingIndicator');
    if (el) { el.classList.remove('active'); }
  }

  // ── Custom sendAIMessage with file support ──
  async function enhancedSendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const text = input ? input.value.trim() : '';
    const attachedFiles = window._aiAttachedFiles || [];

    if (!text && !attachedFiles.length) return;

    const sendBtn = document.querySelector('#aiChatModal .chat-send-btn');
    if (sendBtn) {
      sendBtn.classList.remove('sending');
      void sendBtn.offsetWidth;
      sendBtn.classList.add('sending');
      setTimeout(() => sendBtn.classList.remove('sending'), 600);
    }

    // Build attachment list for display
    const displayAttachments = attachedFiles.map(f => ({
      file: f,
      isImage: f.type.startsWith('image/'),
      _blobUrl: null
    }));

    // Read all files
    const fileContents = [];
    for (const file of attachedFiles) {
      try {
        const data = await readFileAsDataURL(file);
        fileContents.push({ name: file.name, type: file.type, data, isImage: file.type.startsWith('image/') });
      } catch(e) {
        console.warn('Failed to read file:', file.name, e);
      }
    }

    // Display user message with attachments
    if (typeof displayAIMessage === 'function') {
      displayAIMessage(text, 'user', displayAttachments);
    }

    // Clear input
    if (input) { input.value = ''; input.style.height = ''; try { input.dispatchEvent(new Event('input')); } catch(e) {} }
    window._aiAttachedFiles = [];
    const previewEl = document.getElementById('aiFilesPreview');
    if (previewEl) { previewEl.style.display = 'none'; previewEl.innerHTML = ''; }

    // Image generation request (no files)
    if (!fileContents.length && typeof isImageRequest === 'function' && isImageRequest(text)) {
      const prompt = typeof extractImagePrompt === 'function' ? extractImagePrompt(text) : text;
      if (typeof generateAndDisplayImage === 'function') {
        await generateAndDisplayImage(prompt);
      }
      return;
    }

    // Try Gemini first if there are images and key available
    const geminiKey = typeof getGeminiApiKey === 'function' ? getGeminiApiKey() : '';
    const hasImages = fileContents.some(f => f.isImage);

    if (hasImages && geminiKey) {
      await sendToGemini(text, fileContents, geminiKey);
      return;
    }

    // Build text content for non-image files or fallback
    let fileText = '';
    for (const fc of fileContents) {
      if (!fc.isImage) {
        try {
          const decoded = atob(fc.data.split(',')[1] || fc.data);
          fileText += '\n--- محتوى الملف: ' + fc.name + ' ---\n' + decoded.substring(0, 3000) + '\n';
        } catch(e) {
          fileText += '\n[ملف: ' + fc.name + ' - تعذر القراءة]\n';
        }
      } else {
        fileText += '\n[صورة: ' + fc.name + ']\n';
      }
    }

    const userContent = (text || '') + (fileText ? '\n\n' + fileText : '');

    try {
      showAITyping();
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (typeof getAiApiKey === 'function' ? getAiApiKey() : ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: 'أنت مساعد متخصص في الفلك. جاوب بالعربية بدقة. إذا أُرفقت ملفات، حللها وقدم ملخصاً.' },
            { role: 'user', content: userContent }
          ],
          max_tokens: 8000, temperature: 0.3
        })
      });
      const data = await resp.json();
      if (!data.choices || !data.choices[0]) throw new Error('No response');
      const answer = data.choices[0].message.content;
      hideAITyping();
      displayAIMessage(answer, 'ai');
      if (typeof speakText === 'function') speakText(answer);
    } catch (error) {
      console.error(error);
      hideAITyping();
      displayAIMessage('عذراً، فشل الاتصال بالذكاء الاصطناعي.', 'ai');
    }
  }

  // ── Drag & Drop Setup (max 10 retries) ──
  var _ddRetries = 0;
  var _ddMaxRetries = 10;
  function setupDragDrop() {
    const chatMessages = document.getElementById('aiChatMessages');
    if (!chatMessages) {
      _ddRetries++;
      if (_ddRetries < _ddMaxRetries) {
        setTimeout(setupDragDrop, 500);
      }
      return;
    }

    chatMessages.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('aiDropOverlay');
      if (overlay) { overlay.style.display = 'flex'; overlay.classList.add('drag-over'); }
    });

    chatMessages.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('aiDropOverlay');
      if (overlay && !chatMessages.contains(e.relatedTarget)) {
        overlay.classList.remove('drag-over');
        overlay.style.display = 'none';
      }
    });

    chatMessages.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('aiDropOverlay');
      if (overlay) { overlay.classList.remove('drag-over'); overlay.style.display = 'none'; }
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) handleAIFileSelect(files);
    });
  }

  // ── Patch the original file input to support multiple ──
  function patchFileInput() {
    const input = document.getElementById('aiFileInput');
    if (input) {
      if (!input.hasAttribute('multiple')) input.setAttribute('multiple', '');
    }
  }

  // ── Create the drop overlay if it doesn't exist ──
  function ensureDropOverlay() {
    if (document.getElementById('aiDropOverlay')) return;
    const chatArea = document.querySelector('#aiChatModal .chat-messages');
    if (!chatArea) return;
    const overlay = document.createElement('div');
    overlay.id = 'aiDropOverlay';
    overlay.className = 'ai-drop-overlay';
    overlay.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(6,182,212,.12);backdrop-filter:blur(8px);align-items:center;justify-content:center;z-index:50;pointer-events:none;';
    overlay.innerHTML = '<div class="ai-drop-content" style="text-align:center;color:#06b6d4;pointer-events:none;"><i class="fas fa-cloud-upload-alt" style="font-size:3rem;display:block;margin-bottom:.75rem;animation:float 3s ease-in-out infinite;"></i><p style="font-size:1.1rem;font-weight:700;margin:0 0 .3rem;">أفلت الملفات هنا</p><span style="font-size:.8rem;color:#88b4d4;opacity:.8;">صور وملفات (حد أقصى 5)</span></div>';
    chatArea.style.position = 'relative';
    chatArea.appendChild(overlay);
  }

  // ── Ensure the files preview container exists ──
  function ensureFilesPreview() {
    if (document.getElementById('aiFilesPreview')) return;
    const inputArea = document.querySelector('#aiChatModal .chat-input-area');
    if (!inputArea) return;
    const preview = document.createElement('div');
    preview.id = 'aiFilesPreview';
    preview.className = 'ai-files-preview';
    preview.style.cssText = 'display:none;flex-wrap:wrap;gap:8px;padding:8px 16px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.06);max-height:120px;overflow-y:auto;';
    inputArea.insertBefore(preview, inputArea.firstChild);
  }

  // ── Initialize everything when AI chat opens ──
  function initAIEnhancements() {
    ensureDropOverlay();
    ensureFilesPreview();
    patchFileInput();
    setupDragDrop();
  }

  // ── Expose internal helpers (these don't clash with script.js) ──
  window.removeAIFile = removeAIFile;
  window.clearAIFiles = clearAIFiles;
  window.clearAIFile = clearAIFiles;
  window.renderAIFilePreviews = renderAIFilePreviews;
  window.initAIEnhancements = initAIEnhancements;

  // ── Guard against double application ──
  var _overridesApplied = false;

  // ── Apply ALL global overrides AFTER script.js has loaded ──
  function applyOverrides() {
    if (_overridesApplied) return;
    _overridesApplied = true;

    // Override file handler
    window.handleAIFileSelect = function(input) {
      if (input && input.files) {
        handleAIFileSelect(Array.from(input.files));
        input.value = '';
      }
    };

    // Override displayAIMessage with attachment support
    var origDisplayAI = window.displayAIMessage;
    window.displayAIMessage = function(text, sender, attachments) {
      if (typeof origDisplayAI === 'function' && text) {
        origDisplayAI(text, sender);
      } else if (typeof origDisplayAI === 'function' && !text && attachments) {
        var mCont = document.getElementById('aiChatMessages');
        if (!mCont) return;
        var mMsg = document.createElement('div');
        mMsg.className = 'message ' + (sender === 'user' ? 'sent' : 'received');
        mCont.appendChild(mMsg);
        mCont.scrollTop = mCont.scrollHeight;
      }
      
      if (attachments && attachments.length) {
        var dCont = document.getElementById('aiChatMessages');
        if (!dCont) return;
        var msgs = dCont.querySelectorAll('.message');
        var lastMsg = msgs[msgs.length - 1];
        if (!lastMsg) return;
        
        var attachDiv = document.createElement('div');
        attachDiv.className = 'message-attachments';
        
        for (var i = 0; i < attachments.length; i++) {
          var att = attachments[i];
          var attEl = document.createElement('div');
          attEl.className = 'message-attachment';
          
          if (att.isImage && att.file) {
            var url = URL.createObjectURL(att.file);
            att._blobUrl = url;
            var img = document.createElement('img');
            img.src = url;
            img.alt = att.file.name || 'صورة';
            img.loading = 'lazy';
            img.onload = function() { URL.revokeObjectURL(url); };
            img.onerror = function() { URL.revokeObjectURL(url); };
            attEl.appendChild(img);
            attEl.onclick = function() { window.open(url, '_blank'); };
          } else if (att.file) {
            var ext = att.file.name.split('.').pop().toLowerCase();
            var iconMap = { txt:'fa-file-lines', csv:'fa-file-csv', json:'fa-file-code', md:'fa-file-lines', js:'fa-file-code', py:'fa-file-code', html:'fa-file-code', css:'fa-file-code', log:'fa-file-lines' };
            var icon = iconMap[ext] || 'fa-file';
            attEl.innerHTML = '<span class="file-attach" title="' + escapeHtml(att.file.name) + '"><i class="fas ' + icon + '"></i> ' + escapeHtml(att.file.name) + '</span>';
          }
          attachDiv.appendChild(attEl);
        }
        
        var contentEl = lastMsg.querySelector('.message-content');
        var timeEl = lastMsg.querySelector('.message-time');
        if (contentEl && timeEl) {
          lastMsg.insertBefore(attachDiv, timeEl);
        } else {
          lastMsg.appendChild(attachDiv);
        }
      }
    };

    // Override sendAIMessage
    window.sendAIMessage = enhancedSendAIMessage;

    // Wrap openAIChat to init enhancements after modal opens
    var origOpen = window.openAIChat;
    window.openAIChat = function() {
      if (typeof origOpen === 'function') origOpen();
      setTimeout(function() {
        initAIEnhancements();
        window.sendAIMessage = enhancedSendAIMessage;
      }, 300);
    };
  }

  // ── Apply overrides after script.js has definitely loaded ──
  // script.js is at bottom of <body>, so DOMContentLoaded fires after it
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(applyOverrides, 1500); });
  } else {
    setTimeout(applyOverrides, 1500);
  }
  // Fallback: also try on window load
  window.addEventListener('load', function() { setTimeout(applyOverrides, 200); });

  // ── Helper: escapeHtml ──
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  window.escapeHtml = window.escapeHtml || escapeHtml;
})();
