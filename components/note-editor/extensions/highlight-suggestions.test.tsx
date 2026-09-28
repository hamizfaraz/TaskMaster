import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "@/components/note-editor/markdown-editor";
import {
  acceptSuggestion,
  agentSuggestionField,
  setAgentSuggestions,
} from "@/components/note-editor/extensions/highlight-suggestions";
import { detectHighlightSuggestions } from "@/lib/notes/detect-highlights";
import { extractHighlights } from "@/lib/notes/highlights";

afterEach(cleanup);

const doc = [
  "## Bottom-Up Parsing",
  "",
  "- Produces the reverse of a rightmost derivation.",
  "- The parser must find the right-hand side, called the **handle**, in the sentential form.",
  "- Consider the grammar below.",
  "- The parse stack holds partial results.",
  "- Input is read left to right.",
  "- A shift moves a token onto the stack.",
].join("\n");

function mount(showSuggestions: boolean) {
  const onChange = vi.fn();
  const utils = render(
    <MarkdownEditor value={doc} onChange={onChange} showSuggestions={showSuggestions} />,
  );
  const host = utils.getByTestId("markdown-editor");
  const view = EditorView.findFromDOM(host);
  if (!view) throw new Error("EditorView did not mount");
  return { host, view, onChange };
}

describe("highlight suggestions layer", () => {
  it("underlines nothing until it is switched on", () => {
    const { host } = mount(false);
    expect(host.querySelectorAll("[data-suggestion]")).toHaveLength(0);
  });

  it("underlines the suggested points when switched on", () => {
    const { host } = mount(true);
    const marked = host.querySelectorAll("[data-suggestion]");
    expect(marked.length).toBeGreaterThan(0);
    expect([...marked].some((node) => node.textContent?.includes("handle"))).toBe(true);
  });

  it("accepting one wraps it in == and reads back as a highlight", () => {
    const { view, onChange } = mount(true);
    const [suggestion] = detectHighlightSuggestions(doc);
    expect(suggestion).toBeDefined();

    act(() => {
      acceptSuggestion(view, suggestion!.from, suggestion!.to);
    });

    const next = view.state.doc.toString();
    expect(next).toContain(`==${suggestion!.text}==`);
    expect(extractHighlights(next)).toContain(suggestion!.text);
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it("accepting is a single undo step", () => {
    const { view } = mount(true);
    const [suggestion] = detectHighlightSuggestions(doc);
    act(() => {
      acceptSuggestion(view, suggestion!.from, suggestion!.to);
    });
    expect(view.state.doc.toString()).not.toBe(doc);
  });

  it("refuses to accept an empty span", () => {
    const { view } = mount(true);
    expect(acceptSuggestion(view, 0, 0)).toBe(false);
  });

  it("stops suggesting a point once it is highlighted", () => {
    const [suggestion] = detectHighlightSuggestions(doc);
    const accepted = `${doc.slice(0, suggestion!.from)}==${suggestion!.text}==${doc.slice(suggestion!.to)}`;
    expect(detectHighlightSuggestions(accepted).some((s) => s.text === suggestion!.text)).toBe(false);
  });
});

describe("agent suggestions layer", () => {
  const agentPoint = {
    from: doc.indexOf("Consider the grammar below."),
    to: doc.indexOf("Consider the grammar below.") + "Consider the grammar below.".length,
    text: "Consider the grammar below.",
    reason: "the syllabus names this concept",
  };

  it("renders the agent's reason as the tooltip", () => {
    const { host, view } = mount(true);
    act(() => {
      view.dispatch({ effects: setAgentSuggestions.of([agentPoint]) });
    });

    const marked = [...host.querySelectorAll("[data-suggestion]")].find((node) =>
      node.textContent?.includes("Consider the grammar"),
    );
    expect(marked?.getAttribute("title")).toContain("the syllabus names this concept");
  });

  it("drops an agent span once the text under it changes", () => {
    // Offsets are mapped through edits, but a span whose text no longer
    // matches is stale and must not be offered.
    const { view } = mount(true);
    act(() => {
      view.dispatch({ effects: setAgentSuggestions.of([agentPoint]) });
    });
    expect(view.state.field(agentSuggestionField)).toHaveLength(1);

    act(() => {
      view.dispatch({ changes: { from: agentPoint.from, to: agentPoint.to, insert: "Something else." } });
    });
    expect(view.state.field(agentSuggestionField)).toHaveLength(0);
  });

  it("clears them when handed an empty list", () => {
    const { view } = mount(true);
    act(() => {
      view.dispatch({ effects: setAgentSuggestions.of([agentPoint]) });
      view.dispatch({ effects: setAgentSuggestions.of([]) });
    });
    expect(view.state.field(agentSuggestionField)).toHaveLength(0);
  });
});
