/**
 * Checks a new tool CSV against the existing catalog and reports what is safe
 * to add. READ ONLY — writes a report, changes nothing.
 *
 * Deliberately biased towards REJECTING: any doubt at all and the tool is
 * skipped, per the rule "if there's a chance it's a duplicate, don't add it".
 * Four independent signals, any one of which rejects a row:
 *
 *   1. domain      — same registrable website domain as an existing vendor
 *   2. exact       — same name, case/whitespace-insensitive
 *   3. core        — same name once filler words are stripped
 *   4. extends     — one name is a whole-word prefix of the other, either way
 *
 *   node scripts/check-new-batch.mjs [csv]     (default scripts/toolverse.csv)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSV = process.argv[2] || "scripts/toolverse.csv";
const OUT_JSON = "scripts/new-batch-to-add.json";
const OUT_TXT = "scripts/new-batch-report.txt";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- csv -----------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1 && r.some(Boolean))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// ---- matching ------------------------------------------------------------
const NOISE = new Set([
  "the", "marketing", "platform", "app", "inc", "software", "ltd", "llc",
  "corp", "company", "technologies", "technology", "ai", "io", "com",
]);
const words = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const core = (n) => words(n).filter((w) => !NOISE.has(w)).join("");
const flat = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Registrable-ish domain: strip protocol, www and any path. */
function domain(url) {
  if (!url) return null;
  try {
    const h = new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return h || null;
  } catch { return null; }
}
/** apollo.io -> apollo ; business.adobe.com -> adobe */
function brand(url) {
  const d = domain(url);
  if (!d) return null;
  const parts = d.split(".");
  const generic = new Set(["com", "io", "ai", "co", "app", "dev", "so", "net", "org", "us", "video", "studio", "club", "rocks", "im", "tt", "do"]);
  const meaningful = parts.filter((p) => !generic.has(p));
  return (meaningful[meaningful.length - 1] || parts[0]) ?? null;
}

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
const incoming = parseCSV(readFileSync(CSV, "utf8"));
console.log(`CSV: ${incoming.length} tools from ${CSV}`);

console.log("Loading catalog…");
const existing = await allRows("tools", "id,name,vendor:vendors(website)");
console.log(`Catalog: ${existing.length} tools\n`);

// Indexes over the existing catalog.
const byExact = new Map();
const byCore = new Map();
const byDomain = new Map();
const wordsOf = new Map();
for (const t of existing) {
  const e = flat(t.name);
  if (!byExact.has(e)) byExact.set(e, t);
  const c = core(t.name);
  if (c && !byCore.has(c)) byCore.set(c, t);
  const d = domain(t.vendor?.website);
  if (d && !byDomain.has(d)) byDomain.set(d, t);
  wordsOf.set(t.id, words(t.name));
}
// Group existing tools by first significant word for the "extends" test.
const byFirstWord = new Map();
for (const t of existing) {
  const w = wordsOf.get(t.id);
  if (!w.length) continue;
  if (!byFirstWord.has(w[0])) byFirstWord.set(w[0], []);
  byFirstWord.get(w[0]).push(t);
}

// ---- decide --------------------------------------------------------------
const add = [];
const reject = [];
const seenInBatch = new Set();

for (const row of incoming) {
  const name = row.name;
  if (!name) continue;

  const hit = (reason, match) => reject.push({ name, url: row.url, reason, match: match?.name });

  // 0. duplicate inside the CSV itself
  const key = core(name) || flat(name);
  if (seenInBatch.has(key)) { hit("duplicate within this CSV"); continue; }

  // 1. same website domain as an existing vendor
  const d = domain(row.url);
  if (d && byDomain.has(d)) { hit("same website domain", byDomain.get(d)); seenInBatch.add(key); continue; }

  // 2. exact name
  if (byExact.has(flat(name))) { hit("exact name", byExact.get(flat(name))); seenInBatch.add(key); continue; }

  // 3. same core once filler words are removed
  const c = core(name);
  if (c && byCore.has(c)) { hit("same name minus filler words", byCore.get(c)); seenInBatch.add(key); continue; }

  // 4. one name extends the other (either direction)
  const nw = words(name);
  const bucket = byFirstWord.get(nw[0]) || [];
  const ext = bucket.find((t) => {
    const tw = wordsOf.get(t.id);
    const [s, l] = nw.length <= tw.length ? [nw, tw] : [tw, nw];
    return s.length && s.every((x, i) => l[i] === x);
  });
  if (ext) { hit("one name extends the other", ext); seenInBatch.add(key); continue; }

  // 5. brand from the domain matches an existing tool's name
  const b = brand(row.url);
  if (b && b.length >= 4 && byExact.has(b)) { hit("website brand matches a tool name", byExact.get(b)); seenInBatch.add(key); continue; }

  seenInBatch.add(key);
  add.push({
    name,
    website: row.url || null,
    categories: (row.category || "").split("|").map((s) => s.trim()).filter(Boolean),
  });
}

// ---- report --------------------------------------------------------------
const byReason = {};
for (const r of reject) (byReason[r.reason] ||= []).push(r);

const L = [];
L.push("NEW BATCH — DUPLICATE CHECK");
L.push("=".repeat(72));
L.push(`Source     : ${CSV}  (${incoming.length} rows)`);
L.push(`Catalog    : ${existing.length} tools`);
L.push(`SAFE TO ADD: ${add.length}`);
L.push(`REJECTED   : ${reject.length}`);
L.push("");
L.push("Rejected on any doubt, per instruction. Breakdown:");
for (const [k, v] of Object.entries(byReason)) L.push(`  ${String(v.length).padStart(4)}  ${k}`);
L.push("");
L.push("");
L.push("REJECTED (not added)");
L.push("-".repeat(72));
for (const [k, v] of Object.entries(byReason)) {
  L.push(`\n### ${k} — ${v.length}`);
  v.forEach((r) => L.push(`   ${r.name.padEnd(24)} ${r.match ? `~ ${r.match}` : ""}`));
}
L.push("");
L.push("");
L.push(`SAFE TO ADD — ${add.length}`);
L.push("-".repeat(72));
add.forEach((t) => L.push(`   ${t.name.padEnd(24)} ${t.website || ""}`));

writeFileSync(OUT_TXT, L.join("\n"));
writeFileSync(OUT_JSON, JSON.stringify(add, null, 2));

console.log("=".repeat(64));
console.log(`SAFE TO ADD : ${add.length}`);
console.log(`REJECTED    : ${reject.length}`);
console.log("=".repeat(64));
for (const [k, v] of Object.entries(byReason)) console.log(`  ${String(v.length).padStart(4)}  ${k}`);
console.log(`\nReport -> ${OUT_TXT}`);
console.log(`To add -> ${OUT_JSON}\n`);
console.log("Sample of what would be ADDED:");
add.slice(0, 20).forEach((t) => console.log(`  + ${t.name.padEnd(22)} ${t.website || ""}`));
