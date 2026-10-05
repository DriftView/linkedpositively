"use client";

import { useRouter } from "next/navigation";
import type { PostDTO, ViewerDTO } from "../types";
import { PostCard } from "./post-card";

/** A post on its own page; deleting it goes back to the wall. */
export function SinglePost({ post, viewer, editing }: { post: PostDTO; viewer: ViewerDTO; editing?: boolean }) {
  const router = useRouter();
  return (
    <PostCard
      post={post}
      viewer={viewer}
      variant="page"
      defaultEditing={editing}
      onDeleted={() => window.setTimeout(() => router.push("/"), 350)}
    />
  );
}
