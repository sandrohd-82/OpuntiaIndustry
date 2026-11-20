import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applicaCaricamentoCompleto,
  applicaUtilizzabile,
  apriMisuraScheda,
  avviaAzione,
  chiudiMisuraScheda,
  concludiAzione,
  coppieParallele,
  criterioCaricamentoCompleto,
  criterioUtilizzabile,
  CRITERIO_SCHEDA_UTILIZZABILE,
  montaggioAdAvvioMs,
  normalizzaMisureScheda,
  prevediAzione,
  relazioneOndate,
  ripetizioneApertura,
  rispostaAncoraValida,
  sezioneDisponibileMs,
  segnaDatiBase,
  segnaDatiVisibili,
  statoSezione,
  segnaMontaggioScheda,
} from "./scheda-completa";

assert.equal(ripetizioneApertura(1), "prima");
assert.equal(ripetizioneApertura(2), "seconda");
assert.equal(ripetizioneApertura(3), "successiva");
assert.match(CRITERIO_SCHEDA_UTILIZZABILE, /montaggio del riquadro non basta/);
assert.equal(
  rispostaAncoraValida({ attiva: true, idRichiesta: "a", idCorrente: "a" }),
  true
);
assert.equal(
  rispostaAncoraValida({ attiva: false, idRichiesta: "a", idCorrente: "a" }),
  false
);
assert.equal(
  rispostaAncoraValida({ attiva: true, idRichiesta: "a", idCorrente: "b" }),
  false
);
assert.equal(statoSezione({ esito: "attesa", vuota: true }), "attesa");
assert.equal(statoSezione({ esito: "errore", vuota: true }), "errore");
assert.equal(statoSezione({ esito: "pronto", vuota: true }), "vuota");
assert.equal(statoSezione({ esito: "pronto", vuota: false }), "dati");

let prima = apriMisuraScheda(1, 1);
prima = segnaMontaggioScheda(prima, 12);
prima = segnaDatiBase(prima, 13);
assert.equal(prima.datiBaseVisibiliMs, 13);
prima = segnaDatiBase(prima, 99);
assert.equal(prima.datiBaseVisibiliMs, 13);
prima = avviaAzione(prima, "scheda", 14);
prima = concludiAzione(prima, "scheda", 400, "ok");
prima = segnaDatiVisibili(prima, 420);
prima = prevediAzione(prima, "extra");
prima = prevediAzione(prima, "schede");
assert.equal(criterioCaricamentoCompleto(prima), false);
assert.equal(criterioUtilizzabile(prima), false);
prima = avviaAzione(prima, "extra", 430);
prima = avviaAzione(prima, "schede", 435);
prima = concludiAzione(prima, "extra", 80, "ok");
prima = concludiAzione(prima, "schede", 900, "errore");
assert.equal(sezioneDisponibileMs(prima.azioni.extra), 510);
assert.equal(sezioneDisponibileMs(prima.azioni.schede), 1335);
prima = applicaCaricamentoCompleto(prima, 1400);
assert.equal(prima.caricamentoCompletoMs, 1400);
assert.equal(prima.utilizzabileMs, 1400);
assert.equal(prima.ripetizione, "prima");
assert.equal(montaggioAdAvvioMs(prima), 2);
assert.equal(relazioneOndate(prima), "sequenziale");
assert.deepEqual(coppieParallele(prima), [["extra", "schede"]]);
assert.equal(JSON.stringify(prima).includes("cliente"), false);

let errore = apriMisuraScheda(2, 2);
errore = avviaAzione(errore, "scheda", 5);
errore = concludiAzione(errore, "scheda", 30, "errore");
errore = prevediAzione(errore, "extra");
assert.equal(criterioCaricamentoCompleto(errore), false);
errore = avviaAzione(errore, "extra", 6);
errore = concludiAzione(errore, "extra", 10, "ok");
errore = applicaUtilizzabile(errore, 40);
assert.equal(errore.caricamentoCompletoMs, 40);
assert.equal(errore.utilizzabileMs, 40);
assert.equal(errore.ripetizione, "seconda");
assert.equal(errore.azioni.scheda?.esito, "errore");

let chiusa = apriMisuraScheda(3, 1);
chiusa = avviaAzione(chiusa, "scheda", 1);
chiusa = chiudiMisuraScheda(chiusa);
chiusa = concludiAzione(chiusa, "scheda", 10, "ok");
chiusa = segnaDatiVisibili(chiusa, 12);
chiusa = applicaUtilizzabile(chiusa, 12);
assert.equal(chiusa.chiusaPrima, true);
assert.equal(chiusa.utilizzabileMs, null);
assert.equal(chiusa.caricamentoCompletoMs, null);

const seconda = apriMisuraScheda(4, 2);
assert.notEqual(seconda.generazione, prima.generazione);
assert.equal(prima.azioni.scheda?.durataMs, 400);

const sporca = normalizzaMisureScheda([
  {
    generazione: 9,
    ripetizione: "prima",
    moduloAtteso: false,
    clienteId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    email: "ada@example.com",
    azioni: {
      scheda: { avvioDalClicMs: 3, durataMs: 8, esito: "ok", dettaglio: "token" },
    },
    previste: ["extra", "documento"],
  },
  { generazione: 1, ripetizione: "sconosciuta", clienteId: "no" },
]);
assert.equal(sporca.length, 1);
assert.equal(JSON.stringify(sporca).includes("ada@"), false);
assert.equal(JSON.stringify(sporca).includes("aaaaaaaa"), false);
assert.equal(JSON.stringify(sporca).includes("token"), false);
assert.deepEqual(sporca[0]?.previste, ["extra"]);

let parallela = apriMisuraScheda(5, 1);
parallela = avviaAzione(parallela, "scheda", 0);
parallela = avviaAzione(parallela, "extra", 10);
parallela = concludiAzione(parallela, "scheda", 100, "ok");
parallela = concludiAzione(parallela, "extra", 20, "ok");
assert.equal(relazioneOndate(parallela), "parallela");

const modal = readFileSync(
  "src/components/amministrazione/ClienteSchedaCompletaModal.tsx",
  "utf8"
);
const dettaglio = readFileSync(
  "src/components/amministrazione/AnagraficaSchedaDetail.tsx",
  "utf8"
);
assert.equal(modal.includes("listAnagraficaDocumentiAction"), false);
assert.match(modal, /documenti !== null \?/);
assert.match(modal, /attesaSezioni/);
assert.match(modal, /canEdit && verificaOk/);
assert.match(dettaglio, /attesaSezioni = false/);
assert.match(dettaglio, /Nessuna scheda/);
assert.match(dettaglio, /Nessun brand/);

console.log("scheda-completa: ok");
