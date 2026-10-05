import { notFound, redirect } from "next/navigation";
import { resolveLegacyPage } from "@/features/pages/queries";
import { requireViewer } from "@/server/auth/session";

/**
 * Target for the legacy redirect /node/:nid → /pages/legacy/:nid. Finds the
 * migrated page by its Drupal node id and sends the visitor to its address.
 */
export default async function LegacyPageRedirect(props: PageProps<"/pages/legacy/[nid]">) {
  await requireViewer();
  const { nid } = await props.params;
  const id = Number(nid);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const slug = await resolveLegacyPage({ nid: id });
  if (!slug) notFound();
  redirect(`/pages/${slug}`);
}
