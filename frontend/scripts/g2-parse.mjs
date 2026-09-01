/**
 * Parsers for G2 pages, kept separate so they can be tested offline against
 * saved HTML (see PARSE mode in enrich-g2.mjs) without spending Unlocker
 * requests.
 *
 * G2 splits the data across two pages:
 *   /products/<slug>/reviews  -> product name, logo, link to the seller page
 *   /sellers/<slug>           -> HQ, year founded, website, LinkedIn, X
 */

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Text of the element following a "Label" cell in G2's details panel. */
export function labelled(html, label) {
  const m = html.match(new RegExp(label + "[\\s\\S]{0,400}?>([^<]{1,80})<", "i"));
  return m ? decode(m[1]) : null;
}

/** G2's own accounts must never be mistaken for the vendor's. */
const OWN_ACCOUNT = /g2dotcom|g2crowd|g2\b/i;

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * @param slug the product slug we requested — review pages are full of
 *   competitor images (ads, "compare with" widgets), so the page's own logo is
 *   identified by its FILENAME matching the product, not by position.
 */
export function parseProduct(html, slug = "") {
  const out = { name: null, logo: null, sellerSlug: null };

  const og = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,150}?)<\/h1>/i);
  const raw = og ? og[1] : h1 ? h1[1].replace(/<[^>]+>/g, "") : "";
  out.name =
    decode(raw)
      .replace(/\s+Reviews\b[\s\S]*$/i, "")
      .replace(/\s*\|\s*G2.*$/i, "")
      .trim() || null;

  const urls = [
    ...new Set(html.match(/https:\/\/images\.g2crowd\.com\/uploads\/product\/image\/[^"'\\\s)]+/gi) || []),
  ];
  // Match against both the slug we requested and the product name G2 shows —
  // our catalog name is often shorter ("6Sense" vs "6sense Revenue Marketing").
  const want = slugify(slug || out.name || "");
  const wantName = slugify(out.name || "");
  const basename = (u) => slugify(u.split("/").pop().replace(/\.[a-z0-9]+$/i, ""));
  // Prefer the crisp square/detail renditions over wide social banners.
  const rank = (u) =>
    /large_detail/i.test(u) ? 0 : /small_square/i.test(u) ? 1 : /social_landscape/i.test(u) ? 3 : 2;

  // Exact filename match wins over a prefix match (so "6sense Revenue
  // Marketing" doesn't borrow "6sense Sales"'s image), then prefer the size.
  const exact = (u) => (basename(u) === wantName || basename(u) === want ? 0 : 1);
  const mine = urls
    .filter((u) => {
      const b = basename(u);
      if (!b) return false;
      return [want, wantName].some(
        (w) => w && (b === w || b.startsWith(w) || w.startsWith(b))
      );
    })
    .sort((a, b) => exact(a) - exact(b) || rank(a) - rank(b));
  // No confident match => no logo. Never fall back to an arbitrary image.
  out.logo = mine[0] || null;

  const seller = html.match(/g2\.com\/sellers\/([a-z0-9][a-z0-9-]{0,80})/i);
  out.sellerSlug = seller ? seller[1] : null;

  out.description = parseDescription(html);

  return out;
}

export const countWords = (s) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * Takes G2's product description as written, keeping whole sentences up to a
 * ceiling. Short descriptions are used in full — there is no minimum, so a
 * 70-word entry stays 70 words rather than being padded out. Only long copy is
 * trimmed, and always on a sentence boundary.
 */
export function summarize(text, maxWords = 200) {
  if (!text) return null;
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];

  const kept = [];
  let words = 0;
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const w = countWords(s);
    if (words && words + w > maxWords) break; // next sentence would overflow
    kept.push(s);
    words += w;
  }

  let out = kept.join(" ").trim();
  // A single opening sentence longer than the cap: hard-trim it.
  if (!out) out = text.trim().split(/\s+/).slice(0, maxWords).join(" ") + "…";
  return out;
}

/** UI text and headings that mark the end of the overview prose. */
const DESC_END =
  /(Show More|Show Less|Seller Details|Product Website|Languages Supported|Pricing|Users? also|Recent .* Reviews|This product is)/i;

/**
 * G2 keeps the product overview inside a collapsed "Overview Details"
 * accordion — the prose is in the HTML even though it renders hidden.
 */
export function parseDescription(html) {
  const i = html.search(/Overview Details/i);
  if (i === -1) return null;
  const seg = html.slice(i, i + 14000);

  const marker = seg.search(/show-more-controller-target="container"[^>]*>/i);
  if (marker === -1) return null;
  let body = seg.slice(marker);
  body = body.slice(body.indexOf(">") + 1);

  let text = decode(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );

  const stop = text.search(DESC_END);
  if (stop > 120) text = text.slice(0, stop);

  text = text.trim();
  if (text.length < 60) return null;
  // Keep plenty of raw copy — summarize() decides the final length.
  if (text.length > 4000) {
    const cut = text.lastIndexOf(". ", 4000);
    text = cut > 400 ? text.slice(0, cut + 1) : text.slice(0, 4000).trim();
  }
  return text;
}

/** Placeholder values G2 shows when a seller left the field blank. */
const EMPTY = /^(n\/?a|none|not available|unknown|-+|—)$/i;

export function parseSeller(html) {
  const out = { hq: null, year: null, website: null, linkedin: null, x: null };

  const yr = labelled(html, "Year Founded");
  if (yr) {
    const m = yr.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (m) out.year = Number(m[1]);
  }

  const hq = labelled(html, "HQ Location");
  if (hq && !/^location/i.test(hq)) {
    const clean = hq.replace(/^:\s*/, "").trim();
    if (clean && !EMPTY.test(clean)) out.hq = clean.slice(0, 80);
  }

  // Vendor links are tagged with typed click events (seller_page_linkedin,
  // seller_page_company_website, ...). Reading those instead of scraping every
  // URL on the page is what keeps G2's own footer accounts out of the data.
  for (const attr of html.match(/data-event-options="([^"]*seller_page_[^"]*)"/gi) || []) {
    const url = (attr.match(/&quot;url&quot;:&quot;([^&]+)&quot;/i) || [])[1];
    const type = (attr.match(/seller_page_([a-z_]+)/i) || [])[1];
    if (!url || !type) continue;
    if (/linkedin/i.test(type) && !out.linkedin) out.linkedin = url;
    else if (/twitter|^x$/i.test(type) && !out.x) {
      const h = (url.match(/(?:twitter|x)\.com\/@?([A-Za-z0-9_]{2,30})/i) || [])[1];
      if (h && !OWN_ACCOUNT.test(h)) out.x = "@" + h;
    } else if (/website/i.test(type) && !out.website) out.website = url.split("?")[0];
  }

  // Fallbacks for pages that don't carry the typed events.
  if (!out.website) {
    const w = html.match(/Website<\/div>[\s\S]{0,400}?href="(https?:\/\/[^"]+)"/i);
    if (w) out.website = w[1].split("?")[0];
  }
  if (!out.linkedin) {
    const li = (html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]+/gi) || [])
      .find((u) => !OWN_ACCOUNT.test(u.split("/company/")[1] || ""));
    if (li) out.linkedin = li;
  }

  return out;
}
