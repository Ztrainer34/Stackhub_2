import { getUserFromUsername } from "@/lib/user";
import { getServerAuthState } from "@/lib/auth-server";
import { UserAvatar } from "@/components/user-avatar";
import { notFound } from "next/navigation";
import ProfileTabsInjector from "./profile-tabs-injector";
import { FollowButton } from "@/components/follow-button";
import { Globe } from "lucide-react";

interface ProfileLayoutWrapperProps {
  username: string;
  children: React.ReactNode;
}

export default async function ProfileLayoutWrapper({ username, children }: ProfileLayoutWrapperProps) {
  const user = await getUserFromUsername(username);

  if (!user) {
    notFound();
  }

  // Check if user is authenticated and if this is their own profile
  const authState = await getServerAuthState();
  const currentUser = authState.status === 'authenticated' ? authState.user : null;
  const isOwnProfile = currentUser?.id === user.id;

  return (
    <>
      {/* Inject tabs into navbar */}
      <ProfileTabsInjector username={user.username} />
      
      {/* Main content area with sidebar layout */}
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* User Info Panel - Left sidebar */}
          <div className="w-full lg:w-80 lg:flex-shrink-0">
            <div className="bg-card rounded-lg border p-6 sticky top-20">
              <div className="flex flex-col items-center text-center">
                <UserAvatar user={user} size="xl" className="mb-4" />
                <h1 className="text-2xl font-bold mb-2">
                  {user.display_name || user.username}
                </h1>
                <p className="text-sm text-muted-foreground mb-4">@{user.username}</p>

                {/* Follow button - only show if not own profile and user is authenticated */}
                {currentUser && !isOwnProfile && (
                  <div className="mb-4">
                    <FollowButton
                      userId={user.id}
                      size="sm"
                    />
                  </div>
                )}

                {/* Bio/Description */}
                {user.bio && (
                  <p className="text-muted-foreground text-sm mb-4 text-center whitespace-pre-wrap">
                    {user.bio}
                  </p>
                )}

                {/* Website */}
                {user.website && (
                  <a
                    href={user.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline mb-4"
                  >
                    <Globe className="w-4 h-4" />
                    {user.website.replace(/^https?:\/\//, '')}
                  </a>
                )}

                {/* Stats section */}
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Posts</span>
                    <span className="font-medium">12</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Followers</span>
                    <span className="font-medium">156</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Following</span>
                    <span className="font-medium">89</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content Panel - Right side */}
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}