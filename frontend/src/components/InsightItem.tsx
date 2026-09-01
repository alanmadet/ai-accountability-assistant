import { useState } from "react";
import { Sparkles, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { sendInsightFeedback } from "../services/api";

import type { Insight } from "../types/notification";

type Props = {
  insight: Insight;
  onDismiss: (id: string) => void;
};

export default function InsightItem({ insight, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function feedback(useful: boolean) {
    await sendInsightFeedback(insight.id, useful);
    setFeedbackSent(true);
  }

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
        {expanded && !feedbackSent && (
          <span className="flex gap-2 mt-2">
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => { event.stopPropagation(); feedback(true); }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-400"
            ><ThumbsUp size={12} /> Useful</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => { event.stopPropagation(); feedback(false); }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400"
            ><ThumbsDown size={12} /> Not useful</span>
          </span>
        )}
        {expanded && feedbackSent && <span className="block text-xs text-zinc-600 mt-2">Thanks for the feedback.</span>}
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
