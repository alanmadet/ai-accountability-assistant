import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Loader2, ChevronDown, ChevronRight } from "lucide-react";

import type { Task } from "../types/task";
import { getCategoryConfig, CATEGORY_ORDER } from "../constants/categories";
import TaskCard from "./TaskCard";

const API_URL = import.meta.env.VITE_API_URL;

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  async function loadCompleted() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/tasks?completed=true`, {
        credentials: "include",
      });
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReopen(taskId: string) {
    try {
      await fetch(`${API_URL}/tasks/${taskId}/reopen`, {
        method: "POST",
        credentials: "include",
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error(err);
    }
  }

  function toggleCollapse(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  useEffect(() => {
    loadCompleted();
  }, []);

  const categoriesWithTasks = CATEGORY_ORDER.filter((cat) =>
    tasks.some((t) => t.category === cat)
  );

  // catch any categories not in CATEGORY_ORDER
  const extraCategories = [
    ...new Set(tasks.map((t) => t.category)),
  ].filter((c) => !CATEGORY_ORDER.includes(c));

  const allCats = [...categoriesWithTasks, ...extraCategories];

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 size={28} className="text-green-400 shrink-0" />
          <h2 className="text-2xl md:text-3xl font-bold">Completed Tasks</h2>
        </div>
        <p className="text-zinc-400 mb-8">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""} completed
        </p>

        {/* Category breakdown chips */}
        {tasks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {allCats.map((cat) => {
              const cfg = getCategoryConfig(cat);
              const Icon = cfg.icon;
              const count = tasks.filter((t) => t.category === cat).length;
              return (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.color}`}
                >
                  <Icon size={11} />
                  {cfg.label} · {count}
                </span>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 size={28} className="animate-spin mr-3" />
            Loading…
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="text-center py-20">
            <CheckCircle2
              size={48}
              className="text-zinc-700 mx-auto mb-4"
            />
            <p className="text-zinc-400 text-lg font-medium">
              Nothing completed yet
            </p>
            <p className="text-zinc-600 text-sm mt-2">
              Mark tasks complete from the dashboard to see them here.
            </p>
          </div>
        )}

        {!loading && allCats.length > 0 && (
          <div className="space-y-4">
            {allCats.map((cat) => {
              const cfg = getCategoryConfig(cat);
              const Icon = cfg.icon;
              const catTasks = tasks.filter((t) => t.category === cat);
              const isCollapsed = collapsedCategories.has(cat);

              return (
                <div
                  key={cat}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() => toggleCollapse(cat)}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className={cfg.color} />
                      <span className="font-semibold">{cfg.label}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                      >
                        {catTasks.length}
                      </span>
                    </div>

                    {isCollapsed ? (
                      <ChevronRight size={16} className="text-zinc-500" />
                    ) : (
                      <ChevronDown size={16} className="text-zinc-500" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="px-5 pb-5 space-y-3 border-t border-zinc-800 pt-4">
                      {catTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onReopen={handleReopen}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
