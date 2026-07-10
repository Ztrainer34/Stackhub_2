"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CategoryFilter from "@/components/category-filter";
import Link from "next/link";
import { Tool, toolHref } from "@/lib/tool";
import { Layers, Eye, Search } from "lucide-react";
import { useUserStack, useUserWatchlist } from "@/lib/queries/use-user-tools";
import {
  ProfileToolActions,
  ToolListType,
} from "@/components/profile-tool-actions";

interface StackContentProps {
  username: string;
  isOwnProfile: boolean;
}

type SortOption = "name" | "added";

function ToolCard({
  tool,
  isOwner,
  listType,
  username,
}: {
  tool: Tool;
  isOwner: boolean;
  listType: ToolListType;
  username: string;
}) {
  const truncatedDescription =
    tool.description && tool.description.length > 160
      ? tool.description.substring(0, 160) + "..."
      : tool.description || "No description available";

  return (
    <Link href={toolHref(tool)}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col">
        <CardContent className="p-5 flex flex-col flex-1">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0">
              <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
                <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="md" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
                  {tool.name || "Unnamed Tool"}
                </h3>
                <ProfileToolActions
                  tool={tool}
                  isOwner={isOwner}
                  listType={listType}
                  username={username}
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {truncatedDescription}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {tool.categories && tool.categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {tool.categories.slice(0, 3).map((category) => (
                <Badge key={category.id} variant="secondary" className="text-xs">
                  {category.name}
                </Badge>
              ))}
              {tool.categories.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{tool.categories.length - 3} more
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ToolGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[160px] w-full rounded-lg" />
      ))}
    </div>
  );
}

function applyFilters(
  tools: Tool[],
  search: string,
  categories: string[],
  sort: SortOption
): Tool[] {
  const query = search.trim().toLowerCase();

  const filtered = tools.filter((tool) => {
    const matchesSearch =
      query === "" ||
      tool.name.toLowerCase().includes(query) ||
      (tool.description?.toLowerCase().includes(query) ?? false);

    const matchesCategory =
      categories.length === 0 ||
      (tool.categories?.some((c) => categories.includes(String(c.id))) ?? false);

    return matchesSearch && matchesCategory;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "added") {
      // Most recently added first.
      const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
      const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
      return bTime - aTime;
    }
    return a.name.localeCompare(b.name);
  });

  return sorted;
}

interface ToolSectionProps {
  title: string;
  icon: React.ReactNode;
  tools: Tool[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  isOwner: boolean;
  listType: ToolListType;
  username: string;
}

function ToolSection({
  title,
  icon,
  tools,
  isLoading,
  isError,
  emptyMessage,
  isOwner,
  listType,
  username,
}: ToolSectionProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("name");

  // Category options come from the tools in this section only.
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of tools) {
      for (const c of tool.categories || []) {
        map.set(String(c.id), c.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tools]);

  const visibleTools = useMemo(
    () => applyFilters(tools, search, selectedCategories, sort),
    [tools, search, selectedCategories, sort]
  );

  const hasFilters = search.trim() !== "" || selectedCategories.length > 0;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
        {!isLoading && !isError && (
          <span className="text-sm text-muted-foreground">
            ({visibleTools.length})
          </span>
        )}
      </div>

      {/* Per-section controls: search, category filter, sort */}
      {!isLoading && !isError && tools.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <CategoryFilter
            categories={categories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />

          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="added">Sort by date added</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <ToolGridSkeleton />
      ) : isError ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            Failed to load {title.toLowerCase()}.
          </p>
        </div>
      ) : tools.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : visibleTools.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <p className="text-muted-foreground">
            {hasFilters
              ? "No tools match your filters."
              : emptyMessage}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isOwner={isOwner}
              listType={listType}
              username={username}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function StackContent({
  username,
  isOwnProfile,
}: StackContentProps) {
  const stackQuery = useUserStack(username);
  const watchlistQuery = useUserWatchlist(username);

  return (
    <div>
      <ToolSection
        title="Active Stack"
        icon={<Layers className="w-5 h-5 text-foreground" />}
        tools={stackQuery.data?.tools || []}
        isLoading={stackQuery.isLoading}
        isError={!!stackQuery.error}
        emptyMessage="No tools in the stack yet."
        isOwner={isOwnProfile}
        listType="stack"
        username={username}
      />

      <ToolSection
        title="Watchlist"
        icon={<Eye className="w-5 h-5 text-foreground" />}
        tools={watchlistQuery.data?.tools || []}
        isLoading={watchlistQuery.isLoading}
        isError={!!watchlistQuery.error}
        emptyMessage="No tools in the watchlist yet."
        isOwner={isOwnProfile}
        listType="watchlist"
        username={username}
      />
    </div>
  );
}
