import type { BlockTool, BlockToolConstructorOptions, ToolboxConfig } from "@editorjs/editorjs";
import { highlightCode } from "@/lib/notes/code-highlighter";
import type { NoteCodeBlockData } from "@/lib/notes/types";

const CODE_TOOL_ICON = `
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 6L3.5 10L7 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13 6L16.5 10L13 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11.2 4.5L8.8 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;

export class CodeBlockTool implements BlockTool {
  public static get toolbox(): ToolboxConfig {
    return {
      title: "Code",
      icon: CODE_TOOL_ICON,
    };
  }

  public static get enableLineBreaks() {
    return true;
  }

  public static get isReadOnlySupported() {
    return true;
  }

  private readonly readOnly: boolean;
  private data: NoteCodeBlockData;
  private textarea: HTMLTextAreaElement | null = null;
  private highlightSurface: HTMLPreElement | null = null;
  private highlightCodeNode: HTMLElement | null = null;
  private langLabelNode: HTMLSpanElement | null = null;
  private layoutFrameId: number | null = null;

  private readonly handleTextareaInput = () => {
    this.syncData();
    this.syncHighlight();
    this.syncTextareaHeight();
  };

  private readonly handleTextareaScroll = () => {
    if (!this.textarea || !this.highlightSurface) {
      return;
    }

    this.highlightSurface.scrollTop = this.textarea.scrollTop;
    this.highlightSurface.scrollLeft = this.textarea.scrollLeft;
  };

  private readonly handleTextareaKeyDown = (event: KeyboardEvent) => {
    if (!this.textarea) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      const { selectionStart, selectionEnd, value } = this.textarea;
      const nextValue = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;

      this.textarea.value = nextValue;
      this.textarea.selectionStart = selectionStart + 1;
      this.textarea.selectionEnd = selectionStart + 1;

      this.syncData();
      this.syncHighlight();
      this.syncTextareaHeight();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();

      const { selectionStart, selectionEnd, value } = this.textarea;
      const nextValue = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;

      this.textarea.value = nextValue;
      this.textarea.selectionStart = selectionStart + 2;
      this.textarea.selectionEnd = selectionStart + 2;

      this.syncData();
      this.syncHighlight();
      this.syncTextareaHeight();
    }
  };

  constructor({ data, readOnly }: BlockToolConstructorOptions<NoteCodeBlockData>) {
    this.readOnly = readOnly;
    this.data = {
      code: data.code ?? "",
      language: data.language,
    };
  }

  public render() {
    const wrapper = document.createElement("div");
    wrapper.className = "note-code-block";

    // ---- Header row: language label ----
    const header = document.createElement("div");
    header.className = "note-code-block__header";

    const langLabel = document.createElement("span");
    langLabel.className = "note-code-block__lang";
    this.langLabelNode = langLabel;
    header.append(langLabel);

    wrapper.append(header);

    // ---- Editor area ----
    const editorSurface = document.createElement("div");
    editorSurface.className = "note-code-block__editor";

    const surface = document.createElement("pre");
    surface.className = "note-code-block__surface";
    surface.setAttribute("aria-hidden", "true");
    this.highlightSurface = surface;

    this.highlightCodeNode = document.createElement("code");
    this.highlightCodeNode.className = "hljs note-code-block__code";
    surface.append(this.highlightCodeNode);
    editorSurface.append(surface);

    if (!this.readOnly) {
      this.textarea = document.createElement("textarea");
      this.textarea.className = "note-code-block__textarea";
      this.textarea.value = this.data.code;
      this.textarea.placeholder = "Paste or write code here.";
      this.textarea.rows = 1;
      this.textarea.wrap = "soft";
      this.textarea.spellcheck = false;
      this.textarea.addEventListener("input", this.handleTextareaInput);
      this.textarea.addEventListener("scroll", this.handleTextareaScroll);
      this.textarea.addEventListener("keydown", this.handleTextareaKeyDown);
      editorSurface.append(this.textarea);
    }

    wrapper.append(editorSurface);

    this.syncHighlight();
    this.syncTextareaHeight();
    this.handleTextareaScroll();
    this.scheduleLayoutSync();

    return wrapper;
  }

  public save() {
    this.syncData();
    return this.data;
  }

  public validate(blockData: NoteCodeBlockData) {
    return typeof blockData.code === "string";
  }

  public destroy() {
    if (this.layoutFrameId !== null) {
      window.cancelAnimationFrame(this.layoutFrameId);
      this.layoutFrameId = null;
    }

    this.textarea?.removeEventListener("input", this.handleTextareaInput);
    this.textarea?.removeEventListener("scroll", this.handleTextareaScroll);
    this.textarea?.removeEventListener("keydown", this.handleTextareaKeyDown);

    this.textarea = null;
    this.highlightSurface = null;
    this.highlightCodeNode = null;
    this.langLabelNode = null;
  }

  private scheduleLayoutSync() {
    if (typeof window === "undefined") {
      return;
    }

    const runLayoutSync = () => {
      this.syncTextareaHeight();
      this.handleTextareaScroll();
    };

    if (this.layoutFrameId !== null) {
      window.cancelAnimationFrame(this.layoutFrameId);
    }

    this.layoutFrameId = window.requestAnimationFrame(() => {
      runLayoutSync();
      this.layoutFrameId = window.requestAnimationFrame(() => {
        runLayoutSync();
        this.layoutFrameId = null;
      });
    });
  }

  private syncData() {
    this.data = {
      code: this.textarea?.value ?? this.data.code,
      language: this.data.language,
    };
  }

  private syncHighlight() {
    if (!this.highlightCodeNode) {
      return;
    }

    if (this.data.code.trim().length === 0) {
      this.highlightCodeNode.innerHTML = this.readOnly
        ? "<span class=\"note-code-block__placeholder\">No code content.</span>"
        : "";
      this.updateLangLabel(null);
      return;
    }

    const result = highlightCode(this.data.code, this.data.language);
    this.highlightCodeNode.innerHTML = `${result.html}${
      this.data.code.endsWith("\n") ? "\n " : ""
    }`;
    this.updateLangLabel(result.language);
  }

  private updateLangLabel(detected: string | null) {
    if (!this.langLabelNode) return;
    const lang = this.data.language ?? detected;
    this.langLabelNode.textContent = lang ?? "";
    this.langLabelNode.style.display = lang ? "" : "none";
  }

  private syncTextareaHeight() {
    if (!this.textarea) {
      return;
    }

    this.textarea.style.height = "auto";
    if (this.highlightSurface) {
      this.highlightSurface.style.height = "auto";
    }

    const nextHeight = this.textarea.scrollHeight;
    this.textarea.style.height = `${nextHeight}px`;

    if (this.highlightSurface) {
      this.highlightSurface.style.height = `${nextHeight}px`;
    }
  }
}
