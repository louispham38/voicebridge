/**
 * VoiceBridge – Content script.
 *
 * Injected into the active tab to show a floating translation panel with:
 *  - Live transcript (EN) + translation (VI)
 *  - Pause/Resume (pauses video + translation)
 *  - Stop translation
 *  - Inline correction editing
 *  - Volume control for original audio
 */

(() => {
  // Remove any leftover panels from previous injection / extension reload
  document.querySelectorAll("#vb-panel").forEach((el) => el.remove());
  document.querySelectorAll("style[data-vb]").forEach((el) => el.remove());
  window.__voiceBridgeInjected = true;

  let isPaused = false;
  let isEditing = false;
  let lastEn = "";
  let lastVi = "";

  // ── Build the panel ────────────────────────────────────────────────────

  const panel = document.createElement("div");
  panel.id = "vb-panel";
  panel.innerHTML = `
    <div id="vb-drag-handle">
      <span id="vb-title">VoiceBridge</span>
      <div id="vb-controls">
        <button id="vb-btn-pause" title="Dừng tạm">⏸</button>
        <button id="vb-btn-stop" title="Dừng dịch">⏹</button>
        <button id="vb-btn-minimize" title="Thu nhỏ">─</button>
      </div>
    </div>
    <div id="vb-body">
      <div id="vb-sub-area">
        <div id="vb-transcript-row">
          <span class="vb-lang">EN</span>
          <span id="vb-transcript">Đang chờ…</span>
        </div>
        <div id="vb-translation-row">
          <span class="vb-lang vb-lang-vi">VI</span>
          <span id="vb-translation">Đang chờ…</span>
          <button id="vb-btn-edit" title="Sửa bản dịch">✎</button>
        </div>
      </div>
      <div id="vb-edit-area" style="display:none">
        <div class="vb-edit-row">
          <input id="vb-edit-en" placeholder="Tiếng Anh gốc" />
          <span class="vb-arrow">→</span>
          <input id="vb-edit-vi" placeholder="Bản dịch đúng (tiếng Việt)" />
        </div>
        <div class="vb-edit-actions">
          <button id="vb-btn-save-edit">Lưu sửa</button>
          <button id="vb-btn-cancel-edit">Huỷ</button>
        </div>
      </div>
      <div id="vb-volume-row">
        <span class="vb-vol-label">Âm lượng gốc</span>
        <input type="range" id="vb-volume" min="0" max="100" value="15" />
        <span id="vb-vol-val">15%</span>
      </div>
      <div id="vb-status-row">
        <span id="vb-paused-badge" class="vb-hidden">⏸ TẠM DỪNG</span>
        <span id="vb-timing"></span>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.setAttribute("data-vb", "1");
  style.textContent = `
    #vb-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 420px;
      background: rgba(15, 17, 23, 0.95);
      border: 1px solid rgba(108, 92, 231, 0.3);
      border-radius: 14px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #e4e6f0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      backdrop-filter: blur(12px);
      overflow: hidden;
      transition: all 0.3s;
    }
    #vb-panel.vb-minimized #vb-body { display: none; }
    #vb-panel.vb-minimized { width: 200px; }

    #vb-drag-handle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: rgba(108, 92, 231, 0.12);
      cursor: move;
      user-select: none;
    }
    #vb-title {
      font-size: 12px;
      font-weight: 700;
      color: #a29bfe;
      letter-spacing: 0.3px;
    }
    #vb-controls { display: flex; gap: 4px; }
    #vb-controls button {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #e4e6f0;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    #vb-controls button:hover { background: rgba(255,255,255,0.18); }
    #vb-btn-pause.vb-active {
      background: rgba(0, 184, 148, 0.3);
      color: #00b894;
    }

    #vb-body { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 8px; }

    #vb-sub-area { display: flex; flex-direction: column; gap: 6px; }

    #vb-transcript-row, #vb-translation-row {
      display: flex; align-items: flex-start; gap: 8px;
    }
    .vb-lang {
      flex-shrink: 0;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.08);
      color: #8b90a5;
      margin-top: 2px;
    }
    .vb-lang-vi {
      background: rgba(108, 92, 231, 0.2);
      color: #a29bfe;
    }
    #vb-transcript {
      font-size: 13px;
      color: #8b90a5;
      line-height: 1.4;
      word-break: break-word;
    }
    #vb-translation {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      line-height: 1.4;
      word-break: break-word;
      flex: 1;
    }
    #vb-btn-edit {
      flex-shrink: 0;
      background: none;
      border: none;
      color: #8b90a5;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      opacity: 0.5;
      transition: opacity 0.15s;
    }
    #vb-btn-edit:hover { opacity: 1; color: #a29bfe; }

    #vb-edit-area {
      background: rgba(108, 92, 231, 0.08);
      border: 1px solid rgba(108, 92, 231, 0.3);
      border-radius: 8px;
      padding: 10px;
    }
    .vb-edit-row {
      display: flex; align-items: center; gap: 6px;
    }
    .vb-edit-row input {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      background: rgba(0,0,0,0.3);
      color: #e4e6f0;
      font-size: 12px;
      outline: none;
      font-family: inherit;
    }
    .vb-edit-row input:focus { border-color: #6c5ce7; }
    .vb-arrow { color: #a29bfe; font-size: 14px; flex-shrink: 0; }
    .vb-edit-actions {
      display: flex; gap: 6px; margin-top: 8px;
    }
    .vb-edit-actions button {
      padding: 5px 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      background: rgba(255,255,255,0.06);
      color: #e4e6f0;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .vb-edit-actions button:hover { background: rgba(255,255,255,0.15); }
    #vb-btn-save-edit {
      background: rgba(108, 92, 231, 0.3);
      border-color: rgba(108, 92, 231, 0.4);
    }
    #vb-btn-save-edit:hover { background: rgba(108, 92, 231, 0.5); }

    #vb-volume-row {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 0;
    }
    .vb-vol-label { font-size: 11px; color: #8b90a5; white-space: nowrap; }
    #vb-volume { flex: 1; accent-color: #6c5ce7; height: 3px; }
    #vb-vol-val { font-size: 11px; color: #8b90a5; min-width: 28px; text-align: right; }

    #vb-status-row {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 11px; color: #8b90a5;
    }
    #vb-paused-badge {
      color: #00b894;
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.5px;
      animation: vb-blink 1.5s infinite;
    }
    @keyframes vb-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .vb-hidden { display: none !important; }
  `;

  document.documentElement.appendChild(style);
  document.body.appendChild(panel);

  // ── DOM refs ───────────────────────────────────────────────────────────

  const transcriptEl = document.getElementById("vb-transcript");
  const translationEl = document.getElementById("vb-translation");
  const btnPause = document.getElementById("vb-btn-pause");
  const btnStop = document.getElementById("vb-btn-stop");
  const btnMinimize = document.getElementById("vb-btn-minimize");
  const btnEdit = document.getElementById("vb-btn-edit");
  const editArea = document.getElementById("vb-edit-area");
  const editEn = document.getElementById("vb-edit-en");
  const editVi = document.getElementById("vb-edit-vi");
  const btnSaveEdit = document.getElementById("vb-btn-save-edit");
  const btnCancelEdit = document.getElementById("vb-btn-cancel-edit");
  const volumeSlider = document.getElementById("vb-volume");
  const volVal = document.getElementById("vb-vol-val");
  const pausedBadge = document.getElementById("vb-paused-badge");
  const timingEl = document.getElementById("vb-timing");

  // ── Drag support ───────────────────────────────────────────────────────

  const handle = document.getElementById("vb-drag-handle");
  let dragging = false, dx = 0, dy = 0;

  handle.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dx = e.clientX - rect.left;
    dy = e.clientY - rect.top;
    panel.style.transition = "none";
  }, true);

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    panel.style.left = (e.clientX - dx) + "px";
    panel.style.top = (e.clientY - dy) + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }, true);

  document.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
    panel.style.transition = "";
  }, true);

  // ── Subtitle display ──────────────────────────────────────────────────

  let clearTimer = null;

  function showSubtitle(transcript, translation) {
    if (isPaused) return;
    if (transcript !== undefined) {
      transcriptEl.textContent = transcript;
      lastEn = transcript;
    }
    if (translation !== undefined) {
      translationEl.textContent = translation;
      lastVi = translation;
    }
    clearTimeout(clearTimer);
  }

  // ── Pause / Resume ────────────────────────────────────────────────────

  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {}
  }

  function togglePause() {
    isPaused = !isPaused;
    btnPause.textContent = isPaused ? "▶" : "⏸";
    btnPause.title = isPaused ? "Tiếp tục" : "Dừng tạm";
    btnPause.classList.toggle("vb-active", isPaused);
    pausedBadge.classList.toggle("vb-hidden", !isPaused);

    document.querySelectorAll("video, audio").forEach((el) => {
      if (isPaused) el.pause();
      else el.play().catch(() => {});
    });

    safeSendMessage({
      target: "background",
      type: isPaused ? "pause-translation" : "resume-translation",
    });
  }

  function stopTranslation() {
    safeSendMessage({ target: "background", type: "stop" });
    cleanup();
  }

  // ── Minimize ──────────────────────────────────────────────────────────

  let minimized = false;
  function toggleMinimize() {
    minimized = !minimized;
    panel.classList.toggle("vb-minimized", minimized);
    btnMinimize.textContent = minimized ? "☐" : "─";
    btnMinimize.title = minimized ? "Mở rộng" : "Thu nhỏ";
  }

  // ── Edit correction ───────────────────────────────────────────────────

  function openEdit() {
    isEditing = true;
    editEn.value = lastEn;
    editVi.value = lastVi;
    editArea.style.display = "";
    editVi.focus();
  }

  function closeEdit() {
    isEditing = false;
    editArea.style.display = "none";
  }

  async function saveEdit() {
    const en = editEn.value.trim();
    const vi = editVi.value.trim();
    if (!en || !vi) return;

    try {
      const form = new FormData();
      form.append("en", en);
      form.append("vi", vi);
      const backendHttp = window.__vbBackendHttp || "http://localhost:8765";
      await fetch(`${backendHttp}/api/corrections`, { method: "POST", body: form });
      translationEl.textContent = vi;
      closeEdit();
    } catch (e) {
      console.error("[VoiceBridge] Save correction error:", e);
    }
  }

  // ── Volume control ────────────────────────────────────────────────────

  function setMediaVolume(level) {
    document.querySelectorAll("video, audio").forEach((el) => {
      el.volume = Math.max(0, Math.min(1, level));
    });
  }

  volumeSlider.addEventListener("input", () => {
    const val = parseInt(volumeSlider.value);
    volVal.textContent = val + "%";
    setMediaVolume(val / 100);
    safeSendMessage({
      target: "content",
      type: "set-volume",
      level: val / 100,
    });
  });

  // ── Button handlers ───────────────────────────────────────────────────

  btnPause.addEventListener("click", togglePause);
  btnStop.addEventListener("click", stopTranslation);
  btnMinimize.addEventListener("click", toggleMinimize);
  btnEdit.addEventListener("click", openEdit);
  btnSaveEdit.addEventListener("click", saveEdit);
  btnCancelEdit.addEventListener("click", closeEdit);

  // ── Message listener ──────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "transcript") {
      showSubtitle(msg.text, undefined);
    }
    if (msg.type === "translation") {
      showSubtitle(undefined, msg.text);
    }
    if (msg.type === "timing") {
      timingEl.textContent = `${msg.seconds}s`;
    }
    if (msg.type === "set-volume") {
      setMediaVolume(msg.level);
      volumeSlider.value = Math.round(msg.level * 100);
      volVal.textContent = Math.round(msg.level * 100) + "%";
    }
    if (msg.type === "vb-set-backend") {
      window.__vbBackendHttp = msg.backendHttp;
    }
    if (msg.type === "vb-cleanup") {
      cleanup();
    }
  });

  function cleanup() {
    panel.remove();
    style.remove();
    window.__voiceBridgeInjected = false;
  }

  setMediaVolume(0.15);
})();
