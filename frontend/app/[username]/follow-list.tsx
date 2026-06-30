"use client";

import Link from "next/link";
import { useState } from "react";
import { useFollowList } from "@/lib/queries/use-follow-list";
import { useAuth } from "@/lib/queries/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/follow-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FollowListUser } from "@/lib/user";

interface FollowListProps {
  username: string;
  kind: "followers" | "following";
}

export default function FollowList({ username, kind }: FollowListProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useFollowList(username, kind, page);
  const auth = useAuth();
  const currentUser =
    auth.data?.status === "authenticated" ? auth.data.user : null;

  const title = kind === "followers" ? "Followers" : "Following";

  const users = data?.users ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-muted-foreground">Failed to load {title.toLowerCase()}.</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground">
          {kind === "followers"
            ? "No followers yet."
            : "Not following anyone yet."}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={currentUser?.id === user.id}
              isAuthenticated={!!currentUser}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
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
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  isAuthenticated,
}: {
  user: FollowListUser;
  isSelf: boolean;
  isAuthenticated: boolean;
}) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
      <Link href={`/${user.username}`} className="flex-shrink-0">
        <UserAvatar user={user} size="lg" />
      </Link>
      <Link href={`/${user.username}`} className="flex-1 min-w-0">
        <p className="font-semibold truncate">
          {user.display_name || user.username}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          @{user.username}
        </p>
        {user.bio && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
            {user.bio}
          </p>
        )}
      </Link>
      {isAuthenticated && !isSelf && (
        <div className="flex-shrink-0">
          <FollowButton
            userId={user.id}
            size="sm"
            initialFollowing={user.is_following}
          />
        </div>
      )}
    </div>
  );
}
