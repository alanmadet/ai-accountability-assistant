import type { Notification, Insight, EmailDetail } from "../types/notification";

export async function fetchTasks() {

    const response = await fetch(
      "http://127.0.0.1:8000/tasks"
    )
  
    if (!response.ok) {
      throw new Error("Failed to fetch tasks")
    }
  
    const data = await response.json()
  
    return data.tasks
  }
  
  export async function startSync() {
  
    const response = await fetch(
      "http://127.0.0.1:8000/sync",
      {
        method: "POST"
      }
    )
  
    if (!response.ok) {
      throw new Error("Failed to start sync")
    }
  
    return response.json()
  }
  
  export async function getSyncStatus(jobId: string) {

    const response = await fetch(
      `http://127.0.0.1:8000/sync-status/${jobId}`
    )

    if (!response.ok) {
      throw new Error("Failed to fetch sync status")
    }

    return response.json()
  }

  const API_URL = import.meta.env.VITE_API_URL;

  export async function fetchNotifications(
    status: string = "open"
  ): Promise<Notification[]> {
    const response = await fetch(
      `${API_URL}/notifications?status=${status}`,
      { credentials: "include" }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch notifications");
    }

    const data = await response.json();
    return data.notifications ?? [];
  }

  export async function completeNotification(id: string) {
    return fetch(`${API_URL}/notifications/${id}/complete`, {
      method: "POST",
      credentials: "include",
    });
  }

  export async function dismissNotification(id: string) {
    return fetch(`${API_URL}/notifications/${id}/dismiss`, {
      method: "POST",
      credentials: "include",
    });
  }

  export async function reopenNotification(id: string) {
    return fetch(`${API_URL}/notifications/${id}/reopen`, {
      method: "POST",
      credentials: "include",
    });
  }

  export async function snoozeNotification(id: string) {
    return fetch(`${API_URL}/notifications/${id}/snooze`, {
      method: "POST",
      credentials: "include",
    });
  }

  export async function draftReply(id: string) {
    const response = await fetch(`${API_URL}/notifications/${id}/draft-reply`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to generate draft reply");
    }

    const data = await response.json();
    return data.draft as string;
  }

  export async function fetchEmail(id: string): Promise<EmailDetail> {
    const response = await fetch(`${API_URL}/emails/${id}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch email");
    }

    return response.json();
  }

  export async function fetchInsights(): Promise<Insight[]> {
    const response = await fetch(`${API_URL}/insights`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch insights");
    }

    const data = await response.json();
    return data.insights ?? [];
  }

  export async function dismissInsight(id: string) {
    return fetch(`${API_URL}/insights/${id}/dismiss`, {
      method: "POST",
      credentials: "include",
    });
  }

  export async function bulkCompleteNotifications(ids: string[]) {
    const response = await fetch(`${API_URL}/notifications/bulk`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "completed" }),
    });
    if (!response.ok) throw new Error("Failed to complete notifications");
    return response.json();
  }

  export async function sendInsightFeedback(
    id: string,
    useful: boolean,
    reason?: string
  ) {
    const response = await fetch(`${API_URL}/insights/${id}/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useful, reason }),
    });
    if (!response.ok) throw new Error("Failed to save feedback");
  }
