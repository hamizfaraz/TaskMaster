import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireServerSession } from "@/lib/auth-session";
import { isParseTestEnabled } from "@/lib/parse-test/feature";
import { getParseTestRunSummaries, getParseTestViewModelForRun } from "@/lib/parse-test/service";
import { ParseTestClient } from "@/app/parse-test/parse-test-client";
import { ReviewWizard } from "@/app/parse-test/components/review-wizard";

export default async function ParseTestPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  if (!isParseTestEnabled()) {
    notFound();
  }

  const session = await requireServerSession("/parse-test");
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const runParam = Array.isArray(searchParams?.run) ? searchParams.run[0] : searchParams?.run;
  const reviewParam = Array.isArray(searchParams?.review) ? searchParams.review[0] : searchParams?.review;
  const runSummaries = await getParseTestRunSummaries(session.user.id);
  const selectedSummary =
    (runParam ? runSummaries.find((summary) => summary.runId === runParam) : null) ??
    runSummaries[0] ??
    null;
  const preview = selectedSummary
    ? await getParseTestViewModelForRun(session.user.id, selectedSummary.runId)
    : null;
  const showReview = reviewParam === "1" && Boolean(preview);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {showReview && preview ? (
        <div className="h-full overflow-y-auto p-3">
          <ReviewWizard preview={preview} />
        </div>
      ) : (
        <ParseTestClient />
      )}
    </div>
  );
}
