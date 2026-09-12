/**
 * Permanently deletes the accounts listed in USERNAMES.
 *
 * profiles.id REFERENCES auth.users(id) ON DELETE CASCADE, so removing the auth
 * user takes the profile with it — and the profile's own cascades take posts,
 * stack, saved-for-later, follows, stars and comments. One delete, no orphans.
 *
 * Dry run (default): prints exactly what each removal would destroy.
 * Apply:  APPLY=1 node scripts/delete-users.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/delete-users.mjs
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";

const USERNAMES = [
  "ztrainer",
  "test4",
  "test11",
  "test3",
  "test22",
  "test6",
  "Mariam",
  "test1",
  "hadi",
  "max test email123",
  "max test sign up email123",
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

console.log("Loading accounts…\n");
const profiles = await allRows("profiles", "id,username");
const wanted = new Map(USERNAMES.map((u) => [u.trim().toLowerCase(), u]));

const targets = [];
const notFound = [];
for (const [key, original] of wanted) {
  const p = profiles.find((x) => x.username.trim().toLowerCase() === key);
  if (p) targets.push(p);
  else notFound.push(original);
}

// Count what each delete would take with it.
const owned = new Map(targets.map((t) => [t.id, { posts: 0, stack: 0, saved: 0, follows: 0, stars: 0, comments: 0 }]));
for (const [table, col, key] of [
  ["posts", "author_id", "posts"],
  ["stack_items", "profile_id", "stack"],
  ["watchlist_items", "profile_id", "saved"],
  ["user_follows", "follower_id", "follows"],
  ["post_stars", "liker_id", "stars"],
  ["post_comments", "commenter_id", "comments"],
]) {
  try {
    for (const r of await allRows(table, col)) {
      const o = owned.get(r[col]);
      if (o) o[key]++;
    }
  } catch (e) {
    console.warn(`  (could not count ${table}: ${e.message})`);
  }
}

console.log(`===== ${APPLY ? "DELETING" : "DRY RUN"}: ${targets.length} accounts =====\n`);
for (const t of targets) {
  const o = owned.get(t.id);
  const extras = Object.entries(o)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  console.log(`  ${t.username.padEnd(28)} ${extras || "nothing else"}`);
}
if (notFound.length) {
  console.log(`\n  Not found (already gone or renamed): ${notFound.join(", ")}`);
}

const totalPosts = [...owned.values()].reduce((s, o) => s + o.posts, 0);
if (totalPosts) console.log(`\n  ⚠  ${totalPosts} post(s) will be permanently deleted.`);

if (!APPLY) {
  console.log("\nDry run only. Nothing was deleted. Re-run with APPLY=1 to execute.");
  process.exit(0);
}

console.log("\nDeleting…");
let done = 0;
for (const t of targets) {
  // Cascades from auth.users -> profiles -> everything the profile owns.
  const { error } = await supabase.auth.admin.deleteUser(t.id);
  if (error) {
    console.error(`  ✗ ${t.username}: ${error.message}`);
    continue;
  }
  console.log(`  ✓ ${t.username}`);
  done++;
}

console.log(`\nDone. Deleted ${done}/${targets.length} accounts.`);
