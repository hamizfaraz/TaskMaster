/**
 * Editor-agnostic block/document shape.
 *
 * Mirrors what the previous Editor.js integration produced so stored notes
 * keep parsing, but defined locally so the persistence layer does not depend
 * on any editor library.
 */
export type NoteBlockShape<
  Type extends string = string,
  Data extends object = Record<string, unknown>,
> = {
  id?: string;
  type: Type;
  data: Data;
  tunes?: Record<string, unknown>;
};

type NoteDocumentShape = {
  version?: string;
  time?: number;
};

import { z } from "zod";

export type RichTextBlockType = "paragraph" | "header" | "quote";
export type NoteBlockType =
  | "paragraph"
  | "header"
  | "list"
  | "quote"
  | "code"
  | "image"
  | "math"
  | "inlineMath";

export type NoteParagraphBlockData = {
  text: string;
};

export type NoteHeaderBlockData = {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
};

export type NoteListMeta =
  | Record<string, never>
  | {
      checked?: boolean;
      start?: number;
      counterType?: string;
    };

export type NoteListItem = {
  content: string;
  meta?: NoteListMeta;
  items: NoteListItem[];
};

export type NoteListBlockData = {
  style: "ordered" | "unordered" | "checklist";
  meta?: NoteListMeta;
  items: NoteListItem[];
};

export type NoteQuoteBlockData = {
  text: string;
  caption: string;
  alignment?: "left" | "center";
};

export type NoteCodeBlockData = {
  code: string;
  language?: string;
};

export type NoteImageFileData = {
  url: string;
  [key: string]: unknown;
};

export type NoteImageBlockData = {
  file: NoteImageFileData;
  caption: string;
  withBorder: boolean;
  withBackground: boolean;
  stretched: boolean;
};

export type NoteMathBlockData = {
  latex: string;
};

export type NoteInlineMathBlockData = NoteMathBlockData;

export type NoteBlock =
  | NoteBlockShape<"paragraph", NoteParagraphBlockData>
  | NoteBlockShape<"header", NoteHeaderBlockData>
  | NoteBlockShape<"list", NoteListBlockData>
  | NoteBlockShape<"quote", NoteQuoteBlockData>
  | NoteBlockShape<"code", NoteCodeBlockData>
  | NoteBlockShape<"image", NoteImageBlockData>
  | NoteBlockShape<"math", NoteMathBlockData>
  | NoteBlockShape<"inlineMath", NoteInlineMathBlockData>;

export type NoteDocument = NoteDocumentShape & {
  blocks: NoteBlock[];
};

export type NoteContent = {
  markdown: string;
  document: NoteDocument;
};

const listMetaSchema = z
  .object({
    checked: z.boolean().optional(),
    start: z.number().int().optional(),
    counterType: z.string().optional(),
  })
  .passthrough();

const listItemSchema: z.ZodType<NoteListItem> = z.lazy(() =>
  z.object({
    content: z.string(),
    meta: listMetaSchema.optional(),
    items: z.array(listItemSchema),
  }),
);

const paragraphBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("paragraph"),
  data: z.object({
    text: z.string(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const headerBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("header"),
  data: z.object({
    text: z.string(),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const listBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("list"),
  data: z.object({
    style: z.union([z.literal("ordered"), z.literal("unordered"), z.literal("checklist")]),
    meta: listMetaSchema.optional(),
    items: z.array(listItemSchema),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const quoteBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("quote"),
  data: z.object({
    text: z.string(),
    caption: z.string(),
    alignment: z.union([z.literal("left"), z.literal("center")]).optional(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const codeBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("code"),
  data: z.object({
    code: z.string(),
    language: z.string().optional(),
    theme: z.string().optional(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const imageBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("image"),
  data: z.object({
    file: z.object({
      url: z.string().min(1),
    }).catchall(z.unknown()),
    caption: z.string(),
    withBorder: z.boolean(),
    withBackground: z.boolean(),
    stretched: z.boolean(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const mathBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("math"),
  data: z.object({
    latex: z.string(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

const inlineMathBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal("inlineMath"),
  data: z.object({
    latex: z.string(),
  }),
  tunes: z.record(z.string(), z.unknown()).optional(),
});

export const NoteBlockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headerBlockSchema,
  listBlockSchema,
  quoteBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
  mathBlockSchema,
  inlineMathBlockSchema,
]);

export const NoteDocumentSchema: z.ZodType<NoteDocument> = z
  .object({
    version: z.string().optional(),
    time: z.number().optional(),
    blocks: z.array(NoteBlockSchema),
  })
  .transform((document) => ({
    ...document,
    blocks: document.blocks.map((block) =>
      block.type === "code"
        ? {
            ...block,
            data: {
              code: block.data.code,
              ...(block.data.language ? { language: block.data.language } : {}),
            },
          }
        : block,
    ) as NoteBlock[],
  }));

export type NoteRecordResponse = {
  note: {
    id: string;
    content: NoteContent;
    createdAt: string;
    updatedAt: string;
  };
};

export const emptyNoteDocument: NoteDocument = {
  time: 0,
  blocks: [],
};
