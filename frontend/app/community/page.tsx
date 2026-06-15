import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import Link from "next/link";
import { Users } from "lucide-react";
import { getTopRecommendedUsers, User } from "@/lib/user";
import { getServerAuthState } from "@/lib/auth-server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { FollowButton } from "@/components/follow-button";

interface RecommendedUser extends User {
  display_name: string;
  cosine_similarity: number;
  post_count: number;
}

async function RecommendedUserCard({ user }: { user: RecommendedUser }) {
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
                {user.post_count === 1 ? 'post' : 'posts'}
              </span>
            </div>
          </div>
          
          <div className="mt-4 w-full">
            <FollowButton
              userId={user.id}
              className="w-full"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function RecommendedUsersSection() {
  const supabase = await createClient();

  // Require authentication
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  const users = await getTopRecommendedUsers("", supabase);
  const recommendedUsers = users as RecommendedUser[];

  if (recommendedUsers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No users found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {recommendedUsers.map((user) => (
        <RecommendedUserCard key={user.id} user={user} />
      ))}
    </div>
  );
}

export default async function CommunityPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-primary/10">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Discover People</h1>
          <p className="text-muted-foreground">
            Find creators with similar interests you haven&apos;t followed yet
          </p>
        </div>
      </div>

      <RecommendedUsersSection />
    </div>
  );
}