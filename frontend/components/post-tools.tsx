import Link from "next/link";
import { ToolLogo } from "@/components/tool-logo";
import { toolHref } from "@/lib/tool";
import type { PostTool, PostType } from "@/lib/post";

// The tools picked in the "Tools featured" step of the creation form, shown
// on the post page (draft and published). The chips match the ones on the
// edit screen; each links to its tool's page. A tool still waiting for review
// has no page yet, so its chip is not a link.
export function PostTools({
  tools,
  type,
}: {
  tools: PostTool[];
  type: PostType;
}) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Tools featured in this {type}</h2>

      <div className="flex flex-wrap items-center gap-2">
        {tools.map((tool) =>
          tool.is_ticket ? (
            <span
              key={tool.id}
              title={tool.name}
              className="inline-flex max-w-full items-center gap-2 rounded-md border border-orange-200 bg-orange-50 py-1 pl-1.5 pr-2 text-sm dark:border-orange-900 dark:bg-orange-950"
            >
              <ToolLogo name={tool.name} logoUrl="" size="sm" className="shrink-0" />
              <span className="max-w-[20ch] truncate">{tool.name}</span>
              <span className="shrink-0 text-xs italic text-muted-foreground">
                pending review
              </span>
            </span>
          ) : (
            <Link
              key={tool.id}
              href={toolHref(tool)}
              title={tool.name}
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 py-1 pl-1.5 pr-2 text-sm transition-colors hover:bg-muted"
            >
              <ToolLogo
                name={tool.name}
                logoUrl={tool.logo_url}
                size="sm"
                className="shrink-0"
              />
              <span className="max-w-[20ch] truncate">{tool.name}</span>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
