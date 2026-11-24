/**
 * The decisions behind scripts/grant-admin.mjs, as pure functions: parsing the
 * environment, turning "these usernames" into "these exact profiles", and
 * deciding what would change. No I/O and no side effects on import, so they are
 * unit-tested (tests/scripts/grant-admin-plan.test.ts) without a database.
 *
 * Granting admin is the most powerful thing this repo's tooling can do, so the
 * rules are strict: names must match exactly one profile each, a grant is
 * confirmed against profile ids (not just names), and the last admin cannot be
 * removed by accident.
 */

/** Most usernames one run may touch. */
export const MAX_USERNAMES = 10;

// The same shape the backend enforces on usernames (lowercase only: names are
// lowercased before they are compared).
const USERNAME = /^[a-z0-9_-]{3,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * ADMIN_USERNAMES -> a clean list of lowercase usernames.
 * @param {string | undefined} raw comma-separated usernames
 * @returns {{ usernames?: string[], error?: string }}
 */
export function parseUsernames(raw) {
  if (raw === undefined || !raw.trim()) {
    return { error: 'Set ADMIN_USERNAMES, e.g. ADMIN_USERNAMES="alice,bob".' };
  }
  const usernames = [
    ...new Set(
      raw
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (!usernames.length) {
    return { error: 'ADMIN_USERNAMES has no usernames in it, e.g. ADMIN_USERNAMES="alice,bob".' };
  }
  const bad = usernames.find((name) => !USERNAME.test(name));
  if (bad !== undefined) {
    return {
      error: `"${bad}" is not a valid username (3-30 characters: a-z, 0-9, underscore, hyphen).`,
    };
  }
  if (usernames.length > MAX_USERNAMES) {
    return { error: `At most ${MAX_USERNAMES} usernames per run; got ${usernames.length}.` };
  }
  return { usernames };
}

/**
 * ADMIN_PROFILE_IDS -> a clean list of lowercase profile ids. Required to apply.
 * @param {string | undefined} raw comma-separated UUIDs
 * @returns {{ ids?: string[], error?: string }}
 */
export function parseProfileIds(raw) {
  if (raw === undefined || !raw.trim()) {
    return {
      error:
        "Set ADMIN_PROFILE_IDS to the ids the dry run printed (it prints the exact line) to apply.",
    };
  }
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  const bad = ids.find((id) => !UUID.test(id));
  if (bad !== undefined) return { error: `"${bad}" in ADMIN_PROFILE_IDS is not a UUID.` };
  if (!ids.length) return { error: "ADMIN_PROFILE_IDS has no ids in it." };
  return { ids };
}

/**
 * What the run is asked to do. A typo must never turn a revoke into a grant, so
 * any value other than "1" for LIST or REVOKE is an error.
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode?: "grant" | "revoke" | "list", apply?: boolean, force?: boolean, error?: string }}
 */
export function parseMode(env) {
  const flag = (name) => {
    const value = env[name];
    if (value === undefined || value === "") return false;
    if (value === "1") return true;
    throw new Error(`${name} must be 1 or unset, got "${value}".`);
  };
  let list;
  let revoke;
  try {
    list = flag("LIST");
    revoke = flag("REVOKE");
  } catch (e) {
    return { error: e.message };
  }
  if (list && revoke) return { error: "LIST and REVOKE cannot be used together." };
  return {
    mode: list ? "list" : revoke ? "revoke" : "grant",
    apply: env.APPLY === "1",
    force: env.FORCE === "1",
  };
}

/**
 * What a run would change.
 *
 * @param {string[]} usernames lowercase names asked for
 * @param {{ id: string, username: string }[]} profiles what the exact-match lookup returned
 * @param {Iterable<string>} adminIds profile ids that are admins right now
 * @param {Iterable<string>} openClaimIds profile ids with an unused account claim
 * @param {"grant" | "revoke" | "list"} mode
 * @param {{ force?: boolean }} [options]
 * @returns {{
 *   error?: string,
 *   rows?: { username: string, id: string, action: "grant" | "already-admin" | "revoke" | "not-admin", warnings: string[] }[],
 *   remaining?: number
 * }}
 */
export function planChanges(usernames, profiles, adminIds, openClaimIds, mode, { force = false } = {}) {
  const admins = new Set(adminIds);
  const openClaims = new Set(openClaimIds);

  // Every name must be exactly one profile. All problems are reported together
  // and nothing is planned, so a half-resolved list never gets applied.
  const problems = [];
  const matched = [];
  for (const name of usernames) {
    const found = profiles.filter((p) => p.username === name);
    if (found.length === 0) problems.push(`"${name}": no profile has this username`);
    else if (found.length > 1) problems.push(`"${name}": ${found.length} profiles have this username`);
    else matched.push(found[0]);
  }
  if (problems.length) {
    return { error: `Cannot plan, nothing was changed:\n  ${problems.join("\n  ")}` };
  }

  const rows = matched.map((p) => {
    const isAdmin = admins.has(p.id);
    /** @type {"grant" | "already-admin" | "revoke" | "not-admin"} */
    let action;
    if (mode === "revoke") action = isAdmin ? "revoke" : "not-admin";
    else if (mode === "list") action = isAdmin ? "already-admin" : "not-admin";
    else action = isAdmin ? "already-admin" : "grant";

    const warnings = [];
    if (openClaims.has(p.id)) warnings.push("has an OPEN account claim (not yet claimed)");
    return { username: p.username, id: p.id, action, warnings };
  });

  // An unclaimed account is one somebody else may still be about to take over,
  // so it must never be given the admin role.
  const refused = rows.filter((r) => r.action === "grant" && r.warnings.length);
  if (refused.length) {
    return {
      error:
        `Refusing to grant admin to an account with an open claim: ${refused.map((r) => r.username).join(", ")}. ` +
        "Finish the claim, or delete its row in account_claims, first (an expired link still counts as open).",
    };
  }

  const after = new Set(admins);
  for (const r of rows) {
    if (r.action === "grant") after.add(r.id);
    if (r.action === "revoke") after.delete(r.id);
  }
  if (mode === "revoke" && after.size === 0 && admins.size > 0 && !force) {
    return {
      error:
        "This would remove the last admin, leaving nobody able to use /admin. " +
        "Grant someone else first, or set FORCE=1 if that is really intended.",
    };
  }
  return { rows, remaining: after.size };
}

/**
 * The apply step's safety catch. The dry run prints the profile ids the names
 * resolved to; applying must name exactly the same ids. If a username was
 * renamed or re-registered in between, the names now point at different
 * profiles and this refuses.
 *
 * @param {{ id: string }[]} planRows
 * @param {string[]} providedIds ADMIN_PROFILE_IDS, parsed
 * @returns {{ ok?: true, error?: string }}
 */
export function confirmApply(planRows, providedIds) {
  const planned = new Set(planRows.map((r) => r.id.toLowerCase()));
  const provided = new Set(providedIds.map((id) => id.toLowerCase()));
  const missing = [...planned].filter((id) => !provided.has(id));
  const extra = [...provided].filter((id) => !planned.has(id));
  if (missing.length || extra.length) {
    return {
      error:
        "ADMIN_PROFILE_IDS does not match the profiles these usernames resolve to right now " +
        `(missing: ${missing.join(", ") || "none"}; not in the plan: ${extra.join(", ") || "none"}). ` +
        "Run the dry run again and use the line it prints.",
    };
  }
  return { ok: true };
}

/**
 * An email reduced to its domain, for a human check that the account is the
 * person you think it is, without ever printing the address.
 * @param {string | null | undefined} email
 */
export function emailDomain(email) {
  const at = typeof email === "string" ? email.lastIndexOf("@") : -1;
  if (at < 1 || at === email.length - 1) return "(no email)";
  return `***@${email.slice(at + 1)}`;
}
