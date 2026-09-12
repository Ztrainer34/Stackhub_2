/**
 * Fills specific tools whose data has to come from a hand-picked page rather
 * than the one on record — e.g. Dealfront's real page lives on leadfeeder.com,
 * and Meta Ads is a product page under facebook.com/business.
 *
 * Reads scripts/manual-fixes.json:
 *   description - literal copy, used as-is (skips scraping the description)
 *   logo    - literal logo URL, used as-is (skips picking one from the page)
 *   rename  - optional corrected product name
 *   fetch   - the page to scrape description/logo from
 *   website - what to store as the vendor website (tracking params stripped)
 *   vendor  - optional literal vendor fields (HQ, founding year, socials)
 *
 * Literal values (description / logo in the JSON) overwrite what is stored,
 * since the point of supplying them is to correct it. Anything SCRAPED from the
 * page only fills a blank, so a good existing description is never replaced by
 * a worse one. Vendor fields fill blanks unless given literally.
 *
 * Dry run (default): prints what it found, writes NOTHING.
 * Apply:  APPLY=1 node scripts/apply-manual-fixes.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
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
console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"}: ${targets.length} tools =====\n`);

for (const t of targets) {
  const needNothingFromPage = Boolean(t.description && t.logo);
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

  if (!page && !description) {
    console.log(`  ✗ ${t.name.padEnd(14)} could not fetch ${t.fetch}`);
    continue;
  }

  console.log(`  ${t.name}${t.rename ? ` -> ${t.rename}` : ""}  [${via}]`);
  console.log(
    `     desc : ${description ? `${t.description ? "[literal] " : ""}"${description.slice(0, 90)}…"` : "—"}`
  );
  console.log(`     logo : ${t.logo ? "[literal] " : ""}${logo || "—"}`);
  if (t.vendor) console.log(`     vendor: ${JSON.stringify(t.vendor)}`);

  const { data: cur } = await supabase
    .from("tools")
    .select("description,logo_url,vendor_id,vendor:vendors(id,website,head_office,year_of_foundation,linkedin_profile,x_profile)")
    .eq("id", t.id)
    .single();

  const patch = {};
  // Literal copy corrects; scraped copy only fills a gap, so a good existing
  // description is never replaced by weaker page metadata.
  if (description && (t.description || !cur?.description || cur.description.trim().length < 40))
    patch.description = description;
  if (logo && (t.logo || !cur?.logo_url)) patch.logo_url = logo;
  if (t.rename && t.rename !== t.name) patch.name = t.rename;

  const keeping = [];
  if (description && !patch.description) keeping.push("description (existing kept)");
  if (logo && !patch.logo_url) keeping.push("logo (existing kept)");
  console.log(
    `     WILL WRITE: ${Object.keys(patch).join(", ") || "nothing"}` +
      (keeping.length ? `   |  ${keeping.join(", ")}` : "")
  );

  if (!APPLY) continue;

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("tools").update(patch).eq("id", t.id);
    if (error) console.error(`     tool: ${error.message}`);
  }

  const vpatch = { ...(t.vendor ?? {}) };
  if (t.website && !cur?.vendor?.website) vpatch.website = t.website;
  // Literal vendor values are corrections too, but never blank out real data.
  for (const k of Object.keys(vpatch)) if (vpatch[k] == null) delete vpatch[k];

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
