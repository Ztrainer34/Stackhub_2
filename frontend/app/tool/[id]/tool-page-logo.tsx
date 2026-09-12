"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolLogo } from "@/components/tool-logo";
import { Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useUpdateToolPage, useUploadToolLogo } from "@/lib/queries/use-tool-page";
import { EditButton } from "./edit-button";

/**
 * The tool's logo, with an upload dialog for page owners — the same two ways
 * profile pictures are set: upload a file, or point at an image that is already
 * online.
 */
export function ToolPageLogo({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useUploadToolLogo(tool.id);
  const save = useUpdateToolPage(tool.id);
  const busy = upload.isPending || save.isPending;

  const openDialog = () => {
    setUrl(current.logo_url ?? "");
    setOpen(true);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so picking the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;

    upload.mutate(file, { onSuccess: () => setOpen(false) });
  };

  const handleUrl = () => {
    save.mutate({ logo_url: url.trim() }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="flex-shrink-0">
      <div className="relative">
        <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
          <ToolLogo name={current.name} logoUrl={current.logo_url} size="lg" />
        </div>

        {current.is_owner && (
          <EditButton
            label="Change logo"
            onClick={openDialog}
            className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border bg-background p-0 shadow-sm"
          />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change logo</DialogTitle>
            <DialogDescription>
              A square image works best. PNG, JPEG or GIF, up to 5MB.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <div className="bg-white rounded-lg border flex items-center justify-center p-2">
              <ToolLogo name={current.name} logoUrl={current.logo_url} size="lg" />
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleFile}
              />
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {upload.isPending ? "Uploading…" : "Upload an image"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url">Or link to one</Label>
            <Input
              id="logo-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={busy}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleUrl} disabled={busy}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
