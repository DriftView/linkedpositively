import type { AiStatsDTO } from "../../types";

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

function Tile({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** AI Coach engagement, quality and safety numbers (no conversation content). */
export function AiStats({ stats }: { stats: AiStatsDTO }) {
  const rated = stats.helpful + stats.notHelpful;
  const peak = Math.max(1, ...stats.daily.map((day) => day.messages));
  return (
    <div className="space-y-6">
      <section aria-label="Engagement" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Members using the coach" value={stats.members} />
        <Tile label="Conversations" value={stats.conversations} />
        <Tile
          label="Member messages"
          value={stats.memberMessages}
          detail={`${percent(stats.voiceMessages, stats.memberMessages)} by voice`}
        />
        <Tile
          label="Average reply time"
          value={stats.avgLatencyMs == null ? "–" : `${(stats.avgLatencyMs / 1000).toFixed(1)}s`}
        />
      </section>

      <section aria-label="Quality" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Rated helpful"
          value={percent(stats.helpful, rated)}
          detail={`${rated} rating${rated === 1 ? "" : "s"}`}
        />
        <Tile
          label="Resolved without a person"
          value={percent(stats.resolvedWithoutHuman, stats.conversations)}
          detail="Answered, with no alert or hand-off"
        />
        <Tile label="Fallback replies" value={stats.fallbacks} detail="Unavailable, refused, errors or limits" />
        <Tile label="Places shown" value={stats.resourcesShown} />
      </section>

      <section aria-label="People and safety" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Safety alerts" value={stats.alerts.total} detail={`${stats.alerts.urgent} urgent`} />
        <Tile label="Alerts still open" value={stats.alerts.open} />
        <Tile label="Navigator hand-offs offered" value={stats.handoffsShown} />
        <Tile
          label="Hand-off messages sent"
          value={stats.handoffsSent}
          detail={percent(stats.handoffsSent, stats.handoffsShown)}
        />
      </section>

      <section aria-label="Messages per day" className="rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="font-sans text-sm font-semibold">Member messages per day</h2>
        {stats.daily.length ? (
          <div
            className="mt-4 flex h-40 items-end gap-1"
            role="img"
            aria-label={`Messages per day over the last ${stats.days} days`}
          >
            {stats.daily.map((day) => (
              <div key={day.day} className="flex h-full max-w-12 flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t-sm bg-primary/80"
                  style={{ height: `${Math.max(4, (day.messages / peak) * 100)}%` }}
                  title={`${day.day}: ${day.messages} messages, ${day.members} members`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No messages in this period yet.</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Last {stats.days} days. Tokens used: {stats.tokens.input.toLocaleString()} in,{" "}
        {stats.tokens.output.toLocaleString()} out. Accuracy targets (PRD §14) need a study-team review sample;
        &ldquo;Rated helpful&rdquo; is members&apos; own feedback.
      </p>
    </div>
  );
}
