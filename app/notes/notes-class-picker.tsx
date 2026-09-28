import Link from "next/link";
import { FileText, Folder, Plus } from "lucide-react";

export type PickableClass = {
  id: string;
  title: string;
  courseCode: string | null;
  noteCount: number;
};

/**
 * Shown at `/notes` when no class has been chosen.
 *
 * Notes belong to a class, so the page cannot open "all notes" and cannot
 * guess. It used to fall back to whichever class sorted first, which filed
 * work into an arbitrary course without saying so. Choosing is now explicit:
 * every route into the workspace carries a `classId`.
 */
export function NotesClassPicker({
  classes,
  /** Carried through so "New note" from elsewhere still creates one after the class is picked. */
  createOnOpen = false,
}: {
  classes: PickableClass[];
  createOnOpen?: boolean;
}) {
  if (classes.length === 0) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <Folder className="mb-4 size-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-foreground">No classes yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Notes are filed under a class. Add one and its notes will live there.
          </p>
          <Link
            href="/classes"
            className="mt-4 inline-flex h-10 items-center rounded-[var(--radius-lg)] bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Go to classes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Choose a class</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {createOnOpen
            ? "Notes live inside a class. Pick one and the new note starts there."
            : "Notes live inside a class. Pick one to open its notes."}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min content-start gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((item) => (
          <Link
            key={item.id}
            href={`/notes?classId=${encodeURIComponent(item.id)}${createOnOpen ? "&new=1" : ""}`}
            className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-5 text-card-foreground shadow-[var(--shadow-card)] transition hover:border-border-strong hover:bg-surface-muted"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                {item.courseCode ? (
                  <span className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {item.courseCode}
                  </span>
                ) : null}
                <span className="mt-0.5 block font-semibold text-foreground">{item.title}</span>
              </span>
              <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="size-3.5" aria-hidden="true" />
              {item.noteCount} {item.noteCount === 1 ? "note" : "notes"}
            </span>
          </Link>
        ))}

        <Link
          href="/classes"
          className="flex items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-border p-5 text-sm text-muted-foreground transition hover:border-border-strong hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a class
        </Link>
      </div>
    </main>
  );
}
