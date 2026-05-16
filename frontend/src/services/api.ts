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