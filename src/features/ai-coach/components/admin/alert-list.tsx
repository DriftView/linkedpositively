import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { shortAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AlertRowDTO } from "../../types";
import { CATEGORY_LABEL, LEVEL_CLASS, LEVEL_LABEL, SOURCE_LABEL, STATUS_LABEL } from "./labels";

export function AlertList({ alerts, timezone, emptyLabel }: { alerts: AlertRowDTO[]; timezone: string; emptyLabel: string }) {
  if (!alerts.length) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="mb-2 size-6" />
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link href={`/admin/ai/alerts/${alert.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/60">
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", LEVEL_CLASS[alert.level])}>{LEVEL_LABEL[alert.level]}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {alert.member.name} <span className="font-normal text-muted-foreground">@{alert.member.username}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {CATEGORY_LABEL[alert.category]} · {SOURCE_LABEL[alert.source]}
                {alert.reason ? ` · ${alert.reason}` : ""}
              </span>
            </span>
            <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
              {STATUS_LABEL[alert.status]}
              {alert.handledByName ? ` · ${alert.handledByName}` : ""}
              <br />
              {shortAgo(alert.createdAt, timezone)}
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
