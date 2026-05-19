import { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: number;
  icon: LucideIcon;
}

export default function SummaryCard({
  title,
  value,
  icon: Icon,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm min-w-0">
      <div className="flex items-center justify-between gap-3">
        
        <div className="text-zinc-500 text-sm md:text-base break-words min-w-0">
          {title}
        </div>

        <Icon className="w-5 h-5 text-zinc-400 shrink-0" />

      </div>

      <div className="text-3xl md:text-4xl font-bold mt-4 break-words">
        {value}
      </div>
    </div>
  );
}

