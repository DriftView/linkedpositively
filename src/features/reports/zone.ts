import { TZDate } from "@date-fns/tz";

/** The instant of local midnight starting `day` ("yyyy-MM-dd") in `timezone`. */
export function fromZonedDay(day: string, timezone: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, timezone).getTime());
}
