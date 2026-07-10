"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Tool, toolHref } from "@/lib/tool";
import { Pagination } from "@/components/pagination";
import { useSearchParams, useRouter } from "next/navigation";
import { useCategoryTools, useCategory } from "@/lib/queries/use-category-tools";
import { use, useEffect } from "react";
import { ToolActions } from "@/components/tool-actions";

interface ToolCardProps {
  tool: Tool
}

function ToolCard({ tool }: ToolCardProps) {
  const truncatedDescription = tool.description && tool.description.length > 200
    ? tool.description.substring(0, 200) + "..."
    : tool.description || "No description available";

  return (
    <Link href={toolHref(tool)}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col">
        <CardContent className="p-6 flex flex-col flex-1">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0">
              <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
                <ToolLogo
                  name={tool.name}
                  logoUrl={tool.logo_url}
                  size="md"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {tool.name || "Unnamed Tool"}
                </h3>
                <ToolActions tool={tool} variant="mini" />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                {truncatedDescription}
              </p>
            </div>
          </div>

          {/* Spacer to push categories to bottom */}
          <div className="flex-1" />

          {/* Categories */}
          {tool.categories && tool.categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {tool.categories.slice(0, 3).map((category) => (
                <Badge
                  key={category.id}
                  variant="secondary"
                  className="text-xs"
                >
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

export default function CategoryPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const categorySlug = decodeURIComponent(name);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const currentPage = parseInt(searchParams.get('page') || '1');
  
  const { data: toolsData, isLoading: toolsLoading, error: toolsError } = useCategoryTools(categorySlug, currentPage);
  const { data: category, isLoading: categoryLoading, error: categoryError } = useCategory(categorySlug);

  useEffect(() => {
    console.log(toolsData)
    console.log(category)
  }, [toolsData, category])

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', page.toString());
    }
    router.push(`?${params.toString()}`);
  };

  // Handle errors in client component - don't use notFound() in client components

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-[280px] w-full rounded-lg" />
      ))}
    </div>
  );

  const isLoading = toolsLoading || categoryLoading;
  const hasData = toolsData?.data && category;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="mb-8">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-6 w-48" />
            </div>
          ) : (toolsError || categoryError) ? (
            <>
              <h1 className="text-3xl font-bold mb-2">Error Loading Category</h1>
              <p className="text-muted-foreground text-lg">
                Unable to load this category. Please try again later.
              </p>
            </>
          ) : hasData ? (
            <>
              <h1 className="text-3xl font-bold mb-2">{category.name}</h1>
              <p className="text-muted-foreground text-lg">
                {toolsData.total_count || 0} tool{toolsData.total_count !== 1 ? 's' : ''} in this category
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">Category Not Found</h1>
              <p className="text-muted-foreground text-lg">
                This category does not exist or has no tools.
              </p>
            </>
          )}
        </div>

        {/* Tools Grid */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (toolsError || categoryError) ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Unable to load tools for this category.</p>
          </div>
        ) : hasData && toolsData.data.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {toolsData.data.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={toolsData.page}
              totalPages={toolsData.total_pages}
              totalCount={toolsData.total_count}
              onPageChange={handlePageChange}
              itemName="tools"
            />
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No tools found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}