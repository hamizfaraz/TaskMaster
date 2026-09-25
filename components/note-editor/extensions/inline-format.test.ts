import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { toggleBold, toggleHighlight, toggleItalic } from "@/components/note-editor/extensions/inline-format";
import { extractHighlights } from "@/lib/notes/highlights";

function run(doc: string, from: number, to: number, command: typeof toggleBold) {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: EditorSelection.single(from, to) }),
  });
  command(view);
  const result = { doc: view.state.doc.toString(), sel: view.state.selection.main };
  view.destroy();
  return result;
}

describe("inline formatting", () => {
  it("wraps a selection in bold and keeps it selected", () => {
    const { doc, sel } = run("make this bold", 5, 9, toggleBold);
    expect(doc).toBe("make **this** bold");
    expect(doc.slice(sel.from, sel.to)).toBe("this");
  });

  it("wraps a selection in italics", () => {
    expect(run("make this italic", 5, 9, toggleItalic).doc).toBe("make *this* italic");
  });

  it("unwraps when the markers already surround the selection", () => {
    const { doc } = run("make **this** bold", 7, 11, toggleBold);
    expect(doc).toBe("make this bold");
  });

  it("unwraps when the markers are inside the selection", () => {
    const { doc } = run("make **this** bold", 5, 13, toggleBold);
    expect(doc).toBe("make this bold");
  });

  it("puts the cursor between fresh markers when nothing is selected", () => {
    const { doc, sel } = run("start ", 6, 6, toggleBold);
    expect(doc).toBe("start ****");
    expect(sel.head).toBe(8);
    expect(sel.empty).toBe(true);
  });

  it("does not nest bold inside bold", () => {
    const once = run("word", 0, 4, toggleBold);
    expect(once.doc).toBe("**word**");
    const twice = run(once.doc, once.sel.from, once.sel.to, toggleBold);
    expect(twice.doc).toBe("word");
  });
});

describe("highlighting", () => {
  it("marks a selection and the extractor reads it back", () => {
    // The editor and lib/notes/highlights.ts have to agree, or a highlight the
    // user can see never reaches generation.
    const { doc } = run("the least upper bound axiom matters", 4, 27, toggleHighlight);
    expect(doc).toBe("the ==least upper bound axiom== matters");
    expect(extractHighlights(doc)).toEqual(["least upper bound axiom"]);
  });

  it("unmarks a highlight it already applied", () => {
    const once = run("key idea", 0, 8, toggleHighlight);
    expect(once.doc).toBe("==key idea==");
    expect(run(once.doc, once.sel.from, once.sel.to, toggleHighlight).doc).toBe("key idea");
  });

  it("marks text containing inline math", () => {
    const { doc } = run("recall the identity $e = mc^2$ now", 7, 30, toggleHighlight);
    expect(extractHighlights(doc)).toEqual(["the identity $e = mc^2$"]);
  });
});
