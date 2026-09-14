import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { slashCommands, slashSource } from "@/components/note-editor/extensions/slash-menu";

function contextAt(doc: string, pos = doc.length, explicit = false) {
  return new CompletionContext(EditorState.create({ doc }), pos, explicit);
}

function run(doc: string, label: string, pos = doc.length) {
  const view = new EditorView({ state: EditorState.create({ doc }) });
  const result = slashSource(new CompletionContext(view.state, pos, false));
  if (!result) {
    throw new Error("slash menu did not open");
  }
  const command = slashCommands.find((option) => option.displayLabel === label)!;
  const apply = command.apply as (view: EditorView, c: typeof command, from: number, to: number) => void;
  apply(view, command, result.from, pos);
  const out = { doc: view.state.doc.toString(), cursor: view.state.selection.main.head };
  view.destroy();
  return out;
}

describe("slashSource", () => {
  it("opens on a slash at line start or after whitespace, filtered by the typed query", () => {
    expect(slashSource(contextAt("/"))?.from).toBe(0);
    expect(slashSource(contextAt("hello /tab"))?.from).toBe(6);
    expect(slashSource(contextAt("some text\n/hea"))?.from).toBe(10);
  });

  it("stays closed mid-word, inside code, and inside math", () => {
    expect(slashSource(contextAt("a/b"))).toBeNull();
    expect(slashSource(contextAt("```\n/\n```", 5))).toBeNull();
    expect(slashSource(contextAt("$x /y$", 4))).toBeNull();
  });

  it("offers every block type from the requirements", () => {
    const labels = slashCommands.map((command) => command.displayLabel);
    for (const expected of [
      "Text", "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list",
      "Checklist", "Quote", "Code block", "Table", "Image", "Divider", "Math block", "Inline math",
    ]) {
      expect(labels).toContain(expected);
    }
  });
});

describe("slash commands", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("turns the current line into a heading, replacing any existing marker", () => {
    expect(run("- item /h", "Heading 2")).toEqual({ doc: "## item ", cursor: 3 });
    expect(run("### old /", "Text")).toEqual({ doc: "old ", cursor: 0 });
    expect(run("  /", "Checklist")).toEqual({ doc: "  - [ ] ", cursor: 8 });
  });

  it("inserts block snippets in place of a bare slash line and lands the cursor inside", () => {
    expect(run("/", "Code block")).toEqual({ doc: "```\n\n```", cursor: 4 });
    expect(run("/", "Divider")).toEqual({ doc: "---", cursor: 3 });
    expect(run("/", "Table")).toEqual({
      doc: "| Column | Column |\n| --- | --- |\n|  |  |",
      cursor: 2,
    });
  });

  it("breaks out to a new line when the slash follows other text", () => {
    expect(run("intro /", "Math block")).toEqual({ doc: "intro \n$$\n\n$$", cursor: 10 });
  });

  it("inserts inline math and an image template at the cursor", () => {
    expect(run("say /", "Inline math")).toEqual({ doc: "say $$", cursor: 5 });
    expect(run("see /", "Image")).toEqual({ doc: "see ![alt](https://)", cursor: 19 });
  });
});
