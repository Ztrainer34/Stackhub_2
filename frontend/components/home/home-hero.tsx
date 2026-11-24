import Link from "next/link";
import { Search } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES } from "@/lib/home/config";
import type { ChipTool } from "@/lib/home/types";

/**
 * Hero: headline and subline as on the live site, a search form (plain GET to
 * /search, works without JS) and a row of tool chips. Chips wrap on desktop and
 * become one swipeable row on phones.
 */
export function HomeHero({ chips }: { chips: ChipTool[] }) {
  return (
    <section className="px-4 pb-6 pt-10 text-center sm:pb-10 sm:pt-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
        {/* e2e/login.spec.ts finds this by data-testid, so the headline copy can change freely. Keep the attribute. */}
        <h1
          data-testid="landing-hero"
          className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
        >
          Find the GTM tools and playbooks you need
        </h1>
        <p className="text-lg text-muted-foreground">Show and tell for GTMs</p>

        <form role="search" action={HOME_ROUTES.search} method="get" className="mt-2 w-full max-w-xl">
          <label htmlFor="home-search" className="sr-only">
            Search StackHub
          </label>
          {/* Without t the search page sends the visitor back to the homepage. */}
          <input type="hidden" name="t" value="post" />
          {/* The hard shadow uses currentColor, so it follows the theme's foreground colour. */}
          <div className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-background py-1.5 pl-4 pr-1.5 text-foreground shadow-[0_5px_0_currentColor] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="home-search"
              name="q"
              type="search"
              autoComplete="off"
              placeholder="Search tools, users, posts"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-5"
            >
              Search
            </button>
          </div>
        </form>

        {chips.length > 0 && (
          <ul
            aria-label="Popular tools"
            className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-full sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
          >
            {chips.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={HOME_ROUTES.tool(c.slug)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3.5 text-sm font-medium transition-colors hover:border-foreground"
                >
                  <ToolLogoTile name={c.name} logoUrl={c.logoUrl} size="sm" />
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
