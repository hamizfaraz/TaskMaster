import { createNoteContent } from "@/lib/notes/markdown";
import { NoteDocumentSchema, type NoteBlock } from "@/lib/notes/types";

const NOTE_BLOCKS_CLIPBOARD_TYPE = "application/x-taskmaster-note-blocks";

export function writeBlocksToClipboard(
  clipboardData: DataTransfer,
  blocks: NoteBlock[],
  cloneBlocks: (blocks: NoteBlock[]) => NoteBlock[],
) {
  const document = {
    time: Date.now(),
    blocks,
  };
  const payload = JSON.stringify({
    type: "taskmaster.noteBlocks",
    version: 1,
    blocks: cloneBlocks(blocks),
  });

  clipboardData.setData(NOTE_BLOCKS_CLIPBOARD_TYPE, payload);
  clipboardData.setData("text/plain", createNoteContent(document).markdown);
}

export function readBlocksFromClipboard(clipboardData: DataTransfer) {
  const raw =
    clipboardData.getData(NOTE_BLOCKS_CLIPBOARD_TYPE) ||
    clipboardData.getData("text/plain");
  if (!raw) {
    return [];
  }

  try {
    const payload = JSON.parse(raw) as {
      type?: string;
      blocks?: unknown;
    };
    if (
      payload.type !== "taskmaster.noteBlocks" ||
      !Array.isArray(payload.blocks)
    ) {
      return [];
    }

    return NoteDocumentSchema.parse({
      time: Date.now(),
      blocks: payload.blocks,
    }).blocks;
  } catch {
    return [];
  }
}
