import type { MindMapDetail, MindMapEdge, MindMapNode, MindMapSummary } from "@/lib/mind-maps/types";

export function rowToMindMapNode(row: {
  id: string;
  mapId: string;
  label: string;
  positionX: number;
  positionY: number;
  createdAt: Date;
  updatedAt: Date;
}): MindMapNode {
  return {
    id: row.id,
    mapId: row.mapId,
    label: row.label,
    positionX: row.positionX,
    positionY: row.positionY,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToMindMapEdge(row: {
  id: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  isSuggested: boolean;
  createdAt: Date;
  updatedAt: Date;
}): MindMapEdge {
  return {
    id: row.id,
    mapId: row.mapId,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    label: row.label,
    isSuggested: row.isSuggested,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToMindMapSummary(
  row: { id: string; title: string; createdAt: Date; updatedAt: Date },
  nodeCount: number,
  edgeCount: number,
): MindMapSummary {
  return {
    id: row.id,
    title: row.title,
    nodeCount,
    edgeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToMindMapDetail(
  row: { id: string; title: string; sourceText: string | null; createdAt: Date; updatedAt: Date },
  nodes: MindMapNode[],
  edges: MindMapEdge[],
): MindMapDetail {
  return {
    id: row.id,
    title: row.title,
    sourceText: row.sourceText,
    nodes,
    edges,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
