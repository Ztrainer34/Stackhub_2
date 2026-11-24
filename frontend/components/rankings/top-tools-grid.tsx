import Link from "next/link";
import { SHOW_STACKS_LINKS } from "@/lib/home/config";
import { ROUTES } from "@/lib/rankings/config";
import type { TopToolsGroup } from "@/lib/rankings/types";
import { toolHref } from "@/lib/tool";
import { ToolLogoTile } from "./tool-logo-tile";

type Props = { title: string; intro: string; groups: TopToolsGroup[] };

/** "Top 3" cards under the table: one per category (on /rankings) or per subcategory (on a category page). */
export function TopToolsGrid({ title, intro, groups }: Props) {
  if (groups.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="font-heading text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">{title}</h2>
      <p className="mt-1.5 text-muted-foreground">
        {intro} <span className="md:hidden">Swipe to see more.</span>
      </p>
      {/* Phone: one swipe row (cards at 84% width). Desktop: grid. */}
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] md:gap-5 md:overflow-visible md:px-0 md:pb-0">
        {groups.map((g) => (
          <div key={g.href} className="flex w-[84%] shrink-0 snap-start flex-col rounded-2xl border bg-card p-5 md:w-auto">
            <h3 className="mb-2 text-lg font-bold">
              <Link href={g.href} className="hover:underline">
                {g.name}
              </Link>
            </h3>
            {g.tools.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-t py-2">
                <span className="w-5 font-bold text-muted-foreground">{t.rank}</span>
                <ToolLogoTile name={t.name} logoUrl={t.logoUrl} size="sm" />
                <Link href={toolHref(t)} className="flex-1 font-semibold hover:underline">
                  {t.name}
                </Link>
                {SHOW_STACKS_LINKS ? (
                  <Link
                    href={ROUTES.stacksWithTool(t.id)}
                    aria-label={`Explore the ${t.stacks} stacks that include ${t.name}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {t.stacks}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">{t.stacks}</span>
                )}
              </div>
            ))}
            {g.note && <p className="border-t pt-2.5 text-sm text-muted-foreground">{g.note}</p>}
            <Link href={g.href} className="mt-3 text-sm font-semibold hover:underline">
              See the full ranking
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
