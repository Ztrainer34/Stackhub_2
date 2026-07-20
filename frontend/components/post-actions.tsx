"use client";

import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { 
  useStarPost, 
  useUnstarPost,
  usePost,
} from "@/lib/queries/use-post-actions";
import { toast } from "sonner";
import { Post } from "@/lib/post";
import { useLoginPrompt } from "@/components/login-prompt-provider";

interface PostActionsProps {
  post: Post;
  variant?: "full" | "mini";
  isAuthenticated?: boolean;
}

export function PostActions({ post, variant = "full", isAuthenticated = false }: PostActionsProps) {
  const { promptLogin } = useLoginPrompt();

  // Use React Query to get the latest post data (subscribes to cache updates)
  const { data: currentPost } = usePost(post.author_username, post.slug);

  const starPostMutation = useStarPost();
  const unstarPostMutation = useUnstarPost();

  // Use currentPost if available, otherwise fall back to initial post data.
  // Guests have no star status, so default to unstarred.
  const isStarred = currentPost?.is_starred ?? post.is_starred ?? false;

  const handleStarToggle = (e?: React.MouseEvent) => {
    if (e && variant === "mini") {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isAuthenticated) {
      promptLogin("Sign in to star this playbook and save it to your profile.");
      return;
    }

    if (isStarred) {
      unstarPostMutation.mutate(post.id, {
        onSuccess: () => {
          toast.success("Unstarred", {
            description: `${post.name} has been removed from your starred posts.`,
          });
        },
        onError: () => {
          toast.error("Error", {
            description: "Failed to unstar post. Please try again.",
          });
        },
      });
    } else {
      starPostMutation.mutate(post.id, {
        onSuccess: () => {
          toast.success("Starred", {
            description: `${post.name} has been added to your starred posts.`,
          });
        },
        onError: () => {
          toast.error("Error", {
            description: "Failed to star post. Please try again.",
          });
        },
      });
    }
  };

  const isStarPending = starPostMutation.isPending || unstarPostMutation.isPending;

  // Show the button to everyone. Guests get a login prompt on click; for
  // authenticated users we wait until the star status has loaded so the icon
  // reflects reality.
  const postData = currentPost || post;
  if (isAuthenticated && postData.is_starred === undefined) {
    return null;
  }

  if (variant === "mini") {
    return (
      <Button 
        size="sm" 
        onClick={handleStarToggle}
        disabled={isStarPending}
        variant="ghost"
        className="h-7 w-7 p-0"
        title={isStarred ? "Unstar" : "Star"}
      >
        <Star className={`w-3 h-3 ${isStarred ? 'fill-yellow-400 text-yellow-400' : 'fill-none'}`} />
      </Button>
    );
  }

  return (
    <Button 
      size="default" 
      onClick={handleStarToggle}
      disabled={isStarPending}
      variant="outline"
      className="w-full justify-start"
    >
      <div className="flex items-center gap-2 w-full">
        <Star className={`w-4 h-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : 'fill-none'}`} />
        <span>
          {isStarred ? "Starred" : "Star"}
        </span>
      </div>
    </Button>
  );
}