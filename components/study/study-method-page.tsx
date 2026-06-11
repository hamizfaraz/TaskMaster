import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";

type StudyMethodPageProps = {
  eyebrow?: string;
  title: string;
  description: string;
  detailTitle: string;
  detailDescription: string;
  children?: ReactNode;
};

export function StudyMethodPage({
  detailTitle,
  detailDescription,
  children,
}: StudyMethodPageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
        {children}
        <EmptyState eyebrow="Scaffolded" title={detailTitle} description={detailDescription} />
      </div>
    </div>
  );
}
