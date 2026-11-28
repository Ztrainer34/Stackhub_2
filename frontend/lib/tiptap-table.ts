import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";

/**
 * Table extensions shared by the post editor, the post reader and tool pages,
 * so a table written in one renders in the others. Saved content uses the
 * default node names: table, tableRow, tableHeader, tableCell.
 *
 * Tables are wrapped in `.tableWrapper` (overflow-x: auto) so a wide table
 * scrolls sideways on a phone instead of stretching the page. The editor's
 * node view already adds that wrapper; this renderHTML adds it for the static
 * reader and getHTML().
 */
const WrappedTable = Table.extend({
  renderHTML(props) {
    const rendered = this.parent?.(props);
    if (!rendered) return ["table", 0];
    return ["div", { class: "tableWrapper" }, rendered];
  },
});

export const tableExtensions = [
  WrappedTable.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
