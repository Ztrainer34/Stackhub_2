import { getUserFromUsername, getUserStats } from "@/lib/user";
import { getServerAuthState } from "@/lib/auth-server";
import { UserAvatar } from "@/components/user-avatar";
import { notFound } from "next/navigation";
import ProfileTabsInjector from "./profile-tabs-injector";
import { FollowButton } from "@/components/follow-button";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Globe, Building2, MapPin, Linkedin, Twitter, Pencil } from "lucide-react";

interface ProfileLayoutWrapperProps {
  username: string;
  children: React.ReactNode;
}

export default async function ProfileLayoutWrapper({ username, children }: ProfileLayoutWrapperProps) {
  const user = await getUserFromUsername(username);

  if (!user) {
    notFound();
  }

  // Fetch profile stats (posts / followers / following). Fall back to zeros if
  // the request fails so the sidebar still renders.
  const stats = await getUserStats(username).catch(() => ({
    post_count: 0,
    follower_count: 0,
    following_count: 0,
  }));

  // Check if user is authenticated and if this is their own profile
  const authState = await getServerAuthState();
  const currentUser = authState.status === 'authenticated' ? authState.user : null;
  const isOwnProfile = currentUser?.id === user.id;

  // Normalize LinkedIn / X values into a link href + display label. Users can
  // enter either a full URL or just a handle.
  const linkedinHref = user.linkedin
    ? user.linkedin.startsWith("http")
      ? user.linkedin
      : `https://www.linkedin.com/in/${user.linkedin.replace(/^@/, "")}`
    : null;
  const linkedinLabel = user.linkedin
    ? user.linkedin.startsWith("http")
      ? user.linkedin.replace(/^https?:\/\//, "")
      : `@${user.linkedin.replace(/^@/, "")}`
    : "";

  const twitterHref = user.twitter
    ? user.twitter.startsWith("http")
      ? user.twitter
      : `https://x.com/${user.twitter.replace(/^@/, "")}`
    : null;
  const twitterLabel = user.twitter
    ? user.twitter.startsWith("http")
      ? user.twitter.replace(/^https?:\/\//, "")
      : `@${user.twitter.replace(/^@/, "")}`
    : "";

  const hasContactInfo =
    user.company ||
    user.location ||
    user.website ||
    linkedinHref ||
    twitterHref;

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

                {/* Edit profile button - only on own profile */}
                {isOwnProfile && (
                  <div className="mb-4 w-full">
                    <Link href="/settings">
                      <Button variant="outline" size="sm" className="w-full">
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit profile
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Bio/Description */}
                {user.bio && (
                  <p className="text-muted-foreground text-sm mb-4 text-center whitespace-pre-wrap">
                    {user.bio}
                  </p>
                )}

                {/* Stats section */}
                <div className="w-full space-y-1">
                  <Link
                    href={`/${user.username}?tab=playbooks`}
                    className="flex justify-between text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted transition-colors"
                  >
                    <span className="text-muted-foreground">Posts</span>
                    <span className="font-medium">{stats.post_count}</span>
                  </Link>
                  <Link
                    href={`/${user.username}/followers`}
                    className="flex justify-between text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted transition-colors"
                  >
                    <span className="text-muted-foreground">Followers</span>
                    <span className="font-medium">{stats.follower_count}</span>
                  </Link>
                  <Link
                    href={`/${user.username}/following`}
                    className="flex justify-between text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted transition-colors"
                  >
                    <span className="text-muted-foreground">Following</span>
                    <span className="font-medium">{stats.following_count}</span>
                  </Link>
                </div>

                {/* Contact / about info */}
                {hasContactInfo && (
                  <div className="w-full space-y-3 mt-6 pt-6 border-t text-left">
                    {user.company && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{user.company}</span>
                      </div>
                    )}
                    {user.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{user.location}</span>
                      </div>
                    )}
                    {user.website && (
                      <a
                        href={user.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Globe className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">
                          {user.website.replace(/^https?:\/\//, "")}
                        </span>
                      </a>
                    )}
                    {linkedinHref && (
                      <a
                        href={linkedinHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Linkedin className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{linkedinLabel}</span>
                      </a>
                    )}
                    {twitterHref && (
                      <a
                        href={twitterHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Twitter className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{twitterLabel}</span>
                      </a>
                    )}
                  </div>
                )}
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