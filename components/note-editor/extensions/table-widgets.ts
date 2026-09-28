import { type EditorState, StateField, Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { renderKatexHtml } from "@/components/note-editor/extensions/katex-render";
import {
  createLatexSourceUi,
  createMathCloseButton,
  createMathFieldElement,
  focusMathField,
} from "@/components/note-editor/extensions/math-field-ui";
import { loadMathLive } from "@/components/note-editor/extensions/mathlive-loader";
import { findMathRanges } from "@/lib/notes/math-ranges";
import { decodeHtmlAttribute, INLINE_MATH_SPAN_RE } from "@/lib/notes/markdown";
import { renderInlineMarkdownText } from "@/lib/notes/parse-markdown";
import {
  cellRangeInLine,
  columnCount,
  cycleAlignment,
  deleteColumn,
  deleteRow,
  escapeCellText,
  findTableRanges,
  insertColumn,
  insertRow,
  parseTableModel,
  serializeTableModel,
  sourceLineOfRow,
  type TableModel,
  type TableRange,
} from "@/lib/notes/table-edit";

/**
 * Render GFM tables as an editable grid.
 *
 * A table's markdown is never shown in preview: no pipes, no delimiter row.
 * Toggling Source is the only way to see it, which is the whole point — a table
 * is a grid, and the pipe syntax is an implementation detail of storing one.
 *
 * Shaped after `math-widgets.ts` and `math-field-widget.ts`, for the same reason:
 * a table spans lines, so it needs a block replace decoration, which only a
 * StateField may provide, and an editable control inside a widget has to own its
 * own events.
 *
 * ## How a cell is edited
 *
 * An unfocused cell shows its rendered Markdown — KaTeX, emphasis, code. Clicking
 * one swaps in an `<input>` holding that cell's raw Markdown, so `$\pi$` can be
 * typed as `$\pi$`. Blurring swaps the rendering back. This is the same bargain
 * live preview already makes line by line, narrowed to one cell.
 *
 * An `<input>` rather than a `contenteditable` cell, deliberately. A nested
 * editable region inside CodeMirror's own contentEditable leaves two components
 * reading the same DOM selection. A form control does not: the browser keeps its
 * caret internally, CodeMirror sees an opaque widget, and plain-text semantics
 * (no pasted HTML, no stray newline ending the row) come for free.
 *
 * Typing writes only the edited cell's own span of the document, so keystrokes
 * still coalesce into sensible undo steps and the rest of the row is untouched.
 * Structural edits — a row or column added or removed — rewrite the whole region
 * in one transaction instead, because they change every line.
 */

// ---------------------------------------------------------------------------
// Locating the table under a widget
// ---------------------------------------------------------------------------

/**
 * The table region containing this widget, read from the document at event time.
 *
 * Never captured when the widget was built: an edit elsewhere in the note would
 * leave a stale offset behind, and this is the same precaution `KatexWidget`
 * takes for the same reason.
 */
function tableRangeOf(view: EditorView, wrapper: HTMLElement): TableRange | null {
  const pos = view.posAtDOM(wrapper);
  return (
    findTableRanges(view.state.doc.toString()).find(
      (candidate) => candidate.from <= pos && pos <= candidate.to,
    ) ?? null
  );
}

/** The document span of one cell's raw text. */
function cellSpan(view: EditorView, range: TableRange, rowIndex: number, columnIndex: number) {
  const startLine = view.state.doc.lineAt(range.from).number;
  const lineNumber = startLine + sourceLineOfRow(rowIndex);
  if (lineNumber > view.state.doc.lines) return null;

  const line = view.state.doc.line(lineNumber);
  const span = cellRangeInLine(line.text, columnIndex);
  return { from: line.from + span.from, to: line.from + span.to };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Replace one cell's text in the document. */
function writeCell(
  view: EditorView,
  wrapper: HTMLElement,
  rowIndex: number,
  columnIndex: number,
  value: string,
) {
  const range = tableRangeOf(view, wrapper);
  if (!range) return;
  const span = cellSpan(view, range, rowIndex, columnIndex);
  if (!span) return;

  const insert = escapeCellText(value);
  if (view.state.doc.sliceString(span.from, span.to) === insert) return;

  view.dispatch({
    changes: { from: span.from, to: span.to, insert },
    // Marked as typing so history coalesces a burst of keystrokes into one undo
    // step, exactly as it would for text typed straight into the document.
    annotations: Transaction.userEvent.of("input.type"),
    scrollIntoView: false,
  });
}

type TableEdit = (model: TableModel) => TableModel;

/** Rewrite the whole table region. Used for structural edits only. */
function applyTableEdit(view: EditorView, wrapper: HTMLElement, edit: TableEdit) {
  const range = tableRangeOf(view, wrapper);
  if (!range) return null;

  const model = parseTableModel(view.state.doc.sliceString(range.from, range.to));
  if (!model) return null;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: serializeTableModel(edit(model)) },
    scrollIntoView: false,
  });
  return range.from;
}

// ---------------------------------------------------------------------------
// Rendering a cell
// ---------------------------------------------------------------------------

/**
 * A cell's inline Markdown as HTML, with LaTeX rendered by KaTeX.
 *
 * `renderInlineMarkdownText` is the function that builds the stored block
 * document, so the grid shows what the rest of the pipeline believes the cell
 * contains — its `\|` escapes and code spans included — rather than a second
 * interpretation of it. It emits math as a span carrying the LaTeX in an
 * attribute; those become KaTeX here. Only inline math can occur, because a GFM
 * row is one line and `$$` cannot fit on one.
 */
function renderCellHtml(cell: string): string {
  INLINE_MATH_SPAN_RE.lastIndex = 0;
  let index = 0;
  return renderInlineMarkdownText(cell).replace(
    INLINE_MATH_SPAN_RE,
    (_match, latex: string) =>
      // The index is how a click identifies which formula it hit. Ordinal rather
      // than offset on purpose: the cell's displayed text has its `\|` escapes
      // resolved, so offsets into it do not match the document, but the order and
      // number of formulas are the same either way.
      `<span class="cm-note-table-math" data-math-index="${index++}" role="button" title="Edit formula">${renderKatexHtml(decodeHtmlAttribute(latex), false)}</span>`,
  );
}

/** Show the cell's rendered form, leaving a clickable target when it is empty. */
function showRendered(cell: HTMLElement) {
  const raw = cell.dataset.raw ?? "";
  if (raw.trim() === "") {
    cell.textContent = "";
    cell.classList.add("cm-note-table-cell-empty");
    return;
  }
  cell.classList.remove("cm-note-table-cell-empty");
  cell.innerHTML = renderCellHtml(raw);
}

/**
 * Build a cell.
 *
 * Always a `<span>` inside the `<th>`/`<td>`, never the `<th>`/`<td>` itself. The
 * cell needs `display: block` to give an empty cell a clickable height, and
 * setting that on a table cell takes it out of the table's formatting context —
 * which collapsed every column into a single stack down the left.
 */
function makeCell(rowIndex: number, columnIndex: number, raw: string, alignment: string) {
  const cell = document.createElement("span");
  cell.className = "cm-note-table-cell";
  cell.dataset.row = String(rowIndex);
  cell.dataset.col = String(columnIndex);
  cell.dataset.raw = raw;
  cell.style.textAlign = alignment;
  showRendered(cell);
  return cell;
}

const CELL_SELECTOR = ".cm-note-table-cell";

function cellAt(root: ParentNode, rowIndex: number, columnIndex: number) {
  return root.querySelector<HTMLElement>(
    `${CELL_SELECTOR}[data-row="${rowIndex}"][data-col="${columnIndex}"]`,
  );
}

/** The input inside a cell, when that cell is the one being edited. */
function inputOf(cell: HTMLElement) {
  return cell.querySelector<HTMLInputElement>("input.cm-note-table-input");
}

// ---------------------------------------------------------------------------
// The widget
// ---------------------------------------------------------------------------

class TableWidget extends WidgetType {
  constructor(readonly markdown: string) {
    super();
  }

  eq(other: TableWidget) {
    return other.markdown === this.markdown;
  }

  /**
   * Reuse the existing grid when only cell text changed.
   *
   * This is what keeps an edit from destroying the input the user is typing in:
   * the focused cell is left exactly as it is, since its DOM already holds what
   * was typed. A change of shape returns false and rebuilds, which is safe
   * because shape only changes from a button press, where focus is on a button.
   */
  updateDOM(dom: HTMLElement) {
    const model = parseTableModel(this.markdown);
    if (!model) return false;

    const columns = columnCount(model);
    const cells = dom.querySelectorAll<HTMLElement>(CELL_SELECTOR);
    if (cells.length !== model.rows.length * columns) return false;

    for (const cell of cells) {
      const rowIndex = Number(cell.dataset.row);
      const columnIndex = Number(cell.dataset.col);
      const raw = model.rows[rowIndex]?.[columnIndex] ?? "";
      const alignment = model.align[columnIndex] ?? "left";
      cell.style.textAlign = alignment;

      if (cell.dataset.raw === raw) continue;
      cell.dataset.raw = raw;

      const input = inputOf(cell);
      if (input) {
        // Being edited. Only sync when the document disagrees with the field,
        // which happens on undo, never from the user's own typing.
        if (input.value !== raw) input.value = raw;
        continue;
      }
      // An open MathLive field is writing to the document as the user types in
      // it; re-rendering the cell would tear the field out mid-edit.
      if (cell.querySelector(".cm-note-mathfield")) continue;
      showRendered(cell);
    }
    return true;
  }

  /** The grid owns its pointer and keyboard events; CodeMirror stays out. */
  ignoreEvent() {
    return true;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-note-table";
    // The widget root is not part of CodeMirror's editable text. The inputs
    // inside it are their own editing contexts.
    wrapper.contentEditable = "false";

    const model = parseTableModel(this.markdown);
    if (!model) {
      wrapper.textContent = this.markdown;
      return wrapper;
    }

    const columns = columnCount(model);

    // -- editing ----------------------------------------------------------

    /** Swap a cell's rendering for an input holding its raw Markdown. */
    const beginEdit = (cell: HTMLElement, caret: "end" | "start" = "end") => {
      if (inputOf(cell)) {
        inputOf(cell)!.focus();
        return;
      }
      const rowIndex = Number(cell.dataset.row);
      const columnIndex = Number(cell.dataset.col);
      const raw = cell.dataset.raw ?? "";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "cm-note-table-input";
      input.value = raw;
      input.setAttribute(
        "aria-label",
        rowIndex === 0 ? `Column ${columnIndex + 1} heading` : `Row ${rowIndex}, column ${columnIndex + 1}`,
      );

      input.addEventListener("input", () => {
        cell.dataset.raw = input.value;
        writeCell(view, wrapper, rowIndex, columnIndex, input.value);
      });

      input.addEventListener("blur", () => {
        input.remove();
        showRendered(cell);
      });

      input.addEventListener("keydown", (event) => {
        // Mod-e opens the formula under the caret, the same shortcut that opens a
        // formula anywhere else in the note. Resolved to an ordinal so it matches
        // the document even when the cell contains an escaped pipe.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
          const caret = input.selectionStart ?? input.value.length;
          const index = findMathRanges(input.value).findIndex(
            (range) => range.from <= caret && caret <= range.to,
          );
          if (index !== -1) {
            event.preventDefault();
            event.stopPropagation();
            input.remove();
            openCellMath(cell, index);
            return;
          }
        }
        // The grid is the keyboard context while a cell is open, so navigation
        // keys must not reach CodeMirror and move the document cursor instead.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          input.blur();
          leaveGrid(view, wrapper);
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          step(rowIndex, columnIndex, event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === "Enter" || event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          moveRow(rowIndex, columnIndex, 1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          moveRow(rowIndex, columnIndex, -1);
        }
      });

      cell.textContent = "";
      cell.classList.remove("cm-note-table-cell-empty");
      cell.appendChild(input);
      input.focus();
      const position = caret === "start" ? 0 : input.value.length;
      input.setSelectionRange(position, position);
    };

    /** Move to the next or previous cell in reading order. */
    const step = (rowIndex: number, columnIndex: number, direction: 1 | -1) => {
      const flat = rowIndex * columns + columnIndex + direction;
      const total = model.rows.length * columns;
      if (flat < 0 || flat >= total) {
        // Past either end: leave the grid rather than wrapping around.
        leaveGrid(view, wrapper);
        return;
      }
      const next = cellAt(wrapper, Math.floor(flat / columns), flat % columns);
      if (next) beginEdit(next, direction === 1 ? "start" : "end");
    };

    /** Move down or up a row, adding a row when stepping off the bottom. */
    const moveRow = (rowIndex: number, columnIndex: number, direction: 1 | -1) => {
      const target = rowIndex + direction;
      if (target < 0) {
        leaveGrid(view, wrapper);
        return;
      }
      if (target >= model.rows.length) {
        const from = applyTableEdit(view, wrapper, (m) => insertRow(m, m.rows.length));
        if (from !== null) focusRebuiltCell(view, from, target, columnIndex);
        return;
      }
      const next = cellAt(wrapper, target, columnIndex);
      if (next) beginEdit(next);
    };

    /**
     * Open the `mathIndex`-th formula in a cell with MathLive.
     *
     * The same element, attributes and "LaTeX" toggle as a formula outside a
     * table, so the keyboard behaves identically — Backspace removes a fraction
     * as a unit, and no virtual keyboard appears. The formula's own `$…$` span of
     * the document is what gets written, so the surrounding cell text is
     * untouched.
     *
     * This cannot go through the `mathSessionField` that serves the rest of the
     * note: that renders its field as its own replace decoration, and this region
     * is already covered by the table's block decoration. Two replace decorations
     * over the same range cannot both apply, so the table hosts the field itself.
     */
    const openCellMath = (cell: HTMLElement, mathIndex: number) => {
      const rowIndex = Number(cell.dataset.row);
      const columnIndex = Number(cell.dataset.col);

      const locate = () => {
        const range = tableRangeOf(view, wrapper);
        if (!range) return null;
        const span = cellSpan(view, range, rowIndex, columnIndex);
        if (!span) return null;
        const source = view.state.doc.sliceString(span.from, span.to);
        const math = findMathRanges(source)[mathIndex];
        if (!math) return null;
        // Inside the delimiters: `$…$` is one character each side.
        return { from: span.from + math.from + 1, to: span.from + math.to - 1 };
      };

      const initial = locate();
      if (!initial) return;
      const latex = view.state.doc.sliceString(initial.from, initial.to);

      void loadMathLive()
        .then(() => {
          if (!cell.isConnected) return;

          const host = document.createElement("span");
          host.className = "cm-note-mathfield";
          host.contentEditable = "false";

          const field = createMathFieldElement(latex, false);
          const { toggle, source } = createLatexSourceUi(latex, 1);
          const closeButton = createMathCloseButton();
          host.append(field, toggle, closeButton, source);

          const write = (value: string) => {
            const at = locate();
            if (!at) return;
            if (view.state.doc.sliceString(at.from, at.to) === value) return;
            view.dispatch({
              changes: { from: at.from, to: at.to, insert: value },
              annotations: Transaction.userEvent.of("input.type"),
              scrollIntoView: false,
            });
          };

          const close = () => {
            host.remove();
            showRendered(cell);
          };

          field.addEventListener("input", () => write(field.value));
          field.addEventListener("focusout", () => {
            // A focus move inside the assembly (to the LaTeX textarea) is not an
            // exit; only leaving the whole thing closes it.
            window.setTimeout(() => {
              if (!host.contains(document.activeElement)) close();
            }, 0);
          });
          field.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault();
              close();
              const again = cellAt(wrapper, rowIndex, columnIndex);
              if (again) beginEdit(again);
            }
          });

          closeButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
          });

          toggle.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const show = source.hidden;
            source.hidden = !show;
            toggle.setAttribute("aria-pressed", show ? "true" : "false");
            if (show) {
              source.value = field.value;
              source.focus();
            } else {
              focusMathField(field);
            }
          });
          source.addEventListener("input", () => {
            field.setValue(source.value, { silenceNotifications: true });
            write(source.value);
          });
          source.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          });

          cell.textContent = "";
          cell.appendChild(host);
          focusMathField(field);
        })
        .catch(() => {
          // MathLive did not load; the cell stays as it was and the text input
          // remains the way to edit the formula.
        });
    };

    /**
     * One delegated listener rather than a handler per cell.
     *
     * Cells are re-rendered whenever the document changes, so per-element
     * listeners would have to be re-attached every time; delegation on the
     * wrapper cannot go stale. A click on a formula opens MathLive, a click
     * anywhere else in a cell opens the text input.
     */
    wrapper.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(".cm-note-mathfield") || target.closest("button")) return;

      const cell = target.closest<HTMLElement>(CELL_SELECTOR);
      if (!cell || !wrapper.contains(cell)) return;

      event.preventDefault();
      event.stopPropagation();

      const formula = target.closest<HTMLElement>(".cm-note-table-math");
      if (formula) {
        openCellMath(cell, Number(formula.dataset.mathIndex ?? "0"));
        return;
      }
      beginEdit(cell);
    });

    // -- header -----------------------------------------------------------

    const table = document.createElement("table");
    table.className = "cm-note-table-grid";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th")).className = "cm-note-table-gutter";

    model.rows[0]?.forEach((raw, columnIndex) => {
      const th = document.createElement("th");

      th.appendChild(makeCell(0, columnIndex, raw, model.align[columnIndex] ?? "left"));

      const tools = document.createElement("span");
      tools.className = "cm-note-table-tools";
      tools.appendChild(
        controlButton("⇥", "Insert column after", () =>
          applyTableEdit(view, wrapper, (m) => insertColumn(m, columnIndex + 1)),
        ),
      );
      tools.appendChild(
        controlButton("⇔", "Cycle column alignment", () =>
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

    // -- body -------------------------------------------------------------

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

      row.forEach((raw, columnIndex) => {
        const td = document.createElement("td");
        td.appendChild(makeCell(rowIndex, columnIndex, raw, model.align[columnIndex] ?? "left"));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrapper.appendChild(table);

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
}

// ---------------------------------------------------------------------------
// Leaving the grid, and returning to it after a rebuild
// ---------------------------------------------------------------------------

/** Put the document cursor just after the table and give CodeMirror the keyboard. */
function leaveGrid(view: EditorView, wrapper: HTMLElement) {
  const range = tableRangeOf(view, wrapper);
  view.focus();
  if (range) {
    view.dispatch({ selection: { anchor: Math.min(range.to + 1, view.state.doc.length) } });
  }
}

/**
 * Focus a cell after a structural edit replaced the grid's DOM.
 *
 * The widget's element is gone by this point, so the table is found again by the
 * document position it starts at, which a change inside it does not move.
 */
function focusRebuiltCell(
  view: EditorView,
  tableFrom: number,
  rowIndex: number,
  columnIndex: number,
) {
  for (const element of view.dom.querySelectorAll<HTMLElement>(".cm-note-table")) {
    if (view.posAtDOM(element) !== tableFrom) continue;
    const cell = cellAt(element, rowIndex, columnIndex);
    if (cell) {
      cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }
    return;
  }
}

function controlButton(label: string, title: string, onPress: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-note-table-btn";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  // mousedown, not click: CodeMirror acts on mousedown, and a click arrives too
  // late to stop it having already moved the selection.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  });
  return button;
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

function buildTableDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  const decorations = [];

  for (const range of findTableRanges(text)) {
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

/**
 * Unlike every other live-preview element, a table does not reveal its source
 * when the selection reaches it: the grid is the only view of it, and Source mode
 * is how the markdown is seen. The range is therefore atomic, so the cursor steps
 * over the whole table instead of landing in text that is never displayed.
 */
const tableDecorationsField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(decorations, transaction) {
    return transaction.docChanged ? buildTableDecorations(transaction.state) : decorations;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
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
  },
  ".cm-note-table-cell": {
    cursor: "text",
    display: "block",
    minHeight: "1.4em",
    minWidth: "2em",
  },
  ".cm-note-table-cell-empty::after": {
    // An empty cell still needs a height to be clickable.
    content: '"\\00a0"',
  },
  ".cm-note-table-input": {
    font: "inherit",
    color: "inherit",
    width: "100%",
    minWidth: "4em",
    margin: "0",
    padding: "0",
    border: "none",
    outline: "none",
    background: "transparent",
    textAlign: "inherit",
  },
  ".cm-note-table-math": {
    cursor: "pointer",
    borderRadius: "3px",
  },
  ".cm-note-table-math:hover": {
    backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
  },
  ".cm-note-table-math .katex": {
    fontSize: "1em",
  },
  // A link in a cell stays visible as a link but is not clickable: in the grid a
  // click means "edit this cell", and navigating away mid-edit is never wanted.
  ".cm-note-table-grid a": {
    pointerEvents: "none",
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
  ".cm-note-table-footer": {
    display: "flex",
    gap: "0.3em",
    marginTop: "0.3em",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  ".cm-note-table:hover .cm-note-table-footer, .cm-note-table:focus-within .cm-note-table-footer": {
    opacity: "1",
  },
});

export function tableWidgets() {
  return [tableDecorationsField, tableTheme];
}
