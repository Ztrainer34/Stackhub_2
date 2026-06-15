import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tool, getTool } from "@/lib/tool";
import { createClient } from "@/utils/supabase/server";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Twitter,
  Linkedin,
  Globe,
} from "lucide-react";
import { notFound } from "next/navigation";
import { ToolLogo } from "@/components/tool-logo";
import { ToolActions } from "@/components/tool-actions";

// function formatDate(dateString: string) {
//   return new Date(dateString).toLocaleDateString("en-US", {
//     year: "numeric",
//     month: "long",
//     day: "numeric",
//   });
// }

function parseDescription(description: string) {
  const sections = description
    .split("\n\n")
    .filter((section) => section.trim());
  return sections.map((section, index) => {
    const lines = section.split("\n");
    const title = lines[0];
    const content = lines.slice(1).join("\n");

    // Check if this looks like a section header (no bullet points and relatively short)
    const isHeader =
      !title.includes("•") && title.length < 100 && content.length > 0;

    return {
      id: index,
      title: isHeader ? title : null,
      content: isHeader ? content : section,
      isList: section.includes("•"),
    };
  });
}

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

  const sections = tool.description ? parseDescription(tool.description) : [];


  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header Section */}
          <div className="flex items-start gap-6 mb-8">
            <div className="flex-shrink-0">
              <div className="bg-white rounded-lg border shadow-sm flex items-center justify-center p-2">
                <ToolLogo
                  name={tool.name}
                  logoUrl={tool.logo_url}
                  size="lg"
                />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{tool.name}</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                {tool.categories.map((category) => (
                  <Badge key={category.id} variant="secondary">
                    {category.name}
                  </Badge>
                ))}
              </div>
            </div>
            <ToolActions tool={tool} />
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About {tool.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {sections.map((section) => (
                  <div key={section.id}>
                    {section.title && (
                      <h3 className="text-lg font-semibold mb-3">
                        {section.title}
                      </h3>
                    )}
                    <div className="text-muted-foreground leading-relaxed">
                      {section.isList ? (
                        <div className="space-y-2">
                          {section.content
                            .split("\n")
                            .map((line, lineIndex) => {
                              if (line.trim().startsWith("•")) {
                                return (
                                  <div
                                    key={lineIndex}
                                    className="flex items-start gap-2"
                                  >
                                    <span className="text-primary mt-1">•</span>
                                    <span>{line.replace("•", "").trim()}</span>
                                  </div>
                                );
                              }
                              return line.trim() ? (
                                <p key={lineIndex}>{line}</p>
                              ) : null;
                            })}
                        </div>
                      ) : (
                        <p className="whitespace-pre-line">{section.content}</p>
                      )}
                    </div>
                    {section.id < sections.length - 1 && (
                      <Separator className="mt-6" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Vendor Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{tool.vendor.head_office}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      Founded in {tool.vendor.year_of_foundation}
                    </span>
                  </div>

                  {tool.vendor.linkedin_profile && (
                    <div className="flex items-center gap-2">
                      <Linkedin className="w-4 h-4 text-muted-foreground" />
                      <a
                        href={tool.vendor.linkedin_profile}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        LinkedIn Profile
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {tool.vendor.x_profile && (
                    <div className="flex items-center gap-2">
                      <Twitter className="w-4 h-4 text-muted-foreground" />
                      <a
                        href={`https://twitter.com/${tool.vendor.x_profile.replace(
                          "@",
                          ""
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {tool.vendor.x_profile}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {tool.vendor.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <a
                        href={tool.vendor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Website
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tool Categories</CardTitle>
                <CardDescription>
                  This tool belongs to the following categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {tool.categories.map((category) => (
                    <Badge
                      key={category.id}
                      variant="outline"
                      className="w-full justify-center py-2"
                    >
                      {category.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </HydrationBoundary>
  );
}
