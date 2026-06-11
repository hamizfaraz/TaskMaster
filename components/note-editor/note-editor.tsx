"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type EditorJS from "@editorjs/editorjs";
import type {
  NoteBlock,
  NoteContent,
  NoteDocument,
  NoteImageFileData,
} from "@/lib/notes/types";
import { emptyNoteDocument, NoteDocumentSchema } from "@/lib/notes/types";
import { createNoteContent } from "@/lib/notes/markdown";
import {
  convertBlock,
  createEmptyBlockForTarget,
  getBlockText,
  getSlashCommandMatches,
  stripHtml,
  type BlockConversionTarget,
  type SlashCommand,
} from "@/components/note-editor/block-transforms";
import { areDocumentsEqual } from "@/components/note-editor/document-utils";
import {
  BlockContextMenu,
  SlashCommandMenu,
  type BlockContextMenuState,
  type SlashCommandMenuState,
} from "@/components/note-editor/editor-menus";
import { uploadImageToDataUrl } from "@/components/note-editor/image-upload";
import {
  readBlocksFromClipboard,
  writeBlocksToClipboard,
} from "@/components/note-editor/block-clipboard";
import { loadEditorJsClassAndTools } from "@/components/note-editor/editorjs-tools";
import { isPointInHorizontalEdgeGutter } from "@/components/note-editor/selection-geometry";

export type NoteEditorProps = {
  initialDocument: NoteDocument;
  onContentChange?: (content: NoteContent) => void;
  onSave?: (content: NoteContent) => Promise<void>;
  uploadImage?: (file: File) => Promise<NoteImageFileData>;
  readOnly?: boolean;
  selectionPrelude?: ReactNode;
};

export function NoteEditor({
  initialDocument,
  onContentChange,
  onSave,
  uploadImage,
  readOnly = false,
  selectionPrelude,
}: NoteEditorProps) {
  const selectionScopeRef = useRef<HTMLElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const changeTimeoutRef = useRef<number | null>(null);
  const renderedDocumentRef = useRef<NoteDocument>(initialDocument);
  const pendingSaveRef = useRef<NoteContent | null>(null);
  const isFlushingSaveRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const selectedBlockIndexesRef = useRef<number[]>([]);
  const clearBlockSelectionRef = useRef<() => void>(() => undefined);
  const pendingBlockFocusTimersRef = useRef<number[]>([]);
  const shiftEnterInsertIndexRef = useRef<number | null>(null);
  const shiftEnterChainTimerRef = useRef<number | null>(null);
  const [blockContextMenu, setBlockContextMenu] =
    useState<BlockContextMenuState | null>(null);
  const [slashCommandMenu, setSlashCommandMenu] =
    useState<SlashCommandMenuState | null>(null);

  const flushPendingSaves = useEffectEvent(async () => {
    if (!onSave || isFlushingSaveRef.current) {
      return;
    }

    isFlushingSaveRef.current = true;

    try {
      while (pendingSaveRef.current) {
        const nextContent = pendingSaveRef.current;
        pendingSaveRef.current = null;
        await onSave(nextContent);
      }
    } finally {
      isFlushingSaveRef.current = false;
    }
  });

  const publishContent = useEffectEvent(async (content: NoteContent) => {
    renderedDocumentRef.current = content.document;
    onContentChange?.(content);

    if (!onSave) {
      return;
    }

    pendingSaveRef.current = content;
    await flushPendingSaves();
  });

  const saveEditorDocument = useCallback(async (editor: EditorJS) => {
    const saved = NoteDocumentSchema.parse(await editor.save());
    const holder = holderRef.current;
    if (!holder) {
      return saved;
    }

    const domBlocks = Array.from(holder.querySelectorAll<HTMLElement>(".ce-block"));
    if (domBlocks.length === 0) {
      return saved;
    }

    const savedBlocksById = new Map(
      saved.blocks
        .map((block, index) => [block.id, { block, index }] as const)
        .filter((entry): entry is readonly [string, { block: NoteBlock; index: number }] =>
          Boolean(entry[0]),
        ),
    );
    const usedSavedIndexes = new Set<number>();
    let nextSavedIndex = 0;

    const takeNextSavedBlock = () => {
      while (usedSavedIndexes.has(nextSavedIndex)) {
        nextSavedIndex += 1;
      }

      const block = saved.blocks[nextSavedIndex];
      if (block) {
        usedSavedIndexes.add(nextSavedIndex);
        nextSavedIndex += 1;
      }

      return block;
    };

    const blocks = domBlocks
      .map((domBlock) => {
        const id = domBlock.dataset.id;
        const savedEntry = id ? savedBlocksById.get(id) : undefined;
        if (savedEntry) {
          usedSavedIndexes.add(savedEntry.index);
          return savedEntry.block;
        }

        const paragraph = domBlock.querySelector<HTMLElement>(".ce-paragraph");
        const isEmptyParagraph =
          paragraph &&
          paragraph.getAttribute("contenteditable") === "true" &&
          stripHtml(paragraph.innerHTML).length === 0;

        if (isEmptyParagraph) {
          return {
            id,
            type: "paragraph",
            data: {
              text: "<br>",
            },
          } satisfies NoteBlock;
        }

        return takeNextSavedBlock();
      })
      .filter((block): block is NoteBlock => Boolean(block));

    return NoteDocumentSchema.parse({
      ...saved,
      blocks,
    });
  }, []);

  const emitContentChange = useEffectEvent(async () => {
    if (!editorRef.current) {
      return;
    }

    try {
      const document = await saveEditorDocument(editorRef.current);
      const content = createNoteContent(document);
      await publishContent(content);
    } catch (error) {
      console.error("Failed to persist note changes.", error);
    }
  });

  const applyDocumentMutation = useCallback(
    async (mutate: (document: NoteDocument) => NoteDocument) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      try {
        const saved = await saveEditorDocument(editor);
        const nextDocument = NoteDocumentSchema.parse(mutate(saved));
        renderedDocumentRef.current = nextDocument;
        await editor.render(
          nextDocument.blocks.length > 0
            ? nextDocument
            : { ...emptyNoteDocument },
        );
        const content = createNoteContent(nextDocument);
        onContentChange?.(content);

        if (onSave) {
          pendingSaveRef.current = content;

          if (!isFlushingSaveRef.current) {
            isFlushingSaveRef.current = true;

            try {
              while (pendingSaveRef.current) {
                const nextContent = pendingSaveRef.current;
                pendingSaveRef.current = null;
                await onSave(nextContent);
              }
            } finally {
              isFlushingSaveRef.current = false;
            }
          }
        }
      } catch (error) {
        console.error("Failed to update note block.", error);
      } finally {
        setBlockContextMenu(null);
        setSlashCommandMenu(null);
      }
    },
    [onContentChange, onSave, saveEditorDocument],
  );

  const resolveImageUpload = useEffectEvent(async (file: File) => {
    const resolvedFile = uploadImage
      ? await uploadImage(file)
      : await uploadImageToDataUrl(file);

    return {
      success: 1 as const,
      file: resolvedFile,
    };
  });

  const getContextTargetIndexes = useCallback(() => {
    if (!blockContextMenu) {
      return [];
    }

    const selectedIndexes = selectedBlockIndexesRef.current;
    return selectedIndexes.includes(blockContextMenu.blockIndex)
      ? selectedIndexes
      : [blockContextMenu.blockIndex];
  }, [blockContextMenu]);

  const cloneBlocksForInsert = useCallback((blocks: NoteBlock[]) => {
    return blocks.map((block) => {
      const cloned = structuredClone(block);
      delete cloned.id;
      return cloned;
    }) as NoteBlock[];
  }, []);

  const getBlocksAtIndexes = useCallback(
    (document: NoteDocument, indexes: number[]) => {
      const indexSet = new Set(indexes);
      return document.blocks.filter((_, index) => indexSet.has(index));
    },
    [],
  );

  const deleteBlocksAtIndexes = useCallback(
    (indexes: number[]) => {
      if (indexes.length === 0) {
        return;
      }

      const indexSet = new Set(indexes);
      void applyDocumentMutation((document) => ({
        ...document,
        blocks: document.blocks.filter(
          (_, index) => !indexSet.has(index),
        ) as NoteBlock[],
      }));
      clearBlockSelectionRef.current();
    },
    [applyDocumentMutation],
  );

  const moveBlocksAtIndexes = useCallback(
    (indexes: number[], direction: -1 | 1) => {
      if (indexes.length === 0) {
        return;
      }

      void applyDocumentMutation((document) => {
        const blocks = [...document.blocks];
        const sortedIndexes = [...new Set(indexes)].sort((a, b) => a - b);
        const indexSet = new Set(sortedIndexes);

        if (direction === -1) {
          if (sortedIndexes[0] <= 0) {
            return document;
          }

          for (const index of sortedIndexes) {
            const previousIndex = index - 1;
            if (indexSet.has(previousIndex)) {
              continue;
            }

            const currentBlock = blocks[index];
            const previousBlock = blocks[previousIndex];
            if (!currentBlock || !previousBlock) {
              continue;
            }

            blocks[previousIndex] = currentBlock;
            blocks[index] = previousBlock;
          }
        } else {
          if (sortedIndexes[sortedIndexes.length - 1] >= blocks.length - 1) {
            return document;
          }

          for (const index of [...sortedIndexes].reverse()) {
            const nextIndex = index + 1;
            if (indexSet.has(nextIndex)) {
              continue;
            }

            const currentBlock = blocks[index];
            const nextBlock = blocks[nextIndex];
            if (!currentBlock || !nextBlock) {
              continue;
            }

            blocks[nextIndex] = currentBlock;
            blocks[index] = nextBlock;
          }
        }

        return {
          ...document,
          blocks,
        };
      });
    },
    [applyDocumentMutation],
  );

  const insertBlocksAfterIndex = useCallback(
    (targetIndex: number, blocksToInsert: NoteBlock[]) => {
      if (blocksToInsert.length === 0) {
        return;
      }

      const nextBlocks = cloneBlocksForInsert(blocksToInsert);
      void applyDocumentMutation((document) => {
        const boundedIndex = Math.min(
          Math.max(targetIndex, -1),
          document.blocks.length - 1,
        );

        return {
          ...document,
          blocks: [
            ...document.blocks.slice(0, boundedIndex + 1),
            ...nextBlocks,
            ...document.blocks.slice(boundedIndex + 1),
          ] as NoteBlock[],
        };
      });
      clearBlockSelectionRef.current();
    },
    [applyDocumentMutation, cloneBlocksForInsert],
  );

  const insertEmptyParagraphAfterIndex = useCallback(
    (blockIndex: number) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const boundedIndex = Math.max(-1, blockIndex);
      editor.blocks.insert(
        "paragraph",
        { text: "<br>" },
        undefined,
        boundedIndex + 1,
        true,
      );
      clearBlockSelectionRef.current();
      setSlashCommandMenu(null);
      shiftEnterInsertIndexRef.current = boundedIndex + 1;
      if (shiftEnterChainTimerRef.current !== null) {
        window.clearTimeout(shiftEnterChainTimerRef.current);
      }
      shiftEnterChainTimerRef.current = window.setTimeout(() => {
        shiftEnterInsertIndexRef.current = null;
        shiftEnterChainTimerRef.current = null;
      }, 1200);

      pendingBlockFocusTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      pendingBlockFocusTimersRef.current = [];

      const focusInsertedBlock = () => {
        const holder = holderRef.current;
        const nextBlock = holder?.querySelectorAll<HTMLElement>(".ce-block")[
          boundedIndex + 1
        ];
        const focusTarget = nextBlock?.querySelector<HTMLElement>(
          '[contenteditable="true"], textarea, input, math-field',
        );
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        focusTarget?.focus({ preventScroll: true });

        if (focusTarget?.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(focusTarget);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      };

      window.requestAnimationFrame(() => {
        focusInsertedBlock();
        pendingBlockFocusTimersRef.current = [0, 50, 150, 350, 650].map((delay) =>
          window.setTimeout(focusInsertedBlock, delay),
        );
      });
    },
    [],
  );

  const handleConvertBlock = (target: BlockConversionTarget) => {
    const targetIndexes = getContextTargetIndexes();
    if (targetIndexes.length === 0) {
      return;
    }

    const targetIndexSet = new Set(targetIndexes);
    void applyDocumentMutation((document) => ({
      ...document,
      blocks: document.blocks.map((block, index) =>
        targetIndexSet.has(index) ? convertBlock(block, target) : block,
      ) as NoteBlock[],
    }));
  };

  const handleDeleteBlock = () => {
    deleteBlocksAtIndexes(getContextTargetIndexes());
  };

  const handleSlashCommand = useCallback((command: SlashCommand) => {
    if (!slashCommandMenu) {
      return;
    }

    const targetIndex = slashCommandMenu.blockIndex;
    void applyDocumentMutation((document) => ({
      ...document,
      blocks: document.blocks.map((block, index) =>
        index === targetIndex
          ? getBlockText(block, { plain: true }).startsWith("/")
            ? createEmptyBlockForTarget(command.target)
            : convertBlock(block, command.target)
          : block,
      ) as NoteBlock[],
    }));
  }, [applyDocumentMutation, slashCommandMenu]);

  const installBlockSurfaceDragging = useEffectEvent((editor: EditorJS) => {
    if (readOnly || !holderRef.current || !selectionScopeRef.current) {
      return () => undefined;
    }

    const holder = holderRef.current;
    const selectionScope = selectionScopeRef.current;
    const dragThreshold = 8;
    let candidateBlock: HTMLElement | null = null;
    let pressedBlock: HTMLElement | null = null;
    let isDraggingBlocks = false;
    let isSelectingBlocks = false;
    let dropIndex: number | null = null;
    let selectedBlocks = new Set<HTMLElement>();
    let pointerMode: "pointer" | "mouse" | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let dropIndicator: HTMLDivElement | null = null;
    let dragPreview: HTMLDivElement | null = null;
    let dragPreviewPointerOffsetX = 0;
    let dragPreviewPointerOffsetY = 0;
    let selectedGroupHeight = 0;
    let dragLayout: Array<{
      block: HTMLElement;
      height: number;
      index: number;
      top: number;
    }> = [];
    let startX = 0;
    let startY = 0;

    const getBlocks = () =>
      Array.from(holder.querySelectorAll<HTMLElement>(".ce-block"));
    const clearDropIndicator = () => {
      dropIndex = null;
      dropIndicator?.remove();
      dropIndicator = null;
    };

    const removeDragPreview = () => {
      dragPreview?.remove();
      dragPreview = null;
    };

    const clearReflowTransforms = () => {
      getBlocks().forEach((block) => {
        block.style.removeProperty("transform");
      });
    };

    const syncSelectionClasses = () => {
      const blocks = getBlocks();
      selectedBlockIndexesRef.current = blocks
        .map((block, index) => (selectedBlocks.has(block) ? index : -1))
        .filter((index) => index >= 0);

      blocks.forEach((block) => {
        block.classList.toggle(
          "note-editor__block-selected",
          selectedBlocks.has(block),
        );
        block.classList.toggle(
          "note-editor__block-dragging",
          isDraggingBlocks && selectedBlocks.has(block),
        );
      });
    };

    const setSelectedBlocks = (blocks: HTMLElement[]) => {
      window.getSelection()?.removeAllRanges();
      if (blocks.length > 0 && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      selectedBlocks = new Set(blocks);
      syncSelectionClasses();
    };

    const clearSelection = () => {
      selectedBlocks = new Set();
      syncSelectionClasses();
    };

    clearBlockSelectionRef.current = clearSelection;

    const removeSelectionBox = () => {
      selectionBox?.remove();
      selectionBox = null;
    };

    const isEditorControlTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      !target.closest("[data-note-selection-region]") &&
      Boolean(
        target.closest(
          [
            "button",
            "input",
            "textarea",
            "select",
            "math-field",
            ".ce-toolbar",
            ".ce-popover",
            ".ce-inline-toolbar",
            ".ce-conversion-toolbar",
            ".ce-settings",
            ".ce-toolbox",
            ".ML__keyboard",
            ".MLK__backdrop",
            ".MLK__plate",
            ".MLK__layer",
          ].join(", "),
        ),
      );

const isNativeTextSelectionTarget = (target: EventTarget | null) => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return Boolean(
    element?.closest(
      [
        '[contenteditable="true"]',
        ".ce-paragraph",
        ".ce-header",
        ".cdx-quote__text",
        ".cdx-quote__caption",
        ".cdx-list",
        ".cdx-list__item",
        ".cdx-list__item-content",
      ].join(", "),
    ),
  );
};

    const getEventBlock = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>(".ce-block")
        : null;

    const isInsideSelectionSurface = (
      target: EventTarget | null,
      clientX: number,
      clientY: number,
    ) => {
      if (target instanceof Node && selectionScope.contains(target)) {
        return true;
      }

      const rect = holder.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };

    const isEditorEdgeSelectionPoint = (
      target: EventTarget | null,
      clientX: number,
      clientY: number,
    ) => {
      const rect = holder.getBoundingClientRect();
      const isEditorDescendant =
        target instanceof Node && selectionScope.contains(target);

      // Some imported notes visually overflow the holder's measured height.
      // For real editor descendants, gutter selection should depend on X only.
      return isPointInHorizontalEdgeGutter(
        isEditorDescendant
          ? { ...rect, top: clientY - 1, bottom: clientY + 1 }
          : rect,
        clientX,
        clientY,
      );
    };

    const isContextMenuControlTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          [
            ".ce-toolbar",
            ".ce-popover",
            ".ce-inline-toolbar",
            ".ce-conversion-toolbar",
            ".ce-settings",
            ".ce-toolbox",
            ".ML__keyboard",
            ".MLK__backdrop",
            ".MLK__plate",
            ".MLK__layer",
          ].join(", "),
        ),
      );

    const getDropIndexFromPoint = (clientY: number) => {
      if (dragLayout.length === 0) {
        return null;
      }

      let nextDropIndex = dragLayout.length;
      for (const item of dragLayout) {
        if (clientY < item.top + item.height / 2) {
          nextDropIndex = item.index;
          break;
        }
      }

      return nextDropIndex;
    };

    const setDropPlaceholderTop = (top: number) => {
      dropIndicator ??= document.createElement("div");
      dropIndicator.className = "note-editor__drop-placeholder";

      if (!dropIndicator.parentElement) {
        holder.append(dropIndicator);
      }

      const holderRect = holder.getBoundingClientRect();
      dropIndicator.style.top = `${top - holderRect.top + holder.scrollTop}px`;
      dropIndicator.style.height = `${Math.max(selectedGroupHeight, 36)}px`;
    };

    const applyDynamicReflow = (clientY: number) => {
      const nextDropIndex = getDropIndexFromPoint(clientY);
      if (nextDropIndex === null) {
        clearDropIndicator();
        return;
      }

      dropIndex = nextDropIndex;
      const selectedIndexes = dragLayout
        .filter((item) => selectedBlocks.has(item.block))
        .map((item) => item.index);

      if (selectedIndexes.length === 0) {
        clearDropIndicator();
        return;
      }

      const selectedIndexSet = new Set(selectedIndexes);
      const removedBeforeDrop = selectedIndexes.filter(
        (index) => index < nextDropIndex,
      ).length;
      const adjustedDropIndex = Math.max(0, nextDropIndex - removedBeforeDrop);
      const remaining = dragLayout.filter(
        (item) => !selectedIndexSet.has(item.index),
      );
      const selected = dragLayout.filter((item) =>
        selectedIndexSet.has(item.index),
      );
      const visualOrder = [
        ...remaining.slice(0, adjustedDropIndex),
        ...selected,
        ...remaining.slice(adjustedDropIndex),
      ];

      let nextTop = dragLayout[0]?.top ?? 0;
      let placeholderTop = nextTop;
      const firstSelected = selected[0];
      const visualTops = new Map<HTMLElement, number>();

      for (const item of visualOrder) {
        if (firstSelected && item.block === firstSelected.block) {
          placeholderTop = nextTop;
        }

        visualTops.set(item.block, nextTop);
        nextTop += item.height;
      }

      dragLayout.forEach((item) => {
        if (selectedIndexSet.has(item.index)) {
          item.block.style.removeProperty("transform");
          return;
        }

        const visualTop = visualTops.get(item.block);
        if (visualTop === undefined) {
          return;
        }

        item.block.style.transform = `translateY(${visualTop - item.top}px)`;
      });

      setDropPlaceholderTop(placeholderTop);
    };

    const resetInteractionState = () => {
      candidateBlock = null;
      pressedBlock = null;
      isDraggingBlocks = false;
      isSelectingBlocks = false;
      pointerMode = null;
      removeSelectionBox();
      clearDropIndicator();
      removeDragPreview();
      clearReflowTransforms();
      dragLayout = [];
      syncSelectionClasses();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    const finishDrag = async () => {
      if (!isDraggingBlocks) return;

      // Stop live pointer tracking immediately so concurrent move events
      // cannot restart a new drag or render stale previews.
      isDraggingBlocks = false;
      candidateBlock = null;
      pointerMode = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      removeDragPreview();
      // Capture dropIndex before clearDropIndicator() zeroes it out.
      const targetDropIndex = dropIndex;
      clearDropIndicator();
      clearReflowTransforms();
      syncSelectionClasses();

      const blocks = getBlocks();
      const selectedIndexes = blocks
        .map((block, index) => (selectedBlocks.has(block) ? index : -1))
        .filter((index) => index >= 0);

      if (targetDropIndex !== null && selectedIndexes.length > 0) {
        const firstSelectedIndex = selectedIndexes[0];
        const lastSelectedIndex = selectedIndexes[selectedIndexes.length - 1];

        if (
          targetDropIndex < firstSelectedIndex ||
          targetDropIndex > lastSelectedIndex + 1
        ) {
          const saved = await saveEditorDocument(editor);
          const selectedIndexSet = new Set(selectedIndexes);
          const movedBlocks = saved.blocks.filter((_, index) =>
            selectedIndexSet.has(index),
          );
          const remainingBlocks = saved.blocks.filter(
            (_, index) => !selectedIndexSet.has(index),
          );
          const removedBeforeDrop = selectedIndexes.filter(
            (index) => index < targetDropIndex,
          ).length;
          const adjustedDropIndex = Math.max(
            0,
            targetDropIndex - removedBeforeDrop,
          );
          const nextDocument = {
            ...saved,
            blocks: [
              ...remainingBlocks.slice(0, adjustedDropIndex),
              ...movedBlocks,
              ...remainingBlocks.slice(adjustedDropIndex),
            ],
          };

          renderedDocumentRef.current = nextDocument;
          await editor.render(nextDocument);
          window.setTimeout(() => {
            const nextBlocks = getBlocks();
            setSelectedBlocks(
              nextBlocks.slice(
                adjustedDropIndex,
                adjustedDropIndex + movedBlocks.length,
              ),
            );
            void emitContentChange();
          }, 0);
        }
      }

      resetInteractionState();
    };

    const getSelectedBlocksInDocumentOrder = () =>
      getBlocks().filter((block) => selectedBlocks.has(block));

    const createDragPreview = () => {
      const selected = getSelectedBlocksInDocumentOrder();
      if (selected.length === 0) {
        return;
      }

      const firstRect = selected[0].getBoundingClientRect();
      const lastRect = selected[selected.length - 1].getBoundingClientRect();
      const widestRect = selected.reduce((widest, block) => {
        const rect = block.getBoundingClientRect();
        return rect.width > widest.width ? rect : widest;
      }, firstRect);

      selectedGroupHeight = lastRect.bottom - firstRect.top;
      dragPreviewPointerOffsetX = startX - widestRect.left;
      dragPreviewPointerOffsetY = startY - firstRect.top;
      dragPreview = document.createElement("div");
      dragPreview.className = "note-editor__drag-preview";
      dragPreview.style.left = `${startX - dragPreviewPointerOffsetX}px`;
      dragPreview.style.top = `${startY - dragPreviewPointerOffsetY}px`;
      dragPreview.style.width = `${widestRect.width}px`;

      selected.forEach((block) => {
        const clone = block.cloneNode(true);
        if (clone instanceof HTMLElement) {
          clone.classList.remove(
            "note-editor__block-selected",
            "note-editor__block-dragging",
          );
          clone.classList.add("note-editor__drag-preview-block");
          dragPreview?.append(clone);
        }
      });

      document.body.append(dragPreview);
    };

    const updateDragPreview = (clientX: number, clientY: number) => {
      if (!dragPreview) {
        return;
      }

      dragPreview.style.left = `${clientX - dragPreviewPointerOffsetX}px`;
      dragPreview.style.top = `${clientY - dragPreviewPointerOffsetY}px`;
    };

    const updateSelectionBox = (clientX: number, clientY: number) => {
      if (!selectionBox) {
        selectionBox = document.createElement("div");
        selectionBox.className = "note-editor__selection-box";
        document.body.append(selectionBox);
      }

      const left = Math.min(startX, clientX);
      const top = Math.min(startY, clientY);
      const width = Math.abs(clientX - startX);
      const height = Math.abs(clientY - startY);
      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;

      const selectionRect = new DOMRect(left, top, width, height);
      setSelectedBlocks(
        getBlocks().filter((block) => {
          const rect = block.getBoundingClientRect();
          return (
            rect.left < selectionRect.right &&
            rect.right > selectionRect.left &&
            rect.top < selectionRect.bottom &&
            rect.bottom > selectionRect.top
          );
        }),
      );
    };

    const startDrag = (clientY: number) => {
      if (!candidateBlock) {
        return;
      }

      // Auto-select the candidate block if it isn't already part of the
      // selection (enables drag-to-reorder without a prior rubber-band select).
      if (!selectedBlocks.has(candidateBlock)) {
        setSelectedBlocks([candidateBlock]);
      }

      isDraggingBlocks = true;
      window.getSelection()?.removeAllRanges();
      dragLayout = getBlocks().map((block, index) => {
        const rect = block.getBoundingClientRect();
        return {
          block,
          height: rect.height,
          index,
          top: rect.top,
        };
      });
      syncSelectionClasses();
      createDragPreview();
      updateDragPreview(startX, startY);
      applyDynamicReflow(clientY);
    };

    const startSelectionBox = () => {
      isSelectingBlocks = true;
      clearSelection();
      window.getSelection()?.removeAllRanges();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerMode !== "pointer") {
        return;
      }

      const distance = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (!isDraggingBlocks && !isSelectingBlocks && distance < dragThreshold) {
        return;
      }

      event.preventDefault();
      if (!candidateBlock && !isSelectingBlocks) {
        startSelectionBox();
      }

      if (isSelectingBlocks) {
        updateSelectionBox(event.clientX, event.clientY);
        return;
      }

      if (!isDraggingBlocks) {
        startDrag(event.clientY);
        return;
      }

      updateDragPreview(event.clientX, event.clientY);
      applyDynamicReflow(event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerMode !== "pointer") {
        return;
      }

      if (isDraggingBlocks) {
        event.preventDefault();
        void finishDrag();
        return;
      }

      if (isSelectingBlocks) {
        event.preventDefault();
      } else if (pressedBlock) {
        if (selectedBlocks.has(pressedBlock)) {
          event.preventDefault();
          clearSelection();
        } else {
          clearSelection();
        }
      } else {
        clearSelection();
      }

      resetInteractionState();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideSelectionSurface(event.target, event.clientX, event.clientY)) {
        return;
      }

      const isControlTarget = isEditorControlTarget(event.target);
      const isEdgeSelectionPoint = isEditorEdgeSelectionPoint(
        event.target,
        event.clientX,
        event.clientY,
      );
      if (
        pointerMode ||
        event.button !== 0 ||
        (isControlTarget && !isEdgeSelectionPoint)
      ) {
        return;
      }

      const block = isEdgeSelectionPoint ? null : getEventBlock(event.target);
      const isBlockSelected = block && selectedBlocks.has(block);
      if (isEdgeSelectionPoint) {
        event.preventDefault();
      }

      if (block && !isBlockSelected && isNativeTextSelectionTarget(event.target)) {
        clearSelection();
        return;
      }

      if (block && !isBlockSelected) {
        // Block is not selected — clear any prior selection. We still set up
        // pointer tracking so a drag gesture will work without a prior
        // rubber-band select. If the user just clicks (no drag), pointerup
        // calls clearSelection and allows native focus/cursor to work.
        clearSelection();
        pointerMode = "pointer";
        pressedBlock = block;
        candidateBlock = block; // allow immediate drag
        startX = event.clientX;
        startY = event.clientY;
        // No preventDefault — let the click focus the block for text editing.
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return;
      }

      pointerMode = "pointer";
      pressedBlock = block;
      candidateBlock = isBlockSelected ? block : null;
      startX = event.clientX;
      startY = event.clientY;
      if (isBlockSelected) {
        event.preventDefault();
      }
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (pointerMode !== "mouse") {
        return;
      }

      const distance = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      );
      if (!isDraggingBlocks && !isSelectingBlocks && distance < dragThreshold) {
        return;
      }

      event.preventDefault();
      if (!candidateBlock && !isSelectingBlocks) {
        startSelectionBox();
      }

      if (isSelectingBlocks) {
        updateSelectionBox(event.clientX, event.clientY);
        return;
      }

      if (!isDraggingBlocks) {
        startDrag(event.clientY);
        return;
      }

      updateDragPreview(event.clientX, event.clientY);
      applyDynamicReflow(event.clientY);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (pointerMode !== "mouse") {
        return;
      }

      if (isDraggingBlocks) {
        event.preventDefault();
        void finishDrag();
        return;
      }

      if (isSelectingBlocks) {
        event.preventDefault();
      } else if (pressedBlock) {
        if (selectedBlocks.has(pressedBlock)) {
          event.preventDefault();
          clearSelection();
        } else {
          clearSelection();
        }
      } else {
        clearSelection();
      }

      resetInteractionState();
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (!isInsideSelectionSurface(event.target, event.clientX, event.clientY)) {
        return;
      }

      const isControlTarget = isEditorControlTarget(event.target);
      const isEdgeSelectionPoint = isEditorEdgeSelectionPoint(
        event.target,
        event.clientX,
        event.clientY,
      );
      if (
        pointerMode ||
        event.button !== 0 ||
        (isControlTarget && !isEdgeSelectionPoint)
      ) {
        return;
      }

      const block = isEdgeSelectionPoint ? null : getEventBlock(event.target);
      const isBlockSelected = block && selectedBlocks.has(block);
      if (isEdgeSelectionPoint) {
        event.preventDefault();
      }

      if (block && !isBlockSelected && isNativeTextSelectionTarget(event.target)) {
        clearSelection();
        return;
      }

      if (block && !isBlockSelected) {
        clearSelection();
        pointerMode = "mouse";
        pressedBlock = block;
        candidateBlock = block;
        startX = event.clientX;
        startY = event.clientY;
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return;
      }

      pointerMode = "mouse";
      pressedBlock = block;
      candidateBlock = isBlockSelected ? block : null;
      startX = event.clientX;
      startY = event.clientY;
      if (isBlockSelected) {
        event.preventDefault();
      }
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (isContextMenuControlTarget(event.target)) {
        return;
      }

      const block =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".ce-block")
          : null;

      if (!block) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resetInteractionState();

      void (async () => {
        try {
          const blockIndex = getBlocks().indexOf(block);
          if (blockIndex < 0) {
            return;
          }

          const saved = await saveEditorDocument(editor);
          const noteBlock = saved.blocks[blockIndex];
          if (!noteBlock) {
            return;
          }

          // 220px wide menu, 320px max height — clamp so it never clips viewport.
          const menuW = 220;
          const menuH = 320;
          setBlockContextMenu({
            x: Math.min(event.clientX, window.innerWidth - menuW - 8),
            y: Math.min(event.clientY, window.innerHeight - menuH - 8),
            blockIndex,
            blockType: noteBlock.type,
          });
        } catch (error) {
          console.error("Failed to open note block menu.", error);
        }
      })();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    selectionScope.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("blur", resetInteractionState);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      selectionScope.removeEventListener(
        "contextmenu",
        handleContextMenu,
        true,
      );
      window.removeEventListener("blur", resetInteractionState);
      resetInteractionState();
      clearBlockSelectionRef.current = () => undefined;
      selectedBlockIndexesRef.current = [];
    };
  });

  useEffect(() => {
    let disposed = false;

    async function initEditor() {
      if (!holderRef.current) {
        return;
      }

      const { EditorJSClass, tools } = await loadEditorJsClassAndTools(
        resolveImageUpload,
      );

      if (disposed || !holderRef.current) {
        return;
      }

      const editor = new EditorJSClass({
        holder: holderRef.current,
        autofocus: !readOnly,
        readOnly,
        minHeight: 0,
        data:
          renderedDocumentRef.current.blocks.length > 0
            ? renderedDocumentRef.current
            : { ...emptyNoteDocument },
        tools,
        async onChange() {
          if (changeTimeoutRef.current) {
            window.clearTimeout(changeTimeoutRef.current);
          }

          changeTimeoutRef.current = window.setTimeout(() => {
            void emitContentChange();
          }, 180);
        },
      });

      editorRef.current = editor;

      try {
        await editor.isReady;
        if (!disposed) {
          dragCleanupRef.current?.();
          dragCleanupRef.current = installBlockSurfaceDragging(editor);
        }
      } catch (error) {
        if (!disposed) {
          console.error("Failed to initialize the editor.", error);
        }
      }
    }

    void initEditor();

    return () => {
      disposed = true;

      if (changeTimeoutRef.current) {
        window.clearTimeout(changeTimeoutRef.current);
        changeTimeoutRef.current = null;

        if (!readOnly) {
          void emitContentChange();
        }
      }

      const editor = editorRef.current;
      editorRef.current = null;
      pendingBlockFocusTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      pendingBlockFocusTimersRef.current = [];
      if (shiftEnterChainTimerRef.current !== null) {
        window.clearTimeout(shiftEnterChainTimerRef.current);
        shiftEnterChainTimerRef.current = null;
      }
      shiftEnterInsertIndexRef.current = null;
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;

      if (editor) {
        void editor.isReady.then(() => editor.destroy()).catch(() => undefined);
      }
    };
  }, [readOnly]);

  useEffect(() => {
    if (areDocumentsEqual(initialDocument, renderedDocumentRef.current)) {
      return;
    }

    renderedDocumentRef.current = initialDocument;
    pendingSaveRef.current = null;

    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    void editor.isReady
      .then(() =>
        editor.render(
          initialDocument.blocks.length > 0
            ? initialDocument
            : { ...emptyNoteDocument },
        ),
      )
      .catch((error) => {
        console.error("Failed to sync note document.", error);
      });
  }, [initialDocument]);

  useEffect(() => {
    if (readOnly || !selectionScopeRef.current || !holderRef.current) {
      return;
    }

    const selectionScope = selectionScopeRef.current;
    const holder = holderRef.current;

    const isInsideScope = (target: EventTarget | null) =>
      target instanceof Node && selectionScope.contains(target);

    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          '[contenteditable="true"], textarea, input, select, math-field',
        ),
      );

    const hasTextSelection = () =>
      Boolean(window.getSelection()?.toString().trim());

    const getTargetBlockIndex = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return renderedDocumentRef.current.blocks.length - 1;
      }

      const block = target.closest<HTMLElement>(".ce-block");
      if (!block) {
        return renderedDocumentRef.current.blocks.length - 1;
      }

      return Array.from(holder.querySelectorAll<HTMLElement>(".ce-block")).indexOf(
        block,
      );
    };

    const getEventBlockIndex = (target: EventTarget | null) => {
      const blockIndex = getTargetBlockIndex(target);
      return blockIndex >= 0 ? blockIndex : renderedDocumentRef.current.blocks.length - 1;
    };

    const getSelectedBlocks = () => {
      const indexes = selectedBlockIndexesRef.current;
      if (indexes.length === 0) {
        return [];
      }

      return getBlocksAtIndexes(renderedDocumentRef.current, indexes);
    };

    const handleCopy = (event: ClipboardEvent) => {
      if (hasTextSelection() || !event.clipboardData) {
        return;
      }

      const blocks = getSelectedBlocks();
      if (blocks.length === 0) {
        return;
      }

      event.preventDefault();
      writeBlocksToClipboard(event.clipboardData, blocks, cloneBlocksForInsert);
    };

    const handleCut = (event: ClipboardEvent) => {
      if (hasTextSelection() || !event.clipboardData) {
        return;
      }

      const selectedIndexes = selectedBlockIndexesRef.current;
      const blocks = getSelectedBlocks();
      if (blocks.length === 0) {
        return;
      }

      event.preventDefault();
      writeBlocksToClipboard(event.clipboardData, blocks, cloneBlocksForInsert);
      deleteBlocksAtIndexes(selectedIndexes);
    };

    const handlePaste = (event: ClipboardEvent) => {
      const selectedIndexes = selectedBlockIndexesRef.current;
      if (
        !event.clipboardData ||
        (selectedIndexes.length === 0 && !isInsideScope(event.target))
      ) {
        return;
      }

      if (selectedIndexes.length === 0 && isTypingTarget(event.target)) {
        return;
      }

      const blocks = readBlocksFromClipboard(event.clipboardData);
      if (blocks.length === 0) {
        return;
      }

      event.preventDefault();
      const targetIndex =
        selectedIndexes.length > 0
          ? Math.max(...selectedIndexes)
          : getTargetBlockIndex(event.target);
      insertBlocksAfterIndex(targetIndex, blocks);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const selectedIndexes = selectedBlockIndexesRef.current;
      const hasSelectedBlocks = selectedIndexes.length > 0;
      if (!hasSelectedBlocks && !isInsideScope(event.target)) {
        return;
      }

      if (event.key === "Enter" && event.shiftKey && isInsideScope(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        insertEmptyParagraphAfterIndex(
          shiftEnterInsertIndexRef.current ?? getEventBlockIndex(event.target),
        );
        return;
      }

      if (event.key !== "Shift") {
        shiftEnterInsertIndexRef.current = null;
      }

      if (event.key === "Escape") {
        if (hasSelectedBlocks) {
          event.preventDefault();
          clearBlockSelectionRef.current();
        }
        return;
      }

      if (!hasSelectedBlocks || hasTextSelection()) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteBlocksAtIndexes(selectedIndexes);
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveBlocksAtIndexes(selectedIndexes, -1);
        return;
      }

      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveBlocksAtIndexes(selectedIndexes, 1);
      }
    };

    window.addEventListener("copy", handleCopy, true);
    window.addEventListener("cut", handleCut, true);
    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("copy", handleCopy, true);
      window.removeEventListener("cut", handleCut, true);
      window.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    cloneBlocksForInsert,
    deleteBlocksAtIndexes,
    getBlocksAtIndexes,
    insertEmptyParagraphAfterIndex,
    insertBlocksAfterIndex,
    moveBlocksAtIndexes,
    readOnly,
  ]);

  useEffect(() => {
    if (readOnly || !holderRef.current) {
      return;
    }

    const holder = holderRef.current;

    const getFocusedBlock = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return null;
      }

      if (
        !target.closest(
          '[contenteditable="true"], textarea, input, math-field',
        )
      ) {
        return null;
      }

      return target.closest<HTMLElement>(".ce-block");
    };

    const updateSlashMenu = () => {
      const activeElement = document.activeElement;
      const block = getFocusedBlock(activeElement);

      if (!block) {
        setSlashCommandMenu(null);
        return;
      }

      const blockIndex = Array.from(
        holder.querySelectorAll<HTMLElement>(".ce-block"),
      ).indexOf(block);

      if (blockIndex < 0) {
        setSlashCommandMenu(null);
        return;
      }

      const text = stripHtml(block.textContent ?? "");
      const match = text.match(/^\/([^\s]*)?$/);

      if (!match) {
        setSlashCommandMenu(null);
        return;
      }

      const selectionRect = window.getSelection()?.rangeCount
        ? window.getSelection()?.getRangeAt(0).getBoundingClientRect()
        : null;
      const blockRect = block.getBoundingClientRect();
      const rawX = selectionRect && selectionRect.left > 0 ? selectionRect.left : blockRect.left + 32;
      const rawY =
        selectionRect && selectionRect.bottom > 0
          ? selectionRect.bottom + 8
          : blockRect.top + 36;
      // Clamp so the 288px-wide menu doesn't overflow the viewport.
      const x = Math.min(rawX, window.innerWidth - 296);
      const y = rawY;

      setSlashCommandMenu((current) => {
        const query = match[1] ?? "";
        const matches = getSlashCommandMatches(query);
        const activeIndex =
          current?.blockIndex === blockIndex && current.query === query
            ? current.activeIndex
            : 0;

        return {
          x,
          y,
          blockIndex,
          query,
          activeIndex: Math.min(activeIndex, Math.max(matches.length - 1, 0)),
        };
      });
    };

    const handleInput = () => {
      window.requestAnimationFrame(updateSlashMenu);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlashCommandMenu(null);
        return;
      }

      if (!slashCommandMenu) {
        return;
      }

      const matches = getSlashCommandMatches(slashCommandMenu.query);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashCommandMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  matches.length > 0
                    ? (current.activeIndex + 1) % matches.length
                    : 0,
              }
            : current,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashCommandMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  matches.length > 0
                    ? (current.activeIndex - 1 + matches.length) % matches.length
                    : 0,
              }
            : current,
        );
        return;
      }

      if (event.key === "Enter") {
        const activeCommand = matches[slashCommandMenu.activeIndex] ?? matches[0];
        if (activeCommand) {
          event.preventDefault();
          handleSlashCommand(activeCommand);
        }
      }
    };

    holder.addEventListener("input", handleInput, true);
    holder.addEventListener("keyup", handleInput, true);
    holder.addEventListener("focusin", handleInput, true);
    holder.addEventListener("keydown", handleKeyDown, true);

    return () => {
      holder.removeEventListener("input", handleInput, true);
      holder.removeEventListener("keyup", handleInput, true);
      holder.removeEventListener("focusin", handleInput, true);
      holder.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleSlashCommand, readOnly, slashCommandMenu]);

  useEffect(() => {
    if (!blockContextMenu) {
      return;
    }

    const closeMenu = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-note-block-context-menu]")
      ) {
        return;
      }

      setBlockContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBlockContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeMenu, true);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closeMenu, true);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [blockContextMenu]);

  return (
    <section
      ref={selectionScopeRef}
      className="note-editor relative flex min-h-full shrink-0 flex-col"
    >
      {selectionPrelude}
      <div
        ref={holderRef}
        className="note-editor__canvas min-h-full w-full shrink-0 px-4 pb-28 pt-6 md:px-10 md:pb-36 md:pt-8"
      />
      {slashCommandMenu ? (
        <SlashCommandMenu
          state={slashCommandMenu}
          onSelect={handleSlashCommand}
        />
      ) : null}
      {blockContextMenu ? (
        <BlockContextMenu
          state={blockContextMenu}
          onConvert={handleConvertBlock}
          onDelete={handleDeleteBlock}
        />
      ) : null}
    </section>
  );
}
