import { EditorView } from "@codemirror/view";
import { toast } from "sonner";
import {
  dataUrlChars,
  formatBytes,
  MAX_INLINE_IMAGE_BYTES,
  remainingNoteChars,
} from "@/lib/notes/limits";

export type ImageUploader = (file: File) => Promise<{ url: string }>;

/**
 * Fallback uploader until blob storage lands (issue #86): inline the image as a
 * data URL.
 *
 * The size that matters is checked by the caller, against the room left in this
 * note — a fixed per-image ceiling cannot stop two acceptable images summing
 * past the note's limit. This bound only keeps a very large file from being
 * base64-encoded in the browser before anything can object.
 */
export function fileToDataUrl(file: File): Promise<{ url: string }> {
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    return Promise.reject(
      new Error(
        `That image is ${formatBytes(file.size)}. Images have to be under ${formatBytes(MAX_INLINE_IMAGE_BYTES)} until image storage is set up.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: String(reader.result) });
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

function imageFiles(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** Upload each file and insert `![name](url)` on its own line at `pos`. */
export async function insertImages(
  view: EditorView,
  files: readonly File[],
  pos: number,
  upload: ImageUploader,
) {
  let at = pos;
  for (const file of files) {
    try {
      // Refused before the upload, not after the insert. An inlined image spends
      // the note's character budget, and a note over that budget cannot be
      // saved — so accepting the paste and failing on save would lose the work
      // after the user had already moved on.
      if (upload === fileToDataUrl) {
        const cost = dataUrlChars(file.size, file.type);
        const room = remainingNoteChars(view.state.doc.length);
        if (cost > room) {
          throw new Error(
            `Inlined images count toward the note's length, and this one needs ${formatBytes(cost)} of the ${formatBytes(room)} left. Shorten the note or use a smaller image.`,
          );
        }
      }

      const { url } = await upload(file);
      at = Math.min(at, view.state.doc.length);
      const line = view.state.doc.lineAt(at);
      const lead = line.from === at ? "" : "\n";
      const alt = file.name.replace(/\.[^.]+$/, "") || "image";
      const text = `${lead}![${alt}](${url})\n`;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
        scrollIntoView: true,
      });
      at += text.length;
    } catch (error) {
      toast.error("Could not add image", {
        description: error instanceof Error ? error.message : undefined,
        duration: 5000,
      });
    }
  }
}

/** Drop or paste image files into the note as Markdown images. */
export function imageDrop(upload: ImageUploader = fileToDataUrl) {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const files = imageFiles(event.dataTransfer);
      if (files.length === 0) {
        return false;
      }
      event.preventDefault();
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      void insertImages(view, files, pos, upload);
      return true;
    },
    paste(event, view) {
      const files = imageFiles(event.clipboardData);
      if (files.length === 0) {
        return false;
      }
      event.preventDefault();
      void insertImages(view, files, view.state.selection.main.head, upload);
      return true;
    },
  });
}
