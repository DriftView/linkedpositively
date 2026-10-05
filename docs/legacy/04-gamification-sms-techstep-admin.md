# 04 — Gamification, SMS, TechStep, scheduled jobs and admin utilities

Status: legacy spec for the rewrite. It describes what the two Drupal 7 sites do today, defects included. After the Drupal code is deleted, this document is the reference for these areas.
Scope: points, levels and achievements. The SMS reminder program and tracker SMS. Twilio. URL shortening and SMS click tracking. TechStep location, tracking, SSO and add-user. The CAS server (LP side) and the CAS client (Peer Navigation side). All cron jobs. Admin tools: randomization/VBO, admin menus, masquerade, role delegation, LoginToboggan and Feeds. The `twm_general` / `twm_utility` business-rule helpers.

This document contains no participant data. Counts are aggregates from the `linkpositively` / `peernav` snapshots (July 2026 backup). Secret values (Twilio SID/token, the Google Maps API key hard-coded in `techstep_location`, the cron key and DB passwords) are **not** reproduced. Only the names of the settings that hold them appear here.

---

## 0. Source abbreviations used in citations

All paths are relative to the repo root. `LPM/` = `lp/sites/all/modules/`, `PNM/` = `ecoach/sites/all/modules/`.

| Abbrev | Path |
|---|---|
| `GM` | `LPM/youthrive_game_mechanics/youthrive_game_mechanics.module` (`GM.install` = `.install`) |
| `GMF` | `LPM/youthrive_game_mechanics_efm/*` (feature: roles `level-2…7`, fields `field_post_bg`, `field_sticker`) |
| `AB` | `LPM/twm_achievement_bins/twm_achievement_bins.module` (templates in `…/theme/`) |
| `YP` | `LPM/youthrive_profile/youthrive_profile.module` (level display blocks; covered in more detail elsewhere) |
| `CN` | `LPM/twm_comment_notification/twm_comment_notification.module` (in-app notifications; covered elsewhere) |
| `SR` | `LPM/youthrive_sms_reminders/youthrive_sms_reminders.module` (`SR.install`) |
| `SIF` | `LPM/youthrive_sms_inputs_efm/*` (feature: fields `field_role_changed_date`, `field_weekly_sms_date_time`) |
| `TW` | `LPM/twilio/twilio.module` (+ `twilio.user.inc`, `twilio.admin.inc`, `twilio.pages.inc`) |
| `SH` | `LPM/shorten/shorten.module`; `RS` = `LPM/shorten/record_shorten.module`; `SCS` = `LPM/shorten/shorten_cs.module`; `SHF` = `LPM/shorten/shortener/shortener.module` |
| `UE` | `LPM/uy_standard_user_engagement/uy_standard_user_engagement.module` (reports; only the helpers used here are described) |
| `HTML` | `lp/sites/all/themes/twm_bootstrapless/templates/html.tpl.php` |
| `TL` | `LPM/techstep_location/techstep_location.module` (`TL.install`, `TL/add_resource.inc`, `TL/templates/*`, `TL/js/*`) |
| `TT` | `LPM/techstep_tracking/techstep_tracking.module` (`TT.install`, `TT/templates/*`, `TT/js/*`) |
| `PTT` | `PNM/techstep_tracking/techstep_tracking.module` (Peer Navigation copy; `techstep_tracking copy.module` there is a dead backup) |
| `SSO` | `LPM/techstep_sso/techstep_sso.module` |
| `AU` | `LPM/techstep_add_user/techstep_add_user.module` |
| `CS` | `LPM/cas/cas_server.module` (+ `cas_server.response.inc`) |
| `EU` / `ES` | `PNM/ecoach_utility/ecoach_utility.module` / `PNM/ecoach_sessions/ecoach_sessions.module` |
| `TG` | `LPM/twm_general/twm_general.module` (`TG.install`) |
| `TU` | `LPM/twm_utility/twm_utility.module` |
| `RND` | `LPM/twm_randomization/twm_randomization.module` (`RND.install`) |
| `PERM` | `LPM/twm_permissions_efm/twm_permissions_efm.features.user_permission.inc` |
| `ADM` | `LPM/twm_administration_menu_feature/*` |
| `EC` | `LPM/elysia_cron/elysia_cron.module` |

---

## 1. Module status per site

Source: the `system` table (`status=1` means enabled). A module that is "absent" has no code and no `system` row in that site.

| Module | LP (`linkpositively`) | PN (`peernav`) | Notes |
|---|---|---|---|
| achievements (contrib) | **enabled** | disabled (code present) | sub-modules `achievements_optout`, `achievements_pointless` disabled in both |
| twm_achievement_bins | **enabled** | disabled (code present; one template differs) | |
| youthrive_game_mechanics | **enabled** | absent | the real points engine |
| youthrive_game_mechanics_efm | **enabled** | absent | feature export |
| youthrive_sms_reminders | **enabled** | absent | |
| youthrive_sms_inputs_efm | **enabled** | disabled (identical code) | |
| twilio | **enabled** | absent | `twilio_twiml` disabled |
| shorten, shortener, record_shorten, shorten_cs | **all enabled** | absent | |
| techstep_add_user, techstep_location, techstep_sso | **enabled** | absent | |
| techstep_tracking | **enabled** (full version) | **enabled** (read-only calendar version, see §4.2.9) | different code bases |
| cas_server (from `cas` package) | **enabled** | disabled | LP is the CAS **server** |
| cas (client) | disabled | **enabled** | PN is the CAS **client** |
| cas_test | disabled | disabled | |
| twm_general | **enabled** | absent | |
| twm_utility | **enabled** | disabled (older copy: different default `ecoach_url` and no `user_insert` hook) | |
| twm_randomization | **enabled** | absent | |
| twm_permissions_efm | **enabled** | absent | |
| twm_administration_menu_feature | **enabled** | absent | its menu was never created in the DB (§6.2) |
| elysia_cron | **enabled** | absent | PN runs core cron only |
| feeds, feeds_ui, feeds_import, job_scheduler | **enabled** | absent | `feeds_news`, `feeds_tests`, `job_scheduler_trigger` disabled |
| masquerade | **enabled** | absent | |
| role_delegation | **enabled** | absent | |
| logintoboggan | **enabled** | absent | its sub-modules are disabled |
| views_bulk_operations | **enabled** | absent | |
| youthrive_calendar, youthrive_journey_efm, piwik, qsurvey | disabled | absent | still have `elysia_cron` rows (§5) |

Also relevant: LP site timezone `America/Los_Angeles` and front page `drupal-wall`. PN site timezone `America/New_York`. LP `user_register = 0`, so only admins create accounts.

---

## 2. Gamification (LP only)

### 2.1 Architecture in one paragraph

Two layers exist, and only one of them works:

1. **The working layer: `youthrive_game_mechanics` (`GM`).** Every point event is appended to the custom table **`achievement_stats`**, one row per (achievement_id, uid, calendar day), and points are summed into that row. A user's total is `SUM(points)` over all of that user's rows. `GM` also writes a running per-user counter into the contrib `achievement_storage` table through `achievements_storage_set()`, but nothing reads those counters for scoring.
2. **The dead layer: contrib `achievements` unlocks, badges and the leaderboard.** Every `achievements_unlocked()` call is commented out (`GM:186,210,293,344,352,389`). Contrib `achievement_unlocks` holds only 2 rows and `achievement_totals` holds 1, both historical. Badge "bins" depend on the function `twm_badges_achievements_info()`, which exists nowhere in the code base, so any page that calls it fatals (§2.6).

Data model:

| Table | Purpose | Key columns |
|---|---|---|
| `achievement_stats` (`GM.install:7-38`) | **Source of truth for points** | `id` serial, `achievement_id` varchar(100), `uid`, `points` int, `date` int (unix timestamp of **server-local midnight** of the day, `GM:305-306`) |
| `achievement_storage` (contrib) | Per-user counters (`achievements_storage_get/set`) used as "already awarded?" guards for one-time awards | `achievement_id`, `uid`, `data` |
| `cache_uy_upvotes` (`GM.install:5`) | Idempotency keys for upvote points, `"{uid}-{entity_id}"`, permanent | |
| `cache_thrive_tips` (`GM.install:4`) | Idempotency keys for tip-view points, `"{uid}-{nid}"`, permanent | |
| `cache_checkin_stats` (`GM.install:6`) | Idempotency for the old check-in points (function now unused) | |
| `user_tips_report` (owned by the reports module) | Tip view counter per (uid, nid), incremented on every `tip-points` call (`GM:512-534`) | |
| `ts_user_stats` (`UE:658-700`) | Usage counters per (uid, type), `count`+1 per call. Types seen: `tpv` (tracker page view), `resource_views`, `profile_avatar`, `profile-edits` | |

Pseudo-code of the core primitive (`achivement_stats`, `GM:304-332`):

```
award(achievement_id, uid, points):
  day = midnight_today_in_server_tz()
  row = SELECT FROM achievement_stats WHERE achievement_id=? AND uid=? AND date=day
  if row: row.points += points
  else:   INSERT (achievement_id, uid, points, day)
total_points(uid) = SUM(points) FROM achievement_stats WHERE uid=?
```

### 2.2 Point rules that are live today

"Awarded to" means the uid credited. A "guard" is what prevents repeat awards. Unless stated otherwise, every award is followed by `get_all_bin_count(uid)` → `uy_user_level(uid)` (§2.3), which grants level roles.

| # | Trigger | `achievement_stats.achievement_id` | Points | Awarded to | Guard / limit | Source |
|---|---|---|---|---|---|---|
| P1 | Any comment inserted (`hook_comment_insert`) | `comment` | **10** | **author of the node commented on**, including when commenting on your own post and on any node type | none | `GM:161-165,193-200` |
| P2 | Same comment insert | `comment` | Thrive Tip node **2**, Wall post (`drupal_wall`) **10**, Resource node **5**, any other type 0 | the commenter | none | `GM:166-185` |
| P3 | Node of type `drupal_wall` created (Wall post) | `topic` | **10** | node author | none | `GM:204-213` |
| P4 | First reaction flag by user X on an entity (node reaction flags `thumbs_up/haha/love/fire/target/thought/super_node_*`, comment reaction flags `*_comment_*`, see list in code) | `upvote-given` | **1** | the reacting user | once per (reacting uid, entity_id) ever (`cache_uy_upvotes` key `"{X}-{entity_id}"`) | `GM:217-241` |
| P5 | Same event | `upvote-earned` | **1** | the entity's author | once per (**author** uid, entity_id) ever, key `"{author}-{entity_id}"`. **A post earns its author at most 1 point in total**, however many people react. Node and comment ids share the key namespace, so they can collide. | `GM:242-248` |
| P6 | `GET /tip-points/{nid}/{flag}` (AJAX from the Tips views) | `tailored-thrive-tip` if `flag == 'hilight'`, otherwise `thrive-tip` | **5** / **2** | current user | first call per (uid, nid) ever (`cache_thrive_tips`). The same call also increments `user_tips_report.count` on every request. Returns JSON `{"tip-points":{"success":"done"}}`. Permission `access_gain_tips` (participant). | `GM:3-11,460-490` |
| P7 | Viewing the `public_page` node whose alias is `community-guidelines` | `community-view` | **25** | viewer | once (`achievement_storage['community-view'] == 0`) | `GM:495-510` |
| P8 | Any VotingAPI vote insert (Fivestar rating on resources) | `rate-resource` | **5** | current user | none (every vote insert). The rating widget is currently commented out of the resource template (`TL/templates/locations_display.tpl.php`), so this is rarely reachable. | `GM:539-545` |
| P9 | Daily cron (`youthrive_timeonsite_cron`) at server hour 23, once per day: every user with role `participant` whose `users.access` date (server tz) is today | `time-on-site` | **2** | that user | once per day (variable `uy_timeonsite_last` = `m-j-Y`) | `GM:151-157,274-299` |
| P10 | Opening `/locations` (resource locator form build) | `resource` | **1** | viewer | none. Every form build counts, including AJAX rebuilds. Also `ts_user_stats` type `resource_views`+1. | `TL:67-68,558-565` |
| P11 | Creating a personal tracker (`save_tracking`) | `tracker` | **25** | current user | none | `TT:1098,1211-1217` |
| P12 | Saving the Main-tracker (med) reminder settings (`save_rem_tracking`), or the profile's reminder form (`profile_tracker_submit`, `YP:581-615`) | `tracker` | **25** | current user | none (every save) | `TT:1609`, `YP` |
| P13 | Any personal-tracker check-in radio change (`save_checkin`) | `tracker` | **2** | current user | none. Every change counts, including toggling Yes/No repeatedly. | `TT:654,1222-1228` |
| P14 | Any Main-tracker meds/mood radio change (`checkin_lp_today_callback`) | `tracker` | **2** | current user | none (same as P13) | `TT:1558` |
| P15 | Profile2 `main` update | `profile-complete` | **50** | profile owner | intended once. **Unreachable**: the code collects 4 values (age, about_me, study_id, phone) and requires `count == 5` (`GM:252-267`). The 58 historical rows came from older code. | `GM:252-267` |

Defined but **never awarded by current code**: `tutorial-view` (50), `tracker-create` (25, only a storage counter is written), `checkin-meds-response` / `checkin-mood-response` (the function `youthrive_game_mechanics_checkin`, `GM:337-356`, has no callers and would award 1, not 2). Historical ids present in `achievement_stats` from older code: `action-plan` (126 rows, last in 2019), `checkin-meds-response`, `checkin-mood-response`, `profile-complete`.

Aggregate snapshot of `achievement_stats` (rows / points): comment 612/16188, topic 632/17010, tracker 547/14636, time-on-site 1719/2434, thrive-tip 354/1652, upvote-given 531/1405, upvote-earned 533/916, resource 363/1216, tailored-thrive-tip 152/844, profile-complete 58/5800, action-plan 126/1260, checkin-mood 423/815, checkin-meds 414/798, community-view 16/400, rate-resource 15/115.

Also written to `achievement_storage` as counters only: `tracker-create`, `tracker-checkin`, `view-resource`. Because `$points` is undefined in those functions (`TT:1214,1225`, `TL:562`), they store NULL.

### 2.3 Levels: two inconsistent engines

**Engine A (`uy_user_level`, `GM:408-457`).** It drives role unlocks, `next_level_points` and the `youthrive_profile` blocks (`uy_user_levels` on `/my-profile`, `uy_others_profile` on other users' profiles, and the home profile block).

| Total points (`SUM(achievement_stats.points)`) | Level | Roles granted (additive, never removed) |
|---|---|---|
| ≤ 200 (note: exactly 200 is still level 1) | 1 | — |
| 201–499 | 2 | `level-2`, `level-2-1` |
| 500–899 | 3 | `level-3`, `level-3-1` |
| 900–1399 | 4 | `level-4` |
| 1400–1999 | 5 | `level-5` (`level-5-1` commented out) |
| ≥ 2000 | 6 (maximum) | `level-6`, `level-6-1` |

```
uy_user_level(uid):
  total = SUM(points) for uid
  level = bucket(total) as in the table above
  for role in roles_for(level): uy_unlock_roles(uid, role)   # user_save() EVERY call
  return {level, points: total}
```

- Only the roles of the **current** bucket are added. A user who jumps from 150 to 600 points in one step receives the `level-3` roles but never `level-2`.
- `uy_unlock_roles` (`GM:395-403`) calls `user_save()` on every invocation, including every page view of the profile blocks.
- `next_level_points` (`YP:379-404`) shows the next threshold as "200", "500", "900", "1,400" or "2,000", and nothing at level 6.
- The contrib achievement definitions (§2.4) carry misleading descriptions ("At least 700 points" for level-3, whose threshold is 500).

**Engine B (`user_points`, `AB:615-711`).** It drives `/levels`, the slider widget (`display_level_slider`, `AB:958-981`) and the **active** block `twm_generic_profile` (shown in region `slidercontent` on other users' profiles and on `/my-profile`). Thresholds (`range()` + `in_array`, first match wins):

| Total | Label shown | Slider min–max |
|---|---|---|
| < 100 → `range(0,100)` | Level 1 | 100–200 |
| 100–200 | Level 1 | 100–200 |
| 201–350 | Level 2 | 200–350 |
| 351–700 | Level 3 | 350–700 |
| 701–1000 | Level 4 | 700–1000 |
| 1001–1600 | Level 5 | 1000–1600 |
| 1601–2200 | Level 6 | 1600–2200 |
| 2201–3500 | Level 7 | 2200–3500 |
| > 3500 | Level 7 (default branch) | 3500–total |

The same user can therefore see two different level numbers on one page. Rewrite decision needed: pick one table. Engine A is the one that unlocks features.

**What each level unlocks (actual behaviour):**

| Mechanism | Unlock rule | Source |
|---|---|---|
| Avatar/sticker options | `avatar_selection_roles`: 12 images each for `level-2`, `level-3`, `level-4`, `level-5`, `level-6`, `level-6-1`, `participant`; 10 each for `level-2-1`, `level-3-1`. The profile avatar picker shows the images of every role the user holds. `field_sticker` (user, text) stores comma-separated `avatar_selection` fids that are shown as stickers on the profile. | `GMF`, `YP:303-330` |
| Wall post background colour | Role `level-4` sets `bg_access='unlock'`, but the post-background radios are **commented out** ("not using this feature in LP"). `field_post_bg` (drupal_wall, text) remains and is still rendered and saved by the post edit form. | `LPM/drupal_wall/drupal_wall.page.inc:51-80`, `LPM/youthrive_post_edit_form/youthrive_post_edit_form.module:32-37,119-123,375` |
| Site colour theme | Role `level-6` adds the user's `field_theme` value (`theme-1`…`theme-4`, default `theme-1`) as a `<body>` class. Everyone else gets `theme-1`. | `TU:222-233` |
| Text formats | `level-2`, `level-2-1`, `level-7` hold `use text format filtered_html/full_html/limited_html_for_wall_posting` (DB). The feature export also lists level-3…8 (§6.8). | DB `role_permission` |
| Level 7/8 badge | `uy_other_user_profile` sets `#level_num` 7/8 when the user has role `level-7`/`level-8`. Engine A never grants these, and role `level-8` does not exist. | `YP:272-275` |

Admin-editable level copy: `admin/config/system/levels-description` (`YP:17`, form `YP:42-150`) stores variables `level{1..8}-name` and `level{1..8}-desc`. Current values (site content):

| Level | `-name` (displayed as the headline) | `-desc` |
|---|---|---|
| 1 | "Welcome to YouTHrive! Did you can interact with different features of the site to earn points and go up levels?" | "Level-1 Description" (default) |
| 2 | "At Level 2 you will unlock new options for customizing your profile!" | "Complete your profile, post/comment on the Wall, read Thrive Tips, complete your daily check-ins." |
| 3 | "At Level 3 you will unlock new avatar options!" | "Complete your profile, log in daily, post/comment on the Wall, read Thrive Tips, complete your daily check-ins." |
| 4 | "At Level 4 you will unlock new wall features to use when posting!" | "Log in daily, complete your midpoint survey, post/comment on the Wall, read Thrive Tips, and complete your daily check-ins." |
| 5 | "At Level 5 you will unlock new avatar options!" | same as 4 |
| 6 | "At Level 6 you will unlock new color themes for the site!" | same as 4 |
| 7 | "At Level 7 you will unlock a special badge for your profile and avatar!" | "Log in daily, post/comment on the Wall, read Thrive Tips, and complete your daily check-ins." |
| 8 | "At Level 8 (the highest level!) you will unlock new avatar options!" | same as 7 |

`user_levels_description` (`YP:339-376`) renders "You're at Level N", the total points, and the next level's number, name, description and points (only while level < 6).

### 2.4 Achievement definitions (`hook_achievements_info`, `GM:21-146`)

Group `community-achievements` ("Community Participation Achievements"). These register with contrib `achievements` but are never unlocked (§2.1).

| id | title | description (verbatim) | storage | points |
|---|---|---|---|---|
| profile-complete | — | Profile complete! | profile | 50 |
| tutorial-view | — | You have visited tutorial. Great! | tutorial-view | 50 |
| tracker-create | — | You have Created Tracker! | tracker-create | 25 |
| community-view | — | You have read community guidelines. Great! | community-view | 25 |
| comment | — | You submitted your comment. Awesome! | comment | 10 |
| topic | — | You submitted your new topic. Great! | topic | 10 |
| upvote-given | — | You sent your upvote. Nice! | upvote-given | 1 |
| upvote-earned | — | You earned your upvote. | upvote-earned | 1 |
| checkin-meds-response | — | You completed your medication-dose(Yes/No). Great! | checkin-meds-response | 2 |
| checkin-mood-response | — | You completed your mood response. Great! | checkin-mood-response | 2 |
| tailored-thrive-tip | — | You read your Recommended (highlighted) Thrive Tip. | tailored-thrive-tip | 5 |
| rate-resource | — | You read your Recommended (highlighted) Thrive Tip. *(copy-paste bug)* | rate-resource | 5 |
| thrive-tip | — | You read your Thrive Tip. | thrive-tip | 2 |
| time-on-site | — | You have been a part of Youthrive! | time-on-site | 1 |
| level-1 | LEVEL-1 | Starting Point | level | 0 |
| level-2 | LEVEL-2 | At least 200 points total. | level | 200 |
| level-3 | LEVEL-3 | At least 700 points total. | level | 500 |
| level-4 | LEVEL-4 | At least 900 points total. | level | 900 |
| level-5 | LEVEL-5 | At least 1100 points total. | level | 1400 |
| level-6 | LEVEL-6 | At least 1100 points total. | level | 2000 |
| (level-7, level-8) | commented out | "At least 1900 points total." | level | 1900 / 3200 |

No other module implements `hook_achievements_info`. Contrib `achievements` variables are all defaults (no `achievements_*` rows in `variable`).

### 2.5 Contrib achievements routes (enabled, effectively empty)

`achievements/leaderboard`, `achievements/leaderboard/%`, `user/%user/achievements`, `user/%/achievements/%/grant|take`, `admin/config/people/achievements` and `achievements/autocomplete` (contrib `achievements.module:35-88`). Permissions: `access achievements` (administrator, Research Administrator User, Coordinator User, participant), `earn achievements` (…, control, participant), and `administer/grant manual/manually grant achievements` (administrator). The `achievements_leaderboard` block is **disabled in every theme**. The leaderboard reads `achievement_totals`, which is essentially empty. **No user-facing leaderboard exists today.**

### 2.6 Achievement "bins" (badges) — legacy and broken

`AB` defines bins (categories) and tiered badges. Each tier is named `{bin}-{threshold}` (`AB:393-470`):

| Bin | Tiers |
|---|---|
| action-plan | action-plan-baseline, action-plan-t2 |
| profile-complete | profile-complete |
| comment | 10, 50, 100, 150, 300, 500 |
| topic | 10, 50, 100, 150, 300, 500 |
| upvote-given | 1, 5, 10, 15, 30, 50, 100, 200 |
| upvote-earned | 1, 5, 10, 15, 30, 50, 100, 200 |
| daily-checkin-response | 1, 7, 14, 21, 42, 84, 150 |
| thrive-tip | 1, 5, 10, 15, 30 |
| tailored-thrive-tip | 2, 10, 20, 30, 60 |
| time-on-site | 7, 14, 30, 60, 120 |
| medication | 4, 7, 14, 21, 42, 63, 84 |

The first tier of each bin is used for the "locked" preview (`AB:2-11`). A bin is "active" when the user has any `achievement_stats` row with that id (`AB:796-821`). Badge images and titles were meant to come from `twm_badges_achievements_info()`, which does not exist. The following **fatal if rendered**: route `bins_category/{bin}` (`AB:358-533`), blocks `twm_bins`, `twm_bins_category` and `twm_other_profile`, and the unrouted `twm_achievement_bins_user_achievements`. All three blocks are disabled in every theme. The `/levels` page (`AB:716-791`) works: a big current-level number, completed-level sliders, the current slider ("N Points", "Level X (M points required)") and greyed future levels up to Level 7.

Other `AB` routes: `myaccount` → redirects to `user/{uid}/edit` (`AB:34-47`). Its menu link is marked active on `user/{uid}/edit` and `/reminders` (`AB:71-77`). `user_profile_form_redirect` (`AB:940-955`) sends users to `/reminders` if they have no row in table `reminders`, otherwise to `/drupal-wall`. **The `reminders` table does not exist in the DB**, so this would throw an error if it were wired to a form.

Active LP blocks from this module (theme `twm_bootstrapless`): `twm_generic_profile` (region `slidercontent`, visible when `arg(0)=='user' && uid != arg(1)` or `arg(0)=='my-profile'`; it shows the profile picture, a "Level N" button linking to `/levels`, the username and an Edit Profile button). Stale block rows `twm_myprofile_data`, `twm_settings` and `uy_home_profile` also exist but are not declared by the module (they render nothing).

### 2.7 Level-up in-app notifications (`CN:379-444`)

These are generated from contrib `achievement_unlocks` rows `level-1…level-8`. Each yields "You are currently at Level N…" plus a "Congratulations, you have leveled up to Level N…" message. Full text is in `CN:395-438`. Because nothing writes unlocks any more, **these notifications never appear for new level-ups.** Rewrite: emit them from the Engine A level change.

### 2.8 Rewrite notes (gamification)

- Keep an append-only points ledger (`uid, reason, points, day`). The legacy daily-aggregate row is equivalent.
- Decide per rule whether to keep the unlimited repeat awards (P1–P3, P8, P10–P14). These are trivially farmable today.
- Unify the level tables (Engine A vs B). Grant level roles (or feature flags) cumulatively.
- The bins, badges and leaderboard are non-functional today. Only rebuild them if product asks.

---

## 3. SMS (LP only)

### 3.1 Twilio configuration and transport

Settings (`variable` table; **values not reproduced**): `twilio_account` (Account SID), `twilio_token` (auth token), `twilio_number` (sending number, E.164), `twilio_long_sms` = "0", `twilio_registration_form` = "0" (no phone field on registration), `twilio_country_codes` (206 entries, all 0). Admin UI: `admin/config/system/twilio` + `/test` (perm `administer twilio`: administrator, Research Administrator User, Coordinator User) (`TW:31-66`).

The sending path the custom modules use is **not** the contrib `twilio_send()`. It is a raw cURL POST, `uy_send_sms($number, $body, $mms_url=NULL)` (`SR:262-301`):

```
POST https://api.twilio.com/2010-04-01/Accounts/{twilio_account}/Messages.json
Basic auth: {twilio_account}:{twilio_token}
form: To={number}&From={twilio_number}&Body={body}[&MediaUrl={mms_url}]
SSL peer verification disabled; returns raw JSON string
```

Success means that the JSON response has `to`, `from`, `status`, `date_created` and `sid` (`SR:242`).

Phone numbers come from two places:
- **`field_number`** (user field, text) is used by the weekly reminder program and the add-user form. On every entity save, `twm_general_field_attach_presave` normalises it (`TG:226-237`): strip non-digits. If exactly 10 digits → `+1` + digits. If more than 10 → `+` + digits. If fewer than 10 → left as typed.
- **`twilio_user`** table (`uid, number, country, status, code`; 3 rows) is used by the tracker SMS. It is managed on `user/{uid}/edit/twilio` (perm `edit own sms number`, which only admins/coordinators hold). The confirmation flow sends "Confirmation code: NNNN" (4 digits, `twilio.user.inc:171-184`). On login a pending user is told to enter the code (`twilio.user.inc:86-94`). The tracker SMS builds `'+' . country . number` and **ignores `status`** (`TT:254-269`).

### 3.2 Weekly reminder program (`youthrive_sms_reminders`, cron job `youthrive_sms_reminders_cron`, rule `*/1 * * * *` = every minute)

**Eligibility** (`SR:48-71`): users with `status=1`, role `participant`, a non-empty `field_intervention_start_date` (inner join) and a non-empty `field_number` (inner join). One iteration per uid.

**Relevant user fields**
- `field_intervention_start_date` (datetime, `Y-m-d`) is set to the randomization date (§6.1).
- `field_role_changed_date` (text; label "User role changed to participant") holds the unix ts of randomization time + 15 min (§6.1). It drives the WELCOME message.
- `field_weekly_sms_date_time` (text) holds the unix ts of this week's scheduled send (top of an hour).
- `users.timezone` is the user's tz. **All time logic uses the user's timezone** via `date_default_timezone_set($timezone)` (`SR:84`). If a user has an empty timezone the call fails and the **previous user's timezone stays in effect** (bug).

**Week numbering** (`uy_week_count`, `SR:306-335`):

```
days      = floor((today_00:00_local - intervention_start_date) in days)
week_idx  = floor(days / 7)                  # 0-based
week_number     = week_idx + 1               # 1-based
week_start_date = intervention_start_date + 7*week_idx days
candidate days  = week 1: [start+1, start+1, start+2]
                  week n≥2: [week_start, week_start+1, week_start+2]
rand_sms_date   = random element of candidate days
```

The program runs only while `week_number < 25`, i.e. weeks 1–24 (`SR:99`). This matches the WELCOME text "for the next 6 months".

**Scheduling this week's send** (`SR:103-114`):

```
if today_local == week_start_date and now_local('G:i') == ("23:59" if week 1 else "0:01"):
    hour = random int 7..21            # 7:00 am – 9:00 pm local
    field_weekly_sms_date_time = strtotime(rand_sms_date + " hour:00:00")   # local
    user_save()
```

So week 1 is scheduled at 23:59 on the start day and falls on day +1 or +2. Later weeks are scheduled at 00:01 of the week's first day and fall on day 0, 1 or 2 of that week. If cron misses that exact minute, the field keeps last week's timestamp and **no reminder goes out that week**.

**Sending** (`SR:142-151`):

```
flag = "WEEK-{n}"
already = count(uy_sms_reminder_stats WHERE sms_to=number AND sms_from=twilio_number
                AND sms_flag=flag AND sms_created_date in (week_start 00:00:01, week_start+6d 23:59:59))
if already == 0 and strtotime(now_local 'Y-m-d H:00:00') == field_weekly_sms_date_time:
    text = WEEK-n template with "<link>" replaced by shortened URL
    send SMS/MMS (Body=text, MediaUrl=image for week n)
    on success INSERT uy_sms_reminder_stats(uid, sms_to, sms_from, message_sid,
                                            sms_created_date = now_local 'Y-m-d H:i:s', sms_flag)
```

In practice the message goes out on the first cron run within the scheduled local hour. The message body is not stored (`$rem_message` is built but unused, `SR:249`).

**WELCOME message** (`SR:152-163`): sent when no WELCOME row exists for today (local) and `strtotime(now_local 'Y-m-d H:i') == field_role_changed_date`, i.e. in the exact minute 15 minutes after randomization. Text = `WELCOME` constant + the shortened base URL, **concatenated with no space**. MMS = `{base_url}/sites/default/files/mms/welcome.gif`. It is only checked while week < 25. It needs cron to run in that exact minute.

**Message table** (`SR:2-31`, verbatim site copy; `<link>` = shortened tracked URL):

| Week | Text | Link target (before shortening) | MMS image |
|---|---|---|---|
| WELCOME | Hey! Your account is set up and ready to go, and you can expect to be receiving reminder texts from me for the next 6 months. | `{base_url}` (untracked) appended directly | `welcome.gif` |
| 1 | Hey, just your weekly LinkPositively reminder here! Want to tell us more about yourself? Click here to fill out your profile <link> | `/my-profile?sms={uid}:1` | `image1.jpg` |
| 2 | Hey! Read more, know more! Log in to the LinkPositively site here to read today’s Tips! <link> | `/?sms={uid}:2` | `image2.jpg` |
| 3 | Hi! Have you tried the resource locator feature yet? Use it to find resources near you! <link> | `/locations?sms={uid}:3` | `image3.gif` |
| 4 | Hey! See how close you are to unlocking a new feature! Log in to the LinkPositively site to see. <link> | `/?sms=…:4` | `image4.gif` |
| 5 | Hey! Post on the LinkPositively wall and tell us: Whats the 411? <link> | `/?sms=…:5` | `image5.gif` |
| 6 | If you’re having a hard time keeping track of things, use LinkPositively to make life a little less stressful by tracking it here <link> | `/tracking?sms=…:6` | `image6.jpg` |
| 7 | Hello from LinkPositively! Knowledge is Power! Log in to the site and check out today’s tips. <link> | `/tips?sms=…:7` | `image7.gif` |
| 8 | Hey folks! LinkPositively here. Log in to the LinkPositively site to see your points <link> | `/?sms=…:8` | `image8.gif` |
| 9 | Hey there! It’s LinkPositively. Check out what’s trending now on the site <link> | `/?sms=…:9` | `image9.gif` |
| 10 | Hey, it’s LinkPositively. Wanna learn something new today? Read today’s tip here by logging in to the LinkPositively site <link> | `/tips?sms=…:10` | `image10.gif` |
| 11 | Hey, it’s LinkPositively. How are you feeling today? Let us know on the “Tracker” feature of the site <link> | `/tracking?sms=…:11` | `image11.gif` |
| 12 | Hey! Have you used the resource locator yet? Review the services you’ve received here  <link> | `/locations?sms=…:12` | `image12.gif` |
| 13 | Hi there, it’s LinkPositively! Have you logged onto the site today? Check it out!  <link> | `/?sms=…:13` | `image13.gif` |
| 14 | Hey, it’s LinkPositively! Have you read today’s tip yet? Login here to see! <link> | `/tips?sms=…:14` | `image14.gif` |
| 15 | Hey, it’s LinkPositively. Log in here to track your things and more! <link> | `/?sms=…:15` | `image15.gif` |
| 16 | Hey, it’s LinkPositively. You’re not alone! Use the resource locator to find support groups, events and more <link> | `/locations?sms=…:16` | `image16.gif` |
| 17 | Hi, log in to LinkPositively and earn more points today! <link> | `/?sms=…:17` | `image17.gif` |
| 18 | Hi. Want to know the latest? Login to the LinkPositively site to find out more <link> | `/?sms=…:18` | `image18.gif` |
| 19 | Hi, it’s LinkPositively! Have you cashed in your points yet? Login to the site to see if you’re ready to unlock new avatars, theme colors, and more! <link> | `/my-profile?sms=…:19` | `image19.gif` |
| 20 | It’s Von from LinkPositively again! Use the LinkPositively tracker to remember one less thing. <link> | `/tracking?sms=…:20` | `image20.gif` |
| 21 | Hey, it’s LinkPositively Let everyone know how you’re doing by posting on the wall! <link> | `/?sms=…:21` | `image21.gif` |
| 22 | Hello, LinkPositively here. Just a reminder that there are only a couple weeks left on the LinkPositively site.<link> *(no space before link)* | `/?sms=…:22` | `image22.gif` |
| 23 | LinkPositively here! If you have any questions for your community, ask them now because we’re almost done! *(no `<link>`; a URL is still generated but unused)* | — | `image23.gif` |
| 24 | Hey y’all, it’s LinkPositively! You only have a few days left on the LinkPositively Site. Make sure you start saying your good byes! *(no `<link>`)* | — | `image24.gif` |

Link routing rule (`SR:116-141`): weeks 1 and 19 → `/my-profile`. Weeks 3, 12 and 16 → `/locations`. Weeks 6, 11 and 20 → `/tracking`. Weeks 7, 10 and 14 → `/tips`. Every other week → site root. For weeks 7/10/14 the code also computes the most-reacted Wall post of the week (`get_highest_post_likes`, `SR:340-355`: `uy_wallflag_count` node rows for flag fids 15, 17, 23, 25, 27 and 29 = haha, love, fire, super, target and thought node reactions, created in the week window, summed). **The result is unused.** Commented-out legacy constants: `WEEK-19+FOUR` ("Have you checked your points lately? Login and see! <link>"), `WEEK-25/26`, and `MIDPOINT-1/2` ("Hey, it’s Aldona from YouTHrive! It’s time to take your next survey—please take 5 minutes to fill it out!"). Historical `uy_sms_reminder_stats` rows still carry the flags `WEEK-19+FOUR`, `MIDPOINT-1` and `MIDPOINT-2`.

MMS assets live in `lp/sites/default/files/mms/` (`welcome.gif`, `image1.jpg`, `image2.jpg`, `image6.jpg`, and `image{3-5,7-24}.gif`). The rewrite must migrate them to public storage (Twilio fetches them by URL).

`uy_sms_reminder_stats` schema (`SR.install:35-92`): `id`, `uid`, `message_sid`, `sms_to`, `sms_from`, `sms_created_date` (DATETIME, **user-local** time), `sms_flag`. Indexes on all columns. Legacy `reminder_messages` / `reminder_sms_inputs` content types (one node each, many text fields) exist, but **no code reads them**. The texts are hard-coded constants.

### 3.3 Tracker SMS (`techstep_tracking`)

**Personal trackers** (`tracking_sms`, `TT:169-249`; job rule `*/1 * * * *` from code). It acts only when the **server** minute is `00` or `30`.

```
for each row in ts_tracking JOIN ts_tracking_time ON uid   # reminders=0 (SMS), flag=1 (active)
   local = now in user tz (fallback site tz)
   slot_minute = 0 if ts_tracking_time.minute==0 else 30
   due = (how_often==1 ? local.weekday==day && local.hour==hour : local.hour==hour)
         && local.minute == slot_minute
   body = noti_text ? noti_text + "️? Click {short} to add your entry on LinkPositively."
                    : (daily ? "Did you fill out the daily tracker today ☑️? Click {short} to add your entry on LinkPositively."
                             : "Did you fill out the weekly tracker this week ☑️? Click {short} to add your entry on LinkPositively.")
   short = shorten_url("lpapp://tracking")        # mobile-app deep link
   if due and twilio_user number exists: uy_send_sms(number, body)   # no MMS, no logging table
```

**Main tracker (meds & mood) reminders** (`med_tracking_sms`, `TT:299-353`). The DB rule `0 * * * *` makes it hourly at :00 (the code default is every minute, and its own minute check is a tautology):

```
for each row in reminder_checkin_time WHERE reminders=0:
   due = (how_often==1 ? local.weekday==day && local.hour==hour : local.hour==hour)
   body = daily ? "Did you fill out the Main tracker today ☑️? Click {short} to add your entry on LinkPositively."
                : "Did you fill out the Main tracker this week ☑️? Click {short} to add your entry on LinkPositively."
   short = shorten_url("lpapp://my-tracking")
   send via twilio_user number
```

If the job ran every minute (its code default), a due user would get up to 60 texts in the hour. The hourly DB override is what makes it correct. **Preserve that effective behaviour: one text per due hour.**

In-app alternatives (`reminders = 1`) are rendered as notifications by `CN:282-330` ("Hello {name}. Have you filled out your check in yet? Click here" / "…your main check in yet? Click here"). They appear once the local hour ≥ the configured hour on a due day.

### 3.4 URL shortening (`shorten` family)

`shorten_url($original)` (`SH:133-190`):
1. Look up `cache_shorten` (key = urlencoded original). A hit that has not expired returns the cached short URL.
2. Otherwise call the primary service `shorten_service` = **TinyURL**. On failure call the backup `shorten_service_backup` = **is.gd**. On failure of both, use the original URL.
3. Cache the result for `shorten_cache_duration` = 1,814,400 s (21 days), or for `shorten_cache_fail_duration` = 1,800 s when the original URL was returned.
4. Fire `hook_shorten_create` → `record_shorten` inserts `record_shorten(original, short, service, uid, hostname, created)` (`RS:38-48`). 19,018 rows exist, almost all TinyURL.

Other settings: `shorten_method = curl`, `shorten_timeout = 3`, `shorten_use_alias = 1`, `shorten_www = 0`, `shorten_show_service = 0`, `shorten_cache_clear_all = 1`, `shorten_invisible_services` (all visible = 0). API-key variables (bit.ly, goo.gl, etc.) are unused. Routes: `admin/config/services/shorten` (+ `/keys`, `/custom` from `shorten_cs`), `shorten` (manual shortening page, perm `use Shorten URLs page` = administrator), and `admin/reports/shorten` (list and "Clear all records", `RS:11-22,84-86`). `shorten_cs` has no custom services defined (table `shorten_cs` is empty). The `shortener` input filter is attached to 4 text formats but **disabled** (`status=0`) in all of them.

Because the tracked links carry `?sms={uid}:{week}`, every link is unique per user and week, so each one hits TinyURL once. The short URL is TinyURL's, so **click counting happens only on landing at the site**, not at the shortener.

### 3.5 SMS click tracking (`?sms=uid:week`)

The theme's `html.tpl.php` runs on every full page render (`HTML:56-58`):

```
if $_GET['sms'] non-empty: message_links_click_count($_GET['sms'])
message_links_click_count("uid:week")  (UE:206-220):
   uid, n = split(":")
   if no row in sms_engagement_messages(uid, week="WEEK-n"):
       INSERT (uid, week="WEEK-n", clicked="Yes", link_clicked_date=REQUEST_TIME)
```

- The first click per (uid, week) is recorded. There is no authentication check: the uid is taken from the URL, so anyone can forge a click.
- Table `sms_engagement_messages(id, uid, week, clicked, link_clicked_date)` feeds the engagement report (covered in the reports document).
- Tracker SMS deep links (`lpapp://…`) carry no `sms` parameter and are not click-tracked.

### 3.6 Inbound SMS

Contrib route `twilio/sms` (public, `TW:55-59,290-311`) validates the Twilio signature (`twilio_command('validate')`). It blocks the message if the recipient's country code is not enabled. **All 206 codes are disabled (0)**, so every inbound message is dropped with a watchdog entry "A message was blocked from the country…". Otherwise it would invoke `hook_twilio_sms_incoming` and the Rules event. No module implements that hook and Rules is not installed. `twilio/voice` exists too. **Effective behaviour: inbound SMS and voice are ignored.** Legacy cron rows `twm_reminders_receivesms_cron` / `twm_reminders_sendsms_cron` (last run 2016/2018) belong to a removed module that once handled replies.

---

## 4. TechStep features

### 4.1 Resource locator (`techstep_location`, LP)

**Data**
- Content type `resources` (fields used: `field_address`, `field_city`, `field_state`, `field_zip`, `field_website`, `field_contact`, `field_hours`, `field_eligibility`, `field_scheduling`, `field_status`, `field_tests`, `field_resource_tags` / `field_resource_tag` (taxonomy `resource_tags`, about 200 terms), `field_rating` (Fivestar), `field_resource_description`). 277 published nodes.
- `ts_locations(id, nid, lat text, lng text, created)` (`TL.install:9-42`) caches geocoded coordinates, one row per resource (274 rows). On insert or update of a **published** `resources` node, `field_zip` is geocoded with the Google Geocoding API (`components=postal_code:{zip}`; the API key is hard-coded in `TL:384,405`, **do not copy it; move it to config**). The result is `db_merge`d by nid (`TL:337-376`). On geocode failure an admin warning is shown. `twm_general_node_delete` removes the row when a resource is deleted (`TG:280-294`).
- Favourites: flag `favorite_resource` (fid 39). Flag `resource` (fid 38) exists but its link is commented out.

**Routes** (perm `access_techstep_location` = administrator, participant; `TL:14-45`)

| Route | Behaviour |
|---|---|
| `/locations` | Search form (`TL:67-146`, template `techstep_location.tpl.php`). Awards P10. Hidden `latitude`/`longitude`, text `zipcode`, select `tag` ("Search Containing": All + every `resource_tags` term), select `radius` ("Search Distance": 50 / 25 / 10 miles), and an AJAX "Search" button (disabled until a zip exists or geolocation succeeds). |
| `/get-zip/{lat}/{lng}` | Reverse geocode (Google) → JSON `{address: address_components}` (`TL:404-417`). The JS (`TL/js/get_location.js`) calls it after `navigator.geolocation` succeeds and fills the zip. Error texts: "Geolocation is not supported by this browser.", "You've denied the request for Geolocation.So please enter zipcode to search", "Location information is unavailable.", "The request to get user location timed out.", "An unknown error occurred.", "Fetching zip code...", "Unable to get zip code." |
| `/location/{nid}` | Single resource page with comments (`TL:421-428`, `get-resource.tpl.php`). It is used as a notification target. |
| `/add-resource` | "Suggest a resource" form (`TL/add_resource.inc:12-97`), see below. |

**Search algorithm** (`get_nearby_locations`, `TL:183-232`; `get_result_nids`, `TL:324-332`):

```
if zipcode non-empty: (lat,lng) = geocode(zipcode)       # zip overrides device location
if no lat/lng: return "Error Fetching the result!"
rows = SELECT nid, 3959*acos(cos(rad(lat0))*cos(rad(lat))*cos(rad(lng)-rad(lng0)) + sin(rad(lat0))*sin(rad(lat)))
       AS radius FROM ts_locations HAVING radius <= R ORDER BY radius        # miles
if none: "No results found"
results = view 'resources' display 'resources' (args: "nid1,nid2,…", tag|'all')
attach distance; attach comments (view 'comment', args nids)
usort by distance using strcmp  (string compare: "10.2" sorts before "9.1" — bug)
```

The SQL interpolates the lat/lng/radius values straight into the query (injection risk). **Use parameters in the rewrite.**

**Result card** (`TL/templates/locations_display.tpl.php`): a header row with City, State and Zip. The favourite flag link. The title. Eligibility. "Visit Website" link. Contact. "address, city". Hours. Then the optional sections "Scheduling" (`field_scheduling`), "Covid-19 Updates" (`field_status`, fed by the CSV column "Patient Status") and "Insurance Status" (`field_tests`, fed by the CSV column "Rapid Tests Available"). Existing comments follow (date `n.d.y`, time `g:i A`, avatar, author link, body as plain text, and a delete "x" for the comment's own author only, `TL:517-553`). A hidden add-comment box ("Add a comment...") posts through AJAX (`TL:434-514`; subject = first 49 chars, format `filtered_html`). A Google Maps link is built but not printed, and the Fivestar rating and comment toggle are commented out. A distance-sort dropdown exists in the JS but is commented out in the template.

**Suggest a resource** (`/add-resource`): fields "resource name", "phone number", "street address", "city", "state" (select: California, MA, New York, Pennsylvania, Texas), "zip code" and "Notes". Submit creates an **unpublished** `resources` node owned by the user and emails **every active user with role `Coordinator User`**: subject "LinkPositively: Resource Created by a user", body "Hello, User has created a resource. Please login as a coordinator and review at {base_url}/admin/suggested-resources". It then shows the `saved-feedback` template. Coordinators publish or delete it through the VBO view `suggested_resources` (§6.1).

**Block** `tl_fav_resources_block` ("Fav Res Block", the user's favourited resources) is disabled in all themes (`TL:151-178,257-276`).

### 4.2 Tracking (`techstep_tracking`, LP full / PN read-only)

#### 4.2.1 Tables (`TT.install`)

| Table | Columns | Meaning |
|---|---|---|
| `ts_tracking` | id, uid, tid (term in vocab `custom_tracking`: Hormones, PrEP, Sex — legacy), text (custom name), how_often (0 daily, 1 weekly), day (0=Sun…6=Sat), reminders (0 SMS, 1 in-app), noti_text, flag (1 active, 0 inactive), created | a personal tracker (113 rows) |
| `ts_tracking_data` | id, uid, tid (**= ts_tracking.id**), checkin (1 yes / 0 no), created | one row per tracker per day |
| `ts_tracking_time` | id, uid, hour (0–23), minute (0 → :00, 1 → :30), created | **one row per user** (merge key uid). All of a user's personal trackers share the last-saved time. |
| `reminder_checkin` | id, uid, meds (1/0), moods (1–12), checkin (unused "finish"), created (= local-midnight ts) | Main tracker daily entry |
| `reminder_checkin_time` | id, uid, reminders, how_often, day, hour, created | Main tracker reminder settings, one per user (36 rows) |

#### 4.2.2 Routes (perm `access_custom_tracking` = administrator, participant; `TT:14-42`)

`/tracking` (Personal Trackers form), `/my-tracking` (Main Tracker | Meds & Mood), `/calendar` (POST JSON feed), `/save-tracking` and `/delete-tracking/{id}`. The last two are **broken**: `save_tracking` expects form arguments and `delete_tracking` does not exist. The LP block row `techstep_tracking` on `<front>` is stale (the module declares no blocks).

#### 4.2.3 Personal tracker page `/tracking` (`TT:667-955`, `tracking.tpl.php`)

It logs `ts_user_stats` type `tpv`. When the user has trackers, the page shows:
- a select of their trackers (AJAX swaps the check-in and notification panes);
- the check-in form "Did you take your {name} today?" with Yes/No radios (AJAX save, awards P13);
- a FullCalendar month view that marks each day with 1.svg (yes) or 0.svg (no) and a header counter "| X of Y" (days with entries / days in month);
- a notifications pane showing "Notifications {Everyday|Weekday name} | {g:i a}" or "Turned Off", plus an edit form: "What would you like your Notification to say?", time 12/1…11, minute 00/30, AM/PM, and the button "Change your Tracker". Editing updates `noti_text`, forces `flag=1`, resets `created` and merges `ts_tracking_time`. It shows "Complete! Keep on Tracking".

Create-tracker wizard (checkbox "Create A New Tracker" when trackers exist). Fields are revealed progressively with #states:
1. "OK! Enter the name of what you want to track" (`desc`)
2. "Would you like to receive Notifications?" Yes/No (`visibility` → `flag`)
3. "What would you like your Notification to say?" (`noti_text`)
4. "How would like to receive your Notifications?" Phone Text Messages (0) / In App Messages (here) (1)
5. "How often would you like to get Notifications?" Daily/Weekly, then a weekday select if Weekly
6. time/minute/meridian (only when the user has **no** trackers yet)
7. Summary "Ok, you will create a new Tracker called {name}." and button "Save Your Tracker"

Save (`TT:1050-1109`) inserts into `ts_tracking` and merges `ts_tracking_time` when a time was given. The hour is `convert(h, meridian)` = h + 12 for PM (index 0 = "12", so 12 AM → 0 and 12 PM → 12). It awards P11 and redirects to `/tracking`.

#### 4.2.4 Main tracker `/my-tracking` (`TT:1233-1490`, `my-tracking.tpl.php`)

- "Did you take your meds today?" Yes/No, and "How are you feeling today?" with 12 mood emoji radios. Values: 1 Happy, 2 Excited, 3 Silly, 4 Confident, 5 Calm, 6 Bored, 7 Confused, 8 Worried, 9 Overwhelmed, 10 Sad, 11 Frustrated, 12 Angry (SVGs in `TT/images/`). Each change saves or updates `reminder_checkin` for today (`created` = `strtotime(date('Y-m-d'))` in server tz) through AJAX and awards P14 (`TT:1519-1570`).
- The calendar shows a meds tick or cross plus the mood emoji per day.
- Reminder settings: "Notifications {Everyday|Day} | {time}" or "Turned Off". Then "How would like to receive your Medication Notifications?" (SMS / in-app), "How often…" (Daily/Weekly + weekday), time 12:00…11:00 + AM/PM, and the button "Create Reminder". This merges `reminder_checkin_time`, awards P12 and redirects to `/my-tracking` (`TT:1574-1619`).

#### 4.2.5 Calendar feed `POST /calendar {tid, tracker}` (`TT:989-1032`)

`tracker=="main"` → `reminder_checkin` rows (uid, meds, moods, date). Otherwise → `ts_tracking_data` rows for that tracker. The date is formatted `Y-m-d` in **server** tz. JSON `{"calendar":{"dates":[…]}}`. Used by `TT/js/calendar.js`.

#### 4.2.6 Tracker SMS

See §3.3.

#### 4.2.7 Events tracked and where they are stored (summary)

| Event | Stored in |
|---|---|
| Personal tracker created or edited | `ts_tracking`, `ts_tracking_time`; points `achievement_stats(tracker,+25)` |
| Personal check-in | `ts_tracking_data`; points `+2` |
| Main tracker meds/mood | `reminder_checkin`; points `+2` |
| Main tracker reminder settings | `reminder_checkin_time`; points `+25` |
| Tracker page view | `ts_user_stats(type='tpv')` |
| Resource locator view | `ts_user_stats(type='resource_views')`; points `+1` |
| SMS reminder sent | `uy_sms_reminder_stats` (weekly program only; tracker SMS are not logged) |
| SMS link clicked | `sms_engagement_messages` |
| Short URL created | `record_shorten` |

#### 4.2.8 Rewrite notes

- `ts_tracking_time` should be per tracker.
- Store check-in dates as local dates.
- Dedupe points.
- Fix the dead `delete-tracking` route by adding a real delete.

#### 4.2.9 Peer Navigation copy (`PTT`)

Routes `/calendar` and `/my-tracking/{uid}` (perm `access_ecoach_sessions`: administrator, coach, coordinator; `PTT:14-28`). The coach dashboard loads `/my-tracking/{uid}` (`PNM/ecoach_sessions/js/session.js:71`) to show a **read-only** Main-tracker calendar for a participant. The lookup (`PTT:98-136,156-263`):

```
lp_uid = SELECT uid FROM LP.users WHERE name = PN.user(uid).name     # db_set_active('path')
rows   = SELECT meds, moods, created FROM LP.reminder_checkin WHERE uid = lp_uid
date   = created rendered Y-m-d in the LP user's timezone
```

It needs a second DB connection named **`path`** that points at the LP database. **That connection is not defined in any settings file in the repo.** Without it, Drupal silently stays on the PN DB, which has no `reminder_checkin` table. In the rewrite this becomes a direct query in the shared MongoDB.

### 4.3 SSO: LP is the CAS server, PN is the CAS client

**LP server** (`cas_server`, `CS`). Endpoints are public:

| Path | Function |
|---|---|
| `/cas/login?service=URL[&gateway]` | If logged in: check the whitelist, then create a ticket and redirect to `URL?ticket=ST-…`. If anonymous with `gateway`: redirect to `URL` without a ticket. Otherwise set cookie `cas_server_login=URL` and redirect to `user/login?destination=cas/login` (`CS:138-182,124-132`). |
| `/cas/validate?ticket&service` | CAS 1.0: `yes\n{username}\n` or `no\n\n` (`CS:184-213`) |
| `/cas/serviceValidate`, `/cas/proxyValidate` | CAS 2.0 XML `<cas:serviceResponse><cas:authenticationSuccess><cas:user>{name}</cas:user><cas:attributes>…` or `authenticationFailure` with code `INVALID_TICKET` / `INVALID_REQUEST` (`CS:216-259`, `cas_server.response.inc`) |
| `/cas/logout[?service][&url]` | Destroys the LP session and prints "You have been logged out successfully." (`CS:315-347`) |
| `admin/config/people/cas_server` | Settings (perm `administer cas server`) |

- Tickets live in table `cas_server_tickets(service, ticket PK, uid, timestamp, valid)`. A ticket is `ST-` + `user_password()` (a random 10-char string). It is **single use**: validation sets `valid=0` whatever the outcome. Tickets have **no expiry** (`CS:277-313`). Observed services: `https://prod.ecoach.lp.radiant.digital/cas`, `https://stage.ecoach.lp.radiant.digital/cas`, `https://stage.ecoach.radiantexp.com/cas`, `https://coach.techstep.me/cas`.
- Service whitelist `cas_server_service_whitelist` is empty, so every service is allowed. The failure message is "You do not have permission to login to CAS from this service."
- Attributes returned: `uid`, `mail`, `created`, `timezone`, `language`, `drupal_roles` (role list) from `CS:113-122`. `techstep_sso` adds `coach_name` (username of the referenced `field_coach` user), `pic` (absolute URL of the user picture), `zoom` (`field_zoom_link`), `name` (`field_first_name`), `pronoun` (`field_user_pronoun`) and `location` (`field_location`) (`SSO:102-137`).
- Single logout: on LP logout, for each of the user's tickets that is **already validated**, the server POSTs `logoutRequest=<samlp:LogoutRequest …><saml:NameID/>…<samlp:SessionIndex>{ticket}</…>` to the service URL. Group timeout `cas_server_slo_group_timeout` = 15 s, per request `cas_server_slo_individual_timeout` = 15 s. The tickets are then deleted (`CS:349-395`).

**LP-side routing into PN** (`SSO:45-97`; `TU:10-20` duplicates the login part):
- `ecoach_url` (admin form `admin/config/system/tech_sso` "SSO URL", field "eCoach domain URL") is currently `https://prod.ecoach.lp.radiant.digital`. Code defaults: `https://coach.techstep.me` (SSO) and `https://stage.ecoach.radiantexp.com` (TU).
- "eCoach-only" user = has `ecoach-user` and **not** `participant`, or has `coach`. Such users:
  - on login get `destination = cas/login?service={ecoach_url}/cas`, so they land on PN immediately (skipped on password-reset logins);
  - on any request to `/drupal-wall` are redirected to the same CAS login URL (`hook_init`).
- `/ecoach` (perm `access_ecoach_system` = administrator, ecoach-user) redirects to `cas/login?service={ecoach_url}/cas`. This is the "open Peer Navigation" link for participants who also have eCoach.

**PN client** (contrib `cas`, variables): `cas_server = prod.lp.radiant.digital`, `cas_port = 443`, `cas_uri = /cas`, `cas_version = 2.0`, `cas_check_frequency = -2` (never gateway-check), `cas_user_register = 1` (auto-create accounts, username = LP username), `cas_auto_assigned_role = {participant}`, `cas_login_form = 1` (add a "Log in using CAS" link to login forms), `cas_hide_email = 1`, `cas_hide_password = 1`, `cas_exclude = services/*`, `cas_single_logout_session_lifetime = 25` days, `cas_library_dir = sites/all/libraries/CAS` (phpCAS), and `cas_cert` empty (no CA validation). `cas_user` maps 34 PN users.

End-to-end flow:

```
PN /cas  --302-->  LP /cas/login?service=https://PN/cas
LP: not logged in -> /user/login -> back to /cas/login -> ticket ST-x
LP --302--> https://PN/cas?ticket=ST-x
PN server-side GET LP /cas/serviceValidate?ticket=ST-x&service=https://PN/cas
PN: user exists? else create (roles from ES:206-220):
      LP drupal_roles has 'coach'                         -> PN roles = {coach}
      LP drupal_roles has 'participant' AND 'ecoach-user' -> PN roles = {tech-participant, participant}
PN hook_user_login (EU:11-59): copy pic (download into public://pictures), zoom, first name,
      pronoun, location on every login; coach -> /dashboard;
      participant -> set field_coach = PN user named coach_name, -> /user-dashboard
PN logout (EU:66-80): participant/coach -> session_destroy, redirect https://{cas_server}/user/logout
      -> LP logout -> single-logout POSTs back to PN
```

### 4.4 Add participant (`techstep_add_user`, LP)

Route `admin/add-participant` (perm `access_techstep_add_user` = administrator, Coordinator User). Title "Create a New Participant" (`AU:14-116`). Fields: Study ID\*, User Name\* ("Enter the user's name without spaces"), Email\*, Phone\* ("Enter a valid phone number with country code. Eg. +19879543210"), Password\*, Confirm Password\*, "Select User Role"\* checkboxes Participant / eCoach (`ecoach-user`), "Select Coach" (shown only when eCoach is ticked; options from view `coaches`), Pronouns ("Eg. he/him, she/her"), Age. Button "Create Participant".

Validation (`AU:128-149`): duplicate username → "This study ID already exists, please check your data." (wording refers to study ID although it checks the name). Duplicate email → "This email already exists, please check your data.". Invalid email → "This email address is not valid.". Password mismatch → "The passwords doesn't match, please try again.".

Submit (`AU:154-196`):
1. `user_save` with status 1, the chosen roles, and `init = mail`. **`twm_utility_user_insert` also adds role `control`** (§7), so the account ends up with control + the chosen roles.
2. Set `field_coach` if chosen, `field_number` (normalised §3.1), and `field_study_id`.
3. Create or update profile2 `main` with `field_pronoun` and `field_age`.
4. Send the core "register_no_approval_required" email and show the message "User saved".

The form does **not** set `field_intervention_start_date`. Without it the SMS program ignores the user until randomization (§6.1) sets it.

---

## 5. Scheduled jobs

### 5.1 LP (Elysia Cron)

Effective rule = DB `elysia_cron.rule` if set, else the code `hook_cronapi` rule, else the default `0 * * * *` (`EC:1078-1086`). Other settings: `elysia_cron_time_limit` = 240 s, `stuck_time` = 3600 s, `alert_interval` = 60 min. Core `cron_safe_threshold` = 10800. Production relied on an **external trigger every minute** (execution counts support this: `youthrive_sms_reminders_cron` ran about 946k times, `tracking_sms` about 689k times). Locally, cron is turned off (README).

| Job | Effective schedule | What it does | Source |
|---|---|---|---|
| `youthrive_sms_reminders_cron` | `*/1 * * * *` (DB) | Weekly SMS scheduling and sending + WELCOME (§3.2) | `SR:36-167` |
| `tracking_sms` | `*/1 * * * *` (code); acts at server :00 and :30 | Personal tracker SMS (§3.3) | `TT:140-249` |
| `med_tracking_sms` | `0 * * * *` (DB override of the code's `*/1`) | Main tracker SMS (§3.3) | `TT:146-149,299-353` |
| `youthrive_timeonsite_cron` | hourly (default); acts once per day in server hour 23 | Time-on-site points (P9) | `GM:151-157,274-299` |
| `twm_general_cron` | hourly (default) | **150-day auto-block** (§7.1) | `TG:244-274` |
| `feeds_cron`, `job_scheduler_cron`, `queue_feeds_*` | hourly | Feeds housekeeping (importer is manual, §6.6) | contrib |
| `logintoboggan_cron` | hourly | Purges unvalidated users (disabled: interval 0) | contrib |
| `masquerade_cron` | hourly | Cleans stale masquerade sessions | contrib |
| `views_bulk_operations_cron`, `queue_views_bulk_operations` | hourly | VBO queue | contrib |
| `system_cron`, `node_cron`, `field_cron`, `search_cron`, `statistics_cron`, `dblog_cron`, `ctools_cron`, `update_cron` (`*/15` DB), `votingapi_cron`, `views_data_export_cron`, `jquery_update_cron`, `announcements_feed_cron` | hourly | core/contrib housekeeping | core |
| Stale rows (module gone or disabled, never run since): `achievement_carousel_cron` (2017), `twm_badges_timeonsite_cron` (2017), `twm_reminders_sendsms_cron` (2018, `*/1`), `twm_reminders_receivesms_cron` (2016), `shurly_cron` (2018), `backup_migrate_cron` (2018), `piwik_cron`, `qsurvey_createuser_cron` (2020) | — | none | — |

The `youthrive_game_mechanics_cronapi` job has its rule commented out (`GM:154`). `tracking_calendar()` in `TT:156-164` / `PTT:56-64` looks like a cronapi but is never registered.

### 5.2 PN (core cron, no Elysia)

`cas_cron` (contrib, cleans `cas_login_data`) and `privatemsg_cron`. `cron_safe_threshold` = 10800 (poor-man's cron every 3 h). There are no custom scheduled jobs on PN.

---

## 6. Admin tools (LP)

### 6.1 Randomization and participant management (VBO)

Actions (`RND:18-45`; perm `access_twm_randomization` = administrator, Research Administrator User, Coordinator User; actions_permissions `execute twm_randomization_assignment_action` = the same roles):

| Action | Effect |
|---|---|
| `twm_randomization_assignment_action` "Convert User(s) to Participant Role" | **Replaces all roles with `participant`**. Sets `field_role_changed_date` = unix ts of (server now, truncated to the minute, + 15 min) and `field_intervention_start_date` = today (server date). Sends the core "register_no_approval_required" account email (`RND:52-81`). This starts the SMS program: WELCOME fires 15 min later and week 1 starts today. |
| `twm_randomization_deassignment_action` "Convert User BACK to Control Role" | Replaces all roles with `control`, then deletes rows from table `reminders` (`RND:84-95`). **The `reminders` table does not exist**, so the action throws after the role change has already been saved. |
| `twm_randomization_add_role` "Add Study Roles" (VBO-configurable) | A multi-select of `ecoach-user` / `participant`. It removes those two roles from the user, keeps every other role, then adds the selected ones (`RND:99-142`). |

On install the module creates roles `control` and `participant` if missing (`RND.install:22-62`).

Views that use VBO (from `views_display`):

| View / display | Path | Access | Rows | Operations |
|---|---|---|---|---|
| `user_operations` page "User Operations" | `admin/user-operations` (main-menu "Convert Control Users"; shortcut) | roles administrator, Research Administrator User | active users with role **control**; columns User Name, roles, status, "Updated" (created) | "Convert Control User(s) to Participant(s)" (assignment, no confirmation) |
| its attachment "Recently Converted Participants" | same page | — | active users with role **participant** | deassignment (no confirmation) |
| `user_operations` page_1 "Manage Participants" | `admin/manage-participants` | administrator, Coordinator User, Research Administrator User | active users with role participant **or** ecoach-user; exposed filter Study ID; columns User Name, StudyID, roles, Coach, Active?, Study Join Date, edit link | "Change Role" (add_role, with confirmation), "Deactivate Participant(s)" (user cancel, no confirmation), "Assign Coach" (modify `field_coach`) |
| `suggested_resources` | `admin/suggested-resources` | roles coach, control, Coordinator User (rids 19, 6, 5) | user-suggested (unpublished) resources | delete, publish |
| `flagged_resources` | `admin/flagged-resources` | Coordinator User | flagged resources | unpublish |
| `resources_list` | `admin/resources-list` | — | resources | delete |
| `tips_list` | `admin/tips-list` | — | thrive tips | delete |
| `resources_flat`, `resource_vbo` | (embedded) | access content | resources | modify / delete item / delete revision |

The full view definitions belong to the content and admin documents. Only the VBO operations are listed here.

### 6.2 Admin navigation

- Feature `twm_administration_menu_feature` declares a custom menu `menu-administrator-menu` ("Administrator Menu") and block settings for it and for the shortcut block (all disabled) (`ADM`). **The menu was never created in the DB** (`menu_custom` has no such row), so it is dead.
- The admin navigation actually in use is the **shortcut set `shortcut-set-1`**. Visible: Add content (`node/add`), Access Report (`admin/access-report`), LinkPositively Reports (`admin/uy-reports`), Review Flagged Comments (`admin/abuse-comment`), Convert Control Users (`admin/user-operations`), Resource List (`admin/resources-list`), Tips List (`admin/tips-list`). Hidden: Find content, Review Flagged Resources, Review Suggested Resources, Manage Participants, Add User (`admin/add-participant`).
- `main-menu` admin items, visible: Home, Access Report (`access_report`), Activate Users (`user-operations`), Convert Control Users (`admin/user-operations`), Qualtrics Configuration (`survey`), Tutorials (`admin/tutorials`), Tech Support (`admin/tech-support`). Hidden: Weekly Check-In / Feedback, Deactivate Users, Manage Participants, `admin/survey`.
- `menu-flagged-messages`: Wall Post Abuse (`admin/abuse-node`) and Comment Abuse (`admin/abuse-comment`). On those two pages the tabs `admin/tasks` / `admin/index` are hidden (`TG:169-177`).
- `twm_general` makes `comment/*/edit` and `comment/*/delete` admin paths (admin theme) through a function named `comment_admin_paths`, which Drupal picks up as comment module's `hook_admin_paths` (`TG:131-137`).

### 6.3 Masquerade

Enabled. Permissions `masquerade as user/any user/admin` and `administer masquerade` are held by administrator only. `masquerade_admin_roles` = {participant (7), administrator (3)}: users with those roles count as "admins" who can only be impersonated with `masquerade as admin`. No quick switches. The switch block is placed only in the unused theme `twm_bootstrapless_old`, so switching happens through `masquerade/switch/{uid}` and `masquerade/unswitch`. The `masquerade` table is empty.

### 6.4 Role delegation

`assign {role} role` permissions let administrator, Research Administrator User and Coordinator User assign: coach, control, Coordinator User, ecoach-user, level-2, level-2-1, level-3, level-3-1, level-4, level-5, level-5-1, level-6, level-6-1, level-7, participant and Research Administrator User. `assign all roles` is administrator only. The UI is the "Roles" tab on user edit.

### 6.5 LoginToboggan

`logintoboggan_login_with_email = 1` (log in with username **or** email), `immediate_login_on_register = 1`, `confirm_email_at_registration = 0`, `pre_auth_role = 2` (authenticated, i.e. no pre-auth role), `minimum_password_length = 0`, `purge_unvalidated_user_interval = 0` (never), `override_destination_parameter = 1`, `unified_login = 0`, `login_successful_message = 0`, and no custom redirects. Core `user_email_verification = TRUE` and `user_register = 0` (admin-only registration) also apply.

### 6.6 Feeds importer `resources_import`

"Resources Import — Imports Resources data from csv file". FileFetcher + CSVParser (`,` delimiter, UTF-8, header row) + NodeProcessor into bundle `resources`, author uid 1, format `filtered_html`. Settings: insert new, never update existing (`update_existing = 0`), `import_period = -1` (never periodic), `import_on_create = 1`, not in the background, expire 3600. Mapping:

| CSV column | Target |
|---|---|
| Serial No | GUID (unique) |
| Organization | title |
| Street Address | field_address |
| State | field_state |
| City | field_city |
| Zip | field_zip |
| Website | field_website |
| Contact Info | field_contact |
| Hours | field_hours |
| Eligibility Requirements | field_eligibility |
| Scheduling | field_scheduling |
| Patient Status | field_status (shown as "Covid-19 Updates") |
| Rapid Tests Available | field_tests (shown as "Insurance Status") |
| Other Services | field_resource_tags |
| Other tags | field_resource_tag (term by name, auto-create) |

It is run manually from `import/resources_import` (standalone form). One source file was used (a Boston CSV in private files). Imported nodes are published, so `techstep_location` geocodes them on save (§4.1). The rewrite needs an equivalent CSV import for admins.

### 6.7 Add participant

See §4.4.

### 6.8 Permissions feature (`twm_permissions_efm`)

A Features export of 163 permissions (`PERM`). The DB is the effective source and differs from the export as follows:
- `access toolbar` is also granted to Research Administrator User.
- `change own username` is also granted to participant.
- The `field_achievements_sharing` perms and the `edit/delete terms in tags / thrive_tips_categories / thrive_tips_tags` perms are **absent** from the DB.
- `use text format filtered_html/full_html` is granted in the DB to level-2, level-2-1 and level-7 only (the export also lists level-3…8).

Permissions of this document's modules as they are in the DB:

| Permission | Roles |
|---|---|
| access_gain_tips | participant |
| access_twm_achievement_bins, _category, _levels_callback, access_account_callback | administrator, Research Administrator User, Coordinator User, participant |
| access_custom_tracking, access_techstep_location | administrator, participant |
| access_ecoach_system | administrator, ecoach-user |
| access_techstep_add_user | administrator, Coordinator User |
| access_twm_randomization | administrator, Research Administrator User, Coordinator User |
| administer twilio, edit own sms number | administrator, Research Administrator User, Coordinator User |
| administer cas server, administer elysia_cron, administer feeds, all masquerade perms, Shorten admin perms | administrator |

The full role and permission matrix for other modules is in the roles/permissions document.

---

## 7. `twm_general` / `twm_utility` business rules (LP)

### 7.1 150-day auto-block (`twm_general_cron`, `TG:244-274`)

```
hourly:
  if date('y-m-d', variable user_cron_last) != today:          # see bug below
     for each user with status != 0 AND role rid 7 (participant):
         start = field_intervention_start_date (NULL -> "now", so 0 days)
         if days_between(start, now) > 150: block list += uid
     if block list non-empty:
         UPDATE users SET status = 0 WHERE uid IN list
         variable user_cron_last = date('y-m-d')     # stored as a STRING
```

- It applies to participants only. It keys off the intervention start date, not account creation. It does nothing to users without a start date.
- **Bug:** the guard passes a `y-m-d` string to `date()` as a timestamp (under PHP 7.4 it is read as ~1970), so the guard never matches and the job effectively runs on every hourly cron. The effect is the same (idempotent). The rewrite can run it daily.
- No notification is sent. The blocked user can no longer log in. The weekly SMS program stops for them because it requires `status=1`, and it would also end on its own after week 24 (168 days).

### 7.2 Other `twm_general` rules

- **Reactions are mutually exclusive** (`TG:5-59`). When a user sets any flag other than `favourites`, the module deletes that user's other 6 reaction flags on the same entity. Reaction flag names come from the variables `drupal_wall_{thumbs_up,smiley,love,fire,target,thought,super}_{node,comment}`. The rows are deleted directly from `flagging` and `uy_wallflag_count`. It then inserts a `uy_wallflag_count(fid, entity_type, entity_id, uid, count=1, created)` row. That insert also runs for `favourites`. Unflag deletes the count row except for `favourites` and `resource`. Helpers: `flag_count(fid, entity_id)` sums counts, and `flag_records(fids, entity_id, uid)` returns CSS class `wall-opacity-true/false`. `uy_wallflag_count` schema: `TG.install:34-83`.
- **Participants' node forms** (`TG:144-164`): on a `tech_support` node the title is hidden and forced to "Tech Support Feedback", the body placeholder is "Enter Technical Problem Details" and the submit button reads "Submit". On `drupal_wall` edit the title is hidden.
- **Search views** `search_wall` / `search_thrive`: the exposed filters are pre-filled from the view argument (`TG:183-202`).
- **Anonymous users are denied Thrive Tips nodes** (`hook_node_access`, `TG:212-219`).
- **Phone normalisation** of `field_number` on every entity save (§3.1, `TG:226-237`).
- **Deleting a resource** deletes its `ts_locations` row (`TG:280-294`).

### 7.3 `twm_utility` rules (`TU`)

- **Every new LP account gets role `control`** (rid 6), through `hook_user_insert` (`TU:329-338`). Admin-created, add-participant and any other new accounts are all affected. Participant status is conferred only by randomization (§6.1).
- **eCoach redirect on login** for eCoach-only users and coaches (`TU:10-20`, same as `SSO:61-72`).
- `user/edit-my-profile` redirects to `user/{uid}/edit`. `user/view-profile/{uid}` redirects to `/my-profile` for yourself and to `/user/{uid}` for others (`TU:22-55`).
- `twm_utility_profilepic($user, $style)` returns the avatar linked to `user/view-profile/{uid}` (`TU:65-97`). Precedence: `field_user_picture` (a file id), then core `picture`, then `user_picture_default`. `twm_utility_profile_block` wraps it with the "Level N" button (to `/levels`) and the username (`TU:104-119`).
- Thrive Tips `field_description` / `field_html_content` default to text format `thrive_editor` (`TU:126-155`).
- The password-confirm labels on the account form become "New Password" / "Confirm New Password" with the placeholders "new password" / "confirm new password" (`TU:169-178`).
- The forgot-password form redirects to `/` after submit. The one-time-login form posts to `user/reset/{uid}/{ts}/{hash}/login?destination=edit-profile-form-page` (`TU:191-216`).
- **Level-6 colour theme** body class (§2.3, `TU:222-233`).
- Views hooks (`TU:238-271`):
  - `today_thrive_tips` marks each tip `hilight` when the user's profile field named in the tip's `field_user_field` satisfies `version_compare(user_value, tip.field_value, tip.field_operator)`. This is the "Recommended" tip that earns 5 points (P6).
  - `engagement_report_for_study_management` replaces two columns with "days since account created" and "days since last access".
- Theme helper `twm_bootstrapless_js_alter` removes `calendar.js` for anonymous users. `entities()` / `ordutf8()` / `unichr()` are HTML-entity-encoding helpers (`TU:272-325`).

---

## 8. Consolidated defects and rewrite decisions

1. Two level tables (§2.3). Level roles are only granted for the current bucket, and `user_save` runs on every profile view.
2. Unlimited point farming (P1–P3, P8, P10–P14). The author earns +10 for comments on their own post. `upvote-earned` is capped at 1 per post.
3. `profile-complete` is unreachable. Several defined achievements are never awarded. Badges, leaderboard and level-up notifications are dead.
4. The SMS scheduler depends on an exact cron minute (00:01 / 23:59 local, and the exact minute for WELCOME). A missed minute means a missed week. An empty user timezone leaks the previous user's timezone. The rewrite should compute the weekly send time deterministically and store it per week.
5. Tracker SMS uses unverified `twilio_user` numbers while the program SMS uses `field_number`. Pick one number source.
6. SMS click tracking trusts the `uid` in the URL.
7. Inbound SMS is dropped (all country codes disabled).
8. The resource search has SQL injection and sorts distance as a string. The Google API key is hard-coded.
9. The `reminders` table is missing, which breaks de-randomization. The `/delete-tracking` and `/save-tracking` routes are broken.
10. The PN tracker view needs an undefined `path` DB connection.
11. CAS tickets never expire and the service whitelist is empty.
12. The 150-day block guard bug (harmless).
