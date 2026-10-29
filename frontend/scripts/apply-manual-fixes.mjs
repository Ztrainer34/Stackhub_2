/**
 * Fills specific tools whose data has to come from a hand-picked page rather
 * than the one on record — e.g. Dealfront's real page lives on leadfeeder.com,
 * and Meta Ads is a product page under facebook.com/business.
 *
 * Reads scripts/manual-fixes.json:
 *   description - literal copy, used as-is (skips scraping the description)
 *   logo    - literal logo URL, used as-is (skips picking one from the page)
 *   rename  - optional corrected product name
 *   fetch   - the page to scrape description/logo from; leave it out to write
 *             only the literal values (what tool-enrichment-verifier produces)
 *   website - what to store as the vendor website (tracking params stripped)
 *   vendor  - optional literal vendor fields (HQ, founding year, socials)
 *
 * Literal values (description / logo in the JSON) overwrite what is stored,
 * since the point of supplying them is to correct it. Anything SCRAPED from the
 * page only fills a blank, so a good existing description is never replaced by
 * a worse one. Vendor fields fill blanks unless given literally.
 *
 * Entries WITHOUT `fetch` (enrichment results) only ever fill blanks: nothing
 * already on the page is replaced — unless OVERWRITE=1, which lets their
 * literal description and logo replace the current ones (a hand-checked
 * correction file). Vendor fields still only fill blanks. Every entry is validated before anything is
 * written — the id must belong to a tool with that name, URLs must be http(s),
 * and only the vendor columns below are accepted — and one bad entry stops the
 * whole run.
 *
 * Dry run (default): prints what it found, writes NOTHING.
 * Apply:  APPLY=1 node scripts/apply-manual-fixes.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const OVERWRITE = process.env.OVERWRITE === "1";
const IN = process.env.IN || "scripts/manual-fixes.json";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
// Facebook and Medium refuse plain requests (400 / 403). When a direct fetch
// fails or comes back without usable metadata, retry through Bright Data.
const BD_TOKEN = process.env.BRIGHTDATA_TOKEN;
const BD_ZONE = process.env.BRIGHTDATA_ZONE || "web_unlocker1";
const BD_COUNTRIES = (process.env.BRIGHTDATA_COUNTRIES || "gb,ie,au,ca").split(",");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

const abs = (href, base) => {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
};

const meta = (html, ...names) => {
  for (const n of names) {
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, "i"));
    if (m && m[1].trim()) return decode(m[1]);
  }
  return null;
};

/** Same rule as the fallback: never use og:image, it's a share banner. */
function pickLogo(html, pageUrl) {
  const links = [...html.matchAll(/<link[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
    return m ? m[1] : null;
  };
  const px = (tag, href) => {
    const a = (attr(tag, "sizes") || "").match(/(\d+)\s*x/i);
    if (a) return Number(a[1]);
    const f = (href || "").match(/(\d{2,4})x\d{2,4}/);
    return f ? Number(f[1]) : 0;
  };
  const icons = links
    .filter((t) => /rel=["'][^"']*icon/i.test(t))
    .map((t) => {
      const href = attr(t, "href");
      return {
        href,
        rel: (attr(t, "rel") || "").toLowerCase(),
        size: px(t, href),
        svg: /\.svg(\?|$)/i.test(href || "") || /image\/svg/i.test(attr(t, "type") || ""),
      };
    })
    .filter((i) => i.href && !/mask-icon/.test(i.rel));

  const apple = icons.filter((i) => i.rel.includes("apple-touch-icon")).sort((a, b) => b.size - a.size)[0];
  if (apple) return abs(apple.href, pageUrl);
  const svg = icons.find((i) => i.svg);
  if (svg) return abs(svg.href, pageUrl);
  const big = icons.filter((i) => i.size >= 64).sort((a, b) => b.size - a.size)[0];
  if (big) return abs(big.href, pageUrl);
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(pageUrl).hostname}&sz=128`;
  } catch {
    return icons[0] ? abs(icons[0].href, pageUrl) : null;
  }
}

async function get(url, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: ctl.signal,
      redirect: "follow",
    });
    return r.ok ? { html: await r.text(), url: r.url } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

async function unlock(url) {
  if (!BD_TOKEN) return null;
  for (const country of BD_COUNTRIES) {
    try {
      const res = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${BD_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone: BD_ZONE, url, format: "raw", country: country.trim() }),
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length > 1000) return { html, url };
    } catch { /* try the next exit country */ }
  }
  return null;
}

const targets = JSON.parse(readFileSync(IN, "utf8"));

// ---- validate everything before writing anything ----------------------------
// These values go straight into href/src on the public tool page, bypassing the
// API's validate.WebURL, so check them here.
const VENDOR_KEYS = new Set(["website", "head_office", "year_of_foundation", "linkedin_profile", "x_profile"]);
const isHttp = (s) => {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
};
function problems(t) {
  const out = [];
  if (!t.id || !t.name) out.push("needs id and name");
  // Fill-blanks entries may not carry an overwriting key (rename).
  if (!t.fetch)
    for (const k of Object.keys(t))
      if (!["id", "name", "logo", "website", "description", "vendor"].includes(k)) out.push(`"${k}" needs a fetch entry`);
  if (t.description != null && (typeof t.description !== "string" || t.description.trim().length < 40 || t.description.length > 3000))
    out.push("description must be 40-3000 characters of text");
  if (t.logo != null && !isHttp(t.logo)) out.push("logo must be an http(s) URL");
  if (t.website != null && !isHttp(t.website)) out.push("website must be an http(s) URL");
  if (t.fetch != null && !isHttp(t.fetch)) out.push("fetch must be an http(s) URL");
  const v = t.vendor ?? {};
  for (const k of Object.keys(v)) if (!VENDOR_KEYS.has(k)) out.push(`vendor.${k} is not an accepted field`);
  if (v.website != null && !isHttp(v.website)) out.push("vendor.website must be an http(s) URL");
  if (v.linkedin_profile != null && !/^https:\/\/([a-z]+\.)?linkedin\.com\/company\/[^\s/]+\/?$/i.test(v.linkedin_profile))
    out.push("vendor.linkedin_profile must be https://www.linkedin.com/company/<slug>");
  if (v.x_profile != null && !/^@[A-Za-z0-9_]{1,30}$/.test(v.x_profile)) out.push("vendor.x_profile must be @handle");
  const year = v.year_of_foundation;
  if (year != null && !(Number.isInteger(year) && year >= 1800 && year <= new Date().getFullYear()))
    out.push("vendor.year_of_foundation must be a plausible four-digit year");
  if (v.head_office != null && (typeof v.head_office !== "string" || !v.head_office.trim() || v.head_office.length > 80))
    out.push("vendor.head_office must be 1-80 characters");
  return out;
}
const invalid = targets.map((t) => [t, problems(t)]).filter(([, p]) => p.length);
if (invalid.length) {
  for (const [t, p] of invalid) console.error(`  ✗ ${t.name ?? t.id ?? "(entry)"}: ${p.join("; ")}`);
  console.error(`\n${invalid.length} invalid entr${invalid.length === 1 ? "y" : "ies"} in ${IN}. Nothing was written.`);
  process.exit(1);
}

console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: ${targets.length} tools =====\n`);

for (const t of targets) {
  // Enrichment results carry no page to fetch, and only fill blanks.
  const fillOnly = !t.fetch;
  const needNothingFromPage = !t.fetch || Boolean(t.description && t.logo);
  let page = needNothingFromPage ? null : await get(t.fetch);
  let via = needNothingFromPage ? "literal" : "direct";
  // Retry through the proxy when blocked, or when the page loaded but carried
  // no description (usually a bot-served shell). A hand-written description
  // means we only need the page for its logo, so don't judge it on metadata.
  const needsScrapedDesc = !t.description;
  if (!needNothingFromPage && (!page || (needsScrapedDesc && !meta(page.html, "og:description", "twitter:description", "description")))) {
    const viaBd = await unlock(t.fetch);
    if (viaBd) { page = viaBd; via = "unlocker"; }
  }

  // Hand-written copy always wins over whatever the page says about itself.
  const description =
    t.description ??
    (page ? meta(page.html, "og:description", "twitter:description", "description") : null);
  // A supplied logo wins; some sites expose only a build-hashed asset that
  // rotates, or block us entirely.
  const logo = t.logo ?? (page ? pickLogo(page.html, page.url) : null);

  if (t.fetch && !page && !description) {
    console.log(`  ✗ ${t.name.padEnd(14)} could not fetch ${t.fetch}`);
    continue;
  }

  const { data: cur } = await supabase
    .from("tools")
    .select("name,description,logo_url,vendor_id,vendor:vendors(id,website,head_office,year_of_foundation,linkedin_profile,x_profile)")
    .eq("id", t.id)
    .maybeSingle();

  // The id is what gets written; the name is what a person reviews. If they
  // disagree, the review showed a different tool than the one about to change.
  if (!cur || cur.name.trim().toLowerCase() !== t.name.trim().toLowerCase()) {
    console.log(`  ✗ ${t.name}: id ${t.id} is ${cur ? `"${cur.name}"` : "not a tool"} — skipped`);
    continue;
  }

  let sharedBy = 1;
  if (cur.vendor_id) {
    const { count } = await supabase
      .from("tools").select("id", { count: "exact", head: true }).eq("vendor_id", cur.vendor_id);
    sharedBy = count ?? 1;
  }

  console.log(`  ${t.name}${t.rename ? ` -> ${t.rename}` : ""}  [${via}${fillOnly ? ", blanks only" : ""}]`);
  console.log(
    `     desc : ${description ? `${t.description ? "[literal] " : ""}"${description.slice(0, 90)}…"` : "—"}`
  );
  console.log(`     logo : ${t.logo ? "[literal] " : ""}${logo || "—"}`);

  const patch = {};
  // Literal copy corrects; scraped copy only fills a gap, so a good existing
  // description is never replaced by weaker page metadata.
  const literalWins = !fillOnly || OVERWRITE;
  if (description && ((t.description && literalWins) || !cur.description || cur.description.trim().length < 40))
    patch.description = description;
  if (logo && ((t.logo && literalWins) || !cur.logo_url)) patch.logo_url = logo;
  if (OVERWRITE) {
    if (patch.description && cur.description && cur.description !== patch.description) console.log(`     replaces description: "${cur.description.slice(0, 60)}…"`);
    if (patch.logo_url && cur.logo_url && cur.logo_url !== patch.logo_url) console.log(`     replaces logo       : ${cur.logo_url}`);
  }
  if (t.rename && t.rename !== t.name) patch.name = t.rename;

  const v = cur.vendor ?? {};
  const vpatch = { ...(t.vendor ?? {}) };
  if (t.website && !v.website) vpatch.website = t.website;
  // Literal vendor values are corrections too, but never blank out real data —
  // and enrichment results never replace anything.
  for (const k of Object.keys(vpatch)) {
    if (vpatch[k] == null || (fillOnly && v[k] != null && v[k] !== "")) delete vpatch[k];
  }

  const keeping = [];
  if (description && !patch.description) keeping.push("description (existing kept)");
  if (logo && !patch.logo_url) keeping.push("logo (existing kept)");
  for (const k of Object.keys({ ...(t.vendor ?? {}), ...(t.website ? { website: 1 } : {}) }))
    if (!(k in vpatch)) keeping.push(`${k} (existing kept)`);
  console.log(
    `     WILL WRITE: ${Object.keys(patch).join(", ") || "nothing"}` +
      (keeping.length ? `   |  ${keeping.join(", ")}` : "")
  );
  if (Object.keys(vpatch).length) {
    console.log(`     VENDOR    : ${JSON.stringify(vpatch)}`);
    if (sharedBy > 1) console.log(`     ⚠ this vendor row is shared by ${sharedBy} tools — all of their pages change`);
  }

  if (!APPLY) continue;

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("tools").update(patch).eq("id", t.id);
    if (error) console.error(`     tool: ${error.message}`);
  }

  if (Object.keys(vpatch).length) {
    if (cur?.vendor?.id) {
      const { error } = await supabase.from("vendors").update(vpatch).eq("id", cur.vendor.id);
      if (error) console.error(`     vendor: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("vendors").insert({ name: t.name, ...vpatch }).select("id").single();
      if (error) console.error(`     vendor insert: ${error.message}`);
      else await supabase.from("tools").update({ vendor_id: data.id }).eq("id", t.id);
    }
  }
  console.log(`     saved`);
}

console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with APPLY=1 to save.");
