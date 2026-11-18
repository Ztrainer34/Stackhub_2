import { describe, expect, it } from "vitest";
import {
  feedItemKey,
  flattenFeedPages,
  hasMoreFeed,
  nextFeedPage,
  type FeedItem,
  type FeedResponse,
} from "@/lib/feed";

function item(key: string): FeedItem {
  return {
    kind: "post",
    event_key: key,
    reason: "latest",
    tier: 4,
    occurred_at: "2026-06-15T12:00:00.000Z",
    actor_id: "a",
    actor_username: "alice",
    post_id: null,
    post_name: null,
    post_slug: null,
    post_type: null,
    post_description: null,
    tool_id: null,
    tool_name: null,
    tool_logo_url: null,
    notification_message: null,
  };
}

function resp(n: number, total: number, page = 1, limit = 20, start = 0): FeedResponse {
  return {
    items: Array.from({ length: n }, (_, i) => item(`post:${start + i}`)),
    page,
    limit,
    total_count: total,
  };
}

describe("hasMoreFeed", () => {
  it("is true only when total exceeds items shown", () => {
    expect(hasMoreFeed(resp(5, 6))).toBe(true);
    expect(hasMoreFeed(resp(5, 5))).toBe(false);
    expect(hasMoreFeed(resp(0, 0))).toBe(false);
    expect(hasMoreFeed(resp(3, 3))).toBe(false);
  });
});

describe("nextFeedPage", () => {
  it("returns the next page while more remain", () => {
    expect(nextFeedPage(resp(20, 45, 1, 20))).toBe(2);
    expect(nextFeedPage(resp(20, 45, 2, 20))).toBe(3);
  });
  it("returns undefined at the end", () => {
    expect(nextFeedPage(resp(5, 45, 3, 20))).toBeUndefined();
    expect(nextFeedPage(resp(20, 20, 1, 20))).toBeUndefined();
  });
  it("returns undefined for an empty page", () => {
    expect(nextFeedPage(resp(0, 45, 2, 20))).toBeUndefined();
  });
});

describe("flattenFeedPages", () => {
  it("returns [] for no pages", () => {
    expect(flattenFeedPages([])).toEqual([]);
  });
  it("keeps distinct items in order", () => {
    const out = flattenFeedPages([resp(2, 4, 1, 2, 0), resp(2, 4, 2, 2, 2)]);
    expect(out.map((i) => i.event_key)).toEqual(["post:0", "post:1", "post:2", "post:3"]);
  });
  it("drops a key seen on a later page, keeping the first object", () => {
    const p1 = resp(2, 3, 1, 2, 0);
    const p2 = resp(2, 3, 2, 2, 1);
    const out = flattenFeedPages([p1, p2]);
    expect(out.map((i) => i.event_key)).toEqual(["post:0", "post:1", "post:2"]);
    expect(out[1]).toBe(p1.items[1]);
  });
  it("keeps the first of duplicates within one page", () => {
    const first = item("post:x");
    const page: FeedResponse = { items: [first, item("post:x")], page: 1, limit: 20, total_count: 2 };
    const out = flattenFeedPages([page]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(first);
  });
  it("does not mutate its input", () => {
    const p1 = resp(2, 3, 1, 2, 0);
    const p2 = resp(2, 3, 2, 2, 1);
    flattenFeedPages([p1, p2]);
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(2);
  });
});

/**
 * A row as it arrives from a backend older than the frontend: no event_key at
 * all. The type says string, the wire says otherwise, hence the cast.
 */
function keyless(overrides: Partial<FeedItem> = {}): FeedItem {
  return { ...item("x"), event_key: undefined as unknown as string, ...overrides };
}

function pageOf(items: FeedItem[], page = 1): FeedResponse {
  return { items, page, limit: 20, total_count: items.length };
}

describe("feedItemKey", () => {
  it("returns the event_key when it is a non-empty string", () => {
    expect(feedItemKey(item("post:abc"))).toBe("post:abc");
    expect(feedItemKey(item("notification:123"))).toBe("notification:123");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
  ])("returns a non-empty fallback when event_key is %s", (_label, value) => {
    const key = feedItemKey(keyless({ event_key: value as unknown as string, post_id: "p1" }));
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("gives the same key to two separate objects with identical fields", () => {
    // Dedupe across pages depends on the SAME row producing the SAME key.
    const a = keyless({ post_id: "p1" });
    const b = keyless({ post_id: "p1" });
    expect(feedItemKey(a)).toBe(feedItemKey(b));
  });

  it("is deterministic across repeated calls", () => {
    const row = keyless({ post_id: "p1" });
    expect(feedItemKey(row)).toBe(feedItemKey(row));
  });

  // Each field below is part of a row's identity. If the fallback ignores one,
  // rows that differ only in that field collapse into one, silently.
  it("gives different keys to rows that differ only in kind", () => {
    const a = keyless({ kind: "post", post_id: "p1" });
    const b = keyless({ kind: "notification", post_id: "p1" });
    expect(feedItemKey(a)).not.toBe(feedItemKey(b));
  });

  it("gives different keys to rows that differ only in reason", () => {
    const a = keyless({ reason: "latest", post_id: "p1" });
    const b = keyless({ reason: "post_star", post_id: "p1" });
    expect(feedItemKey(a)).not.toBe(feedItemKey(b));
  });

  it("gives different keys to rows that differ only in post_id", () => {
    const a = keyless({ post_id: "p1" });
    const b = keyless({ post_id: "p2" });
    expect(feedItemKey(a)).not.toBe(feedItemKey(b));
  });

  it("gives different keys to rows that differ only in actor_id", () => {
    const a = keyless({ actor_id: "a", post_id: "p1" });
    const b = keyless({ actor_id: "b", post_id: "p1" });
    expect(feedItemKey(a)).not.toBe(feedItemKey(b));
  });

  it("gives different keys to rows that differ only in occurred_at", () => {
    const a = keyless({ occurred_at: "2026-06-15T12:00:00.000Z", post_id: "p1" });
    const b = keyless({ occurred_at: "2026-06-15T12:00:01.000Z", post_id: "p1" });
    expect(feedItemKey(a)).not.toBe(feedItemKey(b));
  });

  it("does not throw on a null post_id", () => {
    expect(() => feedItemKey(keyless({ post_id: null }))).not.toThrow();
  });

  it("gives a null-post_id row a different key from a row with a post_id", () => {
    // Notification rows such as "follow" have no post; they must not collide
    // with a post row from the same actor at the same instant.
    const noPost = keyless({ post_id: null });
    const withPost = keyless({ post_id: "p1" });
    expect(feedItemKey(noPost)).not.toBe(feedItemKey(withPost));
  });
});

describe("flattenFeedPages with rows that have no event_key", () => {
  // Real incident: the frontend shipped before the backend. Every row arrived
  // with event_key undefined, all shared one dedupe key, and the feed showed
  // only its first row.
  it("keeps five distinct rows on one page, in order", () => {
    const rows = [1, 2, 3, 4, 5].map((n) => keyless({ post_id: `p${n}` }));
    const out = flattenFeedPages([pageOf(rows)]);
    expect(out.map((i) => i.post_id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("keeps rows that differ only in occurred_at", () => {
    const rows = [
      keyless({ occurred_at: "2026-06-15T12:00:00.000Z" }),
      keyless({ occurred_at: "2026-06-15T12:00:01.000Z" }),
      keyless({ occurred_at: "2026-06-15T12:00:02.000Z" }),
    ];
    const out = flattenFeedPages([pageOf(rows)]);
    expect(out.map((i) => i.occurred_at)).toEqual(rows.map((r) => r.occurred_at));
  });

  it("keeps rows from different pages when they are different rows", () => {
    const p1 = pageOf([keyless({ post_id: "p1" }), keyless({ post_id: "p2" })], 1);
    const p2 = pageOf([keyless({ post_id: "p3" }), keyless({ post_id: "p4" })], 2);
    const out = flattenFeedPages([p1, p2]);
    expect(out.map((i) => i.post_id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("drops the same row repeated on a later page, keeping the first object", () => {
    const first = keyless({ post_id: "p1" });
    const p1 = pageOf([first, keyless({ post_id: "p2" })], 1);
    const p2 = pageOf([keyless({ post_id: "p1" }), keyless({ post_id: "p3" })], 2);
    const out = flattenFeedPages([p1, p2]);
    expect(out.map((i) => i.post_id)).toEqual(["p1", "p2", "p3"]);
    expect(out[0]).toBe(first);
  });

  it("still dedupes keyed items when they are mixed with keyless rows", () => {
    const keyed = item("post:dup");
    const p1 = pageOf([keyed, keyless({ post_id: "p1" })], 1);
    const p2 = pageOf([item("post:dup"), keyless({ post_id: "p2" })], 2);
    const out = flattenFeedPages([p1, p2]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(keyed);
  });
});
