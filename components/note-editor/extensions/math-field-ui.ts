import type { MathfieldElement } from "mathlive";

/**
 * The `<math-field>` setup shared by every place a formula is edited.
 *
 * These attributes *are* the editing behaviour: `smart-mode` and the manual
 * virtual-keyboard policy are why Backspace removes a fraction as a unit and why
 * no on-screen keyboard appears. A second copy that drifted would mean a formula
 * edited differently depending on whether it happened to sit inside a table.
 *
 * The wrapper class names are styled in `app/globals.css`, so a caller that uses
 * them inherits the same appearance for free.
 */
export function createMathFieldElement(latex: string, display: boolean): MathfieldElement {
  const field = document.createElement("math-field") as MathfieldElement;
  field.setAttribute("math-virtual-keyboard-policy", "manual");
  field.setAttribute("smart-mode", "on");
  field.setAttribute("placeholder", "\\frac{a}{b}");
  field.defaultMode = display ? "math" : "inline-math";
  field.value = latex;
  return field;
}

/**
 * Focus a field, tolerating a teardown race.
 *
 * MathLive nulls its keyboard delegate when the element is disconnected and its
 * `focus()` does not guard against that, so a focus call racing a teardown
 * throws. That must never reach the editor.
 */
export function focusMathField(field: MathfieldElement) {
  if (!field.isConnected) return;
  try {
    field.focus();
  } catch {
    // disposed mid-flight; whatever opened it is already closing
  }
}

/** The "LaTeX" toggle and the textarea it reveals, for editing the source directly. */
export function createLatexSourceUi(latex: string, rows: number) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "cm-note-mathfield-toggle";
  toggle.textContent = "LaTeX";
  toggle.title = "Edit the LaTeX directly";
  toggle.setAttribute("aria-pressed", "false");

  const source = document.createElement("textarea");
  source.className = "cm-note-mathfield-source";
  source.rows = rows;
  source.spellcheck = false;
  source.value = latex;
  source.hidden = true;
  source.setAttribute("aria-label", "LaTeX source");

  return { toggle, source };
}
