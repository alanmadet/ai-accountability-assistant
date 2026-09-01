import { useEffect, useState } from "react";
import { Settings, RefreshCw, Loader2, Check } from "lucide-react";

import type { UserSettings } from "../types/task";

const API_URL = import.meta.env.VITE_API_URL;

const FREQUENCY_OPTIONS = [1, 2, 4, 6, 12, 24];
const EMAIL_COUNT_OPTIONS = [5, 25, 50, 100, 200];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    auto_sync_enabled: true,
    sync_frequency_hours: 1,
    sync_email_count: 100,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function loadSettings() {
    try {
      const res = await fetch(`${API_URL}/settings`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.error) setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_URL}/settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function disconnectGmail() {
    if (!window.confirm("Disconnect Gmail? Beacon will stop syncing and remove its stored Google credentials.")) return;
    const response = await fetch(`${API_URL}/auth/disconnect`, {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) window.location.href = "/";
  }

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 size={28} className="animate-spin mr-3" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-zinc-800/80 ring-1 ring-zinc-700/60">
            <Settings size={20} className="text-zinc-400 shrink-0" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.02em]">Settings</h2>
        </div>
        <p className="text-zinc-400 mb-10">
          Configure how Beacon syncs your inbox automatically.
        </p>

        <div className="space-y-8">
          {/* Auto-sync toggle */}
          <div className="bg-zinc-900/60 ring-1 ring-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold mb-1">Auto-sync</p>
                <p className="text-sm text-zinc-400">
                  Automatically fetch and process new emails in the background.
                </p>
              </div>

              <button
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    auto_sync_enabled: !s.auto_sync_enabled,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  settings.auto_sync_enabled ? "bg-indigo-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    settings.auto_sync_enabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sync frequency */}
          <div
            className={`bg-zinc-900/60 ring-1 ring-zinc-800 rounded-2xl p-6 transition-opacity ${
              !settings.auto_sync_enabled ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            <p className="font-semibold mb-1">Sync Frequency</p>
            <p className="text-sm text-zinc-400 mb-4">
              How often Beacon checks for new emails.
            </p>

            <div className="flex flex-wrap gap-2">
              {FREQUENCY_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() =>
                    setSettings((s) => ({ ...s, sync_frequency_hours: h }))
                  }
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    settings.sync_frequency_hours === h
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                      : "bg-zinc-800/70 ring-1 ring-zinc-700/60 text-zinc-300 hover:ring-zinc-600"
                  }`}
                >
                  {h === 1 ? "Every hour" : `Every ${h}h`}
                </button>
              ))}
            </div>
          </div>

          {/* Emails per sync */}
          <div className="bg-zinc-900/60 ring-1 ring-zinc-800 rounded-2xl p-6">
            <p className="font-semibold mb-1">Emails per Sync</p>
            <p className="text-sm text-zinc-400 mb-4">
              Maximum emails to fetch and process per sync.
            </p>

            <div className="flex flex-wrap gap-2">
              {EMAIL_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setSettings((s) => ({ ...s, sync_email_count: n }))
                  }
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    settings.sync_email_count === n
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                      : "bg-zinc-800/70 ring-1 ring-zinc-700/60 text-zinc-300 hover:ring-zinc-600"
                  }`}
                >
                  {n} emails
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-200 px-5 py-3 rounded-xl font-medium shadow-lg ${
              saved
                ? "bg-emerald-500 shadow-emerald-500/25"
                : "bg-indigo-500 hover:bg-indigo-400 shadow-indigo-500/25 hover:shadow-indigo-400/30"
            }`}
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : saved ? (
              <Check size={18} />
            ) : (
              <RefreshCw size={18} />
            )}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>

          <button
            onClick={disconnectGmail}
            className="w-full px-5 py-3 rounded-xl font-medium text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/10 transition"
          >
            Disconnect Gmail
          </button>
        </div>
      </div>
    </div>
  );
}
