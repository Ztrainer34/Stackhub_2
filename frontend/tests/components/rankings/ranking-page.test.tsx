import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The table, pagination and top-tools grid are separate components with their
// own markup. Only the page's own output (including its JSON-LD) is under test.
vi.mock("@/components/rankings/ranking-table", () => ({ RankingTable: () => null }));
vi.mock("@/components/rankings/ranking-pagination", () => ({ RankingPagination: () => null }));
vi.mock("@/components/rankings/top-tools-grid", () => ({ TopToolsGrid: () => null }));

import { RankingPage } from "@/components/rankings/ranking-page";
import type { RankingResult, Viewer } from "@/lib/rankings/types";

// A name that would end the JSON-LD <script> early and start one of its own.
const HOSTILE = "</script><script>window.__pwned = 1</script>";

function render(
  overrides: {
    title?: string;
    toolName?: string;
    viewer?: Viewer;
    result?: Partial<RankingResult>;
  } = {},
) {
  const toolName = overrides.toolName ?? "Clay";
  const result: RankingResult = {
    tools: [
      {
        id: "t1",
        name: toolName,
        logoUrl: null,
        stacks: 9,
        playbooks: 2,
        savedForLater: 1,
        trend30d: null,
        keptRate: null,
        labels: [],
        rank: 1,
        usedBy: [],
      },
    ],
    totalRanked: 1,
    totalPages: 1,
    page: 1,
    unranked: [],
    totalStacks: 9,
    updatedAt: new Date("2026-11-20T10:00:00Z"),
    ...overrides.result,
  };
  return renderToStaticMarkup(
    <RankingPage
      basePath="/rankings"
      breadcrumb={[{ name: "Home", href: "/" }, { name: overrides.title ?? "Rankings" }]}
      title={overrides.title ?? "Rankings"}
      intro="Most used tools."
      chipsLabel="Categories"
      chips={[]}
      result={result}
      params={{ sort: "stacks", dir: "desc", page: 1 }}
      viewer={overrides.viewer ?? null}
    />,
  );
}

/** The text between each <script ...ld+json> tag and the first </script> after it. */
function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe("RankingPage JSON-LD", () => {
  it("emits at least one JSON-LD block", () => {
    expect(jsonLdBlocks(render()).length).toBeGreaterThan(0);
  });

  it("emits JSON-LD that parses as JSON", () => {
    for (const block of jsonLdBlocks(render())) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });

  // A tool name or title is user-influenced text. If it reaches the script tag
  // unescaped, it closes the tag and the rest runs as page script (XSS).
  it("cannot be broken out of by a title containing </script>", () => {
    const html = render({ title: HOSTILE });
    expect(html).not.toContain("<script>window.__pwned");
  });

  it("cannot be broken out of by a tool name containing </script>", () => {
    const html = render({ toolName: HOSTILE });
    expect(html).not.toContain("<script>window.__pwned");
  });

  it("still parses as JSON when the title contains </script>", () => {
    for (const block of jsonLdBlocks(render({ title: HOSTILE }))) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });

  it("still parses as JSON when a tool name contains </script>", () => {
    for (const block of jsonLdBlocks(render({ toolName: HOSTILE }))) {
      expect(() => JSON.parse(block)).not.toThrow();
    }
  });

  it("opens exactly as many script tags as it closes", () => {
    const html = render({ title: HOSTILE, toolName: HOSTILE });
    const opens = (html.match(/<script/g) ?? []).length;
    const closes = (html.match(/<\/script>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe("RankingPage stack banner", () => {
  const BANNER = "Every stack counts. Is yours there?";

  /** The href of the first link whose visible text contains the given text. */
  function linkHref(html: string, text: string): string | undefined {
    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      if (m[2].replace(/<[^>]*>/g, "").includes(text)) {
        return /href="([^"]*)"/.exec(m[1])?.[1];
      }
    }
    return undefined;
  }

  it("is shown to a logged-out viewer", () => {
    expect(render({ viewer: null })).toContain(BANNER);
  });

  it("is shown to a signed-in viewer with an empty stack", () => {
    expect(render({ viewer: { username: "ada", activeStackCount: 0 } })).toContain(BANNER);
  });

  it("is hidden from a viewer who already has a stack", () => {
    expect(render({ viewer: { username: "ada", activeStackCount: 3 } })).not.toContain(BANNER);
  });

  it("is hidden when the stack count is unknown", () => {
    expect(render({ viewer: { username: "ada", activeStackCount: null } })).not.toContain(BANNER);
  });

  it("sends a logged-out viewer to /login from Add your stack", () => {
    expect(linkHref(render({ viewer: null }), "Add your stack")).toBe("/login");
  });

  it("sends a signed-in viewer to their stack tab from Add your stack", () => {
    const html = render({ viewer: { username: "ada", activeStackCount: 0 } });
    expect(linkHref(html, "Add your stack")).toBe("/ada?tab=stack");
  });

  it("has no Add your stack link when the banner is hidden", () => {
    const html = render({ viewer: { username: "ada", activeStackCount: 3 } });
    expect(linkHref(html, "Add your stack")).toBeUndefined();
  });
});

describe("RankingPage JSON-LD content", () => {
  type Node = Record<string, unknown>;

  /** Every object anywhere in the page's JSON-LD. */
  function allNodes(html: string): Node[] {
    const out: Node[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        out.push(v as Node);
        Object.values(v).forEach(walk);
      }
    };
    jsonLdBlocks(html).forEach((b) => walk(JSON.parse(b)));
    return out;
  }

  const toolRow = (name: string, rank: number) => ({
    id: `id-${rank}`,
    name,
    logoUrl: null,
    stacks: 9,
    playbooks: 0,
    savedForLater: 0,
    trend30d: null,
    keptRate: null,
    labels: [],
    rank,
    usedBy: [],
  });

  // Page 2 of 60: the list holds 2 tools, but their positions are their ranks
  // (26, 27) and the count is the whole ranking, not this page.
  const html = render({
    title: "Top outbound tools",
    result: {
      tools: [toolRow("Brevo Marketing Platform", 26), toolRow("Serper.dev", 27)],
      totalRanked: 60,
      totalPages: 3,
      page: 2,
    },
  });
  const nodes = allNodes(html);
  const list = nodes.find((n) => "numberOfItems" in n)!;
  const items = nodes.filter((n) => typeof n.position === "number");

  it("names the page", () => {
    expect(nodes.some((n) => n.name === "Top outbound tools")).toBe(true);
  });

  it("sets numberOfItems to the whole ranking, not the tools on this page", () => {
    expect(list.numberOfItems).toBe(60);
  });

  it("lists one item per tool on the page", () => {
    expect(items).toHaveLength(2);
  });

  it("uses each tool's rank as its position", () => {
    expect(items.map((i) => i.position)).toEqual([26, 27]);
  });

  /** An item may carry name and url directly or inside an `item` object. */
  const field = (i: Node, key: string) => i[key] ?? (i.item as Node | undefined)?.[key];

  it("gives each item the tool's name", () => {
    expect(items.map((i) => field(i, "name"))).toEqual(["Brevo Marketing Platform", "Serper.dev"]);
  });

  it("gives each item an absolute URL built from the slug of the tool's name", () => {
    expect(items.map((i) => field(i, "url"))).toEqual([
      "https://stackhub.me/tool/brevo-marketing-platform",
      "https://stackhub.me/tool/serper-dev",
    ]);
  });
});
