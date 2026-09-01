export interface Task {
  id: string;
  title: string;
  status: string;
  category: string;
  priority: "low" | "medium" | "high";
  is_completed?: boolean;
  is_hidden?: boolean;
  completed_at?: string | null;
}

export interface SearchResult {
  email_id: string;
  subject: string;
  sender: string;
  snippet: string;
  chunk_preview: string;
  gmail_message_id: string | null;
  rfc822_message_id: string | null;
}

export interface AskSource {
  subject: string;
  sender: string;
}

export interface UserSettings {
  auto_sync_enabled: boolean;
  sync_frequency_hours: number;
  sync_email_count: number;
  gmail_connected?: boolean;
}
