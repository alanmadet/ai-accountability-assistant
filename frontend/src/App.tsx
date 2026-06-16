import { useEffect, useState } from "react";

import {
  RefreshCw,
  Clock3,
  Mail,
  AlertCircle,
  LayoutDashboard,
  CheckCircle2,
  Settings,
  Search,
} from "lucide-react";

import TaskCard from "./components/TaskCard";
import SearchPanel from "./components/SearchPanel";
import type { Task } from "./types/task";


const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userName, setUserName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "search">(
    "dashboard"
  );

  async function loadMe() {
    try {
      const response = await fetch(
        `${API_URL}/me`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      setUserName(data.name);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleLogout() {
    try {
      await fetch(
        `${API_URL}/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      window.location.href = "/";
    } catch (error) {
      console.error(error);
    }
  }

  async function handleCompleteTask(
    taskId: string
  ) {
    try {
      await fetch(
        `${API_URL}/tasks/${taskId}/complete`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      loadTasks();
    } catch (error) {
      console.error(error);
    }
  }

  async function handleHideTask(
    taskId: string
  ) {
    try {
      await fetch(
        `${API_URL}/tasks/${taskId}/hide`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      loadTasks();
    } catch (error) {
      console.error(error);
    }
  }

  async function checkAuthStatus() {
    try {
      const response = await fetch(
        `${API_URL}/auth/status`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      setIsAuthenticated(
        data.authenticated
      );
    } catch (error) {
      console.error(error);

      setIsAuthenticated(false);
    }
  }

  async function loadTasks() {
    try {
      const response = await fetch(
        `${API_URL}/tasks`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      setTasks(data.tasks);
    } catch (error) {
      console.error(error);
    }
  }

  async function pollSyncStatus(
    jobId: string
  ) {
    const interval = setInterval(
      async () => {
        try {
          const response = await fetch(
            `${API_URL}/sync-status/${jobId}`,
            {
              credentials: "include",
            }
          );

          const data =
            await response.json();

          setSyncStatus(data.status);

          if (
            data.status === "complete"
          ) {
            clearInterval(interval);

            setSyncing(false);

            setSyncStatus("");

            loadTasks();
          }
        } catch (error) {
          console.error(error);

          clearInterval(interval);

          setSyncing(false);
        }
      },
      2000
    );
  }

  async function handleRefreshInbox() {
    try {
      setSyncing(true);

      const response = await fetch(
        `${API_URL}/sync`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json();

      pollSyncStatus(data.job_id);
    } catch (error) {
      console.error(error);

      setSyncing(false);
    }
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

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw
            className="animate-spin"
            size={20}
          />

          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    function handleLogin() {
      window.location.href =
        `${API_URL}/auth/login`;
    }

    return (
      <div className="min-h-screen bg-zinc-950 text-white px-4 md:px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <Mail
                className="text-blue-400"
                size={32}
              />

              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                Beacon AI Assistant
              </h1>
            </div>

            <h2 className="text-3xl md:text-5xl font-semibold leading-tight mb-6 max-w-5xl">
              Your inbox already contains
              your obligations, follow-ups,
              deadlines, and opportunities.
            </h2>

            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl">
              Beacon AI Assistant uses AI to
              organize your inbox into
              actionable categories like
              replies, waiting-on items,
              urgent deadlines, and important
              opportunities worth reviewing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle
                  className="text-red-400"
                  size={20}
                />

                <h3 className="font-semibold text-lg">
                  Needs Reply
                </h3>
              </div>

              <p className="text-zinc-400 leading-relaxed">
                Surface emails requiring
                action, responses,
                commitments, or follow-ups
                from you.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <Clock3
                  className="text-yellow-400"
                  size={20}
                />

                <h3 className="font-semibold text-lg">
                  Waiting On
                </h3>
              </div>

              <p className="text-zinc-400 leading-relaxed">
                Track unresolved
                commitments, external
                dependencies, and pending
                responses from others.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <RefreshCw
                  className="text-blue-400"
                  size={20}
                />

                <h3 className="font-semibold text-lg">
                  Time Sensitive
                </h3>
              </div>

              <p className="text-zinc-400 leading-relaxed">
                Highlight deadlines, aging
                threads, urgent reminders,
                and time-critical
                obligations.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <Mail
                  className="text-green-400"
                  size={20}
                />

                <h3 className="font-semibold text-lg">
                  Worth Reviewing
                </h3>
              </div>

              <p className="text-zinc-400 leading-relaxed">
                Surface potentially valuable
                opportunities like
                promotions, financial
                alerts, travel deals, and
                important updates.
              </p>
            </div>
          </div>

          <button
            onClick={handleLogin}
            className="w-full md:w-auto bg-blue-500 hover:bg-blue-600 transition px-8 py-4 rounded-2xl text-lg font-semibold"
          >
            Connect Gmail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex overflow-x-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-72 border-r border-zinc-800 bg-zinc-900/50 p-6 flex-col">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Mail
              className="text-blue-400"
              size={28}
            />

            <h1 className="text-xl font-bold">
              Beacon AI Assistant
            </h1>
          </div>

          <p className="text-sm text-zinc-400">
            AI-powered inbox intelligence
          </p>
        </div>

        <nav className="space-y-2">
          <button
            onClick={() => setActiveView("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
              activeView === "dashboard"
                ? "bg-zinc-800 text-white"
                : "hover:bg-zinc-800 text-zinc-300"
            }`}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>

          <button
            onClick={() => setActiveView("search")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
              activeView === "search"
                ? "bg-zinc-800 text-white"
                : "hover:bg-zinc-800 text-zinc-300"
            }`}
          >
            <Search size={18} />
            Search
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition text-zinc-300">
            <CheckCircle2 size={18} />
            Completed
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition text-zinc-300">
            <Settings size={18} />
            Settings
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <p className="text-sm text-zinc-400">
            Logged in as
          </p>

          <p className="mt-1 font-medium break-words">
            {userName}
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {/* Mobile Top Bar */}
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
          <div className="p-4 flex items-center justify-between gap-3">
            <h1 className="font-semibold text-lg">
              Beacon AI
            </h1>

            {activeView === "dashboard" && (
              <button
                onClick={handleRefreshInbox}
                disabled={syncing}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition px-4 py-2 rounded-xl flex items-center gap-2 text-sm"
              >
                <RefreshCw
                  size={16}
                  className={syncing ? "animate-spin" : ""}
                />
                Refresh
              </button>
            )}
          </div>
        </div>

        {activeView === "search" ? (
          <SearchPanel />
        ) : (
        <div className="p-4 md:p-8 pb-24 md:pb-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
              <div className="min-w-0">
                <h1 className="text-3xl md:text-4xl font-bold break-words">
                  Hello {userName} 👋
                </h1>

                <p className="text-zinc-400 mt-2 text-base md:text-lg">
                  AI-powered inbox
                  accountability dashboard
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <button
                  onClick={handleLogout}
                  className="bg-zinc-800 hover:bg-zinc-700 transition px-4 py-3 rounded-xl text-sm w-full sm:w-auto"
                >
                  Logout
                </button>

                <button
                  onClick={handleRefreshInbox}
                  disabled={syncing}
                  className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-medium w-full sm:w-auto"
                >
                  <RefreshCw
                    size={18}
                    className={
                      syncing
                        ? "animate-spin"
                        : ""
                    }
                  />

                  {syncing
                    ? "Syncing..."
                    : "Refresh Inbox"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-400 text-sm mb-2">
                  Active Items
                </p>

                <p className="text-3xl font-bold">
                  {tasks.length}
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-400 text-sm mb-2">
                  Needs Reply
                </p>

                <p className="text-3xl font-bold">
                  {
                    tasks.filter(
                      (task) =>
                        task.category ===
                        "needs_reply"
                    ).length
                  }
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-400 text-sm mb-2">
                  Waiting On
                </p>

                <p className="text-3xl font-bold">
                  {
                    tasks.filter(
                      (task) =>
                        task.category ===
                        "waiting_on"
                    ).length
                  }
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-400 text-sm mb-2">
                  Time Sensitive
                </p>

                <p className="text-3xl font-bold">
                  {
                    tasks.filter(
                      (task) =>
                        task.category ===
                        "time_sensitive"
                    ).length
                  }
                </p>
              </div>
            </div>

            {syncStatus && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 flex items-center gap-3">
                <Clock3
                  className="text-yellow-400"
                  size={18}
                />

                <div>
                  <p className="font-medium">
                    Sync Status
                  </p>

                  <p className="text-sm text-zinc-400 capitalize">
                    {syncStatus.replace(
                      /_/g,
                      " "
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <AlertCircle
                    className="text-red-400"
                    size={18}
                  />

                  <h2 className="font-semibold text-lg">
                    Needs Reply
                  </h2>
                </div>

                <div className="space-y-4">
                  {tasks
                    .filter(
                      (task) =>
                        task.category ===
                        "needs_reply"
                    )
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={
                          handleCompleteTask
                        }
                        onHide={
                          handleHideTask
                        }
                      />
                    ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Clock3
                    className="text-yellow-400"
                    size={18}
                  />

                  <h2 className="font-semibold text-lg">
                    Waiting On
                  </h2>
                </div>

                <div className="space-y-4">
                  {tasks
                    .filter(
                      (task) =>
                        task.category ===
                        "waiting_on"
                    )
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={
                          handleCompleteTask
                        }
                        onHide={
                          handleHideTask
                        }
                      />
                    ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <RefreshCw
                    className="text-blue-400"
                    size={18}
                  />

                  <h2 className="font-semibold text-lg">
                    Time Sensitive
                  </h2>
                </div>

                <div className="space-y-4">
                  {tasks
                    .filter(
                      (task) =>
                        task.category ===
                        "time_sensitive"
                    )
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={
                          handleCompleteTask
                        }
                        onHide={
                          handleHideTask
                        }
                      />
                    ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Mail
                    className="text-green-400"
                    size={18}
                  />

                  <h2 className="font-semibold text-lg">
                    Worth Reviewing
                  </h2>
                </div>

                <div className="space-y-4">
                  {tasks
                    .filter(
                      (task) =>
                        task.category ===
                        "worth_reviewing"
                    )
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={
                          handleCompleteTask
                        }
                        onHide={
                          handleHideTask
                        }
                      />
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Mobile Bottom Tab Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950 flex">
          <button
            onClick={() => setActiveView("dashboard")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition ${
              activeView === "dashboard" ? "text-white" : "text-zinc-500"
            }`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>

          <button
            onClick={() => setActiveView("search")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition ${
              activeView === "search" ? "text-white" : "text-zinc-500"
            }`}
          >
            <Search size={20} />
            Search
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;