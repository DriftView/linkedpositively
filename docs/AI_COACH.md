# AI Coach (conversational AI)

The AI Coach is a Claude-powered assistant inside Link Positively and Peer Navigation. It answers questions from approved content, finds resources, hands members to their peer navigator or the study team, and escalates possible crises to people. It implements the "LinkPositively – Conversational AI Developer Requirements" PRD, using **Anthropic Claude** in place of OpenAI GPT.

Code: `src/features/ai-coach/`. Database: `src/server/db/schema/ai.ts`, migration `drizzle/0003_ai_coach.sql`.

## Who can use it

- **Members:** new permission `ai.chat`, held by `participant` (Link Positively intervention arm) and `ecoach_user` (Peer Navigation participants).
  - The **control arm never sees the coach**, which keeps the randomized comparison intact.
  - Staff roles also hold `ai.chat`, so they can try it.
- **Staff:** new permission `ai.review`, held by `admin`, `research_admin` and `coordinator`. It covers the safety alert queue and conversations. Knowledge articles use the existing `content.manage`.
- **Pages:**
  - Link Positively: `/ai-coach`
  - Peer Navigation: `/coaching/ai-coach`
  - Staff: `/admin/ai` (overview), `/admin/ai/alerts`, `/admin/ai/knowledge`
- **Kill switch:** Settings → AI Coach → "AI Coach available".

## How a message is handled

`POST /api/ai/chat` streams NDJSON events (`AiStreamEvent` in `types.ts`). `engine.ts` handles one turn:

1. **Save the member's message.** In a new conversation, a member context note goes with the first message. It holds:
   - first name, pronouns and the location on their profile, only if personalization is on;
   - their programs, whether they have a navigator, and today's date.

   The note is stored with the message, so the history is replayed append-only.
2. **Safety layer 1, keywords** (`safety.ts`). An instant, conservative check for:
   - urgent: suicide, overdose, violence, medical emergency;
   - elevated: self-harm, abuse.

   On a match, the member immediately sees the crisis lines and a safety alert is raised. This also works when Claude is down.
3. **Safety layer 2, Claude classifier** (`classifier.ts`).
   - Runs in parallel with the reply, rating the latest message (with up to 3 earlier ones) as none, support, elevated or urgent.
   - Catches indirect wording the keywords miss.
   - The reply isn't finalised until the classifier has finished.
4. **The reply.** Claude Opus 5.5 (`claude-opus-5-5`) at effort `medium` with:
   - the static system prompt (`prompt.ts`, cached);
   - the full stored conversation (tool calls and thinking blocks included, never edited);
   - four tools (`tools.ts`):
     - `search_knowledge`: Postgres full-text search over approved content.
     - `find_resources`: the existing resource locator, with the member's device location if they shared it, else a city or ZIP they named, else their profile location.
     - `connect_peer_navigator`: a card with a draft message the member edits and sends to their navigator. Members without a navigator get study-team contacts instead.
     - `request_human_support`: Safety layer 3. The coach raises an alert itself (support, elevated or urgent).
5. **Save the reply** with its cards (resources, sources, hand-off, crisis), outcome, latency and token counts.

**Refusals:** requests use Anthropic's server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If the safety classifiers decline, the API re-runs the request on Anthropic's recommended fallback model. If the whole chain refuses, the member gets the refusal fallback (below).

## Grounding (approved content)

The coach is told to call `search_knowledge` before any health answer and to answer **only** from what it returns. If nothing relevant comes back, it says it doesn't have approved information and offers a person or a provider. Approved content is:

- every **published Thrive Tip**. This ignores the member's release day; tips are linked only once released to that member.
- published, member-facing **pages** (Help, FAQ…) and the **glossary** (about 68 HIV terms)
- **AI knowledge articles** written and approved by staff at `/admin/ai/knowledge`. Only approved and published articles are used; publishing requires approval, which is audited.

Five draft articles (PrEP, PEP, testing, U=U, mental health) are seeded **unpublished and "needs review"**. To load them:

```
npx tsx --env-file=.env --conditions=react-server scripts/seed-ai.mts
```

## Safety protocol (predefined)

| Signal | Member sees | Who is told |
| --- | --- | --- |
| Urgent (suicide plan or intent, overdose, violence, medical emergency) | Crisis card (911, 988, Crisis Text Line) and a banner | Staff with `ai.review`: in-app notification. Assigned navigator: a nudge to check in. Safety email: a link only. On-call phone: a text. |
| Elevated (thoughts of suicide, self-harm, abuse, assault, PEP window) | Crisis card with all lines, including Trevor Project and DV hotline | Staff in-app, assigned navigator, safety email |
| Support (asked for a person) | Navigator or study-team hand-off card | Staff in-app, safety email |

- **One open alert per conversation.** A more serious signal raises the level and notifies again.
- **Delivery:** alerts are delivered by an Inngest job (`ai/safety.alert`, carrying the alert id only). Without a job runner, they are delivered right after the response.
- **No health details in notifications.** Notifications, emails and texts carry no member names or message content.
- **Alert handling:**
  - Staff open the alert at `/admin/ai/alerts/[id]`. Every view of a conversation is audited (`ai.transcript`).
  - Staff set the status (New, In review, Resolved) and write a note (audited as `ai.alert`).
- **Settings:**
  - Settings → AI Coach → "Safety alert email" (empty means the study contact email).
  - "On-call phone" for urgent texts.
  - SMS and email only leave the server when `DELIVERY_MODE=live`.

The system prompt adds conservative rules:

- never give methods or amounts for self-harm;
- never diagnose, interpret results or change medicines;
- say the coach is an AI;
- say the study team isn't an emergency service;
- for a possible HIV exposure within 72 hours, push PEP care now.

## Fallbacks (PRD §11)

Each case below has a defined reply. The member always sees how to reach people, and 911/988. These are working defaults; **the product team should confirm them.**

| Situation | Behaviour (`ai_messages.outcome`) |
| --- | --- |
| Claude not configured or switched off | `fallback_unavailable`: apology, related approved content (sources), navigator, study team, 911/988. The page shows "limited mode". |
| Claude API error or timeout | `fallback_error`: any partial answer is kept, then "please try again", related content, 911/988 |
| Claude declines (refusal) | `fallback_refusal`: "I'm not able to help with that one", navigator or study team, 911/988 |
| Over 40 messages per hour, or over 60 turns in a conversation | `fallback_limit`: take a break, or start a new conversation |
| Question not understood, or no approved info | The coach says so and offers a person or provider (system prompt) |
| No resource found | The coach says so; suggests Resources, the navigator or the study team |
| Resource search or another tool fails | The tool result is marked as an error and the coach continues without it |
| Voice (ElevenLabs) fails | Falls back to the browser's own speech synthesis or recognition; failing that, the mic button is hidden and members type |
| Crisis | See the safety protocol above. It works even when Claude is down (keyword layer). |

## Voice and the animated coach

- **Voice output:** ElevenLabs text-to-speech through `POST /api/ai/speech` (MP3, voice `ELEVENLABS_VOICE_ID`, model `ELEVENLABS_MODEL_ID`). Without a key, the browser's speech synthesis reads the reply.
  - Replies to voice messages are always read aloud.
  - Members can turn on "Read replies aloud" for everything.
- **Voice input:** the browser records and ElevenLabs transcribes it (`POST /api/ai/transcribe`, `scribe_v1`; the audio is not stored). Without a key, the browser's own speech recognition is used where it exists. Voice messages are sent straight away.
- **Avatar:** the in-house animated SVG coach (`components/coach-avatar.tsx`), with four looks (Amara, Jordan, Luis, Kai) chosen in settings.
  - It breathes and blinks, and raises its brows while listening.
  - It shows thinking dots, and its mouth follows the actual loudness of the ElevenLabs audio (Web Audio analyser).
  - With browser voices, the mouth moves with each spoken word.
  - Motion stops under `prefers-reduced-motion`.

## Privacy (PRD §8)

- **What the coach sees:** only the member context note and what the member types.
  - It never gets check-ins, tracker entries, survey scores, study IDs, phone numbers or email.
  - The member can switch off personalization (Coach settings); this applies to new conversations.
- **Retention:** conversations are **kept for the study; nothing is deleted.** "Clear" in the app hides a conversation from the member (`ai_conversations.hidden_at`). Members are told this in the history panel.
- **Who can read conversations:** only staff with `ai.review`, through a safety alert, and every view is audited.
- **Data minimisation:**
  - Usage events, logs and job events carry ids and counts only.
  - Device location is rounded to about 100 m, used for one message's resource search, and never stored.
- **Existing controls:** permissions, sessions and the 150-day auto-block are unchanged.

## Analytics (PRD §9, §14)

`/admin/ai` covers the last 7, 30 or 90 days:

- **Engagement:** members, conversations, messages, voice share, average reply time.
- **Quality:**
  - "Rated helpful" (member thumbs).
  - "Resolved without a person": conversations answered with no alert and no hand-off.
  - Fallback count, places shown.
- **Safety and people:** alerts, open alerts, hand-offs offered and sent.
- **Volume:** messages per day, token use.

New `usage_events` types: `ai_coach_view`, `ai_message`, `ai_voice_input`, `ai_voice_output`, `ai_resources_shown`, `ai_handoff_shown`, `ai_handoff_sent`, `ai_safety_flag`, `ai_feedback`, `ai_fallback`.

The PRD's "60% response accuracy" target needs a study-team review sample. Reviewers can read conversations through alerts, or the team can add a sampled-review tool.

## Setup

Add to `.env` (all optional; without them the coach runs in fallback mode with browser voices):

```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
# Optional voice choice:
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Then:

1. Run `pnpm db:migrate`.
2. Optionally seed the draft articles.
3. Set the safety email and on-call phone in Settings.
4. Run `pnpm jobs` so alerts are delivered by Inngest.

Tests: `pnpm test` covers the keyword safety check, prompt and context building, search query building and the Markdown renderer.

## Open items for the product and study team (PRD §15)

1. Review, edit, approve and publish the seeded knowledge articles. Decide which tips and pages are "approved" for the coach (today: all published content).
2. Confirm the crisis keyword list, the classifier levels, the alert recipients and the on-call workflow. Decide whether "support" requests should also text the on-call phone.
3. Confirm the fallback wording and limits (40 messages an hour, 60 turns per conversation).
4. Confirm retention: kept indefinitely for the study, hidden-not-deleted for members.
5. Supported languages: English prompts. Claude will answer in the member's language, but approved content is English.
6. Choose the ElevenLabs voice (and confirm a BAA or data terms if required). Accessibility review with members.
7. Define accuracy measurement and "successful resolution" (the overview shows proxies).
8. UAT and safety validation with real scenarios before launch (PRD §12). Run them against a non-production database.
