/**
 * Tells you, before a seed.mjs import, which users and playbooks in the file
 * ALREADY exist on StackHub. READ ONLY — writes nothing. Prints usernames and
 * counts, never emails.
 *
 * Why: seed.mjs overwrites the profile of a user whose email already exists
 * (a field missing from the file becomes empty), skips a playbook whose title
 * already exists for that author, and has no undo.
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/check-import-users.mjs <import.json>
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/check-import-users.mjs <import.json>");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const data = JSON.parse(readFileSync(file, "utf8"));
const users = data.users ?? [];
const playbooks = data.playbooks ?? [];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function allRows(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await supabase.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

console.log("Loading accounts…");
const idByEmail = new Map();
for (let page = 1; ; page++) {
  const { data: res, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of res.users) if (u.email) idByEmail.set(u.email.toLowerCase(), u.id);
  if (res.users.length < 200) break;
}
const profiles = await allRows("profiles", "id,username");
const profileByUsername = new Map(profiles.map((p) => [p.username.toLowerCase(), p.id]));
const posts = await allRows("posts", "author_id,slug");
const postKeys = new Set(posts.map((p) => `${p.author_id}|${p.slug}`));

const existing = [], takenByOther = [], fresh = [];
const idByUsername = new Map(); // username in the file -> existing account id, if any
for (const u of users) {
  const username = String(u.username).toLowerCase();
  const byEmail = idByEmail.get(String(u.email ?? "").toLowerCase());
  const byName = profileByUsername.get(username);
  if (byEmail) {
    existing.push({ username, sameName: byName === byEmail });
    idByUsername.set(username, byEmail);
    if (u.email) idByUsername.set(String(u.email).toLowerCase(), byEmail);
  } else if (byName) takenByOther.push(username);
  else fresh.push(username);
}

console.log(`\nUsers in the file          : ${users.length}`);
console.log(`  new (email and username free)           : ${fresh.length}`);
console.log(`  email ALREADY has an account            : ${existing.length}  -> profile would be overwritten`);
console.log(`  username taken by a DIFFERENT account   : ${takenByOther.length}  -> profile save fails`);
if (existing.length) {
  console.log("\nAlready on StackHub (profile overwritten by the import):");
  for (const e of existing) console.log(`  - @${e.username}${e.sameName ? "" : "  (the account has a different username)"}`);
}
if (takenByOther.length) {
  console.log("\nUsername taken by another account (new email):");
  for (const n of takenByOther) console.log(`  - @${n}`);
}

let dupPlaybooks = 0;
const dupList = [];
for (const p of playbooks) {
  const authorId = idByUsername.get(String(p.author).toLowerCase());
  if (authorId && postKeys.has(`${authorId}|${slugify(p.title)}`)) {
    dupPlaybooks++;
    dupList.push(`@${p.author}: ${p.title}`);
  }
}
console.log(`\nPlaybooks in the file      : ${playbooks.length}`);
console.log(`  already on StackHub (skipped, not updated): ${dupPlaybooks}`);
for (const d of dupList.slice(0, 40)) console.log(`  - ${d}`);
if (dupList.length > 40) console.log(`  … and ${dupList.length - 40} more`);

console.log(
  existing.length || takenByOther.length
    ? "\nNot all users are new: decide what to do with the ones above before importing."
    : "\nAll users are new. Safe to import."
);
