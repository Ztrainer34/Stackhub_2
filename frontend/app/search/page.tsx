"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { FileText, User, Wrench, ChevronLeft, ChevronRight } from "lucide-react";
import PostCard from "@/components/post-card";
import { useFacetCounts, useSearch } from "@/lib/queries/use-search";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { ToolLogo } from "@/components/tool-logo";
import { useEffect, useMemo } from "react";
import { Tool } from "@/lib/tool";
import { Post } from "@/lib/post";
import { SearchableCategory, searchableCategoryValues } from "@/lib/search";
import Link from "next/link";
import { ToolActions } from "@/components/tool-actions";
import { User as UserType } from "@/lib/user";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/follow-button";
import { useAuth } from "@/lib/queries/use-auth";

type SearchCategory = {
  id: SearchableCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const categories: SearchCategory[] = [
  {
    id: "post",
    label: "Posts",
    icon: FileText,
  },
  {
    id: "profile",
    label: "Users",
    icon: User,
  },
  {
    id: "tool",
    label: "Tools",
    icon: Wrench,
  },
];

interface ToolCardProps {
  tool: Tool;
}

function ToolCard({ tool }: ToolCardProps) {
  const handleCardClick = () => {
    window.location.href = `/tool/${tool.id}`;
  };

  return (
    <Card 
      className="w-full max-w-2xl hover:shadow-lg transition-shadow duration-200 cursor-pointer"
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <ToolLogo
            name={tool.name}
            logoUrl={tool.logo_url}
            size="md"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {tool.name}
              </h3>
              <ToolActions tool={tool} variant="mini" />
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
              {tool.description}
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {tool.categories.slice(0, 3).map((category) => (
              <Badge
                key={category.id}
                variant="secondary"
                className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
              >
                {category.name}
              </Badge>
            ))}
            {tool.categories.length > 3 && (
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                +{tool.categories.length - 3} more
              </Badge>
            )}
          </div>
        </div>

        {/* Website Link */}
        {tool.vendor.website && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 bg-transparent"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (tool.vendor.website) {
                window.open(tool.vendor.website, '_blank');
              }
            }}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Visit Website
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function UserCard({ user }: { user: UserType }) {
  const auth = useAuth();
  const currentUser =
    auth.data?.status === "authenticated" ? auth.data.user : null;
  const isOwnProfile = currentUser?.id === user.id;

  return (
    <Card className="w-full max-w-2xl hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Link href={`/${user.username}`} className="flex-shrink-0">
            <UserAvatar user={user} size="lg" />
          </Link>
          <Link href={`/${user.username}`} className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {user.display_name || user.username}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              @{user.username}
            </p>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentUser && !isOwnProfile && (
              <FollowButton userId={user.id} size="sm" />
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/${user.username}`}>View profile</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Sidebar({
  activeCategory,
  setActiveCategory,
  facetCounts,
}: {
  activeCategory: string;
  setActiveCategory: (category: SearchableCategory) => void;
  facetCounts: { [key: string]: number };
}) {
  return (
    <div className="w-64 space-y-1">
      {/* <h2 className="text-lg font-semibold mb-3">Filter by type</h2> */}
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => setActiveCategory(category.id)}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
            activeCategory === category.id
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2">
            <category.icon className="h-4 w-4" />
            <span>{category.label}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {facetCounts?.[`${category.id}_count`] ?? 0}
          </Badge>
        </button>
      ))}
    </div>
  );
}

type FacetCount = {
  category: string;
  count: number;
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("t") ?? "";
  const page = parseInt(searchParams.get("p") ?? "1");

  useEffect(() => {
    if (!searchableCategoryValues.includes(category as SearchableCategory)) {
      router.push("/");
    }
  }, [category, router]);

  const setCategory = (category: SearchableCategory) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("t");
    params.set("t", category);
    params.delete("p"); // Reset to first page when changing category
    router.push("?" + params);
  };

  const setPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("p");
    } else {
      params.set("p", newPage.toString());
    }
    router.push("?" + params);
  };

  // FIXME: Better error handling
  const { data: facetCounts } = useFacetCounts(query);

  const { data, isLoading, error } = useSearch(
    query,
    category as SearchableCategory,
    page, // Use 1-based indexing
  );

  const sortedCategories = useMemo((): FacetCount[] | null => {
    if (!facetCounts) return null;

    const entries = Object.entries(facetCounts);
    if (entries.length === 0) return null;

    return entries
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({
        category: category.split("_")[0],
        count,
      }));
  }, [facetCounts]);

  if (!query) return <h1 className="m-10 text-xl">Missing search query</h1>;
  if (error) return <h1 className="m-10 text-xl">Error loading results</h1>;

  const results = data?.data ?? [];
  const totalPages = data?.total_pages ?? 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const PlaceholderList = () =>
    Array.from({ length: 3 }, (_, i) => i + 1).map((n) => (
      <Skeleton key={n} className="h-[150px] w-full max-w-2xl rounded-xl" />
    ));

  const NoResultFoundText = () => {
    if (
      !sortedCategories ||
      sortedCategories.length === 0 ||
      sortedCategories[0].count === 0
    ) {
      return <div className="text-muted-foreground">No results found.</div>;
    }

    const activeCategoryName = categories.find((c) => c.id === category)?.label;
    const bestCategory = sortedCategories[0];
    const secondBest = sortedCategories[1];
    const targetCategory = categories.find(
      (c) => c.id === bestCategory.category
    );

    return (
      <div className="text-muted-foreground">
        No results found for {activeCategoryName}. There are{" "}
        {bestCategory.count} results for{" "}
        <Link
          className="text-blue-700"
          href={
            "?" + new URLSearchParams({ q: query, t: bestCategory.category })
          }
        >
          {targetCategory?.label ?? bestCategory.category}
        </Link>
        {secondBest?.count > 0 && (
          <>
            , and {secondBest.count} for{" "}
            <Link
              className="text-blue-700"
              href={
                "?" + new URLSearchParams({ q: query, t: secondBest.category })
              }
            >
              {categories.find((c) => c.id === secondBest.category)?.label ??
                secondBest.category}
            </Link>
          </>
        )}
        .
      </div>
    );
  };

  const List = () => (
    <>
      {category === "post" &&
        (results as Post[]).map((post) => (
          <a
            key={post.id}
            href={`/${post.author_username}/${post.slug}`}
            className="block"
          >
            <PostCard post={post} />
          </a>
        ))}

      {category === "tool" &&
        (results as Tool[]).map((tool) => (
          <div key={tool.id}>
            <Link href={`/tool/${tool.id}`}>
              <ToolCard tool={tool} />
            </Link>
          </div>
        ))}

      {category === "profile" &&
        (results as UserType[]).map((user) => (
          <UserCard key={user.id} user={user} />
        ))}

      {results.length === 0 && <NoResultFoundText />}
    </>
  );

  const Pagination = () => (
    <div className="flex items-center justify-between mt-6">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={!hasPrevPage}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={!hasNextPage}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex p-4">
      <Sidebar
        activeCategory={category}
        setActiveCategory={setCategory}
        facetCounts={facetCounts!}
      />
      <div className="mx-5 flex-1 space-y-4">
        {isLoading ? <PlaceholderList /> : <List />}
        {!isLoading && results.length > 0 && <Pagination />}
      </div>
    </div>
  );
}
