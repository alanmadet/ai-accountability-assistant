import {
  MessageSquare,
  UserCheck,
  Clock,
  Users,
  MapPin,
  DollarSign,
  FileText,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Mail,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  follow_ups_needed: {
    label: "Follow-ups Needed",
    icon: MessageSquare,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
  },
  potential_commitments: {
    label: "Potential Commitments",
    icon: UserCheck,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
  },
  renewals_deadlines: {
    label: "Renewals & Deadlines",
    icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/20",
  },
  high_volume_senders: {
    label: "High-Volume Senders",
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
  },
  travel_events: {
    label: "Travel & Events",
    icon: MapPin,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
  },
  financial_items: {
    label: "Financial Items",
    icon: DollarSign,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
  },
  personal_admin: {
    label: "Personal Admin",
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/20",
  },
  opportunities: {
    label: "Opportunities",
    icon: Sparkles,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  // Legacy categories for backward compatibility
  needs_reply: {
    label: "Needs Reply",
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
  },
  waiting_on: {
    label: "Waiting On",
    icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/20",
  },
  time_sensitive: {
    label: "Time Sensitive",
    icon: RefreshCw,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
  },
  worth_reviewing: {
    label: "Worth Reviewing",
    icon: Mail,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
  },
};

export const CATEGORY_ORDER = [
  "follow_ups_needed",
  "potential_commitments",
  "renewals_deadlines",
  "high_volume_senders",
  "travel_events",
  "financial_items",
  "personal_admin",
  "opportunities",
  // legacy fallback
  "needs_reply",
  "waiting_on",
  "time_sensitive",
  "worth_reviewing",
];

export function getCategoryConfig(category: string): CategoryConfig {
  return (
    CATEGORY_CONFIG[category] ?? {
      label: category,
      icon: Mail,
      color: "text-zinc-400",
      bg: "bg-zinc-400/10",
      border: "border-zinc-400/20",
    }
  );
}
