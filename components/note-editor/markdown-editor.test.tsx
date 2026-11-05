import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tags } from "@lezer/highlight";
import MarkdownEditor from "@/components/note-editor/markdown-editor";
import { codeHighlightStyle, markdownHighlightStyle } from "@/components/note-editor/extensions/theme";

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

  it("renders generated highlights around formulas without exposing their markers", () => {
    const { host, view } = mount({ value: "# Energy\n\n==Energy is conserved.==\n\n==$E = mc^2$==" });

    expect(host.querySelector(".cm-note-math.cm-note-highlight .katex")).not.toBeNull();
    expect(host.querySelector(".cm-content")?.textContent).not.toContain("==");
    expect(view.state.doc.toString()).toContain("==$E = mc^2$==");
    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("Energy is") + 3 } });
    });
    expect(host.querySelector(".cm-content")?.textContent).not.toContain("==");
  });

  it("keeps a formula rendered after highlighting its selected definition", () => {
    const value = "Mass–energy equivalence: $E = mc^2$";
    const { host, view } = mount({ value });
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: value.length } });
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "H", code: "KeyH", keyCode: 72, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(view.state.doc.toString()).toBe(`==${value}==`);
    expect(host.querySelector(".cm-note-math.cm-note-highlight .katex")).not.toBeNull();
    expect(host.querySelector(".cm-content")?.textContent).not.toContain("$E");
  });

  it("toggles highlighting on selected text with Ctrl+Shift+H", () => {
    const { view } = mount({ value: "An important point." });
    act(() => {
      view.dispatch({ selection: { anchor: 3, head: 18 } });
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "H", code: "KeyH", keyCode: 72, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(view.state.doc.toString()).toBe("An ==important point==.");
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("important point");
    act(() => {
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "H", code: "KeyH", keyCode: 72, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(view.state.doc.toString()).toBe("An important point.");
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

describe("code fence highlighting", () => {
  // `markdown({ codeLanguages })` parses a fence into a real syntax tree, but
  // the Markdown style defines no code tags, so nothing painted that tree and
  // every fence rendered in one flat colour. The fix is a fallback style that
  // does cover them.
  const codeTags = [tags.keyword, tags.string, tags.number, tags.comment];

  it("the markdown style alone does not cover code tokens", () => {
    for (const tag of codeTags) {
      expect(markdownHighlightStyle.style([tag])).toBeNull();
    }
  });

  it("the fallback style does cover them", () => {
    for (const tag of codeTags) {
      expect(codeHighlightStyle.style([tag])).toBeTruthy();
    }
  });

  it("keeps markdown typography: headings stay owned by the markdown style", () => {
    expect(markdownHighlightStyle.style([tags.heading1])).toBeTruthy();
  });
});
