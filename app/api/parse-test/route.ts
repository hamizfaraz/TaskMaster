import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MAX_PARSE_TEST_FILE_BYTES, parseTestReviewUpdateSchema } from "@/lib/parse-test/contracts";
import { isParseTestEnabled } from "@/lib/parse-test/feature";
import {
  deleteParseTestRun,
  getParseTestErrorResponse,
  updateParseTestReview,
} from "@/lib/parse-test/service";
import { createParseTestUploadStream, jsonError } from "./streaming";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isParseTestEnabled()) {
    return jsonError("ParseTest is disabled.", 404);
  }

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return jsonError("Sign in before uploading a syllabus.", 401);
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return jsonError("Upload a PDF in the `file` field.", 400);
    }

    if (fileEntry.type !== "application/pdf") {
      return jsonError("Only PDF syllabi are supported in ParseTest.", 400);
    }

    if (fileEntry.size === 0) {
      return jsonError("The uploaded PDF is empty.", 400);
    }

    if (fileEntry.size > MAX_PARSE_TEST_FILE_BYTES) {
      return jsonError("The uploaded PDF exceeds the 20 MB ParseTest limit.", 400);
    }

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
    const stream = createParseTestUploadStream({
      userId: session.user.id,
      fileBuffer,
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      fileSizeBytes: fileEntry.size,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const { message, status, details } = getParseTestErrorResponse(error);
    return jsonError(message, status, Array.isArray(details?.logs) ? (details.logs as string[]) : []);
  }
}

export async function PATCH(request: Request) {
  if (!isParseTestEnabled()) {
    return jsonError("ParseTest is disabled.", 404);
  }

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return jsonError("Sign in before updating a saved class.", 401);
    }

    const body = await request.json();
    const parsed = parseTestReviewUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Review values could not be saved. Check required fields and try again.", 400);
    }

    const viewModel = await updateParseTestReview({
      userId: session.user.id,
      payload: parsed.data,
    });

    return NextResponse.json({ ok: true, viewModel });
  } catch (error) {
    const { message, status, details } = getParseTestErrorResponse(error);
    return jsonError(message, status, Array.isArray(details?.logs) ? (details.logs as string[]) : []);
  }
}

export async function DELETE(request: Request) {
  if (!isParseTestEnabled()) {
    return jsonError("ParseTest is disabled.", 404);
  }

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return jsonError("Sign in before deleting a saved class.", 401);
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return jsonError("Provide a runId to delete.", 400);
    }

    const result = await deleteParseTestRun({
      userId: session.user.id,
      runId,
    });

    return NextResponse.json({
      ok: true,
      nextRunId: result.nextRunId,
    });
  } catch (error) {
    const { message, status, details } = getParseTestErrorResponse(error);
    return jsonError(message, status, Array.isArray(details?.logs) ? (details.logs as string[]) : []);
  }
}
