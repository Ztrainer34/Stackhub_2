/**
 * Grants (or revokes) edit rights on a tool page.
 *
 * Claims arrive through the Tally form behind "Claim this page" on the tool
 * page. Once you have checked the person really works at the vendor, run this.
 * There is deliberately no HTTP endpoint for it: an API that hands out page
 * ownership is an API that hands out other companies' pages.
 *
 *   node scripts/grant-tool-owner.mjs <username> "<tool name>"
 *   node scripts/grant-tool-owner.mjs --revoke <username> "<tool name>"
 *   node scripts/grant-tool-owner.mjs --list "<tool name>"
 *   node scripts/grant-tool-owner.mjs --list-user <username>
 *
 * The tool can be given by name (case-insensitive, exact) or by UUID.
 *
 * Dry run (default): reports what it would do, writes NOTHING.
 * Apply:  APPLY=1 node scripts/grant-tool-owner.mjs alice "Clay"
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage(message) {
  if (message) console.error(`\n${message}`);
  console.error(`
Usage:
  node scripts/grant-tool-owner.mjs <username> "<tool>"
  node scripts/grant-tool-owner.mjs --revoke <username> "<tool>"
  node scripts/grant-tool-owner.mjs --list "<tool>"
  node scripts/grant-tool-owner.mjs --list-user <username>
`);
  process.exit(1);
}

/** Resolves a tool by UUID or by exact (case-insensitive) name. */
async function findTool(ref) {
  if (UUID.test(ref)) {
    const { data, error } = await supabase
      .from("tools")
      .select("id,name")
      .eq("id", ref)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // ilike without wildcards is an exact, case-insensitive match — near-misses
  // should fail loudly rather than quietly hand over the wrong company's page.
  const { data, error } = await supabase
    .from("tools")
    .select("id,name")
    .ilike("name", ref)
    .limit(2);
  if (error) throw error;

  if (data.length > 1) {
    throw new Error(
      `"${ref}" matches ${data.length} tools: ${data.map((t) => t.name).join(", ")}. Use the UUID.`
    );
  }
  return data[0] ?? null;
}

async function findProfile(username) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listOwners(toolRef) {
  const tool = await findTool(toolRef);
  if (!tool) usage(`No tool matches "${toolRef}".`);

  const { data, error } = await supabase
    .from("tool_owners")
    .select("granted_at, profiles:profile_id (username, display_name)")
    .eq("tool_id", tool.id)
    .order("granted_at");
  if (error) throw error;

  console.log(`\n${tool.name}  (${tool.id})`);
  if (!data.length) {
    console.log("  no owners — the page still shows the claim call to action");
    return;
  }
  for (const row of data) {
    console.log(
      `  ${row.profiles.username.padEnd(28)} since ${row.granted_at.slice(0, 10)}`
    );
  }
}

async function listUserTools(username) {
  const profile = await findProfile(username);
  if (!profile) usage(`No profile named "${username}".`);

  const { data, error } = await supabase
    .from("tool_owners")
    .select("granted_at, tools:tool_id (name)")
    .eq("profile_id", profile.id);
  if (error) throw error;

  console.log(`\n${profile.username} owns ${data.length} tool page(s)`);
  for (const row of data) {
    console.log(`  ${row.tools.name.padEnd(36)} since ${row.granted_at.slice(0, 10)}`);
  }
}

async function setOwnership(username, toolRef, revoke) {
  const [profile, tool] = await Promise.all([
    findProfile(username),
    findTool(toolRef),
  ]);
  if (!profile) usage(`No profile named "${username}".`);
  if (!tool) usage(`No tool matches "${toolRef}".`);

  const verb = revoke ? "REVOKE" : "GRANT";
  console.log(
    `\n${APPLY ? verb : `DRY RUN — would ${verb.toLowerCase()}`}` +
      `  ${profile.username}  ->  ${tool.name}  (${tool.id})`
  );

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with APPLY=1.");
    return;
  }

  if (revoke) {
    const { error } = await supabase
      .from("tool_owners")
      .delete()
      .eq("tool_id", tool.id)
      .eq("profile_id", profile.id);
    if (error) throw error;
    console.log("Revoked.");
    return;
  }

  const { error } = await supabase
    .from("tool_owners")
    .upsert(
      { tool_id: tool.id, profile_id: profile.id },
      { onConflict: "tool_id,profile_id" }
    );
  if (error) throw error;
  console.log(`Granted. ${profile.username} can now edit ${tool.name}'s page.`);
}

const args = process.argv.slice(2);
if (!args.length) usage();

try {
  if (args[0] === "--list") {
    if (!args[1]) usage("--list needs a tool.");
    await listOwners(args[1]);
  } else if (args[0] === "--list-user") {
    if (!args[1]) usage("--list-user needs a username.");
    await listUserTools(args[1]);
  } else if (args[0] === "--revoke") {
    if (args.length < 3) usage("--revoke needs a username and a tool.");
    await setOwnership(args[1], args[2], true);
  } else {
    if (args.length < 2) usage("Needs a username and a tool.");
    await setOwnership(args[0], args[1], false);
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
