import assert from "node:assert/strict";
import {
  areaMisurabile,
  chiudiNavigazione,
  classificaRichiesta,
  fasiChiamataClient,
  controlloTrelloConsentito,
  decisioneScansioneFatture,
  decisioneScansionePromozioni,
  interpretaAzione,
  trattoElencoClienti,
  mappaMenuDaCaricare,
  percorsoMisurabile,
  raggruppaRichieste,
  richiestaBloccaNavigazione,
  preloadReadlinkRichiesto,
  readlinkEisdirDaIgnorare,
  scansioneFattureMailRichiesta,
  scansionePromozioniRichiesta,
  statoScansioneDopoEsito,
} from "./prestazioni";

assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: false,
    giaEseguita: false,
    richiestoOperatore: false,
  }),
  false
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: true,
    giaEseguita: false,
    richiestoOperatore: false,
  }),
  true
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: true,
    giaEseguita: true,
    richiestoOperatore: false,
  }),
  false
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: false,
    giaEseguita: true,
    richiestoOperatore: true,
  }),
  true
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: false, giaEseguita: false }),
  false
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: true, giaEseguita: false }),
  true
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: true, giaEseguita: true }),
  false
);
assert.equal(controlloTrelloConsentito({ finestraNascosta: true, richiestaInCorso: false }), false);
assert.equal(controlloTrelloConsentito({ finestraNascosta: false, richiestaInCorso: true }), false);
assert.equal(controlloTrelloConsentito({ finestraNascosta: false, richiestaInCorso: false }), true);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/dashboard", areaAperta: undefined }),
  false
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/magazzino", areaAperta: undefined }),
  true
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/dashboard", areaAperta: "amministrazione" }),
  true
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: true, percorso: "/app/magazzino", areaAperta: "magazzino" }),
  false
);

assert.equal(statoScansioneDopoEsito({ riuscita: false, restano: false }), "assente");
assert.equal(statoScansioneDopoEsito({ riuscita: false, restano: true }), "assente");
assert.equal(statoScansioneDopoEsito({ riuscita: true, restano: true }), "incompleta");
assert.equal(statoScansioneDopoEsito({ riuscita: true, restano: false }), "completa");

assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: true,
    stato: "assente",
    richiestoOperatore: false,
    richiestaInCorso: true,
    elencoGiaRiuscito: false,
  }),
  "attendi"
);
assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: true,
    stato: "assente",
    richiestoOperatore: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: false,
  }),
  "scansione"
);
assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: true,
    stato: "completa",
    richiestoOperatore: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: true,
  }),
  "attendi"
);
assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: true,
    stato: "incompleta",
    richiestoOperatore: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: true,
  }),
  "attendi"
);
assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: false,
    stato: "completa",
    richiestoOperatore: true,
    richiestaInCorso: false,
    elencoGiaRiuscito: true,
  }),
  "scansione"
);
assert.equal(
  decisioneScansioneFatture({
    areaAmministrazione: false,
    stato: "assente",
    richiestoOperatore: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: false,
  }),
  "elenco"
);

assert.equal(
  decisioneScansionePromozioni({
    areaPertinente: true,
    giaRiuscita: false,
    richiestaInCorso: true,
    elencoGiaRiuscito: false,
  }),
  "attendi"
);
assert.equal(
  decisioneScansionePromozioni({
    areaPertinente: true,
    giaRiuscita: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: false,
  }),
  "scansione"
);
assert.equal(
  decisioneScansionePromozioni({
    areaPertinente: true,
    giaRiuscita: true,
    richiestaInCorso: false,
    elencoGiaRiuscito: true,
  }),
  "attendi"
);
assert.equal(
  decisioneScansionePromozioni({
    areaPertinente: false,
    giaRiuscita: false,
    richiestaInCorso: false,
    elencoGiaRiuscito: true,
  }),
  "attendi"
);

assert.equal(
  readlinkEisdirDaIgnorare({
    piattaformaWindows: false,
    codice: "EISDIR",
    syscall: "readlink",
    percorsoEsiste: true,
    collegamento: false,
  }),
  false
);
assert.equal(
  readlinkEisdirDaIgnorare({
    piattaformaWindows: true,
    codice: "EISDIR",
    syscall: "readlink",
    percorsoEsiste: true,
    collegamento: true,
  }),
  false
);
assert.equal(
  readlinkEisdirDaIgnorare({
    piattaformaWindows: true,
    codice: "ENOENT",
    syscall: "readlink",
    percorsoEsiste: false,
    collegamento: false,
  }),
  false
);
assert.equal(
  readlinkEisdirDaIgnorare({
    piattaformaWindows: true,
    codice: "EACCES",
    syscall: "readlink",
    percorsoEsiste: true,
    collegamento: false,
  }),
  false
);
assert.equal(
  readlinkEisdirDaIgnorare({
    piattaformaWindows: true,
    codice: "EISDIR",
    syscall: "readlink",
    percorsoEsiste: true,
    collegamento: false,
  }),
  true
);
assert.equal(preloadReadlinkRichiesto("win32"), true);
assert.equal(preloadReadlinkRichiesto("linux"), false);
assert.equal(areaMisurabile("/app/amministrazione/fatture/abc"), "/app/amministrazione");
assert.equal(areaMisurabile("/app/dashboard"), "/app/dashboard");

const conInattivita = chiudiNavigazione({
  area: "/app/impostazioni",
  clic: 70_000,
  commit: 70_800,
  ora: 70_800,
  schedaNascosta: false,
  risorse: [
    {
      nome: "https://app.example/app/dashboard?_rsc=vecchia",
      start: 100,
      requestStart: 120,
      responseStart: 71_000,
      responseEnd: 71_200,
      duration: 71_100,
      middlewareMs: 80,
    },
    {
      nome: "https://app.example/app/impostazioni/fiscale?_rsc=nuova",
      start: 70_100,
      requestStart: 70_140,
      responseStart: 70_420,
      responseEnd: 70_500,
      duration: 400,
      middlewareMs: 90,
    },
    {
      nome: "https://app.example/api/avvisi",
      start: 70_110,
      requestStart: 70_110,
      responseStart: 71_110,
      responseEnd: 71_110,
      duration: 5_000,
      middlewareMs: null,
    },
  ],
});
assert.equal(conInattivita.transizioneMs, 800);
assert.equal(conInattivita.completata, true);
assert.equal(conInattivita.schedaNascosta, false);
assert.equal(conInattivita.attesaPrimaRichiestaMs, 140);
assert.equal(conInattivita.rispostaServerMs, 280);
assert.equal(conInattivita.downloadMs, 80);
assert.equal(conInattivita.renderingMs, 300);
assert.equal(conInattivita.middlewareMs, 90);
assert.equal(conInattivita.bloccanti, 1);
assert.equal(conInattivita.richiesteFinestra, 2);
assert.equal(conInattivita.lente[0]?.blocca, false);
assert.equal(conInattivita.lente[1]?.blocca, true);

const incompleta = chiudiNavigazione({
  area: "/app/impostazioni",
  clic: 1_000,
  commit: null,
  ora: 80_000,
  schedaNascosta: true,
  risorse: [],
});
assert.equal(incompleta.completata, false);
assert.equal(incompleta.schedaNascosta, true);
assert.equal(incompleta.transizioneMs, 60_000);
assert.equal(incompleta.rispostaServerMs, null);

assert.equal(
  percorsoMisurabile("https://app.example/app/impostazioni/fatture/11111111-2222-3333-4444-555555555555?_rsc=token"),
  "/app/impostazioni/fatture"
);
assert.equal(percorsoMisurabile("https://app.example/api/private?token=segreto"), "/altro");
assert.equal(
  richiestaBloccaNavigazione("https://app.example/app/dashboard?_rsc=x", "/app/impostazioni"),
  false
);
assert.equal(
  richiestaBloccaNavigazione("https://app.example/app/impostazioni?_rsc=x", "/app/impostazioni"),
  true
);

assert.match(
  interpretaAzione({
    andataMs: 7_714,
    azioneMs: 400,
    contestoMs: 381,
    istanzaMs: 1_200,
    invioMs: 20,
    ttfbMs: 7_400,
    downloadMs: 40,
    middlewareMs: 90,
  }),
  /prima della funzione/
);
assert.match(
  interpretaAzione({
    andataMs: 7_714,
    azioneMs: 400,
    contestoMs: 381,
    istanzaMs: 120_000,
    invioMs: 20,
    ttfbMs: 7_400,
    downloadMs: 40,
    middlewareMs: 90,
  }),
  /prima della funzione/
);

const prefetchConclusa = chiudiNavigazione({
  area: "/app/magazzino",
  clic: 5_000,
  commit: 5_080,
  contenuto: 5_200,
  dati: 5_900,
  ora: 5_900,
  schedaNascosta: false,
  risorse: [
    {
      nome: "https://app.example/app/magazzino/panoramica?_rsc=prima",
      start: 1_000,
      requestStart: 1_020,
      responseStart: 1_400,
      responseEnd: 1_500,
      duration: 500,
      middlewareMs: 40,
    },
  ],
});
assert.equal(prefetchConclusa.motivoRete, "prefetch-conclusa");
assert.equal(prefetchConclusa.rispostaServerMs, null);
assert.equal(prefetchConclusa.prefetchMs, 500);
assert.equal(prefetchConclusa.transizioneMs, 80);
assert.equal(prefetchConclusa.contenutoMs, 200);
assert.equal(prefetchConclusa.datiMs, 900);

const prefetchAperta = chiudiNavigazione({
  area: "/app/produzione",
  clic: 5_000,
  commit: 5_600,
  ora: 5_600,
  schedaNascosta: false,
  risorse: [
    {
      nome: "https://app.example/app/produzione/foglio-ingresso-mp/nuovo?_rsc=aperta",
      start: 4_800,
      requestStart: 4_820,
      responseStart: 5_300,
      responseEnd: 5_400,
      duration: 600,
      middlewareMs: 70,
    },
  ],
});
assert.equal(prefetchAperta.motivoRete, "prefetch-in-corso");
assert.equal(prefetchAperta.attesaPrimaRichiestaMs, 0);
assert.equal(prefetchAperta.rispostaServerMs, 480);
assert.equal(prefetchAperta.bloccanti, 1);

const senzaRete = chiudiNavigazione({
  area: "/app/dashboard",
  clic: 1_000,
  commit: 1_040,
  contenuto: 1_050,
  dati: 1_050,
  ora: 1_050,
  schedaNascosta: false,
  bufferPieno: true,
  risorse: [],
});
assert.equal(senzaRete.motivoRete, "registro-pieno");
assert.equal(senzaRete.rispostaServerMs, null);
assert.equal(senzaRete.downloadMs, null);

assert.equal(classificaRichiesta("https://app.example/app/dashboard?_rsc=1"), "navigazione");
assert.equal(classificaRichiesta("https://proj.supabase.co/auth/v1/user"), "autenticazione");
assert.equal(classificaRichiesta("https://app.example/api/notifiche/letto"), "notifiche");
assert.equal(classificaRichiesta("https://proj.supabase.co/rest/v1/clienti"), "dati");
assert.equal(classificaRichiesta("https://app.example/_next/static/chunks/app.js"), "script");
assert.equal(classificaRichiesta("https://app.example/app/dashboard"), "altro");

const gruppi = raggruppaRichieste({
  ora: 80_000,
  finestraMs: 60_000,
  risorse: [
    {
      nome: "https://app.example/app/dashboard",
      start: 10_000,
      requestStart: 10_000,
      responseStart: 10_100,
      responseEnd: 10_100,
      duration: 100,
      middlewareMs: null,
    },
    {
      nome: "https://app.example/app/dashboard",
      start: 40_000,
      requestStart: 40_000,
      responseStart: 40_200,
      responseEnd: 40_200,
      duration: 200,
      middlewareMs: null,
    },
    {
      nome: "https://app.example/app/dashboard",
      start: 60_000,
      requestStart: 60_000,
      responseStart: 60_200,
      responseEnd: 60_200,
      duration: 200,
      middlewareMs: null,
    },
    {
      nome: "https://app.example/app/magazzino?_rsc=1",
      start: 70_000,
      requestStart: 70_000,
      responseStart: 70_300,
      responseEnd: 70_400,
      duration: 400,
      middlewareMs: 50,
    },
  ],
});
assert.equal(gruppi.length, 2);
assert.equal(gruppi[0]?.categoria, "altro");
assert.equal(gruppi[0]?.conteggio, 2);
assert.equal(gruppi[0]?.intervalloMedianoMs, 20_000);
assert.equal(gruppi[1]?.categoria, "navigazione");

const fasi = fasiChiamataClient({
  clic: 0,
  fine: 6_740,
  fetch: [
    { inizio: 100, fine: 400 },
    { inizio: 5_000, fine: 6_700 },
  ],
});
assert.equal(fasi.fetchOsservati, 2);
assert.equal(fasi.primaMs, 5_000);
assert.equal(fasi.reteMs, 1_700);
assert.equal(fasi.dopoMs, 40);
assert.deepEqual(fasiChiamataClient({ clic: 0, fine: 100, fetch: [] }), {
  primaMs: null,
  reteMs: null,
  dopoMs: null,
  fetchOsservati: 0,
});
assert.equal(
  trattoElencoClienti({
    primaDelFetchMs: 20_000,
    queryMs: 80,
    etichetteMs: 40,
    accessoMs: 30,
    filtroMs: 10,
    dopoIlFetchMs: 20,
    renderingMs: 15,
    fetchMs: 200,
    totaleMs: 160,
  }),
  "prima dell'invio"
);
assert.equal(
  trattoElencoClienti({
    primaDelFetchMs: 200,
    queryMs: 18_000,
    etichetteMs: 40,
    accessoMs: 30,
    filtroMs: 10,
    dopoIlFetchMs: 20,
    renderingMs: 15,
    fetchMs: 18_200,
    totaleMs: 18_080,
  }),
  "query clienti"
);
assert.equal(
  trattoElencoClienti({
    primaDelFetchMs: 100,
    queryMs: 80,
    etichetteMs: 40,
    accessoMs: 30,
    filtroMs: 10,
    dopoIlFetchMs: 20,
    renderingMs: null,
    fetchMs: 200,
    totaleMs: 160,
  }),
  "nessun tratto oltre un secondo"
);
console.log("prestazioni: ok");
