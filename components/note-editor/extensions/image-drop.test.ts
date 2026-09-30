import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";
import { fileToDataUrl, insertImages } from "@/components/note-editor/extensions/image-drop";
import { MAX_INLINE_IMAGE_BYTES, MAX_NOTE_MARKDOWN_CHARS } from "@/lib/notes/limits";

function view(doc: string) {
  return new EditorView({ state: EditorState.create({ doc }) });
}

describe("insertImages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a markdown image on its own line using the uploader's URL", async () => {
    const editor = view("Notes so far");
    const upload = vi.fn().mockResolvedValue({ url: "https://cdn.example/diagram.png" });

    await insertImages(editor, [new File(["x"], "diagram.png", { type: "image/png" })], 12, upload);

    expect(editor.state.doc.toString()).toBe("Notes so far\n![diagram](https://cdn.example/diagram.png)\n");
    expect(upload).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it("inserts several files in order and reports a failed one without stopping", async () => {
    const editor = view("");
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ url: "a.png" })
      .mockRejectedValueOnce(new Error("too big"))
      .mockResolvedValueOnce({ url: "c.png" });
    const files = ["a", "b", "c"].map((name) => new File(["x"], `${name}.png`, { type: "image/png" }));

    await insertImages(editor, files, 0, upload);

    expect(editor.state.doc.toString()).toBe("![a](a.png)\n![c](c.png)\n");
    expect(toast.error).toHaveBeenCalledWith("Could not add image", expect.objectContaining({ description: "too big" }));
    editor.destroy();
  });
});

describe("fileToDataUrl", () => {
  it("encodes small images and refuses one too large to encode at all", async () => {
    const small = new File(["hello"], "s.png", { type: "image/png" });
    await expect(fileToDataUrl(small)).resolves.toEqual({ url: expect.stringMatching(/^data:image\/png;base64,/) });

    const huge = new File([new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1)], "l.png", { type: "image/png" });
    await expect(fileToDataUrl(huge)).rejects.toThrow(/image storage/);
  });
});

describe("inlined images and the note's length limit", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a paste that would make the note too long to save", async () => {
    // The bug this replaces: the image cap was a flat 2 MB while a note is
    // capped in characters, so the paste was accepted and every save afterwards
    // failed. Refusing the paste loses nothing; accepting it lost the work.
    const editor = view("Some notes");
    const big = new File([new Uint8Array(600 * 1024)], "big.png", { type: "image/png" });

    await insertImages(editor, [big], 0, fileToDataUrl);

    expect(editor.state.doc.toString()).toBe("Some notes");
    expect(toast.error).toHaveBeenCalledWith(
      "Could not add image",
      expect.objectContaining({ description: expect.stringContaining("count toward the note's length") }),
    );
  });

  it("refuses a second image once the note has no room left", async () => {
    // A per-image ceiling could not catch this: each image is individually fine.
    const editor = view("x".repeat(MAX_NOTE_MARKDOWN_CHARS - 1_000));
    const image = new File([new Uint8Array(4 * 1024)], "a.png", { type: "image/png" });

    await insertImages(editor, [image], 0, fileToDataUrl);

    expect(editor.state.doc.length).toBe(MAX_NOTE_MARKDOWN_CHARS - 1_000);
    expect(toast.error).toHaveBeenCalled();
  });

  it("still inlines an image that fits", async () => {
    const editor = view("Some notes");
    const small = new File([new Uint8Array(1_024)], "ok.png", { type: "image/png" });

    await insertImages(editor, [small], editor.state.doc.length, fileToDataUrl);

    expect(editor.state.doc.toString()).toContain("![ok](data:image/png;base64,");
    expect(editor.state.doc.length).toBeLessThan(MAX_NOTE_MARKDOWN_CHARS);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("leaves a real uploader unrestricted, since its URL is short", async () => {
    // With blob storage (#86) the note only holds a link, so the note's length
    // is not the constraint and this guard must not apply.
    const editor = view("Some notes");
    const big = new File([new Uint8Array(900 * 1024)], "big.png", { type: "image/png" });
    const upload = vi.fn().mockResolvedValue({ url: "https://blob.example/big.png" });

    await insertImages(editor, [big], editor.state.doc.length, upload);

    expect(editor.state.doc.toString()).toContain("![big](https://blob.example/big.png)");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
