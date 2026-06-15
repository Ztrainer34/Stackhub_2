"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserPosts, useUserStarredPosts } from "@/lib/queries/use-user-playbooks";
import { useState, useMemo } from "react";
import PostCard from "../post-card";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Post } from "@/lib/post";

export default function UserInfoTabs({ username }: { username: string }) {
  const [tab, setTab] = useState("overview");
  const [page, setPage] = useState(1);
  const limit = 12;
  
  // Fetch posts based on current tab
  const postsQuery = useUserPosts(tab !== "starred", username, page, limit);
  const starredQuery = useUserStarredPosts(tab === "starred", username, page, limit);

  // Get current data based on active tab
  const currentQuery = tab === "starred" ? starredQuery : postsQuery;
  // Filter posts by type for non-starred tabs
  const filteredPosts = useMemo(() => {
    const currentPosts = currentQuery.data?.posts || [];

    if (tab === "starred") return currentPosts;
    if (!currentPosts) return [];
    
    switch (tab) {
      case "overview":
        return currentPosts;
      case "playbooks":
        return currentPosts.filter(post => post.type === "playbook");
      case "combos":
        return currentPosts.filter(post => post.type === "combo");
      case "comparisons":
        return currentPosts.filter(post => post.type === "comparison");
      default:
        return currentPosts;
    }
  }, [tab, currentQuery]);

  // Reset page when tab changes
  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setPage(1);
  };

  // Pagination handlers
  const handlePreviousPage = () => setPage(prev => Math.max(1, prev - 1));
  const handleNextPage = () => setPage(prev => prev + 1);

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[140px] w-full rounded-lg" />
      ))}
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-12">
      <p className="text-muted-foreground text-lg">{message}</p>
    </div>
  );

  const PostGrid = ({ posts }: { posts: Post[] }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post, i) => (
          <Link key={i} href={`/${username}/${post.slug}`} className="block">
            <PostCard post={post} variant="compact" />
          </Link>
        ))}
      </div>
      
      {/* Pagination Controls */}
      {currentQuery.data && currentQuery.data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentQuery.data.page} of {currentQuery.data.total_pages} 
            ({currentQuery.data.total_count} total posts)
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePreviousPage}
              disabled={currentQuery.data.page <= 1}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleNextPage}
              disabled={currentQuery.data.page >= currentQuery.data.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Tabs
      defaultValue="overview"
      value={tab}
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
        <TabsTrigger value="combos">Combos</TabsTrigger>
        <TabsTrigger value="comparisons">Comparisons</TabsTrigger>
        <TabsTrigger value="starred">Starred</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview" className="mt-6">
        {currentQuery.isLoading && <LoadingSkeleton />}
        {currentQuery.error && (
          <EmptyState message="Error loading posts" />
        )}
        {currentQuery.data && (
          <>
            {filteredPosts.length === 0 ? (
              <EmptyState message="No posts found" />
            ) : (
              <PostGrid posts={filteredPosts} />
            )}
          </>
        )}
      </TabsContent>
      
      <TabsContent value="playbooks" className="mt-6">
        {currentQuery.isLoading && <LoadingSkeleton />}
        {currentQuery.error && (
          <EmptyState message="Error loading playbooks" />
        )}
        {currentQuery.data && (
          <>
            {filteredPosts.length === 0 ? (
              <EmptyState message="No playbooks found" />
            ) : (
              <PostGrid posts={filteredPosts} />
            )}
          </>
        )}
      </TabsContent>
      
      <TabsContent value="combos" className="mt-6">
        {currentQuery.isLoading && <LoadingSkeleton />}
        {currentQuery.error && (
          <EmptyState message="Error loading combos" />
        )}
        {currentQuery.data && (
          <>
            {filteredPosts.length === 0 ? (
              <EmptyState message="No combos found" />
            ) : (
              <PostGrid posts={filteredPosts} />
            )}
          </>
        )}
      </TabsContent>
      
      <TabsContent value="comparisons" className="mt-6">
        {currentQuery.isLoading && <LoadingSkeleton />}
        {currentQuery.error && (
          <EmptyState message="Error loading comparisons" />
        )}
        {currentQuery.data && (
          <>
            {filteredPosts.length === 0 ? (
              <EmptyState message="No comparisons found" />
            ) : (
              <PostGrid posts={filteredPosts} />
            )}
          </>
        )}
      </TabsContent>
      
      <TabsContent value="starred" className="mt-6">
        {currentQuery.isLoading && <LoadingSkeleton />}
        {currentQuery.error && (
          <EmptyState message="Error loading starred posts" />
        )}
        {currentQuery.data && (
          <>
            {filteredPosts.length === 0 ? (
              <EmptyState message="No starred posts found" />
            ) : (
              <PostGrid posts={filteredPosts} />
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
