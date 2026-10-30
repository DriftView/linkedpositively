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
4. **The reply.** Claude Sonnet 5.5 (`claude-sonnet-5-5`, `VOICE_MODEL` in `claude.ts`) at effort `low` for typed and spoken messages, so replies start sooner. The separate safety classifier stays on Opus. The reply is saved with the model that wrote it. Both get:
   - the static system prompt (`prompt.ts`, cached);
   - the full stored conversation (tool calls and thinking blocks included, never edited);
   - four tools (`tools.ts`):
     - `search_knowledge`: Postgres full-text search over approved content.
     - `find_resources`: the existing resource locator, with the member's device location if they shared it, else a city or ZIP they named, else their profile location.
     - `connect_peer_navigator`: a card with a draft message the member edits and sends to their navigator. Members without a navigator get study-team contacts instead.
     - `request_human_support`: Safety layer 3. The coach raises an alert itself (support, elevated or urgent).

   Spoken turns are tuned for a fast first word: the knowledge search for the member's own words runs alongside the first database reads and goes to Claude as an already-finished `search_knowledge` round (stored like any tool round), so most answers need one model call instead of two; thinking is `between_tools` (no extended thinking); and the conversation and member message are written while the reply starts (tools, alerts and the final save wait for those writes). Also for spoken turns:
   - The search may hold up the reply for 350 ms at most (`SPOKEN_SEARCH_WAIT_MS`). After that Claude starts anyway and can call `search_knowledge` itself.
   - Small talk ("hi", "thanks", "ok cool": `isSmallTalk` in `lib.ts`) skips the search.
   - The reply is capped at 2,048 tokens, and the persona asks for a short opening sentence, so the voice can start after a few words.
   - The first spoken chunk is cut at the first comma when the first sentence is long.

   Each turn logs `ai chat timing`: ms from the request to each step (`loaded`, `searched`, `firstText`) and to the first `start`, `text`, `speech`, `spoken` and `done` events. In development the browser console also shows `[voice timing]`, measured from the moment the member stopped talking: `transcript`, `sent`, `firstByte`, `firstText`, `firstAudioArrived`, `heard`.
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

- **Spoken replies stream.** When a reply is to be heard, it is spoken sentence by sentence while it streams, not after it finishes. Replies are heard when:
  - the member's message was a voice message;
  - the member is in a hands-free voice chat;
  - "Read replies aloud" is on.
- **Server voice (ElevenLabs):**
  - The chat request asks to `speak`. `speech-stream.ts` cuts the streamed text into sentences (`SpeechChunker` in `voice-lib.ts`), with a short first chunk so speech starts quickly.
  - Each sentence is **streamed** from ElevenLabs (`text-to-speech/{voice}/stream/with-timestamps`, raw PCM `pcm_22050`, speaker boost off), at most 3 sentences at a time, with `previous_text` for natural intonation.
  - Each piece of audio goes out as a `speech` event the moment ElevenLabs makes it: `seq` (the sentence), `part`, and `last` on the sentence's final piece. Sentences go in order, before `done`. A piece's visemes are timed from the start of its sentence.
  - Up to 2,500 characters are spoken per reply. Speech stops if the member leaves the page; the turn itself still finishes and is saved.
- **Browser voice fallback:** without ElevenLabs, or when a request fails, the browser's own speech synthesis reads each sentence. Once ElevenLabs fails during a reply, the browser reads the rest, so the voice doesn't switch back and forth.
- **Replaying a reply:** `POST /api/ai/speech` reads a saved reply in the coach's voice. With `{ preview }` it reads a fixed sample sentence for the coach picker. It never voices arbitrary text.
- **Playback** (`use-coach-voice.ts`):
  - One Web Audio context, unlocked on the member's first tap, which also lets iOS play later chunks.
  - Streamed PCM is played without decoding. Each piece is placed straight after the last one on the audio clock, so speech starts on the first piece and there are no gaps between sentences.
  - Saved replies, previews, backchannels and the greeting are MP3.
  - Stopping fades the voice out over 40 ms (no click).
- **When ElevenLabs is out of credits or down** (`voice-status.ts`): out of credits (402, or 401 `quota_exceeded`) or a rejected key skips ElevenLabs for 10 minutes; two network errors or 5xx in a row skip it for 2 minutes (429 "busy" never does). While it's skipped, replies are read by the browser's own voice straight away, sentence by sentence, then ElevenLabs is tried again. The browser voice matches the coach (a female voice for Mina where the browser has one, `pickBrowserVoice` in `voice-lib.ts`). The state is per server instance. Voice chat and video are unchanged: during an outage, voice chat turns may fail to transcribe and the video face stays still.
- **Admin banner** (`components/admin/voice-status-banner.tsx`, on the admin dashboard and the AI Coach page): shows when ElevenLabs is being skipped, out of credits, or under 20% of the period's credits (from `GET /v1/user/subscription`, checked every 5 minutes at most). Nothing shows when usage-based billing is on and it's working. The AI Coach page also says when the credits couldn't be checked (the API key needs the User: Read permission).
- **Hands-free voice chat** (`use-hands-free.ts`, the voice chat button next to the mic):
  - An open mic with voice activity detection (echo cancellation and noise suppression on). The member just talks, and a pause ends their turn. How long a pause depends on the live words so far (`endOfTurnSilenceMs` in `voice-lib.ts`):
    - 0.35 s when they sound finished (a full stop or a question mark);
    - 0.9 s after "and", "um" or a trailing comma;
    - otherwise 0.55 s (`END_OF_TURN_SILENCE_MS`).

    The mic is checked every 20 ms.
  - With ElevenLabs, each turn is **transcribed live** while the member talks (`live-transcription.ts`, real-time `scribe_v2_realtime`), so the words are ready when they stop. The browser gets a single-use token from `POST /api/ai/transcription-token` (the API key stays on the server). Audio is only sent from just before speech is detected (a 0.5 s pre-roll) to the end of the turn; our pause detection ends the turn (manual commits).
  - **Fallback:** each turn is also recorded. If live transcription is unavailable, breaks, or is slow (over 1.5 s), the recording is uploaded and transcribed as before (`scribe_v1`, sound tags off). Without ElevenLabs, the browser's speech recognition is used. Push-to-talk mic messages always upload.
  - The words are sent, the coach speaks, then it listens again.
  - **Interrupting:** talking over the coach stops it. So do "Stop talking" and tapping the mic.
    - **Detection:** about 0.2 s of speech. `TalkOverDetector` in `voice-lib.ts` learns how loud the coach's own echo is and ignores short dips between syllables. It keeps the echo level for the rest of the call, so after the first reply it listens again almost as soon as the coach starts.
    - **While thinking:** talking while the coach is still thinking also counts, and that reply isn't spoken.
    - **What stops:** the voice fades out at once and the reply is **cancelled** (`interruptReply` in `ai-coach.tsx` aborts the request). The server stops Claude and the speech, and saves what was said so far.
    - **What the coach is told:** the member's next message carries what they actually heard (`heard()` in `use-coach-voice.ts`, sent as `interrupted`). The coach gets it as a `<voice_note>`, so it doesn't assume the rest was heard.
    - **The next turn:** what the member says while interrupting is kept as the start of their turn, and is sent at once. It waits only for the cancelled reply's row to be saved (`savingTurns` in `engine.ts`, at most 1.5 s), so the history stays in order.
  - **Outside voice chat** (replies to mic messages, "Read replies aloud", replaying a reply), talking stops the coach too (`use-talk-over.ts`): while it speaks, the mic is open and checked on the device only (nothing recorded or sent), and only if the member has already allowed the microphone, so a reply never brings up a permission prompt. The mic warms up as soon as a reply is on its way to be heard, so it's ready when the coach starts. Tapping the mic button, or "Stop {coach} talking" above the composer, also stops the coach.
  - **Captions** of the current sentence show above the conversation. The full reply is in the conversation as usual.
  - **Controls:** Mute and End voice chat. The mic switches itself off after 90 s without speech.
  - Usage: `ai_message` events carry `handsFree`.
- **Push-to-talk:** the mic button still records one message and sends it.
- **Faces** (`components/coach-portrait.tsx`): where the video coach is available, the coach's photo (`/public/coaches/`) shows outside calls; otherwise the drawn coach does.
- **Drawn coach** (`components/coach-avatar.tsx`): the fallback when video isn't available or fails (no vendor, no model files, works offline). Each coach has a drawn look that matches its photo.
  - An illustrated SVG character, in every size (coach stage, voice chat, chat header, thumbnails, coach picker). `still` draws a static picture.
  - Motion (`coach-motion.ts`): breathing, a slow head sway, blinks at irregular intervals, and small glances; looking up and aside while thinking, and nods while the member talks (mic loudness); brows that lift on loud syllables; a mouth that follows **visemes** (mouth shapes from ElevenLabs' per-character timing; estimated per word for browser voices) scaled by the voice's loudness. Blinks close fast and open slower, and the head makes small, slow turns that the eyes lead.
  - Under `prefers-reduced-motion`, idle motion stops and only the mouth moves.
- **Video coach** (Anam, `avatar.ts`, `components/use-video-coach.ts`): a lifelike face plays the coach for the whole voice chat. It starts with the call (no button); the coach's photo shows while it connects.
  - **Only the face is Anam's.** It runs in audio passthrough: we send the ElevenLabs audio of each sentence (as 16 kHz PCM, `pcm.ts`) and the face lip-syncs it. Claude, the safety layers and the voice stay ours; the face never hears the member (`disableInputAudio`).
  - `POST /api/ai/avatar-session` hands the browser a one-call session token for the member's coach (its `anamAvatarId` in `coach-design.ts`; the browser can't name an avatar, and the API key stays on the server) and records an `ai_video_session` event.
  - In `use-coach-voice.ts`, while the face is live, audio goes to it instead of the speakers. The queue still waits each sentence's length, so captions, "Speaking" and hands-free turn-taking are unchanged. Interrupting ("Stop talking", or talking over it) interrupts the face.
  - **Costs:** Anam bills per minute, and every voice chat now uses video. Video runs only while a call is open: it ends when the call ends, pauses while the tab is hidden (and comes back when it's shown), and after a failure the drawn coach takes over for the rest of the call (with a toast). The admin "Video coach" setting turns it off for everyone.
  - **Offered only when** the Video coach and Voice settings are on and the server has `ANAM_API_KEY` and ElevenLabs. Browser-voice sentences (no ElevenLabs audio) play through the speakers with the face still.

## Greeting on opening the app

The floating coach says hello when a member opens the app (`use-coach-greeting.ts`, `greeting.ts`).

- **What it does:** a speech bubble with a short line appears by the coach bubble, with a soft pulse.
  - The line fits the time of day and names the coach, for example "Good evening, Sam. I'm Mina, your AI coach. Small steps still count…".
  - With voice on, the coach says it.
- **Wording:** lines come from a fixed, reviewed list (`GREETINGS`), never from the model, and assume nothing about how anyone feels.
  - The member's first name is in the text only, and only when personalization is on.
  - The audio is the same for everyone with that coach, so the speech route makes each line once per server instance and keeps it (`{ greeting, hour }` in `POST /api/ai/speech`).
- **Sound:** browsers only allow sound after a tap or key press on the page, and opening the app after signing in is a new page. So the coach speaks at once only when sound is already allowed. Otherwise it speaks on the member's first tap or key press anywhere, or on "Hear {coach}". The bubble's buttons open the coach or close the greeting.
- **When it shows:**
  - At most once a browser session and once a day.
  - After the page settles (1.2 s), and after any open dialog (a survey, a level-up) is closed.
  - It goes away 8 s after it's said, or after 30 s unheard.
- **When it never shows:** on the AI Coach page, while the panel is open, during staff impersonation, for members without the coach (the control arm), or when the coach is switched off.
- **Switching it off:** members can turn it off under Coach settings, "Greet me when I open the app". This is stored on the device.
- **Accessibility:** the text is announced politely to screen readers. Under reduced motion there's no pulse or slide.
- **Usage:** `ai_greeting` events (`heard: false` when shown, `true` when said).

## Choosing a coach

Members choose their coach under Coach settings → "Choose your coach" (also linked under the coach on desktop). They pick a coach, not design one: each coach's name, pronouns, voice, photo, video face and drawn look are fixed in `coach-design.ts` `COACHES`. Each coach's voice can be heard first.

- **Coaches:** Mina (she/her, the "Gentle" ElevenLabs voice). To add a coach: add its id to `AI_COACH_IDS` (`schema/ai.ts`) with a migration for the `look` check, add an entry to `COACHES` (name, pronouns, voice, Anam avatar id, photo in `/public/coaches/`, drawn look), and the picker shows it.
- **Style:** members still choose a tone (warm, upbeat, calm, direct) and reply length (short, medium, detailed).

How the choice is used and stored:

- **Fixed choices only.** There is no free-text persona, so a choice can't talk the coach out of its rules.
  - The coach's name and pronouns, plus the tone and length, go into a short persona block after the cached system prompt (`buildPersona` in `prompt.ts`).
  - The system prompt says the persona changes only how the coach sounds: safety comes first and it is still an AI coach.
  - In a crisis the coach keeps it short, whatever the length setting.
- **Storage:** `ai_preferences.look` holds the coach id, plus `tone` and `reply_length`. Migration `0005_fixed_coaches` moved every member to Mina. The old designer columns (`coach_name`, `coach_pronouns`, `appearance`, `voice`) are kept but unused.
- **Usage events:** each save records an `ai_coach_designed` event with the coach, tone and length.

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

New `usage_events` types: `ai_coach_view`, `ai_message` (with `voice` and `handsFree`), `ai_voice_input`, `ai_voice_output`, `ai_resources_shown`, `ai_handoff_shown`, `ai_handoff_sent`, `ai_safety_flag`, `ai_feedback`, `ai_fallback`, `ai_coach_designed`.

The PRD's "60% response accuracy" target needs a study-team review sample. Reviewers can read conversations through alerts, or the team can add a sampled-review tool.

## Setup

Add to `.env` (all optional; without them the coach runs in fallback mode with browser voices):

```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
# Optional voice choice:
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
# Optional video coach (needs ElevenLabs too):
ANAM_API_KEY=...
```

Each member's coach voice comes from `COACH_VOICES` in `coach-design.ts`; `ELEVENLABS_VOICE_ID` is only a fallback. For the fastest spoken replies (hands-free chat), consider `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`: it costs less and starts sooner, with slightly less expressive speech.

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
6. Confirm each coach's voice is available in the study's ElevenLabs account (and confirm a BAA or data terms if required). Accessibility review with members.
7. Define accuracy measurement and "successful resolution" (the overview shows proxies).
8. UAT and safety validation with real scenarios before launch (PRD §12). Run them against a non-production database.
9. Choosing a coach, the video coach and hands-free voice chat change what the intervention arm experiences. Confirm with the PI or IRB, and decide how the design choices (`ai_coach_designed`) enter the analysis.
10. Hands-free voice chat keeps the mic open: confirm the in-app wording ("Your mic is on…") and the 90 s auto-off.
