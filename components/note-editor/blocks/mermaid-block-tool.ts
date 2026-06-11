import type {
  API,
  BlockAPI,
  BlockTool,
  BlockToolConstructorOptions,
  ToolboxConfig,
} from "@editorjs/editorjs";
import {
  getMermaidErrorMessage,
  renderMermaidSvg,
} from "@/components/note-editor/blocks/mermaid-renderer";
import type { NoteMermaidBlockData } from "@/lib/notes/types";

const MERMAID_TOOL_ICON = `
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4.5H14V8.5H6V4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M3.5 12.5H8.5V16.5H3.5V12.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M11.5 12.5H16.5V16.5H11.5V12.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10 8.5V10.5M10 10.5H6V12.5M10 10.5H14V12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const SHOW_SOURCE_ICON = `
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const HIDE_SOURCE_ICON = `
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12L10 7L15 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export class MermaidBlockTool implements BlockTool {
  public static get toolbox(): ToolboxConfig {
    return {
      title: "Mermaid",
      icon: MERMAID_TOOL_ICON,
    };
  }

  public static get enableLineBreaks() {
    return true;
  }

  public static get isReadOnlySupported() {
    return true;
  }

  private readonly readOnly: boolean;
  private readonly api: API;
  private readonly block: BlockAPI;
  private data: NoteMermaidBlockData;
  private textarea: HTMLTextAreaElement | null = null;
  private toggleButton: HTMLButtonElement | null = null;
  private previewNode: HTMLDivElement | null = null;
  private renderTimer: number | null = null;
  private renderVersion = 0;

  private readonly stopEditorEventPropagation = (event: Event) => {
    event.stopPropagation();
  };

  private readonly handleTextareaInput = () => {
    this.syncData();
    this.syncTextareaHeight();
    this.schedulePreviewRender();
  };

  private readonly handleTextareaKeyDown = (event: KeyboardEvent) => {
    if (!this.textarea) {
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
      this.syncTextareaHeight();
      this.schedulePreviewRender();
      return;
    }

    this.stopEditorEventPropagation(event);
  };

  constructor({ api, block, data, readOnly }: BlockToolConstructorOptions<NoteMermaidBlockData>) {
    this.api = api;
    this.block = block;
    this.readOnly = readOnly;
    this.data = {
      code: data.code ?? "",
      sourceCollapsed: data.sourceCollapsed ?? false,
    };
  }

  public render() {
    const wrapper = document.createElement("div");
    wrapper.className = "note-mermaid-block";

    const header = document.createElement("div");
    header.className = "note-mermaid-block__header";

    const langLabel = document.createElement("span");
    langLabel.className = "note-mermaid-block__lang";
    langLabel.textContent = "mermaid";
    header.append(langLabel);

    if (!this.readOnly) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "note-mermaid-block__toggle";
      toggleButton.addEventListener("click", this.handleToggleSource);
      this.toggleButton = toggleButton;
      header.append(toggleButton);
    }

    wrapper.append(header);

    if (!this.readOnly) {
      this.textarea = document.createElement("textarea");
      this.textarea.className = "note-mermaid-block__textarea";
      this.textarea.value = this.data.code;
      this.textarea.placeholder = "graph TD\n  A --> B";
      this.textarea.rows = 3;
      this.textarea.spellcheck = false;
      this.textarea.addEventListener("beforeinput", this.stopEditorEventPropagation);
      this.textarea.addEventListener("input", this.handleTextareaInput);
      this.textarea.addEventListener("keydown", this.handleTextareaKeyDown);
      this.textarea.addEventListener("keyup", this.stopEditorEventPropagation);
      wrapper.append(this.textarea);
    }

    this.previewNode = document.createElement("div");
    this.previewNode.className = "note-mermaid-block__surface";
    wrapper.append(this.previewNode);

    this.syncTextareaHeight();
    this.syncSourceVisibility();
    this.renderPreview();

    return wrapper;
  }

  public save() {
    this.syncData();
    return this.data;
  }

  public validate(blockData: NoteMermaidBlockData) {
    return typeof blockData.code === "string";
  }

  public destroy() {
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    this.textarea?.removeEventListener("beforeinput", this.stopEditorEventPropagation);
    this.textarea?.removeEventListener("input", this.handleTextareaInput);
    this.textarea?.removeEventListener("keydown", this.handleTextareaKeyDown);
    this.textarea?.removeEventListener("keyup", this.stopEditorEventPropagation);
    this.toggleButton?.removeEventListener("click", this.handleToggleSource);

    this.renderVersion += 1;
    this.textarea = null;
    this.toggleButton = null;
    this.previewNode = null;
  }

  private readonly handleToggleSource = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    this.syncData();
    this.data = {
      ...this.data,
      sourceCollapsed: !this.data.sourceCollapsed,
    };
    this.syncSourceVisibility();
    void this.api.blocks.update(this.block.id, this.data).catch(() => undefined);
  };

  private syncData() {
    this.data = {
      code: this.textarea?.value ?? this.data.code,
      sourceCollapsed: this.data.sourceCollapsed,
    };
  }

  private syncTextareaHeight() {
    if (!this.textarea) {
      return;
    }

    this.textarea.style.height = "auto";
    this.textarea.style.height = `${Math.max(this.textarea.scrollHeight, 120)}px`;
  }

  private syncSourceVisibility() {
    const isCollapsed = Boolean(this.data.sourceCollapsed);

    if (this.textarea) {
      this.textarea.hidden = isCollapsed;
    }

    if (this.toggleButton) {
      this.toggleButton.innerHTML = isCollapsed ? SHOW_SOURCE_ICON : HIDE_SOURCE_ICON;
      this.toggleButton.setAttribute(
        "aria-label",
        isCollapsed ? "Show Mermaid code" : "Hide Mermaid code",
      );
      this.toggleButton.setAttribute("aria-pressed", String(isCollapsed));
    }
  }

  private schedulePreviewRender() {
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
    }

    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      this.renderPreview();
    }, 300);
  }

  private renderPreview() {
    const previewNode = this.previewNode;
    if (!previewNode) {
      return;
    }

    const code = this.data.code.trim();
    const version = this.renderVersion + 1;
    this.renderVersion = version;

    if (!code) {
      previewNode.innerHTML = '<div class="note-mermaid-block__placeholder">No diagram yet.</div>';
      return;
    }

    previewNode.innerHTML = '<div class="note-mermaid-block__status">Rendering diagram...</div>';

    void renderMermaidSvg(code)
      .then((svg) => {
        if (this.renderVersion !== version || !this.previewNode) {
          return;
        }

        this.previewNode.innerHTML = "";
        const diagram = document.createElement("div");
        diagram.className = "note-mermaid-block__diagram";
        diagram.innerHTML = svg;
        this.previewNode.append(diagram);
      })
      .catch((error: unknown) => {
        if (this.renderVersion !== version || !this.previewNode) {
          return;
        }

        const errorNode = document.createElement("div");
        errorNode.className = "note-mermaid-block__error";
        const title = document.createElement("strong");
        title.textContent = "Could not render this Mermaid diagram.";
        const message = document.createElement("span");
        message.textContent = getMermaidErrorMessage(error);
        errorNode.append(title, message);
        this.previewNode.innerHTML = "";
        this.previewNode.append(errorNode);
      });
  }
}
