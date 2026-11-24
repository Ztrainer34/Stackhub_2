import Link from "next/link";
import { Clock } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { HOME_ROUTES } from "@/lib/home/config";
import type { HomePost } from "@/lib/home/types";
import { cn } from "@/lib/utils";
import { HOME_CARD_LINK } from "./section-header";

const LOGOS_SHOWN = 3;

const BADGE: Record<string, string> = {
  playbook: "bg-[#E6ECFF] text-[#2340C9]",
  comparison: "bg-[#EFE2FF] text-[#5B2BB5]",
};

// UTC, so the server and every visitor print the same day.
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A playbook on the homepage: badge, tool logos + N, 2-line title and goal, author and date. */
export function HomePostCard({ post }: { post: HomePost }) {
  const extra = post.tools.length - LOGOS_SHOWN;
  return (
    <Link
      href={HOME_ROUTES.post(post.author_username, post.slug)}
      className={cn(HOME_CARD_LINK, "flex h-full flex-col gap-2.5 p-5")}
    >
      <span className="mb-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-[8px] px-2.5 py-[3px] text-[12.5px] font-semibold leading-normal",
            BADGE[post.type] ?? "bg-muted text-ink-2",
          )}
        >
          {post.type}
        </span>
        <span className="flex items-center gap-1">
          {post.tools.slice(0, LOGOS_SHOWN).map((t) => (
            <span key={t.id} title={t.name} className="inline-flex">
              <ToolLogoTile name={t.name} logoUrl={t.logo_url} size="post" />
            </span>
          ))}
          {extra > 0 && (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1.5 text-[11.5px] font-semibold text-ink-2">
              +{extra}
            </span>
          )}
        </span>
      </span>

      <h3 className="line-clamp-2 text-[17px] font-semibold leading-[1.35]">{post.name}</h3>
      <p className="line-clamp-2 text-sm leading-[1.45] text-muted-foreground">{post.description}</p>

      <span className="mt-auto flex items-center gap-2 pt-2 text-[13px] text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
        >
          {post.author_username.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-2">{post.author_username}</span>
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <time dateTime={post.updated_at}>{DAY.format(new Date(post.updated_at))}</time>
      </span>
    </Link>
  );
}
