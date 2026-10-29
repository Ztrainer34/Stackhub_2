/**
 * Fetches pages and images for the tool-enricher / tool-enrichment-verifier
 * agents, so they never build shell commands out of scraped text or hold the
 * Bright Data token themselves.
 *
 * Input is a JSON file (written with the agent's Write tool, never on the
 * command line):
 *
 *   [ { "url": "https://www.capterra.com/p/123/Tella/", "name": "tella-capterra", "via": "unlocker" },
 *     { "url": "https://www.tella.tv/apple-touch-icon.png", "name": "tella-logo" } ]
 *
 *   via: "direct" (default) — a plain request
 *        "unlocker"         — through Bright Data's Web Unlocker (G2, Capterra,
 *                             GetApp, TrustRadius block plain requests)
 *
 * Each response is saved to <os tmpdir>/stackhub-fetch/<name>, and only there —
 * a name cannot point anywhere else. Prints status, content type, size and,
 * for PNG/JPEG/GIF/WebP, the image's width x height. Never prints the token.
 *
 *   node scripts/fetch-page.mjs <list.json>
 *
 * Env: BRIGHTDATA_TOKEN (only for via=unlocker), BRIGHTDATA_ZONE (default
 *      web_unlocker1), BRIGHTDATA_COUNTRIES (default gb,ie,au,ca)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = process.env.BRIGHTDATA_TOKEN;
const ZONE = process.env.BRIGHTDATA_ZONE || "web_unlocker1";
// DataDome hard-blocks the US pool on these directories; these get through.
const COUNTRIES = (process.env.BRIGHTDATA_COUNTRIES || "gb,ie,au,ca").split(",").map((c) => c.trim()).filter(Boolean);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const OUT_DIR = join(tmpdir(), "stackhub-fetch");

const listPath = process.argv[2];
if (!listPath) {
  console.error("Usage: node scripts/fetch-page.mjs <list.json>");
  process.exit(1);
}
const list = JSON.parse(readFileSync(listPath, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });

const isHttp = (s) => {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
};
const safeName = (s, i) => (String(s ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || `page-${i}`).slice(0, 80);

/** Width x height from the header bytes, without decoding the image. */
function dimensions(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: walk to the first SOF marker
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function direct(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, type: res.headers.get("content-type") || "", body: Buffer.from(await res.arrayBuffer()) };
}

async function unlocker(url) {
  if (!TOKEN) throw new Error("BRIGHTDATA_TOKEN is not set");
  let last;
  for (const country of COUNTRIES) {
    const res = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone: ZONE, url, format: "raw", country }),
      signal: AbortSignal.timeout(90000),
    });
    // Credentials or billing: every request will fail the same way. Stop.
    if ([401, 402, 403].includes(res.status)) {
      console.error(`Bright Data refused the request (${res.status}). Check the token and that zone "${ZONE}" is active.`);
      process.exit(2);
    }
    const body = Buffer.from(await res.arrayBuffer());
    last = { status: res.status, type: res.headers.get("content-type") || "", body, country };
    if (res.ok && body.length > 1000) return last; // a stub body means a blocked pool; try the next one
  }
  return last;
}

for (const [i, entry] of list.entries()) {
  const name = safeName(entry.name, i);
  if (!isHttp(entry.url)) {
    console.log(`✗ ${name}: not an http(s) URL — skipped`);
    continue;
  }
  try {
    const r = entry.via === "unlocker" ? await unlocker(entry.url) : await direct(entry.url);
    const out = join(OUT_DIR, name);
    writeFileSync(out, r.body);
    const dims = r.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(entry.url) ? dimensions(r.body) : null;
    console.log(
      `${r.status >= 200 && r.status < 300 ? "✓" : "✗"} ${name}: ${r.status} ${r.type || "?"} ${r.body.length}b` +
        (dims ? ` ${dims[0]}x${dims[1]}` : "") + (r.country ? ` via ${r.country}` : "") + ` -> ${out}`
    );
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
  }
}
