import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { BlockMenu } from "@/components/note-editor/block-menu";
import { slashCommands } from "@/components/note-editor/extensions/slash-menu";
import MarkdownEditor, { type MarkdownEditorHandle } from "@/components/note-editor/markdown-editor";

/** The wiring NoteEditor does: the button applies commands through the editor handle. */
function Harness({ doc }: { doc: string }) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  return (
    <>
      <BlockMenu onPick={(command) => editorRef.current?.applyCommand(command)} />
      <MarkdownEditor editorRef={editorRef} value={doc} onChange={() => {}} />
    </>
  );
}

function mount(doc: string, cursor = doc.length) {
  const user = userEvent.setup();
  const utils = render(<Harness doc={doc} />);
  const view = EditorView.findFromDOM(utils.getByTestId("markdown-editor"))!;
  act(() => view.dispatch({ selection: { anchor: cursor } }));
  return { ...utils, user, view };
}

describe("BlockMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every block type the slash menu offers, and closes on Escape", async () => {
    const { user } = mount("");

    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: /block/i }));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(
      slashCommands.map((command) => `${command.label}${command.detail ?? ""}`),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("turns the current line into a heading, keeping the text", async () => {
    const { user, view } = mount("hello world", "hello".length);

    await user.click(screen.getByRole("button", { name: /block/i }));
    await user.click(screen.getByRole("menuitem", { name: /heading 1/i }));

    expect(view.state.doc.toString()).toBe("# hello world");
    expect(view.state.selection.main.head).toBe(2);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("inserts a code block on its own lines when the cursor follows text", async () => {
    const { user, view } = mount("some text");

    await user.click(screen.getByRole("button", { name: /block/i }));
    await user.click(screen.getByRole("menuitem", { name: /code block/i }));

    expect(view.state.doc.toString()).toBe("some text\n```\n\n```");
    expect(view.state.selection.main.head).toBe("some text\n```\n".length);
  });

  it("inserts a checklist marker on an empty line", async () => {
    const { user, view } = mount("");

    await user.click(screen.getByRole("button", { name: /block/i }));
    await user.click(screen.getByRole("menuitem", { name: /checklist/i }));

    expect(view.state.doc.toString()).toBe("- [ ] ");
  });

  it("supports arrow-key navigation between items", async () => {
    const { user } = mount("");

    await user.click(screen.getByRole("button", { name: /block/i }));
    const items = screen.getAllByRole("menuitem");
    items[0]!.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(items[2]);

    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(items[items.length - 1]); // wraps
  });
});
