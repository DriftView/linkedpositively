/** Dedupe keys of in-app reminders: one per target per local day, so they come back daily. */
export function checkinReminderKey(day: string) {
  return `checkin-reminder:${day}`;
}

export function trackerReminderKey(trackerId: string, day: string) {
  return `tracker-reminder:${trackerId}:${day}`;
}
