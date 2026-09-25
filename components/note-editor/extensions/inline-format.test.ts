import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { toggleBold, toggleItalic } from "@/components/note-editor/extensions/inline-format";

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
