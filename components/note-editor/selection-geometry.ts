export const NOTE_BLOCK_SELECTION_GUTTER_WIDTH = 96;

export type RectLike = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export function isPointInHorizontalEdgeGutter(
  rect: RectLike,
  clientX: number,
  clientY: number,
  gutterWidth = NOTE_BLOCK_SELECTION_GUTTER_WIDTH,
) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  if (width <= 0 || height <= 0) {
    return false;
  }

  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return false;
  }

  const boundedGutterWidth = Math.min(gutterWidth, width / 3);
  return (
    clientX <= rect.left + boundedGutterWidth ||
    clientX >= rect.right - boundedGutterWidth
  );
}
