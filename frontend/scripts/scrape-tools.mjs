/**
 * Scrapes ColdIQ tool pages listed in a CSV and writes an enriched JSON.
 * Per tool: name, slug, description, logo, website, categories.
 *
 * Checkpointed (safe to re-run / resume), rate-limited, fixes mojibake by
 * preferring the clean name scraped from ColdIQ.
 *
 *   node scripts/scrape-tools.mjs [csvPath]
 *   START=0   COUNT=600   node scripts/scrape-tools.mjs scripts/coldiq.csv
 *   START=600 COUNT=600   node scripts/scrape-tools.mjs scripts/coldiq.csv
 *
 * Output: scripts/tools-enriched.json (accumulates across runs).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CSV = process.argv[2] || "scripts/coldiq.csv";
const OUT = "scripts/tools-enriched.json";
const START = parseInt(process.env.START || "0", 10);
const COUNT = parseInt(process.env.COUNT || "600", 10);
const DELAY = parseInt(process.env.DELAY || "400", 10); // ms between tools
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";

// ---- CSV parsing (handles quoted fields with commas/quotes) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const slugOf = (url) => (url.match(/\/tools\/([^/?#]+)/) || [])[1] || null;
const deesc = (s) => s.replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function enrich(slug, csvName, tagline) {
  let description = tagline || null, logo = null, website = null, name = csvName;
  try {
    const html = await (await fetch(`https://coldiq.com/tools/${slug}`, { headers: { "User-Agent": UA } })).text();
    const pIdx = html.indexOf('\\"product\\":{');
    const win = pIdx >= 0 ? deesc(html.slice(pIdx, pIdx + 3000)) : "";
    const scrapedName = (win.match(/"name":"([^"]+)"/) || [])[1];
    if (scrapedName) name = scrapedName; // clean UTF-8, fixes mojibake
    description = (win.match(/"product_meta_description":"([^"]*)"/) || [])[1] || tagline || null;
    const imgI = html.indexOf(`products-${slug}-image-`);
    if (imgI !== -1) {
      const start = html.lastIndexOf("https://", imgI);
      logo = (html.slice(start).match(/^https:\/\/[^"\\]+/) || [])[0] || null;
    }
  } catch (e) {
    console.error(`   page fail ${slug}: ${e.message}`);
  }
  try {
    const aff = await (await fetch(`https://go.coldiq.com/${slug}`, { headers: { "User-Agent": UA } })).text();
    const m = aff.match(/url=(https?:\/\/[^"'\s]+)/i);
    if (m) website = m[1].split("?")[0];
  } catch {}
  return { name, description, logo, website };
}

// ---- main ----
if (!existsSync(CSV)) {
  console.error(`CSV not found at "${CSV}". Save your file there (or pass a path).`);
  process.exit(1);
}
const all = parseCSV(readFileSync(CSV, "utf8"));
console.log(`CSV rows: ${all.length}`);

const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const done = new Set(results.map((r) => r.slug));

const batch = all.slice(START, START + COUNT);
console.log(`Processing rows ${START}..${START + batch.length - 1} (${batch.length} tools)\n`);

let n = 0;
for (const row of batch) {
  const slug = slugOf(row.url || "");
  if (!slug) continue;
  if (done.has(slug)) { continue; }

  const categories = (row.category || "")
    .split("|").map((c) => c.trim()).filter(Boolean);
  const e = await enrich(slug, row.name, row.tagline);

  results.push({
    name: e.name,
    slug,
    description: e.description,
    logo: e.logo,
    website: e.website,
    categories,
  });
  done.add(slug);
  n++;
  if (n % 10 === 0) {
    writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log(`  …${n}/${batch.length} (checkpoint saved: ${results.length} total)`);
  }
  await sleep(DELAY);
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nDone. ${n} new this run. ${results.length} total in ${OUT}.`);
