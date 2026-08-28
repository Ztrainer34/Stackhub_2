"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ToolLogo } from "@/components/tool-logo";
import { Activity, BookOpen, UserPlus, Wrench } from "lucide-react";
import { useFeed } from "@/lib/queries/use-feed";
import { FeedItem } from "@/lib/feed";
import { toolSlug } from "@/lib/tool";

/** "3 hours ago" / "2 days ago" — compact relative time for feed entries. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let value = seconds;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [step, next] of units) {
    if (Math.abs(value) < step) break;
    value /= step;
    unit = next;
  }
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    -Math.round(value),
    unit
  );
}

function ActorLink({ username }: { username: string }) {
  return (
    <Link
      href={`/${username}`}
      className="font-medium hover:underline hover:text-primary"
    >
      {username}
    </Link>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const icon =
    item.kind === "post" ? (
      <BookOpen className="h-4 w-4 text-primary" />
    ) : item.kind === "tool_follow" ? (
      <Wrench className="h-4 w-4 text-muted-foreground" />
    ) : (
      <UserPlus className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <div className="flex gap-3 py-4">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs">
          {item.actor_username.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {icon}
          <ActorLink username={item.actor_username} />

          {item.kind === "post" && (
            <span className="text-muted-foreground">
              published a {item.post_type ?? "playbook"}
            </span>
          )}
          {item.kind === "tool_follow" && (
            <span className="text-muted-foreground">started following</span>
          )}
          {item.kind === "user_follow" && (
            <span className="text-muted-foreground">started following</span>
          )}

          {item.kind === "user_follow" && item.target_username && (
            <ActorLink username={item.target_username} />
          )}

          {item.kind === "tool_follow" && item.tool_name && (
            <Link
              href={`/tool/${toolSlug(item.tool_name)}`}
              className="font-medium hover:underline hover:text-primary"
            >
              {item.tool_name}
            </Link>
          )}

          <span className="text-muted-foreground">
            · {timeAgo(item.occurred_at)}
          </span>

          {item.reason === "following_tool" && (
            <Badge variant="outline" className="text-[10px] font-normal">
              tool you follow
            </Badge>
          )}
        </div>

        {/* Published playbooks get a card so they're the focus of the feed. */}
        {item.kind === "post" && item.post_slug && (
          <Link href={`/${item.actor_username}/${item.post_slug}`}>
            <Card className="mt-2 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {item.tool_logo_url || item.tool_name ? (
                    <div className="shrink-0 rounded-lg border bg-white p-1.5">
                      <ToolLogo
                        name={item.tool_name ?? ""}
                        logoUrl={item.tool_logo_url}
                        size="sm"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{item.post_name}</h3>
                    {item.post_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {item.post_description}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const { data, isLoading, error } = useFeed(limit);
  const items = data?.items ?? [];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-semibold">Your feed</h2>
      </div>
      <p className="text-muted-foreground mb-4">
        Playbooks and activity from the people and tools you follow
      </p>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-muted-foreground">Failed to load your feed.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-muted-foreground mb-1">Your feed is empty.</p>
          <p className="text-sm text-muted-foreground">
            Follow{" "}
            <Link href="/tools" className="text-primary hover:underline">
              tools
            </Link>{" "}
            and people to see their latest playbooks here.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border px-4">
          {items.map((item, i) => (
            <FeedRow
              key={`${item.kind}-${item.post_id ?? item.tool_id ?? item.target_user_id}-${item.actor_id}-${i}`}
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
}
