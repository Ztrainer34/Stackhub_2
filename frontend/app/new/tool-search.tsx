"use client";

import * as React from "react";
import { Search, Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToolLogo } from "@/components/tool-logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SuggestedToolForm, SuggestedToolFormData } from "@/components/suggested-tool-form";

export interface AutocompletedTool {
  id: string;
  name: string;
  description: string;
  logo_url: string;
}

export interface SuggestedTool {
  id: string; // temporary ID for UI purposes
  name: string;
  description: string;
  website: string;
  categories: number[];
  type: 'suggested';
}

type DialogView = 'search' | 'add-tool' | 'confirmation';

export function ToolSearch({
  disabled = false,
  onSelect,
  onSuggestTool,
}: {
  disabled: boolean,
  onSelect: (tool: AutocompletedTool) => void;
  onSuggestTool?: (tool: SuggestedTool) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<DialogView>('search');
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [submittedToolName, setSubmittedToolName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset view when dialog closes
  React.useEffect(() => {
    if (!open) {
      // Small delay to allow closing animation
      const timer = setTimeout(() => {
        setView('search');
        setSearchQuery("");
        setSubmittedToolName("");
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open && view === 'search' && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, view]);

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch tools using TanStack Query
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];

      const response = await fetch(
        `${process.env
          .NEXT_PUBLIC_API_URL!}/tool/autocomplete?q=${encodeURIComponent(
          debouncedQuery
        )}&limit=6`
      );

      if (!response.ok) throw new Error("Failed to fetch tools");
      return response.json();
    },
    enabled: !!debouncedQuery.trim(),
    staleTime: 30000,
  });

  const handleSelectTool = (tool: AutocompletedTool) => {
    setOpen(false);
    onSelect(tool);
  };

  const handleSuggestTool = (data: SuggestedToolFormData) => {
    if (onSuggestTool) {
      const suggestedTool: SuggestedTool = {
        id: `suggested-${Date.now()}`, // temporary ID
        name: data.name,
        description: data.description || "",
        website: data.website || "",
        categories: data.categories,
        type: 'suggested',
      };
      setSubmittedToolName(data.name);
      onSuggestTool(suggestedTool);
      setView('confirmation');
    }
  };

  const handleContinue = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
        {view === 'search' && (
          <>
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle>Search Tools</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder="Search for tools..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <Separator />
            <div className="py-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tools.length > 0 ? (
                tools.map((tool: AutocompletedTool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-muted flex items-start gap-3 min-w-0"
                    onClick={() => handleSelectTool(tool)}
                  >
                    <ToolLogo
                      name={tool.name}
                      logoUrl={tool.logo_url}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{tool.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {tool.description && tool.description.length > 70
                          ? tool.description.substring(0, 67) + "..."
                          : tool.description}
                      </div>
                    </div>
                  </button>
                ))
              ) : debouncedQuery.trim() ? (
                <div className="py-4 text-center px-4">
                  <div className="text-muted-foreground">
                    No tools found for &quot;{debouncedQuery}&quot;
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center px-4">
                  <div className="text-muted-foreground">
                    Start typing to search for tools
                  </div>
                </div>
              )}
            </div>

            {onSuggestTool && (
              <>
                <Separator />
                <div className="p-4 bg-muted/30">
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Can&apos;t find your tool?</p>
                      <p className="text-xs text-muted-foreground">
                        Suggest it and we&apos;ll add it to our database
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 shrink-0"
                      onClick={() => setView('add-tool')}
                    >
                      <Plus className="h-4 w-4" />
                      Add Tool
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {view === 'add-tool' && (
          <div className="flex flex-col max-h-[70vh]">
            <div className="p-4 pb-2">
              <DialogHeader>
                <DialogTitle>Add tool</DialogTitle>
                <DialogDescription className="text-sm">
                  Couldn&apos;t find your tool? Add it here and we&apos;ll review it.
                </DialogDescription>
              </DialogHeader>
            </div>

            <ScrollArea className="flex-1 px-4">
              <div className="pb-4">
                <SuggestedToolForm
                  onSubmit={handleSuggestTool}
                  onCancel={() => setView('search')}
                  submitLabel="Add tool"
                />
              </div>
            </ScrollArea>
          </div>
        )}

        {view === 'confirmation' && (
          <div className="p-4">
            <DialogHeader className="mb-4">
              <DialogTitle>Thank you for adding a new tool!</DialogTitle>
              <DialogDescription className="text-sm pt-2">
                Once we&apos;ve reviewed it, we&apos;ll add your tool to StackHub. You can continue creating your post now.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-muted/50 rounded-lg p-3 mb-4">
              <p className="text-xs text-muted-foreground">Tool added:</p>
              <p className="font-medium">{submittedToolName}</p>
            </div>

            <Button
              type="button"
              onClick={handleContinue}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Continue my post
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
