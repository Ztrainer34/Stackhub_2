/**
 * Counts the VISIBLE tools (hidden_at IS NULL) that have no logo and/or no
 * description. READ ONLY — writes nothing to the database.
 *
 * "No description" matches apply-manual-fixes.mjs: empty, or shorter than 40
 * characters (a stored description that short is treated as a blank there and
 * gets replaced).
 *
 * Writes the full list to scripts/enrichment/visible-gaps-<date>.json (gitignored)
 * so tool-enricher can pick the gaps up.
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/audit-visible-tools.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MIN_DESCRIPTION = 40;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function allRows(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const blank = (s) => !s || !String(s).trim();

const tools = await allRows(() =>
  supabase.from("tools").select("id,name,description,logo_url,vendor_id").is("hidden_at", null).order("id")
);
const vendors = await allRows(() => supabase.from("vendors").select("id,website").order("id"));
const websiteByVendor = new Map(vendors.map((v) => [v.id, v.website]));

const rows = tools
  .map((t) => ({
    id: t.id,
    name: (t.name ?? "").trim(),
    website: websiteByVendor.get(t.vendor_id) ?? null,
    no_logo: blank(t.logo_url),
    no_description: blank(t.description) || String(t.description).trim().length < MIN_DESCRIPTION,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

const noLogo = rows.filter((r) => r.no_logo);
const noDesc = rows.filter((r) => r.no_description);
const both = rows.filter((r) => r.no_logo && r.no_description);
const either = rows.filter((r) => r.no_logo || r.no_description);
const fixable = either.filter((r) => !blank(r.website));

console.log(`Visible tools            : ${rows.length}`);
console.log(`  without a logo         : ${noLogo.length}`);
console.log(`  without a description  : ${noDesc.length}  (empty or under ${MIN_DESCRIPTION} characters)`);
console.log(`  without BOTH           : ${both.length}`);
console.log(`  missing at least one   : ${either.length}`);
console.log(`  ...of those with a website (easier to fill): ${fixable.length}`);

if (both.length) {
  console.log("\nWithout both a logo and a description:");
  for (const r of both.slice(0, 60)) console.log(`  - ${r.name}${r.website ? `  (${r.website})` : ""}`);
  if (both.length > 60) console.log(`  … and ${both.length - 60} more (full list in the file below)`);
}

mkdirSync("scripts/enrichment", { recursive: true });
const out = `scripts/enrichment/visible-gaps-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(out, JSON.stringify(either, null, 2));
console.log(`\nWrote ${either.length} tools with a gap to ${out}`);
