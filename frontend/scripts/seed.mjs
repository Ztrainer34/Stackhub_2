/**
 * Seed script: creates predefined users (email + password), tools and playbooks
 * from a JSON file. See scripts/seed-data.example.json for the format.
 *
 * Users are created through the Supabase Admin API (they need a real auth.users
 * row for login), then their profile / tools / posts are inserted directly.
 * The service-role key bypasses RLS.
 *
 * Run from the `frontend` folder (it already has @supabase/supabase-js):
 *
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
 *   node scripts/seed.mjs scripts/seed-data.json
 *
 * The service-role key is in Supabase → Project Settings → API → service_role.
 * NEVER commit it or expose it to the browser.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_PATH = process.argv[2] || "scripts/seed-data.json";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const users = data.users ?? [];
const playbooks = data.playbooks ?? [];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Minimal Tiptap/ProseMirror doc the editor and viewer understand.
const toDoc = (paragraphs) => ({
  type: "doc",
  content: (paragraphs ?? []).map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  })),
});

const genPassword = () => randomBytes(9).toString("base64url") + "A1!";

async function findUserIdByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  const usernameToId = {};
  const emailToId = {};
  const generatedCreds = [];

  // 1) Users + profiles
  for (const u of users) {
    const password = u.password || genPassword();
    if (!u.password) generatedCreds.push({ email: u.email, password });

    let userId;
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      app_metadata: { onboarded: true }, // skip the onboarding modal
    });

    if (error) {
      userId = await findUserIdByEmail(u.email); // likely already exists
      if (!userId) {
        console.error(`  ✗ user ${u.email}:`, error.message);
        continue;
      }
      console.log(`  • user ${u.email} already exists, reusing`);
    } else {
      userId = data.user.id;
      console.log(`  ✓ created user ${u.email}`);
    }

    const username = String(u.username).toLowerCase();
    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        username,
        display_name: u.display_name || u.username,
        bio: u.bio ?? null,
        company: u.company ?? null,
        location: u.location ?? null,
        website: u.website ?? null,
        linkedin: u.linkedin ?? null,
        twitter: u.twitter ?? null,
      },
      { onConflict: "id" }
    );
    if (pErr) console.error(`  ✗ profile ${username}:`, pErr.message);

    usernameToId[username] = userId;
    if (u.email) emailToId[u.email.toLowerCase()] = userId;
  }

  // Tools are LOOKUP-ONLY: we never create them, so seeded content always links
  // to the real catalog tools (with vendor info). If a name isn't found it's
  // reported and skipped. Cache lookups to avoid repeat queries.
  const toolCache = {};
  const resolveToolId = async (name) => {
    const key = String(name).toLowerCase();
    if (key in toolCache) return toolCache[key];
    const { data } = await supabase
      .from("tools")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    toolCache[key] = data?.id ?? null;
    return toolCache[key];
  };

  for (const u of users) {
    const userId = usernameToId[String(u.username).toLowerCase()];
    if (!userId) continue;

    const lists = [
      ["stack_items", u.stack],
      ["watchlist_items", u.watchlist],
      ["tool_follows", u.followed_tools],
    ];

    for (const [table, names] of lists) {
      for (const name of names ?? []) {
        const toolId = await resolveToolId(name);
        if (!toolId) {
          console.error(`    ✗ ${table} for ${u.username}: unknown tool ${name}`);
          continue;
        }
        const { error } = await supabase
          .from(table)
          .upsert(
            { profile_id: userId, tool_id: toolId },
            { onConflict: "profile_id,tool_id" }
          );
        if (error) console.error(`    ✗ ${table} for ${u.username}:`, error.message);
      }
    }
    console.log(`  ✓ tool lists for ${u.username}`);
  }

  // 3) Playbooks (posts) + post_tools
  for (const p of playbooks) {
    const key = String(p.author).toLowerCase();
    const authorId = usernameToId[key] || emailToId[key];
    if (!authorId) {
      console.error(`  ✗ playbook "${p.title}": unknown author ${p.author}`);
      continue;
    }
    const slug = slugify(p.title);

    // Skip if this author already has a post with the same slug (re-run safe).
    const { data: existingPost } = await supabase
      .from("posts")
      .select("id")
      .eq("author_id", authorId)
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (existingPost) {
      console.log(`  • playbook "${p.title}" already exists`);
      continue;
    }

    const doc = toDoc(p.body);
    const text = (p.body ?? []).join("\n\n");

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        author_id: authorId,
        type: p.type || "playbook",
        name: p.title,
        slug,
        description: p.description ?? "",
        content: doc,
        content_text: text,
        draft_content: doc,
        draft_content_text: text,
        is_published: p.published ?? true,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ✗ playbook "${p.title}":`, error.message);
      continue;
    }
    console.log(`  ✓ playbook "${p.title}"`);

    for (const tn of p.tools ?? []) {
      const toolId = await resolveToolId(tn);
      if (!toolId) {
        console.error(`    ✗ playbook "${p.title}" references unknown tool ${tn}`);
        continue;
      }
      await supabase
        .from("post_tools")
        .upsert({ post_id: post.id, tool_id: toolId }, { onConflict: "post_id,tool_id" });
    }
  }

  if (generatedCreds.length > 0) {
    console.log("\nGenerated passwords (share securely):");
    for (const c of generatedCreds) console.log(`  ${c.email}  →  ${c.password}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
