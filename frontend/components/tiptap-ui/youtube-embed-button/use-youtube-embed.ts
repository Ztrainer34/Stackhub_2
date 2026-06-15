"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"

// --- Lib ---
import {
  isExtensionAvailable,
  isNodeTypeSelected,
} from "@/lib/tiptap-utils"

// --- Icons ---
// import { YoutubeIcon } from "@/components/tiptap-icons/youtube-icon"

export const YOUTUBE_EMBED_SHORTCUT_KEY = "mod+shift+y"

/**
 * Configuration for the YouTube embed functionality
 */
export interface UseYouTubeEmbedConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Whether the button should hide when insertion is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
  /**
   * Callback function called after a successful YouTube embed insertion.
   */
  onInserted?: () => void
}

/**
 * Checks if YouTube embed can be inserted in the current editor state
 */
export function canInsertYouTubeEmbed(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  if (
    !isExtensionAvailable(editor, "youtube") ||
    isNodeTypeSelected(editor, ["youtube"])
  )
    return false

  return editor.can().insertContent({ type: "youtube" })
}

/**
 * Checks if YouTube embed is currently active
 */
export function isYouTubeEmbedActive(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  return editor.isActive("youtube")
}

/**
 * Inserts a YouTube embed in the editor
 */
export function insertYouTubeEmbed(editor: Editor | null, url?: string): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canInsertYouTubeEmbed(editor)) return false

  try {
    if (url) {
      return editor
        .chain()
        .focus()
        .setYoutubeVideo({ src: url })
        .run()
    } else {
      // Prompt for URL if not provided
      const youtubeUrl = window.prompt("Enter YouTube URL:")
      if (!youtubeUrl) return false
      
      return editor
        .chain()
        .focus()
        .setYoutubeVideo({ src: youtubeUrl })
        .run()
    }
  } catch {
    return false
  }
}

/**
 * Determines if the YouTube embed button should be shown
 */
export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, "youtube")) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canInsertYouTubeEmbed(editor)
  }

  return true
}

/**
 * Custom hook that provides YouTube embed functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MySimpleYouTubeButton() {
 *   const { isVisible, handleYouTubeEmbed } = useYouTubeEmbed()
 *
 *   if (!isVisible) return null
 *
 *   return <button onClick={handleYouTubeEmbed}>Add YouTube Video</button>
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedYouTubeButton() {
 *   const { isVisible, handleYouTubeEmbed, label, isActive } = useYouTubeEmbed({
 *     editor: myEditor,
 *     hideWhenUnavailable: true,
 *     onInserted: () => console.log('YouTube video inserted!')
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <MyButton
 *       onClick={handleYouTubeEmbed}
 *       aria-pressed={isActive}
 *       aria-label={label}
 *     >
 *       Add YouTube Video
 *     </MyButton>
 *   )
 * }
 * ```
 */
export function useYouTubeEmbed(config?: UseYouTubeEmbedConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onInserted,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canInsert = canInsertYouTubeEmbed(editor)
  const isActive = isYouTubeEmbedActive(editor)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  const handleYouTubeEmbed = React.useCallback(() => {
    if (!editor) return false

    const success = insertYouTubeEmbed(editor)
    if (success) {
      onInserted?.()
    }
    return success
  }, [editor, onInserted])

  useHotkeys(
    YOUTUBE_EMBED_SHORTCUT_KEY,
    (event) => {
      event.preventDefault()
      handleYouTubeEmbed()
    },
    {
      enabled: isVisible && canInsert,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    isActive,
    handleYouTubeEmbed,
    canInsert,
    label: "Add YouTube video",
    shortcutKeys: YOUTUBE_EMBED_SHORTCUT_KEY,
    // Icon: YoutubeIcon,
  }
}