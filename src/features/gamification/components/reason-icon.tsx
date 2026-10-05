import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  Heart,
  Lightbulb,
  MapPin,
  MessageCircle,
  PenLine,
  Sparkles,
  Star,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const ICONS: [RegExp, LucideIcon][] = [
  [/^(post|topic)$/, PenLine],
  [/comment/, MessageCircle],
  [/reaction|upvote/, Heart],
  [/tip/, Lightbulb],
  [/tracker|checkin-(meds|mood)/, CalendarCheck],
  [/time.on.site/, Clock],
  [/resource_rating|rate-resource/, Star],
  [/resource/, MapPin],
  [/profile/, UserRound],
  [/guidelines|community-view/, BookOpen],
  [/weekly_checkin|action-plan/, ClipboardCheck],
];

export function ReasonIcon({ reason, className }: { reason: string; className?: string }) {
  const Icon = ICONS.find(([pattern]) => pattern.test(reason))?.[1] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
