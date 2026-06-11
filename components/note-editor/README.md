# Note Editor Map

Use this folder by responsibility:

- `note-editor.tsx` - Editor shell, persistence bridge, selection/reorder behavior.
- `note-surface.tsx` - Switches between editable editor and read-only renderer.
- `note-renderer.tsx` - Small read-only Markdown wrapper.
- `markdown-components.tsx` - ReactMarkdown component mapping for images, inline code, code fences, Mermaid fences.
- `blocks/` - Block-specific tools and views.
  - `code-block-tool.ts` / `code-block-view.tsx` - Code editing and rendering.
  - `mermaid-block-tool.ts` / `mermaid-block-view.tsx` / `mermaid-renderer.ts` - Mermaid editing, rendering, errors.
  - `math-block-tool.ts` - MathLive equation block.
- `block-transforms.ts` - Slash commands, “Turn into”, block conversion helpers.
- `block-clipboard.ts` - Multi-block copy/cut/paste serialization.
- `editor-menus.tsx` - Slash menu and block context menu UI.
- `editorjs-tools.ts` - Editor.js dynamic imports and tool registry.
- `image-upload.ts` - Temporary inline image upload fallback.
- `document-utils.ts` - Small document helpers.
- `__tests__/` - Note editor tests. Implementation folders stay test-file free.

Markdown parsing/serialization lives outside React:

- `lib/notes/parse-markdown.ts` - Markdown to note blocks.
- `lib/notes/markdown.ts` - Note blocks to Markdown.
- `lib/notes/types.ts` - Note block schemas and types.
