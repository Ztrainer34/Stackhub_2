/**
 * Hides every tool outside a keep-list, or brings a hidden batch back.
 * Nothing is deleted: a hidden tool keeps its posts, stacks, follows and
 * owners, and its page still loads. It only drops out of search, autocomplete,
 * the /tools and category listings, popular/recommended tools and onboarding.
 * Needs migration 20261108120000_hide_tools.sql.
 *
 * HIDE (default):
 *   keep = the ids in KEEP (default scripts/enrichment/keep-list.json)
 *        + every tool used in any post (published or draft)
 *   Every other visible tool gets hidden_at = now(), hidden_batch = BATCH.
 *
 *   node scripts/hide-tools.mjs                 dry run: counts and samples, writes nothing
 *   APPLY=1 node scripts/hide-tools.mjs         hide
 *
 * UNHIDE a whole batch:
 *   UNHIDE_BATCH=2026-11-client-curation node scripts/hide-tools.mjs            dry run
 *   UNHIDE_BATCH=2026-11-client-curation APPLY=1 node scripts/hide-tools.mjs    restore
 *
 * UNHIDE named tools (exact names, case-insensitive, comma-separated):
 *   UNHIDE_NAMES="Notion,Salesforce Maps" node scripts/hide-tools.mjs            dry run
 *   UNHIDE_NAMES="Notion,Salesforce Maps" APPLY=1 node scripts/hide-tools.mjs    restore
 *
 * Approving a suggestion in /admin never un-hides a tool: /admin has no role
 * check, so un-hiding is only ever done here, with the service-role key.
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/hide-tools.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const KEEP = process.env.KEEP || "scripts/enrichment/keep-list.json";
const BATCH = process.env.BATCH || "2026-11-client-curation";
const UNHIDE_BATCH = process.env.UNHIDE_BATCH;
// UNHIDE_BATCH=$LABEL with $LABEL unset arrives as "", which must not fall
// through to a HIDE run.
if (UNHIDE_BATCH !== undefined && !UNHIDE_BATCH.trim()) {
  console.error("UNHIDE_BATCH is set but empty. Give the batch label to restore, e.g. UNHIDE_BATCH=2026-11-client-curation.");
  process.exit(1);
}
const UNHIDE_NAMES = process.env.UNHIDE_NAMES;
if (UNHIDE_NAMES !== undefined && !UNHIDE_NAMES.split(",").some((n) => n.trim())) {
  console.error('UNHIDE_NAMES is set but empty. Give tool names, e.g. UNHIDE_NAMES="Notion,Salesforce Maps".');
  process.exit(1);
}
if (UNHIDE_BATCH !== undefined && UNHIDE_NAMES !== undefined) {
  console.error("Set UNHIDE_BATCH or UNHIDE_NAMES, not both.");
  process.exit(1);
}
const CHUNK = 200;
// An empty or truncated keep-list would hide the whole catalogue: refuse a
// keep-list smaller than 5% of it (the client's list is ~7%).
const MIN_KEEP_SHARE = 0.05;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pages need a stable order, or rows can repeat or go missing between pages.
async function allRows(table, cols, orderBy) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols);
    for (const col of orderBy) q = q.order(col);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));
const sample = (rows) => rows.slice(0, 15).map((t) => t.name).join(", ") + (rows.length > 15 ? `, … (+${rows.length - 15})` : "");

let tools;
try {
  tools = await allRows("tools", "id,name,hidden_at,hidden_batch", ["id"]);
} catch (e) {
  if (/hidden_at/.test(e.message ?? "")) {
    console.error("tools.hidden_at does not exist — apply migration 20261108120000_hide_tools.sql first.");
    process.exit(1);
  }
  throw e;
}

// ---------------------------------------------------------------- UNHIDE
if (UNHIDE_BATCH || UNHIDE_NAMES) {
  let rows;
  if (UNHIDE_BATCH) {
    rows = tools.filter((t) => t.hidden_batch === UNHIDE_BATCH);
    console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: unhide batch "${UNHIDE_BATCH}" =====`);
    console.log(`Tools in batch: ${rows.length}${rows.length ? `  (${sample(rows)})` : ""}`);
  } else {
    const wanted = [...new Set(UNHIDE_NAMES.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean))];
    const byName = (n) => tools.filter((t) => t.name.trim().toLowerCase() === n);
    const unknown = wanted.filter((n) => !byName(n).length);
    if (unknown.length) {
      console.error(`No tool named: ${unknown.join(", ")}. Nothing was changed.`);
      process.exit(1);
    }
    const visible = wanted.filter((n) => byName(n).every((t) => !t.hidden_at));
    rows = wanted.flatMap(byName).filter((t) => t.hidden_at);
    console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: unhide ${wanted.length} name(s) =====`);
    console.log(`Hidden tools to show: ${rows.length}${rows.length ? `  (${rows.map((t) => `${t.name} [${t.hidden_batch ?? "no batch"}]`).join(", ")})` : ""}`);
    if (visible.length) console.log(`Already visible: ${visible.join(", ")}`);
  }
  if (!APPLY || !rows.length) {
    if (!APPLY) console.log("\nDry run only. Re-run with APPLY=1 to make them visible.");
    process.exit(0);
  }
  let done = 0;
  for (const part of chunks(rows.map((t) => t.id))) {
    let q = supabase.from("tools").update({ hidden_at: null, hidden_batch: null }, { count: "exact" }).in("id", part);
    q = UNHIDE_BATCH ? q.eq("hidden_batch", UNHIDE_BATCH) : q.not("hidden_at", "is", null);
    const { error, count } = await q;
    if (error) { console.error(`  chunk failed: ${error.message}`); process.exit(1); }
    done += count ?? 0;
    process.stdout.write(`\r  visible again: ${done}/${rows.length}`);
  }
  console.log("\nDone.");
  process.exit(0);
}

// ------------------------------------------------------------------ HIDE
const byId = new Map(tools.map((t) => [t.id, t]));
const keepList = JSON.parse(readFileSync(KEEP, "utf8"));
const stale = [];
const keep = new Set();
for (const k of keepList) {
  const t = byId.get(k.id);
  // The id is what is kept; the name is what a person reviewed.
  if (!t || t.name.trim().toLowerCase() !== String(k.name).trim().toLowerCase()) stale.push(`${k.name} (${k.id})${t ? ` is now "${t.name}"` : " not found"}`);
  else keep.add(k.id);
}
if (stale.length) {
  console.error(`${stale.length} keep-list entr${stale.length === 1 ? "y does" : "ies do"} not match the catalogue — rebuild the keep-list from a fresh export:\n  ${stale.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}
const minKeep = Math.max(1, Math.ceil(tools.length * MIN_KEEP_SHARE));
if (keep.size < minKeep) {
  console.error(`Keep-list has only ${keep.size} tools (minimum ${minKeep}, 5% of the catalogue). Refusing: this would hide almost everything.`);
  process.exit(1);
}

const postTools = await allRows("post_tools", "post_id,tool_id", ["post_id", "tool_id"]);
const published = new Set((await allRows("posts", "id,is_published", ["id"])).filter((p) => p.is_published).map((p) => p.id));
const fromPosts = new Set(postTools.map((r) => r.tool_id).filter((id) => byId.has(id)));
const fromPublished = new Set(postTools.filter((r) => published.has(r.post_id)).map((r) => r.tool_id));
const addedByPosts = [...fromPosts].filter((id) => !keep.has(id)).map((id) => byId.get(id));
// Any signed-in user can create drafts, so tools kept ONLY because of a draft
// are listed on their own line for the operator to check before applying.
const draftOnly = addedByPosts.filter((t) => !fromPublished.has(t.id));
for (const id of fromPosts) keep.add(id);

const toHide = tools.filter((t) => !keep.has(t.id) && !t.hidden_at);
const alreadyHidden = tools.filter((t) => !keep.has(t.id) && t.hidden_at);
const keptButHidden = tools.filter((t) => keep.has(t.id) && t.hidden_at);

console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: hide batch "${BATCH}" =====`);
console.log(`Catalogue                 : ${tools.length}`);
console.log(`Keep-list                 : ${keepList.length} entries → ${keep.size - addedByPosts.length} tools`);
console.log(`+ used in posts           : ${addedByPosts.length}${addedByPosts.length ? `  (${sample(addedByPosts)})` : ""}`);
if (draftOnly.length) console.log(`  of which ONLY in drafts : ${draftOnly.length}  (${draftOnly.map((t) => t.name).join(", ")})  ← check these: anyone can create a draft`);
console.log(`= stays visible           : ${keep.size}`);
console.log(`To hide now               : ${toHide.length}${toHide.length ? `  (${sample(toHide)})` : ""}`);
if (alreadyHidden.length) console.log(`Already hidden (untouched): ${alreadyHidden.length}`);
if (keptButHidden.length) console.log(`⚠ On the keep side but hidden: ${keptButHidden.length} (${sample(keptButHidden)}) — not changed here; unhide them separately.`);

if (!APPLY) {
  console.log("\nDry run only. Re-run with APPLY=1 to hide.");
  process.exit(0);
}

// A record of exactly what this run hid, next to the keep-list.
mkdirSync("scripts/enrichment", { recursive: true });
const record = `scripts/enrichment/hidden-${BATCH}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(record, JSON.stringify(toHide.map((t) => ({ id: t.id, name: t.name })), null, 2) + "\n");

const now = new Date().toISOString();
let done = 0;
for (const part of chunks(toHide.map((t) => t.id))) {
  const { error, count } = await supabase
    .from("tools").update({ hidden_at: now, hidden_batch: BATCH }, { count: "exact" })
    .in("id", part).is("hidden_at", null);
  if (error) {
    console.error(`\n  chunk failed after ${done} tools: ${error.message}\n  Re-running is safe: hidden tools are skipped.`);
    process.exit(1);
  }
  done += count ?? 0;
  process.stdout.write(`\r  hidden: ${done}/${toHide.length}`);
}
console.log(`\nDone. Record of what was hidden: ${record}`);
console.log(`To undo: UNHIDE_BATCH=${BATCH} APPLY=1 node scripts/hide-tools.mjs`);
