import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import type { Notification } from "../types/notification";
import { fetchNotifications, reopenNotification } from "../services/api";
import { getKindConfig } from "../constants/notificationKinds";
import NotificationCard from "./NotificationCard";
import Pagination from "./Pagination";

const PAGE_SIZE = 5;

export default function CompletedPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function loadCompleted() {
    setLoading(true);
    try {
      const data = await fetchNotifications("completed");
      setNotifications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReopen(id: string) {
    try {
      await reopenNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadCompleted();
  }, []);

  const kinds = [...new Set(notifications.map((n) => n.kind))];

  const pageSafe = Math.min(
    page,
    Math.max(1, Math.ceil(notifications.length / PAGE_SIZE))
  );
  const pageItems = notifications.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE
  );

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-emerald-400/10 shadow-[0_0_18px_-6px_rgba(52,211,153,0.5)]">
            <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.02em]">Completed</h2>
        </div>
        <p className="text-zinc-400 mb-8">
          {notifications.length} item{notifications.length !== 1 ? "s" : ""} completed
        </p>

        {/* Kind breakdown chips */}
        {notifications.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {kinds.map((kind) => {
              const cfg = getKindConfig(kind);
              const Icon = cfg.icon;
              const count = notifications.filter((n) => n.kind === kind).length;
              return (
                <span
                  key={kind}
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

        {!loading && notifications.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex p-4 rounded-2xl bg-zinc-900/60 ring-1 ring-zinc-800 mb-4">
              <CheckCircle2 size={32} className="text-zinc-700" />
            </div>
            <p className="text-zinc-400 text-lg font-medium">
              Nothing completed yet
            </p>
            <p className="text-zinc-600 text-sm mt-2">
              Mark items complete from the dashboard to see them here.
            </p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <>
            <div className="space-y-3">
              {pageItems.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  onOpen={() => {}}
                  onReopen={handleReopen}
                />
              ))}
            </div>
            <Pagination
              page={pageSafe}
              pageSize={PAGE_SIZE}
              total={notifications.length}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
