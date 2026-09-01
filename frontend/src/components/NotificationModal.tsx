import { useEffect, useState } from "react";
import { X, Mail, Clock3, Check, Copy, PenLine, Loader2, BellOff, CalendarPlus } from "lucide-react";

import type { Notification, EmailDetail } from "../types/notification";
import { getKindConfig } from "../constants/notificationKinds";
import { formatDeadline, gmailUrl, googleCalendarUrl } from "../utils/format";
import { fetchEmail, draftReply } from "../services/api";

type Props = {
  notification: Notification;
  onClose: () => void;
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
  onDismiss: (id: string) => void;
};

export default function NotificationModal({
  notification,
  onClose,
  onComplete,
  onSnooze,
  onDismiss,
}: Props) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [draft, setDraft] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = getKindConfig(notification.kind);
  const Icon = config.icon;
  const deadlineLabel = formatDeadline(notification.deadline);
  const emailUrl = gmailUrl(
    notification.source_email_id,
    notification.gmail_message_id,
    notification.rfc822_message_id
  );
  const canDraftReply = notification.recommended_actions.includes("draft_reply");
  const calendarUrl = notification.recommended_actions.includes("add_to_calendar")
    ? googleCalendarUrl(notification.title, notification.deadline, notification.summary)
    : null;

  useEffect(() => {
    setEmail(null);
    setDraft("");
    setCopied(false);

    if (!notification.source_email_id) return;

    setLoadingEmail(true);
    fetchEmail(notification.source_email_id)
      .then(setEmail)
      .catch(() => setEmail(null))
      .finally(() => setLoadingEmail(false));
  }, [notification]);

  async function handleDraftReply() {
    setLoadingDraft(true);
    try {
      const text = await draftReply(notification.id);
      setDraft(text);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 ring-1 ring-white/10 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-zinc-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${config.bg} ${config.glow}`}>
              <Icon size={18} className={config.color} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold break-words tracking-[-0.01em]">
                {notification.title}
              </h3>
              {notification.confidence != null && (
                <p className="text-xs text-zinc-500 mt-1">
                  {notification.confidence}% confidence
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition shrink-0"
          >
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {notification.summary && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Summary
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {notification.summary}
              </p>
            </div>
          )}

          {notification.reason && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Why this matters
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {notification.reason}
              </p>
            </div>
          )}

          {deadlineLabel && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Deadline
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-lg bg-zinc-800/80 ring-1 ring-zinc-700/60 text-zinc-200">
                <Clock3 size={13} />
                {deadlineLabel}
              </span>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
              Suggested Actions
            </p>
            <div className="flex flex-wrap gap-2">
              {canDraftReply && (
                <button
                  onClick={handleDraftReply}
                  disabled={loadingDraft}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20 hover:bg-indigo-500/25 hover:ring-indigo-500/40 transition disabled:opacity-50"
                >
                  {loadingDraft ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <PenLine size={14} />
                  )}
                  Draft Reply
                </button>
              )}

              <button
                onClick={() => onComplete(notification.id)}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20 hover:bg-emerald-500/25 hover:ring-emerald-500/40 transition"
              >
                <Check size={14} />
                Mark Complete
              </button>

              <button
                onClick={() => onSnooze(notification.id)}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
              >
                <Clock3 size={14} />
                Snooze
              </button>

              {emailUrl && (
                <a
                  href={emailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
                >
                  <Mail size={14} />
                  Open Original Email
                </a>
              )}

              {calendarUrl && (
                <a
                  href={calendarUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
                >
                  <CalendarPlus size={14} />
                  Add to Calendar
                </a>
              )}

              {notification.unsubscribe_url && (
                <a
                  href={notification.unsubscribe_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80 transition"
                >
                  <BellOff size={14} />
                  Unsubscribe
                </a>
              )}

              <button
                onClick={() => onDismiss(notification.id)}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800/70 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 transition"
              >
                <X size={14} />
                Dismiss
              </button>
            </div>
          </div>

          {draft && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  AI Draft Reply
                </p>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  <Copy size={12} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap bg-zinc-800/50 ring-1 ring-zinc-700/50 rounded-xl p-4">
                {draft}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Original Email
            </p>

            {loadingEmail && (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
                <Loader2 size={14} className="animate-spin" />
                Loading…
              </div>
            )}

            {!loadingEmail && email && (
              <div className="bg-zinc-800/50 ring-1 ring-zinc-700/50 rounded-xl p-4">
                <p className="text-sm font-medium break-words">
                  {email.subject || "(no subject)"}
                </p>
                <p className="text-xs text-zinc-400 mt-1 mb-3">{email.sender}</p>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
                  {email.snippet || email.body}
                </p>
              </div>
            )}

            {!loadingEmail && !email && (
              <p className="text-sm text-zinc-600 italic">
                Original email not available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
