"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/react";
import { renderToReactElement } from "@tiptap/static-renderer";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tool } from "@/lib/tool";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useUpdateToolPage } from "@/lib/queries/use-tool-page";
import { toolPageExtensions } from "@/lib/tiptap-tool-page";
import { EditButton } from "./edit-button";

// The rich rendering below reuses the editor's node styles. They have to be
// imported here rather than only in the editor chunk, which is lazy-loaded and
// never reaches a visitor who is just reading the page.
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";
import "@/components/tiptap-templates/simple/simple-editor.scss";

const AboutEditor = dynamic(() => import("./about-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

/**
 * Splits a scraped plain-text description into the sections the page has always
 * rendered: a short first line followed by body copy reads as a heading, and
 * bullet characters become a list.
 */
function parseDescription(description: string) {
  return description
    .split("\n\n")
    .filter((section) => section.trim())
    .map((section, index) => {
      const lines = section.split("\n");
      const title = lines[0];
      const content = lines.slice(1).join("\n");
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

/** The plain-text rendering, used for every description no owner has rewritten. */
function PlainDescription({ description }: { description: string }) {
  const sections = parseDescription(description);

  return (
    <>
      {sections.map((section) => (
        <div key={section.id}>
          {section.title && (
            <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
          )}
          <div className="text-muted-foreground leading-relaxed">
            {section.isList ? (
              <div className="space-y-2">
                {section.content.split("\n").map((line, lineIndex) => {
                  if (line.trim().startsWith("•")) {
                    return (
                      <div key={lineIndex} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{line.replace("•", "").trim()}</span>
                      </div>
                    );
                  }
                  return line.trim() ? <p key={lineIndex}>{line}</p> : null;
                })}
              </div>
            ) : (
              <p className="whitespace-pre-line">{section.content}</p>
            )}
          </div>
          {section.id < sections.length - 1 && <Separator className="mt-6" />}
        </div>
      ))}
    </>
  );
}

/** The rich rendering, used once an owner has written the page in the editor. */
function RichDescription({ json }: { json: string }) {
  let doc: JSONContent;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }

  return (
    <div className="simple-editor-content">
      <div className="tiptap ProseMirror">
        {renderToReactElement({ extensions: toolPageExtensions, content: doc })}
      </div>
    </div>
  );
}

export function ToolPageAbout({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const [editing, setEditing] = useState(false);
  const save = useUpdateToolPage(tool.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>About {current.name}</CardTitle>
        {current.is_owner && !editing && (
          <EditButton label="Edit description" onClick={() => setEditing(true)} />
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {editing ? (
          <AboutEditor
            initialRich={current.description_rich ?? null}
            initialPlain={current.description}
            saving={save.isPending}
            onCancel={() => setEditing(false)}
            onSave={(json) =>
              save.mutate(
                { description_rich: json },
                { onSuccess: () => setEditing(false) }
              )
            }
          />
        ) : current.description_rich ? (
          <RichDescription json={current.description_rich} />
        ) : current.description ? (
          <PlainDescription description={current.description} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {current.is_owner
              ? "No description yet — use the pencil to write one."
              : `No description for ${current.name} yet.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
