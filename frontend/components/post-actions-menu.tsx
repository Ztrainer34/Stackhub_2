"use client";

import { MoreVertical, Archive, Trash2, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useDeletePost, usePublishPost, useUnpublishPost } from "@/lib/queries/use-post-actions";
import { Post } from "@/lib/post";
import { useRouter } from "next/navigation";

interface PostActionsMenuProps {
  post: Post;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'delete' | 'unpublish' | 'publish' | null;
  isProcessing: boolean;
  onConfirm: () => void;
}

function ConfirmationDialog({
  open,
  onOpenChange,
  action,
  isProcessing,
  onConfirm,
}: ConfirmationDialogProps) {
  if (!action) return null;

  const dialogConfig = {
    delete: {
      title: "Delete Post",
      description: "Are you sure you want to delete this post? This action cannot be undone and all data associated with this post will be permanently removed.",
      confirmText: "Delete",
      confirmVariant: "destructive" as const,
    },
    unpublish: {
      title: "Unpublish Post",
      description: "Are you sure you want to unpublish this post? It will no longer be visible to others, but you can publish it again later.",
      confirmText: "Unpublish",
      confirmVariant: "default" as const,
    },
    publish: {
      title: "Publish Post",
      description: "Are you sure you want to publish this post? It will become visible to all users.",
      confirmText: "Publish",
      confirmVariant: "default" as const,
    },
  };

  const config = dialogConfig[action];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant={config.confirmVariant}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : config.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PostActionsMenu({ post }: PostActionsMenuProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'delete' | 'unpublish' | 'publish' | null>(null);

  const deletePostMutation = useDeletePost();
  const publishPostMutation = usePublishPost();
  const unpublishPostMutation = useUnpublishPost();

  const handleActionClick = (action: 'delete' | 'unpublish' | 'publish') => {
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!dialogAction) return;

    if (dialogAction === 'delete') {
      deletePostMutation.mutate(post.id);
    } else if (dialogAction === 'unpublish') {
      unpublishPostMutation.mutate(post.id, {
        onSuccess: () => {
          router.refresh();
        }
      });
    } else if (dialogAction === 'publish') {
      publishPostMutation.mutate(post.id, {
        onSuccess: () => {
          router.refresh();
        }
      });
    }

    handleDialogOpenChange(false);
  };

  const isProcessing = deletePostMutation.isPending || publishPostMutation.isPending || unpublishPostMutation.isPending;

  // Opening a Radix Dialog from inside a DropdownMenu can leave
  // `pointer-events: none` stuck on <body>, freezing the whole page. Clear it
  // whenever the dialog closes as a safety net.
  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 0);
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!post.is_published && (
            <DropdownMenuItem onClick={() => handleActionClick('publish')}>
              <Upload className="mr-2 h-4 w-4" />
              Publish
            </DropdownMenuItem>
          )}
          {post.is_published && (
            <DropdownMenuItem onClick={() => handleActionClick('unpublish')}>
              <Archive className="mr-2 h-4 w-4" />
              Unpublish
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => handleActionClick('delete')}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        action={dialogAction}
        isProcessing={isProcessing}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}