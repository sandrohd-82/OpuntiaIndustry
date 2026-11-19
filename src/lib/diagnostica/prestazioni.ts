/** Log solo durata e nome operazione. Nessun identificativo, cookie o contenuto. */
export function notaPrestazione(operazione: string, inizioMs: number): void {
  if (process.env.PRESTAZIONI_LOG !== "1") return;
  const ms = Math.round(performance.now() - inizioMs);
  console.info(`[prestazioni] ${operazione} ${ms}ms`);
}

export function scansioneFattureMailRichiesta(input: {
  areaAmministrazione: boolean;
  giaEseguita: boolean;
  richiestoOperatore: boolean;
}): boolean {
  if (input.richiestoOperatore) return true;
  return input.areaAmministrazione && !input.giaEseguita;
}

export function scansionePromozioniRichiesta(input: {
  areaPertinente: boolean;
  giaEseguita: boolean;
}): boolean {
  return input.areaPertinente && !input.giaEseguita;
}

export function controlloTrelloConsentito(input: {
  finestraNascosta: boolean;
  richiestaInCorso: boolean;
}): boolean {
  return !input.finestraNascosta && !input.richiestaInCorso;
}

export function mappaMenuDaCaricare(input: {
  giaCaricata: boolean;
  percorso: string;
  areaAperta: string | undefined;
}): boolean {
  if (input.giaCaricata) return false;
  if (input.percorso.startsWith("/app/magazzino")) return true;
  return Boolean(input.areaAperta);
}
