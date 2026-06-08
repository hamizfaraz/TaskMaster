import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoteRenderer } from "@/components/note-editor/note-renderer";

describe("NoteRenderer", () => {
  it("renders saved markdown with task lists, code, images, and math", () => {
    const { container } = render(
      <NoteRenderer
        markdown={[
          "# Sprint Notes",
          "",
          "- [x] Ship markdown",
          "- [ ] Remove old block rendering",
          "",
          "1. Work hard",
          "2. Play hard",
          "",
          "```",
          'console.log("done");',
          "```",
          "",
          "![Roadmap](https://example.com/roadmap.png)",
          "",
          "$$",
          "x^2 + y^2 = z^2",
          "$$",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Sprint Notes")).toBeInTheDocument();
    expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(container.querySelector("ol")).not.toBeNull();
    expect(screen.getByText("Work hard")).toBeInTheDocument();
    expect(container.querySelector('img[alt="Roadmap"]')).toHaveAttribute(
      "src",
      "https://example.com/roadmap.png",
    );
    expect(container.querySelector("pre code")?.textContent).toContain('console.log("done");');
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("shows an empty state when markdown is blank", () => {
    render(<NoteRenderer markdown="" />);

    expect(screen.getByText("No note content yet.")).toBeInTheDocument();
  });
});
