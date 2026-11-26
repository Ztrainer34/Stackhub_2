"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useToolStacks } from "@/lib/queries/use-tool-page";
import { useBrowsePosts } from "@/lib/queries/use-browse-posts";

/**
 * The two numbers under the tool header: how many people have the tool in
 * their active stack (with a few of their faces; links to the block below), and
 * how many playbooks use it (links to /playbooks). A card with nothing behind it
 * is not a link.
 */
export function ToolPageHighlights({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const stacks = useToolStacks(tool.id);
  // Same query as the "All" tab of the playbooks block, so it is fetched once.
  const posts = useBrowsePosts({
    type: "all",
    q: "",
    sort: "stars",
    tool: tool.id,
    page: 1,
    limit: 6,
    showcase: true,
  });

  const stackCount = current.active_stack_count ?? stacks.data?.total_count ?? 0;
  const pbCount = posts.data?.counts.all_count ?? 0;
  const pbLoading = posts.isLoading;
  const people = stacks.data?.stacks ?? [];
  const names = people.slice(0, 2).map((p) => p.display_name || p.username);

  const card = "flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm";
  const cardLink = `${card} transition-colors hover:bg-muted/50`;

  const stacksBody = (
    <>
      {people.length > 0 && (
        <div className="flex -space-x-2 flex-shrink-0">
          {people.slice(0, 4).map((p) => (
            <UserAvatar
              key={p.id}
              user={{ username: p.username, avatar_url: p.avatar_url }}
              size="md"
              className="border-2 border-background"
            />
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold">
          In {stackCount} active {stackCount === 1 ? "stack" : "stacks"}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {names.length > 0
            ? `Used by ${names.join(", ")}${stackCount > names.length ? " and more" : ""}`
            : stackCount === 0
              ? `Be the first to add ${current.name} to your stack`
              : "People who use it"}
        </p>
      </div>
    </>
  );

  const playbooksBody = (
    <>
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-muted">
        <BookOpen className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold">
          {pbLoading ? "Playbooks" : `${pbCount} ${pbCount === 1 ? "playbook" : "playbooks"}`}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {pbLoading || pbCount > 0
            ? `Learn how people use ${current.name}`
            : `No playbook uses ${current.name} yet`}
        </p>
      </div>
    </>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      {stackCount > 0 ? (
        <a href="#stacks" className={cardLink}>
          {stacksBody}
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </a>
      ) : (
        <div className={card}>{stacksBody}</div>
      )}

      {pbLoading || pbCount > 0 ? (
        <Link href={`/playbooks?tool=${tool.id}`} className={cardLink}>
          {playbooksBody}
          <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <div className={card}>{playbooksBody}</div>
      )}
    </div>
  );
}
