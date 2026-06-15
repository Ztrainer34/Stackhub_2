import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@/lib/user";
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

function getUserAvatarUrl(user: User, size: "sm" | "md" | "lg" | "xl"): string {
  const pixelSize = gravatarSizes[size];

  // If we have the pre-computed hash from the backend, use it
  if (user.email_hash) {
    return `https://gravatar.com/avatar/${user.email_hash}?s=${pixelSize}&d=404`;
  }

  // Fallback for users without email_hash (shouldn't happen after migration)
  return `https://gravatar.com/avatar/00000000000000000000000000000000?s=${pixelSize}&d=404`;
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
