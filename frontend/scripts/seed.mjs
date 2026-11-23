/**
 * Imports users (email; random, never-shown password) and playbooks from a
 * JSON file. See scripts/seed-data.example.json for the format.
 *
 *   node scripts/seed.mjs --check <file>          validate the file, no keys, no database
 *   node scripts/seed.mjs <file>                  DRY RUN: reads the database, writes nothing
 *   APPLY=1 node scripts/seed.mjs <file>          import
 *
 * Users, matched against existing accounts by email AND username:
 *   - neither exists            -> created (account + profile + tool lists)
 *   - both match ONE account    -> existing: profile and tool lists left exactly
 *                                  as they are; the file's playbooks are added
 *   - only the email exists, or only the username (on another account)
 *                               -> skipped, with their playbooks, and reported
 * Playbooks: an author + title already on StackHub is skipped, never updated.
 * Nothing is ever deleted, except a login this same run just created whose
 * profile then could not be saved (so no account is left without a profile).
 *
 * A tool name that several catalog tools share is refused unless the file pins
 * it: "tool_ids": { "Gemini": "<tool uuid>" } (top level, next to "users").
 * Tools are never created: an unknown name is reported and that link skipped.
 *
 * Users are created through the Supabase Admin API (they need a real auth.users
 * row for login), then their profile / tools / posts are inserted directly.
 * The service-role key bypasses RLS. Run from the `frontend` folder:
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
const APPLY = process.env.APPLY === "1";
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

const lc = (s) => String(s ?? "").trim().toLowerCase();

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// A playbook body is either a list of plain strings (one paragraph each) or a
// list of Tiptap nodes — headings, images, links, YouTube embeds, tables — as
// the editor itself saves them. Mixing the two is not allowed.
//
// Rich bodies are checked against what the post page can render
// (app/[username]/[playbook_slug]/ContentReader.tsx). An unknown node type
// does not just look wrong there: the renderer throws, and the post page fails
// for every visitor. Links and images must be http(s).
const BLOCK_TYPES = new Set([
  "paragraph", "heading", "image", "youtube", "blockquote", "codeBlock",
  "horizontalRule", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
  // Tables: the editor and ContentReader both load lib/tiptap-table.ts.
  "table", "tableRow", "tableHeader", "tableCell",
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

// Problems that make the whole file unsafe to import. One email = one account:
// users sharing an email would be merged into a single account, and users
// sharing a username cannot both exist.
function fileProblems() {
  const problems = [];
  const byEmail = new Map();
  const byName = new Map();
  for (const u of users) {
    const username = lc(u.username);
    const email = lc(u.email);
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) problems.push(`user @${username}: username must match ^[a-z0-9_-]{3,30}$`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push(`user @${username} has no valid email`);
    else byEmail.set(email, [...(byEmail.get(email) ?? []), username]);
    byName.set(username, (byName.get(username) ?? 0) + 1);
  }
  for (const [, names] of byEmail)
    if (names.length > 1)
      problems.push(`${names.length} users share one email (${names.slice(0, 3).map((n) => "@" + n).join(", ")}…) — each user needs their own email`);
  for (const [name, n] of byName) if (n > 1) problems.push(`username @${name} appears ${n} times`);
  return problems;
}

// A whitespace-only field ("location": " ") is stored as empty, not as a space.
const blankToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v ?? null);

const genPassword = () => randomBytes(9).toString("base64url") + "A1!";

async function allRows(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await supabase.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`reading ${table}: ${error.message}`);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadAccounts() {
  const idByEmail = new Map();
  for (let page = 1; ; page++) {
    const { data: res, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listing accounts: ${error.message}`);
    for (const u of res.users) if (u.email) idByEmail.set(u.email.toLowerCase(), u.id);
    if (res.users.length < 200) break;
  }
  const profiles = await allRows("profiles", "id,username");
  return {
    idByEmail,
    idByUsername: new Map(profiles.map((p) => [p.username.toLowerCase(), p.id])),
    usernameById: new Map(profiles.map((p) => [p.id, p.username])),
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function main() {
  const problems = fileProblems();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`\n${problems.length} problem(s) in the file. Nothing was written. Run --check for details.`);
    process.exit(1);
  }

  console.log(`===== ${APPLY ? "IMPORTING" : "DRY RUN (nothing is written)"}: ${DATA_PATH} =====\n`);
  console.log("Loading accounts…");
  const { idByEmail, idByUsername, usernameById } = await loadAccounts();

  // ---- 1. Decide what happens to each user --------------------------------
  const plan = users.map((u) => {
    const username = lc(u.username);
    const email = lc(u.email);
    const emailId = idByEmail.get(email);
    const nameId = idByUsername.get(username);
    if (emailId && nameId === emailId) return { u, username, email, status: "existing", id: emailId };
    if (emailId) {
      const theirs = usernameById.get(emailId);
      return { u, username, email, status: "skipped",
        reason: `email already belongs to ${theirs ? "@" + theirs : "an account with no profile"}` };
    }
    if (nameId) return { u, username, email, status: "skipped", reason: "username taken by another account" };
    return { u, username, email, status: "new", id: null };
  });
  const authorOf = new Map();
  for (const e of plan) {
    authorOf.set(e.username, e);
    authorOf.set(e.email, e);
  }

  // ---- Tool lookup (read-only) --------------------------------------------
  // Tools are LOOKUP-ONLY: never created, so imported content always links to
  // real catalog tools. Some names exist more than once as different products
  // ("Gemini" is both Google's model and a crypto exchange); an ambiguous name
  // is refused unless the file's `tool_ids` map says which row is meant.
  // Maps, not plain objects: a tool called "Constructor" must not hit
  // Object.prototype.constructor.
  const toolCache = new Map();
  const ambiguous = new Set();
  const hiddenLinked = new Set();
  const pinned = new Map(Object.entries(data.tool_ids ?? {}).map(([name, id]) => [name.toLowerCase(), id]));
  // ilike treats % and _ as wildcards, and PostgREST also turns * into %, with
  // no escape for it. So the pattern only narrows the candidates (\ % _ escaped,
  // * as a one-character wildcard), and the exact match is decided here.
  const pattern = (s) => String(s).replace(/[\\%_]/g, "\\$&").replace(/\*/g, "_");
  const remember = (key, row) => {
    if (row?.hidden_at) hiddenLinked.add(row.name);
    toolCache.set(key, row?.id ?? null);
    return toolCache.get(key);
  };
  const resolveToolId = async (name) => {
    const key = String(name).toLowerCase();
    if (toolCache.has(key)) return toolCache.get(key);
    if (pinned.has(key)) {
      const { data: row, error } = await supabase.from("tools").select("id,name,hidden_at").eq("id", pinned.get(key)).maybeSingle();
      if (error && !/uuid/i.test(error.message)) throw new Error(`looking up tool_ids["${name}"]: ${error.message}`);
      if (!row) console.error(`    ✗ tool_ids["${name}"] = ${pinned.get(key)} is not a tool`);
      return remember(key, row);
    }
    const { data: rows, error } = await supabase.from("tools").select("id,name,hidden_at").ilike("name", pattern(name)).limit(50);
    // A failed request is not "no such tool": stop rather than cache a miss.
    if (error) throw new Error(`looking up tool "${name}": ${error.message}`);
    const exact = (rows ?? []).filter((r) => r.name.toLowerCase() === key);
    if (exact.length > 1) {
      ambiguous.add(key);
      return remember(key, null);
    }
    return remember(key, exact[0]);
  };
  const notFound = (name) => (ambiguous.has(String(name).toLowerCase()) ? "ambiguous tool" : "unknown tool");

  // ---- 2. Decide what happens to each playbook ----------------------------
  const existingPosts = new Set((await allRows("posts", "author_id,slug")).map((p) => `${p.author_id}|${p.slug}`));
  const plannedPosts = new Set();
  const pbPlan = [];
  for (const p of playbooks) {
    const entry = authorOf.get(lc(p.author));
    const slug = slugify(p.title);
    const item = { p, slug, entry, toolIds: [], missingTools: [] };
    pbPlan.push(item);
    if (!entry) { item.status = "skipped"; item.reason = `author ${p.author} is not in the file's users`; continue; }
    if (entry.status === "skipped") { item.status = "skipped"; item.reason = `author @${entry.username} is skipped`; continue; }
    const key = `${entry.username}|${slug}`;
    if (entry.id && existingPosts.has(`${entry.id}|${slug}`)) {
      item.status = "skipped"; item.reason = "already on StackHub (same author and title)"; continue;
    }
    if (plannedPosts.has(key)) {
      item.status = "skipped"; item.reason = "same author and title appear twice in the file"; continue;
    }
    if (isRichBody(p.body)) {
      const bp = bodyProblems(p.body);
      if (bp.length) { item.status = "skipped"; item.reason = `body cannot be rendered: ${bp[0]}`; continue; }
    }
    for (const tn of p.tools ?? []) {
      const id = await resolveToolId(tn);
      if (id) item.toolIds.push(id);
      else item.missingTools.push(`${notFound(tn)} ${tn}`);
    }
    plannedPosts.add(key);
    item.status = "create";
  }

  // ---- 3. Report the plan -------------------------------------------------
  const count = (list, s) => list.filter((x) => x.status === s).length;
  console.log(`\nUsers: ${users.length}`);
  console.log(`  new (will be created)                        : ${count(plan, "new")}`);
  console.log(`  existing (profile untouched, playbooks added): ${count(plan, "existing")}`);
  console.log(`  skipped                                      : ${count(plan, "skipped")}`);
  for (const e of plan) {
    if (e.status === "new") console.log(`  + @${e.username}`);
    else if (e.status === "existing") console.log(`  = @${e.username}  existing account, profile not changed`);
    else console.log(`  ✗ @${e.username}  skipped: ${e.reason}`);
  }

  console.log(`\nPlaybooks: ${playbooks.length}`);
  console.log(`  will be created: ${count(pbPlan, "create")}`);
  console.log(`  skipped        : ${count(pbPlan, "skipped")}`);
  for (const it of pbPlan) {
    if (it.status === "skipped") console.log(`  ✗ "${it.p.title}" by @${lc(it.p.author)}  skipped: ${it.reason}`);
    else {
      console.log(`  + "${it.p.title}" by @${it.entry.username}  (${it.toolIds.length} tool${it.toolIds.length === 1 ? "" : "s"})`);
      for (const m of it.missingTools) console.log(`      ✗ link skipped: ${m}`);
      if ((it.p.tools ?? []).length && !it.toolIds.length) console.log("      ! no tool at all would be linked");
    }
  }
  if (ambiguous.size) console.log(`\nAmbiguous tool names (pin them in tool_ids): ${[...ambiguous].join(", ")}`);
  if (hiddenLinked.size) console.log(`Hidden tools that would be linked (not shown in listings): ${[...hiddenLinked].join(", ")}`);

  if (!APPLY) {
    console.log("\nDry run only, nothing was written. Re-run with APPLY=1 to import.");
    return;
  }

  // ---- 4. Write -------------------------------------------------------------
  console.log("\nWriting…");
  for (const e of plan.filter((x) => x.status === "new")) {
    const { u, username } = e;
    // Always random and never shown. Nobody signs in with a password — the
    // app is magic-link and Google only, and imported accounts are handed over
    // through the claim flow — but Supabase's password grant is reachable with
    // the public anon key, so a password anyone knows is a way in.
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: e.email,
      password: genPassword(),
      email_confirm: true,
      app_metadata: { onboarded: true }, // skip the onboarding modal
    });
    if (error) {
      e.status = "failed";
      console.error(`  ✗ user @${username}: ${error.message}`);
      continue;
    }
    e.id = created.user.id;
    const { error: pErr } = await supabase.from("profiles").insert({
      id: e.id,
      username,
      display_name: u.display_name || u.username,
      bio: blankToNull(u.bio),
      company: blankToNull(u.company),
      location: blankToNull(u.location),
      website: blankToNull(u.website),
      linkedin: blankToNull(u.linkedin),
      twitter: blankToNull(u.twitter),
    });
    if (pErr) {
      // A login without a profile breaks the site for that account: remove the
      // one this run just created.
      const { error: dErr } = await supabase.auth.admin.deleteUser(e.id);
      e.status = "failed";
      console.error(`  ✗ user @${username}: profile not saved (${pErr.message})${dErr ? `; ALSO could not remove the new login: ${dErr.message}` : ", login removed again"}`);
      continue;
    }
    console.log(`  ✓ user @${username}`);
    await writeToolLists(e, resolveToolId, notFound);
  }

  for (const it of pbPlan.filter((x) => x.status === "create")) {
    const { p, slug, entry } = it;
    if (entry.status === "failed") {
      console.error(`  ✗ playbook "${p.title}": author @${entry.username} was not created`);
      continue;
    }
    const doc = toDoc(p.body);
    const text = bodyText(p.body);
    const published = p.published ?? true;
    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        author_id: entry.id,
        type: p.type || "playbook",
        name: p.title,
        slug,
        description: p.description ?? "",
        content: doc,
        content_text: text,
        draft_content: doc,
        draft_content_text: text,
        is_published: published,
        // The feed requires is_published AND last_publish IS NOT NULL — a post
        // with only the flag set is invisible in every feed. The publish
        // endpoint sets this; inserting directly has to do it too.
        last_publish: published ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ✗ playbook "${p.title}": ${error.message}`);
      continue;
    }
    for (const toolId of it.toolIds) {
      const { error: tErr } = await supabase
        .from("post_tools")
        .upsert({ post_id: post.id, tool_id: toolId }, { onConflict: "post_id,tool_id" });
      if (tErr) console.error(`    ✗ tool link for "${p.title}": ${tErr.message}`);
    }
    console.log(`  ✓ playbook "${p.title}"`);
  }

  const failed = plan.filter((x) => x.status === "failed").length;
  console.log(`\nDone.${failed ? ` ${failed} user(s) failed, see ✗ above.` : ""}`);
}

// Stack / watchlist / old stack / follows, for NEW users only. Same rules as
// the API (backend/cmd/server/stacks.go), since these are direct inserts:
//   - a tool sits in at most ONE of stack / watchlist / old stack;
//   - stack and watchlist ("Saved for later") follow the tool;
//   - old stack unfollows it (you stopped using it).
async function writeToolLists(e, resolveToolId, notFound) {
  const { u, username, id: userId } = e;
  const conflicts = listConflicts(u);
  if (conflicts.length > 0) {
    console.error(`    ✗ tool lists for @${username}: ${conflicts.join("; ")} — lists skipped`);
    return;
  }
  const placements = [
    ["stack_items", u.stack, true],
    ["watchlist_items", u.watchlist, true],
    ["old_stack_items", u.old_stack, false],
  ];
  for (const [table, names, follow] of placements) {
    for (const name of names ?? []) {
      const toolId = await resolveToolId(name);
      if (!toolId) {
        console.error(`    ✗ ${table} for @${username}: ${notFound(name)} ${name}`);
        continue;
      }
      const row = { profile_id: userId, tool_id: toolId };
      const { error } = await supabase.from(table).upsert(row, { onConflict: "profile_id,tool_id" });
      if (error) console.error(`    ✗ ${table} for @${username}:`, error.message);
      if (follow) {
        const { error: fErr } = await supabase.from("tool_follows").upsert(row, { onConflict: "profile_id,tool_id" });
        if (fErr) console.error(`    ✗ tool_follows for @${username}:`, fErr.message);
      }
    }
  }
  for (const name of u.followed_tools ?? []) {
    const toolId = await resolveToolId(name);
    if (!toolId) {
      console.error(`    ✗ tool_follows for @${username}: ${notFound(name)} ${name}`);
      continue;
    }
    const { error } = await supabase
      .from("tool_follows")
      .upsert({ profile_id: userId, tool_id: toolId }, { onConflict: "profile_id,tool_id" });
    if (error) console.error(`    ✗ tool_follows for @${username}:`, error.message);
  }
}

// --check: what would be imported, and whether every body can be rendered.
// No database, so it cannot say which users already exist or which tool names
// are unknown — the dry run does that.
function check() {
  let failures = 0;
  for (const p of fileProblems()) {
    failures++;
    console.log(`✗  ${p}`);
  }
  for (const [name, id] of Object.entries(data.tool_ids ?? {})) {
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
    if (!ok) failures++;
    console.log(`${ok ? "ok " : "✗  "} tool_ids["${name}"] = ${id}${ok ? "" : " — must be a tool's uuid"}`);
  }
  for (const u of users) {
    const conflicts = listConflicts(u);
    if (conflicts.length) failures++;
    const n = (names) => (names ?? []).length;
    console.log(
      `${conflicts.length ? "✗  " : "ok "} user @${lc(u.username)} — lists: stack ${n(u.stack)}, saved for later ${n(u.watchlist)}, ` +
        `old stack ${n(u.old_stack)}, followed ${n(u.followed_tools)}`
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
      : "\nAll good. Next: the dry run (needs the keys) shows which users already exist and which tools are unknown."
  );
  process.exit(failures ? 1 : 0);
}

if (CHECK) check();
else
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
