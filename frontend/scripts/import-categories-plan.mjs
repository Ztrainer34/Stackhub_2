/**
 * The decisions behind scripts/import-categories.mjs, as pure functions: what
 * the file asks for, compared with what is in the database. No I/O and no side
 * effects on import, so it is unit-tested (tests/scripts/import-categories-plan.test.ts).
 */

export const MAX_PER_TOOL = 3;

export const slugify = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const lc = (s) => String(s ?? "").trim().toLowerCase();

/**
 * Problems in the file itself. Any of them stops the run.
 * @param {{ structure?: any[], tools?: any[], redirects?: Record<string, string | null>, leave_alone?: any[] }} file
 * @returns {string[]}
 */
export function fileProblems(file) {
  const problems = [];
  const slugs = new Map();
  const subs = new Set();
  const seen = (name, what) => {
    const slug = slugify(name);
    if (!slug) problems.push(`${what} with no usable name: "${name}"`);
    else if (slugs.has(slug)) problems.push(`"${name}" and "${slugs.get(slug)}" would share the page /category/${slug}`);
    else slugs.set(slug, name);
  };
  if (!file.structure?.length) problems.push("the file has no structure");
  for (const parent of file.structure ?? []) {
    seen(parent.name, "parent");
    if (!parent.subcategories?.length) problems.push(`parent "${parent.name}" has no subcategories`);
    for (const sub of parent.subcategories ?? []) {
      seen(sub, "subcategory");
      subs.add(sub);
    }
  }
  const ids = new Set();
  for (const t of file.tools ?? []) {
    if (!t.id || !t.name) problems.push(`tool "${t.name ?? t.id ?? "?"}" needs an id and a name`);
    if (ids.has(t.id)) problems.push(`tool "${t.name}" (${t.id}) is in the file twice`);
    ids.add(t.id);
    const cats = t.categories ?? [];
    if (cats.length > MAX_PER_TOOL) problems.push(`tool "${t.name}" has ${cats.length} categories (maximum ${MAX_PER_TOOL})`);
    if (new Set(cats).size !== cats.length) problems.push(`tool "${t.name}" lists a category twice`);
    for (const c of cats) if (!subs.has(c)) problems.push(`tool "${t.name}": "${c}" is not a subcategory`);
  }
  for (const t of file.leave_alone ?? []) if (ids.has(t.id)) problems.push(`tool "${t.name}" is both in tools and in leave_alone`);
  for (const [from, to] of Object.entries(file.redirects ?? {}))
    if (to !== null && !subs.has(to)) problems.push(`redirect "${from}": "${to}" is not a subcategory`);
  return problems;
}

/**
 * Which existing category row each parent/subcategory reuses (same name ignoring
 * case, else same page address), and which must be created.
 * @returns {{ targets: any[], problems: string[] }}
 */
export function planCategories(file, categories) {
  const problems = [];
  const byName = new Map();
  for (const c of categories) byName.set(lc(c.name), [...(byName.get(lc(c.name)) ?? []), c]);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const taken = new Map();
  const targets = [];
  const add = (name, parent, sortOrder) => {
    const slug = slugify(name);
    const sameName = byName.get(lc(name)) ?? [];
    const existing = bySlug.get(slug) ?? (sameName.length === 1 ? sameName[0] : null);
    if (!bySlug.get(slug) && sameName.length > 1) problems.push(`several categories are named "${name}"`);
    if (existing && taken.has(existing.id)) problems.push(`"${name}" and "${taken.get(existing.id)}" would reuse the same category row`);
    if (existing) taken.set(existing.id, name);
    // Another row already has this exact name under a different address.
    const clash = sameName.find((c) => existing && c.id !== existing.id);
    if (clash) problems.push(`"${name}" is also the name of category ${clash.id} (/category/${clash.slug})`);
    targets.push({ name, slug: existing?.slug ?? slug, parent, sort_order: sortOrder, id: existing?.id ?? null, was: existing ?? null });
  };
  (file.structure ?? []).forEach((p, i) => {
    add(p.name, null, i);
    p.subcategories.forEach((s, k) => add(s, p.name, k));
  });
  return { targets, problems };
}

/** Old categories to retire: everything that is not part of the structure. */
export function planRetire(file, categories, targets) {
  const kept = new Set(targets.map((t) => t.id).filter((id) => id !== null));
  const redirect = new Map(Object.entries(file.redirects ?? {}).map(([from, to]) => [lc(from), to]));
  return categories
    .filter((c) => !kept.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, to: redirect.get(lc(c.name)) ?? null }));
}

/**
 * What happens to each tool's categories.
 *   change    different from the file: replaced
 *   same      already as the file says
 *   edited    has a category that is neither one of its old ones nor part of the
 *             structure, so someone changed it since the file was made: left alone
 *   hidden    hidden since the file was made: left alone
 *   missing   no such tool, or the id now belongs to another name
 *   notInFile visible tools the file does not mention: left alone
 * @param {any} file
 * @param {{ id: string, name: string, hidden_at: string | null }[]} tools
 * @param {{ tool_id: string, category_id: number, position?: number }[]} links
 * @param {{ id: number, name: string }[]} categories
 * @returns {Record<"change" | "same" | "edited" | "hidden" | "missing" | "notInFile", any[]>}
 */
export function planTools(file, tools, links, categories) {
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const structure = new Set((file.structure ?? []).flatMap((p) => p.subcategories).map(slugify));
  const byTool = new Map();
  for (const l of [...links].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.category_id - b.category_id))
    byTool.set(l.tool_id, [...(byTool.get(l.tool_id) ?? []), nameOf.get(l.category_id) ?? `#${l.category_id}`]);
  const toolById = new Map(tools.map((t) => [t.id, t]));
  const out = { change: [], same: [], edited: [], hidden: [], missing: [], notInFile: [] };
  const asList = (names) => names.map(slugify).join("|");

  for (const t of file.tools ?? []) {
    const row = toolById.get(t.id);
    const entry = { id: t.id, name: t.name, categories: t.categories ?? [], current: byTool.get(t.id) ?? [] };
    if (!row || lc(row.name) !== lc(t.name)) out.missing.push({ ...entry, now: row?.name ?? null });
    else if (row.hidden_at) out.hidden.push(entry);
    else if (asList(entry.current) === asList(entry.categories)) out.same.push(entry);
    else {
      // Untouched since the file was made, imported by an earlier run, or a mix of
      // both: what a run that stopped halfway leaves behind.
      const expected = new Set([...structure, ...(t.old_categories ?? []).map(slugify)]);
      (entry.current.every((c) => expected.has(slugify(c))) ? out.change : out.edited).push(entry);
    }
  }
  const known = new Set([...(file.tools ?? []), ...(file.leave_alone ?? []), ...(file.hide ?? [])].map((t) => t.id));
  for (const t of tools) if (!t.hidden_at && !known.has(t.id)) out.notInFile.push({ id: t.id, name: t.name });
  return out;
}

/** The tools in file.hide that may be hidden: exist, still visible, in no post. */
export function planHide(file, tools, postToolIds) {
  const toolById = new Map(tools.map((t) => [t.id, t]));
  const used = new Set(postToolIds);
  const out = { hide: [], inPosts: [], already: [], missing: [] };
  for (const t of file.hide ?? []) {
    const row = toolById.get(t.id);
    if (!row || lc(row.name) !== lc(t.name)) out.missing.push(t);
    else if (row.hidden_at) out.already.push(t);
    else if (used.has(t.id)) out.inPosts.push(t);
    else out.hide.push(t);
  }
  return out;
}
