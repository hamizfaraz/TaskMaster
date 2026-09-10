import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";
import { fileToDataUrl, insertImages } from "@/components/note-editor/extensions/image-drop";

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
  it("encodes small images and refuses large ones", async () => {
    const small = new File(["hello"], "s.png", { type: "image/png" });
    await expect(fileToDataUrl(small)).resolves.toEqual({ url: expect.stringMatching(/^data:image\/png;base64,/) });

    const large = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "l.png", { type: "image/png" });
    await expect(fileToDataUrl(large)).rejects.toThrow(/2 MB/);
  });
});
