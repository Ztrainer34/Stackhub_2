import { Card, CardContent } from "@/components/ui/card";
import { ToolLogo } from "@/components/tool-logo";
import type { PostTool, PostType } from "@/lib/post";

// The tools picked in the "Tools featured" step of the creation form, shown
// on the post page (draft and published) with the same cards.
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

      {tools.map((tool) =>
        tool.is_ticket ? (
          <Card className="min-h-16 border-orange-200 bg-orange-50" key={tool.id}>
            <CardContent className="p-3">
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
            </CardContent>
          </Card>
        ) : (
          <Card className="min-h-16" key={tool.id}>
            <CardContent className="p-3">
              <div className="flex items-center gap-4">
                <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="sm" />
                <div className="font-medium">{tool.name}</div>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
