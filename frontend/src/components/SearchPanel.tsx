import { useState } from "react";
import { Search, Sparkles, Loader2 } from "lucide-react";
import type { SearchResult, AskSource } from "../types/task";

const API_URL = import.meta.env.VITE_API_URL;

export default function SearchPanel() {
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [askAnswer, setAskAnswer] = useState("");
  const [askSources, setAskSources] = useState<AskSource[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit() {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      if (mode === "search") {
        const res = await fetch(
          `${API_URL}/search?query=${encodeURIComponent(query)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        setSearchResults(data.results || []);
        setAskAnswer("");
        setAskSources([]);
      } else {
        const res = await fetch(`${API_URL}/ask`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query }),
        });
        const data = await res.json();
        setAskAnswer(data.answer || "");
        setAskSources(data.sources || []);
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSubmit();
  }

  function switchMode(next: "search" | "ask") {
    setMode(next);
    setHasSearched(false);
    setSearchResults([]);
    setAskAnswer("");
    setAskSources([]);
  }

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">
          Inbox Search
        </h2>

        <p className="text-zinc-400 mb-8">
          Search your emails semantically or ask a natural language question.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => switchMode("search")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === "search"
                ? "bg-blue-500 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <Search size={16} />
            Search
          </button>

          <button
            onClick={() => switchMode("ask")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === "ask"
                ? "bg-purple-500 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <Sparkles size={16} />
            Ask My Inbox
          </button>
        </div>

        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "search"
                ? "Search emails semantically..."
                : "Ask a question about your inbox..."
            }
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"
          />

          <button
            onClick={handleSubmit}
            disabled={loading || !query.trim()}
            className={`px-5 py-3 rounded-xl font-medium transition disabled:opacity-50 flex items-center gap-2 shrink-0 ${
              mode === "search"
                ? "bg-blue-500 hover:bg-blue-600"
                : "bg-purple-500 hover:bg-purple-600"
            }`}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === "search" ? (
              <Search size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            <span className="hidden sm:inline">
              {loading ? "..." : mode === "search" ? "Search" : "Ask"}
            </span>
          </button>
        </div>

        {loading && (
          <div className="text-center text-zinc-400 py-16">
            <Loader2
              size={32}
              className="animate-spin mx-auto mb-3 text-zinc-500"
            />
            <p>
              {mode === "search"
                ? "Searching your inbox..."
                : "Thinking through your emails..."}
            </p>
          </div>
        )}

        {!loading && mode === "search" && hasSearched && (
          <div className="space-y-4">
            {searchResults.length === 0 ? (
              <p className="text-zinc-400 text-center py-12">
                No results found.
              </p>
            ) : (
              searchResults.map((result) => (
                <div
                  key={result.email_id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5"
                >
                  <p className="font-semibold mb-1 break-words">
                    {result.subject || "(no subject)"}
                  </p>

                  <p className="text-sm text-zinc-400 mb-3">
                    {result.sender}
                  </p>

                  <p className="text-sm text-zinc-300 leading-relaxed break-words">
                    {result.chunk_preview}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && mode === "ask" && hasSearched && (
          <div className="space-y-6">
            {askAnswer ? (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles
                      size={18}
                      className="text-purple-400 shrink-0"
                    />
                    <h3 className="font-semibold">Answer</h3>
                  </div>

                  <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {askAnswer}
                  </p>
                </div>

                {askSources.length > 0 && (
                  <div>
                    <p className="text-sm text-zinc-400 mb-3">Sources</p>

                    <div className="space-y-2">
                      {askSources.map((source, i) => (
                        <div
                          key={i}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                        >
                          <p className="text-sm font-medium break-words">
                            {source.subject || "(no subject)"}
                          </p>

                          <p className="text-xs text-zinc-400 mt-1">
                            {source.sender}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-zinc-400 text-center py-12">
                No answer found.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
