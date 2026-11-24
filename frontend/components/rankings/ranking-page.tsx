import Link from "next/link";
import { SITE_URL } from "@/lib/rankings/config";
import { showStackBanner, stackBannerHref } from "@/lib/rankings/ranking";
import type { RankingParams, RankingResult, TopToolsGroup, Viewer } from "@/lib/rankings/types";
import { toolHref } from "@/lib/tool";
import { RankingPagination } from "./ranking-pagination";
import { RankingTable } from "./ranking-table";
import { TopToolsGrid } from "./top-tools-grid";

type Crumb = { name: string; href?: string };
type Chip = { name: string; href: string; current: boolean };

type Props = {
  basePath: string;
  breadcrumb: Crumb[];
  title: string;
  intro: string;
  chipsLabel: string;
  chips: Chip[];
  result: RankingResult;
  params: RankingParams;
  viewer: Viewer;
  top?: { title: string; intro: string; groups: TopToolsGroup[] };
};

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Tool names are written by users: a "</script>" in one must not end the
 * script tag, so "<" is escaped inside the JSON.
 */
function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Shared layout of the 3 ranking pages. The site header, footer and <main> come
 * from the app layout.
 */
export function RankingPage(p: Props) {
  const showCta = showStackBanner(p.viewer);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: p.title,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: p.result.totalRanked,
    itemListElement: p.result.tools.map((t) => ({
      "@type": "ListItem",
      position: t.rank,
      name: t.name,
      url: `${SITE_URL}${toolHref(t)}`,
    })),
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {p.breadcrumb.map((c, i) => (
          <span key={c.name} className="flex gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-foreground hover:underline">
                {c.name}
              </Link>
            ) : (
              <span className="text-foreground" aria-current="page">
                {c.name}
              </span>
            )}
          </span>
        ))}
      </nav>

      <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-tight md:text-[44px]">{p.title}</h1>
      <p className="mt-2.5 text-muted-foreground">
        {p.intro} Based on {p.result.totalStacks.toLocaleString("en-US")} active stacks · Updated{" "}
        {formatDate(p.result.updatedAt)}
      </p>

      <p className="mb-2.5 mt-7 text-sm font-semibold text-muted-foreground">{p.chipsLabel}</p>
      {/* Phone: one row that scrolls sideways. Desktop: wraps. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {p.chips.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            aria-current={c.current ? "page" : undefined}
            className={
              c.current
                ? "shrink-0 whitespace-nowrap rounded-full border border-primary bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground"
                : "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {c.name}
          </Link>
        ))}
      </div>

      <RankingTable result={p.result} params={p.params} basePath={p.basePath} />
      <RankingPagination basePath={p.basePath} params={p.params} totalPages={p.result.totalPages} />

      {p.top && <TopToolsGrid title={p.top.title} intro={p.top.intro} groups={p.top.groups} />}

      {showCta && (
        <section className="mt-12 flex flex-col gap-4 rounded-lg bg-muted/50 p-6 md:flex-row md:flex-wrap md:items-center md:justify-between md:p-7">
          <h2 className="text-xl font-bold">Every stack counts. Is yours there?</h2>
          <Link
            href={stackBannerHref(p.viewer)}
            className="rounded-lg bg-primary px-5 py-3.5 text-center text-[15px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add your stack
          </Link>
        </section>
      )}
    </div>
  );
}
