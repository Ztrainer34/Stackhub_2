/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Button } from "@/components/ui/button";
import { $setBlocksType } from "@lexical/selection";
import { $toggleLink } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import clsx from "clsx";
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";

import { INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";

import {
  Bold,
  Heading,
  Italic,
  Link,
  List,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const LowPriority = 1;

function Divider() {
  return <div className="divider" />;
}

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateToolbar();
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        LowPriority
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        LowPriority
      )
    );
  }, [editor, $updateToolbar]);

  const insertLink = (text: string, link: string) => {
    editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        const { anchor, focus } = selection;
        // inserting just the link text at the current selection
        selection.insertText(text);

        // selecting the inserted text
        anchor.offset -= text.length;
        focus.offset = anchor.offset + text.length;

        // transforming selection into a link
        $toggleLink(link);
      }
    });
  };

  const insertHeader = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        console.log("Test");
        $setBlocksType(selection, () => $createHeadingNode("h1"));
      }
    });
  };

  return (
    <div className="toolbar" ref={toolbarRef}>
      <Button
        variant="ghost"
        className="p-0 mx-1 w-8"
        disabled={!canUndo}
        aria-label="Undo"
        onClick={() => {
          editor.dispatchCommand(UNDO_COMMAND, undefined);
        }}
      >
        <Undo className="text-slate-600" />
      </Button>

      <Button
        variant="ghost"
        className="p-0 mx-1 w-8"
        disabled={!canRedo}
        aria-label="Redo"
        onClick={() => {
          editor.dispatchCommand(REDO_COMMAND, undefined);
        }}
      >
        <Redo className="text-slate-600" />
      </Button>

      <Divider />

      <Button
        variant="ghost"
        className="p-0 mx-1 w-8"
        aria-label="Insert Header"
        onClick={() => {
          insertHeader();
        }}
      >
        <Heading className="text-slate-600" />
      </Button>

      <Divider />

      <Button
        variant="ghost"
        className={clsx("p-0 mx-1 w-8", { "bg-slate-100": isBold })}
        aria-label="Format Bold"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
      >
        <Bold className={isBold ? "text-slate-900" : "text-gray-600"} />
      </Button>

      <Button
        variant="ghost"
        className={clsx("p-0 mx-1 w-8", { "bg-slate-100": isItalic })}
        aria-label="Format Italics"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
      >
        <Italic className={isItalic ? "text-slate-900" : "text-gray-600"} />
      </Button>

      <Button
        variant="ghost"
        className={clsx("p-0 mx-1 w-8", { "bg-slate-100": isUnderline })}
        aria-label="Format Underline"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
        }}
      >
        <Underline
          className={isUnderline ? "text-slate-900" : "text-gray-600"}
        />
      </Button>

      <Button
        variant="ghost"
        className={clsx("p-0 mx-1 w-8", { "bg-slate-100": isStrikethrough })}
        aria-label="Format Strikethrough"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
        }}
      >
        <Strikethrough
          className={isStrikethrough ? "text-slate-900" : "text-gray-600"}
        />
      </Button>

      <Divider />

      <Button
        variant="ghost"
        className="p-0 mx-1 w-8"
        aria-label="Insert Bullet List"
        onClick={() => {
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        }}
      >
        <List className="text-gray-600" />
      </Button>

      <Divider />

      <Button
        variant="ghost"
        className="p-0 mx-1 w-8"
        onClick={() => insertLink("test", "google.com")}
      >
        <Link className="text-slate-600" />
      </Button>
    </div>
  );
}
