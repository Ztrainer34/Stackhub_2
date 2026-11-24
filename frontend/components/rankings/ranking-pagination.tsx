import Link from "next/link";
import { rankingHref } from "@/lib/rankings/params";
import type { RankingParams } from "@/lib/rankings/types";

type Props = { basePath: string; params: RankingParams; totalPages: number };

/**
 * Always shows the first page, the last page and the pages next to the current one.
 * Desktop: 1 2 3 4 5 … 18. Phone (narrow): 1 2 3 … 18.
 */
function pageList(cur: number, total: number, narrow: boolean): (number | "gap")[] {
  const set = new Set<number>([1, total, cur - 1, cur, cur + 1]);
  const edge = narrow ? 3 : 5;
  if (cur <= edge - 2) for (let n = 1; n <= edge; n++) set.add(n);
  if (cur >= total - (edge - 3)) for (let n = total - edge + 1; n <= total; n++) set.add(n);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

const box =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-[10px] border bg-card px-2.5 text-sm font-medium";

function PageNav({ cur, total, href, narrow }: { cur: number; total: number; href: (p: number) => string; narrow: boolean }) {
  const label = (text: string) => (narrow ? <span aria-hidden="true">{text.startsWith("←") ? "‹" : "›"}</span> : text);
  return (
    <nav
      aria-label="Ranking pages"
      className={`mt-4 items-center justify-center gap-1.5 ${narrow ? "flex md:hidden" : "hidden flex-wrap md:flex md:gap-2"}`}
    >
      {cur > 1 ? (
        <Link href={href(cur - 1)} rel="prev" aria-label="Previous page" className={`${box} hover:bg-muted`}>
          {label("← Prev")}
        </Link>
      ) : (
        <span aria-disabled="true" className={`${box} text-muted-foreground opacity-60`}>
          {label("← Prev")}
        </span>
      )}

      {pageList(cur, total, narrow).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="min-w-5 text-center text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-label={`Page ${p}`}
            aria-current={p === cur ? "page" : undefined}
            className={`${box} ${p === cur ? "border-foreground bg-muted font-semibold" : "hover:bg-muted"}`}
          >
            {p}
          </Link>
        ),
      )}

      {cur < total ? (
        <Link href={href(cur + 1)} rel="next" aria-label="Next page" className={`${box} hover:bg-muted`}>
          {label("Next →")}
        </Link>
      ) : (
        <span aria-disabled="true" className={`${box} text-muted-foreground opacity-60`}>
          {label("Next →")}
        </span>
      )}
    </nav>
  );
}

export function RankingPagination({ basePath, params, totalPages }: Props) {
  if (totalPages <= 1) return null;
  const cur = Math.min(params.page, totalPages);
  const href = (page: number) => rankingHref(basePath, { ...params, page });
  return (
    <>
      <PageNav cur={cur} total={totalPages} href={href} narrow={false} />
      <PageNav cur={cur} total={totalPages} href={href} narrow />
    </>
  );
}
