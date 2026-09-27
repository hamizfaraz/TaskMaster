import { type EditorState, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { renderKatexHtml } from "@/components/note-editor/extensions/katex-render";
import { decodeHtmlAttribute, INLINE_MATH_SPAN_RE } from "@/lib/notes/markdown";
import { renderInlineMarkdownText } from "@/lib/notes/parse-markdown";
import {
  cellOffsetInLine,
  columnCount,
  cycleAlignment,
  deleteColumn,
  deleteRow,
  findTableRanges,
  insertColumn,
  insertRow,
  parseTableModel,
  serializeTableModel,
  sourceLineOfRow,
  type TableModel,
} from "@/lib/notes/table-edit";

/**
 * Render GFM tables as a real grid, with controls for rows and columns.
 *
 * Shaped after `math-widgets.ts`, and for the same reason: a table spans lines,
 * so it needs a block-level replace decoration, and only a StateField may
 * provide one.
 *
 * The rendered grid is not editable in place. Clicking a cell moves the cursor
 * into that cell's markdown instead, which reveals the source row — the same
 * bargain the rest of the editor makes, where the line you are on shows its
 * syntax. Trying to make cells `contenteditable` inside CodeMirror would mean a
 * second editing surface competing with the document for selection and undo.
 *
 * Structural edits go the other way: a button rewrites the whole table region in
 * one transaction, so each click is one undo step and the markdown stays the
 * source of truth.
 */

// ---------------------------------------------------------------------------
// Applying an edit
// ---------------------------------------------------------------------------

type TableEdit = (model: TableModel) => TableModel;

/**
 * Rewrite the table region under `element` by `edit`.
 *
 * The region is re-read from the document at click time rather than captured
 * when the widget was built, so an edit elsewhere in the note cannot leave a
 * button holding stale offsets. This is the same precaution `KatexWidget` takes.
 */
function applyTableEdit(view: EditorView, element: HTMLElement, edit: TableEdit) {
  const pos = view.posAtDOM(element);
  const range = findTableRanges(view.state.doc.toString()).find(
    (candidate) => candidate.from <= pos && pos <= candidate.to,
  );
  if (!range) return;

  const model = parseTableModel(view.state.doc.sliceString(range.from, range.to));
  if (!model) return;

  const next = serializeTableModel(edit(model));
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
    // The selection is deliberately left where it was. Moving it into the table
    // would reveal the source and hide the grid, so the next button click would
    // have nothing to click.
    scrollIntoView: false,
  });
}

/** Put the cursor in a cell's markdown, revealing the source row. */
function focusCell(view: EditorView, element: HTMLElement, rowIndex: number, columnIndex: number) {
  const pos = view.posAtDOM(element);
  const range = findTableRanges(view.state.doc.toString()).find(
    (candidate) => candidate.from <= pos && pos <= candidate.to,
  );
  if (!range) return;

  const startLine = view.state.doc.lineAt(range.from).number;
  const lineNumber = startLine + sourceLineOfRow(rowIndex);
  if (lineNumber > view.state.doc.lines) return;

  const line = view.state.doc.line(lineNumber);
  const offset = cellOffsetInLine(line.text, columnIndex);
  const target = Math.min(line.from + offset, line.to);
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
  view.focus();
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/**
 * A cell's inline Markdown as HTML, with LaTeX rendered by KaTeX.
 *
 * Cells hold raw inline Markdown (see `NoteTableBlockData`), so rendering them
 * as plain text showed `$\pi$` and `**bold**` literally. `renderInlineMarkdownText`
 * is the same function that builds the stored block document, so the grid shows
 * exactly what the rest of the pipeline thinks the cell contains — including its
 * `\|` escapes and code spans — rather than a second interpretation of it.
 *
 * It emits math as a `note-inline-math` span carrying the LaTeX in an attribute;
 * those become KaTeX here. Only inline math can occur, because a GFM table row is
 * a single line and `$$` display math cannot fit on one.
 */
function renderCellHtml(cell: string): string {
  INLINE_MATH_SPAN_RE.lastIndex = 0;
  return renderInlineMarkdownText(cell).replace(
    INLINE_MATH_SPAN_RE,
    (_match, latex: string) =>
      `<span class="cm-note-table-math">${renderKatexHtml(decodeHtmlAttribute(latex), false)}</span>`,
  );
}

/** Fill a cell element, leaving a visible target when the cell is empty. */
function fillCell(element: HTMLElement, cell: string) {
  if (cell.trim() === "") {
    element.textContent = " ";
    return;
  }
  element.innerHTML = renderCellHtml(cell);
}

function controlButton(label: string, title: string, onPress: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-note-table-btn";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  // mousedown rather than click: CodeMirror acts on mousedown, so waiting for
  // click lets it move the selection into the table first and hide the grid.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  });
  return button;
}

const ALIGNMENT_TITLE = "Cycle column alignment";

class TableWidget extends WidgetType {
  constructor(readonly markdown: string) {
    super();
  }

  eq(other: TableWidget) {
    return other.markdown === this.markdown;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-note-table";

    const model = parseTableModel(this.markdown);
    if (!model) {
      // Should not happen: the decoration is only built for a parsed table. If
      // it ever does, show the source rather than an empty box.
      wrapper.textContent = this.markdown;
      return wrapper;
    }

    const columns = columnCount(model);
    const table = document.createElement("table");
    table.className = "cm-note-table-grid";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th")).className = "cm-note-table-gutter";

    model.rows[0]?.forEach((cell, columnIndex) => {
      const th = document.createElement("th");
      th.style.textAlign = model.align[columnIndex] ?? "left";

      const text = document.createElement("span");
      text.className = "cm-note-table-cell";
      fillCell(text, cell);
      text.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        focusCell(view, wrapper, 0, columnIndex);
      });
      th.appendChild(text);

      const tools = document.createElement("span");
      tools.className = "cm-note-table-tools";
      tools.appendChild(
        controlButton("⇥", "Insert column after", () =>
          applyTableEdit(view, wrapper, (m) => insertColumn(m, columnIndex + 1)),
        ),
      );
      tools.appendChild(
        controlButton("⇔", ALIGNMENT_TITLE, () =>
          applyTableEdit(view, wrapper, (m) => cycleAlignment(m, columnIndex)),
        ),
      );
      if (columns > 1) {
        tools.appendChild(
          controlButton("✕", "Delete column", () =>
            applyTableEdit(view, wrapper, (m) => deleteColumn(m, columnIndex)),
          ),
        );
      }
      th.appendChild(tools);
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    model.rows.slice(1).forEach((row, bodyIndex) => {
      const rowIndex = bodyIndex + 1;
      const tr = document.createElement("tr");

      const gutter = document.createElement("td");
      gutter.className = "cm-note-table-gutter";
      const gutterTools = document.createElement("span");
      gutterTools.className = "cm-note-table-tools";
      gutterTools.appendChild(
        controlButton("+", "Insert row below", () =>
          applyTableEdit(view, wrapper, (m) => insertRow(m, rowIndex + 1)),
        ),
      );
      gutterTools.appendChild(
        controlButton("✕", "Delete row", () =>
          applyTableEdit(view, wrapper, (m) => deleteRow(m, rowIndex)),
        ),
      );
      gutter.appendChild(gutterTools);
      tr.appendChild(gutter);

      row.forEach((cell, columnIndex) => {
        const td = document.createElement("td");
        td.style.textAlign = model.align[columnIndex] ?? "left";
        td.className = "cm-note-table-cell";
        fillCell(td, cell);
        td.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          focusCell(view, wrapper, rowIndex, columnIndex);
        });
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrapper.appendChild(table);

    // Append controls, so an empty-bodied table is still growable.
    const footer = document.createElement("div");
    footer.className = "cm-note-table-footer";
    footer.appendChild(
      controlButton("+ Row", "Add a row at the end", () =>
        applyTableEdit(view, wrapper, (m) => insertRow(m, m.rows.length)),
      ),
    );
    footer.appendChild(
      controlButton("+ Column", "Add a column at the end", () =>
        applyTableEdit(view, wrapper, (m) => insertColumn(m, columnCount(m))),
      ),
    );
    wrapper.appendChild(footer);

    return wrapper;
  }

  /**
   * Let the widget handle its own pointer events. Without this CodeMirror
   * translates a click on a button into a document position and moves the
   * selection there, which hides the grid mid-interaction.
   */
  ignoreEvent(event: Event) {
    return event.type === "mousedown";
  }
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

/** A table the selection touches shows its markdown so it can be typed into. */
function touchesSelection(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const decorations = [];

  for (const range of findTableRanges(text)) {
    if (touchesSelection(state, range.from, range.to)) continue;
    const markdown = text.slice(range.from, range.to);
    if (!parseTableModel(markdown)) continue;
    decorations.push(
      Decoration.replace({ widget: new TableWidget(markdown), block: true }).range(
        range.from,
        range.to,
      ),
    );
  }

  return Decoration.set(decorations, true);
}

const tableDecorationsField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(decorations, transaction) {
    return transaction.docChanged || transaction.selection
      ? buildTableDecorations(transaction.state)
      : decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const tableTheme = EditorView.baseTheme({
  ".cm-note-table": {
    margin: "0.5em 0",
    overflowX: "auto",
  },
  ".cm-note-table-grid": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
  },
  ".cm-note-table-grid th, .cm-note-table-grid td": {
    border: "1px solid var(--border)",
    padding: "0.3em 0.5em",
    verticalAlign: "top",
  },
  ".cm-note-table-grid th": {
    backgroundColor: "var(--surface-muted)",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  ".cm-note-table-grid td.cm-note-table-cell, .cm-note-table-grid th span.cm-note-table-cell": {
    cursor: "text",
  },
  // The control gutter is not a data column, so it carries no border.
  ".cm-note-table-grid .cm-note-table-gutter": {
    border: "none",
    backgroundColor: "transparent",
    padding: "0 0.25em 0 0",
    width: "1px",
    whiteSpace: "nowrap",
  },
  // Controls stay out of the way until the row or column is hovered, so a note
  // being read looks like a table rather than a form.
  ".cm-note-table-tools": {
    display: "inline-flex",
    gap: "0.15em",
    marginLeft: "0.4em",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  ".cm-note-table-grid tr:hover .cm-note-table-tools, .cm-note-table:focus-within .cm-note-table-tools":
    {
      opacity: "1",
    },
  ".cm-note-table-btn": {
    font: "inherit",
    fontSize: "0.8em",
    lineHeight: "1",
    padding: "0.15em 0.3em",
    cursor: "pointer",
    color: "var(--muted-foreground)",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "3px",
  },
  ".cm-note-table-btn:hover": {
    color: "var(--accent)",
    borderColor: "var(--accent)",
  },
  ".cm-note-table-math .katex": {
    fontSize: "1em",
  },
  // A link in a cell stays visible as a link but is not clickable: in the grid a
  // click means "edit this cell", and navigating away mid-edit is never wanted.
  ".cm-note-table-grid a": {
    pointerEvents: "none",
  },
  ".cm-note-table-footer": {
    display: "flex",
    gap: "0.3em",
    marginTop: "0.3em",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  ".cm-note-table:hover .cm-note-table-footer": {
    opacity: "1",
  },
});

export function tableWidgets() {
  return [tableDecorationsField, tableTheme];
}
