/**
 * Minimal Multi-File Upload for AI Chat
 * 
 * This file ONLY adds multi-file upload support to the AI chat.
 * It does NOT modify the original AI logic (Groq, Gemini, displayAIMessage).
 * File contents are read and appended to the message text before calling the original sendAIMessage.
 */
(function() {
  'use strict';

  // ── State ──
  window._aiAttachedFiles = [];
  var FILE_LIMIT = 5;

  // ── Read file as text ──
  function readFileText(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = reject;
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  // ── Render file preview chips ──
  function renderPreviews() {
    var container = document.getElementById('aiFilesPreview');
    if (!container) return;
    var files = window._aiAttachedFiles || [];
    if (files.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = files.map(function(file, i) {
      var size = file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(1) + ' KB';
      var name = file.name;
      // Escape HTML in filename
      var safeName = name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return '<div class="file-chip" data-index="' + i + '">'
        + '<span class="file-chip-name" title="' + safeName + '">' + safeName + '</span>'
        + '<span class="file-chip-size">' + size + '</span>'
        + '<button class="file-chip-remove" data-index="' + i + '" onclick="window.removeAttachedFile(' + i + ')" title="إزالة"><i class="fas fa-times"></i></button>'
        + '</div>';
    }).join('');
  }

  // ── Remove a file ──
  window.removeAttachedFile = function(index) {
    var files = window._aiAttachedFiles;
    if (files && files[index]) {
      files.splice(index, 1);
      renderPreviews();
    }
  };

  // ── Override handleAIFileSelect for multi-file ──
  window.handleAIFileSelect = function(input) {
    if (!input || !input.files || !input.files.length) return;
    var newFiles = Array.from(input.files);
    window._aiAttachedFiles = window._aiAttachedFiles || [];

    for (var i = 0; i < newFiles.length; i++) {
      if (window._aiAttachedFiles.length >= FILE_LIMIT) {
        showToast('⚠️ الحد الأقصى ' + FILE_LIMIT + ' ملفات');
        break;
      }
      window._aiAttachedFiles.push(newFiles[i]);
    }

    input.value = '';
    renderPreviews();

    if (window._aiAttachedFiles.length > 0) {
      showToast('📎 تم اختيار ' + window._aiAttachedFiles.length + ' ملف(ات)');
    }
  };

  // ── Override clearAIFile for multi-file ──
  window.clearAIFile = function() {
    window._aiAttachedFiles = [];
    var el = document.getElementById('aiFilesPreview');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  };

  // ── Wrap sendAIMessage to include file content ──
  var origSendAI = window.sendAIMessage;
  window.sendAIMessage = async function(injectedMsg) {
    var files = window._aiAttachedFiles || [];
    var input = document.getElementById('aiChatInput');
    var text = '';
    if (injectedMsg) {
      text = injectedMsg;
    } else if (input) {
      text = input.value.trim();
    }

    // If no files, call original directly
    if (files.length === 0) {
      if (text) {
        if (typeof origSendAI === 'function') {
          return origSendAI(injectedMsg);
        }
      }
      return;
    }

    // Read files and append their content to the message
    var fileText = '';
    for (var i = 0; i < files.length; i++) {
      try {
        var file = files[i];
        fileText += '\n[' + file.name + ']\n';
        if (!file.type.startsWith('image/')) {
          var content = await readFileText(file);
          fileText += content.substring(0, 5000) + '\n';
        } else {
          fileText += '[صورة: ' + file.name + ']\n';
        }
      } catch (e) {
        fileText += '[ملف: ' + files[i].name + ' - تعذر القراءة]\n';
      }
    }

    // Clear attached files
    window._aiAttachedFiles = [];
    var previewEl = document.getElementById('aiFilesPreview');
    if (previewEl) { previewEl.style.display = 'none'; previewEl.innerHTML = ''; }

    // Build final message: text + file contents
    var finalText = text ? text + '\n\n' + fileText : fileText.trim();

    // Call original sendAIMessage with enriched text (it handles display and Groq API)
    if (typeof origSendAI === 'function') {
      return origSendAI(finalText);
    }
  };

  // ── Set up UI after DOM is ready ──
  function setupUI() {
    // Create preview container
    if (!document.getElementById('aiFilesPreview')) {
      var inputArea = document.querySelector('#aiChatModal .chat-input-area');
      if (inputArea) {
        var div = document.createElement('div');
        div.id = 'aiFilesPreview';
        div.className = 'file-preview-strip';
        div.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;padding:6px 16px;background:rgba(0,0,0,.15);';
        inputArea.insertBefore(div, inputArea.firstChild);
      }
    }

    // Add multiple attribute to file input
    var fileInput = document.getElementById('aiFileInput');
    if (fileInput && !fileInput.hasAttribute('multiple')) {
      fileInput.setAttribute('multiple', '');
    }
  }

  // Run setup on DOMContentLoaded (by this time, script.js has loaded)
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setupUI();
  } else {
    document.addEventListener('DOMContentLoaded', setupUI);
  }

  // Also patch on openAIChat
  var origOpenChat = window.openAIChat;
  if (typeof origOpenChat === 'function') {
    window.openAIChat = function() {
      origOpenChat();
      setTimeout(setupUI, 200);
    };
  }
})();
