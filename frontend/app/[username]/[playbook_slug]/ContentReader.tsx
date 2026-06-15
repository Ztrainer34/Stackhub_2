import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from '@tiptap/extension-youtube'
import { Selection } from "@tiptap/extensions";
import { renderToReactElement } from "@tiptap/static-renderer";
import { Ghost } from "lucide-react";

// Import the same styles as Editor
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"
import "@/components/tiptap-templates/simple/simple-editor.scss"

export default function ContentReader({
  initialContent,
}: {
  initialContent: string | null;
}) {
  if (!initialContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Ghost className="w-16 h-16 mb-4 text-muted-foreground" />

        <div className="text-lg text-muted-foreground mb-2">
          Nothing here yet!
        </div>

        <div className="text-sm text-muted-foreground">
          This post doesn&apos;t have any content.
        </div>
      </div>
    );
  }

  const content = JSON.parse(initialContent);

  if (!initialContent || initialContent.trim() === "" || !content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Ghost className="w-16 h-16 mb-4 text-muted-foreground" />

        <div className="text-lg text-muted-foreground mb-2">
          Nothing here yet!
        </div>

        <div className="text-sm text-muted-foreground">
          This post doesn&apos;t have any content.
        </div>
      </div>
    );
  }

  // FIXME: Maybe put extensions in a common file
  const el = renderToReactElement({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      Youtube.configure({
        controls: true,
        nocookie: true,
      })
    ], // using your extensions
    content: content,
  });

  return (
    <div className="simple-editor-content">
      <div className="tiptap ProseMirror">{el}</div>
    </div>
  );
}
