"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Layers, Bookmark, Trash2, Plus, Check } from "lucide-react";
import {
  useTool,
  useAddToStack,
  useAddToWatchlist,
  useRemoveFromStack,
  useRemoveFromWatchlist,
  useFollowTool,
  useUnfollowTool,
} from "@/lib/queries/use-tool-actions";
import { useAuth } from "@/lib/queries/use-auth";
import { toast } from "sonner";
import { Tool } from "@/lib/tool";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ToolListType = "stack" | "watchlist" | "followed";

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

  const { data: currentTool } = useTool(tool.id);

  const addToStack = useAddToStack();
  const addToWatchlist = useAddToWatchlist();
  const removeFromStack = useRemoveFromStack();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const follow = useFollowTool();
  const unfollow = useUnfollowTool();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const isInStack = currentTool?.is_in_stack ?? false;
  const isInWatchlist = currentTool?.is_in_watchlist ?? false;
  const isFollowed = currentTool?.is_followed ?? false;

  // Only the profile owner's actions mutate the lists displayed on this profile,
  // so only refresh them in that case.
  const refreshOwnerLists = () => {
    if (!isOwner) return;
    queryClient.invalidateQueries({ queryKey: ["user-stack", username] });
    queryClient.invalidateQueries({ queryKey: ["user-watchlist", username] });
    queryClient.invalidateQueries({ queryKey: ["followed-tools", username] });
  };

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onStack = (e: React.MouseEvent) => {
    stop(e);
    const mutation = isInStack ? removeFromStack : addToStack;
    mutation.mutate(tool.id, {
      onSuccess: refreshOwnerLists,
      onError: () =>
        toast.error("Error", { description: "Failed to update stack." }),
    });
  };

  const onWatchlist = (e: React.MouseEvent) => {
    stop(e);
    const mutation = isInWatchlist ? removeFromWatchlist : addToWatchlist;
    mutation.mutate(tool.id, {
      onSuccess: refreshOwnerLists,
      onError: () =>
        toast.error("Error", { description: "Failed to update watchlist." }),
    });
  };

  const onFollow = (e: React.MouseEvent) => {
    stop(e);
    const mutation = isFollowed ? unfollow : follow;
    mutation.mutate(tool.id, {
      onError: () =>
        toast.error("Error", { description: "Failed to update follow." }),
    });
  };

  const onConfirmDelete = () => {
    const mutation =
      listType === "stack"
        ? removeFromStack
        : listType === "watchlist"
        ? removeFromWatchlist
        : unfollow;

    mutation.mutate(tool.id, {
      onSuccess: () => {
        refreshOwnerLists();
        setConfirmOpen(false);
        toast.success("Removed from your profile");
      },
      onError: () =>
        toast.error("Error", { description: "Failed to remove tool." }),
    });
  };

  // Don't render actions for logged-out visitors.
  if (!isAuthenticated) return null;

  const iconBtn = "h-7 w-7 p-0";

  return (
    <>
      <div className="flex items-center gap-1" onClick={stop}>
        {isOwner ? (
          <>
            {/* Owner: move between lists, then delete. The "move" buttons shown
                depend on which list the card belongs to. */}
            {listType !== "stack" && (
              <Button
                size="sm"
                variant={isInStack ? "default" : "ghost"}
                className={iconBtn}
                onClick={onStack}
                title="Add to Stack"
              >
                <Layers className="w-3 h-3" />
              </Button>
            )}
            {listType !== "watchlist" && (
              <Button
                size="sm"
                variant={isInWatchlist ? "default" : "ghost"}
                className={iconBtn}
                onClick={onWatchlist}
                title="Add to Watchlist"
              >
                <Bookmark className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={`${iconBtn} text-red-600 hover:text-red-700 hover:bg-red-50`}
              onClick={(e) => {
                stop(e);
                setConfirmOpen(true);
              }}
              title="Remove from profile"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </>
        ) : (
          <>
            {/* Visitor: add to my stack / watchlist / follow. */}
            <Button
              size="sm"
              variant={isInStack ? "default" : "ghost"}
              className={iconBtn}
              onClick={onStack}
              title={isInStack ? "In your Stack" : "Add to Stack"}
            >
              <Layers className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant={isInWatchlist ? "default" : "ghost"}
              className={iconBtn}
              onClick={onWatchlist}
              title={isInWatchlist ? "In your Watchlist" : "Add to Watchlist"}
            >
              <Bookmark className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant={isFollowed ? "default" : "ghost"}
              className={iconBtn}
              onClick={onFollow}
              title={isFollowed ? "Following" : "Follow tool"}
            >
              {isFollowed ? (
                <Check className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm" onClick={stop}>
          <DialogHeader>
            <DialogTitle>Are you sure you want to delete it?</DialogTitle>
            <DialogDescription>
              This will remove <span className="font-medium">{tool.name}</span>{" "}
              from your profile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
