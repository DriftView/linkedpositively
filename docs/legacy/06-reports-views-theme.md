# 06 — Reporting, Views, and LP Theme/UX (Link Positively)

> Scope: the Link Positively (LP) Drupal 7 site at `lp/`. This document stands on its own because the Drupal code will be deleted.
> Sources: code under `lp/sites/all/modules/*` and `lp/sites/all/themes/twm_bootstrapless`, plus the live DB `linkpositively` (config, schema, and counts only; no personal data).
> Paths below are relative to `lp/sites/all/` unless they start with `lp/`. `file:NN` means a line number.
>
> Glossary used throughout:
> - **SID / Study ID**: the user field `field_study_id` (text, on the user entity; defined by `modules/qualtrics_survey_efm`). Every research report identifies people by SID, not by name.
> - **Participant**: a user with role `participant` (rid 7). Other research roles: `control` (rid 6), `Coordinator User` (rid 5), `Research Administrator User` (rid 4), `coach` (rid 19), `ecoach-user` (rid 20), `administrator` (rid 3).
> - **XLS / CSV pair**: almost every custom report has two routes. The first streams an Excel file built with the PHPExcel library, and the second, ending in `-csv`, streams CSV.

---

## Part 1 — Reports

### 1.0 Report hub and shared conventions

**Hub page `admin/uy-reports`** (`modules/uy_standard_usage_report/uy_standard_usage_report.module:22-27, 81-150`)
- Access: permission `access_uy_all_reports_form`, held by `administrator` and `Coordinator User`. It also appears as a shortcut named "LinkPositively Reports" in the admin shortcut set (`shortcut-set-1`).
- Renders one table with the header `Report Name | XLS Report | CSV Report`. Each row has two "Export" links. The rows in display order:

| # | Report Name (verbatim) | XLS route | CSV route |
|---|---|---|---|
| 1 | Standard Usage Report | `standard-usage-report` | `standard-usage-report-csv` |
| 2 | Standard User Interaction Report | `user-interaction-report` | `user-interaction-report-csv` |
| 3 | Standard User Engagement Report | `user-engagement-report` | `user-engagement-report-csv` |
| – | *(commented out)* Standard User CheckIn Report | `user-checkin-report` | `user-checkin-report-csv` |
| 4 | Standard User Content Warning Clicks | `content-warning-clics` | `content-warning-clics-csv` |
| 5 | Standard User Content Warning Report | `content-warning` | `content-warning-csv` |
| 6 | Standard User tracker page views Report | `tracker-page-view` | `tracker-page-view-csv` |
| 7 | Standard User profile edits Report | `profile-edits` | `profile-edits-csv` |
| 8 | Standard User profile avatar Report | `profile-avatar` | `profile-avatar-csv` |
| 9 | Standard User Resource Views Report | `resource-views-count` | `resource-views-count-csv` |
| 10 | Standard User Thrivetip Comments Report | `thrivetip-comments` | `thrivetip-comments-csv` |
| 11 | Standard User Resource Comments Report | `resources-comments` | `resources-comments-csv` |
| 12 | Standard User Resource Rating Report | `resources-rating` | `resources-rating-csv` |
| 13 | Standard User Tracked Items Report | `user-tracked-items` | `user-tracked-items-csv` |
| 14 | Standard User Submitted Resources Report | `user-submitted-resources` | `user-submitted-resources-csv` |
| 15 | Standard User Reactions Count Report | `user-reactions-count` | `user-reactions-count-csv` |
| 16 | Study Management Report | `study-management-xls` (Views data export) | `study-management-csv` (Views data export) |

The hub does **not** link to the tips reports (`user-tips-report`, `user-fav-tips-report`), the Access Report, the Action Plan, the Views-based `reaction-count` or `resource-rating` pages, or the `resource-list.csv` and `tips-export` exports. Those are reached from shortcuts, menus, or by URL (see 1.10).

**Shared export mechanics (the same in every `uy_*` module):**
- **XLS route**: loads the PHPExcel library and writes a 2-D array. Row 1 is the header, then one row per record. Cells are written with `setCellValueByColumnAndRow(col, row+1, value)`, and the file is streamed with `Content-Type: application/vnd.ms-excel` and `Content-Disposition: attachment;filename="<Name>.xls"`. Most reports use the `Excel5` writer (BIFF .xls). `User_CheckIn_Report`, `User_Fav_Tips_Report`, and `User_Tips_Report` use the **`Excel2007` writer (actually .xlsx content) but keep a `.xls` filename**. In reports whose rows contain nested arrays (the comments, ratings, and reactions reports), the nested values are spread across adjacent columns, starting at `column + index`.
- **CSV route**: sends `Content-Type: text/csv; utf-8`, except the usage report, which sends `application/csv; utf-8`, with `Content-Disposition: attachment;filename=<Name>.csv`. The body is `implode(',', row) . "\r\n"` for the header and then each row. **Nothing is quoted or escaped.** A few free-text fields have `\r`, `\n` and `,` replaced by a space first (called out per report). There is no BOM.
- Both routes are plain GET pages. There are no filters or date ranges (except the Access Report), and every report always covers all of history.
- Rewrite recommendation: one report service that yields rows, with CSV (RFC 4180 quoting) and XLSX serializers. Keep the column headers and filenames below verbatim, because research staff scripts may depend on them.

**Tracking tables that feed the reports** (schemas are in the `.install` files; row counts are from the live DB):

| Table | Written by | Purpose | Rows |
|---|---|---|---|
| `youthrive_reports` (id, uid text, login_date int, device_used text, logout_date int, created int) | `hook_user_login` / `hook_user_logout`, participants only (`uy_standard_usage_report.module:47-77`) | login sessions | 7,199 (4,637 with NULL logout) |
| `ts_user_stats` (id, uid, nid, type text, text text, count int, created int) | `save_user_stats($type,$text)` (`uy_standard_user_engagement.module:658-702`) | per-user counters keyed by `type` | profile-edits 39, profile_avatar 47, resource_views 73, tpv 76 (no `cwc` rows) |
| `sms_engagement_messages` (id, uid, week varchar, clicked varchar, link_clicked_date int) | `message_links_click_count("uid:week")`, called from `themes/twm_bootstrapless/templates/html.tpl.php:56-58` when any page is loaded with `?sms=<uid>:<N>` | SMS link click (weekly engagement texts) | 65 |
| `profile_features_update` (id, uid, count, created) | `hook_user_update` when About-me or Age changes (`uy_standard_user_engagement.module:583-614`) | profile edit counter | 120 |
| `user_goals_reported` (id, uid, nid, count, created) | goals feature | goal progress reports | 285 |
| `user_tips_report` (id, uid, nid, count, created) | `tips_view_count()` in `modules/youthrive_game_mechanics/youthrive_game_mechanics.module:512-534`, on each Thrive Tip view | per-user, per-tip view counter | 423 |
| cache bin `cache_thrive_tips` (cid = "`uid-nid`") | `assign_tip_points()` in `youthrive_game_mechanics.module:459-470`, on the first view of a tip | "has viewed tip" marker (distinct views) | 49 |
| cache bin `cache_user_goals_view` (cid = "`uid-nid`") | `hook_node_view` for `user_goals` (`uy_standard_user_engagement.module:565-578`) | first view of a goal | – |
| `uy_wallflag_count` (id, fid, entity_type, entity_id, uid, count, created) | reaction flags on wall posts and comments (`drupal_wall`, `twm_general`, `twm_comment_notification`) | reaction tallies | 104,908 |
| `reminder_checkin` (id, uid, meds int, moods int, checkin int, created int) | SMS/daily check-in | medication and mood check-ins | 470 |
| `accesslog` (core statistics; `statistics_enable_access_log=1`, never flushed) | core | every page hit (uid, path, timestamp) | 190,845 (2020-12 → 2026-09) |

`save_user_stats` type codes and their callers:
- `tpv`: tracker page view (`modules/techstep_tracking/techstep_tracking.module:668`).
- `resource_views`: resource page view (`modules/techstep_location/techstep_location.module:559`).
- `profile-edits`: profile form submit (`modules/youthrive_profile/youthrive_profile.module:1469`).
- `profile_avatar` with `text` = the avatar filename or wall-photo status (`youthrive_profile.module:1290, 1344`).
- `cwc`: content-warning click. There is no caller in code, so it is always empty.

The upsert logic is: if a row exists for (uid, type), set `count = count+1, created = now`; otherwise insert one with count 1. For `profile_avatar`, the `text` column keeps only its **first** value, because updates never rewrite `text`. The route `save_user_stats/%` (permission `access_custom_tracking`) exposes this for AJAX (`uy_standard_user_engagement.module:26-30`).

---

### 1.1 Standard Usage Report (`uy_standard_usage_report`)

- Routes: `standard-usage-report` (XLS; permission `access_uy_standard_usage_report_form`) and `standard-usage-report-csv` (CSV; permission `access_uy_standard_usage_report_form_csv`). Both permissions are held by administrator and Coordinator User (`uy_standard_usage_report.module:6-21, 239-251`).
- Files: `Standard_Usage_Report.xls` (Excel5) and `Standard_Usage_Report.csv`.
- Columns: `Participant SID | Login Date and Time | Type of Device Used | Total Session Duration`. One row per login session (`:191-234`).

```sql
SELECT yr.uid, yr.login_date, yr.device_used, yr.logout_date, sid.field_study_id_value AS study_id
FROM youthrive_reports yr
JOIN field_data_field_study_id sid ON sid.entity_id = yr.uid
CROSS JOIN role r WHERE r.rid = <participant rid>  -- quirk: joins role on rid only; it filters nothing
ORDER BY yr.created DESC;
```
- `Login Date and Time` = `date('m.d.Y H:i:s', login_date)` in server time.
- `Type of Device Used` = the raw User-Agent string, with CR, LF and `,` replaced by a space.
- `Total Session Duration` = `get_session_duration(login, logout)` (`:255-271`). It takes `diff = logout - login`, then:
  - if hours≠0 and minutes≠0 and seconds≠0: `"%h hours %i minutes %s seconds"`
  - else if hours=0 and minutes≠0 and seconds≠0: `"%i minutes %s seconds"`
  - else: `"%s seconds"`

  Known defects to decide on (not replicate blindly):
  1. Days, months and years are dropped, so sessions of 24 hours or more wrap around.
  2. Any zero component collapses to seconds only. For example, 1h 0m 5s is reported as "5 seconds".
  3. When `logout_date` is NULL (64% of rows: the user never clicked Log out), the logout time is 1970-01-01. The diff is then years long and prints only its h/i/s parts, which is garbage.

  The recommended rewrite: duration = logout − login, formatted `H:MM:SS`, and blank when there was no logout (or estimate from the last access).
- Session capture (`:47-77`):
  - On login, if the user has the `participant` role, insert {uid, login_date=now, device_used=User-Agent, created=now}.
  - On logout (participants only), set `logout_date=now` on that uid's latest row with a NULL logout.

### 1.2 Standard User Engagement Report (`uy_standard_user_engagement`)

- Routes: `user-engagement-report` (XLS; permission `access_uy_standard_user_engagement_report`) and `user-engagement-report-csv` (permission `access_uy_standard_user_engagement_report_csv`). Both are held by administrator and Coordinator User (`uy_standard_user_engagement.module:14-25, 193-202`).
- Files: `Standard_User_Engagement_Report.xls` / `.csv` (`:236-270`).
- Rows: one per user who has the participant role and a study-ID row (`:278-290`).

```sql
SELECT u.uid, sid.field_study_id_value AS sid, COUNT(n.nid) AS number_of_wall_posts
FROM users u
LEFT JOIN users_roles ur ON ur.uid = u.uid
JOIN field_data_field_study_id sid ON sid.entity_id = u.uid
LEFT JOIN node n ON n.uid = u.uid AND n.type = 'drupal_wall'
WHERE ur.rid = <participant>
GROUP BY u.uid;
```

Columns, in order (header strings verbatim, `:275`):

| # | Header | Computation |
|---|---|---|
| 1 | `Participant SID` | study id |
| 2 | `Frequency of wall posts by Participant SID` | `COUNT(node.nid WHERE type='drupal_wall' AND uid=u)`. Counts all statuses, including unpublished posts. |
| 3 | `Number of comments by Participant SID` | `SELECT COUNT(cid) FROM comment WHERE uid=u`. Counts all comments on any node type, any status (`:323-327`). |
| 4 | `Number of Thrive-Tips Viewed` | number of `cache_thrive_tips` entries whose cid begins with `u-`, i.e. distinct tips viewed (`:330-339`) |
| 5 | `Number of Tailored Thrive-Tips Viewed` | of those viewed tip nids, how many are flagged by this user with flag fid 9 `twm_tailored_tips_tailored` ("Highlighted Thrive Tip") (`:503-523`) |
| 6 | `Number of Thrive Tips marked as 'Favorites' ` (sic, trailing space) | `COUNT(flagging WHERE uid=u AND fid=10 'favourites' AND entity_type='node')` (`:528-536`) |
| 7–32 | `SMS Engagement Message Clicked:Week-1` … `Week-19`, `Week-19+4days`, `Week-20` … `Week-26` (26 columns) | `1` if a `sms_engagement_messages` row exists for (uid, week='WEEK-N'), else `0`. The "Week-19+4days" column matches the stored week `WEEK-19 4`: the `+` in `?sms=uid:19+4` is URL-decoded to a space (`:360-476`). |
| 33 | `Number of days ART Adherence Reported` | **Always empty.** The source (`uy_get_medication_data`) is commented out (`:354-356`). The intended logic: `COUNT(reminder_checkin WHERE uid=u AND meds IN (0,1))` (`:541-561`). |
| 34 | `Number of Mood Responses Reported` | **Always empty**, for the same reason. Intended: `COUNT(reminder_checkin WHERE moods IN (0..7))`. |
| 35 | `Number of Goals Set` | `COUNT(node WHERE uid=u AND type='user_goals')` (`:315-320`) |
| 36 | `Number of Times Progress Toward Goals is Reported` | `SUM(user_goals_reported.count WHERE uid=u)`, or 0 (`:630-636`) |
| 37 | `Total Number of Active Intervention Days` | `COUNT(DISTINCT DATE(from_unixtime(accesslog.timestamp)) WHERE uid=u)`: distinct calendar days with any page hit, over all time (`:347-351`) |
| 38 | `Number of times the participant updated their outward facing profile features` | the latest `profile_features_update.count` for u, or 0 (`:619-625`). It is incremented when About-me or Age changes on user save (`:583-614`). |
| 39 | `Total Points Earned` | `SUM(achievement_stats.points)` grouped by uid (`:299-311`) |

Known defects:
- **Column 39 is misaligned.** The points query returns one row per uid that has points, but it is indexed by the participant loop position (`$res_points[$key]`), so points can belong to a different participant.
- **Carry-over.** The per-user variables (`$sms_link_N`, `$thrive_tips_accessed`, `$tailored_thrive_tips`) are never reset inside the loop. A participant with no data inherits the previous participant's values.

The rewrite should compute every metric per uid with proper GROUP BYs.

### 1.3 Single-metric engagement exports (all in `uy_standard_user_engagement`)

These all use the same permissions as 1.2. The XLS handler is at the listed line and the CSV handler sits just above it.

| Report | Routes | File base name | Columns | Logic |
|---|---|---|---|---|
| Content Warning Clicks | `content-warning-clics[-csv]` (`:31-42, 707-780`) | `Standard_User_Content_Warning_Clics_Report` | `Participant SID, Count` | `SELECT uid, count FROM ts_user_stats WHERE type='cwc'`. **Bug: outputs the uid, not the SID.** It is always empty today because nothing writes `cwc`. |
| Content Warning Report | `content-warning[-csv]` (`:43-54, 785-860`) | `Standard_User_Content_Warning_Report` | `Participant SID, Count` | Runs View `cw` (see 2.x): published `drupal_wall` posts whose **title starts with `!`**, by participants with an SID. Results are grouped by SID, count = number of such posts. (A post titled with a leading "!" is how a content warning is marked.) |
| Tracker Page Views | `tracker-page-view[-csv]` (`:55-66, 864-941`) | `Standard_User_Tracker_Page_View_Report` | `Participant SID, Count` | `ts_user_stats WHERE type='tpv'`. Rows whose user has no SID are skipped. |
| Profile Edits | `profile-edits[-csv]` (`:67-78, 945-1021`) | `Standard_User_Profile_Edits_Report` | `Participant SID, Count` | `ts_user_stats WHERE type='profile-edits'`, SID required |
| Profile Avatar | `profile-avatar[-csv]` (`:79-90, 1025-1102`) | `Standard_User_Profile_Avatar_Report` | `Participant SID, Avatar File Name` | `ts_user_stats.text WHERE type='profile_avatar'` (the first avatar chosen), SID required |
| Resource Views | `resource-views-count[-csv]` (`:91-102, 1106-1183`) | `Standard_User_Resource_Views_Report` | `Participant SID, Count` | `ts_user_stats WHERE type='resource_views'`, SID required |

### 1.4 Comments, ratings, tracked items (`uy_standard_user_engagement/thrive_tips.inc`)

**Thrivetip Comments**: `thrivetip-comments[-csv]`. Files `Standard_User_Thrivetip_Comments_Report.xls/.csv` (`thrive_tips.inc:14-118`).
- Source: View `all_user_comments`, display `comments` (see 2.x). It returns published comments on published `thrive_tips` nodes by participants (rid 7) who have an SID, newest first. The rows are grouped by `comment.uid` (`:224-235`).
- Header: `Participant SID, Count, Comments`.
- Each row is `[SID, number of comments, comment1, comment2, …]`. In XLS the comments occupy columns C, D, E, and so on.
- The CSV format is irregular:
  - the header ends with CRLF;
  - each row is written as `SID,` then `count,` then `comment,` repeated, with a trailing comma;
  - control characters and bytes 0x80–0xFF are stripped from each comment (`preg_replace('/[\x00-\x1F\x80-\xFF]/','')`), which also destroys non-ASCII UTF-8;
  - the CRLF is written only after the comments array.

  Commas inside comment text are **not** escaped.

**Resource Comments**: `resources-comments[-csv]`. Files `Standard_User_Resources_Comments_Report` (`:123-219`).
- Uses the same View, display `resources` (comments on `resources` nodes).
- Same columns. The CSV row is `SID,count,` followed by `implode(',', comments)` and CRLF, with no stripping.

**Resource Rating**: `resources-rating[-csv]`. Files `Standard_User_Resource_Ratings_Report` (`:240-346`).
- Source: View `resource_rating`, display `rating`: published `resources` nodes joined to `votingapi_vote` (the fivestar votes on resources), where the voter is a participant with an SID. Rows are grouped by voter uid.
- Header: `Participant SID, Count, content`.
- Each row is `[SID, number of resources rated, resource title 1, title 2, …]`. The vote value itself is **not** exported.
- The CSV format matches the resource comments report.

**Tracked Items**: `user-tracked-items[-csv]`. Files `Standard_User_Tracked_Items_Report` (`:351-453`).
- Source: the tracker feature tables `ts_tracking` (tracked item definitions per user: uid, tid, text, how_often, day, reminders, noti_text, flag, created) and `ts_tracking_data` (check-ins). The live DB has 113 items and 266 check-ins.

```sql
SELECT c.uid, c.tid, c.text AS ctext, c.created, n.created AS updated, n.uid, COUNT(n.tid) AS count
FROM ts_tracking c JOIN ts_tracking_data n ON c.id = n.tid
GROUP BY n.tid ORDER BY n.created DESC;
```
- Header: `Participant SID, Tracker item description, Tracking start date, Tracking end date, Number of check-ins`.
- Description: if `tid≠0` it is the taxonomy term name (a predefined tracker item); otherwise it is the custom `text`.
- Start date = `ts_tracking.created` and end date = `ts_tracking_data.created` of the group's row (MySQL picks an arbitrary row within the group). Both use the `m.d.Y H:i:s` format.
- Users without an SID are skipped.

  Rewrite: end date = `MAX(data.created)`.

### 1.5 Reactions and submitted resources (`uy_standard_user_engagement/reactions_count.inc`)

**Reactions Count**: `user-reactions-count[-csv]`. Files `Standard_User_Reactions_Count_Report` (`reactions_count.inc:14-119`).

```sql
SELECT uid, fid, COUNT(fid) FROM flagging WHERE fid IN (15,17,37,23,27) GROUP BY uid, fid;
```
- These are reactions **given by** the user on nodes (wall posts).
- Header and flag mapping (`:86-97`):

| Header (verbatim) | Flag |
|---|---|
| `User Id` | uid |
| `Participant SID` | study id |
| `Smile count` | fid 15 `haha_node_reaction` |
| `Heart count` | fid 17 `love_node_reaction` |
| `Thumbs up count` | fid 37 `thumbs_up_node_reaction` |
| `100 count` | fid 23 `fire_node_reactions` |
| `Multi-id pride count` | fid 27 `target_node_reactions` |

- Missing counts are output as an empty string.
- Includes every user who reacted, with no role filter.

**Submitted Resources**: `user-submitted-resources[-csv]`. Files `Standard_User_Submitted_Resources_Report` (`:124-216`).
- Source: View `resource_content_by_users`: published `resources` nodes authored by participants with an SID, newest first.
- Header: `Participant SID, Title`, with one row per resource.

The full flag catalogue, for reference. Node reactions:

| Reaction | fid | Machine name |
|---|---|---|
| haha | 15 | `haha_node_reaction` |
| love | 17 | `love_node_reaction` |
| fire | 23 | `fire_node_reactions` |
| super | 25 | `super_node_reaction` |
| target | 27 | `target_node_reactions` |
| thought | 29 | `thought_node_reactions` |
| angry | 31 | `angry_node_reaction` |
| wow | 33 | `wow_node_reaction` |
| sad | 35 | `sad_node_reaction` |
| thumbs_up | 37 | `thumbs_up_node_reaction` |

Comment reactions: fids 14, 16, 22, 24, 26, 28, 30, 32, 34, 36.

Other flags:

| fid | Machine name | Label |
|---|---|---|
| 1 | `abuse_node` | Node Abuse |
| 3 | `abuse_comment` | Comment Abuse |
| 4 | `abuse_whitelist_comment` | Comment Whitelist |
| 5 | `abuse_user` | User Abuse |
| 7 | `up_voting` | Up Voting |
| 8 | `up_voting_comments` | Up Voting Comments |
| 9 | `twm_tailored_tips_tailored` | Highlighted Thrive Tip |
| 10 | `favourites` | Favourites |
| 11 | `abuse_whitelist_node` | Node Whitelist |
| 38 | `resource` | "Resource", i.e. report a resource |
| 39 | `favorite_resource` | favorite resource |

### 1.6 Standard User Interaction Report (`uy_user_interaction_report`)

- Routes: `user-interaction-report` (XLS; permission `access_uy_user_interaction_report_form`) and `user-interaction-report-csv` (permission `…_csv`). Both are held by administrator and Coordinator User (`uy_user_interaction_report.module:6-21, 140-149`).
- Files: `Standard_User_Interaction.xls` (Excel5) / `.csv`.
- Header (`:62`): `Date of Post | Post ID | Original Post Content | Participant SID of Original Post | Post Reactions Count | Date of Comment | Parent Post ID | Content of Replies to the Original Post | Participant SID of Each Reply | Comment Reactions Count`.
- The output is a thread dump of the wall (`drupal_wall` nodes) authored by participants (`:61-134`):
  1. Select each participant `drupal_wall` post (joined to SID), ordered newest first (`n.created DESC`).
  2. For each post, emit a **post row**: `[m.d.Y H:i:s created, nid, body, SID, postReactions, "", "", "", "", ""]`.
     - `body` = the body with tags stripped and CR/LF/`,` replaced by spaces, **concatenated with** the photo file URI (`public://…`) and the video URL, if any.
     - `postReactions = SUM(uy_wallflag_count.count WHERE entity_id=nid AND entity_type='node')` (`:228-236`).
  3. Then emit one **comment row** per comment on that post: `["", "", "", "", "", m.d.Y H:i:s comment.created, nid, commentBody+imageURI+videoURL, commenter SID, SUM(uy_wallflag_count.count WHERE entity_id=cid AND entity_type='comment')]`.
     - Comments are ordered newest first.
     - Only commenters with an SID are included.
     - All comment statuses are included (`:199-223`).
- Quirk: the comment lookup loops over GROUP_CONCATs per commenter, so the last group's result wins. Effectively, all comments of the post are returned. Unpublished posts are included (there is no status filter).

### 1.7 Check-in Report (`uy_user_checkin_report`), module **disabled**

- Routes `user-checkin-report` / `user-checkin-report-csv` (permissions `access_uy_user_checkin_report_form[_csv]`). The module is **disabled** (`system.status=0`) and its hub row is commented out. It is kept here because the tips reports reuse its permission names.
- Files: `User_CheckIn_Report.xls` (Excel2007 writer) / `.csv`.
- Header: `Participant SID, Start Date`, then for i = 1..150 the pair `Day{i}/Med Taken` and `Day{i}/Mood Reported` (302 columns; `uy_user_checkin_report.module:62-69`).
- Rows: participants with an SID and `field_intervention_start_date`. Start Date is `m.d.Y`.
- For each of the 150 days from the start date: the matching `reminder_checkin` row, where `meds` 1→`YES`, 0→`NO`, NULL→`NULL`, and `moods` 1 Excited, 2 Happy, 3 Content, 4 Neutral, 5 Anxious, 6 Sad, 7 Angry, NULL→`NULL`. Days without a check-in print `NULL` (`:140-172`).
- Bug: days are matched on an **exact timestamp**, so check-ins are appended as extra columns rather than replacing the day slot. `usort(...,'cmp')` references an undefined `cmp` function (`:173-189`).

  If this report is revived, match by calendar day.

### 1.8 Tips reports (`uy_user_tips_report`)

- Routes and permissions (`uy_user_tips_report.module:6-34`):
  - `user-fav-tips-report` (XLS, `User_Fav_Tips_Report.xls`, Excel2007 writer) and `user-fav-tips-report-csv`.
  - `user-tips-report` (XLS, `User_Tips_Report.xls`) and `user-tips-report-csv` (in `user_tips_report.inc`).
  - Access uses **`access_uy_user_checkin_report_form` / `_csv`**. Those permissions are defined by the disabled check-in module and granted to no role, so in practice only **uid 1** can run these reports.
- Both reports are wide participant × tip matrices:
  - Column headers: `Participant SID`, followed by the **title of every published `thrive_tips` node**, in DB order. For CSV, commas in titles become spaces.
  - Rows: every participant (rid 7) that has an SID (`get_active_users`, `:142-153`).
- **Favorites matrix**: the cell is `1` if the participant flagged the tip with flag fid 10 `favourites`, else `0` (`:76-131, 155-165`).
- **Views matrix**: the cell is `user_tips_report.count` for (uid, nid), i.e. the number of times the participant opened that tip, else `0` (`user_tips_report.inc:62-116, 117-124`).

### 1.9 Access Report (`access_report`)

- Route: `admin/access-report`, title "System Resource Access by Week". Permission `administer access_report` (administrator, Coordinator User). It is a MENU_CALLBACK and is linked from the admin shortcut "Access Report" (`access_report.module:5-16`). Depends on core `statistics` (access log).
- The form has **Start Date** and **End Date** fields (date_popup, `Y-m-d`, both required and readonly), plus **Submit**. Submitting rebuilds the same page with a table below the form (`:30-104`). If start = end, the range becomes 00:00:01–23:59:59 of that day. Otherwise it runs from midnight of the start date to **midnight at the start of the end date**, so the end day itself is excluded.
- Table header: `USER | RESOURCE_ACCESS_TOTAL | DAYS_WITH_RESOURCE_ACCESS`.

```sql
SELECT u.name, COUNT(t.path) AS resource_access_total,
       COUNT(DISTINCT FROM_UNIXTIME(t.timestamp,'%Y %D %M')) AS days_with_access
FROM accesslog t JOIN users u ON u.uid = t.uid
WHERE t.uid <> 0 AND t.timestamp BETWEEN :start AND :end
GROUP BY t.uid
ORDER BY COUNT(DISTINCT FROM_UNIXTIME(t.timestamp)) DESC;   -- distinct seconds, effectively ≈ hits
```
- This covers all authenticated users (staff included) and shows the **username**, not the SID. It is displayed as HTML only, with no export.
- The module's `.install` creates a demo `access_report` table that does not exist in the DB. It is irrelevant.

### 1.10 Views-based exports and pages (views_data_export)

| Route | View / display | Format and filename | Access | Columns |
|---|---|---|---|---|
| `study-management-csv` | `engagement_report_for_study_management` / `views_data_export_1` | CSV, `,` separator, quoted, header row, file `%view.csv`, i.e. `engagement_report_for_study_management.csv` | perm `access user profiles` | see below |
| `study-management-xls` | same / `views_data_export_2` | XLS (VDE's HTML-table-as-xls), file `Study Management.xls` | same | same |
| `admin/downloads/resources.csv` | `resources_flat` / `views_data_export_1` | CSV, file `resources_flat.csv` | `access content` | all resource fields (2.x) |
| `resource-list.csv` | `resources_list` / `views_data_export_1` (attached to the `admin/resources-list` page, linked from its header "Export All Data Report") | CSV | role Coordinator User | Title, Address, City, Contact, Description, Eligibility, Hours, Scheduling, State, Covid-19 Updates, Website, Zip, Insurance Status |
| `tips-export` | `thrive_export` / `views_data_export_1` (attached to page `thrive-export`, button "Export to Doc" → `/tips-export?attach=page`) | **Word .doc** (HTML), file `thrive_export.doc`, no batch, uses the parent sort | roles admin, coach, control, Coordinator, Research Admin | one block per tip: `<strong>Title: </strong>[title]<br/>[IMB/AAQ category]<br/>[pull-quote]<br/>[html content]<br/><strong>Tags: </strong>[tags]` |

**Study Management Report columns** (View `engagement_report_for_study_management`, base users):
- Filters: status active, role participant, SID not empty. Sorted by user created DESC.
- Fields:

| Header | Source / computation |
|---|---|
| `study ID` | `field_study_id` |
| `user created` | `users.created`, formatted `m/d/Y` |
| `last login` | `users.login`, formatted `m/d/Y` |
| `days since last login` | `round((now − users.access)/86400)`, or `0` if the user never accessed the site |
| `days since created` | `round((now − users.created)/86400)` |

- The two "days since" columns are placeholder SID fields whose markup is replaced in `hook_views_pre_render` (`modules/twm_utility/twm_utility.module:238-266`). Note that "last login" shows `login` but "days since last login" uses `access` (the last page request).

**Other report-like View pages** (HTML):

| Route | View | Access | Content |
|---|---|---|---|
| `reaction-count` | `reaction_count` | roles coach, control, Coordinator, Research Admin | table: SID, Heart, Smile, Thumbs Up, Pride, Pride. These are COUNTs of the node-reaction flaggings each participant **made** (love, haha, thumbs_up, fire, target). Two columns are both labelled "Pride". |
| `resource-rating` | `resource_rating` | no restriction | resource title, voter, SID, grouped by voter |
| `all-thrive-comments`, `all-resource-comments` | `all_user_comments` | `access comments` | table of SID, uid, comment body |
| `users-study-id` | `users_study_id` | `access user profiles` | name, Study ID, status, roles; 40 per page |
| `user-list` | `user_list` | `access user profiles` | name, Twilio country code and phone, `field_number`; exposed "Active" filter |

Rewrite note: pages that expose SIDs or phone numbers under the weak `access user profiles` permission must be restricted to research staff.

### 1.11 Action Plan (`twm_survey_reports`), survey-driven personal report

- Route: `action-plan`, title "Action Plan". Permission `access_twm_survey_reports` (administrator, Coordinator User, **participant**). There is a navigation menu link "Action Plan" (`twm_survey_reports.module:39-61`).
- Inputs:
  - the **last** row of `multiple_qsurveys` (the Qualtrics survey definition XML), from which it builds an `ExportTag → QuestionText` map (`:73-96`);
  - the current user's scores `i1..i9`, `m1..m10`, `b1..b14` (`:104-140`);
  - the `thrive_tips_categories` vocabulary terms, indexed 0–6 in tree order (weight, then name).

  The seven category terms are:

  | Index | Category term |
  |---|---|
  | 0 | Learn more about how HIV medications work and how to get the information you want about HIV |
  | 1 | Learn more about how to get more support from others |
  | 2 | Learn more about how to take your medications as prescribed and what to do when you miss doses |
  | 3 | Learn more about how your medications interact with drugs and alcohol |
  | 4 | Learn more about ways to make taking your medication part of your daily life and feel less frustrated |
  | 5 | Learn more about why it is important to take your medications for your short and long-term health |
  | 6 | Learn more ways to feel better about your HIV and your HIV medications |

- Rule table (`:2-35` thresholds, `:144-365` rules). A rule that fires adds the question text of that export tag under the listed category.

| Score | Fires when | Tag | Category idx |
|---|---|---|---|
| i1 | < 5 | IA1: | 2 |
| i2 | < 5 | IA2: | 2 |
| i3 | > 1 | IA3: | 2 |
| i4 | < 5 | IA4: | 4 |
| i5 | > 1 | IA5: | 2 |
| i6 | < 5 | IA6: | 0 |
| i7 | < 4 | IA7: | 2 |
| i8 | < 4 | IA8: | 5 |
| i9 | < 4 | IA9: | 3 |
| m1 | > 2 | MA1: | 6 |
| m2 | > 2 | MA2: | 4 |
| m3 | > 3 | MA3: | 6 |
| m4 | < 4 | MA4: | 1 |
| m5 | < 3 | MA5: | 1 |
| m6 | > 2 | MA6: | 1 |
| m7 | > 2 | MA7: | 6 |
| m8 | > 2 | MA8: | 5 |
| m9 | > 2 | MA9: | 6 |
| m10 | > 2 | MA10: | 4 |
| b1 | > 2 and < 5 | BA1: | 3 |
| b2 | < 4 | BA2: | 0 |
| b3 | < 4 | BA3: | 1 |
| b4–b10 | < 4 | BA4:…BA10: | 4 |
| b11 | < 4 | BA11: | 6 |
| b12, b13 | < 4 | BA12:, BA13: | 5 |
| b14 | < 4 | BA14 (no colon) | 1 |

- Output:
  1. A panel with `<h4>Action Plan</h4>` and two intro paragraphs (verbatim at `:374-376`: "Welcome to your Thrive With Me Action Plan! … Thrive Tips that are part of your Action Plan will be marked with a blue triangle in the lower right corner … sorting by Recommended. The Thrive Tips are organized into the following categories:").
  2. For each category that has at least one fired rule, a panel with an `<h5>` category title and one line per triggering question text.
- **Current state: effectively dead.** The user fields `i1…b14` do **not exist** in `field_config`, so every score is null. Null compares as 0, so every `>` rule is false and every `<` rule is true, meaning the page lists almost every question. `twm_survey_reports.test` exists but is not relevant. Confirm with stakeholders before porting. It belongs to the Thrive-With-Me heritage of the codebase.

### 1.12 Qualtrics survey sync (`qsurvey`, disabled) and `qualtrics_survey_efm` (enabled)

**`qualtrics_survey_efm`** (feature, enabled) contains only configuration:
- User fields `field_study_id` (text, label "study_id", hidden on display) and `field_number` (text, label "number", the phone number).
- field_permissions: create/edit/view for administrator, Coordinator User, and Research Administrator User. `create field_study_id` is also granted to anonymous (registration) and `create field_number` to control.
- A ctools `services` API v3 declaration.
- A menu link "Survey Report" → `survey_reports` in `menu-twm-menu`. **No route exists** for `survey_reports`, so the link is dead.

**`qsurvey`** (the actual Qualtrics integration) is **disabled** (`system.status=0`), but its tables hold data:

| Table | Rows / note |
|---|---|
| `qsurvey_admin` | 1 row: Qualtrics username + API token. Secret, not reproduced. |
| `multiple_qsurveys` (id, tokenid, surveyid, status, data longblob = survey definition XML) | 2 surveys: `SV_3Q1u2PtKqjJnsB7` (status 1, baseline → create users) and `SV_cCsRZVHope5XwtD` (status 0, midpoint/follow-up → update users) |
| `qsurvey` / `cache_qsurvey` | question → profile-field mapping (see below) |
| `users_logs` | per Qualtrics ResponseID processing log (name, status message, survey_id, created); 198 rows |
| `qsurvey_watchdog` | error log |
| `twm_survey_response_log` (id, last_cron_time, admin_current_time, survey_start_time, survey_end_time, survey_response_id) | 5,406 rows |

- Admin routes (permission `qsurvey configuration permissions`: administrator, Coordinator User) (`qsurvey/qsurvey.module:13-58`):
  - `admin/survey`: save the Qualtrics credentials and survey IDs. On save it also calls the event-subscription API (`…/API/v3/eventsubscriptions?publicationUrl=<host>/qualtrics/subscribe&topics=controlpanel.activateSurvey`, `:1256`).
  - `admin/survey_mapping`: map survey questions to profile fields.
  - `admin/survey_details`.
  - `admin/survey_logs`, plus ctools modal popups `admin/mymodule/%ctools_js` and `admin/logs/%ctools_js`.
  - `admin/config/system/qualtrics-url`: "Qualtrics Midpoint Survey" URL, variable `midpoint_url`. Default `https://umn.qualtrics.com/jfe/form/SV_cCsRZVHope5XwtD` (University of Minnesota Qualtrics). Permission `administer site configuration`.

  Main-menu links "Qualtrics Configuration" (`survey`, `admin/survey`) and "Access Report" (`access_report`) exist too, but their paths are wrong or hidden.
- Schedule: Elysia cron job `qsurvey_createuser_cron`, rule `*/13 * * * *`, i.e. every 13 minutes (`:61-69`).
- Algorithm (`:1495-2015`):
  1. Window: `start = variable last_cron − 6h`, `end = now (UTC)`. Then set `last_cron = now`.
  2. For each survey in `multiple_qsurveys`, call Qualtrics API v3 with the header `X-API-TOKEN` (`:115-196`):
     - `POST /API/v3/responseexports` with `{format:'xml', surveyId, startDate, endDate}`;
     - sleep 5 s, then `GET /API/v3/responseexports/{id}`, retrying once if the status is "in progress";
     - `GET` the result `file` (a zip), extract it to `sites/default/files/response/`, and parse the XML named by the variable `BASELINE_XML` / `FOLLOWUP_XML`.

     The base host in the code is the placeholder `yourdatacenterid.qualtrics.com`.
  3. **Baseline (status 1)**: for each `Response` whose ResponseID is not already in `users_logs`:
     - map the columns with the `qsurvey` table (`profile_field` ≠ `Ignore`);
     - validate the email, the study ID (required) and the name (required);
     - skip the response if a user with the same study ID or email exists;
     - otherwise `user_save` a new **active** user with timezone `America/New_York`, role **`control`**, a random password, and fields from the mapping;
     - log every outcome to `users_logs` / `qsurvey_watchdog` / `twm_survey_response_log`.
  4. **Follow-up (status 0)**: find the question whose text contains "Study ID" via `GET /API/v3/surveys/{id}` (`:1478-1493`), match the response to an existing user by SID, write the mapped fields, set `field_followup_survey = 1`, and log.
- Field mapping in the live DB (site config):
  - baseline `SV_3Q1u2PtKqjJnsB7`: export tags `01`→`field_study_id`, `02`→`name`, `03`→`mail`, `04`→`field_number`, and `I1..I9`→`i1..i9`, `M1..M9`→`m1..m9`, `B1..B17`→`b1..b17`;
  - follow-up `SV_cCsRZVHope5XwtD`: `Q1`→`field_study_id`, plus the same I, M and B mapping.
- The `qsurvey/subscribe` submodule declares a Services resource `qualtrics/subscribe` for Qualtrics event callbacks.
- Rewrite: implement as a scheduled job (about every 15 min) against Qualtrics API v3/v4 "export-responses", with the token in env/secret storage. Keep the ResponseID idempotency log. New baseline respondents are created as `control`; staff later convert them to `participant` via "Convert Control Users" (2.x `user_operations`). Keep the midpoint URL setting.

---

## Part 2 — Views

The DB table `views_view` holds **33** views (Normal = DB only, or Overridden = code default modified in DB). With code-default views from modules, **53** views are known to Views. Disabled views are listed briefly at the end. Role IDs: 2 authenticated, 3 administrator, 4 Research Administrator User, 5 Coordinator User, 6 control, 7 participant, 19 coach, 20 ecoach-user.

Notation:
- `F:` fields
- `Fl:` filters
- `S:` sorts
- `A:` contextual arguments
- `R:` relationships

### 2.1 Participant-facing views (Thrive Tips, search, mentions, glossary, profile)

**`today_thrive_tips`** (Overridden; module `thrive_tips_efm`). The core daily-tips engine. Base node.
- Master:
  - F: title, the favourites flag link (`flagging.ops`), `field_tip_type` (key), `field_description`, path, `field_html_content`, `field_video_link`, `field_thrive_tags` (plain), `field_template`, `field_user_field`, `field_operator`, `field_value`, nid.
  - Fl: published, type `thrive_tips`.
  - A: `field_display_day_value` (multiple values allowed, "1,2,3").
  - S: display_day DESC.
  - R: flag `favourites` (current user).
  - Pager none, access none.
- `hook_views_pre_render` (`twm_utility.module:241-252`) marks each row as `hilight` or `unhilight`. The rule: `user.{field_user_field}` compared with `field_value` using `field_operator` (`version_compare`) is true. This is the "tailored / recommended tip" highlighting.
- Displays:

| Display | Type | Argument / notes |
|---|---|---|
| `today_tips_cycle_1` | block | days 1–90 of the intervention, argument `field_display_day` |
| `today_tips_cycle_2` | block | argument `field_display_day_two` (the second 90-day cycle, reordered) |
| `today_wall_tips_cycle_1` / `_2` | block | the same, used on the wall |
| `favs` | block | filter: favourites flagged = 1. Empty text "No Favorite Tips found." Time cache 1 h. |
| `tags` | block | argument `taxonomy_index.tid`, AJAX, cache 1 h |
| `comment_tip_node` | block | argument nid, a single tip |
| `page_1` | page | path `tetser` (a test page) |

- Day argument computation (`modules/twm_tailored_tips/twm_tailored_tips.module:332-369`):
  - `days = 1 + ceil((today00:00 − field_intervention_start_date)/86400)`;
  - if days > 90: cycle 2, with `days = days − 90`;
  - "single" mode passes `days`; list mode passes `"0,1,2,…,days"` (or `"90,1..90"` after day 90).
  - `select_thrive_tips_block_display()` chooses cycle_1 when days ≤ 90, else cycle_2 (`block_default.inc:95-125`).

**`thrive_tips_all`** (Overridden; `thrive_tips_efm`). Base `taxonomy_term_data`, style **views_accordion** grouped by term name, group_by on. It serves the Thrive Tips library page tabs.
- R: `taxonomy_index.nid` → node, plus flags `twm_tailored_tips_tailored` and `favourites`.
- A: `field_display_day_value` (receives "all days so far"). So the library only shows tips already released to the user.
- The rendered row is a rewrite template: `<div class="row border [flagged]"><div class="col-sm-10 col-xs-8 icons"><span class="[field_tip_type]"></span><p><strong>[title]</strong></p> …` (the tip type sets the icon; `[flagged]` adds the highlighted-triangle class). The title links to `thrive-content/[nid]/[tid]`.
- Displays:

| Display | Label | Content |
|---|---|---|
| `block_1` | "ALL" | all released tips grouped by category (vocab `thrive_tips_categories`) that have tags |
| `block_3` | "RECOMMENDED" | the same, with filter "Highlighted Thrive Tip" flagged = 1 (tailored) |
| `block_2` | "FAVORITES" | favourites flagged = 1 |
| `block_4` | "TAGS" | a list of tag buttons (`<a class="tip-tags btn-primary pull-left mr-20 mb-15 mt-0" id="[tid]">name</a>`) from vocab `thrive_tips_tags`, sorted by name. Clicking one loads `today_thrive_tips:tags` via AJAX. |
| `attachment_1` | – | attached after `block_4`: an accordion grouped by `field_imbaaq_category` |
| `thrive_block` | "Thrive Category" | "Related Tips" in the category (argument tid), linking to `thrive-tips/thrive-content/[nid]/[tid]` |

- These are embedded by page callbacks (`twm_tailored_tips.module:11-60, 165-191`):

| Route | Renders |
|---|---|
| `thrive-tips` | `block_1` (All) |
| `thrive-tips/recommended` | `block_3` |
| `thrive-tips/favs` | `today_thrive_tips:favs` |
| `thrive-tips/tags` | `block_4`, plus `today_thrive_tips:tags` for `arg(2)` |
| `tips` | today's tip (cycle-selected) |
| `comment-tip/%` | `comment_tip_node` |

  Each route has its own permission: `access_twm_tailored_tips_all`, `_recommended`, `_favs`, or `_tags`. These four routes are the four tabs of the Thrive Tips library: ALL, RECOMMENDED, FAVORITES, TAGS.

**`daily_thrive_tips`** (code default; `thrive_tips_efm`). A day argument lists tip title and description. Display `embed_1` "Single Day" has the header "Today's Thrive Tips". Access: roles admin, authenticated, Research Admin. It is used through `embed_views`.

**`backup_today_thrive_tips`** (Normal). A copy of `today_thrive_tips`, titled "Test Thrive Tips", with **required** tailored and favourites relationships. Block `today_tips_cycle_2` is **placed in `sidebar_second` on `<front>` and `thrive-tips`** in the twm_bootstrapless theme. This is legacy, but it is live.

**`thrive_tips_view1`** (code default). A block of the 10 newest tips' titles. Roles admin, auth, Research Admin. Not placed.

**`search_wall`** (Overridden; `youthrive_search_efm`). Site search over wall posts and their comments. Base node, R: comment (`node.cid`) and author.
- Fields (grouped by node type): type, uid, nid, comment uid/cid, title, author name, comment author, subject, body (plain), comment body, created, comment created, counter, comment_count.
- Filters: published, `drupal_wall`, plus two exposed filters: `body_value` and `comment_body_value`, in an OR group.
- Displays:

| Display | Path | Pager / notes |
|---|---|---|
| `wall_search` | `search-wall/%` | full pager, 2 per page. Header shows `@total` results. |
| `wall_search_all` | `search-wall-all/%` | all-words match |
| `wall_thrive_all` | `wall-thrive/%` | 4 items |
| `page_1` | `search-wall/%` | duplicate path. Header embeds `wall_search`; footer embeds `search_thrive:thrive_search`. |

- The master display footer embeds the tips search.
- The search box calls `search/uy-tags/%` → `uy_search_results()`, which returns JSON `{result: views_embed_view('search_wall','wall_search',term)}` (`modules/uy_search/uy_search.module:12-35`).

**`search_thrive`** (Overridden). Tip search: type `thrive_tips`, exposed "allwords" filter on `field_html_content`, exposed tag filter.
- Displays:
  - `thrive_search`: path `search-thrive/%`, 2 per page, fields including tip type, video, template/user_field/operator/value, and the favourite flag;
  - `thrive_search_all`: path `search-thrive-all/%`, header embeds `search_wall:wall_thrive_all`.
- Result layout: combined results show "Wall" matches and "Thrive Tips" matches in two groups, each with a count and a "show all" page.

**`user_mentions_drupal_wall`** (Normal). @mentions of the current user.
- Base `mentions`, R: author (auid). A: the mentioned uid (current user).
- The row reads: "Tagged by **[author]** in **[link]** - [time] ago".
- Displays:
  - `block_1` "User Mentions": 5 items, footer link `/all/mentions` "See More Tags";
  - `page_1`: path `all/mentions`, a tab "Mentions", no pager.
- Access: authenticated.

**`Mentions`** (code default from the `mentions` module). Page `user/%/mentions` is a tab listing mentions of the user: title, "[created] ago", "by [author]", link.

**`twm_glossary1`** (Overridden; `twm_glossary`). Glossary, path `yt-glossary`, menu "Glossary" in `menu-twm-menu`.
- Base: taxonomy terms from vocab `glossary_terms`, showing name and description.
- A: `name` with the default "a" and glossary mode (first letter).
- An attachment above shows an **A–Z letter summary**, with AJAX paging between letters.

**`my_profile`** (code default; `twm_user_profile_sidebar_block`). Block "Public Profile Fields". Base profile2, A: the uid from `arg(1)` (a user page). It shows About me, Age, and Years living with HIV (up to 5).

**`hash_tags`** (Normal). Path `hash-tags`: the names of `hashtags` vocabulary terms used on nodes authored by the current user. Pager 10.

**`home_messages_view`** (code default). A block of the latest 10 wall post titles. Not placed.

**`taxonomy_term`** (core default). `taxonomy/term/%` term pages plus an RSS feed at `taxonomy/term/%/%/feed`.

### 2.2 Resources (community resource directory)

**`resources`** (Normal). Block "Resources", no pager.
- A: nid and `field_resource_tag` tid.
- F: title, address, city, state, zip, website, hours, eligibility, nid, resource tag, Contact, Scheduling, "Covid-19 Updates" (`field_status`), "Insurance Status" (`field_tests`).
- Loaded programmatically by `techstep_location.module:165, 215` to build the resource map and list.

**`comment`** (Normal). Block of comments on a `resources` node (A: nid): uid, body, name. Used by `techstep_location.module:235`.

**`resource_rating`** (Normal). Page `resource-rating` (see 1.4; data source for the ratings export).

**`resource_content_by_users`** (Normal). No display beyond the master. Resources authored by participants (see 1.5).

**`suggested_resources`** (Normal). Admin page `admin/suggested-resources`: **unpublished** resources submitted by participants.
- Table columns: VBO checkbox ("Publish"), Resource Name, Street, City, Phone, State, Zip, Edit. 15 per page.
- VBO actions: **Publish** (`node_publish_action`) and **Delete**.
- Access: coach, control, Coordinator. Shortcut: "Review Suggested Resources".

**`flagged_resources`** (Normal). Page `admin/flagged-resources`, a tab in `menu-flagged-messages`: resources flagged with `resource` (reported by a user).
- Columns: VBO, title, "Report by", Edit, Delete. 30 per page.
- VBO action: **Unpublish**. Access: Coordinator.

**`resources_list`** (Normal). Page `admin/resources-list` (Coordinator; shortcut "Resource List").
- Table columns: VBO (Delete), Title, Description, Address, State, City, Zip, Website, Contact, Created date, Edit. Eligibility, Hours, Scheduling, Covid and Insurance are hidden.
- Exposed "Title contains" filter (Apply/Reset). AJAX, 50 per page with a full pager.
- Header link "Export All Data Report" → `resource-list.csv`.

**`resources_flat`** (Normal). Page `admin/resources-flat`: a flat table of all resource fields plus an edit link.
- VBO **Modify field values** (bulk set `field_resource_tag`).
- CSV export `admin/downloads/resources.csv`.

**`resource_vbo`** (Normal). Page `resource-vbo`: resource titles with VBO **Delete** and **Delete revision**.

**`temp`** (Normal). Master only: resources with an exposed City filter (a scratch view).

### 2.3 Thrive Tips administration

**`tips_list`** (Normal). Page `admin/tips-list` (Coordinator; shortcut "Tips List").
- Columns: VBO Delete, Title, Tags, Created date, Edit.
- Exposed "Title contains" filter. 50 per page, AJAX.

**`thrive_tips_all_view_for_admin`** (code default). Page `thrive-tips-all-view-for-admin` (administrator): all tips with "Days (1)", "Days (2)" and edit, 500 rows, default sort Days (1). Staff use it to check the day schedule in both cycles.

**`thrive_export`** (Normal). Page `thrive-export`: a table of Title, IMB/AAQ category, pull-quote, HTML content, tags, 10 per page. Button "Export to Doc" (see 1.10).

**`temporary`** (Normal). Page `temporary`: tips with an exposed "Days relative to user created date" filter (a debug page).

### 2.4 Moderation (abuse flags)

**`all_flag_abuse_node`** (Normal). Page `admin/abuse-node`, tab "Wall Post Abuse" in `menu-flagged-messages`. Access: administrator and Coordinator.
- Table grouped by content type: "Report by", title, "Author", body, Actions (edit/delete), the flag link, and "Whitelist" (the `abuse_whitelist_node` flag link).
- Empty text: "No content has been reported."

**`all_flag_abuse_comment`** (Normal). Page `admin/abuse-comment`, tab "Comment Abuse". Shortcut "Review Flagged Comments".
- Columns: flag time, "Reported by", node title, commenter, comment body, "Delete", and the "Flag" link (`abuse_whitelist_comment`).
- 25 per page, default sort by time. Empty text: "No comments have been reported...".

**`cw`** (Normal). Master only: content-warning posts (titles starting with "!"). The data source for 1.3.

### 2.5 Study and user management

**`user_operations`** (Normal). Base users, distinct.

| Display | Path / menu | Access | Content | VBO actions |
|---|---|---|---|---|
| `page` "User Operations" | `admin/user-operations`, main-menu "Convert Control Users" (also a shortcut) | admin, Research Admin | Header "Control condition users". Active users with role **control**: VBO, User Name, role, status, "Updated" (created). 30 per page. Empty text: "There exists no users having 'Control' role." | **Convert Control User(s) to Participant(s)** (`twm_randomization_assignment_action`) |
| `attachment_1` "Recently Converted Participants" | shown after `page` | same | Header "Recently assigned intervention condition users". Active **participant** users. | `twm_randomization_deassignment_action` (revert) |
| `page_1` "Manage Participants" | `admin/manage-participants` (menu hidden) | admin, Coordinator, Research Admin | Participants **and ecoach-users**: VBO, User Name, StudyID, roles, Coach, "Active?", "Study Join Date", edit link. Exposed "StudyID" equals filter (button "Search"). Empty text: "There are no users with the "participant" role". | **Change Role** (`twm_randomization_add_role`), **Deactivate Participant(s)** (user cancel), **Assign Coach** (modify `field_coach`) |

**`coaches`** (Normal). An entity-reference display: active users with role coach, sorted by name. It is the option source for the user field `field_coach`.

**`engagement_report_for_study_management`**: see 1.10.

**`reaction_count`**, **`users_study_id`**, **`user_list`**, **`all_user_comments`**: see 1.10 and 1.4.

**`tech_support`** (code default; `twm_user_profile_sidebar_block`). Page `admin/tech-support`, main-menu "Tech Support". Access: admin, Coordinator, Research Admin. Lists `tech_support` nodes (reporter name and "Technical Problem Details"), 10 per page.

**`tutorials`** (Normal). Page `admin/tutorials`, main-menu "Tutorials". Access: admin, Coordinator, Research Admin. Lists `page` (basic page) node titles, 10 per page. The basic pages are the staff tutorials.

### 2.6 Infrastructure views (code defaults, keep only if the feature survives)

- **`feeds_log`**: Feeds import logs at `import/%/log`, `node/%/log` and `admin/reports/feeds`.
- **`record_shorten`**: shortened-URL log. It is embedded in the `shorten` module admin page `admin/reports/shorten` and shows Original, Shortened URL, Service and Created. Exposed Service filter, AJAX, 10 per page. It relates to shortened links in SMS.

### 2.7 Disabled views (no runtime effect)

The following are disabled:
- `all_flag_abuse_user`
- `archive`
- `backlinks`
- `comments_recent`
- `frontpage` (including `rss.xml`)
- `glossary` (node-based)
- `popular`
- `thrive_content` (page `thrive-tips/thrive-content`)
- `thrive_tips_view_block`: still placed in the `sidebar_second` block config, but renders nothing
- `top_content`
- `tracker`

### 2.8 Views block placements (theme `twm_bootstrapless`, status 1)

- `backup_today_thrive_tips-today_tips_cycle_2`: `sidebar_second`, pages `<front>` and `thrive-tips`.
- A stale hashed delta `998529e1…`: `sidebar_second` on `thrive-tips`. It is not in `views_block_hashes`, so it renders nothing.
- `thrive_tips_view_block-block`: disabled view.

All other Views output reaches pages via `views_embed_view()` from custom blocks and pages:
- `twm_tailored_tips` blocks `tailored_tips_profile`, `tailored_tips_wall`, `tailored_tips_all`, `tailored_tips_category`;
- the Thrive Tips page tabs;
- `uy_search`.

Block placement in general is documented in Part 3.

### 2.9 The Peer Navigation site (`peernav`) for comparison

The `peernav` DB has only 2 views in `views_view` (`temp`, `user_reference`). Its reporting is outside this document.

## Part 3 — LP theme, look & UX

Path shorthand used below: **`T/`** = `lp/sites/all/themes/twm_bootstrapless/` and **`M/`** = `lp/sites/all/modules/`. Line numbers refer to the files as they were at commit `597af5c`. Everything here comes from the theme source plus the live DB (`linkpositively`) and drush in the containers. Only config, schema, counts and site-authored titles are reproduced. No personal data is included.

---

### 3.1 Theme identity, base theme and which theme each user sees

| Item | Value | Source |
|---|---|---|
| Machine name / label | `twm_bootstrapless` / "TWM" | `T/twm_bootstrapless.info:1-4` |
| Base theme | `bootstrap` (Drupal Bootstrap 7.x-3.x, source in `lp/sites/all/themes/bootstrap`; `system.status=0`, which is normal for a base theme) | `.info:4`, `system` table |
| CSS framework | Bootstrap **3** LESS, compiled locally. The CDN is disabled (`settings[bootstrap_cdn] = ''`) | `.info:69-70`, `T/less/bootstrap.less` |
| Default theme | `theme_default = twm_bootstrapless` | `variable` |
| Admin theme | `admin_theme = seven`, `node_admin_theme = 1` (node add/edit forms also use Seven for users who have "view the administration theme") | `variable` |
| Front page | `site_frontpage = drupal-wall` | `variable` |
| 403 and 404 page | `site_403 = site_404 = node/209` ("This is a research study", type `public_page`, empty body). This node is the **login screen** for anonymous users (see 3.4) | `variable`, `node` |
| Site name | `Link Positively`, no slogan | `variable` |
| Enabled themes (`system` type=theme, status=1) | `twm_bootstrapless`, `twm_bootstrapless_old` ("TWM Old Theme", also based on bootstrap), `seven`, `bartik` | `system` |
| Disabled themes | `bootstrap`, `garland`, `stark` | `system` |

**role_theme_switcher** (`M/role_theme_switcher/`, v7.x-1.1):
- `role_theme_switcher_custom_theme()` (`role_theme_switcher.module:4-22`) loops over the current user's roles. For each role it reads `role_theme_switcher_<rid>_theme`. The **last** role whose value is not `'Default'` wins, and the module returns it as the page theme through `hook_custom_theme`.
- The admin form is at `admin/people/rolethemeswitcher` (`.module:27-38`, form `:44-77`). It offers one select per role, listing every enabled theme plus "Default".
- `role_theme_switcher.install:3-6` only rebuilds menus.
- Live config (DB `variable`):

| rid | Role | Theme |
|---|---|---|
| 1 | anonymous user | twm_bootstrapless |
| 2 | authenticated user | twm_bootstrapless |
| 3 | administrator | **twm_bootstrapless_old** |
| 4 | Research Administrator User | **twm_bootstrapless_old** |
| 5 | Coordinator User | **twm_bootstrapless_old** |
| 6 | control | twm_bootstrapless |
| 7 | participant | twm_bootstrapless |
| 8–20 (some rids no longer exist: 8, 10–13, 16) | coach, ecoach-user, level-* etc. | Default |

- Net effect: participants and control users see **TWM**. Staff roles (admin, research admin, coordinator) see **TWM Old Theme**. Because the last matching role wins, a staff user who also holds `participant` (rid 7) or `control` (rid 6) would get TWM. On admin paths, Seven normally still takes over through `system_custom_theme()`, since `menu_get_custom_theme()` keeps the last valid theme that hooks return.
- **Rewrite implication:** there are really two front-ends. One is the participant app, which this section documents. The other is a staff/back-office UI whose old theme is not documented here. A Next.js rewrite can use one design system with role-gated layouts.

**User-selectable colour schemes.** `M/twm_utility/twm_utility.module:222-232` (`twm_utility_preprocess_html`) adds a body class `theme-1`…`theme-4`. It comes from the user field `field_theme`, but **only for users with role `level-6`**. Everyone else always gets `theme-1`. Users switch schemes on the profile page (`M/youthrive_profile/youthrive_profile.module:1255-1265`, `updated_theme()`; swatch images are in `T/images/themes/theme1-4.png`). DB: 60 users store a `field_theme` value, and all 60 are `theme-1`. So in practice **only theme-1 is used** (palette in 3.7).

---

### 3.2 `.info` file: regions, stylesheets, scripts, settings

`T/twm_bootstrapless.info`

**Regions** (`:11-28`):

| Key | Label | Used in page templates? |
|---|---|---|
| `navigation` | Navigation | Only in `page--node--add--tech-support` / `page--node--edit` |
| `header` | Top Bar | Yes. It holds the hamburger menu block |
| `highlighted` | Highlighted | Rendered if non-empty (jumbotron); no blocks placed |
| `help` | Help | Yes (system help block) |
| `content` | Content | Yes |
| `slidecontent` | Slidecontent | Front page only: slide 1 of a Swiper |
| `slidercontent` | Slidercontent | Front page only: slide 2 of the Swiper |
| `notications` (sic) | notifications | Not rendered by any template |
| `slidecheckin` | Slidecheckin | Not rendered |
| `Details` | Details | Not rendered |
| `sidebar_first` | Primary | Yes (col-sm-4 aside); no blocks placed |
| `sidebar_second` | Secondary | Yes (col-sm-4 aside) |
| `footer` | Footer | Rendered in the header collapse and in a fixed bottom bar; **no blocks placed**, so it is empty |
| `page_top`, `page_bottom` | Page top/bottom | html.tpl |
| `thrive_tip`, `thrive_tipmenu`, `thrive_tipcontent` | thriveregion/thrivemenu/thrivecontent | Not rendered |

**Stylesheets** (`:34-37`), loaded in this order: `css/bootstrap.css` (stock BS 3.3.x, 144 KB), `css/style.css` (the whole compiled theme, 717 KB / 33,255 lines), `css/theme.css` (compiled `less/theme.less` colour-scheme loop, 80 KB), `css/swiper.css`. `css/svg-styles*.css` are not loaded.

**Scripts** (`:45-64`): `js/bootstrap.js` (the Drupal Bootstrap base theme's behaviours, not the Twitter bundle); Twitter Bootstrap plugins from `bootstrap/js/*.js` (affix, alert, button, carousel, collapse, dropdown, modal, tooltip, popover, scrollspy, tab, transition ×2, bootstrapoffcanvas); `js/swiper.js` (**Swiper 3.4.2**); `js/svg.js`; `js/jquery.touchSwipe.min.js`; `js/resize.js`; `js/customfunction.js`.
In addition, `html.tpl.php:97-98` hard-loads **jQuery 1.11.3** from ajax.googleapis.com and **GSAP TweenMax 1.20.3** from cdnjs.

**Theme settings in the DB** (`variable.theme_twm_bootstrapless_settings`):
- `toggle_logo=1`, `toggle_name=0`, `toggle_slogan=0`, `toggle_main_menu=1`, `toggle_secondary_menu=1`.
- `default_logo=0`, `logo_path=public://youthrive-logo_1.png` (a "TECHSTEP" dotted-letter wordmark left over from the earlier TechStep/YouThrive project; the file exists in `sites/default/files`).
- `default_favicon=0`, `favicon_path=public://favicon.ico`.
- `bootstrap_fluid_container=0` (fixed `.container`), `bootstrap_navbar_position=''`, `bootstrap_navbar_inverse=0`, `bootstrap_region_well-sidebar_first=well`, breadcrumbs off, tooltips/popovers off.
- In practice the configured logo is **ignored**. The templates only test `if ($logo)` and then hard-code `images/lp-login-logo.svg` (see 3.4).

---

### 3.3 `template.php`, `*.vars.php`, `*.func.php`: every PHP function

| Function | File:line | What it does |
|---|---|---|
| `twm_bootstrapless_theme()` | `T/template.php:2-19` | Registers three form templates: `user_login_block` → `templates/user-login-block` (the registry scan actually resolves `templates/block/user-login-block.tpl.php`), `user_pass` → `templates/user-pass`, `user_pass_reset` → `templates/user-pass-reset`. Each has render element `form` |
| `twm_bootstrapless_preprocess_user_login_block()` | `template.php:20-27` | Removes the default "Create account / Request password" links. Pre-renders `$name`, `$pass`, `$submit` and `$rendered` (hidden fields) for the custom login template |
| `twm_bootstrapless_preprocess_user_pass()` | `:28-31` | Pre-renders `$name` and `$submit` for the forgot-password template |
| `twm_bootstrapless_preprocess_user_pass_reset()` | `:32-38` | Pre-renders `$submit`, `$markup` (message) and `$help` for the one-time-login template |
| `twm_bootstrapless_form_alter()` | `:41-65` | On `user_login_block`, sets the submit value to an SVG "next" icon (`<div class="svg-icon-next">`). On `user_pass`, retitles the field "Username or Email" and makes the submit "Submit" + arrow icon with `btn btn-primary`. On `user_pass_reset`, does the same "Submit" + arrow |
| `twm_bootstrapless_preprocess_page()` | `T/templates/page.vars.php:16-82` (auto-loaded by the Bootstrap base theme) | (1) A logged-in user visiting `node/209` (the login/403 page) is `drupal_goto('<front>')`. (2) Sets `content_column_class`: `col-sm-4` if both sidebars have content, `col-sm-8` if one does, `col-sm-12` if neither. (3) `container_class` = `container` (fluid off). (4) Builds `primary_nav` from `main-menu` and `secondary_nav` from `user-menu` (only the tech-support/edit page templates print them). (5) Builds navbar classes (`navbar navbar-default container`). (6) Adds theme-hook suggestion `page__anonymous` for anonymous users; no such template exists, so it falls through |
| `twm_bootstrapless_process_page()` | `page.vars.php:93-95` | Flattens `navbar_classes_array` → `$navbar_classes` |
| `twm_bootstrapless_menu_tree()` | `T/templates/menu/menu-tree.func.php:24-30` | **Overrides every menu tree.** Wraps it in `<div class="container"><div class="collapse navbar-collapse" id="main-menu">`, **injects the `uy_search_box` search form** (from module `uy_search`) above the `<ul class="menu nav navbar-nav">`, and appends an empty `<li>`. So the header menu block becomes the hamburger drop-down with search on top |
| `twm_bootstrapless_menu_tree__primary()` / `__secondary()` | `:35-44` | Plain `<ul class="menu nav navbar-nav [secondary]">` wrappers |
| `stem_bootstrapless_menu_tree__book_toc*()` | `:50-68` | Dead code: the prefix belongs to a different theme, so these never fire |
| `twm_bootstrapless_theme()` (second copy) and `twm_bootstrapless_preprocess_page()` | `T/templates/template.php:2-19` | **Dead file.** Drupal never loads `templates/template.php`, and loading it would be a fatal redeclare. It tried to register `user-profile-form` and force `page--node--add--tech-support` for `tech_support` nodes |
| `twm_bootstrapless_js_alter()` (defined in a module) | `M/twm_utility/twm_utility.module:272-276` | Removes `T/js/calendar.js` for anonymous users. It runs as a theme alter hook because of its name |

Other variables that page templates use come from modules:
- `$bell_color` / `$bell_count` / `$noti` / `$wall_count` come from `twm_comment_notification_preprocess_page()` (`M/twm_comment_notification/twm_comment_notification.module:676-742`). `bell_color='active'` when there are notifications newer than the last visit. `noti` holds the unread in-app messages. `wall_count` is the number of new wall posts since the user's `field_wall_visit`, which is updated on each visit to `/drupal-wall`.

---

### 3.4 Page-level templates (layout shells)

#### `html.tpl.php`: document shell (`T/templates/html.tpl.php`, 754 lines)
- `:56-58`: if `?sms=<id>` is in the URL, calls `message_links_click_count()`. This tracks clicks on SMS links, and the rewrite must keep it.
- `:64-86`: meta viewport `width=device-width, initial-scale=1.0` (rewritten at runtime by `resize.js`, see 3.6). Full favicon set (apple-icon 57→180, android-icon-192, favicon 16/32/96, ms-icon-144), `theme-color #ffffff`, `application-name`/`apple-mobile-web-app-title` = **"LinkPositively"**, so the site is set up to be saved to the home screen like an app.
- `:89-91`: the `<title>` is literally prefixed `6-` (a debug leftover): `6- <head_title>`.
- `:97-98`: jQuery 1.11.3 and TweenMax come from CDNs.
- `:102-114`: `<body class="loading">` plus a **full-screen loading overlay**: `.backscreen` (fixed, 100vh, `rgb(0 0 0 / 50%)`) containing a `.lds-roller` 8-dot spinner. It is hidden at the end of `customfunction.js` doc-ready (`:888-889`) and re-shown on login and tag-filter clicks.
- `:115-118`: skip link. `:119-121`: `$page_top $page $page_bottom`.
- `:122-749`: **an inline SVG sprite** (`width=0 height=0`). Each `<g id="…">` is a symbol that `js/svg.js` clones into any element whose class is `svg-<id>` (see 3.6). Symbols defined:
  - Icons: `hot-topic` (flame in a circle), `tip-fav` (heart, #94748E), `plus`, `icon-next`, `Development` (padlock with "unlock with points" text, used for locked avatars/badges), `login-logo` (a 660×77 wordmark), `post-icon-image`, `post-icon-video`, `contentwarning` ("CW" box), `trackerview`, `icon-edit`, `icon-Comment`, `check-icon` (#50E3C2), `icon-quote` (#C9B9C6), `close-step`, `close-step-sm`, `next-step`, `next-step-sm`, `next-step-thin`, `post-icon-flag`, `post-icon-comment`, `post-icon-alert` (bell), reaction icons `like-icon-thought|target|super|smiley|heart|fire`, `heart`, `search-magnifing-glass`, `btn-icon-plus|minus|edit|check`, `arrow-swipe`, `map` (location pin), `arrow-header`, `notification-bell` (with inner-shadow filter), `Hamburger-icon` (4 bars), `selectdown` (chevron), `plus-check-in-header`.
  - **Slanted background polygons** that give the UI its skewed "ribbon" look: `login-background`, `background-wall-posts`, `background-wall-post`, `background-wall-post-expanded`, `background-wall-divider-1/-2`, `background-top-nav`, `background-top-nav-tips`, `arrow-top-nav`, `background-tips-header`, `background-tips-divider-header-1/-2`, `background-profile`, `background-profile-expanded(-overlay)`, `background-journey-header`, `background-check-in-yesterday|unexpanded|today|month`, `slider`, and a pink vertical gradient (`#F5AAB9` → transparent, 750×586).
- `T/templates/html.tpl1.php` is an unused older copy.

#### `page.tpl.php`: default page for logged-in users (`T/templates/page.tpl.php`)
- `:77-78,190-192`: on path `edit-profile-form-page` **the header and footer are hidden** (full-screen profile-edit flow).
- **Header** (`:79-116`): `<header id="navbar" class="navbar navbar-default container affix">`, a fixed top bar with a purple background (#682F7C in theme-1).
  - Left: `a.navbar-brand` → front page, containing `<img width=80 src="images/lp-login-logo.svg">` + text **"LinkPositively"** (white, SourceSansPro Black 27px) (`:81-90`).
  - Right (`.navbar-header.pull-right`): a **notification bell** link to `/all-comments` with class `$bell_color`. When `active` the bell turns green (#42C990, `css/style.css:32664-32670`), otherwise white. Then two hamburger buttons toggling `#main-menu`: a hidden "close" X (`svg-close-step`) and a visible `svg-Hamburger-icon` (`:91-100`).
  - Below the bar: `render($page['header'])`, which is the Participant menu block wrapped by the menu-tree override into the collapsible `#main-menu` (with the search box) (`:102-103`). For non-admins a second collapse `#myNavbar` holds the search form again plus the footer region (`:104-114`); it has no toggle button targeting it.
- **Main** (`:123-189`): `.main-container.container > .row`. Optional `aside.col-sm-4` (sidebar_first), then `<section class="{content_column_class}">` with highlighted, breadcrumb, `#main-content` anchor, **the page title is commented out** (`:138-144`: pages carry their own titles), messages, tabs, help, action links.
  - `:156-168`: a **search results overlay** `.uy_search_all`, with a hidden header ("Search Results" in white + a "close" pill with a plus icon), `#uy_post_search` and `#uy_search`. AJAX fills it (3.6).
  - `:169-178`: on `/all-comments`, a lavender title block **"Your Notifications | N New"** (`bell_count`).
  - Content region, then `aside.col-sm-4` sidebar_second.
- **Footer** (`:193-208`): `<footer class="footer"><div class="navbar-fixed-bottom">…footer region…`, a fixed bottom bar that auto-hides on scroll (3.6). The region is currently empty (no blocks), so nothing renders.

#### `page--front.tpl.php`: home = "Your Wall" (`/drupal-wall`, front page)
- `:76-113`: the same header, but **not shown to admins** (`!$is_admin`). It has no `#myNavbar`, and its bell link has no id.
- `:128-204`: an **in-app message stack** at the top, from `$variables['noti']`. For each unread item: a `.notification-block` with the LP logo (50px) on the left, a **"Delete"** pill (`btn-primary delete-icon`) on the right, a heading **"In App Message"**, the message HTML, and, except for `timeonsite-*`, `welcome-*` and `level-*` messages, a **"Read More"** pill (`arrow-icon`). Inline JS (`:179-198`) binds `readNotif([...])` and `deleteNotif([...])` (defined in a module) with a payload of uid, post id, comment id, category, action, author, a **midpoint survey URL** (`variable midpoint_url` = a Qualtrics form, plus `?ID=<study_id>`) and post type.
- `:239-248`: on `/drupal-wall`, the title block **"Your Wall | N New"**.
- `:250`: content region.
- `:251-260`: **`.swiper-container.main1.swiper-no-swiping`** with two slides: slide 1 = `slidecontent` region (wall blocks), slide 2 = `slidercontent` region (home profile/achievements). `swiper-no-swiping` disables touch swiping, so slide changes happen only in code.
- `:263-267`: sidebar_second. `:272-283`: fixed footer with `.footer-bot`.
- `page--front.tpl.php-30-09` is a September backup that differs in logo size and notification styling. It is unused.

#### `page--node--209.tpl.php`: **login / access-denied screen**
- Anonymous users hit 403 on every page, and `site_403 = node/209`, so this is the login screen. Logged-in users who land on node/209 are redirected home (`page.vars.php:20-22`).
- Layout (`:77-120`): no header. A full-height `.panel.login-panel` (flex column, centred, 100vh, background image `images/lp-login-bg.png`, a grey silhouette illustration positioned right: `less/style.less:3404-3420`). It contains `.login-top` (40% height spacer), then the sidebar_first/help regions, then `.userlogin` with a **large logo** (`lp-login-logo.svg` at 250px) and the content region (which includes the user login block placed in `content`), then `.login-bottom`.
- `node--209.tpl.php` prints nothing (`:82-85`), so the node body is suppressed. The research-study text is printed by the password templates instead (see below).

#### `page--node--add--tech-support.tpl.php` and `page--node--edit.tpl.php`
- These are near-identical stock Bootstrap layouts: `header#navbar` with `$logo` image + `$site_name`, a classic 3-bar toggle, `navigation` region + `secondary_nav` (user menu) in `.navbar-collapse`; main content in a `.panel`; classic footer (`page--node--add--tech-support.tpl.php:76-190`).
- They apply to `node/add/tech-support` (the Tech Support form, linked from the About menu) and to every `node/*/edit` page.

#### `page--ajax.tpl.php`
- `:10-16`: a bare page (messages, tabs, action links, content) with no chrome, for AJAX-loaded fragments.

---

### 3.5 Content, block, form and views templates

#### Nodes
| Template | What it renders |
|---|---|
| `node.tpl.php` (`:83-113`) | Generic node in a `.panel.content_page`. In teaser mode an `<h3>` title link, then submitted info, then content, then links, then comments. (There is a bug: `.submitted` `<div>` is opened but never closed, `:94-96`.) |
| `node--public-page.tpl.php` (`:83-101`) | **Static info pages** (About, FAQ, Help, Guidelines…): `.panel.content_page.info-page`, `<h4 class="trackertitle">` title (magenta), body, links. No comments |
| `node--thrive-tips.tpl.php` (`:84-286`) | A single **Thrive Tip** (e.g. `/comment-tip/<nid>`). Re-includes `customfunction.js`. `.panel.dailytips`, then a flex row: left column (col-2, right-bordered) holds the node links (favourite heart flag); right column holds an `<h4>` title link, content (with tags and category hidden), a comment icon (`svg-icon-Comment`), and tag pills `.user-hash-tags.label.label-primary` for each `field_thrive_tags` term. Below: every comment (`comment_get_thread`, max 100) as a row with the date (`n.d.y` + `g:i A`) and avatar (`twm_utility_profilepic`) on the left, and name link → `/user/view-profile/<uid>` plus body (`limited_html_for_wall_posting` filter) on the right. Each comment has a **reaction bar** (haha, love, thumbs-up, fire, target, plus super; flags 14/16/36/22/26/24) and an abuse-flag link. At the bottom, `#user_comment_<nid>` (AJAX append target) and the `tips_comment_post_form` |
| `node--drupal-wall.tpl.php` (`:81-413`) | A single **wall post** page: author avatar and name, then the body. Body handling: links to `/search/uy-tags/` (hashtags) and `/user/view-profile/` (mentions) are kept; bare image URLs in the body are turned into `<img>`. Then an optional uploaded photo (`field_drupal_wall_photos`) and an optional YouTube iframe (`field_drupal_wall_videos`, converted to youtube-nocookie for playlist URLs). The post background class comes from `field_post_bg`. Then the **node reaction bar** (5 reactions) and the abuse flag, then all comments with their own reactions |
| `node--209.tpl.php` | Empty (see 3.4) |

#### Wall feed (module `drupal_wall` theme hooks overridden)
- **`drupal_wall_posts.tpl.php`** (`:1-705`) is the **main feed item template** used on the home page and `/drupal-wall`.
  - `:21-22`: adds `drupal_wall.js` and prints `select_wall_thrive_tips_block_display()` (a tips strip at the top of the wall).
  - `:28`: the container id gets a `_global` suffix on `/drupal-wall`.
  - For each item:
    - **Item type `thrive_tips`** (`:31-71`): a card with a favourite-heart flag on the left, and on the right an `<h6>` title, the tip HTML, and tag pills.
    - **Item type `drupal_wall`** (`:72-697`):
      - If the post title is `tip-notification` (an auto-post announcing that someone commented on a tip), it first shows a banner: date, "**<name>!** commented on a thrive tip.", the tip title, and a link "**See Full Thrive Tip >>**" → `/comment-tip/<nid>` (`:90-114`).
      - Left column: a round **avatar** (`.profile-image-container`). A hidden edit/delete block sits there too (`:133-153`).
      - Right column (`.post-container`):
        - If the viewer may edit it, an **edit icon** → `/post/<nid>/edit?destination=…`. If the viewer may delete it, a **delete form**. Otherwise an **"Inappropriate"** pill wrapping the `abuse_node` flag link (`:200-243`).
        - Then `.wall-name-date`: name → `/user/view-profile/<uid>` and date `m/d/y`.
        - Then the body with the same link/image processing as above. **Special markup:** a body starting with `!Headline!` renders `<div class='new'>Headline</div>`, collapses the rest, and adds a "**Read more ➜**" toggle (`:321-330`). Photos and video are collapsed with it (`:339-398`).
      - Reaction bar: `post-reactions.tpl.php` for normal posts, `tip-reactions.tpl.php` for tip notifications (`:408-414`).
      - Two pill buttons: **"Add A Comment"** (`comment-icon`, calls `commentAdd(nid)`, toggling to "Cancel Comment"), and **"Show Comments" / "Hide Comments" / "No Comments Yet"** (`down-arrow-icon`; green with an inset shadow when open, magenta when closed) (`:425-434`).
      - Comments container, hidden by default (`:451-661`). Each comment has a round avatar, an edit icon (→ `/commentedit/<cid>/<uid>`) and delete form for its owner, name and date, and a body in which image URLs become thumbnails. Uploaded comment images use the `medium` image style. Comment videos get a 150×100 iframe. Each comment has a reaction bar and an abuse-comment flag.
      - An AJAX append target `#div_append_next_user_comment_<nid>`, and the comment form `_drupal_wall_comment_post_form` in `.comment-input-row` (hidden until "Add A Comment") (`:675-686`).
- **`post-reactions.tpl.php`** (`:1-86`): the node reaction bar, `div.likes.{wall-reaction-enable|disable}`. It is disabled on your own posts. It shows 5 `.emoji_icons` cells, each a flag link plus a count: **haha (flag 15), love (17), thumbs-up (37), fire (23), target (27)**. Thought (29) and super (25) are commented out. Cells get class `opacity-true` when the current user has used that reaction. A hidden duplicate comment/abuse block follows.
- **`tip-reactions.tpl.php`**: the same bar using the **comment** reaction flags 14/16/36/22/26, for tip-comment notifications.
- **`drupal_wall_comment.tpl.php`**: the markup returned when a comment is posted by AJAX. Avatar, a **"Delete"** pill, date, name, body with image-URL handling, video iframe, uploaded image, legacy "up_voting_comments" like and abuse link.
- **`search-post-reactions.tpl.php`**: the reaction bar used in wall search results. The code is duplicated twice (`:1-175`).

#### Tips views (module `twm_tailored_tips` / views)
- `views/views-view--today-thrive-tips.tpl.php` (`:31-236`) is **"Your Tips"**. Unless on `comment-tip` or `tags`, it shows a lavender `.titles-block` with the title **"Your Tips | N New Tips"** (N from `thrive_tips_count(user_days_since_created())`) and a segmented two-button toggle **"Explore Tips"** (`/thrive-tips/tags`) | **"Favorite Tips"** (`/thrive-tips/favs`). The active half is green. Rows go in `.view-content.dailytips`, which is initialised as a Swiper (3.6). Older dropdown-select and prev/next arrow versions remain as comments.
- `views/views-view--thrive-tips-all.tpl.php` (`:29-173`): the same header, plus a block **"Explore Tips / Select the type of tips you want to see"** with the rows rendered as **tag filter buttons** (`.tip-taggs.filter-tipbuttons`).
- `views/views-view--today-thrive-tips--tags.tpl.php`, `…today-wall-tips-cycle-1/-2.tpl.php`: plain panel wrappers around `.dailytips` rows. When empty they show the empty text in an `<h5>`.
- Row templates: `views-view-fields--today-thrive-tips.tpl.php` (root and `views/` copies), `views/views-view-fields--thrive-tips-all.tpl.php`, `views/views-view-fields--search-thrive.tpl.php`. A **tip card** is a wrapper with `data-tip` (highlight flag value) and `data-nid`, plus a template class from `field_template`. Left column: the flag ops (favourite). Right column (`.tips-bg`): `<h6>` title, `field_html_content`, optional `field_video_link`, and tag pills. The root version also renders all comments and the comment form, like the node template (`views-view-fields--today-thrive-tips.tpl.php:26-225`).
- `views-view-unformatted--today-thrive-tips.tpl.php` (`:13-19`) wraps each row in `.swiper-slide` (first one `active`).
- `views/views-view-fields--attachment.tpl.php`: a tip link row → `/thrive-tips/thrive-content/<nid>/<tid>` with a type icon span, bold title, ops and a hot-topic flame divider.
- `views/views-view-fields--thrive-block.tpl.php` + `views/views-view-list--thrive-block.tpl.php`: a sidebar list headed **"Related Thrive Tips"**.
- `views/views-view--thrive-content--page.tpl.php`, `views-view--thrive-tips-all--thrive-block.tpl.php`, `views-view--my-profile--block.tpl.php`, `views-view--twm-glossary.tpl.php` (glossary as `.panel.content_page.info-page`; the `twm_glossary` view no longer exists in the DB, only `twm_glossary1`), `views-view.tpl.php` (default: every view wrapped in `.panel > .panel-body`), `views-view-table.tpl.php` (Bootstrap responsive table), `views-view-general.tpl.php`, `views-view-fields--block-4.tpl.php`.
- `field--field_thrive_tags.tpl.php` (`:54-66`): tag field as inline `.label.label-primary` links → `/thrive-tips/tags/<term>`.

#### Search
- `search-block-form.tpl.php` (`:33-50`): the search box on a slanted `background-tips-header` SVG with a swipe-arrow icon.
- `views/views-view--search-wall.tpl.php` / `--page-1.tpl.php` / `views-view--search-thrive.tpl.php`: result headers **"Posts | Page X of Y"** and **"Tips | Page X of Y"** in a lavender title block, with a pager on a slanted divider. `page_1` hides the rows (they are loaded through AJAX).
- `views/views-view-fields--search-wall.tpl.php` (`:28-208`): a wall search hit rendered like a feed card (avatar, name/date, search excerpt, reactions, Add/Show comment buttons). If only a comment matched, the commenter is shown.
- `views-view-unformatted--search-wall.tpl.php` / `--search-thrive.tpl.php`: list wrappers (`.searchresults_list`).
- Core search: `search-results.tpl.php` (`<ol>` + a "See All" footer, or "Your search yielded no results") and `search-result.tpl.php` (`<h5>` title, snippet, "Read More").

#### Blocks
- `block/block.tpl.php` (`:48-71`): generic `<section>` + `<h5>` title. It **renames block ids**: module `youthrive_my_checkin` → `#my_checkin`, `twm_tailored_tips` → `#thrive_tips`, `my_journey` → `#uy_journey`, `youthrive_profile` → `#uy_profile`.
- `block--menu--menu-about`, `block--menu--menu-user-settings-menu`, `block--user--login`, `block--views--my-profile-block` (`:48-58` each): the same, wrapped in `.panel > .panel-body`.
- `block--menu--menu-menu-thrive-tips`: `.thrive-tips-all-nav.panel` with an `<h2>` title.
- `twm-achievements-leaderboard-block-content.tpl.php` (root = `block/` copy, identical) (`:49-71`): a **micro-leaderboard**. Each row (clickable → profile) has 3 columns: "**N / Points This Week**", avatar + name, "**N / Total Points**". Then a "**View Leaderboard**" button → `/this_week`.
- `twm-weekly-checkin-block-content.tpl.php` (root = `block/` copy): an `<h5>` "Weekly Check-In" with a single link → `/weekly-checkin`.

#### Login and password forms
- `block/user-login-block.tpl.php` (`:37-61`, the active one): username field, password field, a hidden "**Forget Password ➜**" button (`.forget-btn` → `/user/password`, **shown only after a failed login**, `customfunction.js:210-214`), and a "**Login ➜**" `btn btn-primary custom-loader` that shows the spinner overlay on click. It prints the hidden form fields last. `block/user-login-block1.tpl.php` is an older variant with a "Forgot" link and is unused.
- `user-pass.tpl.php` (`:77-142`) and `user-pas.tpl.php` (a duplicate, unused): the **forgot-password page** in the same login-panel layout, with the big logo, the "Username or Email" field, a "Submit ➜" button, and **node 209's body printed below as small print** (`:120-130`).
- `user-pass-reset.tpl.php` (`:77-121`): the one-time-login page (message, help, submit). There is a markup bug at `:107` (`<p … <?php print $test ?>` has no closing `>`).
- `user-profile-edit.tpl.php` ("Your details:" email/name, "Reset your password:" current/new/confirm) and `user-profile-form.tpl.php` (contains invalid PHP) are **not registered** by any hook and are dead.

#### Achievements (module `achievements`)
- `achievement.tpl.php` (`:21-36`): a `.panel.well` row with a badge image (col-2), title and description.
- `achievement-notification.tpl.php` (`:21-30`): the popup **"Achievement Unlocked"**. It forces the image and title links to `/this_week`.
- `achievement-latest-unlock.tpl.php`: image, title, points.
- `single-achievement.tpl.php` (`:14-32`): a profile badge bin row (image + category | bold title + description), clickable when a `$path` exists.

#### Profile
- `profile2.tpl.php`: stock Profile2 entity wrapper. The profile pages themselves (`/my-profile`, `/user/view-profile/%`, `uy_home_profile`, levels, avatar/sticker pickers) are **module templates** in `M/youthrive_profile/theme/` and `M/twm_achievement_bins/`. The theme only styles them (3.7).

---

### 3.6 Custom JavaScript behaviours (`T/js/`)

Vendor files in the theme, not documented further: `bootstrap.js` (Drupal Bootstrap base theme), `swiper.js` (Swiper 3.4.2), `jquery.touchSwipe(.min).js`, `bootstrap-slider.js`, `bootstrapoffcanvas.js`, `fullcalendar.min.js`, `moment.min.js`, `jquery-observe.js`, `svg-min.js` and `customfunction-min.js` (minified copies). **`calendar.js`, `fullcalendar.min.js` and `moment.min.js` in the theme are unused copies.** The live ones are attached from `M/techstep_tracking/js/` (`techstep_tracking.module:674-676, 1237-1239`).

**`js/svg.js`** (`:5-19`): an **icon system**. On ready, and again on every DOM mutation (MutationObserver), it finds every element whose class starts with `svg-<id>`. It clones the sprite `<g id="<id>">` from html.tpl into that element, sizes the element to the sprite's width and height, and renames the class to `svgd-<id>` so each element is processed once. All icons in the UI (bell, hamburger, arrows, plus, edit, comment…) are drawn this way. **Rewrite:** replace with an SVG icon component set.

**`js/resize.js`** (`:1-21`): on load and every resize, it removes and recreates the viewport meta. At **≥768px** it uses `width=device-width, initial-scale=1`. At **≤767px** it uses **`width=750, user-scalable=no`**. So on phones the whole site is a fixed **750px-wide canvas scaled down** (designed at iPhone @2x). This is why font sizes look huge (base 21px, buttons 22px, titles 25–34px).

**`js/customfunction.js`** (1,070 lines) is the main behaviour file:
- `:3-17`, `:101-127`: on `/thrive-tips/tags/<a+b+c>`, it marks the matching `.tag-item` links active. Clicking a `.user-hash-tags` pill goes to `/thrive-tips/tags/<id>`. Clicking `.tip-tags` toggles it, shows the spinner, and navigates to `/thrive-tips/tags/<all active ids joined by +>` (multi-tag filter in the URL).
- `:21-24`: `.custom-loader` click shows the spinner overlay.
- `:26-52`: prevents double submits. The wall "post" button (`#edit-drupal-wall-status-post`) is disabled at 50% opacity. The check-in "meds today" radios (`#edit-meds-today-1/2`) are disabled for 1.5 s.
- `:53-63`: a hack that adds an invisible button over `#show-list` which re-clicks it after 1.5 s.
- `:67-79,176-191`: reminders settings. `.get-notify` is shown and hidden by `#edit-reminders` / `#edit-how-often`. Moving the `reminders` range updates the text "You will receive notifications on your Phone./app.".
- `:84-92`: after a reaction click, all reaction buttons are locked for 1 s (debounce).
- `:93-96`: marks the selected avatar radio as `.avatar-hover-selected`.
- `:193-197`: `addSVGLine()` on every DOM mutation. For elements with class `svg-line*` it draws a **random slanted polygon divider** (750 wide, 0–20px skew) and renames the class to `svgd-line` (`:1025-1057`). `morphSVG()` (`:1059-1065`) tweens polygon points with TweenMax.
- `:210-214`: on a login error, it adds `.customloginui`, hides the error alert and **reveals the "Forget Password" button**.
- `:215-259`: **Swipers.**
  - Generic `.swiper-container` (with next/prev buttons).
  - **`.dailytips`**: tips carousel with autoHeight and 20px gap. On init and every slide change it updates the `.currentslide` / `.total` counters, hides "prev" on the first slide and "next" on the last, and **`assign_points()` POSTs `/tip-points/<nid>/<highlightFlag>`** (`:346-359`), so users earn points for viewing a tip. `#next-tip` / `#prev` also drive it.
- `:270-334`: **profile edit mode toggles**.
  - `#edit` / `#profileedit` hide the "view" profile blocks (about, social media, traveller, book-worm) and show `.changepwd`, `.changepic`, `.change-avatar` and the `.wall-form` edit form. The heading text becomes "Edit Your Profile".
  - `#cancel` reverts.
  - `.upload-profile-image` switches to "Upload Your Avatar" mode (`:673-693`).
- `:288-296`: resource comment toggles (`.resourcecommentbutton`).
- `:337-344`: the "Read more ➜" `.enable-disable` expands collapsed headline posts.
- `:371-386`: `.commentenable` click reveals and focuses that post's comment textarea and scrolls to it.
- `:391-489`: **global search.**
  - Clicking `.uysearch_block` (the search button in the hamburger) or pressing Enter in `#search_term` closes the menu, shows the `.uy_search_all` overlay, and POSTs `/views/ajax` with `view_name=search_wall`, `view_display_id=page_1` and the term applied to body, comment body, tip HTML and tag tid. The HTML response is injected into `#uy_search`, Drupal behaviours are re-attached, and wall and tip counts are summed into ".result-text: N Results". An empty term shows "Please enter search term".
  - `#search_close` hides the overlay.
  - `.hashtag` click → POST `/load-node/<nid>` to expand a result inline, then re-attaches the Flag JS.
- `:490-500`: manual tab switching for `.nav-tabs`.
- `:504-533`: hamburger menu. The last item of `#block-menu-menu-twm-menu` toggles its sub-menu (slideToggle) and resizes `.footer-bot`.
- `:535-549`: a `nodoubletapzoom` jQuery plugin.
- `:551-571`: on `/` and `/drupal-wall`, scrolling triggers `resize` (which drives the drupal_wall module's **infinite "load older posts"**) and equalises post-card heights.
- `:573-594`: polls every second. When new `.likes` bars appear (after AJAX), it sets `.selected` / `.notSelected` on each bar depending on whether any reaction is `opacity-true`.
- `:597-623`: on touch devices it adds `html.touch`. Focusing the search field sets `body.fixfixed` (keeps fixed bars in place with the keyboard open).
- `:625-640`: **Show/Hide Comments** toggle per post (`.comments-container.hide`, button text swap).
- `:651-667, 744-754`: sticker/badge picker selection (`.user-sticker-select .img-div` → `.avatar-select`).
- `:698-743`: avatar picker Swiper (`.new-swiper-container`) with a `#output` page counter, prev hidden on the first page and next hidden on the last.
- `:756-814`: **segmented toggle buttons**. `.btn-toggle-one/two` and the radio pairs `edit-visibility-0/1`, `edit-reminders-0/1`, `edit-how-often-0/1`, `edit-meds-today-0/1` get `.toggle-active` on click.
- `:816-823`: **mood picker** `.feeling-today img`: the clicked face gets `.feeling-active` and the others fade to 50% while it saves.
- `:825-827`: live preview of the `desc` input into `.desc-text`.
- `:829-839`: wall composer attach buttons. `#postvideo` toggles `.video-div`. `#postimage` gets marked active. The image-cross clears it.
- `:841-850`: badge set pager (`.default-set` ↔ `.super-set`).
- `:855-877`: posts with no comments get "No Comments Yet". This is re-checked after a comment is deleted.
- `:883-886`: `.filter-tipbuttons button` single-select highlight.
- `:888-889`: **hides the loading overlay** at the end of ready.
- `:915-940`: globals `commentAdd(id)` (Add/Cancel Comment toggle) and `wallPostSubmit(id)` (reset after posting).
- `:942-984`: on load, opens the `#survey` Bootstrap modal if one is present (**survey prompt pop-up**). `menuhide()` then **slides the bottom `.navbar-fixed-bottom` out of view when scrolling down and back in when scrolling up** (TweenMax 0.5 s). The header stays put.
- `:986-1010`: legacy comment/video input show/hide helpers.
- `:1011-1022`: on resize, recompute the footer height and fit iframes in `.view-thrive-content` and `.embed-responsive` to their container width.
- `localStorage.filetype` (`:30,98,669-676,830,1067`) records whether a file input was touched. The drupal_wall module reads it.

**`js/calendar.js`**, the check-in calendar. The copy that is actually used is identical in `M/techstep_tracking/js/`.
- If `#calendar` is empty, it GETs **`/reload-calendar`** (JSON `youthrive_calendar: {start, end, dates:[{date, style, emoji}]}`) and renders **FullCalendar** month view (no column header, read-only, range limited to start/end).
- `dayRender` writes "MMM DD" into each cell. Days with data get a style class (`one` = green `#42C990`, `zero` = purple `#682F7C` per `less/theme.less:1226-1231`) and a `<div class="emojis <emoji>">` mood icon.
- Swiping left/right (touchSwipe) goes to the next/previous month.
- `.finishcheckin` click fades the item, ticks its hidden checkbox, and reloads the calendar after 1 s (buttons locked for 3 s).

**`js/draw-lines.js`**: an older version of `addSVGLine()`, not loaded. **`js/loader.js`**: an image-preload progress bar (`#overlay/#progress/#progstat`), not loaded. **`js/bootstrap-offcanvas-navigation.js`**: an off-canvas nav (`body.navbar-open`), not loaded. **`js/modules/user/user.js`**: the Bootstrap base theme's password-strength meter override (`Drupal.BootstrapPassword`, strength bar + help + confirm-match icons).

---

### 3.7 Visual design system (LESS/CSS)

**Source-of-truth warning.**
- The compiled `T/css/style.css` (modified 2024-08-01) contains rules that appear in **no LESS file**. Examples: `.lds-roller` / `.backscreen` loader (`css/style.css:29230-29345`), the bell active colour (`:32664-32670`), `.user-hash-tags {pointer-events:none}` (`:29204`, so tag pills in feeds are not clickable), commented-out `.container` widths (`:7911-7919`), and body font-size overrides at 750px (`:33242-33255`).
- `T/less/style.less` (entry file; imports `bootstrap`, `bootswatch`, `variables`, `overrides`, `navbar`, `page`, `bootstrapoffcanvas`, `../fontawsome/font-awesome`, `mediaqueries`, `accordion/accordion`, `bootstrap-slider`, `_titatoggle`, `wall-input`: `style.less:2-24`) is therefore **stale**. `less/wall.less` is a copy of the entry file.
- Treat `css/style.css` + `css/theme.css` as authoritative.

#### Colour palette
Variables are in `T/less/variables.less:37-84` and `T/less/theme.less:1-23`. The live scheme is `.themecolors(1)`, `theme.less:26-51`. Hex counts from compiled `style.css`.

| Role | Hex | Variable(s) | Where it shows |
|---|---|---|---|
| **Primary / magenta** (brand) | **#A31058** | `@brand-primary`, `@secondary-color`, `@brand-light`(theme) | All `.btn-primary` pills, inactive toggle halves, section titles (`.trackertitle`, `.tech-title`), logo mark fill (`lp-login-logo.svg`), links in edit icons. Most frequent brand colour (122 uses) |
| **Header purple** | **#682F7C** | `@primary-color`, `@bg-color`, `@nav-bar-default-color`(theme-1) | Fixed top bar background (`.theme-1 .affix .container`, `css/style.css:29361`), `.points-level` chip, "zero" calendar days, "No" side of meds toggle |
| **Deep aubergine** | **#3B0030** | `@brand-dark`, `@brand-bg`, `@font-color` | Headings colour (h1–h6), footer/bottom bar, `.text-primary`, SVG icon fills |
| **Success / active green** | **#42C990** | `@green-color` | Active half of every segmented toggle, "Hide Comments" state, active bell, active mood face, "one" calendar days |
| **Lavender** (title-block bg) | **#E9E5F9** | `@bg-color-light2` | `.titles-block.bg-color-light` rounded 20px header cards ("Your Wall", "Your Tips", "Your Notifications", search headers) |
| Light aqua (alt title bg) | #C2E7EA | `@bg-color-light` | `.titles-block` default |
| **Muted mauve** (icon/secondary text) | **#94748E** | `@danger-text`, `@icon-color` | Icons, login help text, wall composer buttons |
| Light mauve (lines/dividers) | #C9B9C6 | `@offwhite`, `@line-color`, `@notify-close` | Comment separators, quote icon, post content bg |
| Soft mauve | #A78BA3 | `@brand-light` (variables.less) | Navbar link colour |
| Body text | #404040 | `@gray`, `@text-color`, `@headings-color` | Base text |
| Black | #000000 | `@default-bg`, `@Text-color`, `@border-black` | **Page background outside the 750px column** (`body {background:#000}`, `css/style.css:23713-23714`), 1px borders on buttons, avatars and inputs |
| White | #FFFFFF | `@brand-white`, `@main-bg` | Main content column, header text/icons, inputs |
| Danger red | #D73A31 | `@brand-danger` | Errors, danger buttons |
| Accent yellow | #FFEB3B | `@brand-accent`, `@yellowcirclered` | Active tab underline |
| Misc | #4CAF50 success, #9C27B0 info, #FF9800 warning, #00BCD4/#83DEEA blues, #E3634D circle red, #50E3C2 check icon, #D991A4 `.tip-box` pink, #F5AAB9 pink gradient | | |

Alternate colour schemes (selectable only by level-6 users; nobody uses them): `.themecolors(2)` dark (bg #000, header #FFF, accent #68505F/#C9B9C6, `theme.less:52-76`); `(3)` teal/pink (#1D7880, #5BCFF9, #FAD4DC, `images/Pink-BG-Gradient.svg`, `:78-99`); `(4)` navy/pink (#2C3E50, #F5AAB9, #ADE7FC, `images/Blue-BG-Gradient.svg`, `:100-121`).

#### Typography
| Use | Font | Source |
|---|---|---|
| Body text | **Helvetica**, sans-serif, **21px**, line-height 1.4, #404040 | `variables.less:107-127`, `css/style.css:7433-7437` |
| Headings, buttons, logo text, section titles | **"SourceSansProBlack"** (Source Sans Pro Black, weight 900), the most used face in the CSS (≈50 declarations) | `@basefont2`, `variables.less:9,18-23`; `.btn-primary {font-family:@basefont2}` `style.less:4483-4485`; `#logo-container` `style.less:937` |
| Declared but secondary | Raleway (`@basefont`, `@headings-font-family`, `@font-family-serif`), Rubik, Shrikhand (one `!important` use), Roboto (bootswatch), SourceSansProRegular/ExtraLight, HelveticaNeue | Google-Fonts `@import`s: `variables.less:5-6` (Raleway 300–900, Shrikhand), `variable-overrides.less:9-10` (Rubik, Shrikhand), `bootswatch.less:5` (Roboto) |
| Icons | FontAwesome 4 (LESS in `T/fontawsome/`, font path `../fonts`), Glyphicons Halflings | `fontawsome/variables.less:4` |

Heading scale: h1 56, h2 40, h3 34, h4 24, h5 24, h6 15px, weight 500 (`variables.less:117-133`). Title blocks use 25px bold with a 24–25px normal-weight Helvetica "| N New" suffix.

Local font files present: `T/fonts/SourceSansPro-Black.woff2` only (its .eot/.woff/.ttf/.svg referenced in `@font-face` are missing), SourceSansPro-ExtraLight and Regular (eot/ttf/woff/woff2), and Glyphicons. The **HelveticaNeue `@font-face` files are missing**. **Rewrite:** load Source Sans 3 (Black 900 + Regular) and a system Helvetica/Arial stack.

#### Layout, breakpoints and responsive behaviour
- **All Bootstrap breakpoints are collapsed to 320px** (`@screen-xs-min`, `@screen-sm`, `@screen-md`, `@screen-lg` = 320px; `variables.less:354-384`). `@container-*` = 750px (720+30) (`:407-419`). So `col-sm-*` grids apply at every width and the design is one **single 750px column**.
- On phones `resize.js` forces `viewport width=750`, so the page is scaled to fit. On desktop the content sits in a centred white `.container` (750 → 970/1170 from stock Bootstrap, since the 750 override is commented out) over a **black page background**.
- `.main-container` is white and offset `top: 62px` below the fixed header (`style.less:818-826`). The header is `.affix` (fixed); the bottom bar is `.navbar-fixed-bottom` (z-index 999999) and auto-hides on scroll.
- Media queries in the compiled CSS are mostly `min-width:320px` (53), plus stock 768/992/1200 and a few `max-width:767/750/375/320px` tweaks (`css/style.css`, see the `@media` list). The "responsive" behaviour is really the viewport hack plus flexbox rows.
- **Rewrite recommendation:** a mobile-first, max-width ≈ 480–750px single column centred on desktop, with a real responsive viewport instead of the 750px hack. Halve the pixel sizes (21px → ~16px body, 22px → ~15–16px buttons).

#### Signature components
- **Pill buttons** `.btn-primary` (`theme.less:1043-1060`, `style.less:4483`): magenta #A31058 bg, white bold **SourceSansPro Black 22px**, **border-radius 20px**, **1px solid black border**, height 35px, padding 2px 18px, **drop shadow `0 4px 8px rgba(0,0,0,.35)`**, capitalised, margin-top 30px.
  - Icon variants add a 26px right-side icon via `:after` (`style.less:4547-4611`): `.comment-icon` (comment.svg), `.down-arrow-icon` (down.svg; **green #42C990 with an inset shadow when expanded**, magenta when collapsed, arrow flips), `.delete-icon` (delete.svg), `.flag-icon` (flag.svg), `.arrow-icon` (Iconlink.svg).
- **Segmented toggle** `.btn-toggle-container` (`theme.less:1124-1153`): two joined pills (left 20/0/0/20 radius, right 0/20/20/0), magenta with a drop shadow. The **active side turns green #42C990 with an inset shadow** and no border. The same pattern is used for radio pairs (visibility, reminders, how-often, meds-today; the "No" side goes purple #682F7C when active) (`theme.less:1155-1225`).
- **Title block** `.titles-block` (`theme.less:1088-1109`): rounded 20px card, lavender #E9E5F9, padding 15px, margin 0 10px 30px. It holds a `h3.trackertitle.flex-title` (black) and an optional toggle.
- **Inputs** (`theme.less:1116-1122`): white, 1px border, **radius 20px**, height 40px, **inset shadow `0 4px 8px 3px rgba(71,65,56,.35)`**.
- **Avatars** `.profile_img` / `.profile-image-container img`: circular (`border-radius:50%`), **1px solid black border**. 72×72 in posts, 55×55 in comments (`page.less:280-300,380-395`, `theme.less:1110-1115`). The avatar column is 105px wide (`style.less:3208-3210`).
- **Wall post card** `.drupal_wall.panel.wall-post`: white card with a 2px light-grey bottom border (`style.less:3354-3356`) and a flex row (avatar column | content). Name bold with a date, body text, optional full-width image or YouTube embed, reaction row, then the two pill buttons "Add A Comment" / "Show Comments". Optional coloured background from `field_post_bg`.
- **Reaction bar** `.likes > .emoji_icons` (`page.less:208-227, 2125-2215`): 50×40px cells, each an icon at 80% size with a bold 16px count underneath. The icon mapping in LESS is haha → `haha-color.svg`, love → `love-color.svg`, thumbs-up → `thumbs_up-color.svg`, **fire → `hundred-color.svg` ("100")**, **target → `flagnode-color.svg`**. `opacity-true` / `opacity-false` swap the "used" and "unused" state. The bar is disabled on your own posts (`wall-reaction-disable`).
- **Tag pills** `.user-hash-tags.label.label-primary` (`style.less:1306,1574-1600`, `tips.less`): small rounded labels under tips.
- **Mood faces** `.feeling-today .feeling-img` (`theme.less:1234-1255`): 100px circles, magenta bg, 1px black border and drop shadow. Active is green with an inset shadow. The face images are `Emoticon - Happy/Excited/Silly/Confident/Calm/Bored/Confused/Worried.svg` from `M/techstep_tracking/images/` (`techstep_tracking.module:1275-1282`).
- **Header** `#navbar` (`style.less:904-960`): purple bar, logo SVG 80px + "LinkPositively" in white SourceSansPro Black 27px; right side white bell and hamburger icons. The menu opens as a full-width collapse panel containing the search box and the vertical menu list.
- **Bottom bar** `.footer-bot` (`style.less:2982-2998`): aubergine #3B0030, white bold italic 18px right-aligned links. Currently empty.
- **Login panel** `.login-panel` (`style.less:3404-3430`): 100vh flex column, white labels in SourceSansPro Black 30px, help text #94748E, background illustration `lp-login-bg.png` (a grey female silhouette) offset right.
- **Profile banner** `.profile-head` (`style.less:2113-2126`): full-width stock photo `images/lp-banner-image1.png` (a smiling woman with confetti on a pink background), `background-size:cover`, 1px black border, radius 15px 15px 0 0.
- **Micro-leaderboard** `.microleaderboard` (`page.less:1443-1470`); **achievement popup** `.achievement-notification` (`page.less:1147-1165`); **badge bins** `.achievements_profile_bins` (`page.less:1369-1410`).
- **Calendar** `#calendar` / `.fc-*` (`style.less:3579-3600`, `theme.less:1226-1231`): coloured day cells plus mood emoji.
- **Loader** `.backscreen` + `.lds-roller` (`css/style.css:29230-29346`): 50% black scrim with an 8-dot rotating spinner.
- **Slanted section backgrounds**: SVG polygons from the sprite (3.4) placed behind headers, profile, check-in and dividers, giving a skewed look. `addSVGLine()` adds random skew dividers. **Rewrite:** use CSS `clip-path: polygon()` instead.
- Toggle switches: `_titatoggle.less` (Titatoggle checkbox-to-switch library).

---

### 3.8 Images and logos in the theme (`T/images/`, `T/`)

| File(s) | What it is | Used by |
|---|---|---|
| `images/lp-login-logo.svg` (272×272) | **Link Positively logo mark** ("Link Positively Logo" title): a white glyph plus a magenta #A31058 element | Header (80px), login and forgot-password (250px), in-app messages (50px): `page.tpl.php:86`, `page--front.tpl.php:88,160`, `page--node--209.tpl.php:105`, `user-pass.tpl.php:100` |
| `images/lp-login-logo.png` | PNG version of the logo | – |
| `logo.png` (742 B) | Stock Bootstrap subtheme logo | Unused |
| `images/youthrive-logo_1.png` (also `public://youthrive-logo_1.png`, the configured `logo_path`) | "TECHSTEP" dotted wordmark (legacy branding) | Only in tech-support/edit page headers via `$logo` |
| `favicon.ico`, `images/favicon.ico`, `images/favicon-16/32/96.png`, `images/apple-icon-*.png` (57–180, precomposed), `images/android-icon-36…192.png`, `images/ms-icon-70…310.png` | App/favicon set | `html.tpl.php:68-86` (DB favicon: `public://favicon.ico`) |
| `screenshot.png` | "Bootstrap 3 for Drupal" placeholder | Drupal admin only |
| `images/lp-login-bg.png`, `lp-login-bg-new.svg`, `Login-BG-Top.png`, `Login-BG-Bottom.png` | Login backgrounds (grey silhouette; black/magenta shapes) | `.login-panel` |
| `images/lp-banner-image1.png` | Profile header stock photo | `.profile-head` |
| `images/background-image.png`, `book.jpg`, `book-bg-white.jpg`, `bird.jpg`, `brif.jpg` | Profile "about" card backgrounds (book-worm, traveller…) | `M/youthrive_profile/theme/home-page-profile-block.tpl.php` |
| `images/Pink-BG-Gradient.svg`, `Blue-BG-Gradient.svg` | Scheme 3/4 page backgrounds | `theme.less` |
| `images/themes/theme1-4.png` | Colour-scheme swatches for the picker | `overrides.less` |
| Reaction icons: `haha(-color/-white).svg/.png`, `love…`, `thumbs_up…`, `hundred…`, `fire…`, `target…`, `super…`, `thought…`, `flagnode…`, `wow.png`, `sad.png`, `angry.png`, `like-tip(-color).svg`, `likeIcon-heart.svg`, `unlikeIcon-heart.svg`, `liked/loved/unloved.png`, `dislike.png` | Emoji reactions and favourite hearts | `page.less` reaction mixins |
| UI icons: `comment.svg/.png`, `delete.svg`, `edit.svg`, `flag.svg/.png`, `down(arrow).svg/.png`, `up.svg`, `next-2/3/4.svg`, `arrow-swipe.svg`, `check*.svg`, `defaultcheck.svg`, `Iconcheck.*`, `Iconlink.*`, `lock.svg`, `warning.svg`, `alert.png`, `tag-select.svg`, `resource-tick.svg`, `postIcon-flag/unflag.svg`, `postIcon-image/video.png`, `hot-topic.png`, `rounded-triangle(2).png`, `icons.png` (sprite) | Buttons and inline icons | style/page LESS |
| `images/emoji/emoji-{excited,happy,content,neutral,anxious,sad,angry}.png`, `images/icons/emoji-*.svg`, `icons/plus-checkIn-header.svg` | Mood scale icons (check-in) | `page.less:2480` |
| `images/avatars/avatar-5…9.png` | Sample avatars (the actual avatar sets live in modules) | – |
| `images/medals/medal-4-points.png` | Achievement medal | `profile.less`, `style.less` |
| `T/html/` (index.html + `images/banners/banner_2…8,default_{lg,md,sm}.jpg`, `TWM_banner.jpg`, `post.png`) | Static HTML prototype and banner art from the design phase | Not used by Drupal |

---

### 3.9 Block placement (theme `twm_bootstrapless`, `block.status=1`)

Visibility: `0` = all pages except those listed, `1` = only listed pages, `2` = PHP. Role restrictions come from `block_role` (D7 `block_role` is not per-theme). An empty listed-pages value with visibility 1 means the block **never shows**.

| Region | Weight | Module : delta | Title | Visibility / pages | Roles |
|---|---|---|---|---|---|
| **header** | -32 | menu : `menu-twm-menu` ("Participant Menu in FOOTER") | `<none>` | all pages | administrator, Research Administrator User, Coordinator User, participant |
| **content** | -32 | twm_comment_notification : `twm_comment_notification_mobile` | – | only `<front>` | any |
| content | -32 | uy_search : `uy_user_search_results` | – | only `<front>` | authenticated |
| content | -32 | youthrive_profile : `uy_home_profile` | – | only listed, **empty → never shown** | any |
| content | -30 | user : `login` | – | all pages (only shows to anonymous users, i.e. on node/209) | any |
| content | -29 | youthrive_profile : `uy_others_profile` | – | PHP: `arg(0)=='user' && uid != arg(1)` (someone else's profile) | authenticated |
| content | -28 | system : `main` | – | all | any |
| content | -28 | uy_standard_user_engagement : `engagement_msg_count` | – | all | any |
| content | -27 | youthrive_profile : `uy_user_levels` | – | only `my-profile` | authenticated |
| content | -26 | drupal_wall : `drupal_wall_view` | – | only `<front>` | administrator, Research Admin, Coordinator, participant |
| content | -25 | techstep_tracking : `techstep_tracking` | `<none>` | only `<front>` | participant |
| content | -16 | twm_achievement_bins : `twm_settings` | – | PHP: `arg(0)=='reminders'` or own `user/<uid>` | authenticated |
| **help** | 0 | system : `help` | – | all | any |
| **sidebar_second** | -16 | twm_achievement_bins : `twm_myprofile_data` | – | PHP: someone else's `user/<uid>` | authenticated |
| sidebar_second | -16 | twm_comment_notification : `twm_comment_notification` | `<none>` | only `<front>` | authenticated |
| sidebar_second | 0 | views : `thrive_tips_view_block-block` | – | all | participant (the view no longer exists in `views_view`, so it renders nothing) |
| sidebar_second | 0 | views : `998529e1ece640b5397785a28d6521ed` | – | only `thrive-tips` | any (hash not in `views_block_hashes`, so it is orphaned) |
| sidebar_second | 0 | views : `5a13ccfd…` = `backup_today_thrive_tips-today_tips_cycle_2` | – | only `<front>`, `thrive-tips` | any |
| **slidecontent** | -31 | drupal_wall : `custom_drupal_wall` (the post composer) | – | only `<front>` | authenticated |
| slidecontent | -30 | drupal_wall : `home_page_drupal_wall` (the feed) | – | only `<front>` | any |
| **slidercontent** | -31 | twm_achievement_bins : `uy_home_profile` | – | only `<front>` | authenticated |
| slidercontent | -29 | twm_achievement_bins : `twm_generic_profile` | – | PHP: someone else's `user/<uid>` or `my-profile` | authenticated |

No blocks are placed in navigation, highlighted, sidebar_first or footer. Other `block_role` rows (e.g. `menu-about`, `twm_weekly_checkin`, `tailored_tips_all`, `my_profile-block`, `user_mentions_drupal_wall-block_1`, `main-menu`, `navigation`) are for blocks that are **disabled in this theme** (they may be enabled in `twm_bootstrapless_old` for staff).

---

### 3.10 Menus used in navigation (titles → paths; `menu_links`)

**Participant menu `menu-twm-menu`** (shown in the hamburger via the header block). Enabled items (hidden=0) by weight; Drupal hides items the user lacks access to:

| Weight | Title | Path |
|---|---|---|
| -50 | eCoach | `ecoach` |
| -49 | Home / Your Wall | `<front>` |
| -49 | Thrive Wall | `thrive-tips-all` (no route exists) |
| -49 | Thrive Wall | `all` (no route exists) |
| -48 | **Your Tips** | `thrive-tips/tags` |
| -47 | Weekly Check-In | `weekly_checkin` (the route is `weekly-checkin`) |
| -47 | Profile | `uy-profile` (no route exists) |
| -47 | **Your Trackers** | `my-tracking` |
| -46 | Weekly Check-In Feedback | `weekly_feedback` |
| -45 | My Profile | `my_profile` (no route exists) |
| -45 | **Your User** | `my-profile` |
| -44 | About | `node/498` (**node does not exist**) |
| -40 | **Resources** | `locations` |
| -39 | **Log Out** | `user/logout` |
| 0 | Survey Report | `survey_reports` |

Disabled items: FAQ `node/207`, Glossary `yt-glossary`, Guidelines `node/271`, About `node/208`, etc `<front>`, Check In `drupal-wall/`, resource locator `locations`.
**The effective participant nav is: Home / Your Wall · Your Tips · Your Trackers · Your User · Resources · Log Out** (plus eCoach and Weekly Check-In items if the role has access). The routes `ecoach`, `my-tracking`, `my-profile` and `locations` exist in `menu_router`.

**`menu-about` "About"** (block disabled in this theme): Terms & Disclosure `node/498` (enabled, broken). Disabled items: About `node/208`, FAQ `node/207`, Terms & Disclosure `node/163`, Community Guidelines `node/271`, Feedback & Contact `node/206`, Tech Support `node/add/tech-support`.

**`main-menu`** (staff/admin tools; only printed in the tech-support/edit page templates as `primary_nav`, which is commented out): Home `<front>`, Access Report `access_report`, Activate Users `user-operations`, Convert Control Users `admin/user-operations`, Tutorials `admin/tutorials`, Qualtrics Configuration `survey`, Tech Support `admin/tech-support`. Disabled items: Weekly Check-In(/Feedback), Deactivate Users, Manage Participants, Qualtrics Configuration `admin/survey`.

**`user-menu`** (`secondary_nav`): My Account `user/edit-my-profile`, (untitled) `user/view-profile/%`, plus core Log in / Create account / Request new password (hidden) and profile-main tabs.

**`menu-footer`**: Log out `user/logout`. Disabled items: Get Help `node/204`, Terms & Disclosure `node/163`, About `node/429`.

**`menu-flagged-messages`** (staff moderation): Wall Post Abuse `admin/abuse-node`, Comment Abuse `admin/abuse-comment`.

Other fixed links in the templates: bell → `/all-comments`; post edit → `/post/<nid>/edit`; comment edit → `/commentedit/<cid>/<uid>`; profiles → `/user/view-profile/<uid>`; tips → `/thrive-tips/tags[/<t1+t2>]`, `/thrive-tips/favs`, `/comment-tip/<nid>`, `/thrive-tips/thrive-content/<nid>/<tid>`; leaderboard `/this_week`; weekly check-in `/weekly-checkin`; forgot password `/user/password`; AJAX endpoints `/views/ajax`, `/load-node/<nid>`, `/tip-points/<nid>/<flag>`, `/reload-calendar`.

---

### 3.11 What each main screen looks like (designer brief)

All screens share a **fixed purple (#682F7C) top bar**: the LP logo mark and "LinkPositively" in heavy white type on the left, and a white bell (green when there are unread notifications) plus a white 4-bar hamburger on the right. The hamburger drops down a full-width panel with a **search field** and the menu (Home / Your Wall, Your Tips, Your Trackers, Your User, Resources, Log Out). Content is a single white column on black, designed at 750px wide for phones. Section headers are **rounded lavender cards** with a bold black title and a light "| N New" counter. Actions are **magenta pill buttons with a black outline and drop shadow**; selected states turn **green with an inset "pressed" shadow**. Avatars are black-outlined circles. Page loads and logins show a dimmed overlay with a spinner.

1. **Login (anonymous; any URL → node/209)**: no top bar. A full-height screen with a large centred LP logo (250px), white SourceSansPro-Black labels "Username" and "Password" over rounded, inset-shadow inputs, and a magenta "**Login ➜**" pill. After a failed login a "**Forget Password ➜**" pill appears and the error alert is suppressed. A grey silhouette illustration sits in the background.
2. **Forgot password (`/user/password`)**: the same layout with the logo, "Username or Email" field, and "Submit ➜". Below it, the research-study notice (node 209 body) in small mauve text. **Password reset (`/user/reset/…`)**: message, help and "Submit ➜".
3. **Home / Your Wall (front page = `/drupal-wall`)**:
   - Top: a stack of **In-App Message cards** (logo, "In App Message" heading, text, "Read More ➜" and "Delete" pills). Messages come from the study (welcome, level-up, time-on-site, comment and reaction notices), and Read More can route to a Qualtrics midpoint survey.
   - Then the "**Your Wall | N New**" title card, the tracker/check-in block (participants), and a two-slide area: slide 1 has the **post composer** ("what's on your mind", with image, video and content-warning attach icons) and the **feed**; slide 2 has the **home profile / achievements** panel.
   - Feed cards: avatar left; name, date, text/photo/YouTube right; a row of 5 emoji reactions with counts; "Add A Comment" and "Show Comments" pills; an "Inappropriate" pill on other people's posts and edit/delete icons on your own.
   - Tip-comment auto-posts show "*Name!* commented on a thrive tip." with "See Full Thrive Tip >>".
   - Headline posts (`!Title!`) collapse with "Read more ➜".
   - Scrolling to the bottom loads older posts.
   - Sidebar blocks include notifications and today's-tip cycle.
4. **Notifications (`/all-comments`)**: the "**Your Notifications | N New**" title card and a list of comment and reaction notifications (module-rendered).
5. **Your Tips (`/thrive-tips/tags`, `/thrive-tips/favs`, `/tips`)**:
   - The "**Your Tips | N New Tips**" card with a segmented "Explore Tips | Favorite Tips" toggle.
   - Explore shows "Explore Tips — Select the type of tips you want to see" with **tag filter pills** (multi-select, encoded in the URL as `tag1+tag2`).
   - Tips appear as swipeable cards (Swiper): a favourite heart on the left, then title, rich HTML body, optional video and tag pills. Viewing a tip slide awards points.
   - **Single tip (`/comment-tip/<nid>`)**: tip card plus its comment thread (avatar, date/time, name, text, emoji reactions) and a comment box.
6. **Search** (from the hamburger): an overlay panel "Search Results" with a close pill, "N Results", and two paginated sections "**Posts | Page X of Y**" (wall-style cards) and "**Tips | Page X of Y**" (tip cards).
7. **Your User / My Profile (`/my-profile`), Other user's profile (`/user/view-profile/<uid>`, `/user/<uid>`)**:
   - A **photo banner** (pink stock image) with the avatar, username and level/points chip (purple `.points-level`).
   - About cards (about me, social media, traveller, book-worm), user levels, **achievement/badge bins** (default and "super" sticker sets, with locked badges showing "unlock with points"), and the user's settings block.
   - An "Edit" mode swaps to editable fields, **avatar picker** (paged swiper), sticker picker, change-picture upload ("Upload Your Avatar") and change-password.
   - Colour-scheme picker (level-6 only).
   - Full-screen edit at `edit-profile-form-page` hides the header and footer.
8. **Trackers / Check-in (`/my-tracking`, front-page tracker block)**:
   - **Mood picker**: a row of 100px circular faces (Happy, Excited, Silly, Confident, Calm, Bored, Confused, Worried); the selected one turns green.
   - A **Yes/No segmented toggle** for "meds today".
   - Reminder settings (Phone vs app toggle, how-often toggle, visibility toggle), showing "You will receive notifications on your Phone./app.".
   - A **month calendar** (swipe left/right between months). Each day is labelled "MMM DD" and coloured green for yes / purple for no, with a mood emoji. "Finish check-in" items fade out and refresh the calendar.
9. **Weekly Check-In (`/weekly-checkin`)**: a link block "Weekly Check-In"; the prompts are module-rendered.
10. **Leaderboard / achievements (`/this_week`)**: a micro-leaderboard (rows of "Points This Week | avatar + name | Total Points", plus a "View Leaderboard" pill) and an "**Achievement Unlocked**" pop-up with badge and title when a badge is earned.
11. **Resources (`/locations`)**: resource locator (module templates; map pin icon in the sprite, resource tick icons, resource comments toggles).
12. **Static info pages** (`public_page`): a white panel with a magenta `h4` title and the body (About, FAQ, Help, Guidelines, Terms).
13. **Tech Support (`/node/add/tech-support`) and any node edit form**: plain Bootstrap chrome with a classic navbar ("TECHSTEP" logo) and the form in a panel.
14. **Survey pop-up**: if a page includes a `#survey` modal, it opens automatically on load.

---

### 3.12 Static pages and content inventory

**Node types with counts** (`SELECT type,count(*) FROM node GROUP BY type`):

| Type | Count |
|---|---|
| resources | 277 |
| thrive_tips | 157 |
| journey_goals | 153 |
| drupal_wall (wall posts) | 94 |
| journey_methods | 30 |
| user_goals | 14 |
| public_page | 13 |
| weekly_checkin_prompt | 10 |
| journey_category | 6 |
| page | 4 |
| reminder_messages | 1 |
| reminder_sms_inputs | 1 |

**`page` nodes** (internal admin how-tos): 2 "How to create Thrive Tips"; 4 "How to manage tags for Thrive Tips"; 98 "How to create weekly checkin prompts"; 162 "FAQ". All published, none have aliases.

**`public_page` nodes** (rendered with `node--public-page.tpl.php`), all published:

| nid | Title | URL alias |
|---|---|---|
| 163 | RESOURCES | `terms-disclosure` |
| 204 | Get Help | `help` |
| 206 | ABOUT US | `feedback-contact` |
| 207 | FAQ | `faq` |
| 208 | About | `about` |
| 209 | This is a research study (login/403/404 page; empty body) | – |
| 222 | Support | `about/support` |
| 271 | TechStep Community Guidelines | `community-guidelines` |
| 416 | Getting Started with TWM | `getting-started-with-twm` |
| 429 | About Us | `about-us` |
| 519 | post | – |
| 545 | test hash | – |
| 4818 | testpage | – |

Titles and aliases do not match content in several places (163 "RESOURCES" at `terms-disclosure`, 206 "ABOUT US" at `feedback-contact`). Menus point to `node/498`, which does not exist. 519, 545 and 4818 look like test content. Some pages still use the old **TechStep / TWM** naming. The rewrite should re-map these deliberately.

---

### 3.13 Rewrite notes and gotchas (theme-level)

- Two audiences: participants use TWM; staff use TWM-Old and Seven (3.1). Only `theme-1` colours are in use.
- The anonymous experience is **only** the login screen (every page 403s to node/209). The password pages print node 209's body as disclaimer text.
- The icon system (sprite clone), slanted SVG backgrounds, TweenMax bottom-bar hide, and the 750px viewport hack should be replaced with an SVG icon component set, CSS `clip-path`, a scroll-direction hook and a real responsive layout.
- Behaviours that must be kept as features: tip-view points (`/tip-points`), SMS click tracking (`?sms=`), in-app messages with read/delete and the Qualtrics midpoint link, bell unread state and "N New" counts (last-visit timestamps), wall "N New" since `field_wall_visit`, the `!Headline!` post convention, multi-tag filtering in the URL, reactions (5 visible types, none on your own content), abuse flags ("Inappropriate"), infinite scroll, AJAX comments, the survey modal auto-open, and the check-in calendar feed `/reload-calendar`.
- Dead or duplicate files to drop: `templates/template.php`, `html.tpl1.php`, `page--front.tpl.php-30-09`, `user-pas.tpl.php`, `user-login-block1.tpl.php`, `user-profile-edit.tpl.php`, `user-profile-form.tpl.php`, root copies of the `twm-*-block-content` templates, the theme copies of `calendar.js`/`fullcalendar`/`moment`, `draw-lines.js`, `loader.js`, `bootstrap-offcanvas-navigation.js`, `css/svg-styles*.css`, `less/wall.less`, `T/html/`, and `node_modules/`.
- Known markup bugs: `node.tpl.php:94-96` (unclosed div), `user-pass-reset.tpl.php:107` (broken `<p>`), and the `<title>` prefix "6-" (`html.tpl.php:89`).
