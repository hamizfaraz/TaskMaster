/**
 * Strip characters Postgres cannot store, before they reach an insert.
 *
 * A generated note failed to save with `22P05 unsupported Unicode escape
 * sequence — \u0000 cannot be converted to text`, from a NUL the model emitted
 * inside a `\begin{cases}` block. Both affected columns reject it: `markdown` is
 * text and `content` is jsonb, and neither can hold a NUL. The insert is the
 * last step of the pipeline, so the whole transcription had already been paid
 * for by the time it failed.
 *
 * Applied at every boundary where model output enters the pipeline, and again on
 * the shared write path, because the generated-notes insert does not go through
 * it.
 */

/**
 * C0 controls and DEL, minus the three that carry meaning in a note: tab,
 * newline, and carriage return (normalized to newline further along). Form feed
 * is handled separately because it means "page break" in scanned output.
 */
const UNSTORABLE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g;

/**
 * Make a model-produced string safe to store.
 *
 * Also repairs lone surrogates: a response truncated mid-character leaves half a
 * surrogate pair, which is not valid UTF-8 and which Postgres rejects for the
 * same reason as a NUL.
 */
export function sanitizeStoredText(value: string): string {
  return value
    .replace(/\f/g, "\n")
    .replace(UNSTORABLE_CONTROL_CHARS, "")
    .toWellFormed();
}
