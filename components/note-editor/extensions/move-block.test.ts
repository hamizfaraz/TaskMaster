import { EditorSelection, EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { blockAt, moveBlockDown, moveBlockUp } from "@/components/note-editor/extensions/move-block";

const doc = (text: string) => Text.of(text.split("\n"));

function run(text: string, cursorLine: number, command: typeof moveBlockUp) {
  const lines = text.split("\n");
  const anchor = lines.slice(0, cursorLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
  const view = new EditorView({
    state: EditorState.create({ doc: text, selection: EditorSelection.cursor(anchor) }),
  });
  const handled = command(view);
  const result = view.state.doc.toString();
  view.destroy();
  return { handled, doc: result };
}

describe("blockAt", () => {
  it("returns null for ordinary prose, so the line move still runs", () => {
    expect(blockAt(doc("just a sentence"), 0)).toBeNull();
  });

  it("covers a list item and everything nested under it", () => {
    const text = ["- parent", "  - child one", "  - child two", "- sibling"].join("\n");
    const range = blockAt(doc(text), 0)!;
    expect(text.slice(range.from, range.to)).toBe("- parent\n  - child one\n  - child two");
  });

  it("covers a whole fenced code block from inside it", () => {
    const text = ["```js", "const a = 1;", "const b = 2;", "```", "after"].join("\n");
    const inside = text.indexOf("const a");
    const range = blockAt(doc(text), inside)!;
    expect(text.slice(range.from, range.to)).toBe("```js\nconst a = 1;\nconst b = 2;\n```");
  });

  it("covers a display-math block", () => {
    const text = ["$$", "x = 1", "$$", "after"].join("\n");
    const range = blockAt(doc(text), text.indexOf("x = 1"))!;
    expect(text.slice(range.from, range.to)).toBe("$$\nx = 1\n$$");
  });

  it("covers a contiguous table", () => {
    const text = ["| a | b |", "|---|---|", "| 1 | 2 |", "", "after"].join("\n");
    const range = blockAt(doc(text), 0)!;
    expect(text.slice(range.from, range.to)).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
  });
});

describe("moving blocks", () => {
  it("moves a list item with its children past its sibling", () => {
    const text = ["- first", "- second", "  - nested", "- third"].join("\n");
    const { handled, doc: out } = run(text, 2, moveBlockUp);
    expect(handled).toBe(true);
    expect(out).toBe(["- second", "  - nested", "- first", "- third"].join("\n"));
  });

  it("moves a fenced block as a unit", () => {
    const text = ["intro", "", "```js", "code();", "```"].join("\n");
    const { handled, doc: out } = run(text, 3, moveBlockUp);
    expect(handled).toBe(true);
    expect(out).toBe(["```js", "code();", "```", "", "intro"].join("\n"));
  });

  it("moves down as well as up", () => {
    const text = ["- one", "- two"].join("\n");
    expect(run(text, 1, moveBlockDown).doc).toBe(["- two", "- one"].join("\n"));
  });

  it("declines at the edges rather than mangling the document", () => {
    const text = ["- only"].join("\n");
    expect(run(text, 1, moveBlockUp)).toEqual({ handled: false, doc: "- only" });
    expect(run(text, 1, moveBlockDown)).toEqual({ handled: false, doc: "- only" });
  });

  it("declines on prose so CodeMirror's line move takes over", () => {
    const text = ["first line", "second line"].join("\n");
    expect(run(text, 2, moveBlockUp).handled).toBe(false);
  });
});
