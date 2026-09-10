import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { BlockMenu, menuShiftFor } from "@/components/note-editor/block-menu";
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
      slashCommands.map((command) => `${command.displayLabel}${command.detail ?? ""}`),
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

describe("keeping the menu on screen", () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    cleanup();
  });

  it("slides up by exactly the overflow, and never past the top of the viewport", () => {
    expect(menuShiftFor({ top: 100, bottom: 400 }, 768)).toBe(0); // fits
    expect(menuShiftFor({ top: 700, bottom: 1000 }, 768)).toBe(240); // 1000 - (768 - 8)
    expect(menuShiftFor({ top: 20, bottom: 1000 }, 768)).toBe(12); // clamped to top - margin
    expect(menuShiftFor({ top: 0, bottom: 1000 }, 768)).toBe(0); // nothing left to give
  });

  it("applies the shift to the opened menu when it would run off the bottom", async () => {
    // jsdom has no layout: fake a menu that opens 700px down a 768px viewport.
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
    HTMLElement.prototype.getBoundingClientRect = function () {
      const isMenu = this.getAttribute("role") === "menu";
      return {
        top: isMenu ? 700 : 0,
        bottom: isMenu ? 1000 : 0,
        left: 0,
        right: 0,
        x: 0,
        y: 0,
        width: 0,
        height: isMenu ? 300 : 0,
        toJSON: () => ({}),
      } as DOMRect;
    };

    const { user } = mount("");
    await user.click(trigger());
    await nextFrames();

    expect(screen.getByRole("menu")).toHaveStyle({ transform: "translateY(-240px)" });
  });

  it("leaves the menu where it is when it already fits", async () => {
    const { user } = mount("");
    await user.click(trigger());
    await nextFrames();

    expect(screen.getByRole("menu").style.transform).toBe("");
  });
});
