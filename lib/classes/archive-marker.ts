export const CLASS_ARCHIVE_WARNING = "__taskmaster_class_archived__";

export function isClassArchived(warnings: readonly string[] | null | undefined) {
  return Boolean(warnings?.includes(CLASS_ARCHIVE_WARNING));
}
