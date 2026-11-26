import Link from "next/link";
import { Layers2 } from "lucide-react";

import { ToolLogoTile } from "@/components/rankings/tool-logo-tile";
import { UserAvatar } from "@/components/user-avatar";
import { HOME_ROUTES, SHOW_STACKS_LINKS, STACK_LOGOS_SHOWN } from "@/lib/home/config";
import type { HomeStack } from "@/lib/home/types";
import { pastelFor, personInitials } from "@/lib/monogram";
import { cn } from "@/lib/utils";
import { HOME_CARD_LINK, HomeSection, SectionHeader } from "./section-header";
import { Rail, RailItem } from "./rail";

/** "GTM stacks": 8 cards. 4 columns on desktop, 2 on tablet, a swipe row on phones. */
export function StacksSection({ stacks }: { stacks: HomeStack[] }) {
  if (stacks.length === 0) return null;
  return (
    <HomeSection labelledBy="home-stacks">
      <SectionHeader
        id="home-stacks"
        icon={Layers2}
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
    </HomeSection>
  );
}

function StackCard({ stack }: { stack: HomeStack }) {
  const shown = stack.tools.slice(0, STACK_LOGOS_SHOWN);
  const extra = stack.tool_count - shown.length;
  const name = stack.display_name || stack.username;
  return (
    <Link
      href={HOME_ROUTES.profile(stack.username)}
      className={cn(HOME_CARD_LINK, "flex h-full flex-col gap-3 p-[18px]")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar
          user={{ username: stack.username, avatar_url: stack.avatar_url }}
          className="h-12 w-12"
          initials={personInitials(name)}
          fallbackClassName="font-heading text-[17px] font-bold"
          fallbackColor={pastelFor(stack.username)}
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {stack.bio && (
            <p className="line-clamp-2 text-[12.5px] leading-[1.35] text-muted-foreground">{stack.bio}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((t) => (
          <span key={t.id} title={t.name} className="inline-flex">
            <ToolLogoTile name={t.name} logoUrl={t.logo_url} size="sm" />
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-[34px] items-center rounded-[9px] bg-muted px-[9px] text-xs font-semibold text-ink-2">
            +{extra}
          </span>
        )}
      </div>

      <p className="mt-auto flex gap-3.5 border-t border-line-soft pt-2.5 text-[12.5px] text-ink-2">
        <span>
          <b className="font-bold text-foreground">{stack.tool_count}</b> tools
        </span>
        {/* Hidden at 0: "0 playbooks" makes the card look empty. */}
        {stack.post_count > 0 && (
          <span>
            <b className="font-bold text-foreground">{stack.post_count}</b>{" "}
            {stack.post_count === 1 ? "playbook" : "playbooks"}
          </span>
        )}
      </p>
    </Link>
  );
}
