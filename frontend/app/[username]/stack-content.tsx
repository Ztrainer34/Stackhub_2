"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Tool } from "@/lib/tool";
import { Layers, Eye } from "lucide-react";
import { useUserStack, useUserWatchlist } from "@/lib/queries/use-user-tools";

interface StackContentProps {
  username: string;
}

function ToolCard({ tool }: { tool: Tool }) {
  const truncatedDescription =
    tool.description && tool.description.length > 160
      ? tool.description.substring(0, 160) + "..."
      : tool.description || "No description available";

  return (
    <Link href={`/tool/${tool.id}`}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col">
        <CardContent className="p-5 flex flex-col flex-1">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0">
              <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
                <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="md" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
                {tool.name || "Unnamed Tool"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {truncatedDescription}
              </p>
            </div>
          </div>

          <div className="flex-1" />

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

function ToolGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[160px] w-full rounded-lg" />
      ))}
    </div>
  );
}

interface ToolSectionProps {
  title: string;
  icon: React.ReactNode;
  tools: Tool[];
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
}

function ToolSection({
  title,
  icon,
  tools,
  isLoading,
  isError,
  emptyMessage,
}: ToolSectionProps) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
        {!isLoading && !isError && (
          <span className="text-sm text-muted-foreground">({tools.length})</span>
        )}
      </div>

      {isLoading ? (
        <ToolGridSkeleton />
      ) : isError ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Failed to load {title.toLowerCase()}.</p>
        </div>
      ) : tools.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function StackContent({ username }: StackContentProps) {
  const stackQuery = useUserStack(username);
  const watchlistQuery = useUserWatchlist(username);

  return (
    <div>
      <ToolSection
        title="Active Stack"
        icon={<Layers className="w-5 h-5 text-foreground" />}
        tools={stackQuery.data?.tools || []}
        isLoading={stackQuery.isLoading}
        isError={!!stackQuery.error}
        emptyMessage="No tools in the stack yet."
      />

      <ToolSection
        title="Watchlist"
        icon={<Eye className="w-5 h-5 text-foreground" />}
        tools={watchlistQuery.data?.tools || []}
        isLoading={watchlistQuery.isLoading}
        isError={!!watchlistQuery.error}
        emptyMessage="No tools in the watchlist yet."
      />
    </div>
  );
}
