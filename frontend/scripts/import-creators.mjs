/**
 * Creates pre-made creator accounts from scripts/creators.json, ready to be
 * handed over later with scripts/claim-link.mjs.
 *
 * Per user it creates the auth user, the profile (username / display_name /
 * bio / location) and fills their Active Stack with whichever listed tools
 * exist in the catalog.
 *
 * Decisions baked in:
 *   - Email is a per-user alias of BASE_EMAIL, since auth.users.email is unique
 *     and the claim flow swaps in the real address later.
 *   - display_name defaults to the username.
 *   - Blank/whitespace-only location is stored as nothing.
 *   - Tools missing from the catalog are skipped silently and written to
 *     scripts/creators-missing-tools.txt so they can be added later.
 *
 * Dry run (default): reports what it would create, writes NOTHING.
 * Apply:  APPLY=1 node scripts/import-creators.mjs
 *
 *   COUNT=5 node scripts/import-creators.mjs      (default: 5)
 *   OFFSET=5 COUNT=10 ...                          (later batches)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BASE_EMAIL (optional)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const IN = process.env.IN || "scripts/creators.json";
const COUNT = parseInt(process.env.COUNT || "5", 10);
const OFFSET = parseInt(process.env.OFFSET || "0", 10);
const BASE_EMAIL = process.env.BASE_EMAIL || "123automax123@gmail.com";
const MISSING_FILE = "scripts/creators-missing-tools.txt";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** 123automax123@gmail.com + "alexvacca" -> 123automax123+alexvacca@gmail.com */
function aliasFor(username) {
  const [local, domain] = BASE_EMAIL.split("@");
  return `${local.split("+")[0]}+${username}@${domain}`;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Creator-written names that already exist in the catalog under a different
 * title. Mapped rather than created, so we don't rebuild the duplicate problem
 * ("Salesforce" vs "Salesforce Platform") that was just cleaned up.
 */
const TOOL_ALIASES = {
  salesforce: "Salesforce Platform",
  zoominfo: "ZoomInfo Sales",
  g2: "G2.com",
  serper: "Serper.dev",
  "default (routing)": "Default",
  swan: "Swan AI",
  claygent: "Clay", // Claygent is Clay's agent, not a separate product
  bigquery: "Google Cloud BigQuery",
  "google postmaster": "Google Postmaster Tools",
  jungler: "Jungler.ai",
};

async function allRows(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ---- load ----------------------------------------------------------------
const all = JSON.parse(readFileSync(IN, "utf8")).users;
const batch = all.slice(OFFSET, OFFSET + COUNT);
console.log(`${all.length} creators in file; taking ${batch.length} (offset ${OFFSET})\n`);

console.log("Loading catalog…");
const tools = await allRows("tools", "id,name");
const toolIdx = new Map();
for (const t of tools) {
  const k = norm(t.name);
  if (!toolIdx.has(k)) toolIdx.set(k, t);
}

// Keep the id, not just the name — an existing profile gets topped up rather
// than skipped, so tools added to the catalog since last time still land.
const existingByUsername = new Map(
  (await allRows("profiles", "id,username")).map((p) => [p.username.toLowerCase(), p.id])
);
console.log(`${tools.length} tools, ${existingByUsername.size} existing profiles\n`);

// ---- plan ----------------------------------------------------------------
const missingTools = new Map(); // tool name -> usernames that listed it
const plan = batch.map((u) => {
  const found = [];
  const missing = [];
  for (const name of u.stack ?? []) {
    const aliased = TOOL_ALIASES[name.trim().toLowerCase()] ?? name;
    const t = toolIdx.get(norm(aliased));
    if (t) found.push(t);
    else {
      missing.push(name);
      if (!missingTools.has(name)) missingTools.set(name, []);
      missingTools.get(name).push(u.username);
    }
  }
  return {
    username: u.username,
    email: aliasFor(u.username),
    displayName: u.username, // display_name = username, as agreed
    bio: (u.bio ?? "").trim() || null,
    location: (u.location ?? "").trim() || null, // blank stays empty
    found,
    missing,
    existingId: existingByUsername.get(u.username.toLowerCase()) ?? null,
  };
});

console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"} =====\n`);
for (const p of plan) {
  console.log(
    `  ${p.existingId ? "top-up" : "create"} ${p.username.padEnd(30)} ` +
      `stack ${p.found.length}/${p.found.length + p.missing.length}`
  );
  if (!p.existingId && p.bio) console.log(`       bio: ${p.bio}`);
  if (p.missing.length) console.log(`       still missing: ${p.missing.join(", ")}`);
}

// Missing tools are recorded across the whole file, not just this batch, so the
// list is useful for deciding what to add to the catalog later.
const allMissing = new Map();
for (const u of all) {
  for (const name of u.stack ?? []) {
    if (toolIdx.get(norm(TOOL_ALIASES[name.trim().toLowerCase()] ?? name))) continue;
    if (!allMissing.has(name)) allMissing.set(name, []);
    allMissing.get(name).push(u.username);
  }
}
const missingReport = [...allMissing.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([name, users]) => `${String(users.length).padStart(3)}x  ${name.padEnd(28)} (${users.slice(0, 6).join(", ")}${users.length > 6 ? ", …" : ""})`);
writeFileSync(
  MISSING_FILE,
  `Tools listed by creators that are NOT in the catalog\n` +
    `Sorted by how many creators use them — the top ones are worth adding first.\n` +
    `${"=".repeat(72)}\n\n` +
    missingReport.join("\n") +
    "\n"
);
console.log(`\n${allMissing.size} distinct tools missing across all ${all.length} creators -> ${MISSING_FILE}`);

if (!APPLY) {
  console.log("\nDry run only. Nothing was created. Re-run with APPLY=1.");
  process.exit(0);
}

// ---- apply ---------------------------------------------------------------
console.log("\nCreating…");

/** Adds stack tools the profile doesn't have yet, following each one. */
async function fillStack(profileId, found, label) {
  let added = 0;
  for (const t of found) {
    const { error: sErr } = await supabase
      .from("stack_items")
      .upsert({ profile_id: profileId, tool_id: t.id }, { onConflict: "profile_id,tool_id" });
    if (sErr) {
      console.error(`     stack "${t.name}": ${sErr.message}`);
      continue;
    }

    // These inserts bypass PUT /user/stack/{id}, which is where the auto-follow
    // lives — so follow here too, otherwise the account starts with an empty feed.
    const { error: fErr } = await supabase
      .from("tool_follows")
      .upsert({ profile_id: profileId, tool_id: t.id }, { onConflict: "profile_id,tool_id" });
    if (fErr) console.error(`     follow "${t.name}": ${fErr.message}`);
    added++;
  }
  console.log(`  ✓ ${label.padEnd(34)} ${added} tools`);
  return added;
}

let created = 0;
let toppedUp = 0;
for (const p of plan) {
  // Already exists (earlier batch) — leave the profile alone and just add any
  // stack tools that have since been added to the catalog.
  if (p.existingId) {
    if (p.found.length) {
      await fillStack(p.existingId, p.found, `${p.username} (top-up)`);
      toppedUp++;
    }
    continue;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: p.email,
    email_confirm: true,
    app_metadata: { onboarded: true }, // these accounts skip the onboarding flow
  });
  if (error) {
    console.error(`  ✗ ${p.username}: ${error.message}`);
    continue;
  }

  const { error: pErr } = await supabase.from("profiles").upsert(
    {
      id: data.user.id,
      username: p.username,
      display_name: p.displayName,
      bio: p.bio,
      location: p.location,
    },
    { onConflict: "id" }
  );
  if (pErr) {
    console.error(`  ✗ ${p.username} profile: ${pErr.message}`);
    continue;
  }

  await fillStack(data.user.id, p.found, p.username);
  created++;
}

console.log(`\nDone. Created ${created}, topped up ${toppedUp}, of ${plan.length}.`);
console.log(`Hand one over with:  node scripts/claim-link.mjs <username>`);
