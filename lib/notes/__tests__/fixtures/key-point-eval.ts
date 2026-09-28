/**
 * Evaluation set for key-point detection.
 *
 * Its job is to answer one question: does a more expensive detector beat the
 * free ranker in `lib/notes/detect-highlights.ts`? Without a fixed set and a
 * score, "the agent seems better" is an opinion.
 *
 * The cases are synthetic but modelled closely on real notes — flat element
 * lists, an equation sitting under its own heading, relationship bullets,
 * theorem-dense maths — so no coursework is checked into the repo. `weak`
 * marks the ones the ranker was measured to handle badly: it returns nothing
 * at all, or its top scores are near-tied so the order is arbitrary.
 *
 * `expected` holds distinctive fragments. A detector covers an expected point
 * when one of its suggestions contains that fragment, so wording differences
 * in how much surrounding text a detector grabs do not change the score.
 */
export type KeyPointCase = {
  name: string;
  /** True where the ranker was measured to be weak. */
  weak: boolean;
  markdown: string;
  /** Distinctive fragments of the points that should be surfaced. */
  expected: string[];
};

const lines = (...parts: string[]) => parts.join("\n");

export const keyPointCases: KeyPointCase[] = [
  {
    name: "flat element list with a definition at the end",
    weak: true,
    markdown: lines(
      "## Statement of Cash Flows - Elements",
      "",
      "- Cash Flows from Operating Activities",
      "- Cash Flows from Investing Activities",
      "- Cash Flows from Financing Activities",
      "",
      "| | |",
      "|---|---|",
      "| Operating | 87.5 |",
      "| Investing | (125.5) |",
      "",
      "- An in depth look at the detail of the cash account.",
      "- Reports inflows and outflows of cash during the accounting period.",
      "- Like the income statement, the statement of cash flows covers a period of time.",
    ),
    expected: [
      "Reports inflows and outflows of cash",
      "covers a period of time",
    ],
  },
  {
    name: "equation under its own heading",
    weak: true,
    markdown: lines(
      "## Statement of Shareholders' Equity - Elements",
      "",
      "- Common Stock",
      "- Retained Earnings",
      "",
      "| Common Stock | Retained Earnings |",
      "|---|---|",
      "| Balance | 55.7 |",
      "",
      "## Statement of Shareholders' Equity - Equation",
      "",
      "Beginning Retained Earnings + Net Income - Dividends = Ending Retained Earnings",
      "",
      "## Practice",
      "",
      "- Work through the example below.",
      "- Check your answer against the table.",
    ),
    expected: ["Beginning Retained Earnings + Net Income - Dividends"],
  },
  {
    name: "relationships between concepts, stated as plain bullets",
    weak: true,
    markdown: lines(
      "## Notes to the Financial Statements",
      "",
      "Notes provide supplemental information about the financial condition of a company.",
      "",
      "Three basic types of notes:",
      "",
      "1. Description of accounting rules applied.",
      "2. Presentation of additional detail about an item.",
      "3. Additional information about an item not on the statements.",
      "",
      "## Relationships between Financial Statements",
      "",
      "- Net income from the Income Statement increases Retained Earnings.",
      "- Ending Retained Earnings is carried onto the Balance Sheet.",
      "- The change in cash added to the beginning balance equals the ending cash balance.",
    ),
    expected: [
      "Notes provide supplemental information",
      "Net income from the Income Statement increases Retained Earnings",
    ],
  },
  {
    name: "near-tied propositions, all the same shape",
    weak: true,
    markdown: lines(
      "## Minimum Spanning Trees",
      "",
      "- A spanning tree includes every vertex of the graph.",
      "- A minimum spanning tree minimises total edge weight.",
      "- Prim's algorithm grows one tree from a start vertex.",
      "- Kruskal's algorithm adds the cheapest edge that forms no cycle.",
      "- Both are greedy and both are optimal for this problem.",
      "- A graph may have several distinct minimum spanning trees.",
      "- Edge weights must be comparable for the problem to be defined.",
      "- Disconnected graphs have a spanning forest rather than a tree.",
    ),
    expected: [
      "minimum spanning tree minimises total edge weight",
      "cheapest edge that forms no cycle",
    ],
  },
  {
    name: "prose definition naming a term inline",
    weak: false,
    markdown: lines(
      "## Bottom-Up Parsing",
      "",
      "- Produces the reverse of a rightmost derivation.",
      "- The parser must find the right-hand side, called the **handle**, in the sentential form.",
      "- Consider the grammar below.",
      "- The parse stack holds partial results.",
      "- Input is read left to right.",
      "- A shift moves a token onto the stack.",
    ),
    expected: ["handle"],
  },
  {
    name: "named theorem among anonymous propositions",
    weak: false,
    markdown: lines(
      "**Proposition.** The sequence is bounded above by two.",
      "",
      "**Theorem (Axiom of Archimedes).** For every real there is a larger natural.",
      "",
      "**Proposition.** The sequence is monotonic increasing.",
      "",
      "**Proposition.** The limit exists and is unique.",
      "",
      "**Proposition.** Every subsequence converges to it.",
    ),
    expected: ["Archimedes"],
  },
  {
    name: "result stated with a bound",
    weak: false,
    markdown: lines(
      "## Disjoint Sets",
      "",
      "- Union by size guarantees that tree depth will never exceed log N.",
      "- A node joins a sub-tree of equal or larger size.",
      "- The array is initialised to minus one.",
      "- Two operations are supported.",
      "- The backing store is a single array.",
      "- Kruskal uses the structure to detect cycles.",
    ),
    expected: ["Union by size guarantees"],
  },
  {
    name: "worked trace with nothing definitional in it",
    weak: false,
    markdown: lines(
      "## Breadth First Search - trace",
      "",
      "```",
      "void unweighted( Vertex s ) { }",
      "```",
      "",
      "| V | known | dv |",
      "|---|---|---|",
      "| V1 | F | 0 |",
      "| V2 | F | 0 |",
      "",
      "**V3 Dequeued**",
      "",
      "| V | known | dv |",
      "|---|---|---|",
      "| V1 | T | 1 |",
    ),
    // Correctly finding nothing is a result, not a failure.
    expected: [],
  },
];
