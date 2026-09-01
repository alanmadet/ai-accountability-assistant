import { useMemo, useState } from "react";
import {
  RefreshCw,
  Clock3,
  AlertTriangle,
  CalendarClock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import NotificationCard from "./NotificationCard";
import NotificationModal from "./NotificationModal";
import InsightItem from "./InsightItem";
import Pagination from "./Pagination";
import type { Notification, Insight } from "../types/notification";
import { greeting } from "../utils/format";
import { usePagedSection } from "../hooks/usePagedSection";

const PAGE_SIZE = 5;

interface Props {
  notifications: Notification[];
  insights: Insight[];
  syncing: boolean;
  syncStatus: string;
  userName: string;
  onRefresh: () => void;
  onComplete: (id: string) => void;
  onCompleteAll: (ids: string[]) => Promise<void>;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onDismissInsight: (id: string) => void;
  onLogout: () => void;
}

export default function Dashboard({
  notifications,
  insights,
  syncing,
  syncStatus,
  userName,
  onRefresh,
  onComplete,
  onCompleteAll,
  onDismiss,
  onSnooze,
  onDismissInsight,
  onLogout,
}: Props) {
  const [selected, setSelected] = useState<Notification | null>(null);

  const highPriority = useMemo(
    () => notifications.filter((n) => n.urgency === "high_priority"),
    [notifications]
  );

  const upcoming = useMemo(
    () => notifications.filter((n) => n.urgency === "upcoming"),
    [notifications]
  );

  const recent = useMemo(
    () =>
      [...notifications]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
        )
        .slice(0, 5),
    [notifications]
  );

  const hp = usePagedSection(highPriority, PAGE_SIZE);
  const up = usePagedSection(upcoming, PAGE_SIZE);
  const ai = usePagedSection(insights, PAGE_SIZE);

  const syncStatusLabel: Record<string, string> = {
    fetching_emails: "Fetching emails…",
    filtering_threads: "Filtering threads…",
    extracting_tasks: "Analyzing emails…",
    generating_summary: "Generating insights…",
    complete: "Sync complete",
  };

  const firstName = userName?.split(" ")[0] || "there";
  const attentionCount = highPriority.length + upcoming.length;

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold break-words tracking-[-0.02em]">
              {greeting()}, {firstName}
            </h1>
            <p className="text-zinc-400 mt-1.5 text-base md:text-lg">
              {attentionCount > 0 ? (
                <>
                  You have{" "}
                  <span className="text-zinc-200 font-medium">
                    {attentionCount} item{attentionCount === 1 ? "" : "s"}
                  </span>{" "}
                  needing attention today.
                </>
              ) : (
                "You're all caught up."
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (notifications.length > 5 && !window.confirm(`Mark all ${notifications.length} visible items as complete?`)) return;
                  await onCompleteAll(notifications.map((item) => item.id));
                }}
                className="bg-zinc-900 ring-1 ring-zinc-800 hover:ring-zinc-700 transition px-4 py-3 rounded-xl text-sm w-full sm:w-auto"
              >
                Mark all complete
              </button>
            )}
            <button
              onClick={onLogout}
              className="bg-zinc-900 ring-1 ring-zinc-800 hover:ring-zinc-700 hover:bg-zinc-800/60 transition px-4 py-3 rounded-xl text-sm w-full sm:w-auto"
            >
              Logout
            </button>

            <button
              onClick={onRefresh}
              disabled={syncing}
              className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 transition-all duration-200 px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-medium w-full sm:w-auto shadow-lg shadow-indigo-500/25 hover:shadow-indigo-400/30"
            >
              <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Refresh Inbox"}
            </button>
          </div>
        </div>

        {/* Sync status */}
        {syncStatus && syncStatus !== "complete" && (
          <div className="bg-zinc-900/60 ring-1 ring-zinc-800 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Clock3 className="text-amber-400 shrink-0" size={18} />
            <p className="text-sm text-zinc-300">
              {syncStatusLabel[syncStatus] ?? syncStatus.replace(/_/g, " ")}
            </p>
          </div>
        )}

        {/* High Priority */}
        <section ref={hp.sectionRef} className="mb-8 scroll-mt-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-red-400/10 shadow-[0_0_16px_-6px_rgba(248,113,113,0.5)]">
              <AlertTriangle size={15} className="text-red-400" />
            </div>
            <h2 className="font-semibold text-lg tracking-[-0.01em]">High Priority</h2>
            {highPriority.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 ring-1 ring-red-400/20">
                {highPriority.length}
              </span>
            )}
          </div>

          {highPriority.length === 0 ? (
            <EmptyState text="Nothing urgent right now." />
          ) : (
            <>
              <div
                className="space-y-3"
                onTouchStart={hp.swipeHandlers.onTouchStart}
                onTouchEnd={hp.swipeHandlers.onTouchEnd}
              >
                {hp.pageItems.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onOpen={setSelected}
                    onDraftReply={(id) =>
                      setSelected(notifications.find((x) => x.id === id) ?? null)
                    }
                    onSnooze={onSnooze}
                    onDismiss={onDismiss}
                  />
                ))}
              </div>
              <Pagination
                page={hp.page}
                pageSize={PAGE_SIZE}
                total={highPriority.length}
                onChange={hp.goToPage}
              />
            </>
          )}
        </section>

        {/* Upcoming */}
        <section ref={up.sectionRef} className="mb-8 scroll-mt-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-cyan-400/10 shadow-[0_0_16px_-6px_rgba(34,211,238,0.5)]">
              <CalendarClock size={15} className="text-cyan-400" />
            </div>
            <h2 className="font-semibold text-lg tracking-[-0.01em]">Upcoming</h2>
            {upcoming.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 ring-1 ring-cyan-400/20">
                {upcoming.length}
              </span>
            )}
          </div>

          {upcoming.length === 0 ? (
            <EmptyState text="Nothing on the horizon." />
          ) : (
            <>
              <div
                className="space-y-3"
                onTouchStart={up.swipeHandlers.onTouchStart}
                onTouchEnd={up.swipeHandlers.onTouchEnd}
              >
                {up.pageItems.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onOpen={setSelected}
                    onDraftReply={(id) =>
                      setSelected(notifications.find((x) => x.id === id) ?? null)
                    }
                    onSnooze={onSnooze}
                    onDismiss={onDismiss}
                  />
                ))}
              </div>
              <Pagination
                page={up.page}
                pageSize={PAGE_SIZE}
                total={upcoming.length}
                onChange={up.goToPage}
              />
            </>
          )}
        </section>

        {/* AI Insights */}
        <section ref={ai.sectionRef} className="mb-8 scroll-mt-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-1.5 rounded-lg bg-violet-400/10 shadow-[0_0_16px_-6px_rgba(167,139,250,0.5)]">
              <Sparkles size={15} className="text-violet-400" />
            </div>
            <h2 className="font-semibold text-lg tracking-[-0.01em]">AI Insights</h2>
          </div>

          {insights.length === 0 ? (
            <EmptyState text="No patterns worth flagging yet." />
          ) : (
            <>
              <div
                className="bg-zinc-900/60 ring-1 ring-zinc-800 rounded-2xl px-5 divide-y divide-zinc-800/80"
                onTouchStart={ai.swipeHandlers.onTouchStart}
                onTouchEnd={ai.swipeHandlers.onTouchEnd}
              >
                {ai.pageItems.map((insight) => (
                  <InsightItem
                    key={insight.id}
                    insight={insight}
                    onDismiss={onDismissInsight}
                  />
                ))}
              </div>
              <Pagination
                page={ai.page}
                pageSize={PAGE_SIZE}
                total={insights.length}
                onChange={ai.goToPage}
              />
            </>
          )}
        </section>

        {/* Recent Notifications */}
        {recent.length > 0 && (
          <section>
            <h2 className="font-medium text-xs uppercase tracking-wide text-zinc-500 mb-3">
              Recent Notifications
            </h2>
            <div className="space-y-1.5">
              {recent.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelected(n)}
                  className="w-full text-left text-sm text-zinc-400 hover:text-zinc-200 transition truncate"
                >
                  {n.title}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {selected && (
        <NotificationModal
          notification={selected}
          onClose={() => setSelected(null)}
          onComplete={(id) => {
            onComplete(id);
            setSelected(null);
          }}
          onSnooze={(id) => {
            onSnooze(id);
            setSelected(null);
          }}
          onDismiss={(id) => {
            onDismiss(id);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-zinc-600 py-1">
      <CheckCircle2 size={15} className="text-zinc-700 shrink-0" />
      {text}
    </div>
  );
}
