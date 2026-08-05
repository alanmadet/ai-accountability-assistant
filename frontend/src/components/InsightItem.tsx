import { useState } from "react";
import { Sparkles, X } from "lucide-react";

import type { Insight } from "../types/notification";

type Props = {
  insight: Insight;
  onDismiss: (id: string) => void;
};

export default function InsightItem({ insight, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group flex items-start gap-3 py-2.5">
      <div className="mt-0.5 p-1 rounded-md bg-violet-400/10 shadow-[0_0_14px_-6px_rgba(167,139,250,0.55)] shrink-0">
        <Sparkles size={12} className="text-violet-400" />
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="min-w-0 flex-1 text-left"
        disabled={!insight.description}
      >
        <p className="text-sm text-zinc-200 leading-relaxed break-words">
          {insight.title}
        </p>
        {expanded && insight.description && (
          <p className="text-xs text-zinc-500 leading-relaxed mt-1 break-words">
            {insight.description}
          </p>
        )}
      </button>

      <button
        onClick={() => onDismiss(insight.id)}
        className="opacity-0 group-hover:opacity-100 transition p-1 rounded-md hover:bg-zinc-800 shrink-0"
      >
        <X size={12} className="text-zinc-500" />
      </button>
    </div>
  );
}
