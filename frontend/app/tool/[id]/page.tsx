import type { Metadata } from "next";
import { cache } from "react";
import { Tool, getTool, toolHref } from "@/lib/tool";
import { SITE_NAME, metaDescription } from "@/lib/site";
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

// One backend call per request, shared by the metadata and the page.
const loadTool = cache(async (id: string) => getTool(await createClient(), id));

/**
 * "{name}: who uses it and their playbooks", falling back to shorter forms so
 * the full title (with the " | StackHub" template) stays near 60 characters.
 */
function toolTitle(name: string): string {
  const candidates = [
    `${name}: who uses it and their playbooks`,
    `${name}: users and playbooks`,
  ];
  return candidates.find((t) => t.length <= 48) ?? name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const tool = await loadTool(id);
    // A hidden tool keeps its page for old links, but leaves search engines.
    if (tool.is_hidden) return { robots: { index: false, follow: true } };

    const title = toolTitle(tool.name);
    const description = metaDescription(
      tool.description?.trim() ||
        `${tool.name} on ${SITE_NAME}: see which GTM operators use it and read their playbooks.`
    );
    const url = toolHref(tool);
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, type: "website" },
      twitter: { card: "summary", title, description },
    };
  } catch {
    // The page itself 404s; keep the error page out of the index too.
    return { robots: { index: false } };
  }
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const queryClient = new QueryClient();

  let tool: Tool;
  try {
    // Prefetch the tool data into React Query cache
    tool = await queryClient.fetchQuery({
      queryKey: ["tool", id],
      queryFn: () => loadTool(id),
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
