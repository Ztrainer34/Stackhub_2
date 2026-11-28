import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmApply,
  emailDomain,
  parseMode,
  parseProfileIds,
  parseUsernames,
  planChanges,
} from "../../scripts/grant-admin-plan.mjs";

// Only made-up names here. Never put a real username in this repo: it is public.

const ALICE = "abcdef01-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const MAX = "33333333-3333-4333-8333-333333333333";
const profiles = [
  { id: ALICE, username: "alice" },
  { id: BOB, username: "bob" },
  { id: MAX, username: "max_x" },
];

describe("parseUsernames", () => {
  it("trims, lowercases, drops empties and dedupes", () => {
    expect(parseUsernames(" Alice , bob,,alice ")).toEqual({ usernames: ["alice", "bob"] });
  });

  it("accepts underscores and hyphens", () => {
    expect(parseUsernames("max_x")).toEqual({ usernames: ["max_x"] });
    expect(parseUsernames("a-b-c")).toEqual({ usernames: ["a-b-c"] });
  });

  it.each([undefined, "", "   ", " , "])("rejects %j", (raw) => {
    expect(parseUsernames(raw).error).toBeTruthy();
  });

  it("names the username that is not valid", () => {
    expect(parseUsernames("alice,a").error).toContain('"a"');
    expect(parseUsernames("bad name").error).toContain('"bad name"');
    expect(parseUsernames("x%").error).toContain('"x%"');
  });

  it("allows 10 usernames and rejects 11", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `user${i}`).join(",");
    expect(parseUsernames(names(10)).usernames).toHaveLength(10);
    expect(parseUsernames(names(11)).error).toBeTruthy();
  });
});

describe("parseProfileIds", () => {
  it("parses, lowercases and dedupes", () => {
    expect(parseProfileIds(` ${ALICE.toUpperCase()}, ${BOB},${ALICE} `)).toEqual({ ids: [ALICE, BOB] });
  });

  it.each([undefined, "", "  ", " , "])("rejects %j", (raw) => {
    expect(parseProfileIds(raw).error).toBeTruthy();
  });

  it("rejects something that is not a UUID, naming it", () => {
    expect(parseProfileIds(`${ALICE},not-a-uuid`).error).toContain("not-a-uuid");
  });
});

describe("parseMode", () => {
  it("defaults to a dry-run grant", () => {
    expect(parseMode({})).toEqual({ mode: "grant", apply: false, force: false });
  });

  it("applies only on APPLY=1", () => {
    expect(parseMode({ APPLY: "1" }).apply).toBe(true);
    expect(parseMode({ APPLY: "true" }).apply).toBe(false);
    expect(parseMode({ APPLY: "0" }).apply).toBe(false);
  });

  it("forces only on FORCE=1", () => {
    expect(parseMode({ FORCE: "1" }).force).toBe(true);
    expect(parseMode({ FORCE: "yes" }).force).toBe(false);
  });

  it("revokes on REVOKE=1 and refuses any other value", () => {
    expect(parseMode({ REVOKE: "1" }).mode).toBe("revoke");
    expect(parseMode({ REVOKE: "yes" }).error).toBeTruthy();
    expect(parseMode({ REVOKE: "0" }).error).toBeTruthy();
    expect(parseMode({ REVOKE: "" }).mode).toBe("grant");
  });

  it("lists on LIST=1", () => {
    expect(parseMode({ LIST: "1" }).mode).toBe("list");
    expect(parseMode({ LIST: "yes" }).error).toBeTruthy();
  });

  it("refuses LIST together with REVOKE", () => {
    expect(parseMode({ LIST: "1", REVOKE: "1" }).error).toBeTruthy();
  });
});

describe("planChanges", () => {
  it("plans a grant for someone who is not an admin yet", () => {
    const plan = planChanges(["alice"], profiles, [BOB], [], "grant");
    expect(plan.rows).toEqual([{ username: "alice", id: ALICE, action: "grant", warnings: [] }]);
    expect(plan.remaining).toBe(2);
  });

  it("reports someone who already is an admin", () => {
    const plan = planChanges(["alice", "bob"], profiles, [BOB], [], "grant");
    expect(plan.rows?.map((r) => [r.username, r.action])).toEqual([
      ["alice", "grant"],
      ["bob", "already-admin"],
    ]);
    expect(plan.remaining).toBe(2);
  });

  it("stops on a username that matches nothing, naming it, with no partial plan", () => {
    const plan = planChanges(["alice", "nobody"], profiles, [], [], "grant");
    expect(plan.error).toContain('"nobody"');
    expect(plan.rows).toBeUndefined();
  });

  it("lists every problem name together", () => {
    const plan = planChanges(["ghost", "phantom"], profiles, [], [], "grant");
    expect(plan.error).toContain('"ghost"');
    expect(plan.error).toContain('"phantom"');
  });

  it("stops when two profiles share a username", () => {
    const dup = [...profiles, { id: "44444444-4444-4444-8444-444444444444", username: "alice" }];
    const plan = planChanges(["alice"], dup, [], [], "grant");
    expect(plan.error).toContain('"alice"');
    expect(plan.rows).toBeUndefined();
  });

  it("matches usernames exactly, not as patterns", () => {
    // "_" would match any character in a LIKE pattern: max_x must not find maxax.
    const lookalike = [{ id: BOB, username: "maxax" }];
    expect(planChanges(["max_x"], lookalike, [], [], "grant").error).toContain('"max_x"');
  });

  it("refuses to grant to an account with an open claim", () => {
    const plan = planChanges(["alice", "bob"], profiles, [], [ALICE], "grant");
    expect(plan.error).toContain("alice");
    expect(plan.rows).toBeUndefined();
  });

  it("only flags an open claim when revoking or listing", () => {
    for (const mode of ["revoke", "list"] as const) {
      const plan = planChanges(["alice"], profiles, [ALICE, BOB], [ALICE], mode);
      expect(plan.error).toBeUndefined();
      expect(plan.rows?.[0].warnings).toHaveLength(1);
    }
  });

  it("plans a revoke and counts who is left", () => {
    const plan = planChanges(["bob", "max_x"], profiles, [ALICE, BOB], [], "revoke");
    expect(plan.rows?.map((r) => [r.username, r.action])).toEqual([
      ["bob", "revoke"],
      ["max_x", "not-admin"],
    ]);
    expect(plan.remaining).toBe(1);
  });

  it("refuses to remove the last admin unless forced", () => {
    expect(planChanges(["alice"], profiles, [ALICE], [], "revoke").error).toBeTruthy();
    const forced = planChanges(["alice"], profiles, [ALICE], [], "revoke", { force: true });
    expect(forced.error).toBeUndefined();
    expect(forced.remaining).toBe(0);
  });

  it("allows removing every admin but one", () => {
    expect(planChanges(["alice"], profiles, [ALICE, BOB], [], "revoke").remaining).toBe(1);
  });

  it("lists who is an admin without changing anything", () => {
    const plan = planChanges(["alice", "bob"], profiles, [ALICE], [], "list");
    expect(plan.rows?.map((r) => r.action)).toEqual(["already-admin", "not-admin"]);
    expect(plan.remaining).toBe(1);
  });
});

describe("confirmApply", () => {
  const rows = [
    { username: "alice", id: ALICE },
    { username: "bob", id: BOB },
  ];

  it("accepts exactly the planned ids, in any order, in any case", () => {
    expect(confirmApply(rows, [BOB, ALICE.toUpperCase()])).toEqual({ ok: true });
  });

  it("refuses when an id was swapped (a rename between the dry run and the apply)", () => {
    expect(confirmApply(rows, [ALICE, MAX]).error).toBeTruthy();
  });

  it("refuses when an id is missing", () => {
    expect(confirmApply(rows, [ALICE]).error).toBeTruthy();
  });

  it("refuses an extra id that is not in the plan", () => {
    expect(confirmApply(rows, [ALICE, BOB, MAX]).error).toBeTruthy();
  });
});

describe("emailDomain", () => {
  it("keeps only the domain", () => {
    expect(emailDomain("someone@example.com")).toBe("***@example.com");
    expect(emailDomain("someone@example.com")).not.toContain("someone");
  });

  it("copes with a missing or odd address", () => {
    expect(emailDomain(undefined)).toBe("(no email)");
    expect(emailDomain("no-at-sign")).toBe("(no email)");
    expect(emailDomain("trailing@")).toBe("(no email)");
  });
});

describe("grant-admin.mjs source", () => {
  const source = readFileSync(path.resolve(process.cwd(), "scripts/grant-admin.mjs"), "utf8").replace(/\r\n/g, "\n");

  it("never matches usernames with a pattern", () => {
    expect(source.toLowerCase()).not.toContain("ilike");
    expect(source).toContain('.in("username", usernames)');
  });

  it("never prints an environment value, the key, or a raw error", () => {
    const consoleLines = source.split("\n").filter((line) => /console\.\w+\(/.test(line));
    expect(consoleLines.length).toBeGreaterThan(5); // the scan sees the logging
    for (const line of consoleLines) {
      expect(line).not.toContain("process.env");
      expect(line).not.toContain("serviceKey");
      expect(line).not.toContain("supabaseUrl");
      expect(line).not.toMatch(/console\.\w+\(\s*(e|err|error)\s*[,)]/);
    }
  });

  it("reads the key only from the environment", () => {
    expect(source).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("process.argv");
    expect(source).not.toContain("readFileSync");
  });
});
