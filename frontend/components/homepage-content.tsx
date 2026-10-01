"use client";

import { PopularTool } from "@/lib/homepage";
import { User } from "@/lib/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Users, BookOpen, ArrowRight, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import PostCard from "./post-card";
import ActivityFeed from "./activity-feed";
import { ToolLogo } from "./tool-logo";
import { Post } from "@/lib/post";
import { toolHref } from "@/lib/tool";

interface HomepageContentProps {
  initialTopPosts: Post[];
  initialPopularTools: PopularTool[];
  user: User;
}

/**
 * A section heading with an optional aside and a link out to the full list.
 * Every shelf on the dashboard uses it, so they stay visually identical.
 */
function SectionHeader({
  icon,
  title,
  aside,
  href,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {aside && (
          <span className="text-sm text-muted-foreground">{aside}</span>
        )}
      </div>
      <Link href={href} className="shrink-0">
        <Button size="sm">
          {action}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

function PopularToolCard({ tool }: { tool: PopularTool }) {
  return (
    <Link href={toolHref(tool)}>
      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
              <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold truncate">{tool.name}</h3>
              {tool.stack_count > 0 && (
                <p className="text-xs text-muted-foreground">
                  in {tool.stack_count.toLocaleString()}{" "}
                  {tool.stack_count === 1 ? "stack" : "stacks"}
                </p>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {tool.description || "No description available"}
          </p>

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

export default function HomepageContent({
  initialTopPosts,
  initialPopularTools,
  user,
}: HomepageContentProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Just "Home". The page is the user's own dashboard — a greeting and a
          line explaining it added height above the content without telling
          anyone anything they could act on. */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Home</h1>
      </div>

      {/* Quick Actions. The designs also carry an "ask anything" box above
          these, held back until StackHub has an embedded LLM behind it. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create new
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/new">
              <Button className="w-full">
                Add playbook
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
                Browse playbooks
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
                Find people
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Trending playbooks — ranked server-side against this viewer's tools:
          stack first, then followed tools, then tools from playbooks they
          starred, then tools used by people they follow. */}
      <section className="mb-10">
        <SectionHeader
          icon={<Flame className="h-6 w-6" />}
          title="Trending playbooks"
          aside="for you"
          href="/playbooks"
          action="Browse playbooks"
        />

        {initialTopPosts.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-muted-foreground mb-1">
              Nothing to recommend yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Add tools to your{" "}
              <Link href={`/${user.username}`} className="text-primary hover:underline">
                stack
              </Link>{" "}
              and we will find playbooks that use them.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {initialTopPosts.map((post) => (
              <Link key={post.id} href={`/${post.author_username}/${post.slug}`}>
                <PostCard post={post} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Popular tools — ranked by how many people actually run them. */}
      <section className="mb-10">
        <SectionHeader
          icon={<Wrench className="h-6 w-6" />}
          title="Popular tools"
          aside="rising this week"
          href="/tools"
          action="Browse tools"
        />

        {initialPopularTools.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-muted-foreground">No tools yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {initialPopularTools.map((tool) => (
              <PopularToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </section>

      {/* Activity from the people and tools this user follows. */}
      <ActivityFeed />
    </div>
  );
}
