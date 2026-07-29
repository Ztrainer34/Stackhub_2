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
import { readFileSync } from "node:fs";
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

// Fetch ALL rows of a column (paginated past the 1000 cap).
async function allNames(table) {
  const names = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("name").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => names.add(r.name.toLowerCase()));
    if (data.length < 1000) break;
  }
  return names;
}

const tools = JSON.parse(readFileSync(IN, "utf8"));
console.log(`Loaded ${tools.length} enriched tools.\n`);

const existingTools = await allNames("tools");
const existingCats = await allNames("categories");

const newTools = tools.filter((t) => !existingTools.has(t.name.toLowerCase()));
const dupeTools = tools.length - newTools.length;

const catSet = new Set();
newTools.forEach((t) => t.categories.forEach((c) => catSet.add(c)));
const newCats = [...catSet].filter((c) => !existingCats.has(c.toLowerCase()));

console.log("===== DRY RUN =====");
console.log(`Tools to insert (new)      : ${newTools.length}`);
console.log(`Tools skipped (already exist): ${dupeTools}`);
console.log(`Categories referenced (new) : ${newCats.length} of ${catSet.size} used`);
console.log(`Sample new tools : ${newTools.slice(0, 8).map((t) => t.name).join(", ")}`);
console.log(`Sample new cats  : ${newCats.slice(0, 12).join(", ")}`);

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
