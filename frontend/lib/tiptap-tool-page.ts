import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import { Selection } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

/**
 * Extensions for tool page descriptions — the same editor playbooks use, minus
 * the image-upload node and the YouTube embed. A tool page's copy is prose, and
 * there is no post to attach uploads to.
 *
 * The editor and the read-only renderer share this list, so what an owner
 * writes is exactly what visitors see.
 */
export const toolPageExtensions = [
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
];

/**
 * Tiptap document holding a single paragraph per line of `text`. Lets an owner
 * open the editor on a description that was scraped as plain text without
 * losing its paragraph breaks.
 */
export function plainTextToTiptap(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((block) => ({
      type: "paragraph",
      content: block ? [{ type: "text", text: block }] : [],
    })),
  };
}
