# 02 — Thrive Tips (incl. tailored tips) and the Weekly Check-in

Derived from the Drupal module code (the DB read was blocked, so question wording that only lives in DB nodes is not
available). Paths are relative to `lp/sites/all/modules/` unless noted. Abbreviations:

| Short | File |
|---|---|
| `TT` | `twm_tailored_tips/twm_tailored_tips.module` |
| `TTB` | `twm_tailored_tips/includes/block/twm_tailored_tips.block_default.inc` |
| `TTI` | `twm_tailored_tips/twm_tailored_tips.install` |
| `TTF` | `twm_tailored_tips/includes/flags/twm_tailored_tips.flags_default.inc` |
| `TPL` | `twm_tailored_tips/templates/twmtailoredtips.tpl.php` |
| `TU` | `twm_utility/twm_utility.module` |
| `GM` | `youthrive_game_mechanics/youthrive_game_mechanics.module` |
| `WC` | `twm_weekly_checkin/twm_weekly_checkin.module` |
| `WCI` | `twm_weekly_checkin/twm_weekly_checkin.install` |
| `WCB` | `twm_weekly_checkin/theme/twm-weekly-checkin-block-content.tpl.php` |
| `WF` | `weekly_checkin_feedback/weekly_checkin_feedback.module` |
| `WFI` | `weekly_checkin_feedback/weekly_checkin_feedback.install` |
| `EFM` | `thrive_tips_efm/*` (feature export: fields, views, menus, permissions) |

Related specs: 01 (fields of `thrive_tips`, `weekly_checkin_prompt`, `weekly_checkins`; vocabularies; tables
`weekly_checkin_feedback`, `week_days`, `user_tips_report`), 03 §5.2.2 (tips interleaved in the wall feed) and §5.11
(tip comment → wall "tip-notification" post), 04 §2.2 P6 (tip-view points), 06 Part 2 §2.1/§2.3 (views), Part 3 §3.5
and §3.11 screens 5 and 9.

---

## 1. Thrive Tips

### 1.1 Content (node type `thrive_tips`, 157 nodes; 01 §3.5)

| Field | Meaning | Rewrite (`Tip`) |
|---|---|---|
| `title` | Tip title | `title` |
| `field_tip_type` (required) | `Html`, `Video`, `Pdf`, `Offsite Content` | `type`: `html`/`video`/`pdf`/`offsite` |
| `field_html_content` | Body HTML (visible when type = Html; in practice filled on 151 nodes regardless of type) | `html` (staff-sanitized) |
| `field_description` | Short description (visible for Pdf/Video/Offsite) | `description` |
| `field_video_link` (video_embed_field, YouTube/Vimeo) | Video | `videoUrl` (+ derived embed URL) |
| `field_select_pdf_file` | PDF | `pdfKey` (private storage) + `pdfName` |
| `field_link` | Off-site link | `link` |
| `field_pullquote` | Pull quote | `pullquote` |
| `field_template` | Layout style: `text_linequote`, `text_blockquote`, `text_paragraph`, `image_only`, `image_text`, `video_only`, `video_text`, `text_bullet` (21 nodes set) | `template` (used as a CSS variant) |
| `field_thrive_tags` (required, ∞) | Topics, vocabulary `thrive_tips_tags` (80 terms) | `tagIds` → `TipTag{kind:"tag"}` |
| `field_imbaaq_category` | IMB/AAQ category, vocabulary `thrive_tips_categories` (7 terms, 0 nodes use it) | `categoryId` → `TipTag{kind:"category"}` |
| `field_hashtags` | vocabulary `hashtags`, 0 rows | kept in `extra` by the migration only |
| `field_display_day` (1–90) | Release day in cycle 1 (`TTI:476-486`, EFM help text) | `displayDay` |
| `field_display_day_two` (1–90) | Release day in cycle 2 (day 91 = 1) | `displayDayTwo` |
| `field_user_field` (`i1…i9`, `m1…m9`, `b1…b17`) | Tailoring: which baseline-survey score to test | `rule.field` |
| `field_operator` (`<`, `>`, `==`, `<=`, `>=`, `!=`) | Tailoring comparison | `rule.operator` |
| `field_value` (int) | Tailoring threshold | `rule.value` |
| `status`, `uid`, `created`, `changed` | | `published`, `authorId`, timestamps |

Conditional visibility in the edit form (01 §3.6): PDF field when type Pdf, video when Video, HTML when Html,
description when Pdf/Video/Offsite, link when Offsite. The rewrite editor follows the same rule. The text format of
`field_html_content`/`field_description` is forced to `thrive_editor` (`TU:148-155`).

### 1.2 Release schedule (day N of the study)

Legacy (`TT:332-369`, `TTB:606-631`):

```
days = 1 + ceil((today 00:00 server time − field_intervention_start_date) / 86400)       // TT:353-368
today's tips (`/tips`, home block):
  if days <= 90: tips WHERE display_day == days                                          // cycle 1
  else:          tips WHERE display_day_two == days − 90                                 // cycle 2
library ("all released"): display_day IN (0,1,…,days)  (after day 90: every cycle-1 day, i.e. all tips)
"N New Tips" = count(tips WHERE display_day == days)  (or display_day_two == days − 90)  // TTB:635-649
past-tip/{day}: renders days day−1 … day−5 (AJAX "previous tip")                         // TT:68-118
```

The PN copy counts days from `users.created` instead of the intervention start (`ecoach/.../TT:356`) and its `/tips`
page lists every tip with `display_day <= days`, plus cycle-2 tips after day 90 (`ecoach/.../TTB:112-178`,
`twmuserdailytips.tpl.php`).

Defects: server timezone instead of the participant's; `days − 90` after day 180 matches nothing (tips stop); the
cycle-2 argument in list mode is the string `"90,1,…,90"`; participants without a start date get a huge day number.

**Rewrite** (`src/features/tips/schedule.ts`):

```
day      = studyDay(interventionStartDate, now, viewer.timezone)        // 1 = start date, in the user's timezone
cycle    = floor((day − 1) / 90) + 1 ;  dayInCycle = ((day − 1) mod 90) + 1
tip day in cycle c = (c == 1) ? displayDay : (displayDayTwo ?? displayDay)
released(tip)   = the tip's day in cycle 1 ≤ day, or any later cycle has started (after day 90 every tip is released)
releasedAt(tip) = start + (latest cycle release day − 1) days  (00:00 in the user's timezone)
today's tips    = tips whose day in the current cycle == dayInCycle
N new tips      = tips with lastTipsSeenAt < releasedAt ≤ now   (lastTipsSeenAt unset → today's tips)
```

Cycles repeat (2, 3, … all use `displayDayTwo`) instead of stopping after day 180. Participants without a start date
see nothing released yet ("Your tips start when your study begins"); staff (no `tips.earnPoints`) preview every tip.

### 1.3 Tailored ("recommended", "highlighted") tips

Legacy (`TPL:4-15`, `TU:238-253`): for every tip row, if the tip has `field_user_field`, compare
`version_compare(user.{field}, field_value, field_operator)`; true → CSS class `hilight` (a highlighted triangle) and
the `data-tip="hilight"` attribute that the carousel sends to `/tip-points/{nid}/hilight`. The user fields `i1…b17`
are the baseline-survey scores exported from Qualtrics (06 §1.12: export tags `I1..I9`, `M1..M9`, `B1..B17`). A flag
`twm_tailored_tips_tailored` ("Highlighted Thrive Tip", "Added to your starred list.", `TTF:9-38`) records
highlighted tips per user; the `RECOMMENDED` tab (`thrive-tips/recommended`, view `thrive_tips_all:block_3`) lists
released tips flagged with it, and the engagement report counts "Tailored Thrive-Tips Viewed" through it (06 §1.2).

Pseudo-code of the rewrite (`src/features/tips/tailoring.ts`, unit-tested):

```
isRecommended(tip, scores):
  if !tip.rule: return false
  v = scores[tip.rule.field]; if v is null/undefined/NaN: return false          // legacy: unset user value → false
  return compare(v, tip.rule.operator, tip.rule.value)                          // numeric compare (version_compare on ints)
```

Scores live in `profile.extra.tailoring` (`{ i1: number, … b17: number }`), written by the survey sync (surveys area)
and the migration from the `i1…b17` user fields. Recommendation is computed at read time (no flag table); the tip
view record stores `recommended` as it was at first view, which replaces the flag for reports.

### 1.4 Routes and screens

| Legacy route | What | Rewrite |
|---|---|---|
| `tips` (`TT:19-24`) | "Your Tips \| N New Tips" + today's tips carousel (Swiper), toggle "Explore Tips \| Favorite Tips" (06 §3.5) | `/tips` |
| `past-tip/%` (`TT:49-54,98-118`) | AJAX previous-days tips | folded into the `/tips` carousel ("Earlier this week") |
| `thrive-tips` (`TT:13-18,165-168`) | Library ALL (accordion by category) | `/tips/explore` |
| `thrive-tips/recommended` (`TT:25-30,170-173`) | Library RECOMMENDED | `/tips/explore?for=you` |
| `thrive-tips/favs` (`TT:31-36,174-177`) | Favourites ("No Favorite Tips found.") | `/tips/favorites` |
| `thrive-tips/tags[/a+b]` (`TT:37-42,178-182`, CF.js multi-select) | Tag pills (multi-select, `+`-joined in the URL) + matching tips | `/tips/explore?tags=slug1,slug2` |
| `comment-tip/%` (`TT:55-60,189-192`) | Single tip + comments + reactions + comment form | `/tips/{id}` |
| `thrive-tips/thrive-content/{nid}/{tid}` | Tip in a category + "Related Tips" block (`TTB:598-601`) | `/tips/{id}` ("More on this topic") |
| `tip-points/%/%` (`GM:3-11,460-490`) | Points + view count | server action `recordTipView` |

Permissions `access_twm_tailored_tips_all/_recommended/_favs/_tags` → `tips.view`; `access_gain_tips` →
`tips.earnPoints`.

Carousel (06 §3.6, CF.js `:215-259,346-359`): autoHeight, 20px gap, "current / total" counter, prev hidden on the
first slide and next on the last; on init and every slide change it POSTs `/tip-points/{nid}/{hilight|unhilight}`.
Tip card (`TPL:17-69`): favourite heart (flag `favourites`) left; title (`h6`), `field_html_content`, optional
video, tag pills (click → `/thrive-tips/tags/{term}`), comment icon that reveals the comment form.

### 1.5 Tip views and points

`assign_tip_points($nid, $highlight)` (`GM:460-490`): every call increments `user_tips_report(uid,nid).count`
(`GM:512-534`); the first call per (uid, nid) ever (cache bin `cache_thrive_tips`, key `"{uid}-{nid}"`) awards
**5** points (`tailored-thrive-tip`) if `$highlight == 'hilight'` else **2** (`thrive-tip`) and re-evaluates the
level. Defects: the client decides the highlight (a participant can always claim 5); GET request with side effects;
no check that the tip is released or even a tip.

Rewrite: `recordTipView(tipId)` (POST action, `tips.view`): validates the id, checks the tip is published and released
to the viewer, upserts `TipView{userId, tipId}` (`count += 1`, `firstViewedAt`, `lastViewedAt`, `recommended` at first
view), then `award({ reason: recommended ? "tip_view_recommended" : "tip_view", key: "tip-view:{tipId}" })` (once per
tip, whichever reason comes first) and `trackUsage("tip_open", { tipId })`. The carousel sends it after a slide has
been visible for ~1.2 s (not for swipe-throughs); the tip page sends it on open.

Achievement bins `thrive-tip` (1, 5, 10, 15, 30) and `tailored-thrive-tip` (2, 10, 20, 30, 60) (04 §2.6) belong to
the gamification area; they can count `PointEntry` rows with those reasons.

### 1.6 Favourites

Flag `favourites` (fid 10, per user, on `thrive_tips`). Rewrite `TipFavorite{userId, tipId}` (unique), toggled
optimistically from any tip card. The favourites report (06 §1.8) is a participant × tip matrix of these.

### 1.7 Comments on tips

`tips_comment_post_form` / `_tips_comment_ajax_submit` (`TT:197-302`): plain-text comment (tags stripped), subject =
first 49 chars; on save `share_tip_comment()` (`TT:303-322`) creates a wall post `title='tip-notification'`,
`field_comment_id=cid` (03 §5.11). Comments render with avatar, name → profile, "N ago", body filtered with
`limited_html_for_wall_posting`, the 5 comment reactions (haha 14, love 16, thumbs-up 36, fire 22, target 26) and the
abuse flag (`TPL:71-193`). Commenter earns 2 points (`GM:169-171`). **The rewrite delegates all of this to the
community area** (`CommentSection({ target: { type: "tip", id } })`, `ReactionBar`), including the wall mirror post.

### 1.8 Wall and search integration

- The wall prints today's tips on top (`TTB:623-631`) and interleaves released tips at their release date (03
  §5.2.2). Contract: `feedTips(viewer, { limit, before })` returns released tips ordered by `releasedAt` desc.
- Site search lists tips whose HTML contains all words (06 §2.1 `search_thrive`). Contract: `searchTips(viewer, q,
  { page })` (released tips only for participants; title, description, HTML and tag names).
- Tag pills in wall posts (`#tag` → `/thrive-tips/tags/{tag}`) → `/tips/explore?tags={slug}`.

### 1.9 Admin (06 §2.3)

- `admin/tips-list` (`tips_list`): Title, Tags, Created, Edit; "Title contains" filter; bulk delete; 50/page.
- `thrive-tips-all-view-for-admin`: all tips with Days (1), Days (2); used to check the schedule.
- `thrive-export`: Title, category, pull quote, HTML, tags; "Export to Doc".
- Create/edit/delete `thrive_tips` (Coordinator, admin); manage and merge tag/category terms (admin).

Rewrite `/admin/content/tips` (`content.manage`): searchable, filterable table (type, tag, status, tailored) with
day 1/day 2, views, favourites; bulk delete; a **schedule** view (days 1–90, both cycles, gaps highlighted); CSV
export; editor with type-dependent fields, rich text, video preview, PDF upload, tags, schedule, tailoring rule and a
live participant preview. `/admin/content/tips/tags`: create, rename, delete and merge tags and categories.

---

## 2. Weekly Check-in

### 2.1 Content: prompts (node type `weekly_checkin_prompt`, 10 nodes; 01 §3.5)

| Field | Meaning | Rewrite (`CheckinPrompt`) |
|---|---|---|
| `field_sequence_prompt_number_` (1–10, required) | Which week in the 10-week rotation | `sequence` (unique) |
| `field_prompt_text` | Likert question | `likertText` |
| `field_prompt_options` (`"1\|Value,2\|Value,…"`) | Likert options (raw score \| label) | `likertOptions: {value, label}[]` |
| `field_open_ended_prompt_text` | Open question | `openText` |
| `field_open_ended_prompt_instruct` | Placeholder | `openPlaceholder` |
| `field_feedback_high_long` / `_medium_long` / `_low_long` (HTML) | Feedback by Likert band | `feedbackHigh` / `feedbackMedium` / `feedbackLow` |
| `field_less_adherent_feedback` / `field_more_adherent_feedback` | Medication feedback | `lessAdherentFeedback` / `moreAdherentFeedback` |
| `field_medication_taking_feedback` | Unused by code | `medicationFeedback` (kept) |

The live wording is only in the DB. The rewrite seeds clearly labelled sample prompts and staff edit them at
`/admin/content/check-in`.

### 2.2 Answers (node type `weekly_checkins` "Week{N} Feedback" + table `weekly_checkin_feedback`)

`weekly_checkins` (0 live nodes): `field_likert_prompt_value`, `field_open_ended_prompt_value`, `field_feedback_long`,
`field_feedback_short` (meds feedback), `field_user_id`; one node per user per week, updated on re-submit
(`WC:717-774`). `weekly_checkin_feedback` (875 rows, `WCI:93-164`): one row per weekday with **HTML fragments** for
meds/mood, `used` 0/1/NULL, `reminder_id`, `week_count` ("Week N"), `date`. `week_days` is a Sunday…Saturday lookup
(`WFI:234-243`).

Rewrite: one `WeeklyCheckin` per (user, week) with `days[] = {date, medsTaken, mood (daily-tracker code 1–12), used}`, the prompt snapshot
(sequence + texts), `likertValue`, `openText`, `feedbackLong`, `feedbackShort`, `submittedAt`, `autoSubmitted`.
🔒 health data: only the owner sees it.

### 2.3 Week number and prompt rotation

Legacy `week_counts()` (`WC:531-586`): start = the user's first `reminder_stats` date (fallback `reminders.created_at`)
moved back to the previous Sunday; `week_count = floor(days since / 7)`; prompt sequence = `week_count` cycled into
1…10 (`week % 10`, 0 → 10). Week 0 → the Continue button is disabled and the home block is hidden (`WC:69-77,
276-293`). The reviewed week is the **previous calendar week** (Sun–Sat, `WC:162-167`).

Defects: `reminder_stats`/`reminders` tables no longer exist (the week is effectively always 0 in the snapshot);
server timezone; calendar weeks vs. study weeks.

Rewrite (`src/features/checkin/schedule.ts`): study weeks from `interventionStartDate` in the participant's timezone.
The check-in for week *k* reviews study days `7(k−1)+1 … 7k` and opens when week *k* has ended (study week ≥ k+1). It
stays open for the following 7 days; after that it is auto-closed. Prompt sequence = `((k − 1) mod 10) + 1`.

### 2.4 The form (`/weekly-checkin`, `WC:128-526`, 3 AJAX steps with a 30/70/100 % progress bar)

1. **Your week** — "Below are **your responses** to the text messages you should be receiving every day for
   medication reminders. Click on the days that you have used street drugs or alcohol under the "Used" column and click
   continue to get to the next section of your Weekly Check-in." (`WC:14`). A Sun…Sat table: Meds (took = green check,
   `Skip` = empty circle, `RemindLater` = yellow, no answer = stop circle), Mood (emoji image), **Used?** checkbox (only
   for days with data). Submit stores the 7 rows (`WC:665-716`) and writes `used_status` back.
2. **Reflect** — Likert radios (`likertText`, options) and a textarea (`openText`, placeholder). Hidden: the meds
   feedback is chosen here: if prompt sequence ≠ 1 → `moreAdherentFeedback` when all 7 days were "Yes", else
   `lessAdherentFeedback` (`WC:381-403`). Save stores the `weekly_checkins` node (`WC:717-774`).
3. **Thanks!** — Likert 1–2 → `feedbackLow`, 3 → `feedbackMedium`, 4–5 → `feedbackHigh`, then the meds feedback
   (`WC:445-490`).

Rewrite: same three steps on one page with an animated step indicator, the week table built from the daily tracker
check-ins (meds yes/no + mood; the tracker area owns them), "Used?" toggles per day, Likert as large tappable cards,
autosized textarea (2,000 chars), a review-and-edit flow (answers can be changed until the window closes), and the
feedback screen. Submitting awards `weekly_checkin` (10 points) once per week.

### 2.5 Availability prompt and auto-submit

- Block `twm_weekly_checkin` (`WC:19-78`, `WCB`): "Weekly Check-In — It's time for your weekly check-in!" → linked to
  `/weekly-checkin`, shown when week ≥ 1 and the user has not submitted this calendar week.
  Rewrite: `weeklyCheckinDue(viewer)` + `<CheckinDueCard>` for the home page, and an in-app notification
  (`checkin_reminder`, dedupe per week) sent by the daily job when a check-in opens.
- `Weekly_Checkin_Data_AutoSubmit($uid, $tz)` (`WC:851-928`, Saturday 23:00 local): if the week was not submitted,
  store the 7 day rows with `used = 0` and mark the reminders `used_status = 2`. Rewrite: the daily job auto-closes
  expired windows by storing a `WeeklyCheckin{autoSubmitted:true}` snapshot with `used = null` (unknown, not "no").

### 2.6 Feedback history (`/weekly-feedback`, `WF:33-212`)

"Weekly Check-In" select of past weeks ("Week N  Mon DD-DD"), AJAX-loads the week's table (Meds, Mood, Used? — used
1 = green check, 0 = empty image, NULL = stop circle, "No User Logs Found" when empty) and "Personal Log" = the
open-ended answer. Defects: weeks keyed by the row `date` (the table's insert time), `week_count` string matching,
`$uid` shadowing. Rewrite: `/check-in/history` lists past weeks (answered / auto-closed) and `/check-in/week/{k}` shows
the table, your answers and the feedback you got.

### 2.7 Admin

Staff create/edit/delete prompts (Coordinator, admin) — `/admin/content/check-in`: the 10-slot rotation, missing
slots highlighted, editor with Likert option builder (1–5), feedback bands and a live preview. Weekly check-in answers
are research data for the reports area (not shown in this admin screen).

---

## 3. Defects fixed in the rewrite (summary)

1. Tip-view points trusted the client's `hilight` flag and a GET side effect → server-side recommendation, POST action.
2. Server-time day counting → participant timezone; cycles repeat instead of ending at day 180.
3. `version_compare` on survey scores → numeric comparison; unset scores never match.
4. Tips were not checked for release/published before awarding points → checked.
5. Weekly check-in depended on dropped tables and calendar weeks → study weeks from the intervention start.
6. Auto-submit recorded `used = 0` ("didn't use") for weeks nobody answered → `null` (unknown).
7. Check-in answers were stored as HTML fragments → structured values.
8. `"N new tips"` = today's count, even after reading them → counts releases since you last opened Your Tips.
9. Weekly feedback page matched weeks by insert date and had `$uid` shadowing → one document per (user, week).

---

## 4. Rewrite map

| Area | Where |
|---|---|
| Models | `server/models/tip.ts`, `tip-tag.ts`, `tip-favorite.ts`, `tip-view.ts`, `checkin-prompt.ts`, `weekly-checkin.ts` |
| Tips logic | `features/tips/schedule.ts` (release days), `tailoring.ts` (recommendation), `video.ts`, `queries.ts` (`tipsHome`, `exploreTips`, `favoriteTips`, `tipForViewer`, `feedTips`, `searchTips`, `countNewTips`), `actions.ts` (`toggleFavoriteTip`, `recordTipView`), `admin-*.ts` |
| Check-in logic | `features/checkin/schedule.ts`, `queries.ts`, `actions.ts` (`submitWeeklyCheckin`), `admin-actions.ts`, `jobs.ts` (`weekly-checkin-cycle`, hourly) |
| Participant routes | `/tips` (Today), `/tips/explore?tags=a,b&for=you`, `/tips/favorites`, `/tips/{id}` (+ comments), `/tips/{id}/pdf`, `/check-in`, `/check-in/history`, `/check-in/week/{k}` |
| Staff routes | `/admin/content/tips` (+ `/new`, `/{id}`, `/schedule`, `/topics`, `/export` CSV), `/admin/content/check-in` (+ `/{1–10}`) |
| Shared contracts | `<TipCard>` (`features/tips/components/tip-card.tsx`), `feedTips`, `searchTips`, `tipsNewCount`, `<CheckinDueCard>` (`features/checkin/components/checkin-due-card.tsx`), `weeklyCheckinDue` |
| Seeds | `scripts/seed-tips.mts`, `scripts/seed-checkin.mts` (SAMPLE prompts) |

Tailoring scores are read from `profile.extra.tailoring` (`{ i1…i9, m1…m9, b1…b17 }`); the survey sync and the
migration of the `i1…b17` user fields must write them there.
