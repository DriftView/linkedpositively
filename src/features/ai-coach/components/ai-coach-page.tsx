import { Bot } from "lucide-react";
import { getSettings } from "@/features/admin/settings";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type Viewer } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";
import { aiConfigured } from "../claude";
import { getConversationMessages, getPreferences, listConversations } from "../queries";
import { voiceConfigured } from "../speech";
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
  const settings = await getSettings();
  if (!settings.aiCoachEnabled) {
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

  const requested = Array.isArray(searchParams.c) ? searchParams.c[0] : searchParams.c;
  const [preferences, conversations, messages] = await Promise.all([
    getPreferences(viewer.id),
    listConversations(viewer.id),
    requested ? getConversationMessages(viewer.id, requested) : Promise.resolve(null),
  ]);
  const conversationId = messages ? requested! : null;
  await trackUsage(viewer.id, "ai_coach_view", { resumed: Boolean(conversationId) });

  return (
    <AiCoach
      key={conversationId ?? "new"}
      basePath={basePath}
      conversationId={conversationId}
      title={conversations.find((conversation) => conversation.id === conversationId)?.title ?? null}
      initialMessages={messages ?? []}
      conversations={conversations}
      preferences={preferences}
      voiceEnabled={settings.aiVoiceEnabled}
      serverVoice={voiceConfigured()}
      aiAvailable={aiConfigured()}
      timezone={viewer.timezone}
      firstName={viewer.name.split(" ")[0] ?? ""}
    />
  );
}
