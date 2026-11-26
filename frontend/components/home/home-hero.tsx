import Link from "next/link";

import { HOME_ROUTES } from "@/lib/home/config";
import type { ChipTool } from "@/lib/home/types";
import { ToolChips } from "./tool-chips";

/**
 * Hero: headline and subline, then 2 buttons, one for creators (Add your stack)
 * and one for GTM visitors (Browse playbooks), and the moving row of tool chips.
 * Search lives in the header (PublicNav).
 */
export function HomeHero({ chips }: { chips: ChipTool[] }) {
  return (
    <section className="px-4 pb-4 pt-10 text-center sm:pb-6 sm:pt-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
        {/* e2e/login.spec.ts finds this by data-testid, so the headline copy can change freely. Keep the attribute. */}
        <h1
          data-testid="landing-hero"
          className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
        >
          Discover the best GTM tools and playbooks
        </h1>
        <p className="text-lg text-muted-foreground">Show and tell for GTMs.</p>

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link
            href={HOME_ROUTES.addStack}
            className="inline-flex h-12 items-center rounded-md bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add your stack
          </Link>
          <Link
            href={HOME_ROUTES.playbooks}
            className="inline-flex h-12 items-center rounded-md border bg-background px-6 font-semibold transition-colors hover:bg-muted"
          >
            Browse playbooks
          </Link>
        </div>

        <ToolChips chips={chips} />
      </div>
    </section>
  );
}
