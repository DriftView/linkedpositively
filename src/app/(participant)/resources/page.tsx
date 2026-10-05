import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { LocatorResults, ResourceLocator } from "@/features/resources/components/resource-locator";
import { ResourceResults } from "@/features/resources/components/resource-results";
import { ResourcesTabs } from "@/features/resources/components/resources-tabs";
import { TrackVisit } from "@/features/resources/components/track-visit";
import { countFavoriteResources, listResourceTags, searchResources } from "@/features/resources/queries";
import { searchParamsSchema } from "@/features/resources/schemas";
import { can, requirePermission } from "@/server/auth/session";

export const metadata = { title: "Resources" };

export default async function ResourcesPage(props: PageProps<"/resources">) {
  const viewer = await requirePermission("resources.view");
  const raw = await props.searchParams;
  const params = searchParamsSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
  );
  const [result, tags, savedCount] = await Promise.all([
    searchResources(viewer.id, params),
    listResourceTags(),
    countFavoriteResources(viewer.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Resources"
        description="Find testing, care, support and everyday help near you."
        actions={
          can(viewer, "resources.suggest") ? (
            <Button asChild variant="outline" className="h-10 rounded-full px-4 font-semibold">
              <Link href="/resources/suggest">
                <Plus aria-hidden />
                Suggest a place
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4">
        <ResourcesTabs savedCount={savedCount} />
      </div>
      <ResourceLocator tags={tags}>
        <LocatorResults>
          <ResourceResults result={result} params={params} />
        </LocatorResults>
      </ResourceLocator>
      <TrackVisit />
    </div>
  );
}
