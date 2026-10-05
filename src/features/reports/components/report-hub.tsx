import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Download,
  Handshake,
  Lightbulb,
  ListChecks,
  MapPinned,
  MessagesSquare,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PEER_NAV_REPORTS, REPORT_GROUPS, REPORTS, type ReportGroup } from "../catalog";

const GROUP_ICONS: Record<ReportGroup, LucideIcon> = {
  usage: Activity,
  community: MessagesSquare,
  tips: Lightbulb,
  tracking: ListChecks,
  resources: MapPinned,
  profile: UserRound,
  surveys: ClipboardList,
};

type Card = { href: string; csv: string; title: string; summary: string; filename: string; legacyName?: string; badge?: string };

function ReportCard({ card }: { card: Card }) {
  return (
    <li className="group relative flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-soft transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.95rem] leading-snug font-semibold">
          <Link href={card.href} className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {card.title}
          </Link>
        </h3>
        {card.badge ? (
          <Badge variant="secondary" className="shrink-0">
            {card.badge}
          </Badge>
        ) : (
          <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{card.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-mono" title={card.legacyName ? `Was “${card.legacyName}”` : undefined}>
          {card.filename}
        </span>
        <a
          href={card.csv}
          download={card.filename}
          className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-primary outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Download ${card.title} as CSV`}
        >
          <Download className="size-3.5" aria-hidden />
          CSV
        </a>
      </div>
    </li>
  );
}

function Group({ icon: Icon, label, count, children }: { icon: LucideIcon; label: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  );
}

/** The reports hub (replaces admin/uy-reports): every report, grouped, with a one-click CSV. */
export function ReportHub({ showPeerNav }: { showPeerNav: boolean }) {
  return (
    <div className="space-y-8">
      {REPORT_GROUPS.map((group) => {
        const reports = REPORTS.filter((r) => r.group === group.id);
        if (!reports.length) return null;
        return (
          <Group key={group.id} icon={GROUP_ICONS[group.id]} label={group.label} count={reports.length}>
            {reports.map((r) => (
              <ReportCard
                key={r.slug}
                card={{ href: `/admin/reports/${r.slug}`, csv: `/admin/reports/${r.slug}/csv`, title: r.title, summary: r.summary, filename: r.filename, legacyName: r.legacyName, badge: r.badge }}
              />
            ))}
          </Group>
        );
      })}
      {showPeerNav ? (
        <Group icon={Handshake} label="Peer Navigation" count={PEER_NAV_REPORTS.length}>
          {PEER_NAV_REPORTS.map((r) => (
            <ReportCard key={r.href} card={{ ...r }} />
          ))}
        </Group>
      ) : null}
    </div>
  );
}
