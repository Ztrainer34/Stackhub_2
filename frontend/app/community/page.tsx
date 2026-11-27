import { Users } from "lucide-react";
import { getTopRecommendedUsers } from "@/lib/user";
import { getServerAuthState } from "@/lib/auth-server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CommunitySearch from "./community-search";
import RecommendedUsersGrid, { type RecommendedUser } from "./recommended-users-grid";

async function RecommendedUsersSection() {
  const supabase = await createClient();

  // Require authentication
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  const users = await getTopRecommendedUsers("", supabase);
  const recommendedUsers = users as RecommendedUser[];

  // Only show this section if there are recommendations.
  if (recommendedUsers.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-primary mb-4">
        People you may be interested in
      </h2>
      <RecommendedUsersGrid initialUsers={recommendedUsers} />
    </div>
  );
}

export default async function CommunityPage() {
  const authState = await getServerAuthState();

  if (authState.status !== "authenticated") {
    redirect(authState.status === "unauthenticated" ? "/login" : "/");
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-primary/10">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Community</h1>
          <p className="text-muted-foreground">
            Connect with creators and discover their playbooks
          </p>
        </div>
      </div>

      <CommunitySearch currentUserId={authState.user.id}>
        <RecommendedUsersSection />
      </CommunitySearch>
    </div>
  );
}