import { useEffect, useState } from "react"

import TaskCard from "./components/TaskCard"
import SummaryCard from "./components/SummaryCard"

import {
  fetchTasks,
  startSync,
  getSyncStatus
} from "./services/api"

import { Task } from "./types/task"

import {
  Mail,
  Clock3,
  AlertCircle,
  RefreshCcw
} from "lucide-react"

export default function App() {

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [syncing, setSyncing] = useState(false)

  async function loadTasks() {

    const data = await fetchTasks()

    setTasks(data)
  }

  async function handleSync() {

    try {

      setError("")
      setSyncing(true)

      const syncResponse = await startSync()

      const jobId = syncResponse.job_id

      let status = "queued"

      while (
        status === "queued" ||
        status === "processing"
      ) {

        await new Promise(resolve =>
          setTimeout(resolve, 1000)
        )

        const statusResponse =
          await getSyncStatus(jobId)

        status = statusResponse.status
      }

      await loadTasks()

    } catch (err) {

      setError("Inbox sync failed")

    } finally {

      setSyncing(false)
    }
  }

  useEffect(() => {

    async function initialize() {

      try {

        setLoading(true)

        await loadTasks()

      } catch (err) {

        setError("Failed to load tasks")

      } finally {

        setLoading(false)
      }
    }

    initialize()

  }, [])

  const waitingOnItems = tasks.filter(
    task => task.category === "waiting_on"
  )

  const youOweItems = tasks.filter(
    task => task.category === "you_owe"
  )

  return (
    <div className="min-h-screen bg-zinc-100 flex">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-zinc-200 p-6 hidden md:block">
        <h1 className="text-2xl font-bold mb-10">
          AI Assistant
        </h1>

        <nav className="space-y-4">
          <div className="text-zinc-900 font-medium">
            Home
          </div>

          <div className="text-zinc-500">
            Waiting On
          </div>

          <div className="text-zinc-500">
            You Owe
          </div>

          <div className="text-zinc-500">
            Deadlines
          </div>

          <div className="text-zinc-500">
            Settings
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-10">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">
            AI Assistant
          </h1>

          <button
            onClick={handleSync}
            className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm"
          >
            Refresh
          </button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900">
            Good morning, Alan 👋
          </h1>

          <p className="text-zinc-500 mt-2">
            Here's what's on your plate today.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
            Loading inbox analysis...
          </div>
        )}

        {/* Syncing */}
        {syncing && (
          <div className="bg-blue-100 text-blue-600 rounded-2xl p-6 mb-8">
            Analyzing inbox...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 text-red-600 rounded-2xl p-6 mb-8">
            {error}
          </div>
        )}

        {/* Main dashboard */}
        {!loading && !error && (
          <>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

              <SummaryCard
                title="Unresolved follow-ups"
                value={youOweItems.length}
                icon={Mail}
              />

              <SummaryCard
                title="Upcoming deadlines"
                value={2}
                icon={Clock3}
              />

              <SummaryCard
                title="Waiting on responses"
                value={waitingOnItems.length}
                icon={AlertCircle}
              />

            </div>

            {/* Gmail connection */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-8 flex items-center justify-between">

              <div>
                <h2 className="text-xl font-semibold">
                  Gmail Connected
                </h2>

                <p className="text-zinc-500 mt-1">
                  Ready to sync inbox
                </p>
              </div>

              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl hover:bg-zinc-800 transition disabled:opacity-50"
              >
                <RefreshCcw className="w-4 h-4" />

                {syncing
                  ? "Syncing..."
                  : "Refresh Inbox"}

              </button>

            </div>

            {/* AI Summary */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
              <h2 className="text-xl font-semibold mb-4">
                AI Summary
              </h2>

              <p className="text-zinc-600 leading-relaxed">
                You have a few time-sensitive follow-ups.
                The insurance claim update has been pending
                for 9 days, and you still need to reply to
                Sam regarding the project proposal.
              </p>
            </div>

            {/* You Owe */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">

              <h2 className="text-xl font-semibold mb-4">
                You Owe
              </h2>

              <div className="space-y-4">
                {youOweItems.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                  />
                ))}
              </div>

            </div>

            {/* Waiting On */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">

              <h2 className="text-xl font-semibold mb-4">
                Waiting On
              </h2>

              <div className="space-y-4">
                {waitingOnItems.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                  />
                ))}
              </div>

            </div>

          </>
        )}

      </main>
    </div>
  )
}