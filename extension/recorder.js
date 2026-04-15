/**
 * VoiceBridge – Standalone recorder page.
 *
 * Opens as a popup window, requests mic permission with a proper user gesture,
 * records audio, uploads to backend, then signals the main popup.
 *
 * Supports two modes via URL param `mode`:
 *   - "local" (default): saves recording as Coqui voice sample
 *   - "elevenlabs": sends recording to ElevenLabs IVC clone endpoint
 */

const params = new URLSearchParams(location.search);
const voiceName = params.get("name") || "my-voice";
const backendHttp = params.get("backend") || "https://voicebridge-backend-01q1.onrender.com";
const mode = params.get("mode") || "local";
const elApiKey = params.get("elkey") || "";

const profileNameEl = document.getElementById("profileName");
const timerEl = document.getElementById("timer");
const btnRecord = document.getElementById("btnRecord");
const hintEl = document.getElementById("hint");
const statusEl = document.getElementById("status");
const visualizerEl = document.getElementById("visualizer");

profileNameEl.textContent = voiceName;
if (mode === "elevenlabs") {
  const titleEl = document.querySelector("h2");
  if (titleEl) titleEl.textContent = "Thu âm → Clone ElevenLabs";
  const subtitleEl = document.querySelector(".subtitle");
  if (subtitleEl) subtitleEl.textContent = "Đọc tiếng Việt rõ ràng (~30 giây). Sau khi dừng, giọng sẽ được clone tự động.";
}

let mediaRecorder = null;
let chunks = [];
let stream = null;
let timerInterval = null;
let seconds = 0;
let analyser = null;
let animFrame = null;

const NUM_BARS = 24;
for (let i = 0; i < NUM_BARS; i++) {
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.height = "4px";
  visualizerEl.appendChild(bar);
}
const bars = visualizerEl.querySelectorAll(".bar");

function updateTimer() {
  seconds++;
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  timerEl.textContent = `${m}:${s}`;
}

function startVisualizer(srcStream) {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(srcStream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      const val = data[i] || 0;
      bar.style.height = Math.max(4, (val / 255) * 36) + "px";
    });
    animFrame = requestAnimationFrame(draw);
  }
  draw();
}

function stopVisualizer() {
  if (animFrame) cancelAnimationFrame(animFrame);
  bars.forEach((b) => (b.style.height = "4px"));
}

async function uploadLocal(blob) {
  const form = new FormData();
  form.append("file", blob, "recording.webm");

  const res = await fetch(
    `${backendHttp}/api/voices/${encodeURIComponent(voiceName)}/record`,
    { method: "POST", body: form }
  );
  const data = await res.json();
  statusEl.textContent = `Đã lưu! (${data.total_samples} mẫu). Bạn có thể đóng cửa sổ này hoặc thu thêm.`;
  statusEl.className = "status success";
  chrome.runtime.sendMessage({ target: "popup", type: "voice-updated" }).catch(() => {});
}

async function uploadElevenLabs(blob) {
  statusEl.textContent = "Đang tạo giọng clone trên ElevenLabs…";
  statusEl.className = "status info";

  const form = new FormData();
  form.append("api_key", elApiKey);
  form.append("name", voiceName);
  form.append("file", blob, "recording.webm");

  const res = await fetch(`${backendHttp}/api/elevenlabs/clone`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (data.error) {
    statusEl.textContent = `Lỗi clone: ${data.error}`;
    statusEl.className = "status error";
  } else {
    statusEl.textContent = `Đã clone giọng "${voiceName}" (ID: ${data.voice_id}). Bạn có thể đóng cửa sổ này.`;
    statusEl.className = "status success";
    chrome.runtime.sendMessage({
      target: "popup",
      type: "el-voice-cloned",
      voice_id: data.voice_id,
      name: voiceName,
    }).catch(() => {});
  }
}

async function startRecording() {
  statusEl.textContent = "";
  statusEl.className = "status";

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      statusEl.textContent = "Bạn cần cho phép quyền microphone. Nhấn biểu tượng ổ khoá trên thanh địa chỉ → cho phép Microphone.";
    } else if (err.name === "NotFoundError") {
      statusEl.textContent = "Không tìm thấy microphone. Hãy kết nối mic.";
    } else {
      statusEl.textContent = `Lỗi: ${err.message}`;
    }
    statusEl.className = "status error";
    return;
  }

  chunks = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    stopVisualizer();
    clearInterval(timerInterval);

    if (chunks.length === 0) {
      statusEl.textContent = "Không thu được dữ liệu. Thử lại.";
      statusEl.className = "status error";
      return;
    }

    statusEl.textContent = "Đang tải lên…";
    statusEl.className = "status info";

    const blob = new Blob(chunks, { type: mimeType });

    try {
      if (mode === "elevenlabs") {
        await uploadElevenLabs(blob);
      } else {
        await uploadLocal(blob);
      }
    } catch (e) {
      statusEl.textContent = `Tải lên lỗi: ${e.message}`;
      statusEl.className = "status error";
    }

    btnRecord.classList.remove("recording");
    hintEl.textContent = mode === "elevenlabs"
      ? "Nhấn để thu lại"
      : "Nhấn để thu thêm mẫu";
    seconds = 0;
    timerEl.textContent = "00:00";
  };

  mediaRecorder.start(250);
  btnRecord.classList.add("recording");
  hintEl.textContent = "Nhấn để dừng thu âm";
  seconds = 0;
  timerInterval = setInterval(updateTimer, 1000);
  startVisualizer(stream);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

btnRecord.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
  } else {
    startRecording();
  }
});
