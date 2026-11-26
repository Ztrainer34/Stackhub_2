import Link from "next/link";
import { Wrench } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES, SHOW_RANKING_LINKS } from "@/lib/home/config";
import type { TopToolsGroup } from "@/lib/rankings/types";
import { toolHref } from "@/lib/tool";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";
import { Rail, RailItem } from "./rail";

const RANK_STYLE = [
  "bg-foreground text-background",
  "bg-muted-foreground/25 text-foreground",
  "bg-muted text-muted-foreground",
];

/**
 * "Top tools used by GTMs": top 3 tools of each homepage category, by active stacks.
 * Data comes from getTopToolsByGroup() of the rankings, so the numbers always
 * match /rankings.
 */
export function TopToolsSection({ groups }: { groups: TopToolsGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="home-top-tools" className="px-4 pb-16 pt-6 sm:pt-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          id="home-top-tools"
          icon={Wrench}
          title="Top tools used by GTMs"
          action={SHOW_RANKING_LINKS ? { href: HOME_ROUTES.rankings, label: "View rankings" } : undefined}
        />
        <p className="-mt-2 mb-5 text-sm text-muted-foreground">
          Top 3 per category, ranked by how many stacks on StackHub include each tool.
        </p>
        <Rail>
          {groups.map((g) => (
            <RailItem key={g.href} className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{g.name}</h3>
                {SHOW_RANKING_LINKS && (
                  <Link
                    href={g.href}
                    className="whitespace-nowrap text-sm font-semibold hover:underline"
                    aria-label={`See the full ${g.name} ranking`}
                  >
                    See all
                  </Link>
                )}
              </div>
              <ol className="flex flex-col gap-1">
                {g.tools.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={toolHref(t)}
                      className="flex min-h-11 items-center gap-2.5 rounded-md px-1 hover:bg-muted/50"
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          RANK_STYLE[t.rank - 1],
                        )}
                      >
                        {t.rank}
                      </span>
                      <ToolLogoTile name={t.name} logoUrl={t.logoUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">in {t.stacks} stacks</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </RailItem>
          ))}
        </Rail>
      </div>
    </section>
  );
}
