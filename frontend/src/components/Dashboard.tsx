import { useState, useMemo } from "react";
import { RefreshCw, Clock3, SlidersHorizontal, ArrowUpDown } from "lucide-react";

import TaskCard from "./TaskCard";
import type { Task } from "../types/task";
import {
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
  getCategoryConfig,
} from "../constants/categories";

const API_URL = import.meta.env.VITE_API_URL;

const NEW_CATEGORIES = CATEGORY_ORDER.slice(0, 8);

interface Props {
  tasks: Task[];
  syncing: boolean;
  syncStatus: string;
  userName: string;
  onRefresh: () => void;
  onComplete: (taskId: string) => void;
  onHide: (taskId: string) => void;
  onLogout: () => void;
}

export default function Dashboard({
  tasks,
  syncing,
  syncStatus,
  userName,
  onRefresh,
  onComplete,
  onHide,
  onLogout,
}: Props) {
  const allCategories = useMemo(() => {
    const inTasks = new Set(tasks.map((t) => t.category));
    const ordered = CATEGORY_ORDER.filter(
      (c) => NEW_CATEGORIES.includes(c) || inTasks.has(c)
    );
    return ordered;
  }, [tasks]);

  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set()
  );
  const [sortByCount, setSortByCount] = useState(false);

  function toggleCategory(cat: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const sortedCategories = useMemo(() => {
    const visible = allCategories.filter((c) => !hiddenCategories.has(c));
    if (!sortByCount) return visible;
    return [...visible].sort(
      (a, b) =>
        tasks.filter((t) => t.category === b).length -
        tasks.filter((t) => t.category === a).length
    );
  }, [allCategories, hiddenCategories, sortByCount, tasks]);

  const syncStatusLabel: Record<string, string> = {
    fetching_emails: "Fetching emails…",
    filtering_threads: "Filtering threads…",
    extracting_tasks: "Extracting tasks…",
    generating_summary: "Generating summary…",
    complete: "Sync complete",
  };

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold break-words">
              Hello {userName} 👋
            </h1>
            <p className="text-zinc-400 mt-1 text-base md:text-lg">
              AI-powered inbox accountability dashboard
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <button
              onClick={onLogout}
              className="bg-zinc-800 hover:bg-zinc-700 transition px-4 py-3 rounded-xl text-sm w-full sm:w-auto"
            >
              Logout
            </button>

            <button
              onClick={onRefresh}
              disabled={syncing}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-medium w-full sm:w-auto"
            >
              <RefreshCw
                size={18}
                className={syncing ? "animate-spin" : ""}
              />
              {syncing ? "Syncing…" : "Refresh Inbox"}
            </button>
          </div>
        </div>

        {/* Sync status */}
        {syncStatus && syncStatus !== "complete" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Clock3 className="text-yellow-400 shrink-0" size={18} />
            <p className="text-sm text-zinc-300">
              {syncStatusLabel[syncStatus] ?? syncStatus.replace(/_/g, " ")}
            </p>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-400 text-sm mb-2">Active Items</p>
            <p className="text-3xl font-bold">{tasks.length}</p>
          </div>

          {(["follow_ups_needed", "renewals_deadlines", "financial_items"] as const).map(
            (cat) => {
              const cfg = getCategoryConfig(cat);
              const Icon = cfg.icon;
              return (
                <div
                  key={cat}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className={cfg.color} />
                    <p className="text-zinc-400 text-sm">{cfg.label}</p>
                  </div>
                  <p className="text-3xl font-bold">
                    {tasks.filter((t) => t.category === cat).length}
                  </p>
                </div>
              );
            }
          )}
        </div>

        {/* Filter + sort bar */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
          <div className="flex flex-wrap gap-2 flex-1">
            {allCategories.map((cat) => {
              const cfg = getCategoryConfig(cat);
              const Icon = cfg.icon;
              const hidden = hiddenCategories.has(cat);
              const count = tasks.filter((t) => t.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    hidden
                      ? "bg-zinc-900 border-zinc-700 text-zinc-500"
                      : `${cfg.bg} ${cfg.border} ${cfg.color}`
                  }`}
                >
                  <Icon size={11} />
                  {cfg.label}
                  <span
                    className={`ml-0.5 ${hidden ? "text-zinc-600" : "opacity-70"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setSortByCount((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition shrink-0 ${
              sortByCount
                ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <ArrowUpDown size={13} />
            {sortByCount ? "Sorted by count" : "Sort by count"}
          </button>
        </div>

        {/* Category sections grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sortedCategories.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat] ?? getCategoryConfig(cat);
            const Icon = cfg.icon;
            const catTasks = tasks.filter((t) => t.category === cat);

            return (
              <div
                key={cat}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon size={17} className={cfg.color} />
                    <h2 className="font-semibold">{cfg.label}</h2>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                  >
                    {catTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {catTasks.length === 0 ? (
                    <p className="text-sm text-zinc-600 italic">No items</p>
                  ) : (
                    catTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onComplete={onComplete}
                        onHide={onHide}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
