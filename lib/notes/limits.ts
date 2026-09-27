/**
 * Size limits for note content.
 *
 * These live together because they are enforced in four places — the upload
 * route, the Gemini OCR call, the markdown write path, and the client's
 * pre-flight checks — and because two of them constrain each other. Scattering
 * them is how an upload cap ends up above the ceiling it is supposed to respect.
 */

/**
 * A document uploaded for OCR.
 *
 * The real corpus runs 0.07-1.84 MB, so this is roughly five times the largest
 * file anyone has actually uploaded. It is deliberately not raised to the
 * technical ceiling below: a bigger document costs more to transcribe and is
 * likelier to exceed the model's output limit, which is the failure this cap is
 * really protecting against.
 */
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The hard ceiling for sending a file to Gemini as inline bytes.
 *
 * Inline data is base64-encoded, inflating by 4/3 against a 20 MB total request
 * limit, so the raw file must stay under about 14.9 MB. Above this the Files API
 * is required instead. MAX_UPLOAD_FILE_BYTES must stay below this.
 */
export const MAX_INLINE_DOCUMENT_BYTES = 14 * 1024 * 1024;

/**
 * One note's markdown, in characters.
 *
 * The largest real note is 17.5k characters, so this allows about thirty times
 * that. It exists because nothing else bounded this path: a `.md` import read a
 * file of any size and posted it, and the write path only ever checked that the
 * markdown was a string. Beyond this the block parser, the editor's decorations
 * and the embedding call all degrade, so refusing is kinder than accepting.
 */
export const MAX_NOTE_MARKDOWN_CHARS = 512 * 1024;

/** Shown when a note's text exceeds MAX_NOTE_MARKDOWN_CHARS. */
export const NOTE_TOO_LARGE_MESSAGE =
  "That note is too long to save. Split it into smaller notes and try again.";

/** Thrown when content is well-formed but too large to accept. */
export class ContentTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentTooLargeError";
  }
}

/** Human-readable size for a user-facing message. */
export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
