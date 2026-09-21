"use client";

import { useCallback, useState } from "react";
import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  Network,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MindMapCanvas } from "@/components/mind-map/mind-map-canvas";
import type { MindMapDetail, MindMapSummary } from "@/lib/mind-maps/types";
import { cx } from "@/lib/utils";

const MAX_GENERATION_NOTES = 12;

type NoteOption = {
  id: string;
  title: string;
  updatedAt: string;
  hasEmbedding: boolean;
};

type AssociationsClientProps = {
  initialMaps: MindMapSummary[];
  notes: NoteOption[];
  storageReady: boolean;
};

type View = "library" | "generate" | "editor";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }
  return payload as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function MapCard({
  map,
  isDeleting,
  onOpen,
  onDelete,
}: {
  map: MindMapSummary;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition hover:border-border-strong hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Network className="size-4" />
        </span>
        <button
          type="button"
          aria-label="Delete map"
          disabled={isDeleting}
          className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-danger-soft hover:text-danger group-hover:inline-flex disabled:opacity-60"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{map.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {map.nodeCount} topics · {map.edgeCount} connections
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Updated {formatDate(map.updatedAt)}</p>
      </div>
    </div>
  );
}

function MethodExplainer() {
  return (
    <Card className="shrink-0">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Share2 className="size-4" />
          </span>
          <CardTitle>How the associations method works</CardTitle>
        </div>
        <CardDescription>
          Associations learning ties new ideas to things you already know, so recalling one cues the
          others. Build a small map of related topics, then name <em>why</em> each pair connects —
          the act of labelling the link is what makes it stick.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
          <p className="font-medium text-foreground">1. Add topics</p>
          <p className="mt-1">Drop a node for each idea you want to remember.</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
          <p className="font-medium text-foreground">2. Connect them</p>
          <p className="mt-1">Drag from a topic&apos;s handle to another to draw a link.</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
          <p className="font-medium text-foreground">3. Name the link</p>
          <p className="mt-1">Label each connection (causes, example, contrast…) to define the relationship.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function NoteRow({
  note,
  selected,
  onToggle,
}: {
  note: NoteOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const disabled = !note.hasEmbedding;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        "flex w-full items-center gap-3 rounded-[var(--radius-xl)] border p-3 text-left transition",
        disabled
          ? "cursor-not-allowed border-border bg-surface-muted/40 opacity-60"
          : selected
            ? "border-accent bg-accent-soft"
            : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted",
      )}
    >
      <span
        className={cx(
          "flex size-5 shrink-0 items-center justify-center rounded-md border",
          selected ? "border-accent bg-accent text-accent-foreground" : "border-border-strong",
        )}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{note.title}</span>
        {disabled ? (
          <span className="block text-xs text-muted-foreground">No embedding yet — can’t be used</span>
        ) : null}
      </span>
    </button>
  );
}

export function AssociationsClient({ initialMaps, notes, storageReady }: AssociationsClientProps) {
  const [maps, setMaps] = useState<MindMapSummary[]>(initialMaps);
  const [view, setView] = useState<View>("library");
  const [activeMap, setActiveMap] = useState<MindMapDetail | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const openMap = useCallback(async (id: string) => {
    setOpeningId(id);
    const toastId = toast.loading("Opening map…", { duration: Infinity });
    try {
      const { map } = await request<{ map: MindMapDetail }>(`/api/mind-maps/${id}`);
      setActiveMap(map);
      setView("editor");
      toast.dismiss(toastId);
    } catch (error) {
      toast.error("Failed to open map", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setOpeningId(null);
    }
  }, []);

  const createMap = useCallback(async () => {
    setIsCreating(true);
    const toastId = toast.loading("Creating map…", { duration: Infinity });
    try {
      const { map } = await request<{ map: MindMapSummary }>("/api/mind-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled association map" }),
      });
      setMaps((curr) => [map, ...curr]);
      setActiveMap({ ...map, sourceText: null, nodes: [], edges: [] });
      setView("editor");
      setIsEditingTitle(true);
      toast.dismiss(toastId);
    } catch (error) {
      toast.error("Failed to create map", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsCreating(false);
    }
  }, []);

  const toggleNote = useCallback((id: string) => {
    setSelectedNoteIds((curr) => {
      if (curr.includes(id)) return curr.filter((value) => value !== id);
      if (curr.length >= MAX_GENERATION_NOTES) {
        toast.error(`You can select up to ${MAX_GENERATION_NOTES} notes`);
        return curr;
      }
      return [...curr, id];
    });
  }, []);

  const generateFromNotes = useCallback(async () => {
    if (selectedNoteIds.length === 0) return;
    setIsGenerating(true);
    const toastId = toast.loading("Generating map from notes…", { duration: Infinity });
    try {
      const { map } = await request<{ map: MindMapDetail }>("/api/mind-maps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds: selectedNoteIds }),
      });
      setMaps((curr) => [
        {
          id: map.id,
          title: map.title,
          nodeCount: map.nodes.length,
          edgeCount: map.edges.length,
          createdAt: map.createdAt,
          updatedAt: map.updatedAt,
        },
        ...curr,
      ]);
      setActiveMap(map);
      setSelectedNoteIds([]);
      setView("editor");
      toast.success("Map generated", { id: toastId });
    } catch (error) {
      toast.error("Failed to generate map", {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [selectedNoteIds]);

  const deleteMap = useCallback(
    async (id: string) => {
      setDeletingId(id);
      const snapshot = maps;
      setMaps((curr) => curr.filter((map) => map.id !== id));
      try {
        await request(`/api/mind-maps/${id}`, { method: "DELETE" });
        toast.success("Map deleted");
      } catch (error) {
        setMaps(snapshot);
        toast.error("Failed to delete map", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setDeletingId(null);
      }
    },
    [maps],
  );

  const renameMap = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      setIsEditingTitle(false);
      if (!activeMap || !trimmed || trimmed === activeMap.title) return;

      const previous = activeMap.title;
      const id = activeMap.id;
      setActiveMap((curr) => (curr ? { ...curr, title: trimmed } : curr));
      setMaps((curr) => curr.map((map) => (map.id === id ? { ...map, title: trimmed } : map)));
      try {
        await request(`/api/mind-maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
      } catch (error) {
        setActiveMap((curr) => (curr ? { ...curr, title: previous } : curr));
        setMaps((curr) => curr.map((map) => (map.id === id ? { ...map, title: previous } : map)));
        toast.error("Failed to rename map", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [activeMap],
  );

  if (!storageReady) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState
            eyebrow="Setup needed"
            title="Association maps aren’t ready yet"
            description="The mind-map tables haven’t been migrated. Run the latest database migration to start building association maps."
          />
        </div>
      </div>
    );
  }

  if (view === "editor" && activeMap) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={<ArrowLeft className="size-4" />}
            onClick={() => {
              setView("library");
              setActiveMap(null);
              setIsEditingTitle(false);
            }}
          >
            My association maps
          </Button>
          {isEditingTitle ? (
            <Input
              autoFocus
              defaultValue={activeMap.title}
              maxLength={120}
              className="h-9 max-w-xs"
              onKeyDown={(event) => {
                if (event.key === "Enter") renameMap(event.currentTarget.value);
                if (event.key === "Escape") setIsEditingTitle(false);
              }}
              onBlur={(event) => renameMap(event.target.value)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-2 rounded-md px-1 text-lg font-semibold text-foreground"
            >
              {activeMap.title}
              <Pencil className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <MindMapCanvas
            key={activeMap.id}
            mapId={activeMap.id}
            initialNodes={activeMap.nodes}
            initialEdges={activeMap.edges}
          />
        </div>
      </div>
    );
  }

  if (view === "generate") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leadingIcon={<ArrowLeft className="size-4" />}
            onClick={() => {
              setView("library");
              setSelectedNoteIds([]);
            }}
          >
            My association maps
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Generate from notes</h1>
        </div>

        <p className="shrink-0 text-sm text-muted-foreground">
          Pick the notes to map. The AI proposes the key topics and how they connect — you can then
          edit, relabel, and add your own associations.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {notes.length === 0 ? (
            <EmptyState
              eyebrow="No notes"
              title="No notes to generate from"
              description="Create and embed some notes first, then come back to generate an association map from them."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {notes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  selected={selectedNoteIds.includes(note.id)}
                  onToggle={() => toggleNote(note.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {selectedNoteIds.length} selected
          </span>
          <Button
            type="button"
            disabled={isGenerating || selectedNoteIds.length === 0}
            leadingIcon={
              isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )
            }
            onClick={generateFromNotes}
          >
            {isGenerating ? "Generating…" : "Generate map"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <MethodExplainer />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex h-8 w-fit items-center rounded-full border border-border bg-transparent px-3 text-sm font-medium text-muted-foreground">
              {maps.length} {maps.length === 1 ? "map" : "maps"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                leadingIcon={<Sparkles className="size-4" />}
                onClick={() => setView("generate")}
              >
                Generate from notes
              </Button>
              <Button
                type="button"
                disabled={isCreating}
                leadingIcon={
                  isCreating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )
                }
                onClick={createMap}
              >
                {isCreating ? "Creating…" : "New association map"}
              </Button>
            </div>
          </div>

          {maps.length === 0 ? (
            <div className="flex min-h-[220px] flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface/70 p-8">
              <div className="flex max-w-sm flex-col items-center text-center">
                <Network className="mb-4 size-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">No association maps yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first map to start connecting ideas.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {maps.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  isDeleting={deletingId === map.id}
                  onOpen={() => {
                    if (!openingId) openMap(map.id);
                  }}
                  onDelete={() => deleteMap(map.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
