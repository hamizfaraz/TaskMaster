import Link from "next/link";
import { getButtonClassName } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireServerSession } from "@/lib/auth-session";
import { listUserClasses } from "@/lib/classes/queries";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ClassesPage() {
  const session = await requireServerSession("/classes");
  const classes = await listUserClasses(session.user.id);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Classes</h1>
        <Link href="/parse-test" className={getButtonClassName("primary")}>
          Upload syllabus
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {classes.length === 0 ? (
          <EmptyState
            eyebrow="No classes yet"
            title="Upload your first syllabus"
            description="Once a syllabus is parsed, it will show up here as a real class card and immediately become available inside the notes workspace."
            action={
              <Link href="/parse-test" className={getButtonClassName("primary")}>
                Open syllabus upload
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {classes.map((item) => (
              <Link key={item.courseId} href={`/classes/${item.runId}`}>
                <Card className="h-full transition hover:border-border-strong hover:bg-surface-muted">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.courseCode ? <Badge variant="accent">{item.courseCode}</Badge> : null}
                      {item.courseSection ? <Badge variant="outline">Section {item.courseSection}</Badge> : null}
                      <Badge variant="outline">{item.noteCount} note{item.noteCount === 1 ? "" : "s"}</Badge>
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>
                      {item.instructorName ? `${item.instructorName} · ` : ""}
                      {item.meetingDays || item.meetingTime
                        ? `${item.meetingDays ?? "Schedule TBD"} ${item.meetingTime ?? ""}`.trim()
                        : "Schedule pending from syllabus"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      {item.meetingLocation ?? "Location not extracted yet"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {formatTimestamp(item.updatedAt)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
