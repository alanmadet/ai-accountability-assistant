import { LucideIcon } from "lucide-react"

interface Props {
  title: string
  value: number
  icon: LucideIcon
}

export default function SummaryCard({
  title,
  value,
  icon: Icon
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-zinc-500">
          {title}
        </div>

        <Icon className="w-5 h-5 text-zinc-400" />
      </div>

      <div className="text-4xl font-bold mt-4">
        {value}
      </div>
    </div>
  )
}