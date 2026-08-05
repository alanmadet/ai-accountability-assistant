export type Urgency = "high_priority" | "upcoming";

export type NotificationKind =
  | "recruiter"
  | "bill"
  | "medical"
  | "deadline"
  | "travel"
  | "package"
  | "event"
  | "subscription"
  | "reply_needed"
  | "waiting_on"
  | "other";

export type RecommendedAction =
  | "draft_reply"
  | "open_email"
  | "snooze"
  | "dismiss"
  | "add_to_calendar";

export type NotificationStatus = "open" | "completed" | "dismissed" | "snoozed";

export interface Notification {
  id: string;
  title: string;
  summary: string;
  reason: string;
  kind: NotificationKind;
  urgency: Urgency;
  confidence: number | null;
  deadline: string | null;
  recommended_actions: RecommendedAction[];
  sender: string | null;
  subject: string | null;
  source_email_id: string | null;
  gmail_message_id: string | null;
  unsubscribe_url: string | null;
  status: NotificationStatus;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  insight_type: string;
  created_at: string | null;
}

export interface EmailDetail {
  id: string;
  gmail_message_id: string;
  sender: string;
  subject: string;
  snippet: string;
  body: string;
  received_at: string | null;
  unsubscribe_url: string | null;
}
