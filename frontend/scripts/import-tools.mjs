/**
 * Imports scripts/tools-enriched.json into the catalog.
 *   - dedups by name (case-insensitive) against existing tools
 *   - strips the ColdIQ SEO boilerplate from descriptions
 *   - creates vendor (website) + tool + category links
 *
 * Dry-run (default): reports new / existing / new-category counts, writes NOTHING.
 * Apply:  APPLY=1 node scripts/import-tools.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/import-tools.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const IN = "scripts/tools-enriched.json";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const cleanDesc = (d) =>
  !d ? null : d.replace(/\s*Details on .*?ColdIQ inside\.?\s*$/i, "").trim() || null;

// Exact name match only (case-insensitive, whitespace-normalized). A tool is
// skipped only if a tool with the SAME name already exists — no fuzzy guessing,
// which was wrongly merging distinct tools (e.g. "Jina AI" vs "Jira").
const normName = (n) => n.toLowerCase().replace(/\s+/g, " ").trim();

// Fetch ALL names of a table (paginated past the 1000 cap).
async function allNames(table) {
  const names = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("name").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => names.push(r.name));
    if (data.length < 1000) break;
  }
  return names;
}

const tools = JSON.parse(readFileSync(IN, "utf8"));
console.log(`Loaded ${tools.length} enriched tools.\n`);

const existingTools = await allNames("tools");
const existingCatNames = await allNames("categories");
const existingCats = new Set(existingCatNames.map((c) => c.toLowerCase()));

const seen = new Set(existingTools.map(normName)); // grows to dedup within batch too
const newTools = [];
const skippedExact = [];

for (const t of tools) {
  const key = normName(t.name);
  if (seen.has(key)) { skippedExact.push(t.name); continue; }
  newTools.push(t);
  seen.add(key);
}

const catSet = new Set();
newTools.forEach((t) => t.categories.forEach((c) => catSet.add(c)));
const newCats = [...catSet].filter((c) => !existingCats.has(c.toLowerCase()));

console.log("===== DRY RUN =====");
console.log(`Tools to insert (new)           : ${newTools.length}`);
console.log(`Skipped — exact name in catalog : ${skippedExact.length}`);
console.log(`Categories referenced (new)     : ${newCats.length} of ${catSet.size} used`);

// Dump the full lists to files for inspection.
writeFileSync("scripts/import-skipped.txt", skippedExact.sort((a, b) => a.localeCompare(b)).join("\n"));
writeFileSync("scripts/import-new.txt", newTools.map((t) => t.name).sort((a, b) => a.localeCompare(b)).join("\n"));
console.log(`\nWrote full lists to scripts/import-skipped.txt and scripts/import-new.txt`);
console.log(`\nFirst 40 skipped (exact name already in catalog):`);
console.log(skippedExact.slice(0, 40).map((n) => "  • " + n).join("\n"));

if (!APPLY) {
  console.log("\nDry run only. Re-run with APPLY=1 to insert.");
  process.exit(0);
}

console.log("\n===== APPLYING =====");
const catCache = {};
async function categoryId(name) {
  const key = name.toLowerCase();
  if (catCache[key]) return catCache[key];
  const { data, error } = await supabase
    .from("categories").upsert({ name, slug: slugify(name) }, { onConflict: "name" })
    .select("id").single();
  if (error) { console.error(`  cat "${name}":`, error.message); return null; }
  catCache[key] = data.id;
  return data.id;
}

let inserted = 0;
for (const t of newTools) {
  let vendorId = null;
  if (t.website) {
    const { data: v } = await supabase.from("vendors").insert({ name: t.name, website: t.website }).select("id").single();
    vendorId = v?.id ?? null;
  }
  const { data: tool, error } = await supabase
    .from("tools")
    .insert({ name: t.name, description: cleanDesc(t.description), logo_url: t.logo, vendor_id: vendorId })
    .select("id").single();
  if (error) { console.error(`✗ ${t.name}:`, error.message); continue; }

  for (const cat of t.categories) {
    const cid = await categoryId(cat);
    if (cid) await supabase.from("tool_categories")
      .upsert({ tool_id: tool.id, category_id: cid }, { onConflict: "tool_id,category_id" });
  }
  inserted++;
  if (inserted % 25 === 0) console.log(`  …inserted ${inserted}/${newTools.length}`);
}
console.log(`\nDone. Inserted ${inserted} tools.`);
