import katex from "katex";

/**
 * Cached KaTeX rendering, shared by the math and table widgets.
 *
 * The cache matters: decorations rebuild on every keystroke and every selection
 * move, so the same formula is asked for repeatedly. Keyed on display mode as
 * well as the source, because the two render differently.
 */
const katexCache = new Map<string, string>();

export function renderKatexHtml(latex: string, display: boolean) {
  const key = `${display ? "D" : "I"}${latex}`;
  let html = katexCache.get(key);
  if (html === undefined) {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      output: "htmlAndMathml",
    });
    katexCache.set(key, html);
  }
  return html;
}
