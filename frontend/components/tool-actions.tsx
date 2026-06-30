"use client";

import { Button } from "@/components/ui/button";
import { Layers, Bookmark, Check, Plus } from "lucide-react";
import {
  useAddToStack,
  useAddToWatchlist,
  useRemoveFromStack,
  useRemoveFromWatchlist,
  useFollowTool,
  useUnfollowTool,
  useTool,
} from "@/lib/queries/use-tool-actions";
import { toast } from "sonner";
import { Tool } from "@/lib/tool";

interface ToolActionsProps {
  tool: Tool;
  variant?: "full" | "mini";
}

export function ToolActions({ tool, variant = "full" }: ToolActionsProps) {
  
  // Use React Query to get the latest tool data (subscribes to cache updates)
  // Cache is already populated by HydrationBoundary
  const { data: currentTool } = useTool(tool.id);
  
  const addToStackMutation = useAddToStack();
  const removeFromStackMutation = useRemoveFromStack();
  const addToWatchlistMutation = useAddToWatchlist();
  const removeFromWatchlistMutation = useRemoveFromWatchlist();
  const followToolMutation = useFollowTool();
  const unfollowToolMutation = useUnfollowTool();

  const isInStack = currentTool?.is_in_stack ?? false;
  const isInWatchlist = currentTool?.is_in_watchlist ?? false;
  const isFollowed = currentTool?.is_followed ?? false;

  const handleStackToggle = (e?: React.MouseEvent) => {
    if (e && variant === "mini") {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isInStack) {
      removeFromStackMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to remove from stack. Please try again.",
          });
        },
      });
    } else {
      addToStackMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to add to stack. Please try again.",
          });
        },
      });
    }
  };

  const handleWatchlistToggle = (e?: React.MouseEvent) => {
    if (e && variant === "mini") {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isInWatchlist) {
      removeFromWatchlistMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to remove from watchlist. Please try again.",
          });
        },
      });
    } else {
      addToWatchlistMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to add to watchlist. Please try again.",
          });
        },
      });
    }
  };

  const handleFollowToggle = (e?: React.MouseEvent) => {
    if (e && variant === "mini") {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isFollowed) {
      unfollowToolMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to unfollow. Please try again.",
          });
        },
      });
    } else {
      followToolMutation.mutate(tool.id, {
        onError: () => {
          toast.error("Error", {
            description: "Failed to follow. Please try again.",
          });
        },
      });
    }
  };

  const isStackPending = addToStackMutation.isPending || removeFromStackMutation.isPending;
  const isWatchlistPending = addToWatchlistMutation.isPending || removeFromWatchlistMutation.isPending;
  const isFollowPending = followToolMutation.isPending || unfollowToolMutation.isPending;

  // Don't show buttons if status is unknown (not authenticated)
  if (currentTool?.is_in_stack === undefined && currentTool?.is_in_watchlist === undefined) {
    return null;
  }

  if (variant === "mini") {
    return (
      <div className="flex items-center gap-1">
        <Button 
          size="sm" 
          onClick={handleStackToggle}
          disabled={isStackPending}
          variant={isInStack ? "default" : "ghost"}
          className="h-7 w-7 p-0"
          title={isInStack ? "Remove from Stack" : "Add to Stack"}
        >
          <Layers className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          onClick={handleWatchlistToggle}
          disabled={isWatchlistPending}
          variant={isInWatchlist ? "default" : "ghost"}
          className="h-7 w-7 p-0"
          title={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          <Bookmark className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          onClick={handleFollowToggle}
          disabled={isFollowPending}
          variant={isFollowed ? "default" : "ghost"}
          className="h-7 w-7 p-0"
          title={isFollowed ? "Following" : "Follow tool"}
        >
          {isFollowed ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-48">
      <Button 
        size="default" 
        onClick={handleStackToggle}
        disabled={isStackPending}
        variant={isInStack ? "default" : "outline"}
        className="w-full justify-start"
      >
        <div className="flex items-center gap-2 w-full">
          {isInStack ? <Check className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          <span>
            {isInStack ? "In Stack" : "Add to Stack"}
          </span>
        </div>
      </Button>
      <Button
        size="default"
        onClick={handleWatchlistToggle}
        disabled={isWatchlistPending}
        variant={isInWatchlist ? "default" : "outline"}
        className="w-full justify-start"
      >
        <div className="flex items-center gap-2 w-full">
          {isInWatchlist ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          <span>
            {isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
          </span>
        </div>
      </Button>
      <Button
        size="default"
        onClick={handleFollowToggle}
        disabled={isFollowPending}
        variant={isFollowed ? "default" : "outline"}
        className="w-full justify-start"
      >
        <div className="flex items-center gap-2 w-full">
          {isFollowed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{isFollowed ? "Following" : "Follow"}</span>
        </div>
      </Button>
    </div>
  );
}