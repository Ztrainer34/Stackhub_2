import { describe, it, expect } from "vitest";
import { formatUpdatedDate } from "@/lib/format-updated-date";

/**
 * formatUpdatedDate renders the "last updated" date on a playbook page.
 *
 * Two things go wrong silently here: a local-timezone format makes the date
 * differ between the server render and the browser (and between readers), and a
 * bad timestamp renders the literal text "Invalid Date" on the page. These
 * cases pin both.
 */
describe("formatUpdatedDate", () => {
  it("formats an ISO timestamp as a short US-English date with the year", () => {
    expect(formatUpdatedDate("2026-10-09T14:30:00Z")).toBe("Oct 9, 2026");
  });

  it("does not zero-pad the day", () => {
    expect(formatUpdatedDate("2026-03-05T12:00:00Z")).toBe("Mar 5, 2026");
  });

  it("uses a two-digit day as-is", () => {
    expect(formatUpdatedDate("2026-11-21T12:00:00Z")).toBe("Nov 21, 2026");
  });

  describe("always formats in UTC", () => {
    // Local-time formatting would roll these across a day boundary on any
    // machine west of UTC (and the late-evening ones on machines east of it).
    // The result must not depend on where the code runs.
    it("keeps the last second of a UTC day on that day", () => {
      expect(formatUpdatedDate("2026-10-09T23:59:59Z")).toBe("Oct 9, 2026");
    });

    it("moves to the next day at UTC midnight", () => {
      expect(formatUpdatedDate("2026-10-10T00:00:00Z")).toBe("Oct 10, 2026");
    });

    it("keeps late evening UTC on the same day at the end of the year", () => {
      expect(formatUpdatedDate("2026-12-31T23:30:00Z")).toBe("Dec 31, 2026");
    });

    it("rolls the year over at UTC midnight on 1 January", () => {
      expect(formatUpdatedDate("2027-01-01T00:00:00Z")).toBe("Jan 1, 2027");
    });

    it("honours an explicit offset by converting to UTC first", () => {
      // 01:00 on the 10th at +02:00 is 23:00 on the 9th in UTC.
      expect(formatUpdatedDate("2026-10-10T01:00:00+02:00")).toBe("Oct 9, 2026");
    });
  });

  describe("returns null when there is no usable date", () => {
    it("returns null for undefined", () => {
      expect(formatUpdatedDate(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(formatUpdatedDate(null)).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(formatUpdatedDate("")).toBeNull();
    });

    it("returns null for a string that is not a date", () => {
      expect(formatUpdatedDate("not-a-date")).toBeNull();
    });

    it("returns null for a date-shaped string with out-of-range parts", () => {
      expect(formatUpdatedDate("2026-13-45")).toBeNull();
    });
  });

  it("never returns the text 'Invalid Date'", () => {
    // Intl and Date both produce this string for bad input instead of throwing,
    // so it would end up on the page if the guard were missing.
    for (const input of ["not-a-date", "2026-13-45", "", null, undefined]) {
      expect(formatUpdatedDate(input)).not.toBe("Invalid Date");
      expect(String(formatUpdatedDate(input))).not.toContain("Invalid Date");
    }
  });
});
