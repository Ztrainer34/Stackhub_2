"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedRow, FeedEmptyState } from "@/components/activity-feed";
import { flattenFeedPages } from "@/lib/feed";
import { useInfiniteFeed } from "@/lib/queries/use-feed";

export default function InfiniteActivityFeed() {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useInfiniteFeed();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const items = flattenFeedPages(data?.pages ?? []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (isFetchNextPageError) toast.error("Couldn't load more of your feed.");
  }, [isFetchNextPageError]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center">
        <p className="text-muted-foreground">Failed to load your feed.</p>
      </div>
    );
  }

  if (items.length === 0) return <FeedEmptyState />;

  return (
    <>
      <div className="divide-y rounded-lg border px-4">
        {items.map((item) => (
          <FeedRow key={item.event_key} item={item} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-1" />
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      {!hasNextPage && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      )}
    </>
  );
}
