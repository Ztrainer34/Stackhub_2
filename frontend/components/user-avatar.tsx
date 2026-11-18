import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@/lib/user";
import { apiPath } from "@/lib/api-path";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user: User;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

// Map size to Gravatar pixel dimensions
const gravatarSizes = {
  sm: 48,   // 24px * 2 for retina
  md: 80,   // 40px * 2 for retina
  lg: 128,  // 64px * 2 for retina
  xl: 256,  // 128px * 2 for retina
};

// Precedence: an uploaded picture, then Gravatar, then the initial in
// AvatarFallback (which Radix shows whenever the image fails to load — the
// Gravatar route answers 404 for anyone without one).
//
// Gravatar goes through our API rather than gravatar.com directly. A direct
// URL needs the email hash, and an unsalted SHA-256 of an email is reversible
// for any address in a breach list — so the backend fetches the image and the
// hash never reaches the browser.
function getUserAvatarUrl(user: User, size: "sm" | "md" | "lg" | "xl"): string {
  if (user.avatar_url) return user.avatar_url;

  return `${process.env.NEXT_PUBLIC_API_URL!}${apiPath`/user/${user.username}/gravatar`}?s=${gravatarSizes[size]}`;
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-32 w-32 text-4xl",
};

export function UserAvatar({ user, className, size = "md" }: UserAvatarProps) {
  const avatarUrl = getUserAvatarUrl(user, size);

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={avatarUrl} alt={`${user.username}'s avatar`} />
      <AvatarFallback>
        {user.username[0]?.toUpperCase() || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
