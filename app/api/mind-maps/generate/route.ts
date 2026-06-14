import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mindMap, mindMapEdge, mindMapNode } from "@/lib/db/schema";
import { guardMindMapRequest } from "@/lib/mind-maps/api";
import { getMindMapContextNotes } from "@/lib/mind-maps/context";
import { generateAssociationMap } from "@/lib/mind-maps/gemini";
import { rowToMindMapDetail, rowToMindMapEdge, rowToMindMapNode } from "@/lib/mind-maps/records";
import { generateMapSchema } from "@/lib/mind-maps/types";

export const runtime = "nodejs";

/** Lays topics out on a ring centred at the origin so the generated map reads cleanly. */
function ringPosition(index: number, total: number) {
  const radius = 200 + total * 16;
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

export async function POST(req: Request) {
  const guard = await guardMindMapRequest();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = generateMapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const notes = await getMindMapContextNotes({
    userId: guard.userId,
    noteIds: parsed.data.noteIds,
  });

  if (notes.length !== new Set(parsed.data.noteIds).size) {
    return NextResponse.json({ error: "One or more selected notes could not be found" }, { status: 404 });
  }

  if (notes.every((note) => note.embedding.length === 0)) {
    return NextResponse.json(
      { error: "Selected notes do not have stored embeddings yet" },
      { status: 400 },
    );
  }

  let generated;
  try {
    generated = await generateAssociationMap({ notes });
  } catch (error) {
    console.error("[POST /api/mind-maps/generate]", error);
    const message = error instanceof Error ? error.message : "Map generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (generated.topics.length === 0) {
    return NextResponse.json({ error: "The model did not return any topics" }, { status: 502 });
  }

  const title = `Associations — ${notes[0].title}`.slice(0, 120);
  const sourceText = notes.map((note) => note.title).join(", ");

  try {
    const [createdMap] = await db
      .insert(mindMap)
      .values({ id: crypto.randomUUID(), userId: guard.userId, title, sourceText })
      .returning();

    const total = generated.topics.length;
    const nodeIdByLabel = new Map<string, string>();
    const nodeValues = generated.topics.map((label, index) => {
      const id = crypto.randomUUID();
      nodeIdByLabel.set(label.toLowerCase(), id);
      const position = ringPosition(index, total);
      return { id, mapId: createdMap.id, label, positionX: position.x, positionY: position.y };
    });

    const insertedNodes = await db.insert(mindMapNode).values(nodeValues).returning();

    const edgeValues = generated.connections
      .map((connection) => {
        const sourceNodeId = nodeIdByLabel.get(connection.source.toLowerCase());
        const targetNodeId = nodeIdByLabel.get(connection.target.toLowerCase());
        if (!sourceNodeId || !targetNodeId) return null;
        return {
          id: crypto.randomUUID(),
          mapId: createdMap.id,
          sourceNodeId,
          targetNodeId,
          label: connection.label,
          isSuggested: true,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const insertedEdges =
      edgeValues.length > 0 ? await db.insert(mindMapEdge).values(edgeValues).returning() : [];

    return NextResponse.json(
      {
        map: rowToMindMapDetail(
          createdMap,
          insertedNodes.map(rowToMindMapNode),
          insertedEdges.map(rowToMindMapEdge),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/mind-maps/generate] persist", error);
    return NextResponse.json({ error: "Failed to save generated map" }, { status: 500 });
  }
}
