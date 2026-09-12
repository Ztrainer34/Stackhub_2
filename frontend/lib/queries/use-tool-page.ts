"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Tool,
  ToolPageUpdate,
  toolSlug,
  updateToolPage,
  uploadToolLogo,
} from "@/lib/tool";
import { createClient } from "@/utils/supabase/client";

/**
 * A tool page is cached under two keys: the slug (fetched by the server
 * component) and the UUID (seeded for the action buttons). An edit has to land
 * on both, or half the page keeps rendering the old copy.
 */
function writeToolToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  tool: Tool
) {
  queryClient.setQueryData(["tool", tool.id], tool);
  queryClient.setQueryData(["tool", toolSlug(tool.name)], tool);
  // The catalogue and profile listings carry their own copies of the tool.
  queryClient.invalidateQueries({ queryKey: ["tools"] });
}

/** Owner-only edit of a tool page's copy, logo, vendor details or categories. */
export function useUpdateToolPage(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ToolPageUpdate) =>
      updateToolPage(createClient(), toolId, update),
    onSuccess: (tool) => {
      writeToolToCache(queryClient, tool);
      toast.success("Saved");
    },
    onError: (error: Error) => {
      toast.error("Could not save", { description: error.message });
    },
  });
}

/**
 * Uploads a logo file, then saves the resulting URL through the same edit
 * endpoint so the response carries the full refreshed tool.
 */
export function useUploadToolLogo(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const supabase = createClient();
      const { logo_url } = await uploadToolLogo(supabase, toolId, file);
      return updateToolPage(supabase, toolId, { logo_url });
    },
    onSuccess: (tool) => {
      writeToolToCache(queryClient, tool);
      toast.success("Logo updated");
    },
    onError: (error: Error) => {
      toast.error("Could not upload the logo", { description: error.message });
    },
  });
}
