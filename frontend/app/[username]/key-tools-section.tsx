"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Check } from "lucide-react";
import { Tool } from "@/lib/tool";
import { ToolLogo } from "@/components/tool-logo";
import { Button } from "@/components/ui/button";
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
  useUserKeyTools,
  useUserStack,
  useUserWatchlist,
  useSetKeyTools,
} from "@/lib/queries/use-user-tools";

const MAX_KEY_TOOLS = 3;

interface KeyToolsSectionProps {
  username: string;
  isOwnProfile: boolean;
}

function KeyToolSlot({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/tool/${tool.id}`}
      className="flex flex-col items-center gap-2 group"
    >
      <div className="bg-white rounded-full border shadow-sm flex items-center justify-center p-3 transition-shadow group-hover:shadow-md">
        <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="lg" />
      </div>
      <span className="text-sm font-medium text-foreground text-center truncate max-w-[120px]">
        {tool.name}
      </span>
    </Link>
  );
}

function EmptySlot() {
  return (
    <div className="flex flex-col items-center gap-2 opacity-60">
      <div className="rounded-full border border-dashed h-[88px] w-[88px] flex items-center justify-center" />
      <span className="text-sm text-muted-foreground">Empty</span>
    </div>
  );
}

export default function KeyToolsSection({
  username,
  isOwnProfile,
}: KeyToolsSectionProps) {
  const keyToolsQuery = useUserKeyTools(username);
  const keyTools = keyToolsQuery.data?.tools || [];

  const [dialogOpen, setDialogOpen] = useState(false);

  // Hide the whole section on other users' profiles when they have none.
  if (
    !isOwnProfile &&
    !keyToolsQuery.isLoading &&
    keyTools.length === 0
  ) {
    return null;
  }

  return (
    <section className="mb-8 rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Key Tools</h2>
        {isOwnProfile && (
          <button
            onClick={() => setDialogOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            Customize key tools
          </button>
        )}
      </div>

      {keyToolsQuery.isLoading ? (
        <div className="flex items-start justify-around gap-4">
          {Array.from({ length: MAX_KEY_TOOLS }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-[88px] w-[88px] rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start justify-around gap-4">
          {Array.from({ length: MAX_KEY_TOOLS }).map((_, i) =>
            keyTools[i] ? (
              <KeyToolSlot key={keyTools[i].id} tool={keyTools[i]} />
            ) : (
              <EmptySlot key={`empty-${i}`} />
            )
          )}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href={`/${username}?tab=stack`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Explore Stack
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {isOwnProfile && (
        <CustomizeKeyToolsDialog
          username={username}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          currentKeyTools={keyTools}
        />
      )}
    </section>
  );
}

interface CustomizeDialogProps {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentKeyTools: Tool[];
}

function CustomizeKeyToolsDialog({
  username,
  open,
  onOpenChange,
  currentKeyTools,
}: CustomizeDialogProps) {
  const stackQuery = useUserStack(username, open);
  const watchlistQuery = useUserWatchlist(username, open);
  const setKeyToolsMutation = useSetKeyTools(username);

  // The pool of tools the user can pin: everything in their stack + watchlist.
  const availableTools = useMemo(() => {
    const map = new Map<string, Tool>();
    for (const tool of stackQuery.data?.tools || []) map.set(tool.id, tool);
    for (const tool of watchlistQuery.data?.tools || []) map.set(tool.id, tool);
    // Make sure already-pinned tools are always selectable too.
    for (const tool of currentKeyTools) map.set(tool.id, tool);
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [stackQuery.data, watchlistQuery.data, currentKeyTools]);

  const [selected, setSelected] = useState<string[]>([]);

  // Reset selection to the current key tools whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(currentKeyTools.map((t) => t.id));
    }
  }, [open, currentKeyTools]);

  const isLoading = stackQuery.isLoading || watchlistQuery.isLoading;

  function toggle(toolId: string) {
    setSelected((prev) => {
      if (prev.includes(toolId)) {
        return prev.filter((id) => id !== toolId);
      }
      if (prev.length >= MAX_KEY_TOOLS) {
        return prev; // already at the limit
      }
      return [...prev, toolId];
    });
  }

  function handleSave() {
    setKeyToolsMutation.mutate(selected, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customize key tools</DialogTitle>
          <DialogDescription>
            Pick up to {MAX_KEY_TOOLS} tools to feature on your profile.
            Selected {selected.length}/{MAX_KEY_TOOLS}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : availableTools.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Add tools to your stack or watchlist first, then pick your key
              tools here.
            </p>
          ) : (
            <div className="space-y-1">
              {availableTools.map((tool) => {
                const isSelected = selected.includes(tool.id);
                const atLimit =
                  !isSelected && selected.length >= MAX_KEY_TOOLS;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggle(tool.id)}
                    disabled={atLimit}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md border p-2 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-accent",
                      atLimit && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-1.5 flex-shrink-0">
                      <ToolLogo
                        name={tool.name}
                        logoUrl={tool.logo_url}
                        size="sm"
                      />
                    </div>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">
                      {tool.name}
                    </span>
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
            disabled={setKeyToolsMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={setKeyToolsMutation.isPending}
          >
            <Pencil className="w-4 h-4 mr-1" />
            {setKeyToolsMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
