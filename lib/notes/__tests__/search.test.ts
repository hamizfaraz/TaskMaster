import { describe, expect, it } from "vitest";
import { parseQuery, searchNotes } from "@/lib/notes/search";

const notes = [
  { id: "1", title: "Minimum Spanning Trees", markdown: "Kruskal adds the cheapest edge that forms no cycle.\nPrim grows one tree." },
  { id: "2", title: "Disjoint Sets", markdown: "Union by size guarantees that tree depth never exceeds log N." },
  { id: "3", title: "Balance Sheet", markdown: "- **Assets**\n- ==Liabilities== and equity." },
  { id: "4", title: "Untitled", markdown: "" },
];

const ids = (query: string) => searchNotes(notes, query).map((m) => m.note.id);

describe("parseQuery", () => {
  it("splits on whitespace and lowercases", () => {
    expect(parseQuery("  Spanning   TREE ")).toEqual(["spanning", "tree"]);
  });

  it("keeps a quoted phrase together", () => {
    expect(parseQuery('"minimum spanning" tree')).toEqual(["minimum spanning", "tree"]);
  });

  it("returns nothing for an empty query", () => {
    expect(parseQuery("   ")).toEqual([]);
  });
});

describe("searchNotes", () => {
  it("returns nothing until something is typed", () => {
    expect(searchNotes(notes, "")).toEqual([]);
  });

  it("matches a title", () => {
    expect(ids("disjoint")).toEqual(["2"]);
  });

  it("matches body text", () => {
    expect(ids("kruskal")).toEqual(["1"]);
  });

  it("narrows as more terms are typed, rather than widening", () => {
    expect(ids("tree").sort()).toEqual(["1", "2"]);
    expect(ids("tree depth")).toEqual(["2"]);
  });

  it("puts title matches first", () => {
    // "sets" is in note 2's title; "size" only in its body. Both match note 2,
    // but a note matching in the title should lead.
    const results = searchNotes(notes, "tree");
    expect(results[0]?.note.id).toBe("1");
    expect(results[0]?.titleMatch).toBe(true);
  });

  it("sees through markdown syntax", () => {
    // ==Liabilities== and **Assets** should be found by their plain words.
    expect(ids("liabilities")).toEqual(["3"]);
    expect(ids("assets")).toEqual(["3"]);
  });

  it("returns a snippet of the line that matched, with the term located", () => {
    const [match] = searchNotes(notes, "cheapest");
    expect(match?.snippet).toBe("Kruskal adds the cheapest edge that forms no cycle.");
    const { start, length } = match!.snippetMatch!;
    expect(match!.snippet!.slice(start, start + length)).toBe("cheapest");
  });

  it("gives a title-only match no snippet", () => {
    const [match] = searchNotes(notes, "disjoint");
    expect(match?.titleMatch).toBe(true);
    expect(match?.snippet).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(ids("KRUSKAL")).toEqual(["1"]);
  });

  it("honours a limit", () => {
    expect(searchNotes(notes, "e", 1)).toHaveLength(1);
  });
});
