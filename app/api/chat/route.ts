import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAgentUIStreamResponse } from "ai";
import { baseAgent, type BaseAgentMessage } from "@/agent/base-agent";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // This route was unauthenticated. It costs model tokens on every call and is
  // the endpoint agent tools over per-user data would hang off, so anyone on
  // the internet could both bill the project and, once tools existed, reach
  // another user's notes. Guard first, tools later.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let messages: BaseAgentMessage[];
  try {
    const body = (await req.json()) as { messages?: BaseAgentMessage[] };
    if (!Array.isArray(body.messages)) {
      throw new Error("messages must be an array");
    }
    messages = body.messages;
  } catch (error) {
    console.error("[POST /api/chat] invalid body", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    return createAgentUIStreamResponse({
      agent: baseAgent,
      uiMessages: messages,
    });
  } catch (error) {
    console.error("[POST /api/chat]", error);
    return NextResponse.json({ error: "The assistant is unavailable." }, { status: 500 });
  }
}
