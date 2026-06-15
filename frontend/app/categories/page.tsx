"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search, Grid3X3, ArrowRight, Wrench } from "lucide-react";

// Mock data structure - will be replaced with real API calls
interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  tool_count: number;
  description?: string;
}

// Mock categories organized by sections
const CATEGORY_SECTIONS = [
  {
    title: "AI & Machine Learning",
    categories: [
      { id: 1, name: "AI Chatbots", slug: "ai-chatbots", tool_count: 45 },
      { id: 2, name: "AI Code Generation", slug: "ai-code-generation", tool_count: 32 },
      { id: 3, name: "AI Content Creation", slug: "ai-content-creation", tool_count: 78 },
      { id: 4, name: "AI Writing Assistant", slug: "ai-writing-assistant", tool_count: 28 },
    ]
  },
  {
    title: "Design & Creative",
    categories: [
      { id: 5, name: "3D Modeling", slug: "3d-modeling", tool_count: 23 },
      { id: 6, name: "Animation", slug: "animation", tool_count: 19 },
      { id: 7, name: "Architecture", slug: "architecture", tool_count: 15 },
      { id: 8, name: "Brand Asset Management", slug: "brand-asset-management", tool_count: 12 },
    ]
  },
  {
    title: "Marketing & Sales",
    categories: [
      { id: 9, name: "Marketing Automation", slug: "marketing-automation", tool_count: 67 },
      { id: 10, name: "Social Media", slug: "social-media", tool_count: 34 },
      { id: 11, name: "Email Marketing", slug: "email-marketing", tool_count: 29 },
      { id: 12, name: "Analytics", slug: "analytics", tool_count: 41 },
    ]
  },
  {
    title: "Development & IT",
    categories: [
      { id: 13, name: "API Development", slug: "api-development", tool_count: 52 },
      { id: 14, name: "Database", slug: "database", tool_count: 38 },
      { id: 15, name: "DevOps", slug: "devops", tool_count: 44 },
      { id: 16, name: "Security", slug: "security", tool_count: 71 },
    ]
  },
];

function CategoryCard({ category }: { category: CategoryItem }) {
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
            {category.tool_count} tools available
          </p>
          <div className="mt-3">
            <Badge variant="secondary" className="text-xs">
              Browse Tools
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CategorySection({ title, categories }: { title: string; categories: CategoryItem[] }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-primary rounded-full"></div>
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <div key={sectionIndex}>
          <Skeleton className="h-7 w-48 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, cardIndex) => (
              <Card key={cardIndex}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-4" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  // Mock data - replace with real API call
  const isLoading = false;
  const allCategories = CATEGORY_SECTIONS.flatMap(section => section.categories);
  const totalCount = allCategories.length;

  // Filter categories based on search
  const filteredSections = searchQuery 
    ? [{
        title: "Search Results",
        categories: allCategories.filter(cat => 
          cat.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }]
    : CATEGORY_SECTIONS;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set('q', searchQuery);
    } else {
      params.delete('q');
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Grid3X3 className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-4">Tool Categories</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Explore our comprehensive collection of {totalCount}+ software tool categories. 
          Find the perfect tools for your specific needs and workflows.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-md mx-auto mb-8">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </form>
      </div>

      {/* Categories */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : filteredSections.length > 0 && filteredSections[0].categories.length > 0 ? (
        <div>
          {filteredSections.map((section, index) => (
            <CategorySection
              key={index}
              title={section.title}
              categories={section.categories}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Grid3X3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No categories found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? `No categories match "${searchQuery}"`
              : "No categories available"
            }
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
                Browse All Tools
              </Badge>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}