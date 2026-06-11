import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setClassArchived } from "@/lib/classes/archive";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ runId: string }> };

export async function PATCH(request: Request, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { archived?: unknown };
  try {
    body = (await request.json()) as { archived?: unknown };
  } catch {
    body = {};
  }

  const archived = body.archived !== false;
  const { runId } = await ctx.params;

  try {
    const updated = await setClassArchived({
      userId: session.user.id,
      runId,
      archived,
    });

    if (!updated) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, archived });
  } catch (error) {
    console.error("[PATCH /api/classes/[runId]/archive]", error);
    return NextResponse.json({ error: "Could not update class archive state" }, { status: 500 });
  }
}
