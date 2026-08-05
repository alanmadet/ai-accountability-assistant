import { PenLine, Mail, Clock3, X, BellOff, CalendarPlus } from "lucide-react";

import type { Notification } from "../types/notification";
import { getKindConfig } from "../constants/notificationKinds";
import { formatDeadline, gmailUrl, googleCalendarUrl } from "../utils/format";

type Props = {
  notification: Notification;
  onOpen: (notification: Notification) => void;
  onDraftReply?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onReopen?: (id: string) => void;
};

function NotificationCard({
  notification,
  onOpen,
  onDraftReply,
  onSnooze,
  onDismiss,
  onReopen,
}: Props) {
  const config = getKindConfig(notification.kind);
  const Icon = config.icon;
  const deadlineLabel = formatDeadline(notification.deadline);
  const emailUrl = gmailUrl(notification.gmail_message_id);
  const canDraftReply = notification.recommended_actions.includes("draft_reply");
  const calendarUrl = notification.recommended_actions.includes("add_to_calendar")
    ? googleCalendarUrl(notification.title, notification.deadline, notification.summary)
    : null;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div
      onClick={() => onOpen(notification)}
      className="group relative bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 min-w-0"
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-xl shrink-0 ${config.bg} ${config.glow} transition-shadow duration-200`}
        >
          <Icon size={16} className={config.color} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="font-medium text-sm sm:text-base leading-snug break-words tracking-[-0.01em]">
              {notification.title}
            </p>

            {deadlineLabel && (
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-zinc-800/80 ring-1 ring-zinc-700/60 text-zinc-300 whitespace-nowrap">
                {deadlineLabel}
              </span>
            )}
          </div>

          {notification.reason && (
            <p className="text-sm text-zinc-400 leading-relaxed break-words mb-3">
              {notification.reason}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canDraftReply && onDraftReply && (
              <button
                onClick={(e) => {
                  stop(e);
                  onDraftReply(notification.id);
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20 hover:bg-indigo-500/25 hover:ring-indigo-500/40 transition"
              >
                <PenLine size={12} />
                Draft Reply
              </button>
            )}

            {emailUrl && (
              <a
                href={emailUrl}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
              >
                <Mail size={12} />
                {config.openLabel}
              </a>
            )}

            {calendarUrl && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
              >
                <CalendarPlus size={12} />
                Add to Calendar
              </a>
            )}

            {notification.unsubscribe_url && (
              <a
                href={notification.unsubscribe_url}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
              >
                <BellOff size={12} />
                Unsubscribe
              </a>
            )}

            {onReopen ? (
              <button
                onClick={(e) => {
                  stop(e);
                  onReopen(notification.id);
                }}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
              >
                Reopen
              </button>
            ) : (
              <>
                {onSnooze && (
                  <button
                    onClick={(e) => {
                      stop(e);
                      onSnooze(notification.id);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
                  >
                    <Clock3 size={12} />
                    Snooze
                  </button>
                )}

                {onDismiss && (
                  <button
                    onClick={(e) => {
                      stop(e);
                      onDismiss(notification.id);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800/70 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 transition ml-auto"
                  >
                    <X size={12} />
                    Dismiss
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificationCard;
