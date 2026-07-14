/** Escape ILIKE metacharacters so user input is matched literally. */
export function escapeIlikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** Build a safe ILIKE substring pattern from raw user input. Returns '' if blank. */
export function buildIlikePattern(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return `%${escapeIlikeTerm(trimmed)}%`;
}
