import { z } from "zod";

export type MindMapSummary = {
  id: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MindMapNode = {
  id: string;
  mapId: string;
  label: string;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
};

export type MindMapEdge = {
  id: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  isSuggested: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MindMapDetail = {
  id: string;
  title: string;
  sourceText: string | null;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  createdAt: string;
  updatedAt: string;
};

export const createMapSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const updateMapSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const createNodeSchema = z.object({
  label: z.string().trim().min(1).max(200),
  positionX: z.number().finite(),
  positionY: z.number().finite(),
});

export const updateNodeSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    positionX: z.number().finite().optional(),
    positionY: z.number().finite().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export const createEdgeSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    label: z.string().trim().max(200).nullish(),
  })
  .refine((data) => data.sourceNodeId !== data.targetNodeId, {
    message: "A topic cannot connect to itself",
  });

export const updateEdgeSchema = z.object({
  label: z.string().trim().max(200).nullable(),
});

export const generateMapSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(12),
});
