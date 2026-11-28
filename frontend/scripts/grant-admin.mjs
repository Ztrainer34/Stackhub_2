/**
 * Grants (or revokes) the admin role, which unlocks /admin (resolving and
 * rejecting tool suggestions). The role is a row in the `admins` table, checked
 * by the backend on every /admin request (RequireAdmin in routes.go).
 *
 * There is deliberately NO HTTP endpoint for this: an API that hands out admin
 * is an API that hands out the whole site. It is done here, by hand, with the
 * service-role key, and always as a two-step: a dry run, then an apply that
 * must name the exact profile ids the dry run printed.
 *
 *   # 1. Dry run. Writes nothing. Prints each profile (id, display name, created
 *   #    date, email DOMAIN only, open claim?) and the ADMIN_PROFILE_IDS line.
 *   ADMIN_USERNAMES="alice,bob" node scripts/grant-admin.mjs
 *
 *   # 2. Apply, with the ids exactly as printed. Refuses if the usernames now
 *   #    resolve to different profiles (a rename between the two steps).
 *   ADMIN_USERNAMES="alice,bob" ADMIN_PROFILE_IDS="<uuid>,<uuid>" APPLY=1 node scripts/grant-admin.mjs
 *
 *   # Revoke (same two steps). Refuses to remove the last admin unless FORCE=1.
 *   REVOKE=1 ADMIN_USERNAMES="bob" node scripts/grant-admin.mjs
 *   REVOKE=1 ADMIN_USERNAMES="bob" ADMIN_PROFILE_IDS="<uuid>" APPLY=1 node scripts/grant-admin.mjs
 *
 *   # List every admin (warns if there are fewer than 2).
 *   LIST=1 node scripts/grant-admin.mjs
 *
 * Usernames are matched EXACTLY (lowercased), never with a pattern: an
 * underscore is a wildcard in LIKE, and a near-miss must fail rather than hand
 * the role to the wrong person. A name that matches no profile, or more than
 * one, stops the whole run. An account with an open (unused) claim link is
 * refused: somebody else may be about to take it over.
 *
 * Needs migration 20261116120000_admin_role.sql. Keep at least two admins, so a
 * lost account does not lock you out.
 *
 * Recovery with no admin left: in the Supabase SQL editor run
 *   INSERT INTO public.admins (profile_id) VALUES ('<uuid>');
 *
 * A COMPROMISED admin account: revoke it here AND sign it out or ban it in
 * Supabase Auth (Authentication -> Users) and rotate its password. The role is
 * checked in the database on every request, so the revoke bites on the very
 * next one, but a live session would otherwise remain.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read from the environment only;
 * never pass the key as an argument).
 *
 * The local Supabase stack rejects service keys, so this script's database calls
 * have never been run against a real project. Only the decision logic, in
 * grant-admin-plan.mjs, is unit-tested (tests/scripts/grant-admin-plan.test.ts).
 * Its first real run is yours: read the dry run before applying.
 */
import { createClient } from "@supabase/supabase-js";
import {
  confirmApply,
  emailDomain,
  parseMode,
  parseProfileIds,
  parseUsernames,
  planChanges,
} from "./grant-admin-plan.mjs";

function die(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

/** The message of whatever was thrown. The raw error is never printed. */
function messageOf(error) {
  return String(error?.message ?? "unknown error");
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const parsedMode = parseMode(process.env);
if (parsedMode.error) die(parsedMode.error);
const { mode, apply, force } = parsedMode;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAdmins() {
  const { data, error } = await supabase
    .from("admins")
    .select("profile_id, granted_at")
    .order("granted_at");
  if (error) {
    if (/admins/.test(error.message ?? "")) {
      die("The admins table is not readable. Apply migration 20261116120000_admin_role.sql first.");
    }
    throw error;
  }
  return data;
}

async function fetchProfilesByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, created_at")
    .in("id", ids);
  if (error) throw error;
  return data;
}

/** Ids among `ids` that have an unused account-claim link. */
async function fetchOpenClaimIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("account_claims")
    .select("user_id")
    .in("user_id", ids)
    .is("claimed_at", null);
  if (error) throw error;
  return [...new Set(data.map((row) => row.user_id))];
}

/**
 * A display name is user-written. Strip control and format characters before
 * printing it, so a name cannot carry terminal escape sequences that overwrite
 * or hide the other lines of the dry run.
 */
function printable(text) {
  return String(text ?? "").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim();
}

/** "***@domain" for a profile, so a person can check it is who they think. */
async function maskedEmail(profileId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(profileId);
    if (error) return "(email lookup failed)";
    return emailDomain(data?.user?.email);
  } catch {
    return "(email lookup failed)";
  }
}

function printAdmins(admins, profiles, openClaimIds) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const admin of admins) {
    const profile = byId.get(admin.profile_id);
    const claim = openClaimIds.includes(admin.profile_id) ? "  [OPEN CLAIM]" : "";
    console.log(
      `  ${(profile?.username ?? "(unknown)").padEnd(30)} ${admin.profile_id}  since ${String(admin.granted_at).slice(0, 10)}${claim}`
    );
  }
}

async function list() {
  const admins = await fetchAdmins();
  const ids = admins.map((a) => a.profile_id);
  const [profiles, openClaims] = await Promise.all([fetchProfilesByIds(ids), fetchOpenClaimIds(ids)]);
  console.log(`\n${admins.length} admin(s):`);
  printAdmins(admins, profiles, openClaims);
  if (admins.length < 2) {
    console.log("\nWARNING: fewer than 2 admins. Add a second so a lost account does not lock you out.");
  }
}

async function run() {
  const parsedNames = parseUsernames(process.env.ADMIN_USERNAMES);
  if (parsedNames.error) die(parsedNames.error);
  const { usernames } = parsedNames;

  // Exact match on the lowercased names. Never a pattern.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, display_name, created_at")
    .in("username", usernames);
  if (profilesError) throw profilesError;

  const [admins, openClaimIds] = await Promise.all([
    fetchAdmins(),
    fetchOpenClaimIds(profiles.map((p) => p.id)),
  ]);

  const plan = planChanges(
    usernames,
    profiles,
    admins.map((a) => a.profile_id),
    openClaimIds,
    mode,
    { force }
  );
  if (plan.error) die(plan.error);

  console.log(`\n===== ${apply ? "APPLYING" : "DRY RUN"}: ${mode} admin =====`);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const row of plan.rows) {
    const profile = byId.get(row.id);
    console.log(`\n  ${row.action.toUpperCase()}  ${row.username}`);
    console.log(`    id:           ${row.id}`);
    console.log(`    display name: ${printable(profile.display_name) || "(none)"}`);
    console.log(`    created:      ${String(profile.created_at ?? "").slice(0, 10) || "(unknown)"}`);
    console.log(`    email:        ${await maskedEmail(row.id)}`);
    console.log(`    open claim:   ${openClaimIds.includes(row.id) ? "YES" : "no"}`);
    for (const warning of row.warnings) console.log(`    WARNING: ${warning}`);
  }
  console.log(`\nAdmins after this run: ${plan.remaining}`);
  if (plan.remaining < 2) {
    console.log("WARNING: fewer than 2 admins would remain. Keep a second one so a lost account does not lock you out.");
  }

  const idLine = plan.rows.map((r) => r.id).join(",");
  if (!apply) {
    console.log("\nNothing was written. Re-run with APPLY=1 and the ids you just checked:");
    console.log(`  ADMIN_PROFILE_IDS="${idLine}"`);
    return;
  }

  const parsedIds = parseProfileIds(process.env.ADMIN_PROFILE_IDS);
  if (parsedIds.error) die(parsedIds.error);
  const confirmed = confirmApply(plan.rows, parsedIds.ids);
  if (confirmed.error) die(confirmed.error);

  const toGrant = plan.rows.filter((r) => r.action === "grant").map((r) => r.id);
  const toRevoke = plan.rows.filter((r) => r.action === "revoke").map((r) => r.id);

  if (toGrant.length) {
    // ignoreDuplicates keeps the original granted_at of an existing admin.
    const { error } = await supabase
      .from("admins")
      .upsert(
        toGrant.map((profile_id) => ({ profile_id })),
        { onConflict: "profile_id", ignoreDuplicates: true }
      );
    if (error) throw error;
    console.log(`\nGranted: ${toGrant.length}`);
  }
  if (toRevoke.length) {
    const { error } = await supabase.from("admins").delete().in("profile_id", toRevoke);
    if (error) throw error;
    console.log(`\nRevoked: ${toRevoke.length}`);
  }
  if (!toGrant.length && !toRevoke.length) console.log("\nNothing to change.");

  // Read it back rather than trust the writes.
  const finalAdmins = await fetchAdmins();
  const finalIds = finalAdmins.map((a) => a.profile_id);
  const [finalProfiles, finalClaims] = await Promise.all([
    fetchProfilesByIds(finalIds),
    fetchOpenClaimIds(finalIds),
  ]);
  console.log(`\nAdmins now (${finalAdmins.length}):`);
  printAdmins(finalAdmins, finalProfiles, finalClaims);
  if (toRevoke.length) {
    console.log(
      "\nReminder: a revoked account that may be compromised must also be signed out or banned in Supabase Auth and have its password rotated."
    );
  }
}

try {
  if (mode === "list") await list();
  else await run();
} catch (error) {
  die(messageOf(error));
}
