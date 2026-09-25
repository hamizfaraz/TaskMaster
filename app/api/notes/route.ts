import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { normalizeNoteWriteContent, normalizeNoteWriteMarkdown } from "@/lib/notes/persistence";
import { embedNote } from "@/lib/notes/embedding";

export const runtime = "nodejs";

// GET /api/notes - list the authenticated user's notes
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classIdParam = new URL(req.url).searchParams.get("classId");
  if (classIdParam) {
    const ownedClass = await assertClassBelongsToUser(classIdParam, session.user.id);
    if (!ownedClass) {
      return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
    }
  }

  const notes = await db
    .select({
      id: note.id,
      userId: note.userId,
      title: note.title,
      classId: note.classId,
      content: note.content,
      markdown: note.markdown,
      sourceType: note.sourceType,
      fileName: note.fileName,
      mimeType: note.mimeType,
      fileSize: note.fileSize,
      embedding: note.embedding,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })
    .from(note)
    .where(
      and(
        eq(note.userId, session.user.id),
        classIdParam ? eq(note.classId, classIdParam) : undefined,
      ),
    )
    .orderBy(desc(note.updatedAt));

  return NextResponse.json(notes);
}

// POST /api/notes - create a manual text note
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; content?: unknown; markdown?: unknown; classId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled";
  const classId = body.classId === null ? null : typeof body.classId === "string" ? body.classId : null;

  if (classId) {
    const ownedClass = await assertClassBelongsToUser(classId, session.user.id);
    if (!ownedClass) {
      return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
    }
  }

  let content: ReturnType<typeof normalizeNoteWriteContent>;
  try {
    content =
      body.markdown !== undefined
        ? normalizeNoteWriteMarkdown(body.markdown)
        : normalizeNoteWriteContent(body.content);
  } catch {
    return NextResponse.json(
      { error: "Invalid note content" },
      { status: 400 },
    );
  }

  // A note created with text (duplicate, .md import) is embedded up front. The
  // common empty-note case costs nothing: embedNote returns null for blank
  // markdown and the first real save embeds it.
  const embedding = await embedNote({ title, markdown: content.markdown });

  try {
    const [created] = await db
      .insert(note)
      .values({
        userId: session.user.id,
        title,
        classId,
        content: content.document,
        markdown: content.markdown,
        sourceType: "manual",
        ...(embedding ? { embedding, embeddingUpdatedAt: new Date() } : {}),
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/notes]", error);
    return NextResponse.json({ error: "Could not create the note." }, { status: 500 });
  }
}
