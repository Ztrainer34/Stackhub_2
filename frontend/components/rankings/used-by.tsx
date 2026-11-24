import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { SHOW_STACKS_LINKS } from "@/lib/home/config";
import { ROUTES } from "@/lib/rankings/config";
import type { UsedByUser } from "@/lib/rankings/types";

type Props = { users: UsedByUser[]; totalStacks: number; toolName: string; toolId: string };

/** 3 overlapping avatars (each links to the profile), then "+N" (a link to Explore stacks once that page exists). */
export function UsedBy({ users, totalStacks, toolName, toolId }: Props) {
  const rest = Math.max(0, totalStacks - users.length);
  const name = (u: UsedByUser) => u.display_name || u.username;
  return (
    <div className="flex items-center">
      {users.map((u, i) => (
        <Link
          key={u.username}
          href={ROUTES.profile(u.username)}
          title={name(u)}
          aria-label={`Open ${name(u)}'s profile`}
          className={`inline-flex shrink-0 rounded-full border-2 border-background ${i > 0 ? "-ml-2" : ""}`}
        >
          <UserAvatar
            user={{ username: u.username, avatar_url: u.avatar_url }}
            className="h-8 w-8 text-[11px] font-semibold"
          />
        </Link>
      ))}
      {rest > 0 &&
        (SHOW_STACKS_LINKS ? (
          <Link
            href={ROUTES.stacksWithTool(toolId)}
            aria-label={`See all ${totalStacks} people with ${toolName} in their stack`}
            className="ml-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            +{rest}
          </Link>
        ) : (
          <span className="ml-2 text-sm text-muted-foreground">+{rest}</span>
        ))}
    </div>
  );
}
