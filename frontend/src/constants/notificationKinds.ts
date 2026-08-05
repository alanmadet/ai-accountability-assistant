import {
  UserCheck,
  Receipt,
  Stethoscope,
  Clock,
  Plane,
  Package,
  CalendarDays,
  RefreshCw,
  MessageSquare,
  Hourglass,
  Mail,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { NotificationKind } from "../types/notification";

export interface KindConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  glow: string;
  openLabel: string;
}

export const KIND_CONFIG: Record<NotificationKind, KindConfig> = {
  recruiter: {
    label: "Recruiter",
    icon: UserCheck,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(248,113,113,0.55)]",
    openLabel: "Open Email",
  },
  bill: {
    label: "Bill",
    icon: Receipt,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(52,211,153,0.55)]",
    openLabel: "View Bill",
  },
  medical: {
    label: "Medical",
    icon: Stethoscope,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(251,113,133,0.55)]",
    openLabel: "Open Email",
  },
  deadline: {
    label: "Deadline",
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(251,191,36,0.55)]",
    openLabel: "Open Email",
  },
  travel: {
    label: "Travel",
    icon: Plane,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)]",
    openLabel: "View Flight",
  },
  package: {
    label: "Package",
    icon: Package,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(251,146,60,0.55)]",
    openLabel: "Track Package",
  },
  event: {
    label: "Event",
    icon: CalendarDays,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(167,139,250,0.55)]",
    openLabel: "View Details",
  },
  subscription: {
    label: "Subscription",
    icon: RefreshCw,
    color: "text-indigo-400",
    bg: "bg-indigo-400/10",
    border: "border-indigo-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(129,140,248,0.55)]",
    openLabel: "Open Email",
  },
  reply_needed: {
    label: "Reply Needed",
    icon: MessageSquare,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(248,113,113,0.55)]",
    openLabel: "Open Email",
  },
  waiting_on: {
    label: "Waiting On",
    icon: Hourglass,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(251,191,36,0.55)]",
    openLabel: "Open Email",
  },
  other: {
    label: "Other",
    icon: Mail,
    color: "text-zinc-400",
    bg: "bg-zinc-400/10",
    border: "border-zinc-400/20",
    glow: "shadow-[0_0_18px_-6px_rgba(161,161,170,0.4)]",
    openLabel: "Open Email",
  },
};

export function getKindConfig(kind: string): KindConfig {
  return KIND_CONFIG[kind as NotificationKind] ?? KIND_CONFIG.other;
}
