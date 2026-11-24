import { TopCategory } from "./homepage";

export interface CategoryGroup {
  /** Empty for categories that have no parent. */
  name: string;
  slug: string;
  categories: TopCategory[];
}

/** Categories whose own name or parent's name contains the text. */
export function filterCategories(categories: TopCategory[], text: string): TopCategory[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return categories;
  return categories.filter((c) =>
    [c.name, c.parent_name ?? ""].some((name) => name.toLowerCase().includes(needle))
  );
}

/**
 * Subcategories under their parent, both in their set order. Categories without
 * a parent come last, in the order given, in one unnamed group.
 */
export function groupCategories(categories: TopCategory[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup & { order: number }>();
  for (const category of categories) {
    const slug = category.parent_slug ?? "";
    let group = groups.get(slug);
    if (!group) {
      group = {
        name: category.parent_name ?? "",
        slug,
        categories: [],
        order: slug ? category.parent_sort_order ?? 0 : Infinity,
      };
      groups.set(slug, group);
    }
    group.categories.push(category);
  }
  return [...groups.values()]
    .sort((a, b) => (a.order === b.order ? 0 : a.order - b.order))
    .map(({ name, slug, categories: inGroup }) => ({
      name,
      slug,
      categories: slug
        ? [...inGroup].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        : inGroup,
    }));
}
