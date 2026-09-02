/**
 * Diagnoses the DataDome hard-block on G2 by trying several routes through the
 * Web Unlocker and reporting which (if any) still return a real page.
 *
 * Costs ~8 requests. Blocked attempts are not billed.
 *
 *   BRIGHTDATA_TOKEN="..." node scripts/probe-g2.mjs [slug]
 */
const TOKEN = process.env.BRIGHTDATA_TOKEN;
const ZONE = process.env.BRIGHTDATA_ZONE || "web_unlocker1";
const SLUG = process.argv[2] || "airops";

if (!TOKEN) {
  console.error('Set BRIGHTDATA_TOKEN first:  $env:BRIGHTDATA_TOKEN = "<token>"');
  process.exit(1);
}

async function attempt(label, url, extra = {}) {
  const started = Date.now();
  try {
    const res = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone: ZONE, url, format: "raw", ...extra }),
    });
    const body = await res.text();
    const brd = [...res.headers]
      .filter(([k]) => k.toLowerCase().startsWith("x-brd"))
      .map(([k, v]) => `${k.replace("x-brd-", "")}=${v}`)
      .join(" ");
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const ok = res.ok && body.length > 5000;
    console.log(
      `  ${ok ? "OK  " : "FAIL"} ${label.padEnd(30)} ${String(res.status).padEnd(4)} ` +
        `${String(body.length).padStart(8)}b  ${secs}s  ${brd}`
    );
    return ok;
  } catch (e) {
    console.log(`  FAIL ${label.padEnd(30)} ${e.message}`);
    return false;
  }
}

console.log(`Probing G2 access for "${SLUG}" (zone: ${ZONE})\n`);
console.log("  result label                          status    bytes  time  brightdata");
console.log("  " + "-".repeat(86));

// Which page shapes are blocked?
await attempt("product /reviews (us)", `https://www.g2.com/products/${SLUG}/reviews`, { country: "us" });
await attempt("product, no /reviews (us)", `https://www.g2.com/products/${SLUG}`, { country: "us" });
await attempt("search page (us)", `https://www.g2.com/search?query=${SLUG}`, { country: "us" });

// Does the exit country change anything?
await attempt("product /reviews (no country)", `https://www.g2.com/products/${SLUG}/reviews`);
await attempt("product /reviews (gb)", `https://www.g2.com/products/${SLUG}/reviews`, { country: "gb" });
await attempt("product /reviews (de)", `https://www.g2.com/products/${SLUG}/reviews`, { country: "de" });

// Are the alternative directories reachable at all?
console.log("");
await attempt("capterra search", "https://www.capterra.com/search/?query=airops", { country: "us" });
await attempt("alternativeto", "https://alternativeto.net/software/airops/about/", { country: "us" });
await attempt("trustpilot", "https://www.trustpilot.com/review/airops.com", { country: "us" });
await attempt("sourceforge", "https://sourceforge.net/software/product/AirOps/", { country: "us" });

console.log(`
Read the results:
  - If any G2 row says OK, we switch the scraper to that route.
  - If every G2 row fails with dd_hardblock, G2 is closed to this product and we
    move to whichever alternative directories came back OK.
`);
