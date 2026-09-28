import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { suggestKeyPoints } from "@/lib/agent/key-point-agent";

export const runtime = "nodejs";
// A tool loop makes several model calls; the platform default can be shorter.
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Ask the agent which points in this note are worth marking.
 *
 * Read-only: it returns proposals, never writes a highlight. The acting user
 * comes from the session and is passed to the agent, which closes over it so
 * no tool can be steered at another account's notes.
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const result = await suggestKeyPoints({ userId: session.user.id, noteId: id });

    if (!result.ok) {
      if (result.reason === "not-found") {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
      }
      if (result.reason === "empty") {
        return NextResponse.json({ suggestions: [] });
      }
      if (result.reason === "rate-limited") {
        return NextResponse.json({ error: result.message }, { status: 429 });
      }
      return NextResponse.json(
        { error: "Could not work out the key points for this note." },
        { status: 502 },
      );
    }

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    console.error("[POST /api/notes/:id/key-points]", error);
    return NextResponse.json({ error: "Could not work out the key points." }, { status: 500 });
  }
}
