import { act, cleanup, render } from "@testing-library/react";
import { undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { enterMath, mathSessionField } from "@/components/note-editor/extensions/math-field-widget";
import MarkdownEditor from "@/components/note-editor/markdown-editor";

/** Enough of MathLive's element for the bridge: a value, setValue, focus, and events. */
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

function mount(doc: string) {
  const onChange = vi.fn();
  const utils = render(<MarkdownEditor value={doc} onChange={onChange} />);
  const host = utils.getByTestId("markdown-editor");
  const view = EditorView.findFromDOM(host)!;
  return { ...utils, host, view, onChange };
}

function field(host: HTMLElement) {
  return host.querySelector("math-field") as (HTMLElement & { value: string }) | null;
}

function typeIntoField(host: HTMLElement, latex: string) {
  const element = field(host)!;
  element.value = latex;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressInField(host: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  field(host)!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
}

describe("MathFieldWidget bridge", () => {
  beforeAll(() => {
    if (!customElements.get("math-field")) {
      customElements.define("math-field", StubMathField);
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a region into a field holding its LaTeX, and edits flow into the document without history", () => {
    const doc = "Area $x^2$ here";
    const { host, view } = mount(doc);

    act(() => {
      view.dispatch({ effects: enterMath.of({ from: 5, to: 10 }) });
    });

    expect(view.state.field(mathSessionField)).toMatchObject({ from: 5, to: 10, display: false, originalLatex: "x^2" });
    expect(field(host)?.value).toBe("x^2");
    expect(host.querySelector(".cm-note-math")).toBeNull(); // no KaTeX for the open region

    act(() => typeIntoField(host, "x^3"));

    expect(view.state.doc.toString()).toBe("Area $x^3$ here");
    expect(undoDepth(view.state)).toBe(0);
    expect(view.state.field(mathSessionField)).toMatchObject({ contentFrom: 6, contentTo: 9 });
  });

  it("exiting commits one undo step, normalizes the LaTeX, and places the cursor after the region", () => {
    const { host, view } = mount("Area $x^2$ here");

    act(() => view.dispatch({ effects: enterMath.of({ from: 5, to: 10 }) }));
    act(() => typeIntoField(host, "√(y²)"));
    act(() => pressInField(host, "Escape"));

    expect(view.state.field(mathSessionField)).toBeNull();
    expect(field(host)).toBeNull();
    expect(view.state.doc.toString()).toBe("Area $\\sqrt{y^2}$ here");
    expect(undoDepth(view.state)).toBe(1);
    expect(view.state.selection.main.head).toBe("Area $\\sqrt{y^2}$".length);

    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe("Area $x^2$ here");
  });

  it("keeps the generator's $$ fence layout and lands on the next line after a display formula", () => {
    const doc = "Before\n\n$$\na^2\n$$\n\nAfter";
    const { host, view } = mount(doc);
    const from = doc.indexOf("$$");
    const to = doc.indexOf("$$", from + 2) + 2;

    act(() => view.dispatch({ effects: enterMath.of({ from, to }) }));
    expect(view.state.field(mathSessionField)?.display).toBe(true);

    act(() => typeIntoField(host, "b^2"));
    act(() => pressInField(host, "Enter"));

    expect(view.state.doc.toString()).toBe("Before\n\n$$\nb^2\n$$\n\nAfter");
    expect(view.state.selection.main.head).toBe("Before\n\n$$\nb^2\n$$\n".length);
  });

  it("removes the delimiters when a formula is left empty, so no stray $$ fence survives", () => {
    const { host, view } = mount("A $x$ B");

    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    act(() => typeIntoField(host, ""));
    act(() => pressInField(host, "Escape"));

    expect(view.state.doc.toString()).toBe("A  B");
    expect(view.state.selection.main.head).toBe(2);
  });

  it("Shift+Tab and move-out backward exit with the cursor before the region", () => {
    const { host, view } = mount("A $x$ B");

    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    act(() => pressInField(host, "Tab", { shiftKey: true }));
    expect(view.state.selection.main.head).toBe(2);

    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    act(() => {
      field(host)!.dispatchEvent(
        new CustomEvent("move-out", { detail: { direction: "forward" }, bubbles: true, cancelable: true }),
      );
    });
    expect(view.state.field(mathSessionField)).toBeNull();
    expect(view.state.selection.main.head).toBe(5);
  });

  it("clicking a rendered formula opens it", async () => {
    const { host, view } = mount("# Title\n\nArea $x^2$ here");
    const rendered = host.querySelector(".cm-note-math")!;
    expect(rendered).not.toBeNull();

    await act(async () => {
      rendered.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(view.state.field(mathSessionField)).toMatchObject({ originalLatex: "x^2" });
    expect(field(host)?.value).toBe("x^2");
  });

  it("the LaTeX toggle exposes a source textarea that writes back to the field and document", () => {
    const { host, view } = mount("A $x$ B");

    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    const toggle = host.querySelector<HTMLButtonElement>(".cm-note-mathfield-toggle")!;
    const source = host.querySelector<HTMLTextAreaElement>(".cm-note-mathfield-source")!;
    expect(source.hidden).toBe(true);

    act(() => toggle.click());
    expect(source.hidden).toBe(false);
    expect(source.value).toBe("x");

    act(() => {
      source.value = "\\frac{1}{2}";
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(field(host)?.value).toBe("\\frac{1}{2}");
    expect(view.state.doc.toString()).toBe("A $\\frac{1}{2}$ B");
  });
});
