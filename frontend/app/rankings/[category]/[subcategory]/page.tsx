import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RankingPage } from "@/components/rankings/ranking-page";
import { ROUTES } from "@/lib/rankings/config";
import { canonicalPath, parseRankingParams } from "@/lib/rankings/params";
import {
  getCategoryTree,
  getRanking,
  getRankingSummary,
  getViewer,
} from "@/lib/rankings/queries";
import { categoryHref, findSubcategory, subcategoryHref } from "@/lib/rankings/ranking";

type PageProps = {
  params: Promise<{ category: string; subcategory: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { category: c, subcategory: s } = await params;
  const found = findSubcategory(await getCategoryTree(), c, s);
  if (!found) return {};
  const p = parseRankingParams(await searchParams);
  const summary = await getRankingSummary({ level: "subcategory", ...found }, p);
  return {
    title: `Top tools for ${found.sub.name}, ranked by real stacks | StackHub`,
    description: `The ${found.sub.name} tools GTM people actually use, ranked by how many real stacks include them.`,
    alternates: {
      canonical: canonicalPath(subcategoryHref(found.category, found.sub), { ...p, page: summary.page }),
    },
    // A ranking with no ranked tool is an empty page: keep it out of search results.
    ...(summary.totalRanked === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SubcategoryRankingPage({ params, searchParams }: PageProps) {
  const { category: c, subcategory: s } = await params;
  const found = findSubcategory(await getCategoryTree(), c, s);
  if (!found) notFound();
  const { category, sub } = found;
  const p = parseRankingParams(await searchParams);
  const viewer = await getViewer();
  const result = await getRanking({ level: "subcategory", category, sub }, p, viewer);

  return (
    <RankingPage
      basePath={subcategoryHref(category, sub)}
      breadcrumb={[
        { name: "Rankings", href: ROUTES.rankings },
        { name: category.name, href: categoryHref(category) },
        { name: sub.name },
      ]}
      title={`Top tools for ${sub.name}`}
      intro="Ranked by what GTM people actually have in their stack."
      chipsLabel={`Other rankings in ${category.name}`}
      chips={[
        { name: `All ${category.name}`, href: categoryHref(category), current: false },
        ...category.subcategories.map((x) => ({
          name: x.name,
          href: subcategoryHref(category, x),
          current: x.slug === sub.slug,
        })),
      ]}
      result={result}
      params={p}
      viewer={viewer}
    />
  );
}
