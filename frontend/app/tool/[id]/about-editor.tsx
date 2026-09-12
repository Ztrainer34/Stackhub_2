"use client";

import * as React from "react";
import { EditorContent, EditorContext, useEditor } from "@tiptap/react";

import { Button } from "@/components/ui/button";
import { Spacer } from "@/components/tiptap-ui-primitive/spacer";
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar";
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button";
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu";
import { LinkPopover } from "@/components/tiptap-ui/link-popover";
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu";
import { MarkButton } from "@/components/tiptap-ui/mark-button";
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button";

import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";
import "@/components/tiptap-templates/simple/simple-editor.scss";

import { plainTextToTiptap, toolPageExtensions } from "@/lib/tiptap-tool-page";

/**
 * The About editor a tool page's owner gets. Same engine as the playbook
 * editor, with a shorter toolbar: a tool description is prose, so the media and
 * alignment controls would only get in the way.
 *
 * Loaded through next/dynamic with ssr disabled — Tiptap needs a DOM.
 */
export default function AboutEditor({
  initialRich,
  initialPlain,
  saving,
  onCancel,
  onSave,
}: {
  /** Stored Tiptap JSON, when the page has already been edited by an owner. */
  initialRich: string | null;
  /** Otherwise the scraped plain-text description, converted to paragraphs. */
  initialPlain: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (json: string) => void;
}) {
  // Parse once: re-parsing on every render would reset the editor's content.
  const content = React.useMemo(() => {
    if (initialRich) {
      try {
        return JSON.parse(initialRich);
      } catch {
        // Unparseable JSON should not lock the owner out of their own page.
      }
    }
    return plainTextToTiptap(initialPlain ?? "");
  }, [initialRich, initialPlain]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Tool description",
        class: "simple-editor",
      },
    },
    extensions: toolPageExtensions,
    content,
  });

  return (
    <EditorContext.Provider value={{ editor }}>
      <div className="rounded-lg border">
        <Toolbar variant="fixed">
          <ToolbarGroup>
            <UndoRedoButton action="undo" />
            <UndoRedoButton action="redo" />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <HeadingDropdownMenu levels={[2, 3]} />
            <ListDropdownMenu types={["bulletList", "orderedList"]} />
            <BlockquoteButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            <MarkButton type="strike" />
            <LinkPopover />
          </ToolbarGroup>

          <Spacer />
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content px-2"
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => editor && onSave(JSON.stringify(editor.getJSON()))}
          disabled={saving || !editor}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </EditorContext.Provider>
  );
}
