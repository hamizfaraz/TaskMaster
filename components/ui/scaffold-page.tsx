import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";

type ScaffoldPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function ScaffoldPage({
  emptyTitle,
  emptyDescription,
  action,
  children,
}: ScaffoldPageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
        {children}
        <EmptyState eyebrow="Scaffolded" title={emptyTitle} description={emptyDescription} action={action} />
      </div>
    </div>
  );
}
