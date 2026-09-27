import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import MarkdownEditor from "@/components/note-editor/markdown-editor";

/** Enough of MathLive's element for the bridge, as math-field-widget.test.tsx uses. */
class StubMathField extends HTMLElement {
  private stored = "";
  defaultMode = "math";
  get value() {
    return this.stored;
  }
  set value(next: string) {
    this.stored = next;
  }
  setValue(next: string) {
    this.stored = next;
  }
  focus() {}
}

const doc = [
  "Intro.",
  "",
  "| Symbol | Meaning |",
  "| --- | --- |",
  "| $\\pi$ | circle ratio |",
  "| $e$ and $\\phi$ | two of them |",
].join("\n");

function mount(value = doc) {
  const onChange = vi.fn();
  const utils = render(<MarkdownEditor value={value} onChange={onChange} />);
  const host = utils.getByTestId("markdown-editor");
  const view = EditorView.findFromDOM(host);
  if (!view) throw new Error("EditorView did not mount");
  return { host, view };
}

function cellOf(host: HTMLElement, row: number, col: number) {
  const cell = host.querySelector<HTMLElement>(
    `.cm-note-table-cell[data-row="${row}"][data-col="${col}"]`,
  );
  if (!cell) throw new Error(`no cell at ${row},${col}`);
  return cell;
}

/** Click a rendered formula inside a cell and wait for MathLive to attach. */
async function openFormula(host: HTMLElement, row: number, col: number, index = 0) {
  const cell = cellOf(host, row, col);
  const formula = cell.querySelector<HTMLElement>(`[data-math-index="${index}"]`);
  if (!formula) throw new Error(`no formula ${index} in cell ${row},${col}`);
  await act(async () => {
    formula.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  return { cell, field: cell.querySelector("math-field") as (HTMLElement & { value: string }) | null };
}

describe("editing a formula inside a table cell", () => {
  beforeAll(() => {
    if (!customElements.get("math-field")) {
      customElements.define("math-field", StubMathField);
    }
  });

  afterEach(cleanup);

  it("marks each formula with its ordinal so a click can identify it", () => {
    const { host } = mount();
    const cell = cellOf(host, 2, 0);
    const indices = [...cell.querySelectorAll("[data-math-index]")].map(
      (el) => (el as HTMLElement).dataset.mathIndex,
    );
    expect(indices).toEqual(["0", "1"]);
  });

  it("opens a MathLive field seeded with that formula's LaTeX", async () => {
    const { host } = mount();
    const { field } = await openFormula(host, 1, 0);
    expect(field).not.toBeNull();
    expect(field!.value).toBe("\\pi");
  });

  it("opens the second formula in a cell, not the first", async () => {
    const { host } = mount();
    const { field } = await openFormula(host, 2, 0, 1);
    expect(field!.value).toBe("\\phi");
  });

  it("uses the same wrapper class as a formula outside a table", async () => {
    // The styling lives in globals.css under this name, so sharing it is what
    // makes the in-cell field look identical to the one in prose.
    const { host } = mount();
    const { cell } = await openFormula(host, 1, 0);
    expect(cell.querySelector(".cm-note-mathfield")).not.toBeNull();
  });

  it("offers the same LaTeX source toggle", async () => {
    const { host } = mount();
    const { cell } = await openFormula(host, 1, 0);
    const toggle = cell.querySelector<HTMLButtonElement>(".cm-note-mathfield-toggle");
    const source = cell.querySelector<HTMLTextAreaElement>(".cm-note-mathfield-source");
    expect(toggle).not.toBeNull();
    expect(source!.hidden).toBe(true);
    act(() => {
      toggle!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(source!.hidden).toBe(false);
    expect(source!.value).toBe("\\pi");
  });

  it("writes an edited formula back into the cell's markdown", async () => {
    const { host, view } = mount();
    const { field } = await openFormula(host, 1, 0);
    act(() => {
      field!.value = "\\tau";
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.state.doc.toString()).toContain("| $\\tau$ | circle ratio |");
  });

  it("changes only the formula, not the rest of the cell", async () => {
    const { host, view } = mount();
    const { field } = await openFormula(host, 2, 0, 1);
    act(() => {
      field!.value = "\\psi";
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.state.doc.toString()).toContain("| $e$ and $\\psi$ | two of them |");
  });

  it("writes through the LaTeX source textarea as well", async () => {
    const { host, view } = mount();
    const { cell } = await openFormula(host, 1, 0);
    const source = cell.querySelector<HTMLTextAreaElement>(".cm-note-mathfield-source")!;
    act(() => {
      source.value = "\\gamma";
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.state.doc.toString()).toContain("| $\\gamma$ |");
  });

  it("keeps the field alive while it writes, instead of tearing it out", async () => {
    const { host } = mount();
    const { cell, field } = await openFormula(host, 1, 0);
    act(() => {
      field!.value = "\\tau";
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(cell.querySelector("math-field")).toBe(field);
  });

  it("closes on Escape and shows the formula rendered again", async () => {
    const { host } = mount();
    const { cell, field } = await openFormula(host, 1, 0);
    act(() => {
      field!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(cell.querySelector("math-field")).toBeNull();
  });

  it("opens the formula under the caret on Mod-e, as it does outside a table", async () => {
    const { host } = mount();
    const cell = cellOf(host, 2, 0);
    act(() => {
      cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const input = cell.querySelector<HTMLInputElement>("input.cm-note-table-input")!;
    expect(input.value).toBe("$e$ and $\\phi$");
    // Caret inside the second formula.
    input.setSelectionRange(11, 11);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "e", ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    const field = cell.querySelector("math-field") as (HTMLElement & { value: string }) | null;
    expect(field).not.toBeNull();
    expect(field!.value).toBe("\\phi");
  });

  it("leaves Mod-e alone when the caret is not in a formula", async () => {
    const { host } = mount();
    const cell = cellOf(host, 1, 1);
    act(() => {
      cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const input = cell.querySelector<HTMLInputElement>("input.cm-note-table-input")!;
    input.setSelectionRange(2, 2);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "e", ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    expect(cell.querySelector("math-field")).toBeNull();
    expect(cell.querySelector("input.cm-note-table-input")).not.toBeNull();
  });
});
