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

/**
 * A sanity cap on reading an image into memory to inline it.
 *
 * Not the real constraint — `dataUrlChars` and the note's remaining room are.
 * This only stops a 50 MB file being base64-encoded in the browser before
 * anything can object to its size.
 */
export const MAX_INLINE_IMAGE_BYTES = 1024 * 1024;

/**
 * Characters a file costs when inlined as a `data:` URL.
 *
 * Base64 is 4 characters per 3 bytes, plus the `data:<mime>;base64,` prefix.
 * This is the number that matters: an inlined image is stored inside the note's
 * markdown, so it spends the note's character budget.
 *
 * The caps used to disagree. The image limit was a flat 2 MB while a note was
 * capped at MAX_NOTE_MARKDOWN_CHARS, so a 2 MB paste was accepted and became
 * roughly 2.7M characters — five times what a note may hold. The paste
 * succeeded and every save afterwards failed, which is worse than refusing the
 * paste, because the work was already lost by the time anything said so.
 */
export function dataUrlChars(bytes: number, mimeType: string): number {
  return `data:${mimeType};base64,`.length + Math.ceil(bytes / 3) * 4;
}

/**
 * Room left in a note of `currentChars` for one more inlined file.
 *
 * Checked against the note rather than against a per-image ceiling, because a
 * per-image ceiling cannot stop two acceptable images summing past the limit.
 */
export function remainingNoteChars(currentChars: number): number {
  return Math.max(0, MAX_NOTE_MARKDOWN_CHARS - currentChars);
}

/**
 * How long one generation run may take, including retries.
 *
 * Must stay below the upload route's `maxDuration`, with room left for the
 * database insert and the response after the model calls finish. The route is
 * killed at its limit, so a budget above it would trade an error the caller can
 * read for a silent hang.
 */
export const GENERATION_BUDGET_MS = 240_000;

/** The upload route's `maxDuration`, in seconds. Mirrored here to be asserted. */
export const UPLOAD_MAX_DURATION_SECONDS = 300;

/**
 * Time a retry needs after its wait to be worth scheduling.
 *
 * A retry started with no room to finish spends the wait and still returns
 * nothing, which is worse than failing immediately.
 */
export const RETRY_WORK_MARGIN_MS = 20_000;

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
