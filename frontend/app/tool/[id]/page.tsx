import { Tool, getTool } from "@/lib/tool";
import { createClient } from "@/utils/supabase/server";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ToolActions } from "@/components/tool-actions";
import { ClaimPageCta } from "./claim-page-cta";
import { ToolPageAbout } from "./tool-page-about";
import { ToolPageCategories } from "./tool-page-categories";
import { ToolPageLogo } from "./tool-page-logo";
import { ToolPageTitle } from "./tool-page-title";
import { ToolPageVendor } from "./tool-page-vendor";

export default async function ToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const queryClient = new QueryClient();

  let tool: Tool;
  try {
    // Prefetch the tool data into React Query cache
    tool = await queryClient.fetchQuery({
      queryKey: ["tool", id],
      queryFn: () => getTool(supabase, id),
    });
  } catch {
    notFound();
  }

  // `id` here is the slug, but ToolActions (and the stack/watchlist/follow
  // mutations) key off the tool's UUID. Seed that key so they hydrate too.
  queryClient.setQueryData(["tool", tool.id], tool);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header Section */}
          <div className="flex items-start gap-6 mb-8">
            <ToolPageLogo tool={tool} />
            <ToolPageTitle tool={tool} />
            <ToolActions tool={tool} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              <ToolPageAbout tool={tool} />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <ClaimPageCta tool={tool} />
              <ToolPageVendor tool={tool} />
              <ToolPageCategories tool={tool} />
            </div>
          </div>
        </div>
      </div>
    </HydrationBoundary>
  );
}
