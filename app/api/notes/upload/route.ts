import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { generateTopicNotesFromFile, markdownToNoteDocument } from "@/lib/notes/generation";

export const runtime = "nodejs";
// Azure polls for up to ~60s and two Gemini calls follow it. Without this the
// platform default can kill the handler *after* all the paid work is done.
export const maxDuration = 300;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// POST /api/notes/upload — create generated topic notes from an uploaded file
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 },
    );
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Accepted: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
      },
      { status: 415 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  let fileBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Failed to process uploaded file" },
      { status: 500 },
    );
  }

  const rawTitle = formData.get("title");
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim()
      : file.name.replace(/\.[^.]+$/, "") || "Uploaded Note";
  const rawClassId = formData.get("classId");
  const classId =
    typeof rawClassId === "string" && rawClassId.trim() ? rawClassId.trim() : null;

  if (classId) {
    const ownedClass = await assertClassBelongsToUser(classId, session.user.id);
    if (!ownedClass) {
      return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
    }
  }

  let generated: Awaited<ReturnType<typeof generateTopicNotesFromFile>>;
  try {
    generated = await generateTopicNotesFromFile({
      fileBuffer,
      fileName: file.name,
      mimeType: file.type,
    });
  } catch (error) {
    // Never surface the raw message: it carries Zod issue JSON, Azure response
    // bodies, and environment-variable names.
    console.error("[POST /api/notes/upload] generation failed", error);
    return NextResponse.json(
      { error: "Could not generate notes from that file." },
      { status: 502 },
    );
  }

  // A DB failure here would silently discard 30-90s of paid Azure + Gemini
  // work, so it is guarded and reported rather than falling through to a
  // generic 500.
  const insertNotes = () =>
    db
      .insert(note)
      .values(
        generated.topics.map((topic, index) => ({
          userId: session.user.id,
          title:
            generated.topics.length === 1 ? title : `${title} - ${topic.title}`,
          classId,
          sourceType: "upload" as const,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          embedding: topic.embedding,
          embeddingUpdatedAt: new Date(),
          markdown: topic.markdown,
          content: {
            ...markdownToNoteDocument(topic.markdown),
            noteGeneration: {
              fileName: file.name,
              sourceTitle: title,
              topicTitle: topic.title,
              topicIndex: index,
              topicCount: generated.topics.length,
              markdown: topic.markdown,
              embedding: topic.embedding,
              embeddingDimensions: topic.embedding.length,
              embeddingModel: process.env.GEMINI_EMBEDDINGS_MODEL,
            },
          },
        })),
      )
      .returning();

  let created: Awaited<ReturnType<typeof insertNotes>>;
  try {
    created = await insertNotes();
  } catch (error) {
    console.error("[POST /api/notes/upload] insert failed after generation", error);
    return NextResponse.json(
      { error: "The file was processed but the notes could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      notes: created,
      parsedTextLength: generated.parsedText.length,
      markdown: generated.markdown,
      topics: generated.topics.map((topic, index) => ({
        noteId: created[index]?.id,
        title: topic.title,
        markdown: topic.markdown,
        embedding: topic.embedding,
      })),
    },
    { status: 201 },
  );
}
