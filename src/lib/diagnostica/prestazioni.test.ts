import assert from "node:assert/strict";
import {
  areaMisurabile,
  chiudiNavigazione,
  controlloTrelloConsentito,
  decisioneScansioneFatture,
  decisioneScansionePromozioni,
  interpretaAzione,
  mappaMenuDaCaricare,
  percorsoMisurabile,
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
assert.equal(incompleta.transizioneMs, 20_000);
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
  /avvio a freddo/
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
console.log("prestazioni: ok");
