"use client";

import { Badge } from "@/components/ui/badge";
import { Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";

/**
 * Name and category chips. Reads from the query cache rather than the server
 * props so the chips follow an owner's edit to the categories card without a
 * page reload.
 */
export function ToolPageTitle({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  return (
    <div className="flex-1">
      <h1 className="text-3xl font-bold mb-2">{current.name}</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {current.categories.map((category) => (
          <Badge key={category.id} variant="secondary">
            {category.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
