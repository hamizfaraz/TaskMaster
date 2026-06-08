import type { NoteBlock } from "@/lib/notes/types";

export type BlockConversionTarget =
  | { type: "paragraph" }
  | { type: "header"; level: 1 | 2 | 3 | 4 }
  | { type: "list"; style: "ordered" | "unordered" | "checklist" }
  | { type: "quote" }
  | { type: "code" }
  | { type: "mermaid" }
  | { type: "math" };

export type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  target: BlockConversionTarget;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    hint: "Plain text block",
    keywords: ["paragraph", "plain"],
    target: { type: "paragraph" },
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Large section heading",
    keywords: ["heading", "title", "h1"],
    target: { type: "header", level: 1 },
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Medium section heading",
    keywords: ["heading", "subtitle", "h2"],
    target: { type: "header", level: 2 },
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Small section heading",
    keywords: ["heading", "h3"],
    target: { type: "header", level: 3 },
  },
  {
    id: "bullet",
    label: "Bulleted list",
    hint: "Simple unordered list",
    keywords: ["list", "ul", "bullet"],
    target: { type: "list", style: "unordered" },
  },
  {
    id: "number",
    label: "Numbered list",
    hint: "Ordered list",
    keywords: ["list", "ol", "number"],
    target: { type: "list", style: "ordered" },
  },
  {
    id: "todo",
    label: "Checklist",
    hint: "Track tasks",
    keywords: ["todo", "task", "check"],
    target: { type: "list", style: "checklist" },
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Callout text",
    keywords: ["blockquote", "callout"],
    target: { type: "quote" },
  },
  {
    id: "code",
    label: "Code",
    hint: "Code block",
    keywords: ["pre", "snippet"],
    target: { type: "code" },
  },
  {
    id: "mermaid",
    label: "Mermaid",
    hint: "Diagram block",
    keywords: ["diagram", "flowchart", "chart", "graph"],
    target: { type: "mermaid" },
  },
  {
    id: "math",
    label: "Math",
    hint: "Equation block",
    keywords: ["equation", "latex"],
    target: { type: "math" },
  },
];

export function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getBlockText(block: NoteBlock, options?: { plain?: boolean }) {
  const normalize = options?.plain ? stripHtml : (value: string) => value;

  switch (block.type) {
    case "paragraph":
    case "header":
      return normalize(block.data.text);
    case "quote":
      return normalize(block.data.text);
    case "list":
      return normalize(block.data.items.map((item) => item.content).join("\n"));
    case "code":
    case "mermaid":
      return block.data.code;
    case "math":
      return block.data.latex;
    case "image":
      return normalize(block.data.caption);
    default:
      return "";
  }
}

export function convertBlock(
  block: NoteBlock,
  target: BlockConversionTarget,
): NoteBlock {
  const richText = getBlockText(block);
  const plainText = getBlockText(block, { plain: true });

  switch (target.type) {
    case "paragraph":
      return { type: "paragraph", data: { text: richText } };
    case "header":
      return { type: "header", data: { text: richText, level: target.level } };
    case "list":
      return {
        type: "list",
        data: {
          style: target.style,
          items: plainText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => ({
              content: item,
              meta: target.style === "checklist" ? { checked: false } : {},
              items: [],
            })),
        },
      };
    case "quote":
      return {
        type: "quote",
        data: { text: richText, caption: "", alignment: "left" },
      };
    case "code":
      return { type: "code", data: { code: plainText } };
    case "mermaid":
      return { type: "mermaid", data: { code: plainText } };
    case "math":
      return { type: "math", data: { latex: plainText } };
    default:
      return block;
  }
}

export function createEmptyBlockForTarget(target: BlockConversionTarget): NoteBlock {
  switch (target.type) {
    case "paragraph":
      return { type: "paragraph", data: { text: "" } };
    case "header":
      return { type: "header", data: { text: "", level: target.level } };
    case "list":
      return {
        type: "list",
        data: {
          style: target.style,
          items: [
            {
              content: "",
              meta: target.style === "checklist" ? { checked: false } : {},
              items: [],
            },
          ],
        },
      };
    case "quote":
      return {
        type: "quote",
        data: { text: "", caption: "", alignment: "left" },
      };
    case "code":
      return { type: "code", data: { code: "" } };
    case "mermaid":
      return { type: "mermaid", data: { code: "" } };
    case "math":
      return { type: "math", data: { latex: "" } };
    default:
      return { type: "paragraph", data: { text: "" } };
  }
}

export function getSlashCommandMatches(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((command) =>
    [command.label, command.id, ...command.keywords].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    ),
  );
}
