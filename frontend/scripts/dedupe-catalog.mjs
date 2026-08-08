/**
 * Finds near-duplicate tools already in the catalog (e.g. "Brevo" vs
 * "Brevo Marketing Platform", or the same tool imported many times) and merges
 * each group into a single tool.
 *
 * For every duplicate group it:
 *   - picks a KEEPER (cleanest name; ties -> most references -> oldest)
 *   - fills the keeper's missing description / logo / vendor from a dup
 *   - re-points references (post/stack/watchlist/follow/key/categories/tickets)
 *   - deletes the duplicates (junctions cascade) and their orphan vendors
 *
 * Fast at scale: groups by normalized name in one pass; deletes unreferenced
 * duplicates in bulk.
 *
 * Dry-run (default): prints the shape + a sample plan, writes NOTHING.
 * Apply:  APPLY=1 node scripts/dedupe-catalog.mjs
 *
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node scripts/dedupe-catalog.mjs
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- name normalization (same filler words as the importer) ----
const NOISE = new Set([
  "the", "marketing", "platform", "app", "ai", "io", "inc", "software",
  "tool", "tools", "crm", "hq", "labs", "lab", "sales", "cloud", "suite",
  "pro", "co", "com", "solutions", "systems", "system",
]);
const tokensOf = (n) =>
  n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !NOISE.has(w));
const coreKey = (n) => tokensOf(n).join("");
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 2; // we only care about <=1
  if (!m) return n; if (!n) return m;
  let prev = [...Array(n + 1).keys()];
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
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

console.log("Loading tools…");
const tools = await allRows("tools", "id,name,description,logo_url,vendor_id,created_at");
console.log(`Loaded ${tools.length} tools.`);

const refCount = new Map(tools.map((t) => [t.id, 0]));
for (const tbl of ["post_tools", "stack_items", "watchlist_items", "tool_follows", "key_tools"]) {
  const rows = await allRows(tbl, "tool_id");
  rows.forEach((r) => refCount.set(r.tool_id, (refCount.get(r.tool_id) || 0) + 1));
}

// ---- group: exact normalized core (O(n)) + typo pass within alpha buckets ----
const parent = new Map(tools.map((t) => [t.id, t.id]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

const core = new Map();            // tool.id -> coreKey
const byCore = new Map();          // coreKey -> [tool.id]
for (const t of tools) {
  const c = coreKey(t.name);
  core.set(t.id, c);
  if (!c) continue;
  if (!byCore.has(c)) byCore.set(c, []);
  byCore.get(c).push(t.id);
}
for (const ids of byCore.values())
  for (let k = 1; k < ids.length; k++) union(ids[0], ids[k]);

// typo pass: only compare distinct cores that share the first 2 chars
const bucket = new Map();
for (const c of byCore.keys()) {
  const key = c.slice(0, 2);
  if (!bucket.has(key)) bucket.set(key, []);
  bucket.get(key).push(c);
}
for (const list of bucket.values()) {
  for (let a = 0; a < list.length; a++)
    for (let b = a + 1; b < list.length; b++)
      if (Math.min(list[a].length, list[b].length) >= 4 && lev(list[a], list[b]) <= 1)
        union(byCore.get(list[a])[0], byCore.get(list[b])[0]);
}

const groups = new Map();
for (const t of tools) {
  const g = find(t.id);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(t);
}
const dupGroups = [...groups.values()].filter((g) => g.length > 1);

// keeper = fewest significant tokens -> shortest name -> most refs -> oldest
const pickKeeper = (g) =>
  [...g].sort((a, b) =>
    tokensOf(a.name).length - tokensOf(b.name).length ||
    a.name.length - b.name.length ||
    (refCount.get(b.id) || 0) - (refCount.get(a.id) || 0) ||
    new Date(a.created_at) - new Date(b.created_at)
  )[0];

const totalDups = dupGroups.reduce((s, g) => s + g.length - 1, 0);
const referencedDups = dupGroups.flatMap((g) => {
  const keeper = pickKeeper(g);
  return g.filter((t) => t.id !== keeper.id && (refCount.get(t.id) || 0) > 0);
});

console.log(`\n===== ${APPLY ? "APPLYING" : "DRY RUN"} =====`);
console.log(`Distinct tools after dedupe : ${tools.length - totalDups}`);
console.log(`Duplicate groups            : ${dupGroups.length}`);
console.log(`Duplicate tools to remove   : ${totalDups}`);
console.log(`  …of which are referenced  : ${referencedDups.length} (refs re-pointed, not lost)`);

const biggest = [...dupGroups].sort((a, b) => b.length - a.length).slice(0, 12);
console.log(`\nBiggest duplicate groups:`);
for (const g of biggest) {
  const keeper = pickKeeper(g);
  console.log(`  ${String(g.length).padStart(3)}×  keep "${keeper.name}"  (e.g. ${g.slice(0, 3).map((t) => t.name).join(" | ")})`);
}

if (!APPLY) {
  console.log(`\nDry run only. Re-run with APPLY=1 to merge & delete.`);
  process.exit(0);
}

// ---- apply ----
const JUNCTIONS = [
  ["post_tools", "post_id", "post_id,tool_id"],
  ["stack_items", "profile_id", "profile_id,tool_id"],
  ["watchlist_items", "profile_id", "profile_id,tool_id"],
  ["tool_follows", "profile_id", "profile_id,tool_id"],
  ["key_tools", "profile_id", "profile_id,tool_id"],
  ["tool_categories", "category_id", "tool_id,category_id"],
];
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const dupToKeeper = new Map();   // dupId -> keeperId (for ticket re-point)
const toDelete = [];             // all dup ids
const vendorsToDrop = [];        // orphan vendor ids
const keeperVendors = new Set();

for (const g of dupGroups) {
  const keeper = pickKeeper(g);
  keeperVendors.add(keeper.vendor_id);
  const dups = g.filter((t) => t.id !== keeper.id);

  // fill keeper's missing fields from a dup (in-memory, no query)
  const patch = {};
  if (!keeper.description) patch.description = dups.find((d) => d.description)?.description ?? undefined;
  if (!keeper.logo_url) patch.logo_url = dups.find((d) => d.logo_url)?.logo_url ?? undefined;
  if (!keeper.vendor_id) patch.vendor_id = dups.find((d) => d.vendor_id)?.vendor_id ?? undefined;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length) {
    await supabase.from("tools").update(clean).eq("id", keeper.id);
    if (clean.vendor_id) keeperVendors.add(clean.vendor_id);
  }

  for (const d of dups) {
    dupToKeeper.set(d.id, keeper.id);
    // re-point references only for dups that actually have them
    if ((refCount.get(d.id) || 0) > 0) {
      for (const [table, partner, conflict] of JUNCTIONS) {
        const { data } = await supabase.from(table).select(partner).eq("tool_id", d.id);
        for (const r of data || [])
          await supabase.from(table).upsert({ [partner]: r[partner], tool_id: keeper.id }, { onConflict: conflict });
      }
    }
    toDelete.push(d.id);
    if (d.vendor_id) vendorsToDrop.push(d.vendor_id);
  }
}

// re-point resolved tickets that pointed at any duplicate
const tickets = await allRows("tool_tickets", "id,resolved_tool_id");
for (const t of tickets) {
  const keeperId = t.resolved_tool_id && dupToKeeper.get(t.resolved_tool_id);
  if (keeperId) await supabase.from("tool_tickets").update({ resolved_tool_id: keeperId }).eq("id", t.id);
}

// bulk delete the duplicate tools (junction rows cascade)
let removed = 0;
for (const ids of chunk(toDelete, 200)) {
  const { error } = await supabase.from("tools").delete().in("id", ids);
  if (error) { console.error("delete batch:", error.message); continue; }
  removed += ids.length;
  console.log(`  deleted ${removed}/${toDelete.length}`);
}

// drop now-orphaned vendors (not used by any keeper)
const dropVendors = [...new Set(vendorsToDrop)].filter((v) => v && !keeperVendors.has(v));
for (const ids of chunk(dropVendors, 200))
  await supabase.from("vendors").delete().in("id", ids);

console.log(`\nDone. Removed ${removed} duplicate tools; dropped ${dropVendors.length} orphan vendors.`);
