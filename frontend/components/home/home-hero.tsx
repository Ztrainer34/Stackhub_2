import Link from "next/link";
import { Search } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES } from "@/lib/home/config";
import type { ChipTool } from "@/lib/home/types";

/**
 * Hero: headline and subline, a search form (plain GET to /search, works without
 * JS) and a row of tool chips. Chips wrap on desktop and become one swipeable
 * row on phones.
 */
export function HomeHero({ chips }: { chips: ChipTool[] }) {
  return (
    <section className="px-4 pb-6 pt-10 text-center min-[641px]:pb-10 min-[641px]:pt-[72px] min-[901px]:px-10">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-5">
        {/* e2e/login.spec.ts finds this by data-testid, so the headline copy can change freely. Keep the attribute. */}
        <h1
          data-testid="landing-hero"
          className="max-w-[860px] font-heading text-[40px] font-bold leading-[1.02] tracking-[-0.035em] min-[901px]:text-[64px]"
        >
          Find the GTM tools and playbooks you need
        </h1>
        <p className="text-[19px] text-[#4F535E]">Show and tell for GTMs</p>

        <form role="search" action={HOME_ROUTES.search} method="get" className="mt-2 w-full max-w-[640px]">
          <label htmlFor="home-search" className="sr-only">
            Search StackHub
          </label>
          {/* Without t the search page sends the visitor back to the homepage. */}
          <input type="hidden" name="t" value="post" />
          <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-foreground bg-card py-1.5 pl-3.5 pr-1.5 shadow-[0_6px_0_hsl(var(--foreground))] focus-within:border-brand min-[641px]:pl-[18px]">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="home-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Search tools, users, posts"
              className="min-w-0 flex-1 bg-transparent py-3 text-[15px] leading-normal outline-none placeholder:text-muted-foreground min-[641px]:text-base"
            />
            <button
              type="submit"
              className="min-h-11 shrink-0 rounded-xl bg-brand px-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 min-[641px]:px-5"
            >
              Search
            </button>
          </div>
        </form>

        {chips.length > 0 && (
          <ul
            aria-label="Popular tools"
            className="-mx-4 mt-2.5 flex w-[calc(100%+2rem)] max-w-none gap-2 overflow-x-auto px-4 pb-1 min-[641px]:mx-0 min-[641px]:w-full min-[641px]:max-w-[760px] min-[641px]:flex-wrap min-[641px]:justify-center min-[641px]:overflow-visible min-[641px]:px-0 min-[641px]:pb-0"
          >
            {chips.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={HOME_ROUTES.tool(c.slug)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border bg-card pl-1.5 pr-3.5 text-[13px] font-medium transition-colors hover:border-foreground"
                >
                  <ToolLogoTile name={c.name} logoUrl={c.logoUrl} size="chip" />
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
