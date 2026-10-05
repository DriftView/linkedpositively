import { PageHeader } from "@/components/app/page-header";
import { tipsNewCount } from "@/features/tips/counts";
import { TipsNav } from "@/features/tips/components/tips-nav";
import { requirePermission } from "@/server/auth/session";

/** "Your Tips | N New Tips" header and the Today / Explore / Favourites switch. */
export default async function TipsBrowseLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePermission("tips.view");
  const count = await tipsNewCount(viewer);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="Your tips" count={count} countLabel={count === 1 ? "new tip" : "new tips"} description="Small, practical ideas for living well — a few fresh ones every day." />
      <TipsNav />
      {children}
    </div>
  );
}
