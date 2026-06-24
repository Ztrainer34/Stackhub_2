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
import Link from "next/link";
import { Tool } from "@/lib/tool";
import { Layers, Eye, Search } from "lucide-react";
import { useUserStack, useUserWatchlist } from "@/lib/queries/use-user-tools";

interface StackContentProps {
  username: string;
}

type SortOption = "name" | "added";

function ToolCard({ tool }: { tool: Tool }) {
  const truncatedDescription =
    tool.description && tool.description.length > 160
      ? tool.description.substring(0, 160) + "..."
      : tool.description || "No description available";

  return (
    <Link href={`/tool/${tool.id}`}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col">
        <CardContent className="p-5 flex flex-col flex-1">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0">
              <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
                <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="md" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
                {tool.name || "Unnamed Tool"}
              </h3>
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

interface ToolSectionProps {
  title: string;
  icon: React.ReactNode;
  tools: Tool[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  noResultsMessage: string;
  hasFilters: boolean;
}

function ToolSection({
  title,
  icon,
  tools,
  isLoading,
  isError,
  emptyMessage,
  noResultsMessage,
  hasFilters,
}: ToolSectionProps) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
        {!isLoading && !isError && (
          <span className="text-sm text-muted-foreground">({tools.length})</span>
        )}
      </div>

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
          <p className="text-muted-foreground">
            {hasFilters ? noResultsMessage : emptyMessage}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </section>
  );
}

function applyFilters(
  tools: Tool[],
  search: string,
  category: string,
  sort: SortOption
): Tool[] {
  const query = search.trim().toLowerCase();

  const filtered = tools.filter((tool) => {
    const matchesSearch =
      query === "" ||
      tool.name.toLowerCase().includes(query) ||
      (tool.description?.toLowerCase().includes(query) ?? false);

    const matchesCategory =
      category === "all" ||
      (tool.categories?.some((c) => String(c.id) === category) ?? false);

    return matchesSearch && matchesCategory;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "added") {
      // Most recently added first.
      const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
      const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
      return bTime - aTime;
    }
    // Alphabetical by name.
    return a.name.localeCompare(b.name);
  });

  return sorted;
}

export default function StackContent({ username }: StackContentProps) {
  const stackQuery = useUserStack(username);
  const watchlistQuery = useUserWatchlist(username);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortOption>("name");

  const stackTools = stackQuery.data?.tools || [];
  const watchlistTools = watchlistQuery.data?.tools || [];

  // Build the category dropdown from every category present across both lists.
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of [...stackTools, ...watchlistTools]) {
      for (const c of tool.categories || []) {
        map.set(String(c.id), c.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stackTools, watchlistTools]);

  const filteredStack = useMemo(
    () => applyFilters(stackTools, search, category, sort),
    [stackTools, search, category, sort]
  );
  const filteredWatchlist = useMemo(
    () => applyFilters(watchlistTools, search, category, sort),
    [watchlistTools, search, category, sort]
  );

  const hasFilters = search.trim() !== "" || category !== "all";

  return (
    <div>
      {/* Controls: search, category filter, sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      <ToolSection
        title="Active Stack"
        icon={<Layers className="w-5 h-5 text-foreground" />}
        tools={filteredStack}
        isLoading={stackQuery.isLoading}
        isError={!!stackQuery.error}
        emptyMessage="No tools in the stack yet."
        noResultsMessage="No tools match your filters."
        hasFilters={hasFilters}
      />

      <ToolSection
        title="Watchlist"
        icon={<Eye className="w-5 h-5 text-foreground" />}
        tools={filteredWatchlist}
        isLoading={watchlistQuery.isLoading}
        isError={!!watchlistQuery.error}
        emptyMessage="No tools in the watchlist yet."
        noResultsMessage="No tools match your filters."
        hasFilters={hasFilters}
      />
    </div>
  );
}
