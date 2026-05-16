import { Task } from "../types/task"

interface Props {
  task: Task
}

export default function TaskCard({ task }: Props) {

  const priorityColor = {
    low: "bg-zinc-100 text-zinc-600",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-red-100 text-red-600"
  }

  return (
    <div className="border border-zinc-200 rounded-xl p-4 hover:border-zinc-400 transition cursor-pointer bg-white">

      <div className="flex items-start justify-between">

        <div>
          <div className="font-medium text-zinc-900">
            {task.title}
          </div>

          <div className="text-sm text-zinc-500 mt-1">
            {task.status}
          </div>
        </div>

        <div
          className={`text-xs px-2 py-1 rounded-full ${priorityColor[task.priority]}`}
        >
          {task.priority}
        </div>

      </div>

    </div>
  )
}