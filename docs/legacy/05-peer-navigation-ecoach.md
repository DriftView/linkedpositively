# 05 — Peer Navigation site (`ecoach/`, DB `peernav`)

Status: legacy spec for the rewrite. It describes what the Drupal 7 site does today, including its defects. Once the Drupal code is deleted, this document is the reference.
Scope: everything that exists only on the Peer Navigation / "eCoach" site. Link Positively (`lp/`) features, including the CAS server, are covered in other documents. This one covers only the CAS client side.

Nothing below contains participant data. All counts are aggregates taken from the `peernav` database snapshot (July 2026 backup).

## 0. Source abbreviations used in citations

| Abbrev | Path |
|---|---|
| `ES.module` | `ecoach/sites/all/modules/ecoach_sessions/ecoach_sessions.module` |
| `ES.install` | `ecoach/sites/all/modules/ecoach_sessions/ecoach_sessions.install` |
| `SD` | `ecoach/sites/all/modules/ecoach_sessions/session_details.inc` (the live file; the `session_details-*.inc`, `session_details copy.inc`, `*.inc-bkp` and `*.module-bkp` files are dead backups — see §14) |
| `UA` / `UM` / `UN` / `UD` / `CI` / `CR` / `UDash` | `ecoach_sessions/{user_attachments,user_messages,user_notes,user_details,coach_info,create_relation,user_dashboard}.inc` |
| `TPL/x` | `ecoach/sites/all/modules/ecoach_sessions/templates/x.tpl.php` |
| `JS` | `ecoach/sites/all/modules/ecoach_sessions/js/session.js` |
| `EP` | `ecoach/sites/all/modules/ecoach_profile/ecoach_profile.module` |
| `EU` | `ecoach/sites/all/modules/ecoach_utility/ecoach_utility.module` |
| `UR` | `ecoach/sites/all/modules/ecoach_standard_usage_report/ecoach_standard_usage_report.module` (+ `.install`) |
| `EA` | `ecoach/sites/all/modules/ecoach_ajax/ecoach_ajax.module` |
| `TT` | `ecoach/sites/all/modules/techstep_tracking/techstep_tracking.module` |
| `TH/` | `ecoach/sites/all/themes/techstep_ecoach/` |

---

## 1. What the site is

- Site name `Peer Navigation` (variable `site_name`). In the UI it calls itself "eCoach" or "Peer Navigator". Production host: `prod.ecoach.lp.radiant.digital`. Timezone: `America/New_York`. Front page: `node/1`, a basic page whose body is only "Welcome to eCoach".
- A **coaching back-office** that pairs **Peer Navigators (role `coach`)** with **study participants** from Link Positively (LP). The coach:
  - runs 6 scripted, weekly one-on-one sessions (in Zoom),
  - fills in a structured checklist form for each session,
  - writes contact notes,
  - exchanges files and private messages with the participant,
  - views the participant's LP daily check-in calendar.
- The **participant** only sees:
  - a read-only "Coaching Plans" page (session list, descriptions, completion ticks, downloadable worksheets),
  - their coach's profile,
  - their files,
  - their messages,
  - a Zoom launch link.
- **No local passwords.** Every login goes through CAS against LP (`cas_server = prod.lp.radiant.digital`, `cas_uri=/cas`, port 443, CAS 2.0). Accounts are created automatically on first CAS login (§4).

---

## 2. Enabled modules (`system` table, `status=1`) and themes

**Custom or project modules**

| Module | Enabled? | Purpose |
|---|---|---|
| `ecoach_sessions` | yes (schema 7101) | All coaching features: sessions, dashboard, notes, files, messages, session report |
| `ecoach_profile` | yes | "Edit Participant" form (`profile/%`) |
| `ecoach_utility` | yes | CAS login attribute sync, login redirects, CAS logout, unread-message bell, Zoom menu link rewrite |
| `techstep_tracking` | yes | "Tracker" tab: reads LP's `reminder_checkin` (meds/mood) and shows it in a calendar |
| `notes` | yes | Features module for the `notes` content type |
| `user_sessions` | yes | Features module for the legacy `user_sessions` content type (unused by the live code) |
| `common_fields`, `feature_profile` | yes | Features modules for user fields |
| `ecoach_standard_usage_report` | **no** (`status=0`) | Participant login-session tracking and report. The code is present, the `ecoach_usage_session` table exists (0 rows), and permissions are granted to administrator, coach and coordinator. It must be ported: it mirrors LP's "standard usage report" (§11.2). |
| `ecoach_ajax` | **no** (`status=0`, never installed) | Experimental test pages. Do not port (§14). |

**Contrib and core modules enabled**

announcements_feed, block, cas, color, comment, contextual, ctools, dashboard, dblog, entity, entityreference, entity_reference_view, features, field, field_sql_storage, field_ui, file, filter, help, image, jquery_update, list, menu, node, number, options, overlay, path, permissions, privatemsg, privatemsg_filter, rdf, role_theme_switcher, search, select_or_other, shortcut, standard, system, taxonomy, text, toolbar, update, user, views, views_ui, webform.

These modules matter functionally: **cas** (SSO), **privatemsg** (messages), **role_theme_switcher** (theme per role), **entityreference** (`field_coach`), **views** (the `user_reference` view feeds the coach picker). The rest are Drupal scaffolding.

**Themes**

- Enabled: bartik, bootstrap, newtheme, seven, techstep_ecoach, twm_bootstrapless.
- Which one actually renders a page:
  - `theme_default = techstep_ecoach` ("TechStep", a bootstrap sub-theme).
  - `admin_theme = seven`. `node_admin_theme = 1`. Coordinator and administrator have "view the administration theme".
  - `role_theme_switcher_{rid}_theme`:
    - administrator (3), coach (5), coordinator (6) → `bootstrap`
    - participant (4), tech-participant (7) → `techstep_ecoach`
    - anonymous and authenticated → Default.
  - The switcher loops over the user's roles in order and **the last non-Default role wins** (`role_theme_switcher.module:6-21`). In practice, coaches and coordinators get the stock **bootstrap** theme and participants get **techstep_ecoach**.
- **`newtheme` and `twm_bootstrapless` are enabled but never selected** (not default, not assigned to a role). Treat them as dead. `techstep_ecoach/templates/page.vars.php` declares `twm_bootstrapless_preprocess_page` (copy/paste from TWM), so it never runs under techstep_ecoach.

---

## 3. Roles and permissions

Roles (`role` table): anonymous (1), authenticated (2), administrator (3), participant (4), coach (5), coordinator (6), tech-participant (7).
Role sizes at snapshot: 1 admin, 14 coach, 8 coordinator, 26 participant, 24 tech-participant. There are 45 users, 44 active, and 20 have a `field_coach` value.

Custom permissions:

| Permission | Defined at | Granted to |
|---|---|---|
| `access_ecoach_sessions` "Access User Sessions" | `ES.module:171-198` | administrator, coach, coordinator |
| `access_coach_info` | same | participant, tech-participant |
| `access_techstep_site` | same | tech-participant |
| `access_user_messages` | same | coach, participant, tech-participant |
| `access_user_dashboard` | same | participant, tech-participant |
| `create_relationship` | same | coordinator only |
| `access_load_ajax` | same | **authenticated user** (everyone), coach, participant |
| `access_session_reports` | same | administrator, coach, coordinator |
| `access_profile` | `EP:27-31` | administrator, coach, coordinator |
| `access ecoach standard usage report` (restrict access) | `UR:34-41` | administrator, coach, coordinator |

Notable core and contrib grants:
- **coach**: `administer users`, `administer permissions` (over-privileged), `access user profiles`, privatemsg read/write/delete/reply-only, `filter private messages`.
- **coordinator**: `administer users`, `access user profiles`, `access toolbar`, `view the administration theme`.
- **participant** and **tech-participant**: privatemsg read/write/delete/reply-only.

### What each role can do (effective behaviour)

**Anonymous**
- Sees front page "Welcome to eCoach" and the user login block with the CAS link ("Log in using CAS", redirect message "You will be redirected to the secure CAS login page.").
- Registration is effectively CAS-only (`cas_user_register=1`).

**Participant**
- Lands on `user-dashboard` after login (`EU:44-59`).
- Can see:
  - Coaching Plans (`user-dashboard`)
  - My Coach (`coach-details`)
  - my files (`user-files`: upload, download, remove)
  - messages (`user-messages`)
  - Launch Zoom (their coach's Zoom URL)
  - Logout (also logs out of CAS/LP).
- Cannot see the coach dashboard.

**Tech-participant**
- Same as participant, plus the "back to LinkPositively" / "LinkPositively" link (`techstep` → redirect to `https://prod.lp.radiant.digital`, `ES.module:160-166`).
- A CAS-created participant who arrives with the LP roles `participant` and `ecoach-user` gets both roles (`ES.module:206-220`).
- Note: `tech-participant` lacks `access_load_ajax` explicitly, but has it through "authenticated user".

**Coach (Peer Navigator)**
- Lands on `dashboard` after login (`EU:46-48`).
- Sees the participants assigned to them.
- Per participant: Details, Sessions (start/resume/complete, drag-reorder), User Files, Notes, Messages (actually the coach's own inbox, §8), Tracker, Launch Zoom, Edit Participant.
- Can also open the Session Report and the Usage Report (if enabled).

**Coordinator**
- Same dashboard, but the list shows **every active user except uid 1** (coaches, coordinators and participants alike; `ES.module:330-341`).
- Only the coordinator can "Add Relation" / "Create Relation" (assign a coach to a participant, §6).
- Can open the session report and edit participants.
- Has no `access_user_messages`.
- Gets the Seven admin theme on admin pages.

**Administrator**
- Full Drupal admin.
- On `/dashboard` the participant list is empty. `coach_participants()` returns NULL for users who are neither coach nor coordinator (`ES.module:312-342`), so the page emits a PHP warning.

---

## 4. Accounts, SSO and "participant creation"

There is **no in-app participant creation form**. `ecoach_profile.info` says "Participant Creation Form", but the module only edits users.

Participants and coaches are created by the **CAS module on first login** (`cas_user_register=1`). CAS settings relevant to creation:
- `cas_auto_assigned_role` = {4 participant}: every CAS-created account gets `participant`.
- `cas_hide_email=1` and `cas_hide_password=1`.
- `cas_login_form=1`: a CAS link is added to the login form.
- `cas_exclude = services/*`.
- `cas_check_frequency=-2`: never auto-check (no gateway).

### 4.1 Role assignment at account creation (`hook_cas_user_presave`, `ES.module:206-220`)

```
attrs = cas_user.attributes.drupal_roles     // LP roles sent in the CAS ticket
if 'coach' in attrs:
    account.roles = {coach}                   // replaces all roles, including auto-assigned participant
elif 'participant' in attrs and 'ecoach-user' in attrs:
    account.roles = {tech-participant, participant}
```

### 4.2 On every login (`ecoach_utility_user_login`, `EU:11-61`)

This is skipped when the login is a password-reset form. Otherwise:

```
if cas attributes present:
   if attrs.pic:      download URL into public://pictures/ and set as user picture (system_retrieve_file, managed)
   if attrs.zoom:     user.field_zoom_link = attrs.zoom
   if attrs.name:     user.field_first_name = attrs.name
   if attrs.pronoun:  user.field_pronoun = attrs.pronoun
   if attrs.location: user.field_location = attrs.location
if user has role coach:        redirect destination = 'dashboard'
elif user has role participant:
   if attrs.coach_name and a local user with that username exists:
        user.field_coach = that user            // coach assignment synced from LP on every login
   redirect destination = 'user-dashboard'
```

So LP is the source of truth for:
- a coach's Zoom link, picture, first name, pronoun and location;
- which coach a participant is assigned to (matched by **username**).

A local re-assignment (§6) is overwritten at the participant's next login if LP sends `coach_name`.

### 4.3 Logout (`EU:66-80`)

If the account is a participant or coach:
1. Destroy the session.
2. Redirect to `https://{cas_server}/user/logout`, which is LP's logout (single sign-out).

The usage-report logout hook (§11.2) runs before this redirect because modules fire alphabetically.

### 4.4 User fields (all on `user` entity, cardinality 1)

| Field | Type | Meaning / where edited |
|---|---|---|
| `field_coach` | entityreference → user (widget options come from view `user_reference`/`entityreference_1` with arg rid 5 = active coaches, sorted by created DESC) | Participant's assigned coach |
| `field_first_name` | text | Coach first name (synced from CAS) |
| `field_pronoun` | text | Pronoun (CAS sync; editable on Edit Participant) |
| `field_location` | text | Location (CAS sync; editable) |
| `field_about_me` | text_long | Coach "About Me" shown to participant |
| `field_zoom_link` | text | Coach Zoom URL (CAS sync) |
| `field_age` | number_integer | Participant age (Edit Participant) |
| `field_on_prep` | list_boolean {0,1} | "On PrEP?" |
| `field_study_id` | text | Study ID; also used as "Participant SID" in the usage report |
| `field_participant_code` | text | Participant Code |

User pictures are enabled: 1024x1024 max, 800 KB, style `thumbnail`. The coach picture falls back to `public://default.png`.

---

## 5. Routes (complete inventory)

"Tpl" is the template used. All `ecoach_sessions` routes are declared in `ES.module:21-145`.

| Path | Callback | Access | Returns / purpose |
|---|---|---|---|
| `dashboard` | `load_users()` `ES.module:289` | access_ecoach_sessions | Coach dashboard shell (TPL/load-users). Query params `uid` and `param` auto-open a participant (§7.1) |
| `test-lp` | `load_users_lp()` `ES.module:296` | access_ecoach_sessions | **Debug leftover**: switches to DB `link_positively`, `print_r`s all LP users with nodes, exits. Do not port. |
| `techstep` | `access_techstep()` `ES.module:160` | access_techstep_site | 302 to `https://prod.lp.radiant.digital` |
| `user-dashboard` | `user_dashboard()` `UDash:14` | access_user_dashboard | Participant "Coaching Plans" (TPL/user-dashboard) |
| `user-files` | form `user_attachments(NULL)` `UA:14` | access_user_dashboard | Participant file upload and list |
| `sessions/%uid` | form `user_sessions` `SD:104` | access_ecoach_sessions | Session list for a participant as a full page (normally loaded via AJAX) |
| `create-relationship` | form `add_relationship` `CR:11` | create_relationship | Assign a coach to a participant |
| `autocomplete/%role` | `get_users_autocomplete` `CR:55` | create_relationship | Returns a PHP array, not JSON (broken, unused) |
| `load/%uid/%formid` | `load_page()` `SD:365` | access_load_ajax (**all authenticated users**) | AJAX fragment loader: renders form `%formid` for `%uid` (or `user_info`), appends a `<script>` that merges `Drupal.settings`, and `die()`s. **Security hole**: any logged-in user can render any form ID for any uid. |
| `user-details/%uid` | `user_info()` `UD:11` | access_ecoach_sessions | Participant details (TPL/user-details) |
| `coach-details` | `coach_info()` `CI:11` | access_coach_info | Participant's "My Coach" page (TPL/coach-info) |
| `user-notes/%uid` | form `user_notes` `UN:11` | access_ecoach_sessions | Notes list and add-note form |
| `user-messages` | form `user_messages` `UM:84` | access_user_messages | Private message inbox and composer |
| `user-threads/%thread` | `user_thread_messages()` `UM:11` | access_user_messages | Returns an unwrapped form array (broken; the reply sub-form is embedded in `user-messages` instead) |
| `delete-thread/%thread` | `thread_delete()` `UM:77` | access_user_messages | GET; soft-deletes the thread for the current user. No CSRF token. |
| `delete-message/%mid` | `delete_message()` `UM:67` | access_user_messages | GET; soft-deletes the message for the current user. Sets "Message has been deleted". |
| `reorder` | `reorder_sessions()` `SD:415` | access_ecoach_sessions | POST `order[]`, `uid` → saves session order, returns JSON `{msg:true}` |
| `load-session/%serial-%uid` | form `load_session` `SD:441` | access_ecoach_sessions | The session-runner page (TPL/load-session) |
| `admin/session-report` | `get_user_data()` `SD:2668` | access_session_reports | Session status report (HTML table). Menu link "Session Report" in the Management menu. |
| `admin/session-report/csv` | `get_user_data_csv()` `SD:2710` | access_session_reports | CSV download |
| `profile/%uid` | form `edit_profile` `EP:36` | access_profile | "Edit Participant" |
| `calendar` | `calendar()` `TT:141` | access_ecoach_sessions | POST `{uid, tid, tracker}` → JSON check-in dates (§9) |
| `my-tracking/%uid` | form `my_tracking` `TT:156` | access_ecoach_sessions | Tracker calendar container (§9) |
| `admin/reports/ecoach-standard-usage-report` | `UR:88` | access ecoach standard usage report | Usage report, 100 rows per page (module disabled today) |
| `admin/reports/ecoach-standard-usage-report/csv` | `UR:115` | same | CSV download |
| `my-test/my_form`, `my-test/retrieve_form` | `EA:13-29` | open to all | Experimental; module not enabled. Do not port. |
| `user`, `user/logout`, `user/%`, `node/1` | core | — | Core account pages; logout goes through §4.3 |

**Permission check the rewrite must add:** no route checks that the coach actually owns `%uid`. Any coach can open any participant, or load or reorder their sessions, by URL. The rewrite must enforce the rule "coach sees only participants whose `coach == me`; coordinator and admin see all".

---

## 6. Coach–participant assignment

- **Storage:** the participant's `field_coach` holds a single coach uid.
- **Sources of assignment:**
  1. The CAS login sync (`EU:50-57`), matching LP's `coach_name` to a local username.
  2. The "Create a Coach Relationship" form, coordinator only (`CR:11-50`).
  3. Admin editing the user in the core form (`field_coach` widget).

**Form `create-relationship`** (menu labels "Add Relation" in the main menu and "Create Relation" in the Participant menu):
- Page title: "Create a Coach Relationship".
- `coach`: select "Select Coach", required. Options: `{uid: name}` for all users with role `coach` and `status<>0` (`CR:55-72`).
- `participant`: select "Select Participant", required. Same query for role `participant`.
- Submit button: "Create Relationship".
- On submit:
  1. Load both users (accepts a numeric uid or a username).
  2. Set `participant.field_coach = coach.uid`, replacing any previous value.
  3. Save.
  4. Show the message "The new relationship has been created.!".
  5. Stay on the page (no redirect).
- No validation that the pair differs, no history, and no notification.

**Coach's participant list** (`coach_participants`, `ES.module:312-342`):

```
if user has 'coach' and not 'coordinator':
    SELECT uid, name FROM users JOIN field_coach WHERE field_coach = me AND status <> 0 ORDER BY name DESC
elif user has 'coordinator':
    SELECT uid, name FROM users WHERE status <> 0 AND uid <> 1 ORDER BY name DESC   // all users, not only participants
else: return NULL
```

The list is sorted by username in **descending** order.

---

## 7. Coach dashboard (`/dashboard`)

### 7.1 Layout (TPL/load-users, JS)

- Two columns:
  - **Left (col-sm-3)**: heading "Participant" and a vertical stack of full-width buttons, one per participant, each labelled with the username.
  - **Right (col-sm-9)**: `#dashboard`, which initially reads "Click on a participant to load the view."
- Clicking a participant:
  1. Marks the button active.
  2. Shows "Loading...".
  3. Loads `/load/{uid}/user_info` into `#dashboard` (`JS:13-20`).
- **Deep link.** On page load, if the path is `/dashboard` (`JS:262-306`):
  1. Read `?uid=` and `?param=`.
  2. Highlight that participant and load `user_info`.
  3. Then open the matching tab: `param=user_sessions` opens Sessions, `param=user_attachments` opens User Files.
- These redirects rely on the deep link:
  - saving a session → `dashboard?uid=X&param=user_sessions`;
  - a coach uploading files → `param=user_attachments`;
  - saving Edit Participant → `param=user_info`.

### 7.2 Participant tab bar (TPL/user-details)

Tabs are rendered as a horizontal list. Each one loads into `#details` via AJAX (`JS:22-75`):

| Tab | Loads |
|---|---|
| Details (default, active) | `/load/{uid}/user_info` |
| Sessions | `/load/{uid}/user_sessions` |
| User Files | `/load/{uid}/user_attachments` |
| Notes | `/load/{uid}/user_notes` |
| Messages | `/load/{uid}/user_messages` (ignores uid, §8.4) |
| Tracker | `/my-tracking/{uid}` |
| Launch Zoom | `<a target=_blank href={current coach's field_zoom_link or '#'}>` |

### 7.3 Details tab (`user_info`, `UD:11-38`; TPL/user-details)

- A right-aligned **"Edit Participant"** button links to `/profile/{uid}`.
- The tab lists these fields, showing `-` when empty:
  - **Name**: username
  - **Age**
  - **Pronoun**
  - **Location**
  - **Time on Site**: always blank, never implemented
  - **PrEP**: "Yes" if 1, otherwise "No" (the template uses an undefined variable, so it always falls to "No" when the value is not 1)
  - **Study ID**
  - **Participant Code**

### 7.4 Edit Participant (`profile/{uid}`, `EP:36-115`)

Title "Edit Participant". Fields, all optional, no validation:

| Key | Type | Label / description | Saves to |
|---|---|---|---|
| `uid` | hidden | — | — |
| `name` | textfield | "Name" / "Enter the user's name." | `users.name` (**this is the login username that CAS matches on**, so changing it breaks SSO matching) |
| `pronoun` | textfield | "Pronoun" / "Enter the user's pronoun" | field_pronoun |
| `location` | textfield | "Location" / "Enter the user's location" | field_location |
| `age` | textfield | "Age" / "Enter the user's age" | field_age (integer field; no numeric validation) |
| `prep` | checkbox | "On PrEP?" | field_on_prep |
| `study_id` | textfield | "Study ID" / "Enter the user's study ID" | field_study_id |
| `p_code` | textfield | "Participant Code" / "Enter the user's Participant Code" | field_participant_code |

Submit "Submit" → `user_save`, message "User details updated!", redirect to `dashboard?uid={uid}&param=user_info`.

---

## 8. Sessions, notes, files and messages (coach side)

### 8.1 The curriculum (constant `ECOACH_SESSIONS`, `SD:17-55`)

The curriculum is hard-coded: 6 sessions. The **serial** (1-6) is the stable identity of a session. Titles and descriptions are site-authored and shown to both coach and participant.

| Serial | Title | Participant-facing description (verbatim) |
|---|---|---|
| 1 | Introduction and Intake | Welcome to LinkPositively! In the intro session, we will review how to log into the app for our sessions, and how to use the app. We will discuss expectations of participants and the role of the Peer Navigator, and how to contact research staff. We also want to confirm the best ways to reach you. We will go over the topics that we will be covering in our future sessions, as we will walk through the app and features of the app. You can also ask any questions or voice any concerns you have as we go through all of this. |
| 2 | Week 1: Trauma and our Emotions | Welcome to Week 1! Today we are going to do a quick check in and then move into our discussion around emotions. We are going to start by defining trauma, and then discuss how trauma can impact us. Then, we will talk about some great tools for talking about our feelings and emotions. We will talk about the role of emotions in our lives, how we learned about emotions and identify how we deal with them. |
| 3 | Week 2: Cultivating emotional regulation and distress tolerance | Welcome to Week 2! We will start today with a check in to see how you are doing and if you have any questions around the discussion of emotions from last week. Today we are going to learn about regulating the emotions and feelings that we are learning to label. We will talk about how our emotions impact us in different ways, the importance of distress tolerance and get some tools to help us cope. |
| 4 | Week 3: Relationships: Relationship patterns and activating social support networks | Welcome to Week 3! In this session we are going to start with our check in, and answer any questions or concerns that you may have around what we have covered so far. Then, we will talk about personal relationship patterns. We will explore patterns that we have in our relationships and how to establish healthy boundaries and communicate assertively, and then we will review our basic personal rights. |
| 5 | Week 4: Interpersonal Violence: Its impact on how we navigate the world around us | Welcome to Week 4! Today we are going to start with our check in. We will take time to see how you are doing with all the tools and topics that we have covered so far. We will then move into discussing interpersonal violence. This can be a challenging topic, but we are here to support you and we can move at a pace you are comfortable with. We are going to begin by talking about the power and control in interpersonal relationships. We will explore the impact that interpersonal violence and trauma can have on all areas of our lives. We will look at flexibility in relationships that we have and talk about the different types of power that exist, like boss and employee. We will also talk about different tools on how to navigate these relationships. |
| 6 | Week 5: Medical Mistrust and Review | Congratulations! We are here at week 5! We are going to start by checking in, answering any questions or concerns that you have, and then going over the tools that you have been practicing. Today, we are going to cover the topic of medical mistrust. We will look at the relationship between discrimination and medical mistrust. We will explore some HIV beliefs and look at what is true and what is false. We will identify skills for building patient-provider communication. We will finish today's session by reviewing all the tools that you now have in your back pocket and how to use them to navigate the world around you. |

Each entry also has a `note_title` ("Note 1".."Note 5", "Note 8"), which is unused.

### 8.2 Data model

**`ecoach_session_data`** (`ES.install:7-66`; exposed as entity `session_data`, `SD:67-100`). One row per (participant, serial), in principle.

| Column | Meaning |
|---|---|
| `id` | serial PK |
| `uid` | participant |
| `aid` | author: the coach who created the row or last reordered it |
| `weight` | display order (1..n) |
| `sid` | session serial (1..6; legacy rows have 7..10) |
| `complete` | NULL / 1 (0 is never written by the live code) |
| `date` | timestamp when marked complete |
| `goals` | blob, unused (always NULL) |
| `created` | timestamp of last start/complete. NULL for rows created only by a reorder |

**`ecoach_session_log`** (entity `session_data_log`). One row per **Save** of the session form: `id`, `session_data_id` → `ecoach_session_data.id`, `goals` (serialized PHP array of the **entire** submitted `form_state['values']`), `created`.

The form is always re-populated from the **latest** log row (`get_session_data`, `SD:2600-2611`). So the log is both the full revision history and the current state.

The serialized `goals` array has these top-level keys (inspected keys only):
- `nid{N}`, `user{N}`, `session{N}`, `note{N}`, `note_mode{N}`, `complete{N}`, `save{N}`
- `form_build_id`, `form_token`, `form_id`
- `{N}` (the op value)

`session{N}` is a map of the form keys listed in §8.6. The layout is:
- each checkbox key → `{1: 0|1}`
- text keys → string
- radios → `"1"` or `"2"`

Snapshot counts:
- **`ecoach_session_data`**: 186 rows.
  - per serial: 1:33, 2:29, 3:25, 4:23, 5:22, 6:20, then 7:9, 8:9, 9:10, 10:6 (legacy 2019-2020 curriculum)
  - complete=1: 56 rows; NULL: 130 rows.
- **`ecoach_session_log`**: 166 rows.
- **`notes`**: 228 nodes.

**Notes** are the content type `notes` (features module `notes`). Fields:
- `field_notes` (text_long)
- `field_method_of_contact` (integer: 1 Voice, 2 Voicemail, 3 SMS, 4 Email)
- `field_user` (entityreference → participant)
- `field_session_ref` (entityreference → node of type `user_sessions`)

How the live code fills a note:
- `node.title` is the session serial as a string ("1".."6"), or the literal "Note" for general notes.
- `node.uid` is set to the **participant** uid, not the coach. The note author is therefore not recorded (`SD:286-302`).
- `field_session_ref` receives an **`ecoach_session_log.id`**, not a node ID (type mismatch, `SD:234-236`).

Snapshot: title "1".."6" → 34/27/21/18/14/12, "7" → 2, "Note" → 100. Method of contact counts: 1:119, 2:10, 3:17, 4:41, empty:12.

The content type `user_sessions` (fields `field_goals`, `field_session`, `field_session_complete`, `field_user`, `field_weight`; 3 nodes) is **legacy and unused**.

### 8.3 Sessions tab: list, status and reordering (`user_sessions` form `SD:104-146`, `get_user_sessions` `SD:151-201`, TPL/user-sessions)

```
get_user_sessions(uid):
  rows = SELECT * FROM ecoach_session_data WHERE uid=? ORDER BY weight
  for i in 1..6:
     row = first row with sid == i (or null)
     item = {title, description, session_num:i,
             complete: row?.complete, nid: row?.id or 'new',
             created: row?.created or 'new',
             weight: row?.weight or i, serial: row?.sid or i,
             templates:    links to every file in public://session-{serial}/pdf/,
             templatesimg: <img> for every file in public://session-{serial}/200dpi/}
  sort items by weight ASC
```

Each list row is a panel:
- a drag handle icon (`images/handle.png`)
- the session title
- "Last Modified:" followed by the latest log `created`, formatted `M-d-Y H:i`, shown only if a log exists
- a right-aligned button linking to `load-session/{serial}-{uid}`

The button label is chosen like this (`SD:128-136`):

```
label = (created == 'new') ? 'Start' : 'Resume'
if complete == 1: label = 'Completed'
```

Because reorder-only rows have `created` NULL, those sessions still show "Start".

**Reordering** (`JS:152-171`, `SD:415-436`):
- The list `#all-sessions` is jQuery UI sortable.
- On drop, it POSTs `/reorder` with `order[]` = session serials in the new visual order and `uid`.
- Server side, for each position `i` (1-based), it does `MERGE ecoach_session_data KEY(sid, uid) SET weight=i, aid=me`. This creates rows for sessions never started (`created` NULL).
- No success UI is shown.
- The chosen order also applies to the **participant's** Coaching Plans page.

### 8.4 Running a session (`load-session/{serial}-{uid}`, `load_session` `SD:441-534`, TPL/load-session)

On load:

```
(serial, uid) = split(arg, '-')
row = session_data where uid and sid=serial
if none: id = INSERT {uid, aid:me, weight:serial, sid:serial, created:now}; complete = null
else:    id = row.id; complete = row.complete; if row.created is null: UPDATE created=now
notes = notes nodes where node.uid = uid AND title = serial   (status=1)
```

Page layout, top to bottom:
1. "**Participant Name:** {username}"
2. The session title in bold.
3. The session-specific checklist form `session{serial}` (§8.6), pre-filled from the latest log.
4. A "**Notes**" heading and a rule, then each existing note for this session. Each note shows its date in bold (`n-d-y, g:i a`) followed by the note text. The method of contact is **not** shown (the mapping code at `SD:472-481` is dead). If there are no notes: "No Notes found."
5. `note{N}`: textarea titled " ADD NOTES: General information about today's session (e.g., What aspects worked well? What are the participant's strength and barriers?)".
6. `note_mode{N}`: select "Method of Contact". Options: 1 Voice, 2 Voicemail, 3 SMS, 4 Email. **Required**. Default is the method of the last note for this session.
7. `complete{N}`: checkbox "This Session is Complete". Default is the current `complete`.
8. **Save** button.

The form uses `#tree` (values are nested under `session{N}`).

On Save (`session_submit`, `SD:218-241`):

```
if complete == 1: UPDATE session_data SET complete=1, date=now, created=now WHERE id
                  // unchecking does NOT revert; completion is one-way
log_id = INSERT ecoach_session_log {session_data_id:id, goals: serialize(all form values), created: now}
if note text non-empty OR note_mode non-empty:   // note_mode is required, so effectively always
    INSERT notes node {title: serial, uid: participant, field_user: participant,
                       field_notes: text, field_method_of_contact: mode, field_session_ref: log_id}
message 'Session submitted Successfully'
redirect dashboard?uid={uid}&param=user_sessions
```

Behaviour to preserve (and fix where noted):
- Every save creates a full revision.
- Completion stamps the date.
- A note is attached to the session.
- **Fix:** don't create empty notes.
- **Fix:** record the coach as the note author.

**Rescheduling-reason visibility.** The intended rule is that "Enter reason for rescheduling" shows only when "Did this session happen on the original date…" = **No** (value 2). This is implemented by `#states` plus `check_validation()` in `JS:232-250`. Because of `#tree`, the element names are `session{N}[session]`, so neither selector matches and the reason field is effectively always visible. Implement the intended rule.

### 8.5 Common structure of every session form

- Every "check" item is a checkboxes element with a single option `1 => label`, normally followed by an untitled textarea (`*_text{n}`) for the coach's free-text notes. Some check items have additional titled textareas.
- Section headers are `item` elements.
- `<div class="form-border">` wraps the first and last element of each section (a visual divider).
- Key naming convention: `intro_*`, `engaging_*`, `evoking_*`, `planning_*`, `summary_*`. These are Motivational Interviewing stage names inherited from the old curriculum; headers carry the real section titles.

**Every session** starts with `session_start_time` (textfield "START TIME") and ends with this footer:

| Key | Type | Label | Options |
|---|---|---|---|
| `general` | textfield | END TIME | — |
| `session` | radios | Did this session happen on the original date and time that was scheduled? | 1 Yes, 2 No. Session 1's label is "No " with a trailing space; session 6's is "No (If not, why was the session rescheduled?)" |
| `session_time` | textfield | Enter reason for rescheduling | visible when `session` = 2 |
| `phone` | radios | Did the participant complete this session on their phone? | 1 Yes, 2 No |
| `video` | radios | Did the participant use video for their session? | 1 Yes, 2 No |

START/END TIME are free text (no time picker, no validation).

### 8.6 Session checklists (verbatim labels)

Notation: `☐ key` = single checkbox, `✎ key` = textarea (with its title in quotes when it has one). A check line followed by "+ ✎" has its paired untitled textarea.

**Session 1: Introduction and Intake** (`SD:552-756`). Header "**Check in with participant:**".
- ☐ intro_check1 "How was their week?" + ✎ intro_text1
- ☐ intro_check2 "Review expectations of participant and role of Peer Navigator" + ✎ intro_text2
- ☐ intro_check3 "Go over technology use and limitations" + ✎ intro_text3
- ☐ intro_check4 "Review topics that will be covered in sessions: Trauma, Emotions, Regulation, Distress Tolerance, Relationship Patterns, Activating Support Systems, Interpersonal Violence, Power and Control, and Medical Mistrust." + ✎ intro_text4
- ☐ intro_check5 "TIPS"; ✎ intro_text5 "Introduce and walk participant through how to access Tips and navigate topics."; ✎ intro_text51 "Review that they will be getting Tips daily"
- ☐ intro_check6 "Walk participant through the APP so that they can maximize their use of it" + ✎ intro_text6
- ☐ intro_check7 "Confirm best ways to contact participant" + ✎ intro_text7
- ☐ intro_check8 "Confirm that participant knows how to connect with Peer Navigator and other research staff" + ✎ intro_text8
- ☐ intro_check9 "Ask participant if they have any questions or concerns at this time" + ✎ intro_text9
- ☐ intro_check10 "Confirm next session date and time" + ✎ intro_text10

**Session 2: Week 1: Trauma and our Emotions** (`SD:761-1059`)
- *Check in with participant:*
  - ☐ intro_check1 "How was their week?" + ✎
  - ☐ intro_check2 "Do they have any questions since baseline? Yes/No" + ✎
  - ☐ intro_check3 "How are they feeling about starting the session?" + ✎
  - ☐ intro_check4 "Any technical difficulties? Yes/No" + ✎
  - ☐ intro_check5 "Set Agenda by identifying goal of this session to discuss trauma, its impacts on emotions, emotion identification, the role of our emotions and other life concerns (syndemic issues)" (no textarea)
- *Introduce concept of trauma*
  - ☐ engaging_check1 "Give definition of Trauma" + ✎
  - ☐ engaging_check2 "Psychoeducation about the Impact of Trauma" + ✎
- *Emotions and Feelings*
  - ☐ evoking_check1 "Psychoeducation about the Functions of Emotions" + ✎
  - ☐ evoking_check2 "Psychoeducation about the Influence of Social Environment on Feelings" + ✎
  - ☐ evoking_check3 "Introduce and discuss with participant how to Label Feelings, use feelings wheel and feelings list with participant." + ✎
  - ☐ evoking_check4 "Introduce and go over self-monitoring form with participant." + ✎
- *Focused Breathing*
  - ☐ planning_check1 "Introduce the concept of Focused Breathing and rationale behind using this tool." + ✎
  - ☐ planning_check2 "Walk participant through exercise by explaining how to do this diaphragmatic breathing exercise" + ✎
  - ☐ planning_check3 "Do the exercise for 5 minutes with the participant" + ✎
- *Closing of Session*
  - ☐ summary_check1 "Check in with participant, how are they feeling?" + ✎
  - ☐ summary_check2 "Assign breathing exercises – Participant to do them twice a day for 5 minutes each time. Ask if they have any questions" + ✎
  - ☐ summary_check3 "Encourage participant to use self-monitoring form to help identify feelings/emotions" (no textarea)
  - ☐ summary_check4 "Confirm next session date and time" + ✎ summary_text4

**Session 3: Week 2: Cultivating emotional regulation and distress tolerance** (`SD:1064-1440`)
- *Check in with participant:*
  - ☐ intro_check1 "How was their week?" + ✎
  - ☐ intro_check2 "Review session work"; ✎ intro_text2 "Listen carefully to any problems that they had with the breathing exercises"; ✎ intro_text21 "Review self-monitoring form. Were they able to use it?"
  - ☐ intro_check3 "Any technical difficulties? Yes/No" + ✎
  - ☐ intro_check4 "Set Agenda by identifying goal of this session is to introduce and discuss emotion regulation and distress tolerance" (no textarea)
- *Emotion Regulation*
  - ☐ engaging_check1 "Psychoeducation about Emotion Regulation" + ✎
  - ☐ engaging_check2 "Identify participants current coping skills" + ✎
  - ☐ engaging_check3 "Describe 3 channels of emotional experience" + ✎
  - ☐ engaging_check4 "Psychoeducation on Healthy Emotional Regulation" + ✎
  - ☐ engaging_check5 "Walk participant through Unhealthy Coping Common to Trauma Survivors" + ✎
- *Distress Tolerance*
  - ☐ evoking_check1 "Rationale for Distress Tolerance" + ✎
  - ☐ evoking_check2 "Psychoeducation on Why Tolerate Unpleasant Emotions in Our Lives" + ✎
  - ☐ evoking_check3 "Psychoeducation on how to know whether to tolerate the unpleasant emotions or not" + ✎
- *Tools to help with Emotion Regulation and Distress Tolerance*
  - ☐ planning_check1 "Introduce Assessing Pros and Cons" + ✎
  - ☐ planning_check2 "Introduce Emotion Surfing" + ✎
  - ☐ planning_check3 "Pleasurable Activities" + ✎
  - ☐ planning_check4 "Positive Self-statements" + ✎
  - ☐ planning_check5 "The Gift of a Pause/Formal Time-Out" + ✎
- *Closing of Session*
  - ☐ summary_check1 "Check in with participant, how are they feeling?" + ✎
  - ☐ summary_check2 "Review and assign breathing exercises – Participant to do them twice a day for 5 minutes each time." + ✎
  - ☐ summary_check3 "Encourage participant to use self-monitoring form to help identify feelings/emotions" + ✎
  - ☐ summary_check4 "Practice assessing Pros and Cons of distressing situations during the week" + ✎
  - ☐ summary_check5 "Engage in 1 pleasurable activity during the week" + ✎
  - ☐ summary_check6 "Engage in 1 positive self-statement per day" + ✎
  - ☐ summary_check7 "Review and implement if possible, The Gift of a Pause" + ✎
  - ☐ summary_check8 "Confirm next session date and time" + ✎

**Session 4: Week 3: Relationships…** (`SD:1445-1769`). This session has no `engaging` section.
- *Check in with participant:*
  - ☐ intro_check1 "How was their week?" + ✎
  - ☐ intro_check2 "Review session work", followed by these titled textareas:
    - ✎ intro_text2 "How was the breathing exercise?"
    - ✎ intro_text21 "Do they have anything on the feelings monitoring form they want to share or process?"
    - ✎ intro_text22 "Did they engage in a pleasurable activity?"
    - ✎ intro_text23 "What positive self-statement(s) did they use?"
    - ✎ intro_text24 "Were they able to practice Pros and Cons of tolerating a distressing situation?"
    - ✎ intro_text25 "Were they able to review The Gift of a Pause?"
  - ☐ intro_check3 "Any technical difficulties? Yes/No" + ✎
  - ☐ intro_check4 "Set Agenda by identifying goal of this session is to introduce and discuss Relationship Patterns, Agency and Assertiveness in Relationships, and Flexibility in relationships"
- *Identifying Personal Relationship Patterns*
  - ☐ evoking_check1 "Psychoeducation on Interpersonal Schemas and self-fulfilling prophecy" + ✎
  - ☐ evoking_check2 "How to Identify your Interpersonal Schemas" + ✎
  - ☐ evoking_check3 "Common Interpersonal Schemas" + ✎
- *Agency and Assertiveness in Relationships*
  - ☐ planning_check1 "Psychoeducation about Effective Assertiveness" + ✎
  - ☐ planning_check2 "Psychoeducation about Boundaries in Relationships" + ✎
  - ☐ planning_check3 "Introduce "I" Messages" + ✎
  - ☐ planning_check4 "Basic Personal Rights" + ✎
- *Closing of Session*
  - ☐ summary_check1 "Check in with participant, how are they feeling?" + ✎
  - ☐ summary_check2 "Review and assign breathing exercises – Participant to do them 2x's a day for 5 min" + ✎
  - ☐ summary_check3 "Encourage participant to use self-monitoring form to help identify feelings/emotions" + ✎
  - ☐ summary_check4 "Practice assessing Pros and Cons of distressing situations during the week" + ✎
  - ☐ summary_check5 "Engage in self-care: 1 pleasurable activity and 1 positive self-statement per day" + ✎
  - ☐ summary_check6 "Review The Gift of a Pause and Basic Personal Rights" + ✎
  - ☐ summary_check7 "Practice "I" statements" + ✎
  - ☐ summary_check8 "Confirm next session date and time" + ✎

**Session 5: Week 4: Interpersonal Violence…** (`SD:1774-2140`)
- *Check in with participant:*
  - ☐ intro_check1 "How was their week?" + ✎
  - ☐ intro_check2 "Review session work", followed by these titled textareas:
    - ✎ intro_text2 "How was the breathing exercise?"
    - ✎ intro_text21 "Do they have anything on the feelings monitoring form they want to share or process?"
    - ✎ intro_text22 "Did they engage in a pleasurable activity?"
    - ✎ intro_text23 "What positive self-statement(s) did they use? Were they able to practice Pros and Cons of tolerating a distressing situation?"
    - ✎ intro_text24 "Were they able to review The Gift of a Pause?"
    - ✎ intro_text25 "Did they practice "I" statements?"
    - ✎ intro_text26 "Did they review the Personal Bill of Rights?"
  - ☐ intro_check3 "Any technical difficulties? Yes/No" + ✎
  - ☐ intro_check4 "Set Agenda by identifying goal of this session discuss Power and Control Dynamics, creating healthy relationships and using all these new tools to help them navigate the world around them."
- *Power and Control Dynamics*
  - ☐ engaging_check1 "Psychoeducation about Interpersonal Violence. Use Cycle of Violence handout to guide conversation." + ✎
  - ☐ engaging_check2 "Psychoeducation about power and control in interpersonal relationships using Power and Control wheel to guide conversation" + ✎
  - ☐ engaging_check3 "Psychoeducation on impact of Interpersonal violence and trauma on all areas in our lives (socio-structural barriers)" + ✎
- *Flexibility in Relationships*
  - ☐ evoking_check1 "Psychoeducation about Different Types of Power Differentials" + ✎
  - ☐ evoking_check2 "Psychoeducation about Respect and Compassion" + ✎
  - ☐ evoking_check3 "Effective ways of saying "No"" + ✎
  - ☐ evoking_check4 "Effective ways of Making Requests" + ✎
  - ☐ evoking_check5 "Compassion: Practicing Living More Easily with Yourself and Others" + ✎. Bug: its default is gated on `evoking_check3` (`SD:1957`).
- *Closing of Session*
  - ☐ summary_check1 "Check in with participant, how are they feeling?" + ✎
  - ☐ summary_check2 "Review and assign breathing exercises – Participant to do them 2x's a day for 5 min" + ✎
  - ☐ summary_check3 "Encourage participant to use self-monitoring form to help identify feelings/emotions" + ✎
  - ☐ summary_check4 "Practice assessing Pros and Cons of distressing situations during the week" + ✎
  - ☐ summary_check5 "Engage in self-care: 1 pleasurable activity and 1 positive self-statement per day" + ✎
  - ☐ summary_check6 "Review The Gift of a Pause and Basic Personal Rights" + ✎
  - ☐ summary_check7 "Practice "I" statements" + ✎
  - ☐ summary_check8 "Review and practice saying "no"" + ✎
  - ☐ summary_check9 "Practice making requests" + ✎
  - ☐ summary_check10 "Confirm next session date and time" + ✎

**Session 6: Week 5: Medical Mistrust and Review** (`SD:2145-2577`)
- *Check in with participant:*
  - ☐ intro_check1 "How was their week?" + ✎
  - ☐ intro_check2 "Review session work", followed by these titled textareas:
    - ✎ intro_text2 "How was the breathing exercise?"
    - ✎ intro_text21 "Do they have anything on the feelings monitoring form they want to share or process?"
    - ✎ intro_text22 "Did they engage in a pleasurable activity?"
    - ✎ intro_text23 "What positive self-statement(s) did they use? Were they able to practice Pros and Cons of tolerating a distressing situation?"
    - ✎ intro_text24 "Were they able to review The Gift of a Pause?"
    - ✎ intro_text25 "Did they practice "I" statements?"
    - ✎ intro_text26 "Did they review the Personal Bill of Rights?"
    - ✎ intro_text27 "Were they able to practice saying "No"?"
    - ✎ intro_text28 "Did they practice making requests?"
  - ☐ intro_check3 "Any technical difficulties? Yes/No" + ✎
  - ☐ intro_check4 "Set Agenda by identifying goal of this session is to discuss Medical Mistrust and Distrust. Identify tools to help navigate medical needs in their life. Address facts around current HIV treatment options. Finally Review all tools gained from sessions and address questions."
- *Medical Mistrust*
  - ☐ engaging_check1 "Psychoeducation on medical mistrust"; ✎ engaging_text1 "Definition of medical mistrust"; ✎ engaging_text11 "Relationship between discrimination and medical mistrust"
  - ☐ engaging_check2 "Provide example(s) of medical mistrust and get personal experiences/examples from participant." + ✎
  - ☐ engaging_check3 "Psychoeducation on HIV conspiracy beliefs – what is true and what is false" + ✎
  - ☐ engaging_check4 "Skills building for effective patient-provider communication" + ✎
- *Review Tools and Tie them into how they help to Navigate the World Around Them*. Each item below is a ☐ `evoking_check{1..15}` + ✎:
  1. "Breathing exercises – how to use and benefits"
  2. "Feelings Monitoring Form"
  3. "Pros and Cons – Relate to challenges specific to participant (e.g., medical mistrust)"
  4. "The Gift of a Pause"
  5. "Emotion Surfing"
  6. "Pleasurable Activities"
  7. "Positive Self-Statements"
  8. ""I" Statements"
  9. "Cycle of violence"
  10. "Power and control wheel"
  11. "Saying "No""
  12. "Making effective requests"
  13. "Practicing compassion"
  14. "Personal Bill of Right"
  15. "Effective patient-provider communication". Its textarea key is `evoking_text17`, but the default reads `evoking_text15`, so that text never re-populates (`SD:2471-2476`). Fix in the rewrite.
- *Closing of Session*
  - ☐ summary_check1 "Congratulate participant on all the hard work that they have done" (no textarea)
  - ☐ summary_check2 "Ask if they have any questions or concerns" + ✎
  - ☐ summary_check3 "Connect them to resource guide and tips" + ✎
  - ☐ summary_check4 "Remind participant that they will be contacted by Research Coordinator or Research Associate to schedule their Follow Up questionnaire/survey" + ✎

**Rewrite guidance.** Store each session template as data (sections → items → {key, type, label, hasText, extraTexts[]}), keyed by serial. Store each save as an immutable revision document `{sessionId, participantId, coachId, answers: {key: bool|string}, createdAt}`. Keep the legacy keys so the migrated `goals` blobs map 1:1.

### 8.7 Notes tab (`user_notes` form, `UN:11-102`; TPL/user-notes)

- A "New Note +" link toggles a collapsed panel containing:
  - `notes` textarea "Add Notes"
  - `notes_mode` select "Method of Contact": 1 Voice, 2 Voicemail, 3 SMS, 4 Email, required
  - a "Cancel" reset button
  - **Save** (AJAX)
- On Save (`note_submit`, `UN:75-91`):
  - If the note is empty, the wrapper shows "Note should not be empty.".
  - Otherwise it creates a notes node with title "Note" (no session link), `uid` = participant, then re-clicks the Notes tab to refresh.
- Below the panel is a table with columns **Notes | Method of Contact | Related Session | Date**:
  - Related Session is "Session N" when the note title is numeric, otherwise blank.
  - Date format is `n-d-y`.
  - The list holds all published notes nodes whose `node.uid` = participant, in unspecified DB order. It includes the session notes from §8.4.
  - The template loops `<= count`, which renders one extra empty row.
- `note_delete()` exists (`UN:96`) but no route exposes it, so notes cannot be edited or deleted in the UI.

### 8.8 Files (`user_attachments` form, `UA:14-166`; TPL/user-attachments)

The same form is used by the participant (`/user-files`, uid = self) and by the coach (User Files tab, uid = participant).

- **Instruction text:** "To share a completed activity with your eCoach, first click + Attach File. When the filename appears on this page, you can then click ↑ Upload Files to send the files to your eCoach. If you've attached the wrong file, you can click X next to the filename to remove it."
- **Existing files** (`get_attachments`, `SD:2639-2657`): files whose `file_usage` has type `user_attachments` and id = uid. For a participant viewer the query also includes id = their coach's uid.
  - Each file row shows a download icon plus the filename (link to the file URL) and a **Remove** button.
  - Remove is an AJAX call that runs `file_delete(force)` with no ownership check (`SD:2662-2667`).
  - If there are no files: "No Attachments".
- **Upload:**
  - One `managed_file` slot, described "Upload Files", with the HTML `multiple` attribute.
  - Destination: `private://user_attachments/{uid}/`.
  - Allowed extensions: `jpg jpeg gif png csv doc docx odt pdf xls xlsx`.
  - No explicit size limit (PHP/Drupal default applies).
  - JS auto-uploads on file select (`JS:196-228`) and relabels the widget as "Attach File".
  - "Add File Slot" (AJAX) adds another slot. It stays hidden until a first file has been uploaded.
- **Submit "Upload Files"** (`files_submit`, `UA:120-140`):
  - For each uploaded fid: set permanent and add `file_usage('ecoach_sessions','user_attachments', uid)`.
  - Then message "File(s) submitted Successfully", or the warning "No files attached".
  - A coach is then redirected to `dashboard?uid=&param=user_attachments`.
- **Download access** (`hook_file_download`, `ES.module:347-362`): a private file is served (as an attachment) only if `file.uid == current user` **or** the current user has the role `coach`. Coordinators and admins are not granted by this hook.

### 8.9 Messages (`user_messages` form, `UM:84-168`; TPL/user-messages)

Messages are built on the **privatemsg** module. The same form serves the participant page `/user-messages` and the coach's Messages tab, and it **always shows the current user's own inbox**. The per-participant filter is commented out (`UM:91-100`).

- **Heading and composer:**
  - The heading reads "messages".
  - The composer is a `message` textarea "Message" (3 rows) plus a send button (arrow icon, AJAX).
  - A disabled "Send To:" field holding the current user's name is defined but commented out of the template.
- **On send** (`message_submit`, `UM:150-168`): calls `privatemsg_new_thread(recipients=[current user], subject="message from participant {current username}", body)`, then shows "Message has been sent!" and clears the box.
  - **Defect:** the only recipient is the sender. Coaches never receive participant messages, and vice versa.
  - **Rewrite:** a participant's message goes to their assigned coach; a coach's message from a participant's tab goes to that participant.
- **Thread list** (privatemsg "list" query for the current user):
  - Each thread shows its last-updated date (`m/d/y`), a delete-thread ✕ (GET `/delete-thread/{id}`, removes the row from the DOM), the subject, and a "new" badge when unread.
  - The expanded thread shows each message: date `m/d/y`, a delete ✕ (GET `/delete-message/{mid}`), author name, body, and a "New" badge.
  - Below the messages is a "Reply" label and a textarea (3 rows) with a send button. `thread_submit` → `privatemsg_reply`. On success the new message is appended as "<b>{my name}</b> {body}". On failure: "Something went wrong!".
- If the inbox is empty: "No Messages found".
- **Unread bell:** `ecoach_utility_preprocess_page` sets `bell_color='active'` when `privatemsg_unread_count() > 0` (`EU:126-132`). The techstep_ecoach header shows a bell icon linking to `/user-messages` with that class (`TH/templates/page.tpl.php:92`).
- **Snapshot:** 75 `pm_message` rows (2018-09 → 2023-07). Only 6 `pm_index` rows remain.

---

## 9. Tracker tab (LP check-in calendar; `techstep_tracking`)

- **Tab click** loads `/my-tracking/{uid}` into `#details` (`JS:68-75`).
- **Form `my_tracking`** (`TT:156-214`):
  - Attaches fullcalendar, moment, `calendar.js`, `tracker.js` and css.
  - Looks up the participant's **LP uid by identical username** in the secondary DB connection named `path`, i.e. the LP database (`get_lp_user_id`, `TT:227-240`). `settings.php` has no `path` connection in this snapshot, so production must have defined it.
  - Reads today's LP `reminder_checkin` row (`TT:245-263`).
  - Renders hidden `checkin_id` (today's check-in id, or "new") and `user_id` (LP uid).
  - Renders `<div id="calendar">` when today's check-in is not finished and `days >= 1`. `days` comes from `field_intervention_start_date`, a field that does not exist on peernav users, so days = 1 and the calendar always shows.
- **`calendar.js`** (`techstep_tracking/js/calendar.js`; a near-duplicate lives in `ecoach_sessions/js`):
  1. On ready it POSTs `/calendar` with `{uid: LP uid, tid: checkin_id, tracker: 'main'}`.
  2. The server (`TT:98-150`) selects `uid, meds, moods, created` from LP `reminder_checkin` where uid = LP uid.
  3. Each date is converted to `Y-m-d` in the LP user's timezone (falling back to the server timezone).
  4. The response is JSON `{calendar: {dates: [{uid, meds, moods, date}]}}`.
- **Rendering:**
  - FullCalendar month view with header prev | title | next, not editable, content height 500.
  - The title is suffixed with "| {days with data} of {days in month}".
  - Per day:
    - meds=1 → green check icon (`images/1.svg`)
    - meds=0 → cross icon (`0.svg`)
    - moods 1-12 → emoji plus label: 1 Happy, 2 Excited, 3 Silly, 4 Confidant [sic], 5 Calm, 6 Bored, 7 Confused, 8 Worried, 9 Overwhelmed, 10 Sad, 11 Frustrated, 12 Angry
    - the `checkin` flag (1/0) uses the same icons
- **Rewrite:** the Next.js app shares one MongoDB with LP, so read the participant's LP check-ins directly by user id, not by username across DBs.

---

## 10. Participant pages

Participants get the techstep_ecoach theme (§12).

### 10.1 Coaching Plans (`/user-dashboard`, `UDash:14-23`, TPL/user-dashboard)

- **Intro panel, verbatim:**
  - "Need to contact your eCoach to reschedule a session? We can be reached at ecoach.techstep@prideresearch.org."
  - "eCoaching is not meant to be a replacement for psychiatric or psychological services. If you are experiencing a psychiatric or medical emergency, please call 911 or go to the nearest emergency room."
  - "Click the title of each module below to collapse or expand its contents."
- **One panel per session**, in the coach-defined weight order:
  - left column: `check.png` if complete = 1, otherwise `uncheck.png`
  - right column: the title as a collapse toggle, the description, and a "**Session Files**" fieldset
- **Session Files:**
  - Desktop shows download links for each file in `public://session-{serial}/pdf/`.
  - Mobile shows `<img>` for each file in `public://session-{serial}/200dpi/`. The switch is `screen.width <= 768` (`JS:138-151`).
  - "No Files" when the pdf folder is empty.
- **Collapse behaviour:** panels start expanded. Clicking a heading collapses the others (accordion, `JS:253-258`).
- **Content mismatch:** the files on disk (`ecoach/sites/default/files/session-N/`) belong to the **old** curriculum, but they are still served by serial:
  - session-3: Priorities worksheet_fillable.pdf, Priorities-Setting Activity.pdf, Problem-Solving Activity.pdf, Sexual Health Tracking.pdf, plus mobile JPGs
  - session-4: Assertive Communication Activity.pdf, Enthusiastic Consent Activity.pdf, Sexual Health Tracking.pdf
  - session-5: PrEP FAQs.pdf, Sexual Health Tracking.pdf
  - session-6: Cognitive Behavioral Triangle.pdf
  - session-7: Alcohol and Drugs Calendar.pdf, Sexual Health Tracking.pdf
  - session-8: Assertive Communication Activity.pdf, Problem-Solving Activity.pdf
  - session-1, 2, 9 and 10 are empty
  - So today, sessions 3-6 of the new trauma curriculum show these legacy worksheets. **Confirm with stakeholders** which worksheets belong to which new session. Make the mapping configurable (session → list of {title, pdfUrl, mobileImages[]}).

### 10.2 My Coach (`/coach-details`, `CI:11-16`, `get_coach_details` `ES.module:367-387`, TPL/coach-info)

If `field_coach` is set, the page shows "**My Coach's Profile**" in a well:
- the coach picture (image style `medium`; default `public://default.png`)
- **Name** (username)
- **Pronoun**
- a label "First Name:" that actually prints the **location** (label bug; show first name and location correctly)
- **About Me**
- **Zoom Link** (clickable, opens in a new tab)

Empty fields are hidden. If there is no coach: "No Coach Assigned to you."

### 10.3 my files: see §8.8. messages: see §8.9.

### 10.4 Launch Zoom

The Participant-menu item points at the placeholder `http://example.com`. `hook_url_outbound_alter` (`EU:139-154`) rewrites that URL at render time to the **assigned coach's `field_zoom_link`**, or `#` if the coach has none. For users without a coach, or non-participants, the href becomes empty. The rewrite should hide the item when no Zoom link exists.

---

## 11. Reports

### 11.1 Session Report (`admin/session-report`, `SD:2668-2826`)

- **Population:** all users with role `participant`, including blocked ones. No filters, no paging, no sort UI. Order is `user_load_multiple` order (uid).
- **HTML output:**
  - `<h1>Session Report</h1>`
  - an "Export CSV" link
  - a table with these columns:
    - **Name**: username, linked to `user/{uid}` in a new tab
    - **eCoach Account Created**: `users.created`, formatted `Y-m-d H:i:s T`
    - one column per session, titled "`{n}. {title}`"
  - **Session cell:**
    - The status text is one of "Not Started", "In Progress" or "Complete".
    - When the status is not "Not Started", the text links to `load-session/{n}-{uid}` in a new tab.
    - Below the status: `<small>` with the last-activity timestamp.
- **Status and timestamp logic:**

```
row = latest ecoach_session_data for (uid, sid=n) ORDER BY id DESC
status = row ? (row.complete == 1 ? 'Complete' : 'In Progress') : 'Not Started'
        // note: rows created only by drag-reorder count as 'In Progress'
last_activity = max(row.date, row.created, MAX(ecoach_session_log.created WHERE session_data_id=row.id))
```

- **CSV** (`admin/session-report/csv`):
  - Filename `Coach_SessionReport.csv`
  - Headers: `Content-Type: text/csv; charset=UTF-8`, `Cache-Control: private, no-store, max-age=0`
  - Columns: `Name`, `eCoach Account Created`, then for each session `"{n}. {title} - Status"`, `"{n}. {title} - Last Activity"`
  - Dates use `Y-m-d H:i:s T` in the site timezone. Written with PHP `fputcsv` (comma separator, `"` quoting).
- **Access:** administrator, coach, coordinator. The menu link "Session Report" (weight -41) is under the Management menu.

### 11.2 eCoach Standard Usage Report and login-session tracking (`UR`)

The module is **disabled** in the snapshot. The spec requires it.

- **Table `ecoach_usage_session`** (`UR.install`):
  - `id` serial
  - `uid` (unsigned int)
  - `login_date` (int)
  - `logout_date` (int, nullable)
  - `device_used` (text: raw User-Agent)
  - Indexes: `uid`, `login_date`, `open_session(uid, logout_date)`
- **Login hook** (`UR:46-58`): for accounts with role `participant` only, insert `{uid, login_date: now, device_used: HTTP_USER_AGENT or ''}`.
- **Logout hook** (`UR:63-83`): for participants, find the most recent row for the uid with `logout_date IS NULL` and set `logout_date = now`. Session expiry and browser close are never observed.
- **Report page** (`UR:88-111`):
  - Paragraph: "Sessions are recorded from the date this module was enabled. A duration of "Incomplete" means no logout event was observed."
  - An "Export CSV" link.
  - A table sorted by `login_date DESC`, 100 per page with pager. Empty text: "No participant sessions have been recorded."
- **Columns** (same for HTML and CSV; described as "matching the LP standard usage report"):
  1. **Participant SID**: `field_study_id` if non-empty, else the uid
  2. **Login Date and Time**: `m.d.Y H:i:s`
  3. **Type of Device Used**: User-Agent with newlines collapsed to spaces
  4. **Total Session Duration**: see below
- **Duration format:**

```
if logout empty or logout < login: 'Incomplete'
s = logout - login; h = s div 3600; m = (s mod 3600) div 60; s = s mod 60
parts = []; if h: parts += plural(h,'1 hour','@count hours')
if m: parts += plural(m,'1 minute','@count minutes')
if s or parts empty: parts += plural(s,'1 second','@count seconds')
return join(parts, ' ')        // e.g. "1 hour 5 seconds", "0 seconds"
```

- **CSV:** filename `eCoach_Standard_Usage_Report.csv`, UTF-8, `no-store`. Contains all rows (unpaged) in the same order.

### 11.3 Views

- `user_reference` (users base):
  - fields: name
  - filter: status = 1
  - contextual arg: `users_roles.rid` (fixed)
  - sort: created DESC
  - access: perm "access user profiles"
  - display `entityreference_1`: feeds the `field_coach` widget (arg 5 = coach) and the legacy `field_user` (arg 4 = participant).
- `temp` (base `ecoach_session_data`, page at `/temp`, access **none**):
  - table of user Name, Session (sid) and Complete, 10 per page
  - a debug view that exposes participant names and progress to **anyone, including anonymous users**. Do not port as-is. The Session Report replaces it.

---

## 12. Navigation, layout and UI notes

### 12.1 Menus (`menu_links`)

**Participant Menu (`menu-twm-menu`).** Rendered as a block in the **header** region of techstep_ecoach (and content region of newtheme/twm/bartik). Block visibility:
- roles: administrator, participant, coach, coordinator
- hidden on pages `sessions/*`, `user-details/*`, `user-notes/*`, `messages`

Drupal hides any item whose route the viewer cannot access. Items in weight order:

| Title | Path | Hidden? | Who effectively sees it |
|---|---|---|---|
| back to LinkPositively | `techstep` | no | tech-participant |
| Lessons | `<front>` | **hidden** | — |
| Dashboard | `dashboard` | no | coach, coordinator, admin |
| My Account | `user` | **hidden** | — |
| Coaching Plans | `user-dashboard` | no | participants |
| messages | `user-messages` | no | participant, coach |
| my files | `user-files` | no | participants |
| Launch Zoom | `http://example.com` (rewritten, §10.4) | no | everyone (only meaningful for participants) |
| Create Relation | `create-relationship` | no | coordinator |
| My Coach | `coach-details` | no | participants |
| Logout | `user/logout` | no | all |

**Main menu.** The bootstrap theme renders it as the top navbar, which coaches and coordinators see:
- Home (hidden)
- Dashboard (`dashboard`)
- My Account (`user`)
- Dashboard (`user-dashboard`, participants only)
- Lessons (hidden)
- Add Relation (`create-relationship`)
- LinkPositively (`techstep`)
- Logout

**Management menu:** "Session Report" (`admin/session-report`).

### 12.2 Participant theme `techstep_ecoach` ("TechStep")

- **Base theme:** bootstrap 3.3.7. `TH/techstep_ecoach.info` regions:
  - navigation, header ("Top Bar"), highlighted, help, content, slidecontent, slidercontent, notications, slidecheckin, Details, sidebar_first, sidebar_second, footer, page_top, page_bottom, thrive_tipmenu.
  - Blocks used: main content, the Participant Menu in `header`, and the user login in `sidebar_first` (anonymous only).
- **`page.tpl.php` overrides** (`TH/templates/page.tpl.php`). The header, on every page except `q=edit-profile-form-page`, is a fixed ("affix") navbar containing:
  - the logo (SVG sprite `svg-login-logo`, links home)
  - on the right: the notification bell (→ `/user-messages`, `active` class when unread), plus a hamburger / close toggle that collapses `#main-menu`
  - below: the `header` region (Participant Menu). `menu-tree.func.php` wraps menus in `.collapse.navbar-collapse#main-menu`, so the menu is a hamburger drop-down.
- **Body:**
  - optional sidebar_first (col-sm-4) + content section + optional sidebar_second
  - page title markup is commented out, so **pages show no H1**
  - messages, tabs, help and action links are shown
- **Footer:** rendered only if the footer region has blocks (it has none). It would also call a `uy_search_box` form from a disabled module.
- `page--front.tpl.php` is the same shell without messages. `page--ajax.tpl.php` is a bare content template.
- **`html.tpl.php`:**
  - adds apple-touch-icons (from twm_bootstrapless/images)
  - calls `message_links_click_count($_GET['sms'])` when `?sms=` is present. That function is not defined in ecoach, so the call fatals: an LP SMS-tracking leftover.
- **Look:**
  - fonts: Raleway (base), Rubik, Shrikhand (Google Fonts)
  - colors: brand-primary `#0a718a` (teal), brand-dark `#3B0030` (plum), brand-light `#A78BA3`, danger `#d73a31`, gray-base `#231f20`, text gray `#404040`, off-white `#f9f9f9`; accents in CSS include `#ff9800`, `#4CAF50`, `#00bcd4`, `#9C27B0`, `#C9B9C6`
  - icons: SVG sprites (`svg-notification-bell`, `svg-Hamburger-icon`, `svg-close-step`, `svg-next-step`, `svg-file-download`)
  - `customfunction.js` swaps file icons for `ecoach_sessions/images/download.svg`
- **Coach/coordinator UI:** the stock **bootstrap** theme (fluid container, default navbar with the Main menu, user login in sidebar_first). Module CSS `ecoach_sessions/css/resource.css` styles the dashboard:
  - side tabs
  - `.flex-container`
  - `.panel-group` dividers
  - `.form-border` section dividers inside session forms (the bordered blocks)
  - `.anchor-link` tabs

### 12.3 UX behaviours to keep

- Single-page coach dashboard: a participant list on the left, tabs on the right, content loaded without a page reload.
- After a save, the coach returns to the same participant and tab (deep link).
- Session status buttons are Start, Resume and Completed.
- Drag-and-drop session ordering applies to both coach and participant views.
- Accordion session list for the participant, with completion ticks.
- Mobile participants get worksheet images instead of PDF links.
- The unread-message bell.
- Status messages use Drupal-style flashes (text quoted in the sections above).

---

## 13. The seven root PDFs (`ecoach/*.pdf`)

These are static files at the docroot, so they are served at `https://{ecoach host}/{File}.pdf`.

**They are not linked from anywhere.** A search found no reference to their filenames in:
- the ecoach or LP code, templates or JS;
- the `peernav` or `linkpositively` databases (node bodies, blocks, menus, variables).

They are cleaned-up versions of the per-session worksheets (§10.1), probably meant for the new curriculum or linked from outside the sites (SMS or email). **Carry them over as static assets** (e.g. `/public/worksheets/`), and have stakeholders confirm which session each belongs to.

| File | Pages | Fillable fields | Content (site-authored) | Legacy per-session equivalent |
|---|---|---|---|---|
| AlcoholDrugsCalendar_fillable.pdf | 1 | 35 | "Alcohol and Drugs Calendar": Sunday-Saturday grid | session-7 "Alcohol and Drugs Calendar.pdf" |
| AskforConsent.pdf | 1 | 0 | "I Ask for Consent": what consent is, when and how to ask, what is not consent | session-4 "Enthusiastic Consent Activity.pdf" |
| AssertiveCommunicationTool.pdf | 1 | 0 | "Assertive Communication Tool": passive vs aggressive vs assertive communication traits | session-4 / session-8 "Assertive Communication Activity.pdf" |
| CognitiveBehavioralTriangle.pdf | 1 | 0 | "Cognitive Behavioral Triangle": Feelings / Behaviors / Thoughts | session-6 "Cognitive Behavioral Triangle.pdf" |
| PrEPFAQs.pdf | 3 | 0 | "PrEP FAQs": what PrEP is, efficacy, CDC/FDA guidance, etc. | session-5 "PrEP FAQs.pdf" |
| ProblemSolving_fillable.pdf | 1 | 7 | "Problem Solving Worksheet": The Problem, Possible Solutions, Evaluate Solutions, Try one and Evaluate, Before/After, next step | session-3 / session-8 "Problem-Solving Activity.pdf" |
| SexualHealthTracking_fillable.pdf | 1 | 80 | "Sexual Health Tracking Worksheet": columns Date, Sex?, Discuss HIV/STI Status with partner?, Condom Used?, On PrEP? | session-3/4/5/7 "Sexual Health Tracking.pdf" |

The live session forms mention these handouts by name only, with no links: "feelings wheel and feelings list", "self-monitoring form", "Cycle of Violence handout", "Power and Control wheel", "Personal Bill of Rights". There are **no PDFs for those** in the repo.

---

## 14. Dead code, legacy data and defects (do not port; migrate data carefully)

- **Backup files** in `ecoach_sessions/`: `session_details copy.inc`, `session_details-bak.inc`, `-kr.inc`, `-stage-back.inc`, `session_details.inc-bkp`, `ecoach_sessions.module-bkp`, `session_details.inc-txt-change.zip`. They contain the **previous 8-9 session sexual-health / Motivational Interviewing curriculum**:
  - titles: "First Contact", "Planning for My Plan", "You Getting to Know You", "Intimacy and Communication", "Getting PrEPared", "Keeping It Cool", "Alcohol and Drugs", "A Chance to Check in", "Dealing with Life Problems", "You Don't…"
  - with inline links to `/sites/default/files/session-N/pdf/*.pdf`
  - `session_details.inc-bkp` is the current curriculum minus the CSV export and the report timestamp columns.
  - **Legacy data:** 34 `ecoach_session_data` rows with sid 7-10, some session-data/log rows from 2019-2020, and 2 notes titled "7" refer to that old curriculum. Their `goals` keys do not match the current forms. Migrate them as read-only history. Do not show them as current sessions: the current code ignores sid > 6 everywhere except reorder.
- **Unused functions:**
  - `start_session`, `checkbox_submit`, `update_note`, `attachment_add_more_*` (`SD:541`, `345`, `331`, `2618-2634`)
  - `user_files()` / TPL/user-files
  - TPL/user-thread-messages, TPL/sessiontable, TPL/my-tracking (unregistered)
  - `ecoach_utility_profilepic` (`EU:90-119`, links to non-existent `user/view-profile/%`)
- **Unused content:** the `user_sessions` content type and nodes, and the `ecoach_session_data.goals` column.
- **Debug and test code:**
  - `test-lp` route
  - `ecoach_ajax` module
  - view `temp` (public data leak)
  - `watchdog` of coach name on every `get_coach_details` call
  - `console.log` in JS
- **Security defects to fix, not replicate:**
  1. `load/%/%` renders any form for any uid for any authenticated user.
  2. No coach-owns-participant check on any route.
  3. GET deletes without CSRF (`delete-thread`, `delete-message`).
  4. File Remove has no ownership check.
  5. Coaches hold `administer users` and `administer permissions`.
  6. `/temp` view has no access control.
  7. `/reorder` has no ownership check.
- **Functional defects to fix:**
  1. Messages are addressed to the sender (§8.9).
  2. Note author not recorded, and `field_session_ref` holds a log id.
  3. Session completion cannot be undone.
  4. Empty notes are created on every session save.
  5. The rescheduling-reason toggle never works.
  6. Session 5 `evoking_check5` and session 6 `evoking_text17` default-value bugs.
  7. Coach info shows location under the "First Name" label.
  8. "Time on Site" is never computed.
  9. The PrEP display uses an undefined variable.
  10. The Notes table renders an extra empty row.
  11. The Launch Zoom link breaks when there is no coach.
  12. The coordinator dashboard lists all users, not just participants.
  13. The admin dashboard is empty.
  14. The usage-report module is disabled.

---

## 15. Suggested MongoDB mapping (for the rewrite)

| Legacy | New collection / shape |
|---|---|
| users + fields + roles | `users` (shared with LP): `roles[]`, `peerNav: {coachId, pronoun, location, age, onPrep, studyId, participantCode, firstName, aboutMe, zoomLink, pictureUrl}` |
| `ecoach_session_data` | `peerNavSessions {participantId, serial (1-6), order, status: notStarted/inProgress/complete, startedAt, completedAt, createdBy, lastActivityAt}`, unique on (participantId, serial) |
| `ecoach_session_log.goals` | `peerNavSessionRevisions {sessionId, participantId, coachId, answers{}, createdAt}` (immutable) |
| `notes` nodes | `peerNavNotes {participantId, coachId, sessionSerial or null, text, methodOfContact: voice/voicemail/sms/email, createdAt}` |
| managed files `user_attachments` | `peerNavFiles {participantId, uploadedBy, filename, mime, size, storageKey, createdAt}`, private storage |
| privatemsg | `messages` / `threads` (participant ↔ assigned coach) |
| `ecoach_usage_session` | `peerNavLoginSessions {userId, loginAt, logoutAt, userAgent}` |
| `ECOACH_SESSIONS` + `sessionN()` forms + worksheet folders | versioned config/seed `peerNavCurriculum [{serial, title, description, sections[...], worksheets[...]}]` |
