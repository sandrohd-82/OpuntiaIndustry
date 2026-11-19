/** Log solo durata e nome operazione. Nessun identificativo, cookie o contenuto. */
export function notaPrestazione(operazione: string, inizioMs: number): void {
  if (process.env.PRESTAZIONI_LOG !== "1") return;
  const ms = Math.round(performance.now() - inizioMs);
  console.info(`[prestazioni] ${operazione} ${ms}ms`);
}

export type StatoScansioneMail = "assente" | "completa" | "incompleta";

export function statoScansioneDopoEsito(input: {
  riuscita: boolean;
  restano: boolean;
}): StatoScansioneMail {
  if (!input.riuscita) return "assente";
  return input.restano ? "incompleta" : "completa";
}

export function decisioneScansioneFatture(input: {
  areaAmministrazione: boolean;
  stato: StatoScansioneMail;
  richiestoOperatore: boolean;
  richiestaInCorso: boolean;
  elencoGiaRiuscito: boolean;
}): "attendi" | "elenco" | "scansione" {
  if (input.richiestaInCorso) return "attendi";
  if (input.richiestoOperatore) return "scansione";
  if (input.areaAmministrazione && input.stato === "assente") return "scansione";
  if (input.elencoGiaRiuscito) return "attendi";
  return "elenco";
}

export function decisioneScansionePromozioni(input: {
  areaPertinente: boolean;
  giaRiuscita: boolean;
  richiestaInCorso: boolean;
  elencoGiaRiuscito: boolean;
}): "attendi" | "elenco" | "scansione" {
  if (input.richiestaInCorso) return "attendi";
  if (input.areaPertinente && !input.giaRiuscita) return "scansione";
  if (input.elencoGiaRiuscito) return "attendi";
  return "elenco";
}

export function scansioneFattureMailRichiesta(input: {
  areaAmministrazione: boolean;
  giaEseguita: boolean;
  richiestoOperatore: boolean;
}): boolean {
  return (
    decisioneScansioneFatture({
      areaAmministrazione: input.areaAmministrazione,
      stato: input.giaEseguita ? "completa" : "assente",
      richiestoOperatore: input.richiestoOperatore,
      richiestaInCorso: false,
      elencoGiaRiuscito: true,
    }) === "scansione"
  );
}

export function scansionePromozioniRichiesta(input: {
  areaPertinente: boolean;
  giaEseguita: boolean;
}): boolean {
  return (
    decisioneScansionePromozioni({
      areaPertinente: input.areaPertinente,
      giaRiuscita: input.giaEseguita,
      richiestaInCorso: false,
      elencoGiaRiuscito: true,
    }) === "scansione"
  );
}

/**
 * Node 24 su Windows risponde EISDIR quando readlink incontra un file o una
 * cartella che non sono un collegamento. Webpack ignora solo EINVAL.
 * ENOENT, permessi e i collegamenti veri non vengono toccati.
 */
export function readlinkEisdirDaIgnorare(input: {
  piattaformaWindows: boolean;
  codice: string;
  syscall: string;
  percorsoEsiste: boolean;
  collegamento: boolean;
}): boolean {
  if (!input.piattaformaWindows) return false;
  if (input.codice !== "EISDIR" || input.syscall !== "readlink") return false;
  if (!input.percorsoEsiste || input.collegamento) return false;
  return true;
}

export function preloadReadlinkRichiesto(piattaforma: string): boolean {
  return piattaforma === "win32";
}

export function areaMisurabile(pathname: string): string {
  const parti = pathname.split("/").filter(Boolean);
  if (parti[0] !== "app" || !parti[1]) return "/app";
  return `/app/${parti[1]}`;
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
