"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import Link from "next/link";
import { Search, Grid3X3, ArrowRight, Wrench } from "lucide-react";
import { CategoryGroup, filterCategories, groupCategories } from "@/lib/category-groups";
import { TopCategory } from "@/lib/homepage";
import { useToolCategories } from "@/lib/queries/use-browse-tools";

function CategoryCard({ category }: { category: TopCategory }) {
  return (
    <Link href={`/category/${category.slug}`}>
      <Card className="h-full hover:shadow-lg transition-all duration-200 hover:border-primary/50 group cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              {category.name}
            </h3>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm text-muted-foreground">
            {category.tool_count} tool{category.tool_count === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function CategorySection({ group }: { group: CategoryGroup }) {
  return (
    <div className="mb-8">
      {group.name && (
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <div className="w-1 h-6 bg-primary rounded-full"></div>
          <Link href={`/category/${group.slug}`} className="hover:text-primary transition-colors">
            {group.name}
          </Link>
        </h2>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {group.categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: categories, isLoading, error } = useToolCategories(100);
  const groups = groupCategories(filterCategories(categories ?? [], searchQuery));

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Grid3X3 className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-4">Tool categories</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Find the right tools for your specific needs and workflows.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-md mx-auto mb-8 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <p className="text-center py-12 text-muted-foreground">
          Unable to load categories. Please try again later.
        </p>
      ) : groups.length > 0 ? (
        groups.map((group) => <CategorySection key={group.slug} group={group} />)
      ) : (
        <div className="text-center py-12">
          <Grid3X3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No categories found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery
              ? `No categories match "${searchQuery}"`
              : "No categories available"}
          </p>
        </div>
      )}

      {/* Footer Section */}
      <div className="mt-16 text-center">
        <Card className="bg-muted/50">
          <CardContent className="py-8">
            <Wrench className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Can&apos;t find what you&apos;re looking for?</h2>
            <p className="text-muted-foreground mb-4">
              Use our search to find specific tools or explore all available options
            </p>
            <Link href="/tools">
              <Badge variant="outline" className="px-4 py-2 text-sm hover:bg-primary hover:text-primary-foreground transition-colors">
                Browse all tools
              </Badge>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
