/** Max rows a single CSV export returns. */
export const CSV_EXPORT_CAP = 10000;

/** RFC-4180 style CSV field escaping. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Join CSV lines CRLF-terminated, prefixed with a UTF-8 BOM for Excel. */
export function csvDocument(lines: string[]): string {
  const bom = '\uFEFF';
  return `${bom}${lines.join('\r\n')}\r\n`;
}
