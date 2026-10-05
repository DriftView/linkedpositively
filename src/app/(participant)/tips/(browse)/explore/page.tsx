import { CalendarClock, SearchX } from "lucide-react";
import { TipCard } from "@/features/tips/components/tip-card";
import { TipFilters } from "@/features/tips/components/tip-filters";
import { TipsEmpty } from "@/features/tips/components/tips-empty";
import { exploreTips } from "@/features/tips/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Explore tips" };

/** Explore / Tags / Recommended (the old ALL, RECOMMENDED and TAGS tabs). */
export default async function ExploreTipsPage({ searchParams }: PageProps<"/tips/explore">) {
  const viewer = await requirePermission("tips.view");
  const params = await searchParams;
  const raw = Array.isArray(params.tags) ? params.tags.join(",") : (params.tags ?? "");
  // Accept "a,b", "a+b" and "a b" (legacy /thrive-tips/tags/a+b links).
  const selected = [...new Set(raw.split(/[,+\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  const forYou = params.for === "you";

  const result = await exploreTips(viewer, { tags: selected, forYou });
  if (result.notStarted) {
    return (
      <TipsEmpty
        icon={CalendarClock}
        title="Nothing to explore yet"
        description="Your tips library fills up day by day once your study begins."
      />
    );
  }

  return (
    <TipFilters
      tags={result.tags}
      selected={selected.filter((slug) => result.tags.some((t) => t.slug === slug))}
      forYou={forYou}
      recommendedCount={result.recommendedCount}
      resultCount={result.items.length}
    >
      {result.items.length ? (
        <ul className="space-y-3">
          {result.items.map((tip) => (
            <li key={tip.id}>
              <TipCard tip={tip} variant="compact" />
            </li>
          ))}
        </ul>
      ) : (
        <TipsEmpty
          icon={SearchX}
          title="No tips match those topics yet"
          description="Try fewer topics, or come back soon — new tips arrive every day."
          action={{ href: "/tips/explore", label: "Show all tips" }}
        />
      )}
    </TipFilters>
  );
}
