import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "@/components/note-editor/markdown-editor";

const sample = [
  "# Primes",
  "",
  "The area is $A = \\pi r^2$ and **bold** text.",
  "",
  "- [x] done",
  "- todo",
  "",
  "$$",
  "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
  "$$",
  "",
  "==important== and `$not math$`",
].join("\n");

function mount(props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  const onChange = vi.fn();
  const utils = render(<MarkdownEditor value={sample} onChange={onChange} {...props} />);
  const host = utils.getByTestId("markdown-editor");
  const view = EditorView.findFromDOM(host);
  if (!view) {
    throw new Error("EditorView did not mount");
  }
  return { ...utils, host, view, onChange };
}

describe("MarkdownEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts a real CodeMirror view holding the markdown verbatim", () => {
    const { view } = mount();

    expect(view.state.doc.toString()).toBe(sample);
  });

  it("renders inactive math as KaTeX and hides syntax off the active line", () => {
    const { host, view } = mount();

    // Cursor starts on line 1 (the heading), so everything else is inactive.
    expect(view.state.selection.main.head).toBe(0);
    expect(host.querySelectorAll(".cm-note-math").length).toBe(2); // inline + display
    expect(host.querySelector(".cm-note-math .katex")).not.toBeNull();
    expect(host.querySelectorAll(".cm-note-bullet").length).toBe(1); // "- todo" (the task line gets a checkbox)
    expect(host.querySelectorAll(".cm-note-checkbox").length).toBe(1);
    expect(host.querySelector(".cm-note-highlight")).not.toBeNull();
    // The `$not math$` inside inline code must not become a widget: 2 widgets total, counted above.
  });

  it("reveals a math region's source when the selection touches it", () => {
    const { host, view } = mount();
    const inlineStart = sample.indexOf("$A = ");

    act(() => {
      view.dispatch({ selection: { anchor: inlineStart + 1 } });
    });

    // Only the display formula stays rendered now.
    expect(host.querySelectorAll(".cm-note-math").length).toBe(1);
    expect(host.querySelector(".cm-note-math-display")).not.toBeNull();
  });

  it("reports edits through onChange with the full document", () => {
    const { view, onChange } = mount();

    act(() => {
      view.dispatch({ changes: { from: sample.length, insert: "\n\nNew line" } });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(`${sample}\n\nNew line`);
  });

  it("applies an external value only when it differs from the document", () => {
    const onChange = vi.fn();
    const { rerender, getByTestId } = render(<MarkdownEditor value={sample} onChange={onChange} />);
    const view = EditorView.findFromDOM(getByTestId("markdown-editor"))!;

    rerender(<MarkdownEditor value={sample} onChange={onChange} />);
    expect(view.state.doc.toString()).toBe(sample);
    expect(onChange).not.toHaveBeenCalled(); // an identical value never round-trips through onChange

    rerender(<MarkdownEditor value="Switched note" onChange={onChange} />);
    expect(view.state.doc.toString()).toBe("Switched note");
  });

  it("source mode shows raw markdown with no widgets", () => {
    const { host, rerender, onChange } = mount();
    expect(host.querySelectorAll(".cm-note-math").length).toBe(2);

    rerender(<MarkdownEditor value={sample} onChange={onChange} sourceMode />);

    expect(host.querySelectorAll(".cm-note-math").length).toBe(0);
    expect(host.querySelectorAll(".cm-note-bullet").length).toBe(0);
  });
});
