/** Bucket Storage per fonti estratto conto (CSV + PDF) collegati al lotto. */

export const BANK_STATEMENTS_BUCKET = "bank-statements";

export function bankCsvStoragePath(batchId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "estratto.csv";
  return `${batchId}/csv/${safe}`;
}

export function bankPdfStoragePath(batchId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "estratto.pdf";
  return `${batchId}/pdf/${safe}`;
}
