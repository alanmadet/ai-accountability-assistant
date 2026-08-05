export function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;

  const target = new Date(deadline);
  if (isNaN(target.getTime())) return null;

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffMs < 0) {
    const pastDays = Math.round(-diffDays);
    if (pastDays <= 1) return "Overdue";
    return `${pastDays} days overdue`;
  }

  if (diffHours < 24) {
    const hours = Math.max(1, Math.round(diffHours));
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (diffDays < 7) {
    return target.toLocaleDateString(undefined, { weekday: "long" });
  }

  return target.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeDays(iso: string | null): string | null {
  if (!iso) return null;

  const target = new Date(iso);
  if (isNaN(target.getTime())) return null;

  const now = new Date();
  const days = Math.floor(
    (now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function gmailUrl(
  gmailMessageId: string | null,
  rfc822MessageId?: string | null
): string | null {
  // Prefer a search on the RFC 822 Message-ID: this is a real Gmail search
  // operator, so it works whether the link opens in mobile Safari (web
  // client) or gets hijacked by the Gmail app via iOS Universal Links (the
  // app supports search natively; it doesn't run the web client's JS hash
  // router at all, so "#all/{id}"-style links silently land on the inbox
  // instead when opened through the app).
  if (rfc822MessageId) {
    // Not URL-encoded on purpose: Gmail's rfc822msgid search parses the
    // hash fragment itself and expects the raw "local@domain" form —
    // encodeURIComponent would turn "@" into "%40" and break the match.
    return `https://mail.google.com/mail/#search/rfc822msgid:${rfc822MessageId}`;
  }

  if (!gmailMessageId) return null;
  // No hardcoded "/u/0/" account slot — on a phone with multiple Google
  // accounts, slot 0 may not be the account Beacon is connected to, which
  // silently lands on that account's inbox instead of the message.
  return `https://mail.google.com/mail/#all/${gmailMessageId}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Floating (no "Z") timestamp: Google Calendar takes it as literal wall-clock
// time, matching how the deadline is already displayed elsewhere via local
// Date getters — avoids re-shifting a naive backend timestamp through UTC.
function toCalendarStamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function googleCalendarUrl(
  title: string,
  deadline: string | null,
  details?: string
): string | null {
  if (!deadline) return null;

  const start = new Date(deadline);
  if (isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarStamp(start)}/${toCalendarStamp(end)}`,
  });

  if (details) {
    params.set("details", details);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
