import { act, cleanup, render } from "@testing-library/react";
import { undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { enterMath, mathSessionField, compoundElementBefore } from "@/components/note-editor/extensions/math-field-widget";
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

  it("does not close the session on a focusout whose relatedTarget is null while focus is still inside", async () => {
    // Firefox reports relatedTarget as null when MathLive moves focus into
    // its shadow-DOM sink; that used to tear the field down mid-focus.
    const { host, view } = mount("A $x$ B");
    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));

    const toggle = host.querySelector<HTMLButtonElement>(".cm-note-mathfield-toggle")!;
    toggle.focus(); // activeElement is inside the wrapper, as the shadow host would be
    expect(document.activeElement).toBe(toggle);

    await act(async () => {
      field(host)!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.state.field(mathSessionField)).not.toBeNull();
    expect(field(host)).not.toBeNull();
  });

  it("closes the session once focus has genuinely moved outside the widget", async () => {
    const { host, view } = mount("A $x$ B");
    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    act(() => typeIntoField(host, "y"));

    const outside = document.createElement("input");
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    await act(async () => {
      field(host)!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.state.field(mathSessionField)).toBeNull();
    expect(view.state.doc.toString()).toBe("A $y$ B");
    outside.remove();
  });

  it("never throws when the field is disposed before its deferred focus runs", async () => {
    // Simulate MathLive's disposed state: focus() throws like its
    // keyboardDelegate being undefined.
    const { host, view } = mount("A $x$ B");
    act(() => view.dispatch({ effects: enterMath.of({ from: 2, to: 5 }) }));
    const element = field(host)! as HTMLElement & { focus: () => void };
    element.focus = () => {
      throw new TypeError("can't access property \"focus\", this.keyboardDelegate is undefined");
    };

    expect(() => {
      element.dispatchEvent(new Event("mount"));
      host.querySelector<HTMLButtonElement>(".cm-note-mathfield-toggle")!.click(); // shows source
      host.querySelector<HTMLButtonElement>(".cm-note-mathfield-toggle")!.click(); // hides it → focusField()
    }).not.toThrow();
  });
});

describe("compoundElementBefore (NE-8)", () => {
  // Depth per offset, as MathLive's getElementInfo reports it: children come
  // before their parent, so a fraction at the root reads 0 1 1 1 1 0.
  const field = (depths: number[], position: number, selected = false) => ({
    getElementInfo: (offset: number) =>
      offset < 0 || offset >= depths.length ? undefined : { depth: depths[offset] },
    selection: { ranges: [[selected ? position - 1 : position, position] as [number, number]] },
    position,
  });

  it("spans the whole subtree of the element before the caret", () => {
    expect(compoundElementBefore(field([0, 1, 1, 1, 1, 0], 5))).toEqual([0, 5]); // \frac{a}{b}
    expect(compoundElementBefore(field([0, 0, 0, 1, 1, 1, 1, 0], 7))).toEqual([2, 7]); // a+\frac{a}{b}
    expect(compoundElementBefore(field([0, 0, 1, 1, 0], 4))).toEqual([1, 4]); // x^2 → just the ^2
    expect(compoundElementBefore(field([0, 1, 2, 2, 2, 2, 1, 1, 1, 0], 9))).toEqual([0, 9]); // nested fractions
  });

  it("leaves simple atoms, branch starts, selections, and the origin to MathLive", () => {
    expect(compoundElementBefore(field([0, 1, 1, 1, 1, 0, 0, 0], 7))).toBeNull(); // \frac{a}{b}+c, after c
    expect(compoundElementBefore(field([0, 1, 1, 1, 1, 0], 3))).toBeNull(); // start of the denominator
    expect(compoundElementBefore(field([0, 1, 1, 1, 1, 0], 1))).toBeNull(); // start of the numerator
    expect(compoundElementBefore(field([0, 1, 1, 1, 1, 0], 5, true))).toBeNull(); // a selection
    expect(compoundElementBefore(field([0], 0))).toBeNull();
  });

  it("is inert on an element without MathLive's API", () => {
    expect(compoundElementBefore({} as never)).toBeNull();
  });
});
