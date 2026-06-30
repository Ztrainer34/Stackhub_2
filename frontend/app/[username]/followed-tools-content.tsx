"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolLogo } from "@/components/tool-logo";
import { Wrench } from "lucide-react";
import { Tool } from "@/lib/tool";
import { useUserFollowedTools } from "@/lib/queries/use-user-tools";
import { useAuth } from "@/lib/queries/use-auth";
import { ProfileToolActions } from "@/components/profile-tool-actions";

export default function FollowedToolsContent({
  username,
}: {
  username: string;
}) {
  const { data, isLoading, error } = useUserFollowedTools(username);
  const auth = useAuth();
  const isOwnProfile =
    auth.data?.status === "authenticated" &&
    auth.data.user.username === username;

  const tools = data?.tools ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[160px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Failed to load followed tools.
      </p>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed rounded-lg">
        <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No tools followed yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.map((tool) => (
        <FollowedToolCard
          key={tool.id}
          tool={tool}
          isOwner={isOwnProfile}
          username={username}
        />
      ))}
    </div>
  );
}

function FollowedToolCard({
  tool,
  isOwner,
  username,
}: {
  tool: Tool;
  isOwner: boolean;
  username: string;
}) {
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
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
                  {tool.name || "Unnamed Tool"}
                </h3>
                <ProfileToolActions
                  tool={tool}
                  isOwner={isOwner}
                  listType="followed"
                  username={username}
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {truncatedDescription}
              </p>
            </div>
          </div>

          {tool.categories && tool.categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-auto">
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
