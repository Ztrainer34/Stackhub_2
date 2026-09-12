/**
 * Lists every StackHub account with enough context to decide what to delete:
 * username, email, signup date, and how much content each one owns.
 *
 * READ ONLY — nothing is modified.
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/list-users.mjs
 */
import { createClient } from "@supabase/supabase-js";

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

/** auth.users isn't reachable through PostgREST; the admin API is. */
async function allAuthUsers() {
  const byId = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => byId.set(u.id, u));
    if (data.users.length < 200) break;
  }
  return byId;
}

console.log("Loading accounts…\n");
const profiles = await allRows("profiles", "id,username,created_at");
const authUsers = await allAuthUsers();

// Content owned by each account, so you can see what a delete would take with it.
const counts = new Map(profiles.map((p) => [p.id, { posts: 0, stack: 0, follows: 0 }]));
for (const [table, col, key] of [
  ["posts", "author_id", "posts"],
  ["stack_items", "profile_id", "stack"],
  ["user_follows", "follower_id", "follows"],
]) {
  for (const r of await allRows(table, col)) {
    const c = counts.get(r[col]);
    if (c) c[key]++;
  }
}

const rows = profiles
  .map((p) => {
    const auth = authUsers.get(p.id);
    const c = counts.get(p.id);
    return {
      username: p.username,
      email: auth?.email ?? "(no auth user)",
      created: (p.created_at || "").slice(0, 10),
      lastSignIn: (auth?.last_sign_in_at || "").slice(0, 10) || "never",
      ...c,
      id: p.id,
    };
  })
  .sort((a, b) => a.created.localeCompare(b.created));

console.log(
  "username".padEnd(20) +
    "email".padEnd(34) +
    "created".padEnd(12) +
    "last login".padEnd(12) +
    "posts".padStart(6) +
    "stack".padStart(7) +
    "follows".padStart(9)
);
console.log("-".repeat(100));
for (const r of rows) {
  console.log(
    r.username.padEnd(20) +
      r.email.padEnd(34) +
      r.created.padEnd(12) +
      r.lastSignIn.padEnd(12) +
      String(r.posts).padStart(6) +
      String(r.stack).padStart(7) +
      String(r.follows).padStart(9)
  );
}

console.log("-".repeat(100));
console.log(`${rows.length} accounts`);

// Auth users with no profile: signed in but never finished onboarding.
const orphans = [...authUsers.values()].filter((u) => !profiles.some((p) => p.id === u.id));
if (orphans.length) {
  console.log(`\n${orphans.length} auth user(s) with NO profile (abandoned onboarding):`);
  orphans.forEach((u) =>
    console.log(`  ${(u.email || "(no email)").padEnd(34)} ${u.id}  created ${(u.created_at || "").slice(0, 10)}`)
  );
}

console.log("\nIds are shown so a delete can target them precisely — tell me which to remove.");
