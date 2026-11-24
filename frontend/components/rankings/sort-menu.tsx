"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { rankingHref } from "@/lib/rankings/params";
import type { RankingParams, SortKey } from "@/lib/rankings/types";

type Props = {
  basePath: string;
  params: RankingParams;
  options: { key: SortKey; label: string }[];
};

/** Mobile only: "Sort by" menu + a button that flips high-to-low / low-to-high. */
export function SortMenu({ basePath, params, options }: Props) {
  const router = useRouter();
  const go = (p: Partial<RankingParams>) =>
    router.push(rankingHref(basePath, { ...params, ...p, page: 1 }), { scroll: false });
  const label = options.find((o) => o.key === params.sort)?.label ?? "";
  const flipLabel =
    params.dir === "desc"
      ? `Showing ${label} highest first. Tap to show lowest first`
      : `Showing ${label} lowest first. Tap to show highest first`;

  return (
    <div className="mt-6 flex items-end gap-2 lg:hidden">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="ranking-sort" className="text-sm font-semibold text-muted-foreground">
          Sort by
        </label>
        <select
          id="ranking-sort"
          value={params.sort}
          onChange={(e) => go({ sort: e.target.value as SortKey, dir: "desc" })}
          className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        aria-label={flipLabel}
        title={flipLabel}
        onClick={() => go({ dir: params.dir === "desc" ? "asc" : "desc" })}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-background"
      >
        {params.dir === "desc" ? (
          <ArrowDown className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
