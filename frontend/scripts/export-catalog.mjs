/**
 * Exports the live tool catalog. READ ONLY — changes nothing in the database.
 *
 * Writes two files (both gitignored):
 *   scripts/stackhub-tools.csv    — Name, Website, Categories, StackHub page;
 *                                   for sharing (opens in Excel / Google Sheets)
 *   scripts/catalog-export.json   — every tool with its logo, vendor details and
 *                                   categories; used to check import batches and
 *                                   by the tool-enricher agent to see what is blank
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/export-catalog.mjs
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = process.env.SITE_URL || "https://stackhub.me";
const OUT_CSV = "scripts/stackhub-tools.csv";
const OUT_JSON = "scripts/catalog-export.json";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

// Same slug the tool page resolves (GetToolIDBySlug / idx_tools_name_slug).
const toolSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

console.log("Loading catalog…");
const [tools, vendors, categories, links] = await Promise.all([
  allRows("tools", "id,name,logo_url,vendor_id"),
  allRows("vendors", "id,website,head_office,year_of_foundation,linkedin_profile,x_profile"),
  allRows("categories", "id,name"),
  allRows("tool_categories", "tool_id,category_id"),
]);

const vendorById = new Map(vendors.map((v) => [v.id, v]));
// A vendors row can be shared, and writing to it changes every tool using it.
const toolsPerVendor = new Map();
for (const t of tools) if (t.vendor_id) toolsPerVendor.set(t.vendor_id, (toolsPerVendor.get(t.vendor_id) ?? 0) + 1);
const categoryName = new Map(categories.map((c) => [c.id, c.name]));
const categoriesByTool = new Map();
for (const l of links) {
  if (!categoriesByTool.has(l.tool_id)) categoriesByTool.set(l.tool_id, []);
  categoriesByTool.get(l.tool_id).push(categoryName.get(l.category_id));
}

const rows = tools
  .map((t) => {
    const v = vendorById.get(t.vendor_id) ?? {};
    return {
      id: t.id,
      name: t.name.trim(),
      website: v.website ?? null,
      logo_url: t.logo_url ?? null,
      vendor_id: t.vendor_id ?? null,
      vendor_shared_by: toolsPerVendor.get(t.vendor_id) ?? 0,
      head_office: v.head_office ?? null,
      year_of_foundation: v.year_of_foundation ?? null,
      linkedin_profile: v.linkedin_profile ?? null,
      x_profile: v.x_profile ?? null,
      categories: (categoriesByTool.get(t.id) ?? []).filter(Boolean).sort(),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

// Tool names are user-supplied (anyone signed in can approve a tool on /admin),
// and Excel/Sheets run a cell starting with = + - @ as a formula. A leading '
// makes it plain text.
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  ["Name", "Website", "Categories", "StackHub page"].join(","),
  ...rows.map((r) =>
    [r.name, r.website, r.categories.join("; "), `${SITE_URL}/tool/${toolSlug(r.name)}`].map(cell).join(",")
  ),
].join("\r\n");

// The BOM makes Excel read the file as UTF-8, so accented names survive.
writeFileSync(OUT_CSV, "﻿" + csv + "\r\n");
writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2));

console.log(`${rows.length} tools, ${categories.length} categories`);
console.log(`  without a website : ${rows.filter((r) => !r.website).length}`);
console.log(`  without categories: ${rows.filter((r) => r.categories.length === 0).length}`);
console.log(`  without a logo    : ${rows.filter((r) => !r.logo_url).length}`);
console.log(`  without HQ or year: ${rows.filter((r) => !r.head_office || !r.year_of_foundation).length}`);
console.log(`Wrote ${OUT_CSV} and ${OUT_JSON}`);
