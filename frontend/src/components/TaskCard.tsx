import { Check, EyeOff, RotateCcw } from "lucide-react";

import type { Task } from "../types/task";
import { getCategoryConfig } from "../constants/categories";

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-500/20 text-red-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-zinc-700 text-zinc-400",
};

type Props = {
  task: Task;
  onComplete?: (taskId: string) => void;
  onHide?: (taskId: string) => void;
  onReopen?: (taskId: string) => void;
};

function TaskCard({ task, onComplete, onHide, onReopen }: Props) {
  const config = getCategoryConfig(task.category);
  const Icon = config.icon;

  return (
    <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}
            >
              <Icon size={11} />
              {config.label}
            </span>

            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.low
              }`}
            >
              {task.priority}
            </span>
          </div>

          <p className="font-medium break-words text-sm sm:text-base leading-snug">
            {task.title}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onReopen && (
            <button
              onClick={() => onReopen(task.id)}
              title="Reopen"
              className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
            >
              <RotateCcw size={15} className="text-zinc-300" />
            </button>
          )}

          {onComplete && (
            <button
              onClick={() => onComplete(task.id)}
              title="Mark complete"
              className="p-2.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 transition"
            >
              <Check size={16} className="text-green-400" />
            </button>
          )}

          {onHide && (
            <button
              onClick={() => onHide(task.id)}
              title="Hide"
              className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
            >
              <EyeOff size={16} className="text-zinc-300" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskCard;
