"use client";

import Link from "next/link";

import { ToolLogo } from "@/components/tool-logo";
import { UserAvatar } from "@/components/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tool } from "@/lib/tool";
import { useToolStacks } from "@/lib/queries/use-tool-page";
import { cn } from "@/lib/utils";

/**
 * "Stacks with {tool}": up to 6 people who have the tool in their active
 * stack, each with their stack (this tool first, ringed). People who wrote a
 * playbook with the tool come first (ordering is done by the API).
 */
export function ToolPageStacks({ tool }: { tool: Tool }) {
  const { data, isLoading } = useToolStacks(tool.id);
  const people = data?.stacks ?? [];
  const total = data?.total_count ?? 0;

  if (!isLoading && total === 0) return null;

  return (
    <section id="stacks" className="space-y-4 scroll-mt-24">
      <div>
        <h2 className="text-xl font-semibold">Stacks with {tool.name}</h2>
        <p className="text-sm text-muted-foreground">
          People and companies who have {tool.name} in their active stack.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {people.map((person) => {
            const extra = person.tool_count - person.tools.length;
            return (
              <Link
                key={person.id}
                href={`/${person.username}`}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    user={{ username: person.username, avatar_url: person.avatar_url }}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {person.display_name || person.username}
                    </p>
                    {person.bio && (
                      <p className="text-sm text-muted-foreground truncate">{person.bio}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {person.tools.map((t) => (
                    <span key={t.id} title={t.name}>
                      <ToolLogo
                        name={t.name}
                        logoUrl={t.logo_url}
                        size="sm"
                        className={cn(
                          "h-7 w-7",
                          t.id === tool.id && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                        )}
                      />
                    </span>
                  ))}
                  {extra > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">+{extra}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* TODO: link to Explore stacks filtered on this tool once that page exists. */}
      {total > people.length && (
        <p className="text-sm text-muted-foreground">
          And {total - people.length} more {total - people.length === 1 ? "person" : "people"}.
        </p>
      )}
    </section>
  );
}
