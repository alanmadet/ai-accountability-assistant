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