"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { cx } from "@/lib/utils";
import type { FlashcardDeck, FlashcardItem } from "@/lib/flashcards/types";

type FlashcardNoteOption = {
  id: string;
  title: string;
  hasEmbedding: boolean;
};

type FlashcardsClientProps = {
  notes: FlashcardNoteOption[];
  initialDecks: FlashcardDeck[];
};

type FlashcardView = "library" | "create" | "review" | "edit";
type CreateStep = "context" | "preview";

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }

  return payload;
}

function createLocalCardId() {
  if (globalThis.crypto?.randomUUID) {
    return `manual-${globalThis.crypto.randomUUID()}`;
  }

  return `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankCard(): FlashcardItem {
  return {
    id: createLocalCardId(),
    front: "",
    back: "",
    sourceNoteTitles: [],
    tags: [],
  };
}

function cloneDeck(deck: FlashcardDeck): FlashcardDeck {
  return {
    ...deck,
    cards: deck.cards.map((card) => ({
      ...card,
      sourceNoteTitles: [...card.sourceNoteTitles],
      tags: [...(card.tags ?? [])],
    })),
  };
}

function withCardCount(deck: FlashcardDeck): FlashcardDeck {
  return {
    ...deck,
    cardCount: deck.cards.length,
  };
}

function formatDeckDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function MarkdownText({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0 space-y-2 text-foreground", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1">{children}</ol>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function StatPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-border bg-transparent px-3 text-sm font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function DeckEditor({
  deck,
  disabled,
  onChange,
}: {
  deck: FlashcardDeck;
  disabled?: boolean;
  onChange: (deck: FlashcardDeck) => void;
}) {
  function updateTitle(title: string) {
    onChange(withCardCount({ ...deck, title }));
  }

  function updateCard(index: number, patch: Partial<FlashcardItem>) {
    onChange(
      withCardCount({
        ...deck,
        cards: deck.cards.map((card, cardIndex) =>
          cardIndex === index ? { ...card, ...patch } : card,
        ),
      }),
    );
  }

  function addCard() {
    onChange(
      withCardCount({ ...deck, cards: [...deck.cards, createBlankCard()] }),
    );
  }

  function removeCard(index: number) {
    if (deck.cards.length <= 1) {
      return;
    }

    onChange(
      withCardCount({
        ...deck,
        cards: deck.cards.filter((_, cardIndex) => cardIndex !== index),
      }),
    );
  }

  return (
    <div className="space-y-5">
      <label className="space-y-2 text-sm font-medium text-foreground">
        Deck name
        <Input
          value={deck.title}
          disabled={disabled}
          onChange={(event) => updateTitle(event.target.value)}
        />
      </label>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">Cards</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            leadingIcon={<Plus className="size-4" />}
            onClick={addCard}
          >
            Add card
          </Button>
        </div>

        <div className="space-y-4">
          {deck.cards.map((card, index) => (
            <div
              key={card.id}
              className="space-y-4 rounded-lg border border-border bg-surface-muted p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="outline">Card {index + 1}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || deck.cards.length <= 1}
                  leadingIcon={<Trash2 className="size-4" />}
                  onClick={() => removeCard(index)}
                >
                  Remove
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Front
                  <Textarea
                    className="min-h-32 resize-y"
                    value={card.front}
                    disabled={disabled}
                    onChange={(event) =>
                      updateCard(index, { front: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Back
                  <Textarea
                    className="min-h-32 resize-y"
                    value={card.back}
                    disabled={disabled}
                    onChange={(event) =>
                      updateCard(index, { back: event.target.value })
                    }
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm font-medium text-foreground">
                Tags
                <Input
                  value={(card.tags ?? []).join(", ")}
                  disabled={disabled}
                  onChange={(event) =>
                    updateCard(index, { tags: parseTags(event.target.value) })
                  }
                />
              </label>

              {card.sourceNoteTitles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {card.sourceNoteTitles.map((title) => (
                    <Badge key={`${card.id}-${title}`} variant="neutral">
                      {title}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FlashcardsClient({
  notes,
  initialDecks,
}: FlashcardsClientProps) {
  const embeddedNotes = useMemo(
    () => notes.filter((note) => note.hasEmbedding),
    [notes],
  );
  const [view, setView] = useState<FlashcardView>("library");
  const [createStep, setCreateStep] = useState<CreateStep>("context");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [cardCount, setCardCount] = useState(16);
  const [decks, setDecks] = useState<FlashcardDeck[]>(initialDecks);
  const [activeDeckId, setActiveDeckId] = useState(initialDecks[0]?.id ?? "");
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [draftDeck, setDraftDeck] = useState<FlashcardDeck | null>(null);
  const [editingDeck, setEditingDeck] = useState<FlashcardDeck | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);

  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? decks[0];
  const activeCard = activeDeck?.cards[activeCardIndex];
  const canGenerate =
    selectedNoteIds.length > 0 && embeddedNotes.length > 0 && !isGenerating;
  const canSaveDraft = Boolean(
    draftDeck?.title.trim() &&
    draftDeck.cards.every((card) => card.front.trim() && card.back.trim()),
  );
  const canSaveEdit = Boolean(
    editingDeck?.title.trim() &&
    editingDeck.cards.every((card) => card.front.trim() && card.back.trim()),
  );

  function toggleNote(noteId: string) {
    setSelectedNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId],
    );
  }

  function openLibrary() {
    setView("library");
    setCreateStep("context");
    setDraftDeck(null);
    setEditingDeck(null);
  }

  function openReview(deckId: string) {
    setActiveDeckId(deckId);
    setActiveCardIndex(0);
    setShowBack(false);
    setView("review");
  }

  function openCreate() {
    setView("create");
    setCreateStep("context");
    setDraftDeck(null);
  }

  function openEdit(deck: FlashcardDeck) {
    setEditingDeck(cloneDeck(deck));
    setView("edit");
  }

  function goToCard(index: number) {
    if (!activeDeck) {
      return;
    }

    setActiveCardIndex(
      Math.min(Math.max(index, 0), activeDeck.cards.length - 1),
    );
    setShowBack(false);
  }

  async function generatePreview() {
    setIsGenerating(true);
    try {
      const payload = await readJsonResponse<{ deck: FlashcardDeck }>(
        await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "generate",
            noteIds: selectedNoteIds,
            cardCount,
          }),
        }),
      );

      setDraftDeck(cloneDeck(payload.deck));
      setCreateStep("preview");
    } catch (generationError) {
      toast.error("Failed to generate flashcards", {
        description:
          generationError instanceof Error
            ? generationError.message
            : undefined,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraftDeck() {
    if (!draftDeck) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = await readJsonResponse<{ deck: FlashcardDeck }>(
        await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "save",
            title: draftDeck.title,
            sourceNoteIds: draftDeck.sourceNoteIds,
            cards: draftDeck.cards,
          }),
        }),
      );

      setDecks((current) => [payload.deck, ...current]);
      setSelectedNoteIds([]);
      setDraftDeck(null);
      setCreateStep("context");
      openReview(payload.deck.id);
    } catch (saveError) {
      toast.error("Failed to save flashcard deck", {
        description:
          saveError instanceof Error ? saveError.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEditedDeck() {
    if (!editingDeck) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = await readJsonResponse<{ deck: FlashcardDeck }>(
        await fetch("/api/flashcards", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: editingDeck.id,
            title: editingDeck.title,
            sourceNoteIds: editingDeck.sourceNoteIds,
            cards: editingDeck.cards,
          }),
        }),
      );

      setDecks((current) =>
        current.map((deck) =>
          deck.id === payload.deck.id ? payload.deck : deck,
        ),
      );
      setEditingDeck(null);
      openReview(payload.deck.id);
    } catch (saveError) {
      toast.error("Failed to update flashcard deck", {
        description:
          saveError instanceof Error ? saveError.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDeck(deckId: string) {
    if (!window.confirm("Delete this flashcard deck?")) {
      return;
    }

    setDeletingDeckId(deckId);
    try {
      await readJsonResponse<{ deletedDeckId: string }>(
        await fetch(`/api/flashcards?deckId=${encodeURIComponent(deckId)}`, {
          method: "DELETE",
        }),
      );

      setDecks((current) => current.filter((deck) => deck.id !== deckId));
      if (activeDeckId === deckId) {
        setActiveDeckId("");
        setActiveCardIndex(0);
      }
      openLibrary();
    } catch (deleteError) {
      toast.error("Failed to delete flashcard deck", {
        description:
          deleteError instanceof Error ? deleteError.message : undefined,
      });
    } finally {
      setDeletingDeckId(null);
    }
  }

  const totalCards = decks.reduce((total, deck) => total + deck.cards.length, 0);

  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden px-4 py-5 sm:px-6 lg:px-8"
    >
      {view !== "library" ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openLibrary}
          >
            My Flashcards
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "library" ? (
          <section className="flex h-full min-h-0 flex-col gap-5">
            <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-wrap gap-2">
                <StatPill>{decks.length} decks</StatPill>
                <StatPill>{totalCards} cards</StatPill>
              </div>
              <Button
                type="button"
                leadingIcon={<Plus className="size-4" />}
                onClick={openCreate}
              >
                Create flashcards
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface/70">
            {decks.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="flex max-w-sm flex-col items-center text-center">
                  <Brain className="mb-5 size-12 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    No saved decks
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Saved decks appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid h-full auto-rows-min grid-cols-1 content-start items-start gap-4 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
                {decks.map((deck) => {
                  const isMenuOpen = moreOpenId === deck.id;
                  return (
                    <div
                      key={deck.id}
                      role="button"
                      tabIndex={0}
                      className="relative cursor-pointer rounded-[var(--radius-xl)] border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] transition hover:border-border-strong hover:bg-surface-muted"
                      onClick={() => openReview(deck.id)}
                      onKeyDown={(e) => e.key === "Enter" && openReview(deck.id)}
                    >
                      <div className="flex items-start gap-3 p-5">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {deck.sourceNoteIds.length > 0 ? (
                              <Badge variant="accent">Generated</Badge>
                            ) : (
                              <Badge variant="neutral">Manual</Badge>
                            )}
                            <Badge variant="outline">
                              {deck.cards.length} cards
                            </Badge>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {deck.title}
                            </p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              Updated {formatDeckDate(deck.updatedAt)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoreOpenId(isMenuOpen ? null : deck.id);
                          }}
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </div>

                      {isMenuOpen ? (
                        <>
                          <div
                            className="fixed inset-0 z-[49]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoreOpenId(null);
                            }}
                          />
                          <div className="absolute right-2 top-11 z-[50] min-w-[120px] overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-[var(--shadow-card)]">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(deck);
                                setMoreOpenId(null);
                              }}
                            >
                              <Edit3 className="size-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                              disabled={deletingDeckId === deck.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoreOpenId(null);
                                void deleteDeck(deck.id);
                              }}
                            >
                              {deletingDeckId === deck.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                              Delete
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </section>
        ) : null}

        {view === "create" ? (
          <Card className="flex h-full min-h-0 flex-col">
            <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">
                  {createStep === "context" ? "Create Flashcards" : "Preview Deck"}
                </CardTitle>
                <CardDescription>
                  {createStep === "context"
                    ? "Choose note context."
                    : "Edit before saving."}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Badge variant={createStep === "context" ? "accent" : "outline"}>
                  Context
                </Badge>
                <Badge variant={createStep === "preview" ? "accent" : "outline"}>
                  Preview
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pb-5">
              {createStep === "context" ? (
                <>
                  <section className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-foreground">
                        Notes
                      </h2>
                      <Badge variant="outline" className="text-sm">
                        {selectedNoteIds.length} selected
                      </Badge>
                    </div>
                    <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                      {notes.length === 0 ? (
                        <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-muted-foreground">
                          Create or upload notes first.
                        </p>
                      ) : (
                        notes.map((note) => (
                          <label
                            key={note.id}
                            className={cx(
                              "flex min-h-20 cursor-pointer items-start gap-4 rounded-lg border border-border bg-surface px-4 py-4 text-sm transition",
                              note.hasEmbedding
                                ? "hover:border-border-strong hover:bg-surface-muted"
                                : "cursor-not-allowed opacity-60",
                              selectedNoteIds.includes(note.id)
                                ? "border-accent bg-accent-soft/60"
                                : "",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-[var(--accent)]"
                              checked={selectedNoteIds.includes(note.id)}
                              disabled={!note.hasEmbedding || isGenerating}
                              onChange={() => toggleNote(note.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-foreground">
                                {note.title}
                              </span>
                              <span className="mt-1 block text-sm text-muted-foreground">
                                {note.hasEmbedding
                                  ? "Embedding ready"
                                  : "Embedding required"}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </section>

                  <label className="max-w-xs shrink-0 space-y-2 text-sm font-medium text-foreground">
                    Cards
                    <Input
                      type="number"
                      min={4}
                      max={40}
                      value={cardCount}
                      disabled={isGenerating}
                      onChange={(event) =>
                        setCardCount(Number(event.target.value))
                      }
                    />
                  </label>

                  <div className="flex shrink-0 flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={!canGenerate}
                      leadingIcon={
                        isGenerating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )
                      }
                      onClick={generatePreview}
                    >
                      Generate preview
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isGenerating}
                      onClick={openLibrary}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : null}

              {createStep === "preview" && draftDeck ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <DeckEditor
                      deck={draftDeck}
                      disabled={isSaving}
                      onChange={setDraftDeck}
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={!canSaveDraft || isSaving}
                      leadingIcon={
                        isSaving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )
                      }
                      onClick={saveDraftDeck}
                    >
                      Save deck
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      leadingIcon={<ChevronLeft className="size-4" />}
                      onClick={() => setCreateStep("context")}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={openLibrary}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {view === "edit" && editingDeck ? (
          <Card className="flex h-full min-h-0 flex-col">
            <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Edit Flashcards</CardTitle>
                <CardDescription>
                  Deck name, card fronts, backs, and tags.
                </CardDescription>
              </div>
              <Badge variant="outline">{editingDeck.cards.length} cards</Badge>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pb-5">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DeckEditor
                  deck={editingDeck}
                  disabled={isSaving}
                  onChange={setEditingDeck}
                />
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={!canSaveEdit || isSaving}
                  leadingIcon={
                    isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )
                  }
                  onClick={saveEditedDeck}
                >
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  leadingIcon={<X className="size-4" />}
                  onClick={openLibrary}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {view === "review" ? (
          <Card className="flex h-full min-h-0 flex-col">
            <CardHeader className="shrink-0 gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{activeDeck?.title ?? "Deck workspace"}</CardTitle>
                <CardDescription>
                  {activeDeck
                    ? `${activeCardIndex + 1}/${activeDeck.cards.length} cards`
                    : "No deck selected."}
                </CardDescription>
              </div>
              {activeDeck ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leadingIcon={<Edit3 className="size-4" />}
                  onClick={() => openEdit(activeDeck)}
                >
                  Edit
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pb-5">
              {activeCard ? (
                <>
                  <button
                    type="button"
                    className="flex min-h-0 flex-1 flex-col justify-between rounded-lg border border-border bg-surface-muted p-6 text-left transition hover:border-border-strong"
                    onClick={() => setShowBack((value) => !value)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="accent">
                        {showBack ? "Back" : "Front"}
                      </Badge>
                      <Badge variant="outline">Flip</Badge>
                    </div>
                    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center py-8">
                      <MarkdownText
                        markdown={showBack ? activeCard.back : activeCard.front}
                        className="text-center text-xl font-medium leading-9"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeCard.tags?.map((tag) => (
                        <Badge
                          key={`${activeCard.id}-${tag}`}
                          variant="accent"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {activeCard.sourceNoteTitles.map((title) => (
                        <Badge key={title} variant="neutral">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeCardIndex === 0}
                      leadingIcon={<ChevronLeft className="size-4" />}
                      onClick={() => goToCard(activeCardIndex - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      leadingIcon={<RotateCcw className="size-4" />}
                      onClick={() => setShowBack((value) => !value)}
                    >
                      Flip
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        !activeDeck ||
                        activeCardIndex >= activeDeck.cards.length - 1
                      }
                      leadingIcon={<ChevronRight className="size-4" />}
                      onClick={() => goToCard(activeCardIndex + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface-muted">
                  <div className="flex flex-col items-center text-center">
                    <Brain className="mb-3 size-8 text-muted-foreground" />
                    <p className="font-semibold text-foreground">
                      No deck selected
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose a saved deck.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
