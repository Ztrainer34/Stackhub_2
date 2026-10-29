import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "@/lib/time-ago";

const NOW = new Date("2026-06-15T12:00:00.000Z");

/** Returns an ISO timestamp `ms` milliseconds before the fixed "now". */
function agoBy(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 4.35 * WEEK;
const YEAR = 12 * MONTH;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("timeAgo", () => {
  it("renders seconds for a 30-second-old timestamp", () => {
    expect(timeAgo(agoBy(30 * SECOND))).toBe("30 seconds ago");
  });

  it("renders minutes for a 5-minute-old timestamp", () => {
    expect(timeAgo(agoBy(5 * MINUTE))).toMatch(/^5 minutes ago$/);
  });

  it("renders hours for a 3-hour-old timestamp", () => {
    expect(timeAgo(agoBy(3 * HOUR))).toMatch(/^3 hours ago$/);
  });

  // Regression test: this module exists because a 14-day-old timestamp was
  // once rendering as "2 days ago" — every unit was one step too small.
  // A 2-day-old timestamp must land on DAYS, not HOURS.
  it("renders days, not hours, for a 2-day-old timestamp", () => {
    expect(timeAgo(agoBy(2 * DAY))).toBe("2 days ago");
  });

  it('renders "yesterday" for a 1-day-old timestamp (numeric: auto)', () => {
    expect(timeAgo(agoBy(1 * DAY))).toBe("yesterday");
  });

  // The bug this file exists to prevent: a 14-day-old timestamp rendering as
  // "2 days ago" instead of "2 weeks ago" because every unit boundary was off
  // by one step. This must never silently regress.
  it("renders weeks, not days, for a 14-day-old timestamp", () => {
    expect(timeAgo(agoBy(14 * DAY))).toBe("2 weeks ago");
  });

  it('renders "last week" for a 7-day-old timestamp (numeric: auto)', () => {
    expect(timeAgo(agoBy(7 * DAY))).toBe("last week");
  });

  it('renders "last month", not "last week", for a ~35-day-old timestamp', () => {
    // A literal 30 days is still inside the "weeks" range under the spec's
    // own boundary (1 month = 4.35 weeks ≈ 30.45 days), so 35 days is used
    // here to land unambiguously past the month cutover.
    expect(timeAgo(agoBy(35 * DAY))).toBe("last month");
  });

  it('renders "last year" for a ~400-day-old timestamp', () => {
    expect(timeAgo(agoBy(400 * DAY))).toBe("last year");
  });

  it("clamps a future timestamp to the present instead of saying 'in ...'", () => {
    const result = timeAgo(new Date(NOW.getTime() + 3 * DAY).toISOString());

    expect(result.toLowerCase()).not.toContain("in ");
  });

  it("returns the empty string for an unparseable timestamp", () => {
    expect(timeAgo("not a date")).toBe("");
  });

  it("returns the empty string for an empty input", () => {
    expect(timeAgo("")).toBe("");
  });

  it("does not throw for the exact present moment", () => {
    expect(() => timeAgo(NOW.toISOString())).not.toThrow();
  });
});
