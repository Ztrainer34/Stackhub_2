"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Check } from "lucide-react";
import { Post } from "@/lib/post";
import PostCard from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useUserKeyPlaybooks,
  useUserPosts,
  useSetKeyPlaybooks,
} from "@/lib/queries/use-user-playbooks";

const MAX_KEY_PLAYBOOKS = 6;

interface FeaturedPlaybooksSectionProps {
  username: string;
  isOwnProfile: boolean;
}

export default function FeaturedPlaybooksSection({
  username,
  isOwnProfile,
}: FeaturedPlaybooksSectionProps) {
  const keyPlaybooksQuery = useUserKeyPlaybooks(username);
  const playbooks = keyPlaybooksQuery.data?.posts || [];

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Playbooks</h2>
        {isOwnProfile && (
          <button
            onClick={() => setDialogOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            Customize Playbooks
          </button>
        )}
      </div>

      {keyPlaybooksQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] w-full rounded-lg" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <p className="text-muted-foreground">
            {isOwnProfile
              ? "No featured playbooks yet. Click “Customize Playbooks” to pick up to 6."
              : "No featured playbooks yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playbooks.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              variant="compact"
              href={`/${username}/${post.slug}`}
            />
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href={`/${username}?tab=playbooks`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          See all playbooks
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {isOwnProfile && (
        <CustomizePlaybooksDialog
          username={username}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          currentPlaybooks={playbooks}
        />
      )}
    </section>
  );
}

interface CustomizeDialogProps {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlaybooks: Post[];
}

function CustomizePlaybooksDialog({
  username,
  open,
  onOpenChange,
  currentPlaybooks,
}: CustomizeDialogProps) {
  // Load all the user's posts to choose from (only while the dialog is open).
  const postsQuery = useUserPosts(open, username, 1, 100, "");
  const setPlaybooksMutation = useSetKeyPlaybooks(username);

  // Only published posts can be featured publicly.
  const availablePosts = useMemo(() => {
    const posts = (postsQuery.data?.posts || []).filter((p) => p.is_published);
    return posts;
  }, [postsQuery.data]);

  const [selected, setSelected] = useState<string[]>([]);

  // Reset selection to the current pinned playbooks whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(currentPlaybooks.map((p) => p.id));
    }
  }, [open, currentPlaybooks]);

  function toggle(postId: string) {
    setSelected((prev) => {
      if (prev.includes(postId)) {
        return prev.filter((id) => id !== postId);
      }
      if (prev.length >= MAX_KEY_PLAYBOOKS) {
        return prev;
      }
      return [...prev, postId];
    });
  }

  function handleSave() {
    setPlaybooksMutation.mutate(selected, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Playbooks</DialogTitle>
          <DialogDescription>
            Pick up to {MAX_KEY_PLAYBOOKS} of your playbooks to feature on your
            profile. Selected {selected.length}/{MAX_KEY_PLAYBOOKS}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto -mx-2 px-2">
          {postsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : availablePosts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              You don&apos;t have any published playbooks yet.
            </p>
          ) : (
            <div className="space-y-1">
              {availablePosts.map((post) => {
                const isSelected = selected.includes(post.id);
                const atLimit =
                  !isSelected && selected.length >= MAX_KEY_PLAYBOOKS;
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => toggle(post.id)}
                    disabled={atLimit}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md border p-2 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-accent",
                      atLimit && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">
                      {post.name}
                    </span>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {post.type}
                    </Badge>
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={setPlaybooksMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={setPlaybooksMutation.isPending}>
            <Pencil className="w-4 h-4 mr-1" />
            {setPlaybooksMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
