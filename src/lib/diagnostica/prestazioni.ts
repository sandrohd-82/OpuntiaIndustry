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

export const CHIAVE_NAVIGAZIONI = "prestazioni-navigazioni-2";
export const CHIAVE_NAVIGAZIONI_OBSOLETA = "prestazioni-aree";
export const CHIAVE_NAVIGAZIONI_PRECEDENTE = "prestazioni-navigazioni";
export const FINESTRA_RICHIESTE_MS = 60_000;
export const CHIAVE_ELENCO_CLIENTI = "prestazioni-elenco-clienti";
export const CHIAVE_CLIC_AREA = "prestazioni-clic-area";
export const CHIAVE_SONDA_PRESTAZIONI = "prestazioni-sonda";

export type TempiServerElencoClienti = {
  accessoMs: number;
  filtroMs: number;
  queryMs: number;
  identificativiMs: number;
  etichetteUtentiMs: number;
  nomiMs: number;
  prenotateMs: number;
  mappaMs: number;
  etichetteMs: number;
  totaleMs: number;
  righe: number;
};

export type MisuraElencoClienti = TempiServerElencoClienti & {
  montaggioAAvvioMs: number;
  associata: boolean;
  altreAzioni: number;
  primaDelFetchMs: number | null;
  fetchMs: number | null;
  dopoIlFetchMs: number | null;
  fetchOsservati: number;
  attesaAzioneMs: number;
  ricevutoAt: number;
  renderingMs: number | null;
  clicAMontaggioMs?: number | null;
  fetchOrdinari?: number;
  fetchRsc?: number;
  inCorso?: number;
  inCorsoRsc?: number;
  inCorsoNonClassificati?: number;
  etaMassimaInCorsoMs?: number | null;
  inCorsoAffidabile?: boolean;
};

export type ConclusioneAttesaInvio =
  | "dimostrata"
  | "compatibile"
  | "non-identificata"
  | "sotto-il-secondo";
export const AREE_CONTENUTO = [
  "dashboard",
  "amministrazione",
  "commerciale",
  "produzione",
  "magazzino",
] as const;
export const LIMITE_NAVIGAZIONE_MS = 60_000;

export type CategoriaRichiesta =
  | "navigazione"
  | "script"
  | "autenticazione"
  | "notifiche"
  | "dati"
  | "altro";

export type MotivoRete =
  | "misurata"
  | "prefetch-conclusa"
  | "prefetch-in-corso"
  | "registro-pieno"
  | "non-esposta";

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
  id: number;
  area: string;
  completata: boolean;
  schedaNascosta: boolean;
  chiusa: boolean;
  transizioneMs: number;
  contenutoMs: number | null;
  datiMs: number | null;
  motivoRete: MotivoRete;
  prefetchMs: number | null;
  attesaPrimaRichiestaMs: number | null;
  rispostaServerMs: number | null;
  downloadMs: number | null;
  renderingMs: number | null;
  middlewareMs: number | null;
  richiesteFinestra: number;
  bloccanti: number;
  secondarieAperte: number;
  bufferPieno: boolean;
  lente: VoceLenta[];
};

export type GruppoRichieste = {
  categoria: CategoriaRichiesta;
  percorso: string;
  conteggio: number;
  durataMediaMs: number;
  durataMaxMs: number;
  intervalloMedianoMs: number | null;
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
  if (!/(?:^|&)_rsc(?:=|&|$)/.test(query)) return false;
  let path = nome.split("?")[0] ?? nome;
  try {
    path = new URL(nome, "https://misura.locale").pathname;
  } catch {
    path = nome.split("?")[0] ?? nome;
  }
  return path === area || path.startsWith(`${area}/`);
}

export function classificaRichiesta(nome: string): CategoriaRichiesta {
  const query = nome.includes("?") ? nome.slice(nome.indexOf("?") + 1) : "";
  let path = nome.split("?")[0] ?? nome;
  try {
    path = new URL(nome, "https://misura.locale").pathname;
  } catch {
    path = nome.split("?")[0] ?? nome;
  }
  if (path.includes("/_next/static") || path.endsWith(".js") || path.endsWith(".css")) {
    return "script";
  }
  if (path.includes("/auth/v1")) return "autenticazione";
  if (
    path.includes("/notifiche") ||
    path.includes("/avvisi") ||
    path.includes("/trello") ||
    path.includes("/api/chat/notify")
  ) {
    return "notifiche";
  }
  if (/(?:^|&)_rsc(?:=|&|$)/.test(query)) return "navigazione";
  if (path.startsWith("/api/") || path.includes("/rest/v1")) return "dati";
  return "altro";
}

export function nomeSenzaSegreti(nome: string): string {
  let url: URL;
  try {
    url = new URL(nome, "https://misura.locale");
  } catch {
    return "https://misura.locale/altro";
  }
  const parti = url.pathname
    .split("/")
    .filter(Boolean)
    .map((parte) =>
      /^[0-9a-f]{8}-/i.test(parte) || /^\d+$/.test(parte) || parte.length > 24
        ? ":id"
        : parte
    );
  const path = `/${parti.join("/")}`;
  const rsc = url.searchParams.has("_rsc");
  return rsc ? `https://misura.locale${path}?_rsc=1` : `https://misura.locale${path}`;
}

/**
 * Il tempo parte dal clic e si chiude al commit della nuova pagina.
 * Ciò che è avvenuto prima del clic, anche decine di secondi di inattività,
 * non entra nel resoconto.
 */
function ultima(risorse: RisorsaOsservata[]): RisorsaOsservata | null {
  return risorse.reduce<RisorsaOsservata | null>((scelta, risorsa) => {
    if (!scelta || risorsa.responseEnd > scelta.responseEnd) return risorsa;
    return scelta;
  }, null);
}

export function chiudiNavigazione(input: {
  area: string;
  clic: number;
  commit: number | null;
  contenuto?: number | null;
  dati?: number | null;
  ora: number;
  schedaNascosta: boolean;
  chiusa?: boolean;
  bufferPieno?: boolean;
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
  const inCorsoPrima = input.risorse.filter(
    (risorsa) =>
      richiestaBloccaNavigazione(risorsa.nome, input.area) &&
      risorsa.start < input.clic - 5 &&
      (risorsa.responseEnd === 0 || risorsa.responseEnd >= input.clic)
  );
  const conclusePrima = input.risorse.filter(
    (risorsa) =>
      richiestaBloccaNavigazione(risorsa.nome, input.area) &&
      risorsa.responseEnd > 0 &&
      risorsa.responseEnd < input.clic
  );
  const primariaFinestra = ultima(bloccanti);
  const primariaPrecedente = ultima(inCorsoPrima);
  const primaria = primariaFinestra ?? primariaPrecedente;
  const prefetch = ultima(conclusePrima);
  const inizioRete = primaria ? primaria.requestStart || primaria.start : 0;
  let motivoRete: MotivoRete = "non-esposta";
  if (primariaFinestra) motivoRete = "misurata";
  else if (primariaPrecedente) motivoRete = "prefetch-in-corso";
  else if (prefetch) motivoRete = "prefetch-conclusa";
  else if (input.bufferPieno) motivoRete = "registro-pieno";
  const lente = [...nellaFinestra]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((risorsa) => ({
      percorso: percorsoMisurabile(risorsa.nome),
      ms: Math.round(risorsa.duration),
      blocca: richiestaBloccaNavigazione(risorsa.nome, input.area),
    }));
  const istanteContenuto = input.contenuto ?? fine;
  const secondarieAperte = nellaFinestra.filter(
    (risorsa) =>
      !richiestaBloccaNavigazione(risorsa.nome, input.area) &&
      (risorsa.responseEnd === 0 || risorsa.responseEnd > istanteContenuto)
  ).length;

  return {
    id: Math.round(input.clic),
    area: input.area,
    completata,
    schedaNascosta: input.schedaNascosta,
    chiusa: input.chiusa ?? true,
    transizioneMs: Math.max(0, Math.round(fine - input.clic)),
    contenutoMs:
      input.contenuto != null ? Math.max(0, Math.round(input.contenuto - input.clic)) : null,
    datiMs: input.dati != null ? Math.max(0, Math.round(input.dati - input.clic)) : null,
    motivoRete,
    prefetchMs: prefetch ? Math.round(prefetch.duration) : null,
    attesaPrimaRichiestaMs: primaria
      ? primariaFinestra
        ? Math.max(0, Math.round(inizioRete - input.clic))
        : 0
      : null,
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
    bloccanti: bloccanti.length + (primariaFinestra || inCorsoPrima.length === 0 ? 0 : 1),
    secondarieAperte,
    bufferPieno: Boolean(input.bufferPieno),
    lente,
  };
}

export function raggruppaRichieste(input: {
  risorse: RisorsaOsservata[];
  ora: number;
  finestraMs: number;
}): GruppoRichieste[] {
  const dentro = input.risorse.filter(
    (risorsa) => risorsa.start >= input.ora - input.finestraMs && risorsa.start <= input.ora
  );
  const gruppi = new Map<string, RisorsaOsservata[]>();
  for (const risorsa of dentro) {
    const categoria = classificaRichiesta(risorsa.nome);
    const chiave = `${categoria}|${percorsoMisurabile(risorsa.nome)}`;
    const lista = gruppi.get(chiave) ?? [];
    lista.push(risorsa);
    gruppi.set(chiave, lista);
  }
  const risultato: GruppoRichieste[] = [];
  for (const [chiave, lista] of gruppi) {
    const [categoria, percorso] = chiave.split("|") as [CategoriaRichiesta, string];
    const ordinate = [...lista].sort((a, b) => a.start - b.start);
    const intervalli: number[] = [];
    for (let i = 1; i < ordinate.length; i += 1) {
      intervalli.push(ordinate[i].start - ordinate[i - 1].start);
    }
    intervalli.sort((a, b) => a - b);
    const durata = ordinate.reduce((somma, risorsa) => somma + risorsa.duration, 0);
    risultato.push({
      categoria,
      percorso,
      conteggio: ordinate.length,
      durataMediaMs: Math.round(durata / ordinate.length),
      durataMaxMs: Math.round(Math.max(...ordinate.map((risorsa) => risorsa.duration))),
      intervalloMedianoMs:
        intervalli.length === 0
          ? null
          : Math.round(intervalli[Math.floor(intervalli.length / 2)] ?? 0),
    });
  }
  return risultato.sort((a, b) => b.conteggio - a.conteggio || b.durataMaxMs - a.durataMaxMs);
}

export function fasiChiamataClient(input: {
  clic: number;
  fine: number;
  fetch: { inizio: number; fine: number }[];
}): {
  primaMs: number | null;
  reteMs: number | null;
  dopoMs: number | null;
  fetchOsservati: number;
} {
  const utili = input.fetch.filter(
    (voce) => voce.fine >= input.clic && voce.inizio <= input.fine + 20
  );
  if (utili.length === 0) {
    return { primaMs: null, reteMs: null, dopoMs: null, fetchOsservati: 0 };
  }
  const principale = utili.reduce((scelta, voce) =>
    Math.abs(voce.fine - input.fine) < Math.abs(scelta.fine - input.fine) ? voce : scelta
  );
  return {
    primaMs: Math.max(0, Math.round(principale.inizio - input.clic)),
    reteMs: Math.max(0, Math.round(principale.fine - principale.inizio)),
    dopoMs: Math.max(0, Math.round(input.fine - principale.fine)),
    fetchOsservati: utili.length,
  };
}

export function corpoContieneMarca(corpo: string, marca: string): boolean {
  return marca.length >= 16 && corpo.includes(marca);
}

export function clicAMontaggio(
  clic: { area: string; t: number } | null,
  montato: number
): number | null {
  if (clic == null || clic.area !== "commerciale") return null;
  if (!Number.isFinite(clic.t) || !Number.isFinite(montato) || clic.t > montato) return null;
  const delta = montato - clic.t;
  if (delta > LIMITE_NAVIGAZIONE_MS) return null;
  return Math.round(delta);
}

export function riassuntoRichiesteAperte(
  voci: { start: number; responseEnd: number; rsc: boolean }[],
  ora: number
): {
  inCorso: number;
  inCorsoRsc: number;
  inCorsoNonClassificati: number;
  etaMassimaMs: number | null;
} {
  let inCorso = 0;
  let inCorsoRsc = 0;
  let inCorsoNonClassificati = 0;
  let etaMassimaMs: number | null = null;
  for (const voce of voci) {
    if (voce.responseEnd !== 0 || !Number.isFinite(voce.start) || voce.start > ora) continue;
    inCorso += 1;
    if (voce.rsc) inCorsoRsc += 1;
    else inCorsoNonClassificati += 1;
    const eta = Math.max(0, Math.round(ora - voce.start));
    if (etaMassimaMs == null || eta > etaMassimaMs) etaMassimaMs = eta;
  }
  return { inCorso, inCorsoRsc, inCorsoNonClassificati, etaMassimaMs };
}

export function classeRichiestaOsservata(input: {
  azione: boolean;
  rsc: boolean;
  contieneMarca: boolean;
}): "elenco" | "azione" | "rsc" | "ordinario" {
  if (input.azione && input.contieneMarca) return "elenco";
  if (input.azione) return "azione";
  if (input.rsc) return "rsc";
  return "ordinario";
}

export function conclusioneAttesaInvio(input: {
  associata: boolean;
  primaDelFetchMs: number | null;
  altreAzioni: number;
  fetchOrdinari: number;
  fetchRsc: number;
  inCorso: number;
  inCorsoAffidabile: boolean;
}): ConclusioneAttesaInvio {
  if (!input.associata || input.primaDelFetchMs == null) return "non-identificata";
  if (input.primaDelFetchMs < 1000) return "sotto-il-secondo";
  if (input.altreAzioni > 0) return "dimostrata";
  const indizi =
    input.fetchOrdinari + input.fetchRsc + (input.inCorsoAffidabile ? input.inCorso : 0);
  if (indizi > 0) return "compatibile";
  return "non-identificata";
}

export function rispostaAdElencoProntoMs(
  dopoIlFetchMs: number | null,
  renderingMs: number | null
): number | null {
  if (dopoIlFetchMs == null && renderingMs == null) return null;
  return (dopoIlFetchMs ?? 0) + (renderingMs ?? 0);
}

export function fasiAzioneAssociata(input: {
  avvio: number;
  fine: number;
  richiesta: { inizio: number; fine: number } | null;
  altreAzioni: number;
}): {
  associata: boolean;
  primaMs: number | null;
  fetchMs: number | null;
  dopoMs: number | null;
  altreAzioni: number;
} {
  if (input.richiesta == null) {
    return {
      associata: false,
      primaMs: null,
      fetchMs: null,
      dopoMs: null,
      altreAzioni: input.altreAzioni,
    };
  }
  return {
    associata: true,
    primaMs: Math.max(0, Math.round(input.richiesta.inizio - input.avvio)),
    fetchMs: Math.max(0, Math.round(input.richiesta.fine - input.richiesta.inizio)),
    dopoMs: Math.max(0, Math.round(input.fine - input.richiesta.fine)),
    altreAzioni: input.altreAzioni,
  };
}

export function trattoElencoClienti(misura: {
  associata?: boolean;
  primaDelFetchMs: number | null;
  queryMs: number;
  etichetteMs: number;
  accessoMs: number;
  filtroMs: number;
  dopoIlFetchMs: number | null;
  renderingMs: number | null;
  fetchMs: number | null;
  totaleMs: number;
}): string {
  const associata = misura.associata === true;
  const tratti: [string, number][] = [
    ["prima dell'invio", associata ? (misura.primaDelFetchMs ?? 0) : 0],
    ["query clienti", misura.queryMs],
    ["etichette", misura.etichetteMs],
    ["accesso", misura.accessoMs],
    ["filtro visibilità", misura.filtroMs],
    ["fetch oltre la funzione", associata ? Math.max(0, (misura.fetchMs ?? 0) - misura.totaleMs) : 0],
    ["dopo la risposta", associata ? (misura.dopoIlFetchMs ?? 0) : 0],
    ["rendering", misura.renderingMs ?? 0],
  ];
  const scelto = tratti.reduce((corrente, voce) => (voce[1] > corrente[1] ? voce : corrente));
  if (scelto[1] < 1000) return "nessun tratto oltre un secondo";
  return scelto[0];
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
  if (input.invioMs != null && input.invioMs > 1_000) {
    return `Il browser ha atteso ${input.invioMs} ms prima di inviare la richiesta. Istanza accesa da ${istanzaSecondi} s.`;
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
