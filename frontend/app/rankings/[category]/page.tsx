import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RankingPage } from "@/components/rankings/ranking-page";
import { ROUTES } from "@/lib/rankings/config";
import { canonicalPath, parseRankingParams } from "@/lib/rankings/params";
import {
  getCategoryTree,
  getRanking,
  getRankingSummary,
  getTopToolsByGroup,
  getViewer,
} from "@/lib/rankings/queries";
import { categoryHref, findCategory, subcategoryHref } from "@/lib/rankings/ranking";

type PageProps = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const category = findCategory(await getCategoryTree(), (await params).category);
  if (!category) return {};
  const p = parseRankingParams(await searchParams);
  const summary = await getRankingSummary({ level: "category", category }, p);
  return {
    title: `Top ${category.name} tools, ranked by real stacks | StackHub`,
    description: `The ${category.name} tools GTM people actually use, ranked by how many real stacks include them.`,
    alternates: { canonical: canonicalPath(categoryHref(category), { ...p, page: summary.page }) },
    // A ranking with no ranked tool is an empty page: keep it out of search results.
    ...(summary.totalRanked === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryRankingPage({ params, searchParams }: PageProps) {
  const category = findCategory(await getCategoryTree(), (await params).category);
  if (!category) notFound();
  const p = parseRankingParams(await searchParams);
  const scope = { level: "category", category } as const;
  const viewer = await getViewer();
  const [result, groups] = await Promise.all([
    getRanking(scope, p, viewer),
    getTopToolsByGroup(scope),
  ]);
  const n = category.subcategories.length;

  return (
    <RankingPage
      basePath={categoryHref(category)}
      breadcrumb={[{ name: "Rankings", href: ROUTES.rankings }, { name: category.name }]}
      title={`Top ${category.name} tools`}
      intro={`All ${n} ${category.name} subcategories in one ranking. A tool in 2 subcategories is counted once.`}
      chipsLabel={`Rankings in ${category.name}`}
      chips={[
        { name: `All ${category.name}`, href: categoryHref(category), current: true },
        ...category.subcategories.map((s) => ({
          name: s.name,
          href: subcategoryHref(category, s),
          current: false,
        })),
      ]}
      result={result}
      params={p}
      viewer={viewer}
      top={{
        title: "Top 3 in each subcategory",
        intro: "Ranked by active stacks. Open a subcategory for the full ranking.",
        groups,
      }}
    />
  );
}
