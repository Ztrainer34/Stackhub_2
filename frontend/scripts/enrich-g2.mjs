/**
 * Enriches recently-imported tools with G2 data (logo, HQ, founding year,
 * website, LinkedIn, X) fetched through Bright Data's Web Unlocker.
 *
 * G2 blocks plain scrapers (403 / DataDome), so every request goes through the
 * Unlocker Direct API, which handles IP rotation, fingerprinting and CAPTCHAs
 * and returns the finished HTML. You are billed per SUCCESSFUL request.
 *
 * G2 splits the data across two pages, so a matched tool costs 2 requests
 * (3-4 when the slug guess misses and we fall back to search):
 *   /products/<slug>/reviews -> product name, logo, link to the seller page
 *   /sellers/<slug>          -> HQ, year founded, website, LinkedIn, X
 *
 * Targets tools from scripts/tools-enriched.json (the ColdIQ import) that are
 * still missing any of those fields. Only BLANK fields are filled — existing
 * data is never overwritten — so it is safe to re-run and it resumes where it
 * left off.
 *
 * Modes
 *   INSPECT="wispr-flow" node scripts/enrich-g2.mjs
 *       Fetch one product (+ its seller) page, save the HTML to
 *       scripts/g2-product.html / g2-seller.html and print what was parsed.
 *
 *   PARSE=1 node scripts/enrich-g2.mjs      -> re-parse those saved files, 0 requests
 *   node scripts/enrich-g2.mjs              -> dry run on SAMPLE (default 10) tools
 *   APPLY=1 node scripts/enrich-g2.mjs      -> write to the DB
 *   APPLY=1 LIMIT=100 node scripts/enrich-g2.mjs
 *
 * Env: BRIGHTDATA_TOKEN (required), BRIGHTDATA_ZONE (default "web_unlocker1"),
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseProduct, parseSeller, summarize, countWords } from "./g2-parse.mjs";

const TOKEN = process.env.BRIGHTDATA_TOKEN;
const ZONE = process.env.BRIGHTDATA_ZONE || "web_unlocker1";
// G2 localises by exit IP — pin the country so descriptions come back in
// English rather than whatever the rotating proxy happens to land on.
const COUNTRY = process.env.BRIGHTDATA_COUNTRY || "us";
const APPLY = process.env.APPLY === "1";
const SAMPLE = parseInt(process.env.SAMPLE || "10", 10);
const LIMIT = parseInt(process.env.LIMIT || "0", 10);
const OFFSET = parseInt(process.env.OFFSET || "0", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "6", 10);
// Bright Data will sit on a dead URL for 300s before returning 504, so cap it
// ourselves. Real pages come back in ~20-26s.
const REQ_TIMEOUT = parseInt(process.env.REQ_TIMEOUT || "60000", 10);
const INSPECT = process.env.INSPECT || "";
const PARSE_ONLY = process.env.PARSE === "1";
// Descriptions shorter than this many WORDS are treated as placeholders worth
// replacing with a condensed G2 summary; longer ones are left alone.
const SHORT_DESC_WORDS = parseInt(process.env.SHORT_DESC_WORDS || "15", 10);
// Ceiling only — short G2 descriptions are stored in full, never padded.
const SUMMARY_MAX = parseInt(process.env.SUMMARY_MAX || "200", 10);
const isThin = (d) => countWords(d) < SHORT_DESC_WORDS;
// Descriptions are opt-in for now: DESC=1 enables replacing thin ones with a
// condensed G2 summary. Off by default so runs only touch vendor/logo fields.
const DESC_MODE = (process.env.DESC || "").toLowerCase(); // "1" = thin only, "all" = every tool
const WRITE_DESC = DESC_MODE === "1" || DESC_MODE === "all";
const DESC_ALL = DESC_MODE === "all";

// ---- offline parse mode (no network, no cost) ----------------------------
if (PARSE_ONLY) {
  for (const [label, file, fn] of [
    ["product", "scripts/g2-product.html", (h) => parseProduct(h, process.env.SLUG || "")],
    ["seller", "scripts/g2-seller.html", parseSeller],
  ]) {
    if (!existsSync(file)) {
      console.log(`${label}: ${file} not found (run INSPECT first)`);
      continue;
    }
    console.log(`--- ${label} (${file}) ---`);
    console.log(fn(readFileSync(file, "utf8")));
  }
  process.exit(0);
}

if (!TOKEN) {
  console.error("Missing BRIGHTDATA_TOKEN. Set it before running:");
  console.error('  $env:BRIGHTDATA_TOKEN = "<your token>"');
  process.exit(1);
}

// ---- Bright Data Web Unlocker -------------------------------------------
let requestCount = 0;
async function unlock(url, { tries = 2, timeout = REQ_TIMEOUT } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      requestCount++;
      const res = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zone: ZONE, url, format: "raw", country: COUNTRY }),
        signal: ctl.signal,
      });
      // 4xx/5xx here means the page is genuinely unreachable — retrying a dead
      // URL just burns another timeout, so give up immediately.
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 120);
        const err = new Error(`unlocker ${res.status}: ${detail}`);
        err.fatal = res.status === 404 || res.status >= 500;
        throw err;
      }
      const body = await res.text();
      // A 200 with an empty/stub body means the page did not really load.
      if (body.length < 1000) throw new Error(`empty response (${body.length} bytes)`);
      return body;
    } catch (e) {
      if (e.fatal || attempt === tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---- G2 lookup -----------------------------------------------------------
const g2Slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Only accept a G2 page whose product name really is the tool we asked for. */
function nameMatches(want, got) {
  if (!got) return false;
  const a = normalize(want);
  const b = normalize(got);
  if (!a || !b || a.length < 2) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

async function fetchProduct(slug, wantName, opts = {}) {
  const url = `https://www.g2.com/products/${slug}/reviews`;
  const html = await unlock(url, opts);
  const parsed = parseProduct(html, slug);
  return nameMatches(wantName, parsed.name) ? { url, parsed, html } : null;
}

/** Product page via slug guess, else G2 search. Then the seller page. */
async function findG2(tool, needsVendor = true) {
  let hit = null;
  try {
    // Speculative: one try, short fuse — a miss falls through to search.
    hit = await fetchProduct(g2Slug(tool.name), tool.name, { tries: 1, timeout: 45000 });
  } catch {
    /* fall through to search */
  }

  if (!hit) {
    let searchHtml;
    try {
      searchHtml = await unlock(
        `https://www.g2.com/search?query=${encodeURIComponent(tool.name)}`
      );
    } catch {
      return null;
    }
    const slugs = [
      ...new Set(
        (searchHtml.match(/\/products\/([a-z0-9][a-z0-9-]{1,80})\/(?:reviews|takeaways)/gi) || [])
          .map((p) => (p.match(/\/products\/([^/]+)\//) || [])[1])
          .filter(Boolean)
      ),
    ].slice(0, 2);
    for (const slug of slugs) {
      try {
        hit = await fetchProduct(slug, tool.name);
        if (hit) break;
      } catch {
        /* try next candidate */
      }
    }
    if (!hit) return null;
    hit.via = "search";
  } else {
    hit.via = "slug";
  }

  // Company details live on the seller page — a second ~26s request, so skip it
  // when this tool's vendor record is already complete (e.g. a DESC-only pass).
  let seller = { hq: null, year: null, website: null, linkedin: null, x: null };
  if (hit.parsed.sellerSlug && needsVendor) {
    try {
      const html = await unlock(`https://www.g2.com/sellers/${hit.parsed.sellerSlug}`);
      seller = parseSeller(html);
      hit.sellerHtml = html;
    } catch {
      /* keep whatever the product page gave us */
    }
  }
  return { ...hit, data: { ...hit.parsed, ...seller } };
}

// ---- inspect mode --------------------------------------------------------
if (INSPECT) {
  const slug = INSPECT.startsWith("http")
    ? (INSPECT.match(/\/products\/([^/]+)/) || [])[1] || INSPECT
    : g2Slug(INSPECT);
  console.log(`Inspecting "${slug}" via Web Unlocker (zone: ${ZONE})…\n`);

  const productUrl = `https://www.g2.com/products/${slug}/reviews`;
  const productHtml = await unlock(productUrl);
  writeFileSync("scripts/g2-product.html", productHtml);
  const product = parseProduct(productHtml, slug);
  console.log(`product page: ${productHtml.length} bytes -> scripts/g2-product.html`);
  console.log(product);

  if (product.sellerSlug) {
    const sellerHtml = await unlock(`https://www.g2.com/sellers/${product.sellerSlug}`);
    writeFileSync("scripts/g2-seller.html", sellerHtml);
    console.log(`\nseller page (${product.sellerSlug}): ${sellerHtml.length} bytes -> scripts/g2-seller.html`);
    console.log(parseSeller(sellerHtml));
  } else {
    console.log("\nNo seller link found on the product page.");
  }
  console.log(`\nRequests used: ${requestCount}`);
  process.exit(0);
}

// ---- load targets --------------------------------------------------------
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

const norm = (n) => n.toLowerCase().replace(/\s+/g, " ").trim();

// DESC=all targets every tool, so "fill only blanks" no longer makes a re-run
// resume. Record finished names on disk instead, and skip them next time.
const DONE_FILE = "scripts/g2-done.json";
const done = new Set(
  existsSync(DONE_FILE) ? JSON.parse(readFileSync(DONE_FILE, "utf8")) : []
);
const flushDone = () => writeFileSync(DONE_FILE, JSON.stringify([...done]));
function markDone(name) {
  done.add(norm(name));
  flushDone(); // every tool — a few KB, and Ctrl+C must not lose progress
}
// Interrupting mid-run is normal here; keep what was finished.
process.on("SIGINT", () => {
  flushDone();
  console.log(`\n\nInterrupted. ${done.size} tools recorded — re-run to resume.`);
  process.exit(130);
});
const imported = new Set(
  JSON.parse(readFileSync("scripts/tools-enriched.json", "utf8")).map((t) => norm(t.name))
);

console.log("Loading tools…");
const tools = await allRows(
  "tools",
  "id,name,description,logo_url,vendor_id,vendor:vendors(id,website,head_office,year_of_foundation,linkedin_profile,x_profile)"
);

const incomplete = (t) =>
  DESC_ALL ||
  (WRITE_DESC && isThin(t.description)) ||
  !t.logo_url ||
  !t.vendor ||
  !t.vendor.head_office ||
  !t.vendor.year_of_foundation ||
  !t.vendor.linkedin_profile;

let targets = tools
  .filter((t) => imported.has(norm(t.name)))
  .filter((t) => !done.has(norm(t.name)))
  .filter(incomplete)
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`Recently-imported tools missing G2 data: ${targets.length}`);
if (OFFSET) targets = targets.slice(OFFSET);
if (!APPLY) targets = targets.slice(0, SAMPLE);
else if (LIMIT) targets = targets.slice(0, LIMIT);
console.log(`${APPLY ? "APPLYING to" : "DRY RUN over"} ${targets.length} tools (concurrency ${CONCURRENCY})\n`);

// ---- run -----------------------------------------------------------------
const stats = { found: 0, missed: 0, logo: 0, desc: 0, hq: 0, year: 0, website: 0, linkedin: 0, x: 0, updated: 0 };

const vendorIncomplete = (t) => {
  const v = t.vendor;
  return !v || !v.head_office || !v.year_of_foundation || !v.website || !v.linkedin_profile;
};

// `group` is every catalog row sharing this name. The catalog still contains
// duplicates, so we scrape G2 once and write the result to all of them.
async function handle(group) {
  const tool = group[0];
  let hit = null;
  try {
    hit = await findG2(tool, group.some(vendorIncomplete));
  } catch (e) {
    console.error(`  ! ${tool.name}: ${e.message}`);
  }
  if (!hit) {
    stats.missed++;
    markDone(tool.name);
    console.log(`  ✗ ${tool.name.padEnd(26)} no confident G2 match`);
    return;
  }

  stats.found++;
  const d = hit.data;
  for (const k of ["logo", "description", "hq", "year", "website", "linkedin", "x"])
    if (d[k]) stats[k === "description" ? "desc" : k]++;
  console.log(
    `  ✓ ${(tool.name + (group.length > 1 ? ` x${group.length}` : "")).padEnd(26)} logo:${d.logo ? "y" : "—"} desc:${!WRITE_DESC ? "off" : d.description ? countWords(summarize(d.description, SUMMARY_MAX)) + "w" : "—"} hq:${(d.hq || "—").padEnd(20)}` +
      ` yr:${String(d.year || "—").padEnd(5)} li:${d.linkedin ? "y" : "—"} x:${(d.x || "—").padEnd(14)} [${hit.via}]`
  );
  if (!APPLY) return;

  for (const tool of group) await writeTool(tool, d);
  markDone(tool.name);
}

async function writeTool(tool, d) {
  const toolPatch = {};
  if (!tool.logo_url && d.logo) toolPatch.logo_url = d.logo;
  // Replace only thin/missing descriptions, with a condensed summary of G2's
  // overview rather than the full page copy.
  if (WRITE_DESC && d.description && (DESC_ALL || isThin(tool.description))) {
    const summary = summarize(d.description, SUMMARY_MAX);
    if (summary) toolPatch.description = summary;
  }
  if (Object.keys(toolPatch).length) {
    const { error } = await supabase.from("tools").update(toolPatch).eq("id", tool.id);
    if (error) console.error(`    tool: ${error.message}`);
  }

  const v = tool.vendor;
  const patch = {};
  if (!v?.head_office && d.hq) patch.head_office = d.hq;
  if (!v?.year_of_foundation && d.year) patch.year_of_foundation = d.year;
  if (!v?.website && d.website) patch.website = d.website;
  if (!v?.linkedin_profile && d.linkedin) patch.linkedin_profile = d.linkedin;
  if (!v?.x_profile && d.x) patch.x_profile = d.x;
  if (!Object.keys(patch).length) return;

  if (v?.id) {
    const { error } = await supabase.from("vendors").update(patch).eq("id", v.id);
    if (error) return console.error(`    vendor: ${error.message}`);
  } else {
    const { data, error } = await supabase
      .from("vendors")
      .insert({ name: tool.name, ...patch })
      .select("id")
      .single();
    if (error) return console.error(`    vendor insert: ${error.message}`);
    await supabase.from("tools").update({ vendor_id: data.id }).eq("id", tool.id);
  }
  stats.updated++;
}

// Collapse duplicate rows so each distinct tool name costs one G2 lookup.
const byName = new Map();
for (const t of targets) {
  const k = norm(t.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(t);
}
const queue = [...byName.values()];
console.log(`${targets.length} rows -> ${queue.length} distinct names to look up
`);
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await handle(queue.shift());
  })
);

flushDone();

const pct = (n) => (stats.found ? `${Math.round((n / stats.found) * 100)}%` : "—");
console.log(`\n===== ${APPLY ? "DONE" : "DRY RUN"} =====`);
console.log(`Matched on G2 : ${stats.found} / ${queue.length}  (no match: ${stats.missed})`);
console.log(
  `Of the matches: logo ${pct(stats.logo)} · desc ${pct(stats.desc)} · HQ ${pct(stats.hq)} · ` +
    `founded ${pct(stats.year)} · website ${pct(stats.website)} · linkedin ${pct(stats.linkedin)} · x ${pct(stats.x)}`
);
if (APPLY) console.log(`Vendors updated: ${stats.updated}`);
console.log(`Web Unlocker requests used: ${requestCount}`);
if (!APPLY) console.log(`\nNothing written. Re-run with APPLY=1 to save.`);
