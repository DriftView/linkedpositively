import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { LevelCopyEditor } from "@/features/gamification/components/level-copy-editor";
import { getLevelCopy } from "@/features/gamification/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Levels" };

/** Level wording editor (legacy admin/config/system/levels-description). */
export default async function LevelCopyAdminPage() {
  const viewer = await requirePermission("content.manage");
  const levels = await getLevelCopy();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Levels"
        description="The wording participants see for each level. Point thresholds and unlocks are fixed: 0, 201, 500, 900, 1,400 and 2,000 points."
      />
      <div className="space-y-4">
        {levels.map((item) => (
          <LevelCopyEditor key={item.level} item={item} timezone={viewer.timezone} />
        ))}
      </div>
    </div>
  );
}
