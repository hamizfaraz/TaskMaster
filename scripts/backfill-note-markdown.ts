/**
 * Fill the `markdown` column for notes that only have a block `content`.
 *
 * Those rows predate Markdown becoming canonical. `noteRecordToWorkspaceNote`
 * falls back to re-serializing their block cache, so they are the rows where
 * the round-trip bugs were actually visible to users, and where one keystroke
 * would have promoted the damage to canonical.
 *
 * Run the dry run first and read the diff:
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-note-markdown.ts
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-note-markdown.ts --apply
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { normalizeNoteDocument } from "@/lib/notes/records";
import { serializeNoteDocumentToMarkdown } from "@/lib/notes/markdown";

const apply = process.argv.includes("--apply");

/**
 * These rows do not hold a real block document. They hold Markdown *source*
 * stuffed into paragraph text with <br> separators — whole nested lists and
 * whole GFM tables sit inside a single paragraph. Running the block serializer
 * over that escapes the Markdown, turning `- **Assets**` into
 * `\\- \\*\\*Assets\\*\\*`, which is faithful to the stored blocks and useless to
 * the reader.
 *
 * So paragraphs and quotes are taken as the text they already are, and only
 * genuinely structured blocks go through the serializer.
 */
function legacyDocumentToMarkdown(document: ReturnType<typeof normalizeNoteDocument>) {
  const plain = (value: string) =>
    value
      .replace(/<br\s*\/?>/gi, "\n")
      // These rows mix two conventions: some bold is literal `**`, some is a
      // <strong> tag. Convert the tags so neither is lost.
      .replace(/<\/?(?:strong|b)\s*>/gi, "**")
      .replace(/<\/?(?:em|i)\s*>/gi, "*")
      .replace(/<\/?s\s*>/gi, "~~")
      .replace(/<code\s*>([\s\S]*?)<\/code>/gi, (_match, code: string) => `\`${code}\``)
      .replace(
        /<span[^>]*class="[^"]*note-inline-math[^"]*"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
        (_match, latex: string) => `$${latex}$`,
      )
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

  const parts = document.blocks.map((block) => {
    if (block.type === "paragraph") {
      return plain(block.data.text);
    }
    if (block.type === "header") {
      const level = Math.min(Math.max(block.data.level, 1), 6);
      const text = plain(block.data.text);
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    return serializeNoteDocumentToMarkdown({ ...document, blocks: [block] }).trim();
  });

  return parts.filter(Boolean).join("\n\n").trim();
}

async function main() {
  const rows = await db
    .select({ id: note.id, title: note.title, content: note.content, markdown: note.markdown })
    .from(note);

  const candidates = rows.filter((row) => row.content !== null && row.markdown.trim() === "");

  console.log(`${candidates.length} note(s) have block content but no markdown\n`);

  let wrote = 0;
  let empty = 0;

  for (const row of candidates) {
    const document = normalizeNoteDocument(row.content, { normalizeInlineMarkdown: true });
    const markdown = legacyDocumentToMarkdown(document);

    if (!markdown) {
      empty += 1;
      console.log(`  SKIP  ${row.title.slice(0, 56)}  (serialized to nothing)`);
      continue;
    }

    const preview = markdown.split("\n").slice(0, 3).join(" / ").slice(0, 110);
    console.log(`  ${apply ? "WRITE" : "would"} ${String(markdown.length).padStart(6)}b  ${row.title.slice(0, 44).padEnd(44)}  ${preview}`);

    if (apply) {
      await db.update(note).set({ markdown }).where(eq(note.id, row.id));
      wrote += 1;
    }
  }

  console.log(
    `\n${apply ? `wrote ${wrote}` : `would write ${candidates.length - empty}`} note(s)` +
      (empty ? `, skipped ${empty} that serialize to nothing` : ""),
  );
  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
