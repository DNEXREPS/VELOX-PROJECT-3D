/**
 * Sanitise free-text search input before interpolating it into a PostgREST
 * `or=(…ilike…)` filter. Removes characters with syntactic meaning in the
 * filter grammar (comma, parentheses, quotes, backslash) and LIKE wildcards.
 */
export function sanitizeSearch(input: string | undefined | null): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[,()"'\\%*_:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}

export const PAGE_SIZE = 24;

export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const from = (Math.max(1, page) - 1) * size;
  return [from, from + size - 1];
}
