import { redirect } from "next/navigation";

import { Category, categoryRedirect, getCategoryBySlug } from "@/lib/category";
import { CategoryPage } from "./category-page";

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const slug = decodeURIComponent(name);

  // A failed lookup is not a reason to fail the page: the client component
  // fetches again and shows its own error.
  let category: Category | null = null;
  try {
    category = await getCategoryBySlug(slug);
  } catch {
    category = null;
  }

  // Temporary on purpose: browsers remember permanent redirects, and where an
  // old category goes may still be corrected.
  const target = category ? categoryRedirect(category) : null;
  if (target) redirect(target);

  return <CategoryPage categorySlug={slug} />;
}
