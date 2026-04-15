/**
 * VoiceBridge – Offscreen document.
 *
 * Captures tab audio via MediaStream, resamples to 16 kHz mono PCM,
 * streams to the Python backend via WebSocket, and plays back
 * translated TTS audio.
 */

const TARGET_SAMPLE_RATE = 16000;

let mediaStream = null;
let audioCtx = null;
let ws = null;
let processorNode = null;
let nativeSampleRate = 48000;

// ── Audio playback queue ────────────────────────────────────────────────

const audioQueue = [];
let isPlaying = false;
let playbackCtx = null;

async function ensurePlaybackCtx() {
  if (!playbackCtx || playbackCtx.state === "closed") {
    playbackCtx = new AudioContext();
  }
  if (playbackCtx.state === "suspended") {
    await playbackCtx.resume();
  }
  return playbackCtx;
}

async function enqueueAudio(base64) {
  try {
    const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    audioQueue.push(raw.buffer);
    if (!isPlaying) playNext();
  } catch (e) {
    console.error("[VoiceBridge] enqueueAudio error:", e);
  }
}

async function playNext() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const buf = audioQueue.shift();

  try {
    const ctx = await ensurePlaybackCtx();
    const decoded = await ctx.decodeAudioData(buf.slice(0)); // slice to avoid detached buffer
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.onended = () => playNext();
    source.start();
  } catch (e) {
    console.warn("[VoiceBridge] Audio playback error:", e);
    playNext();
  }
}

// ── Downsampling ────────────────────────────────────────────────────────

function downsample(float32Input, fromRate, toRate) {
  if (fromRate === toRate) return float32Input;

  const ratio = fromRate / toRate;
  const newLength = Math.floor(float32Input.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, float32Input.length - 1);
    const frac = srcIndex - lo;
    result[i] = float32Input[lo] * (1 - frac) + float32Input[hi] * frac;
  }
  return result;
}

function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

// ── WebSocket ───────────────────────────────────────────────────────────

let wsConfig = null;
let wsReconnectTimer = null;

function connectWS(config) {
  wsConfig = config || wsConfig;
  const url = wsConfig?.backendUrl || "wss://voicebridge-backend-01q1.onrender.com/ws/translate";

  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  try {
    ws = new WebSocket(url);
  } catch (e) {
    relay({ type: "status", message: "Cannot connect to backend" });
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    relay({ type: "status", message: "Connected to backend" });
    if (wsConfig) {
      const configMsg = { type: "config" };
      for (const key of [
        "voice_profile", "stt_provider", "tts_provider",
        "openai_api_key", "elevenlabs_api_key",
        "openai_tts_voice", "elevenlabs_voice_id", "edge_tts_voice",
        "source_lang", "target_lang",
      ]) {
        if (wsConfig[key] !== undefined) configMsg[key] = wsConfig[key];
      }
      ws.send(JSON.stringify(configMsg));
    }
  };

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      relay(data);

      if (data.type === "audio" && data.data) {
        enqueueAudio(data.data);
      }
    } catch (e) {
      console.warn("[VoiceBridge] WS message parse error:", e);
    }
  };

  ws.onerror = (e) => {
    console.error("[VoiceBridge] WS error:", e);
    relay({ type: "status", message: "Backend connection error — is the server running?" });
  };

  ws.onclose = (e) => {
    relay({ type: "status", message: "Disconnected from backend" });
    if (mediaStream) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    if (mediaStream) {
      relay({ type: "status", message: "Reconnecting…" });
      connectWS();
    }
  }, 3000);
}

function relay(data) {
  chrome.runtime.sendMessage({ target: "popup", ...data }).catch(() => {});
  if (data.type === "transcript" || data.type === "translation" || data.type === "timing") {
    chrome.runtime.sendMessage({ target: "content", ...data }).catch(() => {});
  }
}

// ── Audio capture pipeline ──────────────────────────────────────────────

let chunkBuffer = new Float32Array(0);
let samplesPerChunk = 0;
let capturePaused = false;

function handleAudioData(float32Data) {
  if (capturePaused) return;

  const newBuf = new Float32Array(chunkBuffer.length + float32Data.length);
  newBuf.set(chunkBuffer);
  newBuf.set(float32Data, chunkBuffer.length);
  chunkBuffer = newBuf;

  if (chunkBuffer.length >= samplesPerChunk) {
    const toSend = chunkBuffer;
    chunkBuffer = new Float32Array(0);

    const downsampled = downsample(toSend, nativeSampleRate, TARGET_SAMPLE_RATE);
    const int16 = float32ToInt16(downsampled);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(int16.buffer);
    }
  }
}

async function startCapture(streamId, config) {
  try {
    relay({ type: "status", message: "Requesting tab audio…" });

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });

    audioCtx = new AudioContext();
    nativeSampleRate = audioCtx.sampleRate;
    samplesPerChunk = Math.floor(nativeSampleRate * 0.3); // ~300ms chunks
    chunkBuffer = new Float32Array(0);

    const source = audioCtx.createMediaStreamSource(mediaStream);

    try {
      await audioCtx.audioWorklet.addModule("audio-processor.js");
      processorNode = new AudioWorkletNode(audioCtx, "capture-processor");
      processorNode.port.onmessage = (e) => handleAudioData(e.data);
      source.connect(processorNode);
      processorNode.connect(audioCtx.destination);
    } catch (workletErr) {
      console.warn("[VoiceBridge] AudioWorklet unavailable, using ScriptProcessor fallback:", workletErr);
      const bufferSize = 4096;
      processorNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorNode.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        e.outputBuffer.getChannelData(0).set(input);
        handleAudioData(new Float32Array(input));
      };
      source.connect(processorNode);
      processorNode.connect(audioCtx.destination);
    }

    connectWS(config);
    relay({ type: "status", message: `Capturing audio (${nativeSampleRate} Hz)…` });
  } catch (err) {
    console.error("[VoiceBridge] Capture error:", err);
    relay({ type: "status", message: `Capture error: ${err.message}` });
  }
}

function stopCapture() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  audioQueue.length = 0;
  isPlaying = false;
}

// ── Microphone recording (for voice cloning samples) ────────────────────

let micRecorder = null;
let micChunks = [];
let micStream = null;

async function startMicRecord(voiceName, backendHttp) {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micChunks = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    micRecorder = new MediaRecorder(micStream, { mimeType });

    micRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) micChunks.push(e.data);
    };

    micRecorder.onstop = async () => {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;

      if (micChunks.length === 0) {
        relay({ type: "mic-status", status: "error", message: "Không thu được dữ liệu" });
        return;
      }

      relay({ type: "mic-status", status: "uploading", message: "Đang tải lên…" });

      const blob = new Blob(micChunks, { type: mimeType });
      const form = new FormData();
      form.append("file", blob, "recording.webm");

      try {
        const res = await fetch(
          `${backendHttp}/api/voices/${encodeURIComponent(voiceName)}/record`,
          { method: "POST", body: form }
        );
        const data = await res.json();
        relay({ type: "mic-status", status: "done", message: data.message || "Đã lưu!" });
      } catch (e) {
        relay({ type: "mic-status", status: "error", message: `Upload lỗi: ${e.message}` });
      }
    };

    micRecorder.onerror = (e) => {
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      relay({ type: "mic-status", status: "error", message: `Lỗi recorder: ${e.error?.message}` });
    };

    micRecorder.start(250);
    relay({ type: "mic-status", status: "recording", message: "Đang thu âm…" });
  } catch (err) {
    let msg = `Lỗi mic: ${err.message}`;
    if (err.name === "NotAllowedError") msg = "Chrome chặn quyền mic. Cho phép và thử lại.";
    if (err.name === "NotFoundError") msg = "Không tìm thấy microphone.";
    relay({ type: "mic-status", status: "error", message: msg });
  }
}

function stopMicRecord() {
  if (micRecorder && micRecorder.state === "recording") {
    micRecorder.stop();
  }
}

// ── Messages from background / popup ────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;

  switch (msg.type) {
    case "start-capture":
      startCapture(msg.streamId, msg.config);
      break;
    case "stop-capture":
      stopCapture();
      break;
    case "pause-capture":
      capturePaused = true;
      break;
    case "resume-capture":
      capturePaused = false;
      break;
    case "start-mic-record":
      startMicRecord(msg.voiceName, msg.backendHttp);
      break;
    case "stop-mic-record":
      stopMicRecord();
      break;
  }
});
