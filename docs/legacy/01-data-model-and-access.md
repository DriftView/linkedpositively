# 01 — Data model & access model (Link Positively + Peer Navigation)

> **Status:** source-of-truth spec for the Next.js + MongoDB rewrite. Written so it stands on its own after the
> Drupal code and databases are deleted.
> **Snapshot:** local restore of the July 2026 cPanel backups (`linkpositively` DB for LP, `peernav` DB for
> Peer Navigation). All row counts are from that snapshot (queried 2026-09-29).
> **Privacy:** this file contains schema, configuration, counts and site-authored option lists only. No user
> names, emails, phones, messages or check-in answers appear here. Some legacy tables *store* such data — they are
> flagged 🔒 below so the new schema can treat them as sensitive (encryption-at-rest, audit, export controls).

Abbreviations: **LP** = Link Positively (`lp/`, Drupal site "Link Positively", internally also called *YouThrive*,
*TWM*, *TechStep*); **PN** = Peer Navigation (`ecoach/`, Drupal site "Peer Navigation", internally *eCoach*).

## Table of contents

1. [Drupal 7 storage conventions (read first)](#1-drupal-7-storage-conventions-read-first)
2. [The two sites and how they relate](#2-the-two-sites-and-how-they-relate)
3. [Link Positively — entities, bundles, fields](#3-link-positively--entities-bundles-fields)
4. [Link Positively — taxonomy, profile2, field collections, flags, voting, achievements](#4-link-positively--taxonomy-profile2-field-collections-flags-voting-achievements)
5. [Link Positively — custom & contrib tables](#5-link-positively--custom--contrib-tables)
6. [Peer Navigation — entities, bundles, fields, tables](#6-peer-navigation--entities-bundles-fields-tables)
7. [Users, roles & permissions (both sites)](#7-users-roles--permissions-both-sites)
8. [Access rules implemented in custom code](#8-access-rules-implemented-in-custom-code)
9. [Menus, site settings & themes](#9-menus-site-settings--themes)
10. [Blocks per region](#10-blocks-per-region)
11. [Enabled modules](#11-enabled-modules)
12. [Differences between LP and PN](#12-differences-between-lp-and-pn)
13. [`variable` table config names grouped by feature](#13-variable-table-config-names-grouped-by-feature)
14. [Migration notes & gotchas](#14-migration-notes--gotchas)

---

## 1. Drupal 7 storage conventions (read first)

Everything below maps back to these physical storage rules; a lossless migration must read them this way.

| Concept | Legacy storage | Notes for the Mongoose design |
| --- | --- | --- |
| Node (content item) | `node` (`nid`, `vid`, `type`, `language`, `title`, `uid`, `status`, `created`, `changed`, `comment`, `promote`, `sticky`, `tnid`, `translate`) + `node_revision` (`nid`, `vid`, `uid`, `title`, `log`, `timestamp`, `status`, `comment`, `promote`, `sticky`) | `type` = bundle machine name. `status` 1=published 0=unpublished. `comment` 0=hidden,1=closed,2=open (per node, defaults from type settings). `uid` = author. Timestamps are Unix seconds. |
| Comment | `comment` (`cid`, `pid`, `nid`, `uid`, `subject`, `hostname`, `created`, `changed`, `status`, `thread`, `name`, `mail`, `homepage`, `language`) + `node_comment_statistics` | Bundle = `comment_node_<nodetype>`. Body is field `comment_body`. `thread` is a vancode for threading; `pid` parent comment. |
| User | `users` (`uid`, `name`, `pass`, `mail`, `theme`, `signature`, `signature_format`, `created`, `access`, `login`, `status`, `timezone`, `language`, `picture` (fid), `init`, `data` (serialized)) + `users_roles` (`uid`,`rid`) | `uid` 0 = anonymous placeholder row, `uid` 1 = super-admin. `status` 1 active / 0 blocked. `pass` = Drupal 7 phpass (`$S$…`, SHA-512, 2^15 iterations default) — all rows on both sites use `$S$`. |
| Field value | `field_data_<field_name>` (current) and `field_revision_<field_name>` (history) | Common columns: `entity_type`, `bundle`, `deleted`, `entity_id`, `revision_id`, `language` (always `und` here), `delta` (0-based index for multi-value), then `<field_name>_<column>` value columns listed per field below. |
| Taxonomy term | `taxonomy_term_data` (`tid`, `vid`, `name`, `description`, `format`, `weight`) + `taxonomy_term_hierarchy` (`tid`,`parent`) + `taxonomy_vocabulary` (`vid`, `name`, `machine_name`, `description`, `hierarchy`, `module`, `weight`) + `taxonomy_index` (`nid`,`tid`,`sticky`,`created`) | Term-reference fields store `<field>_tid`. |
| File | `file_managed` (`fid`, `uid`, `filename`, `uri`, `filemime`, `filesize`, `status`, `timestamp`) + `file_usage` (`fid`,`module`,`type`,`id`,`count`) | `uri` scheme `public://` = `sites/default/files/`, `private://` = `sites/default/private/`. Image fields also store `alt`, `title`, `width`, `height`. |
| Entity reference | `<field>_target_id` | Target entity type per field below. |
| Date field (`datetime`) | `<field>_value` as `YYYY-MM-DD HH:MM:SS` string, `tz_handling = none` (no timezone conversion) | Treat as wall-clock dates. |
| Text fields | `<field>_value` + `<field>_format` (text format machine name, NULL for plain) | `text_with_summary` also has `_summary`. |
| Config | `variable` (`name`, `value` = PHP-serialized) | Listed in §13. |

Row counts per field below are rows in `field_data_<field>` (i.e. values incl. deltas), not entities.

---

## 2. The two sites and how they relate

| | Link Positively (LP) | Peer Navigation (PN) |
| --- | --- | --- |
| Purpose | Participant-facing HIV self-management / social app (wall, tips, check-ins, trackers, resources, points/levels, SMS reminders) + research admin tools | Peer-navigator / coach tool: coaching sessions, session notes, private messages between coach and participant, files |
| DB | `linkpositively` | `peernav` |
| Front page | `drupal-wall` | `node/1` |
| Default theme | `twm_bootstrapless` (staff roles switched to `twm_bootstrapless_old`) | `techstep_ecoach` (staff roles switched to `bootstrap`) |
| Authentication | Local Drupal accounts (login by username **or email**, via LoginToboggan). Acts as **CAS server** (`cas_server`) | **CAS client** of LP (`cas_server` = `prod.lp.radiant.digital`, URI `/cas`, CAS 2.0). Accounts auto-created on first CAS login |
| Users (uid>0) | 61 (20 active, 41 blocked) | 45 (44 active, 1 blocked) |
| Link between them | Users with role `coach`, or `ecoach-user` without `participant`, are redirected from LP to PN via CAS on login / when opening the wall. Menu link **eCoach** (`/ecoach`) on LP. | Menu links **LinkPositively** / **back to LinkPositively** (`/techstep`) return to LP. CAS attributes pushed from LP populate PN user fields (see §8.3). |

Identity mapping: PN `cas_user.cas_name` = LP `users.name`. PN `users.name` equals the LP username for CAS-created
accounts. A merged app should key people by one identity and keep both legacy uids (`legacy.lpUid`,
`legacy.pnUid`).

---
## 3. Link Positively — entities, bundles, fields

### 3.1 Entity types and bundles in use (LP)

`rows` = number of entities of that bundle. Flagging bundles (one per flag) are listed in §4.4 instead. Custom
entity types (`ts_*`, `reminder_checkin`, `uy_login`, `ts_user_stats`) are Entity-API wrappers over custom tables
(§5).

| entity type | base table | module | bundle | bundle label | rows |
| --- | --- | --- | --- | --- | --- |
| comment | comment |  | comment_node_article | Article comment | 0 |
| comment | comment |  | comment_node_page | Basic page comment | 0 |
| comment | comment |  | comment_node_drupal_wall | Drupal Wall comment | 40 |
| comment | comment |  | comment_node_journey_category | Journey Category comment | 0 |
| comment | comment |  | comment_node_journey_goals | Journey Goals comment | 0 |
| comment | comment |  | comment_node_journey_methods | Journey Methods comment | 0 |
| comment | comment |  | comment_node_public_page | Public Page comment | 0 |
| comment | comment |  | comment_node_reminder_messages | Reminder Messages comment | 0 |
| comment | comment |  | comment_node_reminder_sms_inputs | Reminder SMS Inputs comment | 0 |
| comment | comment |  | comment_node_resources | Resources comment | 0 |
| comment | comment |  | comment_node_twm_achievement_carousel | TWM Achievement Carousel comment | 0 |
| comment | comment |  | comment_node_tech_support | Tech Support comment | 0 |
| comment | comment |  | comment_node_thrive_tips | Thrive Tips comment | 0 |
| comment | comment |  | comment_node_user_goals | User Goals comment | 0 |
| comment | comment |  | comment_node_weekly_checkins | Weekly CheckIn Feedback comment | 0 |
| comment | comment |  | comment_node_weekly_checkin_prompt | Weekly Checkin Prompt comment | 0 |
| field_collection_item | field_collection_item | field_collection | field_hot_topics | Field collection field_hot_topics | 1 |
| field_collection_item | field_collection_item | field_collection | field_my_check_in | Field collection field_my_check_in | 3 |
| field_collection_item | field_collection_item | field_collection | field_my_journey | Field collection field_my_journey | 2 |
| field_collection_item | field_collection_item | field_collection | field_my_points | Field collection field_my_points | 2 |
| field_collection_item | field_collection_item | field_collection | field_my_thrive_tips | Field collection field_my_thrive_tips | 2 |
| node | node |  | article | Article | 0 |
| node | node |  | page | Basic page | 4 |
| node | node |  | drupal_wall | Drupal Wall | 94 |
| node | node |  | journey_category | Journey Category | 6 |
| node | node |  | journey_goals | Journey Goals | 153 |
| node | node |  | journey_methods | Journey Methods | 30 |
| node | node |  | public_page | Public Page | 13 |
| node | node |  | reminder_messages | Reminder Messages | 1 |
| node | node |  | reminder_sms_inputs | Reminder SMS Inputs | 1 |
| node | node |  | resources | Resources | 277 |
| node | node |  | twm_achievement_carousel | TWM Achievement Carousel | 0 |
| node | node |  | tech_support | Tech Support | 0 |
| node | node |  | thrive_tips | Thrive Tips | 157 |
| node | node |  | user_goals | User Goals | 14 |
| node | node |  | weekly_checkins | Weekly CheckIn Feedback | 0 |
| node | node |  | weekly_checkin_prompt | Weekly Checkin Prompt | 10 |
| profile2 | profile | profile2 | main | Profile | 63 |
| profile2_type | profile_type | profile2 | profile2_type | Profile type | 1 |
| file | file_managed |  | file | File | 900 |
| taxonomy_term | taxonomy_term_data |  | tags | Tags | 0 |
| taxonomy_term | taxonomy_term_data |  | thrive_tips_tags | Thrive Tips Tags | 80 |
| taxonomy_term | taxonomy_term_data |  | thrive_tips_categories | Thrive Tips Categories | 7 |
| taxonomy_term | taxonomy_term_data |  | glossary_terms | Glossary Terms | 76 |
| taxonomy_term | taxonomy_term_data |  | youthrive_tags | youthrive_tags | 48 |
| taxonomy_term | taxonomy_term_data |  | hashtags | Hashtags | 0 |
| taxonomy_term | taxonomy_term_data |  | custom_tracking | Custom Tracking | 3 |
| taxonomy_term | taxonomy_term_data |  | resource_tags | Resource Tags | 190 |
| taxonomy_vocabulary | taxonomy_vocabulary |  | taxonomy_vocabulary | Taxonomy vocabulary | 8 |
| ts_location | ts_locations |  | ts_location | Locations | 274 |
| ts_tracking | ts_tracking |  | ts_tracking | Custom Tracking | 113 |
| ts_tracking_data | ts_tracking_data |  | ts_tracking_data | Tracking Data | 266 |
| ts_tracking_time | ts_tracking_time |  | ts_tracking_time | Tracking Time | 45 |
| reminder_checkin | reminder_checkin |  | reminder_checkin | Tracking Checkin | 470 |
| user | users |  | user | User | 62 |
| uy_login | youthrive_reports |  | uy_login | uy_login | 7199 |
| ts_user_stats | ts_user_stats |  | ts_user_stats | User Stats | 235 |

### 3.2 Node content types (`node_type`) with publishing and comment settings (LP)

Columns: `node_options` = default publishing flags (`status` published, `promote` promoted to front page);
`node_submitted` = show "submitted by" line; comment settings come from variables `comment_<type>` (0 hidden / 1
closed / 2 open), `comment_default_mode_<type>` (1 threaded), `comment_default_per_page_<type>`,
`comment_anonymous_<type>` (0 = anonymous may not comment), `comment_subject_field_<type>` (1 = show subject field),
`comment_form_location_<type>` (1 = form below post, 0 = separate page), `comment_preview_<type>` (0 disabled, 1
optional, 2 required). `comments` = actual comment rows. No content type has a body field (`has_body` empty) — the
`body` field is attached as a normal field where present.

| type | name | module/base | title label | has_body | description | nodes (pub/unpub) | node_options | node_submitted | comment (0 hidden/1 closed/2 open) | comment_default_mode | per_page | anon | subject field | form location | preview | comments |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `drupal_wall` | Drupal Wall | drupal_wall_efm/node_content | Title |  |  | 94/0 | ["status"] | 0 | 2 | 1 | 10 | 0 | 0 | 1 | 1 | 40 |
| `thrive_tips` | Thrive Tips | thrive_tips_efm/node_content | Tip Title |  | Tips to help users better manage HIV | 157/0 | ["status"] | 0 | 2 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| `tech_support` | Tech Support | twm_user_profile_sidebar_block/node_content | Title |  | TWM Feedback Form | 0/0 | ["status"] | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| `reminder_sms_inputs` | Reminder SMS Inputs | weekly_checkin_efm/node_content | Title |  | Twm Reminder Message Inputs | 1/0 | ["status"] | 0 | 1 | 0 | 50 | 0 | 0 | 0 | 0 | 0 |
| `weekly_checkin_prompt` | Weekly Checkin Prompt | weekly_checkin_efm/node_content | Title |  |  | 10/0 | ["status"] | 0 | 1 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `weekly_checkins` | Weekly CheckIn Feedback | weekly_checkin_efm/node_content | Title |  | Users weekly details are stored | 0/0 | ["status","promote"] | 1 | 2 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `article` | Article | node/node_content | Title |  | Use articles for time-sensitive content like news, press releases or blog posts. | 0/0 | ["status","promote"] | 1 | 2 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `journey_category` | Journey Category | node/node_content | Title |  | YouThrive Journey Categories | 6/0 | ["status","promote"] | 1 | 1 | 1 | 50 | 0 | 1 | 1 | 0 | 0 |
| `journey_goals` | Journey Goals | node/node_content | Title |  | YouThrive Journey Goals | 153/0 | ["status","promote"] | 1 | 1 | 1 | 50 | 0 | 1 | 1 | 0 | 0 |
| `journey_methods` | Journey Methods | node/node_content | Title |  | YouThrive Journey Methods | 30/0 | ["status","promote"] | 1 | 1 | 1 | 50 | 0 | 1 | 1 | 0 | 0 |
| `page` | Basic page | node/node_content | Title |  | Use basic pages for your static content, such as an 'About us' page. | 4/0 | ["status"] |  | 0 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `public_page` | Public Page | node/node_content | Title |  | A page that will be available to anonymous users. This is required for Terms and Disclosure. | 13/0 | ["status"] | 0 | 0 | 1 | 50 | 0 | 0 | 0 | 0 | 0 |
| `reminder_messages` | Reminder Messages | youthrive_sms_inputs_efm/node_content | Title |  | YouThrive Scheduled Reminder SMS | 1/0 | ["status","promote"] | 1 | 1 | 1 | 50 | 0 | 1 | 1 | 0 | 0 |
| `resources` | Resources | node/node_content | Organization |  | Adds resources content from csv file | 277/0 | ["status"] | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| `twm_achievement_carousel` | TWM Achievement Carousel | node/node_content | Title |  | TWM All Users Achievement Carousel | 0/0 | ["status"] | 0 | 2 | 1 | 50 | 0 | 0 | 1 | 1 | 0 |
| `user_goals` | User Goals | node/node_content | Title |  | User Goals | 14/0 | ["status","promote"] | 1 | 1 | 1 | 50 | 0 | 1 | 1 | 0 | 0 |

Other per-content-type configuration (`variable`): `node_view_permissions_<type>` = 1 means the
*node_view_permissions* module adds "view any/own <type> content" permissions for that type (only `public_page` on
LP). `menu_options_<type>` = menus offered on the node form. `field_bundle_settings_*` = field UI display/weight
settings.

- `field_bundle_settings_flagging__favorite_resource` = 
- `field_bundle_settings_node__drupal_wall` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__journey_category` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__journey_goals` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__journey_methods` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__page` = {"view_modes":{"teaser":{"custom_settings":true},"full":{"custom_settings":false},"rss":{"custom_settings":false},"search_index":{"custom_settings":false},"search_result":{"custom_settings":false}},"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__reminder_messages` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__reminder_sms_inputs` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"0"}},"display":[]}}
- `field_bundle_settings_node__resources` = {"view_modes":{"teaser":{"custom_settings":true},"full":{"custom_settings":false},"rss":{"custom_settings":false},"search_index":{"custom_settings":false},"search_result":{"custom_settings":false}},"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__tech_support` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__thrive_tips` = {"view_modes":{"teaser":{"custom_settings":true},"full":{"custom_settings":false},"rss":{"custom_settings":false},"search_index":{"custom_settings":false},"search_result":{"custom_settings":false}},"extra_fields":{"form":{"title":{"weight":"1"}},"display":[]}}
- `field_bundle_settings_node__twm_achievement_carousel` = {"view_modes":{"full":{"custom_settings":true},"teaser":{"custom_settings":true},"rss":{"custom_settings":false},"search_index":{"custom_settings":false},"search_result":{"custom_settings":false}},"extra_fields":{"form":[],"display":[]}}
- `field_bundle_settings_node__twm_survey_reports` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__user_goals` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"0"}},"display":[]}}
- `field_bundle_settings_node__weekly_checkins` = {"view_modes":{"teaser":{"custom_settings":true},"full":{"custom_settings":false},"rss":{"custom_settings":false},"search_index":{"custom_settings":false},"search_result":{"custom_settings":false}},"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__weekly_checkin_prompt` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"0"}},"display":[]}}
- `field_bundle_settings_profile2__main` = {"view_modes":[],"extra_fields":{"form":[],"display":[]}}
- `field_bundle_settings_taxonomy_term__custom_tracking` = 
- `field_bundle_settings_user__user` = {"view_modes":{"full":{"custom_settings":false}},"extra_fields":{"form":{"masquerade":{"weight":"50"},"ckeditor":{"weight":"10"},"profile_main":{"weight":"0"},"account":{"weight":"-10"},"timezone":{"weight":"6"},"piwik":{"weight":"3"}},"display":{"summary":{"default":{"weight":"5","visible":false}},"masquerade":{"default":{"weight":"50","visible":true}}}}}
- `menu_options_drupal_wall` = 
- `menu_options_journey_category` = 
- `menu_options_journey_goals` = 
- `menu_options_journey_methods` = 
- `menu_options_public_page` = ["main-menu"]
- `menu_options_reminder_messages` = 
- `menu_options_reminder_sms_inputs` = ["main-menu"]
- `menu_options_resources` = 
- `menu_options_tech_support` = 
- `menu_options_thrive_tips` = 
- `menu_options_twm_achievement_carousel` = 
- `menu_options_twm_survey_reports` = 
- `menu_options_user_goals` = 
- `menu_options_weekly_checkins` = ["main-menu"]
- `menu_options_weekly_checkin_prompt` = 
- `menu_parent_drupal_wall` = main-menu:0
- `menu_parent_journey_category` = main-menu:0
- `menu_parent_journey_goals` = main-menu:0
- `menu_parent_journey_methods` = main-menu:0
- `menu_parent_public_page` = main-menu:0
- `menu_parent_reminder_messages` = main-menu:0
- `menu_parent_reminder_sms_inputs` = main-menu:0
- `menu_parent_resources` = main-menu:0
- `menu_parent_tech_support` = main-menu:0
- `menu_parent_thrive_tips` = main-menu:0
- `menu_parent_twm_achievement_carousel` = main-menu:0
- `menu_parent_twm_survey_reports` = main-menu:0
- `menu_parent_user_goals` = main-menu:0
- `menu_parent_weekly_checkins` = main-menu:0
- `menu_parent_weekly_checkin_prompt` = main-menu:0
- `node_view_permissions_article` = 0
- `node_view_permissions_drupal_wall` = 0
- `node_view_permissions_page` = 0
- `node_view_permissions_public_page` = 1
- `node_view_permissions_reminder_sms_inputs` = 0
- `node_view_permissions_thrive_tips` = 0
- `node_view_permissions_weekly_checkins` = 0
- `node_view_permissions_weekly_checkin_prompt` = 0

Deleted/orphan bundle config: variables for a removed type `twm_survey_reports` still exist; field storage
`field_evaluation_result` (list_text h/m/l) and `field_prompt_reference` (entityreference → weekly_checkin_prompt)
exist with no instances and 0 rows.

### 3.3 Field storage definitions (`field_config`) — LP

| field_name | type | module | cardinality | storage table | settings (allowed values / targets) | used in (entity:bundle) | rows in field_data |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | text_with_summary | text | 1 | field_data_body |  | node:article, node:drupal_wall, node:page, node:public_page, node:twm_achievement_carousel | 111 |
| `comment_body` | text_long | text | 1 | field_data_comment_body |  | comment:comment_node_article, comment:comment_node_drupal_wall, comment:comment_node_journey_category, comment:comment_node_journey_goals, comment:comment_node_journey_methods, comment:comment_node_page, comment:comment_node_public_page, comment:comment_node_reminder_messages, comment:comment_node_reminder_sms_inputs, comment:comment_node_resources, comment:comment_node_tech_support, comment:comment_node_thrive_tips, comment:comment_node_twm_achievement_carousel, comment:comment_node_user_goals, comment:comment_node_weekly_checkins, comment:comment_node_weekly_checkin_prompt | 40 |
| `field_about_me` | text_with_summary | text | 1 | field_data_field_about_me |  | profile2:main | 12 |
| `field_address` | text | text | 1 | field_data_field_address | max_length=255 | node:resources | 277 |
| `field_age` | text | text | 1 | field_data_field_age | max_length=255 | profile2:main | 3 |
| `field_alternate_med_message` | text | text | unlimited | field_data_field_alternate_med_message | max_length=255 | node:reminder_sms_inputs | 3 |
| `field_avatar` | text | text | 1 | field_data_field_avatar | max_length=255 | user:user | 13 |
| `field_bg_image` | image | image | 1 | field_data_field_bg_image | uri_scheme=public | user:user | 0 |
| `field_body` | text_with_summary | text | 1 | field_data_field_body |  | node:tech_support | 0 |
| `field_checkin_mms_message` | url | url | 1 | field_data_field_checkin_mms_message |  | field_collection_item:field_my_check_in | 3 |
| `field_checkin_sms_sending_day` | number_integer | number | 1 | field_data_field_checkin_sms_sending_day |  | field_collection_item:field_my_check_in | 3 |
| `field_checkin_text_message` | text | text | 1 | field_data_field_checkin_text_message | max_length=255 | field_collection_item:field_my_check_in | 3 |
| `field_city` | text | text | 1 | field_data_field_city | max_length=255 | node:resources | 277 |
| `field_coach` | entityreference | entityreference | 1 | field_data_field_coach | target_type=user handler=views view={"view_name":"coaches","display_name":"entityreference_1","args":[]} | user:user | 4 |
| `field_comment_id` | number_integer | number | 1 | field_data_field_comment_id |  | node:drupal_wall | 0 |
| `field_comment_image` | image | image | 1 | field_data_field_comment_image | uri_scheme=public | comment:comment_node_drupal_wall | 1 |
| `field_comment_videos` | text | text | 1 | field_data_field_comment_videos | max_length=255 | comment:comment_node_drupal_wall | 0 |
| `field_contact` | text | text | 1 | field_data_field_contact | max_length=255 | node:resources | 276 |
| `field_description` | text_long | text | 1 | field_data_field_description |  | node:thrive_tips | 6 |
| `field_dismiss` | list_boolean | list | 1 | field_data_field_dismiss | allowed: 0=0; 1=1 | node:user_goals | 14 |
| `field_display_day` | number_integer | number | 1 | field_data_field_display_day |  | node:thrive_tips | 110 |
| `field_display_day_two` | number_integer | number | 1 | field_data_field_display_day_two |  | node:thrive_tips | 110 |
| `field_drupal_wall_image_style` | text | text | 1 | field_data_field_drupal_wall_image_style | allowed: _none=-None- ; max_length=255 | node:drupal_wall | 0 |
| `field_drupal_wall_photos` | image | image | 1 | field_data_field_drupal_wall_photos | uri_scheme=public | node:drupal_wall | 15 |
| `field_drupal_wall_videos` | text | text | 1 | field_data_field_drupal_wall_videos | max_length=255 | node:drupal_wall | 0 |
| `field_eligibility` | text_long | text | 1 | field_data_field_eligibility |  | node:resources | 246 |
| `field_evaluation_result` | list_text | list | 1 | field_data_field_evaluation_result | allowed: h=High; m=Med; l=Low |  | 0 |
| `field_feedback_high_long` | text_long | text | 1 | field_data_field_feedback_high_long |  | node:weekly_checkin_prompt | 10 |
| `field_feedback_long` | text_long | text | 1 | field_data_field_feedback_long |  | node:weekly_checkins | 0 |
| `field_feedback_low_long` | text_long | text | 1 | field_data_field_feedback_low_long |  | node:weekly_checkin_prompt | 10 |
| `field_feedback_medium_long` | text_long | text | 1 | field_data_field_feedback_medium_long |  | node:weekly_checkin_prompt | 10 |
| `field_feedback_short` | text_long | text | 1 | field_data_field_feedback_short |  | node:weekly_checkins | 0 |
| `field_first_name` | text | text | 1 | field_data_field_first_name | max_length=255 | user:user | 18 |
| `field_follow_up_survey_reminder` | text | text | 1 | field_data_field_follow_up_survey_reminder | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_goal_created_date` | datetime | date | 1 | field_data_field_goal_created_date | granularity={"day":"day","hour":0,"minute":0,"month":"month","second":0,"year":"year"} ; tz_handling=none | node:user_goals | 14 |
| `field_goal_current_step_descript` | text | text | 1 | field_data_field_goal_current_step_descript | max_length=255 | node:user_goals | 14 |
| `field_goal_end_date` | datetime | date | 1 | field_data_field_goal_end_date | granularity={"day":"day","hour":0,"minute":0,"month":"month","second":0,"year":"year"} ; tz_handling=none | node:user_goals | 14 |
| `field_goal_in` | text | text | 1 | field_data_field_goal_in | max_length=255 | node:user_goals | 7 |
| `field_goal_next_step_description` | text | text | 1 | field_data_field_goal_next_step_description | max_length=255 | node:user_goals | 1 |
| `field_goal_percentage` | number_integer | number | 1 | field_data_field_goal_percentage |  | node:user_goals | 0 |
| `field_goal_step` | text | text | 1 | field_data_field_goal_step | max_length=255 | node:user_goals | 14 |
| `field_goodbye` | text | text | unlimited | field_data_field_goodbye | max_length=255 | node:reminder_sms_inputs | 6 |
| `field_greetings` | text | text | unlimited | field_data_field_greetings | max_length=255 | node:reminder_sms_inputs | 9 |
| `field_hashtags` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_hashtags | vocab=hashtags | node:thrive_tips | 0 |
| `field_hot_topics` | field_collection | field_collection | unlimited | field_data_field_hot_topics | hide_blank_items=1 | node:reminder_messages | 1 |
| `field_hot_topics_mms_messages` | url | url | 1 | field_data_field_hot_topics_mms_messages |  | field_collection_item:field_hot_topics | 1 |
| `field_hot_topics_sms_sending_day` | number_integer | number | 1 | field_data_field_hot_topics_sms_sending_day |  | field_collection_item:field_hot_topics | 1 |
| `field_hot_topics_text_messages` | text | text | 1 | field_data_field_hot_topics_text_messages | max_length=255 | field_collection_item:field_hot_topics | 1 |
| `field_hours` | text_long | text | 1 | field_data_field_hours |  | node:resources | 251 |
| `field_html_content` | text_long | text | 1 | field_data_field_html_content |  | node:thrive_tips | 151 |
| `field_image` | image | image | 1 | field_data_field_image | uri_scheme=public | node:article | 0 |
| `field_imbaaq_category` | taxonomy_term_reference | taxonomy | 1 | field_data_field_imbaaq_category | vocab=thrive_tips_categories | node:thrive_tips | 0 |
| `field_intervention_start_date` | datetime | date | 1 | field_data_field_intervention_start_date | granularity={"month":"month","day":"day","year":"year","hour":0,"minute":0,"second":0} ; tz_handling=none | user:user | 61 |
| `field_journey_category` | entityreference | entityreference | 1 | field_data_field_journey_category | target_type=node handler=base bundles=journey_category | node:journey_methods | 30 |
| `field_journey_category_name` | text | text | 1 | field_data_field_journey_category_name | max_length=255 | node:journey_category | 6 |
| `field_journey_goal_name` | text | text | 1 | field_data_field_journey_goal_name | max_length=255 | node:journey_goals | 153 |
| `field_journey_method` | entityreference | entityreference | 1 | field_data_field_journey_method | target_type=node handler=base bundles=journey_methods | node:journey_goals | 153 |
| `field_journey_method_name` | text | text | 1 | field_data_field_journey_method_name | max_length=255 | node:journey_methods | 30 |
| `field_less_adherent_feedback` | text_long | text | 1 | field_data_field_less_adherent_feedback |  | node:weekly_checkin_prompt | 0 |
| `field_likert_prompt_value` | text | text | 1 | field_data_field_likert_prompt_value | max_length=255 | node:weekly_checkins | 0 |
| `field_link` | url | url | 1 | field_data_field_link |  | node:thrive_tips | 0 |
| `field_location` | text | text | 1 | field_data_field_location | max_length=255 | user:user | 2 |
| `field_medication_taking_feedback` | text_long | text | 1 | field_data_field_medication_taking_feedback |  | node:weekly_checkin_prompt | 0 |
| `field_mood_message_response` | text | text | unlimited | field_data_field_mood_message_response | max_length=255 | node:reminder_sms_inputs | 18 |
| `field_mood_response_message` | text | text | 1 | field_data_field_mood_response_message | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_more_adherent_feedback` | text_long | text | 1 | field_data_field_more_adherent_feedback |  | node:weekly_checkin_prompt | 0 |
| `field_my_check_in` | field_collection | field_collection | unlimited | field_data_field_my_check_in | hide_blank_items=1 | node:reminder_messages | 3 |
| `field_my_journey` | field_collection | field_collection | unlimited | field_data_field_my_journey | hide_blank_items=1 | node:reminder_messages | 2 |
| `field_my_journey_mms_messages` | url | url | 1 | field_data_field_my_journey_mms_messages |  | field_collection_item:field_my_journey | 2 |
| `field_my_journey_sms_sending_day` | number_integer | number | 1 | field_data_field_my_journey_sms_sending_day |  | field_collection_item:field_my_journey | 2 |
| `field_my_journey_text_messages` | text | text | 1 | field_data_field_my_journey_text_messages | max_length=255 | field_collection_item:field_my_journey | 2 |
| `field_my_points` | field_collection | field_collection | unlimited | field_data_field_my_points | hide_blank_items=1 | node:reminder_messages | 2 |
| `field_my_points_mms_message` | url | url | 1 | field_data_field_my_points_mms_message |  | field_collection_item:field_my_points | 0 |
| `field_my_points_sms_sending_day` | number_integer | number | 1 | field_data_field_my_points_sms_sending_day |  | field_collection_item:field_my_points | 2 |
| `field_my_points_text_message` | text | text | 1 | field_data_field_my_points_text_message | max_length=255 | field_collection_item:field_my_points | 2 |
| `field_my_thrive_tips` | field_collection | field_collection | unlimited | field_data_field_my_thrive_tips | hide_blank_items=1 | node:reminder_messages | 2 |
| `field_none_prompted_responses` | text | text | 1 | field_data_field_none_prompted_responses | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_none_response_mood_status` | text | text | 1 | field_data_field_none_response_mood_status | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_number` | text | text | 1 | field_data_field_number | max_length=255 | user:user | 0 |
| `field_open_ended_prompt_instruct` | text_long | text | 1 | field_data_field_open_ended_prompt_instruct |  | node:weekly_checkin_prompt | 10 |
| `field_open_ended_prompt_text` | text_long | text | 1 | field_data_field_open_ended_prompt_text |  | node:weekly_checkin_prompt | 10 |
| `field_open_ended_prompt_value` | text_long | text | 1 | field_data_field_open_ended_prompt_value |  | node:weekly_checkins | 0 |
| `field_operator` | list_text | list | 1 | field_data_field_operator | allowed: <=less than(<); >=greater than (>); ==equal to (=); <==less than or equal to (<=); >==greater than or equal to (>=); !== not equal to ( !=) | node:thrive_tips | 0 |
| `field_own_category` | text | text | 1 | field_data_field_own_category | max_length=255 | node:user_goals | 0 |
| `field_own_goals` | text | text | 1 | field_data_field_own_goals | max_length=255 | node:user_goals | 3 |
| `field_post_bg` | text | text | 1 | field_data_field_post_bg | max_length=255 | node:drupal_wall | 0 |
| `field_prompt_options` | text_long | text | 1 | field_data_field_prompt_options |  | node:weekly_checkin_prompt | 10 |
| `field_prompt_reference` | entityreference | entityreference | 1 | field_data_field_prompt_reference | target_type=node handler=base bundles=weekly_checkin_prompt |  | 0 |
| `field_prompt_text` | text_long | text | 1 | field_data_field_prompt_text |  | node:weekly_checkin_prompt | 10 |
| `field_pronoun` | text | text | 1 | field_data_field_pronoun | max_length=255 | profile2:main | 0 |
| `field_pullquote` | text_long | text | 1 | field_data_field_pullquote |  | node:thrive_tips | 0 |
| `field_rating` | fivestar | fivestar | 1 | field_data_field_rating | axis=vote | node:resources | 0 |
| `field_reminder_med_message` | text | text | 1 | field_data_field_reminder_med_message | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_reminder_message_response` | text | text | unlimited | field_data_field_reminder_message_response | max_length=255 | node:reminder_sms_inputs | 9 |
| `field_reminder_skipping_today` | text | text | 1 | field_data_field_reminder_skipping_today | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_resource_description` | text_long | text | 1 | field_data_field_resource_description |  | node:resources | 277 |
| `field_resource_tag` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_resource_tag | vocab=resource_tags | node:resources | 1374 |
| `field_resource_tags` | text_long | text | 1 | field_data_field_resource_tags |  | node:resources | 258 |
| `field_role_changed_date` | text | text | 1 | field_data_field_role_changed_date | max_length=255 | user:user | 0 |
| `field_scheduling` | text_long | text | 1 | field_data_field_scheduling |  | node:resources | 256 |
| `field_select_pdf_file` | file | file | 1 | field_data_field_select_pdf_file | uri_scheme=public ; display_field=0 | node:thrive_tips | 0 |
| `field_sequence_prompt_number_` | list_integer | list | 1 | field_data_field_sequence_prompt_number_ | allowed: 1=1; 2=2; 3=3; 4=4; 5=5; 6=6; 7=7; 8=8; 9=9; 10=10 | node:weekly_checkin_prompt | 10 |
| `field_standard_med_message` | text | text | unlimited | field_data_field_standard_med_message | max_length=255 | node:reminder_sms_inputs | 3 |
| `field_state` | text | text | 1 | field_data_field_state | max_length=255 | node:resources | 277 |
| `field_status` | text_long | text | 1 | field_data_field_status |  | node:resources | 70 |
| `field_sticker` | text | text | 1 | field_data_field_sticker | max_length=255 | user:user | 12 |
| `field_study_id` | text | text | 1 | field_data_field_study_id | max_length=255 | user:user | 22 |
| `field_tags` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_tags | vocab=tags | node:article | 0 |
| `field_template` | list_text | list | 1 | field_data_field_template | allowed: text_linequote=Text in paragraphs with linequote; text_blockquote=Text in paragraphs with blockquote; text_paragraph=Text in paragraph with paragraph quote; image_only=Image only; image_text=Image accompanied by text; video_only=Video only; video_text=Video accompanied by text; text_bullet=Text in paragraphs and bullet points | node:thrive_tips | 21 |
| `field_tests` | text_long | text | 1 | field_data_field_tests |  | node:resources | 245 |
| `field_theme` | list_text | list | 1 | field_data_field_theme | allowed: theme-1=Theme-1; theme-2=Theme-2; theme-3=Theme-3; theme-4=Theme-4 | user:user | 60 |
| `field_thrive_tags` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_thrive_tags | vocab=thrive_tips_tags | node:thrive_tips | 436 |
| `field_thrive_tips_mms_message` | url | url | 1 | field_data_field_thrive_tips_mms_message |  | field_collection_item:field_my_thrive_tips | 1 |
| `field_thrive_tips_text_message` | text | text | 1 | field_data_field_thrive_tips_text_message | max_length=255 | field_collection_item:field_my_thrive_tips | 2 |
| `field_thrivetips_sms_sending_day` | number_integer | number | 1 | field_data_field_thrivetips_sms_sending_day |  | field_collection_item:field_my_thrive_tips | 2 |
| `field_tip_type` | list_text | list | 1 | field_data_field_tip_type | allowed: Pdf=Pdf; Video=Video; Html=Html; Offsite Content=Offsite Content | node:thrive_tips | 157 |
| `field_user_category_id` | entityreference | entityreference | 1 | field_data_field_user_category_id | target_type=node handler=base bundles=journey_category | node:user_goals | 14 |
| `field_user_field` | list_text | list | 1 | field_data_field_user_field | allowed: i1=i1; i2=i2; i3=i3; i4=i4; i5=i5; i6=i6; i7=i7; i8=i8; i9=i9; m1=m1; m2=m2; m3=m3; m4=m4; m5=m5; m6=m6; m7=m7; m8=m8; m9=m9; b1=b1; b2=b2; b3=b3; b4=b4; b5=b5; b6=b6; b7=b7; b8=b8; b9=b9; b10=b10; b11=b11; b12=b12; b13=b13; b14=b14; b15=b15; b16=b16; b17=b17 | node:thrive_tips | 0 |
| `field_user_goal_category_name` | text | text | 1 | field_data_field_user_goal_category_name | max_length=255 | node:user_goals | 14 |
| `field_user_goal_id` | entityreference | entityreference | 1 | field_data_field_user_goal_id | target_type=node handler=base bundles=journey_goals | node:user_goals | 11 |
| `field_user_goal_method_name` | text | text | 1 | field_data_field_user_goal_method_name | max_length=255 | node:user_goals | 14 |
| `field_user_goal_name` | text | text | 1 | field_data_field_user_goal_name | max_length=255 | node:user_goals | 11 |
| `field_user_id` | text | text | 1 | field_data_field_user_id | max_length=255 | node:weekly_checkins | 0 |
| `field_user_method_id` | entityreference | entityreference | 1 | field_data_field_user_method_id | target_type=node handler=base bundles=journey_methods | node:user_goals | 14 |
| `field_user_picture` | text | text | 1 | field_data_field_user_picture | max_length=255 | user:user | 9 |
| `field_user_pronoun` | text | text | 1 | field_data_field_user_pronoun | max_length=255 | user:user | 6 |
| `field_value` | number_integer | number | 1 | field_data_field_value |  | node:thrive_tips | 0 |
| `field_video_link` | video_embed_field | video_embed_field | 1 | field_data_field_video_link |  | node:page, node:thrive_tips | 35 |
| `field_wall_visit` | text | text | 1 | field_data_field_wall_visit | max_length=255 | user:user | 50 |
| `field_website` | text | text | 1 | field_data_field_website | max_length=255 | node:resources | 275 |
| `field_weekly_reminder_sms_text` | text | text | 1 | field_data_field_weekly_reminder_sms_text | max_length=255 | node:reminder_sms_inputs | 1 |
| `field_weekly_sms_date_time` | text | text | 1 | field_data_field_weekly_sms_date_time | max_length=255 | user:user | 0 |
| `field_youthrive_tags` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_youthrive_tags | vocab=youthrive_tags | node:drupal_wall | 8 |
| `field_zip` | text | text | 1 | field_data_field_zip | max_length=255 | node:resources | 274 |
| `field_zoom_link` | url | url | 1 | field_data_field_zoom_link |  | user:user | 4 |


### 3.4 Field value columns (legacy column names) — LP

Each field's value table is `field_data_<field_name>` (history: `field_revision_<field_name>`), with the common
columns from §1 plus:

| field_name | columns (legacy column => type) |
| --- | --- |
| `body` | body_value:text/big, body_summary:text/big, body_format:varchar(255) |
| `comment_body` | comment_body_value:text/big, comment_body_format:varchar(255) |
| `field_about_me` | field_about_me_value:text/big, field_about_me_summary:text/big, field_about_me_format:varchar(255) |
| `field_address` | field_address_value:varchar(255), field_address_format:varchar(255) |
| `field_age` | field_age_value:varchar(255), field_age_format:varchar(255) |
| `field_alternate_med_message` | field_alternate_med_message_value:varchar(255), field_alternate_med_message_format:varchar(255) |
| `field_avatar` | field_avatar_value:varchar(255), field_avatar_format:varchar(255) |
| `field_bg_image` | field_bg_image_fid:int, field_bg_image_alt:varchar(512), field_bg_image_title:varchar(1024), field_bg_image_width:int, field_bg_image_height:int |
| `field_body` | field_body_value:text/big, field_body_summary:text/big, field_body_format:varchar(255) |
| `field_checkin_mms_message` | field_checkin_mms_message_value:text/big, field_checkin_mms_message_title:varchar(1024), field_checkin_mms_message_attributes:blob/big |
| `field_checkin_sms_sending_day` | field_checkin_sms_sending_day_value:int |
| `field_checkin_text_message` | field_checkin_text_message_value:varchar(255), field_checkin_text_message_format:varchar(255) |
| `field_city` | field_city_value:varchar(255), field_city_format:varchar(255) |
| `field_coach` | field_coach_target_id:int |
| `field_comment_id` | field_comment_id_value:int |
| `field_comment_image` | field_comment_image_fid:int, field_comment_image_alt:varchar(512), field_comment_image_title:varchar(1024), field_comment_image_width:int, field_comment_image_height:int |
| `field_comment_videos` | field_comment_videos_value:varchar(255), field_comment_videos_format:varchar(255) |
| `field_contact` | field_contact_value:varchar(255), field_contact_format:varchar(255) |
| `field_description` | field_description_value:text/big, field_description_format:varchar(255) |
| `field_dismiss` | field_dismiss_value:int |
| `field_display_day` | field_display_day_value:int |
| `field_display_day_two` | field_display_day_two_value:int |
| `field_drupal_wall_image_style` | field_drupal_wall_image_style_value:varchar(255), field_drupal_wall_image_style_format:varchar(255) |
| `field_drupal_wall_photos` | field_drupal_wall_photos_fid:int, field_drupal_wall_photos_alt:varchar(512), field_drupal_wall_photos_title:varchar(1024), field_drupal_wall_photos_width:int, field_drupal_wall_photos_height:int |
| `field_drupal_wall_videos` | field_drupal_wall_videos_value:varchar(255), field_drupal_wall_videos_format:varchar(255) |
| `field_eligibility` | field_eligibility_value:text/big, field_eligibility_format:varchar(255) |
| `field_evaluation_result` | field_evaluation_result_value:varchar(255) |
| `field_feedback_high_long` | field_feedback_high_long_value:text/big, field_feedback_high_long_format:varchar(255) |
| `field_feedback_long` | field_feedback_long_value:text/big, field_feedback_long_format:varchar(255) |
| `field_feedback_low_long` | field_feedback_low_long_value:text/big, field_feedback_low_long_format:varchar(255) |
| `field_feedback_medium_long` | field_feedback_medium_long_value:text/big, field_feedback_medium_long_format:varchar(255) |
| `field_feedback_short` | field_feedback_short_value:text/big, field_feedback_short_format:varchar(255) |
| `field_first_name` | field_first_name_value:varchar(255), field_first_name_format:varchar(255) |
| `field_follow_up_survey_reminder` | field_follow_up_survey_reminder_value:varchar(255), field_follow_up_survey_reminder_format:varchar(255) |
| `field_goal_created_date` | field_goal_created_date_value:datetime |
| `field_goal_current_step_descript` | field_goal_current_step_descript_value:varchar(255), field_goal_current_step_descript_format:varchar(255) |
| `field_goal_end_date` | field_goal_end_date_value:datetime |
| `field_goal_in` | field_goal_in_value:varchar(255), field_goal_in_format:varchar(255) |
| `field_goal_next_step_description` | field_goal_next_step_description_value:varchar(255), field_goal_next_step_description_format:varchar(255) |
| `field_goal_percentage` | field_goal_percentage_value:int |
| `field_goal_step` | field_goal_step_value:varchar(255), field_goal_step_format:varchar(255) |
| `field_goodbye` | field_goodbye_value:varchar(255), field_goodbye_format:varchar(255) |
| `field_greetings` | field_greetings_value:varchar(255), field_greetings_format:varchar(255) |
| `field_hashtags` | field_hashtags_tid:int |
| `field_hot_topics` | field_hot_topics_value:int, field_hot_topics_revision_id:int |
| `field_hot_topics_mms_messages` | field_hot_topics_mms_messages_value:text/big, field_hot_topics_mms_messages_title:varchar(1024), field_hot_topics_mms_messages_attributes:blob/big |
| `field_hot_topics_sms_sending_day` | field_hot_topics_sms_sending_day_value:int |
| `field_hot_topics_text_messages` | field_hot_topics_text_messages_value:varchar(255), field_hot_topics_text_messages_format:varchar(255) |
| `field_hours` | field_hours_value:text/big, field_hours_format:varchar(255) |
| `field_html_content` | field_html_content_value:text/big, field_html_content_format:varchar(255) |
| `field_image` | field_image_fid:int, field_image_alt:varchar(512), field_image_title:varchar(1024), field_image_width:int, field_image_height:int |
| `field_imbaaq_category` | field_imbaaq_category_tid:int |
| `field_intervention_start_date` | field_intervention_start_date_value:datetime |
| `field_journey_category` | field_journey_category_target_id:int |
| `field_journey_category_name` | field_journey_category_name_value:varchar(255), field_journey_category_name_format:varchar(255) |
| `field_journey_goal_name` | field_journey_goal_name_value:varchar(255), field_journey_goal_name_format:varchar(255) |
| `field_journey_method` | field_journey_method_target_id:int |
| `field_journey_method_name` | field_journey_method_name_value:varchar(255), field_journey_method_name_format:varchar(255) |
| `field_less_adherent_feedback` | field_less_adherent_feedback_value:text/big, field_less_adherent_feedback_format:varchar(255) |
| `field_likert_prompt_value` | field_likert_prompt_value_value:varchar(255), field_likert_prompt_value_format:varchar(255) |
| `field_link` | field_link_value:text/big, field_link_title:varchar(1024), field_link_attributes:blob/big |
| `field_location` | field_location_value:varchar(255), field_location_format:varchar(255) |
| `field_medication_taking_feedback` | field_medication_taking_feedback_value:text/big, field_medication_taking_feedback_format:varchar(255) |
| `field_mood_message_response` | field_mood_message_response_value:varchar(255), field_mood_message_response_format:varchar(255) |
| `field_mood_response_message` | field_mood_response_message_value:varchar(255), field_mood_response_message_format:varchar(255) |
| `field_more_adherent_feedback` | field_more_adherent_feedback_value:text/big, field_more_adherent_feedback_format:varchar(255) |
| `field_my_check_in` | field_my_check_in_value:int, field_my_check_in_revision_id:int |
| `field_my_journey` | field_my_journey_value:int, field_my_journey_revision_id:int |
| `field_my_journey_mms_messages` | field_my_journey_mms_messages_value:text/big, field_my_journey_mms_messages_title:varchar(1024), field_my_journey_mms_messages_attributes:blob/big |
| `field_my_journey_sms_sending_day` | field_my_journey_sms_sending_day_value:int |
| `field_my_journey_text_messages` | field_my_journey_text_messages_value:varchar(255), field_my_journey_text_messages_format:varchar(255) |
| `field_my_points` | field_my_points_value:int, field_my_points_revision_id:int |
| `field_my_points_mms_message` | field_my_points_mms_message_value:text/big, field_my_points_mms_message_title:varchar(1024), field_my_points_mms_message_attributes:blob/big |
| `field_my_points_sms_sending_day` | field_my_points_sms_sending_day_value:int |
| `field_my_points_text_message` | field_my_points_text_message_value:varchar(255), field_my_points_text_message_format:varchar(255) |
| `field_my_thrive_tips` | field_my_thrive_tips_value:int, field_my_thrive_tips_revision_id:int |
| `field_none_prompted_responses` | field_none_prompted_responses_value:varchar(255), field_none_prompted_responses_format:varchar(255) |
| `field_none_response_mood_status` | field_none_response_mood_status_value:varchar(255), field_none_response_mood_status_format:varchar(255) |
| `field_number` | field_number_value:varchar(255), field_number_format:varchar(255) |
| `field_open_ended_prompt_instruct` | field_open_ended_prompt_instruct_value:text/big, field_open_ended_prompt_instruct_format:varchar(255) |
| `field_open_ended_prompt_text` | field_open_ended_prompt_text_value:text/big, field_open_ended_prompt_text_format:varchar(255) |
| `field_open_ended_prompt_value` | field_open_ended_prompt_value_value:text/big, field_open_ended_prompt_value_format:varchar(255) |
| `field_operator` | field_operator_value:varchar(255) |
| `field_own_category` | field_own_category_value:varchar(255), field_own_category_format:varchar(255) |
| `field_own_goals` | field_own_goals_value:varchar(255), field_own_goals_format:varchar(255) |
| `field_post_bg` | field_post_bg_value:varchar(255), field_post_bg_format:varchar(255) |
| `field_prompt_options` | field_prompt_options_value:text/big, field_prompt_options_format:varchar(255) |
| `field_prompt_reference` | field_prompt_reference_target_id:int |
| `field_prompt_text` | field_prompt_text_value:text/big, field_prompt_text_format:varchar(255) |
| `field_pronoun` | field_pronoun_value:varchar(255), field_pronoun_format:varchar(255) |
| `field_pullquote` | field_pullquote_value:text/big, field_pullquote_format:varchar(255) |
| `field_rating` | field_rating_rating:int, field_rating_target:int |
| `field_reminder_med_message` | field_reminder_med_message_value:varchar(255), field_reminder_med_message_format:varchar(255) |
| `field_reminder_message_response` | field_reminder_message_response_value:varchar(255), field_reminder_message_response_format:varchar(255) |
| `field_reminder_skipping_today` | field_reminder_skipping_today_value:varchar(255), field_reminder_skipping_today_format:varchar(255) |
| `field_resource_description` | field_resource_description_value:text/big, field_resource_description_format:varchar(255) |
| `field_resource_tag` | field_resource_tag_tid:int |
| `field_resource_tags` | field_resource_tags_value:text/big, field_resource_tags_format:varchar(255) |
| `field_role_changed_date` | field_role_changed_date_value:varchar(255), field_role_changed_date_format:varchar(255) |
| `field_scheduling` | field_scheduling_value:text/big, field_scheduling_format:varchar(255) |
| `field_select_pdf_file` | field_select_pdf_file_fid:int, field_select_pdf_file_display:int/tiny, field_select_pdf_file_description:text |
| `field_sequence_prompt_number_` | field_sequence_prompt_number__value:int |
| `field_standard_med_message` | field_standard_med_message_value:varchar(255), field_standard_med_message_format:varchar(255) |
| `field_state` | field_state_value:varchar(255), field_state_format:varchar(255) |
| `field_status` | field_status_value:text/big, field_status_format:varchar(255) |
| `field_sticker` | field_sticker_value:varchar(255), field_sticker_format:varchar(255) |
| `field_study_id` | field_study_id_value:varchar(255), field_study_id_format:varchar(255) |
| `field_tags` | field_tags_tid:int |
| `field_template` | field_template_value:varchar(255) |
| `field_tests` | field_tests_value:text/big, field_tests_format:varchar(255) |
| `field_theme` | field_theme_value:varchar(255) |
| `field_thrive_tags` | field_thrive_tags_tid:int |
| `field_thrive_tips_mms_message` | field_thrive_tips_mms_message_value:text/big, field_thrive_tips_mms_message_title:varchar(1024), field_thrive_tips_mms_message_attributes:blob/big |
| `field_thrive_tips_text_message` | field_thrive_tips_text_message_value:varchar(255), field_thrive_tips_text_message_format:varchar(255) |
| `field_thrivetips_sms_sending_day` | field_thrivetips_sms_sending_day_value:int |
| `field_tip_type` | field_tip_type_value:varchar(255) |
| `field_user_category_id` | field_user_category_id_target_id:int |
| `field_user_field` | field_user_field_value:varchar(255) |
| `field_user_goal_category_name` | field_user_goal_category_name_value:varchar(255), field_user_goal_category_name_format:varchar(255) |
| `field_user_goal_id` | field_user_goal_id_target_id:int |
| `field_user_goal_method_name` | field_user_goal_method_name_value:varchar(255), field_user_goal_method_name_format:varchar(255) |
| `field_user_goal_name` | field_user_goal_name_value:varchar(255), field_user_goal_name_format:varchar(255) |
| `field_user_id` | field_user_id_value:varchar(255), field_user_id_format:varchar(255) |
| `field_user_method_id` | field_user_method_id_target_id:int |
| `field_user_picture` | field_user_picture_value:varchar(255), field_user_picture_format:varchar(255) |
| `field_user_pronoun` | field_user_pronoun_value:varchar(255), field_user_pronoun_format:varchar(255) |
| `field_value` | field_value_value:int |
| `field_video_link` | field_video_link_video_url:varchar(512), field_video_link_thumbnail_path:varchar(512), field_video_link_video_data:blob/big, field_video_link_embed_code:varchar(1024), field_video_link_description:text |
| `field_wall_visit` | field_wall_visit_value:varchar(255), field_wall_visit_format:varchar(255) |
| `field_website` | field_website_value:varchar(255), field_website_format:varchar(255) |
| `field_weekly_reminder_sms_text` | field_weekly_reminder_sms_text_value:varchar(255), field_weekly_reminder_sms_text_format:varchar(255) |
| `field_weekly_sms_date_time` | field_weekly_sms_date_time_value:varchar(255), field_weekly_sms_date_time_format:varchar(255) |
| `field_youthrive_tags` | field_youthrive_tags_tid:int |
| `field_zip` | field_zip_value:varchar(255), field_zip_format:varchar(255) |
| `field_zoom_link` | field_zoom_link_value:text/big, field_zoom_link_title:varchar(1024), field_zoom_link_attributes:blob/big |


### 3.5 Field instances per bundle (`field_config_instance`) — LP

Order = form widget weight. `card.` = cardinality (∞ = unlimited). `req` = required. `default` = instance default
value. Notes include help text shown on the form and instance settings (file extensions, min/max, etc.).
"shown on registration" = `user_register_form` enabled (field appears on the admin "add user" form).


#### comment : comment_node_article

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_drupal_wall

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |
| `field_comment_image` | comment image | image | 1 |  | image_image |  | file_extensions=png gif jpg jpeg |
| `field_comment_videos` | comment_videos | text | 1 |  | text_textfield |  |  |

#### comment : comment_node_journey_category

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_journey_goals

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_journey_methods

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_public_page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_reminder_messages

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_reminder_sms_inputs

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_resources

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_tech_support

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_thrive_tips

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_twm_achievement_carousel

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_user_goals

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_weekly_checkin_prompt

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_weekly_checkins

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### field_collection_item : field_hot_topics

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_hot_topics_sms_sending_day` | Hot Topics SMS Sending Day | number_integer | 1 |  | number |  | help: Enter SMS Sending Day |
| `field_hot_topics_text_messages` | Hot Topics Text Messages | text | 1 |  | text_textfield |  | help: Hot Topics Text Messages |
| `field_hot_topics_mms_messages` | Hot Topics MMS Messages | url | 1 |  | url_external |  | help: Hot Topics MMS Messages |

#### field_collection_item : field_my_check_in

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_checkin_sms_sending_day` | Checkin SMS Sending Day | number_integer | 1 |  | number |  | help: Enter SMS Sending Day |
| `field_checkin_text_message` | Checkin Text Message | text | 1 |  | text_textfield |  |  |
| `field_checkin_mms_message` | Checkin MMS Message | url | 1 |  | url_external |  | help: Checkin MMS Message |

#### field_collection_item : field_my_journey

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_my_journey_sms_sending_day` | My Journey SMS Sending Day | number_integer | 1 |  | number |  | help: Enter SMS Sending Day |
| `field_my_journey_text_messages` | My Journey Text Messages | text | 1 |  | text_textfield |  | help: My Journey Text Messages |
| `field_my_journey_mms_messages` | My Journey MMS Messages | url | 1 |  | url_external |  | help: My Journey MMS Message URL |

#### field_collection_item : field_my_points

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_my_points_sms_sending_day` | My Points SMS Sending Day | number_integer | 1 |  | number |  | help: Enter SMS Sending Day |
| `field_my_points_text_message` | My Points Text Message | text | 1 |  | text_textfield |  | help: My Points Text Message |
| `field_my_points_mms_message` | My Points MMS Message | url | 1 |  | url_external |  | help: My Points MMS Message |

#### field_collection_item : field_my_thrive_tips

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_thrivetips_sms_sending_day` | ThriveTips SMS Sending Day | number_integer | 1 |  | number |  | help: Enter SMS Sending Day |
| `field_thrive_tips_text_message` | Thrive Tips Text Message | text | 1 |  | text_textfield |  | help: Thrive Tips Text Message |
| `field_thrive_tips_mms_message` | Thrive Tips MMS Message | url | 1 |  | url_external |  | help: Thrive Tips MMS Message |

#### node : article

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |
| `field_tags` | Tags | taxonomy_term_reference | ∞ |  | taxonomy_autocomplete |  | help: Enter a comma-separated list of words to describe your content. |
| `field_image` | Image | image | 1 |  | image_image |  | help: Upload an image to go with this article. ; file_directory=field/image ; file_extensions=png gif jpg jpeg |

#### node : drupal_wall

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_youthrive_tags` | youthrive_tags | taxonomy_term_reference | ∞ |  | taxonomy_autocomplete |  |  |
| `body` | What's on your mind? | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |
| `field_drupal_wall_photos` | Share Photo | image | 1 |  | image_image |  | file_extensions=png gif jpg jpeg |
| `field_drupal_wall_videos` | Share Videos | text | 1 |  | text_textfield |  |  |
| `field_drupal_wall_image_style` | Image Style | text | 1 |  | text_textfield |  |  |
| `field_post_bg` | Post Background Color | text | 1 |  | text_textfield |  | help: Note: There should exist a class with this name, then only it would be applicable for the post. |
| `field_comment_id` | Comment ID | number_integer | 1 |  | number |  |  |

#### node : journey_category

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_journey_category_name` | Journey Category Name | text | 1 |  | text_textfield |  |  |

#### node : journey_goals

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_journey_method` | Journey Method | entityreference | 1 |  | options_select |  | help: YouThrive Parent Journey Method |
| `field_journey_goal_name` | Journey Goal Name | text | 1 |  | text_textfield |  |  |

#### node : journey_methods

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_journey_category` | Journey Category | entityreference | 1 |  | options_select |  |  |
| `field_journey_method_name` | Journey Method Name | text | 1 |  | text_textfield |  |  |

#### node : page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |
| `field_video_link` | Video Link | video_embed_field | 1 |  | video_embed_field_video |  |  |

#### node : public_page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |

#### node : reminder_messages

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_my_check_in` | My Check-In | field_collection | ∞ |  | field_collection_fieldset |  | help: My Check-In Reminder SMS |
| `field_my_thrive_tips` | My Thrive Tips | field_collection | ∞ |  | field_collection_fieldset |  | help: My Thrive Tips SMS |
| `field_hot_topics` | Hot Topics | field_collection | ∞ |  | field_collection_fieldset |  | help: Hot Topics Reminder Messages |
| `field_my_journey` | My Journey | field_collection | ∞ |  | field_collection_fieldset |  | help: My Journey Reminders |
| `field_my_points` | My Points | field_collection | ∞ |  | field_collection_fieldset |  | help: My Points Reminder Messages |

#### node : reminder_sms_inputs

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_greetings` | greetings | text | ∞ |  | text_textfield |  |  |
| `field_standard_med_message` | standard med message | text | ∞ |  | text_textfield |  |  |
| `field_alternate_med_message` | alternate med message | text | ∞ |  | text_textfield |  |  |
| `field_reminder_med_message` | reminder med message | text | 1 |  | text_textfield |  |  |
| `field_goodbye` | goodbye | text | ∞ |  | text_textfield |  |  |
| `field_none_prompted_responses` | none responses daily remainder | text | 1 |  | text_textfield |  |  |
| `field_mood_response_message` | mood response message | text | 1 |  | text_textfield |  |  |
| `field_none_response_mood_status` | none response mood status | text | 1 |  | text_textfield |  |  |
| `field_weekly_reminder_sms_text` | weekly reminder sms text | text | 1 |  | text_textfield |  |  |
| `field_reminder_message_response` | reminder message response | text | ∞ |  | text_textfield |  |  |
| `field_mood_message_response` | mood message response | text | ∞ |  | text_textfield |  |  |
| `field_reminder_skipping_today` | reminder skipping today message | text | 1 |  | text_textfield |  |  |
| `field_follow_up_survey_reminder` | Follow-up Survey Reminder Message | text | 1 |  | text_textfield |  |  |

#### node : resources

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_address` | Address | text | 1 |  | text_textfield |  |  |
| `field_state` | State | text | 1 |  | text_textfield |  |  |
| `field_city` | City | text | 1 |  | text_textfield |  |  |
| `field_zip` | Zip | text | 1 |  | text_textfield |  |  |
| `field_website` | Website | text | 1 |  | text_textfield |  |  |
| `field_contact` | Contact | text | 1 |  | text_textfield |  |  |
| `field_hours` | Hours | text_long | 1 |  | text_textarea rows=3 |  | text_processing=1 |
| `field_eligibility` | Eligibility | text_long | 1 |  | text_textarea rows=4 |  |  |
| `field_scheduling` | Scheduling | text_long | 1 |  | text_textarea rows=3 |  |  |
| `field_status` | Covid-19 Updates | text_long | 1 |  | text_textarea rows=3 |  |  |
| `field_tests` | Insurance Status | text_long | 1 |  | text_textarea rows=4 |  |  |
| `field_resource_tags` | Resource Tags | text_long | 1 |  | text_textarea rows=3 |  |  |
| `field_resource_description` | Description | text_long | 1 |  | text_textarea rows=5 | [{"value":"Testing Center"}] |  |
| `field_resource_tag` | Resource Tags | taxonomy_term_reference | ∞ |  | taxonomy_autocomplete |  |  |
| `field_rating` | rate this resource | fivestar | 1 |  | exposed |  | stars=5 ; allow_revote=1 ; allow_ownvote=1 ; target=none |

#### node : tech_support

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  |  |

#### node : thrive_tips

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_hashtags` | Hashtags | taxonomy_term_reference | ∞ |  | taxonomy_autocomplete |  |  |
| `field_display_day` | Days relative to user created date | number_integer | 1 |  | number |  | help: Relative number of days to schedule this power up from User Account Created event. 1 = created day, 5 = 5 days from created day, etc. Acceptable range is 1=90. After 90, field two (below) is used. ; min=1 ; max=90 |
| `field_display_day_two` | Days relative to user created date | number_integer | 1 |  | number |  | help: Relative number of days to schedule this power up from Day 91. 1 = day 91, 5 = day 96, etc. Acceptable range is 1=90. ; min=1 ; max=90 |
| `field_tip_type` | Tip Type | list_text | 1 | Y | options_select |  |  |
| `field_description` | Short Description | text_long | 1 |  | text_textarea rows=4 |  | text_processing=1 |
| `field_pullquote` | Pullquote | text_long | 1 |  | text_textarea rows=5 |  |  |
| `field_template` | Template Style | list_text | 1 |  | options_select |  |  |
| `field_select_pdf_file` | Attach a PDF | file | 1 |  | file_generic |  | file_extensions=pdf |
| `field_video_link` | Video Link | video_embed_field | 1 |  | video_embed_field_video |  |  |
| `field_html_content` | Short Description | text_long | 1 |  | text_textarea rows=5 |  | text_processing=1 |
| `field_thrive_tags` | Tags | taxonomy_term_reference | ∞ | Y | options_select |  |  |
| `field_imbaaq_category` | Category | taxonomy_term_reference | 1 |  | options_select |  |  |
| `field_user_field` | user field | list_text | 1 |  | options_select |  |  |
| `field_operator` | operator | list_text | 1 |  | options_select |  |  |
| `field_value` | value | number_integer | 1 |  | number |  |  |
| `field_link` | Link | url | 1 |  | url_external |  |  |

#### node : twm_achievement_carousel

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | TWM Achievement Carousel Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | help: TWM Achievement Carousel Body ; text_processing=1 |

#### node : user_goals

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_user_category_id` | user category id | entityreference | 1 |  | options_select |  |  |
| `field_user_goal_category_name` | user goal category name | text | 1 |  | text_textfield |  |  |
| `field_user_method_id` | user method id | entityreference | 1 |  | options_select |  |  |
| `field_user_goal_method_name` | user goal method name | text | 1 |  | text_textfield |  |  |
| `field_user_goal_id` | user goal id | entityreference | 1 |  | options_select |  |  |
| `field_user_goal_name` | user goal name | text | 1 |  | text_textfield |  |  |
| `field_goal_created_date` | goal created date | datetime | 1 |  | date_popup fmt=m/d/Y - H:i:s |  |  |
| `field_goal_end_date` | goal end date | datetime | 1 |  | date_popup fmt=m/d/Y - H:i:s |  |  |
| `field_own_category` | own category | text | 1 |  | text_textfield |  |  |
| `field_own_goals` | own goals | text | 1 |  | text_textfield |  |  |
| `field_goal_percentage` | goal percentage | number_integer | 1 |  | number |  |  |
| `field_goal_step` | goal current step | text | 1 |  | text_textfield |  |  |
| `field_goal_current_step_descript` | goal current step description | text | 1 |  | text_textfield |  | help: User Goal Current Step Description |
| `field_goal_next_step_description` | goal next step description | text | 1 |  | text_textfield |  | help: User Goal Next Step Description |
| `field_dismiss` | Dismiss? | list_boolean | 1 |  | options_onoff | [{"value":0}] |  |
| `field_goal_in` | Accomplish this goal in | text | 1 |  | text_textfield |  |  |

#### node : weekly_checkin_prompt

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_sequence_prompt_number_` | Sequence (Prompt Number) | list_integer | 1 | Y | options_select |  |  |
| `field_prompt_text` | Likert Prompt Text | text_long | 1 | Y | text_textarea rows=5 |  | help: This is the prompt text that will appear above the Likert rating scale. |
| `field_prompt_options` | Likert Prompt Options | text_long | 1 | Y | text_textarea rows=5 | [{"value":"1\|Value,2\|Value,3\|Value,4\|Value,5\|Value"}] | help: This field contains the options to be displayed for this Likert scale type prompt. MUST use format 1\|Value,2\|Value,3\|Value,4\|Value,5\|Value, where the integer is the raw Likert score and Value is the text to display next to the radio button in the UI. |
| `field_open_ended_prompt_text` | Open-ended Prompt Text | text_long | 1 | Y | text_textarea rows=5 |  | help: This is the prompt that will appear above the open-ended question. |
| `field_open_ended_prompt_instruct` | Open-ended Prompt Instruction | text_long | 1 | Y | text_textarea rows=5 |  | help: This is the placeholder text that will appear in the text input box. |
| `field_feedback_high_long` | Feedback High Long | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |
| `field_feedback_medium_long` | Feedback Medium Long | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |
| `field_feedback_low_long` | Feedback Low Long | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |
| `field_medication_taking_feedback` | Medication Taking Feedback | text_long | 1 |  | text_textarea rows=4 |  |  |
| `field_less_adherent_feedback` | Medication less adherent feedback | text_long | 1 |  | text_textarea rows=3 |  |  |
| `field_more_adherent_feedback` | Medication more adherent feedback | text_long | 1 |  | text_textarea rows=3 |  |  |

#### node : weekly_checkins

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_likert_prompt_value` | Likert Prompt value | text | 1 |  | text_textfield |  |  |
| `field_open_ended_prompt_value` | Open-ended Prompt value | text_long | 1 |  | text_textarea rows=5 |  | help: This is the Open-ended Prompt value |
| `field_feedback_long` | Feedback Long | text_long | 1 |  | text_textarea rows=5 |  | help: This is a Feed Back Long Value |
| `field_user_id` | User Id | text | 1 |  | text_textfield |  | help: This is a User Id value field |
| `field_feedback_short` | Meds Taking Feedback | text_long | 1 |  | text_textarea rows=5 |  | help: This is a Feedback Short Value Field |

#### profile2 : main

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_about_me` | About Me | text_with_summary | 1 |  | text_textarea rows=2 |  | help: Please tell us about yourself. |
| `field_age` | Age | text | 1 |  | text_textfield |  |  |
| `field_pronoun` | Pronoun | text | 1 |  | text_textfield |  |  |

#### user : user

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_number` | number | text | 1 |  | text_textfield |  |  |
| `field_intervention_start_date` | Intervention Start Date | datetime | 1 |  | date_popup fmt=m/d/Y - H:i:s |  | help: Enter User Intervention Start Date |
| `field_weekly_sms_date_time` | Weekly Sms Date time | text | 1 |  | text_textfield |  | help: Weekly Sms Date and time |
| `field_sticker` | Sticker | text | 1 |  | text_textfield |  |  |
| `field_role_changed_date` | User role changed to participant | text | 1 |  | text_textfield |  |  |
| `field_study_id` | study_id | text | 1 |  | text_textfield |  |  |
| `field_theme` | Theme | list_text | 1 |  | options_buttons | [{"value":"theme-1"}] |  |
| `field_bg_image` | Background Image | image | 1 |  | image_image |  | file_extensions=png gif jpg jpeg |
| `field_coach` | Coach | entityreference | 1 |  | options_select |  |  |
| `field_zoom_link` | Zoom Link | url | 1 |  | url_external |  | shown on registration |
| `field_first_name` | First Name | text | 1 |  | text_textfield |  | shown on registration |
| `field_user_pronoun` | Pronoun | text | 1 |  | text_textfield |  | shown on registration |
| `field_location` | Location | text | 1 |  | text_textfield |  | shown on registration |
| `field_avatar` | avatar | text | 1 |  | text_textfield |  |  |
| `field_wall_visit` | wall visit | text | 1 |  | text_textfield |  |  |
| `field_user_picture` | user picture | text | 1 |  | text_textfield |  |  |

### 3.6 Conditional field visibility (`field_conditional_state`, `field_conditional_states_group`) — LP

All rules are on node type `thrive_tips`; the controlling field is `field_tip_type`.

| group_id | target field | becomes | when `field_tip_type` = (OR) |
| --- | --- | --- | --- |
| 1 | `field_select_pdf_file` | visible | `Pdf` |
| 2 | `field_video_link` | visible | `Video` |
| 4 | `field_html_content` | visible | `Html` |
| 7 | `field_description` | visible | `Pdf` or `Video` or `Offsite Content` |
| 8 | `field_link` | visible | `Offsite Content` |

### 3.7 Field-level permissions (`field_permissions` module) — LP

Fields set to **custom permissions** (field_permissions type 2): `field_number`, `field_intervention_start_date`,
`field_role_changed_date`, `field_weekly_sms_date_time`, `field_sticker`, `field_study_id`, `field_avatar` (all on
the user entity). All other fields are public (type 0). Who holds `create/edit/edit own/view/view own <field>` is in
the permission matrix (§7.4, module `field_permissions`). Summary: administrator, Research Administrator User and
Coordinator User can view/edit these; anonymous has *create* (so the values can be set during registration /
account creation); `control` has `create field_number`. Nobody holds edit/view on `field_number`.

---
## 4. Link Positively — taxonomy, profile2, field collections, flags, voting, achievements

### 4.1 Taxonomy vocabularies (LP)

| vid | machine_name | name | hierarchy | module | weight | terms | description |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | `thrive_tips_tags` | Thrive Tips Tags | 0 | taxonomy | -10 | 80 | This Taxonomy use for thrive tips tags |
| 7 | `hashtags` | Hashtags | 0 | hashtags | -9 | 0 | Hashtag vocabulary |
| 6 | `youthrive_tags` | youthrive_tags | 0 | youthrive_tags | -8 | 48 | Youthrive vocabulary |
| 4 | `glossary_terms` | Glossary Terms | 0 | taxonomy | -7 | 76 |  |
| 1 | `tags` | Tags | 0 | taxonomy | -6 | 0 | Use tags to group articles on similar topics into categories. |
| 3 | `thrive_tips_categories` | Thrive Tips Categories | 0 | taxonomy | -5 | 7 |  |
| 8 | `custom_tracking` | Custom Tracking | 0 | taxonomy | 0 | 3 | For select options |
| 9 | `resource_tags` | Resource Tags | 0 | taxonomy | 0 | 190 |  |

Which fields use which vocabulary: `thrive_tips_tags` ← `field_thrive_tags` (thrive_tips, required, select list);
`thrive_tips_categories` ← `field_imbaaq_category` (thrive_tips, 0 rows); `hashtags` ← `field_hashtags` (thrive_tips,
0 rows; vocabulary owned by the *hashtags* module); `youthrive_tags` ← `field_youthrive_tags` (drupal_wall
autocomplete, free tagging from `#hashtags` typed into wall posts, maintained by custom module `youthrive_tags`);
`tags` ← `field_tags` (article, unused); `resource_tags` ← `field_resource_tag` (resources, autocomplete/free
tagging, populated by the CSV resource import); `glossary_terms` — no field, read directly by the glossary page
(`twm_glossary`); `custom_tracking` — no field, used as the option list for tracker type (`ts_tracking.tid`). All
vocabularies are flat (`parent` 0, `depth` 0, `weight` 0 unless noted).

#### 4.1.1 `custom_tracking` (site-defined option list — tracker types)

| tid | name | weight |
| --- | --- | --- |
| 296 | Hormones | 0 |
| 297 | PrEP | 0 |
| 298 | Sex | 0 |

`ts_tracking.tid = 0` means a free-text custom tracker (label in `ts_tracking.text`).

#### 4.1.2 `thrive_tips_categories` (site-defined, 7 terms, currently unused by any node)

| tid | name |
| --- | --- |
| 25 | Learn more about how HIV medications work and how to get the information you want about HIV |
| 26 | Learn more about how to get more support from others |
| 27 | Learn more about how to take your medications as prescribed and what to do when you miss doses |
| 28 | Learn more about how your medications interact with drugs and alcohol |
| 29 | Learn more about ways to make taking your medication part of your daily life and feel less frustrated |
| 30 | Learn more about why it is important to take your medications for your short and long-term health |
| 31 | Learn more ways to feel better about your HIV and your HIV medications |

#### 4.1.3 `thrive_tips_tags` (site-defined tip topics, 80 terms)

Format `tid name (tagged nodes)`. Term 503 "Treatment" carries a stray description copied from the glossary.

522 Activity (0); 521 Adherence (11); 524 Alcohol Use (0); 520 Anxiety (0); 523 ART (11); 223 Ask Your Provider (12); 478 Benefits (0); 558 Breastfeeding (3); 529 Childhood Abuse (0); 525 Children (0); 479 Condoms (3); 560 Consent (0); 480 Contraception (0); 526 Couples Communication (11); 527 Creativity (0); 528 Crisis (5); 228 Dating (0); 530 Depression (5); 531 Disclosure (7); 532 Discrimination (10); 533 Doctors (0); 534 Electronics (0); 535 Emotional Violence (0); 482 Ending the HIV Epidemic (0); 536 Everyone Has a Story (6); 481 Exercise (7); 483 Fertility (0); 233 Food (0); 239 Get Support (9); 484 Health (12); 240 Healthy Eating (0); 487 HIV (12); 489 HIV Disclosure (0); 490 HIV in the News (0); 561 HIV Prevention (0); 485 HIV Transmission (0); 488 Hobby (0); 486 Interpersonal Violence (4); 491 Intimate Partner Violence (4); 492 Love (8); 505 Me Too (0); 538 Medical Mistrust (4); 537 Medication (13); 748 Meditation (8); 540 Menopause (0); 539 Mental Health (55); 562 Mother-to-Child Transmission (6); 256 Nutrition (0); 541 Outdoors (0); 559 Patient-Provider Communication (6); 542 Period (0); 543 Physical Health (0); 544 Physical Violence (0); 545 Pleasure (3); 546 Pregnancy (6); 547 PrEP (5); 548 Prevention (5); 550 Psychological Abuse (0); 549 PTSD (0); 551 Relationships (5); 747 Resilience (7); 552 Resources (5); 493 Safe Sex (12); 261 Self-care (17); 494 Sex (6); 496 Sexual Violence (6); 497 Sleep (0); 553 Speaking to Your Doctor (2); 554 Stigma (14); 498 STIs (8); 499 Substance Use (7); 749 Testimonial (5); 500 Transmission (1); 501 Trauma (6); 503 Treatment (15); 563 Undetectable (3); 502 Video (32); 555 Warrior Women (11); 556 Wellness (0); 557 Women with HIV (23)

#### 4.1.4 `resource_tags` (190 terms, imported with resources; free tagging)

Many terms are fragments produced by splitting CSV cells on commas (e.g. "and laboratory services"). Format `tid
name (tagged nodes)`.

607 24-Hr Crisis Line (1); 576 abortion referral (23); 575 Abortion services (23); 723 Abuse Services (1); 674 addiction recovery (3); 706 addiction services (1); 602 Addiction treatment (1); 733 advocacy (3); 598 aging (1); 612 and children's services. (1); 665 and development. (2); 658 and laboratory services (28); 644 and older adult services (15); 606 and parenting support. (1); 635 and re-entry services (9); 619 and senior services (2); 670 and substance abuse programs (2); 742 Behavior Health (2); 637 behavioral health (21); 652 behavioral health services (36); 726 behavioral Services (1); 577 birth control (23); 703 Child & Adolescence Services (1); 617 child development (2); 600 children & families (1); 656 chiropractic services (28); 731 Clinic (3); 688 Clinical health (4); 675 clinical research (3); 734 community (1); 508 Community Based Organization (2); 509 Community Based Services (1); 717 Community Health (1); 639 community health coalition (15); 594 community housing (2); 638 community mobile unit (15); 512 Community Organization (1); 695 Community outreach (2); 730 Community Services (1); 691 comprehensive care (1); 653 comprehensive prenatal & OB/GYN services (28); 700 Counseling (1); 705 Counselling services (3); 636 COVID-19 Support and resources (15); 737 Crisis Intervention (5); 702 Crisis Services (2); 677 culture and education (3); 626 dental (9); 654 Dental services (28); 603 detoxification (1); 641 diabetes management and prevention (15); 615 digital learning academy (2); 614 digital print center (2); 588 Domestic violence (3); 745 Domestic Violence Services (4); 511 Domestic Violence Support Services (2); 699 Drug services (1); 698 Elder care (2); 578 emergency contraception (23); 589 emergency housing (1); 592 emergency shelter (2); 666 Employment assistance (4); 664 evaluation (2); 642 exercise (15); 590 families. (1); 646 family (28); 622 Family advocacy and social services agency (1); 649 family planning services and procedures (28); 740 Family Support (2); 597 Food & hunger (1); 514 Food Assistance (1); 693 Food pantry (10); 694 Food services (11); 579 general health care (23); 648 geriatric primary care (28); 596 Health care agency (6); 621 Health care and social services agency (1); 721 Health Care Services (2); 671 Health services (12); 513 Healthcare (36); 643 healthy heart program (15); 712 Heart health services (1); 632 Hepatitis C (9); 631 HIV (9); 574 HIV and Social Services Agency (2); 659 HIV care programs (2); 506 HIV Care Services (6); 662 HIV education and counseling programs (2); 668 HIV education and counseling programs. (4); 580 HIV services (36); 565 HIV Services Agency (20); 661 HIV testing (7); 650 HIV testing and treatment (28); 630 homeless health services (9); 727 Homeless Prevention (3); 573 Housing and Social services organization (1); 728 Housing Assistance (3); 507 Housing Program (4); 725 Housing Services (7); 743 Housing/Financial Assistance (2); 510 Immigration Services (1); 610 individual counseling (1); 692 Infectious disease provider (1); 716 Infectious disease services (1); 736 Information & Referral (2); 679 leadership and advocacy. (3); 516 Legal Aid (2); 741 Legal Assistance (3); 623 Legal assistance services (3); 735 legal Domestic Violence Services (1); 611 legal services (4); 581 LGBT services (20); 732 LGBTQ+ (3); 729 LGBTQ+ services (2); 625 Medical (9); 362 Medical Care (27); 517 Medical Clinic (5); 571 Medical home (1); 655 medical insurance eligibility assistance (28); 582 Men's Health Services (20); 629 mental and behavioral health (9); 599 mental health (7); 620 Mental Health & Social Services Organization (1); 518 Mental Health Services (9); 696 Ministries (1); 744 Offender Accountability (2); 583 Patient Education (23); 647 pediatric medicine (28); 627 pediatric services (9); 657 podiatry (28); 584 Pregnancy Testing & Services (23); 633 PrEP (9); 651 PrEP services (28); 604 prevention and education (1); 645 Primary (28); 720 Primary Care (1); 711 Primary care services (3); 707 Reentry services (1); 564 Refugee Services (0); 701 Rehabilitation services (2); 519 Reproductive Health (15); 715 Reproductive Health Services (1); 713 Reproductive Services (1); 739 Safety Planning (2); 616 sexual assault (2); 672 sexual health (12); 746 Social Services (1); 673 social services and housing (3); 624 Social services and housing agency for low-income individuals (4); 570 Social services organization (5); 663 social support groups and research (2); 697 Soup kitchen (1); 601 special needs & diverse abilities (1); 585 STD Testing (23); 690 STI testing (2); 660 substance abuse programs (2); 704 Substance abuse services (1); 708 Substance abuse treatment (1); 515 Substance Use Facility (2); 724 Suicide Prevention (1); 678 support groups (3); 609 supprotive services (1); 714 Testing (1); 718 Testing Center (1); 689 Testing sigh (1); 719 Testing site (2); 669 tobacco (2); 667 tobacco and substance abuse programs (2); 634 Transgender health (12); 608 transitional housing (1); 709 Transitional living (1); 593 transitional shelter (1); 738 Transportation (2); 567 Trauma Informed (2); 722 Trauma Services (1); 591 trauma-informed (1); 586 Treatment & Vaccines (23); 710 Treatment Services (1); 568 Violence (2); 676 violence prevention (3); 605 vocational training (1); 595 walk-in center (1); 569 Women (2); 572 women and families (1); 628 women's health (13); 587 Women's Services (23); 566 Women-centered medical care home (1); 613 Workforce development (2); 640 youth community action program (15); 618 youth services (2)

#### 4.1.5 `glossary_terms` (76 site-authored glossary entries)

Term `name` = glossary word, `description` = definition (HTML, `format` filtered/full). Definitions are site content
and must be migrated with the terms. Names:

ADA, Affordable Care Act, Ageism, Ally, AMAB/AFAB/ASAB, Antabuse/Disulfiram, Anus, at Will, Cis, Cissexism, Civil Rights, Co-Insurance, Co-Pay, Deductible, Discrimination, Equal Employment Opportunity Commission, Fair Housing, Family and Medical Leave Act, Fluidbonded, GCS, Gender-Affirming Surgery, Harm Reduction, Hate Crime, Hepatitis B Virus (hBV) Infection, Hepatitis C Virus (hCV) Infection, Houselessness, HRT, IDU, In-Network, Indirect Sharing, Insertive Condom, Insertive Partner, Intramuscular, Intravenous, Medicaid, Medication Assisted Treatment, Methadone, Narcan/Naloxone, Navigator, Non-Binary, Opioids, Out-of-Network, Out-of-Pocket, Passing, Patient Advocate, Penis, PEP, Person Who Injects Drugs, PIA, PIV, Popping, Premium, PrEP, Psychedelics, Racism, Receptive Condom, Receptive Partner, Serodiscordant Couple, Serostatus, Sex Work, Silicon Injections, Social Inequality, TERF, Title IX, Title VII, Trans/Transgender, Transmisogyny, Transphobia, Underground Economy, Undetectable/Virally Suppressed, Unemployment/Underemployment, Vagina/Vulva, Viral Load, White Privilege, White Supremacy, Works.

#### 4.1.6 `youthrive_tags` (48 terms, user-generated)

Hashtags typed by users into wall posts; auto-created by module `youthrive_tags` and indexed in
`youthrive_tags_index`. Term names are user-generated content and are not reproduced here. Only 8 wall posts are
tagged. Vocabulary `tags`, `hashtags`: 0 terms.

### 4.2 Profile2 types (LP)

Profile2 (`profile` table: `pid`, `type`, `uid`, `label`, `created`, `changed`; `profile_type`: `id`, `type`,
`label`, `weight`, `data`, `status`, `module`) — one type:

| id | type | label | weight | data (settings) | profiles |
| --- | --- | --- | --- | --- | --- |
| 4 | `main` | Profile | 0 | {"registration":1,"use_one_page":1,"use_page":1} | 63 |

`data`: `registration` 1 = profile form shown on registration; `use_page` 1 = separate page (`profile-main`);
`use_one_page` 1 = shown on the account edit page. Fields: see §3.5 `profile2 : main` (`field_about_me`,
`field_age`, `field_pronoun`). Note that LP *also* has user-entity fields `field_user_pronoun`, `field_first_name`
etc. — the profile2 copies are legacy (12/3/0 rows).

### 4.3 Field collections (LP)

`field_collection_item` (`item_id`, `revision_id`, `field_name`, `archived`) + `field_collection_item_revision`.
Five collection fields, all on the single `reminder_messages` node (the scheduled-SMS script). Each item has the same
shape: *sending day* (integer = day offset in the intervention), *text message* (≤255 chars) and *MMS URL*.

| host field (bundle) | items | sending-day field | text field | MMS URL field |
| --- | --- | --- | --- | --- |
| `field_my_check_in` | 3 | `field_checkin_sms_sending_day` | `field_checkin_text_message` | `field_checkin_mms_message` |
| `field_my_thrive_tips` | 2 | `field_thrivetips_sms_sending_day` | `field_thrive_tips_text_message` | `field_thrive_tips_mms_message` |
| `field_hot_topics` | 1 | `field_hot_topics_sms_sending_day` | `field_hot_topics_text_messages` | `field_hot_topics_mms_messages` |
| `field_my_journey` | 2 | `field_my_journey_sms_sending_day` | `field_my_journey_text_messages` | `field_my_journey_mms_messages` |
| `field_my_points` | 2 | `field_my_points_sms_sending_day` | `field_my_points_text_message` | `field_my_points_mms_message` |

Recommended Mongo shape: embed as arrays of `{sendingDay, text, mmsUrl}` inside the reminder-script document.

### 4.4 Flags (`flag`, `flag_types`, `flagging`, `flag_counts`) — LP

Flag 3.x. `flagging` (`flagging_id`, `fid`, `entity_type`, `entity_id`, `uid`, `sid`, `timestamp`) = one row per
user+entity flagged; `flag_counts` (`fid`, `entity_type`, `entity_id`, `count`, `last_updated`) = aggregate (note: many
counts exceed current flagging rows because flaggings were deleted without recount — rebuild counts from
`flagging` or `uy_wallflag_count` history). All flags are per-user (`global` 0). `enabled` = value in
`flag_default_flag_status` (flags defined in code via Features; `false` = disabled). `access_author`: `others` = can
only flag others' content, `comment_others` = only others' comments, empty = anyone. Who may flag is in the
permission matrix (`flag <name>` / `unflag <name>`). The wall reaction buttons are wired to flags through variables
`drupal_wall_<reaction>_<node|comment>` (see §13).

| fid | name | entity | title | bundles | flag text | unflag text | link | access_author | show in links | as field | unflag_denied_text | enabled | flagging rows | flag_counts rows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Other flag options (all flags): `flag_long`/`unflag_long` tooltips as in the DB, `flag_message`/`unflag_message`
empty except `twm_tailored_tips_tailored` ("Added to your starred list." / "Removed from your starred list."),
`abuse_user` uses `link_type = confirm` with confirmation texts "Are you sure you want to report this user as
offensive?" / "Are you sure you want to remove your report of this user?" and `show_on_profile` 1. Functional
groups:

- **Moderation**: `abuse_node`, `abuse_comment`, `abuse_user` (reports, via *flag_abuse*), `abuse_whitelist_node`,
  `abuse_whitelist_comment` (moderator "reset/whitelist"). Admin review pages `admin/abuse-node`,
  `admin/abuse-comment` (views `all_flag_abuse_node`, `all_flag_abuse_comment`).
- **Wall reactions** (node = wall post `drupal_wall`, comment = wall/tip comment): love, haha, fire, super, target,
  thought, thumbs_up, plus disabled/unassigned sad, angry, wow. `up_voting`, `up_voting_comments` = legacy "upvote".
- **Thrive tips**: `favourites` (user favourites a tip), `twm_tailored_tips_tailored` (tip highlighted/recommended
  for a user — set programmatically; its history drives 103k rows in `uy_wallflag_count`).
- **Resources**: `resource` ("No Longer Available" report), `favorite_resource` (bookmark).

### 4.5 Voting API / Fivestar (LP)

Field `field_rating` (fivestar, axis `vote`, 5 stars, `allow_revote` 1, `allow_ownvote` 1, widget `exposed`) on
`resources`. Tables `votingapi_vote` (`vote_id`, `entity_type`, `entity_id`, `value`, `value_type`, `tag`, `uid`,
`timestamp`, `vote_source`) and `votingapi_cache` (`vote_cache_id`, `entity_type`, `entity_id`, `value`,
`value_type`, `tag`, `function`, `timestamp`) are **empty (0 rows)**; `field_data_field_rating` is also empty. The
"rate this resource" feature exists but has never stored a vote. Achievement `rate-resource` (5 pts) exists.

### 4.6 Achievements, points and levels (LP)

Module *achievements* (contrib) + custom `youthrive_game_mechanics`, `twm_achievement_bins`. Definitions come from
`youthrive_game_mechanics_achievements_info()` (group `community-achievements`, title "Community Participation
Achievements"). `storage` = key used in `achievement_storage` for the running counter.

| id | title | description | points | storage key | unlock rows |
| --- | --- | --- | --- | --- | --- |
| `profile-complete` |  | Profile complete! | 50 | profile | 0 |
| `tutorial-view` |  | You have visited tutorial. Great! | 50 | tutorial-view | 0 |
| `tracker-create` |  | You have Created Tracker! | 25 | tracker-create | 0 |
| `community-view` |  | You have read community guidelines. Great! | 25 | community-view | 0 |
| `comment` |  | You submitted your comment. Awesome! | 10 | comment | 0 |
| `topic` |  | You submitted your new topic. Great! | 10 | topic | 0 |
| `upvote-given` |  | You sent your upvote. Nice! | 1 | upvote-given | 0 |
| `upvote-earned` |  | You earned your upvote. | 1 | upvote-earned | 0 |
| `checkin-meds-response` |  | You completed your medication-dose(Yes/No). Great! | 2 | checkin-meds-response | 0 |
| `checkin-mood-response` |  | You completed your mood response. Great! | 2 | checkin-mood-response | 0 |
| `tailored-thrive-tip` |  | You read your Recommended (highlighted) Thrive Tip. | 5 | tailored-thrive-tip | 0 |
| `rate-resource` |  | You read your Recommended (highlighted) Thrive Tip. | 5 | rate-resource | 0 |
| `thrive-tip` |  | You read your Thrive Tip. | 2 | thrive-tip | 0 |
| `time-on-site` |  | You have been a part of Youthrive! | 1 | time-on-site | 0 |
| `level-1` | LEVEL-1 | Starting Point | 0 | level | 1 |
| `level-2` | LEVEL-2 | At least 200 points total. | 200 | level | 1 |
| `level-3` | LEVEL-3 | At least 700 points total. | 500 | level | 0 |
| `level-4` | LEVEL-4 | At least 900 points total. | 900 | level | 0 |
| `level-5` | LEVEL-5 | At least 1100 points total. | 1400 | level | 0 |
| `level-6` | LEVEL-6 | At least 1100 points total. | 2000 | level | 0 |

**How points really work (source of truth = `achievement_stats`)**: every award inserts a row into
`achievement_stats` (`achievement_id`, `uid`, `points`, `date`). A user's total = `SUM(points)`; the level is
derived on the fly by `uy_user_level()` and the matching **level roles are granted** (never revoked):

| total points | level | roles granted |
| --- | --- | --- |
| 0–200 | 1 | — |
| 201–499 | 2 | `level-2`, `level-2-1` |
| 500–899 | 3 | `level-3`, `level-3-1` |
| 900–1399 | 4 | `level-4` |
| 1400–1999 | 5 | `level-5` |
| ≥ 2000 | 6 | `level-6`, `level-6-1` |

(Levels 7–8 and roles `level-7`, `level-5-1` exist but are unused/commented out. Level description texts are in
variables `level1-name`…`level8-desc`, §13.) Level roles gate unlockables: avatar packs (`avatar_selection_roles`:
`participant` 12 avatars, `level-2` 12, `level-3` 12, `level-4` 12, `level-5` 12, `level-6` 12, `level-6-1` 12;
sticker packs `level-2-1` 10 and `level-3-1` 10), wall-post background colours (`level-4`), colour themes
(`field_theme` theme-1…4, level 6).

Points per action: as declared in the table above (e.g. wall post `topic` 10, check-in answers 2 each, thrive tip 2,
highlighted tip 5, profile complete 50). Comments are special-cased in `youthrive_game_mechanics_comment_insert`: the
commenter gets 10 on a wall post, 2 on a thrive tip, 5 on a resource, **and** the author of the commented node gets 10.
`time-on-site` (1 point) is awarded once per day of access by cron `youthrive_timeonsite_cron`. The exact award sites
for every action belong to the feature specs; this table is the data contract.

`achievement_stats.achievement_id` values observed (row counts): action-plan 126, checkin-meds-response 414,
checkin-mood-response 423, comment 612, community-view 16, profile-complete 58, rate-resource 15, resource 363,
tailored-thrive-tip 152, thrive-tip 354, time-on-site 1719, topic 632, tracker 547, upvote-earned 533, upvote-given
531. (`action-plan`, `resource`, `tracker` are awarded by code but are not declared achievements.)

`achievement_storage.achievement_id` keys observed: comment, thrive-tip, time-on-site, topic, tracker-checkin,
tracker-create, upvote-earned, upvote-given, view-resource (`data` = serialized running counter).
`achievement_unlocks`: 2 rows (level-1, level-2). `achievement_totals`: 1 row (the contrib totals are not maintained
— do not migrate them as truth).

Goal-journey step labels (used by `user_goals.field_goal_step`) are variables `goal-step1`…`goal-step7`:
1 Thinking About Starting, 2 Took My 1st Step, 3 Making Progress, 4 Halfway There, 5 On a Roll, 6 The End is in
Sight, 7 Journey Complete!

---
## 5. Link Positively — custom & contrib tables

Tables created by `hook_schema()` of enabled non-core modules, with row counts. Field-API tables (`field_data_*`) and
cache tables are excluded. Pure-infrastructure contrib tables are listed at the end without columns. 🔒 = contains
personal/health data.

#### `access_report` (module access_report) — table missing

Declared by `access_report` (an example-module copy: columns `numbers` varchar(2) PK, `alpha` varchar(2), `random` varchar(12)) but **the table does not exist** in the DB. Nothing to migrate.

#### `achievement_totals` (module `achievements`) — 1 rows

Contrib per-user totals; not maintained (1 row). See §4.6.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `uid` | int |  | Y | 0 |  |
| `points` | int |  | Y | 0 |  |
| `unlocks` | int |  | Y | 0 |  |
| `timestamp` | int |  | Y | 0 |  |
| `achievement_id` | varchar | 32 | Y |  |  |

PK: ["uid"]; indexes: uid_points, uid_unlocks, points_timestamp, unlocks_timestamp, uid_points_unlocks

#### `achievement_unlocks` (module `achievements`) — 2 rows

Unlocked achievements (`seen` 0/1 = user has seen the unlock popup).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `achievement_id` | varchar | 32 | Y |  |  |
| `rank` | int |  | Y | 0 |  |
| `uid` | int |  | Y | 0 |  |
| `timestamp` | int |  | Y | 0 |  |
| `seen` | int |  | Y | 0 |  |

PK: ["achievement_id","uid"]; indexes: aid_rank, aid_timestamp, uid_seen_timestamp, uid_timestamp

#### `achievement_storage` (module `achievements`) — 138 rows

Per-user running counters; `data` = PHP-serialized scalar.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `achievement_id` | varchar | 32 | Y |  |  |
| `uid` | int |  | Y | 0 |  |
| `data` | blob | big | Y |  |  |

PK: ["achievement_id","uid"]

#### `avatar_selection` (module `avatar_selection`) — 113 rows

Avatar/sticker image catalogue. `fid` → `file_managed`; files live in `public://avatar_selection/` (names like `Avatar - Pack 5 - 3.png`, `Badge - Group 7.png`). Site asset — migrate files + rows.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `aid` | serial |  unsigned | Y |  |  |
| `fid` | int |  unsigned | Y |  |  |
| `avatar` | varchar | 255 | Y |  |  |
| `name` | varchar | 255 |  |  |  |
| `weight` | int |  | Y | 0 |  |

PK: ["aid"]; unique: {"avatar":["avatar"],"fid":["fid"]}

#### `avatar_selection_roles` (module `avatar_selection`) — 113 rows

Which role may pick each avatar (`aid`,`rid`) — the level-gated packs (§4.6).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `aid` | int |  unsigned | Y |  |  |
| `rid` | int |  unsigned | Y |  |  |

PK: -

#### `avatar_selection_og` (module `avatar_selection`) — 0 rows

Organic-groups mapping — unused (0 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `aid` | int |  unsigned | Y |  |  |
| `ogid` | int |  unsigned | Y |  |  |

PK: -

#### `avatar_selection_usage` (module `avatar_selection`) — 3 rows

`uid` → chosen avatar `fid` (legacy; the app also stores the choice in user fields `field_avatar`/`field_user_picture` and `users.picture`).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `fid` | int |  unsigned | Y |  |  |
| `uid` | int |  unsigned | Y |  |  |

PK: ["uid"]

#### `cas_server_tickets` (module `cas_server`) — 169 rows

CAS service tickets issued by LP to PN (`service` URL, `ticket`, `uid`, `timestamp`, `valid`). Transient — do not migrate.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `service` | varchar | 1024 | Y |  |  |
| `ticket` | varchar | 255 | Y |  |  |
| `uid` | int |  unsigned | Y |  |  |
| `timestamp` | int |  | Y |  |  |
| `valid` | int |  | Y | 1 |  |

PK: ["ticket"]

#### `elysia_cron` (module `elysia_cron`) — 37 rows

Cron job state/schedule. Jobs with explicit rules: `twm_reminders_sendsms_cron` `*/1 * * * *`, `youthrive_sms_reminders_cron` `*/1 * * * *`, `med_tracking_sms` `0 * * * *`, `update_cron` `*/15 * * * *`; all others run on every cron. Other job names: achievement_carousel_cron, tracking_sms, twm_badges_timeonsite_cron, twm_general_cron, twm_reminders_receivesms_cron, youthrive_timeonsite_cron, qsurvey_createuser_cron, shurly_cron, plus core/contrib crons. Operational only.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `name` | varchar | 120 | Y |  |  |
| `disable` | int | tiny |  |  |  |
| `rule` | varchar | 256 |  |  |  |
| `weight` | int |  |  |  |  |
| `context` | varchar | 32 |  |  |  |
| `running` | int |  | Y | 0 |  |
| `last_run` | int |  | Y | 0 |  |
| `last_aborted` | int | tiny | Y | 0 |  |
| `abort_count` | int |  | Y | 0 |  |
| `last_abort_function` | varchar | 128 |  |  |  |
| `last_execution_time` | int |  | Y | 0 |  |
| `execution_count` | int |  | Y | 0 |  |
| `avg_execution_time` | float |  | Y | 0 |  |
| `max_execution_time` | int |  | Y | 0 |  |
| `last_shutdown_time` | int |  | Y | 0 |  |

PK: ["name"]

#### `field_collection_item` (module `field_collection`) — 10 rows

§4.3.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `item_id` | serial |  | Y |  |  |
| `revision_id` | int |  | Y |  |  |
| `field_name` | varchar | 32 | Y |  |  |
| `archived` | int |  | Y | 0 |  |

PK: ["item_id"]

#### `field_collection_item_revision` (module `field_collection`) — 10 rows

§4.3.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `revision_id` | serial |  | Y |  |  |
| `item_id` | int |  | Y |  |  |

PK: ["revision_id"]; indexes: item_id

#### `field_conditional_state` (module `field_conditional_state`) — 7 rows

Rules — see §3.6.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `group_id` | int |  | Y |  |  |
| `control_field` | varchar | 255 | Y |  |  |
| `trigger_state` | varchar | 15 | Y |  |  |
| `trigger_value` | text |  | Y |  |  |

PK: ["id"]

#### `field_conditional_states_group` (module `field_conditional_state`) — 5 rows

Rules — see §3.6.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `group_id` | serial |  | Y |  |  |
| `state` | varchar | 15 | Y |  |  |
| `entity_type` | varchar | 255 | Y |  |  |
| `bundle` | varchar | 255 | Y |  |  |
| `field_name` | varchar | 255 | Y |  |  |
| `type` | varchar | 3 | Y |  |  |

PK: ["group_id"]

#### `flag` (module `flag`) — 31 rows

Flag definitions (§4.4): `fid`, `entity_type`, `name`, `title`, `global`, `options` (serialized).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `fid` | serial | small unsigned | Y |  |  |
| `entity_type` | varchar | 128 | Y |  |  |
| `name` | varchar | 32 |  |  |  |
| `title` | varchar | 255 |  |  |  |
| `global` | int | tiny |  | 0 |  |
| `options` | text |  |  |  |  |

PK: ["fid"]; unique: {"name":["name"]}

#### `flagging` (module `flag`) — 37 rows

See §4.4. 🔒 (who reacted/reported what).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `flagging_id` | serial |  unsigned | Y |  |  |
| `fid` | int | small unsigned | Y | 0 |  |
| `entity_type` | varchar | 128 | Y |  |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `uid` | int |  unsigned | Y | 0 |  |
| `sid` | int |  unsigned | Y | 0 |  |
| `timestamp` | int |  unsigned | Y | 0 |  |

PK: ["flagging_id"]; unique: {"fid_entity_id_uid_sid":["fid","entity_id","uid","sid"]}; indexes: entity_type_uid_sid, entity_type_entity_id_uid_sid, entity_id_fid

#### `flag_types` (module `flag`) — 31 rows

Flag ↔ bundle restriction (`fid`, `type`).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `fid` | int | small unsigned | Y | 0 |  |
| `type` | varchar | 128 | Y |  |  |

PK: -; indexes: fid

#### `flag_counts` (module `flag`) — 72 rows

See §4.4.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `fid` | int | small unsigned | Y | 0 |  |
| `entity_type` | varchar | 128 | Y |  |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `count` | int |  unsigned | Y | 0 |  |
| `last_updated` | int |  unsigned | Y | 0 |  |

PK: ["fid","entity_id"]; indexes: fid_entity_type, entity_type_entity_id, fid_count, fid_last_updated

#### `masquerade` (module `masquerade`) — 0 rows

Active masquerade sessions (0 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `sid` | varchar | 64 | Y |  |  |
| `uid_from` | int |  | Y | 0 |  |
| `uid_as` | int |  | Y | 0 |  |

PK: -; indexes: sid, sid_2

#### `masquerade_users` (module `masquerade`) — 0 rows

Per-user allowed masquerade targets (0 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `uid_from` | int |  | Y | 0 |  |
| `uid_to` | int |  | Y | 0 |  |

PK: ["uid_from","uid_to"]

#### `mentions` (module `mentions`) — 0 rows

@mention index (0 rows) — mentions module is enabled with input filter `filter_mentions`, but none recorded.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `mid` | serial |  unsigned | Y |  |  |
| `entity_type` | varchar | 32 | Y |  |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `uid` | int |  unsigned | Y | 0 |  |
| `auid` | int |  unsigned | Y | 0 |  |
| `created` | int |  | Y | 0 |  |
| `changed` | int |  | Y | 0 |  |

PK: ["mid"]; indexes: mid

#### `profile` (module `profile2`) — 63 rows

Profile2 entities (§4.2).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `pid` | serial |  | Y |  |  |
| `type` | varchar | 32 | Y |  |  |
| `uid` | int |  unsigned |  |  |  |
| `label` | varchar | 255 | Y |  |  |
| `created` | int |  |  |  |  |
| `changed` | int |  |  |  |  |

PK: ["pid"]; unique: {"user_profile_type":["type","uid"]}; indexes: uid

#### `profile_type` (module `profile2`) — 1 rows

§4.2.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `type` | varchar | 32 | Y |  |  |
| `label` | varchar | 255 | Y |  |  |
| `weight` | int | tiny | Y | 0 |  |
| `data` | text | big |  |  |  |
| `status` | int | tiny | Y | 1 |  |
| `module` | varchar | 255 |  |  |  |

PK: ["id"]; unique: {"type":["type"]}

#### `record_shorten` (module `record_shorten`) — 19018 rows

Log of URLs shortened (service TinyURL, backup is.gd) — used for links in SMS. 🔒 (`uid`, `hostname`). Operational log.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `sid` | serial |  unsigned | Y |  |  |
| `original` | varchar | 255 | Y |  |  |
| `short` | varchar | 255 | Y |  |  |
| `service` | varchar | 255 | Y |  |  |
| `uid` | int |  unsigned | Y | 0 |  |
| `hostname` | varchar | 128 | Y |  |  |
| `created` | int |  | Y | 0 |  |

PK: ["sid"]; indexes: sid

#### `ts_locations` (module `techstep_location`) — 274 rows

Geocode cache for `resources` nodes: `nid` → `lat`,`lng` (text). Deleted with the resource (`twm_general_node_delete`). Migrate onto the resource document (GeoJSON point).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `nid` | int |  |  |  |  |
| `lat` | text |  | Y |  |  |
| `lng` | text |  | Y |  |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `ts_tracking` (module `techstep_tracking`) — 113 rows

🔒 User-defined **trackers** ("Your Trackers", `my-tracking`). `uid` owner; `tid` = `custom_tracking` term (296 Hormones, 297 PrEP, 298 Sex) or 0 = custom; `text` = tracker label; `how_often` 0 = daily, 1 = weekly; `day` = weekday 0–6 for weekly (NULL for daily); `reminders` 0/1 = SMS reminder on; `noti_text` = reminder text; `flag` 1 = active, 0 = deleted (soft delete); `created` unix.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  |  |  |  |
| `tid` | int |  | Y |  |  |
| `text` | text |  | Y |  |  |
| `how_often` | int | tiny | Y |  |  |
| `day` | int | tiny |  |  |  |
| `reminders` | int | tiny | Y |  |  |
| `noti_text` | text |  | Y |  |  |
| `flag` | int | tiny | Y | 1 |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `ts_tracking_data` (module `techstep_tracking`) — 266 rows

🔒 Tracker check-ins: `uid`, `tid` = **`ts_tracking.id`** (not a term id), `checkin` 1 = yes / 0 = no, `created` unix (one per tracker per day; updated in place).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  | Y |  |  |
| `tid` | int |  | Y |  |  |
| `checkin` | int | tiny |  |  |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `ts_tracking_time` (module `techstep_tracking`) — 45 rows

🔒 Per-user preferred tracker reminder `hour` (0–23).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  | Y |  |  |
| `hour` | int | tiny | Y |  |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `reminder_checkin` (module `techstep_tracking`) — 470 rows

🔒 **Daily check-in answers**: `uid`, `meds` 1 = took meds / 0 = missed / NULL = not answered, `moods` mood code (1 Happy, 2 Excited, 3 Silly, 4 Confident, 5 Calm, 6 Bored, 7 Confused, 8 Worried, 9 Overwhelmed, 10 Sad, 11 Frustrated, 12 Angry; NULL = not answered), `checkin` (unused, NULL), `created` unix. One row per user per day.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `uid` | int | 11 |  |  |  |
| `meds` | int | 11 |  |  |  |
| `moods` | int | 11 |  |  |  |
| `checkin` | int | 11 |  |  |  |
| `created` | int | 11 |  |  |  |

PK: ["id"]

#### `reminder_checkin_time` (module `techstep_tracking`) — 36 rows

🔒 Per-user daily check-in reminder schedule: `reminders` 0/1, `how_often` 0 daily / 1 weekly, `day` weekday, `hour`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  | Y |  |  |
| `reminders` | int | tiny | Y |  |  |
| `how_often` | int | tiny | Y |  |  |
| `day` | int | tiny |  |  |  |
| `hour` | int | tiny | Y |  |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `twilio_user` (module `twilio`) — 3 rows

🔒 Verified phone numbers for SMS: `uid`, `number` (PK), `country` code, `status` 1 = pending verification, 2 = confirmed, `code` verification code.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `uid` | int |  unsigned | Y |  |  |
| `number` | varchar | 32 | Y |  |  |
| `country` | varchar | 32 | Y | 1 |  |
| `status` | int |  unsigned | Y |  |  |
| `code` | varchar | 16 |  |  |  |

PK: ["number"]; indexes: uid

#### `uy_user_notifications` (module `twm_comment_notification`) — 1985 rows

🔒 Bell-notification feed. `uid` recipient, `nid`/`cid` subject, `author_uid` actor, `created`. `category`/`action` pairs observed: comment/comment 250, comment/made 243, comment/also 64, comment/liked 25, comment/tagged 14, node/tagged 9, post/post 636, post/liked 31; and `category` NULL with `action` = `welcome` 44, `timeonsite` 118, `tracker` 35, `journey` 21, `level` 8, `midpoint1..3`, `week3/6/9/12/15/18/19/20`, and `checkin<unix-ts>` / `checkin-<unix-ts>` (per-day check-in notifications, ts embedded in the string). Read state is tracked by variable `bell_notifications` (last-seen timestamp).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `uid` | int | 11 |  |  |  |
| `nid` | int | 11 |  |  |  |
| `cid` | int | 11 |  |  |  |
| `category` | varchar | 255 |  |  |  |
| `action` | varchar | 255 |  |  |  |
| `author_uid` | int | 11 |  |  |  |
| `created` | int | 11 |  |  |  |

PK: ["id"]

#### `uy_wallflag_count` (module `twm_general`) — 104908 rows

History of flag actions (`fid`, `entity_type`, `entity_id`, `uid`, `count`, `created`). By fid: 9 (tailored tip highlight) 103,095; 37 thumbs-up node 246; 17 love node 211; 27 target node 162; 23 fire node 150; 15 haha node 144; 25 super node 103; 16 love comment 88; 36 thumbs-up comment 67; 22 fire comment 54; 1 abuse node 51; 29 thought node 46; 26 target comment 45; 24 super comment 33; 14 haha comment 32; 10 favourites 290; 38 resource 27; 39 favorite_resource 21; 3 abuse comment 25; 28 thought comment 18. Used for reaction counts/reports.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `fid` | int | 11 |  |  |  |
| `entity_type` | varchar | 255 |  |  |  |
| `entity_id` | int | 11 |  |  |  |
| `uid` | int | 11 |  |  |  |
| `count` | int | 11 |  |  |  |
| `created` | int | 11 |  |  |  |

PK: ["id"]

#### `weekly_checkin_feedback` (module `twm_weekly_checkin`) — 875 rows

🔒 Weekly check-in history rendered for the weekly feedback page. Columns hold **HTML fragments**: `meds` e.g. `<div class="no-skip"><div class="circle"></div></div>` (not answered), `…stopcircle…` (no data), `<div class="skip meds"><div class="checkedcircle"></div></div>` (took meds); `moods` = `<div class="stopcircle">` or `<img src=/sites/all/modules/twm_weekly_checkin/files/<mood>.png>` (fine, happy, sad, anxious, frustrated, …). `week_days` = weekday name, `used` 0/1/NULL, `reminder_id`, `week_count`, `date`. Migrate by parsing into `{medsTaken: bool|null, mood: enum|null}`; prefer recomputing from `reminder_checkin`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `user_id` | int | 11 |  |  |  |
| `week_days` | varchar | 255 |  |  |  |
| `meds` | varchar | 255 |  |  |  |
| `moods` | varchar | 255 |  |  |  |
| `used` | varchar | 255 |  |  |  |
| `reminder_id` | varchar | 255 |  |  |  |
| `week_count` | varchar | 255 |  |  |  |
| `date` | varchar |  |  |  |  |

PK: ["id"]; indexes: user_id, week_days, meds, moods, used, reminder_id, week_count, date

#### `youthrive_reports` (module `uy_standard_usage_report`) — 7199 rows

🔒 Login sessions (usage report): `uid` (stored as text), `login_date`, `logout_date`, `device_used` (User-Agent), `created`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | text |  |  |  |  |
| `login_date` | int |  |  |  |  |
| `device_used` | text |  |  |  |  |
| `logout_date` | int |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `profile_features_update` (module `uy_standard_user_engagement`) — 120 rows

Profile-update counter events (`uid` text, `count`, `created`).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | text |  |  |  |  |
| `count` | int |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `user_goals_reported` (module `uy_standard_user_engagement`) — 285 rows

Counter per `user_goals` node (`uid`, `nid`, `count`, `created`).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  |  |  |  |
| `nid` | int |  |  |  |  |
| `count` | int |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `ts_user_stats` (module `uy_standard_user_engagement`) — 235 rows

Engagement counters: `type` ∈ `profile-edits` 39, `profile_avatar` 47, `resource_views` 73, `tpv` 76 (thrive-tip page views); `nid`, `text`, `count`, `created`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  |  |  |  |
| `nid` | int |  |  |  |  |
| `type` | text |  |  |  |  |
| `text` | text |  |  |  |  |
| `count` | int |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `user_tips_report` (module `uy_user_tips_report`) — 423 rows

Thrive-tip view counter per (`uid`,`nid`).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  |  |  |  |
| `nid` | int |  |  |  |  |
| `count` | int |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `votingapi_vote` (module `votingapi`) — 0 rows

§4.5 (empty).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `vote_id` | serial |  unsigned | Y |  |  |
| `entity_type` | varchar | 64 | Y | node |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `value` | float |  | Y | 0 |  |
| `value_type` | varchar | 64 | Y | percent |  |
| `tag` | varchar | 64 | Y | vote |  |
| `uid` | int |  unsigned | Y | 0 |  |
| `timestamp` | int |  unsigned | Y | 0 |  |
| `vote_source` | varchar | 255 |  |  |  |

PK: ["vote_id"]; indexes: content_uid, content_uid_2, content_source, content_value_tag

#### `votingapi_cache` (module `votingapi`) — 0 rows

§4.5 (empty).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `vote_cache_id` | serial |  unsigned | Y |  |  |
| `entity_type` | varchar | 64 | Y | node |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `value` | float |  | Y | 0 |  |
| `value_type` | varchar | 64 | Y | percent |  |
| `tag` | varchar | 64 | Y | vote |  |
| `function` | varchar | 64 | Y |  |  |
| `timestamp` | int |  unsigned | Y | 0 |  |

PK: ["vote_cache_id"]; indexes: content, content_function, content_tag_func, content_vtype_tag, content_vtype_tag_func

#### `week_days` (module `weekly_checkin_feedback`) — 7 rows

Lookup: 1 Sunday, 2 Monday, 3 Tuesday, 4 Wednesday, 5 Thursday, 6 Friday, 7 Saturday.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `days` | varchar | 255 | Y |  |  |

PK: ["id"]; indexes: days

#### `achievement_stats` (module `youthrive_game_mechanics`) — 6495 rows

**Points ledger** — see §4.6.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `achievement_id` | varchar | 100 | Y |  |  |
| `uid` | int |  | Y |  |  |
| `points` | int |  | Y |  |  |
| `date` | int |  | Y |  |  |

PK: ["id"]

#### `uy_sms_reminder_stats` (module `youthrive_sms_reminders`) — 910 rows

🔒 Log of scheduled SMS sent via Twilio: `message_sid` (Twilio SID), `sms_to`, `sms_from`, `sms_created_date`, `sms_flag` = campaign key: `WELCOME`, `WEEK-1`…`WEEK-22`, `WEEK-19+FOUR`, `MIDPOINT-1`, `MIDPOINT-2`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  | Y |  |  |
| `uid` | int | 11 | Y |  |  |
| `message_sid` | varchar | 255 | Y |  |  |
| `sms_to` | varchar | 255 | Y |  |  |
| `sms_from` | varchar | 255 | Y |  |  |
| `sms_created_date` | varchar |  |  |  |  |
| `sms_flag` | varchar | 255 |  |  |  |

PK: ["id"]; indexes: uid, message_sid, sms_to, sms_from, sms_created_date, sms_flag

#### `youthrive_tags_index` (module `youthrive_tags`) — 149 rows

Hashtag index: `tid` (youthrive_tags) × `entity_id` (node) × `type` (`node`) × `comment_id` (if the tag was in a comment).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `tid` | int |  unsigned | Y | 0 |  |
| `entity_id` | int |  unsigned | Y | 0 |  |
| `type` | varchar | 32 | Y |  |  |
| `comment_id` | int |  unsigned |  |  |  |

PK: -; indexes: entity_tid, entity_id, comment_id

Infrastructure tables (no domain data, not migrated): `ckeditor_settings` (ckeditor, 3 rows), `ckeditor_input_format` (ckeditor, 1 rows), `ctools_object_cache` (ctools, 0 rows), `ctools_css_cache` (ctools, 0 rows), `fe_block_boxes` (fe_block, 0 rows), `features_signature` (features, 89 rows), `feeds_importer` (feeds, 1 rows), `feeds_source` (feeds, 1 rows), `feeds_item` (feeds, 0 rows), `feeds_push_subscriptions` (feeds, 0 rows), `feeds_log` (feeds, 0 rows), `job_schedule` (job_scheduler, 0 rows), `quicktabs` (quicktabs, 1 rows), `shorten_cs` (shorten_cs, 0 rows), `vef_video_styles` (video_embed_field, 2 rows), `views_view` (views, 33 rows), `views_display` (views, 88 rows), `views_data_export` (views_data_export, 0 rows), `views_data_export_object_cache` (views_data_export, 0 rows).

#### Legacy tables not declared by any enabled module (LP)

Left behind by disabled/removed modules (mostly the Qualtrics survey integration `qsurvey`, disabled). Columns from
`information_schema`.

| table | rows | columns | meaning |
| --- | --- | --- | --- |
| `qsurvey` | 79 | `qid` int PK AI, `survey_id` varchar(255), `question_id` varchar(255), `question_type` varchar(255), `question_text` text, `profile_field` varchar(255), `export_tag` varchar(255) | Qualtrics survey question catalogue (site config) |
| `cache_qsurvey` | 0 | same as `qsurvey` (survey_id nullable) | cache |
| `multiple_qsurveys` | 2 | `id` PK AI, `tokenid` int, `surveyid` varchar(100), `status` int default 1, `data` longblob | Qualtrics survey config per token |
| `qsurvey_admin` | 1 | `id` PK AI, `username` varchar(255), `token` varchar(255) | Qualtrics API credentials — **secret, do not migrate as-is** |
| `qsurvey_watchdog` | 45 | `qid` PK AI, `log_id` int, `type`, `message`, `severity` varchar(255), `timestamp` datetime | Qualtrics sync log |
| `twm_survey_response_log` | 5406 | `id` PK AI, `last_cron_time`, `admin_current_time`, `survey_start_time`, `survey_end_time` datetime, `survey_response_id` varchar(255) | Qualtrics response-sync log (survey reports) |
| `users_logs` | 198 | `id` PK AI, `rid` varchar(50), `name` varchar(255), `survey_id` varchar(255), `data` varchar(255), `logs` varchar(255), `status` int default 1, `created_at` datetime | 🔒 Log of users created from survey responses (`qsurvey_createuser_cron`) |
| `sms_engagement_messages` | 61 | `id` PK AI, `uid` int, `week` varchar(250) (`WEEK-1`…`WEEK-21`, `WEEK-19 4`), `clicked` varchar(250) (`Yes`), `link_clicked_date` int | 🔒 SMS link click-through tracking |
| `ts_tracking_bkp` | 32 | like `ts_tracking` but `how_often`, `day`, `hour`, `reminders` are text; no `noti_text` | 🔒 old backup copy of trackers — ignore |

The code of `twm_randomization` also deletes from a table `reminders` that does not exist (dead code).

---
## 6. Peer Navigation — entities, bundles, fields, tables

### 6.1 Entity types and bundles (PN)

`session_data` / `session_data_log` are Entity-API wrappers over `ecoach_session_data` / `ecoach_session_log`.

| entity type | base table | module | bundle | bundle label | rows |
| --- | --- | --- | --- | --- | --- |
| comment | comment |  | comment_node_article | Article comment | 0 |
| comment | comment |  | comment_node_page | Basic page comment | 0 |
| comment | comment |  | comment_node_notes | Notes comment | 0 |
| comment | comment |  | comment_node_user_sessions | User Sessions comment | 0 |
| comment | comment |  | comment_node_webform | Webform comment | 0 |
| session_data | ecoach_session_data |  | session_data | session_data | 186 |
| session_data_log | ecoach_session_log |  | session_data_log | session_data_log | 166 |
| node | node |  | article | Article | 0 |
| node | node |  | page | Basic page | 2 |
| node | node |  | notes | Notes | 228 |
| node | node |  | user_sessions | User Sessions | 3 |
| node | node |  | webform | Webform | 1 |
| privatemsg_message | pm_message |  | privatemsg_message | Private message | 75 |
| file | file_managed |  | file | File | 33 |
| taxonomy_term | taxonomy_term_data |  | tags | Tags | 0 |
| taxonomy_vocabulary | taxonomy_vocabulary |  | taxonomy_vocabulary | Taxonomy vocabulary | 1 |
| user | users |  | user | User | 46 |

### 6.2 Node content types (PN)

Same column meanings as §3.2. `notes` and `user_sessions` are defined by Features modules `notes` and
`user_sessions`. The single `webform` node is "week1" (nid 50); the two `page` nodes are nid 1 "uc" (front page) and
nid 59 "test".

| type | name | module/base | title label | has_body | description | nodes (pub/unpub) | node_options | node_submitted | comment (0 hidden/1 closed/2 open) | comment_default_mode | per_page | anon | subject field | form location | preview | comments |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `notes` | Notes | notes/node_content | Title |  |  | 228/0 | ["status"] | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| `user_sessions` | User Sessions | user_sessions/node_content | Title |  |  | 3/0 | ["status"] | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 0 | 0 |
| `article` | Article | node/node_content | Title |  | Use articles for time-sensitive content like news, press releases or blog posts. | 0/0 | ["status","promote"] | 1 | 2 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `page` | Basic page | node/node_content | Title |  | Use basic pages for your static content, such as an 'About us' page. | 2/0 | ["status"] |  | 0 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |
| `webform` | Webform | node/node_content | Title |  | Create a new form or questionnaire accessible to users. Submission results and statistics are recorded and accessible to privileged users. | 1/0 | ["status","promote"] | 1 | 0 | 1 | 50 | 0 | 1 | 1 | 1 | 0 |

- `field_bundle_settings_node__notes` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_node__user_sessions` = {"view_modes":[],"extra_fields":{"form":{"title":{"weight":"-5"}},"display":[]}}
- `field_bundle_settings_user__user` = {"view_modes":{"full":{"custom_settings":false}},"extra_fields":{"form":{"account":{"weight":"-10"},"timezone":{"weight":"6"},"privatemsg":{"weight":"5"}},"display":{"privatemsg_send_new_message":{"default":{"weight":"10","visible":false}},"summary":{"default":{"weight":"9","visible":false}}}}}
- `menu_options_notes` = ["main-menu"]
- `menu_options_user_sessions` = ["main-menu"]
- `menu_parent_notes` = main-menu:0
- `menu_parent_user_sessions` = main-menu:0
- `webform_node_webform` = 1

### 6.3 Field storage definitions (PN)

| field_name | type | module | cardinality | storage table | settings (allowed values / targets) | used in (entity:bundle) | rows in field_data |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | text_with_summary | text | 1 | field_data_body |  | node:article, node:page | 2 |
| `comment_body` | text_long | text | 1 | field_data_comment_body |  | comment:comment_node_article, comment:comment_node_notes, comment:comment_node_page, comment:comment_node_user_sessions, comment:comment_node_webform | 0 |
| `field_about_me` | text_long | text | 1 | field_data_field_about_me |  | user:user | 1 |
| `field_age` | number_integer | number | 1 | field_data_field_age |  | user:user | 0 |
| `field_coach` | entityreference | entityreference | 1 | field_data_field_coach | target_type=user handler=views view={"args":[5],"display_name":"entityreference_1","view_name":"user_reference"} | user:user | 20 |
| `field_first_name` | text | text | 1 | field_data_field_first_name | max_length=255 | user:user | 10 |
| `field_goals` | list_text | list | unlimited | field_data_field_goals | allowed: 1= Goal 1; 2= Goal 2; 3= Goal 3 | node:user_sessions | 3 |
| `field_image` | image | image | 1 | field_data_field_image | uri_scheme=public | node:article | 0 |
| `field_location` | text | text | 1 | field_data_field_location | max_length=255 | user:user | 1 |
| `field_method_of_contact` | number_integer | number | 1 | field_data_field_method_of_contact |  | node:notes | 199 |
| `field_notes` | text_long | text | 1 | field_data_field_notes |  | node:notes | 228 |
| `field_on_prep` | list_boolean | list | 1 | field_data_field_on_prep | allowed: 0=0; 1=1 | user:user | 45 |
| `field_participant_code` | text | text | 1 | field_data_field_participant_code | max_length=255 | user:user | 0 |
| `field_pronoun` | text | text | 1 | field_data_field_pronoun | max_length=255 | user:user | 3 |
| `field_session` | list_text | list | 1 | field_data_field_session | allowed: 1=Session 1; 2=Session 2; 3=Session 3; 4=Session 4; 5=Session 5; 6=Session 6; 7=Session 7 | node:user_sessions | 3 |
| `field_session_complete` | list_boolean | list | 1 | field_data_field_session_complete | allowed: 0=; 1= | node:user_sessions | 3 |
| `field_session_ref` | entityreference | entityreference | 1 | field_data_field_session_ref | target_type=node handler=base bundles=user_sessions | node:notes | 128 |
| `field_study_id` | text | text | 1 | field_data_field_study_id | max_length=255 | user:user | 0 |
| `field_tags` | taxonomy_term_reference | taxonomy | unlimited | field_data_field_tags | vocab=tags | node:article | 0 |
| `field_user` | entityreference | entityreference | 1 | field_data_field_user | target_type=user handler=views view={"args":[4],"display_name":"entityreference_1","view_name":"user_reference"} | node:notes, node:user_sessions | 231 |
| `field_weight` | number_integer | number | 1 | field_data_field_weight |  | node:user_sessions | 3 |
| `field_zoom_link` | text | text | 1 | field_data_field_zoom_link | max_length=255 | user:user | 8 |


Entity-reference handlers: `field_coach` and `field_user` use the view `user_reference` (display `entityreference_1`)
filtered by role id argument — `field_coach` → users with rid **5 (coach)**, `field_user` → users with rid **4
(participant)**.

### 6.4 Field value columns (PN)

| field_name | columns (legacy column => type) |
| --- | --- |
| `body` | body_value:text/big, body_summary:text/big, body_format:varchar(255) |
| `comment_body` | comment_body_value:text/big, comment_body_format:varchar(255) |
| `field_about_me` | field_about_me_value:text/big, field_about_me_format:varchar(255) |
| `field_age` | field_age_value:int |
| `field_coach` | field_coach_target_id:int |
| `field_first_name` | field_first_name_value:varchar(255), field_first_name_format:varchar(255) |
| `field_goals` | field_goals_value:varchar(255) |
| `field_image` | field_image_fid:int, field_image_alt:varchar(512), field_image_title:varchar(1024), field_image_width:int, field_image_height:int |
| `field_location` | field_location_value:varchar(255), field_location_format:varchar(255) |
| `field_method_of_contact` | field_method_of_contact_value:int |
| `field_notes` | field_notes_value:text/big, field_notes_format:varchar(255) |
| `field_on_prep` | field_on_prep_value:int |
| `field_participant_code` | field_participant_code_value:varchar(255), field_participant_code_format:varchar(255) |
| `field_pronoun` | field_pronoun_value:varchar(255), field_pronoun_format:varchar(255) |
| `field_session` | field_session_value:varchar(255) |
| `field_session_complete` | field_session_complete_value:int |
| `field_session_ref` | field_session_ref_target_id:int |
| `field_study_id` | field_study_id_value:varchar(255), field_study_id_format:varchar(255) |
| `field_tags` | field_tags_tid:int |
| `field_user` | field_user_target_id:int |
| `field_weight` | field_weight_value:int |
| `field_zoom_link` | field_zoom_link_value:varchar(255), field_zoom_link_format:varchar(255) |


### 6.5 Field instances per bundle (PN)


#### comment : comment_node_article

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_notes

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_user_sessions

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### comment : comment_node_webform

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `comment_body` | Comment | text_long | 1 | Y | text_textarea rows=5 |  | text_processing=1 |

#### node : article

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |
| `field_tags` | Tags | taxonomy_term_reference | ∞ |  | taxonomy_autocomplete |  | help: Enter a comma-separated list of words to describe your content. |
| `field_image` | Image | image | 1 |  | image_image |  | help: Upload an image to go with this article. ; file_directory=field/image ; file_extensions=png gif jpg jpeg |

#### node : notes

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_session_ref` | Session Reference | entityreference | 1 |  | options_select |  |  |
| `field_notes` | Notes | text_long | 1 |  | text_textarea rows=5 |  |  |
| `field_user` | User | entityreference | 1 |  | options_select |  |  |
| `field_method_of_contact` | Method of Contact | number_integer | 1 | Y | select_or_other | [{"value":"1"}] | select_or_other options: 1\|Voice; 2\|Voicemail; 3\|SMS; 4\|Email |

#### node : page

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Body | text_with_summary | 1 |  | text_textarea_with_summary rows=20 |  | text_processing=1 |

#### node : user_sessions

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_user` | User | entityreference | 1 |  | options_select |  |  |
| `field_weight` | Weight | number_integer | 1 |  | number |  |  |
| `field_session` | Notes Session | list_text | 1 |  | options_select |  |  |
| `field_goals` | Goals | list_text | ∞ |  | options_buttons |  |  |
| `field_session_complete` | Session Complete? | list_boolean | 1 |  | options_onoff | [{"value":0}] |  |

#### user : user

| field | label | type | card. | req | widget | default | notes (help text / instance settings) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `field_coach` | Coach | entityreference | 1 |  | options_select |  |  |
| `field_pronoun` | Pronoun | text | 1 |  | text_textfield |  |  |
| `field_location` | Location | text | 1 |  | text_textfield |  |  |
| `field_study_id` | Study Id | text | 1 |  | text_textfield |  |  |
| `field_participant_code` | Participant Code | text | 1 |  | text_textfield |  |  |
| `field_age` | Age | number_integer | 1 |  | number |  |  |
| `field_on_prep` | On PrEP? | list_boolean | 1 |  | options_onoff | [{"value":0}] |  |
| `field_first_name` | First Name | text | 1 |  | text_textfield |  |  |
| `field_about_me` | About Me | text_long | 1 |  | text_textarea rows=5 |  |  |
| `field_zoom_link` | Zoom Link | text | 1 |  | text_textfield |  | text_processing=1 |

Semantics: a **user_sessions** node is a coaching-plan session template/record for one participant (`field_user`),
with `field_session` (Session 1–7), `field_goals` (Goal 1–3, multi), `field_session_complete`, `field_weight`
(ordering). A **notes** node is a coach's note about a participant (`field_user`), optionally tied to a session
(`field_session_ref` → user_sessions), with `field_method_of_contact` (integer; select-or-other options 1 Voice,
2 Voicemail, 3 SMS, 4 Email; default 1; "other" values may be free integers) and `field_notes` (🔒 text).

### 6.6 PN custom & contrib tables

#### `cas_login_data` (module `cas`) — 0 rows

CAS single-logout session map (0 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `cas_session_id` | varchar | 255 | Y |  |  |
| `uid` | int |  unsigned | Y |  |  |
| `created` | int |  | Y | 0 |  |

PK: ["cas_session_id"]

#### `cas_user` (module `cas`) — 34 rows

CAS identity map: `cas_name` (LP username) → local `uid`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `aid` | serial |  unsigned | Y |  |  |
| `uid` | int |  | Y | 0 |  |
| `cas_name` | varchar | 128 | Y |  |  |

PK: ["aid"]; unique: {"cas_name":["cas_name"]}; indexes: cas_user

#### `ecoach_session_data` (module `ecoach_sessions`) — 186 rows

🔒 **Coaching session progress** per participant: `uid` participant, `aid` = author/coach uid, `sid` = session number (1–10 observed), `weight` = display order, `complete` 1/NULL, `date` completion unix time, `goals` (blob, NULL in all rows), `created`. 186 rows over 33 participants.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `uid` | int |  | Y | 0 |  |
| `aid` | int | 100 | Y |  |  |
| `weight` | int | 100 | Y |  |  |
| `sid` | int | 100 | Y |  |  |
| `complete` | int | tiny |  |  |  |
| `date` | int |  |  |  |  |
| `goals` | blob |  |  |  |  |
| `created` | int |  |  |  |  |

PK: ["id"]

#### `ecoach_session_log` (module `ecoach_sessions`) — 166 rows

🔒 Revision log of the session form: `session_data_id` → `ecoach_session_data.id`, `created`, `goals` = PHP-serialized **entire submitted form state**, keys: `engaging`, `focusing`, `evoking`, `planning`, `summary` (arrays of checkbox/option values — Motivational-Interviewing phases), `general`, `session`, `session_time`, per-session `nid<N>`, `user<N>`, `note<N>`, `note_mode<N>`, `save<N>`, `complete<N>`, `session<N>` (attachment arrays), `session_attachment`, `eattach`, plus Drupal form noise (`form_build_id`, `form_token`, `form_id`). Migrate by extracting the domain keys only.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `id` | serial |  unsigned | Y |  |  |
| `session_data_id` | int |  | Y | 0 |  |
| `goals` | blob |  |  |  |  |
| `created` | int |  | Y |  |  |

PK: ["id"]

#### `pm_index` (module `privatemsg`) — 6 rows

🔒 Message ↔ recipient/thread index: `mid`, `thread_id`, `recipient` uid, `is_new` 1/0, `deleted` (0 or unix ts), `type` (`user`). Only 6 rows vs 75 messages — the index is incomplete in the backup; thread membership for most messages must be inferred (thread_id = mid of first message) or treated as lost.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `mid` | int |  unsigned | Y |  |  |
| `thread_id` | int |  unsigned | Y |  |  |
| `recipient` | int |  unsigned | Y |  |  |
| `is_new` | int |  unsigned | Y | 1 |  |
| `deleted` | int |  unsigned | Y | 0 |  |
| `type` | varchar | 255 | Y | user |  |

PK: ["mid","recipient","type"]; indexes: list, messages, participants

#### `pm_message` (module `privatemsg`) — 75 rows

🔒 Private messages: `mid`, `author` uid, `subject`, `body`, `format`, `timestamp`, `has_tokens`. 75 messages from 6 authors.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `mid` | serial |  unsigned | Y |  |  |
| `author` | int |  unsigned | Y |  |  |
| `subject` | varchar | 255 | Y |  |  |
| `body` | text | big | Y |  |  |
| `format` | varchar | 255 |  |  |  |
| `timestamp` | int |  unsigned | Y |  |  |
| `has_tokens` | int | small unsigned | Y | 0 |  |

PK: ["mid"]

#### `pm_disable` (module `privatemsg`) — 0 rows

Users who disabled private messaging (0 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `uid` | int |  unsigned | Y |  |  |

PK: ["uid"]

#### `pm_tags` (module `privatemsg_filter`) — 1 rows

Message tags: 1 row — `Inbox` (hidden 1, public 0), the tag id stored in variable `privatemsg_filter_inbox_tag`.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `tag_id` | serial |  unsigned | Y |  |  |
| `tag` | varchar | 255 | Y |  |  |
| `public` | int | tiny unsigned |  | 0 |  |
| `hidden` | int | tiny unsigned |  | 0 |  |

PK: ["tag_id"]; indexes: tag_list

#### `pm_tags_index` (module `privatemsg_filter`) — 5 rows

Tag ↔ (uid, thread) (5 rows).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `tag_id` | int |  unsigned | Y |  |  |
| `uid` | int |  unsigned | Y |  |  |
| `thread_id` | int |  unsigned | Y |  |  |

PK: ["tag_id","uid","thread_id"]; indexes: thread_tags

#### `webform` (module `webform`) — 1 rows

Webform settings per node (1 row: nid 50 "week1").

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `nid` | int |  unsigned | Y |  |  |
| `next_serial` | int |  unsigned | Y | 1 |  |
| `confirmation` | text |  | Y |  |  |
| `confirmation_format` | varchar | 255 |  |  |  |
| `redirect_url` | varchar | 2048 |  | <confirmation> |  |
| `status` | int | tiny | Y | 1 |  |
| `block` | int | tiny | Y | 0 |  |
| `allow_draft` | int | tiny | Y | 0 |  |
| `auto_save` | int | tiny | Y | 0 |  |
| `submit_notice` | int | tiny | Y | 1 |  |
| `confidential` | int | tiny | Y | 0 |  |
| `submit_text` | varchar | 255 |  |  |  |
| `submit_limit` | int | tiny | Y | -1 |  |
| `submit_interval` | int |  | Y | -1 |  |
| `total_submit_limit` | int |  | Y | -1 |  |
| `total_submit_interval` | int |  | Y | -1 |  |
| `progressbar_bar` | int | tiny | Y | 0 |  |
| `progressbar_page_number` | int | tiny | Y | 0 |  |
| `progressbar_percent` | int | tiny | Y | 0 |  |
| `progressbar_pagebreak_labels` | int | tiny | Y | 0 |  |
| `progressbar_include_confirmation` | int | tiny | Y | 0 |  |
| `progressbar_label_first` | varchar | 255 |  |  |  |
| `progressbar_label_confirmation` | varchar | 255 |  |  |  |
| `preview` | int | tiny | Y | 0 |  |
| `preview_next_button_label` | varchar | 255 |  |  |  |
| `preview_prev_button_label` | varchar | 255 |  |  |  |
| `preview_title` | varchar | 255 |  |  |  |
| `preview_message` | text |  | Y |  |  |
| `preview_message_format` | varchar | 255 |  |  |  |
| `preview_excluded_components` | text |  | Y |  |  |

PK: ["nid"]

#### `webform_component` (module `webform`) — 3 rows

Components of nid 50: cid 1 `check1` select, cid 2 `check2` fieldset, cid 3 `check3` select (none required).

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `nid` | int |  unsigned | Y | 0 |  |
| `cid` | int | small unsigned | Y | 0 |  |
| `pid` | int | small unsigned | Y | 0 |  |
| `form_key` | varchar | 128 |  |  |  |
| `name` | text |  | Y |  |  |
| `type` | varchar | 16 |  |  |  |
| `value` | text |  | Y |  |  |
| `extra` | text |  | Y |  |  |
| `required` | int | tiny | Y | 0 |  |
| `weight` | int | small | Y | 0 |  |

PK: ["nid","cid"]

#### `webform_roles` (module `webform`) — 2 rows

Roles allowed to submit nid 50: rid 1 anonymous, rid 2 authenticated.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `nid` | int |  unsigned | Y | 0 |  |
| `rid` | int |  unsigned | Y | 0 |  |

PK: ["nid","rid"]

#### `webform_submissions` (module `webform`) — 0 rows

0 rows.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `sid` | serial |  unsigned | Y |  |  |
| `nid` | int |  unsigned | Y | 0 |  |
| `serial` | int |  unsigned | Y |  |  |
| `uid` | int |  unsigned | Y | 0 |  |
| `is_draft` | int | tiny | Y | 0 |  |
| `highest_valid_page` | int | small | Y | 0 |  |
| `submitted` | int |  | Y | 0 |  |
| `completed` | int |  | Y | 0 |  |
| `modified` | int |  | Y | 0 |  |
| `remote_addr` | varchar | 128 |  |  |  |

PK: ["sid"]; unique: {"sid_nid":["sid","nid"],"nid_serial":["nid","serial"]}; indexes: nid_uid_sid, nid_sid

#### `webform_submitted_data` (module `webform`) — 0 rows

0 rows.

| column | type | size/length | not null | default | description |
| --- | --- | --- | --- | --- | --- |
| `nid` | int |  unsigned | Y | 0 |  |
| `sid` | int |  unsigned | Y | 0 |  |
| `cid` | int | small unsigned | Y | 0 |  |
| `no` | varchar | 128 | Y | 0 |  |
| `data` | text | medium | Y |  |  |

PK: ["nid","sid","cid","no"]; indexes: nid, sid_nid

Infrastructure / empty tables not detailed: `ctools_object_cache` (ctools, 0 rows), `ctools_css_cache` (ctools, 0 rows), `features_signature` (features, 18 rows), `views_view` (views, 2 rows), `views_display` (views, 4 rows), `webform_conditional` (webform, 0 rows), `webform_conditional_rules` (webform, 0 rows), `webform_conditional_actions` (webform, 0 rows), `webform_emails` (webform, 0 rows), `webform_last_download` (webform, 0 rows).

Legacy table not declared by an enabled module: `ecoach_usage_session` (0 rows; `id`, `uid`, `login_date`,
`logout_date`, `device_used`) from the disabled `ecoach_standard_usage_report`.

Files (PN): `file_managed` 33 rows (20 `public://`, 13 `private://`); `file_usage` module/type:
`ecoach_sessions/user_attachments` 12, `ecoach_sessions/session4` 1, `user/user` 5 (profile pictures). Private files
are session attachments ("my files", `user-files`) — 🔒 access-controlled (§8.2). Note: the 13 private files are
missing from the backup (README).

---
## 7. Users, roles & permissions (both sites)

### 7.1 User account data (both)

Core `users` columns — see §1. Relevant account settings:

| setting (variable) | LP | PN | meaning |
| --- | --- | --- | --- |
| `user_register` | `0` = only administrators create accounts | `2` = visitors, admin approval (but accounts are created by CAS: `cas_user_register` = 1) | registration mode |
| `user_email_verification` | `true` | (default true) | require email verification when visitors register |
| `user_cancel_method` | `user_cancel_block` | (default) | cancelling an account blocks it |
| `user_pictures` / `user_picture_default` | 1 / `public://avatar_selection/default.png` | 1 / (none; code falls back to `public://default.png`) | profile pictures enabled |
| `user_picture_dimensions`, `user_picture_file_size`, `user_picture_style`, `user_picture_path` | 1024x1024, 800 KB, `thumbnail`, `pictures` | 1024x1024, 800 KB, `thumbnail`, (default) | upload limits |
| `user_signatures` | 0 | — | no signatures |
| `configurable_timezones` / `user_default_timezone` | 1 / 0 (site default `America/Los_Angeles`) | — (site `America/New_York`) | per-user timezone allowed on LP (4 distinct values in use) |
| `user_admin_role` | 3 (administrator) | 3 (administrator) | role that gets all new permissions |
| `anonymous` | "Anonymous" | "" | anonymous display name |
| Account emails (`user_mail_*_subject` / `_body`) | Drupal defaults (subjects like "Account details for [user:name] at [site:name]"); bodies customised lengths 85–470 chars; `user_mail_status_activated_notify` 1, blocked/canceled notify 0 | defaults | emails; `twm_randomization` sends `register_no_approval_required` when a user is moved to `participant` |
| Password policy | none beyond Drupal defaults; `logintoboggan_minimum_password_length` 0 | none | — |

**LoginToboggan (LP)**: `logintoboggan_login_with_email` 1 (log in with username *or* email),
`logintoboggan_unified_login` 0, `logintoboggan_confirm_email_at_registration` 0 (no "confirm email" field),
`logintoboggan_immediate_login_on_register` 1, `logintoboggan_pre_auth_role` 2 (authenticated — i.e. no
pre-auth role), `logintoboggan_purge_unvalidated_user_interval` 0 (never purge),
`logintoboggan_override_destination_parameter` 1, `logintoboggan_login_block_type` 0 (link), redirects on
register/confirm empty, `logintoboggan_login_successful_message` 0.

**Avatar selection (LP)**: `avatar_selection_disable_user_upload` 0 (upload allowed), `…_force_user_avatar` 0,
`…_force_user_avatar_reg` 0, `…_set_random_default` 0, `…_distinctive_avatars` 0, `…_avatar_per_page` 0 (code
uses 30/12/25 per page), `…_imagecache_preset` ''. Packs gated by role — §4.6. The chosen avatar is written to
`users.picture` and user fields `field_avatar` / `field_user_picture` (file id as text) / `field_sticker`.

**users.data keys in use**: LP `ckeditor_*` (35 users), `overlay` (6); PN `overlay` (1). Nothing domain-relevant.

**Other user-level state on LP**: variables `user_last_access_time<uid>` (60 variables; per-user last-access
timestamp written by custom code — migrate into the user document), `drupal_wall_user_id` (last wall viewed; global,
buggy), `bell_notifications` (global last-seen timestamp).

User fields: LP §3.5 `user : user` + profile2 `main` (§4.2); PN §6.5 `user : user`. Key user fields:

| purpose | LP field | PN field |
| --- | --- | --- |
| first name | `field_first_name` (reg form) | `field_first_name` (from CAS `name`) |
| pronoun | `field_user_pronoun` (reg form), legacy profile2 `field_pronoun` | `field_pronoun` (from CAS `pronoun`) |
| location | `field_location` (reg form) | `field_location` (from CAS `location`) |
| zoom link | `field_zoom_link` (url, reg form) | `field_zoom_link` (text, from CAS `zoom`) |
| assigned coach | `field_coach` → user (view `coaches`) | `field_coach` → user with role coach (from CAS `coach_name`) |
| study id | `field_study_id` 🔒 | `field_study_id` |
| phone for SMS | `field_number` 🔒 (normalised to `+1XXXXXXXXXX` on save), also `twilio_user` | — |
| intervention start | `field_intervention_start_date` (date; drives day-N content & SMS schedule; set when converted to participant) | — |
| role change time | `field_role_changed_date` (unix ts +15 min as text) | — |
| weekly SMS time | `field_weekly_sms_date_time` | — |
| UI | `field_theme` (theme-1..4, default theme-1), `field_bg_image`, `field_avatar`, `field_user_picture`, `field_sticker`, `field_wall_visit` (wall-visit marker, text) | — |
| about me | profile2 `field_about_me`, `field_age` | `field_about_me`, `field_age` (int) |
| PrEP | — | `field_on_prep` (bool, default 0) |
| participant code | — | `field_participant_code` |

### 7.2 Roles — LP

| rid | name | weight | users with role |
| --- | --- | --- | --- |
| 1 | anonymous user | 0 | (implicit) |
| 2 | authenticated user | 1 | (implicit) |
| 6 | control | 2 | 43 |
| 7 | participant | 3 | 43 |
| 4 | Research Administrator User | 4 | 6 |
| 5 | Coordinator User | 5 | 13 |
| 3 | administrator | 6 | 1 |
| 9 | level-2-1 | 9 | 9 |
| 14 | level-7 | 12 | 0 |
| 15 | level-2 | 15 | 8 |
| 17 | level-5-1 | 17 | 0 |
| 18 | level-3 | 18 | 2 |
| 19 | coach | 19 | 7 |
| 20 | ecoach-user | 20 | 30 |
| 21 | level-3-1 | 21 | 2 |
| 22 | level-4 | 22 | 2 |
| 23 | level-5 | 23 | 0 |
| 24 | level-6 | 24 | 0 |
| 25 | level-6-1 | 25 | 0 |

Users: total=61, active(status=1)=20, blocked=41, never logged in=4, with picture=15.

Role meanings (LP):

- `anonymous user` (1), `authenticated user` (2): implicit.
- `control` (6): study control arm. **Every newly created account gets `control`** (`twm_utility_user_save`). Sees the
  basic app (twm_bootstrapless theme).
- `participant` (7): intervention arm — full app (wall, tips, check-ins, trackers, points). Set by the "Convert
  Control Users" bulk action (`twm_randomization_assignment_action`), which **replaces all roles with
  `participant`**, sets `field_intervention_start_date` = today and `field_role_changed_date`, and emails the user.
  The reverse action resets roles to `control`. Participants are **auto-blocked 150 days after their intervention
  start** (`twm_general_cron`).
- `Research Administrator User` (4), `Coordinator User` (5): study staff (reports, user management, content). Use the
  `twm_bootstrapless_old` theme.
- `administrator` (3): full admin.
- `coach` (19): peer navigator — on login redirected to PN via CAS; excluded from LP wall.
- `ecoach-user` (20): participant enrolled in Peer Navigation; if **not** also `participant` they are redirected to PN.
  An "add role" bulk action (`twm_randomization_add_role`) removes `ecoach-user`/`participant` then adds chosen
  roles.
- `level-*` (9, 14, 15, 17, 18, 21–25): **gamification unlock flags**, granted automatically by points (§4.6). Hold only
  text-format permissions (`level-2`, `level-2-1`, `level-7` may use filtered_html / full_html /
  limited_html_for_wall_posting — the unlocked richer wall-post formatting).

Users per role and status (LP): administrator 1 active; coach 6 active / 1 blocked; control 9 / 34; Coordinator
User 12 / 1; ecoach-user 1 / 29; participant 2 / 41; Research Administrator User 5 / 1; level-2 0 / 8; level-2-1
1 / 8; level-3 1 / 1; level-3-1 1 / 1; level-4 1 / 1.

### 7.3 Roles — PN

| rid | name | weight | users with role |
| --- | --- | --- | --- |
| 1 | anonymous user | 0 | (implicit) |
| 2 | authenticated user | 1 | (implicit) |
| 3 | administrator | 2 | 1 |
| 4 | participant | 3 | 26 |
| 5 | coach | 4 | 14 |
| 6 | coordinator | 5 | 8 |
| 7 | tech-participant | 6 | 24 |

Users: total=45, active(status=1)=44, blocked=1, never logged in=2, with picture=9. 1 user has no extra role.

Role meanings (PN): `participant` (4) = person being coached; `tech-participant` (7) = participant coming from LP
(assigned together with `participant` by CAS when the LP account has `participant` + `ecoach-user`); `coach` (5) =
peer navigator (assigned by CAS when the LP account has `coach`); `coordinator` (6) = staff who create coach ↔
participant relationships; `administrator` (3). `cas_auto_assigned_role` = {4 participant, 2 authenticated}: every
CAS-created account gets `participant` unless the CAS hook overrides.

### 7.4 Permission matrix — LP (`role_permission`)

Compact form: each permission with the roles that hold it (lossless re-expression of the matrix). Role names:
anon = `anonymous user`, auth = `authenticated user`, RA = `Research Administrator User`, Coord = `Coordinator
User`, admin = `administrator`. Permissions granted to `authenticated user` apply to every logged-in role.

| module | permission | roles |
| --- | --- | --- |
| access_report | administer access_report | Coord, admin |
| achievements | access achievements | participant, RA, Coord, admin |
| achievements | administer achievements | admin |
| achievements | earn achievements | control, participant, RA, Coord, admin |
| achievements | grant manual achievements | admin |
| achievements | manually grant achievements | admin |
| actions_permissions | execute comment_publish_action | admin |
| actions_permissions | execute comment_save_action | admin |
| actions_permissions | execute comment_unpublish_action | admin |
| actions_permissions | execute comment_unpublish_by_keyword_action | admin |
| actions_permissions | execute flag_comment_action | admin |
| actions_permissions | execute flag_node_action | admin |
| actions_permissions | execute flag_user_action | admin |
| actions_permissions | execute node_assign_owner_action | admin |
| actions_permissions | execute node_make_sticky_action | admin |
| actions_permissions | execute node_make_unsticky_action | admin |
| actions_permissions | execute node_promote_action | admin |
| actions_permissions | execute node_publish_action | Coord, admin |
| actions_permissions | execute node_save_action | admin |
| actions_permissions | execute node_unpromote_action | admin |
| actions_permissions | execute node_unpublish_action | Coord, admin |
| actions_permissions | execute node_unpublish_by_keyword_action | admin |
| actions_permissions | execute system_block_ip_action | admin |
| actions_permissions | execute system_goto_action | admin |
| actions_permissions | execute system_message_action | admin |
| actions_permissions | execute system_send_email_action | admin |
| actions_permissions | execute twm_randomization_add_role | Coord |
| actions_permissions | execute twm_randomization_assignment_action | RA, Coord, admin |
| actions_permissions | execute twm_randomization_deassignment_action | RA, Coord, admin |
| actions_permissions | execute user_block_user_action | Coord, admin |
| actions_permissions | execute views_bulk_operations_archive_action | admin |
| actions_permissions | execute views_bulk_operations_argument_selector_action | admin |
| actions_permissions | execute views_bulk_operations_delete_item | admin |
| actions_permissions | execute views_bulk_operations_delete_revision | admin |
| actions_permissions | execute views_bulk_operations_modify_action | Coord, admin |
| actions_permissions | execute views_bulk_operations_script_action | admin |
| actions_permissions | execute views_bulk_operations_user_cancel_action | Coord, admin |
| actions_permissions | execute views_bulk_operations_user_roles_action | RA, Coord, admin |
| announcements_feed | access announcements | admin |
| avatar_selection | access avatars | participant, RA, Coord, admin |
| avatar_selection | administer avatar selection | Coord, admin |
| avatar_selection | upload avatar in profile | Coord, admin |
| block | administer blocks | admin |
| cas_server | administer cas server | admin |
| ckeditor | administer ckeditor | admin |
| ckeditor | allow CKFinder file uploads | Coord, admin |
| ckeditor | customize ckeditor | admin |
| comment | access comments | participant, Coord, admin |
| comment | administer comments | Coord, admin |
| comment | edit own comments | participant, Coord, admin |
| comment | post comments | participant, Coord, admin |
| comment | skip comment approval | participant, Coord, admin |
| contextual | access contextual links | Coord, admin |
| ctools | use ctools import | admin |
| dashboard | access dashboard | admin |
| devel | access devel information | auth, admin |
| devel | execute php code | auth, admin |
| devel | switch users | auth, admin |
| drupal_wall | access global drupal wall content | auth, RA, admin |
| drupal_wall | create post on drupal wall | participant, Coord, admin |
| elysia_cron | administer elysia_cron | admin |
| features | administer features | admin |
| features | generate features | admin |
| features | manage features | admin |
| features | rename features | admin |
| feeds | administer feeds | admin |
| field | administer fields | RA, Coord, admin |
| field_collection | administer field collections | admin |
| field_conditional_state | administer field_conditional_state | admin |
| field_permissions | access private fields | RA, Coord, admin |
| field_permissions | administer field permissions | RA, Coord, admin |
| field_permissions | create field_avatar | anon, admin |
| field_permissions | create field_intervention_start_date | anon, admin |
| field_permissions | create field_number | control, admin |
| field_permissions | create field_role_changed_date | anon, admin |
| field_permissions | create field_sticker | anon, admin |
| field_permissions | create field_study_id | anon, admin |
| field_permissions | create field_weekly_sms_date_time | anon, admin |
| field_permissions | edit field_avatar | admin |
| field_permissions | edit field_intervention_start_date | RA, Coord, admin |
| field_permissions | edit field_role_changed_date | RA, Coord, admin |
| field_permissions | edit field_sticker | RA, Coord, admin |
| field_permissions | edit field_study_id | RA, Coord, admin |
| field_permissions | edit field_weekly_sms_date_time | RA, Coord, admin |
| field_permissions | edit own field_avatar | admin |
| field_permissions | edit own field_intervention_start_date | RA, Coord, admin |
| field_permissions | edit own field_role_changed_date | RA, Coord, admin |
| field_permissions | edit own field_sticker | RA, Coord, admin |
| field_permissions | edit own field_study_id | RA, Coord, admin |
| field_permissions | edit own field_weekly_sms_date_time | RA, Coord, admin |
| field_permissions | view field_avatar | admin |
| field_permissions | view field_intervention_start_date | RA, Coord, admin |
| field_permissions | view field_role_changed_date | RA, Coord, admin |
| field_permissions | view field_sticker | RA, Coord, admin |
| field_permissions | view field_study_id | RA, Coord, admin |
| field_permissions | view field_weekly_sms_date_time | RA, Coord, admin |
| field_permissions | view own field_avatar | admin |
| field_permissions | view own field_intervention_start_date | RA, Coord, admin |
| field_permissions | view own field_role_changed_date | RA, Coord, admin |
| field_permissions | view own field_sticker | RA, Coord, admin |
| field_permissions | view own field_study_id | RA, Coord, admin |
| field_permissions | view own field_weekly_sms_date_time | RA, Coord, admin |
| filter | administer filters | admin |
| filter | use text format filtered_html | auth, participant, RA, Coord, admin, level-2-1, level-7, level-2 |
| filter | use text format full_html | auth, participant, RA, Coord, admin, level-2-1, level-7, level-2 |
| filter | use text format limited_html_for_wall_posting | auth, participant, Coord, admin, level-2-1, level-7, level-2 |
| filter | use text format thrive_editor | Coord, admin |
| fivestar | rate content | participant, admin |
| flag | administer flags | admin |
| flag | flag abuse_comment | participant, Coord, admin |
| flag | flag abuse_node | participant, Coord, admin |
| flag | flag abuse_user | Coord, admin |
| flag | flag abuse_whitelist_comment | Coord, admin |
| flag | flag abuse_whitelist_node | RA, Coord, admin |
| flag | flag abuse_whitelist_user | RA, Coord, admin |
| flag | flag favorite_resource | auth, participant, Coord, admin |
| flag | flag favourites | participant, Coord, admin |
| flag | flag fire_comment_reactions | auth, participant, RA, Coord, admin |
| flag | flag fire_node_reactions | auth, participant, RA, Coord, admin |
| flag | flag haha_comment_reaction | auth, participant, RA, Coord, admin |
| flag | flag haha_node_reaction | auth, participant, RA, Coord, admin |
| flag | flag love_comment_reaction | auth, participant, RA, Coord, admin |
| flag | flag love_node_reaction | auth, participant, RA, Coord, admin |
| flag | flag resource | participant |
| flag | flag super_comment_reactions | auth, participant, RA, Coord, admin |
| flag | flag super_node_reaction | auth, participant, RA, Coord, admin |
| flag | flag target_comment_reaction | auth, participant, RA, Coord, admin |
| flag | flag target_node_reactions | auth, participant, RA, Coord, admin |
| flag | flag thought_comment_reactions | auth, participant, RA, Coord, admin |
| flag | flag thought_node_reactions | auth, participant, RA, Coord, admin |
| flag | flag thumbs_up_comment_reaction | auth, participant, RA, Coord, admin |
| flag | flag thumbs_up_node_reaction | auth, participant, RA, Coord, admin |
| flag | flag twm_tailored_tips_tailored | participant, Coord, admin |
| flag | flag up_voting | participant, Coord, admin |
| flag | flag up_voting_comments | participant, Coord, admin |
| flag | unflag abuse_comment | Coord, admin |
| flag | unflag abuse_node | Coord, admin |
| flag | unflag abuse_user | Coord, admin |
| flag | unflag abuse_whitelist_comment | Coord, admin |
| flag | unflag abuse_whitelist_node | RA, Coord, admin |
| flag | unflag abuse_whitelist_user | RA, Coord, admin |
| flag | unflag favorite_resource | auth, participant, Coord, admin |
| flag | unflag favourites | participant, Coord, admin |
| flag | unflag fire_comment_reactions | participant, Coord, admin |
| flag | unflag fire_node_reactions | participant, Coord, admin |
| flag | unflag haha_comment_reaction | participant, Coord, admin |
| flag | unflag haha_node_reaction | participant, Coord, admin |
| flag | unflag love_comment_reaction | participant, Coord, admin |
| flag | unflag love_node_reaction | participant, Coord, admin |
| flag | unflag resource | participant |
| flag | unflag super_comment_reactions | participant, Coord, admin |
| flag | unflag super_node_reaction | participant, Coord, admin |
| flag | unflag target_comment_reaction | participant, Coord, admin |
| flag | unflag target_node_reactions | participant, Coord, admin |
| flag | unflag thought_comment_reactions | participant, Coord, admin |
| flag | unflag thought_node_reactions | participant, Coord, admin |
| flag | unflag thumbs_up_comment_reaction | auth, participant, Coord, admin |
| flag | unflag thumbs_up_node_reaction | auth, participant, Coord, admin |
| flag | unflag twm_tailored_tips_tailored | participant, Coord, admin |
| flag | unflag up_voting | Coord, admin |
| flag | unflag up_voting_comments | admin |
| flag | use flag import | admin |
| image | administer image styles | admin |
| imce | administer imce | admin |
| lazyloader | administer lazyloader | admin |
| libraries | access library reports | admin |
| masquerade | administer masquerade | admin |
| masquerade | masquerade as admin | admin |
| masquerade | masquerade as any user | admin |
| masquerade | masquerade as user | admin |
| memcache_admin | access memcache statistics | admin |
| memcache_admin | access slab cachedump | admin |
| menu | administer menu | admin |
| node | access content | anon, auth, participant, RA, Coord, admin |
| node | access content overview | Coord, admin |
| node | administer content types | admin |
| node | administer nodes | Coord, admin |
| node | bypass node access | Coord, admin |
| node | create article content | Coord, admin |
| node | create drupal_wall content | participant, Coord, admin |
| node | create page content | Coord, admin |
| node | create public_page content | Coord, admin |
| node | create resources content | participant |
| node | create tech_support content | participant, Coord, admin |
| node | create thrive_tips content | Coord, admin |
| node | create weekly_checkin_prompt content | Coord, admin |
| node | create weekly_checkins content | Coord, admin |
| node | delete any article content | Coord, admin |
| node | delete any drupal_wall content | Coord, admin |
| node | delete any page content | Coord, admin |
| node | delete any public_page content | Coord, admin |
| node | delete any tech_support content | Coord, admin |
| node | delete any thrive_tips content | Coord, admin |
| node | delete any weekly_checkin_prompt content | Coord, admin |
| node | delete any weekly_checkins content | Coord, admin |
| node | delete own article content | Coord, admin |
| node | delete own drupal_wall content | participant, Coord, admin |
| node | delete own page content | Coord, admin |
| node | delete own public_page content | Coord, admin |
| node | delete own tech_support content | Coord, admin |
| node | delete own thrive_tips content | Coord, admin |
| node | delete own weekly_checkin_prompt content | Coord, admin |
| node | delete own weekly_checkins content | Coord, admin |
| node | delete revisions | Coord, admin |
| node | edit any article content | Coord, admin |
| node | edit any drupal_wall content | Coord, admin |
| node | edit any page content | Coord, admin |
| node | edit any public_page content | Coord, admin |
| node | edit any tech_support content | Coord, admin |
| node | edit any thrive_tips content | Coord, admin |
| node | edit any weekly_checkin_prompt content | Coord, admin |
| node | edit any weekly_checkins content | Coord, admin |
| node | edit own article content | Coord, admin |
| node | edit own drupal_wall content | participant, Coord, admin |
| node | edit own page content | Coord, admin |
| node | edit own public_page content | Coord, admin |
| node | edit own tech_support content | participant, Coord, admin |
| node | edit own thrive_tips content | participant, Coord, admin |
| node | edit own weekly_checkin_prompt content | Coord, admin |
| node | edit own weekly_checkins content | Coord, admin |
| node | revert revisions | Coord, admin |
| node | view own unpublished content | Coord, admin |
| node | view revisions | Coord, admin |
| node_view_permissions | view any public_page content | anon, auth |
| overlay | access overlay | RA, Coord, admin |
| path | administer url aliases | admin |
| path | create url aliases | Coord, admin |
| php | use PHP for settings | admin |
| phpexcel | administer phpexcel | admin |
| piwik | add JS snippets for piwik | admin |
| piwik | administer piwik | admin |
| piwik | opt-in or out of tracking | admin |
| piwik | use PHP for tracking visibility | admin |
| profile2 | administer profile types | Coord, admin |
| profile2 | administer profiles | Coord, admin |
| profile2 | edit any main profile | Coord, admin |
| profile2 | edit own main profile | participant, Coord, admin |
| profile2 | view any main profile | participant, Coord, admin |
| profile2 | view own main profile | participant, Coord, admin |
| qsurvey | qsurvey configuration permissions | Coord, admin |
| quicktabs | administer quicktabs | admin |
| role_delegation | assign Coordinator User role | RA, Coord, admin |
| role_delegation | assign Research Administrator User role | RA, Coord, admin |
| role_delegation | assign all roles | admin |
| role_delegation | assign coach role | RA, Coord, admin |
| role_delegation | assign control role | RA, Coord, admin |
| role_delegation | assign ecoach-user role | RA, Coord, admin |
| role_delegation | assign level-2 role | RA, Coord, admin |
| role_delegation | assign level-2-1 role | RA, Coord, admin |
| role_delegation | assign level-3 role | RA, Coord, admin |
| role_delegation | assign level-3-1 role | RA, Coord, admin |
| role_delegation | assign level-4 role | RA, Coord, admin |
| role_delegation | assign level-5 role | RA, Coord, admin |
| role_delegation | assign level-5-1 role | RA, Coord, admin |
| role_delegation | assign level-6 role | RA, Coord, admin |
| role_delegation | assign level-6-1 role | RA, Coord, admin |
| role_delegation | assign level-7 role | RA, Coord, admin |
| role_delegation | assign participant role | RA, Coord, admin |
| search | administer search | admin |
| search | search content | admin |
| search | use advanced search | admin |
| shortcut | administer shortcuts | admin |
| shortcut | customize shortcut links | admin |
| shortcut | switch shortcut sets | admin |
| shorten | manage Shorten URLs API keys | admin |
| shorten | use Shorten URLs page | admin |
| shorten_cs | administer Shorten URLs custom services | admin |
| simpletest | administer unit tests | admin |
| statistics | access statistics | admin |
| statistics | administer statistics | admin |
| statistics | view post access counter | admin |
| system | access administration pages | RA, Coord, admin |
| system | access site in maintenance mode | admin |
| system | access site reports | admin |
| system | administer actions | admin |
| system | administer modules | admin |
| system | administer site configuration | admin |
| system | administer software updates | admin |
| system | administer themes | admin |
| system | block IP addresses | admin |
| system | view the administration theme | RA, Coord, admin |
| taxonomy | administer taxonomy | Coord, admin |
| taxonomy | delete terms in 1 | Coord, admin |
| taxonomy | delete terms in 2 | Coord, admin |
| taxonomy | delete terms in 3 | Coord, admin |
| taxonomy | delete terms in 4 | Coord, admin |
| taxonomy | delete terms in 6 | Coord |
| taxonomy | delete terms in 7 | Coord |
| taxonomy | edit terms in 1 | Coord, admin |
| taxonomy | edit terms in 2 | Coord, admin |
| taxonomy | edit terms in 3 | Coord, admin |
| taxonomy | edit terms in 4 | Coord, admin |
| taxonomy | edit terms in 6 | Coord |
| taxonomy | edit terms in 7 | Coord |
| techstep_add_user | access_techstep_add_user | Coord, admin |
| techstep_location | access_techstep_location | participant, admin |
| techstep_sso | access_ecoach_system | admin, ecoach-user |
| techstep_tracking | access_custom_tracking | participant, admin |
| term_merge | merge custom_tracking terms | admin |
| term_merge | merge glossary_terms terms | admin |
| term_merge | merge hashtags terms | admin |
| term_merge | merge resource_tags terms | admin |
| term_merge | merge tags terms | admin |
| term_merge | merge terms | admin |
| term_merge | merge thrive_tips_categories terms | admin |
| term_merge | merge thrive_tips_tags terms | admin |
| term_merge | merge youthrive_tags terms | admin |
| toolbar | access toolbar | RA, Coord, admin |
| twilio | administer twilio | RA, Coord, admin |
| twilio | edit own sms number | RA, Coord, admin |
| twm_achievement_bins | access_account_callback | participant, RA, Coord, admin |
| twm_achievement_bins | access_twm_achievement_bins | participant, RA, Coord, admin |
| twm_achievement_bins | access_twm_achievement_bins_category | participant, RA, Coord, admin |
| twm_achievement_bins | access_twm_achievement_levels_callback | participant, RA, Coord, admin |
| twm_comment_notification | access_twm_comment_notification | auth, participant |
| twm_randomization | access_twm_randomization | RA, Coord, admin |
| twm_survey_reports | access_twm_survey_reports | participant, Coord, admin |
| twm_tailored_tips | access_twm_tailored_tips_all | participant, RA, Coord, admin |
| twm_tailored_tips | access_twm_tailored_tips_favs | participant, RA, Coord, admin |
| twm_tailored_tips | access_twm_tailored_tips_recommended | participant, RA, Coord, admin |
| twm_tailored_tips | access_twm_tailored_tips_tags | participant, RA, Coord, admin |
| twm_weekly_checkin | access_twm_weekly_checkin | participant, Coord, admin |
| user | access user profiles | participant, RA, Coord, admin |
| user | administer permissions | admin |
| user | administer users | RA, Coord, admin |
| user | cancel account | admin |
| user | change own username | participant, RA, Coord, admin |
| user | select account cancellation method | admin |
| uy_standard_usage_report | access_uy_all_reports_form | Coord, admin |
| uy_standard_usage_report | access_uy_standard_usage_report_form | Coord, admin |
| uy_standard_usage_report | access_uy_standard_usage_report_form_csv | Coord, admin |
| uy_standard_user_engagement | access_uy_standard_user_engagement_report | Coord, admin |
| uy_standard_user_engagement | access_uy_standard_user_engagement_report_csv | Coord, admin |
| uy_user_interaction_report | access_uy_user_interaction_report_form | Coord, admin |
| uy_user_interaction_report | access_uy_user_interaction_report_form_csv | Coord, admin |
| video_embed_field | administer video styles | admin |
| views | access all views | admin |
| views | administer views | admin |
| votingapi | administer voting api | admin |
| weekly_checkin_feedback | access_weekly_checkin_feedback | participant, Coord, admin |
| youthrive_game_mechanics | access_gain_tips | participant |
| youthrive_profile | access_uy_profile | auth, admin |
| youthrive_tags | administer youthrive_tags | admin |
| youthrive_user_profile_edit | access_youthrive_user_profile_edit | auth, admin |

Permissions defined by enabled LP modules but granted to **no** role:

- elysia_cron: execute elysia_cron; view elysia_cron
- actions_permissions: execute role_delegation_delegate_roles_action; execute term_merge_action; execute twilio_send_sms_to_user_action; execute user_unblock_user_action; execute views_bulk_operations_change_owner_action
- feeds: import node feeds; clear node feeds; unlock node feeds; import resources_import feeds; clear resources_import feeds; unlock resources_import feeds; import user feeds; clear user feeds; unlock user feeds
- field_collection: edit field collections
- filter: use text format php_code
- flag: flag sad_node_reaction; unflag sad_node_reaction; flag wow_comment_reaction; unflag wow_comment_reaction; flag wow_node_reaction; unflag wow_node_reaction; flag sad_comment_reaction; unflag sad_comment_reaction; flag angry_node_reaction; unflag angry_node_reaction; flag angry_comment_reaction; unflag angry_comment_reaction
- jquery_update: administer jquery update
- node: create reminder_sms_inputs content; edit own reminder_sms_inputs content; edit any reminder_sms_inputs content; delete own reminder_sms_inputs content; delete any reminder_sms_inputs content; create journey_category content; edit own journey_category content; edit any journey_category content; delete own journey_category content; delete any journey_category content; create journey_goals content; edit own journey_goals content; edit any journey_goals content; delete own journey_goals content; delete any journey_goals content; create journey_methods content; edit own journey_methods content; edit any journey_methods content; delete own journey_methods content; delete any journey_methods content; create reminder_messages content; edit own reminder_messages content; edit any reminder_messages content; delete own reminder_messages content; delete any reminder_messages content; edit own resources content; edit any resources content; delete own resources content; delete any resources content; create twm_achievement_carousel content; edit own twm_achievement_carousel content; edit any twm_achievement_carousel content; delete own twm_achievement_carousel content; delete any twm_achievement_carousel content; create user_goals content; edit own user_goals content; edit any user_goals content; delete own user_goals content; delete any user_goals content
- node_view_permissions: view own public_page content
- profile2: delete own main profile
- taxonomy: edit terms in 8; delete terms in 8; edit terms in 9; delete terms in 9
- extlink: administer external link
- field_permissions: edit own field_number; edit field_number; view own field_number; view field_number

**Role delegation (LP)** — who may assign which roles (module `role_delegation`, part of the matrix above):
administrator: `assign all roles` + every role; Research Administrator User and Coordinator User: may assign coach,
control, Coordinator User, ecoach-user, level-2, level-2-1, level-3, level-3-1, level-4, level-5, level-5-1,
level-6, level-6-1, level-7, participant, Research Administrator User (i.e. every role except administrator).

**Masquerade (LP)**: only `administrator` holds `masquerade as user`, `masquerade as admin`, `masquerade as any
user`. `masquerade_admin_roles` = {3 administrator, 7 participant} (roles treated as "admin" targets, requiring
`masquerade as admin`). `masquerade_quick_switches` empty. The Masquerade block is placed only in the staff theme
`twm_bootstrapless_old`.

### 7.5 Permission matrix — PN

Role names as §7.3; admin = administrator.

| module | permission | roles |
| --- | --- | --- |
| announcements_feed | access announcements | admin |
| block | administer blocks | admin |
| cas | administer cas | admin |
| comment | access comments | anon, auth, admin |
| comment | administer comments | admin |
| comment | edit own comments | admin |
| comment | post comments | auth, admin |
| comment | skip comment approval | auth, admin |
| contextual | access contextual links | admin |
| ctools | use ctools import | admin |
| dashboard | access dashboard | admin |
| ecoach_profile | access_profile | admin, coach, coordinator |
| ecoach_sessions | access_coach_info | participant, tech-participant |
| ecoach_sessions | access_ecoach_sessions | admin, coach, coordinator |
| ecoach_sessions | access_load_ajax | auth, participant, coach |
| ecoach_sessions | access_session_reports | admin, coach, coordinator |
| ecoach_sessions | access_techstep_site | tech-participant |
| ecoach_sessions | access_user_dashboard | participant, tech-participant |
| ecoach_sessions | access_user_messages | participant, coach, tech-participant |
| ecoach_sessions | create_relationship | coordinator |
| ecoach_standard_usage_report | access ecoach standard usage report | admin, coach, coordinator |
| features | administer features | admin |
| features | generate features | admin |
| features | manage features | admin |
| features | rename features | admin |
| field | administer fields | admin |
| filter | administer filters | admin |
| filter | use text format filtered_html | anon, auth, admin |
| filter | use text format full_html | admin |
| image | administer image styles | admin |
| menu | administer menu | admin |
| node | access content | auth, admin |
| node | access content overview | admin |
| node | administer content types | admin |
| node | administer nodes | admin |
| node | bypass node access | admin |
| node | create article content | admin |
| node | create page content | admin |
| node | delete any article content | admin |
| node | delete any page content | admin |
| node | delete own article content | admin |
| node | delete own page content | admin |
| node | delete revisions | admin |
| node | edit any article content | admin |
| node | edit any page content | admin |
| node | edit own article content | admin |
| node | edit own page content | admin |
| node | revert revisions | admin |
| node | view own unpublished content | admin |
| node | view revisions | admin |
| overlay | access overlay | admin |
| path | administer url aliases | admin |
| path | create url aliases | admin |
| privatemsg | administer privatemsg settings | admin |
| privatemsg | allow disabling privatemsg | admin |
| privatemsg | delete privatemsg | admin, participant, coach, tech-participant |
| privatemsg | read all private messages | admin |
| privatemsg | read privatemsg | admin, participant, coach, tech-participant |
| privatemsg | reply only privatemsg | admin, participant, coach, tech-participant |
| privatemsg | select text format for privatemsg | admin |
| privatemsg | use tokens in privatemsg | admin |
| privatemsg | write privatemsg | admin, participant, coach, tech-participant |
| privatemsg_filter | create private message tags | admin |
| privatemsg_filter | filter private messages | admin, coach |
| privatemsg_filter | tag private messages | admin |
| search | administer search | admin |
| search | search content | admin |
| search | use advanced search | admin |
| shortcut | administer shortcuts | admin |
| shortcut | customize shortcut links | admin |
| shortcut | switch shortcut sets | admin |
| system | access administration pages | admin |
| system | access site in maintenance mode | admin |
| system | access site reports | admin |
| system | administer actions | admin |
| system | administer modules | admin |
| system | administer site configuration | admin |
| system | administer software updates | admin |
| system | administer themes | admin |
| system | block IP addresses | admin |
| system | view the administration theme | admin, coordinator |
| taxonomy | administer taxonomy | admin |
| taxonomy | delete terms in 1 | admin |
| taxonomy | edit terms in 1 | admin |
| toolbar | access toolbar | admin, coordinator |
| user | access user profiles | admin, coach, coordinator |
| user | administer permissions | admin, coach |
| user | administer users | admin, coach, coordinator |
| user | cancel account | admin |
| user | change own username | admin |
| user | select account cancellation method | admin |
| views | access all views | admin |
| views | administer views | admin |
| webform | access all webform results | admin |
| webform | access own webform results | admin |
| webform | access own webform submissions | admin |
| webform | delete all webform submissions | admin |
| webform | delete own webform submissions | admin |
| webform | edit all webform submissions | admin |
| webform | edit own webform submissions | admin |
| webform | edit webform components | admin |

Permissions defined by enabled PN modules but granted to **no** role:

- jquery_update: administer jquery update
- node: create notes content; edit own notes content; edit any notes content; delete own notes content; delete any notes content; create user_sessions content; edit own user_sessions content; edit any user_sessions content; delete own user_sessions content; delete any user_sessions content; create webform content; edit own webform content; edit any webform content; delete own webform content; delete any webform content

Notably on PN, `participant`, `coach`, `coordinator`, `tech-participant` do **not** hold `access content`; all their
pages are custom menu routes gated by the custom permissions (`access_user_dashboard`, `access_ecoach_sessions`,
`access_user_messages`, `create_relationship`, …). No role delegation or masquerade on PN.

---
## 8. Access rules implemented in custom code

These are rules the permission matrix does not show; the new app must re-implement them.

### 8.1 LP

| # | Rule | Where |
| --- | --- | --- |
| 1 | Anonymous users are denied **all access to `thrive_tips` nodes** (`NODE_ACCESS_DENY`). | `twm_general_node_access` |
| 2 | Only `public_page` has per-type view permissions (node_view_permissions); anonymous may `view any public_page content` (Terms, FAQ, About…). Other content requires `access content` (auth only). | variables `node_view_permissions_*` + matrix |
| 3 | New accounts always get role `control` (rid 6). | `twm_utility_user_save` (hook_user_insert) |
| 4 | Converting control → participant replaces all roles with `participant`, stamps `field_intervention_start_date` (today) and `field_role_changed_date`, sends the "welcome" account email. Reverse resets to `control`. | `twm_randomization` VBO actions on `admin/user-operations` |
| 5 | Daily cron blocks (`users.status = 0`) every active `participant` whose intervention start is **> 150 days** ago. | `twm_general_cron` (guarded by variable `user_cron_last`) |
| 6 | Users with `coach`, or `ecoach-user` without `participant`, are redirected on login and when visiting `drupal-wall` to `cas/login?service=<ecoach_url>/cas` (i.e. into PN). `ecoach_url` = `https://prod.ecoach.lp.radiant.digital`. | `techstep_sso_init`, `techstep_sso_user_login`, `twm_utility_user_login` |
| 7 | `/ecoach` route (perm `access_ecoach_system`) sends the user to PN through CAS. | `techstep_sso` |
| 8 | Points → level roles are auto-granted and gate avatar packs, sticker packs, wall post backgrounds (`level-4`), colour themes. | `youthrive_game_mechanics`, `youthrive_profile`, `drupal_wall` |
| 9 | Profile routing: `user/view-profile/<uid>` → `my-profile` if own uid else `user/<uid>`; `user/edit-my-profile` → `user/<me>/edit`. Both require only `access content`. | `twm_utility_menu` |
| 10 | Phone numbers in `field_number` are normalised on save: 10 digits → `+1` prefix; >10 digits → `+` prefix. | `twm_general_field_attach_presave` |
| 11 | Flag `access_author` rules: reports and upvotes only on *others'* content (§4.4). | flag config |
| 12 | Theme per role (role_theme_switcher): the **last** role (ascending rid) whose setting is not "Default" wins. anon/auth/control/participant → `twm_bootstrapless`; administrator/RA/Coordinator → `twm_bootstrapless_old`. | variables `role_theme_switcher_<rid>_theme` |
| 13 | Field-level permissions on 7 user fields (§3.7). | field_permissions |
| 14 | Deleting a `resources` node deletes its `ts_locations` rows. | `twm_general_node_delete` |

### 8.2 PN

| # | Rule | Where |
| --- | --- | --- |
| 1 | CAS account creation (`cas_user_presave`): LP attribute `drupal_roles` containing `coach` → roles = {coach}; containing `participant` **and** `ecoach-user` → roles = {tech-participant, participant}. Otherwise the auto-assigned `participant`. | `ecoach_sessions_cas_user_presave` |
| 2 | On every CAS login, PN copies LP attributes into the local user: `pic` (downloaded into `public://pictures/` and set as `users.picture`), `zoom` → `field_zoom_link`, `name` → `field_first_name`, `pronoun` → `field_pronoun`, `location` → `field_location`; for participants `coach_name` → `field_coach` (looked up by username). | `ecoach_utility_user_login` |
| 3 | Post-login destination: coach → `dashboard`; participant → `user-dashboard`. | `ecoach_utility_user_login` |
| 4 | Private file download (`private://`) allowed only to the file owner (`file_managed.uid`) or any user with role `coach`. | `ecoach_sessions_file_download` |
| 5 | `field_coach` may reference only users with rid 5 (coach); `field_user` only rid 4 (participant) (view `user_reference`). | field settings |
| 6 | Theme per role: administrator, coach, coordinator → `bootstrap`; participant, tech-participant → `techstep_ecoach`. | role_theme_switcher |
| 7 | CAS: `cas_check_frequency` -2 (never gateway-check), `cas_login_form` 1 (CAS link on login form), `cas_hide_email`/`cas_hide_password` on the account form, `cas_exclude` `services/*`, `cas_single_logout_session_lifetime` 25, CAS 2.0 on port 443. | cas module variables |

### 8.3 LP → PN CAS attributes (LP `techstep_sso_cas_server_user_attributes`)

| attribute | source on LP |
| --- | --- |
| `coach_name` | username of the user referenced by `field_coach` |
| `pic` | absolute URL of `users.picture` |
| `zoom` | `field_zoom_link` |
| `name` | `field_first_name` |
| `pronoun` | `field_user_pronoun` |
| `location` | `field_location` |
| `drupal_roles` | user's role names |

LP CAS server settings: `cas_server_service_whitelist` '' (any service), `cas_server_whitelist_failure` "You do not
have permission to login to CAS from this service.", single-logout timeouts 15/15.

---
## 9. Menus, site settings & themes

`hidden`: 0 visible, 1 disabled by admin, -1 system callback (never shown). `expanded` 1 = always show children.
`module` `system` = link generated by a `hook_menu` route; `menu` = admin-created link. The `management` and
`navigation` menus otherwise contain only Drupal's generated admin links and are omitted. `shortcut-set-1` = the
admin toolbar shortcut bar.

### 9.1 LP menus

| menu_name | title | description | links |
| --- | --- | --- | --- |
| `devel` | Development | Development link | 0 |
| `features` | Features | NOT USED. Menu items for any enabled features. | 0 |
| `main-menu` | Main menu | Used by Research Administrator User | 12 |
| `management` | Management | The <em>Management</em> menu contains links for administrative tasks. | 457 |
| `menu-about` | About | About Us Menu links. | 7 |
| `menu-flagged-messages` | Flagged Messages |  | 2 |
| `menu-footer` | Footer | NOT USED. | 4 |
| `menu-twm-menu` | Participant Menu in FOOTER | Participant footer links go HERE. | 22 |
| `navigation` | Navigation | NOT USED | 166 |
| `user-menu` | User menu | The <em>User</em> menu contains links related to the user's account, as well as the 'Log out' link. | 10 |

| menu | mlid | plid | depth | link_title | link_path | router_path | weight | hidden | expanded | module | options (attributes / fragment) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main-menu | 218 | 0 | 1 | Home | `<front>` |  | -50 | 0 | 0 | menu | {"identifier":"main-menu_home:`<front>`"} |
| main-menu | 466 | 0 | 1 | Access Report | access_report | access_report | -47 | 0 | 0 | menu | {"attributes":{"title":"RA can see the weekly stats"},"identifier":"main-menu_access-report:access_report"} |
| main-menu | 507 | 0 | 1 | Weekly Check-In Feedback | weekly_feedback | weekly_feedback | -41 | 1 | 0 | menu | {"attributes":{"title":"Participant User Weekly Check-In Feedback"},"identifier":"main-menu_weekly-check-in-feedback:weekly_feedback"} |
| main-menu | 508 | 0 | 1 | Weekly Check-In | weekly_checkin | weekly_checkin | -42 | 1 | 0 | menu | {"attributes":{"title":"Users Weekly Check-In"},"identifier":"main-menu_weekly-check-in:weekly_checkin"} |
| main-menu | 511 | 0 | 1 | Activate Users | user-operations | user-operations | -46 | 0 | 0 | menu | {"attributes":{"title":"To convert users from control role to Participant"},"identifier":"main-menu_activate-users:user-operations"} |
| main-menu | 513 | 0 | 1 | Qualtrics Configuration | survey | survey | 0 | 0 | 0 | menu | {"attributes":{"title":"Qualtrics Configuration"},"identifier":"main-menu_qualtrics-configuration:survey"} |
| main-menu | 594 | 0 | 1 | Deactivate Users | deactivate-users | deactivate-users | -42 | 1 | 0 | system |  |
| main-menu | 652 | 0 | 1 | Tutorials | admin/tutorials | admin/tutorials | -38 | 0 | 0 | system |  |
| main-menu | 658 | 0 | 1 | Convert Control Users | admin/user-operations | admin/user-operations | -43 | 0 | 0 | system |  |
| main-menu | 659 | 0 | 1 | Manage Participants | admin/manage-participants | admin/manage-participants | -42 | 1 | 0 | system |  |
| main-menu | 660 | 0 | 1 | Qualtrics Configuration | admin/survey | admin | -41 | 1 | 0 | menu | {"attributes":{"title":""},"identifier":"main-menu_qualtrics-configuration:admin/survey"} |
| main-menu | 760 | 0 | 1 | Tech Support | admin/tech-support | admin/tech-support | 0 | 0 | 0 | system |  |
| management | 183 | 47 | 4 | Main menu | admin/structure/menu/manage/main-menu | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 184 | 47 | 4 | Management | admin/structure/menu/manage/management | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 185 | 47 | 4 | Navigation | admin/structure/menu/manage/navigation | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 186 | 47 | 4 | User menu | admin/structure/menu/manage/user-menu | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 375 | 47 | 4 | Flagged Messages | admin/structure/menu/manage/menu-flagged-messages | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 671 | 47 | 4 | Footer | admin/structure/menu/manage/menu-footer | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| menu-about | 621 | 0 | 1 | Terms & Disclosure | node/498 | node/% | -49 | 0 | 1 | menu | {"attributes":{"title":""},"identifier":"menu-about_terms--disclosure:node/498"} |
| menu-about | 647 | 0 | 1 | FAQ | node/207 | node/% | -49 | 1 | 1 | menu | {"attributes":{"title":""}} |
| menu-about | 648 | 0 | 1 | Terms & Disclosure | node/163 | node/% | -48 | 1 | 1 | menu | {"attributes":{"title":""}} |
| menu-about | 650 | 0 | 1 | Feedback & Contact | node/206 | node/% | -47 | 1 | 1 | menu | {"attributes":{"title":""}} |
| menu-about | 738 | 0 | 1 | Tech Support | node/add/tech-support | node/add/tech-support | -45 | 1 | 1 | menu | {"attributes":{"title":""}} |
| menu-about | 758 | 0 | 1 | Community Guidelines | node/271 | node/% | -46 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-about | 783 | 0 | 1 | About | node/208 | node/% | -50 | 1 | 0 | menu | {"attributes":{"title":"About Us Page"}} |
| menu-flagged-messages | 749 | 0 | 1 | Wall Post Abuse | admin/abuse-node | admin | 0 | 0 | 0 | menu | {"attributes":{"title":"To display Flagged Wall Posts by users"},"identifier":"menu-flagged-messages_wall-post-abuse:admin/abuse-node"} |
| menu-flagged-messages | 750 | 0 | 1 | Comment Abuse | admin/abuse-comment | admin | 0 | 0 | 0 | menu | {"attributes":{"title":"To display Flagged comments by users"},"identifier":"menu-flagged-messages_comment-abuse:admin/abuse-comment"} |
| menu-footer | 15 | 0 | 1 | Log out | user/logout | user/logout | 10 | 0 | 0 | system | {"attributes":{"title":""}} |
| menu-footer | 672 | 0 | 1 | Get Help | node/204 | node/% | 0 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-footer | 673 | 0 | 1 | Terms & Disclosure | node/163 | node/% | 0 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-footer | 732 | 0 | 1 | About | node/429 | node/% | 0 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 518 | 0 | 1 | Thrive Wall | thrive-tips-all | thrive-tips-all | -49 | 0 | 0 | menu | {"attributes":{"title":"Thrive Wall"},"identifier":"menu-twm-menu_thrive-wall:thrive-tips-all"} |
| menu-twm-menu | 519 | 0 | 1 | Weekly Check-In Feedback | weekly_feedback | weekly_feedback | -46 | 0 | 0 | menu | {"attributes":{"title":"Participant User Weekly Check-In Feedback"},"identifier":"menu-twm-menu_weekly-check-in-feedback:weekly_feedback"} |
| menu-twm-menu | 520 | 0 | 1 | Weekly Check-In | weekly_checkin | weekly_checkin | -47 | 0 | 0 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_weekly-check-in:weekly_checkin"} |
| menu-twm-menu | 522 | 0 | 1 | Home / Your Wall | `<front>` |  | -49 | 0 | 0 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_home:`<front>`"} |
| menu-twm-menu | 572 | 0 | 1 | Thrive Wall | all | all | -49 | 0 | 0 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_thrive-wall:all"} |
| menu-twm-menu | 573 | 0 | 1 | Survey Report | survey_reports | survey_reports | 0 | 0 | 0 | menu | {"attributes":{"title":"Baseline and Followup Survey Reports"},"identifier":"menu-twm-menu_survey-report:survey_reports"} |
| menu-twm-menu | 616 | 0 | 1 | My Profile | my_profile | my_profile | -45 | 0 | 1 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_myprofile:my_profile"} |
| menu-twm-menu | 617 | 0 | 1 | About | node/498 | node/% | -44 | 0 | 1 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_about:node/498"} |
| menu-twm-menu | 663 | 0 | 1 | eCoach | ecoach | ecoach | -50 | 0 | 0 | menu | {"attributes":{"title":"Redirect you to eCoach System"},"identifier":"menu-twm-menu_thrive-tips:thrive-tips"} |
| menu-twm-menu | 667 | 0 | 1 | Profile | uy-profile | uy-profile | -47 | 0 | 0 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_my-profile:my-profile"} |
| menu-twm-menu | 1157 | 0 | 1 | Your Trackers | my-tracking | my-tracking | -47 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1158 | 0 | 1 | Glossary | yt-glossary | yt-glossary | -43 | 1 | 0 | menu | {"attributes":{"title":""},"identifier":"menu-twm-menu_glossary:twm-glossary"} |
| menu-twm-menu | 1159 | 0 | 1 | FAQ | node/207 | node/% | -44 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1160 | 0 | 1 | Resources | locations | locations | -40 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1161 | 0 | 1 | Your User | my-profile | my-profile | -45 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1162 | 0 | 1 | etc | `<front>` |  | -37 | 1 | 1 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1163 | 0 | 1 | Guidelines | node/271 | node/% | -42 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1164 | 0 | 1 | Log Out | user/logout | user/logout | -39 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1447 | 0 | 1 | Your Tips | thrive-tips/tags | thrive-tips/tags | -48 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 1895 | 0 | 1 | Check In | drupal-wall/ | drupal-wall | -38 | 1 | 0 | menu | {"fragment":"my_checkin","attributes":{"title":""}} |
| menu-twm-menu | 2050 | 0 | 1 | resource locator | locations | locations | -46 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 2497 | 0 | 1 | About | node/208 | node/% | -41 | 1 | 0 | menu | {"attributes":{"title":""}} |
| navigation | 6 | 0 | 1 | Add Thrive Tips | node/add | node/add | 0 | 0 | 0 | system | {"attributes":{"title":""}} |
| navigation | 219 | 6 | 2 | Article | node/add/article | node/add/article | 0 | 1 | 0 | system | {"attributes":{"title":"Use <em>articles</em> for time-sensitive content like news, press releases or blog posts."}} |
| navigation | 220 | 6 | 2 | Basic page | node/add/page | node/add/page | 0 | 1 | 0 | system | {"attributes":{"title":"Use <em>basic pages</em> for your static content, such as an 'About us' page."}} |
| navigation | 378 | 6 | 2 | Public Message | node/add/drupal-wall | node/add/drupal-wall | 0 | 1 | 0 | system |  |
| navigation | 377 | 0 | 1 | Home | drupal-wall | drupal-wall | 1 | 1 | 0 | system |  |
| navigation | 386 | 0 | 1 | Leaderboard | achievements/leaderboard | achievements/leaderboard | 0 | 1 | 0 | system | {"attributes":{"title":"View the site-wide achievements leaderboard."}} |
| shortcut-set-1 | 216 | 0 | 1 | Add content | node/add | node/add | -50 | 0 | 0 | menu |  |
| shortcut-set-1 | 217 | 0 | 1 | Find content | admin/content | admin/content | -43 | 1 | 0 | menu |  |
| shortcut-set-1 | 793 | 0 | 1 | Access Report | admin/access-report | admin/access-report | -49 | 0 | 0 | menu |  |
| shortcut-set-1 | 794 | 0 | 1 | LinkPositively Reports | admin/uy-reports | admin/uy-reports | -48 | 0 | 0 | menu |  |
| shortcut-set-1 | 1155 | 0 | 1 | Review Flagged Comments | admin/abuse-comment | admin/abuse-comment | -47 | 0 | 0 | menu |  |
| shortcut-set-1 | 1156 | 0 | 1 | Convert Control Users | admin/user-operations | admin/user-operations | -46 | 0 | 0 | menu |  |
| shortcut-set-1 | 2049 | 0 | 1 | Review Flagged Resources | admin/flagged-resources | admin/flagged-resources | -42 | 1 | 0 | menu |  |
| shortcut-set-1 | 2262 | 0 | 1 | Review Suggested Resources | admin/suggested-resources | admin/suggested-resources | -41 | 1 | 0 | menu |  |
| shortcut-set-1 | 2505 | 0 | 1 | Manage Participants | admin/manage-participants | admin/manage-participants | -40 | 1 | 0 | menu |  |
| shortcut-set-1 | 2513 | 0 | 1 | Add User | admin/add-participant | admin/add-participant | -39 | 1 | 0 | menu |  |
| shortcut-set-1 | 3053 | 0 | 1 | Resource List | admin/resources-list | admin/resources-list | -45 | 0 | 0 | menu |  |
| shortcut-set-1 | 3266 | 0 | 1 | Tips List | admin/tips-list | admin | -44 | 0 | 0 | menu |  |
| user-menu | 2 | 0 | 1 | User account | user | user | -10 | 1 | 0 | system | {"identifier":"user-menu_user-account:user"} |
| user-menu | 10 | 2 | 2 | Create new account | user/register | user/register | 0 | -1 | 0 | system |  |
| user-menu | 14 | 2 | 2 | Log in | user/login | user/login | 0 | -1 | 0 | system |  |
| user-menu | 20 | 2 | 2 | Request new password | user/password | user/password | 0 | -1 | 0 | system |  |
| user-menu | 736 | 2 | 2 | My Account | user/edit-my-profile | user/edit-my-profile | 0 | 0 | 0 | system |  |
| user-menu | 737 | 2 | 2 |  | user/view-profile/% | user/view-profile/% | 0 | 0 | 0 | system | {"attributes":{"title":"Routing shortcut for profile views"}} |
| user-menu | 640 | 0 | 1 |  | profile-main | profile-main | 0 | 1 | 0 | system | {"identifier":"user-menu_:profile-main"} |
| user-menu | 642 | 640 | 2 | Delete | profile-main/%/delete | profile-main/%/delete | 0 | -1 | 0 | system |  |
| user-menu | 643 | 640 | 2 | Edit | profile-main/%/edit | profile-main/%/edit | 0 | -1 | 0 | system |  |
| user-menu | 644 | 640 | 2 | View | profile-main/%/view | profile-main/%/view | -10 | -1 | 0 | system |  |

Menu placement (LP): `menu-twm-menu` ("Participant Menu in FOOTER" — actually rendered in the **header** region) is the
participant navigation; `main-menu` is the staff navigation (rendered in `twm_bootstrapless_old` navigation region
for administrator/RA/Coordinator); `menu-about`, `menu-footer` are unused (all links disabled except "Terms &
Disclosure" → node/498); `menu-flagged-messages` = moderation links. Node paths referenced: node/498 (Terms &
Disclosure / About), node/207 (FAQ), node/163 (old Terms), node/206 (Feedback & Contact), node/204 (Get Help),
node/208 & node/429 (About), node/271 (Community Guidelines), node/209 (403/404 page).

### 9.2 LP site settings

- `site_name` = Link Positively
- `site_slogan` = 
- `site_frontpage` = drupal-wall
- `site_403` = node/209
- `site_404` = node/209
- `site_default_country` = US
- `date_default_timezone` = America/Los_Angeles
- `configurable_timezones` = 1
- `user_default_timezone` = 0
- `theme_default` = twm_bootstrapless
- `admin_theme` = seven
- `node_admin_theme` = 1
- `clean_url` = 1
- `anonymous` = Anonymous
- `file_default_scheme` = public
- `file_public_path` = sites/default/files
- `file_private_path` = sites/default/private
- `preprocess_css` = 1
- `preprocess_js` = 1
- `cache` = 0
- `page_compression` = 0
- `error_level` = 0
- `maintenance_mode` = 
- `cron_safe_threshold` = 0
- `default_nodes_main` = 10
- `site_mail` = (set, domain stage.techstep.radiantexp.com)

Path aliases (url_alias): 9 rows; non-user/node aliases:


node aliases (count only): 9, user aliases: 0


Also: `site_403` and `site_404` both → node/209. `url_alias` has 9 rows, all `node/*` aliases. Statistics access log
is on (`statistics_enable_access_log` 1; `accesslog` 190,845 rows 🔒 — page-view log with uid/hostname), content
view counting off.

### 9.3 LP themes

| theme | enabled | base | used by |
| --- | --- | --- | --- |
| `twm_bootstrapless` | yes (default) | bootstrap | anonymous, authenticated, control, participant (and every role set to Default) |
| `twm_bootstrapless_old` | yes | bootstrap | administrator, Research Administrator User, Coordinator User (role_theme_switcher) |
| `seven` | yes | — | admin theme (`admin_theme`), also used for node edit forms (`node_admin_theme` 1) |
| `bartik` | yes | — | unused |
| `bootstrap` | no (base theme only) | — | — |
| `garland`, `stark` | no | — | — |
| `twm`, `zurb_foundation` | not installed (block rows remain) | — | — |

`theme_twm_bootstrapless_settings`: logo on (`public://youthrive-logo_1.png`, custom), site name off, slogan off,
favicon `public://favicon.ico` (custom), user pictures on nodes/comments on, main/secondary menu toggles on, plus
Bootstrap base-theme options. `theme_twm_bootstrapless_old_settings`: default logo/favicon, name off, slogan on, main
& secondary menu off. `theme_seven_settings`: defaults.

### 9.4 PN menus

| menu_name | title | description | links |
| --- | --- | --- | --- |
| `features` | Features | Menu items for any enabled features. | 0 |
| `main-menu` | Main menu | The <em>Main</em> menu is used on many sites to show the major sections of the site, often in a top navigation bar. | 8 |
| `management` | Management | The <em>Management</em> menu contains links for administrative tasks. | 302 |
| `menu-twm-menu` | Participant Menu |  | 11 |
| `navigation` | Navigation | The <em>Navigation</em> menu contains links intended for site visitors. Links are added to the <em>Navigation</em> menu automatically by some modules. | 74 |
| `user-menu` | User menu | The <em>User</em> menu contains links related to the user's account, as well as the 'Log out' link. | 11 |

| menu | mlid | plid | depth | link_title | link_path | router_path | weight | hidden | expanded | module | options |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main-menu | 219 | 0 | 1 | Home | `<front>` |  | -50 | 1 | 0 | menu |  |
| main-menu | 406 | 0 | 1 | Lessons | `<front>` |  | -46 | 1 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 407 | 0 | 1 | Dashboard | dashboard | dashboard | -49 | 0 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 408 | 0 | 1 | Add Relation | create-relationship | create-relationship | -45 | 0 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 424 | 0 | 1 | Dashboard | user-dashboard | user-dashboard | -47 | 0 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 433 | 0 | 1 | Logout | user/logout | user/logout | -43 | 0 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 435 | 0 | 1 | LinkPositively | techstep | techstep | -44 | 0 | 0 | menu | {"attributes":{"title":""}} |
| main-menu | 741 | 0 | 1 | My Account | user | user | -48 | 0 | 0 | menu | {"attributes":{"title":""}} |
| management | 7 | 1 | 2 | Appearance | admin/appearance | admin/appearance | -47 | 0 | 0 | system | {"attributes":{"title":"Select and configure your themes."}} |
| management | 8 | 1 | 2 | Configuration | admin/config | admin/config | -43 | 0 | 0 | system | {"attributes":{"title":"Administer settings."}} |
| management | 9 | 1 | 2 | Content | admin/content | admin/content | -49 | 0 | 0 | system | {"attributes":{"title":"Administer content and comments."}} |
| management | 11 | 1 | 2 | Dashboard | admin/dashboard | admin/dashboard | -50 | 0 | 0 | system | {"attributes":{"title":"View and customize your dashboard."}} |
| management | 12 | 1 | 2 | Help | admin/help | admin/help | -40 | 0 | 0 | system | {"attributes":{"title":"Reference for usage, configuration, and modules."}} |
| management | 16 | 1 | 2 | Modules | admin/modules | admin/modules | -45 | 0 | 0 | system | {"attributes":{"title":"Extend site functionality."}} |
| management | 18 | 1 | 2 | People | admin/people | admin/people | -46 | 0 | 0 | system | {"attributes":{"title":"Manage user accounts, roles, and permissions."}} |
| management | 19 | 1 | 2 | Reports | admin/reports | admin/reports | -42 | 0 | 0 | system | {"attributes":{"title":"View reports, updates, and errors."}} |
| management | 56 | 19 | 3 | Status report | admin/reports/status | admin/reports/status | -50 | 0 | 0 | system | {"attributes":{"title":"Get a status report about your site's operation and any detected problems."}} |
| management | 21 | 1 | 2 | Structure | admin/structure | admin/structure | -48 | 0 | 0 | system | {"attributes":{"title":"Administer blocks, content types, menus, etc."}} |
| management | 184 | 48 | 4 | Main menu | admin/structure/menu/manage/main-menu | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 185 | 48 | 4 | Management | admin/structure/menu/manage/management | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 186 | 48 | 4 | Navigation | admin/structure/menu/manage/navigation | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 187 | 48 | 4 | User menu | admin/structure/menu/manage/user-menu | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 317 | 48 | 4 | Participant Menu | admin/structure/menu/manage/menu-twm-menu | admin/structure/menu/manage/% | 0 | 0 | 0 | menu |  |
| management | 744 | 1 | 2 |  | admin/session-report | admin/session-report | -44 | 0 | 0 | system |  |
| management | 745 | 1 | 2 | Session Report | admin/session-report | admin/session-report | -41 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 318 | 0 | 1 | Lessons | `<front>` |  | -49 | 1 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 319 | 0 | 1 | Dashboard | dashboard | dashboard | -48 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 320 | 0 | 1 | Logout | user/logout | user/logout | -40 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 369 | 0 | 1 | Create Relation | create-relationship | create-relationship | -42 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 423 | 0 | 1 | Coaching Plans | user-dashboard | user-dashboard | -46 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 735 | 0 | 1 | Launch Zoom | http://example.com |  | -43 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 736 | 0 | 1 | messages | user-messages | user-messages | -45 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 737 | 0 | 1 | my files | user-files | user-files | -44 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 738 | 0 | 1 | back to LinkPositively | techstep | techstep | -50 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 739 | 0 | 1 | My Coach | coach-details | coach-details | -41 | 0 | 0 | menu | {"attributes":{"title":""}} |
| menu-twm-menu | 740 | 0 | 1 | My Account | user | user | -47 | 1 | 0 | menu | {"attributes":{"title":""}} |
| shortcut-set-1 | 217 | 0 | 1 | Add content | node/add | node/add | -50 | 0 | 0 | menu |  |
| shortcut-set-1 | 218 | 0 | 1 | Find content | admin/content | admin/content | -49 | 0 | 0 | menu |  |
| user-menu | 2 | 0 | 1 | User account | user | user | -10 | 1 | 0 | system |  |
| user-menu | 10 | 2 | 2 | Create new account | user/register | user/register | 0 | -1 | 0 | system |  |
| user-menu | 14 | 2 | 2 | Log in | user/login | user/login | 0 | -1 | 0 | system |  |
| user-menu | 20 | 2 | 2 | Request new password | user/password | user/password | 0 | -1 | 0 | system |  |
| user-menu | 15 | 0 | 1 | Log out | user/logout | user/logout | 10 | 1 | 0 | system |  |
| user-menu | 375 | 0 | 1 | Messages | messages | messages | 0 | 1 | 0 | system |  |
| user-menu | 376 | 375 | 2 | All messages | messages/list | messages/list | -10 | -1 | 0 | system |  |
| user-menu | 377 | 375 | 2 | Write new message | messages/new | messages/new | -3 | -1 | 0 | system |  |
| user-menu | 380 | 375 | 2 | Read message | messages/view/% | messages/view/% | -5 | -1 | 0 | system |  |
| user-menu | 417 | 375 | 2 | Inbox | messages/inbox | messages/inbox | -15 | -1 | 0 | system |  |
| user-menu | 418 | 375 | 2 | Sent Messages | messages/sent | messages/sent | -12 | -1 | 0 | system |  |

Menu placement (PN): `menu-twm-menu` ("Participant Menu") is the main navigation for all roles (header region in
`techstep_ecoach`; **not placed** in the `bootstrap` theme used by staff/coaches, who navigate via main menu/toolbar), hidden on `sessions/*`, `user-details/*`,
`user-notes/*`, `messages`. The "Launch Zoom" link path `http://example.com` is rewritten at render time
(`ecoach_utility_url_outbound_alter`): for a participant it becomes their **coach's** `field_zoom_link` (or `#`);
otherwise it stays as-is. Route access decides which links each role sees (e.g. `dashboard` coach, `user-dashboard` participant,
`create-relationship` coordinator, `coach-details` participant).

### 9.5 PN site settings

- `site_name` = Peer Navigation
- `site_slogan` = 
- `site_frontpage` = node/1
- `site_403` = 
- `site_404` = 
- `site_default_country` = US
- `date_default_timezone` = America/New_York
- `configurable_timezones` = 
- `user_default_timezone` = 
- `theme_default` = techstep_ecoach
- `admin_theme` = seven
- `node_admin_theme` = 1
- `clean_url` = 1
- `anonymous` = 
- `file_default_scheme` = public
- `file_public_path` = sites/default/files
- `file_private_path` = sites/default/private
- `preprocess_css` = 1
- `preprocess_js` = 1
- `cache` = 0
- `page_compression` = 1
- `error_level` = 0
- `maintenance_mode` = 
- `cron_safe_threshold` = 0
- `default_nodes_main` = 10
- `site_mail` = (set, domain gmail.com)

Path aliases (url_alias): 0 rows; non-user/node aliases:


node aliases (count only): 0, user aliases: 0


`site_403`/`site_404` unset (Drupal defaults). No URL aliases.

### 9.6 PN themes

| theme | enabled | base | used by |
| --- | --- | --- | --- |
| `techstep_ecoach` | yes (default) | bootstrap | anonymous, authenticated, participant, tech-participant |
| `bootstrap` | yes | — | administrator, coach, coordinator (role_theme_switcher) |
| `seven` | yes | — | admin theme |
| `twm_bootstrapless`, `newtheme`, `bartik` | yes | bootstrap / — | unused |

`theme_techstep_ecoach_settings` unset (defaults). `theme_bootstrap_settings`: logo default, site name shown.

---
## 10. Blocks per region

From `block` (status = 1) + `block_role`. Visibility: "all except listed" with empty pages = everywhere. Only the
themes actually served are listed; other themes' rows are dead config. "renders" describes current code behaviour.

### 10.1 LP (served themes: `twm_bootstrapless`, `twm_bootstrapless_old`, `seven`)

| theme | region | weight | module:delta | admin label | title | visibility | pages | roles | renders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| seven | content | 0 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| seven | content | 10 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |
| seven | dashboard_inactive | 0 | `comment:recent` | Recent comments |  | all except listed |  | (all) | Recent comments (dashboard) |
| seven | dashboard_inactive | 0 | `user:online` | Who's online |  | all except listed |  | (all) | Who's online (dashboard) |
| seven | dashboard_inactive | 0 | `uy_search:form` | YouThrive Search form |  | all except listed |  | (all) | YouThrive search box (dashboard, inactive) |
| seven | dashboard_main | 10 | `node:recent` | Recent content |  | all except listed |  | (all) | Recent content (dashboard) |
| seven | dashboard_sidebar | -10 | `search:form` | Search form |  | all except listed |  | (all) | Core search box |
| seven | dashboard_sidebar | 0 | `user:new` | Who's new |  | all except listed |  | (all) | Who's new (dashboard) |
| seven | help | 0 | `system:help` | System help |  | all except listed |  | (all) | Help text |
| twm_bootstrapless | content | -32 | `twm_comment_notification:twm_comment_notification_mobile` | (not declared) |  | only listed | `<front>` | (all) | Not handled — renders nothing |
| twm_bootstrapless | content | -32 | `youthrive_profile:uy_home_profile` | (not declared) |  | only listed |  | (all) | No longer declared — renders nothing |
| twm_bootstrapless | content | -32 | `uy_search:uy_user_search_results` | YouThrive User Search Results |  | only listed | `<front>` | authenticated user | User/wall search results; replaced by the search box form for users with `search content` |
| twm_bootstrapless | content | -30 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |
| twm_bootstrapless | content | -29 | `youthrive_profile:uy_others_profile` | Youthirve Other Users Profile Block |  | PHP | PHP: `user/<uid>` of another user | authenticated user | Other user's profile view (on `user/<uid>` when not own) |
| twm_bootstrapless | content | -28 | `uy_standard_user_engagement:engagement_msg_count` | (not declared) |  | all except listed |  | (all) | Not declared — renders nothing |
| twm_bootstrapless | content | -28 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| twm_bootstrapless | content | -27 | `youthrive_profile:uy_user_levels` | User Levels Description Block |  | only listed | my-profile | authenticated user | Level descriptions (variables `levelN-name/desc`) on `my-profile` |
| twm_bootstrapless | content | -26 | `drupal_wall:drupal_wall_view` | Drupal Wall - Wall post |  | only listed | `<front>` | administrator,Research Administrator User,Coordinator User,participant | Per-user wall posts + post form — **renders nothing** when path starts with `user` or `drupal-wall` (so nothing on the front page); legacy |
| twm_bootstrapless | content | -25 | `techstep_tracking:techstep_tracking` | (not declared) | `<none>` | only listed | `<front>` | participant | Not declared — renders nothing (tracker UI is page-based) |
| twm_bootstrapless | content | -16 | `twm_achievement_bins:twm_settings` | (not declared) |  | PHP | PHP: `reminders` pages or own `user/<uid>` | authenticated user | Not handled — renders nothing |
| twm_bootstrapless | header | -32 | `menu:menu-twm-menu` | Participant Menu in FOOTER | `<none>` | all except listed |  | administrator,Research Administrator User,Coordinator User,participant | Participant navigation menu (§9) |
| twm_bootstrapless | help | 0 | `system:help` | System help |  | all except listed |  | (all) | Help text |
| twm_bootstrapless | sidebar_second | -16 | `twm_comment_notification:twm_comment_notification` | (not declared) | `<none>` | only listed | `<front>` | authenticated user | Not handled (only `_desktop` exists) — renders nothing |
| twm_bootstrapless | sidebar_second | -16 | `twm_achievement_bins:twm_myprofile_data` | (not declared) |  | PHP | PHP: `user/<uid>` of another user | authenticated user | Not handled — renders nothing |
| twm_bootstrapless | sidebar_second | 0 | `views:998529e1ece640b5397785a28d6521ed` | (not declared) |  | only listed | thrive-tips | (all) | Unknown views hash (not in `views_block_hashes`) — renders nothing |
| twm_bootstrapless | sidebar_second | 0 | `views:5a13ccfd47ba3eaa3a8b156f82b1b82f` | View: Backup Today Thrive Tips |  | only listed | `<front>` ; thrive-tips | (all) | View `backup_today_thrive_tips`, display `today_tips_cycle_2` (today's tips) |
| twm_bootstrapless | sidebar_second | 0 | `views:thrive_tips_view_block-block` | (not declared) |  | all except listed |  | (all) | View `thrive_tips_view_block` (code, thrive_tips_efm) |
| twm_bootstrapless | slidecontent | -31 | `drupal_wall:custom_drupal_wall` | Users Drupal Wall-- User Wall Post |  | only listed | `<front>` | authenticated user | Current user's wall post composer ("What's on your mind?" form) |
| twm_bootstrapless | slidecontent | -30 | `drupal_wall:home_page_drupal_wall` | Home Page Drupal Wall |  | only listed | `<front>` | (all) | Global wall feed (all users' posts, paged by `drupal_wall_global_post_limit` 5) |
| twm_bootstrapless | slidercontent | -31 | `twm_achievement_bins:uy_home_profile` | (not declared) |  | only listed | `<front>` | authenticated user | Not handled — renders nothing |
| twm_bootstrapless | slidercontent | -29 | `twm_achievement_bins:twm_generic_profile` | Generic Profile Block |  | PHP | PHP: other user's `user/<uid>` or `my-profile` | authenticated user | Profile summary card (picture, points, level, about me) on others' profiles and `my-profile` |
| twm_bootstrapless_old | content | -32 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| twm_bootstrapless_old | content | -32 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |
| twm_bootstrapless_old | content | -31 | `drupal_wall:custom_drupal_wall` | Users Drupal Wall-- User Wall Post |  | only listed | `<front>` | authenticated user | Current user's wall post composer ("What's on your mind?" form) |
| twm_bootstrapless_old | content | -30 | `drupal_wall:home_page_drupal_wall` | Home Page Drupal Wall |  | only listed | `<front>` | (all) | Global wall feed (all users' posts, paged by `drupal_wall_global_post_limit` 5) |
| twm_bootstrapless_old | content | -29 | `menu:menu-twm-menu` | Participant Menu in FOOTER | `<none>` | all except listed |  | administrator,Research Administrator User,Coordinator User,participant | Participant navigation menu (§9) |
| twm_bootstrapless_old | content | -16 | `twm_achievement_bins:twm_settings` | (not declared) |  | PHP | PHP: `reminders` pages or own `user/<uid>` | authenticated user | Not handled — renders nothing |
| twm_bootstrapless_old | content | -9 | `masquerade:masquerade` | Masquerade |  | all except listed |  | (all) | Masquerade switch-user form |
| twm_bootstrapless_old | help | 0 | `system:help` | System help |  | all except listed |  | (all) | Help text |
| twm_bootstrapless_old | navigation | -32 | `system:main-menu` | Main menu | `<none>` | all except listed |  | administrator,Research Administrator User,Coordinator User | Main menu (staff links, §9.1) |
| twm_bootstrapless_old | sidebar_second | -16 | `twm_achievement_bins:twm_myprofile_data` | (not declared) |  | PHP | PHP: `user/<uid>` of another user | authenticated user | Not handled — renders nothing |
| twm_bootstrapless_old | sidebar_second | -16 | `twm_comment_notification:twm_comment_notification` | (not declared) | `<none>` | only listed | `<front>` | authenticated user | Not handled (only `_desktop` exists) — renders nothing |
| twm_bootstrapless_old | sidebar_second | 0 | `views:998529e1ece640b5397785a28d6521ed` | (not declared) |  | only listed | thrive-tips | (all) | Unknown views hash (not in `views_block_hashes`) — renders nothing |
| twm_bootstrapless_old | sidebar_second | 0 | `views:thrive_tips_view_block-block` | (not declared) |  | all except listed |  | (all) | View `thrive_tips_view_block` (code, thrive_tips_efm) |

Dead block config for non-served themes `bartik`, `twm`, `zurb_foundation` exists (system/main, login, wall,
thrive_tips views blocks) and can be ignored. `block_custom`: none (0 custom blocks).

Effective participant home page (`drupal-wall`, `twm_bootstrapless`): header = participant menu; slide(r)content =
wall composer + global wall feed + (anonymous-hidden) profile blocks; content = page content, search results;
sidebar_second = today's thrive tips views. Several placed blocks are dead (see "renders").

### 10.2 PN (served themes: `techstep_ecoach`, `bootstrap`, `seven`)

| theme | region | weight | module:delta | admin label | title | visibility | pages | roles | renders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bootstrap | content | -8 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| bootstrap | sidebar_first | -8 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |
| seven | content | 0 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| seven | content | 10 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |
| seven | dashboard_inactive | -10 | `search:form` | Search form |  | all except listed |  | (all) | Core search box |
| seven | dashboard_inactive | 0 | `comment:recent` | Recent comments |  | all except listed |  | (all) | Recent comments (dashboard) |
| seven | dashboard_inactive | 0 | `user:online` | Who's online |  | all except listed |  | (all) | Who's online (dashboard) |
| seven | dashboard_main | 10 | `node:recent` | Recent content |  | all except listed |  | (all) | Recent content (dashboard) |
| seven | dashboard_sidebar | 0 | `user:new` | Who's new |  | all except listed |  | (all) | Who's new (dashboard) |
| seven | help | 0 | `system:help` | System help |  | all except listed |  | (all) | Help text |
| techstep_ecoach | content | -8 | `system:main` | Main page content |  | all except listed |  | (all) | Page content |
| techstep_ecoach | header | -8 | `menu:menu-twm-menu` | Participant Menu | `<none>` | all except listed | sessions/* ; user-details/* ; user-notes/* ; messages | administrator,participant,coach,coordinator | Participant navigation menu (§9) |
| techstep_ecoach | sidebar_first | -8 | `user:login` | User login |  | all except listed |  | (all) | Login form (anonymous only) |

Dead config for `bartik`, `newtheme`, `twm_bootstrapless` mirrors the above. `block_custom`: none.

---
## 11. Enabled modules

Origin: **core** (Drupal core), **contrib (project)** (drupal.org, identified by `project =` in the .info),
**CUSTOM** (project-specific code; `*_efm` = Features exports holding config). Modules without a `project` line
but copied from drupal.org are marked CUSTOM by that rule — notably `access_report` and `comments_visibility`
(treat as custom). `views_data_export` is bundled inside the custom `weekly_checkin_efm` folder.

### 11.1 LP

| module | origin | package | path | description |
| --- | --- | --- | --- | --- |
| `announcements_feed` | core | Core | modules/announcements_feed | Displays announcements from the Drupal community. |
| `block` | core | Core | modules/block | Controls the visual building blocks a page is constructed with. Blocks are boxes of content rendered into an area, or region, of a web page. |
| `color` | core | Core | modules/color | Allows administrators to change the color scheme of compatible themes. |
| `comment` | core | Core | modules/comment | Allows users to comment on and discuss published content. |
| `contextual` | core | Core | modules/contextual | Provides contextual links to perform actions related to elements on a page. |
| `dashboard` | core | Core | modules/dashboard | Provides a dashboard page in the administrative interface for organizing administrative tasks and tracking information within your site. |
| `dblog` | core | Core | modules/dblog | Logs and records system events to the database. |
| `field` | core | Core | modules/field | Field API to add fields to entities like nodes and users. |
| `field_sql_storage` | core | Core | modules/field/modules/field_sql_storage | Stores field data in an SQL database. |
| `list` | core | Core | modules/field/modules/list | Defines list field types. Use with Options to create selection lists. |
| `number` | core | Core | modules/field/modules/number | Defines numeric field types. |
| `options` | core | Core | modules/field/modules/options | Defines selection, check box and radio button widgets for text and numeric fields. |
| `text` | core | Core | modules/field/modules/text | Defines simple text field types. |
| `field_ui` | core | Core | modules/field_ui | User interface for the Field API. |
| `file` | core | Core | modules/file | Defines a file field type. |
| `filter` | core | Core | modules/filter | Filters content in preparation for display. |
| `help` | core | Core | modules/help | Manages the display of online help. |
| `image` | core | Core | modules/image | Provides image manipulation tools. |
| `menu` | core | Core | modules/menu | Allows administrators to customize the site navigation menu. |
| `node` | core | Core | modules/node | Allows content to be submitted to the site and displayed on pages. |
| `overlay` | core | Core | modules/overlay | Displays the Drupal administration interface in an overlay. |
| `path` | core | Core | modules/path | Allows users to rename URLs. |
| `php` | core | Core | modules/php | Allows embedded PHP code/snippets to be evaluated. |
| `profile` | core | Core | modules/profile | Supports configurable user profiles. |
| `rdf` | core | Core | modules/rdf | Enriches your content with metadata to let other applications (e.g. search engines, aggregators) better understand its relationships and att |
| `search` | core | Core | modules/search | Enables site-wide keyword searching. |
| `shortcut` | core | Core | modules/shortcut | Allows users to manage customizable lists of shortcut links. |
| `simpletest` | core | Core | modules/simpletest | Provides a framework for unit and functional testing. |
| `statistics` | core | Core | modules/statistics | Logs access statistics for your site. |
| `syslog` | core | Core | modules/syslog | Logs and records system events to syslog. |
| `system` | core | Core | modules/system | Handles general site configuration for administrators. |
| `taxonomy` | core | Core | modules/taxonomy | Enables the categorization of content. |
| `toolbar` | core | Core | modules/toolbar | Provides a toolbar that shows the top-level administration menu items and links from other modules. |
| `update` | core | Core | modules/update | Checks for available updates, and can securely install or update modules and themes via a web interface. |
| `user` | core | Core | modules/user | Manages the user registration and login system. |
| `standard` | profile | Other | profiles/standard | Install with commonly used features pre-configured. |
| `access_report` | CUSTOM | TWM | sites/all/modules/access_report | System Resource Access by WEEK. |
| `account_profile` | contrib (account_profile) | Profile2 (contrib) | sites/all/modules/account_profile | Merges Profile2 forms into user account form. |
| `achievements` | contrib (achievements) | Achievements | sites/all/modules/achievements | Unlock achievements and earn points based on milestones. |
| `adaptive_image` | contrib (adaptive_image) | Other | sites/all/modules/adaptive_image | Support for adaptive images. |
| `ajax_links_api` | contrib (ajax_links_api) | User interface | sites/all/modules/ajax_links_api | Simple API to load content via jQuery Ajax. |
| `animgif_support` | contrib (animgif_support) | Other | sites/all/modules/animgif_support | Provides animated gif resizing support for the image styles. |
| `avatar_selection` | contrib (avatar_selection) | Other | sites/all/modules/avatar_selection | Manages configuration of a default list of avatar icons that a user can use instead of uploading a picture. |
| `cas_server` | contrib (cas) | Central Authentication Service | sites/all/modules/cas | Provides protocol compliant CAS Server |
| `ckeditor` | contrib (ckeditor) | User interface | sites/all/modules/ckeditor | Enables CKEditor (WYSIWYG HTML editor) for use instead of plain text fields. |
| `comments_visibility` | CUSTOM | TWM | sites/all/modules/comments_visibility | Handles comment settings visibility for TWM content type. |
| `ctools` | contrib (ctools) | Chaos tool suite | sites/all/modules/ctools | A library of helpful tools by Merlin of Chaos. |
| `views_content` | contrib (ctools) | Chaos tool suite | sites/all/modules/ctools/views_content | Allows Views content to be used in Panels, Dashboard and other modules which use the CTools Content API. |
| `date` | contrib (date) | Date/Time | sites/all/modules/date | Makes date/time fields available. |
| `date_api` | contrib (date) | Date/Time | sites/all/modules/date/date_api | A Date API that can be used by other modules. |
| `date_popup` | contrib (date) | Date/Time | sites/all/modules/date/date_popup | Enables jquery popup calendars and time entry widgets for selecting dates and times. |
| `drupal_wall` | contrib (drupal_wall) | social | sites/all/modules/drupal_wall | A custom wall post for drupal user's status posting. |
| `drupal_wall_efm` | CUSTOM | TWM | sites/all/modules/drupal_wall_efm | Drupal wall feature enabling |
| `elysia_cron` | contrib (elysia_cron) | Other | sites/all/modules/elysia_cron | Extended cron support with crontab-like scheduling and other features. |
| `embed_views` | contrib (embed_views) | Views | sites/all/modules/embed_views | Defines embed view display. |
| `entity` | contrib (entity) | Other | sites/all/modules/entity | Enables modules to work with any entity type and to provide entities. |
| `entityreference` | contrib (entityreference) | Fields | sites/all/modules/entityreference | Provides a field that can reference other entities. |
| `extlink` | contrib (extlink) | User interface | sites/all/modules/extlink | Determine behavior and appearance for external links. Options include: Make external links open in a new window, add icons next to external  |
| `features` | contrib (features) | Features | sites/all/modules/features | Provides feature management for Drupal. |
| `fe_block` | contrib (features_extra) | Features extra | sites/all/modules/features_extra | Build blocks and block settings as features. |
| `fe_date` | contrib (features_extra) | Features extra | sites/all/modules/features_extra | Build date format as features. |
| `fe_profile` | contrib (features_extra) | Features extra | sites/all/modules/features_extra | Export profile field using features. |
| `feeds` | contrib (feeds) | Feeds | sites/all/modules/feeds | Aggregates RSS/Atom/RDF feeds, imports CSV files and more. |
| `feeds_import` | contrib (feeds) | Feeds | sites/all/modules/feeds/feeds_import | An example of a node importer and a user importer. |
| `feeds_ui` | contrib (feeds) | Feeds | sites/all/modules/feeds/feeds_ui | Administrative UI for Feeds module. |
| `fences` | contrib (fences) | Fields | sites/all/modules/fences | Configurable field wrappers |
| `field_collection` | contrib (field_collection) | Fields | sites/all/modules/field_collection | Provides a field collection field, to which any number of fields can be attached. |
| `field_collection_fieldset` | contrib (field_collection_fieldset) | Fields | sites/all/modules/field_collection_fieldset | Provides a field-collection fieldset formatter. |
| `field_conditional_state` | contrib (field_conditional_state) | Fields | sites/all/modules/field_conditional_state | Set form field states attributes based on the values selected in other form fields using Drupal's states API |
| `field_formatter_settings` | contrib (field_formatter_settings) | Other | sites/all/modules/field_formatter_settings | Provides missing alter hooks for field formatter settings and summaries |
| `field_permissions` | contrib (field_permissions) | Fields | sites/all/modules/field_permissions | Set field-level permissions to create, update or view fields. |
| `fivestar` | contrib (fivestar) | Voting | sites/all/modules/fivestar | Enables fivestar ratings on content, users, etc. |
| `flag` | contrib (flag) | Flags | sites/all/modules/flag | Create customized flags that users can set on entities. |
| `flag_abuse` | contrib (flag_abuse) | Flags | sites/all/modules/flag_abuse | Utilizes Flag and Views to create social content moderation tools. |
| `imagecache_autorotate` | contrib (imagecache_actions) | Media | sites/all/modules/imagecache_actions/autorotate | Provides an image effect to autorotate an image based on EXIF data. |
| `imagecache_actions` | contrib (imagecache_actions) | Media | sites/all/modules/imagecache_actions | Provides utility code for a number of additional image effects that can be found in the sub modules. |
| `imagemagick` | contrib (imagemagick) | Other | sites/all/modules/imagemagick | Provides ImageMagick integration. |
| `imce` | contrib (imce) | Media | sites/all/modules/imce | An image/file uploader and browser supporting personal directories and user quota. |
| `job_scheduler` | contrib (job_scheduler) | Other | sites/all/modules/job_scheduler | Scheduler API |
| `jquery_update` | contrib (jquery_update) | User interface | sites/all/modules/jquery_update | Update jQuery and jQuery UI to a more recent version. |
| `libraries` | contrib (libraries) | Other | sites/all/modules/libraries | Allows version-dependent and shared usage of external libraries. |
| `logintoboggan` | contrib (logintoboggan) | Other | sites/all/modules/logintoboggan | Improves Drupal's login system. |
| `masquerade` | contrib (masquerade) | Other | sites/all/modules/masquerade | This module allows permitted users to masquerade as other users. |
| `memcache` | contrib (memcache) | Performance and scalability | sites/all/modules/memcache | High performance integration with memcache. |
| `memcache_admin` | contrib (memcache) | Performance and scalability | sites/all/modules/memcache/memcache_admin | Adds a User Interface to monitor the Memcache for this site. |
| `mentions` | contrib (mentions) | Filters | sites/all/modules/mentions | Adds Twitter like @username linking and tracking features. |
| `node_view_permissions` | contrib (node_view_permissions) | Access control | sites/all/modules/node_view_permissions | Enables permissions "View own content" and "View any content" for each content type. |
| `opengraph_filter` | contrib (opengraph_filter) | Filters | sites/all/modules/opengraph_filter | Add a preview of URLs found in the text, based on the URL's og metatags. |
| `phpexcel` | contrib (phpexcel) | Other | sites/all/modules/phpexcel | Provides a simple API for using the PHPExcel library |
| `profile2_page` | contrib (profile2) | Other | sites/all/modules/profile2/contrib | Adds separate pages for viewing and editing profiles. |
| `profile2` | contrib (profile2) | Other | sites/all/modules/profile2 | Supports configurable user profiles. |
| `qualtrics_survey_efm` | CUSTOM | TWM | sites/all/modules/qualtrics_survey_efm | Qualtrics Servey retrive the survey details and create user profile based on survey data |
| `quicktabs` | contrib (quicktabs) | Other | sites/all/modules/quicktabs | Render content with tabs and other display styles |
| `role_delegation` | contrib (role_delegation) | Other | sites/all/modules/role_delegation | Allows site administrators to grant some roles the authority to assign selected roles to users. |
| `role_theme_switcher` | contrib (role_theme_switcher) | Theme | sites/all/modules/role_theme_switcher | Assign separate themes to different roles |
| `record_shorten` | contrib (shorten) | Shorten URLs | sites/all/modules/shorten | Records shortened URLs from the Shorten module. |
| `shorten` | contrib (shorten) | Shorten URLs | sites/all/modules/shorten | Allows easy URL shortening via external services. |
| `shortener` | contrib (shorten) | Shorten URLs | sites/all/modules/shorten/shortener | Provides an input filter that replaces URLs with a shortened version. |
| `shorten_cs` | contrib (shorten) | Shorten URLs | sites/all/modules/shorten | Allows administrators to specify custom URL shortening services. <strong>Advanced users only.</strong> |
| `strip_utf8mb4` | contrib (strip_utf8mb4) | Other | sites/all/modules/strip_utf8mb4 | This module helps in preventing PDO exceptions caused by MySQL general error of Incorrect string value, Enabling this module will have your  |
| `strongarm` | contrib (strongarm) | Other | sites/all/modules/strongarm | Enforces variable values defined by modules that need settings set to operate properly. |
| `techstep_add_user` | CUSTOM | TechStep | sites/all/modules/techstep_add_user | Provide form to create user. |
| `techstep_location` | CUSTOM | TechStep | sites/all/modules/techstep_location | Implements TechStep Location Code. |
| `techstep_sso` | CUSTOM | TechStep | sites/all/modules/techstep_sso | Implements Single Sign On betweem TechStep and eCoach. |
| `techstep_tracking` | CUSTOM | TechStep | sites/all/modules/techstep_tracking | Implements Custom tracking. |
| `term_merge` | contrib (term_merge) | Taxonomy | sites/all/modules/term_merge | This module allows you to merge multiple terms into one, while updating all fields referring to those terms to refer to the replacement term |
| `thrive_tips_efm` | CUSTOM | TWM | sites/all/modules/thrive_tips_efm | Thrive tips feature module exporting using Feature module |
| `twilio` | contrib (twilio) | Twilio | sites/all/modules/twilio | Integration the Twilio cloud communication service with Drupal |
| `twm_achievement_bins` | CUSTOM | TWM | sites/all/modules/twm_achievement_bins | Implements TWM Achievement Bins. |
| `twm_administration_menu_feature` | CUSTOM | TWM | sites/all/modules/twm_administration_menu_feature |  |
| `twm_comment_notification` | CUSTOM | TWM | sites/all/modules/twm_comment_notification | Implements TWM Comment Notification Code. |
| `twm_general` | CUSTOM | TWM | sites/all/modules/twm_general | Implements TWM General Code. |
| `twm_glossary` | CUSTOM | TWM | sites/all/modules/twm_glossary | Taxonomy and views for a custom glossary |
| `twm_permissions_efm` | CUSTOM | TWM | sites/all/modules/twm_permissions_efm | TWM All Permissions EFM |
| `twm_randomization` | CUSTOM | TWM | sites/all/modules/twm_randomization | TWM randomization VBO |
| `twm_survey_reports` | CUSTOM | TWM | sites/all/modules/twm_survey_reports | Implements TWM Survey Reports. |
| `twm_tailored_tips` | CUSTOM | TWM | sites/all/modules/twm_tailored_tips | Implements tailored Thrive Tips for Thrive with me. |
| `twm_user_profile_sidebar_block` | CUSTOM | TWM | sites/all/modules/twm_user_profile_sidebar_block | Simple sidebar block |
| `twm_utility` | CUSTOM | TWM | sites/all/modules/twm_utility | TWM utility functions and hooks |
| `twm_weekly_checkin` | CUSTOM | TWM | sites/all/modules/twm_weekly_checkin | Implements TWM multi step form. |
| `url` | contrib (url) | Fields | sites/all/modules/url | Defines a simple URL field type. |
| `uy_search` | CUSTOM | YouThrive | sites/all/modules/uy_search | Youthrive keyword searching. |
| `uy_standard_usage_report` | CUSTOM | YouThrive | sites/all/modules/uy_standard_usage_report | Implements Youthrive Standard Usage Report Code. |
| `uy_standard_user_engagement` | CUSTOM | YouThrive | sites/all/modules/uy_standard_user_engagement | Implements YouThrive Standard User Engagemant. |
| `uy_user_interaction_report` | CUSTOM | YouThrive | sites/all/modules/uy_user_interaction_report | Implements Youthrive User Interaction Report Code. |
| `uy_user_tips_report` | CUSTOM | YouThrive | sites/all/modules/uy_user_tips_report | Implements Youthrive User Thrive Tips Report. |
| `video_embed_field` | contrib (video_embed_field) | Media | sites/all/modules/video_embed_field | Expose a field type for embedding videos from youtube or vimeo. |
| `views` | contrib (views) | Views | sites/all/modules/views | Create customized lists and queries from your database. |
| `views_ui` | contrib (views) | Views | sites/all/modules/views | Administrative interface to views. Without this module, you cannot create or edit your views. |
| `views_accordion` | contrib (views_accordion) | Views | sites/all/modules/views_accordion | Provides an accordion views display plugin. |
| `actions_permissions` | contrib (views_bulk_operations) | Administration | sites/all/modules/views_bulk_operations | Provides permission-based access control for actions. Used by Views Bulk Operations. |
| `views_bulk_operations` | contrib (views_bulk_operations) | Views | sites/all/modules/views_bulk_operations | Provides a way of selecting multiple rows and applying operations to them. |
| `votingapi` | contrib (votingapi) | Voting | sites/all/modules/votingapi | Provides a shared voting API for other modules. |
| `views_data_export` | contrib (views_data_export) | Views | sites/all/modules/weekly_checkin_efm/views_data_export | Plugin to export views data into various file formats |
| `weekly_checkin_efm` | CUSTOM | TWM | sites/all/modules/weekly_checkin_efm |  |
| `weekly_checkin_feedback` | CUSTOM | TWM | sites/all/modules/weekly_checkin_feedback | TWM Weekly CheckIn Feedback View |
| `youthrive_comment_edit_form` | CUSTOM | YouThrive | sites/all/modules/youthrive_comment_edit_form | A custom comment edit form |
| `youthrive_game_mechanics` | CUSTOM | Youthrive | sites/all/modules/youthrive_game_mechanics | Implements achievements for Youthrive Game Mechanics. |
| `youthrive_game_mechanics_efm` | CUSTOM | YouThrive | sites/all/modules/youthrive_game_mechanics_efm | YouThrive Game Mechanics EFM |
| `youthrive_post_edit_form` | CUSTOM | Other | sites/all/modules/youthrive_post_edit_form | A custom post edit form |
| `youthrive_profile` | CUSTOM | YouThrive | sites/all/modules/youthrive_profile | User Profile Block. |
| `youthrive_search_efm` | CUSTOM | YouThrive | sites/all/modules/youthrive_search_efm | YouThrive User Search EFM |
| `youthrive_sms_inputs_efm` | CUSTOM | YouThrive | sites/all/modules/youthrive_sms_inputs_efm | YouThrive SMS Inputs EFM |
| `youthrive_sms_reminders` | CUSTOM | YouThrive | sites/all/modules/youthrive_sms_reminders | Implements YouThrive SMS Reminders Code. |
| `youthrive_tags` | CUSTOM | YouThrive | sites/all/modules/youthrive_tags | Provide Youthrive Tags for entities and comments |
| `youthrive_user_profile_edit` | CUSTOM | YouThrive | sites/all/modules/youthrive_user_profile_edit | password rest form after one-time link login. |
| `youthrive_wall_reactions_efm` | CUSTOM | YouThrive | sites/all/modules/youthrive_wall_reactions_efm | YouThrive Wall Reactions EFM |

Disabled but present in `sites/all/modules` (LP; `schema_version` −1 = never installed):

- `achievements_optout` (schema_version -1)
- `achievements_pointless` (schema_version -1)
- `bulk_export` (schema_version -1)
- `cas` (schema_version -1)
- `cas_test` (schema_version -1)
- `ctools_access_ruleset` (schema_version -1)
- `ctools_ajax_sample` (schema_version -1)
- `ctools_custom_content` (schema_version -1)
- `ctools_export_test` (schema_version -1)
- `ctools_plugin_example` (schema_version -1)
- `ctools_plugin_test` (schema_version -1)
- `date_all_day` (schema_version -1)
- `date_all_day_test_feature` (schema_version -1)
- `date_context` (schema_version -1)
- `date_migrate` (schema_version -1)
- `date_migrate_test` (schema_version -1)
- `date_popup_timepicker` (schema_version -1)
- `date_repeat` (schema_version -1)
- `date_repeat_field` (schema_version -1)
- `date_repeat_test_feature` (schema_version -1)
- `date_test` (schema_version -1)
- `date_test_feature` (schema_version -1)
- `date_tools` (schema_version -1)
- `date_views` (schema_version -1)
- `devel` (schema_version 7008)
- `devel_generate` (schema_version -1)
- `devel_node_access` (schema_version -1)
- `entityreference_behavior_example` (schema_version -1)
- `entityreference_feeds_test` (schema_version -1)
- `entityreference_views_test` (schema_version -1)
- `entity_feature` (schema_version -1)
- `entity_test` (schema_version -1)
- `entity_test_i18n` (schema_version -1)
- `entity_token` (schema_version -1)
- `exif_orientation` (schema_version 0)
- `features_test` (schema_version -1)
- `feeds_news` (schema_version -1)
- `feeds_tests` (schema_version -1)
- `feeds_test_field` (schema_version -1)
- `fe_nodequeue` (schema_version -1)
- `flagaccesstest` (schema_version -1)
- `flag_actions` (schema_version -1)
- `flag_bookmark` (schema_version -1)
- `flag_comment_flag_test` (schema_version -1)
- `flag_fields_test` (schema_version -1)
- `flag_hook_test` (schema_version -1)
- `imagecache_canvasactions` (schema_version -1)
- `imagecache_coloractions` (schema_version -1)
- `imagecache_customactions` (schema_version -1)
- `imagecache_testsuite` (schema_version -1)
- `imagemagick_advanced` (schema_version -1)
- `image_effects_text` (schema_version -1)
- `image_effects_text_test` (schema_version -1)
- `image_exif_autorotate` (schema_version 0)
- `image_styles_admin` (schema_version -1)
- `job_scheduler_trigger` (schema_version -1)
- `jquery_update_test` (schema_version -1)
- `lazyloader` (schema_version 7001)
- `libraries_test_module` (schema_version -1)
- `logintoboggan_content_access_integration` (schema_version -1)
- `logintoboggan_rules` (schema_version -1)
- `logintoboggan_variable` (schema_version -1)
- `memcache_test` (schema_version -1)
- `page_manager` (schema_version -1)
- `piwik` (schema_version 7205)
- `profile2_i18n` (schema_version -1)
- `profile2_og_access` (schema_version -1)
- `qsurvey` (schema_version 0)
- `quicktabs_tabstyles` (schema_version -1)
- `stylizer` (schema_version -1)
- `subscribe` (schema_version -1)
- `term_depth` (schema_version -1)
- `twilio_twiml` (schema_version -1)
- `uy_user_checkin_report` (schema_version -1)
- `video_embed_brightcove` (schema_version -1)
- `video_embed_facebook` (schema_version -1)
- `views_content_test` (schema_version -1)
- `views_test` (schema_version -1)
- `youthrive_calendar` (schema_version -1)
- `youthrive_journey_efm` (schema_version -1)

Of these, once-installed and now disabled: `devel`, `lazyloader`, `piwik` (analytics; disabled locally per README —
**enabled in production**), `qsurvey` (Qualtrics survey sync; its tables remain, §5), `exif_orientation`,
`image_exif_autorotate`.

### 11.2 PN

| module | origin | package | path | description |
| --- | --- | --- | --- | --- |
| `announcements_feed` | core | Core | modules/announcements_feed | Displays announcements from the Drupal community. |
| `block` | core | Core | modules/block | Controls the visual building blocks a page is constructed with. Blocks are boxes of content rendered into an area, or region, of a web page. |
| `color` | core | Core | modules/color | Allows administrators to change the color scheme of compatible themes. |
| `comment` | core | Core | modules/comment | Allows users to comment on and discuss published content. |
| `contextual` | core | Core | modules/contextual | Provides contextual links to perform actions related to elements on a page. |
| `dashboard` | core | Core | modules/dashboard | Provides a dashboard page in the administrative interface for organizing administrative tasks and tracking information within your site. |
| `dblog` | core | Core | modules/dblog | Logs and records system events to the database. |
| `field` | core | Core | modules/field | Field API to add fields to entities like nodes and users. |
| `field_sql_storage` | core | Core | modules/field/modules/field_sql_storage | Stores field data in an SQL database. |
| `list` | core | Core | modules/field/modules/list | Defines list field types. Use with Options to create selection lists. |
| `number` | core | Core | modules/field/modules/number | Defines numeric field types. |
| `options` | core | Core | modules/field/modules/options | Defines selection, check box and radio button widgets for text and numeric fields. |
| `text` | core | Core | modules/field/modules/text | Defines simple text field types. |
| `field_ui` | core | Core | modules/field_ui | User interface for the Field API. |
| `file` | core | Core | modules/file | Defines a file field type. |
| `filter` | core | Core | modules/filter | Filters content in preparation for display. |
| `help` | core | Core | modules/help | Manages the display of online help. |
| `image` | core | Core | modules/image | Provides image manipulation tools. |
| `menu` | core | Core | modules/menu | Allows administrators to customize the site navigation menu. |
| `node` | core | Core | modules/node | Allows content to be submitted to the site and displayed on pages. |
| `overlay` | core | Core | modules/overlay | Displays the Drupal administration interface in an overlay. |
| `path` | core | Core | modules/path | Allows users to rename URLs. |
| `rdf` | core | Core | modules/rdf | Enriches your content with metadata to let other applications (e.g. search engines, aggregators) better understand its relationships and att |
| `search` | core | Core | modules/search | Enables site-wide keyword searching. |
| `shortcut` | core | Core | modules/shortcut | Allows users to manage customizable lists of shortcut links. |
| `system` | core | Core | modules/system | Handles general site configuration for administrators. |
| `taxonomy` | core | Core | modules/taxonomy | Enables the categorization of content. |
| `toolbar` | core | Core | modules/toolbar | Provides a toolbar that shows the top-level administration menu items and links from other modules. |
| `update` | core | Core | modules/update | Checks for available updates, and can securely install or update modules and themes via a web interface. |
| `user` | core | Core | modules/user | Manages the user registration and login system. |
| `standard` | profile | Other | profiles/standard | Install with commonly used features pre-configured. |
| `cas` | contrib (cas) | Central Authentication Service | sites/all/modules/cas | Provides single sign-on Central Authentication Services (CAS) |
| `common_fields` | CUSTOM | ecoach | sites/all/modules/common_fields | Use this feature for common fields for notes and user sessions |
| `ctools` | contrib (ctools) | Chaos tool suite | sites/all/modules/ctools | A library of helpful tools by Merlin of Chaos. |
| `ecoach_profile` | CUSTOM | eCoach | sites/all/modules/ecoach_profile | Simple form for coaches to create a participant |
| `ecoach_sessions` | CUSTOM | eCoach | sites/all/modules/ecoach_sessions | User session, eCoach dashboard view... etc. |
| `ecoach_utility` | CUSTOM | eCoach | sites/all/modules/ecoach_utility | Implements form hooks. |
| `entity` | contrib (entity) | Other | sites/all/modules/entity | Enables modules to work with any entity type and to provide entities. |
| `entityreference` | contrib (entityreference) | Fields | sites/all/modules/entityreference | Provides a field that can reference other entities. |
| `entity_reference_view` | CUSTOM | ecoach | sites/all/modules/entity_reference_view | Entity Reference View for Notes and User Sessions |
| `features` | contrib (features) | Features | sites/all/modules/features | Provides feature management for Drupal. |
| `feature_profile` | CUSTOM | ecoach | sites/all/modules/feature_profile | User Profile fields |
| `jquery_update` | contrib (jquery_update) | User interface | sites/all/modules/jquery_update | Update jQuery and jQuery UI to a more recent version. |
| `notes` | CUSTOM | ecoach | sites/all/modules/notes | Feature for Notes |
| `permissions` | CUSTOM | ecoach | sites/all/modules/permissions | Permissions for all modules |
| `privatemsg` | contrib (privatemsg) | Mail | sites/all/modules/privatemsg | Allow private messages between users. |
| `privatemsg_filter` | contrib (privatemsg) | Mail | sites/all/modules/privatemsg/privatemsg_filter | Allow users to filter messages using tags or other criteria. |
| `role_theme_switcher` | contrib (role_theme_switcher) | Theme | sites/all/modules/role_theme_switcher | Assign separate themes to different roles |
| `select_or_other` | contrib (select_or_other) | Fields | sites/all/modules/select_or_other | Provides a select box form element with additional option 'Other' to give a textfield. |
| `techstep_tracking` | CUSTOM | TechStep | sites/all/modules/techstep_tracking | Implements Custom tracking. |
| `user_sessions` | CUSTOM | ecoach | sites/all/modules/user_sessions | Feature for User Sessions |
| `views` | contrib (views) | Views | sites/all/modules/views | Create customized lists and queries from your database. |
| `views_ui` | contrib (views) | Views | sites/all/modules/views | Administrative interface to views. Without this module, you cannot create or edit your views. |
| `webform` | contrib (webform) | Webform | sites/all/modules/webform | Enables the creation of forms and questionnaires. |

Disabled but present in `sites/all/modules` (PN) — code copied from LP but never enabled:

- `access_report` (schema_version -1)
- `achievements` (schema_version -1)
- `achievements_optout` (schema_version -1)
- `achievements_pointless` (schema_version -1)
- `ajax_links_api` (schema_version -1)
- `bulk_export` (schema_version -1)
- `cas_server` (schema_version -1)
- `cas_test` (schema_version -1)
- `comments_visibility` (schema_version -1)
- `ctools_access_ruleset` (schema_version -1)
- `ctools_ajax_sample` (schema_version -1)
- `ctools_custom_content` (schema_version -1)
- `ctools_export_test` (schema_version -1)
- `ctools_plugin_example` (schema_version -1)
- `ctools_plugin_test` (schema_version -1)
- `date` (schema_version -1)
- `date_all_day` (schema_version -1)
- `date_api` (schema_version -1)
- `date_context` (schema_version -1)
- `date_migrate` (schema_version -1)
- `date_migrate_example` (schema_version -1)
- `date_popup` (schema_version -1)
- `date_repeat` (schema_version -1)
- `date_repeat_field` (schema_version -1)
- `date_test` (schema_version -1)
- `date_tools` (schema_version -1)
- `date_views` (schema_version -1)
- `drupal_wall` (schema_version -1)
- `drupal_wall_efm` (schema_version -1)
- `ecoach_ajax` (schema_version -1)
- `ecoach_standard_usage_report` (schema_version 0)
- `embed_views` (schema_version -1)
- `entityreference_behavior_example` (schema_version -1)
- `entityreference_feeds_test` (schema_version -1)
- `entityreference_views_test` (schema_version -1)
- `entity_feature` (schema_version -1)
- `entity_test` (schema_version -1)
- `entity_test_i18n` (schema_version -1)
- `entity_token` (schema_version -1)
- `features_test` (schema_version -1)
- `fe_block` (schema_version -1)
- `fe_date` (schema_version -1)
- `fe_nodequeue` (schema_version -1)
- `fe_profile` (schema_version -1)
- `field_conditional_state` (schema_version -1)
- `field_formatter_settings` (schema_version -1)
- `field_permissions` (schema_version -1)
- `flag` (schema_version -1)
- `flagaccesstest` (schema_version -1)
- `flag_abuse` (schema_version -1)
- `flag_actions` (schema_version -1)
- `flag_bookmark` (schema_version -1)
- `flag_comment_flag_test` (schema_version -1)
- `flag_fields_test` (schema_version -1)
- `flag_hook_test` (schema_version -1)
- `jquery_update_test` (schema_version -1)
- `page_manager` (schema_version -1)
- `pm_block_user` (schema_version -1)
- `pm_email_notify` (schema_version -1)
- `privatemsg_limits` (schema_version -1)
- `privatemsg_realname` (schema_version -1)
- `privatemsg_roles` (schema_version -1)
- `privatemsg_rules` (schema_version -1)
- `profile2` (schema_version -1)
- `profile2_i18n` (schema_version -1)
- `profile2_og_access` (schema_version -1)
- `profile2_page` (schema_version -1)
- `strongarm` (schema_version -1)
- `stylizer` (schema_version -1)
- `term_depth` (schema_version -1)
- `thrive_tips_efm` (schema_version -1)
- `twm_achievement_bins` (schema_version -1)
- `twm_tailored_tips` (schema_version -1)
- `twm_user_profile_sidebar_block` (schema_version -1)
- `twm_utility` (schema_version -1)
- `twm_weekly_checkin` (schema_version -1)
- `url` (schema_version -1)
- `uy_search` (schema_version -1)
- `video_embed_brightcove` (schema_version -1)
- `video_embed_facebook` (schema_version -1)
- `video_embed_field` (schema_version -1)
- `views_accordion` (schema_version -1)
- `views_content` (schema_version -1)
- `views_content_test` (schema_version -1)
- `views_test` (schema_version -1)
- `weekly_checkin_efm` (schema_version -1)
- `weekly_checkin_feedback` (schema_version -1)
- `youthrive_sms_inputs_efm` (schema_version -1)

---
## 12. Differences between LP and PN

| Area | LP | PN |
| --- | --- | --- |
| Role | Participant app + research admin | Coach/peer-navigator app |
| Content types | 16 (drupal_wall, thrive_tips, resources, journey_*, user_goals, weekly_checkin_prompt, weekly_checkins, reminder_messages, reminder_sms_inputs, public_page, page, tech_support, twm_achievement_carousel, article) | 5 (notes, user_sessions, webform, page, article) |
| Fields | 135 field storages (133 attached to a bundle) | 22 |
| User fields | 16 + profile2 `main` (3) | 10, no profile2 |
| Vocabularies | 8 (tips tags, glossary, resource tags, hashtags, …) | 1 (`tags`, empty) |
| Social | Wall posts, comments (40), 31 flags incl. reactions & abuse, mentions, hashtags | None (no comments, no flags) |
| Messaging | Bell notifications (`uy_user_notifications`), SMS via Twilio | Private messages (privatemsg), no SMS |
| Gamification | achievements + points ledger + level roles + avatar packs | None |
| Custom tables | ~20 (tracking, check-ins, notifications, reports, SMS logs, points) + Qualtrics leftovers | 2 (`ecoach_session_data`, `ecoach_session_log`) |
| Auth | Local login (username/email via LoginToboggan), CAS **server** | CAS **client** only, auto-registration |
| Registration | Admin-only (`user_register` 0); new users = `control` | Visitors w/ approval (2) but in practice CAS-created |
| Roles | 19 (incl. 11 level roles) | 7 |
| Admin extras | masquerade, role_delegation, VBO bulk actions, field_permissions, feeds (CSV resource import), elysia_cron, IMCE, CKEditor | none of these |
| Files | public 899 / private 1 | public 20 / private 13 (session attachments, owner-or-coach access) |
| Webform | not installed | 1 form (`week1`), 0 submissions |
| Timezone | America/Los_Angeles, per-user tz enabled | America/New_York, no per-user tz |
| Theme switching | control/participant → twm_bootstrapless; staff → twm_bootstrapless_old | participants → techstep_ecoach; staff/coach → bootstrap |
| Front page | `drupal-wall` | `node/1` |
| 403/404 | node/209 | defaults |
| Text formats | filtered_html, full_html, limited_html_for_wall_posting, php_code, plain_text, thrive_editor (all with mentions/hashtag/opengraph filters) | filtered_html, full_html, plain_text (defaults) |
| Image styles | profileicon 45×45 scale, wall-input-profile-icon 32×32 resize, thumbnail 200×200 (upscale), medium 220, large 480, `twm` & `profile_img` (adaptive_image 1382/992/768/480, autorotate) | thumbnail 100×100, medium 220, large 480 |
| Shared field names with different types | `field_zoom_link` url; `field_about_me` text_with_summary on profile2; `field_age` text on profile2; `field_coach` via view `coaches` | `field_zoom_link` text; `field_about_me` text_long on user; `field_age` integer on user; `field_coach` via view `user_reference` (rid 5) |

Text-format filters (LP): `filtered_html` = mentions, url, opengraph, html, autop, htmlcorrector, youthrive_tags;
`full_html` = opengraph, url, mentions, autop, htmlcorrector, youthrive_tags; `limited_html_for_wall_posting` =
mentions, html, url, autop, opengraph, htmlcorrector, youthrive_tags; `php_code` = mentions, opengraph, php;
`plain_text` = html_escape, mentions, opengraph, url, autop; `thrive_editor` = autop, url, youthrive_tags, opengraph,
htmlcorrector. (`filter_fallback_format` = plain_text on both.) Wall posts are created with `drupal_wall_textbox_type`
= `text_format`. CKEditor profiles: Advanced, Full, Global (CDN ckeditor 4.4.3).

---
## 13. `variable` table config names grouped by feature

Names only (values of non-secret settings that matter are quoted in the relevant sections above). Per-type /
per-user variables are compressed to a pattern with the list of suffixes.

### 13.1 LP (682 variables)

- **Site identity & front page**: `admin_theme`, `anonymous`, `clean_url`, `configurable_timezones`, `date_default_timezone`, `date_first_day`, `default_nodes_main`, `empty_timezone_message`, `install_profile`, `install_task`, `install_time`, `maintenance_mode`, `maintenance_mode_message`, `node_admin_theme`, `path_alias_whitelist`, `site_403`, `site_404`, `site_default_country`, `site_frontpage`, `site_mail`, `site_name`, `site_slogan`, `theme_default`
- **Themes & appearance**: `allow_image_style_options`, `css_js_query_string`, `drupal_css_cache_files`, `drupal_js_cache_files`, `image_jpeg_quality`, `image_toolkit`, `imagemagick_convert`, `imagemagick_debug`, `imagemagick_gm`, `imagemagick_quality`, `jquery_update_compression_type`, `jquery_update_jquery_cdn`, `jquery_update_jquery_version`, `jquery_update_latest_version_jquery`, `jquery_update_latest_version_jquery_cookie`, `jquery_update_latest_version_jquery_form`, `jquery_update_latest_version_jquery_migrate`, `jquery_update_latest_version_jqueryui`, `jquery_update_latest_versions_checked`, `lazyloader_distance`, `lazyloader_enabled`, `lazyloader_exclude_option`, `lazyloader_icon`, `lazyloader_paths`, `lazyloader_placeholder`, `preprocess_css`, `preprocess_js`, `role_theme_switcher_10_theme`, `role_theme_switcher_11_theme`, `role_theme_switcher_12_theme`, `role_theme_switcher_13_theme`, `role_theme_switcher_14_theme`, `role_theme_switcher_15_theme`, `role_theme_switcher_16_theme`, `role_theme_switcher_17_theme`, `role_theme_switcher_18_theme`, `role_theme_switcher_19_theme`, `role_theme_switcher_1_theme`, `role_theme_switcher_20_theme`, `role_theme_switcher_2_theme`, `role_theme_switcher_3_theme`, `role_theme_switcher_4_theme`, `role_theme_switcher_5_theme`, `role_theme_switcher_6_theme`, `role_theme_switcher_7_theme`, `role_theme_switcher_8_theme`, `role_theme_switcher_9_theme`, `theme_debug`, `theme_seven_settings`, `theme_twm_bootstrapless_old_settings`, `theme_twm_bootstrapless_settings`, `theme_twm_settings`
- **Users, registration, login, pictures**: `account_profile_wrap_account`, `account_profile_wrap_account_title`, `avatar_selection_avatar_per_page`, `avatar_selection_disable_user_upload`, `avatar_selection_distinctive_avatars`, `avatar_selection_force_user_avatar`, `avatar_selection_force_user_avatar_reg`, `avatar_selection_imagecache_preset`, `avatar_selection_set_random_default`, `email__active_tab`, `logintoboggan_confirm_email_at_registration`, `logintoboggan_immediate_login_on_register`, `logintoboggan_login_block_message`, `logintoboggan_login_block_type`, `logintoboggan_login_successful_message`, `logintoboggan_login_with_email`, `logintoboggan_minimum_password_length`, `logintoboggan_override_destination_parameter`, `logintoboggan_pre_auth_role`, `logintoboggan_purge_unvalidated_user_interval`, `logintoboggan_redirect_on_confirm`, `logintoboggan_redirect_on_register`, `logintoboggan_unified_login`, `masquerade_admin_roles`, `masquerade_quick_switches`, `masquerade_test_user`, `user_admin_role`, `user_cancel_method`, `user_cron_last`, `user_default_timezone`, `user_email_verification`, `user_mail_cancel_confirm_body`, `user_mail_cancel_confirm_subject`, `user_mail_password_reset_body`, `user_mail_password_reset_subject`, `user_mail_register_admin_created_body`, `user_mail_register_admin_created_subject`, `user_mail_register_no_approval_required_body`, `user_mail_register_no_approval_required_subject`, `user_mail_register_pending_approval_body`, `user_mail_register_pending_approval_subject`, `user_mail_status_activated_body`, `user_mail_status_activated_notify`, `user_mail_status_activated_subject`, `user_mail_status_blocked_body`, `user_mail_status_blocked_notify`, `user_mail_status_blocked_subject`, `user_mail_status_canceled_body`, `user_mail_status_canceled_notify`, `user_mail_status_canceled_subject`, `user_picture_default`, `user_picture_dimensions`, `user_picture_file_size`, `user_picture_guidelines`, `user_picture_path`, `user_picture_style`, `user_pictures`, `user_register`, `user_signatures`
- **Per-user state stored in variables (pattern)**: `user_last_access_time<uid>` (60 variables)
- **SSO / CAS**: `cas_server_service_whitelist`, `cas_server_slo_group_timeout`, `cas_server_slo_individual_timeout`, `cas_server_whitelist_failure`, `ecoach_url`
- **Content types: comments / node / menu per type (pattern)**: `additional_settings__active_tab_<type>` (drupal_wall, public_page, resources, thrive_tips), `comment_anonymous_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_default_mode_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_default_per_page_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_form_location_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_image_fid`, `comment_page`, `comment_preview_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `comment_subject_field_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `field_bundle_settings_<type>` (flagging__favorite_resource, node__drupal_wall, node__journey_category, node__journey_goals, node__journey_methods, node__page, node__reminder_messages, node__reminder_sms_inputs, node__resources, node__tech_support, node__thrive_tips, node__twm_achievement_carousel, node__twm_survey_reports, node__user_goals, node__weekly_checkin_prompt, node__weekly_checkins, profile2__main, taxonomy_term__custom_tracking, user__user), `menu_options_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `menu_parent_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `node_options_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, page, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `node_preview_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `node_submitted_<type>` (drupal_wall, journey_category, journey_goals, journey_methods, page, public_page, reminder_messages, reminder_sms_inputs, resources, tech_support, thrive_tips, twm_achievement_carousel, twm_survey_reports, user_goals, weekly_checkin_prompt, weekly_checkins), `node_view_permissions_<type>` (article, drupal_wall, page, public_page, reminder_sms_inputs, thrive_tips, weekly_checkin_prompt, weekly_checkins), `save_continue_<type>` (public_page, resources, thrive_tips)
- **Menus**: `menu_default_active_menus`, `menu_expanded`, `menu_masks`
- **Wall (drupal_wall), reactions, mentions, hashtags**: `ajax_links_api_html5`, `ajax_links_api_selector`, `ajax_links_api_trigger`, `ajax_links_api_vpager`, `drupal_wall_angry_comment`, `drupal_wall_angry_node`, `drupal_wall_comment_post_textbox`, `drupal_wall_content_type`, `drupal_wall_delete_post_button`, `drupal_wall_edit_post_button`, `drupal_wall_fire_comment`, `drupal_wall_fire_node`, `drupal_wall_global_post_limit`, `drupal_wall_global_post_offset`, `drupal_wall_haha_comment`, `drupal_wall_haha_node`, `drupal_wall_likes_comment`, `drupal_wall_likes_comment1`, `drupal_wall_likes_node`, `drupal_wall_likes_node1`, `drupal_wall_likes_post`, `drupal_wall_love_comment`, `drupal_wall_love_node`, `drupal_wall_older_post_button`, `drupal_wall_photo_status`, `drupal_wall_post_type_photo`, `drupal_wall_post_type_video`, `drupal_wall_sad_comment`, `drupal_wall_sad_node`, `drupal_wall_show_comments`, `drupal_wall_smiley_comment`, `drupal_wall_smiley_node`, `drupal_wall_super_comment`, `drupal_wall_super_node`, `drupal_wall_target_comment`, `drupal_wall_target_node`, `drupal_wall_textbox_type`, `drupal_wall_thought_comment`, `drupal_wall_thought_node`, `drupal_wall_thumbs_up_comment`, `drupal_wall_thumbs_up_node`, `drupal_wall_user_id`, `drupal_wall_wall_post_limit`, `drupal_wall_wall_post_offset`, `drupal_wall_what_is_on_mind_string_user_page_title`, `drupal_wall_what_is_on_your_mind_string_post_box`, `drupal_wall_wow_comment`, `drupal_wall_wow_node`, `flag_default_flag_status`, `hashtags_content_types`, `mentions`, `mentions_autocomplete`, `what_is_on_your_mind`, `youthrive_tags_content_types`, `youthrive_tags_terms_field`, `youthrive_tags_vocabulary`
- **Gamification / levels / goals / notifications**: `bell_notifications`, `goal-step1`, `goal-step2`, `goal-step3`, `goal-step4`, `goal-step5`, `goal-step6`, `goal-step7`, `level`, `level1-desc`, `level1-name`, `level2-desc`, `level2-name`, `level3-desc`, `level3-name`, `level4-desc`, `level4-name`, `level5-desc`, `level5-name`, `level6-desc`, `level6-name`, `level7-desc`, `level7-name`, `level8-desc`, `level8-name`, `twm_badges_last`, `uy_timeonsite_last`
- **SMS / Twilio / URL shortening / surveys**: `midpoint_url`, `shorten_cache_clear_all`, `shorten_cache_duration`, `shorten_cache_fail_duration`, `shorten_invisible_services`, `shorten_method`, `shorten_service`, `shorten_service_backup`, `shorten_show_service`, `shorten_timeout`, `shorten_use_alias`, `shorten_www`, `twilio_country_codes`, `twilio_long_sms`, `twilio_registration_form`
- **Text formats & editors**: `extlink_alert`, `extlink_alert_text`, `extlink_class`, `extlink_css_exclude`, `extlink_css_explicit`, `extlink_exclude`, `extlink_img_class`, `extlink_include`, `extlink_mailto_class`, `extlink_subdomains`, `extlink_target`, `filter_fallback_format`, `imce_profiles`, `imce_roles_profiles`, `imce_settings_absurls`, `imce_settings_disable_private`, `imce_settings_replace`, `imce_settings_textarea`, `imce_settings_thumb_method`, `strip_utf8mb4_for_text_field_widget_types`, `strip_utf8mb4_replace_string`
- **Analytics & statistics**: `piwik_cache`, `piwik_codesnippet_after`, `piwik_codesnippet_before`, `piwik_custom`, `piwik_custom_var`, `piwik_domain_mode`, `piwik_js_scope`, `piwik_page_title_hierarchy`, `piwik_page_title_hierarchy_exclude_home`, `piwik_pages`, `piwik_privacy_donottrack`, `piwik_roles`, `piwik_site_id`, `piwik_site_search`, `piwik_track`, `piwik_trackcolorbox`, `piwik_trackfiles_extensions`, `piwik_trackmailto`, `piwik_trackmessages`, `piwik_trackuserid`, `piwik_url_http`, `piwik_url_https`, `piwik_url_skiperror`, `piwik_visibility_pages`, `piwik_visibility_roles`, `statistics_count_content_views`, `statistics_count_content_views_ajax`, `statistics_day_timestamp`, `statistics_enable_access_log`, `statistics_flush_accesslog_timer`
- **Views**: `views_block_hashes`, `views_defaults`, `views_exposed_filter_any_label`, `views_show_additional_queries`, `views_ui_always_live_preview`, `views_ui_custom_theme`, `views_ui_display_embed`, `views_ui_show_advanced_column`, `views_ui_show_advanced_help_warning`, `views_ui_show_listing_filters`, `views_ui_show_master_display`, `views_ui_show_performance_statistics`, `views_ui_show_preview_information`, `views_ui_show_sql_query`, `views_ui_show_sql_query_where`
- **Cron & jobs**: `announcements_feed_last_fetch`, `cron_last`, `cron_safe_threshold`, `ctools_last_cron`, `elysia_cron_alert_interval`, `elysia_cron_default_rules`, `elysia_cron_last_channel`, `elysia_cron_last_run`, `elysia_cron_queue_show_count`, `elysia_cron_stuck_time`, `elysia_cron_time_limit`, `feeds_reschedule`, `feeds_sync_cache_feeds_http_last_check`, `job_scheduler_rebuild_all`, `last_cron`, `node_cron_last`, `update_last_check`
- **Caching & performance**: `block_cache`, `cache`, `cache_class_cache_ctools_css`, `cache_class_cache_feeds_http`, `cache_content_flush_cache_block`, `cache_content_flush_cache_page`, `cache_flush_cache`, `cache_flush_cache_block`, `cache_flush_cache_bootstrap`, `cache_flush_cache_features`, `cache_flush_cache_feeds_http`, `cache_flush_cache_field`, `cache_flush_cache_filter`, `cache_flush_cache_form`, `cache_flush_cache_image`, `cache_flush_cache_libraries`, `cache_flush_cache_menu`, `cache_flush_cache_page`, `cache_flush_cache_path`, `cache_flush_cache_shorten`, `cache_flush_cache_update`, `cache_flush_cache_views`, `cache_flush_cache_views_data`, `cache_lifetime`, `cache_temporary_flush_cache`, `cache_temporary_flush_cache_block`, `cache_temporary_flush_cache_features`, `cache_temporary_flush_cache_field`, `cache_temporary_flush_cache_filter`, `cache_temporary_flush_cache_image`, `cache_temporary_flush_cache_libraries`, `cache_temporary_flush_cache_menu`, `cache_temporary_flush_cache_page`, `cache_temporary_flush_cache_path`, `cache_temporary_flush_cache_shorten`, `cache_temporary_flush_cache_views`, `cache_temporary_flush_cache_views_data`, `drupal_http_request_fails`, `memcache_wildcard_flushes`, `page_cache_maximum_age`, `page_compression`
- **Files**: `file_default_scheme`, `file_private_path`, `file_public_path`, `file_temporary_path`
- **Features / entity / date plumbing**: `date_api_use_iso8601`, `date_api_version`, `dblog_row_limit`, `dev_query`, `devel_api_url`, `devel_error_handlers`, `devel_execution`, `devel_krumo_skin`, `devel_memory`, `devel_page_alter`, `devel_query_display`, `devel_query_sort`, `devel_raw_names`, `devel_rebuild_theme_registry`, `devel_redirect_page`, `devel_show_query_args_first`, `devel_timer`, `devel_use_uncompressed_jquery`, `entity_cache_tables_created`, `entityreference:base-tables`, `error_level`, `features_ignored_orphans`, `features_modules_changed`, `features_semaphore`, `form_build_id`, `hashed_session_ids_supported`, `services_security_update_1`, `syslog_facility`, `syslog_format`, `syslog_identity`, `tracking__active_tab`
- **Security-sensitive (names only, values never copied)**: `cron_key`, `drupal_private_key`, `twilio_account`, `twilio_number`, `twilio_token`

### 13.2 PN (152 variables)

- **Site identity & front page**: `admin_theme`, `clean_url`, `date_default_timezone`, `default_nodes_main`, `install_profile`, `install_task`, `install_time`, `maintenance_mode`, `node_admin_theme`, `path_alias_whitelist`, `site_403`, `site_404`, `site_default_country`, `site_frontpage`, `site_mail`, `site_name`, `site_slogan`, `theme_default`
- **Themes & appearance**: `bootstrap_cdn_cache`, `css_js_query_string`, `drupal_css_cache_files`, `drupal_js_cache_files`, `image_toolkit`, `jquery_update_compression_type`, `jquery_update_jquery_cdn`, `jquery_update_jquery_version`, `jquery_update_latest_version_jquery`, `jquery_update_latest_version_jquery_cookie`, `jquery_update_latest_version_jquery_form`, `jquery_update_latest_version_jquery_migrate`, `jquery_update_latest_version_jqueryui`, `jquery_update_latest_versions_checked`, `preprocess_css`, `preprocess_js`, `role_theme_switcher_1_theme`, `role_theme_switcher_2_theme`, `role_theme_switcher_3_theme`, `role_theme_switcher_4_theme`, `role_theme_switcher_5_theme`, `role_theme_switcher_6_theme`, `role_theme_switcher_7_theme`, `theme_bootstrap_settings`, `theme_newtheme_settings`, `theme_seven_settings`, `theme_twm_bootstrapless_settings`
- **Users, registration, login, pictures**: `user_admin_role`, `user_picture_dimensions`, `user_picture_file_size`, `user_picture_style`, `user_pictures`, `user_register`
- **SSO / CAS**: `cas_access`, `cas_auto_assigned_role`, `cas_changePasswordURL`, `cas_check_frequency`, `cas_debugfile`, `cas_domain`, `cas_exclude`, `cas_first_login_destination`, `cas_hide_email`, `cas_hide_password`, `cas_library_dir`, `cas_login_drupal_invite`, `cas_login_form`, `cas_login_invite`, `cas_login_message`, `cas_login_redir_message`, `cas_logout_destination`, `cas_pages`, `cas_pgtformat`, `cas_pgtpath`, `cas_port`, `cas_proxy`, `cas_proxy_list`, `cas_registerURL`, `cas_server`, `cas_single_logout_session_lifetime`, `cas_uri`, `cas_user_register`, `cas_version`
- **Content types: comments / node / menu per type (pattern)**: `additional_settings__active_tab_<type>` (notes, user_sessions), `comment_anonymous_<type>` (notes, user_sessions), `comment_default_mode_<type>` (notes, user_sessions), `comment_default_per_page_<type>` (notes, user_sessions), `comment_form_location_<type>` (notes, user_sessions), `comment_<type>` (notes, user_sessions, webform), `comment_page`, `comment_preview_<type>` (notes, user_sessions), `comment_subject_field_<type>` (notes, user_sessions), `field_bundle_settings_<type>` (node__notes, node__user_sessions, user__user), `menu_options_<type>` (notes, user_sessions), `menu_parent_<type>` (notes, user_sessions), `node_options_<type>` (notes, page, user_sessions), `node_preview_<type>` (notes, user_sessions), `node_submitted_<type>` (notes, page, user_sessions), `save_continue_<type>` (notes, user_sessions)
- **Menus**: `menu_default_active_menus`, `menu_expanded`, `menu_masks`
- **Text formats & editors**: `filter_fallback_format`
- **Private messages (PN)**: `date_format_privatemsg_current_day`, `date_format_privatemsg_current_year`, `date_format_privatemsg_years`, `privatemsg_filter_inbox_tag`
- **Webform (PN)**: `webform_node_webform`
- **Cron & jobs**: `announcements_feed_last_fetch`, `cron_last`, `cron_safe_threshold`, `ctools_last_cron`, `node_cron_last`, `update_last_check`
- **Caching & performance**: `block_cache`, `cache`, `cache_class_cache_ctools_css`, `cache_lifetime`, `drupal_http_request_fails`, `page_cache_maximum_age`, `page_compression`
- **Files**: `file_default_scheme`, `file_private_path`, `file_public_path`, `file_temporary_path`
- **Features / entity / date plumbing**: `dblog_row_limit`, `entity_cache_tables_created`, `entityreference:base-tables`, `error_level`, `features_ignored_orphans`, `features_modules_changed`, `features_semaphore`, `hashed_session_ids_supported`
- **Security-sensitive (names only, values never copied)**: `cas_cert`, `cron_key`, `drupal_private_key`

Key non-secret values not quoted elsewhere (LP): `drupal_wall_global_post_limit` 5, `drupal_wall_wall_post_limit`
5, `drupal_wall_post_type_photo` 1, `drupal_wall_post_type_video` 1, `drupal_wall_edit_post_button` 1,
`drupal_wall_delete_post_button` 1, `drupal_wall_older_post_button` 1, `drupal_wall_show_comments` 1,
`drupal_wall_comment_post_textbox` 1, `drupal_wall_likes_post` 1, `drupal_wall_photo_status` false,
`drupal_wall_what_is_on_your_mind_string_post_box` "What's on your mind ?", reaction → flag map
`drupal_wall_{love,haha,smiley,fire,super,target,thought,thumbs_up,sad,angry,wow}_{node,comment}` → the flags of the
same name (§4.4; `smiley` = haha), `drupal_wall_likes_node` = `up_voting`, `drupal_wall_likes_comment` =
`up_voting_comments`, `drupal_wall_likes_node1` = `abuse_node`, `drupal_wall_likes_comment1` = `abuse_comment`;
`mentions` input `@name.` → output link `user/view-profile/[user:uid]`, `mentions_autocomplete` 1;
`youthrive_tags_vocabulary` 6, `youthrive_tags_terms_field` `field_youthrive_tags`, `youthrive_tags_content_types`
{drupal_wall}; `hashtags_content_types` = all types; `midpoint_url` = the Qualtrics midpoint survey URL
(`https://umn.qualtrics.com/jfe/form/SV_cCsRZVHope5XwtD`); `shorten_service` TinyURL (backup is.gd);
`twilio_long_sms` 0, `twilio_registration_form` 0, `twilio_country_codes` = per-country enable map; `extlink_target` `_blank`,
`extlink_subdomains` 1, `extlink_class` `ext`, `extlink_mailto_class` `mailto`; `ajax_links_api_selector`
`#content`, trigger `.ajax-link .hashtag .user-hash-tags !#toolbar a`; `imce_roles_profiles` gives IMCE profile 1
to administrator, RA, Coordinator; `strip_utf8mb4_*` replaces 4-byte UTF-8 (emoji) with a space in text widgets —
**the legacy DB cannot store emoji in text fields**, so existing content has had emoji stripped.

---

## 14. Migration notes & gotchas

1. **Two user bases, one person**: LP uid ≠ PN uid. Join via `peernav.cas_user.cas_name` = `linkpositively.users.name`
   (34 CAS mappings). Keep both legacy ids.
2. **Passwords**: all `$S$` Drupal-7 hashes on both sites — implement a D7 phpass verifier and rehash on first login.
   PN accounts created via CAS were auto-registered by the cas module (users authenticate through LP, not locally).
3. **Roles as feature flags**: `level-*` roles are derived data (from points); store level/unlocks on the user and
   recompute from the points ledger rather than migrating roles 1:1. `control`/`participant` are the study arm;
   `ecoach-user` = enrolled in PN.
4. **Points**: the only reliable source is `achievement_stats` (6,495 rows). `achievement_totals`/`achievement_unlocks`
   are stale.
5. **Weekly check-in feedback** stores HTML; recompute from `reminder_checkin` (daily meds/mood) where possible.
6. **Datetime fields** have no timezone (`tz_handling none`); LP site timezone America/Los_Angeles; users may have
   their own `users.timezone`.
7. **Text stored as numbers / numbers as text**: `field_user_picture`, `field_avatar`, `field_wall_visit`,
   `field_role_changed_date`, `field_weekly_sms_date_time`, `youthrive_reports.uid`, `profile_features_update.uid`,
   `ts_locations.lat/lng` are text columns holding ids/timestamps/decimals — cast on import.
8. **Flag counts** in `flag_counts` are inconsistent with `flagging`; recompute.
9. **Private messages**: `pm_index` covers only 6 of 75 messages (backup artefact) — decide how to reconstruct
   threads (author + subject + timestamp heuristics) before migrating.
10. **Dead config**: many blocks, menus (`menu-about`, `menu-footer`), themes, and fields have no effect; the tables
    above mark them so the rewrite does not reproduce dead UI.
11. **Sensitive tables** (🔒) need encryption/audit: `reminder_checkin`, `ts_tracking*`, `weekly_checkin_feedback`,
    `twilio_user`, `uy_sms_reminder_stats`, `sms_engagement_messages`, `uy_user_notifications`, `youthrive_reports`,
    `accesslog`, `users_logs`, PN `field_notes`, `ecoach_session_*`, `pm_message`, private files; user fields
    `field_number`, `field_study_id`, `field_on_prep`, `field_intervention_start_date`.
12. **Secrets** (`twilio_account`/`twilio_token`/`twilio_number`, `cas_cert`, `drupal_private_key`, `cron_key`,
    `qsurvey_admin.token`, Piwik site id) must be re-issued as environment config, never copied from the dump.
