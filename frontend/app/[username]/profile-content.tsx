"use client";

import {
  useUserPosts,
  useUserPostsByStatus,
  useUserPostCounts,
  useUserStarredPosts,
} from "@/lib/queries/use-user-playbooks";
import { useState, useEffect, useMemo } from "react";
import PostCard from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CategoryFilter from "@/components/category-filter";
import { Search } from "lucide-react";
import { Post, PostType } from "@/lib/post";
import { useAuth } from "@/lib/queries/use-auth";
import { cn } from "@/lib/utils";
import StackContent from "./stack-content";
import KeyToolsSection from "./key-tools-section";
import FeaturedPlaybooksSection from "./featured-playbooks-section";

interface ProfileContentProps {
  username: string;
  activeTab: string;
}

type StatusFilter = "all" | "drafts" | "published" | "waiting" | "rejected";

interface SecondaryFiltersProps {
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  counts: {
    all: number;
    drafts: number;
    published: number;
    waiting: number;
    rejected: number;
  };
}

const SecondaryFilters = ({
  activeFilter,
  onFilterChange,
  counts,
}: SecondaryFiltersProps) => {
  const filters: Array<{ key: StatusFilter; label: string; count?: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "drafts", label: "Drafts", count: counts.drafts },
    { key: "published", label: "Published", count: counts.published },
    { key: "waiting", label: "Waiting for approval", count: counts.waiting },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  return (
    <div className="flex gap-2 mb-6 flex-wrap">
      {filters.map((filter) => (
        <Button
          key={filter.key}
          variant={activeFilter === filter.key ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(filter.key)}
          className={cn(
            "transition-all",
            activeFilter === filter.key ? "shadow-sm" : "hover:bg-accent"
          )}
        >
          {filter.label}
          {filter.count !== undefined && (
            <span
              className={cn(
                "ml-1.5 px-1.5 py-0.5 text-xs rounded-full font-medium",
                activeFilter === filter.key
                  ? "bg-primary-foreground/20"
                  : "bg-muted"
              )}
            >
              {filter.count}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
};

const SearchBar = ({
  activeTab,
  searchQuery,
  setSearchQuery,
}: {
  activeTab: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) => (
  <div className="mb-6">
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
      <Input
        placeholder={`Find a ${
          activeTab === "overview" ? "content" : activeTab.slice(0, -1)
        }...`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10"
      />
    </div>
  </div>
);

function tabNameToPostType(tab: string): PostType | "" {
  switch (tab) {
    case "playbooks": return "playbook";
    case "combos": return "combo";
    case "comparisons": return "comparison";
    default: return "";
  }
}

export default function ProfileContent({
  username,
  activeTab,
}: ProfileContentProps) {
  const auth = useAuth();
  const isOwnProfile =
    auth.data?.status === "authenticated" &&
    auth.data.user.username === username;
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedStarredCategories, setSelectedStarredCategories] = useState<
    string[]
  >([]);
  const limit = 12;

  // Content tabs (playbooks / combos / comparisons) share the post list +
  // secondary status filters. Overview / stack / starred have their own layout.
  const isContentTab =
    activeTab !== "starred" &&
    activeTab !== "stack" &&
    activeTab !== "overview";

  // "Waiting for approval" and "Rejected" are secondary status filters (not
  // separate tabs) — they pull from a dedicated owner-only endpoint.
  const isApprovalFilter =
    statusFilter === "waiting" || statusFilter === "rejected";

  // Show secondary filters only on own profile and not on the starred tab.
  const showSecondaryFilters = isOwnProfile && activeTab !== "starred";

  // Reset filters when tab changes
  useEffect(() => {
    setStatusFilter("all");
    setSelectedStarredCategories([]);
    setPage(1);
  }, [activeTab]);

  // Reset to page 1 when switching status filter (different result set).
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  // For the owner, the "All", "Waiting for approval" and "Rejected" filters use
  // the tickets-aware endpoint so that pending/rejected posts are included (the
  // normal post list hides them). Drafts/Published (and any visitor view) use
  // the standard post list.
  const useOwnerStatusQuery =
    isContentTab && isOwnProfile && (isApprovalFilter || statusFilter === "all");

  // Fetch posts based on current tab. The overview tab shows a curated
  // "Featured Playbooks" section instead of the full post list, so it doesn't
  // need this query.
  const postsQuery = useUserPosts(
    isContentTab && !useOwnerStatusQuery,
    username,
    page,
    limit,
    tabNameToPostType(activeTab)
  );

  const starredQuery = useUserStarredPosts(
    activeTab === "starred",
    username,
    page,
    limit
  );

  const ownerStatusQuery = useUserPostsByStatus(
    useOwnerStatusQuery,
    username,
    statusFilter === "waiting"
      ? "waiting"
      : statusFilter === "rejected"
      ? "rejected"
      : "all",
    tabNameToPostType(activeTab),
    page,
    limit
  );

  // Accurate per-status counts for the filter buttons. Independent of the
  // active filter, so switching filters no longer changes the displayed counts.
  const postCountsQuery = useUserPostCounts(
    isContentTab && isOwnProfile,
    username,
    tabNameToPostType(activeTab)
  );

  // Get current data based on active tab / filter
  const currentQuery =
    activeTab === "starred"
      ? starredQuery
      : useOwnerStatusQuery
      ? ownerStatusQuery
      : postsQuery;
  const currentPosts = useMemo(
    () => currentQuery.data?.posts || [],
    [currentQuery.data]
  );

  // Category options for the starred tab, built from the tool categories of
  // the starred posts.
  const starredCategories = useMemo(() => {
    if (activeTab !== "starred") return [];
    const map = new Map<string, string>();
    for (const post of currentPosts) {
      for (const c of post.categories || []) {
        map.set(String(c.id), c.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTab, currentPosts]);

  // The Stack tab has its own layout (active stack + watchlist sections)
  if (activeTab === "stack") {
    return <StackContent username={username} isOwnProfile={isOwnProfile} />;
  }

  // The Overview tab shows curated featured playbooks + key tools.
  if (activeTab === "overview") {
    return (
      <>
        <FeaturedPlaybooksSection
          username={username}
          isOwnProfile={isOwnProfile}
        />
        <div className="mt-10">
          <KeyToolsSection username={username} isOwnProfile={isOwnProfile} />
        </div>
      </>
    );
  }

  // Counts for the secondary filter buttons, from the dedicated counts query.
  const counts = postCountsQuery.data;
  const filterCounts = {
    // "All" is the grand total across every status.
    all:
      (counts?.published ?? 0) +
      (counts?.drafts ?? 0) +
      (counts?.waiting ?? 0) +
      (counts?.rejected ?? 0),
    drafts: counts?.drafts ?? 0,
    published: counts?.published ?? 0,
    waiting: counts?.waiting ?? 0,
    rejected: counts?.rejected ?? 0,
  };

  // Filter posts based on status filter (client-side for now) and, on the
  // starred tab, the selected tool category.
  const filteredPosts = currentPosts.filter((post) => {
    if (statusFilter === "drafts" && post.is_published) return false;
    if (statusFilter === "published" && !post.is_published) return false;
    if (
      activeTab === "starred" &&
      selectedStarredCategories.length > 0 &&
      !(
        post.categories?.some((c) =>
          selectedStarredCategories.includes(String(c.id))
        ) ?? false
      )
    ) {
      return false;
    }
    return true;
  });

  const starredCategoryFilter =
    activeTab === "starred" && currentPosts.length > 0 ? (
      <div className="mb-6">
        <CategoryFilter
          categories={starredCategories}
          selected={selectedStarredCategories}
          onChange={setSelectedStarredCategories}
        />
      </div>
    ) : null;

  const approvalBanner = isApprovalFilter ? (
    <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
      {statusFilter === "waiting" ? (
        <>
          These posts use a tool that&apos;s still under review. While the tool is
          waiting for approval, the post stays here. Once approved, it will
          behave like all your other posts.
        </>
      ) : (
        <>
          The tool suggested for these posts was rejected. Edit the post to swap
          in an existing tool and it will rejoin your other posts.
        </>
      )}
    </div>
  ) : null;

  // Pagination handlers
  const handlePreviousPage = () => setPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () => setPage((prev) => prev + 1);

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[140px] w-full rounded-lg" />
      ))}
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-12">
      <p className="text-muted-foreground text-lg">{message}</p>
    </div>
  );

  const PostGrid = ({ posts }: { posts: Post[] }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post, i) => (
          <div key={i}>
            <PostCard
              post={post}
              variant="compact"
              showActions={isOwnProfile && activeTab !== "starred"}
              href={`/${username}/${post.slug}`}
            />
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {currentQuery.data && currentQuery.data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentQuery.data.page} of {currentQuery.data.total_pages}(
            {currentQuery.data.total_count} total posts)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentQuery.data.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentQuery.data.page >= currentQuery.data.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (currentQuery.isLoading) {
    return (
      <>
        <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeTab={activeTab}/>
        {showSecondaryFilters && (
          <SecondaryFilters
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={filterCounts}
          />
        )}
        <LoadingSkeleton />
      </>
    );
  }

  if (currentQuery.error) {
    return (
      <>
        <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeTab={activeTab}/>
        {showSecondaryFilters && (
          <SecondaryFilters
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={filterCounts}
          />
        )}
        <EmptyState
          message={`Error loading ${
            activeTab === "starred" ? "starred posts" : activeTab
          }`}
        />
      </>
    );
  }

  if (!currentQuery.data || currentPosts.length === 0) {
    const emptyMessage =
      activeTab === "starred"
        ? "No starred posts found"
        : statusFilter === "waiting"
        ? "No posts waiting for approval"
        : statusFilter === "rejected"
        ? "No rejected posts"
        : `No ${activeTab === "overview" ? "posts" : activeTab} found`;
    return (
      <>
        <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeTab={activeTab}/>
        {showSecondaryFilters && (
          <SecondaryFilters
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={filterCounts}
          />
        )}
        {approvalBanner}
        <EmptyState message={emptyMessage} />
      </>
    );
  }

  return (
    <>
      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeTab={activeTab}/>
      {showSecondaryFilters && (
        <SecondaryFilters
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
          counts={filterCounts}
        />
      )}
      {approvalBanner}
      {starredCategoryFilter}
      {filteredPosts.length === 0 ? (
        <EmptyState message="No posts match the selected filters" />
      ) : (
        <PostGrid posts={filteredPosts} />
      )}
    </>
  );
}
