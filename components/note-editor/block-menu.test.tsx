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
import MarkdownEditor, {
  type ActiveLineRect,
  type MarkdownEditorHandle,
} from "@/components/note-editor/markdown-editor";

/** The wiring NoteEditor does: the gutter button applies commands through the editor handle. */
function Harness({
  doc,
  onActiveLine,
}: {
  doc: string;
  onActiveLine?: (rect: ActiveLineRect | null) => void;
}) {
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  return (
    <div style={{ position: "relative" }}>
      <BlockMenu top={0} height={24} onPick={(command) => editorRef.current?.applyCommand(command)} />
      <MarkdownEditor
        editorRef={editorRef}
        onActiveLineChange={onActiveLine}
        value={doc}
        onChange={() => {}}
      />
    </div>
  );
}

function mount(doc: string, cursor = doc.length, onActiveLine?: (rect: ActiveLineRect | null) => void) {
  const user = userEvent.setup();
  const utils = render(<Harness doc={doc} onActiveLine={onActiveLine} />);
  const view = EditorView.findFromDOM(utils.getByTestId("markdown-editor"))!;
  act(() => view.dispatch({ selection: { anchor: cursor } }));
  return { ...utils, user, view };
}

const trigger = () => screen.getByRole("button", { name: /insert block/i });

/** CodeMirror measures on the next frame; give it two to be safe. */
const nextFrames = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

describe("BlockMenu (gutter)", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every block type the slash menu offers, and closes on Escape", async () => {
    const { user } = mount("");

    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(trigger());

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(
      slashCommands.map((command) => `${command.label}${command.detail ?? ""}`),
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("turns the current line into a heading, keeping the text", async () => {
    const { user, view } = mount("hello world", "hello".length);

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /heading 1/i }));

    expect(view.state.doc.toString()).toBe("# hello world");
    expect(view.state.selection.main.head).toBe(2);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("inserts a code block on its own lines when the cursor follows text", async () => {
    const { user, view } = mount("some text");

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /code block/i }));

    expect(view.state.doc.toString()).toBe("some text\n```\n\n```");
    expect(view.state.selection.main.head).toBe("some text\n```\n".length);
  });

  it("inserts a checklist marker on an empty line", async () => {
    const { user, view } = mount("");

    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /checklist/i }));

    expect(view.state.doc.toString()).toBe("- [ ] ");
  });

  it("supports arrow-key navigation between items", async () => {
    const { user } = mount("");

    await user.click(trigger());
    const items = screen.getAllByRole("menuitem");
    items[0]!.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(items[2]);

    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(items[items.length - 1]); // wraps
  });

  it("is centred on the line it belongs to", () => {
    render(<BlockMenu top={100} height={30} onPick={() => {}} />);
    // (30 - 24) / 2 = 3px below the line's top edge
    expect(trigger().parentElement).toHaveStyle({ top: "103px" });
  });
});

describe("active line geometry", () => {
  afterEach(() => {
    cleanup();
  });

  it("reports the cursor line's position relative to the editor, and null when unmeasurable", async () => {
    const onActiveLine = vi.fn();
    const { view } = mount("first\nsecond", 0, onActiveLine);
    await nextFrames();

    // jsdom has no layout, so coordsAtPos is null: the gutter control hides.
    expect(onActiveLine).toHaveBeenLastCalledWith(null);

    // Simulate a laid-out line 150px down the editor, 24px tall.
    view.coordsAtPos = () => ({ top: 150, bottom: 174, left: 0, right: 0 });
    act(() => view.dispatch({ selection: { anchor: "first\n".length } }));
    await nextFrames();

    expect(onActiveLine).toHaveBeenLastCalledWith({ top: 150, height: 24 });
  });

  it("does not re-report an unchanged position", async () => {
    const onActiveLine = vi.fn();
    const { view } = mount("a\nb", 0, onActiveLine);
    view.coordsAtPos = () => ({ top: 10, bottom: 34, left: 0, right: 0 });
    act(() => view.dispatch({ selection: { anchor: 1 } }));
    await nextFrames();
    const calls = onActiveLine.mock.calls.length;

    act(() => view.dispatch({ selection: { anchor: 0 } })); // same measured rect
    await nextFrames();

    expect(onActiveLine.mock.calls.length).toBe(calls);
  });
});
