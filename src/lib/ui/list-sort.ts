export type SortDir = "asc" | "desc";

export type SortState<K extends string> = {
  key: K;
  dir: SortDir;
};

/** Toggle: stesso campo → inverte; altro campo → asc. */
export function nextSortState<K extends string>(
  current: SortState<K> | null,
  key: K
): SortState<K> {
  if (current?.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}

export function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDir
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mul;
  if (b == null) return -1 * mul;
  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * mul;
  }
  return (
    String(a).localeCompare(String(b), "it", {
      numeric: true,
      sensitivity: "base",
    }) * mul
  );
}
