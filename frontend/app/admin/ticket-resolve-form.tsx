"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Plus, Loader2, X } from "lucide-react";
import {
  useSearchTools,
  useResolveTicketWithExisting,
  useResolveTicketWithNew,
  useRejectTicket,
} from "@/lib/queries/use-admin";
import { useCategoryAutocomplete } from "@/lib/queries/use-category-autocomplete";
import type { Tool } from "@/lib/tool";

export interface ToolTicket {
  id: string;
  tool_name: string;
  tool_description: string;
  tool_website: string | null;
  categories: Array<{ id: number; name: string }>;
}

interface TicketResolveFormProps {
  ticket: ToolTicket;
  onSuccess?: () => void;
}

export function TicketResolveForm({ ticket, onSuccess }: TicketResolveFormProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  // Category search state
  const [categorySearch, setCategorySearch] = useState("");
  const [debouncedCategorySearch, setDebouncedCategorySearch] = useState("");
  const [selectedCategoryObjects, setSelectedCategoryObjects] = useState<Array<{ id: number; name: string }>>([]);

  const [newToolData, setNewToolData] = useState({
    name: "",
    description: "",
    logo_url: "",
    categories: [] as number[],
  });

  // Debounce category search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCategorySearch(categorySearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [categorySearch]);

  // Pre-fill form data on mount
  useEffect(() => {
    setNewToolData({
      name: ticket.tool_name,
      description: ticket.tool_description,
      logo_url: "",
      categories: ticket.categories.map(c => c.id),
    });
    setSelectedCategoryObjects(ticket.categories);
  }, [ticket]);

  const { data: categoryResults = [], isLoading: categoriesLoading } = useCategoryAutocomplete(debouncedCategorySearch);
  const { data: searchResults = [], isLoading: searchLoading } = useSearchTools(searchQuery);

  const resolveWithExistingMutation = useResolveTicketWithExisting();
  const resolveWithNewMutation = useResolveTicketWithNew();
  const rejectMutation = useRejectTicket();

  const isLoading = resolveWithExistingMutation.isPending ||
                   resolveWithNewMutation.isPending ||
                   rejectMutation.isPending;

  const error = resolveWithExistingMutation.error?.message ||
               resolveWithNewMutation.error?.message ||
               rejectMutation.error?.message;

  const handleResolveWithExisting = () => {
    if (!selectedTool) return;

    resolveWithExistingMutation.mutate(
      { ticketId: ticket.id, toolId: selectedTool.id },
      {
        onSuccess: () => {
          setSelectedTool(null);
          setSearchQuery("");
          onSuccess?.();
        },
      }
    );
  };

  const handleResolveWithNew = () => {
    if (!newToolData.name.trim() || !newToolData.description.trim()) {
      return;
    }

    resolveWithNewMutation.mutate(
      { ticketId: ticket.id, toolData: newToolData },
      {
        onSuccess: () => {
          setNewToolData({
            name: "",
            description: "",
            logo_url: "",
            categories: [],
          });
          setSelectedCategoryObjects([]);
          onSuccess?.();
        },
      }
    );
  };

  const handleReject = () => {
    if (!confirm("Are you sure you want to reject this ticket?")) return;

    rejectMutation.mutate(ticket.id, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  const addCategory = (category: { id: number; name: string }) => {
    if (!newToolData.categories.includes(category.id)) {
      setNewToolData(prev => ({
        ...prev,
        categories: [...prev.categories, category.id],
      }));
      setSelectedCategoryObjects(prev => [...prev, category]);
    }
    setCategorySearch("");
  };

  const removeCategory = (categoryId: number) => {
    setNewToolData(prev => ({
      ...prev,
      categories: prev.categories.filter(id => id !== categoryId),
    }));
    setSelectedCategoryObjects(prev => prev.filter(c => c.id !== categoryId));
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-800 bg-red-100 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <Tabs defaultValue="existing" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="existing">Link Existing</TabsTrigger>
          <TabsTrigger value="new">Create New</TabsTrigger>
          <TabsTrigger value="reject">Reject</TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="search">Search for existing tools</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="search"
                  placeholder="Enter tool name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchLoading && (
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <Label>Search Results</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((tool) => (
                    <div
                      key={tool.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedTool?.id === tool.id ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedTool(tool as Tool)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-sm">{tool.name}</h4>
                          <p className="text-xs text-muted-foreground">{tool.description}</p>
                          <div className="flex gap-1 mt-1">
                            {tool.categories.map((cat) => (
                              <Badge key={cat.id} variant="outline" className="text-xs">
                                {cat.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleResolveWithExisting}
              disabled={!selectedTool || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Resolve with Selected Tool
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="tool-name">Tool Name *</Label>
              <Input
                id="tool-name"
                value={newToolData.name}
                onChange={(e) => setNewToolData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter tool name"
              />
            </div>

            <div>
              <Label htmlFor="tool-description">Description *</Label>
              <Textarea
                id="tool-description"
                value={newToolData.description}
                onChange={(e) => setNewToolData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this tool does"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="tool-logo">Logo URL</Label>
              <Input
                id="tool-logo"
                value={newToolData.logo_url}
                onChange={(e) => setNewToolData(prev => ({ ...prev, logo_url: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="space-y-2">
              <Label>Categories *</Label>
              <p className="text-sm text-muted-foreground">
                Type to search and click to add categories
              </p>

              {/* Selected categories */}
              {selectedCategoryObjects.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-md border">
                  {selectedCategoryObjects.map((category) => (
                    <Badge key={category.id} variant="secondary" className="gap-1 px-2 py-1">
                      {category.name}
                      <button
                        type="button"
                        onClick={() => removeCategory(category.id)}
                        className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Category search input */}
              <Input
                placeholder="Search categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />

              {/* Inline suggestions below input */}
              {categorySearch.trim().length > 0 && (
                <div className="border rounded-md bg-card">
                  {categoriesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Searching...</span>
                    </div>
                  ) : categoryResults.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No categories found for &quot;{categorySearch}&quot;
                    </div>
                  ) : (
                    <div className="max-h-[180px] overflow-y-auto">
                      <div className="p-1">
                        {categoryResults.map((category) => {
                          const isSelected = newToolData.categories.includes(category.id);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => addCategory(category)}
                              disabled={isSelected}
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between transition-colors"
                            >
                              <span>{category.name}</span>
                              {isSelected ? (
                                <Badge variant="outline" className="text-xs">
                                  Added
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
            </div>

            <Button
              onClick={handleResolveWithNew}
              disabled={isLoading || !newToolData.name.trim() || !newToolData.description.trim() || newToolData.categories.length === 0}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Tool & Resolve
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="reject" className="space-y-4">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Rejecting this ticket will mark it as rejected and notify the requester that their tool request was not approved.
            </p>

            <Button
              onClick={handleReject}
              disabled={isLoading}
              variant="destructive"
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject Ticket
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
