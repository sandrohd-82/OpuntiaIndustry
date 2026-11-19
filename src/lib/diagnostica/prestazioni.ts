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

export const CHIAVE_NAVIGAZIONI = "prestazioni-navigazioni";
export const CHIAVE_NAVIGAZIONI_OBSOLETA = "prestazioni-aree";
const LIMITE_NAVIGAZIONE_MS = 20_000;

export type RisorsaOsservata = {
  nome: string;
  start: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  duration: number;
  middlewareMs: number | null;
};

export type VoceLenta = {
  percorso: string;
  ms: number;
  blocca: boolean;
};

export type ResocontoNavigazione = {
  area: string;
  completata: boolean;
  schedaNascosta: boolean;
  transizioneMs: number;
  attesaPrimaRichiestaMs: number | null;
  rispostaServerMs: number | null;
  downloadMs: number | null;
  renderingMs: number | null;
  middlewareMs: number | null;
  richiesteFinestra: number;
  bloccanti: number;
  lente: VoceLenta[];
};

/** Solo area e, al massimo, la sezione. Query, token e identificativi restano fuori. */
export function percorsoMisurabile(nome: string): string {
  const senzaHash = nome.split("#")[0] ?? "";
  const senzaQuery = senzaHash.split("?")[0] ?? "";
  let path = senzaQuery;
  try {
    if (senzaQuery.includes("://")) path = new URL(senzaQuery).pathname;
  } catch {
    path = senzaQuery;
  }
  const parti = path.split("/").filter(Boolean);
  if (parti[0] !== "app") return "/altro";
  const sicuri = parti.slice(0, 3).map((parte) =>
    /^[0-9a-f]{8}-/i.test(parte) || /^\d+$/.test(parte) || parte.length > 24
      ? ":id"
      : parte
  );
  return `/${sicuri.join("/")}`;
}

export function richiestaBloccaNavigazione(nome: string, area: string): boolean {
  const query = nome.includes("?") ? nome.slice(nome.indexOf("?") + 1) : "";
  if (!/(?:^|&)_rsc=/.test(query)) return false;
  let path = nome.split("?")[0] ?? nome;
  try {
    path = new URL(nome, "https://misura.locale").pathname;
  } catch {
    path = nome.split("?")[0] ?? nome;
  }
  return path === area || path.startsWith(`${area}/`);
}

/**
 * Il tempo parte dal clic e si chiude al commit della nuova pagina.
 * Ciò che è avvenuto prima del clic, anche decine di secondi di inattività,
 * non entra nel resoconto.
 */
export function chiudiNavigazione(input: {
  area: string;
  clic: number;
  commit: number | null;
  ora: number;
  schedaNascosta: boolean;
  risorse: RisorsaOsservata[];
}): ResocontoNavigazione {
  const limite = input.clic + LIMITE_NAVIGAZIONE_MS;
  const completata = input.commit != null && input.commit <= limite;
  const fine = completata && input.commit != null ? input.commit : Math.min(input.ora, limite);
  const nellaFinestra = input.risorse.filter(
    (risorsa) => risorsa.start >= input.clic - 5 && risorsa.start <= fine + 30
  );
  const bloccanti = nellaFinestra.filter((risorsa) =>
    richiestaBloccaNavigazione(risorsa.nome, input.area)
  );
  const primaria = bloccanti.reduce<RisorsaOsservata | null>((scelta, risorsa) => {
    if (!scelta || risorsa.responseEnd > scelta.responseEnd) return risorsa;
    return scelta;
  }, null);
  const inizioRete = primaria ? primaria.requestStart || primaria.start : 0;
  const lente = [...nellaFinestra]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((risorsa) => ({
      percorso: percorsoMisurabile(risorsa.nome),
      ms: Math.round(risorsa.duration),
      blocca: richiestaBloccaNavigazione(risorsa.nome, input.area),
    }));

  return {
    area: input.area,
    completata,
    schedaNascosta: input.schedaNascosta,
    transizioneMs: Math.max(0, Math.round(fine - input.clic)),
    attesaPrimaRichiestaMs: primaria ? Math.max(0, Math.round(inizioRete - input.clic)) : null,
    rispostaServerMs:
      primaria && primaria.responseStart > 0
        ? Math.max(0, Math.round(primaria.responseStart - inizioRete))
        : null,
    downloadMs:
      primaria && primaria.responseEnd > 0 && primaria.responseStart > 0
        ? Math.max(0, Math.round(primaria.responseEnd - primaria.responseStart))
        : null,
    renderingMs:
      completata && input.commit != null && primaria && primaria.responseEnd > 0
        ? Math.max(0, Math.round(input.commit - primaria.responseEnd))
        : null,
    middlewareMs: primaria?.middlewareMs ?? null,
    richiesteFinestra: nellaFinestra.length,
    bloccanti: bloccanti.length,
    lente,
  };
}

export function interpretaAzione(input: {
  andataMs: number;
  azioneMs: number;
  contestoMs: number;
  istanzaMs: number;
  invioMs: number | null;
  ttfbMs: number | null;
  downloadMs: number | null;
  middlewareMs: number | null;
}): string {
  const fuori = Math.max(0, input.andataMs - input.azioneMs);
  const istanzaSecondi = Math.round(input.istanzaMs / 1000);
  if (input.istanzaMs < 20_000 && fuori > 2_000) {
    return `Istanza accesa da ${istanzaSecondi} s. ${fuori} ms sono fuori dal corpo della funzione: compatibile con un avvio a freddo.`;
  }
  if (input.invioMs != null && input.invioMs > 1_000) {
    return `Il browser ha atteso ${input.invioMs} ms prima di inviare la richiesta.`;
  }
  if (input.downloadMs != null && input.downloadMs > 1_000) {
    return `Il trasferimento della risposta ha richiesto ${input.downloadMs} ms.`;
  }
  if (input.azioneMs > input.contestoMs + 1_000) {
    return `Dentro la funzione, oltre la verifica autenticazione, restano ${input.azioneMs - input.contestoMs} ms.`;
  }
  if (input.ttfbMs != null && input.middlewareMs != null && input.ttfbMs > input.azioneMs + 1_000) {
    return `La risposta è arrivata in ${input.ttfbMs} ms, la funzione ne ha usati ${input.azioneMs}. Il resto è rete, protocollo o attesa prima della funzione. Middleware ${input.middlewareMs} ms.`;
  }
  return `Richiesta ${input.andataMs} ms, funzione ${input.azioneMs} ms, verifica autenticazione ${input.contestoMs} ms. Fuori dalla funzione: ${fuori} ms.`;
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
