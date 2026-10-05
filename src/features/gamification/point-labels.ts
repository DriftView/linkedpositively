/**
 * Friendly wording for point reasons (history rows and the "how to earn
 * points" list). Client-safe. Keys follow POINT_RULES in points.ts; legacy
 * achievement ids from migrated history (docs/legacy/04 §2.2) are mapped too.
 */
export const POINT_REASON_LABELS: Record<string, string> = {
  comment_received: "Someone commented on your post",
  comment_on_tip: "Commented on a tip",
  comment_on_post: "Commented on a wall post",
  comment_on_resource: "Commented on a resource",
  post: "Shared a post on the wall",
  reaction_given: "Reacted to a post",
  reaction_earned: "Someone reacted to your post",
  tip_view: "Read a tip",
  tip_view_recommended: "Read a recommended tip",
  community_guidelines: "Read the community guidelines",
  resource_rating: "Rated a resource",
  time_on_site: "Spent time in the app",
  resource_view: "Explored resources",
  tracker_create: "Created a tracker",
  tracker_settings: "Set up your reminders",
  tracker_checkin: "Checked in on your tracker",
  profile_complete: "Completed your profile",
  weekly_checkin: "Did your weekly check-in",
  // Legacy achievement ids (migrated history).
  comment: "Comments",
  topic: "Shared a post on the wall",
  "upvote-given": "Reacted to a post",
  "upvote-earned": "Someone reacted to your post",
  "thrive-tip": "Read a tip",
  "tailored-thrive-tip": "Read a recommended tip",
  "community-view": "Read the community guidelines",
  "rate-resource": "Rated a resource",
  "time-on-site": "Spent time in the app",
  resource: "Explored resources",
  tracker: "Used your tracker",
  "profile-complete": "Completed your profile",
  "action-plan": "Completed an action plan",
  "checkin-meds-response": "Answered your medication check-in",
  "checkin-mood-response": "Answered your mood check-in",
  adjustment: "Points adjustment",
};

export function pointReasonLabel(reason: string) {
  return POINT_REASON_LABELS[reason] ?? "Points earned";
}

/** Grouped, participant-facing list of ways to earn points (levels page). */
export const EARNING_GUIDE: { title: string; items: { label: string; reason: string; note?: string }[] }[] = [
  {
    title: "Every day",
    items: [
      { label: "Spend time in the app", reason: "time_on_site", note: "once a day" },
      { label: "Check in on your tracker", reason: "tracker_checkin" },
      { label: "Read a tip", reason: "tip_view", note: "per tip" },
      { label: "Read a recommended tip", reason: "tip_view_recommended", note: "per tip" },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Share a post on the wall", reason: "post" },
      { label: "Comment on a wall post", reason: "comment_on_post" },
      { label: "Get a comment on your post", reason: "comment_received" },
      { label: "Comment on a tip", reason: "comment_on_tip" },
      { label: "React to a post", reason: "reaction_given" },
      { label: "Get a reaction on your post", reason: "reaction_earned" },
    ],
  },
  {
    title: "Getting set up",
    items: [
      { label: "Complete your profile (avatar, about me and a badge)", reason: "profile_complete", note: "once" },
      { label: "Read the community guidelines", reason: "community_guidelines", note: "once" },
      { label: "Create a tracker", reason: "tracker_create" },
      { label: "Set up your reminders", reason: "tracker_settings" },
      { label: "Do your weekly check-in", reason: "weekly_checkin" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Comment on a resource", reason: "comment_on_resource" },
      { label: "Rate a resource", reason: "resource_rating" },
      { label: "Explore resources", reason: "resource_view" },
    ],
  },
];
