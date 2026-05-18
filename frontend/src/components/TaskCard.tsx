import {
  Check,
  EyeOff,
} from "lucide-react";

import type { Task } from "../types/task";

type Props = {
  task: Task;

  onComplete: (
    taskId: string
  ) => void;

  onHide: (
    taskId: string
  ) => void;
};

function TaskCard({
  task,
  onComplete,
  onHide,
}: Props) {
  return (
    <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium mb-2">
            {task.title}
          </h3>

          <p className="text-sm text-zinc-400">
            {task.status}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              onComplete(task.id)
            }
            className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 transition"
          >
            <Check
              size={16}
              className="text-green-400"
            />
          </button>

          <button
            onClick={() =>
              onHide(task.id)
            }
            className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition"
          >
            <EyeOff
              size={16}
              className="text-zinc-300"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskCard;