/** Serie locale della prova ordine. Non è un numero fiscale e non consuma 23/2026. */
export const EMAIL_PROVA_DEFAULT = "sandrohd@gmail.com";
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
