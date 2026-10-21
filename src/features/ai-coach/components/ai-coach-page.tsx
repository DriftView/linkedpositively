import { Bot } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type Viewer } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";
import { loadCoach } from "../load";
import { AiCoach } from "./ai-coach";

/**
 * The AI Coach page body, shared by /ai-coach (Link Positively) and
 * /coaching/ai-coach (Peer Navigation). `?c=` opens a conversation.
 */
export async function AiCoachPage({
  viewer,
  basePath,
  searchParams,
}: {
  viewer: Viewer;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const requested = Array.isArray(searchParams.c) ? searchParams.c[0] : searchParams.c;
  const data = await loadCoach(viewer, requested ?? null);
  if (!data) {
    return (
      <Empty className="mx-auto max-w-lg py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot aria-hidden />
          </EmptyMedia>
          <EmptyTitle>The AI coach is resting</EmptyTitle>
          <EmptyDescription>
            It isn&apos;t available right now. Your peer navigator and the study team are still here for you.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  await trackUsage(viewer.id, "ai_coach_view", { resumed: Boolean(data.conversationId) });
  return <AiCoach key={data.conversationId ?? "new"} basePath={basePath} {...data} />;
}
