export const RUOLO_FORNITORE = "fornitore";
export const AREA_FORNITORI_PERCORSO = "/app/area-fornitori";

/** Il permesso grafico resta nel perimetro dell'Area Fornitori. */
export function permessoNelPerimetroFornitore(pageKey: string): boolean {
  const chiave = pageKey.trim();
  if (chiave.startsWith("action:")) {
    return chiave.startsWith(`action:${AREA_FORNITORI_PERCORSO}`);
  }
  return chiave === AREA_FORNITORI_PERCORSO || chiave.startsWith(`${AREA_FORNITORI_PERCORSO}/`);
}

/** Accessi aziendali diversi dal solo portale fornitore. */
export function motivoAltriAccessiAziendali(input: {
  ruolo: string;
  inOrganigramma: boolean;
  reparti: number;
  caselle: number;
}): string | null {
  const motivi: string[] = [];
  if (input.ruolo !== RUOLO_FORNITORE) motivi.push("un ruolo aziendale");
  if (input.inOrganigramma) motivi.push("una scheda in organigramma");
  if (input.reparti > 0) motivi.push("reparti aziendali");
  if (input.caselle > 0) motivi.push("caselle di posta");
  if (motivi.length === 0) return null;
  return `Questo account ha anche ${motivi.join(", ")}. La sospensione blocca l'accesso a tutto il gestionale, non solo a questo fornitore.`;
}
