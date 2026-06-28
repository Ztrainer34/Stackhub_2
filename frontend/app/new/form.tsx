"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { AutocompletedTool, ToolSearch, SuggestedTool } from "./tool-search";
import { useEffect, useState } from "react";
import { User } from "@/lib/user";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import { toast } from "sonner";
import { useCreatePost } from "@/lib/queries/use-post-actions";

const formSchema = z.object({
  type: z.enum(["playbook", "combo", "comparison"], {
    required_error: "Please select a post type.",
  }),
  name: z.string().min(2, {
    message: "Playbook must be at least 2 characters.",
  }),
  tools: z.array(z.string().uuid()),
  suggested_tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        website: z.string(),
        categories: z.array(z.number()),
      })
    )
    .optional(),
  description: z.string().max(500, {
    message: "Goal must be at most 500 characters long.",
  }),
}).refine((data) => {
  const totalTools = data.tools.length + (data.suggested_tools?.length || 0);

  // Playbook requires at least 1 tool
  if (data.type === "playbook") {
    return totalTools >= 1;
  }

  // Combo and Comparison require at least 2 tools
  if (data.type === "combo" || data.type === "comparison") {
    return totalTools >= 2;
  }

  return true;
}, (data) => {
  const totalTools = data.tools.length + (data.suggested_tools?.length || 0);

  if (data.type === "playbook") {
    return {
      message: "A playbook requires at least 1 tool",
      path: ["tools"],
    };
  }

  if (data.type === "combo") {
    return {
      message: `A combo requires at least 2 tools (you have ${totalTools})`,
      path: ["tools"],
    };
  }

  if (data.type === "comparison") {
    return {
      message: `A comparison requires at least 2 tools (you have ${totalTools})`,
      path: ["tools"],
    };
  }

  return {
    message: "Not enough tools selected",
    path: ["tools"],
  };
});

const postTypeMetadata = {
  playbook: {
    max_tools: 1,
  },
  combo: {
    max_tools: 15,
  },
  comparison: {
    max_tools: 15,
  },
} as const;

const goalPlaceholders = {
  playbook:
    "e.g. Know from which company your website visitors come from",
  combo:
    "e.g. Capture website visitor companies in HubSpot and auto-send them a personalized cold email via Lemlist",
  comparison:
    "e.g. Decide whether HubSpot or Pipedrive is the better CRM for a small sales team",
} as const;

export function PostCreationForm({
  user,
  type,
}: {
  user: User;
  type: "playbook" | "combo" | "comparison";
}) {
  const [, setToolName] = useState<string | undefined>(undefined);
  const [suggestedTools, setSuggestedTools] = useState<SuggestedTool[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: type,
      name: "",
      tools: [],
      suggested_tools: [],
      description: "",
    },
  });

  const router = useRouter();
  const createPostMutation = useCreatePost();

  async function onSubmit(data: z.infer<typeof formSchema>) {
    // Prepare the data with suggested tools
    const submitData = {
      ...data,
      suggested_tools: suggestedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        website: tool.website,
        categories: tool.categories,
      })),
    };

    createPostMutation.mutate(submitData, {
      onSuccess: (response) => {
        setIsNavigating(true);
        router.push(`/${user.username}/${response.slug}/edit`);
      },
      onError: (error) => {
        const errorMessage = error.message;

        // Check if it's a duplicate slug error (409)
        if (errorMessage.includes("already exists") || errorMessage.includes("duplicate")) {
          toast.error("Post already exists", {
            description:
              errorMessage || "You cannot have two posts with the same name.",
          });
          form.setFocus("name");
        } else {
          toast.error("Error creating post", {
            description:
              errorMessage || "Failed to create post. Please try again.",
          });
        }
      },
    });
  }

  const [knownTools, setKnownTools] = useState<Map<string, AutocompletedTool>>(
    new Map()
  );

  const postType = form.watch("type");

  useEffect(() => {
    const tools = form.getValues("tools");
    const totalTools = tools.length + suggestedTools.length;
    const max = postTypeMetadata[postType]!.max_tools;

    if (totalTools > max) {
      // If we have more tools than allowed, prioritize regular tools
      const toolsToKeep = Math.min(tools.length, max);
      const suggestedToKeep = Math.max(0, max - toolsToKeep);

      form.setValue("tools", tools.slice(0, toolsToKeep));
      setSuggestedTools((prev) => prev.slice(0, suggestedToKeep));
    }

    // Update suggested_tools in form to trigger validation
    form.setValue("suggested_tools", suggestedTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      website: tool.website,
      categories: tool.categories,
    })), { shouldValidate: true });
  }, [postType, form, suggestedTools]);

  const handleSuggestTool = (tool: SuggestedTool) => {
    const currentTools = form.getValues("tools");
    const totalTools = currentTools.length + suggestedTools.length;
    const max = postTypeMetadata[postType]!.max_tools;

    if (totalTools < max) {
      setSuggestedTools((prev) => [...prev, tool]);
      setToolName(tool.name);
    }
  };

  const removeSuggestedTool = (toolId: string) => {
    setSuggestedTools((prev) => prev.filter((tool) => tool.id !== toolId));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Post Type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-4"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="playbook" />
                    </FormControl>
                    <FormLabel className="font-normal">Playbook</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="combo" />
                    </FormControl>
                    <FormLabel className="font-normal">Combo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="comparison" />
                    </FormControl>
                    <FormLabel className="font-normal">Comparison</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{postType.charAt(0).toUpperCase() + postType.slice(1)} name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              {/* <FormDescription>
                This is your public display name.
              </FormDescription> */}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tools"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Tools featured</FormLabel>
              <FormDescription>
                {postType === "playbook"
                  ? "Select 1 tool for your playbook"
                  : postType === "combo"
                  ? "Select at least 2 tools for your combo (max 15)"
                  : "Select at least 2 tools for your comparison (max 15)"}
              </FormDescription>

              {/* Regular tools */}
              {field.value
                .map((toolId) => knownTools.get(toolId)!)
                .filter(Boolean)
                .map((tool) => (
                  <Card className="min-h-16" key={tool.id}>
                    <CardContent className="p-3">
                      <div className="flex flex-row gap-4 items-center justify-between">
                        <div className="flex items-center gap-4">
                          <ToolLogo
                            name={tool.name}
                            logoUrl={tool.logo_url}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium">{tool.name}</div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            form.setValue(
                              "tools",
                              field.value.filter((id) => id !== tool.id)
                            )
                          }
                        >
                          <Trash color="red" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

              {/* Suggested tools */}
              {suggestedTools.map((tool) => (
                <Card
                  className="min-h-16 border-orange-200 bg-orange-50"
                  key={tool.id}
                >
                  <CardContent className="p-3">
                    <div className="flex flex-row gap-4 items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-orange-200 rounded flex items-center justify-center text-orange-600 text-sm font-bold">
                          {tool.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{tool.name}</div>
                          <div className="text-sm text-orange-600">
                            ⏳ Pending approval
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => removeSuggestedTool(tool.id)}
                      >
                        <Trash color="red" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <ToolSearch
                disabled={
                  field.value.length + suggestedTools.length >=
                  postTypeMetadata[postType]!.max_tools
                }
                onSelect={(tool) => {
                  if (!field.value.includes(tool.id)) {
                    setKnownTools((prev) => new Map(prev).set(tool.id, tool));
                    form.setValue("tools", [...field.value, tool.id]);
                    setToolName(tool.name);
                  }
                }}
                onSuggestTool={handleSuggestTool}
              />

              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Goal of this {postType.charAt(0).toUpperCase() + postType.slice(1)}</FormLabel>
              <FormDescription>
                Great goals are short and self explainatory
              </FormDescription>
              <FormControl>
                <Textarea
                  className="resize-none"
                  placeholder={goalPlaceholders[postType]}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createPostMutation.isPending || isNavigating}>
          {(createPostMutation.isPending || isNavigating) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {(createPostMutation.isPending || isNavigating) ? "Creating..." : `Create ${form.getValues("type")}`}
        </Button>
      </form>
    </Form>
  );
}
