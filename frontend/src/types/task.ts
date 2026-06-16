export interface Task {
  id: string
  title: string
  status: string

  category:
  | "needs_reply"
  | "waiting_on"
  | "time_sensitive"
  | "worth_reviewing";

  priority:
    | "low"
    | "medium"
    | "high"
}

export interface SearchResult {
  email_id: string
  subject: string
  sender: string
  snippet: string
  chunk_preview: string
}

export interface AskSource {
  subject: string
  sender: string
}