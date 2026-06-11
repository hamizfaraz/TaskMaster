import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlashcardDeck } from "@/lib/flashcards/types";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <>{children}</>,
}));

vi.mock("rehype-katex", () => ({
  default: () => null,
}));

vi.mock("remark-gfm", () => ({
  default: () => null,
}));

vi.mock("remark-math", () => ({
  default: () => null,
}));

import { FlashcardsClient } from "@/app/flashcards/flashcards-client";

const notes = [
  {
    id: "note-1",
    title: "Lecture One",
    hasEmbedding: true,
  },
  {
    id: "note-2",
    title: "Draft Note",
    hasEmbedding: false,
  },
];

function deck(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: "deck-1",
    title: "Biology deck",
    sourceNoteIds: ["note-1"],
    cards: [
      {
        id: "card-1",
        front: "What is mitosis?",
        back: "Cell division.",
        sourceNoteTitles: ["Lecture One"],
        tags: ["cells"],
      },
    ],
    cardCount: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return {
    ok: init?.status ? init.status < 400 : true,
    status: init?.status ?? 200,
    json: async () => payload,
  } as Response;
}

describe("FlashcardsClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps My Flashcards focused on saved deck management", () => {
    render(<FlashcardsClient notes={notes} initialDecks={[deck()]} />);

    expect(screen.getByRole("heading", { name: "My Flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biology deck" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Lecture One/ })).not.toBeInTheDocument();
  });

  it("generates an editable preview before saving a new deck", async () => {
    const user = userEvent.setup();
    const generatedDeck = deck({
      id: "draft-1",
      title: "Generated deck",
      cards: [
        {
          id: "generated-card",
          front: "Generated front",
          back: "Generated back",
          sourceNoteTitles: ["Lecture One"],
          tags: [],
        },
      ],
    });
    const savedDeck = deck({
      id: "deck-2",
      title: "Edited deck",
      cards: [
        {
          id: "generated-card",
          front: "Edited front",
          back: "Generated back",
          sourceNoteTitles: ["Lecture One"],
          tags: ["core"],
        },
      ],
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ deck: generatedDeck, saved: false }))
      .mockResolvedValueOnce(jsonResponse({ deck: savedDeck }, { status: 201 }));

    render(<FlashcardsClient notes={notes} initialDecks={[]} />);

    await user.click(screen.getByRole("button", { name: "Create flashcards" }));
    await user.click(screen.getByRole("checkbox", { name: /Lecture One/ }));
    await user.clear(screen.getByLabelText("Cards"));
    await user.type(screen.getByLabelText("Cards"), "4");
    await user.click(screen.getByRole("button", { name: /Generate preview/ }));

    expect(await screen.findByDisplayValue("Generated deck")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Deck name"));
    await user.type(screen.getByLabelText("Deck name"), "Edited deck");
    await user.clear(screen.getByLabelText("Front"));
    await user.type(screen.getByLabelText("Front"), "Edited front");
    await user.type(screen.getByLabelText("Tags"), "core");
    await user.click(screen.getByRole("button", { name: /Save deck/ }));

    await screen.findByRole("heading", { name: "Edited deck" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      mode: "generate",
      noteIds: ["note-1"],
      cardCount: 4,
    });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({
      mode: "save",
      title: "Edited deck",
      cards: [
        {
          front: "Edited front",
          back: "Generated back",
          tags: ["core"],
        },
      ],
    });
  });

  it("edits saved deck metadata and individual cards", async () => {
    const user = userEvent.setup();
    const updatedDeck = deck({
      title: "Renamed deck",
      cards: [
        {
          id: "card-1",
          front: "What is mitosis?",
          back: "Updated back",
          sourceNoteTitles: ["Lecture One"],
          tags: ["exam"],
        },
      ],
    });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ deck: updatedDeck }));

    render(<FlashcardsClient notes={notes} initialDecks={[deck()]} />);

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.clear(screen.getByLabelText("Deck name"));
    await user.type(screen.getByLabelText("Deck name"), "Renamed deck");
    await user.clear(screen.getByLabelText("Back"));
    await user.type(screen.getByLabelText("Back"), "Updated back");
    await user.clear(screen.getByLabelText("Tags"));
    await user.type(screen.getByLabelText("Tags"), "exam");
    await user.click(screen.getByRole("button", { name: /Save changes/ }));

    await screen.findByRole("heading", { name: "Renamed deck" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/flashcards",
      expect.objectContaining({
        method: "PATCH",
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      deckId: "deck-1",
      title: "Renamed deck",
      cards: [
        {
          back: "Updated back",
          tags: ["exam"],
        },
      ],
    });
  });

  it("deletes decks from the library after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ deletedDeckId: "deck-1" }));

    render(<FlashcardsClient notes={notes} initialDecks={[deck()]} />);

    await user.click(screen.getByRole("button", { name: /Delete/ }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Biology deck" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("No flashcard decks")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/flashcards?deckId=deck-1", { method: "DELETE" });
  });
});
