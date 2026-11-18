/**
 * Relative timestamps for the feed ("2 days ago", "last week").
 *
 * Each entry is "how many of the CURRENT unit make one of the NEXT unit, and
 * what that next unit is called". Dividing a count of seconds by 60 yields
 * minutes, so 60 pairs with "minute" — an earlier version paired it with
 * "second" and every label came out one unit too small, which showed a
 * fortnight-old post as "2 days ago" and a month-old one as "last week".
 */
const STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "minute"], // 60 seconds make a minute
  [60, "hour"], //   60 minutes make an hour
  [24, "day"], //    24 hours make a day
  [7, "week"], //     7 days make a week
  [4.35, "month"], // ~4.35 weeks make a month
  [12, "year"], //   12 months make a year
];

/**
 * Formats an ISO timestamp as a relative phrase. Future timestamps are clamped
 * to "now" rather than rendering "in 3 days" — clock skew between the server
 * and the browser should not produce events that claim not to have happened.
 */
export function timeAgo(iso: string): string {
  const parsed = new Date(iso).getTime();
  // An unparseable timestamp gives NaN, which would format as "NaN years ago".
  if (Number.isNaN(parsed)) return "";

  let value = Math.max(0, (Date.now() - parsed) / 1000);
  let unit: Intl.RelativeTimeFormatUnit = "second";

  for (const [perNext, nextUnit] of STEPS) {
    if (value < perNext) break;
    value /= perNext;
    unit = nextUnit;
  }

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    -Math.round(value),
    unit
  );
}
