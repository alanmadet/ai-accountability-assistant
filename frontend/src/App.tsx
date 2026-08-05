import { useEffect, useState } from "react";

import {
  RefreshCw,
  Mail,
  LayoutDashboard,
  CheckCircle2,
  Settings,
  Search,
  MessageCircleQuestion,
  AlertTriangle,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import SearchPanel from "./components/SearchPanel";
import CompletedPage from "./components/CompletedPage";
import SettingsPage from "./components/SettingsPage";
import PrivacyModal from "./components/PrivacyModal";
import type { Notification, Insight } from "./types/notification";
import {
  fetchNotifications,
  fetchInsights,
  completeNotification,
  dismissNotification,
  snoozeNotification,
  dismissInsight,
} from "./services/api";

const API_URL = import.meta.env.VITE_API_URL;

type View = "dashboard" | "search" | "completed" | "settings";

const NAV_ITEMS: { id: View; label: string; icon: typeof Mail }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "search", label: "Search", icon: Search },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "settings", label: "Settings", icon: Settings },
];

function App() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [userName, setUserName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  async function loadMe() {
    try {
      const res = await fetch(`${API_URL}/me`, { credentials: "include" });
      const data = await res.json();
      setUserName(data.name ?? "");
    } catch (err) {
      console.error(err);
    }
  }

  async function loadNotifications() {
    try {
      const data = await fetchNotifications("open");
      setNotifications(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadInsights() {
    try {
      const data = await fetchInsights();
      setInsights(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function checkAuthStatus() {
    try {
      const res = await fetch(`${API_URL}/auth/status`, {
        credentials: "include",
      });
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      window.location.href = "/";
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCompleteNotification(id: string) {
    try {
      await completeNotification(id);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDismissNotification(id: string) {
    try {
      await dismissNotification(id);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSnoozeNotification(id: string) {
    try {
      await snoozeNotification(id);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDismissInsight(id: string) {
    try {
      await dismissInsight(id);
      loadInsights();
    } catch (err) {
      console.error(err);
    }
  }

  async function pollSyncStatus(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/sync-status/${jobId}`, {
          credentials: "include",
        });
        const data = await res.json();
        setSyncStatus(data.status);

        if (data.status === "complete") {
          clearInterval(interval);
          setSyncing(false);
          setSyncStatus("");
          loadNotifications();
          loadInsights();
        }
      } catch {
        clearInterval(interval);
        setSyncing(false);
      }
    }, 2000);
  }

  async function handleRefreshInbox() {
    try {
      setSyncing(true);
      const res = await fetch(`${API_URL}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      pollSyncStatus(data.job_id);
    } catch {
      setSyncing(false);
    }
  }

  function navigate(view: View) {
    setActiveView(view);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      loadInsights();
      loadMe();
    }
  }, [isAuthenticated]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="animate-spin text-indigo-400" size={20} />
          <span>Authenticating…</span>
        </div>
      </div>
    );
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen bg-zinc-950 text-white px-4 md:px-6 py-10 overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-indigo-600/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-20 right-0 w-[28rem] h-[28rem] rounded-full bg-violet-600/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative max-w-6xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-indigo-400/10 shadow-[0_0_24px_-6px_rgba(129,140,248,0.6)]">
                <Mail className="text-indigo-400" size={28} />
              </div>
              <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-[-0.03em]">
                Beacon AI Assistant
              </h1>
            </div>

            <h2 className="text-3xl md:text-5xl font-semibold leading-tight mb-6 max-w-5xl tracking-[-0.02em]">
              An AI executive assistant for your inbox — not another
              email organizer.
            </h2>

            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl">
              Beacon reads your inbox and tells you what actually deserves your
              attention today — who's waiting on you, what's due, what changed —
              with plain-language reasoning behind every item. Ask it anything
              about your inbox, and it syncs automatically so it's always current.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
            {[
              {
                color: "text-red-400",
                bg: "bg-red-400/10",
                glow: "shadow-[0_0_20px_-6px_rgba(248,113,113,0.5)]",
                icon: AlertTriangle,
                title: "What Deserves Your Attention",
                desc: "A daily briefing of high-priority items and upcoming deadlines — each with a plain-language reason, not just a category label.",
              },
              {
                color: "text-violet-400",
                bg: "bg-violet-400/10",
                glow: "shadow-[0_0_20px_-6px_rgba(167,139,250,0.5)]",
                icon: Sparkles,
                title: "AI Insights",
                desc: "Relationship intelligence surfaced automatically: threads you haven't replied to, senders emailing you repeatedly, recurring bills that changed.",
              },
              {
                color: "text-indigo-400",
                bg: "bg-indigo-400/10",
                glow: "shadow-[0_0_20px_-6px_rgba(129,140,248,0.5)]",
                icon: Search,
                title: "Semantic Search",
                desc: "Find anything in your inbox by meaning, not exact keywords — search the way you'd actually describe what you're looking for.",
              },
              {
                color: "text-cyan-400",
                bg: "bg-cyan-400/10",
                glow: "shadow-[0_0_20px_-6px_rgba(34,211,238,0.5)]",
                icon: MessageCircleQuestion,
                title: "Ask My Inbox",
                desc: "Ask a natural-language question and get a direct answer, sourced from the emails that actually contain it.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-zinc-900/60 ring-1 ring-zinc-800 hover:ring-zinc-700 transition-all duration-200 hover:-translate-y-0.5 rounded-2xl p-5 md:p-6"
              >
                <div className={`inline-flex p-2 rounded-xl mb-3 ${item.bg} ${item.glow}`}>
                  <item.icon size={18} className={item.color} />
                </div>
                <h3 className="font-semibold text-lg mb-2 tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              onClick={() => (window.location.href = `${API_URL}/auth/login`)}
              className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-400 transition-all duration-200 px-8 py-4 rounded-2xl text-lg font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-400/30"
            >
              Connect Gmail
            </button>

            <button
              onClick={() => setShowPrivacy(true)}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition underline underline-offset-4 decoration-zinc-700"
            >
              Privacy &amp; Data Use
            </button>
          </div>
        </div>

        {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      </div>
    );
  }

  // ── Authenticated app ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex overflow-x-hidden">
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex w-72 border-r border-zinc-800/80 bg-zinc-900/30 p-6 flex-col shrink-0">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-indigo-400/10 shadow-[0_0_18px_-6px_rgba(129,140,248,0.6)]">
              <Mail className="text-indigo-400" size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-[-0.01em]">Beacon AI</h1>
          </div>
          <p className="text-sm text-zinc-500">AI-powered inbox intelligence</p>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                activeView === id
                  ? "bg-zinc-800/80 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              {activeView === id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-400 shadow-[0_0_10px_1px_rgba(129,140,248,0.8)]" />
              )}
              <Icon size={18} className={activeView === id ? "text-indigo-400" : ""} />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800/80">
          <p className="text-xs text-zinc-500 mb-1">Logged in as</p>
          <p className="text-sm font-medium break-words">{userName}</p>
        </div>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 w-72 bg-zinc-900 border-r border-zinc-800 z-50 flex flex-col p-6 transform transition-transform duration-300 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-400/10 shadow-[0_0_18px_-6px_rgba(129,140,248,0.6)]">
              <Mail className="text-indigo-400" size={20} />
            </div>
            <span className="font-bold text-lg tracking-[-0.01em]">Beacon AI</span>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                activeView === id
                  ? "bg-zinc-800/80 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              {activeView === id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-400 shadow-[0_0_10px_1px_rgba(129,140,248,0.8)]" />
              )}
              <Icon size={18} className={activeView === id ? "text-indigo-400" : ""} />
              {label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Logged in as</p>
          <p className="text-sm font-medium break-words">{userName}</p>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 rounded-lg hover:bg-zinc-800 transition"
            >
              <Menu size={20} />
            </button>

            <span className="font-semibold">
              {NAV_ITEMS.find((n) => n.id === activeView)?.label ?? "Beacon AI"}
            </span>

            {activeView === "dashboard" ? (
              <button
                onClick={handleRefreshInbox}
                disabled={syncing}
                className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 transition px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-sm shadow-lg shadow-indigo-500/25"
              >
                <RefreshCw
                  size={14}
                  className={syncing ? "animate-spin" : ""}
                />
                Sync
              </button>
            ) : (
              <div className="w-[72px]" />
            )}
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {activeView === "dashboard" && (
            <Dashboard
              notifications={notifications}
              insights={insights}
              syncing={syncing}
              syncStatus={syncStatus}
              userName={userName}
              onRefresh={handleRefreshInbox}
              onComplete={handleCompleteNotification}
              onDismiss={handleDismissNotification}
              onSnooze={handleSnoozeNotification}
              onDismissInsight={handleDismissInsight}
              onLogout={handleLogout}
            />
          )}

          {activeView === "search" && <SearchPanel />}

          {activeView === "completed" && <CompletedPage />}

          {activeView === "settings" && <SettingsPage />}
        </div>
      </div>
    </div>
  );
}

export default App;
