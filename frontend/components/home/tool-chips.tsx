import Link from "next/link";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES } from "@/lib/home/config";
import type { ChipTool } from "@/lib/home/types";

/**
 * The tool chips under the search bar, moving to the right in an endless loop
 * (.chip-marquee in globals.css). It is the same list twice: when the first copy
 * has slid in, the animation restarts unnoticed. It pauses on hover. People who
 * ask for less motion, or who reach it with the keyboard, get a still list.
 */
export function ToolChips({ chips }: { chips: ChipTool[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="chip-marquee mt-2.5 w-full max-w-[760px]">
      <ChipList chips={chips} />
      <ChipList chips={chips} copy />
    </div>
  );
}

/** `copy`: seen and clickable, but skipped by screen readers and the Tab key. */
function ChipList({ chips, copy = false }: { chips: ChipTool[]; copy?: boolean }) {
  return (
    <ul aria-label={copy ? undefined : "Popular tools"} aria-hidden={copy || undefined}>
      {chips.map((c) => (
        <li key={c.slug} className="shrink-0">
          <Link
            href={HOME_ROUTES.tool(c.slug)}
            tabIndex={copy ? -1 : undefined}
            className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border bg-card pl-1.5 pr-3.5 text-[13px] font-medium transition-colors hover:border-foreground"
          >
            <ToolLogoTile name={c.name} logoUrl={c.logoUrl} size="chip" />
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
