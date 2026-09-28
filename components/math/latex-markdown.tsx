"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkHighlight } from "@/lib/notes/remark-highlight";
import { cx } from "@/lib/utils";

type LatexMarkdownProps = {
  markdown: string;
  className?: string;
  codeClassName?: string;
};

export function LatexMarkdown({
  markdown,
  className,
  codeClassName,
}: LatexMarkdownProps) {
  return (
    <div className={cx("min-w-0 text-foreground", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        // remarkHighlight must follow remarkMath so `$a == b$` is already a
        // math node and cannot be split as a highlight.
        remarkPlugins={[remarkGfm, remarkMath, remarkHighlight]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          mark: ({ children }) => (
            <mark className="rounded-[0.2em] bg-accent-soft px-0.5 text-foreground">
              {children}
            </mark>
          ),
          code: ({ children, className: markdownCodeClassName }) => (
            <code
              className={cx(
                codeClassName ??
                  "rounded bg-surface-elevated px-1 py-0.5 font-mono text-[0.92em]",
                markdownCodeClassName,
              )}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface-muted p-3 text-sm">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
