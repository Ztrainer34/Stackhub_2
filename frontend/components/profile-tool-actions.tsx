"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Layers, Archive, Bookmark, Plus, Check } from "lucide-react";
import {
  useTool,
  useAddToStack,
  useAddToWatchlist,
  useAddToOldStack,
  useRemoveFromStack,
  useRemoveFromWatchlist,
  useRemoveFromOldStack,
  useFollowTool,
  useUnfollowTool,
} from "@/lib/queries/use-tool-actions";
import { useAuth } from "@/lib/queries/use-auth";
import { useLoginPrompt } from "@/components/login-prompt-provider";
import { toast } from "sonner";
import { Tool } from "@/lib/tool";

export type ToolListType = "stack" | "watchlist" | "old-stack" | "followed";

interface ProfileToolActionsProps {
  tool: Tool;
  isOwner: boolean;
  listType: ToolListType;
  username: string;
}

export function ProfileToolActions({
  tool,
  isOwner,
  listType,
  username,
}: ProfileToolActionsProps) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const isAuthenticated = auth.data?.status === "authenticated";
  const { promptLogin } = useLoginPrompt();

  const { data: currentTool } = useTool(tool.id);

  const addToStack = useAddToStack();
  const addToWatchlist = useAddToWatchlist();
  const addToOldStack = useAddToOldStack();
  const removeFromStack = useRemoveFromStack();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const removeFromOldStack = useRemoveFromOldStack();
  const follow = useFollowTool();
  const unfollow = useUnfollowTool();

  const isInStack = currentTool?.is_in_stack ?? false;
  const isInWatchlist = currentTool?.is_in_watchlist ?? false;
  const isInOldStack = currentTool?.is_in_old_stack ?? false;
  const isFollowed = currentTool?.is_followed ?? false;

  // Only the profile owner's actions mutate the lists displayed on this profile,
  // so only refresh them in that case.
  const refreshOwnerLists = () => {
    if (!isOwner) return;
    queryClient.invalidateQueries({ queryKey: ["user-stack", username] });
    queryClient.invalidateQueries({ queryKey: ["user-watchlist", username] });
    queryClient.invalidateQueries({ queryKey: ["user-old-stack", username] });
    queryClient.invalidateQueries({ queryKey: ["followed-tools", username] });
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Each list is a toggle: clicking an icon the tool already belongs to removes
  // it. Adding to one list moves it out of the others (enforced server-side).
  const toggle = (
    e: React.MouseEvent,
    isActive: boolean,
    add: { mutate: typeof addToStack.mutate },
    remove: { mutate: typeof removeFromStack.mutate },
    prompt: string,
    errorMessage: string
  ) => {
    stop(e);
    if (!isAuthenticated) {
      promptLogin(prompt);
      return;
    }
    const mutation = isActive ? remove : add;
    mutation.mutate(tool.id, {
      onSuccess: refreshOwnerLists,
      onError: () => toast.error("Error", { description: errorMessage }),
    });
  };

  const iconBtn = "h-7 w-7 p-0";

  return (
    <div className="flex items-center gap-1" onClick={stop}>
      <Button
        size="sm"
        variant={isInStack ? "default" : "ghost"}
        className={iconBtn}
        onClick={(e) =>
          toggle(
            e,
            isInStack,
            addToStack,
            removeFromStack,
            "Sign in to add tools to your stack.",
            "Failed to update stack."
          )
        }
        title={isInStack ? "In your Stack" : "Add to Stack"}
      >
        <Layers className="w-3 h-3" />
      </Button>

      <Button
        size="sm"
        variant={isInOldStack ? "default" : "ghost"}
        className={iconBtn}
        onClick={(e) =>
          toggle(
            e,
            isInOldStack,
            addToOldStack,
            removeFromOldStack,
            "Sign in to archive tools you no longer use.",
            "Failed to update old stack."
          )
        }
        title={isInOldStack ? "In your Old Stack" : "Move to Old Stack"}
      >
        <Archive className="w-3 h-3" />
      </Button>

      <Button
        size="sm"
        variant={isInWatchlist ? "default" : "ghost"}
        className={iconBtn}
        onClick={(e) =>
          toggle(
            e,
            isInWatchlist,
            addToWatchlist,
            removeFromWatchlist,
            "Sign in to save tools for later.",
            "Failed to update saved tools."
          )
        }
        title={isInWatchlist ? "Saved for later" : "Save for later"}
      >
        <Bookmark className="w-3 h-3" />
      </Button>

      {/* Follow stays on the "Tools followed" list so it can still be undone
          there. Elsewhere it moves to the card's bottom-right corner later. */}
      {listType === "followed" && (
        <Button
          size="sm"
          variant={isFollowed ? "default" : "ghost"}
          className={iconBtn}
          onClick={(e) =>
            toggle(
              e,
              isFollowed,
              follow,
              unfollow,
              "Sign in to follow tools and get updates.",
              "Failed to update follow."
            )
          }
          title={isFollowed ? "Following" : "Follow tool"}
        >
          {isFollowed ? (
            <Check className="w-3 h-3" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
        </Button>
      )}
    </div>
  );
}
