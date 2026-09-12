/**
 * Fills in the handful of tools G2 had no listing for, using each tool's OWN
 * website — the most authoritative source, and one that needs no proxy.
 *
 * Reads scripts/g2-misses.json (produced by the miss scan) and pulls:
 *   description  <- og:description / meta description / JSON-LD
 *   logo         <- og:image / apple-touch-icon / JSON-LD logo
 *   linkedin, x  <- footer links / JSON-LD sameAs
 *
 * Only BLANK fields are filled, so it is safe to re-run.
 *
 * Dry run (default): prints what it found, writes NOTHING.
 * Apply:  APPLY=1 node scripts/enrich-fallback.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/enrich-fallback.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const IN = process.env.IN || "scripts/g2-misses.json";
// Overwrite logos already stored — used to correct earlier bad picks.
const RELOGO = process.env.RELOGO === "1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const decode = (s) =>
  s
    // Numeric entities come in decimal and hex forms (&#39; and &#x27;), and
    // sites use both — handle them generically before the named ones.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

async function get(url, ms = 15000) {
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

const meta = (html, ...names) => {
  for (const n of names) {
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, "i"));
    if (m && m[1].trim()) return decode(m[1]);
  }
  return null;
};

/** Resolve a possibly-relative asset URL against the page it came from. */
const abs = (href, base) => {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
};

/**
 * Picks a real brand mark. Deliberately does NOT use og:image — that is the
 * social share card (often a wide banner with marketing copy), not a logo.
 * Order: apple-touch-icon (square, high-res) -> largest declared icon ->
 * Google's favicon service as a last resort. JSON-LD logo overrides all of
 * these later, since it is explicitly a logo.
 */
function pickLogo(html, pageUrl) {
  const links = [...html.matchAll(/<link[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
    return m ? m[1] : null;
  };
  // Sizes live in the attribute when declared, otherwise often in the filename
  // ("favicon-32x32.png").
  const px = (tag, href) => {
    const a = (attr(tag, "sizes") || "").match(/(\d+)\s*x/i);
    if (a) return Number(a[1]);
    const f = (href || "").match(/(\d{2,4})x\d{2,4}/);
    return f ? Number(f[1]) : 0;
  };

  const icons = links
    .filter((tag) => /rel=["'][^"']*icon/i.test(tag))
    .map((tag) => {
      const href = attr(tag, "href");
      return {
        href,
        rel: (attr(tag, "rel") || "").toLowerCase(),
        size: px(tag, href),
        svg: /\.svg(\?|$)/i.test(href || "") || /image\/svg/i.test(attr(tag, "type") || ""),
      };
    })
    .filter((i) => i.href && !/mask-icon/.test(i.rel));

  const apple = icons.filter((i) => i.rel.includes("apple-touch-icon")).sort((a, b) => b.size - a.size)[0];
  if (apple) return abs(apple.href, pageUrl);

  // An SVG favicon is the brand mark itself and scales to any size.
  const svg = icons.find((i) => i.svg);
  if (svg) return abs(svg.href, pageUrl);

  const big = icons.filter((i) => i.size >= 64).sort((a, b) => b.size - a.size)[0];
  if (big) return abs(big.href, pageUrl);

  // Everything left is a 16/32px favicon; Google renders a larger one for us.
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(pageUrl).hostname}&sz=128`;
  } catch {
    return icons[0] ? abs(icons[0].href, pageUrl) : null;
  }
}

function parseSite(html, pageUrl) {
  const out = { description: null, logo: null, linkedin: null, x: null };

  out.description = meta(html, "og:description", "twitter:description", "description");

  out.logo = pickLogo(html, pageUrl);

  const li = html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]+/i);
  if (li) out.linkedin = li[0];

  const BAD = /^(intent|share|home|hashtag|search|i|privacy|tos|explore)$/i;
  const tw = html.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/i);
  if (tw && !BAD.test(tw[1])) out.x = "@" + tw[1];

  // JSON-LD often carries a cleaner description and a real logo.
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const walk = (n) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const t = [].concat(n["@type"] || []);
        if (t.some((x) => /Organization|Corporation|SoftwareApplication|Product/i.test(x || ""))) {
          if (!out.description && typeof n.description === "string")
            out.description = decode(n.description);
          if (typeof n.logo === "string") out.logo = abs(n.logo, pageUrl) || out.logo;
          else if (n.logo?.url) out.logo = abs(n.logo.url, pageUrl) || out.logo;
          for (const u of [].concat(n.sameAs || [])) {
            if (!out.linkedin && /linkedin\.com\/company/i.test(u)) out.linkedin = u;
            const h = /(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/i.exec(u);
            if (!out.x && h && !BAD.test(h[1])) out.x = "@" + h[1];
          }
        }
        for (const k of Object.keys(n)) if (typeof n[k] === "object") walk(n[k]);
      };
      walk(JSON.parse(m[1].trim()));
    } catch {}
  }

  if (out.description && out.description.length < 25) out.description = null;
  return out;
}

// ---- run -----------------------------------------------------------------
const targets = JSON.parse(readFileSync(IN, "utf8"));
console.log(`${targets.length} tools to fill from their own websites\n`);
console.log(`===== ${APPLY ? "APPLYING" : "DRY RUN"} =====`);

let filled = 0;
for (const t of targets) {
  if (!t.website) {
    console.log(`  ✗ ${t.name.padEnd(18)} no website on record`);
    continue;
  }
  const page = (await get(t.website)) || (await get(t.website.replace("https://", "https://www.")));
  if (!page) {
    console.log(`  ✗ ${t.name.padEnd(18)} site unreachable (${t.website})`);
    continue;
  }

  const d = parseSite(page.html, page.url);
  console.log(
    `  ${d.description || d.logo ? "✓" : "✗"} ${t.name.padEnd(18)} ` +
      `desc:${d.description ? d.description.length + "c" : "—"} ` +
      `logo:${d.logo ? "y" : "—"} li:${d.linkedin ? "y" : "—"} x:${d.x || "—"}`
  );
  if (d.description) console.log(`       "${d.description.slice(0, 110)}${d.description.length > 110 ? "…" : ""}"`);
  if (!APPLY) continue;

  // tools table — blanks only
  const { data: cur } = await supabase
    .from("tools")
    .select("description,logo_url,vendor_id,vendor:vendors(id,linkedin_profile,x_profile)")
    .eq("id", t.id)
    .single();

  const patch = {};
  if (!cur?.description && d.description) patch.description = d.description;
  if ((RELOGO || !cur?.logo_url) && d.logo) patch.logo_url = d.logo;
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("tools").update(patch).eq("id", t.id);
    if (error) console.error(`       tool: ${error.message}`);
    else filled++;
  }

  const vpatch = {};
  if (cur?.vendor && !cur.vendor.linkedin_profile && d.linkedin) vpatch.linkedin_profile = d.linkedin;
  if (cur?.vendor && !cur.vendor.x_profile && d.x) vpatch.x_profile = d.x;
  if (Object.keys(vpatch).length)
    await supabase.from("vendors").update(vpatch).eq("id", cur.vendor.id);

  await new Promise((r) => setTimeout(r, 300));
}

console.log(
  APPLY
    ? `\nDone. Updated ${filled} tools.`
    : `\nDry run only. Re-run with APPLY=1 to save.`
);
