/** A note option shown in the "add notes" picker. */
export type AvailableNote = {
  id: string;
  title: string;
  hasEmbedding: boolean;
};

export type SpacedRepetitionView = "queue" | "add" | "study";
