import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { SHOW_STACKS_LINKS } from "@/lib/home/config";
import { MIN_STACKS_TO_RANK, ROUTES, SHOW_LATER } from "@/lib/rankings/config";
import { sortHref, sortableKeys } from "@/lib/rankings/params";
import type { RankedTool, RankingParams, RankingResult, SortKey } from "@/lib/rankings/types";
import { toolHref } from "@/lib/tool";
import { RankingToolActions } from "./ranking-tool-actions";
import { SortMenu } from "./sort-menu";
import { ToolLogoTile } from "./tool-logo-tile";
import { UsedBy } from "./used-by";

type Props = { result: RankingResult; params: RankingParams; basePath: string };

const SORT_LABELS: Record<SortKey, string> = {
  stacks: "In stacks",
  playbooks: "Playbooks",
  saved: "Saved",
  trend: "30 days",
  kept: "Kept by",
};

const SORT_CAPTIONS: Record<SortKey, string> = {
  stacks: "number of active stacks that include the tool",
  playbooks: "number of playbooks that use the tool",
  saved: "number of people who saved the tool for later",
  trend: "stacks gained minus stacks lost in the last 30 days",
  kept: "share of people who kept the tool after adding it",
};

const thBase = "px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const numLink = "font-semibold text-foreground hover:underline";

function SortTh({ k, params, basePath }: { k: SortKey; params: RankingParams; basePath: string }) {
  const active = params.sort === k;
  const label = SORT_LABELS[k];
  return (
    <th
      scope="col"
      aria-sort={active ? (params.dir === "desc" ? "descending" : "ascending") : "none"}
      className={thBase}
    >
      <Link
        href={sortHref(basePath, params, k)}
        scroll={false}
        title={`Sort by ${label}`}
        className={`inline-flex min-h-11 items-center gap-1 hover:text-foreground ${active ? "font-bold text-foreground" : ""}`}
      >
        {label}
        {active && params.dir === "desc" && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
        {active && params.dir === "asc" && <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
        {!active && <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}
      </Link>
    </th>
  );
}

function formatTrend(v: number | null) {
  if (v === null) return { text: "–", cls: "text-muted-foreground" };
  if (v > 0) return { text: `+${v}`, cls: "text-blue-700" };
  if (v < 0) return { text: `−${Math.abs(v)}`, cls: "text-orange-700" };
  return { text: "0", cls: "text-muted-foreground" };
}

const formatKept = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

function ToolName({ t }: { t: Pick<RankedTool, "id" | "name" | "logoUrl" | "labels"> }) {
  const href = toolHref(t);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <ToolLogoTile name={t.name} logoUrl={t.logoUrl} />
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={href} className="font-semibold hover:underline">
          {t.name}
        </Link>
        {t.labels.length > 0 && (
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
            {t.labels.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground hover:underline">
                {l.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const stacksLabel = (t: RankedTool) => `Explore the ${t.stacks} stacks that include ${t.name}`;
const playbooksWord = (n: number) => (n === 1 ? "playbook" : "playbooks");
const playbooksLabel = (t: RankedTool) =>
  t.playbooks === 1
    ? `Browse the playbook that uses ${t.name}`
    : `Browse the ${t.playbooks} playbooks that use ${t.name}`;

/** The "in stacks" number: a link to Explore stacks once that page exists, plain text until then. */
function StacksNumber({ t }: { t: RankedTool }) {
  if (!SHOW_STACKS_LINKS) return <span className="font-semibold">{t.stacks}</span>;
  return (
    <Link href={ROUTES.stacksWithTool(t.id)} aria-label={stacksLabel(t)} className={numLink}>
      {t.stacks}
    </Link>
  );
}

/** The playbooks number: a link to Browse playbooks, plain text when there is nothing to browse. */
function PlaybooksNumber({ t }: { t: RankedTool }) {
  if (t.playbooks === 0) return <span className="font-semibold">0</span>;
  return (
    <Link href={ROUTES.playbooksWithTool(t.id)} aria-label={playbooksLabel(t)} className={numLink}>
      {t.playbooks}
    </Link>
  );
}

/**
 * Desktop (lg and up): a table with sortable column titles. Below: a list with a
 * Sort by menu. The table needs about 900px, so it does not fit at md.
 */
export function RankingTable({ result, params, basePath }: Props) {
  const empty = result.tools.length === 0 && result.unranked.length === 0;
  const emptyText = `Not enough data yet. No tool here is in ${MIN_STACKS_TO_RANK} stacks so far.`;
  const unrankedText = (n: number) =>
    `Not ranked yet: in ${n} ${n === 1 ? "stack" : "stacks"}, ranking starts at ${MIN_STACKS_TO_RANK}`;

  return (
    <>
      <SortMenu
        basePath={basePath}
        params={params}
        options={sortableKeys().map((k) => ({ key: k, label: SORT_LABELS[k] }))}
      />

      <p className="mt-3 text-sm text-muted-foreground lg:mt-8">
        Sorted by {SORT_CAPTIONS[params.sort]}, {params.dir === "desc" ? "highest first" : "lowest first"}.
      </p>

      {/* ---------- Desktop table ---------- */}
      {/* relative: keeps the sr-only column title inside the scroll box, or it widens the page. */}
      <div className="relative mt-3 hidden overflow-x-auto rounded-lg border shadow-sm lg:block">
        <table className="w-full min-w-[900px] border-collapse text-[15px]">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className={`${thBase} w-14 pl-5`}>#</th>
              <th scope="col" className={thBase}>Tool</th>
              <SortTh k="stacks" params={params} basePath={basePath} />
              <SortTh k="playbooks" params={params} basePath={basePath} />
              {SHOW_LATER && <SortTh k="trend" params={params} basePath={basePath} />}
              {SHOW_LATER && <SortTh k="kept" params={params} basePath={basePath} />}
              <SortTh k="saved" params={params} basePath={basePath} />
              <th scope="col" className={thBase}>Used by</th>
              <th scope="col" className={`${thBase} pr-5`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.tools.map((t) => {
              const trend = formatTrend(t.trend30d);
              return (
                <tr key={t.id} className="border-t">
                  <td className="py-3.5 pl-5 pr-3 text-xl font-bold">{t.rank}</td>
                  <td className="px-3 py-3.5">
                    <ToolName t={t} />
                  </td>
                  <td className="px-3 py-3.5">
                    <StacksNumber t={t} />
                  </td>
                  <td className="px-3 py-3.5">
                    <PlaybooksNumber t={t} />
                  </td>
                  {SHOW_LATER && <td className={`px-3 py-3.5 font-semibold ${trend.cls}`}>{trend.text}</td>}
                  {SHOW_LATER && <td className="px-3 py-3.5">{formatKept(t.keptRate)}</td>}
                  {/* Total only. "Save for later" is private, so this number is not a link. */}
                  <td className="px-3 py-3.5 font-semibold">{t.savedForLater}</td>
                  <td className="px-3 py-3.5">
                    <UsedBy users={t.usedBy} totalStacks={t.stacks} toolName={t.name} toolId={t.id} />
                  </td>
                  <td className="py-3.5 pl-3 pr-5">
                    <RankingToolActions toolId={t.id} toolName={t.name} />
                  </td>
                </tr>
              );
            })}

            {result.unranked.map((u) => (
              <tr key={u.id} className="border-t bg-muted/30">
                <td className="py-3.5 pl-5 pr-3 text-muted-foreground">–</td>
                <td className="px-3 py-3.5">
                  <Link href={toolHref(u)} className="flex items-center gap-3 font-semibold text-muted-foreground hover:underline">
                    <ToolLogoTile name={u.name} logoUrl={u.logoUrl} />
                    {u.name}
                  </Link>
                </td>
                <td colSpan={SHOW_LATER ? 7 : 5} className="px-3 py-3.5 text-sm text-muted-foreground">
                  {unrankedText(u.stacks)}
                </td>
              </tr>
            ))}

            {empty && (
              <tr className="border-t">
                <td colSpan={SHOW_LATER ? 9 : 7} className="px-5 py-10 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Phone list ---------- */}
      <ol className="mt-3 overflow-hidden rounded-lg border shadow-sm lg:hidden">
        {result.tools.map((t) => {
          const trend = formatTrend(t.trend30d);
          return (
            <li key={t.id} className="border-t p-4 first:border-t-0">
              <div className="flex items-center gap-3">
                <span className="w-7 shrink-0 text-lg font-bold">{t.rank}</span>
                <ToolName t={t} />
              </div>
              <div className="ml-10 mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <StacksNumber t={t} /> in stacks
                </span>
                <span>
                  <PlaybooksNumber t={t} /> {playbooksWord(t.playbooks)}
                </span>
                <span>
                  <strong className="text-foreground">{t.savedForLater}</strong> saved
                </span>
                {SHOW_LATER && (
                  <span>
                    <strong className={trend.cls}>{trend.text}</strong> in 30 days
                  </span>
                )}
                {SHOW_LATER && (
                  <span>
                    kept by <strong className="text-foreground">{formatKept(t.keptRate)}</strong>
                  </span>
                )}
              </div>
              <div className="ml-10 mt-2.5 flex items-center justify-between gap-2">
                <UsedBy users={t.usedBy} totalStacks={t.stacks} toolName={t.name} toolId={t.id} />
                <RankingToolActions toolId={t.id} toolName={t.name} />
              </div>
            </li>
          );
        })}

        {result.unranked.map((u) => (
          <li key={u.id} className="flex items-center gap-3 border-t bg-muted/30 p-4 first:border-t-0">
            <span className="w-7 shrink-0 text-muted-foreground">–</span>
            <ToolLogoTile name={u.name} logoUrl={u.logoUrl} />
            <div className="flex flex-col gap-0.5">
              <Link href={toolHref(u)} className="font-semibold text-muted-foreground hover:underline">
                {u.name}
              </Link>
              <span className="text-[13px] text-muted-foreground">{unrankedText(u.stacks)}</span>
            </div>
          </li>
        ))}

        {empty && <li className="p-6 text-center text-muted-foreground">{emptyText}</li>}
      </ol>

      <p className="mt-3 hidden text-sm text-muted-foreground lg:block">
        Click a column title to sort by it. Click it again to flip the order.
      </p>
    </>
  );
}
