"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search, BookOpen, Filter, Wrench, X } from "lucide-react";
import {
  useBrowsePosts,
  usePostToolFacets,
} from "@/lib/queries/use-browse-posts";
import PostCard from "@/components/post-card";
import { ToolLogo } from "@/components/tool-logo";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "name", label: "Name" },
  { value: "stars", label: "Most starred" },
];

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="h-full">
          <CardContent className="p-6 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="w-8 h-8 rounded" />
            </div>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PlaybooksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [toolSearch, setToolSearch] = useState("");
  const currentType = searchParams.get("type") || "all";
  const currentSort = searchParams.get("sort") || "updated";
  const currentTool = searchParams.get("tool") || "";
  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentSearch = searchParams.get("q") || "";

  const { data, isLoading } = useBrowsePosts({
    type: currentType,
    q: currentSearch,
    sort: currentSort,
    tool: currentTool,
    page: currentPage,
  });
  const { data: toolFacets } = usePostToolFacets(30);

  const playbooks = data?.posts ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = data?.total_pages ?? 0;

  const playbookTypes = [
    { key: "all", label: "All", count: data?.counts.all_count ?? 0 },
    { key: "playbook", label: "Playbooks", count: data?.counts.playbook_count ?? 0 },
    { key: "combo", label: "Combos", count: data?.counts.combo_count ?? 0 },
    { key: "comparison", label: "Comparisons", count: data?.counts.comparison_count ?? 0 },
  ];

  const filteredTools = (toolFacets ?? []).filter((t) =>
    t.name.toLowerCase().includes(toolSearch.toLowerCase())
  );
  const activeTool = (toolFacets ?? []).find((t) => t.id === currentTool);

  const updateUrl = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    // Reset page when changing any filter.
    if ("type" in params || "sort" in params || "q" in params || "tool" in params) {
      newParams.delete("page");
    }
    router.push(`?${newParams.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrl({ q: searchQuery });
  };

  const handlePageChange = (page: number) => {
    updateUrl({ page: page.toString() });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Explore Playbooks</h1>
          <p className="text-sm text-muted-foreground">
            Step-by-step guides for using tools effectively
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sidebar — Filter by */}
        <aside className="w-full md:w-64 md:flex-shrink-0">
          <div className="md:sticky md:top-20 space-y-6">
            {/* Content type */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter by
              </h3>
              <div className="border rounded-lg overflow-hidden divide-y">
                {playbookTypes.map((type) => {
                  const active = currentType === type.key;
                  return (
                    <button
                      key={type.key}
                      onClick={() =>
                        updateUrl({ type: type.key === "all" ? "" : type.key })
                      }
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span>{type.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {type.count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tools */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                Tools
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter tools..."
                      value={toolSearch}
                      onChange={(e) => setToolSearch(e.target.value)}
                      className="pl-7 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto divide-y">
                  {filteredTools.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      No tools found
                    </p>
                  ) : (
                    filteredTools.map((tool) => {
                      const active = currentTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          onClick={() =>
                            updateUrl({ tool: active ? "" : tool.id })
                          }
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-muted font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <ToolLogo
                            name={tool.name}
                            logoUrl={tool.logo_url}
                            size="sm"
                          />
                          <span className="flex-1 text-left truncate">
                            {tool.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {tool.post_count}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right — results */}
        <div className="flex-1 min-w-0">
          {/* Search + sort */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search playbooks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>
            <Select
              value={currentSort}
              onValueChange={(value) => updateUrl({ sort: value })}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Result count + active tool chip */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-sm text-muted-foreground">
              {totalCount.toLocaleString()} results
            </span>
            {activeTool && (
              <Badge
                variant="outline"
                className="gap-1 cursor-pointer"
                onClick={() => updateUrl({ tool: "" })}
              >
                Tool: {activeTool.name}
                <X className="w-3 h-3" />
              </Badge>
            )}
          </div>

          {/* Results */}
          {isLoading ? (
            <LoadingSkeleton />
          ) : playbooks.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                {playbooks.map((playbook) => (
                  <Link
                    key={playbook.id}
                    href={`/${playbook.author_username}/${playbook.slug}`}
                  >
                    <PostCard post={playbook} className="h-full" />
                  </Link>
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={handlePageChange}
                itemName="playbooks"
              />
            </>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No playbooks found</h3>
              <p className="text-muted-foreground mb-4">
                {currentSearch
                  ? `No playbooks match "${currentSearch}"`
                  : "Try adjusting your filters."}
              </p>
              <Link href="/new">
                <Button>Create my first playbook</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
