"use client";

import {
  useUserPosts,
  useUserStarredPosts,
} from "@/lib/queries/use-user-playbooks";
import { useState, useEffect, useMemo } from "react";
import PostCard from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { Post, PostType } from "@/lib/post";
import { useAuth } from "@/lib/queries/use-auth";
import { cn } from "@/lib/utils";
import StackContent from "./stack-content";
import KeyToolsSection from "./key-tools-section";

interface ProfileContentProps {
  username: string;
  activeTab: string;
}

type StatusFilter = "all" | "drafts" | "published";

interface SecondaryFiltersProps {
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  counts: {
    drafts: number;
    published: number;
  };
}

const SecondaryFilters = ({
  activeFilter,
  onFilterChange,
  counts,
}: SecondaryFiltersProps) => {
  const filters: Array<{ key: StatusFilter; label: string; count?: number }> = [
    { key: "all", label: "All" },
    { key: "drafts", label: "Drafts", count: counts.drafts },
    { key: "published", label: "Published", count: counts.published },
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
          {filter.count !== undefined && filter.count > 0 && (
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
  const [starredCategory, setStarredCategory] = useState("all");
  const limit = 12;

  // Show secondary filters only on own profile and not on starred tab
  const showSecondaryFilters = isOwnProfile && activeTab !== "starred";

  // Reset filters when tab changes
  useEffect(() => {
    setStatusFilter("all");
    setStarredCategory("all");
    setPage(1);
  }, [activeTab]);

  // Fetch posts based on current tab
  const postsQuery = useUserPosts(
    activeTab !== "starred" && activeTab !== "stack",
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

  // Get current data based on active tab
  const currentQuery = activeTab === "starred" ? starredQuery : postsQuery;
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
    return <StackContent username={username} />;
  }

  // Calculate counts for secondary filters (only for own profile)
  const filterCounts = {
    drafts: currentPosts.filter((p) => !p.is_published).length,
    published: currentPosts.filter((p) => p.is_published).length,
  };

  // Filter posts based on status filter (client-side for now) and, on the
  // starred tab, the selected tool category.
  const filteredPosts = currentPosts.filter((post) => {
    if (statusFilter === "drafts" && post.is_published) return false;
    if (statusFilter === "published" && !post.is_published) return false;
    if (
      activeTab === "starred" &&
      starredCategory !== "all" &&
      !(post.categories?.some((c) => String(c.id) === starredCategory) ?? false)
    ) {
      return false;
    }
    return true;
  });

  const starredCategoryFilter =
    activeTab === "starred" && currentPosts.length > 0 ? (
      <div className="mb-6 max-w-xs">
        <Select value={starredCategory} onValueChange={setStarredCategory}>
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {starredCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            counts={{ drafts: 0, published: 0 }}
          />
        )}
        <LoadingSkeleton />
        {activeTab === "overview" && (
          <div className="mt-8">
            <KeyToolsSection username={username} isOwnProfile={isOwnProfile} />
          </div>
        )}
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
            counts={{ drafts: 0, published: 0 }}
          />
        )}
        <EmptyState
          message={`Error loading ${
            activeTab === "starred" ? "starred posts" : activeTab
          }`}
        />
        {activeTab === "overview" && (
          <div className="mt-8">
            <KeyToolsSection username={username} isOwnProfile={isOwnProfile} />
          </div>
        )}
      </>
    );
  }

  if (!currentQuery.data || currentPosts.length === 0) {
    const emptyMessage =
      activeTab === "starred"
        ? "No starred posts found"
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
        <EmptyState message={emptyMessage} />
        {activeTab === "overview" && (
          <div className="mt-8">
            <KeyToolsSection username={username} isOwnProfile={isOwnProfile} />
          </div>
        )}
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
      {starredCategoryFilter}
      {filteredPosts.length === 0 ? (
        <EmptyState message="No posts match the selected filters" />
      ) : (
        <PostGrid posts={filteredPosts} />
      )}
      {activeTab === "overview" && (
        <div className="mt-8">
          <KeyToolsSection username={username} isOwnProfile={isOwnProfile} />
        </div>
      )}
    </>
  );
}
