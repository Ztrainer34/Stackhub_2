import Link from "next/link";
import { Wrench } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES, SHOW_RANKING_LINKS } from "@/lib/home/config";
import type { TopToolsGroup } from "@/lib/rankings/types";
import { toolHref } from "@/lib/tool";
import { cn } from "@/lib/utils";
import { HOME_CARD, HomeSection, SectionHeader } from "./section-header";
import { Rail, RailItem } from "./rail";

const RANK_STYLE = ["bg-foreground text-white", "bg-border text-foreground", "bg-muted text-ink-2"];

/**
 * "Top tools used by GTMs": top 3 tools of each homepage category, by active stacks.
 * Data comes from getTopToolsByGroup() of the rankings, so the numbers always
 * match /rankings.
 */
export function TopToolsSection({ groups }: { groups: TopToolsGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <HomeSection labelledBy="home-top-tools">
      <SectionHeader
        id="home-top-tools"
        icon={Wrench}
        title="Top tools used by GTMs"
        action={SHOW_RANKING_LINKS ? { href: HOME_ROUTES.rankings, label: "View rankings" } : undefined}
      />
      <p className="-mt-1.5 mb-[18px] text-sm text-muted-foreground">
        Top 3 per category, ranked by how many stacks on StackHub include each tool.
      </p>
      <Rail>
        {groups.map((g) => (
          <RailItem key={g.href} className={cn(HOME_CARD, "flex flex-col gap-3 p-[18px]")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold">{g.name}</h3>
              {SHOW_RANKING_LINKS && (
                <Link
                  href={g.href}
                  className="whitespace-nowrap text-[13px] font-semibold text-[#2448E0] hover:underline"
                  aria-label={`See the full ${g.name} ranking`}
                >
                  See all
                </Link>
              )}
            </div>
            <ol className="flex flex-col gap-2">
              {g.tools.map((t) => (
                <li key={t.id}>
                  <Link href={toolHref(t)} className="group flex min-h-11 items-center gap-2.5">
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        RANK_STYLE[t.rank - 1],
                      )}
                    >
                      {t.rank}
                    </span>
                    <ToolLogoTile name={t.name} logoUrl={t.logoUrl} size="sm" />
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug group-hover:underline">
                      {t.name}
                    </span>
                    <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">in {t.stacks} stacks</span>
                  </Link>
                </li>
              ))}
            </ol>
          </RailItem>
        ))}
      </Rail>
    </HomeSection>
  );
}
