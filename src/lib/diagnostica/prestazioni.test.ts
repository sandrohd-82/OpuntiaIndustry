import assert from "node:assert/strict";
import {
  areaMisurabile,
  controlloTrelloConsentito,
  decisioneScansioneFatture,
  decisioneScansionePromozioni,
  mappaMenuDaCaricare,
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
console.log("prestazioni: ok");
