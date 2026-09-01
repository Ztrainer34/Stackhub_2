"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { Pencil, Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { uploadAvatar, removeAvatar, User } from "@/lib/user";

const MAX_BYTES = 5 * 1024 * 1024; // matches the server limit
const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function AvatarEditor({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Show the new picture immediately rather than waiting for a refetch.
  const [preview, setPreview] = useState<string | null>(null);

  const refreshUser = () => queryClient.invalidateQueries({ queryKey: ["auth"] });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a failure
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a PNG, JPEG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is over 5MB. Pick a smaller one.");
      return;
    }

    setBusy(true);
    try {
      const { avatar_url } = await uploadAvatar(createClient(), file);
      setPreview(avatar_url);
      refreshUser();
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the picture");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await removeAvatar(createClient());
      setPreview(null);
      refreshUser();
      toast.success("Profile picture removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the picture");
    } finally {
      setBusy(false);
    }
  };

  const shown: User = preview ? { ...user, avatar_url: preview } : user;
  const hasPicture = Boolean(shown.avatar_url);

  return (
    <div className="flex items-start gap-6">
      <div className="relative">
        <UserAvatar user={shown} size="xl" className="h-24 w-24" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-semibold mb-1">Profile picture</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your own picture, or leave it empty to use your{" "}
          <a
            href="https://gravatar.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Gravatar
          </a>
          .
        </p>

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={onFile}
          className="hidden"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Upload a photo…
            </DropdownMenuItem>
            {hasPicture && (
              <DropdownMenuItem
                onSelect={onRemove}
                className="text-red-600 focus:text-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove photo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <p className="text-xs text-muted-foreground mt-3">
          PNG, JPEG, GIF or WebP · up to 5MB
        </p>
      </div>
    </div>
  );
}
