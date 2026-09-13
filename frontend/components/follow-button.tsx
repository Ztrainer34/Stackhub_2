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
  // Tracked alongside the id it belongs to: moving from one profile to another
  // reuses this component, which would otherwise keep showing the previous
  // person's follow state. Keyed on userId rather than initialFollowing so an
  // optimistic toggle survives an unrelated re-render.
  const [followState, setFollowState] = useState({
    userId,
    following: initialFollowing,
  });
  if (followState.userId !== userId) {
    setFollowState({ userId, following: initialFollowing });
  }
  const isFollowed = followState.following;
  const setIsFollowed = (following: boolean) =>
    setFollowState({ userId, following });

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