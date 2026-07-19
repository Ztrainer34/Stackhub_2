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
import { Search, Wrench, Calendar, ExternalLink, Filter } from "lucide-react";
import { ToolLogo } from "@/components/tool-logo";
import { toolHref, BrowseTool } from "@/lib/tool";
import { AddToolDialog } from "@/components/add-tool-dialog";
import { useBrowseTools, useToolCategories } from "@/lib/queries/use-browse-tools";

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest first' },
];

function ToolCard({ tool }: { tool: BrowseTool }) {
  return (
    <Card className="hover:bg-muted/50 transition-colors border-l-4 border-l-transparent hover:border-l-primary">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white rounded-lg border shadow-sm flex items-center justify-center p-1">
                <ToolLogo
                  name={tool.name}
                  logoUrl={tool.logo_url}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={toolHref(tool)}
                    className="font-semibold text-primary hover:underline"
                  >
                    {tool.name}
                  </Link>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {tool.description}
                  </p>
                </div>
                {tool.vendor?.website && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 flex-shrink-0"
                    onClick={() => window.open(tool.vendor!.website!, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2 flex-wrap ml-13">
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

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground ml-13">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Updated {new Date(tool.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
              <div className="flex gap-2 ml-13">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
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
  const { data: categories } = useToolCategories(6);

  const tools = data?.tools ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = data?.total_pages ?? 0;

  const toolCategories = [
    { key: 'all', label: 'All', count: undefined as number | undefined },
    ...(categories ?? []).map((c) => ({
      key: c.slug,
      label: c.name,
      count: c.tool_count,
    })),
  ];

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
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Wrench className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-muted-foreground">
            Discover and explore software tools for your workflow
          </p>
        </div>
      </div>

      {/* Search + Add tool */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </form>
        <AddToolDialog />
      </div>

      {/* Filters - GitHub style tabs */}
      <div className="border-b mb-6">
        <div className="flex flex-wrap gap-6">
          {toolCategories.map((category) => (
            <button
              key={category.key}
              onClick={() => updateUrl({ category: category.key === 'all' ? '' : category.key })}
              className={`pb-3 px-1 border-b-2 transition-colors whitespace-nowrap ${
                currentCategory === category.key
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {category.label}
              {category.count !== undefined && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {category.count}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Sort and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {totalCount.toLocaleString()} tools
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Sort:</span>
          </div>
          <Select value={currentSort} onValueChange={(value) => updateUrl({ sort: value })}>
            <SelectTrigger className="w-48">
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
      </div>

      {/* Results */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : tools.length > 0 ? (
        <>
          <div className="space-y-4 mb-8">
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
        <div className="text-center py-12">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No tools found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? `No tools match "${searchQuery}"`
              : "There are no tools in this category yet"
            }
          </p>
          <p className="text-sm text-muted-foreground">
            Tools are automatically added when mentioned in playbooks
          </p>
        </div>
      )}
    </div>
  );
}