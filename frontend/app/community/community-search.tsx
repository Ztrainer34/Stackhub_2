"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/follow-button";
import Link from "next/link";
import { useSearch } from "@/lib/queries/use-search";
import type { User } from "@/lib/user";

interface CommunitySearchProps {
  /** The "People you may be interested in" section, shown when not searching. */
  children: React.ReactNode;
  currentUserId?: string;
}

export default function CommunitySearch({
  children,
  currentUserId,
}: CommunitySearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the query so we don't fire a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const isSearching = debouncedQuery.length > 0;

  return (
    <div>
      <div className="relative max-w-xl mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search users..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isSearching ? (
        <UserSearchResults query={debouncedQuery} currentUserId={currentUserId} />
      ) : (
        children
      )}
    </div>
  );
}

function UserSearchResults({
  query,
  currentUserId,
}: {
  query: string;
  currentUserId?: string;
}) {
  const { data, isLoading, error } = useSearch(query, "profile", 1);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-muted-foreground text-center py-12">
        Failed to search users.
      </p>
    );
  }

  const users = (data?.data ?? []) as User[];

  if (users.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-12">
        No users found for &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {users.map((user) => (
        <SearchUserCard
          key={user.id}
          user={user}
          isSelf={currentUserId === user.id}
        />
      ))}
    </div>
  );
}

function SearchUserCard({ user, isSelf }: { user: User; isSelf: boolean }) {
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
          </div>

          {!isSelf && (
            <div className="mt-4 w-full">
              <FollowButton userId={user.id} className="w-full" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
