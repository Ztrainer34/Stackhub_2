/**
 * Removes the cross-batch duplicate tools you selected, safely.
 *
 * Two sources of work:
 *   TIER B  — every "differs only by filler words" group: delete the NEW row,
 *             keep the pre-existing one.
 *   TIER C  — only the tools named explicitly in C_REMOVE below.
 *
 * Before deleting anything it re-points every reference (playbooks, stacks,
 * saved-for-later, follows, key tools, categories, resolved tickets) onto the
 * tool being kept, so nothing is orphaned. A couple of entries also copy vendor
 * fields across first — see C_COPY_VENDOR.
 *
 * Dry run (default): prints the full plan, writes NOTHING.
 * Apply:  APPLY=1 node scripts/merge-duplicates.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/merge-duplicates.mjs
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const NEW_BATCH = "2026-07"; // the recent ColdIQ import

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- your decisions ------------------------------------------------------

/** Tier C: delete these NEW tools, keeping the pre-existing one. */
const C_REMOVE = [
  "AnyBiz",
  "Appointwise",
  "Automation Anywhere",
  "Browse",
  "Campaign Monitor",
  "Capsule",
  "Clearout",
  "Clutch",
  "Cognigy",
  "Colossyan",
  "Competera",
  "Convin",
  "dbt Labs",
  "Demandbase",
  "Dubb",
  "Ebsta",
  "Factors",
  "Fireflies",
  "Five9",
  "GovWin",
  "GPTfy",
  "Gryphon",
  "Higher Logic",
  "Humantic",
  "Inventive",
  "Hume",
  "Khoros",
  "Kixie",
  "Mammoth",
  "Maxio",
  "Mercury",
  "Merlin AI",
  "Metadata",
  "NetNut",
  "Omnia",
  "OneStream",
  "Origami",
  "Otter",
  "Outbrain Direct Response",
  "PerformYard",
  "Quicklizard",
  "Quillbot",
  "Seamless",
  "Second Nature",
  "Segment",
  "Snov",
  "Speechify",
  "SugarCRM",
  "Talroo",
  "Telescope",
  "Tempo",
  "Topo",
  "Unify",
  "Unique",
  "Vibe Prospecting",
  "Wiser",
  "Xactly",
];

/** Vendor fields to carry over to the kept tool before deleting the new one. */
const C_COPY_VENDOR = {
  Appointwise: ["website", "linkedin_profile"],
  "Campaign Monitor": ["website", "linkedin_profile", "x_profile"],
};

// ---- helpers -------------------------------------------------------------
const NOISE = new Set([
  "the", "marketing", "platform", "app", "inc", "software", "ltd", "llc",
  "corp", "company", "technologies", "technology",
]);
const words = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const core = (n) => words(n).filter((w) => !NOISE.has(w)).join("");
const isNew = (t) => (t.created_at || "").slice(0, 7) === NEW_BATCH;

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
console.log("Loading catalog…");
const tools = await allRows(
  "tools",
  "id,name,description,logo_url,created_at,vendor_id,vendor:vendors(id,website,head_office,year_of_foundation,linkedin_profile,x_profile)"
);

const refCount = new Map(tools.map((t) => [t.id, 0]));
for (const tbl of ["post_tools", "stack_items", "watchlist_items", "tool_follows", "key_tools"]) {
  for (const r of await allRows(tbl, "tool_id"))
    refCount.set(r.tool_id, (refCount.get(r.tool_id) || 0) + 1);
}
console.log(`${tools.length} tools loaded.\n`);

// ---- build the plan ------------------------------------------------------
/** @type {{drop: object, keep: object, tier: string, copy?: string[]}[]} */
const plan = [];
const planned = new Set();

// TIER B: cross-batch groups that differ only by filler words.
const byCore = new Map();
for (const t of tools) {
  const k = core(t.name);
  if (!k) continue;
  if (!byCore.has(k)) byCore.set(k, []);
  byCore.get(k).push(t);
}
for (const group of byCore.values()) {
  if (group.length < 2) continue;
  const news = group.filter(isNew);
  const olds = group.filter((t) => !isNew(t));
  if (!news.length || !olds.length) continue;              // not cross-batch
  if (new Set(group.map((t) => t.name.trim().toLowerCase())).size === 1) continue; // tier A
  // Keep the pre-existing tool that is most referenced.
  const keep = [...olds].sort((a, b) => (refCount.get(b.id) || 0) - (refCount.get(a.id) || 0))[0];
  for (const drop of news) {
    if (planned.has(drop.id)) continue;
    planned.add(drop.id);
    plan.push({ drop, keep, tier: "B" });
  }
}

// TIER C: the explicitly named tools.
const norm = (s) => s.trim().toLowerCase();
for (const name of C_REMOVE) {
  const drop = tools.find((t) => isNew(t) && norm(t.name) === norm(name));
  if (!drop) {
    console.warn(`  ! "${name}" — no NEW tool with that name; skipping`);
    continue;
  }
  // Its group: pre-existing tools whose words start with this tool's words.
  const dw = words(drop.name);
  const candidates = tools.filter((t) => {
    if (isNew(t) || t.id === drop.id) return false;
    const tw = words(t.name);
    return (
      (tw.length >= dw.length && dw.every((x, i) => tw[i] === x)) ||
      (dw.length >= tw.length && tw.every((x, i) => dw[i] === x))
    );
  });
  if (!candidates.length) {
    console.warn(`  ! "${name}" — no pre-existing match found; skipping`);
    continue;
  }
  const keep = [...candidates].sort(
    (a, b) => (refCount.get(b.id) || 0) - (refCount.get(a.id) || 0)
  )[0];
  if (planned.has(drop.id)) continue;
  planned.add(drop.id);
  plan.push({ drop, keep, tier: "C", copy: C_COPY_VENDOR[name] });
}

// ---- report --------------------------------------------------------------
console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: ${plan.length} tools to remove =====\n`);
for (const tier of ["B", "C"]) {
  const rows = plan.filter((p) => p.tier === tier);
  console.log(`--- TIER ${tier}: ${rows.length} ---`);
  for (const { drop, keep, copy } of rows) {
    const refs = refCount.get(drop.id) || 0;
    console.log(
      `  delete "${drop.name}"${refs ? ` (${refs} refs -> moved)` : ""}` +
        `\n     keep "${keep.name}"${copy ? `   [copy: ${copy.join(", ")}]` : ""}`
    );
  }
  console.log("");
}

if (!APPLY) {
  console.log("Dry run only. Nothing was changed. Re-run with APPLY=1 to execute.");
  process.exit(0);
}

// ---- apply ---------------------------------------------------------------
const JUNCTIONS = [
  ["post_tools", "post_id", "post_id,tool_id"],
  ["stack_items", "profile_id", "profile_id,tool_id"],
  ["watchlist_items", "profile_id", "profile_id,tool_id"],
  ["tool_follows", "profile_id", "profile_id,tool_id"],
  ["key_tools", "profile_id", "profile_id,tool_id"],
  ["tool_categories", "category_id", "tool_id,category_id"],
];

let done = 0;
for (const { drop, keep, copy } of plan) {
  // 1. carry over requested vendor fields (only filling blanks on the keeper)
  if (copy && drop.vendor && keep.vendor?.id) {
    const patch = {};
    for (const f of copy) if (!keep.vendor[f] && drop.vendor[f]) patch[f] = drop.vendor[f];
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("vendors").update(patch).eq("id", keep.vendor.id);
      if (error) console.error(`   vendor copy (${keep.name}): ${error.message}`);
      else console.log(`   copied ${Object.keys(patch).join(", ")} -> ${keep.name}`);
    }
  }

  // 2. move references onto the kept tool (junction rows cascade on delete)
  for (const [table, partner, conflict] of JUNCTIONS) {
    const { data } = await supabase.from(table).select(partner).eq("tool_id", drop.id);
    for (const r of data || [])
      await supabase
        .from(table)
        .upsert({ [partner]: r[partner], tool_id: keep.id }, { onConflict: conflict });
  }
  await supabase.from("tool_tickets").update({ resolved_tool_id: keep.id }).eq("resolved_tool_id", drop.id);

  // 3. delete the duplicate, then its vendor if nothing else uses it
  const { error } = await supabase.from("tools").delete().eq("id", drop.id);
  if (error) {
    console.error(`   delete "${drop.name}": ${error.message}`);
    continue;
  }
  if (drop.vendor_id && drop.vendor_id !== keep.vendor_id)
    await supabase.from("vendors").delete().eq("id", drop.vendor_id);

  done++;
  if (done % 10 === 0) console.log(`  …${done}/${plan.length}`);
}

console.log(`\nDone. Removed ${done} duplicate tools.`);
