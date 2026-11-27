"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/follow-button";
import { useCommunityRecommendedUsers } from "@/lib/queries/use-user-actions";
import type { User } from "@/lib/user";

export interface RecommendedUser extends User {
  display_name: string;
  cosine_similarity: number;
  post_count: number;
}

export default function RecommendedUsersGrid({
  initialUsers,
}: {
  initialUsers: RecommendedUser[];
}) {
  // Users followed from this grid since the page loaded (see the hook).
  const followed = useRef(new Set<string>());

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommunityRecommendedUsers(initialUsers, () => followed.current.size);

  // Pages can overlap when similarity scores tie; show each person once.
  const users = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flat().filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  }, [data]);

  const handleFollowChange = (userId: string, following: boolean) => {
    if (following) followed.current.add(userId);
    else followed.current.delete(userId);
  };

  const handleShowMore = async () => {
    const result = await fetchNextPage();
    if (result.isError) toast.error("Could not load more people");
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {users.map((user) => (
          <RecommendedUserCard
            key={user.id}
            user={user}
            onFollowChange={(following) => handleFollowChange(user.id, following)}
          />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center mt-8">
          <Button
            variant="outline"
            onClick={handleShowMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

function RecommendedUserCard({
  user,
  onFollowChange,
}: {
  user: RecommendedUser;
  onFollowChange: (following: boolean) => void;
}) {
  return (
    <Card className="border border-border/50 h-full">
      <CardContent className="p-6 text-center h-full">
        <div className="flex flex-col items-center h-full">
          <UserAvatar user={user} size="lg" />

          <div className="space-y-2 mt-4 flex-1">
            <Link
              href={`/${user.username}`}
              className="font-semibold text-foreground hover:underline block"
            >
              {user.display_name || user.username}
            </Link>
            <p className="text-sm text-muted-foreground">@{user.username}</p>

            <div className="flex items-center justify-center gap-1">
              <span className="text-base font-semibold text-primary">{user.post_count}</span>
              <span className="text-sm text-muted-foreground">
                {user.post_count === 1 ? "post" : "posts"}
              </span>
            </div>
          </div>

          <div className="mt-4 w-full">
            <FollowButton
              userId={user.id}
              className="w-full"
              onFollowChange={onFollowChange}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
