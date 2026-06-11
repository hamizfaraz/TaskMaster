import hljs from "highlight.js/lib/common";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type HighlightResult = {
  html: string;
  /** The language actually used (explicit hint or hljs auto-detected). */
  language: string | null;
};

/**
 * Highlight `code` using highlight.js.
 *
 * If an explicit `language` is provided and hljs recognises it, that language
 * is used directly. Otherwise hljs.highlightAuto() is called and the detected
 * language is returned alongside the highlighted HTML.
 */
export function highlightCode(code: string, language?: string): HighlightResult {
  if (code.trim().length === 0) {
    return { html: escapeHtml(code), language: language ?? null };
  }

  if (language && hljs.getLanguage(language)) {
    const result = hljs.highlight(code, { language });
    return { html: result.value, language };
  }

  const result = hljs.highlightAuto(code);
  return { html: result.value, language: result.language ?? null };
}
