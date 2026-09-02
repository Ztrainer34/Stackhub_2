/**
 * Imports the tools that survived the duplicate check
 * (scripts/new-batch-to-add.json) into the catalog.
 *
 * Each tool becomes: a vendor row holding the website, the tool itself, and
 * links to its categories (created on demand, reusing existing ones).
 * Descriptions and logos are left blank — the G2 enrichment pass fills them.
 *
 * Re-checks names against the catalog before inserting, so it is safe to
 * re-run: anything already present is skipped.
 *
 * Dry run (default): reports what it would do, writes NOTHING.
 * Apply:  APPLY=1 node scripts/import-new-batch.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/import-new-batch.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const IN = process.env.IN || "scripts/new-batch-to-add.json";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const norm = (n) => n.toLowerCase().replace(/\s+/g, " ").trim();

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

const tools = JSON.parse(readFileSync(IN, "utf8"));
console.log(`Loaded ${tools.length} tools from ${IN}`);

console.log("Loading catalog…");
const existingNames = new Set((await allRows("tools", "name")).map((t) => norm(t.name)));
const existingCats = new Map(
  (await allRows("categories", "id,name")).map((c) => [c.name.toLowerCase(), c.id])
);

// Safety net — the duplicate check already ran, but names may have landed since.
const toInsert = tools.filter((t) => !existingNames.has(norm(t.name)));
const skipped = tools.length - toInsert.length;

const wantedCats = new Set();
toInsert.forEach((t) => t.categories.forEach((c) => wantedCats.add(c)));
const newCats = [...wantedCats].filter((c) => !existingCats.has(c.toLowerCase()));

console.log(`\n===== ${APPLY ? "APPLYING" : "DRY RUN"} =====`);
console.log(`Tools to insert  : ${toInsert.length}`);
console.log(`Skipped (present): ${skipped}`);
console.log(`Categories used  : ${wantedCats.size}  (${newCats.length} new)`);
if (newCats.length) console.log(`New categories   : ${newCats.join(", ")}`);

if (!APPLY) {
  console.log(`\nDry run only. Re-run with APPLY=1 to insert.`);
  process.exit(0);
}

console.log("\nInserting…");
async function categoryId(name) {
  const key = name.toLowerCase();
  if (existingCats.has(key)) return existingCats.get(key);
  const { data, error } = await supabase
    .from("categories")
    .upsert({ name, slug: slugify(name) }, { onConflict: "name" })
    .select("id")
    .single();
  if (error) { console.error(`  category "${name}": ${error.message}`); return null; }
  existingCats.set(key, data.id);
  return data.id;
}

let inserted = 0;
for (const t of toInsert) {
  let vendorId = null;
  if (t.website) {
    const { data: v, error } = await supabase
      .from("vendors")
      .insert({ name: t.name, website: t.website })
      .select("id")
      .single();
    if (error) console.error(`  vendor "${t.name}": ${error.message}`);
    vendorId = v?.id ?? null;
  }

  const { data: tool, error } = await supabase
    .from("tools")
    .insert({ name: t.name, vendor_id: vendorId })
    .select("id")
    .single();
  if (error) { console.error(`✗ ${t.name}: ${error.message}`); continue; }

  for (const cat of t.categories) {
    const id = await categoryId(cat);
    if (id)
      await supabase
        .from("tool_categories")
        .upsert({ tool_id: tool.id, category_id: id }, { onConflict: "tool_id,category_id" });
  }

  inserted++;
  if (inserted % 10 === 0) console.log(`  …${inserted}/${toInsert.length}`);
}

console.log(`\nDone. Inserted ${inserted} tools.`);
console.log(`Next: enrich them with G2 — node scripts/enrich-g2.mjs`);
