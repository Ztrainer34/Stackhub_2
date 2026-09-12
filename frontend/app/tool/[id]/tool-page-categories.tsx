"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Category, Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useCategoryAutocomplete } from "@/lib/queries/use-category-autocomplete";
import { useUpdateToolPage } from "@/lib/queries/use-tool-page";
import { EditButton } from "./edit-button";

/** Matches the server's cap, so the dialog refuses before the request does. */
const MAX_CATEGORIES = 12;

export function ToolPageCategories({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Category[]>(current.categories ?? []);
  const [query, setQuery] = useState("");

  const results = useCategoryAutocomplete(query);
  const save = useUpdateToolPage(tool.id);

  const openDialog = () => {
    setSelected(current.categories ?? []);
    setQuery("");
    setOpen(true);
  };

  const add = (category: Category) => {
    if (selected.some((c) => c.id === category.id)) return;
    if (selected.length >= MAX_CATEGORIES) {
      toast.error(`A tool can have at most ${MAX_CATEGORIES} categories.`);
      return;
    }
    setSelected((previous) => [...previous, category]);
    setQuery("");
  };

  const remove = (id: number) =>
    setSelected((previous) => previous.filter((c) => c.id !== id));

  const submit = () =>
    save.mutate(
      { category_ids: selected.map((c) => c.id) },
      { onSuccess: () => setOpen(false) }
    );

  // Categories already on the tool would just be no-ops if clicked.
  const suggestions = (results.data ?? []).filter(
    (category) => !selected.some((c) => c.id === category.id)
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Tool Categories</CardTitle>
          <CardDescription>
            This tool belongs to the following categories
          </CardDescription>
        </div>
        {current.is_owner && (
          <EditButton label="Edit categories" onClick={openDialog} />
        )}
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {current.categories?.length ? (
            current.categories.map((category) => (
              <Badge
                key={category.id}
                variant="outline"
                className="w-full justify-center py-2"
              >
                {category.name}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {current.is_owner
                ? "No categories yet — use the pencil to pick some."
                : "Not categorised yet."}
            </p>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tool categories</DialogTitle>
            <DialogDescription>
              Pick up to {MAX_CATEGORIES} categories. These decide where the tool
              shows up when people browse.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            {selected.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing selected yet.
              </p>
            )}
            {selected.map((category) => (
              <Badge key={category.id} variant="secondary" className="gap-1 py-1">
                {category.name}
                <button
                  type="button"
                  onClick={() => remove(category.id)}
                  aria-label={`Remove ${category.name}`}
                  className="ml-0.5 rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="space-y-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search categories…"
              autoFocus
            />

            <div className="max-h-48 space-y-1 overflow-y-auto">
              {results.isLoading && query.trim() && (
                <p className="text-sm text-muted-foreground">Searching…</p>
              )}
              {query.trim() && !results.isLoading && suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No category matches “{query}”.
                </p>
              )}
              {suggestions.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => add(category)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
