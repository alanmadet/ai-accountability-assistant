import { X, ShieldCheck, Eye, Cpu, Database, Users, XCircle } from "lucide-react";

type Props = {
  onClose: () => void;
};

const SECTIONS = [
  {
    icon: Eye,
    title: "What we access",
    body:
      "Beacon connects to Gmail using Google's read-only OAuth scope. It can read your messages, but it cannot send email, delete anything, or otherwise modify your inbox.",
  },
  {
    icon: Cpu,
    title: "What it's used for",
    body:
      "The subject, sender, and body of each email are sent to OpenAI's API to generate the notifications, summaries, and insights on your dashboard, and to power semantic search over your inbox.",
  },
  {
    icon: Database,
    title: "Where it's stored",
    body:
      "Processed emails and the notifications generated from them are stored in Beacon's private database, tied to your account, so your dashboard stays current without re-fetching everything on every visit.",
  },
  {
    icon: Users,
    title: "Who we share it with",
    body:
      "Only the services required to run Beacon: Google, to read your inbox, and OpenAI, to analyze it. We do not sell your data, and we do not share it with advertisers or any other third party.",
  },
  {
    icon: XCircle,
    title: "Your control",
    body:
      "You can disconnect Beacon at any time from your Google Account's connected apps, or by logging out. Disconnecting stops any further syncing.",
  },
];

export default function PrivacyModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 ring-1 ring-white/10 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-400/10 shadow-[0_0_18px_-6px_rgba(129,140,248,0.55)]">
              <ShieldCheck size={18} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold tracking-[-0.01em]">
              How Beacon Handles Your Data
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition shrink-0"
          >
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {SECTIONS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <div className="p-1.5 rounded-lg bg-zinc-800/80 ring-1 ring-zinc-700/60 h-fit shrink-0">
                <Icon size={14} className="text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm mb-1">{title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}

          <p className="text-xs text-zinc-600 pt-2 border-t border-zinc-800">
            This is a plain-language summary of how Beacon currently handles
            your data, not a formal legal document.
          </p>
        </div>
      </div>
    </div>
  );
}
