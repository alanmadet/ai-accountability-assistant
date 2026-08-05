import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 mt-4">
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => onChange(safePage - 1)}
          disabled={safePage <= 1}
          className="inline-flex items-center justify-center gap-1 text-xs px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg bg-zinc-900/60 ring-1 ring-zinc-800 text-zinc-400 hover:text-zinc-200 hover:ring-zinc-700 disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:ring-zinc-800 transition"
        >
          <ChevronLeft size={13} />
          Prev
        </button>

        <span className="text-xs text-zinc-500 tabular-nums">
          Page {safePage} of {totalPages}
        </span>

        <button
          onClick={() => onChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="inline-flex items-center justify-center gap-1 text-xs px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg bg-zinc-900/60 ring-1 ring-zinc-800 text-zinc-400 hover:text-zinc-200 hover:ring-zinc-700 disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:ring-zinc-800 transition"
        >
          Next
          <ChevronRight size={13} />
        </button>
      </div>

      <p className="sm:hidden text-[11px] text-zinc-600">Swipe left or right to change pages</p>
    </div>
  );
}
