"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit, Loader2, AlertTriangle } from "lucide-react";
import { renamePost } from "@/lib/post";
import { createClient } from "@/utils/supabase/client";
import type { Post } from "@/lib/post";

interface RenamePostDialogProps {
  post: Post;
}

// Simple slug generation function (matches backend)
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

export function RenamePostDialog({ post }: RenamePostDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(post.name);
  const [description, setDescription] = useState(post.description);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check if the title change will result in a URL change
  const willChangeUrl = useMemo(() => {
    if (!name.trim()) return false;
    const newSlug = generateSlug(name.trim());
    return newSlug !== post.slug;
  }, [name, post.slug]);

  // Generate preview URL
  const previewUrl = useMemo(() => {
    if (!name.trim()) return '';
    const newSlug = generateSlug(name.trim());
    return `/${post.author_username}/${newSlug}`;
  }, [name, post.author_username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Post name cannot be empty");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const data = await renamePost(supabase, post.id, {
        name: name.trim(),
        description: description.trim(),
      });

      // Close dialog and redirect/refresh
      setOpen(false);
      if (data.new_slug !== post.slug) {
        router.push(`/${post.author_username}/${data.new_slug}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename post");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName(post.name);
    setDescription(post.description);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Rename post"
        >
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Post</DialogTitle>
          <DialogDescription>
            Update the title and description of your post. The URL will automatically update if you change the title.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Title</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter post title"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter post description"
              rows={3}
              disabled={isLoading}
            />
          </div>

          {/* URL Change Warning */}
          {willChangeUrl && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-amber-800 font-medium">
                  Changing the title will update the URL
                </p>
                <p className="text-amber-700">
                  New URL: <code className="bg-amber-100 px-1 rounded text-xs">{previewUrl}</code>
                </p>
                <p className="text-amber-600 text-xs">
                  Old links will automatically redirect to the new URL
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}