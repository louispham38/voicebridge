/**
 * VoiceBridge – Background service worker.
 *
 * Manages tab audio capture, offscreen document lifecycle,
 * and message relay between popup ↔ offscreen ↔ content script.
 */

let capturing = false;
let captureTabId = null;

// ── Offscreen document helpers ──────────────────────────────────────────

async function ensureOffscreen() {
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
        justification: "Capture tab audio and play translated speech",
      });
    }
  } catch (e) {
    console.error("[VoiceBridge] offscreen create error:", e);
    throw e;
  }
}

async function closeOffscreen() {
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) {}
}

// ── Start / stop capture ────────────────────────────────────────────────

async function startCapture(tabId, config) {
  // Always force-cleanup any previous capture
  await forceStopCapture();

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();

    await new Promise((r) => setTimeout(r, 300));

    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "start-capture",
      streamId,
      config,
    });

    capturing = true;
    captureTabId = tabId;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      const backendHttp = (config?.backendUrl || "ws://localhost:8765/ws/translate")
        .replace("ws://", "http://").replace("wss://", "https://").replace("/ws/translate", "");
      chrome.tabs.sendMessage(tabId, { type: "vb-set-backend", backendHttp }).catch(() => {});
    } catch (e) {
      console.warn("[VoiceBridge] content script inject:", e.message);
    }

    return { ok: true };
  } catch (err) {
    console.error("[VoiceBridge] startCapture error:", err);
    return { ok: false, error: err.message };
  }
}

async function forceStopCapture() {
  try {
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" });
  } catch (_) {}

  if (captureTabId) {
    try {
      await chrome.tabs.sendMessage(captureTabId, { type: "vb-cleanup" });
    } catch (_) {}
  }

  capturing = false;
  captureTabId = null;

  // Close offscreen document completely and wait for it
  await closeOffscreen();
  await new Promise((r) => setTimeout(r, 300));
}

async function stopCapture() {
  await forceStopCapture();
}

// ── Message routing ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from popup → background
  if (msg.target === "background") {
    switch (msg.type) {
      case "start":
        startCapture(msg.tabId, msg.config).then(sendResponse);
        return true;

      case "stop":
        stopCapture();
        sendResponse({ ok: true });
        return;

      case "pause-translation":
        try { chrome.runtime.sendMessage({ target: "offscreen", type: "pause-capture" }); } catch (_) {}
        sendResponse({ ok: true });
        return;

      case "resume-translation":
        try { chrome.runtime.sendMessage({ target: "offscreen", type: "resume-capture" }); } catch (_) {}
        sendResponse({ ok: true });
        return;

      case "get-status":
        sendResponse({ capturing, captureTabId });
        return;

      case "start-mic-record":
        (async () => {
          try {
            await ensureOffscreen();
            await new Promise((r) => setTimeout(r, 200));
            chrome.runtime.sendMessage({
              target: "offscreen",
              type: "start-mic-record",
              voiceName: msg.voiceName,
              backendHttp: msg.backendHttp,
            });
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
        })();
        return true;

      case "stop-mic-record":
        chrome.runtime.sendMessage({ target: "offscreen", type: "stop-mic-record" });
        sendResponse({ ok: true });
        return;
    }
    return;
  }

  // Messages from offscreen → relay to popup and content tab
  if (msg.target === "popup") {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {}
    if (captureTabId && (msg.type === "transcript" || msg.type === "translation" || msg.type === "timing")) {
      chrome.tabs.sendMessage(captureTabId, msg).catch(() => {});
    }
    return;
  }

  // Messages intended for content script → relay via tabs API
  if (msg.target === "content" && captureTabId) {
    chrome.tabs.sendMessage(captureTabId, msg).catch(() => {});
    return;
  }
});
