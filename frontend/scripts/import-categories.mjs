/**
 * Imports the two-level category structure, and each tool's categories.
 * Needs migration 20261123120000_category_structure.sql and the backend that
 * goes with it. Never reads or writes a playbook's content or its tools.
 *
 *   node scripts/import-categories.mjs               dry run: reads, writes nothing
 *   APPLY=1 node scripts/import-categories.mjs       import
 *   UNDO=<backup.json> node scripts/import-categories.mjs            dry run of the undo
 *   UNDO=<backup.json> APPLY=1 node scripts/import-categories.mjs    put it back
 *   HIDE=1 node scripts/import-categories.mjs        dry run: the file's "hide" list
 *   HIDE=1 APPLY=1 node scripts/import-categories.mjs
 *
 * What an import does:
 *   1. creates the parents and subcategories, reusing (and renaming) a category
 *      that already has that name;
 *   2. replaces the categories of the tools in the file. A tool hidden, renamed or
 *      edited on the site since the file was made is left alone and reported;
 *   3. retires every other category: it can no longer be picked, and its page
 *      redirects. Its row stays, because hidden tools still use it.
 * A backup is saved before the first write. Re-running is safe: what is already
 * done is skipped. If a run stopped halfway and was continued, undo with the FIRST
 * backup: it covers the whole import.
 *
 * HIDE hides the listed tools, except any used in a post (published or draft).
 * To undo: UNHIDE_BATCH=2026-11-category-cleanup node scripts/hide-tools.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/import-categories.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fileProblems, planCategories, planHide, planRetire, planTools } from "./import-categories-plan.mjs";

const APPLY = process.env.APPLY === "1";
const HIDE = process.env.HIDE === "1";
const UNDO = process.env.UNDO;
const IN = process.env.CATEGORY_FILE || "scripts/enrichment/category-import-2026-11-23.json";
const HIDE_BATCH = "2026-11-category-cleanup";
const CHUNK = 100;
let backup = null;

if (UNDO !== undefined && !UNDO.trim()) {
  console.error("UNDO is set but empty. Give the backup file to restore.");
  process.exit(1);
}
if (UNDO && HIDE) {
  console.error("Set UNDO or HIDE, not both.");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CATEGORY_COLS = "id,name,slug,parent_id,sort_order,retired_at,replaced_by";
const LINK_COLS = "tool_id,category_id,position";

// Pages need a stable order, or rows can repeat or go missing between pages.
async function allRows(table, cols, orderBy) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols);
    for (const col of orderBy) q = q.order(col);
    const { data, error } = await q.range(from, from + 999);
    if (error) {
      if (/parent_id|retired_at|position/.test(error.message ?? "")) {
        console.error("The new columns do not exist: apply migration 20261123120000_category_structure.sql first.");
        process.exit(1);
      }
      throw new Error(`reading ${table}: ${error.message}`);
    }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const readCategories = () => allRows("categories", CATEGORY_COLS, ["id"]);
const readLinks = () => allRows("tool_categories", LINK_COLS, ["tool_id", "category_id"]);

// Stops at the first failed write: re-running continues, the backup undoes.
async function must(what, request) {
  const { data, error } = await request;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
const chunks = (arr, n = CHUNK) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
const list = (rows, n = 25) => rows.slice(0, n).map((r) => r.name).join(", ") + (rows.length > n ? `, … (+${rows.length - n})` : "");
const heading = (what) => console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN (nothing is written)"}: ${what} =====\n`);

/** Makes each tool's links exactly `wanted`. Adds first, so no tool is ever left empty by a failure. */
async function writeLinks(wanted, currentLinks) {
  const rows = wanted.flatMap((w) => w.links.map((l) => ({ tool_id: w.id, category_id: l.category_id, position: l.position })));
  for (const part of chunks(rows, 500))
    await must("saving tool categories", supabase.from("tool_categories").upsert(part, { onConflict: "tool_id,category_id" }));
  const keep = new Map(wanted.map((w) => [w.id, new Set(w.links.map((l) => l.category_id))]));
  // Grouped by category, so a whole group is one request.
  const extra = new Map();
  for (const l of currentLinks)
    if (keep.has(l.tool_id) && !keep.get(l.tool_id).has(l.category_id)) extra.set(l.category_id, [...(extra.get(l.category_id) ?? []), l.tool_id]);
  let done = 0;
  for (const [categoryId, toolIds] of extra) {
    for (const part of chunks(toolIds))
      await must("removing old tool categories", supabase.from("tool_categories").delete().eq("category_id", categoryId).in("tool_id", part));
    process.stdout.write(`\r  old categories removed from tools: ${++done}/${extra.size}`);
  }
  if (extra.size) console.log("");
}

// --------------------------------------------------------------------- UNDO
async function undo() {
  const backup = JSON.parse(readFileSync(UNDO, "utf8"));
  if (!backup.categories?.length || !Array.isArray(backup.links) || !backup.tool_ids) {
    console.error("That file is not a backup made by this script.");
    process.exit(1);
  }
  heading(`undo from ${UNDO}`);
  const now = await readCategories();
  const links = await readLinks();
  const before = new Map(backup.categories.map((c) => [c.id, c]));
  const created = now.filter((c) => !before.has(c.id));
  const changed = now.filter((c) => before.has(c.id) && ["name", "slug", "parent_id", "sort_order", "retired_at", "replaced_by"].some((k) => c[k] !== before.get(c.id)[k]));
  const toolIds = new Set(backup.tool_ids);
  console.log(`Categories put back as they were : ${changed.length}`);
  console.log(`Categories created by the import : ${created.length} (kept but retired, nothing is deleted)`);
  console.log(`Tools whose categories go back   : ${toolIds.size}, including any edited since`);
  if (!APPLY) return console.log("\nDry run only. Re-run with APPLY=1 to undo.");

  const wanted = new Map(backup.tool_ids.map((id) => [id, { id, links: [] }]));
  for (const l of backup.links) wanted.get(l.tool_id)?.links.push(l);
  for (const c of changed) {
    const { id, ...row } = before.get(c.id);
    await must(`restoring category ${c.name}`, supabase.from("categories").update(row).eq("id", id));
  }
  await writeLinks([...wanted.values()], links);
  for (const part of chunks(created.map((c) => c.id)))
    await must("retiring created categories", supabase.from("categories").update({ retired_at: new Date().toISOString(), parent_id: null, replaced_by: null }).in("id", part));
  console.log("\nDone.");
}

// --------------------------------------------------------------------- HIDE
async function hide(file) {
  heading(`hide ${file.hide?.length ?? 0} tools, batch "${HIDE_BATCH}"`);
  const tools = await allRows("tools", "id,name,hidden_at", ["id"]);
  const used = (await allRows("post_tools", "post_id,tool_id", ["post_id", "tool_id"])).map((r) => r.tool_id);
  const plan = planHide(file, tools, used);
  console.log(`To hide                     : ${plan.hide.length}  (${list(plan.hide)})`);
  if (plan.inPosts.length) console.log(`Used in a post, stay visible: ${plan.inPosts.length}  (${list(plan.inPosts)})`);
  if (plan.already.length) console.log(`Already hidden              : ${plan.already.length}  (${list(plan.already)})`);
  if (plan.missing.length) console.log(`✗ Not found or renamed      : ${plan.missing.length}  (${list(plan.missing)})`);
  if (!APPLY) return console.log("\nDry run only. Re-run with APPLY=1 to hide.");
  for (const part of chunks(plan.hide.map((t) => t.id)))
    await must("hiding", supabase.from("tools").update({ hidden_at: new Date().toISOString(), hidden_batch: HIDE_BATCH }).in("id", part).is("hidden_at", null));
  console.log(`\nDone. To undo: UNHIDE_BATCH=${HIDE_BATCH} APPLY=1 node scripts/hide-tools.mjs`);
}

// ------------------------------------------------------------------- IMPORT
async function importAll(file) {
  heading(`categories from ${IN}`);
  const categories = await readCategories();
  const links = await readLinks();
  const tools = await allRows("tools", "id,name,hidden_at", ["id"]);

  const { targets, problems } = planCategories(file, categories);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`\n${problems.length} problem(s). Nothing was written.`);
    process.exit(1);
  }
  const retire = planRetire(file, categories, targets);
  const plan = planTools(file, tools, links, categories);
  const create = targets.filter((t) => t.id === null);
  const renamed = targets.filter((t) => t.was && t.was.name !== t.name);

  console.log(`Parents and subcategories        : ${targets.length} (${create.length} new, ${targets.length - create.length} reused)`);
  if (renamed.length) console.log(`  renamed                        : ${renamed.map((t) => `${t.was.name} → ${t.name}`).join(", ")}`);
  console.log(`Old categories retired           : ${retire.length} (${retire.filter((r) => r.to).length} redirect to a new one, ${retire.filter((r) => !r.to).length} to /tools)`);
  console.log(`Tools to change                  : ${plan.change.length}`);
  console.log(`  of which end with no category  : ${plan.change.filter((t) => !t.categories.length).length}  (${list(plan.change.filter((t) => !t.categories.length))})`);
  console.log(`Tools already as in the file     : ${plan.same.length}`);
  for (const [key, label] of [
    ["edited", "Edited on the site, left alone   "],
    ["hidden", "Hidden since, left alone         "],
    ["missing", "✗ Not found or renamed           "],
    ["notInFile", "Visible but not in the file      "],
  ])
    if (plan[key].length) console.log(`${label}: ${plan[key].length}  (${list(plan[key])})`);
  if (file.leave_alone?.length) console.log(`Left alone on purpose            : ${list(file.leave_alone)}`);

  if (!APPLY) return console.log("\nDry run only. Re-run with APPLY=1 to import.");

  // ---- backup, before the first write
  const changing = new Set(plan.change.map((t) => t.id));
  mkdirSync("scripts/enrichment", { recursive: true });
  backup = `scripts/enrichment/category-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backup, JSON.stringify({ categories, links: links.filter((l) => changing.has(l.tool_id)), tool_ids: [...changing] }));
  console.log(`\nBackup saved: ${backup}`);

  // ---- 1. structure (parents come before their subcategories in targets)
  const idOf = new Map();
  for (const t of targets) {
    const row = { name: t.name, parent_id: t.parent ? idOf.get(t.parent) : null, sort_order: t.sort_order, retired_at: null, replaced_by: null };
    if (t.id === null) {
      const made = await must(`creating "${t.name}"`, supabase.from("categories").insert({ ...row, slug: t.slug }).select("id").single());
      t.id = made.id;
    } else if (Object.keys(row).some((k) => t.was[k] !== row[k])) {
      await must(`updating "${t.name}"`, supabase.from("categories").update(row).eq("id", t.id));
    }
    idOf.set(t.name, t.id);
  }
  console.log(`  categories ready: ${targets.length}`);

  // ---- 2. tools
  await writeLinks(
    plan.change.map((t) => ({ id: t.id, links: t.categories.map((name, position) => ({ category_id: idOf.get(name), position })) })),
    links
  );
  console.log(`  tools updated: ${plan.change.length}`);

  // ---- 3. retire the rest
  const was = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map();
  for (const r of retire) {
    const to = r.to ? idOf.get(r.to) : null;
    const c = was.get(r.id);
    if (c.retired_at && c.replaced_by === to && c.parent_id === null) continue;
    groups.set(to, [...(groups.get(to) ?? []), r.id]);
  }
  const retiredAt = new Date().toISOString();
  for (const [to, ids] of groups)
    for (const part of chunks(ids))
      await must("retiring old categories", supabase.from("categories").update({ retired_at: retiredAt, replaced_by: to, parent_id: null }).in("id", part));
  console.log(`  old categories retired: ${[...groups.values()].flat().length}`);
  console.log(`\nDone. Public pages can take about 5 minutes to show it.\nTo undo: UNDO=${backup} node scripts/import-categories.mjs`);
}

try {
  if (UNDO) await undo();
  else {
    const file = JSON.parse(readFileSync(IN, "utf8"));
    const problems = fileProblems(file);
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      console.error(`\n${problems.length} problem(s) in ${IN}. Nothing was written.`);
      process.exit(1);
    }
    await (HIDE ? hide(file) : importAll(file));
  }
} catch (e) {
  console.error(`\n✗ ${e.message}\nStopped. Re-running continues from here.${backup ? `\nKeep ${backup}: undoing with it also undoes the continued run.` : ""}`);
  process.exit(1);
}
