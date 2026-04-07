"""
VoiceBridge Backend - Real-time English→Vietnamese voice translation server.

Pipeline: Tab Audio → STT → Google Translate → TTS
Supports both local models and cloud APIs (OpenAI, ElevenLabs).
All heavy libraries are lazy-imported so the server starts in seconds.
"""

import asyncio
import base64
import io
import json
import os
import shutil
import struct
import tempfile
import time
from pathlib import Path
from typing import Optional

os.environ["COQUI_TOS_AGREED"] = "1"

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VOICES_DIR = Path(__file__).parent / "voices"
VOICES_DIR.mkdir(exist_ok=True)

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")

EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "vi-VN-HoaiMyNeural")

SAMPLE_RATE = 16_000
SILENCE_THRESHOLD = 500
SILENCE_DURATION = 0.8
MAX_UTTERANCE_SEC = 30

COQUI_AVAILABLE = any(
    (Path(__file__).parent / "venv" / "lib").glob("python*/site-packages/TTS/__init__.py")
)

CORRECTIONS_FILE = Path(__file__).parent / "corrections.json"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="VoiceBridge", version="2.0.0")

_cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins.split(",") if _cors_origins != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy-loaded modules & model singletons
# ---------------------------------------------------------------------------

_np = None
_whisper_mod = None
_whisper = None
_translator = None
_edge_tts = None
_coqui = None
_coqui_loading = False
_httpx = None


def _numpy():
    global _np
    if _np is None:
        try:
            import numpy
            _np = numpy
        except ImportError:
            print("[VoiceBridge] numpy not installed – local STT disabled")
            return None
    return _np


def _get_httpx():
    global _httpx
    if _httpx is None:
        import httpx
        _httpx = httpx
    return _httpx


def get_whisper():
    global _whisper, _whisper_mod
    if _whisper is None:
        try:
            if _whisper_mod is None:
                from faster_whisper import WhisperModel
                _whisper_mod = WhisperModel
            print(f"[VoiceBridge] Loading Whisper model '{WHISPER_MODEL_SIZE}' on {WHISPER_DEVICE} …")
            _whisper = _whisper_mod(WHISPER_MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
            print("[VoiceBridge] Whisper ready.")
        except ImportError:
            print("[VoiceBridge] faster-whisper not installed – use OpenAI STT instead")
            return None
    return _whisper


def get_translator():
    global _translator
    if _translator is None:
        from deep_translator import GoogleTranslator
        _translator = GoogleTranslator(source="en", target="vi")
    return _translator


def _get_edge_tts():
    global _edge_tts
    if _edge_tts is None:
        import edge_tts
        _edge_tts = edge_tts
    return _edge_tts


def get_coqui():
    return _coqui


def _load_coqui_sync():
    global _coqui, _coqui_loading
    if _coqui is not None or not COQUI_AVAILABLE:
        return
    _coqui_loading = True
    print("[VoiceBridge] Importing Coqui TTS …")
    try:
        from TTS.api import TTS as CoquiTTS
        print("[VoiceBridge] Loading XTTS v2 model …")
        _coqui = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2")
        print("[VoiceBridge] XTTS ready.")
    except Exception as e:
        print(f"[VoiceBridge] XTTS load failed: {e}")
    finally:
        _coqui_loading = False


def _pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap raw PCM int16 bytes in a WAV header."""
    data_size = len(pcm_bytes)
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))  # PCM
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * channels * sample_width))
    buf.write(struct.pack("<H", channels * sample_width))
    buf.write(struct.pack("<H", sample_width * 8))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_bytes)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Audio buffer with simple energy-based VAD
# ---------------------------------------------------------------------------

class AudioBuffer:
    def __init__(self):
        self.buffer = bytearray()
        self.silence_frames = 0
        self.has_speech = False

    def add_chunk(self, pcm_bytes: bytes) -> Optional[bytes]:
        self.buffer.extend(pcm_bytes)
        np = _numpy()
        if np is None:
            self.has_speech = True
            self.silence_frames += len(pcm_bytes) // 2
            silence_needed = int(SILENCE_DURATION * SAMPLE_RATE)
            if self.silence_frames >= silence_needed:
                return self._flush()
            max_bytes = SAMPLE_RATE * MAX_UTTERANCE_SEC * 2
            if len(self.buffer) > max_bytes:
                return self._flush()
            return None

        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        if len(samples) == 0:
            return None

        rms = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))

        if rms > SILENCE_THRESHOLD:
            self.has_speech = True
            self.silence_frames = 0
        else:
            self.silence_frames += len(samples)

        silence_needed = int(SILENCE_DURATION * SAMPLE_RATE)
        if self.has_speech and self.silence_frames >= silence_needed:
            return self._flush()

        max_bytes = SAMPLE_RATE * MAX_UTTERANCE_SEC * 2
        if len(self.buffer) > max_bytes:
            return self._flush()

        return None

    def _flush(self) -> bytes:
        utterance = bytes(self.buffer)
        self.buffer.clear()
        self.has_speech = False
        self.silence_frames = 0
        return utterance


# ---------------------------------------------------------------------------
# Per-session config (passed from extension via WebSocket)
# ---------------------------------------------------------------------------

class SessionConfig:
    def __init__(self):
        self.stt_provider: str = "local"          # "local" | "openai"
        self.tts_provider: str = "edge-tts"        # "edge-tts" | "openai" | "elevenlabs" | "coqui"
        self.openai_api_key: str = ""
        self.elevenlabs_api_key: str = ""
        self.openai_tts_voice: str = "nova"
        self.elevenlabs_voice_id: str = ""
        self.edge_tts_voice: str = EDGE_TTS_VOICE  # "vi-VN-HoaiMyNeural" | "vi-VN-NamMinhNeural"
        self.voice_profile: str = ""               # local Coqui profile name
        self.source_lang: str = "en"
        self.target_lang: str = "vi"

    def update(self, data: dict):
        for key in (
            "stt_provider", "tts_provider", "openai_api_key", "elevenlabs_api_key",
            "openai_tts_voice", "elevenlabs_voice_id", "edge_tts_voice", "voice_profile",
            "source_lang", "target_lang",
        ):
            if key in data:
                setattr(self, key, data[key])


# ---------------------------------------------------------------------------
# STT providers
# ---------------------------------------------------------------------------

async def transcribe_local(pcm_bytes: bytes) -> str:
    model = get_whisper()
    np = _numpy()
    if model is None or np is None:
        return "[Error: Local Whisper not available on this server – switch STT to OpenAI]"
    audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    if len(audio) < SAMPLE_RATE * 0.3:
        return ""
    segments, _ = await asyncio.to_thread(
        model.transcribe, audio, language="en", beam_size=3, vad_filter=True
    )
    return " ".join(seg.text for seg in segments).strip()


async def transcribe_openai(pcm_bytes: bytes, api_key: str) -> str:
    if not api_key:
        return "[Error: OpenAI API key not set]"
    if len(pcm_bytes) < int(SAMPLE_RATE * 0.3) * 2:
        return ""

    wav_bytes = _pcm_to_wav_bytes(pcm_bytes)
    httpx = _get_httpx()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": ("audio.wav", wav_bytes, "audio/wav")},
            data={"model": "whisper-1", "language": "en"},
        )
        if resp.status_code != 200:
            print(f"[VoiceBridge] OpenAI STT error {resp.status_code}: {resp.text}")
            return ""
        return resp.json().get("text", "").strip()


async def transcribe(pcm_bytes: bytes, cfg: SessionConfig) -> str:
    if cfg.stt_provider == "openai":
        return await transcribe_openai(pcm_bytes, cfg.openai_api_key)
    return await transcribe_local(pcm_bytes)


# ---------------------------------------------------------------------------
# Translation corrections glossary
# ---------------------------------------------------------------------------

def _load_corrections() -> list[dict]:
    if CORRECTIONS_FILE.exists():
        try:
            return json.loads(CORRECTIONS_FILE.read_text("utf-8"))
        except Exception:
            pass
    return []


def _save_corrections(corrections: list[dict]):
    CORRECTIONS_FILE.write_text(json.dumps(corrections, ensure_ascii=False, indent=2), "utf-8")


def _apply_corrections(en_text: str, vi_text: str) -> str:
    corrections = _load_corrections()
    for c in corrections:
        en_phrase = c.get("en", "").strip()
        vi_correct = c.get("vi", "").strip()
        if not en_phrase or not vi_correct:
            continue
        if en_phrase.lower() in en_text.lower():
            old_vi = get_translator().translate(en_phrase) if get_translator() else ""
            if old_vi and old_vi in vi_text:
                vi_text = vi_text.replace(old_vi, vi_correct)
            elif vi_correct not in vi_text:
                vi_text = vi_text.replace(
                    vi_text, vi_correct
                ) if en_text.lower().strip() == en_phrase.lower().strip() else vi_text
    return vi_text


# ---------------------------------------------------------------------------
# Translation
# ---------------------------------------------------------------------------

async def translate_text(text: str) -> str:
    if not text:
        return ""
    translator = get_translator()
    result = await asyncio.to_thread(translator.translate, text)
    try:
        result = _apply_corrections(text, result)
    except Exception as e:
        print(f"[VoiceBridge] Correction apply error: {e}")
    return result


# ---------------------------------------------------------------------------
# TTS providers
# ---------------------------------------------------------------------------

async def tts_edge(text: str, voice: str = "") -> bytes:
    edge_tts = _get_edge_tts()
    communicate = edge_tts.Communicate(text, voice or EDGE_TTS_VOICE)
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)


async def tts_openai(text: str, api_key: str, voice: str = "nova", edge_voice: str = "") -> bytes:
    if not api_key:
        print("[VoiceBridge] OpenAI TTS: no API key, falling back to edge-tts")
        return await tts_edge(text, edge_voice)

    httpx = _get_httpx()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": "tts-1", "input": text, "voice": voice, "response_format": "mp3"},
        )
        if resp.status_code != 200:
            print(f"[VoiceBridge] OpenAI TTS error {resp.status_code}: {resp.text}")
            return await tts_edge(text, edge_voice)
        return resp.content


async def tts_elevenlabs(text: str, api_key: str, voice_id: str, edge_voice: str = "") -> bytes:
    if not api_key or not voice_id:
        print("[VoiceBridge] ElevenLabs TTS: missing key or voice_id, falling back to edge-tts")
        return await tts_edge(text, edge_voice)

    httpx = _get_httpx()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            },
        )
        if resp.status_code != 200:
            print(f"[VoiceBridge] ElevenLabs TTS error {resp.status_code}: {resp.text}")
            return await tts_edge(text, edge_voice)
        return resp.content


async def tts_coqui(text: str, voice_profile: str) -> Optional[bytes]:
    voice_dir = VOICES_DIR / voice_profile
    refs = sorted(voice_dir.glob("*.wav")) if voice_dir.exists() else []
    if not refs:
        return None

    coqui = get_coqui()
    if coqui is None and not _coqui_loading:
        print("[VoiceBridge] Loading XTTS for voice profile …")
        await asyncio.to_thread(_load_coqui_sync)
        coqui = get_coqui()
    elif coqui is None:
        return None

    if not coqui:
        return None

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        await asyncio.to_thread(
            coqui.tts_to_file,
            text=text, speaker_wav=str(refs[0]), language="vi", file_path=tmp.name,
        )
        with open(tmp.name, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp.name)


async def synthesize_speech(text: str, cfg: SessionConfig) -> bytes:
    if not text:
        return b""

    provider = cfg.tts_provider
    ev = cfg.edge_tts_voice

    if provider == "openai":
        return await tts_openai(text, cfg.openai_api_key, cfg.openai_tts_voice, ev)

    if provider == "elevenlabs":
        return await tts_elevenlabs(text, cfg.elevenlabs_api_key, cfg.elevenlabs_voice_id, ev)

    if provider == "coqui" and cfg.voice_profile and COQUI_AVAILABLE:
        result = await tts_coqui(text, cfg.voice_profile)
        if result:
            return result
        print("[VoiceBridge] Coqui TTS unavailable, falling back to edge-tts")

    return await tts_edge(text, ev)


# ---------------------------------------------------------------------------
# WebSocket – real-time translation
# ---------------------------------------------------------------------------

@app.websocket("/ws/translate")
async def ws_translate(ws: WebSocket):
    await ws.accept()
    buf = AudioBuffer()
    cfg = SessionConfig()

    await ws.send_json({"type": "status", "message": "Connected to VoiceBridge"})

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                data = json.loads(msg["text"])
                cmd = data.get("type")
                if cmd == "config":
                    cfg.update(data)
                    await ws.send_json({"type": "status", "message": f"Config updated ({cfg.stt_provider}/{cfg.tts_provider})"})
                elif cmd == "ping":
                    await ws.send_json({"type": "pong"})
                continue

            if "bytes" in msg:
                utterance = buf.add_chunk(msg["bytes"])
                if utterance is None:
                    continue

                t0 = time.time()

                text = await transcribe(utterance, cfg)
                if not text:
                    continue
                await ws.send_json({"type": "transcript", "text": text})

                translation = await translate_text(text)
                await ws.send_json({"type": "translation", "text": translation})

                audio = await synthesize_speech(translation, cfg)
                if audio:
                    await ws.send_json({
                        "type": "audio",
                        "format": "mp3",
                        "data": base64.b64encode(audio).decode(),
                    })

                elapsed = round(time.time() - t0, 2)
                await ws.send_json({"type": "timing", "seconds": elapsed})

    except WebSocketDisconnect:
        print("[VoiceBridge] Client disconnected")
    except Exception as exc:
        print(f"[VoiceBridge] WS error: {exc}")
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# REST – health & voice profile management
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "whisper_model": WHISPER_MODEL_SIZE,
        "coqui_available": COQUI_AVAILABLE,
        "edge_tts_voice": EDGE_TTS_VOICE,
        "providers": {
            "stt": ["local", "openai"],
            "tts": ["edge-tts", "openai", "elevenlabs"] + (["coqui"] if COQUI_AVAILABLE else []),
        },
    }


@app.get("/api/voices")
async def list_voices():
    voices = []
    for d in sorted(VOICES_DIR.iterdir()):
        if d.is_dir():
            samples = list(d.glob("*.wav"))
            voices.append({"name": d.name, "samples": len(samples)})
    return {"voices": voices, "coqui_available": COQUI_AVAILABLE}


@app.post("/api/voices/{name}/upload")
async def upload_voice_sample(name: str, file: UploadFile = File(...)):
    voice_dir = VOICES_DIR / name
    voice_dir.mkdir(exist_ok=True)
    content = await file.read()
    idx = len(list(voice_dir.glob("*.wav"))) + 1
    dest = voice_dir / f"sample_{idx:03d}.wav"
    dest.write_bytes(content)
    return {"message": f"Saved {dest.name}", "total_samples": idx}


@app.post("/api/voices/{name}/record")
async def save_recorded_sample(name: str, file: UploadFile = File(...)):
    voice_dir = VOICES_DIR / name
    voice_dir.mkdir(exist_ok=True)
    raw = await file.read()
    idx = len(list(voice_dir.glob("*.wav"))) + 1
    dest = voice_dir / f"sample_{idx:03d}.wav"

    if raw[:4] == b"RIFF":
        dest.write_bytes(raw)
    else:
        try:
            import subprocess
            tmp_in = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
            tmp_in.write(raw)
            tmp_in.close()
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in.name, "-ar", "22050", "-ac", "1", str(dest)],
                capture_output=True, check=True,
            )
            os.unlink(tmp_in.name)
        except Exception:
            dest.write_bytes(raw)

    return {"message": f"Saved {dest.name}", "total_samples": idx}


@app.delete("/api/voices/{name}")
async def delete_voice(name: str):
    voice_dir = VOICES_DIR / name
    if voice_dir.exists():
        shutil.rmtree(voice_dir)
        return {"message": f"Deleted voice profile '{name}'"}
    return {"message": "Profile not found"}


@app.get("/api/voices/{name}/samples")
async def list_samples(name: str):
    voice_dir = VOICES_DIR / name
    if not voice_dir.exists():
        return {"samples": []}
    samples = sorted(voice_dir.glob("*.wav"))
    return {"samples": [s.name for s in samples]}


@app.delete("/api/voices/{name}/samples/{filename}")
async def delete_sample(name: str, filename: str):
    path = VOICES_DIR / name / filename
    if path.exists():
        path.unlink()
    return {"message": f"Deleted {filename}"}


# ---------------------------------------------------------------------------
# REST – Translation corrections glossary
# ---------------------------------------------------------------------------

@app.get("/api/corrections")
async def get_corrections():
    return {"corrections": _load_corrections()}


@app.post("/api/corrections")
async def add_correction(en: str = Form(...), vi: str = Form(...)):
    corrections = _load_corrections()
    entry = {"en": en.strip(), "vi": vi.strip(), "id": int(time.time() * 1000)}
    for existing in corrections:
        if existing.get("en", "").lower() == en.strip().lower():
            existing["vi"] = vi.strip()
            _save_corrections(corrections)
            return {"message": "Updated", "correction": existing}
    corrections.append(entry)
    _save_corrections(corrections)
    return {"message": "Added", "correction": entry}


@app.delete("/api/corrections/{correction_id}")
async def delete_correction(correction_id: int):
    corrections = _load_corrections()
    corrections = [c for c in corrections if c.get("id") != correction_id]
    _save_corrections(corrections)
    return {"message": "Deleted"}


# ---------------------------------------------------------------------------
# REST – ElevenLabs voice cloning
# ---------------------------------------------------------------------------

@app.post("/api/elevenlabs/clone")
async def elevenlabs_clone(
    api_key: str = Form(...),
    name: str = Form(...),
    file: UploadFile = File(...),
):
    httpx = _get_httpx()
    raw = await file.read()

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.elevenlabs.io/v1/voices/add",
            headers={"xi-api-key": api_key},
            data={"name": name, "description": f"VoiceBridge clone: {name}"},
            files={"files": (file.filename or "sample.wav", raw, file.content_type or "audio/wav")},
        )
        if resp.status_code != 200:
            return {"error": resp.text, "status": resp.status_code}
        data = resp.json()
        return {"voice_id": data.get("voice_id"), "name": name}


@app.get("/api/elevenlabs/voices")
async def elevenlabs_list_voices(api_key: str):
    httpx = _get_httpx()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.elevenlabs.io/v1/voices",
            headers={"xi-api-key": api_key},
        )
        if resp.status_code != 200:
            return {"error": resp.text, "voices": []}
        voices = resp.json().get("voices", [])
        return {
            "voices": [
                {"voice_id": v["voice_id"], "name": v["name"], "category": v.get("category", "")}
                for v in voices
            ]
        }


@app.delete("/api/elevenlabs/voices/{voice_id}")
async def elevenlabs_delete_voice(voice_id: str, api_key: str):
    httpx = _get_httpx()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(
            f"https://api.elevenlabs.io/v1/voices/{voice_id}",
            headers={"xi-api-key": api_key},
        )
        if resp.status_code != 200:
            return {"error": resp.text}
        return {"message": f"Deleted voice {voice_id}"}


# ---------------------------------------------------------------------------
# REST – Subscription verification (checks Supabase)
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


async def _check_pro(user_id: str) -> bool:
    """Check if a user has an active Pro subscription via Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not user_id:
        return False
    httpx = _get_httpx()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/subscriptions"
                f"?user_id=eq.{user_id}&plan=eq.pro&status=eq.active&select=id",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
            )
            return resp.status_code == 200 and len(resp.json()) > 0
    except Exception as e:
        print(f"[VoiceBridge] Subscription check error: {e}")
        return False


@app.get("/api/verify-subscription")
async def verify_subscription(user_id: str = ""):
    if not user_id:
        return {"plan": "free", "pro": False}
    is_pro = await _check_pro(user_id)
    return {"plan": "pro" if is_pro else "free", "pro": is_pro}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8765")))
