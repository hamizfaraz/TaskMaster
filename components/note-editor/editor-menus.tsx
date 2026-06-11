import type { NoteBlockType } from "@/lib/notes/types";
import type { BlockConversionTarget, SlashCommand } from "@/components/note-editor/block-transforms";
import { getSlashCommandMatches } from "@/components/note-editor/block-transforms";

export type BlockContextMenuState = {
  x: number;
  y: number;
  blockIndex: number;
  blockType: NoteBlockType;
};

export type SlashCommandMenuState = {
  x: number;
  y: number;
  blockIndex: number;
  query: string;
  activeIndex: number;
};

type SlashCommandMenuProps = {
  state: SlashCommandMenuState;
  onSelect: (command: SlashCommand) => void;
};

export function SlashCommandMenu({ state, onSelect }: SlashCommandMenuProps) {
  const matches = getSlashCommandMatches(state.query);

  return (
    <div
      data-note-slash-command-menu
      className="note-editor__slash-menu"
      role="menu"
      style={{
        left: `clamp(4px, ${state.x}px, calc(100vw - 18.5rem))`,
        top: `clamp(4px, ${state.y}px, calc(100vh - 24rem))`,
      }}
    >
      {matches.length > 0 ? (
        matches.map((command, index) => (
          <button
            key={command.id}
            type="button"
            role="menuitem"
            data-active={index === state.activeIndex ? "true" : undefined}
            className={
              index === state.activeIndex
                ? "note-editor__slash-menu-active"
                : undefined
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <span>{command.label}</span>
            <span>{command.hint}</span>
          </button>
        ))
      ) : (
        <div className="note-editor__slash-menu-empty">No commands</div>
      )}
    </div>
  );
}

const conversionTargets: Array<{ label: string; target: BlockConversionTarget }> = [
  { label: "Text", target: { type: "paragraph" } },
  { label: "Heading 1", target: { type: "header", level: 1 } },
  { label: "Heading 2", target: { type: "header", level: 2 } },
  { label: "Heading 3", target: { type: "header", level: 3 } },
  { label: "Bulleted list", target: { type: "list", style: "unordered" } },
  { label: "Numbered list", target: { type: "list", style: "ordered" } },
  { label: "Checklist", target: { type: "list", style: "checklist" } },
  { label: "Quote", target: { type: "quote" } },
  { label: "Code", target: { type: "code" } },
  { label: "Mermaid", target: { type: "mermaid" } },
  { label: "Math", target: { type: "math" } },
];

type BlockContextMenuProps = {
  state: BlockContextMenuState;
  onConvert: (target: BlockConversionTarget) => void;
  onDelete: () => void;
};

export function BlockContextMenu({
  state,
  onConvert,
  onDelete,
}: BlockContextMenuProps) {
  return (
    <div
      data-note-block-context-menu
      className="note-editor__context-menu"
      role="menu"
      style={{
        left: `clamp(4px, ${state.x}px, calc(100vw - 14rem))`,
        top: `clamp(4px, ${state.y}px, calc(100vh - 22rem))`,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="note-editor__context-menu-item note-editor__context-menu-item--submenu">
        <span>Turn into</span>
        <span aria-hidden="true">›</span>
        <div className="note-editor__context-submenu" role="menu">
          {conversionTargets.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => onConvert(item.target)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="note-editor__context-menu-separator" />
      <button
        type="button"
        role="menuitem"
        className="note-editor__context-menu-danger"
        onClick={onDelete}
      >
        Delete block
      </button>
      <div className="note-editor__context-menu-meta">{state.blockType}</div>
    </div>
  );
}
