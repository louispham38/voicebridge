"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type Tab = "billing" | "settings" | "voices" | "corrections" | "download";
type SubInfo = { plan: string; status: string; current_period_end?: string };

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("billing");
  const [sub, setSub] = useState<SubInfo>({ plan: "free", status: "active" });
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const [sttProvider, setSttProvider] = useState("local");
  const [ttsProvider, setTtsProvider] = useState("edge-tts");
  const [openaiKey, setOpenaiKey] = useState("");
  const [elevenlabsKey, setElevenlabsKey] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [corrections, setCorrections] = useState<{ en: string; vi: string; id: number }[]>([]);
  const [newEn, setNewEn] = useState("");
  const [newVi, setNewVi] = useState("");

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8765";
  const isPro = sub.plan === "pro" && sub.status === "active";

  const loadCorrections = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/corrections`);
      const data = await res.json();
      setCorrections(data.corrections || []);
    } catch {
      /* backend offline */
    }
  }, [backendUrl]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadCorrections();
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((d) => setSub(d))
      .catch(() => {});

    if (new URLSearchParams(window.location.search).get("upgraded") === "true") {
      setSub({ plan: "pro", status: "active" });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [supabase, loadCorrections]);

  async function handleUpgrade() {
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Checkout failed");
    } catch {
      alert("Could not start checkout");
    }
    setUpgradeLoading(false);
  }

  async function handleManage() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("Could not open billing portal");
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
    setSaveMsg("Saved! Copy settings to extension popup.");
    setTimeout(() => setSaveMsg(""), 3000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "billing", label: "Plan" },
    { id: "settings", label: "Settings" },
    { id: "voices", label: "Voices" },
    { id: "corrections", label: "Corrections" },
    { id: "download", label: "Download" },
  ];

  return (
    <div className="min-h-screen">
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
            {isPro && (
              <span className="text-xs font-bold bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] text-white px-2.5 py-0.5 rounded-full">
                PRO
              </span>
            )}
            <span className="text-xs text-gray-500">{user?.email}</span>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white transition-colors">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

        <div className="flex gap-1 border-b border-white/5 mb-8 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-[#6c5ce7] text-[#a29bfe]"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Billing tab ─────────────────────────────── */}
        {tab === "billing" && (
          <div className="space-y-6 max-w-lg">
            <div className="bg-[#12141d] border border-white/5 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">
                    {isPro ? "Pro Plan" : "Free Plan"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {isPro
                      ? `Active until ${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("vi-VN") : "—"}`
                      : "Upgrade to unlock cloud features"}
                  </p>
                </div>
                {isPro ? (
                  <span className="text-3xl font-extrabold">
                    $5<span className="text-sm font-normal text-gray-500">/mo</span>
                  </span>
                ) : (
                  <span className="text-3xl font-extrabold text-gray-600">$0</span>
                )}
              </div>

              {isPro ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      "Cloud STT (OpenAI Whisper)",
                      "Cloud TTS (OpenAI / ElevenLabs)",
                      "Voice Cloning",
                      "Cloud Backend",
                      "Priority Support",
                      "Translation Corrections",
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-gray-400">
                        <span className="text-[#00b894]">&#10003;</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleManage}
                    className="w-full mt-4 border border-white/10 hover:border-white/20 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
                  >
                    Manage Subscription
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm text-gray-500">
                    <p>Free plan includes:</p>
                    <ul className="space-y-1.5 ml-1">
                      {[
                        "Local Whisper STT",
                        "edge-tts voices (free)",
                        "Floating panel",
                        "Translation corrections",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <span className="text-gray-600">&#10003;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-gradient-to-r from-[#6c5ce7]/10 to-[#8b5cf6]/10 border border-[#6c5ce7]/20 rounded-xl p-4">
                    <p className="text-sm font-medium text-[#a29bfe] mb-2">Upgrade to Pro for:</p>
                    <ul className="space-y-1 text-sm text-gray-400">
                      {[
                        "Cloud STT — faster, more accurate",
                        "OpenAI & ElevenLabs TTS",
                        "Voice Cloning (ElevenLabs)",
                        "Cloud backend — no local setup",
                      ].map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <span className="text-[#6c5ce7]">&#10003;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={handleUpgrade}
                    disabled={upgradeLoading}
                    className="w-full bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] hover:from-[#5a4bd6] hover:to-[#7c4ddb] text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-[#6c5ce7]/20 transition-all disabled:opacity-50"
                  >
                    {upgradeLoading ? "Redirecting..." : "Upgrade to Pro — $5/month"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Settings tab ─────────────────────────────── */}
        {tab === "settings" && (
          <div className="space-y-6 max-w-lg">
            {!isPro && (
              <div className="bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 rounded-xl p-4 text-sm text-[#a29bfe]">
                Cloud providers require Pro plan.{" "}
                <button onClick={() => setTab("billing")} className="underline font-semibold">
                  Upgrade
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">STT Provider</label>
              <select value={sttProvider} onChange={(e) => setSttProvider(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]">
                <option value="local">Local (Whisper — free)</option>
                <option value="openai" disabled={!isPro}>Cloud (OpenAI Whisper) {!isPro ? "— Pro" : ""}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">TTS Provider</label>
              <select value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]">
                <option value="edge-tts">edge-tts (free)</option>
                <option value="openai" disabled={!isPro}>OpenAI TTS {!isPro ? "— Pro" : ""}</option>
                <option value="elevenlabs" disabled={!isPro}>ElevenLabs {!isPro ? "— Pro" : ""}</option>
              </select>
            </div>
            {isPro && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">OpenAI API Key</label>
                  <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm font-mono outline-none focus:border-[#6c5ce7]" />
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-[#a29bfe] hover:underline mt-1 inline-block">
                    Get API key &rarr;
                  </a>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">ElevenLabs API Key</label>
                  <input type="password" value={elevenlabsKey} onChange={(e) => setElevenlabsKey(e.target.value)} placeholder="xi-..." className="w-full px-4 py-2.5 rounded-xl bg-[#12141d] border border-white/10 text-sm font-mono outline-none focus:border-[#6c5ce7]" />
                  <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-[#a29bfe] hover:underline mt-1 inline-block">
                    Get API key &rarr;
                  </a>
                </div>
              </>
            )}
            <button onClick={saveSettings} className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
              Save Settings
            </button>
            {saveMsg && <p className="text-xs text-green-400">{saveMsg}</p>}
          </div>
        )}

        {/* ── Voices tab ─────────────────────────────── */}
        {tab === "voices" && (
          <div className="space-y-4">
            {!isPro ? (
              <div className="bg-[#12141d] border border-white/5 rounded-2xl p-8 text-center">
                <p className="text-sm text-gray-400 mb-4">Voice Cloning requires Pro plan.</p>
                <button
                  onClick={() => setTab("billing")}
                  className="bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                >
                  Upgrade to Pro
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Manage ElevenLabs clone voices. Create new voices in the extension (Voices tab).
                </p>
                <div className="bg-[#12141d] border border-white/5 rounded-xl p-6 text-center text-sm text-gray-500">
                  Voice management on web coming soon.
                  <br />
                  Use the extension to create and manage clone voices.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Corrections tab ─────────────────────────────── */}
        {tab === "corrections" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Add or edit translation pairs. When the EN phrase is detected, your custom VI translation will be used.
            </p>

            <form onSubmit={addCorrection} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">English</label>
                <input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="hello" className="w-full px-3 py-2 rounded-lg bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]" />
              </div>
              <span className="text-[#a29bfe] pb-2">&rarr;</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Vietnamese</label>
                <input value={newVi} onChange={(e) => setNewVi(e.target.value)} placeholder="xin chào" className="w-full px-3 py-2 rounded-lg bg-[#12141d] border border-white/10 text-sm outline-none focus:border-[#6c5ce7]" />
              </div>
              <button type="submit" className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Add
              </button>
            </form>

            <div className="space-y-2">
              {corrections.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">No corrections yet.</p>
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

        {/* ── Download tab ─────────────────────────────── */}
        {tab === "download" && (
          <div className="space-y-6">
            <div className="bg-[#12141d] border border-white/5 rounded-2xl p-8 text-center">
              <svg className="mx-auto mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a29bfe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <h3 className="text-lg font-bold mb-2">VoiceBridge Extension</h3>
              <p className="text-sm text-gray-400 mb-6">
                Chrome extension for real-time voice translation.
                <br />
                Works with Chrome, Edge, Brave, Arc.
              </p>
              <a
                href="/release/voicebridge-latest.zip"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[#6c5ce7] to-[#8b5cf6] text-white font-semibold px-8 py-3 rounded-full shadow-lg shadow-[#6c5ce7]/20 hover:from-[#5a4bd6] hover:to-[#7c4ddb] transition-all text-sm"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download Extension (.zip)
              </a>
            </div>

            <div className="bg-[#12141d] border border-white/5 rounded-xl p-6">
              <h4 className="font-semibold mb-3">Installation Guide</h4>
              <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                <li>Download the ZIP file above</li>
                <li>Open Chrome &rarr; go to <code className="text-[#a29bfe]">chrome://extensions/</code></li>
                <li>Enable <strong className="text-white">Developer mode</strong> (top right)</li>
                <li>Drag and drop the ZIP file into the extensions page</li>
                <li>Open Zoom/YouTube &rarr; click VoiceBridge icon &rarr; Start translating</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
