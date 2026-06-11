"use client";

import { highlightCode } from "@/lib/notes/code-highlighter";
import type { NoteCodeBlockData } from "@/lib/notes/types";

type CodeBlockViewProps = {
  data: NoteCodeBlockData;
};

export function CodeBlockView({ data }: CodeBlockViewProps) {
  return (
    <div className="note-code-block note-code-block--read">
      <pre className="note-code-block__surface">
        <code
          className="hljs note-code-block__code"
          dangerouslySetInnerHTML={{
            __html:
              data.code.trim().length > 0
                ? highlightCode(data.code).html
                : "<span class=\"note-code-block__placeholder\">No code yet.</span>",
          }}
        />
      </pre>
    </div>
  );
}
