/** Destinatario della copia di controllo. Non è l'indirizzo del cliente. */
export const EMAIL_CONTROLLO_DEFAULT = "sandrohd@gmail.com";

/**
 * Fase test accesa sugli ordini: lo SDI non parte e il numero fiscale
 * non viene consumato. Ogni mail di ordine va solo a sandrohd@gmail.com.
 */
export const FASE_TEST_INVIO = true;

/** Serie lasciata solo per riconoscere un eventuale ordine di prova già salvato. */
export const PREFISSO_FATTURA_PROVA = "PROVA-";
export const PREFISSO_ORDINE_PROVA = "Or-PROVA/";

export function isFatturaProva(row: {
  numero_fattura?: string | null;
  numero_interno?: string | null;
  numeroFattura?: string | null;
  numeroInterno?: string | null;
}): boolean {
  const pubblico = String(row.numero_fattura ?? row.numeroFattura ?? "").trim();
  const interno = String(row.numero_interno ?? row.numeroInterno ?? "").trim();
  return (
    pubblico.startsWith(PREFISSO_FATTURA_PROVA) ||
    interno.startsWith("Ft-PROVA-")
  );
}

export function isOrdineProva(numeroInterno: string | null | undefined): boolean {
  return String(numeroInterno ?? "").trim().startsWith(PREFISSO_ORDINE_PROVA);
}

export function prossimoProgressivoProva(esistenti: string[], anno: number): number {
  const re = new RegExp(
    `^(?:PROVA-|Or-PROVA/|Ft-PROVA-)(\\d+)/${anno}$`
  );
  let max = 0;
  for (const valore of esistenti) {
    const match = String(valore ?? "").trim().match(re);
    if (!match) continue;
    max = Math.max(max, Number(match[1]) || 0);
  }
  return max + 1;
}

export function numeroFatturaProva(progressivo: number, anno: number): string {
  return `${PREFISSO_FATTURA_PROVA}${String(progressivo).padStart(2, "0")}/${anno}`;
}

export function numeroOrdineProva(progressivo: number, anno: number): string {
  return `${PREFISSO_ORDINE_PROVA}${String(progressivo).padStart(2, "0")}/${anno}`;
}

export function oggiRoma(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(new Date());
}
