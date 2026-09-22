"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Search, Wrench, Calendar, Filter, X } from "lucide-react";
import { ToolLogo } from "@/components/tool-logo";
import { ToolActions } from "@/components/tool-actions";
import { toolHref, BrowseTool } from "@/lib/tool";
import { AddToolDialog } from "@/components/add-tool-dialog";
import { useBrowseTools, useToolCategories } from "@/lib/queries/use-browse-tools";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest first' },
];

function ToolCard({ tool }: { tool: BrowseTool }) {
  return (
    <Link href={toolHref(tool)}>
      <Card className="group hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-h-6">
              {tool.categories.slice(0, 1).map((category) => (
                <Badge key={category.id} variant="secondary" className="text-xs">
                  {category.name}
                </Badge>
              ))}
            </div>
            {/* Stops the card's Link from firing — handled inside ToolActions. */}
            <ToolActions tool={tool} variant="mini" />
          </div>

          <div className="flex items-start gap-3 mt-2">
            <div className="w-10 h-10 bg-white rounded-lg border shadow-sm flex items-center justify-center p-1 flex-shrink-0">
              <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="sm" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                {tool.name}
              </CardTitle>
              <CardDescription className="text-sm line-clamp-2 mt-1">
                {tool.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>Updated {new Date(tool.updated_at).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <Card key={i} className="h-full">
          <CardContent className="p-6 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="w-10 h-10 rounded-lg" />
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

export default function ToolsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categorySearch, setCategorySearch] = useState('');
  const currentCategory = searchParams.get('category') || 'all';
  const currentSort = searchParams.get('sort') || 'name';
  const currentPage = parseInt(searchParams.get('page') || '1');
  const currentSearch = searchParams.get('q') || '';

  const { data, isLoading } = useBrowseTools({
    q: currentSearch,
    category: currentCategory,
    sort: currentSort,
    page: currentPage,
  });
  // The sidebar list is scrollable and filterable, so it can hold far more than
  // the six that fitted in the old horizontal tab strip. 100 is the backend's
  // cap, and the catalogue has well over a thousand categories — the filter box
  // is how you reach the rest.
  const { data: categories } = useToolCategories(100);

  const tools = data?.tools ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = data?.total_pages ?? 0;

  const filteredCategories = (categories ?? []).filter((c) =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );
  const activeCategory = (categories ?? []).find((c) => c.slug === currentCategory);

  const updateUrl = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    // Reset page when changing filters
    if ('category' in params || 'sort' in params || 'q' in params) {
      newParams.delete('page');
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
        <Wrench className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-sm text-muted-foreground">
            Discover and explore software tools for your workflow
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sidebar — categories */}
        <aside className="w-full md:w-64 md:flex-shrink-0">
          <div className="md:sticky md:top-20 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Categories
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="pl-7 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y">
                  {/* Always first, and never filtered out — it is the reset. */}
                  <button
                    onClick={() => updateUrl({ category: '' })}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors",
                      currentCategory === 'all'
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <span>All tools</span>
                    <Badge variant="secondary" className="text-xs">
                      {totalCount.toLocaleString()}
                    </Badge>
                  </button>

                  {filteredCategories.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      No categories match “{categorySearch}”
                    </p>
                  ) : (
                    filteredCategories.map((category) => {
                      const active = currentCategory === category.slug;
                      return (
                        <button
                          key={category.id}
                          onClick={() =>
                            updateUrl({ category: active ? '' : category.slug })
                          }
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-muted font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <span className="flex-1 text-left truncate">
                            {category.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {category.tool_count}
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
          {/* Search + sort + add */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
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
              <SelectTrigger className="w-full sm:w-44">
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
            <AddToolDialog />
          </div>

          {/* Result count + active category chip */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-sm text-muted-foreground">
              {totalCount.toLocaleString()} tools
            </span>
            {activeCategory && (
              <Badge
                variant="outline"
                className="gap-1 cursor-pointer"
                onClick={() => updateUrl({ category: '' })}
              >
                Category: {activeCategory.name}
                <X className="w-3 h-3" />
              </Badge>
            )}
          </div>

          {/* Results */}
          {isLoading ? (
            <LoadingSkeleton />
          ) : tools.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                {tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={handlePageChange}
                itemName="tools"
              />
            </>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tools found</h3>
              <p className="text-muted-foreground mb-4">
                {currentSearch
                  ? `No tools match "${currentSearch}"`
                  : "There are no tools in this category yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                Tools are automatically added when mentioned in playbooks
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}