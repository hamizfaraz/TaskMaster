/**
 * Loads MathLive on demand and resolves once `<math-field>` is a defined
 * custom element. Memoized so the ~200 KB engine is fetched once, and only
 * when the user first edits a formula — never on editor mount.
 *
 * The previous integration relied on import order alone and never waited on
 * `customElements.whenDefined`, which meant an un-upgraded element could be
 * handed a `.value` that silently became a plain expando property.
 */

let loading: Promise<void> | null = null;

export function loadMathLive(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MathLive is browser-only."));
  }

  if (!loading) {
    loading = import("mathlive")
      .then(async ({ MathfieldElement }) => {
        // Fonts come from `mathlive/fonts.css` (imported in app/layout.tsx),
        // and the click/plonk sounds are not wanted in a note editor.
        MathfieldElement.fontsDirectory = null;
        MathfieldElement.soundsDirectory = null;
        MathfieldElement.plonkSound = null;
        await customElements.whenDefined("math-field");
      })
      .catch((error: unknown) => {
        loading = null; // allow a retry after a failed network fetch
        throw error;
      });
  }

  return loading;
}
