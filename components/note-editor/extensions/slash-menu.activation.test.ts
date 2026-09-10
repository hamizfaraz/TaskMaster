import { acceptCompletion, completionStatus, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/extensions/mathlive-loader", () => ({
  loadMathLive: () => Promise.resolve(),
}));

import { slashCommands, slashMenu } from "@/components/note-editor/extensions/slash-menu";

/**
 * These go through CodeMirror's real `autocompletion()` — unlike the unit
 * tests that call the source directly — because that is where the menu
 * silently died before: the result's `from` sits on the slash, so CM's own
 * filter compared labels against "/query" and matched nothing.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(doc: string) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [slashMenu()] }),
  });
  view.focus();
  return view;
}

async function type(view: EditorView, text: string) {
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    userEvent: "input.type",
  });
  await wait(220); // activateOnTypingDelay (100ms) + source resolution
}

const labels = (view: EditorView) => currentCompletions(view.state).map((option) => option.displayLabel ?? option.label);

describe("slash menu activation through CodeMirror", () => {
  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    view = null;
  });

  it("opens on a slash with every command, narrows as the query is typed, and closes on no match", async () => {
    view = mount("");
    await type(view, "/");
    expect(completionStatus(view.state)).toBe("active");
    expect(labels(view)).toEqual(slashCommands.map((command) => command.displayLabel));

    await type(view, "hea");
    expect(labels(view)).toEqual(["Heading 1", "Heading 2", "Heading 3"]);

    await type(view, "zz");
    expect(completionStatus(view.state)).toBeNull();
  });

  it("matches label subsequences and stays closed mid-word", async () => {
    view = mount("");
    await type(view, "/hd1");
    expect(labels(view)).toEqual(["Heading 1"]);
    view.destroy();

    view = mount("word");
    await type(view, "/");
    expect(completionStatus(view.state)).toBeNull();
  });

  it("opens on an explicit request too", async () => {
    view = mount("/ta");
    startCompletion(view);
    await wait(220);
    expect(labels(view)).toEqual(["Table"]);
  });

  it("accepting a command applies it through CodeMirror", async () => {
    view = mount("");
    await type(view, "/hea");
    expect(acceptCompletion(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("# ");
    expect(view.state.selection.main.head).toBe(2);
    expect(completionStatus(view.state)).toBeNull();
  });
});
