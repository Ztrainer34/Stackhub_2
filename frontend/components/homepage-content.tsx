"use client";

import { TopCategory } from "@/lib/homepage";
import { User } from "@/lib/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, BookOpen, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import PostCard from "./post-card";
import { Post } from "@/lib/post";

interface HomepageContentProps {
  initialTopPosts: Post[];
  initialTopCategories: TopCategory[];
  user: User;
}

export default function HomepageContent({
  initialTopPosts,
  initialTopCategories,
  user,
}: HomepageContentProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Welcome back, {user.username}!
        </h1>
        <p className="text-muted-foreground">
          Discover the latest playbooks and explore trending tool categories
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create New
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/new">
              <Button className="w-full">
                Start Writing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Explore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/playbooks">
              <Button variant="outline" className="w-full">
                Browse Playbooks
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Community
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/community">
              <Button variant="outline" className="w-full">
                Find People
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top Posts Section */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Latest Playbooks
            </h2>
            <Link href="/playbooks">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {initialTopPosts.map((post) => (
              <Link key={post.id} href={`/${post.author_username}/${post.slug}`}>
                <PostCard post={post} />
              </Link>
            ))}
          </div>
        </div>

        {/* Tool Categories Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Popular Categories
            </h2>
            <Link href="/tools">
              <Button variant="outline" size="sm">
                Browse Tools
              </Button>
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {initialTopCategories.map((category) => (
              <Link key={category.id} href={`/category/${category.slug}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {category.tool_count} tools
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {category.tool_count}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}