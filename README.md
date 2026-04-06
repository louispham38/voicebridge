# VoiceBridge – Real-time English → Vietnamese Voice Translator

Dịch real-time tiếng Anh sang tiếng Việt bằng giọng nói cho Zoom, YouTube, Google Meet, Teams. Hỗ trợ clone giọng nói (ElevenLabs), panel nổi trên trang, và từ điển sửa dịch.

## Kiến trúc

```
┌──────────────────┐       WebSocket        ┌─────────────────────────────┐
│  Chrome Extension │ ◄──────────────────► │     Python Backend          │
│                    │    PCM 16kHz mono     │                             │
│  • Tab audio       │ ──────────────────► │  STT: Local Whisper / OpenAI│
│    capture         │                      │       ↓                     │
│  • Floating panel  │    JSON + base64     │  Google Translate EN→VI     │
│    (pause/edit)    │ ◄────────────────── │       ↓                     │
│  • Voice clone     │                      │  TTS: edge-tts / OpenAI /  │
│    recorder        │                      │       ElevenLabs / Coqui   │
└──────────────────┘                       └─────────────────────────────┘

┌──────────────────┐                       ┌─────────────────────────────┐
│  Landing Page     │                       │  Supabase                   │
│  (Next.js/Vercel) │ ◄──────────────────► │  Auth + User Settings       │
│  • Marketing      │                       │                             │
│  • Dashboard      │                       │                             │
│  • Download .zip  │                       │                             │
└──────────────────┘                       └─────────────────────────────┘
```

## Tính năng

- **Dịch real-time**: Tab audio → STT → Google Translate → TTS → giọng Việt
- **Cloud + Local**: Chọn local (miễn phí, tốn RAM) hoặc cloud (OpenAI, ElevenLabs — nhanh)
- **Voice cloning**: Clone giọng qua ElevenLabs (cloud) hoặc Coqui XTTS (local)
- **Panel nổi**: Hiện trực tiếp trên trang web — pause video, sửa dịch tại chỗ
- **Từ điển sửa dịch**: Dạy VoiceBridge cách dịch đúng các từ/câu cụ thể
- **Nhiều giọng**: HoaiMy (nữ), NamMinh (nam), OpenAI voices, ElevenLabs voices

## Cài đặt nhanh

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Server chạy tại `http://localhost:8765`.

### 2. Chrome Extension

1. Mở `chrome://extensions/` → bật **Developer mode**
2. Nhấn **Load unpacked** → chọn thư mục `extension/`
3. Hoặc tải file ZIP từ landing page → kéo thả vào trang extensions

### 3. Landing Page (tuỳ chọn)

```bash
cd web
cp .env.local.example .env.local
# Sửa SUPABASE_URL và SUPABASE_ANON_KEY
npm install
npm run dev
```

## Deploy lên cloud

### Backend → Railway

1. Push repo lên GitHub
2. Tạo project mới trên [railway.app](https://railway.app)
3. Connect GitHub repo → chọn thư mục `backend/`
4. Railway tự detect Python + cài dependencies
5. Set env vars: `CORS_ORIGINS=https://your-site.vercel.app`

### Landing Page → Vercel

1. Import project trên [vercel.com](https://vercel.com)
2. Root directory: `web/`
3. Set env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BACKEND_URL` (Railway URL)
4. Deploy

### Auth → Supabase

1. Tạo project trên [supabase.com](https://supabase.com)
2. Bật Google OAuth trong Authentication → Providers
3. Copy URL + anon key vào env vars của Vercel

## Biến môi trường

### Backend

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `8765` | Port server (Railway tự set) |
| `CORS_ORIGINS` | `*` | Allowed origins (comma-separated) |
| `WHISPER_MODEL` | `base` | Model: `tiny`, `base`, `small`, `medium` |
| `WHISPER_DEVICE` | `cpu` | `cpu` hoặc `cuda` |
| `EDGE_TTS_VOICE` | `vi-VN-HoaiMyNeural` | Giọng edge-tts mặc định |

### Web

| Biến | Mô tả |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL (Railway hoặc localhost) |

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| WS | `/ws/translate` | WebSocket dịch real-time |
| GET | `/api/health` | Health check |
| GET | `/api/voices` | Danh sách giọng local |
| POST | `/api/voices/{name}/record` | Lưu thu âm |
| GET | `/api/corrections` | Lấy từ điển sửa dịch |
| POST | `/api/corrections` | Thêm/sửa correction |
| POST | `/api/elevenlabs/clone` | Clone giọng ElevenLabs |
| GET | `/api/elevenlabs/voices` | Danh sách giọng ElevenLabs |

## Tech Stack

- **Backend**: FastAPI, faster-whisper, deep-translator, edge-tts, httpx
- **Extension**: Chrome Manifest V3, tabCapture, Web Audio API, WebSocket
- **Landing Page**: Next.js 14, Tailwind CSS, Supabase Auth
- **Deploy**: Vercel (web), Railway (backend), Supabase (auth)
