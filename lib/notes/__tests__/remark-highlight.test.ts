import { describe, expect, it } from "vitest";
import { remarkHighlight } from "@/lib/notes/remark-highlight";

type Node = { type: string; value?: string; children?: Node[]; data?: { hName?: string } };

const text = (value: string): Node => ({ type: "text", value });
const paragraph = (...children: Node[]): Node => ({ type: "root", children: [{ type: "paragraph", children }] });

function run(tree: Node) {
  remarkHighlight()(tree);
  return (tree.children?.[0]?.children ?? []) as Node[];
}

describe("remarkHighlight", () => {
  it("splits a highlight into a mark node", () => {
    const out = run(paragraph(text("the ==key idea== matters")));
    expect(out.map((node) => node.type)).toEqual(["text", "highlight", "text"]);
    expect(out[1]?.data?.hName).toBe("mark");
    expect(out[1]?.children?.[0]?.value).toBe("key idea");
    expect(out[0]?.value).toBe("the ");
    expect(out[2]?.value).toBe(" matters");
  });

  it("handles several highlights in one node", () => {
    const out = run(paragraph(text("==alpha== and ==beta==")));
    expect(out.filter((node) => node.type === "highlight").map((node) => node.children?.[0]?.value)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("leaves a node with no highlight untouched", () => {
    const node = text("plain prose");
    const out = run(paragraph(node));
    expect(out).toEqual([node]);
  });

  it("never touches code or math, which are not text nodes", () => {
    // This is what keeps `s[ root1 ] == s[ root2 ]` in a fence from becoming a
    // highlight: by the time this plugin runs, code and math carry a `value`
    // rather than `text` children.
    const code: Node = { type: "inlineCode", value: "a == b" };
    const math: Node = { type: "inlineMath", value: "a == b" };
    const out = run(paragraph(code, math));
    expect(out).toEqual([code, math]);
  });

  it("recurses into nested formatting", () => {
    const out = run(paragraph({ type: "strong", children: [text("a ==bold highlight== here")] }));
    expect(out[0]?.children?.map((node) => node.type)).toEqual(["text", "highlight", "text"]);
  });

  it("ignores an empty marker", () => {
    const out = run(paragraph(text("empty ==== marker")));
    expect(out.map((node) => node.type)).toEqual(["text"]);
  });
});
