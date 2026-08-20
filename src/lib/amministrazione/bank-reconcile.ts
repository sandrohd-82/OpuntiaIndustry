/**
 * Scoring e riconciliazione movimento banca ↔ fattura FiC (deterministico).
 */

export function scoreBankInvoiceMatch(input: {
  amount: number;
  invoiceGross: number;
  counterparty: string;
  entityName: string;
  description: string;
  invoiceNumber: string;
  txDate: string | null;
  invoiceDate: string | null;
}): number {
  let score = 0;
  const absTx = Math.abs(input.amount);
  const absInv = Math.abs(input.invoiceGross);
  const diff = Math.abs(absTx - absInv);
  if (diff <= 0.01) score += 55;
  else if (diff <= 1) score += 35;
  else if (diff <= 5) score += 15;
  else return 0;

  const nTx = input.counterparty
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const nEnt = input.entityName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (nTx && nEnt && (nTx.includes(nEnt) || nEnt.includes(nTx))) score += 25;

  const desc = input.description.toLowerCase();
  const num = input.invoiceNumber.replace(/\s+/g, "").toLowerCase();
  if (num && desc.includes(num.replace(/\//g, ""))) score += 15;

  // Causale spesso contiene ragione sociale
  if (
    nEnt &&
    nEnt.length >= 4 &&
    desc.includes(nEnt.slice(0, Math.min(12, nEnt.length)))
  ) {
    score += 10;
  }

  if (input.txDate && input.invoiceDate) {
    const d1 = Date.parse(input.txDate);
    const d2 = Date.parse(input.invoiceDate);
    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      const days = Math.abs(d1 - d2) / 86_400_000;
      if (days <= 3) score += 10;
      else if (days <= 15) score += 5;
      else if (days <= 45) score += 2;
    }
  }
  return Math.min(100, score);
}

export const BANK_RECONCILE_MIN_SCORE = 55;
