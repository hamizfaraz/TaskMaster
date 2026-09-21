import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mindMap } from "@/lib/db/schema";
import { hasMindMapStorage, mindMapStorageUnavailableMessage } from "@/lib/mind-maps/storage";

type GuardResult = { ok: false; response: NextResponse } | { ok: true; userId: string };

/**
 * Shared gate for every mind-map API handler: requires a session and that the
 * mind_map tables have been migrated. Mirrors the auth + storage guard used by
 * the quizzes routes.
 */
export async function guardMindMapRequest(): Promise<GuardResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!(await hasMindMapStorage())) {
    return {
      ok: false,
      response: NextResponse.json({ error: mindMapStorageUnavailableMessage }, { status: 503 }),
    };
  }

  return { ok: true, userId: session.user.id };
}

/** Returns the map only if it exists and belongs to the user, else null. */
export async function loadOwnedMap(mapId: string, userId: string) {
  const [row] = await db
    .select()
    .from(mindMap)
    .where(and(eq(mindMap.id, mapId), eq(mindMap.userId, userId)))
    .limit(1);

  return row ?? null;
}
