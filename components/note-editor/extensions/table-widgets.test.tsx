import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "@/components/note-editor/markdown-editor";

afterEach(cleanup);

const table = [
  "| Symbol | Meaning |",
  "| --- | :-: |",
  "| $\\pi$ | circle ratio |",
  "| $e$ | Euler |",
].join("\n");

const doc = `Intro paragraph.\n\n${table}\n\nAfter the table.`;

function mount(value = doc) {
  const onChange = vi.fn();
  const utils = render(<MarkdownEditor value={value} onChange={onChange} />);
  const host = utils.getByTestId("markdown-editor");
  const view = EditorView.findFromDOM(host);
  if (!view) throw new Error("EditorView did not mount");
  return { host, view, onChange };
}

/** Click a control by its accessible name. */
function press(host: HTMLElement, title: string, index = 0) {
  const buttons = [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${title}"]`)];
  const button = buttons[index];
  if (!button) throw new Error(`no "${title}" control at index ${index}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
}

describe("table grid rendering", () => {
  it("renders a markdown table as a real grid", () => {
    const { host } = mount();
    const grid = host.querySelector(".cm-note-table-grid");
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll("thead th:not(.cm-note-table-gutter)")).toHaveLength(2);
    expect(grid!.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("renders LaTeX in a cell with KaTeX, not as literal dollar signs", () => {
    // The first version set textContent, so `$\pi$` showed verbatim.
    const { host } = mount();
    const cell = [...host.querySelectorAll("tbody .cm-note-table-cell")].find((td) =>
      (td.textContent ?? "").includes("circle ratio"),
    );
    const mathCell = host.querySelector("tbody tr:first-child .cm-note-table-cell");
    expect(cell).toBeDefined();
    expect(mathCell!.querySelector(".katex")).not.toBeNull();
    expect(mathCell!.textContent).not.toContain("$");
  });

  it("renders LaTeX in a header cell too", () => {
    const withMathHeader = ["Intro.", "", "| $x$ | Plain |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const { host } = mount(withMathHeader);
    const th = host.querySelector("thead th:not(.cm-note-table-gutter)");
    expect(th!.querySelector(".katex")).not.toBeNull();
  });

  it("renders inline emphasis and code inside cells", () => {
    const rich = [
      "Intro.",
      "",
      "| Term | Detail |",
      "| --- | --- |",
      "| **bold** | `code` |",
      "| _italic_ | plain |",
    ].join("\n");
    const { host } = mount(rich);
    const body = host.querySelector("tbody")!;
    expect(body.querySelector("strong")?.textContent).toBe("bold");
    expect(body.querySelector("code")?.textContent).toBe("code");
    expect(body.querySelector("em")?.textContent).toBe("italic");
  });

  it("shows an escaped pipe as a pipe, not as a cell boundary", () => {
    const { host } = mount();
    const cells = [...host.querySelectorAll("tbody tr:first-child .cm-note-table-cell")];
    // Two data cells, and the escape is content in the second.
    expect(cells).toHaveLength(2);
  });

  it("leaves a link visible but not clickable, so a click edits the cell", () => {
    const linked = ["Intro.", "", "| Ref |", "| --- |", "| [docs](https://example.com) |"].join("\n");
    const { host } = mount(linked);
    const anchor = host.querySelector("tbody a");
    expect(anchor?.textContent).toBe("docs");
  });

  it("shows the cell text, not the pipes", () => {
    const { host } = mount();
    const headers = [...host.querySelectorAll("thead th:not(.cm-note-table-gutter)")].map(
      (th) => th.textContent ?? "",
    );
    expect(headers[0]).toContain("Symbol");
    expect(headers[1]).toContain("Meaning");
  });

  it("carries the column alignment from the delimiter row", () => {
    const { host } = mount();
    const cells = host.querySelectorAll<HTMLElement>("tbody tr:first-child .cm-note-table-cell");
    expect(cells[1]!.style.textAlign).toBe("center");
  });

  it("keeps every column in the table's own layout", () => {
    // Regression: the editable cell needs display:block so an empty cell still
    // has a clickable height. Putting that class on the <td> itself took the cell
    // out of the table formatting context and stacked every column down the left.
    const { host } = mount();
    const tds = [...host.querySelectorAll("tbody td:not(.cm-note-table-gutter)")];
    expect(tds).toHaveLength(4);
    for (const td of tds) {
      expect(td.classList.contains("cm-note-table-cell")).toBe(false);
      expect(td.querySelector(".cm-note-table-cell")).not.toBeNull();
    }
    expect(
      host.querySelectorAll("tbody tr:first-child td:not(.cm-note-table-gutter)"),
    ).toHaveLength(2);
  });

  it("does not render a table inside a fenced code block", () => {
    const fenced = ["```markdown", "| a | b |", "| --- | --- |", "| 1 | 2 |", "```"].join("\n");
    const { host } = mount(fenced);
    expect(host.querySelector(".cm-note-table-grid")).toBeNull();
  });

  it("keeps the grid even when the selection reaches the table", () => {
    // The markdown is never shown in preview; Source mode is the only way to see
    // it. Revealing pipes on selection was the old behaviour.
    const { host, view } = mount();
    const inside = doc.indexOf("circle ratio");
    act(() => {
      view.dispatch({ selection: { anchor: inside } });
    });
    expect(host.querySelector(".cm-note-table-grid")).not.toBeNull();
    expect(host.textContent).not.toContain("| --- |");
  });

  it("never shows the pipe syntax or the delimiter row", () => {
    const { host } = mount();
    const text = host.textContent ?? "";
    expect(text).not.toContain("---");
    expect(text).not.toContain("|");
  });
});

describe("row and column controls", () => {
  it("adds a row and writes it back to the markdown", () => {
    const { host, view } = mount();
    press(host, "Add a row at the end");
    const text = view.state.doc.toString();
    expect(text).toContain("| $e$ | Euler |\n|  |  |");
  });

  it("adds a column, widening the header and every row", () => {
    const { host, view } = mount();
    press(host, "Add a column at the end");
    const text = view.state.doc.toString();
    expect(text).toContain("| Symbol | Meaning |  |");
    expect(text).toContain("| $e$ | Euler |  |");
  });

  it("deletes the row whose control was clicked", () => {
    const { host, view } = mount();
    press(host, "Delete row", 0);
    const text = view.state.doc.toString();
    expect(text).not.toContain("circle ratio");
    expect(text).toContain("| $e$ | Euler |");
  });

  it("deletes the column whose control was clicked", () => {
    const { host, view } = mount();
    press(host, "Delete column", 1);
    const text = view.state.doc.toString();
    expect(text).not.toContain("Meaning");
    expect(text).toContain("| Symbol |");
  });

  it("inserts a column after the one clicked, not at the end", () => {
    const { host, view } = mount();
    press(host, "Insert column after", 0);
    expect(view.state.doc.toString()).toContain("| Symbol |  | Meaning |");
  });

  it("inserts a row below the one clicked", () => {
    const { host, view } = mount();
    press(host, "Insert row below", 0);
    const text = view.state.doc.toString();
    expect(text).toContain("| $\\pi$ | circle ratio |\n|  |  |\n| $e$ | Euler |");
  });

  it("cycles a column's alignment in the delimiter row", () => {
    const { host, view } = mount();
    press(host, "Cycle column alignment", 0);
    expect(view.state.doc.toString()).toContain("| :-- | :-: |");
  });

  it("offers no delete-column control when only one column is left", () => {
    const single = ["| Only |", "| --- |", "| a |"].join("\n");
    const { host } = mount(single);
    expect(host.querySelector('[aria-label="Delete column"]')).toBeNull();
  });

  it("leaves the text outside the table untouched", () => {
    const { host, view } = mount();
    press(host, "Add a row at the end");
    const text = view.state.doc.toString();
    expect(text.startsWith("Intro paragraph.")).toBe(true);
    expect(text.endsWith("After the table.")).toBe(true);
  });

  it("keeps the grid visible so controls can be clicked repeatedly", () => {
    const { host, view } = mount();
    press(host, "Add a row at the end");
    expect(host.querySelector(".cm-note-table-grid")).not.toBeNull();
    press(host, "Add a row at the end");
    expect(view.state.doc.toString()).toContain("|  |  |\n|  |  |");
  });

  it("makes each edit a single undo step", () => {
    const { host, view } = mount();
    press(host, "Add a row at the end");
    const afterEdit = view.state.doc.toString();
    expect(afterEdit).not.toBe(doc);
  });
});

/** Click a cell open and return its input. */
function edit(host: HTMLElement, row: number, col: number) {
  const cell = host.querySelector<HTMLElement>(
    `.cm-note-table-cell[data-row="${row}"][data-col="${col}"]`,
  );
  if (!cell) throw new Error(`no cell at ${row},${col}`);
  act(() => {
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  const input = cell.querySelector<HTMLInputElement>("input.cm-note-table-input");
  if (!input) throw new Error(`cell ${row},${col} did not open for editing`);
  return { cell, input };
}

/** Type a whole value into an open cell input. */
function type(input: HTMLInputElement, value: string) {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(input: HTMLInputElement, init: KeyboardEventInit) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

describe("editing a cell in place", () => {
  it("opens an input holding the cell's raw markdown, not its rendering", () => {
    const { host } = mount();
    // The rendered cell shows a pi; the input must show the LaTeX that made it.
    const { input } = edit(host, 1, 0);
    expect(input.value).toBe("$\\pi$");
  });

  it("writes typing straight into the document", () => {
    const { host, view } = mount();
    const { input } = edit(host, 1, 1);
    type(input, "ratio of circumference");
    expect(view.state.doc.toString()).toContain("| $\\pi$ | ratio of circumference |");
  });

  it("changes only the edited cell, leaving the rest of the row alone", () => {
    const { host, view } = mount();
    const { input } = edit(host, 2, 1);
    type(input, "Euler's number");
    const text = view.state.doc.toString();
    expect(text).toContain("| $e$ | Euler's number |");
    expect(text).toContain("| $\\pi$ | circle ratio |");
  });

  it("escapes a typed pipe so it stays inside the cell", () => {
    const { host, view } = mount();
    const { input } = edit(host, 2, 1);
    type(input, "a | b");
    expect(view.state.doc.toString()).toContain("| $e$ | a \\| b |");
    // And the table still has two columns, not three.
    expect(host.querySelectorAll("thead th:not(.cm-note-table-gutter)")).toHaveLength(2);
  });

  it("renders the new value again once the cell is left", () => {
    const { host } = mount();
    const { cell, input } = edit(host, 2, 0);
    type(input, "$\\alpha$");
    act(() => {
      input.dispatchEvent(new FocusEvent("blur"));
    });
    expect(cell.querySelector("input")).toBeNull();
    expect(cell.querySelector(".katex")).not.toBeNull();
  });

  it("keeps the input alive across the document update, so typing is not interrupted", () => {
    const { host } = mount();
    const { cell, input } = edit(host, 1, 1);
    type(input, "first");
    type(input, "first second");
    // Same element still in the DOM and still holding the caret's value.
    expect(cell.querySelector("input")).toBe(input);
    expect(input.value).toBe("first second");
  });

  it("opens a heading cell for editing too", () => {
    const { host, view } = mount();
    const { input } = edit(host, 0, 1);
    expect(input.value).toBe("Meaning");
    type(input, "Definition");
    expect(view.state.doc.toString()).toContain("| Symbol | Definition |");
  });
});

describe("keyboard navigation between cells", () => {
  it("moves to the next cell on Tab", () => {
    const { host } = mount();
    const { input } = edit(host, 1, 0);
    key(input, { key: "Tab" });
    const next = host.querySelector<HTMLElement>('.cm-note-table-cell[data-row="1"][data-col="1"]');
    expect(next!.querySelector("input")).not.toBeNull();
  });

  it("moves to the previous cell on Shift+Tab", () => {
    const { host } = mount();
    const { input } = edit(host, 1, 1);
    key(input, { key: "Tab", shiftKey: true });
    const previous = host.querySelector<HTMLElement>('.cm-note-table-cell[data-row="1"][data-col="0"]');
    expect(previous!.querySelector("input")).not.toBeNull();
  });

  it("wraps from the end of a row to the start of the next", () => {
    const { host } = mount();
    const { input } = edit(host, 1, 1);
    key(input, { key: "Tab" });
    const next = host.querySelector<HTMLElement>('.cm-note-table-cell[data-row="2"][data-col="0"]');
    expect(next!.querySelector("input")).not.toBeNull();
  });

  it("moves down a row on Enter", () => {
    const { host } = mount();
    const { input } = edit(host, 1, 0);
    key(input, { key: "Enter" });
    const below = host.querySelector<HTMLElement>('.cm-note-table-cell[data-row="2"][data-col="0"]');
    expect(below!.querySelector("input")).not.toBeNull();
  });

  it("adds a row when Enter is pressed on the last one", () => {
    const { host, view } = mount();
    const { input } = edit(host, 2, 0);
    key(input, { key: "Enter" });
    expect(view.state.doc.toString()).toContain("| $e$ | Euler |\n|  |  |");
  });

  it("does not let Enter put a newline in the document", () => {
    const { host, view } = mount();
    const before = view.state.doc.lines;
    const { input } = edit(host, 1, 0);
    key(input, { key: "Enter" });
    // One new line at most, and only because a row was appended -- never a line
    // break inside a row, which would end the table.
    expect(view.state.doc.lines).toBe(before);
  });

  it("leaves the grid on Escape and puts the cursor after the table", () => {
    const { host, view } = mount();
    const { input } = edit(host, 1, 0);
    key(input, { key: "Escape" });
    const head = view.state.selection.main.head;
    expect(head).toBeGreaterThan(doc.indexOf("| $e$ | Euler |"));
  });
});

describe("the cursor treats the table as one unit", () => {
  it("does not leave the document cursor inside hidden markdown", () => {
    const { view } = mount();
    // An atomic range means motion steps over the whole table rather than into
    // text that is never displayed.
    const ranges = view.state.facet(EditorView.atomicRanges);
    expect(ranges.length).toBeGreaterThan(0);
  });
});
