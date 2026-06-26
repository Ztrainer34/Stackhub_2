"use client";

import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { useFollowUser, useUnfollowUser } from "@/lib/queries/use-user-actions";
import { useState } from "react";

interface FollowButtonProps {
  userId: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  initialFollowing?: boolean;
}

export function FollowButton({
  userId,
  className,
  size = "sm",
  variant = "default",
  initialFollowing = false
}: FollowButtonProps) {
  const [isFollowed, setIsFollowed] = useState(initialFollowing);
  const followUserMutation = useFollowUser();
  const unfollowUserMutation = useUnfollowUser();

  const handleClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isFollowed) {
      // Optimistically update UI first
      setIsFollowed(false);
      
      // Unfollow
      unfollowUserMutation.mutate(userId, {
        onError: () => {
          // Revert optimistic update on error
          setIsFollowed(true);
        },
      });
    } else {
      // Optimistically update UI first
      setIsFollowed(true);
      
      // Follow
      followUserMutation.mutate(userId, {
        onError: () => {
          // Revert optimistic update on error
          setIsFollowed(false);
        },
      });
    }
  };

  return (
    <Button 
      size={size}
      onClick={handleClick}
      variant={isFollowed ? "secondary" : variant}
      className={className}
    >
      <UserPlus className="w-4 h-4 mr-2" />
      {isFollowed ? "Following" : "Follow"}
    </Button>
  );
}