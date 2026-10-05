# 03 — Community (Wall), Profiles, Notifications, Search & Glossary

Status: legacy spec for the rewrite. It describes what the two Drupal 7 sites do today, defects included. Once the Drupal code is deleted, this document is the reference.

Scope: the social/community layer of **Link Positively** (`lp/`, DB `linkpositively`): the Wall (posts, comments, reactions, hashtags, mentions, abuse reports, link previews), in-app notifications, user profiles (avatars, badges, "About Me", password), the search box, the glossary, and the disabled "calendar" and "journey" modules. It also records the state of the same modules on **Peer Navigation** (`ecoach/`, DB `peernav`). None of them are active there (§1).

Related documents: `05-peer-navigation-ecoach.md` (PN site), `06-reports-views-theme.md` (views, reports, theme shell). Gamification (points, levels, achievements), Thrive Tips, trackers/check-ins, SMS reminders and resources are referenced here only where they touch the community features. Their own specs cover them.

No participant data appears below. Every number is an aggregate from the July 2026 DB snapshot. Every string quoted is site-authored UI text or configuration.

---

## 0. Source abbreviations used in citations

All paths are relative to the repo root. `M/` = `lp/sites/all/modules/`, `T/` = `lp/sites/all/themes/twm_bootstrapless/`.

| Abbrev | Path |
|---|---|
| `DW.module` / `DW.page` / `DW.global` / `DW.single` / `DW.install` | `M/drupal_wall/drupal_wall.{module,page.inc,global.inc,single.inc,install}` |
| `DW.js` | `M/drupal_wall/js/drupal_wall.js` (the second, larger JS file) |
| `DW.rootjs` | `M/drupal_wall/drupal_wall.js` |
| `DW/tpl/x` | `M/drupal_wall/x.tpl.php` (module defaults, **overridden by the theme**, see §5.1) |
| `TPL/posts` | `T/templates/drupal_wall_posts.tpl.php` (the live wall-card template) |
| `TPL/comment` | `T/templates/drupal_wall_comment.tpl.php` (live AJAX "new comment" template) |
| `TPL/post-reactions` / `TPL/tip-reactions` | `T/templates/post-reactions.tpl.php`, `T/templates/tip-reactions.tpl.php` |
| `TPL/node-wall` | `T/templates/node--drupal-wall.tpl.php` |
| `TPL/page` / `TPL/front` | `T/templates/page.tpl.php`, `T/templates/page--front.tpl.php` |
| `TPL/sw-fields` / `TPL/sw-page1` / `TPL/st-fields` | `T/templates/views/views-view-fields--search-wall.tpl.php`, `.../views-view--search-wall--page-1.tpl.php`, `.../views-view-fields--search-thrive.tpl.php` |
| `CF.js` | `T/js/customfunction.js` |
| `CSS` | `T/css/style.css` |
| `PE` / `PE.tpl` | `M/youthrive_post_edit_form/youthrive_post_edit_form.module`, `.../templates/youthrive_post_edit_form.tpl.php` |
| `CE` | `M/youthrive_comment_edit_form/youthrive_comment_edit_form.module` |
| `GEN` / `GEN.install` | `M/twm_general/twm_general.{module,install}` |
| `UTIL` | `M/twm_utility/twm_utility.module` |
| `CN` / `CN.install` / `CN.tpl` / `CN.js` | `M/twm_comment_notification/twm_comment_notification.{module,install}`, `.../templates/twm_comment_notification.tpl.php`, `.../js/modal.js` |
| `MEN` | `M/mentions/mentions.module` |
| `TAGS` | `M/youthrive_tags/youthrive_tags.module` |
| `FA` | `M/flag_abuse/flag_abuse.module` |
| `OG` / `OG.tpl` | `M/opengraph_filter/opengraph_filter.module`, `.../theme/opengraph-filter.tpl.php` |
| `US` / `US.box` / `US.res` | `M/uy_search/uy_search.module`, `uy-search-block.tpl.php`, `uy-search-results.tpl.php` |
| `YP` / `YP/tpl/x` | `M/youthrive_profile/youthrive_profile.module`, `M/youthrive_profile/theme/x.tpl.php` |
| `UPE` | `M/youthrive_user_profile_edit/youthrive_user_profile_edit.module` |
| `AS` | `M/avatar_selection/avatar_selection.module` |
| `AB` | `M/twm_achievement_bins/twm_achievement_bins.module` |
| `TT` / `TTB` | `M/twm_tailored_tips/twm_tailored_tips.module`, `.../includes/block/twm_tailored_tips.block_default.inc` |
| `GM` | `M/youthrive_game_mechanics/youthrive_game_mechanics.module` |
| `CAL` / `CAL.tpl` | `M/youthrive_calendar/youthrive_calendar.module`, `.../templates/calendar.tpl.php` |
| `JRN` | `M/youthrive_journey_efm/` (features-only module) |
| `DB:table` | a row/config in the live `linkpositively` DB (queried, not in code) |

---

## 1. Module status (the `system` table)

`status=1` means enabled. `schema_version=-1` means never installed.

| Module | LP (`linkpositively`) | PN (`peernav`) | Purpose |
|---|---|---|---|
| `drupal_wall` (7.x-2.7, heavily customised) | **enabled** (7100) | disabled, never installed | Wall posts/comments |
| `drupal_wall_efm` (feature) | **enabled** | disabled, never installed | Wall config: fields, variables, text format, image styles |
| `youthrive_wall_reactions_efm` (feature) | **enabled** | not present | 14 reaction flags + permissions |
| `youthrive_post_edit_form` | **enabled** | not present | `post/%/edit` form |
| `youthrive_comment_edit_form` | **enabled** | not present | `commentedit/%/%` form |
| `youthrive_tags` (fork of `hashtags`) | **enabled** (7002) | not present | `#hashtags` |
| `twm_comment_notification` | **enabled** | not present | In-app notification centre + bell |
| `mentions` (contrib) | **enabled** (7100) | not present | `@user.` mentions |
| `flag` 7.x-3 | **enabled** (7306) | disabled, never installed | Reactions, abuse flags, favourites |
| `flag_abuse` | **enabled** | disabled, never installed | Abuse/whitelist flags |
| `fivestar`, `votingapi` | **enabled** | not present | Only used by the Resources rating field (0 votes stored). Not used by the wall |
| `comments_visibility` | **enabled** | disabled, never installed | Hides comment settings on the Thrive Tip node form |
| `uy_search` | **enabled** | disabled, never installed | Global search box + AJAX results |
| `youthrive_search_efm` (feature) | **enabled** | not present | Code default of the `search_wall` view (DB copy overrides it) |
| `twm_glossary` (feature) | **enabled** | not present | Glossary vocabulary + view |
| `youthrive_profile` | **enabled** | not present | `/my-profile`, avatars, badges, other-user profile block |
| `youthrive_user_profile_edit` | **enabled** | not present | `/edit-profile-form-page` (set password) |
| `twm_user_profile_sidebar_block` (feature) | **enabled** | disabled, never installed | Block placement for the generic profile block, `my_profile` view, `tech_support` type |
| `avatar_selection` | **enabled** (7004) | not present | Avatar image library |
| `profile2`, `profile2_page` | **enabled** | disabled, never installed | `main` profile type (About Me/Age/Pronoun) |
| `account_profile` | **enabled** | not present | Embeds profile2 `main` into the core account edit form |
| `quicktabs` | **enabled** | not present | One instance (`test_carousel`), not placed anywhere (§12) |
| `video_embed_field` | **enabled** | disabled, never installed | Thrive Tips/basic page video field only (wall videos are a plain text field) |
| `opengraph_filter` | **enabled** | not present | Link preview cards in text |
| `extlink` | **enabled** | not present | External-link target/class |
| `youthrive_calendar` | **disabled** (-1, never installed) | not present | Med/mood calendar (superseded by `techstep_tracking`) |
| `youthrive_journey_efm` | **disabled** (-1, never installed) | not present | "My Journey" goal content types (content exists in DB anyway) |
| `search` (core) | enabled | enabled | Core search is only reachable by admins (§10.6) |
| `comment` (core) | enabled | enabled | — |
| `privatemsg`, `notes`, `ecoach_profile`, `feature_profile` | not present | enabled | PN-only features. See doc 05 |

**Peer Navigation conclusion:** PN ships copies of `drupal_wall`, `drupal_wall_efm`, `flag`, `flag_abuse`, `profile2`, `uy_search`, `video_embed_field`, `comments_visibility` and `twm_user_profile_sidebar_block`. None was ever installed (no `flag*` tables exist in `peernav`), so **PN has no wall, reactions, mentions, hashtags, glossary or community search**. The PN copies differ from LP only in (a) `drupal_wall_user_view()` being commented out, (b) the post form's "post background" radio being active (it is commented out in LP, see §5.4.1), (c) some `t()` wrapping, and (d) the `uy_search` placeholder `"Search Tips "` instead of `"Search For ..."`. The rewrite needs nothing from them for PN.

---

## 2. Roles and permissions that matter here (LP)

Roles (`DB:role`): `anonymous user`(1), `authenticated user`(2), `administrator`(3), `Research Administrator User`(4), `Coordinator User`(5), `control`(6), `participant`(7), gamification roles `level-2`(15), `level-2-1`(9), `level-3`(18), `level-3-1`(21), `level-4`(22), `level-5`(23), `level-5-1`(17), `level-6`(24), `level-6-1`(25), `level-7`(14), plus `coach`(19) and `ecoach-user`(20).

| Permission | Granted to (live `role_permission`) | Effect |
|---|---|---|
| `access global drupal wall content` | authenticated, administrator, Research Admin | View `/drupal-wall` (home) and `/wall-post/{nid}` |
| `create post on drupal wall` | administrator, Coordinator, participant | See the new-post form and the comment form. **Research Admin and control users can read but not post or comment** |
| `create drupal_wall content` | administrator, Coordinator, participant | Core node create (not used by the custom form) |
| `edit own drupal_wall content` | administrator, Coordinator, participant | Shows the post "edit" pencil for own posts. Also (mis)used as the gate for the comment edit pencil |
| `edit any drupal_wall content` | administrator, Coordinator | Edit pencil on everyone's posts and comments |
| `delete own drupal_wall content` | administrator, Coordinator, participant | Delete own post |
| `delete any drupal_wall content` | administrator, Coordinator | Delete any post |
| `post comments`, `skip comment approval`, `edit own comments` | administrator, Coordinator, participant | Core. Custom forms bypass them |
| `access comments` | administrator, Coordinator, participant | Core |
| `flag <reaction>` (14 reaction flags) | authenticated, administrator, Research Admin, Coordinator, participant | React |
| `unflag <reaction>` | administrator, Coordinator, participant (thumbs_up also authenticated) | Remove a reaction |
| `flag abuse_node`, `flag abuse_comment` | administrator, Coordinator, participant | Report ("Inappropriate") |
| `unflag abuse_node`, `unflag abuse_comment` | administrator, Coordinator | **Participants cannot retract a report** |
| `flag/unflag abuse_whitelist_node` | administrator, Research Admin, Coordinator | Whitelist a post |
| `flag/unflag abuse_whitelist_comment` | administrator, Coordinator | Whitelist a comment |
| `flag abuse_user` | administrator, Coordinator | Report a user (no UI on the site) |
| `flag favourites` / `unflag favourites` | administrator, Coordinator, participant | Star a Thrive Tip (shown on tip cards inside the wall) |
| `use text format limited_html_for_wall_posting` | authenticated, administrator, Coordinator, participant, level-2-1, level-7, level-2 | Mentions autocomplete access + format |
| `access_twm_comment_notification` | authenticated, participant | `/all-comments`, `/notifications-data` |
| `access_uy_profile` | authenticated, administrator | `/my-profile`, `/my-profilepic` |
| `access_youthrive_user_profile_edit` | authenticated, administrator | `/edit-profile-form-page` |
| `access user profiles` | administrator, Research Admin, Coordinator, participant | `/user/{uid}` of other users |
| `view any main profile` / `view own main profile` / `edit own main profile` | administrator, Coordinator, participant | profile2 `main` |
| `access avatars` | administrator, Research Admin, Coordinator, participant | avatar_selection |
| `upload avatar in profile` | administrator, Coordinator | Core avatar upload on account form (participants use the custom uploader instead) |
| `search content` | administrator only | Core search. Also gates the `uy_search` **block** (§10.6) |
| `access content` | anonymous, authenticated, admin, Research Admin, Coordinator, participant | Gates `/search/uy-tags/%`, `/load-node/%`, `/user/view-profile/%`, `/user/edit-my-profile`, glossary view |
| `access_youthrive_calendar` | nobody (module disabled) | — |

---

## 3. Legacy data model (what is stored where)

### 3.1 Wall post = node type `drupal_wall`

Created by `drupal_wall_install()` (`DW.install:11-67`). Node options: published only, no preview, "submitted by" hidden. Comments open (`comment_drupal_wall = 2`), threaded mode on but unused, 10 per page, comment form below, preview optional, **no subject field** (`DB:variable comment_*_drupal_wall`).

| Field | Type | Meaning |
|---|---|---|
| `title` | varchar | First 50 chars (word-safe, with "…") of the HTML-entity-encoded text, or the literal `post` when the text is empty (`DW.page:283-285`). Special value `tip-notification` for auto-posts (§5.11). **A title that starts with `!` marks a content-warning post** (the `cw` report view filters on it) |
| `body` (`text_with_summary`, label "What's on your mind?") | text | The post text. Stored **raw** (entity-encoded by `entities()` in `UTIL:278`, no filtering on save), format `limited_html_for_wall_posting` (`DW.page:286-292`). Filtered on output (§5.3) |
| `field_drupal_wall_photos` (image, 1) | fid | Photo. Files go to `public://drupal_wall/`, extensions `gif png jpg jpeg` |
| `field_drupal_wall_videos` (text, 1) | string | YouTube **embed** URL: `{http|https}://www.youtube.com/embed/<id-and-rest>` (§5.4.3) |
| `field_drupal_wall_image_style` (text, allowed `_none`) | string | Legacy, unused by the live template |
| `field_youthrive_tags` (term ref → vocab `youthrive_tags`, unlimited) | tids | Hashtags extracted from the body **and from the post's comments** (§5.13) |
| `field_post_bg` (text) | string | Name of a CSS class applied to the post body row (the chosen background image's filename without extension). Only settable from the edit form in LP (§5.5) |
| `field_comment_id` (integer) | cid | Only on `tip-notification` posts: the Thrive-Tip comment they mirror |

Live volume: 94 `drupal_wall` nodes, 15 with a photo, 0 with a video, 4 content-warning posts, 0 `tip-notification` posts, 40 comments on wall posts.

### 3.2 Wall comment = core `comment` on `drupal_wall` (bundle `comment_node_drupal_wall`)

| Field | Notes |
|---|---|
| `subject` | First 49 chars (word-safe) of the text, `?` replaced by `.`, or the literal `comment` (`DW.page:492-499`) |
| `comment_body` (text_long, required in field config but not enforced by the custom form) | Tag-stripped, trimmed, entity-encoded text, format `filtered_html` (`DW.page:489-515`) |
| `field_comment_image` (image) | `public://drupal_wall/comment_images/` |
| `field_comment_videos` (text) | YouTube embed URL, same conversion as posts |
| `pid` | Always `0`. **There are no replies/threads** anywhere in the UI |
| `status` | Always published (`COMMENT_PUBLISHED`) |

Thrive-Tip comments (`comment_node_thrive_tips`) have only `comment_body`. They belong to the Thrive Tips spec, but they can surface on the wall as `tip-notification` posts (§5.11).

### 3.3 Flags (`DB:flag`, `flag_types`)

`flagging` is Flag's own per-user store. The site **additionally** keeps its own table `uy_wallflag_count` (§3.4), and **all reaction counts and "my reaction" states are read from that table, not from Flag**.

| fid | name | entity | bundles | Title | Role in UI |
|---|---|---|---|---|---|
| 15 | `haha_node_reaction` | node | drupal_wall | Haha Node Reaction | Reaction "haha" on post |
| 17 | `love_node_reaction` | node | drupal_wall | Love Node Reactions | Reaction "love" on post |
| 37 | `thumbs_up_node_reaction` | node | drupal_wall | Thumbs up Node Reaction | Reaction "thumbs up" on post |
| 23 | `fire_node_reactions` | node | drupal_wall | Fire Node Reactions | Reaction "100" (the icon is `hundred-color.svg`) on post |
| 27 | `target_node_reactions` | node | drupal_wall | Target Node Reactions | Reaction "target" (icon `flagnode-color.svg`) on post |
| 29 | `thought_node_reactions` | node | drupal_wall | Thought Node Reactions | Defined. **Rendering commented out** |
| 25 | `super_node_reaction` | node | drupal_wall | Super Node Reaction | Defined. **Rendering commented out** |
| 14 / 16 / 36 / 22 / 26 | `haha_comment_reaction` / `love_comment_reaction` / `thumbs_up_comment_reaction` / `fire_comment_reactions` / `target_comment_reaction` | comment | comment_node_drupal_wall, comment_node_thrive_tips | … Comment Reaction(s) | The same 5 reactions on comments |
| 28 / 24 | `thought_comment_reactions` / `super_comment_reactions` | comment | same | — | Defined. Rendering commented out |
| 30–35 | `angry_*`, `sad_*`, `wow_*` | node/comment | none | — | Legacy. No bundles, never shown |
| 1 | `abuse_node` | node | drupal_wall | Node Abuse | "Inappropriate" on posts. `flag_short` "Flag as objectionable", `unflag_short` "Flag as non-offensive", `unflag_denied_text` "Flagged Message", `access_author: others` (cannot report own) |
| 3 | `abuse_comment` | comment | drupal_wall + thrive_tips comments | Comment Abuse | "Inappropriate" on comments. "Flag as objectionable" / "Un-flag", `access_author: comment_others` |
| 11 | `abuse_whitelist_node` | node | drupal_wall | Node Whitelist | Moderator: "Whitelist this content." / "Un-whitelist this content." |
| 4 | `abuse_whitelist_comment` | comment | both | Comment Whitelist | Moderator: "Un-flag" / "Flag as objectionable" (labels are inverted in config) |
| 5 | `abuse_user` | user | — | User Abuse | confirm-type "Report User". No UI |
| 7 / 8 | `up_voting`, `up_voting_comments` | node/comment | none | Up Voting | Configured as variables `drupal_wall_likes_node/_comment`, but no bundles, so the old "Up Vote" link never renders |
| 10 | `favourites` | node | thrive_tips | Favourites | Star on Thrive Tip cards inside the wall |
| 9, 38, 39 | tailored tips / resources flags | — | — | — | Out of scope |

All flags are non-global (per user), link type `toggle`. The variables mapping semantic names to flags are set by `youthrive_wall_reactions_efm` strongarm and `drupal_wall_efm`: `drupal_wall_{thumbs_up,smiley(=haha),love,fire,target,thought,super}_{node,comment}`, `drupal_wall_likes_node1 = abuse_node`, `drupal_wall_likes_comment1 = abuse_comment` (`DB:variable`).

### 3.4 Custom tables

| Table | Schema (source) | Written by | Read by |
|---|---|---|---|
| `uy_wallflag_count` | `id` serial, `fid`, `entity_type`, `entity_id`, `uid`, `count` (always 1), `created` (`GEN.install:34-81`) | `twm_general_flag_flag` inserts **one row for every flag action of any flag** (including abuse and favourites). Unflag deletes the row for all flags except `favourites`/`resource` (`GEN:5-103`) | Reaction counts (`flag_count`), "my reaction" highlight (`flag_class`, `flag_records`), notifications "X reacted…", SMS "most-liked post", reports |
| `uy_user_notifications` | `id`, `uid`, `nid`, `cid`, `category`, `action`, `author_uid`, `created` (`CN.install:5-59`) | `/notifications-data` when the user deletes a notification | Filters dismissed notifications (§6.4). It is a **dismissal log**, not a notification store |
| `mentions` | `mid`, `entity_type`, `entity_id`, `uid` (mentioned user), `auid` (author), `created`, `changed` | `mentions_entity_insert/update` (`MEN:151-247`) | Notifications "tagged you", view `user_mentions_drupal_wall`. **0 rows live** |
| `youthrive_tags_index` | `tid`, `entity_id`, `type`, `comment_id` (NULL = tag from the post body) | youthrive_tags hooks (`TAGS:99-340`) | Tag sync. 149 rows |
| `reminder_checkin` | `id`, `uid`, `meds` (1/0), `moods` (1–7), `checkin`, `created` (day timestamp) | `techstep_tracking` check-in form | Disabled calendar (§8), check-in report |
| `avatar_selection`, `avatar_selection_roles` | `aid`, `avatar` (filename), `fid`, `name`, `weight`; `aid`→`rid` | Admin | Avatar/badge packs (§7.4) |

### 3.5 User-entity fields used by this area (`user` bundle)

| Field | Stored as | Used for |
|---|---|---|
| `picture` (core) | fid | Avatar chosen from the library (a copy in `public://pictures/picture-{uid}-{ts}.{ext}`) |
| `field_user_picture` (text) | **fid as text** | A custom photo the user uploaded. Takes precedence over `picture` |
| `field_avatar` (text) | fid of the library avatar | Remembers which library avatar is selected (pre-checks the radio) |
| `field_sticker` (text) | comma-separated library fids | Selected badges |
| `field_bg_image` (image) | fid | Profile header background (no live UI sets it, §7.10) |
| `field_theme` (list: theme-1..4, default theme-1) | key | Colour theme. Output as a `<body>` class (`UTIL:227`). Unlocked at level 6 (gamification spec) |
| `field_wall_visit` (text) | unix ts | Last visit to the wall, for "Your Wall \| N New" (§6.5) |
| `field_intervention_start_date` | datetime | "Days in study", used to interleave tips (§5.2.2) and in time-on-site notifications |
| `field_first_name`, `field_user_pronoun`, `field_location`, `field_coach`, `field_zoom_link`, `field_number`, `field_study_id` | — | Not shown by the community UI (see §7.6 for the core user page) |

profile2 type `main` ("Profile", `data: registration=1, use_one_page=1, use_page=1`), 63 profiles live: `field_about_me` (text_with_summary, plain textarea, description "Please tell us about yourself."), `field_age` (text), `field_pronoun` (text).

### 3.6 Text formats (`DB:filter`, in execution order)

- `limited_html_for_wall_posting` (all wall **post bodies** are saved with it): `filter_mentions` → `filter_html` allowing only `<a><p><br><b><dd><span>` → `filter_url` (link text trimmed to **24** chars) → `filter_autop` → `opengraph_filter` (max **1** preview) → `filter_htmlcorrector` → `filter_youthrive_tags`.
- `filtered_html` (wall **comments** are saved with it): `filter_url`(72) + `filter_mentions` + `opengraph_filter`(1) → `filter_html` (`<a> <em> <strong> <cite> <blockquote> <code> <ul> <ol> <li> <dl> <dt> <dd>`) → autop → htmlcorrector → `filter_youthrive_tags`.
- The live templates **render comments with `limited_html_for_wall_posting` too** (`TPL/posts:546-562`), whatever the stored format.

### 3.7 Image styles

`profile_img` (adaptive image, breakpoints 1382/992/768/480), `twm` (auto-rotate + adaptive, used for wall photos), `profileicon` (scale 45×45), `thumbnail` (200×200 upscale, upload previews), `medium` (core, comment photos). GIFs are output unstyled so they stay animated (`TPL/posts:354-362`).

### 3.8 Wall configuration variables (`DB:variable`)

`drupal_wall_wall_post_limit=5`, `drupal_wall_global_post_limit=5`, `drupal_wall_older_post_button=1`, `drupal_wall_delete_post_button=1`, `drupal_wall_edit_post_button=1`, `drupal_wall_show_comments=1`, `drupal_wall_comment_post_textbox=1`, `drupal_wall_post_type_photo=1`, `drupal_wall_post_type_video=1`, `drupal_wall_likes_post=1`, `drupal_wall_textbox_type=text_format`, `drupal_wall_content_type=0` (only `drupal_wall` nodes), `drupal_wall_what_is_on_your_mind_string_post_box` = `drupal_wall_what_is_on_mind_string_user_page_title` = `"What's on your mind ?"`. The admin form `admin/config/user-interface/drupal_wall` ("Drupal Wall Box Settings", `administer site configuration`, `DW.admin.inc`) edits these. It is not needed in the rewrite beyond making the values constants/config.

Transient state is also kept in **site-wide** variables: `drupal_wall_user_id`, `drupal_wall_wall_post_offset`, `drupal_wall_global_post_offset`, `drupal_wall_photo_status`, `comment_image_fid`, `bell_notifications`, `user_last_access_time{uid}`. See §14 (these are bugs).

---

## 4. Route inventory

| Path | Callback / source | Access | Status / notes |
|---|---|---|---|
| `/` = `/drupal-wall` (`site_frontpage=drupal-wall`) | `drupal_get_form('drupal_wall_form')`, an **empty form** (`DW.module:52-64,80-82`). The content comes from blocks (§5.1) | `access global drupal wall content` | Home page, "Home / Your Wall". Rendered with `TPL/front` |
| `/wall-post/{nid}` | `_drupal_wall_get_single_wall_post` (`DW.module:65-74`, `DW.single:8-83`) | `access global drupal wall content` | Single post with all its comments. Target of notifications. Returns nothing if the nid is not a published `drupal_wall` |
| `/node/{nid}` (drupal_wall) | core node view with `TPL/node-wall` | core `access content` + node access | Alternative post page (up to 100 comments, `comment_get_thread`) |
| `/post/{nid}/edit` | `youthrive_post_edit_form_form` (`PE:2-13`) | **`access callback TRUE`**. The form is empty if the user lacks `create post on drupal wall` (`PE:18`). **No ownership check** | Post edit |
| `/node/{nid}/edit` | core node form. `twm_general` hides the title for participants (`GEN:144-164`), `drupal_wall_form_drupal_wall_node_form_alter` hides empty media fields (`DW.module:175-199`) | core `edit own/any drupal_wall content` | Reachable, not linked |
| `/commentedit/{cid}/{uid}` | `_drupal_wall_edit_comment_post_form` (`CE:2-13`) | **`access callback TRUE`**. The form is empty without `create post on drupal wall`. **No ownership check** | Comment edit |
| `system/ajax` (Drupal AJAX) | new comment, delete post, delete comment, "Show older posts" | as the forms | — |
| `/flag/{flag|unflag}/{flag_name}/{id}?token=` | Flag module | `flag X`/`unflag X` | Reactions and reports |
| `/all-comments` | `all_comment_notificatons` → `get_comment_notification('ALL')` (`CN:6-11,80-82`) | `access_twm_comment_notification` | Notification centre "Your Notifications \| N New" |
| `/notifications-data` (POST) | `notifications_data_callback` (`CN:12-43`) | `access_twm_comment_notification` | Dismiss one notification. Prints `success`/`fail` |
| `/my-profile` | `uy_profile_page` → forms `home_page_profile` + `home_page_profile_password` (`YP:7-11,159-171`) | `access_uy_profile` | Own profile |
| `/my-profilepic` | `uy_profilepic_page` → `home_page_profile_photo` (`YP:12-16,172-184`) | `access_uy_profile` | Standalone photo uploader (not linked) |
| `/user/view-profile/{uid}` | `twm_utility_view_profile` (`UTIL:31-37,48-55`) | `access content` | Redirects to `/my-profile` if it is you, else to `/user/{uid}`. **All name/avatar links use this URL** |
| `/user/{uid}` | core user page + `drupal_wall_user_view` + blocks | `access user profiles` | Other user's profile + their wall posts (§7.6) |
| `/user/edit-my-profile` | redirects to `/user/{me}/edit` (`UTIL:24-30,42-45`) | `access content` | Core account form with profile2 embedded (`account_profile`) |
| `/edit-profile-form-page` | `youthrive_user_profile_edit_form` (`UPE:5-16`) | `access_youthrive_user_profile_edit` | "Set your password" page (§7.9) |
| `/admin/config/system/levels-description` | `youthrive_profile_config` (`YP:17-23,40-155`) | `administer site configuration` | Level names/descriptions (gamification) |
| `/mentions/autocomplete/{format}/{string}` | `mentions_autocomplete` (`MEN:36-42,343-395`) | `use text format {format}` + format has mentions filter | JSON: up to 5 usernames starting with the string |
| `/all/mentions` | view `user_mentions_drupal_wall` page_1 | role authenticated | "Tagged by …" list (menu tab). Not linked. The block footer links to `/all-tags`, which does not exist |
| `/search/uy-tags/{term}` | `uy_search_results` → view `search_wall:wall_search` as JSON (`US:12-17,31-36`) | `access content` (**includes anonymous**) | Legacy. The mention/hashtag URL prefix check still references it |
| `/load-node/{nid}` | `get_json_node` → `{data: rendered node}` (`US:18-23,133-141`) | `access content` (**anonymous too, no node_access check**) | Legacy "view post" expander in search |
| `/views/ajax` (POST `view_name=search_wall`, `view_display_id=page_1`) | Views AJAX | view access = `access content` | **The live search endpoint** (§10) |
| `/search-wall/{x}`, `/search-wall-all/{x}`, `/wall-thrive/{x}`, `/search-thrive/{x}`, `/search-thrive-all/{x}` | view pages | `access content` | Page variants of the search views (not linked) |
| `/yt-glossary` | view `twm_glossary1` page | `access content` | Glossary (§11). Its menu link is **hidden** |
| `/admin/abuse-node` ("Wall Post Abuse"), `/admin/abuse-comment` ("Comment Abuse") | views `all_flag_abuse_node`, `all_flag_abuse_comment` | roles administrator, Coordinator User | Moderation queues (§5.9) |
| `/admin/content/flags/abuse_user` | flag_abuse default view | admin | Reported users (never used) |
| `/hash-tags` | view `hash_tags` (vocab `hashtags`, empty) | `access content` | Dead |
| `/reaction-count`, `/all-thrive-comments`, `/all-resource-comments` | report views | staff roles | See doc 06 |
| `/calendar`, `/reload-calendar` | `CAL:6-19` | `access_youthrive_calendar` | **Module disabled.** `/calendar` is now served by `techstep_tracking` |
| `/twm-glossary` (feature menu link) | none | — | Dead link in the feature export. The real path is `/yt-glossary` |

---

## 5. The Wall

### 5.1 Page composition (home = `/drupal-wall`, template `TPL/front`)

The theme overrides both module templates. Drupal maps `drupal_wall_posts.tpl.php` in the theme onto hook `drupal_wall_posts`, which is why `DW/tpl/drupal_wall.tpl.php` is dead. The live layout, top to bottom:

1. **Header** (`TPL/front:77-112`): LP logo + "LinkPositively" (links home), a **bell icon** linking to `/all-comments` (gets class `active` when there are unseen notifications, §6.5), and the hamburger (`menu-twm-menu`). The front page template has **no search box**. It only appears in the collapsed nav of other pages (`TPL/page:104-114`).
2. **New notifications strip** (`TPL/front:128-204`): every notification newer than `bell_notifications` is rendered as a card (§6.3), followed by Drupal status messages.
3. **Title bar** (`TPL/front:239-248`): `Your Wall | {N} New`, where N = wall posts by *other* users created since your last wall visit (§6.5).
4. `page['content']`: the (empty) `drupal_wall_form`, plus blocks in region `content` on `<front>`. `drupal_wall_view` is placed there but renders nothing on the front page, because it bails when `arg(0)=='drupal-wall'` (`DW.module:122`). `techstep_tracking` (check-in) also renders here.
5. A two-slide Swiper (`TPL/front:251-260`):
   - Slide 1 (`slidecontent`): block `drupal_wall:custom_drupal_wall` = **new-post form** (`DW.module:168-171`, `DW/tpl/user_wall_post.tpl.php`, only if logged in with `create post on drupal wall`), then block `drupal_wall:home_page_drupal_wall` = **the global feed** (`_drupal_wall_global()`, `DW.global:13-44`).
   - Slide 2 (`slidercontent`): profile blocks (`twm_achievement_bins:uy_home_profile`, which is not defined any more and renders empty, then `twm_generic_profile`, restricted to other-user/`my-profile` pages).
6. `sidebar_second` (on `<front>`): Thrive-Tips views blocks + `twm_comment_notification:twm_comment_notification`. **That delta no longer exists** (the module defines only `twm_comment_notification_desktop`), so nothing renders.

Every render of the feed template also **prints today's Thrive Tip block first**: `select_wall_thrive_tips_block_display()` (`TPL/posts:22`, `TTB:115-124`) embeds view `today_thrive_tips` display `today_wall_tips_cycle_1` (days ≤ 90) or `_cycle_2`. It is printed again on every "Show older posts" chunk, on `/wall-post/{nid}`, and on user profile walls. Thrive Tips spec.

Empty state: `No wall status avaliable !` (sic) in `span.status_msg` (`DW.global:39`). The per-user wall says `No wall status available !` (`DW.module:132,153,479`).

### 5.2 Feed query, ordering, pagination

#### 5.2.1 Global feed (home)

```
function globalFeedPage(offset):              // DW.global:51-301
  posts = SELECT n.nid,uid,created,comment,title,type, body, photo_fid, image_style, video, post_bg
          FROM node n LEFT JOIN body/photo/style/video/post_bg
          WHERE n.status=1 AND n.type='drupal_wall'
          ORDER BY n.created DESC LIMIT 5 OFFSET offset       // limit = drupal_wall_global_post_limit
  comments = SELECT nid,cid,name,uid,subject,created,comment_body,image_fid,video
             FROM comment WHERE status=1           // ALL published comments site-wide, no ORDER BY
  for p in posts: p.comments = [c for c in comments if c.nid == p.nid]   // insertion (≈cid) order
  offset += 5                                     // stored in a SITE-WIDE variable
  tips = thriveTipsForWindow(posts)               // §5.2.2
  items = sort(tips ∪ posts, by created DESC)
  return items or NULL
```

- **All published wall posts from every user are shown to every viewer.** There is no friend/follow/privacy concept, no role filter, and no hiding of reported content (§5.12).
- Sorting: newest first by `node.created`. Editing a post does not bump it.
- **Pagination**: a "Show older posts" button (`btn-primary center-block`, `DW.global:313-331`) appends the next 5 via AJAX into `#drupal_wall_append_older_wall_post_global`. When a page comes back empty it appends `<p style="color:red; margin:25px;">No more older wall post exists !</p>` once and then stops (`DW.global:336-349`). The offset is reset to 0 on every full page load (`DW.global:17`). Because it is a global variable, concurrent users corrupt each other's paging (§14).

#### 5.2.2 Thrive Tips interleaved into the feed (`DW.global:52-285`)

Tips already "delivered" to the viewer are inserted between posts at the date they became available:

```
days  = user_days_since_created()   // 1 + ceil((today 00:00 − intervention_start_date)/86400), TT:353-368
first = posts[0].created (newest), last = posts[-1].created (oldest)
dFirst = |date(first) − date(user.created)| in days     // NB: users.created, not intervention date
dLast  = |date(last)  − date(user.created)| in days
if dFirst == 0 and dLast == 0:          tips = []       // table1 is queried but never assigned (bug)
elif dFirst <= 90 and dLast <= 90:      tips = thrive_tips WHERE field_display_day BETWEEN min(dLast,dFirst) AND max(...)
elif dFirst >= 90 and dLast >= 90:      tips = thrive_tips WHERE field_display_day_two BETWEEN min−90 AND max−90
else:                                   tips = thrive_tips WHERE field_display_day <= days
  (each: status=1, ORDER BY created DESC LIMIT 10)
for t in tips:
  d = t.display_day − 1  (cycle-2 tips wrongly get 89 for every tip, bug)
  t.created = user.created + d days
  keep t only if  last.created <= t.created <= (offset==5 ? now : first.created)
```

A tip card in the feed (`TPL/posts:31-71`) shows the ★ `favourites` flag link, the tip title (`h6`), `field_html_content`, and its `field_thrive_tags` as `.user-hash-tags` labels. Clicking a label goes to `/thrive-tips/tags/{term}` (`CF.js:111-115`). Tip cards have no reactions or comments on the wall.

#### 5.2.3 Per-user wall (`/user/{uid}`)

`drupal_wall_user_view()` (`DW.module:453-494`) runs on the full view of any user account. If you view your own account it shows the new-post form titled "What's on your mind ?". It then shows that user's own posts (`n.uid = uid`, same query shape, limit `drupal_wall_wall_post_limit`=5, `DW.module:245-343`) with a "Show older posts" button (`DW.module:204-238`) and the same empty messages. Normal users never see their own account page, because `/user/view-profile/{me}` redirects to `/my-profile`.

### 5.3 Post card rendering (`TPL/posts:72-449`)

Layout: a `panel` with a left column (avatar via `twm_utility_profilepic(poster,'profile_img')`, linking to `/user/view-profile/{uid}`) and a right column:

1. **Action row** (`TPL/posts:200-246`):
   - Edit pencil (`svg-icon-edit`) linking to `/post/{nid}/edit?destination={current path}`, if the user has `edit any drupal_wall content`, or `edit own` and is the author.
   - Delete button "Delete" (AJAX), if the user has `delete any`, or `delete own` and is the author (§5.6).
   - **Otherwise** (the viewer cannot delete the post) an "Inappropriate" button wrapping the `abuse_node` flag link (§5.9). It shows only for logged-in users, on `drupal_wall` posts, when the flag exists.
2. **Name + date** (`TPL/posts:250-256`): the username (`users.name`) linking to `/user/view-profile/{uid}`, and the date `m/d/y`. There is no "time ago" on the live template.
3. **Body** (`TPL/posts:259-337`, pseudo-code):
   ```
   html = body_value (raw stored text)
   hrefs = all <a href> in html
   if hrefs non-empty:                        // text contains links (mentions, hashtags, or URLs)
     for each href:
       if href's directory == http://{host}/search/uy-tags/ or http://{host}/user/view-profile/:
          print once: check_markup(html with all bare URLs and '...' removed, limited_html)
       if href ends with gif|jpg|jpeg|png|bmp:
          print once: html with URLs removed (unfiltered!)
          print <img src=href class="img-responsive row">
       // any other link: nothing is printed for it
   else:
     out = check_markup(html, limited_html)   // mentions, url, opengraph, hashtags filters run here
     if out matches /!(.*?)!/ and group1 is non-empty and does not start with a space:
        // CONTENT WARNING
        out = <div class='new'>{group1}</div>
            + <span class='full-text collapse' id='demo-{nid}'><span class='tip-node'>{out without the !…! part}</span></span>
            + <div class='tip-node enable-disable' data-toggle='collapse' data-target='#demo-{nid}'><a class='link'>Read more ➜</a></div>
     print out
   ```
   The stored body normally contains no `<a>` (users type plain text; links are produced by output filters), so the `else` branch is the normal path. Posts whose raw text contains an `<a>` to some other site display **no text at all** (bug, §14).
4. **Photo** (`TPL/posts:339-370`): GIF files use `theme('image')` (animated), others use style `twm`, class `img-responsive`. If the post has a content warning the photo row starts collapsed (`collapse` + `enable-{nid}`) and is revealed with the text.
5. **Video** (`TPL/posts:373-397`): extracts the 11-char id from path segment 4 of the stored embed URL and renders `<iframe width=445 height=250 src="https://www.youtube-nocookie.com/embed/{id}" allowfullscreen>` (with `?origin={base_url}` when the id segment contains `list`). The fallback text is "Your browser does not support iframes.". It is collapsed under a CW like photos.
6. `field_post_bg` value is output as a CSS class on the body row (`TPL/posts:193`).
7. **Reactions bar** (§5.8), then two buttons (`TPL/posts:415-434`):
   - `Add A Comment` (toggles to `Cancel Comment`, shows the comment form, `CF.js:915-930`).
   - `Show Comments` / `Hide Comments` (toggles `.comments-container.hide`, `CF.js:625-640`), or `No Comments Yet` (class `no-comments`) when the post has no comments.
8. **Comments list** (`TPL/posts:451-661`), hidden by default, **all** comments, oldest first (§5.7).
9. **Comment form** (`TPL/posts:675-686`), hidden by default. Shown only if logged in, comments are open (`node.comment==2`), and the user has `create post on drupal wall`.

The body output filters (format `limited_html_for_wall_posting`) turn: `@username.` into a mention link (§5.14), bare URLs into links whose text is truncated to 24 chars, the **first** URL into an OpenGraph preview card appended after the text (§5.15), and `#tag` into a clickable hashtag chip (§5.13). Allowed HTML is `<a><p><br><b><dd><span>` only.

### 5.4 Creating a post (form `_drupal_wall_content_post_form`, `DW.page:11-198`)

Shown only with `create post on drupal wall` (`DW.page:13`, `DW/tpl/user_wall_post.tpl.php:29`).

#### 5.4.1 Fields and UI

| Element | Type | Details |
|---|---|---|
| Profile picture | markup | Current user's avatar (style `medium`, links `/user/view-profile/{uid}`), left column (`DW.page:18-49`) |
| Title strip | markup | `New Post` (`.trackertitle`) |
| `drupal_wall_status` | `text_format` (format selector hidden by JS/CSS), 2 rows, not resizable | Placeholder `What's on your mind ?`. On focus it grows to 178px (`DW.js:50-56`). Mentions autocomplete attached (§5.14) |
| `drupal_wall_photo_status` | managed_file, `public://drupal_wall/`, ext `gif png jpg jpeg`, `accept=image/*` | Hidden until the **Image** button (`#postimage`, label for the file input) is clicked. It auto-uploads on change (`DW.rootjs:84-100`) and shows a `thumbnail` preview with a remove "×" (`delete-icon`) (`DW.module:398-409`, `DW.page:200-212`) |
| `drupal_wall_video_status` | textfield `#wall-video` | Placeholder `Add a video's web address here`. Revealed by the **Video** button (`#postvideo`, `DW.js:62-69`) |
| **CW** button (`#content-warning`) | markup | Clicking it inserts `!CW GOES HERE!\n` into the textarea and selects `CW GOES HERE` so the user types the warning (`DW.page:161-167`, `DW.js:15-21`) |
| Reset | button | Clears the form (`svg-close-step` icon, hidden initially) |
| **Post** | submit (`btn-primary post_btn`) | Full-page POST (not AJAX) |
| `post_bg` radios | — | **Commented out in LP** (`DW.page:66-77`). Active on the PN copy. See §5.5 |

#### 5.4.2 Validation (`DW.page:217-234`)

- If text, photo and video are all empty, it shows a **warning** `You must not have much on your mind...`. It does not block the submit, but the submit handler then saves nothing.
- If a video URL is given and does not match `/(youtube.com|youtu.be)\/(watch)?(\?v=)?(\S+)?/`, it raises the error `Sorry ! Only Youtube video are allowed to shared, Please enter valid video URL`.

#### 5.4.3 Save (`DW.page:239-347`)

```
text = values.drupal_wall_status.value
if text != '' or photo or video:
  text = entities(text)                     // every non-ASCII char → &#NNN; / htmlentities (UTIL:278+)
  node = new drupal_wall(uid = me)
  node.title = truncate_utf8(text or 'post', 50, wordsafe, ellipsis)
  node.body = {value: text, format: 'limited_html_for_wall_posting'}   // no sanitising on save
  if photo: file.status = PERMANENT; file_usage_add; if uri contains 'drupal_wall': node.photo = fid
            else error 'Failed to write the uploaded file in "sites/default/" file folder. Please provide write permission to this directory'
  if video matches regex: node.video = (https? 'https://' : 'http://') + 'www.youtube.com/embed/' + match[4]
            // match[4] is everything after "watch?v=" or "youtu.be/", so extra query params (&t=…) are kept
  save → message 'Success! Your post has been saved.'
```

Side effects on insert:
- `youthrive_tags` extracts hashtags (§5.13).
- `mentions` records `@user.` mentions (§5.14).
- `youthrive_game_mechanics_node_insert` gives the author **+10 points** in category `topic` (`GM:204-213`, gamification spec).
- No notification is sent to anyone. New posts only raise the "Your Wall | N New" counter for others (§6.5).

### 5.5 Editing a post (`/post/{nid}/edit`, `PE`)

Entry: the pencil icon on the card (§5.3). The page (`PE.tpl`) shows:

- **Avatar**: `user.picture` of the *editor*. It ignores `field_user_picture`.
- **Background picker** `post_bg`: radios of the avatar-library images attached to role `level-4` (first 12). Class `lock` unless the editor has role `level-4`, but it is not enforced server-side (`PE:32-41,124-140`). Default = the image whose filename (without extension) equals the current `field_post_bg`.
- **Name** `<h3>`: the *editor's* username.
- **Text**: textarea (text_format) pre-filled with the body after stripping OpenGraph/description markup, CRs/newlines and all tags (`PE:42-110,155-163`). For bodies containing mention/hashtag links it rebuilds the text via `make_hash_link()` (`DW.page:348-367`).
- **Photo**: managed_file pre-filled with the current fid. Remove button `svg-btn-icon-plus`.
- **Video**: textfield pre-filled with `https://www.youtube.com/watch?v={id}`. Placeholder `https://www.youtube.com/watch?v=vw-G-adwRNU`, description `Please enter a youtube video URL.`.
- **Cancel** ✕ (links to `/drupal-wall`) and **Save** (`svg-next-step` submit).

Validation: the same YouTube regex and error as create (`PE:239-252`).

Save (`PE:257-384`):
```
node.body = check_markup(text, limited_html)      // NB: stores FILTERED HTML (create stores raw)
node.title = truncate(text or 'post', 50)
if photo fid != 0: make permanent, set field (node_save)
else: delete the file whose fid is in the SITE-WIDE variable drupal_wall_photo_status, clear field
if video: convert to embed URL as on create;  else: clear the video field
if post_bg chosen: field_post_bg = chosen image filename without extension
node_save → 'Success! Your post has been saved.' → redirect to ?destination
```

Rules: the UI offers edit to the author (with `edit own drupal_wall content`) and to admin/Coordinator (`edit any`). **The server does not check either.** Any user with `create post on drupal wall` who knows a nid can edit any post (§14). `created` is unchanged. There is no "edited" marker.

### 5.6 Deleting a post

- Button "Delete" (`comment-close btn-class btn-primary … delete-icon`) rendered by `_drupal_wall_delete_edit_node_form` (`DW.page:567-617`) when the delete button is enabled and the viewer passes the permission test in §5.3.
- AJAX (`DW.page:622-634`): it re-checks `delete any drupal_wall content`, or `delete own` + author, then `node_delete(nid)`. The card is replaced by an empty string (it disappears). **No confirmation dialog.**
- Cascade: core deletes the node's comments. Flag deletes `flagging` rows. `youthrive_tags` cleans its index. **`uy_wallflag_count` rows are not deleted** (orphans remain in reaction/notification queries).

### 5.7 Comments

#### 5.7.1 Display (`TPL/posts:451-661`, AJAX-appended items via `TPL/comment`)

Each comment, in DB order (no ORDER BY, effectively oldest first):
- Left: commenter avatar (`profile_img`). Right: edit pencil (link `/commentedit/{cid}/{uid}`) if the viewer has `edit any drupal_wall content`, or `edit own drupal_wall content` and is the commenter. Then the Delete button (§5.7.4), name linking to `/user/view-profile/{uid}`, and date `m/d/y`.
- Text:
  ```
  urls = all http(s):// URLs in the text, concatenated
  if the concatenated string ends in an image extension: print text-without-URLs (filtered) + <img class="img-responsive post-thumbnail" src=url>
  else print check_markup(text, limited_html_for_wall_posting)
  ```
- Comment photo: style `medium` (`img-responsive post-thumbnail`).
- Comment video: `<iframe width=150 height=100 src={stored embed url}>`.
- Reactions: the same 5 reactions (§5.8), disabled on your own comment.
- "Inappropriate" (`abuse_comment` flag link) on the right (`TPL/posts:637-647`), shown to everyone, including the author. Flag's `access_author=comment_others` then refuses the author.
- Empty state: the "No Comments Yet" button label.

#### 5.7.2 Adding a comment (`_drupal_wall_comment_post_form`, `DW.page:371-480`)

Form (one per post card): the commenter avatar, a `text_format` textarea (3 rows, placeholder ` Add a comment...`), an **Image** button (hidden managed_file `comment_image_{N}`, `public://drupal_wall/comment_images/`, `gif png jpg jpeg`), a **Video** button (reveals a textfield, placeholder `http://www.youtube.com/watch?v=vw-G-adwRNU`, description `Please enter a youtube video URL.`), **Post** (AJAX), and a hidden ✕ reset.

Save (AJAX, `DW.page:485-562`):
```
text = trim(strip_tags(value))
if text or video or image:
  text = entities(text)
  comment = {nid, pid:0, uid:me, status:published, subject: truncate(text or 'comment', 49) with '?'→'.',
             body:{value:text, format:'filtered_html'}}
  if image: attach file
  if video matches YouTube regex: field_comment_videos = embed URL (invalid URLs are silently dropped, no error)
  comment_save → append TPL/comment HTML to #div_append_next_user_comment_{nid}; clear textareas; hide the input row
  on failure: '<span style="color:red">Not able to save comment</span>'
// if everything is empty: nothing happens
```
After posting, JS resets the button to "Add A Comment" and the toggle to "Show Comments" (`CF.js:932-940`, `DW.rootjs:53-77`). Side effects: `youthrive_tags` (hashtags in comments attach to the parent post), mentions, and **+10 points to the commenter and +10 to the post author** (`GM:161-200`, gamification spec). There is **no notification push**. The post author sees it in their notification list (§6.2).

#### 5.7.3 Editing a comment (`/commentedit/{cid}/{uid}`, `CE:18-307`)

The form is pre-filled (text, image, video as `watch?v=` URL), with buttons `post` and `Cancel`. It saves via AJAX. Problems:
- It sets **`comment.uid = editor` and `comment.created = now`** (`CE:192,195`). An admin editing a comment takes over its authorship and the comment jumps in time.
- There is no ownership check (§14).
- The image delete uses the site-wide variable `comment_image_fid`.

Rewrite: keep author and created. Add `updatedAt`.

#### 5.7.4 Deleting a comment

The button is rendered (`DW.page:647-685`) if (viewer = comment author **and** the delete button is enabled) **or** the viewer has role `administrator` or `Coordinator User` (`DW.page:654`). The AJAX handler (`DW.page:698-705`) calls `comment_delete(cid)` **without any permission check** and removes the comment element. No confirmation. After a delete, JS re-labels empty lists "No Comments Yet" (`CF.js:866-877`).

#### 5.7.5 Replies

None. `pid` is always 0. The threaded comment setting is unused.

### 5.8 Reactions

**Types shown** (post and comment), in display order (`TPL/post-reactions:43-49`, `TPL/posts:626-630`):

| Order | Semantic | Node flag (fid) | Comment flag (fid) | Icon (`T/images/`) |
|---|---|---|---|---|
| 1 | Haha | `haha_node_reaction` (15) | `haha_comment_reaction` (14) | `haha-color.svg` |
| 2 | Love | `love_node_reaction` (17) | `love_comment_reaction` (16) | `love-color.svg` (comments: `love.svg`/`love.png`) |
| 3 | Thumbs up | `thumbs_up_node_reaction` (37) | `thumbs_up_comment_reaction` (36) | `thumbs_up-color.svg` |
| 4 | "100" (named *fire*) | `fire_node_reactions` (23) | `fire_comment_reactions` (22) | `hundred-color.svg` |
| 5 | Target (named *target*) | `target_node_reactions` (27) | `target_comment_reaction` (26) | `flagnode-color.svg` |
| — | Thought, Super | 29, 25 | 28, 24 | `thought-color.svg`, `super-color.svg`. **Hidden** (commented out) |

The report view `reaction_count` labels them "Heart", "Smile", "Thumbs Up", "100", "Pride" (doc 06). The icons carry no visible text (link text is made transparent by CSS, `CSS:17363-17640`).

**Rules**
- **One reaction per user per entity.** Server side, `twm_general_flag_flag` (`GEN:5-59`) runs on every flag except `favourites`: it deletes the user's other 6 reaction flaggings on that entity (from `flagging` and `uy_wallflag_count`), then inserts a `uy_wallflag_count` row. Client side, `DW.js:146-193` moves the highlight and adjusts the counters optimistically (−1 on the previously selected, +1 on the clicked). It blocks clicks for 2 s.
- **Side effect bug:** reporting a post (`abuse_node`) also runs this code, so **reporting wipes your reaction** on that post and adds a `uy_wallflag_count` row for the abuse flag.
- **No reacting to your own post/comment:** the bar gets class `wall-reaction-disable` (opacity .5, `pointer-events:none`, `CSS:27854-27857`) when the viewer is the author (`TPL/post-reactions:14-19`, `TPL/posts:583-588`). It is UI-only. Flag's `access_author` is empty for reactions, so the server allows it.
- Reactions render only for logged-in users on `drupal_wall` posts (`TPL/post-reactions:12-13`).
- **Counts**: `flag_count(fid, entity_id)` = `SUM(count)` from `uy_wallflag_count` (`GEN:107-115`), shown next to each icon (`span.count`, empty when 0). The viewer's own choice gets `opacity-true` (the others `opacity-false`) via `flag_class()` (`DW.module:522-530`). When any is selected the bar gets `.selected`, else `.notSelected`.
- **Un-react**: clicking the active icon toggles it off (Flag toggle link; `unflag` permission needed. Research Admins can react but not un-react except thumbs-up).
- Points: the first reaction a user gives to an entity gives the giver +1 `upvote-given` and the author +1 `upvote-earned` (cached per pair, so it is never repeated) (`GM:217-252`).
- Notification: the entity author sees "X reacted to your post/comment." with the reaction icon (§6.2).
- Reactions on **`tip-notification` posts** attach to the mirrored Thrive-Tip **comment** (`TPL/tip-reactions`, bundle check `comment_node_thrive_tips`).

### 5.9 Abuse reporting & moderation

**Reporting** (any user with `flag abuse_*`, i.e. participant, Coordinator, admin):
- Posts: the "Inappropriate" button (`inappropriatebtn`) shows on posts the viewer cannot delete, so never on their own posts for participants. It is the `abuse_node` toggle link. After flagging it shows `unflag_denied_text` **"Flagged Message"**, because participants lack `unflag abuse_node` (`DB:flag` options, `TPL/posts:215-240`).
- Comments: the `abuse_comment` link in the comment footer (styled with `flag.svg`, hover `postIcon-flag.svg`, `CSS:15571-15600`). The author cannot flag their own comment (`comment_others`).
- **Nothing happens to the content automatically.** No hiding, no threshold, no email, no notification to anyone. Reported posts stay visible to everyone.
- **Whitelist**: if an entity carries `abuse_whitelist_{node|comment}` (count = 1), any new abuse flag attempt resets all abuse flags on it and is denied (`FA:94-105`).

**Moderation queues** (roles administrator + Coordinator User, menu `menu-flagged-messages`, the Tasks/Index tabs are removed by `GEN:169-177`):
- `/admin/abuse-node` "Wall Post Abuse" (view `all_flag_abuse_node`): table of published nodes that have an `abuse_node` flagging. Columns: *Report by* (flagger username), title, *Author*, body, *Actions* = edit | delete | the abuse flag link (unflag = clear report) | *Whitelist* toggle. Empty text: `No content has been reported.`
- `/admin/abuse-comment` "Comment Abuse" (view `all_flag_abuse_comment`): published comments with an `abuse_comment` flagging, newest report first, 25 per page. Columns: report time, *Reported by*, node title, comment author, comment body, *Delete* link, whitelist flag link. Empty text: `No comments have been reported...`
- Moderator actions are therefore: delete the content, clear the report (unflag), or whitelist it.

Live data: 1 `abuse_node` flagging, 0 `abuse_comment`.

### 5.10 Visibility rules (summary)

| What | Who sees it |
|---|---|
| Global feed, single post, all comments | Every authenticated user with `access global drupal wall content` (authenticated, so this includes `control` and Research Admin). Anonymous: no |
| Another user's posts on `/user/{uid}` | Anyone with `access user profiles` |
| New-post form, comment form | `create post on drupal wall` (participant, Coordinator, admin) |
| Edit/Delete/Inappropriate controls | §5.3, §5.7 |
| Reported content | Still visible to all until a moderator deletes it |
| Deleted content | Hard-deleted. No soft delete |

### 5.11 Tip-notification posts (Thrive-Tip comment mirrored to the wall)

When a user comments on a Thrive Tip through the tips comment form, `share_tip_comment()` (`TT:286,303-322`) creates a `drupal_wall` node owned by the commenter with `title='tip-notification'`, `body=<comment text>` (no format) and `field_comment_id=<cid>`. On the wall it renders (`TPL/posts:90-114,409-411`) as:
- a header block with the tip's ★ favourites link, date `m/d/y`, **"{username}! commented on a thrive tip."**, the tip title in bold, and a link **"See Full Thrive Tip >>"** to `/comment-tip/{tip nid}`;
- below it, the normal post card (the body = comment text) with **reactions bound to the tip comment** (`TPL/tip-reactions`).

The code is live, but there are 0 such posts in the snapshot. Keep the behaviour, because it is what makes tip discussions appear on the wall.

### 5.12 Single post page and node page

- `/wall-post/{nid}` renders the same card template (with comments) for one published `drupal_wall` node. It is the target of every notification "Read More".
- `/node/{nid}` (`TPL/node-wall`) is an older layout: the same reactions, up to 100 comments via `comment_get_thread`. The comment body is printed **unfiltered** (`TPL/node-wall:328`, XSS). Search result links point here (`/node/{nid}`). The rewrite should route everything to one post page.

### 5.13 Hashtags (`youthrive_tags`, vocabulary `youthrive_tags` vid 6, 48 terms)

- Enabled for content type `drupal_wall` only (`youthrive_tags_content_types`). Tracked text = post body + the post's comment bodies.
- **Parsing** (`TAGS:713-757`): `/[\s>]+?#([[:alpha:]][[:alnum:]_]*[^<\s[:punct:]])/iu` applied to `'<htest>'.text.'<htest>'`. A tag starts with a letter and continues with letters/digits/underscores. It needs a whitespace or `>` before `#`, must not end in punctuation, and is **lower-cased**. Duplicates are removed. Minimum length 2.
- **Storage** (`TAGS:99-340`): for each new tag, find or create a term in vocab 6, then add an index row `(tid, entity_id, 'node', comment_id|NULL)`. Tags removed from the text are un-indexed, and a term is deleted when nothing else uses it. `field_youthrive_tags` on the post is re-synced from the index, so a tag used in a comment also appears on the post.
- **Rendering** (`TAGS:683-708,1141-1159`): only tags that exist as terms are converted. `#tag` becomes `<div class='user-hash-tags' id='{tag}'>#tag</div>`. Clicking it goes to `/thrive-tips/tags/{tag}`, the **Thrive Tips tag page** (`CF.js:111-115`), not a wall search. The legacy in-page search of a hashtag is commented out (`CF.js:403-406`).

### 5.14 Mentions (`mentions` module)

Config (`DB:variable mentions`): input prefix `@`, **suffix `.`**, source `property:name` (username). Output `@{name}.` linking to `user/view-profile/{uid}`. Autocomplete is on (`mentions_autocomplete=1`, library `sites/all/libraries/textcomplete`).

- **Typing** (`M/mentions/js/mentions.textcomplete.js`): on any `text_format` textarea whose selected format has the mentions filter, typing `@abc` calls `/mentions/autocomplete/{format}/{abc}` and suggests up to **5** usernames that start with `abc` (all users, any role, active or blocked). Choosing one inserts `@username. `.
- **Detection** (`MEN:270-341`): regex `/\B(@|@)(\#?.*?)(\.|\.)/` resolves `@name.` by exact username (`@#123.` would mean uid 123). Mentions are recorded on insert/update of any entity whose text field format has the filter: posts (limited_html) and comments (filtered_html) (`MEN:151-247`). Each row is `(entity_type, entity_id, uid=mentioned, auid=author, created)`, deduplicated per entity. On update, mentions no longer in the text are deleted.
- **Rendering**: `@{name}.` becomes a link with class `mentions mentions-{uid}` (`MEN:416-440`).
- **Notification**: "{author} tagged you in a post." or "…in a comment." (§6.2).
- Live: 0 rows. Mentions exist in code but went unused.
- The username suffix `.` means names that contain `.` break. The rewrite may use `@username` with an explicit picker.

### 5.15 Link previews & external links

- `opengraph_filter` (`OG:224-352`): after the other filters it scans the text (outside `a|script|style|code|pre`) for http(s) URLs and, for the **first** one (`opengraph_filter_num=1`), fetches the page. It skips URLs on the site's own base URL. It uses UA `Drupal OpenGraph Filter (+http://drupal.org/)`. It parses `og:*`/meta tags and caches both HTML and tags for **1 hour** in `cache_opengraph_filter` (`OG:14-175`). It appends a card (`OG.tpl`): optional image (left), title (link), description (link). Nothing is appended when neither title nor description was found.
- `extlink`: external links get class `ext` and `target="_blank"`, subdomains count as internal, `mailto` links get class `mailto`, no alert (`DB:variable extlink_*`).
- `filter_url` shortens displayed URLs to 24 chars (posts) / 72 (comments).

---

## 6. Notifications (in-app only)

**There are no email notifications for any community event.** A grep for `drupal_mail` shows mail only for resources and registration. There are no push notifications. The only outbound channel near this area is the weekly SMS reminders (`youthrive_sms_reminders`, separate spec). Weeks 5 and 21 of those SMS texts invite posting on the wall (`WEEK-5`: "Hey! Post on the LinkPositively wall and tell us: Whats the 411? <link>"; `WEEK-21`: "Hey, it's LinkPositively Let everyone know how you're doing by posting on the wall! <link>"). `get_highest_post_likes()` computes the most-reacted post of a week, but its result is never used.

Notifications are **computed on every page request** from source tables (`get_comment_notification`, `CN:87-363`), minus the ones the user dismissed.

### 6.1 Entry points

- The bell icon in the header (all non-admin pages) links to `/all-comments`.
- `/all-comments`: title bar "Your Notifications | {bell_count} New" (`TPL/page:169-178`) + the full list (`CN.tpl`).
- The home page shows the **new** ones (created after `bell_notifications`) above the wall (`TPL/front:128-204`).

### 6.2 Sources and exact text templates

`{user}` = the actor's username. Ordering: all items merged and sorted by timestamp, newest first (`uy_date_compare`).

| Source (query) | Condition | Text | Excerpt shown | "Read More" goes to |
|---|---|---|---|---|
| Comments on **your** wall posts (`CN:108` 2nd UNION) | comment on a `drupal_wall` node you own, by someone else | `{user} made a comment on your post.` | the comment text, 97 chars | `/wall-post/{nid}#cid_{cid}`, or `/node/{nid}#cid_…` for thrive tips, `/location/{nid}#cid_…` for resources |
| Comments on posts **you commented on** (`CN:108` 1st UNION) | node where you have a published comment, comment by someone else, newer than your latest comment | `{user} also made a comment on {post author link}'s post.` | comment text, 97 chars | as above |
| Reactions to your post (`CN:110`) | `uy_wallflag_count` row for one of the 14 reaction flags on a node you own (`drupal_wall`) | `{user} reacted to your post.` + the reaction icon (`post_flags`, non-clickable) | post body (tags stripped), 97 chars | `/wall-post/{nid}` |
| Reactions to your comment | same, on a comment id you authored | `{user} reacted to your comment.` + icon | comment text, 97 chars | `/wall-post/{nid}#cid_{cid}` |
| Mention in a post (`CN:90-106`) | `mentions.uid = you` | `{author} tagged you in a post.` | post body, 97 chars | `/wall-post/{nid}` |
| Mention in a comment | | `{author} tagged you in a comment.` | parent post body, 97 chars | `/wall-post/{nid}#cid_{cid}` |
| Welcome (`CN:368-374`) | always (dated at the intervention start date) | `Welcome to LinkPositively (LP). We're glad you're a part of the LP community` | — | no Read More |
| Time on site (`CN:575-630`) | weeks since intervention start ≥ 3, 6, 9, 12, 15, 18, 21, 23, 24 | `Hello {name}. You have been on the LinkPositively site for 3 weeks. You have 21 weeks remaining!` / `…6 weeks. You have 8 weeks remaining!` (sic) / `…9 weeks. You have 15 weeks remaining!` / `…12 weeks. You have 12 weeks remaining!` / `…15 weeks. You have 9 weeks remaining!` / `…18 weeks. You have 6 weeks remaining!` / `…21 weeks. YOU HAVE 3 WEEKS REMAINING! Time to start wrapping things up!` / `…23 weeks. YOU HAVE 1 WEEK REMAINING! Time to start saying goodbye!` / `…24 weeks. Your time in the study is now at a close. Time to get in that final post!` | — | none |
| Level (`CN:379-444`, from `achievement_unlocks` ids `level-1`…`level-8`) | per unlocked level: a "current level" message (for level 1 only this one) plus a "Congratulations…" message (timestamp −1 s) | Level 1: `You are currently at Level 1. At Level 2 you will unlock new options for customizing your profile! To earn points you can: complete your profile, post/comment on the Wall, read Tips, complete your daily check-ins`. Levels 2–8: see the verbatim strings in `CN:399-440` (e.g. level 4 congrats: `Congratulations, you have leveled up to Level 4 and unlocked new wall features to use when posting!`). Gamification spec | — | none |
| Tracker reminder (`CN:282-309`) | a `ts_tracking` row with flag=1, reminders=1, and daily (or weekly on today's weekday), after the reminder hour in the user's timezone | `Hello {name}. Have you filled out your check in yet? Click here` | — | `/tracking` |
| Main check-in reminder (`CN:310-330`) | a `reminder_checkin_time` row with reminders=1 (daily/weekly), after the hour | `Hello {name}. Have you filled out your main check in yet? Click here` | — | `/my-tracking` |
| Midpoint survey (`uy_midpoint_notification`, `CN:637-663`) | **never called** (dead) | `Hello {name}, your midpoint survey is ready! This will only take 5-10 minutes to complete.` etc. | — | opens `midpoint_url?ID={study_id}` |

Legacy dismissal rows also exist for actions `checkin*`, `journey*`, `midpoint1-3`, `liked-*`, `week*`. Older code generated those, and `CN.js:25-46` still handles `checkin`/`journey`/`midpoint` clicks.

Each notification id is encoded `"{nid}:{cid}:{category}:{action}:{actor uid}"`, where `action` includes the timestamp, e.g. `made-comment-{created}`, `also-made-comment-…`, `post-liked-…`, `comment-liked-…`, `post-tagged-…`, `comment-tagged-…`, `welcome-1`, `timeonsite-week{3..20}`, `level-{n}`, `level-{n}c`, `tracker-1`, `tracker-2`.

### 6.3 Card UI (`CN.tpl`, `TPL/front:158-198`)

The LP logo (50px), heading **"In App Message"**, the message text, an optional excerpt, a **"Delete"** button (top-right) and a **"Read More"** button (`arrow-icon`). Read More is hidden for `timeonsite`, `welcome` and `level` actions. On `/all-comments` the excerpt is shown. If it contains `!…!` it gets the same content-warning collapse with "Read more ➜". If the post has a photo, the photo is shown too (collapsed under a CW). A reaction notification shows the reaction's icon.

### 6.4 Dismiss ("Delete")

Clicking Delete hides the card immediately (`CN.js:97-102`) and POSTs `{uid,pid,cid,category,action,author}` to `/notifications-data` (`CN.js:67-96`), which inserts a row into `uy_user_notifications` unless an identical one exists (`CN:18-43,523-570`). Tracker reminders are always inserted, and they are hidden **only for the same calendar day** (`CN:476-481`), so they come back the next day. Everything else stays hidden forever. The endpoint trusts the posted `uid` (a user can write dismissals for another uid, §14).

### 6.5 Counters ("new")

- **Bell/"N New" on `/all-comments`**: count of notifications with timestamp > `bell_notifications`. Visiting `/all-comments` sets `bell_notifications = now` (`CN:677-698`). **That variable is global to the whole site** (should be per user). On other pages the bell gets class `active` when any notification is newer than it, and the home page lists those notifications (`CN:699-727`).
- **"Your Wall | N New"** (`CN:729-744,747-762`): N = count of `drupal_wall` nodes by other users with `last_visit < created <= now`, where last_visit = `user.field_wall_visit`, or `users.access` if empty. Every render of `/drupal-wall` then sets `field_wall_visit = now` (`user_save` on each home page view).

---

## 7. Profiles

### 7.1 Picture resolution (used everywhere: `twm_utility_profilepic`, `UTIL:65-97`)

```
if user.field_user_picture (fid as text) → file uri          // custom uploaded photo
elif user.picture                         → core picture uri  // copy of the chosen library avatar
else                                       → variable user_picture_default = public://avatar_selection/default.png
render with the requested image style, wrapped in a link to /user/view-profile/{uid}
```
(`drupal_wall` also has `_drupal_wall_user_profile_picture()`, whose fallback is `M/drupal_wall/images/picture-default.png`. It is only used in dead templates.)

### 7.2 Own profile page `/my-profile` (`YP:159-171`, form `home_page_profile` `YP:777-1214`, template `YP/tpl/home-page-profile-block`)

Layout:
1. Title bar **"Your Profile | Edit"**. The **Edit** link (`#profileedit`) switches to edit mode (JS), where **Done** (link to `/my-profile`) appears. The photo "Done" submit is also there (`home-page-profile-block:18-28`).
2. **Profile head** (coloured panel; `field_bg_image` as background if set):
   - Left: the **username** (h2). In edit mode it is replaced by "Change Your Avatar & Badges". Right: **"Level {n}"** (from `uy_user_level()`, gamification).
   - The avatar (style `profile_img`). In edit mode: a **"Select"** button opens the Avatars modal (`#changeavatars`), and an **"Upload"** button opens the custom photo uploader (§7.5).
   - A level badge overlay image `M/youthrive_profile/images/badge-level-{7|8}.png` for roles `level-7`/`level-8` (hidden by default CSS).
   - **About Me** text (paragraph).
   - **Badges**: for each selected sticker, its name (filename without extension, `_`/`-` → space) as h2 + image (width 160). A "Badges" summary block shows the last one. An **"Edit"** button opens the Badges modal (`#sticker`).
3. **About Me editor** (edit mode, `#edit-profile`): a textarea `About Me` (placeholder `Tell people about yourself...`) and the button **`Save Your "About Me"`** (AJAX, `YP:881-900`). It saves profile2 `main.field_about_me` (creating the profile if missing), logs `save_user_stats('profile-edits')`, and shows **"Saved!"** with a green background (`YP:1452-1479`).
4. **Password block** (form `home_page_profile_password`, `YP:408-449`, `YP/tpl/home-profile-password:29-45`): "Change Your Password". Fields `New Password` / `Confirm New Password` (both required). Button **"Save Your New Password"** (AJAX, `YP:1401-1446`). Messages: `Passwords do not match!`, `password fields are empty!`, or `Saved!` (green). **The current password is not required.**
5. Blocks on this path: `youthrive_profile:uy_user_levels` ("Your Level" block, only on `my-profile`, §7.7) and `twm_achievement_bins:twm_generic_profile` (slide 2, §7.8).

`?uyid=profile_edit` opens the page directly in edit mode (the home card link "view & edit" uses it).

### 7.3 Avatars (modal `#changeavatars`)

Source: the `avatar_selection` library (113 images in `public://avatar_selection/`) grouped by role through `avatar_selection_roles` (`DB`). The list is built by `ts_avatar_selection_image_list()` (`YP:1597-1742`, a copy of the contrib function) ordered by weight, name, file.

| Pack header | Role that unlocks it | Images (library names) |
|---|---|---|
| `Avatars \| 1 of 7` | `participant` (always open) | "Avatar - Pack 1 - 1…12" |
| `Avatars \| 2 of 7` | `level-2` | 12 images: "Avatar-Pack2-1", "Avatar - Pack 2 - 5/7/8/9/11/12", "Avatar - Pack 6 - 7/8/10/11", "Avatar - Pack 1 - 10" |
| `Avatars \| 3 of 7` | `level-3` | "Avatar - Pack 7 - 1…12" (7 appears twice, 6 missing) |
| `Avatars \| 4 of 7` | `level-4` | "Avatar - Pack 8 - 1…12" |
| `Avatars \| 5 of 7` | `level-5` | "Avatar - Pack 9 - 1…12" |
| `Avatars \| 6 of 7` | `level-6` | "Avatar - Pack 10 - 1…12" |
| `Avatars \| 7 of 7` | `level-6-1` | "Avatar - Pack 6-1 - 1…12" (1 twice, 8 missing) |
| (none) | no role | "Avatar - Pack 3 - 1…9" and `default.png`. **Never offered** |

Per page: `avatar_selection_avatar_per_page` = 0, so all images show. UI: a Swiper with ‹ › arrows and the header "Avatars | {n} of 7", the radio grid, and a **Done** button (`check-icon`). Packs whose role the user lacks get class `avatarlock` (opacity .5, `pointer-events:none`, lock icon `lock.svg`), so the lock is **UI-only** (`#validated TRUE`). Only the currently selected avatar is pre-checked (`field_avatar`).

Save (**Done** → `sticker_submit` → `avatar_submit`, `YP:1314-1397`):
```
if select_avatar chosen (and no bg upload):
  avatar_selection_validate_user_avatar: copy library file → temporary://   (AS:324-345)
  move to public://pictures/picture-{uid}-{REQUEST_TIME}.{ext}, permanent, file_usage(user)
  user.picture = new file; user.field_user_picture = NULL      // library avatar replaces any custom photo
  user.field_avatar = chosen library fid
  save_user_stats('profile_avatar', filename)
```

### 7.4 Badges ("stickers", modal `#sticker`)

| Header | Role | Badges (names shown = filename without extension) |
|---|---|---|
| `Badges \| 1 of 2` | `level-2-1` pack, **always selectable** (no lock applied) | Mother / Grandmother, Foodie / Special Diet, Book Worm, Religious, Traveller, Self Care Pro, Pet Lover, Social Media / Tech Expert, Caregiver, Activist / Community Volunteer |
| `Badges \| 2 of 2` | `level-3-1` pack, locked (`stickerlock`) unless the user has role `level-3-1` | Music Lover, Art Lover, ADAP Whiz, Fitness Fanatic, Mental Health Advocate, Fashion Star / Fashionista, Let's Chat!, Private Person, Social Butterfly, Beauty Pro |

Checkboxes (multi-select, 25 per page via `?spage`), each showing the title above the image. **Done** saves `field_sticker = comma-joined fids of (pack1 ∪ pack2 selections)` and shows the message `Your sticker has been updated.` (`YP:1373-1393`). Only when pack 1 is non-empty is the list saved, so un-selecting everything is impossible. Badges show on your profile and on other users' profile cards.

### 7.5 Custom photo upload

In profile edit mode: **Upload** opens a managed_file (`public://drupal_wall/`, `gif png jpg jpeg`, `accept=image/*`). The preview panel reads "Image Upload", shows a thumbnail, "Image Uploaded! You can change or click Done to finish." and "Square images may work better here.", with a remove button **"Change Upload"** (`YP:1216-1250`). **Done** runs `profile_picture_submit` (`YP:1275-1295`): `field_user_picture = fid`, then `save_user_stats('profile_avatar', …)`. The file is **never marked permanent**, so Drupal's cron can garbage-collect it after 6 h (§14). The same uploader exists at `/my-profilepic`.

### 7.6 Another user's profile (`/user/{uid}`)

- Block `youthrive_profile:uy_others_profile` (content region, PHP visibility "path `user/*` and not me", `YP:269-335`, `YP/tpl/uy-other-user-profile:19-65`): a card with the **username** (link), **"Level {n}"**, the **avatar**, **About Me** (only if not empty), and **badges** (name + image). `field_bg_image` is the background. Age/points/next level exist in the form but are commented out of the template.
- Below: that user's wall posts (`drupal_wall_user_view`, §5.2.3). There is no post form (not your account).
- `twm_generic_profile` block (slide 2, `AB:122-144`): profile picture + level button (links `/levels`) + username, plus an About-me list (gamification spec).
- Core user view also renders any user fields with a visible display format: `field_first_name`, `field_user_pronoun`, `field_location`, `field_coach`, `field_zoom_link`, `field_wall_visit`, `field_user_picture` (raw fid) and `field_bg_image`, plus profile2 `main` (About Me, Age, Pronoun) and the core "Member for" summary. `field_number`, `field_study_id` and the intervention date are hidden/private. **Do not replicate this leakage.** The intended public profile is the card above: name, level, avatar, about me, badges, posts.

### 7.7 "Your Level" block (`uy_user_levels`, only on `/my-profile`, `YP:339-377`, `YP/tpl/uy-user-levels-description`)

It shows "Your Level", "you're at", `level {n}` with `points {total}`. For level < 6 it adds "next", `level {n+1}` and `points {threshold}` (thresholds `next_level_points`: 1→200, 2→500, 3→900, 4→1,400, 5→2,000, `YP:379-404`). "how to level up" is followed by the fixed text: `Log in daily, complete your midpoint survey, post/comment on the Wall, read LinkPositively Tips, and complete your daily check-ins.` The level names/descriptions admin form (`YP:40-155`, stored as `level{n}-name/-desc`) is not displayed by this template. Gamification spec.

### 7.8 Sidebar profile block (`twm_user_profile_sidebar_block`)

A feature module. It places `twm_achievement_bins:twm_generic_profile` in region `slidercontent` of `twm_bootstrapless`, visible (PHP) on other users' `/user/{uid}` and on `/my-profile`. `twm_bins` is exported but disabled. It also exports view `my_profile` (block: profile2 About Me/Age and a non-existent "years living with HIV" field for `arg(1)`; not placed) and the `tech_support` content type (tech support spec). Contents of the generic block: picture, level button → `/levels`, username, About-me (`AB:122-144`, `UTIL:104-119`).

### 7.9 Account settings

- `/user/edit-my-profile` → `/user/{me}/edit`: the core account form (theme `user-profile-edit.tpl.php`: "Your details:" email + username, "Reset your password:" current/new/confirm), with the profile2 `main` fields embedded because `use_one_page=1` (`account_profile`). The separate profile2 edit tab is disabled.
- `/edit-profile-form-page` (`UPE:44-90`): a login-styled page with a `password_confirm` field (required) and a submit arrow. On save: `Your password has been changed.` Then coaches/eCoach users are redirected to CAS login on PN, everyone else to `/drupal-wall`. Used for first-time password set (auth spec).

### 7.10 Other profile bits

- `field_theme` (`theme-1..4`) is output as the body class (`UTIL:227`). The `updated_theme` AJAX handler exists (`YP:1255-1271`) but no form element uses it. Theme switching belongs to the gamification/theme spec (doc 06).
- `field_bg_image`: rendered if set. The bg upload handlers (`bg_ajax_submit`, `bg_file_element_process`, `change_bg`) are not attached to any live form.
- The medication-reminder form `home_page_profile_tracker` (`YP:454-621`: "How would like to receive your Medication Notifications?" Phone Text Messages / In App Messages (here); Daily/Weekly; weekday; hour 12:00–11:00 + AM/PM; **"Create Reminder"** → `reminder_checkin_time`) is **not rendered** (commented out at `YP:168`). Trackers spec.

---

## 8. Calendar (`youthrive_calendar`), DISABLED (never installed)

Purpose: a month calendar of the user's daily check-ins from the intervention start date to tomorrow.
- `/calendar` renders `CAL.tpl`: a radio switch **"what to show"**: `meds` / `moods` / `both` (default both), and `<div id='calendar'>` (FullCalendar 3, swipe left/right to change month, `T/js/calendar.js`).
- `/reload-calendar` returns JSON `{youthrive_calendar:{dates:[{date:'Y-m-d', style, emoji}], start, end}}` (`CAL:67-107`).
- **Med status** (`reminder_checkin.meds`): `1` → cell class `greenCell` (took meds), `0` → `redCell` (missed). No row = uncoloured.
- **Mood** (`reminder_checkin.moods`, 1–7) → icon class `emoji-1`…`emoji-7`. The labels used by the check-in report (`M/uy_user_checkin_report/uy_user_checkin_report.module:157-163`) are: **1 Excited, 2 Happy, 3 Content, 4 Neutral, 5 Anxious, 6 Sad, 7 Angry**.
- How they are recorded: by the LP daily check-in form in `techstep_tracking` (`checkin_lp_today_callback`, `M/techstep_tracking/techstep_tracking.module:1519-1560`). It keeps one `reminder_checkin` row per user per day (`created` = today 00:00), with `meds` = the "meds-today" answer, `moods` = the "moods-today" answer, and awards check-in points. That module also serves the live `/calendar` JSON and tracker calendar. See the trackers spec.
- Because the module is disabled, `T/js/calendar.js` (loaded for every logged-in page) calls `/reload-calendar` only when an empty `#calendar` exists, which happens on tracker pages. There the call 404s (`techstep_tracking` uses its own JS).

Rewrite: the calendar concept lives on in the trackers feature. Nothing extra is needed from this module beyond the mood labels and colour semantics above.

---

## 9. Journey (`youthrive_journey_efm`), DISABLED (never installed), content present

A features-only module (no UI code). It defines 4 content types (`JRN/youthrive_journey_efm.features.inc`):
- `journey_category` (6 nodes): Health, Happiness, Family (including chosen family), Friends, School/Work, Sex & Love Life. Field `field_journey_category_name` (text).
- `journey_methods` (30 nodes, 5 per category, e.g. Health: "feel more in control of my own health", "feel more confident in managing my health", "have people who support me in taking care of my health", "know how to take the best care of my health", "find ways of staying healthy that I enjoy"). Fields `field_journey_category` (entity ref → category), `field_journey_method_name`.
- `journey_goals` (153 nodes). Fields `field_journey_method` (ref → method), `field_journey_goal_name`.
- `user_goals` (14 nodes, per-user). Fields `field_user_category_id`, `field_user_method_id`, `field_user_goal_id` (refs), `field_user_goal_category_name`, `field_user_goal_method_name`, `field_user_goal_name`, `field_own_category`, `field_own_goals` (free text "own" goal), `field_goal_step` (e.g. "STEP 3"), `field_goal_current_step_descript`, `field_goal_next_step_description`, `field_goal_created_date`, `field_goal_end_date` (datetime).
- The 7 step labels (`DB:variable goal-step1..7`): Thinking About Starting / Took My 1st Step / Making Progress / Halfway There / On a Roll / The End is in Sight / Journey Complete!
- The orphan template `M/techstep_tracking/templates/my_journey_data.tpl.php` shows the intended UI: "My Journey", "start new journey", and per goal an accordion with the goal name, "{started} | {ends in}", "update progess" (sic), a 7-dot step tab bar with the current/next step descriptions, and on completion "Congratulations !". No code renders it. The engagement report still counts `user_goals`.

Rewrite: flag as **not in production**. Keep the data export/model only if the study team wants the feature restored.

---

## 10. Search

### 10.1 UI

- The search box (`uy_search_box`, `US:81-112`, `US.box`) is rendered **directly by `TPL/page:108-110`** inside the collapsible nav on every non-front page for non-admin users (the home page template omits it). It is a textfield `#search_term` with placeholder `Search For ...` and a **"Search"** button (`uysearch_block`). Enter triggers it (`CF.js:391-402`). The form never submits (`onsubmit return false`).
- The results panel (`TPL/page:156-168`) is `.uy_search_all` with header "Search Results" and a **close** ✕ (`#search_close`), then `#uy_search`. The page scrolls to it.
- Empty input shows `Please enter search term` (h5). While loading: `Loading...`.

### 10.2 Query (`CF.js:428-484`)

POST `/views/ajax` with `view_name=search_wall`, `view_display_id=page_1`, and the typed text as **all four** exposed inputs: `body_value`, `comment_body_value`, `field_html_content_value`, `field_thrive_tags_tid`. The response HTML replaces `#uy_search`. Then `{wall count}+{tips count}` is written as **"{N} Results"**.

### 10.3 What is searched (view `search_wall`, DB-overridden; doc 06 §2.1)

- **Wall part**, display `page_1`: published `drupal_wall` nodes (with a relationship to their comments), where `body` **contains the word** (Views operator `word` = any word) **OR** a comment body **equals** the text exactly (`comment_body_value` operator `=`). Result count in the header `<div class="result-count"> @total</div>`. Rows repeat per matching comment join. The view header embeds `search_wall:wall_search` (same filters) and the footer embeds `search_thrive:thrive_search`.
- **Thrive Tips part** (`search_thrive:thrive_search`): published `thrive_tips` whose `field_html_content` contains **all words**, sorted by created DESC. Count `<div class="thrive-result-count"> @total</div>`. Tags filter present in the default display.
- No user search, no glossary search, no resource search. Access `access content`.
- Pagers are configured (2 per page) but **the template prints no pager** (`TPL/sw-page1`, `print $pager` commented out), and the wall rows are printed through the header view. In practice the user sees the first few matches only.

### 10.4 Result formats

- **Wall result** (`TPL/sw-fields:28-208`): the same post-card chrome as the wall. Author avatar; edit/delete (if permitted) or "Inappropriate"; author name (links `/user/view-profile/{uid}`) + date `m/d/y`; an **excerpt**: `search_excerpt(arg(2), body)`, where `arg(2)` is empty under `/views/ajax`, so this is the first ~256 chars; reactions bar (`search-post-reactions.tpl.php`); "Add A Comment" + "Show Comments"/"No Comments Yet". Comments and the comment form are not included, so those buttons do nothing useful here.
- **Tip result** (`TPL/st-fields`): the favourites flag, title (h6), `field_html_content`, the video field, and tag chips (`user-hash-tags`, link to `/thrive-tips/tags/{tag}`).

### 10.5 Hashtag/tag search

Hashtag chips go to the Thrive Tips tag page, not to search (§5.13). `/search/uy-tags/{term}` (JSON of `search_wall:wall_search` with the term as argument) and `twm_general`'s exposed-filter prefill for `search_wall`/`search_thrive` args (`GEN:183-202`) are legacy.

### 10.6 Core search & the uy_search block

The `uy_search` **block** (`form` delta) renders only for users with `search content` (admins), and the `uy_user_search_results` delta is placed on `<front>` but has no content (`US:55-65`). Core `/search` exists for admins only. **Participants use only the header box.**

---

## 11. Glossary (`twm_glossary`)

- Vocabulary `glossary_terms` (vid 4, flat, **76 terms**). Each term has a **name** (e.g. "ADA", "Affordable Care Act", "Ageism", "Ally", "AMAB/AFAB/ASAB") and a **description** (the definition, HTML). First letters present: A C D E F G H I M N O P R S T U V W.
- View `twm_glossary1`, page **`/yt-glossary`** (menu item "Glossary" in `menu-twm-menu`, **hidden**; the feature's link `/twm-glossary` is dead):
  - Contextual argument = term name in **glossary mode**: first character, upper-cased, default `a`. `/yt-glossary/B` lists B-terms.
  - The page display shows an A–Z **summary** (`default_summary`: only letters that have terms, with counts). The attachment shows an inline summary separated by `| `, 25 per page.
  - Each row: `<p><a name=[name]></a></p><p><strong>[name]:</strong> [description]</p>` (anchor per term). Page display unpaged, default display 10 per page with AJAX.
  - Wrapped by the theme in `panel taco content_page info-page` (`T/templates/views/views-view--twm-glossary.tpl.php`).
- Access `access content`. Terms are admin-managed through taxonomy UI; `merge glossary_terms terms` is admin-only.

Rewrite: an alphabetical glossary page with letter navigation and anchors; terms are `{name, definitionHtml}`.

---

## 12. Other listed modules

- **quicktabs**: one instance `test_carousel` ("Achievement Carousel", no style, non-AJAX) with tabs "LeaderBoard" (block `twm_achievements_leaderboard`…`twm_user_point`) and "Achievements" (a views block). **Not placed** (0 quicktabs blocks). Ignore.
- **video_embed_field**: used only by `field_video_link` on `thrive_tips` and `page` (providers YouTube + Vimeo, "normal" style, description below). **Wall videos do not use it** (§5.4.3).
- **fivestar/votingapi**: only `resources.field_rating` (5 stars, revote allowed, own vote allowed). 0 votes stored. Resources spec.
- **comments_visibility**: hides "Comment settings" on the Thrive Tip node form (`M/comments_visibility/comments_visibility.module:2-10`). Admin-only concern.
- **account_profile**: see §7.9 (`use_one_page`; `account_profile_wrap_account` = 0).
- **profile2_page**: enabled, but participants never reach `/profile-main` (template stub `T/templates/user-profile-form.tpl.php` is broken PHP and unused).
- **Reporting views touching community data** (`all_user_comments`, `comment`, `cw`, `reaction_count`, `hash_tags`, `user_mentions_drupal_wall`): see doc 06.

---

## 13. UI/UX notes & string catalogue

- Mobile-first single column. The wall is inside Swiper slide 1 of the home page, and the profile is slide 2 (swipe or arrows `#left/#right`). Cards are Bootstrap `panel`s, left column = avatar, right = content. Buttons are `btn-primary` pills with SVG icons (`svg-post-icon-image`, `svg-post-icon-video`, `comment-icon`, `delete-icon`, `edit-icon`, `check-icon`, `arrow-icon`, `down-arrow-icon`).
- User-selectable colour themes `theme-1..4` restyle everything (body class).
- Dates on cards are `m/d/y` (posts and comments). Relative "x ago" exists only in dead templates.
- Double-tap zoom is suppressed on `.main-container` (`DW.js:1-14`).
- Strings (verbatim, keep unless product changes them):
  - Post form: `New Post`, `What's on your mind ?`, `Image`, `Video`, `CW`, `Add a video's web address here`, `Post`, CW template `!CW GOES HERE!`.
  - Validation/messages: `You must not have much on your mind...` (warning), `Sorry ! Only Youtube video are allowed to shared, Please enter valid video URL`, `Success! Your post has been saved.`, `Failed to write the uploaded file in "sites/default/" file folder. Please provide write permission to this directory`, `Not able to save comment`.
  - Feed: `Show older posts`, `No more older wall post exists !`, `No wall status avaliable !` / `No wall status available !`, `Your Wall | {n} New`.
  - Card: `Inappropriate`, `Delete`, `Add A Comment` / `Cancel Comment`, `Show Comments` / `Hide Comments` / `No Comments Yet`, ` Add a comment...`, `Please enter a youtube video URL.`, `Read more ➜`, `Flagged Message`.
  - Tip notification: `{name}! commented on a thrive tip.`, `See Full Thrive Tip >>`.
  - Notifications: `Your Notifications | {n} New`, `In App Message`, `Read More`, `Delete` + the templates in §6.2.
  - Profile: `Your Profile`, `Edit`, `Done`, `Change Your Avatar & Badges`, `Select`, `Upload`, `Change Upload`, `Image Upload`, `Image Uploaded! You can change or click Done to finish.`, `Square images may work better here.`, `Avatars | {n} of 7`, `Badges | 1 of 2`, `Badges | 2 of 2`, `About Me`, `Tell people about yourself...`, `Save Your "About Me"`, `Saved!`, `Change Your Password`, `New Password `, `Confirm New Password`, `Save Your New Password`, `Passwords do not match!`, `password fields are empty!`, `Your sticker has been updated.`, `Your Level`, `you're at`, `next`, `how to level up`, `view & edit`.
  - Search: `Search For ...`, `Search`, `Search Results`, `close`, `Please enter search term`, `Loading...`, `{n} Results`.
  - Moderation: `Wall Post Abuse`, `Comment Abuse`, `No content has been reported.`, `No comments have been reported...`, `Report by` / `Reported by`, `Author`, `Actions`, `Whitelist`, `Delete`.

---

## 14. Defects and unsafe behaviour — do NOT replicate

1. **Global mutable state**: paging offsets, the viewed-user id, the "old photo" fid, `comment_image_fid` and `bell_notifications` live in site-wide `variable`s (`DW.module:123-124,144-145,471-472`, `DW.global:17,155-156`, `PE:260,312`, `CE:208,231`, `CN:680,696`). Concurrent users corrupt each other's paging, photo deletion and "new" counters. Use per-request cursors and per-user `lastSeen*` timestamps.
2. **Missing authorisation**: `/post/{nid}/edit` and `/commentedit/{cid}/{uid}` have `access callback TRUE` and no ownership check (`PE:4-10`, `CE:4-10`). The comment-delete AJAX handler deletes any cid it is sent (`DW.page:698-705`). `/notifications-data` trusts the posted uid (`CN:18-43`). `/load-node/{nid}` renders any node to anonymous users without `node_access` (`US:133-141`).
3. **Comment edit rewrites author and date** (`CE:192,195`).
4. **Password change without the current password** (`YP:1401-1446`).
5. **Stored XSS risks**: create stores the raw body. The image-URL branch of the post template prints text unfiltered (`TPL/posts:300-304`). `TPL/node-wall:328` prints comment bodies raw. Sanitise on output with one allow-list.
6. Posts whose raw text contains `<a>` to external non-image URLs render **no text** (`TPL/posts:269-315`).
7. Reporting a post (`abuse_node`) wipes the reporter's reaction on it (`GEN:10-58`).
8. "No self-reaction" and avatar/badge locks are CSS-only.
9. Custom profile photos are never made permanent (cron may delete them).
10. Deleting posts leaves `uy_wallflag_count` orphans. Reaction counts come from a table that double-books Flag.
11. Tip interleaving bugs: the first branch never assigns tips; cycle-2 day math is wrong; it mixes `users.created` with the intervention start (`DW.global:161-283`).
12. Mention/hashtag URL detection compares against `http://` + host and fails on https (`TPL/posts:282`, `PE:69`).
13. Duplicate/dead blocks and routes: `twm_comment_notification`, `twm_comment_notification_mobile`, `uy_home_profile` placements have no delta; the `/all-tags` and `/twm-glossary` links are dead; `/calendar` is served by another module.
14. Search: word vs exact-match inconsistency between post body and comment; no pager; results duplicate per matching comment.

---

## 15. Rewrite checklist (behaviour to preserve)

- [ ] Global wall of all users' posts, newest first, 5 per page with "Show older posts", tips interleaved by delivery day (fixed algorithm), today's tip block on top.
- [ ] Post: text (limited HTML), one photo (gif/png/jpg/jpeg, GIFs stay animated), YouTube URL → privacy-enhanced embed, CW syntax `!warning!` with collapsed body/media + "Read more", link auto-linking + one OpenGraph preview, hashtags, `@mentions`.
- [ ] Edit/delete own posts (participant); edit/delete any (admin, Coordinator); **enforce server-side**. Delete without confirm today; adding a confirm is acceptable.
- [ ] Comments: text + optional photo + optional YouTube video, flat (no replies), oldest first, hidden behind "Show Comments", author/admin/Coordinator delete, edit keeps authorship.
- [ ] 5 reactions (haha, love, thumbs up, 100, target), one per user per entity, not on own content, counts shown, toggle off.
- [ ] Report "Inappropriate" on others' posts/comments, one-way for participants, moderation queues for admin/Coordinator with delete / clear report / whitelist. No auto-hide.
- [ ] Tip-comment mirror posts (`tip-notification`).
- [ ] In-app notification centre with the §6.2 sources/texts, per-user "new" tracking, per-item dismiss (tracker reminders reappear daily), bell indicator, "Your Wall | N New". No email.
- [ ] Profile: username, level, avatar (library packs unlocked by level roles; custom upload), badges (2 packs), About Me, change password (require the current password in the rewrite), other-user profile card + their posts. No PII fields on public profiles.
- [ ] Header search over wall posts/comments and Thrive Tips with the combined count "N Results".
- [ ] Glossary A–Z page.
- [ ] Calendar/Journey: not in production. Keep only the mood labels (1 Excited … 7 Angry) and meds colour semantics for the trackers feature.
- [ ] Peer Navigation: none of this is active. Do not build community features for PN.
