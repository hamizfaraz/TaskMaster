import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { cheatSheet } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { assertClassBelongsToUser } from "@/lib/classes/queries";
import { normalizeNoteWriteContent } from "@/lib/notes/persistence";
import {
  cheatSheetStorageUnavailableMessage,
  hasCheatSheetStorage,
} from "@/lib/cheat-sheets/storage";

export const runtime = "nodejs";

// GET /api/cheat-sheets - list the authenticated user's cheat sheets
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasCheatSheetStorage())) {
    return NextResponse.json(
      { error: cheatSheetStorageUnavailableMessage },
      { status: 503 },
    );
  }

  try {
    const sheets = await db
      .select({
        id: cheatSheet.id,
        title: cheatSheet.title,
        classId: cheatSheet.classId,
        content: cheatSheet.content,
        markdown: cheatSheet.markdown,
        createdAt: cheatSheet.createdAt,
        updatedAt: cheatSheet.updatedAt,
      })
      .from(cheatSheet)
      .where(eq(cheatSheet.userId, session.user.id))
      .orderBy(desc(cheatSheet.updatedAt));

    return NextResponse.json(sheets);
  } catch (error) {
    console.error("[GET /api/cheat-sheets]", error);
    return NextResponse.json(
      { error: "Could not load cheat sheets" },
      { status: 500 },
    );
  }
}

// POST /api/cheat-sheets - create a manual cheat sheet
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await hasCheatSheetStorage())) {
    return NextResponse.json(
      { error: cheatSheetStorageUnavailableMessage },
      { status: 503 },
    );
  }

  let body: { title?: string; content?: unknown; classId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled";
  const classId =
    body.classId === null
      ? null
      : typeof body.classId === "string"
        ? body.classId
        : null;

  if (classId) {
    const ownedClass = await assertClassBelongsToUser(classId, session.user.id);
    if (!ownedClass) {
      return NextResponse.json(
        { error: "Invalid class selection" },
        { status: 400 },
      );
    }
  }

  let content: ReturnType<typeof normalizeNoteWriteContent>;
  try {
    content = normalizeNoteWriteContent(body.content);
  } catch {
    return NextResponse.json(
      { error: "Invalid cheat sheet content" },
      { status: 400 },
    );
  }

  try {
    const [created] = await db
      .insert(cheatSheet)
      .values({
        userId: session.user.id,
        title,
        classId,
        content: content.document,
        markdown: content.markdown,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/cheat-sheets]", error);
    return NextResponse.json(
      { error: "Could not create cheat sheet" },
      { status: 500 },
    );
  }
}
