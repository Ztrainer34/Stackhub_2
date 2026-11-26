import Link from "next/link";
import { Layers } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { UserAvatar } from "@/components/user-avatar";
import { HOME_ROUTES, SHOW_STACKS_LINKS, STACK_LOGOS_SHOWN } from "@/lib/home/config";
import type { HomeStack } from "@/lib/home/types";
import { SectionHeader } from "./section-header";
import { Rail, RailItem } from "./rail";

/** "GTM stacks": 8 cards. 4 columns on desktop, 2 on tablet, a swipe row on phones. */
export function StacksSection({ stacks }: { stacks: HomeStack[] }) {
  if (stacks.length === 0) return null;
  return (
    <section aria-labelledby="home-stacks" className="px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          id="home-stacks"
          icon={Layers}
          title="GTM stacks"
          action={SHOW_STACKS_LINKS ? { href: HOME_ROUTES.stacks, label: "Explore stacks" } : undefined}
        />
        <Rail>
          {stacks.map((s) => (
            <RailItem key={s.id}>
              <StackCard stack={s} />
            </RailItem>
          ))}
        </Rail>
      </div>
    </section>
  );
}

function StackCard({ stack }: { stack: HomeStack }) {
  const shown = stack.tools.slice(0, STACK_LOGOS_SHOWN);
  const extra = stack.tool_count - shown.length;
  return (
    <Link
      href={HOME_ROUTES.profile(stack.username)}
      className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar user={{ username: stack.username, avatar_url: stack.avatar_url }} size="md" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{stack.display_name || stack.username}</p>
          {stack.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{stack.bio}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((t) => (
          <span key={t.id} title={t.name}>
            <ToolLogoTile name={t.name} logoUrl={t.logo_url} size="sm" />
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-8 items-center rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">
            +{extra}
          </span>
        )}
      </div>

      <p className="mt-auto flex gap-4 border-t pt-2.5 text-sm text-muted-foreground">
        <span>
          <b className="font-semibold text-foreground">{stack.tool_count}</b> tools
        </span>
        {/* Hidden at 0: "0 playbooks" makes the card look empty. */}
        {stack.post_count > 0 && (
          <span>
            <b className="font-semibold text-foreground">{stack.post_count}</b>{" "}
            {stack.post_count === 1 ? "playbook" : "playbooks"}
          </span>
        )}
      </p>
    </Link>
  );
}
