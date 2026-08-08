/**
 * Enriches vendor rows (LinkedIn, X, HQ, founding year) for tools that have a
 * website but are missing that info — the free path (no G2):
 *   1. fetch the vendor's own website  -> socials + Organization JSON-LD
 *   2. Wikidata fallback for founding year / HQ on notable companies
 *
 * Each unique website is fetched once and applied to every vendor that shares
 * it, so duplicate tools don't re-fetch. Only fills BLANK fields (never
 * overwrites existing data), so it's safe to re-run / resume.
 *
 * Dry-run (default): samples ~40 sites, reports coverage, writes NOTHING.
 * Apply:  APPLY=1 node scripts/enrich-vendors.mjs   (LIMIT=200 to cap)
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/enrich-vendors.mjs
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const LIMIT = parseInt(process.env.LIMIT || "0", 10); // 0 = all
const USE_WIKIDATA = process.env.WIKIDATA !== "0";     // on by default
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, ms = 10000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: ctl.signal, redirect: "follow" });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(to); }
}

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
const BAD_HANDLE = new Set(["intent", "share", "home", "hashtag", "search", "i", "privacy", "tos", "explore"]);

function socialsFromHtml(html) {
  const li = (html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]+/i) || [])[0] || null;
  let x = null;
  const tw = (html.match(/https?:\/\/(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/i) || []);
  if (tw[1] && !BAD_HANDLE.has(tw[1].toLowerCase())) x = "@" + tw[1];
  return { linkedin: li, x };
}

function jsonLdOrg(html) {
  const acc = {};
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const fmtAddr = (a) => {
    if (typeof a === "string") return a.trim().slice(0, 80) || null;
    if (a && typeof a === "object") {
      const p = [a.addressLocality, a.addressRegion || a.addressCountry].filter(Boolean);
      return p.length ? p.join(", ") : null;
    }
    return null;
  };
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = [].concat(n["@type"] || []);
    if (t.some((x) => /Organization|Corporation|LocalBusiness/i.test(x || ""))) {
      if (!acc.year && n.foundingDate) { const y = (String(n.foundingDate).match(/\d{4}/) || [])[0]; if (y) acc.year = +y; }
      if (!acc.hq && n.address) acc.hq = fmtAddr(n.address);
      for (const u of [].concat(n.sameAs || [])) {
        if (!acc.linkedin && /linkedin\.com\/company/i.test(u)) acc.linkedin = u;
        const m = /(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/i.exec(u);
        if (!acc.x && m && !BAD_HANDLE.has(m[1].toLowerCase())) acc.x = "@" + m[1];
      }
    }
    for (const k of Object.keys(n)) if (typeof n[k] === "object") walk(n[k]);
  };
  let m; while ((m = re.exec(html))) { try { walk(JSON.parse(m[1].trim())); } catch {} }
  return acc;
}

async function wikidata(name) {
  try {
    const s = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1`)).json();
    if (!s.search?.length) return {};
    const id = s.search[0].id;
    const e = await (await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`)).json();
    const c = e.entities[id].claims || {};
    const out = {};
    const t = c.P571?.[0]?.mainsnak?.datavalue?.value?.time;
    if (t) { const y = (t.match(/\d{4}/) || [])[0]; if (y) out.year = +y; }
    const hqId = c.P159?.[0]?.mainsnak?.datavalue?.value?.id;
    if (hqId) {
      const he = await (await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${hqId}.json`)).json();
      out.hq = he.entities[hqId]?.labels?.en?.value || undefined;
    }
    return out;
  } catch { return {}; }
}

async function enrichSite(domain, name) {
  const html = (await get(`https://${domain}`)) || (await get(`https://www.${domain}`)) || "";
  const s = html ? socialsFromHtml(html) : {};
  const ld = html ? jsonLdOrg(html) : {};
  let out = { linkedin: s.linkedin || ld.linkedin || null, x: s.x || ld.x || null, year: ld.year || null, hq: ld.hq || null };
  if (USE_WIKIDATA && (!out.year || !out.hq)) {
    const w = await wikidata(name);
    out.year = out.year || w.year || null;
    out.hq = out.hq || w.hq || null;
  }
  return out;
}

// ---- load ----
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

console.log("Loading vendors…");
const vendors = await allRows("vendors", "id,name,website,x_profile,linkedin_profile,head_office,year_of_foundation");
const need = vendors.filter((v) => v.website &&
  (!v.linkedin_profile || !v.x_profile || !v.head_office || !v.year_of_foundation));

const byDomain = new Map();
for (const v of need) { const d = domainOf(v.website); if (!d) continue; if (!byDomain.has(d)) byDomain.set(d, []); byDomain.get(d).push(v); }
let domains = [...byDomain.keys()];
console.log(`Vendors needing enrichment: ${need.length} across ${domains.length} unique sites.`);
if (LIMIT) domains = domains.slice(0, LIMIT);

if (!APPLY) {
  const sample = domains.slice(0, 40);
  console.log(`\n===== DRY RUN (sampling ${sample.length} sites) =====`);
  const tally = { linkedin: 0, x: 0, year: 0, hq: 0 };
  for (const d of sample) {
    const v = byDomain.get(d)[0];
    const e = await enrichSite(d, v.name);
    Object.keys(tally).forEach((k) => { if (e[k]) tally[k]++; });
    console.log(`  ${d.padEnd(26)} li:${e.linkedin ? "y" : "—"} x:${(e.x || "—").padEnd(16)} yr:${e.year || "—"} hq:${e.hq || "—"}`);
    await sleep(300);
  }
  const pct = (n) => `${Math.round((n / sample.length) * 100)}%`;
  console.log(`\nCoverage on sample: linkedin ${pct(tally.linkedin)} · x ${pct(tally.x)} · founded ${pct(tally.year)} · HQ ${pct(tally.hq)}`);
  console.log(`\nDry run only. Re-run with APPLY=1 to write (LIMIT=n to cap).`);
  process.exit(0);
}

console.log(`\n===== APPLYING to ${domains.length} sites =====`);
let sites = 0, updated = 0;
for (const d of domains) {
  const group = byDomain.get(d);
  const e = await enrichSite(d, group[0].name);
  for (const v of group) {
    const patch = {};
    if (!v.linkedin_profile && e.linkedin) patch.linkedin_profile = e.linkedin;
    if (!v.x_profile && e.x) patch.x_profile = e.x;
    if (!v.head_office && e.hq) patch.head_office = e.hq;
    if (!v.year_of_foundation && e.year) patch.year_of_foundation = e.year;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("vendors").update(patch).eq("id", v.id);
      if (error) console.error(`  ${v.name}:`, error.message); else updated++;
    }
  }
  if (++sites % 25 === 0) console.log(`  …${sites}/${domains.length} sites, ${updated} vendors updated`);
  await sleep(250);
}
console.log(`\nDone. Processed ${sites} sites, updated ${updated} vendors.`);
