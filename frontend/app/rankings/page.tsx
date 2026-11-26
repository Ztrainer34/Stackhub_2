import type { Metadata } from "next";
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
import { categoryHref } from "@/lib/rankings/ranking";
import type { RankingScope } from "@/lib/rankings/types";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const BASE = ROUTES.rankings;
const scope: RankingScope = { level: "all" };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = parseRankingParams(await searchParams);
  const [tree, summary] = await Promise.all([getCategoryTree(), getRankingSummary(scope, params)]);
  return {
    title: "Top GTM tools, ranked by real stacks | StackHub",
    description: `The GTM tools people actually use, ranked by how many real stacks include them. Across ${tree.length} categories, from outbound to CRM and AI.`,
    alternates: { canonical: canonicalPath(BASE, { ...params, page: summary.page }) },
    // A ranking with no ranked tool is an empty page: keep it out of search results.
    ...(summary.totalRanked === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RankingsPage({ searchParams }: PageProps) {
  const params = parseRankingParams(await searchParams);
  const viewer = await getViewer();
  const [tree, result, groups] = await Promise.all([
    getCategoryTree(),
    getRanking(scope, params, viewer),
    getTopToolsByGroup(scope),
  ]);

  return (
    <RankingPage
      basePath={BASE}
      breadcrumb={[{ name: "Rankings" }]}
      title="Top GTM tools"
      intro={`All ${tree.length} categories in one ranking, by what GTM people actually have in their stack.`}
      chipsLabel="Rankings by category"
      chips={[
        { name: "All categories", href: BASE, current: true },
        ...tree.map((c) => ({ name: c.name, href: categoryHref(c), current: false })),
      ]}
      result={result}
      params={params}
      viewer={viewer}
      top={{
        title: "Rankings by category",
        intro: "Top 3 tools in each category, by active stacks. Open a category for its full ranking.",
        groups,
      }}
    />
  );
}
