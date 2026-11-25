"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelAffiliateLinkRequest,
  listToolStacks,
  requestAffiliateLink,
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

/** People with the tool in their active stack, for the tool page. */
export function useToolStacks(toolId: string, limit: number = 6) {
  return useQuery({
    queryKey: ["tool-stacks", toolId, limit],
    queryFn: () => listToolStacks(toolId, limit),
    enabled: !!toolId,
    staleTime: 60_000,
  });
}

/**
 * Ask for, or cancel, a personal affiliate link. Optimistic on the tool's
 * `is_affiliate_requested`, rolled back if the server call fails.
 */
export function useAffiliateRequest(toolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requested: boolean) =>
      requested
        ? requestAffiliateLink(createClient(), toolId)
        : cancelAffiliateLinkRequest(createClient(), toolId),
    onMutate: async (requested) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);
      queryClient.setQueryData(["tool", toolId], (old: Tool | undefined) =>
        old ? { ...old, is_affiliate_requested: requested } : old
      );
      return { previousTool };
    },
    onError: (_err, _requested, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
      toast.error("Something went wrong", {
        description: "Your request was not saved. Please try again.",
      });
    },
  });
}
