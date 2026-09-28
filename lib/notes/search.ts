/**
 * Search the notes the client already holds.
 *
 * The notes page sends every note's markdown to the browser — 89 KB across 58
 * notes — so this needs no endpoint, no index, and no round-trip. Filtering in
 * memory is instant and works offline. Postgres full-text is available if a
 * library ever outgrows that, and this module's shape is the seam where a
 * server-backed search would slot in.
 */

export type SearchableNote = {
  id: string;
  title: string;
  markdown: string;
};

export type NoteSearchMatch<T extends SearchableNote = SearchableNote> = {
  note: T;
  /** True when the title itself matched; those sort first. */
  titleMatch: boolean;
  /** The first body line containing a term, trimmed, or null for a title-only hit. */
  snippet: string | null;
  /** Where the term sits inside `snippet`, so the UI can mark it. */
  snippetMatch: { start: number; length: number } | null;
};

/** Split a query into terms. Quoted runs stay together. */
export function parseQuery(query: string): string[] {
  const terms: string[] = [];
  for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (match[1] ?? match[2] ?? "").trim().toLocaleLowerCase();
    if (term) {
      terms.push(term);
    }
  }
  return terms;
}

/** Strip the syntax a reader does not see, so `==term==` is found by "term". */
function searchableText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|~~|==)/g, "")
    .replace(/`{1,3}/g, "");
}

function firstLineWith(markdown: string, term: string) {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const index = searchableText(line).toLocaleLowerCase().indexOf(term);
    if (index !== -1) {
      const plain = searchableText(line);
      return { line: plain, start: index, length: term.length };
    }
  }
  return null;
}

/**
 * Notes matching every term, title hits first.
 *
 * Every term must appear somewhere in the title or body: typing more words
 * narrows rather than widens, which is what people expect from a search box.
 */
export function searchNotes<T extends SearchableNote>(
  notes: readonly T[],
  query: string,
  limit = 100,
): NoteSearchMatch<T>[] {
  const terms = parseQuery(query);
  if (terms.length === 0) {
    return [];
  }

  const matches: NoteSearchMatch<T>[] = [];

  for (const note of notes) {
    const title = note.title.toLocaleLowerCase();
    const body = searchableText(note.markdown).toLocaleLowerCase();

    if (!terms.every((term) => title.includes(term) || body.includes(term))) {
      continue;
    }

    const titleMatch = terms.some((term) => title.includes(term));
    // Prefer a snippet around a term the title did not already show.
    const bodyTerm = terms.find((term) => !title.includes(term)) ?? terms[0]!;
    const found = firstLineWith(note.markdown, bodyTerm);

    matches.push({
      note,
      titleMatch,
      snippet: found?.line ?? null,
      snippetMatch: found ? { start: found.start, length: found.length } : null,
    });
  }

  // Stable: title hits first, otherwise the order the caller supplied, which
  // is already newest-first.
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) =>
      a.match.titleMatch === b.match.titleMatch
        ? a.index - b.index
        : a.match.titleMatch
          ? -1
          : 1,
    )
    .slice(0, limit)
    .map((entry) => entry.match);
}
