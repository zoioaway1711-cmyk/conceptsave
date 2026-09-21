/**
 * Client-only CSV export for admin tables. Never used to move plaintext
 * license serials in bulk — callers pass whatever's already rendered on
 * screen (masked unless an admin explicitly revealed a specific row), so
 * this never becomes a second, unaudited way to read secrets the rest of
 * the admin app deliberately never bulk-exposes (see the licenses list
 * endpoint's "no reveal all serials" comment).
 */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Formula/CSV injection: a cell opened by Excel/Sheets that starts with
  // one of these characters can execute as a formula. Prefixing with a
  // straight quote defuses it while keeping the value human-readable.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  // Leading BOM so Excel opens UTF-8 accented characters (ç, ã, é…) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename, blob);
}

/** Used for the LGPD/GDPR "export this customer's data" action — a plain, human-readable JSON dump, not a new API shape to keep in sync elsewhere. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
