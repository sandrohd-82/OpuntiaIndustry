/**
 * Scoring e riconciliazione movimento banca ↔ fattura (deterministico).
 *
 * Regole:
 * - Importo: confronto in valore assoluto (tolleranza 1 centesimo).
 * - Segno movimento: solo direzione catalogo
 *     + / entrata → fatture emesse (incasso)
 *     − / uscita  → fatture ricevute (pagamento)
 * - Data fattura entro ±5 giorni dalla data movimento
 * - Bonus: ragione sociale / n. fattura in causale
 */

export const BANK_RECONCILE_DATE_WINDOW_DAYS = 5;
/** Base sufficiente: importo + finestra data. */
export const BANK_RECONCILE_MIN_SCORE = 70;

export type BankReconcileInvoiceKind = "emessa" | "ricevuta";

/** Catalogo da cercare in base al segno del movimento. */
export function invoiceKindFromBankAmount(
  amount: number
): BankReconcileInvoiceKind | null {
  const n = Number(amount) || 0;
  if (n > 0) return "emessa";
  if (n < 0) return "ricevuta";
  return null;
}

function normalizeText(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token significativi della ragione sociale (ignora forme giuridiche corte). */
function entityTokens(entityName: string): string[] {
  const stop = new Set([
    "srl",
    "srls",
    "spa",
    "sas",
    "snc",
    "ss",
    "sapa",
    "soc",
    "societa",
    "cooperative",
    "cooperativa",
    "azienda",
    "ditta",
    "di",
    "del",
    "della",
    "e",
    "the",
    "ltd",
    "llc",
    "inc",
    "co",
  ]);
  return normalizeText(entityName)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

/**
 * Punteggio ragione sociale in causale / controparte (0–30).
 */
export function scoreEntityInCausale(
  entityName: string,
  description: string,
  counterparty = ""
): number {
  const tokens = entityTokens(entityName);
  if (tokens.length === 0) return 0;

  const hay = `${normalizeText(description)} ${normalizeText(counterparty)}`;
  if (!hay.trim()) return 0;

  const nEnt = normalizeText(entityName);
  if (nEnt.length >= 4 && hay.includes(nEnt)) return 30;

  let hit = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hit += 1;
  }
  if (hit === 0) return 0;
  if (hit >= tokens.length) return 28;
  if (hit >= Math.ceil(tokens.length * 0.6)) return 20;
  if (hit >= 2 || (hit === 1 && tokens[0]!.length >= 6)) return 12;
  return 6;
}

function daysBetween(a: string, b: string): number | null {
  const d1 = Date.parse(a);
  const d2 = Date.parse(b);
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  return Math.abs(d1 - d2) / 86_400_000;
}

export function scoreBankInvoiceMatch(input: {
  amount: number;
  invoiceGross: number;
  counterparty: string;
  entityName: string;
  description: string;
  invoiceNumber: string;
  txDate: string | null;
  invoiceDate: string | null;
  /** Se valorizzato, scarta fatture del catalogo sbagliato rispetto al segno. */
  invoiceKind?: BankReconcileInvoiceKind | string | null;
}): number {
  const amount = Number(input.amount) || 0;
  const expectedKind = invoiceKindFromBankAmount(amount);
  if (!expectedKind) return 0;
  if (input.invoiceKind != null && String(input.invoiceKind) !== expectedKind) {
    return 0;
  }

  const absTx = Math.abs(amount);
  const absInv = Math.abs(Number(input.invoiceGross) || 0);
  if (absTx <= 0 || absInv <= 0) return 0;

  // 1) Importo: valori assoluti (tolleranza 1 centesimo)
  const amountDiff = Math.abs(absTx - absInv);
  if (amountDiff > 0.01) return 0;

  // 2) Data: ±5 giorni obbligatori
  if (!input.txDate || !input.invoiceDate) return 0;
  const days = daysBetween(input.txDate, input.invoiceDate);
  if (days == null || days > BANK_RECONCILE_DATE_WINDOW_DAYS) return 0;

  // Base: importo + data in finestra
  let score = 70;
  if (days <= 1) score += 5;
  else if (days <= 3) score += 3;

  // 3) Intestazione azienda ↔ causale / controparte
  score += scoreEntityInCausale(
    input.entityName,
    input.description,
    input.counterparty
  );

  // Numero fattura in causale (opzionale)
  const desc = normalizeText(input.description);
  const num = String(input.invoiceNumber ?? "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/\//g, "");
  if (num.length >= 3 && desc.replace(/\s+/g, "").includes(num)) {
    score += 8;
  }

  return Math.min(100, score);
}
