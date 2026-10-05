import { Heart } from "lucide-react";
import { TipCard } from "@/features/tips/components/tip-card";
import { TipsEmpty } from "@/features/tips/components/tips-empty";
import { favoriteTips } from "@/features/tips/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Favourite tips" };

export default async function FavoriteTipsPage() {
  const viewer = await requirePermission("tips.view");
  const tips = await favoriteTips(viewer);

  if (!tips.length) {
    return (
      <TipsEmpty
        icon={Heart}
        title="No favourites yet"
        description="Tap the heart on any tip to keep it here, so it's easy to find again."
        action={{ href: "/tips", label: "See today's tips" }}
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {tips.length} saved {tips.length === 1 ? "tip" : "tips"}
      </p>
      <ul className="space-y-3">
        {tips.map((tip) => (
          <li key={tip.id} className="animate-rise">
            <TipCard tip={tip} variant="compact" />
          </li>
        ))}
      </ul>
    </div>
  );
}
