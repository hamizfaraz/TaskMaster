import type { BlockToolConstructable } from "@editorjs/editorjs";
import { CodeBlockTool } from "@/components/note-editor/blocks/code-block-tool";
import { MathBlockTool } from "@/components/note-editor/blocks/math-block-tool";
import { MermaidBlockTool } from "@/components/note-editor/blocks/mermaid-block-tool";
import type { NoteImageFileData } from "@/lib/notes/types";

export async function loadEditorJsClassAndTools(
  resolveImageUpload: (file: File) => Promise<{
    success: 1;
    file: NoteImageFileData;
  }>,
) {
  const [
    { default: EditorJSClass },
    { default: Paragraph },
    { default: Header },
    { default: EditorjsList },
    { default: Quote },
    { default: ImageTool },
  ] = await Promise.all([
    import("@editorjs/editorjs"),
    import("@editorjs/paragraph"),
    import("@editorjs/header"),
    import("@editorjs/list"),
    import("@editorjs/quote"),
    import("@editorjs/image"),
    import("mathlive"),
  ]);

  const paragraphTool = Paragraph as unknown as BlockToolConstructable;
  const headerTool = Header as unknown as BlockToolConstructable;
  const listTool = EditorjsList as unknown as BlockToolConstructable;
  const quoteTool = Quote as unknown as BlockToolConstructable;
  const imageTool = ImageTool as unknown as BlockToolConstructable;

  return {
    EditorJSClass,
    tools: {
      paragraph: {
        class: paragraphTool,
        inlineToolbar: true,
        config: {
          placeholder: "Type '/' for commands",
        },
      },
      header: {
        class: headerTool,
        inlineToolbar: true,
        config: {
          levels: [1, 2, 3, 4],
          defaultLevel: 2,
        },
      },
      list: {
        class: listTool,
        inlineToolbar: true,
        config: {
          defaultStyle: "unordered",
        },
      },
      quote: {
        class: quoteTool,
        inlineToolbar: true,
      },
      code: {
        class: CodeBlockTool as unknown as BlockToolConstructable,
      },
      mermaid: {
        class: MermaidBlockTool as unknown as BlockToolConstructable,
      },
      image: {
        class: imageTool,
        config: {
          features: {
            border: false,
            background: false,
            caption: "optional",
            stretch: true,
          },
          uploader: {
            uploadByFile: async (file: Blob) => {
              if (!(file instanceof File)) {
                throw new Error("Only file uploads are supported.");
              }

              return resolveImageUpload(file);
            },
          },
        },
      },
      math: {
        class: MathBlockTool as unknown as BlockToolConstructable,
      },
    },
  };
}
