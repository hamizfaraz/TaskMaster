import { createHash, randomUUID } from "node:crypto";
import {
  createProcessingRun,
  findExistingCompletedCourseForUser,
  getCompletedSyllabusParseCache,
  getParseTestViewModelForRun,
  getUserParseTestRuns,
  markSyllabusParseCacheCompleted,
  markSyllabusParseCacheFailed,
  markSyllabusParseCacheProcessing,
  persistCompletedParse,
  replaceCurrentRunWithFailure,
  upsertNebulaCourseSectionCache,
} from "../data/repository";
import { ParseActivityLogger, ParseTestError, toPublicParseTestError } from "../errors";
import { getParseTestModel } from "../feature";
import { parseSyllabusWithGemini } from "../gemini/parse";
import { validateSyllabusCandidate } from "../validation/syllabus";
import {
  applyNebulaSectionToPayload,
  findBestNebulaSectionForPayload,
  toNebulaCourseSectionCacheRow,
} from "@/lib/nebula/match";

function logParseTestStep(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[ParseTest] ${message}`, details);
    return;
  }

  console.info(`[ParseTest] ${message}`);
}

async function loadViewModelOrThrow(userId: string, runId: string) {
  const viewModel = await getParseTestViewModelForRun(userId, runId);
  if (!viewModel) {
    throw new ParseTestError("ParseTest saved the syllabus but could not reload the preview from SQL.", 500);
  }

  return viewModel;
}

function createExistingClassMessage(params: {
  courseCode: string | null;
  courseSection: string | null;
  term: string | null;
}) {
  const classLabel = [
    params.courseCode,
    params.courseSection ? `Section ${params.courseSection}` : null,
    params.term,
  ]
    .filter(Boolean)
    .join(" ");

  return classLabel
    ? `${classLabel} already exists in your account.`
    : "This class already exists in your account.";
}

export async function replaceParseTestWithUpload(params: {
  userId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  onLog?: ParseActivityLogger;
}) {
  const { userId, fileBuffer, fileName, mimeType, fileSizeBytes, onLog } = params;
  const logs: string[] = [];
  const log: ParseActivityLogger = (message) => {
    logs.push(message);
    onLog?.(message);
  };

  log(`Received upload "${fileName}" (${Math.round(fileSizeBytes / 1024)} KB).`);
  const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
  const parseModel = getParseTestModel();
  let runId: string | null = null;
  let sharedCacheWriteStarted = false;

  try {
    log("Computed the SHA-256 hash for duplicate detection.");
    logParseTestStep("Upload received and hash computed.", {
      fileName,
      fileSizeBytes,
      mimeType,
      contentHashPrefix: contentHash.slice(0, 12),
    });
    validateSyllabusCandidate(fileName, fileBuffer, log);
    logParseTestStep("Upload passed syllabus validation.", {
      contentHashPrefix: contentHash.slice(0, 12),
    });
    log("Checking your existing saved classes for an identical completed parse.");
    const userRuns = await getUserParseTestRuns(userId);
    const processingRun = userRuns.find((run) => run.parseStatus === "processing") ?? null;
    const duplicateRun =
      userRuns.find((run) => run.contentHash === contentHash && run.parseStatus === "completed") ?? null;
    logParseTestStep("Checked user-owned ParseTest runs.", {
      contentHashPrefix: contentHash.slice(0, 12),
      userRunCount: userRuns.length,
      hasProcessingRun: Boolean(processingRun),
      hasUserDuplicate: Boolean(duplicateRun),
    });

    if (processingRun) {
      log("Another ParseTest job is already processing for this account.");
      logParseTestStep("Blocked upload because this account already has a processing run.", {
        processingRunId: processingRun.id,
      });
      throw new ParseTestError("ParseTest is already processing a syllabus. Wait for it to finish and try again.", 409);
    }

    if (duplicateRun) {
      log("Found an existing completed class with the same file hash.");
      logParseTestStep("Blocked upload because this exact syllabus already exists in this account.", {
        runId: duplicateRun.id,
        contentHashPrefix: contentHash.slice(0, 12),
      });
      throw new ParseTestError("This syllabus has already been uploaded for a class in your account.", 409);
    }

    const cachedParse = await getCompletedSyllabusParseCache(contentHash);
    logParseTestStep("Checked shared syllabus parse cache.", {
      contentHashPrefix: contentHash.slice(0, 12),
      cacheHit: Boolean(cachedParse),
    });
    if (cachedParse) {
      let cachedPayload = cachedParse.payload;
      let cachedNebulaSectionId = cachedParse.nebulaSectionId;
      let cachedNebulaMatchConfidence = cachedParse.nebulaMatchConfidence;

      if (!cachedNebulaSectionId) {
        try {
          log("Retrying Nebula metadata lookup for the cached syllabus parse.");
          logParseTestStep("Retrying Nebula match for shared cache without section metadata.", {
            contentHashPrefix: contentHash.slice(0, 12),
            courseCode: cachedPayload.courseCode,
            courseSection: cachedPayload.courseSection,
            term: cachedPayload.term,
            instructorName: cachedPayload.instructorName,
          });
          const nebulaMatch = await findBestNebulaSectionForPayload(cachedPayload);
          if (nebulaMatch) {
            const cacheRow = toNebulaCourseSectionCacheRow(nebulaMatch.section);
            await upsertNebulaCourseSectionCache(cacheRow);
            cachedPayload = applyNebulaSectionToPayload(cachedPayload, nebulaMatch.section);
            cachedNebulaSectionId = nebulaMatch.section._id;
            cachedNebulaMatchConfidence = nebulaMatch.confidence;
            await markSyllabusParseCacheCompleted({
              contentHash,
              geminiFileUri: cachedParse.geminiFileUri ?? "",
              parsedPayload: cachedParse.payload,
              mergedPayload: cachedPayload,
              nebulaSectionId: cachedNebulaSectionId,
              nebulaMatchConfidence: cachedNebulaMatchConfidence,
            });
            logParseTestStep("Shared cache Nebula metadata refreshed.", {
              contentHashPrefix: contentHash.slice(0, 12),
              nebulaSectionId: cachedNebulaSectionId,
              confidence: cachedNebulaMatchConfidence,
              reasons: nebulaMatch.reasons,
              nebulaCourse: `${cacheRow.subjectPrefix ?? ""} ${cacheRow.courseNumber ?? ""}`.trim(),
              nebulaSection: cacheRow.sectionNumber,
              nebulaTerm: cacheRow.academicSessionName,
              nebulaProfessors: cacheRow.professorNames,
            });
          } else {
            logParseTestStep("Shared cache Nebula retry found no confident match.", {
              contentHashPrefix: contentHash.slice(0, 12),
              courseCode: cachedPayload.courseCode,
              courseSection: cachedPayload.courseSection,
              term: cachedPayload.term,
            });
          }
        } catch (error) {
          console.error("[ParseTest Nebula cache retry]", error);
          logParseTestStep("Shared cache Nebula retry failed; using cached parse only.", {
            contentHashPrefix: contentHash.slice(0, 12),
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      const existingClass = await findExistingCompletedCourseForUser(userId, cachedPayload);
      if (existingClass) {
        log("This class already exists in your account.");
        logParseTestStep("Blocked shared-cache upload because the class already exists in this account.", {
          existingRunId: existingClass.runId,
          courseCode: existingClass.courseCode,
          courseSection: existingClass.courseSection,
          term: existingClass.term,
          instructorName: existingClass.instructorName,
        });
        throw new ParseTestError(
          createExistingClassMessage({
            courseCode: existingClass.courseCode,
            courseSection: existingClass.courseSection,
            term: existingClass.term,
          }),
          409,
        );
      }

      log("Found this syllabus in the shared parse cache. Creating a class copy for this account.");
      logParseTestStep("Shared cache hit; creating user-owned class copy.", {
        contentHashPrefix: contentHash.slice(0, 12),
        parseModel: cachedParse.parseModel,
        nebulaSectionId: cachedNebulaSectionId,
        nebulaMatchConfidence: cachedNebulaMatchConfidence,
      });
      runId = randomUUID();
      await createProcessingRun({
        runId,
        userId,
        contentHash,
        fileName,
        mimeType,
        fileSizeBytes,
        parseModel: cachedParse.parseModel,
      });
      await persistCompletedParse({
        runId,
        geminiFileUri: cachedParse.geminiFileUri ?? "",
        payload: cachedPayload,
      });

      const viewModel = await loadViewModelOrThrow(userId, runId);
      log("Loaded the cached syllabus preview successfully.");
      logParseTestStep("User-owned class created from shared cache.", {
        runId,
        contentHashPrefix: contentHash.slice(0, 12),
      });
      return { isDuplicate: true, runId, viewModel, logs };
    }

    runId = randomUUID();

    log("No duplicate found. Creating a new processing run in SQL.");
    await createProcessingRun({
      runId,
      userId,
      contentHash,
      fileName,
      mimeType,
      fileSizeBytes,
      parseModel,
    });
    logParseTestStep("Created new user-owned processing run.", {
      runId,
      contentHashPrefix: contentHash.slice(0, 12),
      parseModel,
    });
    sharedCacheWriteStarted = await markSyllabusParseCacheProcessing({
      contentHash,
      fileName,
      mimeType,
      fileSizeBytes,
      parseModel,
    });
    logParseTestStep("Attempted to claim shared cache row for this hash.", {
      contentHashPrefix: contentHash.slice(0, 12),
      claimedByThisRequest: sharedCacheWriteStarted,
    });

    logParseTestStep("Starting Gemini syllabus extraction.", {
      runId,
      contentHashPrefix: contentHash.slice(0, 12),
    });
    const { payload, geminiFileUri } = await parseSyllabusWithGemini(fileName, fileBuffer, log);
    logParseTestStep("Gemini syllabus extraction completed.", {
      runId,
      courseCode: payload.courseCode,
      courseSection: payload.courseSection,
      term: payload.term,
      instructorName: payload.instructorName,
      assignmentCount: payload.assignments.length,
      eventCount: payload.events.length,
    });
    let mergedPayload = payload;
    let nebulaSectionId: string | null = null;
    let nebulaMatchConfidence: number | null = null;

    try {
      log("Checking Nebula for matching official course section metadata.");
      logParseTestStep("Starting Nebula section match.", {
        runId,
        courseCode: payload.courseCode,
        courseSection: payload.courseSection,
        term: payload.term,
        instructorName: payload.instructorName,
      });
      const nebulaMatch = await findBestNebulaSectionForPayload(payload);
      if (nebulaMatch) {
        const cacheRow = toNebulaCourseSectionCacheRow(nebulaMatch.section);
        await upsertNebulaCourseSectionCache(cacheRow);
        mergedPayload = applyNebulaSectionToPayload(payload, nebulaMatch.section);
        nebulaSectionId = nebulaMatch.section._id;
        nebulaMatchConfidence = nebulaMatch.confidence;
        logParseTestStep("Nebula section match accepted and merged.", {
          runId,
          nebulaSectionId,
          confidence: nebulaMatchConfidence,
          reasons: nebulaMatch.reasons,
          nebulaCourse: `${cacheRow.subjectPrefix ?? ""} ${cacheRow.courseNumber ?? ""}`.trim(),
          nebulaSection: cacheRow.sectionNumber,
          nebulaTerm: cacheRow.academicSessionName,
          nebulaProfessors: cacheRow.professorNames,
        });
        log(
          `Matched Nebula section metadata (${nebulaMatch.reasons.join(", ")}).`,
        );
      } else {
        logParseTestStep("No confident Nebula section match found.", {
          runId,
          courseCode: payload.courseCode,
          courseSection: payload.courseSection,
          term: payload.term,
        });
        log("No confident Nebula section match found. Keeping the syllabus parse as-is.");
      }
    } catch (error) {
      console.error("[ParseTest Nebula match]", error);
      logParseTestStep("Nebula lookup failed; continuing without official metadata.", {
        runId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      log("Nebula lookup failed. Continuing with the syllabus parse only.");
    }

    const existingClass = await findExistingCompletedCourseForUser(userId, mergedPayload);
    if (existingClass) {
      log("This class already exists in your account.");
      logParseTestStep("Blocked parsed upload because the class already exists in this account.", {
        existingRunId: existingClass.runId,
        courseCode: existingClass.courseCode,
        courseSection: existingClass.courseSection,
        term: existingClass.term,
        instructorName: existingClass.instructorName,
      });
      throw new ParseTestError(
        createExistingClassMessage({
          courseCode: existingClass.courseCode,
          courseSection: existingClass.courseSection,
          term: existingClass.term,
        }),
        409,
      );
    }

    await markSyllabusParseCacheCompleted({
      contentHash,
      geminiFileUri,
      parsedPayload: payload,
      mergedPayload,
      nebulaSectionId,
      nebulaMatchConfidence,
    });
    logParseTestStep("Shared syllabus parse cache marked completed.", {
      contentHashPrefix: contentHash.slice(0, 12),
      nebulaSectionId,
      nebulaMatchConfidence,
    });

    log("Persisting the normalized course graph to SQL.");
    await persistCompletedParse({
      runId,
      geminiFileUri,
      payload: mergedPayload,
    });
    logParseTestStep("Persisted user-owned parsed course graph.", {
      runId,
      courseCode: mergedPayload.courseCode,
      courseSection: mergedPayload.courseSection,
      term: mergedPayload.term,
      instructorName: mergedPayload.instructorName,
    });

    log("Reloading the saved preview from SQL.");
    const viewModel = await loadViewModelOrThrow(userId, runId);

    log("Saved preview loaded successfully.");
    logParseTestStep("ParseTest upload flow completed.", {
      runId,
      contentHashPrefix: contentHash.slice(0, 12),
      usedNebula: Boolean(nebulaSectionId),
      usedSharedCache: false,
    });
    return { isDuplicate: false, runId, viewModel, logs };
  } catch (error) {
    const publicError = toPublicParseTestError(error);

    log(`Parse failed: ${publicError.message}`);
    logParseTestStep("ParseTest upload flow failed.", {
      runId,
      contentHashPrefix: contentHash.slice(0, 12),
      message: publicError.message,
      status: publicError.status,
    });
    if (runId) {
      await replaceCurrentRunWithFailure(runId, userId, publicError.message);
    }
    if (sharedCacheWriteStarted) {
      await markSyllabusParseCacheFailed({
        contentHash,
        message: publicError.message,
      });
    }

    throw new ParseTestError(publicError.message, publicError.status, {
      ...(publicError.details ?? {}),
      logs,
    });
  }
}
