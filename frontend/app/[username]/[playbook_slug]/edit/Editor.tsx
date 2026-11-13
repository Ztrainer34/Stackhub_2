"use client"

import * as React from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"
import Youtube from '@tiptap/extension-youtube'

// --- UI Primitives ---
import { Button } from "@/components/ui/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsMobile } from "@/hooks/use-mobile"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"

import { Post, PostTool, renamePost, updatePostTools } from "@/lib/post"
import {
  buildToolsUpdate,
  MAX_POST_TOOLS,
  realTools,
  toolsChanged,
  validatePostDetails,
} from "@/lib/post-details"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { AutocompletedTool, SuggestedTool } from "@/app/new/tool-search"
import { DetailLabel, PostDetails } from "./PostDetails"

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
        <ListDropdownMenu
          types={["bulletList", "orderedList", "taskList"]}
          portal={isMobile}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button data-style="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export default function Editor({
  post,
  postContent,
  redirectUrl,
}: {
  post: Post;
  postContent: string | null,
  redirectUrl: string;
}) {
  const isMobile = useIsMobile()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = React.useState<
    "main" | "highlighter" | "link"
  >("main")
  const toolbarRef = React.useRef<HTMLDivElement>(null)

  const router = useRouter();

  const [title, setTitle] = React.useState(post.name);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);

  // Grow the title field to fit its content (Medium-style single growing line).
  const autoGrowTitle = React.useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useEffect(() => {
    autoGrowTitle();
  }, [autoGrowTitle]);

  const [goal, setGoal] = React.useState(post.description);
  const [tools, setTools] = React.useState<PostTool[]>(() => realTools(post.tools));
  const [suggested, setSuggested] = React.useState<SuggestedTool[]>([]);
  const [saving, setSaving] = React.useState(false);
  // What the server has, which moves on if a save fails partway: resending a
  // suggestion that already went through would file it twice.
  const savedTools = React.useRef(realTools(post.tools));

  const addTool = (tool: AutocompletedTool) => {
    if (tools.length + suggested.length >= MAX_POST_TOOLS) return;
    if (tools.some((t) => t.id === tool.id)) return;
    setTools((prev) => [
      ...prev,
      { id: tool.id, name: tool.name, logo_url: tool.logo_url ?? "", is_ticket: false },
    ]);
  };

  // Save the title and goal. The title sets the slug, so this returns the new
  // slug, or null when neither changed. Old URLs 301-redirect to the new slug
  // server-side via the slug-history lookup.
  const saveTitleAndGoal = async (
    supabaseClient: ReturnType<typeof createClient>
  ): Promise<string | null> => {
    const name = title.trim();
    if (name === post.name && goal === post.description) return null;
    const { new_slug } = await renamePost(supabaseClient, post.id, {
      name,
      description: goal,
    });
    return new_slug;
  };

  const saveTools = async (supabaseClient: ReturnType<typeof createClient>) => {
    if (!toolsChanged(savedTools.current, tools, suggested)) return;
    const updated = await updatePostTools(
      supabaseClient,
      post.id,
      buildToolsUpdate(tools, suggested)
    );
    const next = realTools(updated.tools);
    savedTools.current = next;
    setTools(next);
    setSuggested([]);
  };

  let content = undefined;

  if (postContent) {
    content = JSON.parse(postContent);
  }

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: "simple-editor",
      },
    },
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
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: (file, onProgress, abortSignal) => handleImageUpload(post, file, onProgress, abortSignal),
        onError: (error) => console.error("Upload failed:", error),
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
      })
    ],
    content,
  })

  // Saving a draft and publishing differ only in the endpoint. The details go
  // first: they are what can be refused (a slug already taken), and a refusal
  // should stop before the post is published under the old ones.
  const persist = async (action: "save" | "publish") => {
    const problems = validatePostDetails({
      type: post.type,
      title,
      goal,
      originalGoal: post.description,
      toolCount: tools.length + suggested.length,
    });
    if (problems.length > 0) {
      toast.error(problems.join(" "));
      return;
    }

    setSaving(true);
    try {
      const supabaseClient = createClient();

      const newSlug = await saveTitleAndGoal(supabaseClient);
      await saveTools(supabaseClient);

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL!}/post/${post.id}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({
            content: JSON.stringify(editor?.getJSON()),
          }),
        }
      );

      if (!resp.ok) {
        // FIXME
        toast("Something went wrong", {});
        return;
      }

      router.push(
        newSlug ? `/${post.author_username}/${newSlug}` : redirectUrl
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };


  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  React.useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main")
    }
  }, [isMobile, mobileView])

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : {}),
          }}
        >
          {mobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
          <Button disabled={saving} onClick={() => persist("save")}>Save draft</Button>
          <Button disabled={saving} onClick={() => persist("publish")}>{post.is_published ? "Publish changes" : "Publish"}</Button>
        </Toolbar>

        <div className="simple-editor-title">
          <DetailLabel htmlFor="post-title">Title</DetailLabel>
          <textarea
            id="post-title"
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              autoGrowTitle()
            }}
            onKeyDown={(e) => {
              // Enter should not add a line break — move on to the goal.
              if (e.key === "Enter") {
                e.preventDefault()
                document.getElementById("post-goal")?.focus()
              }
            }}
            rows={1}
            placeholder="Untitled"
            spellCheck={false}
          />
        </div>

        <PostDetails
          type={post.type}
          goal={goal}
          onGoalChange={setGoal}
          onGoalDone={() => editor?.chain().focus().run()}
          tools={tools}
          suggested={suggested}
          onAddTool={addTool}
          onRemoveTool={(id) => setTools((prev) => prev.filter((t) => t.id !== id))}
          onSuggestTool={(tool) => setSuggested((prev) => [...prev, tool])}
          onRemoveSuggested={(id) => setSuggested((prev) => prev.filter((t) => t.id !== id))}
        />

        <div className="mx-auto mt-6 w-full max-w-[648px] px-12 max-[480px]:px-6">
          <div className="border-t pt-4">
            <DetailLabel>Post</DetailLabel>
          </div>
        </div>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content simple-editor-content--post"
        />
      </EditorContext.Provider>
    </div>
  )
}
