/**
 * Seed script: creates predefined users (email; random, never-shown password), tools and playbooks
 * from a JSON file. See scripts/seed-data.example.json for the format.
 *
 * A tool name that several catalog tools share is refused unless the file pins
 * it: "tool_ids": { "Gemini": "<tool uuid>" } (top level, next to "users").
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
// --check validates the file and touches no database, so it needs no keys.
const CHECK = process.argv.includes("--check");
const DATA_PATH = process.argv.slice(2).find((a) => !a.startsWith("--")) || "scripts/seed-data.json";

if (!CHECK && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const users = data.users ?? [];
const playbooks = data.playbooks ?? [];

const supabase = CHECK
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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

// A playbook body is either a list of plain strings (one paragraph each) or a
// list of Tiptap nodes — headings, images, links, YouTube embeds — as the
// editor itself saves them. Mixing the two is not allowed.
//
// Rich bodies are checked against what the post page can render
// (app/[username]/[playbook_slug]/ContentReader.tsx). An unknown node type
// does not just look wrong there: the renderer throws, and the post page fails
// for every visitor. Links and images must be http(s).
const BLOCK_TYPES = new Set([
  "paragraph", "heading", "image", "youtube", "blockquote", "codeBlock",
  "horizontalRule", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
]);
const INLINE_TYPES = new Set(["text", "hardBreak"]);
const MARK_TYPES = new Set([
  "bold", "italic", "strike", "underline", "code", "link", "highlight", "subscript", "superscript",
]);
const isHttpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// Returns a list of problems; empty means the body is safe to store.
function bodyProblems(nodes, path = "body") {
  const problems = [];
  nodes.forEach((node, i) => {
    const at = `${path}[${i}]`;
    if (!node || typeof node !== "object") {
      problems.push(`${at}: not a node`);
      return;
    }
    if (!BLOCK_TYPES.has(node.type) && !INLINE_TYPES.has(node.type)) {
      problems.push(`${at}: unsupported node type "${node.type}"`);
    }
    if (node.type === "image" && !isHttpUrl(node.attrs?.src)) {
      problems.push(`${at}: image src must be an http(s) URL`);
    }
    if (node.type === "youtube" && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(node.attrs?.src ?? "")) {
      problems.push(`${at}: youtube src must be a youtube.com or youtu.be URL`);
    }
    for (const mark of node.marks ?? []) {
      if (!MARK_TYPES.has(mark.type)) problems.push(`${at}: unsupported mark "${mark.type}"`);
      if (mark.type === "link" && !isHttpUrl(mark.attrs?.href)) {
        problems.push(`${at}: link href must be an http(s) URL`);
      }
    }
    if (Array.isArray(node.content)) problems.push(...bodyProblems(node.content, `${at}.content`));
  });
  return problems;
}

const isRichBody = (body) => (body ?? []).some((n) => typeof n === "object");

const toDoc = (body) => {
  if (isRichBody(body)) return { type: "doc", content: body };
  return {
    type: "doc",
    content: (body ?? []).map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  };
};

// Plain text for content_text, which feeds full-text search. Mirrors the
// backend's tiptapPlainText: text joined, a blank line between blocks.
function plainText(nodes) {
  let out = "";
  const walk = (node) => {
    if (node.type === "text") out += node.text ?? "";
    if (node.type === "hardBreak") out += "\n";
    (node.content ?? []).forEach(walk);
    if (BLOCK_TYPES.has(node.type) && node.type !== "listItem") out += "\n\n";
  };
  (nodes ?? []).forEach(walk);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

const bodyText = (body) => (isRichBody(body) ? plainText(body) : (body ?? []).join("\n\n"));

// Tool names (case-insensitive) that a user puts in more than one of
// stack / watchlist / old_stack, or both in old_stack (which unfollows) and
// followed_tools (which follows). Each is a contradiction the API would never
// produce. Returns readable descriptions; empty means consistent.
function listConflicts(u) {
  const where = new Map();
  const problems = [];
  for (const [list, names] of [["stack", u.stack], ["watchlist", u.watchlist], ["old_stack", u.old_stack]]) {
    for (const name of names ?? []) {
      const key = String(name).toLowerCase();
      if (where.has(key)) problems.push(`"${name}" is in both ${where.get(key)} and ${list}`);
      else where.set(key, list);
    }
  }
  for (const name of u.followed_tools ?? []) {
    if (where.get(String(name).toLowerCase()) === "old_stack") {
      problems.push(`"${name}" is in old_stack (unfollows) and followed_tools (follows)`);
    }
  }
  return problems;
}

// A whitespace-only field ("location": " ") is stored as empty, not as a space.
const blankToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v ?? null);

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

  // 1) Users + profiles
  for (const u of users) {
    // Always random and never shown. Nobody signs in with a password — the
    // app is magic-link and Google only, and seeded accounts are handed over
    // through the claim flow — but Supabase's password grant is reachable with
    // the public anon key, so a password anyone knows is a way in. Passwords
    // used to come from the seed files, which are committed to a public repo.
    const password = genPassword();

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
        bio: blankToNull(u.bio),
        company: blankToNull(u.company),
        location: blankToNull(u.location),
        website: blankToNull(u.website),
        linkedin: blankToNull(u.linkedin),
        twitter: blankToNull(u.twitter),
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
  //
  // Some names exist more than once as different products ("Gemini" is both
  // Google's model and a crypto exchange). Picking one would silently link the
  // wrong tool, so an ambiguous name is refused unless the data file's
  // `tool_ids` map ({ "Gemini": "<tool id>" }) says which row is meant.
  // Maps, not plain objects: a tool called "Constructor" must not hit
  // Object.prototype.constructor.
  const toolCache = new Map();
  const ambiguous = new Set();
  const pinned = new Map(
    Object.entries(data.tool_ids ?? {}).map(([name, id]) => [name.toLowerCase(), id])
  );
  // ilike treats % and _ as wildcards, and PostgREST also turns * into %, with
  // no escape for it. So the pattern only narrows the candidates (\ % _ escaped,
  // * as a one-character wildcard), and the exact match is decided here.
  const pattern = (s) => String(s).replace(/[\\%_]/g, "\\$&").replace(/\*/g, "_");
  const resolveToolId = async (name) => {
    const key = String(name).toLowerCase();
    if (toolCache.has(key)) return toolCache.get(key);
    if (pinned.has(key)) {
      const { data: row, error } = await supabase.from("tools").select("id,name").eq("id", pinned.get(key)).maybeSingle();
      if (error && !/uuid/i.test(error.message)) throw new Error(`looking up tool_ids["${name}"]: ${error.message}`);
      if (!row) console.error(`    ✗ tool_ids["${name}"] = ${pinned.get(key)} is not a tool`);
      else if (row.name.toLowerCase() !== key) console.log(`    • tool_ids["${name}"] links "${row.name}"`);
      toolCache.set(key, row?.id ?? null);
      return toolCache.get(key);
    }
    const { data: rows, error } = await supabase.from("tools").select("id,name").ilike("name", pattern(name)).limit(50);
    // A failed request is not "no such tool": stop rather than cache a miss.
    if (error) throw new Error(`looking up tool "${name}": ${error.message}`);
    const exact = (rows ?? []).filter((r) => r.name.toLowerCase() === key);
    if (exact.length > 1) {
      ambiguous.add(key);
      console.error(`    ✗ "${name}" is the name of several tools — add it to tool_ids in the data file to pick one`);
      toolCache.set(key, null);
      return null;
    }
    toolCache.set(key, exact[0]?.id ?? null);
    return toolCache.get(key);
  };
  const notFound = (name) => (ambiguous.has(String(name).toLowerCase()) ? "ambiguous tool" : "unknown tool");

  for (const u of users) {
    const userId = usernameToId[String(u.username).toLowerCase()];
    if (!userId) continue;

    // Same rules as the API (backend/cmd/server/stacks.go), since these are
    // direct inserts that bypass it:
    //   - a tool sits in at most ONE of stack / watchlist / old stack, so
    //     adding it to one removes it from the other two;
    //   - stack and watchlist ("Saved for later") follow the tool;
    //   - old stack unfollows it (you stopped using it).
    // A tool named in two lists is refused (see listConflicts) rather than
    // landing wherever the last write happened to put it.
    const conflicts = listConflicts(u);
    if (conflicts.length > 0) {
      console.error(`  ✗ tool lists for ${u.username}: ${conflicts.join("; ")} — lists skipped`);
      continue;
    }

    const LISTS = ["stack_items", "watchlist_items", "old_stack_items"];
    const placements = [
      ["stack_items", u.stack, "follow"],
      ["watchlist_items", u.watchlist, "follow"],
      ["old_stack_items", u.old_stack, "unfollow"],
    ];

    for (const [table, names, follow] of placements) {
      for (const name of names ?? []) {
        const toolId = await resolveToolId(name);
        if (!toolId) {
          console.error(`    ✗ ${table} for ${u.username}: ${notFound(name)} ${name}`);
          continue;
        }
        const row = { profile_id: userId, tool_id: toolId };
        for (const other of LISTS.filter((t) => t !== table)) {
          await supabase.from(other).delete().match(row);
        }
        const { error } = await supabase
          .from(table)
          .upsert(row, { onConflict: "profile_id,tool_id" });
        if (error) console.error(`    ✗ ${table} for ${u.username}:`, error.message);

        const { error: fErr } =
          follow === "follow"
            ? await supabase.from("tool_follows").upsert(row, { onConflict: "profile_id,tool_id" })
            : await supabase.from("tool_follows").delete().match(row);
        if (fErr) console.error(`    ✗ tool_follows for ${u.username}:`, fErr.message);
      }
    }

    // Follow-only: tools the user follows without having them in any list.
    for (const name of u.followed_tools ?? []) {
      const toolId = await resolveToolId(name);
      if (!toolId) {
        console.error(`    ✗ tool_follows for ${u.username}: ${notFound(name)} ${name}`);
        continue;
      }
      const { error } = await supabase
        .from("tool_follows")
        .upsert({ profile_id: userId, tool_id: toolId }, { onConflict: "profile_id,tool_id" });
      if (error) console.error(`    ✗ tool_follows for ${u.username}:`, error.message);
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

    if (isRichBody(p.body)) {
      const problems = bodyProblems(p.body);
      if (problems.length > 0) {
        console.error(`  ✗ playbook "${p.title}": body cannot be rendered, skipped\n      ${problems.join("\n      ")}`);
        continue;
      }
    }
    const doc = toDoc(p.body);
    const text = bodyText(p.body);

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
        // The feed requires is_published AND last_publish IS NOT NULL — a post
        // with only the flag set is invisible in every feed. The publish
        // endpoint sets this; inserting directly has to do it too.
        last_publish: (p.published ?? true) ? new Date().toISOString() : null,
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
        console.error(`    ✗ playbook "${p.title}" references ${notFound(tn)} ${tn}`);
        continue;
      }
      await supabase
        .from("post_tools")
        .upsert({ post_id: post.id, tool_id: toolId }, { onConflict: "post_id,tool_id" });
    }
  }

  console.log("\nDone.");
}

// Dry run: what would be imported, and whether every body can be rendered.
// Tool names are listed but not looked up — that needs the database.
function check() {
  let failures = 0;
  for (const [name, id] of Object.entries(data.tool_ids ?? {})) {
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
    if (!ok) failures++;
    console.log(`${ok ? "ok " : "✗  "} tool_ids["${name}"] = ${id}${ok ? "" : " — must be a tool's uuid"}`);
  }
  for (const u of users) {
    const username = String(u.username ?? "").toLowerCase();
    const ok = /^[a-z0-9_-]{3,30}$/.test(username);
    if (!ok) failures++;
    console.log(`${ok ? "ok " : "✗  "} user @${username}${ok ? "" : " — username must match ^[a-z0-9_-]{3,30}$"}`);

    const conflicts = listConflicts(u);
    if (conflicts.length) failures++;
    const count = (names) => (names ?? []).length;
    console.log(
      `${conflicts.length ? "✗  " : "ok "}   lists: stack ${count(u.stack)}, saved for later ${count(u.watchlist)}, ` +
        `old stack ${count(u.old_stack)}, followed ${count(u.followed_tools)}`
    );
    for (const c of conflicts) console.log(`      ${c}`);
  }
  for (const p of playbooks) {
    const problems = isRichBody(p.body) ? bodyProblems(p.body) : [];
    if (problems.length) failures++;
    const words = bodyText(p.body).split(/\s+/).filter(Boolean).length;
    console.log(`${problems.length ? "✗  " : "ok "} "${p.title}" by @${p.author} — ${isRichBody(p.body) ? "rich" : "plain"} body, ${words} words, tools: ${(p.tools ?? []).join(", ") || "none"}`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
  console.log(
    failures
      ? `\n${failures} problem(s) — fix before importing.`
      : "\nAll good. Tool names are checked against the catalog during the real run."
  );
  process.exit(failures ? 1 : 0);
}

if (CHECK) check();

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
