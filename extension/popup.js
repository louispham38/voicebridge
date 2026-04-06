/**
 * VoiceBridge – Popup UI controller.
 *
 * Manages three tabs (Translate, Voice, Settings), communicates with
 * the background service worker, and renders live transcript / translation.
 * Supports local + cloud provider configuration.
 */

// ── State ───────────────────────────────────────────────────────────────

let isCapturing = false;
let settings = {
  backendUrl: "ws://localhost:8765/ws/translate",
  backendHttp: "http://localhost:8765",
  defaultVoice: "vi-VN-HoaiMyNeural",
  sttProvider: "local",
  ttsProvider: "edge-tts",
  openaiApiKey: "",
  elevenlabsApiKey: "",
  openaiTtsVoice: "nova",
  elevenlabsVoiceId: "",
  voiceProfile: "",
};

// ── DOM refs ────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const statusBadge = $("#statusBadge");
const btnToggle = $("#btnToggle");
const volumeSlider = $("#volumeSlider");
const volumeValue = $("#volumeValue");
const liveTranscript = $("#liveTranscript");
const liveTranslation = $("#liveTranslation");
const metaTiming = $("#metaTiming");

// Voice tab – ElevenLabs
const elCloneName = $("#elCloneName");
const elCloneFile = $("#elCloneFile");
const btnElClone = $("#btnElClone");
const btnElRecord = $("#btnElRecord");
const elCloneStatus = $("#elCloneStatus");
const elVoicesList = $("#elVoicesList");

// Voice tab – Coqui
const voiceNameInput = $("#voiceName");
const btnRecord = $("#btnRecord");
const recTimer = $("#recTimer");
const fileUpload = $("#fileUpload");
const samplesList = $("#samplesList");
const profilesList = $("#profilesList");

// Corrections
const btnEditTranslation = $("#btnEditTranslation");
const correctionForm = $("#correctionForm");
const correctionEn = $("#correctionEn");
const correctionVi = $("#correctionVi");
const btnSaveCorrection = $("#btnSaveCorrection");
const btnCancelCorrection = $("#btnCancelCorrection");
const glossaryList = $("#glossaryList");
const glossaryCount = $("#glossaryCount");

// Settings
const backendUrlInput = $("#backendUrl");
const sttProviderSel = $("#sttProvider");
const ttsProviderSel = $("#ttsProvider");
const defaultVoiceSelect = $("#defaultVoice");
const openaiVoiceSelect = $("#openaiVoice");
const elevenlabsVoiceSelect = $("#elevenlabsVoice");
const voiceProfileSelect = $("#voiceProfileSelect");
const openaiApiKeyInput = $("#openaiApiKey");
const elevenlabsApiKeyInput = $("#elevenlabsApiKey");
const settingsMsg = $("#settingsMsg");

// ── Init ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  populateUI();
  setupTabs();
  setupEvents();
  checkStatus();
  checkBackendHealth();
  loadVoiceProfiles();
  syncProviderVisibility();
  loadGlossary();
});

async function loadSettings() {
  const stored = await chrome.storage.local.get("vb_settings");
  if (stored.vb_settings) {
    settings = { ...settings, ...stored.vb_settings };
  }
}

async function saveSettings() {
  await chrome.storage.local.set({ vb_settings: settings });
}

function populateUI() {
  backendUrlInput.value = settings.backendHttp || "http://localhost:8765";
  sttProviderSel.value = settings.sttProvider;
  ttsProviderSel.value = settings.ttsProvider;
  defaultVoiceSelect.value = settings.defaultVoice;
  openaiVoiceSelect.value = settings.openaiTtsVoice;
  openaiApiKeyInput.value = settings.openaiApiKey;
  elevenlabsApiKeyInput.value = settings.elevenlabsApiKey;
  if (settings.elevenlabsVoiceId) {
    elevenlabsVoiceSelect.value = settings.elevenlabsVoiceId;
  }
}

// ── Provider visibility logic ────────────────────────────────────────────

function syncProviderVisibility() {
  const stt = sttProviderSel.value;
  const tts = ttsProviderSel.value;

  const needsOpenaiKey = stt === "openai" || tts === "openai";
  const needsElKey = tts === "elevenlabs";

  toggleField("fieldOpenaiKey", needsOpenaiKey);
  toggleField("fieldElKey", needsElKey);
  toggleField("fieldEdgeVoice", tts === "edge-tts");
  toggleField("fieldOpenaiVoice", tts === "openai");
  toggleField("fieldElVoice", tts === "elevenlabs");
  toggleField("fieldCoquiProfile", tts === "coqui");

  const hint = $("#apiKeyHint");
  if (!needsOpenaiKey && !needsElKey) {
    hint.textContent = "Bạn đang dùng provider miễn phí — không cần API key.";
  } else {
    const parts = [];
    if (needsOpenaiKey) parts.push("OpenAI");
    if (needsElKey) parts.push("ElevenLabs");
    hint.textContent = `Cần API key: ${parts.join(", ")}`;
  }
}

function toggleField(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden", !show);
}

// ── Backend health check ────────────────────────────────────────────────

async function checkBackendHealth() {
  try {
    const res = await fetch(`${settings.backendHttp}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (!isCapturing) {
        statusBadge.textContent = "Server OK";
        statusBadge.className = "badge connected";
      }
      const sttLabel = settings.sttProvider === "openai" ? "OpenAI" : "Local Whisper";
      const ttsLabel = { "edge-tts": "edge-tts", "openai": "OpenAI", "elevenlabs": "ElevenLabs", "coqui": "Coqui" }[settings.ttsProvider] || settings.ttsProvider;
      metaTiming.textContent = `STT: ${sttLabel} | TTS: ${ttsLabel}`;
    }
  } catch (_) {
    if (!isCapturing) {
      statusBadge.textContent = "Server OFF";
      statusBadge.className = "badge";
      metaTiming.textContent = "Backend chưa chạy — hãy chạy: python main.py";
      metaTiming.style.color = "#e17055";
    }
  }
}

// ── Tabs ────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
      tab.classList.add("active");
      $(`#panel-${tab.dataset.tab}`).classList.remove("hidden");
    });
  });
}

// ── Events ──────────────────────────────────────────────────────────────

function setupEvents() {
  btnToggle.addEventListener("click", toggleCapture);

  volumeSlider.addEventListener("input", () => {
    const val = volumeSlider.value;
    volumeValue.textContent = `${val}%`;
    chrome.runtime.sendMessage({ target: "content", type: "set-volume", level: val / 100 });
  });

  // Voice tab
  btnRecord.addEventListener("click", toggleRecording);
  fileUpload.addEventListener("change", handleFileUpload);
  $("#btnLoadProfile").addEventListener("click", loadSelectedProfile);
  btnElClone.addEventListener("click", handleElClone);
  btnElRecord.addEventListener("click", handleElRecord);
  $("#btnRefreshElVoices").addEventListener("click", loadElVoices);

  // Corrections
  btnEditTranslation.addEventListener("click", openCorrectionForm);
  btnSaveCorrection.addEventListener("click", saveCorrection);
  btnCancelCorrection.addEventListener("click", closeCorrectionForm);

  // Settings
  $("#btnSaveSettings").addEventListener("click", handleSaveSettings);
  sttProviderSel.addEventListener("change", syncProviderVisibility);
  ttsProviderSel.addEventListener("change", syncProviderVisibility);
}

// ── Build config for WebSocket ──────────────────────────────────────────

function buildWsConfig() {
  return {
    backendUrl: settings.backendUrl,
    stt_provider: settings.sttProvider,
    tts_provider: settings.ttsProvider,
    openai_api_key: settings.openaiApiKey,
    elevenlabs_api_key: settings.elevenlabsApiKey,
    openai_tts_voice: settings.openaiTtsVoice,
    elevenlabs_voice_id: settings.elevenlabsVoiceId,
    edge_tts_voice: settings.defaultVoice,
    voice_profile: settings.voiceProfile || undefined,
  };
}

// ── Capture toggle ──────────────────────────────────────────────────────

async function toggleCapture() {
  if (isCapturing) {
    chrome.runtime.sendMessage({ target: "background", type: "stop" });
    setCapturing(false);
    return;
  }

  try {
    const healthRes = await fetch(`${settings.backendHttp}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!healthRes.ok) throw new Error("not ok");
  } catch (_) {
    statusBadge.textContent = "Server OFF";
    statusBadge.className = "badge";
    metaTiming.textContent = "Cần chạy backend trước: cd backend && python main.py";
    metaTiming.style.color = "#e17055";
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const config = buildWsConfig();

  statusBadge.textContent = "Connecting…";
  statusBadge.className = "badge";

  const response = await chrome.runtime.sendMessage({
    target: "background",
    type: "start",
    tabId: tab.id,
    config,
  });

  if (response?.ok) {
    setCapturing(true);
  } else {
    statusBadge.textContent = "Lỗi";
    statusBadge.className = "badge";
    metaTiming.textContent = response?.error || "Unknown error";
    metaTiming.style.color = "#e17055";
  }
}

function setCapturing(val) {
  isCapturing = val;
  btnToggle.classList.toggle("active", val);
  btnToggle.querySelector("span").textContent = val ? "Dừng dịch" : "Bắt đầu dịch";
  if (!val) {
    statusBadge.textContent = "Offline";
    statusBadge.className = "badge";
    metaTiming.style.color = "";
  }
}

async function checkStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ target: "background", type: "get-status" });
    if (res?.capturing) setCapturing(true);
  } catch (_) {}
}

// ── Incoming messages ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target && msg.target !== "popup") return;

  switch (msg.type) {
    case "transcript":
      liveTranscript.textContent = msg.text;
      lastTranscriptEn = msg.text;
      break;
    case "translation":
      liveTranslation.textContent = msg.text;
      break;
    case "timing":
      metaTiming.style.color = "";
      metaTiming.textContent = `Xử lý trong ${msg.seconds}s`;
      break;
    case "status":
      statusBadge.textContent = msg.message;
      if (msg.message.includes("Connected")) {
        statusBadge.className = "badge connected";
      } else if (msg.message.includes("Capturing") || msg.message.includes("Đang")) {
        statusBadge.className = "badge capturing";
      } else if (msg.message.includes("error") || msg.message.includes("Error")) {
        statusBadge.className = "badge";
        metaTiming.textContent = msg.message;
        metaTiming.style.color = "#e17055";
      }
      break;
    case "error":
      statusBadge.textContent = "Lỗi";
      statusBadge.className = "badge";
      metaTiming.textContent = msg.message || "Unknown error";
      metaTiming.style.color = "#e17055";
      break;
    case "voice-updated":
      loadSelectedProfile();
      loadVoiceProfiles();
      recordError.textContent = "Đã lưu mẫu giọng mới!";
      recordError.style.color = "var(--green)";
      setTimeout(() => { recordError.textContent = ""; recordError.style.color = ""; }, 3000);
      break;
    case "el-voice-cloned":
      settings.elevenlabsVoiceId = msg.voice_id;
      settings.ttsProvider = "elevenlabs";
      saveSettings();
      ttsProviderSel.value = "elevenlabs";
      syncProviderVisibility();
      elCloneStatus.textContent = `Đã clone giọng "${msg.name}" — đã tự động chọn sử dụng!`;
      elCloneStatus.style.color = "var(--green)";
      loadElVoices();
      break;
  }
});

// ── ElevenLabs voice cloning ────────────────────────────────────────────

async function handleElClone() {
  const apiKey = settings.elevenlabsApiKey || elevenlabsApiKeyInput.value.trim();
  const name = elCloneName.value.trim();
  const file = elCloneFile.files[0];

  if (!apiKey) {
    elCloneStatus.textContent = "Cần nhập ElevenLabs API Key trong tab Cài đặt trước.";
    elCloneStatus.style.color = "var(--red)";
    return;
  }
  if (!name) {
    elCloneStatus.textContent = "Nhập tên cho giọng clone.";
    elCloneStatus.style.color = "var(--red)";
    return;
  }
  if (!file) {
    elCloneStatus.textContent = "Chọn file âm thanh mẫu.";
    elCloneStatus.style.color = "var(--red)";
    return;
  }

  elCloneStatus.textContent = "Đang tạo giọng clone…";
  elCloneStatus.style.color = "var(--orange)";
  btnElClone.disabled = true;

  try {
    const form = new FormData();
    form.append("api_key", apiKey);
    form.append("name", name);
    form.append("file", file);

    const res = await fetch(`${settings.backendHttp}/api/elevenlabs/clone`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();

    if (data.error) {
      elCloneStatus.textContent = `Lỗi: ${data.error}`;
      elCloneStatus.style.color = "var(--red)";
    } else {
      elCloneStatus.textContent = `Đã tạo giọng "${name}" (ID: ${data.voice_id})`;
      elCloneStatus.style.color = "var(--green)";
      settings.elevenlabsVoiceId = data.voice_id;
      saveSettings();
      loadElVoices();
    }
  } catch (err) {
    elCloneStatus.textContent = `Lỗi kết nối: ${err.message}`;
    elCloneStatus.style.color = "var(--red)";
  } finally {
    btnElClone.disabled = false;
  }
}

async function loadElVoices() {
  const apiKey = settings.elevenlabsApiKey || elevenlabsApiKeyInput.value.trim();
  if (!apiKey) {
    elVoicesList.innerHTML = '<div class="meta">Nhập ElevenLabs API Key để xem danh sách giọng.</div>';
    return;
  }

  elVoicesList.innerHTML = '<div class="meta">Đang tải…</div>';

  try {
    const res = await fetch(`${settings.backendHttp}/api/elevenlabs/voices?api_key=${encodeURIComponent(apiKey)}`);
    const data = await res.json();

    if (data.error) {
      elVoicesList.innerHTML = `<div class="meta" style="color:var(--red)">${data.error}</div>`;
      return;
    }

    elVoicesList.innerHTML = "";
    elevenlabsVoiceSelect.innerHTML = '<option value="">— Chọn giọng —</option>';

    data.voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voice_id;
      opt.textContent = `${v.name} (${v.category})`;
      elevenlabsVoiceSelect.appendChild(opt);

      const item = document.createElement("div");
      item.className = "el-voice-item";
      item.innerHTML = `
        <span>
          <span class="el-voice-name">${v.name}</span>
          <span class="el-voice-cat">${v.category}</span>
        </span>
        <div>
          <button class="btn-icon use" title="Sử dụng" data-id="${v.voice_id}" data-name="${v.name}">&#10003;</button>
          <button class="btn-icon del" title="Xóa" data-id="${v.voice_id}">&times;</button>
        </div>
      `;
      elVoicesList.appendChild(item);
    });

    if (settings.elevenlabsVoiceId) {
      elevenlabsVoiceSelect.value = settings.elevenlabsVoiceId;
    }

    elVoicesList.querySelectorAll(".btn-icon.use").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings.elevenlabsVoiceId = btn.dataset.id;
        settings.ttsProvider = "elevenlabs";
        saveSettings();
        ttsProviderSel.value = "elevenlabs";
        elevenlabsVoiceSelect.value = btn.dataset.id;
        syncProviderVisibility();
        elCloneStatus.textContent = `Đang dùng giọng: ${btn.dataset.name}`;
        elCloneStatus.style.color = "var(--green)";
      });
    });

    elVoicesList.querySelectorAll(".btn-icon.del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Xóa giọng này khỏi ElevenLabs?")) return;
        try {
          await fetch(
            `${settings.backendHttp}/api/elevenlabs/voices/${btn.dataset.id}?api_key=${encodeURIComponent(apiKey)}`,
            { method: "DELETE" }
          );
          loadElVoices();
        } catch (e) {
          console.error("Delete EL voice error:", e);
        }
      });
    });
  } catch (err) {
    elVoicesList.innerHTML = `<div class="meta" style="color:var(--red)">Không kết nối được backend.</div>`;
  }
}

// ── Voice recording (Coqui) ─────────────────────────────────────────────

const voiceNameError = $("#voiceNameError");
const recordError = $("#recordError");

async function toggleRecording() {
  voiceNameError.textContent = "";

  const name = voiceNameInput.value.trim();
  if (!name) {
    voiceNameError.textContent = "Vui lòng nhập tên hồ sơ giọng trước khi thu âm";
    voiceNameInput.focus();
    voiceNameInput.style.borderColor = "var(--red)";
    setTimeout(() => (voiceNameInput.style.borderColor = ""), 2500);
    return;
  }

  const url = chrome.runtime.getURL(
    `recorder.html?name=${encodeURIComponent(name)}&backend=${encodeURIComponent(settings.backendHttp)}`
  );
  chrome.windows.create({ url, type: "popup", width: 440, height: 480, focused: true });
}

async function handleFileUpload() {
  const name = voiceNameInput.value.trim();
  if (!name || !fileUpload.files.length) return;

  const form = new FormData();
  form.append("file", fileUpload.files[0]);

  try {
    await fetch(`${settings.backendHttp}/api/voices/${encodeURIComponent(name)}/upload`, {
      method: "POST",
      body: form,
    });
    loadSelectedProfile();
    loadVoiceProfiles();
    fileUpload.value = "";
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

// ── Voice profiles (Coqui local) ────────────────────────────────────────

async function loadVoiceProfiles() {
  try {
    const res = await fetch(`${settings.backendHttp}/api/voices`);
    const data = await res.json();

    profilesList.innerHTML = "";
    voiceProfileSelect.innerHTML = '<option value="">— Không dùng —</option>';

    data.voices.forEach((v) => {
      const div = document.createElement("div");
      div.className = "profile-item";
      div.innerHTML = `
        <span>${v.name} <span class="pcount">(${v.samples} mẫu)</span></span>
        <div>
          <button class="btn-icon use" title="Sử dụng" data-name="${v.name}">&#10003;</button>
          <button class="btn-icon del" title="Xóa" data-name="${v.name}">&times;</button>
        </div>
      `;
      profilesList.appendChild(div);

      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.samples} mẫu)`;
      voiceProfileSelect.appendChild(opt);
    });

    voiceProfileSelect.value = settings.voiceProfile || "";

    profilesList.querySelectorAll(".btn-icon.use").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings.voiceProfile = btn.dataset.name;
        settings.ttsProvider = "coqui";
        saveSettings();
        ttsProviderSel.value = "coqui";
        syncProviderVisibility();
        settingsMsg.textContent = `Đang dùng giọng local: ${btn.dataset.name}`;
      });
    });

    profilesList.querySelectorAll(".btn-icon.del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await fetch(`${settings.backendHttp}/api/voices/${encodeURIComponent(btn.dataset.name)}`, {
          method: "DELETE",
        });
        loadVoiceProfiles();
      });
    });
  } catch (_) {
    profilesList.innerHTML = '<div class="meta">Không kết nối được backend</div>';
  }
}

async function loadSelectedProfile() {
  const name = voiceNameInput.value.trim();
  if (!name) return;

  try {
    const res = await fetch(`${settings.backendHttp}/api/voices/${encodeURIComponent(name)}/samples`);
    const data = await res.json();

    samplesList.innerHTML = "";
    data.samples.forEach((s) => {
      const div = document.createElement("div");
      div.className = "sample-item";
      div.innerHTML = `
        <span>${s}</span>
        <button class="btn-icon" title="Xóa" data-file="${s}">&times;</button>
      `;
      div.querySelector(".btn-icon").addEventListener("click", async () => {
        await fetch(
          `${settings.backendHttp}/api/voices/${encodeURIComponent(name)}/samples/${encodeURIComponent(s)}`,
          { method: "DELETE" }
        );
        loadSelectedProfile();
        loadVoiceProfiles();
      });
      samplesList.appendChild(div);
    });
  } catch (_) {
    samplesList.innerHTML = '<div class="meta">Không tải được danh sách mẫu</div>';
  }
}

// ── ElevenLabs record ───────────────────────────────────────────────────

function handleElRecord() {
  const apiKey = settings.elevenlabsApiKey || elevenlabsApiKeyInput.value.trim();
  const name = elCloneName.value.trim();

  if (!apiKey) {
    elCloneStatus.textContent = "Cần nhập ElevenLabs API Key trong tab Cài đặt trước.";
    elCloneStatus.style.color = "var(--red)";
    return;
  }
  if (!name) {
    elCloneStatus.textContent = "Nhập tên cho giọng clone.";
    elCloneStatus.style.color = "var(--red)";
    return;
  }

  const url = chrome.runtime.getURL(
    `recorder.html?name=${encodeURIComponent(name)}&backend=${encodeURIComponent(settings.backendHttp)}&mode=elevenlabs&elkey=${encodeURIComponent(apiKey)}`
  );
  chrome.windows.create({ url, type: "popup", width: 440, height: 480, focused: true });
}

// ── Translation corrections ─────────────────────────────────────────────

let lastTranscriptEn = "";

function openCorrectionForm() {
  correctionEn.value = lastTranscriptEn || liveTranscript.textContent || "";
  correctionVi.value = liveTranslation.textContent || "";
  correctionForm.classList.remove("hidden");
  correctionVi.focus();
}

function closeCorrectionForm() {
  correctionForm.classList.add("hidden");
}

async function saveCorrection() {
  const en = correctionEn.value.trim();
  const vi = correctionVi.value.trim();
  if (!en || !vi) return;

  try {
    const form = new FormData();
    form.append("en", en);
    form.append("vi", vi);
    await fetch(`${settings.backendHttp}/api/corrections`, {
      method: "POST",
      body: form,
    });
    closeCorrectionForm();
    loadGlossary();
  } catch (err) {
    console.error("Save correction error:", err);
  }
}

async function loadGlossary() {
  try {
    const res = await fetch(`${settings.backendHttp}/api/corrections`);
    const data = await res.json();
    const corrections = data.corrections || [];

    glossaryCount.textContent = corrections.length;
    glossaryList.innerHTML = "";

    corrections.forEach((c) => {
      const div = document.createElement("div");
      div.className = "glossary-item";
      div.innerHTML = `
        <div class="gl-pair">
          <span class="gl-en">${c.en}</span>
          <span class="gl-arrow">&rarr;</span>
          <span class="gl-vi">${c.vi}</span>
        </div>
        <button class="btn-icon del" title="Xóa" data-id="${c.id}">&times;</button>
      `;
      div.querySelector(".btn-icon").addEventListener("click", async () => {
        await fetch(`${settings.backendHttp}/api/corrections/${c.id}`, { method: "DELETE" });
        loadGlossary();
      });
      glossaryList.appendChild(div);
    });
  } catch (_) {
    glossaryList.innerHTML = "";
    glossaryCount.textContent = "0";
  }
}

// ── Settings ────────────────────────────────────────────────────────────

function handleSaveSettings() {
  let base = backendUrlInput.value.trim().replace(/\/+$/, "");
  if (!base.startsWith("http")) base = "http://" + base;

  settings.backendHttp = base;
  settings.backendUrl = base.replace("http://", "ws://").replace("https://", "wss://") + "/ws/translate";
  settings.defaultVoice = defaultVoiceSelect.value;
  settings.sttProvider = sttProviderSel.value;
  settings.ttsProvider = ttsProviderSel.value;
  settings.openaiApiKey = openaiApiKeyInput.value.trim();
  settings.elevenlabsApiKey = elevenlabsApiKeyInput.value.trim();
  settings.openaiTtsVoice = openaiVoiceSelect.value;
  settings.elevenlabsVoiceId = elevenlabsVoiceSelect.value;
  settings.voiceProfile = voiceProfileSelect.value;

  saveSettings();
  settingsMsg.textContent = "Đã lưu!";
  setTimeout(() => (settingsMsg.textContent = ""), 2000);

  checkBackendHealth();
}
