"use client"

import * as React from "react"
import {
  Columns3,
  Rows3,
  Table2,
  TableCellsMerge,
  Trash2,
} from "lucide-react"

import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"

type Props = { editor?: ReturnType<typeof useTiptapEditor>["editor"] }

/**
 * Inserts a 3x3 table with a header row. While the cursor is inside a table,
 * extra buttons add or remove rows and columns, or delete the table.
 */
export function TableButtons({ editor: providedEditor }: Props) {
  const { editor } = useTiptapEditor(providedEditor)
  if (!editor || !editor.isEditable) return null

  const inTable = editor.isActive("table")
  const chain = () => editor.chain().focus()

  const item = (
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    run: () => void,
    enabled = true
  ) => (
    <Button
      type="button"
      data-style="ghost"
      role="button"
      tabIndex={-1}
      aria-label={label}
      tooltip={label}
      disabled={!enabled}
      data-disabled={!enabled}
      onClick={run}
    >
      <Icon className="tiptap-button-icon" />
    </Button>
  )

  return (
    <ToolbarGroup>
      {item(
        "Insert table",
        Table2,
        () =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        editor.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      )}
      {inTable && (
        <>
          {item("Add row below", Rows3, () => chain().addRowAfter().run(), editor.can().addRowAfter())}
          {item("Add column after", Columns3, () => chain().addColumnAfter().run(), editor.can().addColumnAfter())}
          {item("Delete row", TableCellsMerge, () => chain().deleteRow().run(), editor.can().deleteRow())}
          {item("Delete column", TableCellsMerge, () => chain().deleteColumn().run(), editor.can().deleteColumn())}
          {item("Delete table", Trash2, () => chain().deleteTable().run(), editor.can().deleteTable())}
        </>
      )}
    </ToolbarGroup>
  )
}
