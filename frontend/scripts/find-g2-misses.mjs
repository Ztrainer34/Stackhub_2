/**
 * Rebuilds scripts/g2-misses.json — the tools we imported that G2 had nothing
 * useful for, so the website fallback knows what to work on.
 *
 * A "miss" is an imported tool still lacking BOTH a logo and a real
 * description after the G2 pass. Run this after every G2 run; otherwise the
 * fallback works from a stale list.
 *
 * READ ONLY — writes the JSON file, changes nothing in the database.
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/find-g2-misses.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OUT = "scripts/g2-misses.json";
const MIN_DESC = 40; // shorter than this counts as no description

// Every batch we have imported; a tool must come from one of these to qualify.
const SOURCES = [
  "scripts/tools-enriched.json",
  "scripts/new-batch-to-add.json",
  "scripts/creator-tools-to-add.json",
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

const imported = new Set();
for (const file of SOURCES) {
  if (!existsSync(file)) continue;
  for (const t of JSON.parse(readFileSync(file, "utf8"))) imported.add(norm(t.name));
}
console.log(`${imported.size} tool names across ${SOURCES.length} import batches`);

console.log("Loading catalog…");
const tools = await allRows("tools", "id,name,description,logo_url,vendor:vendors(website)");
const mine = tools.filter((t) => imported.has(norm(t.name)));

const noLogo = mine.filter((t) => !t.logo_url);
const noDesc = mine.filter((t) => !t.description || t.description.trim().length < MIN_DESC);
const misses = mine.filter(
  (t) => !t.logo_url && (!t.description || t.description.trim().length < MIN_DESC)
);

writeFileSync(
  OUT,
  JSON.stringify(
    misses.map((t) => ({ id: t.id, name: t.name, website: t.vendor?.website ?? null })),
    null,
    2
  )
);

console.log(`\nimported tools in catalog : ${mine.length}`);
console.log(`  missing logo            : ${noLogo.length}`);
console.log(`  missing/thin description: ${noDesc.length}`);
console.log(`  MISSES (both)           : ${misses.length}  -> ${OUT}`);

const noSite = misses.filter((t) => !t.vendor?.website);
if (noSite.length) {
  console.log(`\n  ${noSite.length} of those have no website on record, so the`);
  console.log(`  fallback cannot fetch them: ${noSite.map((t) => t.name).join(", ")}`);
}

console.log(`\nNext: node scripts/enrich-fallback.mjs`);
