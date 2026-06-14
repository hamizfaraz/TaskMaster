"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MindMapEdge, MindMapNode } from "@/lib/mind-maps/types";
import { EdgeLabelChip, EdgeLayer } from "@/components/mind-map/edge-layer";
import { NodeCard } from "@/components/mind-map/node-card";

type MindMapCanvasProps = {
  mapId: string;
  initialNodes: MindMapNode[];
  initialEdges: MindMapEdge[];
};

type Point = { x: number; y: number };

type Gesture =
  | { kind: "pan"; startClientX: number; startClientY: number; originPan: Point }
  | {
      kind: "drag";
      nodeId: string;
      startClientX: number;
      startClientY: number;
      nodeStartX: number;
      nodeStartY: number;
      moved: boolean;
    }
  | { kind: "connect"; sourceId: string; rectLeft: number; rectTop: number; pan: Point };

async function mutate<T>(input: string, init: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }
  return payload as T;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export function MindMapCanvas({ mapId, initialNodes, initialEdges }: MindMapCanvasProps) {
  const [nodes, setNodes] = useState<MindMapNode[]>(initialNodes);
  const [edges, setEdges] = useState<MindMapEdge[]>(initialEdges);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [connectDraft, setConnectDraft] = useState<{ sourceId: string; cursor: Point } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const commitNodePosition = useCallback(
    async (nodeId: string, position: Point, fallback: Point) => {
      try {
        await mutate(`/api/mind-maps/${mapId}/nodes/${nodeId}`, {
          method: "PATCH",
          body: JSON.stringify({ positionX: position.x, positionY: position.y }),
        });
      } catch (error) {
        setNodes((curr) =>
          curr.map((node) =>
            node.id === nodeId ? { ...node, positionX: fallback.x, positionY: fallback.y } : node,
          ),
        );
        toast.error("Failed to move topic", { description: describeError(error) });
      }
    },
    [mapId],
  );

  const createEdge = useCallback(
    async (sourceId: string, targetId: string) => {
      try {
        const { edge } = await mutate<{ edge: MindMapEdge }>(`/api/mind-maps/${mapId}/edges`, {
          method: "POST",
          body: JSON.stringify({ sourceNodeId: sourceId, targetNodeId: targetId }),
        });
        setEdges((curr) =>
          curr.some((existing) => existing.id === edge.id) ? curr : [...curr, edge],
        );
      } catch (error) {
        toast.error("Failed to connect topics", { description: describeError(error) });
      }
    },
    [mapId],
  );

  // Keep the latest async actions reachable from the (mount-stable) window listeners.
  const actionsRef = useRef({ commitNodePosition, createEdge });
  useEffect(() => {
    actionsRef.current = { commitNodePosition, createEdge };
  });

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const gesture = gestureRef.current;
      if (!gesture) return;

      if (gesture.kind === "pan") {
        setPan({
          x: gesture.originPan.x + (event.clientX - gesture.startClientX),
          y: gesture.originPan.y + (event.clientY - gesture.startClientY),
        });
      } else if (gesture.kind === "drag") {
        const dx = event.clientX - gesture.startClientX;
        const dy = event.clientY - gesture.startClientY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) gesture.moved = true;
        setNodes((curr) =>
          curr.map((node) =>
            node.id === gesture.nodeId
              ? { ...node, positionX: gesture.nodeStartX + dx, positionY: gesture.nodeStartY + dy }
              : node,
          ),
        );
      } else if (gesture.kind === "connect") {
        setConnectDraft({
          sourceId: gesture.sourceId,
          cursor: {
            x: event.clientX - gesture.rectLeft - gesture.pan.x,
            y: event.clientY - gesture.rectTop - gesture.pan.y,
          },
        });
      }
    }

    function onPointerUp(event: PointerEvent) {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture) return;

      if (gesture.kind === "drag" && gesture.moved) {
        const finalPos = {
          x: gesture.nodeStartX + (event.clientX - gesture.startClientX),
          y: gesture.nodeStartY + (event.clientY - gesture.startClientY),
        };
        void actionsRef.current.commitNodePosition(gesture.nodeId, finalPos, {
          x: gesture.nodeStartX,
          y: gesture.nodeStartY,
        });
      } else if (gesture.kind === "connect") {
        setConnectDraft(null);
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest("[data-node-id]");
        const targetId = target?.getAttribute("data-node-id");
        if (targetId && targetId !== gesture.sourceId) {
          void actionsRef.current.createEdge(gesture.sourceId, targetId);
        }
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const handleBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      setEditingNodeId(null);
      setEditingEdgeId(null);
      gestureRef.current = {
        kind: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        originPan: pan,
      };
    },
    [pan],
  );

  const handleNodePointerDown = useCallback(
    (node: MindMapNode) => (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      gestureRef.current = {
        kind: "drag",
        nodeId: node.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        nodeStartX: node.positionX,
        nodeStartY: node.positionY,
        moved: false,
      };
    },
    [],
  );

  const handleStartConnect = useCallback(
    (node: MindMapNode) => (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setConnectDraft({ sourceId: node.id, cursor: { x: node.positionX, y: node.positionY } });
      gestureRef.current = {
        kind: "connect",
        sourceId: node.id,
        rectLeft: rect.left,
        rectTop: rect.top,
        pan,
      };
    },
    [pan],
  );

  const addTopic = useCallback(async () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const center = rect ? { x: rect.width / 2 - pan.x, y: rect.height / 2 - pan.y } : { x: 0, y: 0 };
    const jitter = () => (Math.random() - 0.5) * 60;
    try {
      const { node } = await mutate<{ node: MindMapNode }>(`/api/mind-maps/${mapId}/nodes`, {
        method: "POST",
        body: JSON.stringify({
          label: "New topic",
          positionX: center.x + jitter(),
          positionY: center.y + jitter(),
        }),
      });
      setNodes((curr) => [...curr, node]);
      setEditingNodeId(node.id);
    } catch (error) {
      toast.error("Failed to add topic", { description: describeError(error) });
    }
  }, [mapId, pan]);

  const commitNodeLabel = useCallback(
    async (nodeId: string, label: string) => {
      let previous: string | undefined;
      setEditingNodeId(null);
      setNodes((curr) =>
        curr.map((node) => {
          if (node.id !== nodeId) return node;
          previous = node.label;
          return { ...node, label };
        }),
      );
      try {
        await mutate(`/api/mind-maps/${mapId}/nodes/${nodeId}`, {
          method: "PATCH",
          body: JSON.stringify({ label }),
        });
      } catch (error) {
        if (previous !== undefined) {
          const restored = previous;
          setNodes((curr) =>
            curr.map((node) => (node.id === nodeId ? { ...node, label: restored } : node)),
          );
        }
        toast.error("Failed to rename topic", { description: describeError(error) });
      }
    },
    [mapId],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      let removedNode: MindMapNode | undefined;
      let removedEdges: MindMapEdge[] = [];
      setNodes((curr) => {
        removedNode = curr.find((node) => node.id === nodeId);
        return curr.filter((node) => node.id !== nodeId);
      });
      setEdges((curr) => {
        removedEdges = curr.filter(
          (edge) => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId,
        );
        return curr.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId);
      });
      try {
        await mutate(`/api/mind-maps/${mapId}/nodes/${nodeId}`, { method: "DELETE" });
      } catch (error) {
        if (removedNode) setNodes((curr) => [...curr, removedNode as MindMapNode]);
        if (removedEdges.length > 0) setEdges((curr) => [...curr, ...removedEdges]);
        toast.error("Failed to delete topic", { description: describeError(error) });
      }
    },
    [mapId],
  );

  const commitEdgeLabel = useCallback(
    async (edgeId: string, label: string) => {
      const nextLabel = label.length > 0 ? label : null;
      let previous: string | null = null;
      setEditingEdgeId(null);
      setEdges((curr) =>
        curr.map((edge) => {
          if (edge.id !== edgeId) return edge;
          previous = edge.label;
          return { ...edge, label: nextLabel };
        }),
      );
      try {
        await mutate(`/api/mind-maps/${mapId}/edges/${edgeId}`, {
          method: "PATCH",
          body: JSON.stringify({ label: nextLabel }),
        });
      } catch (error) {
        const restored = previous;
        setEdges((curr) =>
          curr.map((edge) => (edge.id === edgeId ? { ...edge, label: restored } : edge)),
        );
        toast.error("Failed to label connection", { description: describeError(error) });
      }
    },
    [mapId],
  );

  const deleteEdge = useCallback(
    async (edgeId: string) => {
      let removed: MindMapEdge | undefined;
      setEdges((curr) => {
        removed = curr.find((edge) => edge.id === edgeId);
        return curr.filter((edge) => edge.id !== edgeId);
      });
      try {
        await mutate(`/api/mind-maps/${mapId}/edges/${edgeId}`, { method: "DELETE" });
      } catch (error) {
        if (removed) setEdges((curr) => [...curr, removed as MindMapEdge]);
        toast.error("Failed to delete connection", { description: describeError(error) });
      }
    },
    [mapId],
  );

  const draftPoints = useMemo(() => {
    if (!connectDraft) return null;
    const source = nodeById.get(connectDraft.sourceId);
    if (!source) return null;
    return {
      source: { x: source.positionX, y: source.positionY },
      cursor: connectDraft.cursor,
    };
  }, [connectDraft, nodeById]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface-muted/40"
      style={{ touchAction: "none", cursor: "grab" }}
      onPointerDown={handleBackgroundPointerDown}
    >
      <div
        className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-3"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Button type="button" size="sm" leadingIcon={<Plus className="size-4" />} onClick={addTopic}>
          Add topic
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Double-click to rename · drag the blue dot onto another topic to connect · drag the canvas to pan
        </span>
      </div>

      <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        <EdgeLayer edges={edges} nodeById={nodeById} draft={draftPoints} />

        {edges.map((edge) => {
          const source = nodeById.get(edge.sourceNodeId);
          const target = nodeById.get(edge.targetNodeId);
          if (!source || !target) return null;
          const midpoint = {
            x: (source.positionX + target.positionX) / 2,
            y: (source.positionY + target.positionY) / 2,
          };
          return (
            <EdgeLabelChip
              key={edge.id}
              edge={edge}
              midpoint={midpoint}
              isEditing={editingEdgeId === edge.id}
              onStartEdit={() => setEditingEdgeId(edge.id)}
              onCommit={(label) => commitEdgeLabel(edge.id, label)}
              onCancelEdit={() => setEditingEdgeId(null)}
              onDelete={() => deleteEdge(edge.id)}
            />
          );
        })}

        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            isEditing={editingNodeId === node.id}
            isConnectSource={connectDraft?.sourceId === node.id}
            onPointerDownCard={handleNodePointerDown(node)}
            onStartConnect={handleStartConnect(node)}
            onStartEdit={() => setEditingNodeId(node.id)}
            onCommitLabel={(label) => commitNodeLabel(node.id, label)}
            onCancelEdit={() => setEditingNodeId(null)}
            onDelete={() => deleteNode(node.id)}
          />
        ))}
      </div>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            This canvas is empty. Add a topic to start mapping how your ideas connect.
          </p>
        </div>
      ) : null}
    </div>
  );
}
