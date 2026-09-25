import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LatexMarkdown } from "@/components/math/latex-markdown";

afterEach(cleanup);

describe("LatexMarkdown", () => {
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
