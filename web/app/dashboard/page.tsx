"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type Tab = "settings" | "voices" | "corrections" | "download";

export default function DashboardPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("settings");

  const [sttProvider, setSttProvider] = useState("local");
  const [ttsProvider, setTtsProvider] = useState("edge-tts");
  const [openaiKey, setOpenaiKey] = useState("");
  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [corrections, setCorrections] = useState<{ en: string; vi: string; id: number }[]>([]);
  const [newEn, setNewEn] = useState("");
  const [newVi, setNewVi] = useState("");

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8765";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadCorrections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCorrections() {
    try {
      const res = await fetch(`${backendUrl}/api/corrections`);
      const data = await res.json();
      setCorrections(data.corrections || []);
    } catch {
      /* backend offline */
    }
  }

  async function addCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!newEn || !newVi) return;
    const form = new FormData();
    form.append("en", newEn);
    form.append("vi", newVi);
    await fetch(`${backendUrl}/api/corrections`, { method: "POST", body: form });
    setNewEn("");
    setNewVi("");
    loadCorrections();
  }

  async function deleteCorrection(id: number) {
    await fetch(`${backendUrl}/api/corrections/${id}`, { method: "DELETE" });
    loadCorrections();
  }

  function saveSettings() {
    localStorage.setItem(
      "vb_dashboard_settings",
      JSON.stringify({ sttProvider, ttsProvider, openaiKey, elevenlabsKey })
    );
    setSaveMsg("Đã lưu! Copy settings sang extension popup.");
    setTimeout(() => setSaveMsg(""), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "settings", label: "Cài đặt" },
    { id: "voices", label: "Giọng nói" },
    { id: "corrections", label: "Từ điển sửa dịch" },
    { id: "download", label: "Tải Extension" },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[#a29bfe] font-bold">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            VoiceBridge
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">{user?.email}</span>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white transition-colors">
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/5 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#6c5ce7] text-[#a29bfe]"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Settings tab */}
        {tab === "settings" && (
          <div className="space-y-6 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">STT Provider</label>
              <select value={sttProvider} onChange={(e) => setSttProvider(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]">
                <option value="local">Local (Whisper — miễn phí)</option>
                <option value="openai">Cloud (OpenAI Whisper API)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">TTS Provider</label>
              <select value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]">
                <option value="edge-tts">edge-tts (miễn phí)</option>
                <option value="openai">OpenAI TTS</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">OpenAI API Key</label>
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm font-mono outline-none focus:border-[#6c5ce7]" />
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-[#a29bfe] hover:underline mt-1 inline-block">
                Lấy API key &rarr;
              </a>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">ElevenLabs API Key</label>
              <input type="password" value={elevenlabsKey} onChange={(e) => setElevenlabsKey(e.target.value)} placeholder="xi-..." className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm font-mono outline-none focus:border-[#6c5ce7]" />
              <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-[#a29bfe] hover:underline mt-1 inline-block">
                Lấy API key &rarr;
              </a>
            </div>
            <button onClick={saveSettings} className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
              Lưu cài đặt
            </button>
            {saveMsg && <p className="text-xs text-green-400">{saveMsg}</p>}
          </div>
        )}

        {/* Voices tab */}
        {tab === "voices" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Quản lý giọng clone ElevenLabs. Tạo giọng mới trong extension (tab Giọng nói), danh sách sẽ hiện ở đây.
            </p>
            <div className="bg-[#12141d] border border-white/5 rounded-xl p-6 text-center text-sm text-gray-500">
              Tính năng quản lý giọng trên web đang phát triển.
              <br />
              Hiện tại dùng extension để tạo và quản lý giọng clone.
            </div>
          </div>
        )}

        {/* Corrections tab */}
        {tab === "corrections" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Thêm hoặc sửa cặp dịch. Khi gặp câu EN tương ứng, hệ thống sẽ dùng bản dịch VI bạn đã sửa.
            </p>

            <form onSubmit={addCorrection} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Tiếng Anh</label>
                <input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="hello" className="w-full px-3 py-2 rounded-lg bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]" />
              </div>
              <span className="text-[#a29bfe] pb-2">&rarr;</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Tiếng Việt</label>
                <input value={newVi} onChange={(e) => setNewVi(e.target.value)} placeholder="xin chào" className="w-full px-3 py-2 rounded-lg bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]" />
              </div>
              <button type="submit" className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Thêm
              </button>
            </form>

            <div className="space-y-2">
              {corrections.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">Chưa có từ nào.</p>
              )}
              {corrections.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-[#12141d] border border-white/5 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500">{c.en}</span>
                    <span className="text-[#a29bfe] text-xs">&rarr;</span>
                    <span className="font-medium">{c.vi}</span>
                  </div>
                  <button onClick={() => deleteCorrection(c.id)} className="text-gray-600 hover:text-red-400 text-sm transition-colors">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download tab */}
        {tab === "download" && (
          <div className="space-y-6">
            <div className="bg-[#12141d] border border-white/5 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-4">
                <svg className="mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a29bfe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">VoiceBridge Extension</h3>
              <p className="text-sm text-gray-400 mb-6">
                Chrome extension cho dịch giọng nói real-time.
                <br />
                Tương thích Chrome, Edge, Brave, Arc.
              </p>
              <a
                href="/release/voicebridge-latest.zip"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] text-white font-semibold px-8 py-3 rounded-full shadow-lg shadow-[#6c5ce7]/20 hover:from-[#5a4bd6] hover:to-[#7c4ddb] transition-all text-sm"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Tải Extension (.zip)
              </a>
            </div>

            <div className="bg-[#12141d] border border-white/5 rounded-xl p-6">
              <h4 className="font-semibold mb-3">Hướng dẫn cài đặt</h4>
              <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                <li>Tải file ZIP ở trên</li>
                <li>Mở Chrome &rarr; vào <code className="text-[#a29bfe]">chrome://extensions/</code></li>
                <li>Bật <strong className="text-white">Developer mode</strong> (góc phải trên)</li>
                <li>Kéo thả file ZIP vào trang extensions</li>
                <li>Mở Zoom/YouTube &rarr; nhấn icon VoiceBridge &rarr; Bắt đầu dịch</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
