import {
  deleteParseTestRunRecord,
  getParseTestViewModel,
  getParseTestViewModelForRun,
  updateParseTestReviewedValues,
} from "./data/repository";
import { getNormalizedParseTestSchedule, getParseTestRunSummaries } from "./data/queries";
import type { ParseTestReviewUpdate } from "./contracts";
import { ParseTestError, toPublicParseTestError } from "./errors";
import { replaceParseTestWithUpload } from "./upload/replace";

export {
  getParseTestRunSummaries,
  getParseTestViewModel,
  getParseTestViewModelForRun,
  getNormalizedParseTestSchedule,
  replaceParseTestWithUpload,
};

export async function updateParseTestReview(params: { userId: string; payload: ParseTestReviewUpdate }) {
  const viewModel = await updateParseTestReviewedValues(params.userId, params.payload);

  if (!viewModel) {
    throw new ParseTestError("That saved class could not be found.", 404);
  }

  return viewModel;
}

export async function deleteParseTestRun(params: { userId: string; runId: string }) {
  const result = await deleteParseTestRunRecord(params);

  if (!result) {
    throw new ParseTestError("That saved class could not be found.", 404);
  }

  return result;
}

export function getParseTestErrorResponse(error: unknown) {
  const publicError = toPublicParseTestError(error);

  return {
    message: publicError.message,
    status: publicError.status,
    details: publicError.details,
  };
}
