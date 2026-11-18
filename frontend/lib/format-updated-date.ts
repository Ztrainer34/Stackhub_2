/**
 * "Oct 9, 2026" for the "Last updated" line on a post page.
 *
 * Returns null when the value is missing or not a real date, so the caller can
 * hide the line instead of rendering "Invalid Date". Formatted in UTC so the
 * server-rendered page shows the same day to every reader.
 */
export function formatUpdatedDate(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
