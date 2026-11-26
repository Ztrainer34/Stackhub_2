"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import PostCard from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tool } from "@/lib/tool";
import { useBrowsePosts } from "@/lib/queries/use-browse-posts";

type Tab = "all" | "playbook" | "comparison";
type Sort = "stars" | "created";

/**
 * "Playbooks with {tool}": the 6 best playbooks and comparisons tagged with the
 * tool, with All / Playbooks / Comparisons tabs and a sort. Uses the public
 * /posts listing with its tool filter, without the test accounts (showcase), so
 * its numbers can be a little below /playbooks?tool=.
 */
export function ToolPagePlaybooks({ tool }: { tool: Tool }) {
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("stars");

  const { data, isLoading } = useBrowsePosts({
    type: tab,
    q: "",
    sort,
    tool: tool.id,
    page: 1,
    limit: 6,
    showcase: true,
  });

  const counts = data?.counts;
  const posts = data?.posts ?? [];

  if (!isLoading && counts && counts.all_count === 0) {
    return (
      <section id="playbooks" className="space-y-3">
        <h2 className="text-xl font-semibold">Playbooks with {tool.name}</h2>
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No playbook uses {tool.name} yet.{" "}
          <Link href="/new" className="font-medium text-foreground underline">
            Write the first one
          </Link>
        </div>
      </section>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: `All (${counts?.all_count ?? 0})` },
    { key: "playbook", label: `Playbooks (${counts?.playbook_count ?? 0})` },
    { key: "comparison", label: `Comparisons (${counts?.comparison_count ?? 0})` },
  ];

  const tabCount =
    (tab === "all"
      ? counts?.all_count
      : tab === "playbook"
        ? counts?.playbook_count
        : counts?.comparison_count) ?? 0;

  return (
    <section id="playbooks" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Playbooks with {tool.name}</h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="stars">Most stars</option>
            <option value="created">Newest</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "default" : "outline"}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className="rounded-full"
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post) => (
            <Link key={post.id} href={`/${post.author_username}/${post.slug}`}>
              <PostCard post={post} className="h-full" />
            </Link>
          ))}
        </div>
      )}

      {!isLoading && tabCount > posts.length && (
        <Link
          href={`/playbooks?tool=${tool.id}${tab === "all" ? "" : `&type=${tab}`}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          See all {tab === "comparison" ? "comparisons" : "playbooks"} with {tool.name}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
