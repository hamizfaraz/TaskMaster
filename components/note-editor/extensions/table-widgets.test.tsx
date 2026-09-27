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
    const cell = [...host.querySelectorAll("tbody td.cm-note-table-cell")].find((td) =>
      (td.textContent ?? "").includes("circle ratio"),
    );
    const mathCell = host.querySelector("tbody tr:first-child td.cm-note-table-cell");
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
    const cells = [...host.querySelectorAll("tbody tr:first-child td.cm-note-table-cell")];
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
    const cells = host.querySelectorAll<HTMLElement>("tbody tr:first-child td:not(.cm-note-table-gutter)");
    expect(cells[1]!.style.textAlign).toBe("center");
  });

  it("does not render a table inside a fenced code block", () => {
    const fenced = ["```markdown", "| a | b |", "| --- | --- |", "| 1 | 2 |", "```"].join("\n");
    const { host } = mount(fenced);
    expect(host.querySelector(".cm-note-table-grid")).toBeNull();
  });

  it("shows the markdown source when the cursor is inside the table", () => {
    const { host, view } = mount();
    const inside = doc.indexOf("circle ratio");
    act(() => {
      view.dispatch({ selection: { anchor: inside } });
    });
    expect(host.querySelector(".cm-note-table-grid")).toBeNull();
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

describe("clicking a cell", () => {
  it("moves the cursor into that cell's markdown", () => {
    const { host, view } = mount();
    const cell = [...host.querySelectorAll<HTMLElement>("tbody td.cm-note-table-cell")].find((td) =>
      (td.textContent ?? "").includes("Euler"),
    );
    expect(cell).toBeDefined();
    act(() => {
      cell!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const head = view.state.selection.main.head;
    expect(view.state.doc.sliceString(head, head + 5)).toBe("Euler");
  });
});
