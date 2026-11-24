"use client";

import { Bell, Bookmark, Layers } from "lucide-react";
import { toast } from "sonner";
import { useLoginPrompt } from "@/components/login-prompt-provider";
import { useAuth } from "@/lib/queries/use-auth";
import {
  useAddToStack,
  useAddToWatchlist,
  useFollowTool,
  useRemoveFromStack,
  useRemoveFromWatchlist,
  useTool,
  useUnfollowTool,
} from "@/lib/queries/use-tool-actions";

type Props = { toolId: string; toolName: string };

const base =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors disabled:opacity-60";
const on = "border-foreground bg-muted text-foreground";
const off = "border-input bg-background text-muted-foreground hover:text-foreground";

/** The 3 icon buttons: add to stack, save for later, follow. Logged-out visitors are asked to log in. */
export function RankingToolActions({ toolId, toolName }: Props) {
  const auth = useAuth();
  const isAuthenticated = auth.data?.status === "authenticated";
  const { promptLogin } = useLoginPrompt();

  // Empty id = no request: an anonymous visitor costs the server nothing per row.
  const { data: tool } = useTool(isAuthenticated ? toolId : "");

  const addToStack = useAddToStack();
  const removeFromStack = useRemoveFromStack();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const followTool = useFollowTool();
  const unfollowTool = useUnfollowTool();

  const inStack = tool?.is_in_stack ?? false;
  const savedForLater = tool?.is_in_watchlist ?? false;
  const following = tool?.is_followed ?? false;

  const stackPending = addToStack.isPending || removeFromStack.isPending;
  const watchPending = addToWatchlist.isPending || removeFromWatchlist.isPending;
  const followPending = followTool.isPending || unfollowTool.isPending;
  // Until the tool's state has loaded, a click could toggle the wrong way.
  const loading = isAuthenticated && !tool;

  const fail = (what: string) => () =>
    toast.error("Something went wrong", {
      description: `Failed to ${what}. Please try again.`,
    });

  function toggleStack() {
    if (!isAuthenticated) {
      promptLogin("Sign in to add tools to your stack.");
      return;
    }
    if (inStack) removeFromStack.mutate(toolId, { onError: fail("remove from stack") });
    else addToStack.mutate(toolId, { onError: fail("add to stack") });
  }

  function toggleSaved() {
    if (!isAuthenticated) {
      promptLogin("Sign in to save tools for later.");
      return;
    }
    if (savedForLater)
      removeFromWatchlist.mutate(toolId, { onError: fail("remove from saved for later") });
    else addToWatchlist.mutate(toolId, { onError: fail("save for later") });
  }

  function toggleFollow() {
    if (!isAuthenticated) {
      promptLogin("Sign in to follow tools and get updates.");
      return;
    }
    if (following) unfollowTool.mutate(toolId, { onError: fail("unfollow") });
    else followTool.mutate(toolId, { onError: fail("follow") });
  }

  const stackLabel = inStack ? `Remove ${toolName} from your stack` : `Add ${toolName} to your stack`;
  const watchLabel = savedForLater
    ? `Remove ${toolName} from saved for later`
    : `Save ${toolName} for later`;
  const followLabel = following ? `Unfollow ${toolName}` : `Follow ${toolName}`;

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        title={stackLabel}
        aria-label={stackLabel}
        aria-pressed={inStack}
        disabled={stackPending || loading}
        className={`${base} ${inStack ? on : off}`}
        onClick={toggleStack}
      >
        <Layers className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        title={watchLabel}
        aria-label={watchLabel}
        aria-pressed={savedForLater}
        disabled={watchPending || loading}
        className={`${base} ${savedForLater ? on : off}`}
        onClick={toggleSaved}
      >
        <Bookmark
          className="h-[18px] w-[18px]"
          fill={savedForLater ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        title={followLabel}
        aria-label={followLabel}
        aria-pressed={following}
        disabled={followPending || loading}
        className={`${base} ${following ? on : off}`}
        onClick={toggleFollow}
      >
        <Bell
          className="h-[18px] w-[18px]"
          fill={following ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
