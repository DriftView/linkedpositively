import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SinglePost } from "@/features/community/components/single-post";
import { getPost } from "@/features/community/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Post" };

/** One wall post with all its comments (legacy /wall-post/{nid}; notifications link here). */
export default async function PostPage({ params, searchParams }: PageProps<"/posts/[id]">) {
  const viewer = await requirePermission("community.post");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const post = await getPost(id, viewer);
  if (!post) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to the wall
      </Link>
      <SinglePost
        post={post}
        viewer={{ id: viewer.id, name: viewer.name, username: viewer.username }}
        editing={query.edit === "1"}
      />
    </div>
  );
}
