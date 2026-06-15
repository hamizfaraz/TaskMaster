"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cx } from "@/lib/utils";

/**
 * Read-only markdown renderer for a note during a study session. Mirrors the
 * flashcards/quizzes pattern (remark-gfm + remark-math + rehype-katex) with a
 * slightly richer component map since notes can be long-form.
 */
export function MarkdownText({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "min-w-0 space-y-3 text-[0.95rem] leading-relaxed text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold tracking-tight">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
