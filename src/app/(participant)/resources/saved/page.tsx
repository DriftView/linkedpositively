import Link from "next/link";
import { Heart } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { ResourcesTabs } from "@/features/resources/components/resources-tabs";
import { listFavoriteResources } from "@/features/resources/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Saved resources" };

export default async function SavedResourcesPage() {
  const viewer = await requirePermission("resources.view");
  const resources = await listFavoriteResources(viewer.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Resources" description="Places you've saved, so they're easy to find again." />
      <div className="mb-5">
        <ResourcesTabs savedCount={resources.length} />
      </div>
      {resources.length ? (
        <ol className="grid grid-cols-1 gap-3">
          {resources.map((resource, index) => (
            <li key={resource.id}>
              <ResourceCard resource={resource} index={index} />
            </li>
          ))}
        </ol>
      ) : (
        <Empty className="rounded-3xl border border-dashed bg-muted/30 py-14">
          <EmptyHeader>
            <EmptyMedia className="size-14 rounded-2xl bg-brand-magenta/10 text-brand-magenta">
              <Heart className="size-6" />
            </EmptyMedia>
            <EmptyTitle className="text-lg">Nothing saved yet</EmptyTitle>
            <EmptyDescription>Tap the heart on any resource to keep it here for later.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild className="h-10 rounded-full px-5">
              <Link href="/resources">Find resources</Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
