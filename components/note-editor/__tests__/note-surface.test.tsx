import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/note-editor/note-editor", () => ({
  NoteEditor: ({
    initialDocument,
    onContentChange,
    onSave,
  }: {
    initialDocument: { blocks: Array<{ id?: string; type: string }> };
    onContentChange?: (content: {
      markdown: string;
      document: {
        time: number;
        blocks: unknown[];
      };
    }) => void;
    onSave?: (content: {
      markdown: string;
      document: {
        time: number;
        blocks: unknown[];
      };
    }) => Promise<void> | void;
  }) => {
    const firstBlock = initialDocument.blocks[0];
    const blockId = firstBlock?.id ?? "note-block";

    return (
      <div data-testid="mock-note-editor">
        <p>Mock Editor.js UI</p>
        <button
          type="button"
          aria-label={`Commit paragraph ${blockId}`}
          onClick={() => {
            const nextContent = {
              markdown: "Updated block",
              document: {
                time: 2,
                blocks: [
                  {
                    id: blockId,
                    type: "paragraph",
                    data: {
                      text: "Updated block",
                    },
                  },
                ],
              },
            };

            onContentChange?.(nextContent);
            void onSave?.(nextContent);
          }}
        >
          Commit paragraph
        </button>
        <button
          type="button"
          aria-label={`Commit paragraph and ordered list ${blockId}`}
          onClick={() => {
            const nextContent = {
              markdown: ["Updated block", "", "1. Inserted item"].join("\n"),
              document: {
                time: 3,
                blocks: [
                  {
                    id: blockId,
                    type: "paragraph",
                    data: {
                      text: "Updated block",
                    },
                  },
                  {
                    id: `${blockId}-list`,
                    type: "list",
                    data: {
                      style: "ordered",
                      items: [
                        {
                          content: "Inserted item",
                          items: [],
                        },
                      ],
                    },
                  },
                ],
              },
            };

            onContentChange?.(nextContent);
            void onSave?.(nextContent);
          }}
        >
          Commit paragraph and ordered list
        </button>
      </div>
    );
  },
}));

import { NoteSurface } from "@/components/note-editor/note-surface";

describe("NoteSurface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens directly in full-note editor mode and preserves Editor.js-added blocks", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [
            {
              id: "header-1",
              type: "header",
              data: {
                level: 2,
                text: "Hybrid Notes",
              },
            },
            {
              id: "paragraph-1",
              type: "paragraph",
              data: {
                text: "Original block",
              },
            },
          ],
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByTestId("mock-note-editor")).toBeInTheDocument();
    expect(screen.getByText("Mock Editor.js UI")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add block at end")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Commit paragraph header-1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls.at(-1)?.[0]?.markdown).toContain("Updated block");

    fireEvent.click(screen.getByLabelText(/Commit paragraph and ordered list/));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls.at(-1)?.[0]?.markdown).toContain("1. Inserted item");
  });

  it("resyncs the editor when the parent supplies a different note", () => {
    const { rerender } = render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [
            {
              id: "note-a",
              type: "paragraph",
              data: {
                text: "First note",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("Commit paragraph note-a")).toBeInTheDocument();

    rerender(
      <NoteSurface
        initialDocument={{
          time: 2,
          blocks: [
            {
              id: "note-b",
              type: "paragraph",
              data: {
                text: "Second note",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.queryByLabelText("Commit paragraph note-a")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Commit paragraph note-b")).toBeInTheDocument();
  });

  it("does not double-fire onContentChange when a save completes", async () => {
    const onContentChange = vi.fn();

    render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [
            {
              id: "header-1",
              type: "header",
              data: {
                level: 2,
                text: "Hybrid Notes",
              },
            },
          ],
        }}
        onContentChange={onContentChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Commit paragraph header-1"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(181);
    });

    expect(onContentChange).toHaveBeenCalledTimes(1);
  });

  it("renders markdown in read-only mode", () => {
    render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [
            {
              id: "link-note",
              type: "paragraph",
              data: {
                text: '<a href="https://example.com">Open link</a>',
              },
            },
          ],
        }}
        readOnly
      />,
    );

    expect(screen.queryByTestId("mock-note-editor")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open link" })).toBeInTheDocument();
  });

  it("stays in editor mode for empty notes", () => {
    render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [],
        }}
      />,
    );

    expect(screen.getByTestId("mock-note-editor")).toBeInTheDocument();
    expect(screen.queryByText("No note content yet.")).not.toBeInTheDocument();

    expect(screen.getByTestId("mock-note-editor")).toBeInTheDocument();
  });

  it("keeps the editor open when interacting outside the editor", () => {
    render(
      <NoteSurface
        initialDocument={{
          time: 1,
          blocks: [
            {
              id: "math-note",
              type: "math",
              data: {
                latex: "x^2",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("mock-note-editor")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);

    expect(screen.getByTestId("mock-note-editor")).toBeInTheDocument();
  });
});
