import { useEffect, useState } from "react";

import {
  RefreshCw,
  Mail,
  LayoutDashboard,
  CheckCircle2,
  Settings,
  Search,
  Menu,
  X,
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import SearchPanel from "./components/SearchPanel";
import CompletedPage from "./components/CompletedPage";
import SettingsPage from "./components/SettingsPage";
import type { Task } from "./types/task";

const API_URL = import.meta.env.VITE_API_URL;

type View = "dashboard" | "search" | "completed" | "settings";

const NAV_ITEMS: { id: View; label: string; icon: typeof Mail }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "search", label: "Search", icon: Search },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "settings", label: "Settings", icon: Settings },
];

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userName, setUserName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function loadMe() {
    try {
      const res = await fetch(`${API_URL}/me`, { credentials: "include" });
      const data = await res.json();
      setUserName(data.name ?? "");
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTasks() {
    try {
      const res = await fetch(`${API_URL}/tasks`, { credentials: "include" });
      const data = await res.json();
      setTasks(data.tasks ?? []);
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

  async function handleCompleteTask(taskId: string) {
    try {
      await fetch(`${API_URL}/tasks/${taskId}/complete`, {
        method: "POST",
        credentials: "include",
      });
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleHideTask(taskId: string) {
    try {
      await fetch(`${API_URL}/tasks/${taskId}/hide`, {
        method: "POST",
        credentials: "include",
      });
      loadTasks();
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
          loadTasks();
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
      loadTasks();
      loadMe();
    }
  }, [isAuthenticated]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="animate-spin" size={20} />
          <span>Authenticating…</span>
        </div>
      </div>
    );
  }

  // ── Landing page ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white px-4 md:px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <Mail className="text-blue-400" size={32} />
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                Beacon AI Assistant
              </h1>
            </div>

            <h2 className="text-3xl md:text-5xl font-semibold leading-tight mb-6 max-w-5xl">
              Your inbox already contains your obligations, follow-ups,
              deadlines, and opportunities.
            </h2>

            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl">
              Beacon uses AI to organize your inbox into actionable categories —
              follow-ups, deadlines, financial items, travel, and more. It syncs
              automatically so your dashboard stays current.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
            {[
              {
                color: "text-red-400",
                title: "Follow-ups Needed",
                desc: "Surface emails you need to reply to or act on.",
              },
              {
                color: "text-yellow-400",
                title: "Renewals & Deadlines",
                desc: "Track expiring subscriptions, payments due, and approaching deadlines.",
              },
              {
                color: "text-green-400",
                title: "Financial Items",
                desc: "Statements, payments, reimbursements, and account alerts.",
              },
              {
                color: "text-amber-400",
                title: "Opportunities",
                desc: "Deals, rewards, and limited-time offers worth reviewing.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6"
              >
                <h3 className={`font-semibold text-lg mb-2 ${item.color}`}>
                  {item.title}
                </h3>
                <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => (window.location.href = `${API_URL}/auth/login`)}
            className="w-full md:w-auto bg-blue-500 hover:bg-blue-600 transition px-8 py-4 rounded-2xl text-lg font-semibold"
          >
            Connect Gmail
          </button>
        </div>
      </div>
    );
  }

  // ── Authenticated app ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex overflow-x-hidden">
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex w-72 border-r border-zinc-800 bg-zinc-900/50 p-6 flex-col shrink-0">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="text-blue-400" size={26} />
            <h1 className="text-xl font-bold">Beacon AI</h1>
          </div>
          <p className="text-sm text-zinc-400">AI-powered inbox intelligence</p>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-left ${
                activeView === id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
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
            <Mail className="text-blue-400" size={24} />
            <span className="font-bold text-lg">Beacon AI</span>
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition text-left ${
                activeView === id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
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
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-sm"
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
              tasks={tasks}
              syncing={syncing}
              syncStatus={syncStatus}
              userName={userName}
              onRefresh={handleRefreshInbox}
              onComplete={handleCompleteTask}
              onHide={handleHideTask}
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
