import { useEffect, useState } from "react";
import {
  RefreshCw,
  Clock3,
  Mail,
  AlertCircle,
} from "lucide-react";

import TaskCard from "./components/TaskCard";
import type { Task } from "./types/task";

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [syncing, setSyncing] = useState(false);

  const [syncStatus, setSyncStatus] = useState("");

  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null);

  async function checkAuthStatus() {
    try {
      const response = await fetch(
        "http://localhost:8000/auth/status",
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!data.authenticated) {
        window.location.href =
          "http://localhost:8000/auth/login";

        return;
      }

      setIsAuthenticated(true);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadTasks() {
    try {
      const response = await fetch(
        "http://localhost:8000/tasks",
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

  async function pollSyncStatus(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/sync-status/${jobId}`,
          {
            credentials: "include",
          }
        );

        const data = await response.json();

        setSyncStatus(data.status);

        if (data.status === "complete") {
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
    }, 2000);
  }

  async function handleRefreshInbox() {
    try {
      setSyncing(true);

      const response = await fetch(
        "http://localhost:8000/sync",
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
    }
  }, [isAuthenticated]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="animate-spin" size={20} />
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Mail className="text-blue-400" size={28} />

              <h1 className="text-3xl font-bold">
                Accountability Assistant
              </h1>
            </div>

            <p className="text-zinc-400">
              AI-powered inbox accountability dashboard
            </p>
          </div>

          <button
            onClick={handleRefreshInbox}
            disabled={syncing}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition px-5 py-3 rounded-xl flex items-center gap-2 font-medium"
          >
            <RefreshCw
              size={18}
              className={syncing ? "animate-spin" : ""}
            />

            {syncing
              ? "Syncing..."
              : "Refresh Inbox"}
          </button>
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
                {syncStatus.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <AlertCircle
                className="text-red-400"
                size={18}
              />

              <h2 className="font-semibold text-lg">
                You Owe
              </h2>
            </div>

            <div className="space-y-4">
              {tasks
                .filter(
                  (task) =>
                    task.category === "you_owe"
                )
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
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
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;