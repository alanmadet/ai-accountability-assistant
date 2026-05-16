export interface Task {
  id: string
  title: string
  status: string

  category:
    | "waiting_on"
    | "you_owe"

  priority:
    | "low"
    | "medium"
    | "high"
}