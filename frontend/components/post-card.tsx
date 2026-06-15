"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Post } from "@/lib/post";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ToolLogo } from "./tool-logo";
import { Clock, User, MoreVertical, Trash2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useDeletePost, useUnpublishPost } from "@/lib/queries/use-post-actions";
import { useRouter } from "next/navigation";

interface PostCardProps {
  post: Post;
  variant?: "default" | "compact";
  className?: string;
  showActions?: boolean;
  href?: string;
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'delete' | 'unpublish' | null;
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

export default function PostCard({
  post,
  variant = "default",
  className,
  showActions = false,
  href,
}: PostCardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'delete' | 'unpublish' | null>(null);

  const deletePostMutation = useDeletePost();
  const unpublishPostMutation = useUnpublishPost();

  const handleCardClick = () => {
    if (href) {
      router.push(href);
    }
  };

  const handleActionClick = (action: 'delete' | 'unpublish', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!dialogAction) return;

    if (dialogAction === 'delete') {
      deletePostMutation.mutate(post.id);
    } else if (dialogAction === 'unpublish') {
      unpublishPostMutation.mutate(post.id);
    }

    setDialogOpen(false);
  };

  const isProcessing = deletePostMutation.isPending || unpublishPostMutation.isPending;

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "playbook":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "combo":
        return "bg-green-100 text-green-800 border-green-200";
      case "comparison":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (variant === "compact") {
    return (
      <>
        <Card
          className={cn(
            "group hover:shadow-md transition-shadow",
            href && "cursor-pointer",
            className
          )}
          onClick={handleCardClick}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                  {post.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {post.description}
                </p>
              </div>
              <div className="flex gap-1 items-start">
                {!post.is_published && (
                  <Badge variant="outline" className="text-xs">
                    Draft
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn("text-xs flex-shrink-0", getTypeColor(post.type))}
                >
                  {post.type}
                </Badge>
                {showActions && (
                  <div onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {post.is_published && (
                          <DropdownMenuItem onClick={(e) => handleActionClick('unpublish', e)}>
                            <Archive className="mr-2 h-4 w-4" />
                            Unpublish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => handleActionClick('delete', e)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {post.author_username}
              </span>
            </div>
            <div className="flex -space-x-1">
              {post.tools.slice(0, 2).map((tool) => (
                <ToolLogo
                  key={tool.id}
                  name={tool.name}
                  logoUrl={tool.logo_url}
                  size="sm"
                  className="border-2 border-white"
                />
              ))}
              {post.tools.length > 2 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-white flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    +{post.tools.length - 2}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        action={dialogAction}
        isProcessing={isProcessing}
        onConfirm={handleConfirmAction}
      />
      </>
    );
  }

  return (
    <>
      <Card
        className={cn(
          "group hover:shadow-md transition-shadow",
          href && "cursor-pointer",
          className
        )}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 mb-2">
              {!post.is_published && (
                <Badge variant="outline" className="text-xs">
                  Draft
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn("text-xs", getTypeColor(post.type))}
              >
                {post.type}
              </Badge>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {showActions && (
                <div onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {post.is_published && (
                        <DropdownMenuItem onClick={(e) => handleActionClick('unpublish', e)}>
                          <Archive className="mr-2 h-4 w-4" />
                          Unpublish
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => handleActionClick('delete', e)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            {post.tools.slice(0, 3).map((tool) => (
              <ToolLogo
                key={tool.id}
                name={tool.name}
                logoUrl={tool.logo_url}
                size="sm"
              />
            ))}
            {post.tools.length > 3 && (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  +{post.tools.length - 3}
                </span>
              </div>
            )}
          </div>
        </div>
        <CardTitle className="text-base font-semibold line-clamp-2 group-hover:text-primary transition-colors">
          {post.name}
        </CardTitle>
        <CardDescription className="text-sm line-clamp-2 mt-1">
          {post.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-xs">
                {post.author_username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              {post.author_username}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDate(post.updated_at)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
    <ConfirmationDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      action={dialogAction}
      isProcessing={isProcessing}
      onConfirm={handleConfirmAction}
    />
    </>
  );
}
