import { describe, expect, it, vi } from "vitest";
import { MathBlockTool } from "@/components/note-editor/math-block-tool";

describe("MathBlockTool", () => {
  function createTool() {
    const insert = vi.fn();
    const getBlockIndex = vi.fn().mockReturnValue(3);

    const tool = new MathBlockTool({
      data: {
        latex: "x^2",
      },
      api: {
        blocks: {
          insert,
          getBlockIndex,
        },
      } as never,
      config: {},
      block: {
        id: "math-block",
      } as never,
      readOnly: false,
    });

    return {
      tool,
      insert,
      getBlockIndex,
    };
  }

  it("renders an isolated math field surface", () => {
    const { tool } = createTool();

    const rendered = tool.render();

    expect(rendered.contentEditable).toBe("false");
    expect(rendered.querySelector("math-field")).not.toBeNull();
  });

  it("keeps math field events from bubbling to surrounding handlers", () => {
    const { tool } = createTool();

    const rendered = tool.render();
    const mathField = rendered.querySelector("math-field");

    expect(mathField).not.toBeNull();

    const keydownListener = vi.fn();
    const pointerListener = vi.fn();

    document.body.append(rendered);
    document.body.addEventListener("keydown", keydownListener);
    document.body.addEventListener("pointerdown", pointerListener);

    mathField?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    mathField?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(keydownListener).not.toHaveBeenCalled();
    expect(pointerListener).not.toHaveBeenCalled();
  });

  it("keeps plain enter inside the math block", () => {
    const { tool, insert, getBlockIndex } = createTool();
    const rendered = tool.render();
    const mathField = rendered.querySelector("math-field");

    expect(mathField).not.toBeNull();

    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    mathField?.dispatchEvent(enterEvent);

    expect(getBlockIndex).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a paragraph block after the math block on shift enter", () => {
    const { tool, insert, getBlockIndex } = createTool();
    const rendered = tool.render();
    const mathField = rendered.querySelector("math-field");

    expect(mathField).not.toBeNull();

    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      shiftKey: true,
    });

    mathField?.dispatchEvent(enterEvent);

    expect(getBlockIndex).toHaveBeenCalledWith("math-block");
    expect(insert).toHaveBeenCalledWith("paragraph", { text: "<br>" }, undefined, 4, true);
    expect(enterEvent.defaultPrevented).toBe(true);
  });

  it("saves normalized LaTeX from typed math", () => {
    const { tool } = createTool();
    const rendered = tool.render();
    const mathField = rendered.querySelector("math-field") as HTMLElement & {
      value: string;
    };

    mathField.value = "√(x²)";

    expect(tool.save()).toEqual({ latex: "\\sqrt{x^2}" });
  });
});
