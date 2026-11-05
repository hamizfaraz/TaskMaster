import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LatexMarkdown } from "@/components/math/latex-markdown";

afterEach(cleanup);

describe("LatexMarkdown", () => {
  it("highlights a formatted label and formula together without leaking markers", () => {
    const { container } = render(<LatexMarkdown markdown="==**Mass–energy equivalence:** $E = mc^2$==" />);
    const mark = container.querySelector("mark");
    expect(mark?.querySelector("strong")?.textContent).toBe("Mass–energy equivalence:");
    expect(mark?.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).not.toContain("==");
  });

  it("does not pair highlight markers across a newline", () => {
    const { container } = render(<LatexMarkdown markdown={"==first line\nsecond line=="} />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toContain("==");
  });

  it("renders ==highlight== as a <mark>", () => {
    // Without the remark plugin this showed literal equals signs everywhere
    // outside the editor: in flashcards, quizzes, and any note preview.
    const { container } = render(<LatexMarkdown markdown="the ==key idea== matters" />);
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("key idea");
    expect(container.textContent).toBe("the key idea matters");
  });

  it("does not highlight == inside code", () => {
    const { container } = render(<LatexMarkdown markdown="In C, `a == b` compares." />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("a == b");
  });

  it("still renders math and gfm alongside highlights", () => {
    const { container } = render(
      <LatexMarkdown markdown={"a ==marked== term and $x^2$\n\n- item"} />,
    );
    expect(container.querySelector("mark")?.textContent).toBe("marked");
    expect(container.querySelector("li")?.textContent).toBe("item");
  });
});
