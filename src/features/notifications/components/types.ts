import type { NotificationKind } from "@/server/db/schema";

/** A notification as the UI sees it (client-safe). */
export type NotificationDTO = {
  id: string;
  kind: NotificationKind;
  text: string;
  excerpt: string | null;
  /** Reaction kind for "reacted to your post" messages. */
  reaction: string | null;
  href: string | null;
  createdAt: string;
  /** Arrived after the viewer last opened the notification centre. */
  isNew: boolean;
  actor: { id: string; name: string; username: string } | null;
};
