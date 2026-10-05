import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CommentSection } from "@/features/community/components/comment-section";
import { TipCard } from "@/features/tips/components/tip-card";
import { TipViewTracker } from "@/features/tips/components/use-tip-view";
import { tipForViewer } from "@/features/tips/queries";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata({ params }: PageProps<"/tips/[id]">) {
  const { id } = await params;
  return { title: /^[a-f\d]{24}$/i.test(id) ? "Thrive tip" : "Tip not found" };
}

/** A single tip with its conversation (the old /comment-tip/{nid}). */
export default async function TipPage({ params }: PageProps<"/tips/[id]">) {
  const viewer = await requirePermission("tips.view");
  const { id } = await params;
  const found = await tipForViewer(viewer, id);
  if (!found) notFound();
  const { tip, related } = found;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/tips"
        className="mb-4 -ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Your tips
      </Link>

      <TipCard tip={tip} variant="page" className="animate-rise" />
      <TipViewTracker tipId={tip.id} enabled={tip.canEarnPoints} />

      <CommentSection target={{ type: "tip", id: tip.id }} viewer={viewer} title="Conversation" className="mt-10 scroll-mt-24" />

      {related.length ? (
        <section aria-labelledby="related-heading" className="mt-10">
          <h2 id="related-heading" className="mb-3 text-xl font-semibold">
            More on this topic
          </h2>
          <ul className="space-y-3">
            {related.map((item) => (
              <li key={item.id}>
                <TipCard tip={item} variant="compact" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
