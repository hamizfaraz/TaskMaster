import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const studyPages = [
  { href: "/study/pomodoro", title: "Pomodoro", description: "A real local timer you can use today.", live: true },
  { href: "/study/feynman", title: "Feynman", description: "Explanation-first study workflow scaffold.", live: false },
  { href: "/study/active-recall", title: "Active recall", description: "Timed bullet-point recall scaffold.", live: false },
  { href: "/study/cheat-sheet", title: "Cheat sheet", description: "Split-pane note and summary scaffold.", live: false },
  { href: "/study/associations", title: "Associations", description: "Mind-map style association builder scaffold.", live: false },
  { href: "/study/spaced-repetition", title: "Spaced repetition", description: "Review scheduling scaffold.", live: false },
] as const;

export default function StudyPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {studyPages.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition hover:border-border-strong hover:bg-surface-muted">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.live ? "accent" : "outline"}>{item.live ? "Live" : "Scaffolded"}</Badge>
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Open page</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
