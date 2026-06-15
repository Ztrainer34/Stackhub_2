"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useCategoryAutocomplete } from "@/lib/queries/use-category-autocomplete";

const suggestedToolSchema = z.object({
  name: z.string().min(1, "Tool name is required").max(100, "Tool name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  categories: z.array(z.number()).min(1, "Please select at least one category"),
});

export type SuggestedToolFormData = z.infer<typeof suggestedToolSchema>;

interface SuggestedToolFormProps {
  onSubmit: (data: SuggestedToolFormData) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function SuggestedToolForm({ onSubmit, onCancel, submitLabel = "Suggest Tool" }: SuggestedToolFormProps) {
  const [categorySearch, setCategorySearch] = React.useState("");

  // Debounce the search query
  const [debouncedCategorySearch, setDebouncedCategorySearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCategorySearch(categorySearch);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [categorySearch]);

  const form = useForm<SuggestedToolFormData>({
    resolver: zodResolver(suggestedToolSchema),
    defaultValues: {
      name: "",
      description: "",
      website: "",
      categories: [],
    },
  });

  // Autocomplete categories based on debounced user input
  const { data: categories = [], isLoading: categoriesLoading } = useCategoryAutocomplete(debouncedCategorySearch);

  const handleSubmit = (data: SuggestedToolFormData) => {
    onSubmit(data);
    form.reset();
    setCategorySearch("");
    setSelectedCategoryObjects([]);
  };

  const selectedCategories = form.watch("categories");

  const addCategory = (categoryId: number) => {
    const current = selectedCategories;
    if (!current.includes(categoryId)) {
      form.setValue("categories", [...current, categoryId]);
    }
    setCategorySearch("");
  };

  const removeCategory = (categoryId: number) => {
    const updated = selectedCategories.filter(id => id !== categoryId);
    form.setValue("categories", updated);
  };

  // FIXME: Backend should provide an endpoint to get category names by IDs
  // For now, we'll track selected category objects in state
  const [selectedCategoryObjects, setSelectedCategoryObjects] = React.useState<Array<{ id: number; name: string }>>([]);

  const handleAddCategory = (category: { id: number; name: string }) => {
    addCategory(category.id);
    setSelectedCategoryObjects(prev => {
      if (prev.find(c => c.id === category.id)) return prev;
      return [...prev, category];
    });
  };

  const handleRemoveCategory = (categoryId: number) => {
    removeCategory(categoryId);
    setSelectedCategoryObjects(prev => prev.filter(c => c.id !== categoryId));
  };

  return (
    <Form {...form}>
      <form onSubmit={(e) => {
        e.stopPropagation();
        form.handleSubmit(handleSubmit)(e);
      }} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tool Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., HubSpot, Mailchimp, Canva"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://example.com"
                  type="url"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Brief description of what this tool does..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Help others understand what this tool is used for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categories"
          render={() => (
            <FormItem>
              <FormLabel>Categories *</FormLabel>
              <FormDescription>
                Type to search and click to add categories
              </FormDescription>

              {/* Selected categories - show first */}
              {selectedCategoryObjects.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-md border">
                  {selectedCategoryObjects.map((category) => (
                    <Badge key={category.id} variant="secondary" className="gap-1 px-2 py-1">
                      {category.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(category.id)}
                        className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Category search input */}
              <div>
                <Input
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                />
              </div>

              {/* Inline suggestions below input */}
              {categorySearch.trim().length > 0 && (
                <div className="border rounded-md bg-card">
                  {categoriesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Searching...</span>
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No categories found for &quot;{categorySearch}&quot;
                    </div>
                  ) : (
                    <div className="max-h-[180px] overflow-y-auto">
                      <div className="p-1">
                        {categories.map((category) => {
                          const isSelected = selectedCategories.includes(category.id);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => handleAddCategory(category)}
                              disabled={isSelected}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between transition-colors"
                            >
                              <span>{category.name}</span>
                              {isSelected ? (
                                <Badge variant="outline" className="text-xs">
                                  ✓ Added
                                </Badge>
                              ) : (
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={categoriesLoading}>
            <Plus className="h-4 w-4 mr-2" />
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
