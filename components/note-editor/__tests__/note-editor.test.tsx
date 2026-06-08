import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteDocument } from "@/lib/notes/types";

let latestConfig: {
  onChange?: () => void | Promise<void>;
} | null = null;
let lastRenderedDocument: NoteDocument | null = null;
let mockSavedDocument: NoteDocument = {
  time: 1,
  blocks: [],
};

class MockEditorJS {
  public isReady = Promise.resolve();

  public constructor(config: { onChange?: () => void | Promise<void> }) {
    latestConfig = config;
  }

  public async save() {
    return mockSavedDocument;
  }

  public async render(data: NoteDocument) {
    lastRenderedDocument = data;
  }

  public destroy() {}
}

vi.mock("@editorjs/editorjs", () => ({
  default: MockEditorJS,
}));

vi.mock("@editorjs/paragraph", () => ({
  default: class ParagraphTool {},
}));

vi.mock("@editorjs/header", () => ({
  default: class HeaderTool {},
}));

vi.mock("@editorjs/list", () => ({
  default: class ListTool {},
}));

vi.mock("@editorjs/quote", () => ({
  default: class QuoteTool {},
}));

vi.mock("@editorjs/image", () => ({
  default: class ImageTool {},
}));

vi.mock("mathlive", () => ({}));

import { NoteEditor } from "@/components/note-editor/note-editor";
import { emptyNoteDocument } from "@/lib/notes/types";

describe("NoteEditor", () => {
  beforeEach(() => {
    latestConfig = null;
    lastRenderedDocument = null;
    mockSavedDocument = {
      time: 1,
      blocks: [],
    };
    vi.useRealTimers();
  });

  it("emits markdown and document in the save payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<NoteEditor initialDocument={emptyNoteDocument} onSave={onSave} />);

    await waitFor(() => expect(latestConfig).not.toBeNull());
    expect(latestConfig?.onChange).toBeTypeOf("function");
    vi.useFakeTimers();

    mockSavedDocument = {
      time: 2,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Hello <strong>markdown</strong>",
          },
        },
      ],
    };

    await act(async () => {
      await latestConfig?.onChange?.();
      await vi.advanceTimersByTimeAsync(181);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      markdown: "Hello **markdown**",
      document: mockSavedDocument,
    });

    vi.useRealTimers();
  });

  it("coalesces overlapping autosaves so only the latest content is persisted after an in-flight save", async () => {
    let resolveFirstSave: (() => void) | null = null;
    const onSave = vi
      .fn<(content: { markdown: string; document: NoteDocument }) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    render(<NoteEditor initialDocument={emptyNoteDocument} onSave={onSave} />);

    await waitFor(() => expect(latestConfig).not.toBeNull());
    vi.useFakeTimers();

    mockSavedDocument = {
      time: 2,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "First version",
          },
        },
      ],
    };

    void latestConfig?.onChange?.();
    await vi.advanceTimersByTimeAsync(181);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.markdown).toBe("First version");

    mockSavedDocument = {
      time: 3,
      blocks: [
        {
          type: "paragraph",
          data: {
            text: "Second version",
          },
        },
      ],
    };

    void latestConfig?.onChange?.();
    await vi.advanceTimersByTimeAsync(181);

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]?.[0]?.markdown).toBe("Second version");
  });

  it("renders a new document when the parent swaps notes", async () => {
    const { rerender } = render(<NoteEditor initialDocument={emptyNoteDocument} />);

    await waitFor(() => expect(latestConfig).not.toBeNull());

    const replacementDocument: NoteDocument = {
      time: 10,
      blocks: [
        {
          id: "replacement",
          type: "paragraph",
          data: {
            text: "Replacement note",
          },
        },
      ],
    };

    rerender(<NoteEditor initialDocument={replacementDocument} />);

    await waitFor(() => expect(lastRenderedDocument).toEqual(replacementDocument));
  });
});
