"use server";

import { createClient } from "@/utils/supabase/server";
import { $getRoot, ParagraphNode, TextNode } from "lexical";
import {createHeadlessEditor} from '@lexical/headless';

export async function saveEditorState(
  playbookId: string,
  stateStr: string
): Promise<boolean> {
  try {
    // 1. Check if it's valid JSON
    const state = JSON.parse(stateStr);

    console.log(state);

    // 2. Create a temporary editor to validate the state
    const editor = createHeadlessEditor({
      namespace: "ValidationCheck",
      nodes: [
        ParagraphNode,
        TextNode,
        // ImageNode,
        // // YouTubeNode,
        // LinkNode,
        // AutoLinkNode,
        // ListNode,
        // ListItemNode,
      ],
    });

    // 3. Try to parse the state - this will throw if invalid
    const parsedEditorState = editor.parseEditorState(stateStr);

    // 4. Extract the text
    const editorStateTextString = parsedEditorState.read(() => $getRoot().getTextContent())

    const supabase = createClient();

    const {
      data: { session },
    } = await (await supabase).auth.getSession();
    const accessToken = session?.access_token;

    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL!}/post/${playbookId}/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          "content": stateStr,
          "content_text": editorStateTextString
        }),
      }
    );

    return resp.status == 200;
  } catch (error) {
    console.error("Lexical state validation failed:", error);
    return false;
  }
}
