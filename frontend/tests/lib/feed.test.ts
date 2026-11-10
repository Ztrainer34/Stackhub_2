import { describe, expect, it } from "vitest";
import {
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
