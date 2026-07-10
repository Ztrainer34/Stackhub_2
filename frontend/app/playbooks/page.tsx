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
import { Search, BookOpen, Calendar, User, Filter } from "lucide-react";
import { ToolLogo } from "@/components/tool-logo";
import { Post } from "@/lib/post";
import { useBrowsePosts } from "@/lib/queries/use-browse-posts";

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'name', label: 'Name' },
  { value: 'stars', label: 'Most starred' },
];

function PlaybookCard({ playbook }: { playbook: Post }) {
  return (
    <Card className="hover:bg-muted/50 transition-colors border-l-4 border-l-transparent hover:border-l-primary">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <Link 
                href={`/${playbook.author_username}/${playbook.slug}`}
                className="font-semibold text-primary hover:underline"
              >
                {playbook.name}
              </Link>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {playbook.description}
              </p>
            </div>
            <Badge variant="secondary" className="ml-2 flex-shrink-0">
              {playbook.type}
            </Badge>
          </div>

          {/* Tools */}
          <div className="flex items-center gap-2 flex-wrap">
            {(playbook.tools ?? []).slice(0, 3).map((tool) => (
              <div key={tool.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="sm" />
                <span>{tool.name}</span>
              </div>
            ))}
            {(playbook.tools ?? []).length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{(playbook.tools ?? []).length - 3} more
              </span>
            )}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <Link 
                href={`/${playbook.author_username}`}
                className="hover:text-primary"
              >
                {playbook.author_username}
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Updated {new Date(playbook.updated_at).toLocaleDateString()}</span>
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
              <div className="flex justify-between">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PlaybooksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const currentType = searchParams.get('type') || 'all';
  const currentSort = searchParams.get('sort') || 'updated';
  const currentPage = parseInt(searchParams.get('page') || '1');
  const currentSearch = searchParams.get('q') || '';

  const { data, isLoading } = useBrowsePosts({
    type: currentType,
    q: currentSearch,
    sort: currentSort,
    page: currentPage,
  });

  const playbooks = data?.posts ?? [];
  const totalCount = data?.total_count ?? 0;
  const totalPages = data?.total_pages ?? 0;

  const playbookTypes = [
    { key: 'all', label: 'All', count: data?.counts.all_count ?? 0 },
    { key: 'playbook', label: 'Playbooks', count: data?.counts.playbook_count ?? 0 },
    { key: 'combo', label: 'Combos', count: data?.counts.combo_count ?? 0 },
    { key: 'comparison', label: 'Comparisons', count: data?.counts.comparison_count ?? 0 },
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
    if ('type' in params || 'sort' in params || 'q' in params) {
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
        <BookOpen className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Playbooks</h1>
          <p className="text-muted-foreground">
            Step-by-step guides for using tools effectively
          </p>
        </div>
      </div>

      {/* Search and Create */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search playbooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </form>
        <Link href="/new">
          <Button>New playbook</Button>
        </Link>
      </div>

      {/* Filters - GitHub style tabs */}
      <div className="border-b mb-6">
        <div className="flex flex-wrap gap-6">
          {playbookTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => updateUrl({ type: type.key === 'all' ? '' : type.key })}
              className={`pb-3 px-1 border-b-2 transition-colors ${
                currentType === type.key
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {type.label}
              <Badge variant="secondary" className="ml-2 text-xs">
                {type.count}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Sort and Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {totalCount.toLocaleString()} playbooks
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
      ) : playbooks.length > 0 ? (
        <>
          <div className="space-y-4 mb-8">
            {playbooks.map((playbook) => (
              <PlaybookCard key={playbook.id} playbook={playbook} />
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
        <div className="text-center py-12">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No playbooks found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? `No playbooks match "${searchQuery}"`
              : "There are no playbooks in this category yet"
            }
          </p>
          <Link href="/new">
            <Button>Create my first playbook</Button>
          </Link>
        </div>
      )}
    </div>
  );
}