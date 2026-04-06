"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "#features", label: "Tính năng" },
  { href: "#how-it-works", label: "Cách dùng" },
  { href: "#pricing", label: "Bảng giá" },
  { href: "#faq", label: "FAQ" },
];

const FEATURES = [
  {
    icon: "🎙️",
    title: "Dịch giọng nói Real-time",
    desc: "Nghe bản dịch tiếng Việt ngay khi người nói đang nói tiếng Anh. Không delay, không gián đoạn.",
  },
  {
    icon: "🗣️",
    title: "Clone giọng nói",
    desc: "Nhân bản giọng nói của bạn qua ElevenLabs — bản dịch phát ra bằng chính giọng bạn.",
  },
  {
    icon: "🌐",
    title: "Đa nền tảng",
    desc: "Hoạt động trên Zoom, YouTube, Google Meet, Microsoft Teams — bất kỳ tab Chrome nào có audio.",
  },
  {
    icon: "🔒",
    title: "Riêng tư & An toàn",
    desc: "Audio xử lý trực tiếp, không lưu trữ trên server. API key chỉ lưu trong trình duyệt của bạn.",
  },
  {
    icon: "☁️",
    title: "Cloud hoặc Local",
    desc: "Chọn STT/TTS local (miễn phí, tốn RAM) hoặc cloud (OpenAI, ElevenLabs — nhanh, nhẹ).",
  },
  {
    icon: "✏️",
    title: "Dạy model dịch",
    desc: "Sửa bản dịch sai ngay trên giao diện. VoiceBridge ghi nhớ và áp dụng cho lần sau.",
  },
];

const STEPS = [
  {
    num: "1",
    title: "Cài Extension",
    desc: "Tải file ZIP, kéo thả vào chrome://extensions. Xong trong 30 giây.",
  },
  {
    num: "2",
    title: "Cấu hình Provider",
    desc: "Chọn Local (miễn phí) hoặc Cloud (cần API key). Nhập key nếu dùng cloud.",
  },
  {
    num: "3",
    title: "Bắt đầu dịch",
    desc: "Mở Zoom/YouTube, nhấn nút dịch. Panel nổi hiện bản dịch + điều khiển ngay trên trang.",
  },
];

const FAQS = [
  {
    q: "VoiceBridge hoàn toàn miễn phí?",
    a: "Plan Free cho bạn đầy đủ chức năng dịch với Local Whisper + edge-tts — không tốn gì. Bạn chỉ trả tiền nếu dùng cloud API (OpenAI, ElevenLabs) với key của mình.",
  },
  {
    q: "Cần API key gì?",
    a: "Nếu dùng Free plan: không cần gì. Nếu dùng Pro: cần OpenAI API key (cho STT/TTS cloud) và/hoặc ElevenLabs API key (cho voice cloning). Tất cả đều có free tier.",
  },
  {
    q: "Có hỗ trợ ngôn ngữ nào khác không?",
    a: "Hiện tại tối ưu cho Anh → Việt. Kiến trúc hỗ trợ mở rộng sang 60+ ngôn ngữ qua Google Translate.",
  },
  {
    q: "Voice clone có an toàn không?",
    a: "File giọng gửi trực tiếp tới ElevenLabs qua API key của bạn. VoiceBridge không lưu trữ hay trung chuyển dữ liệu giọng nói.",
  },
  {
    q: "Chạy trên trình duyệt nào?",
    a: "Chrome và các trình duyệt Chromium (Edge, Brave, Arc). Firefox chưa hỗ trợ do giới hạn tabCapture API.",
  },
  {
    q: "Backend Python có bắt buộc không?",
    a: "Có — backend xử lý STT, dịch, và TTS. Bạn có thể chạy local hoặc dùng server cloud đã deploy sẵn (Pro plan).",
  },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

/* ── Navigation ──────────────────────────────────────────────────────── */

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-lg border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-[#a29bfe] font-bold text-lg">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          VoiceBridge
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-gray-400 hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            Dashboard
          </Link>
          <a
            href="/release/voicebridge-latest.zip"
            className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
          >
            Tải Extension
          </a>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden text-gray-400">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/5 bg-[#0a0a0f]/95 backdrop-blur-lg px-6 pb-4 flex flex-col gap-3">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-white py-2">
              {l.label}
            </a>
          ))}
          <a href="/release/voicebridge-latest.zip" className="bg-[#6c5ce7] text-white text-sm font-semibold px-5 py-2.5 rounded-full text-center mt-2">
            Tải Extension
          </a>
        </div>
      )}
    </nav>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#6c5ce7]/8 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#6c5ce7]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 text-[#a29bfe] text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
          <span className="w-2 h-2 bg-[#00b894] rounded-full animate-pulse" />
          Free &amp; Open Source Chrome Extension
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
          Dịch giọng nói{" "}
          <span className="bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] bg-clip-text text-transparent">
            Real-time
          </span>
          <br />
          cho Zoom, YouTube &amp; Meet
        </h1>

        <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          VoiceBridge dịch tiếng Anh sang tiếng Việt ngay khi người nói đang nói.
          Hỗ trợ clone giọng nói, panel điều khiển nổi, và từ điển sửa dịch thông minh.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/release/voicebridge-latest.zip"
            className="bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] hover:from-[#5a4bd6] hover:to-[#7c4ddb] text-white font-semibold px-8 py-3.5 rounded-full shadow-lg shadow-[#6c5ce7]/25 transition-all hover:-translate-y-0.5 text-sm"
          >
            Tải Extension — Miễn phí
          </a>
          <a
            href="#how-it-works"
            className="text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-8 py-3.5 rounded-full text-sm font-medium transition-all"
          >
            Xem cách hoạt động
          </a>
        </div>

        <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
          <span className="flex items-center gap-2">
            <span className="text-[#00b894]">✓</span> Miễn phí
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[#00b894]">✓</span> Không cần tài khoản
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[#00b894]">✓</span> Voice Clone
          </span>
        </div>
      </div>
    </section>
  );
}

/* ── Features ────────────────────────────────────────────────────────── */

function Features() {
  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold">Tính năng nổi bật</h2>
          <p className="text-gray-400 mt-3 max-w-xl mx-auto">
            Mọi thứ bạn cần để dịch giọng nói real-time — từ miễn phí tới pro.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-[#12141d] border border-white/5 rounded-2xl p-6 hover:border-[#6c5ce7]/30 transition-colors group"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-lg mb-2 group-hover:text-[#a29bfe] transition-colors">
                {f.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-6 bg-[#12141d]/50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold">Bắt đầu trong 3 bước</h2>
          <p className="text-gray-400 mt-3">Không cần tài khoản. Cài và dùng ngay.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div key={s.num} className="text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#8b5cf6] flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-[#6c5ce7]/20">
                {s.num}
              </div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold">Bảng giá đơn giản</h2>
          <p className="text-gray-400 mt-3">Dùng miễn phí hoặc nâng cấp khi cần tốc độ cloud.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free */}
          <div className="bg-[#12141d] border border-white/5 rounded-2xl p-8">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$0</span>
              <span className="text-gray-500 text-sm">mãi mãi</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-gray-400">
              {[
                "Dịch real-time (Whisper local)",
                "Giọng edge-tts (HoaiMy, NamMinh)",
                "Panel nổi trên trang web",
                "Sửa dịch + từ điển glossary",
                "Zoom, YouTube, Meet, Teams",
                "Không cần tài khoản hay API key",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="text-[#00b894] mt-0.5">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <a
              href="/release/voicebridge-latest.zip"
              className="mt-8 block text-center border border-white/10 hover:border-white/20 text-white text-sm font-semibold py-3 rounded-full transition-colors"
            >
              Tải miễn phí
            </a>
          </div>

          {/* Pro */}
          <div className="bg-[#12141d] border-2 border-[#6c5ce7]/40 rounded-2xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#6c5ce7] text-white text-xs font-bold px-4 py-1 rounded-full">
              Phổ biến
            </div>
            <h3 className="text-lg font-semibold">Pro</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$5</span>
              <span className="text-gray-500 text-sm">/ tháng</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-gray-400">
              {[
                "Tất cả tính năng Free",
                "Cloud STT (OpenAI Whisper — nhanh)",
                "Cloud TTS (OpenAI / ElevenLabs)",
                "Voice cloning (ElevenLabs IVC)",
                "Backend cloud — không cần cài local",
                "BYO API key — trả theo dùng",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="text-[#6c5ce7] mt-0.5">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className="mt-8 block text-center bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] text-white text-sm font-semibold py-3 rounded-full shadow-lg shadow-[#6c5ce7]/20 hover:from-[#5a4bd6] hover:to-[#7c4ddb] transition-all"
            >
              Bắt đầu dùng Pro
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Pro plan sử dụng API key của bạn (OpenAI, ElevenLabs). Bạn chỉ trả cho nhà cung cấp API theo mức dùng thực tế.
        </p>
      </div>
    </section>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 px-6 bg-[#12141d]/50">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Câu hỏi thường gặp</h2>

        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <div
              key={i}
              className="bg-[#12141d] border border-white/5 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-medium text-sm">{f.q}</span>
                <svg
                  className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${openIdx === i ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openIdx === i && (
                <div className="px-6 pb-4 text-sm text-gray-400 leading-relaxed">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[#a29bfe] font-bold">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          VoiceBridge
        </div>
        <div className="flex items-center gap-6 text-xs text-gray-500">
          <a href="#features" className="hover:text-gray-300 transition-colors">Tính năng</a>
          <a href="#pricing" className="hover:text-gray-300 transition-colors">Bảng giá</a>
          <a href="#faq" className="hover:text-gray-300 transition-colors">FAQ</a>
          <Link href="/dashboard" className="hover:text-gray-300 transition-colors">Dashboard</Link>
        </div>
        <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} VoiceBridge. All rights reserved.</p>
      </div>
    </footer>
  );
}
