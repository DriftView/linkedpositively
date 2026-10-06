import type { Metadata } from "next";
import { AiCoachPage } from "@/features/ai-coach/components/ai-coach-page";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI Coach" };

export default async function AiCoachRoute(props: PageProps<"/ai-coach">) {
  const viewer = await requirePermission("ai.chat");
  return <AiCoachPage viewer={viewer} basePath="/ai-coach" searchParams={await props.searchParams} />;
}
