import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGGIO_CONFERMA_INCERTA } from "./notifica-distribuzione";
import { applicaAcquisizione, classificaErroreInvio, puoAcquisireInvio } from "./richiesta-ingresso";
import {
  DESTINATARIO_PROVA,
  allegatiConfermati,
  bozzaInvioConferma,
  chiaveInvioConfermato,
  concludiTentativoInvio,
  documentoDalleRigheSalvate,
  messaggioEliminazioneProva,
  messaggioSalvataggioConfermato,
  rifiutaEmailFornitore,
  selezioneEliminazioneProva,
  testoConRiferimento,
  validaDestinatarioSingolo,
} from "./invio-conferma";

const salvato = documentoDalleRigheSalvate({
  codice: "TEST-PP-26-0001",
  fornitore: "Mulino di prova",
  note: "Nota confermata",
  periodoInizio: "2026-01-01",
  periodoFine: "2026-01-31",
  consegne: [
    {
      data: "2026-01-10",
      materia: "Cladodi",
      unita: "cladodi",
      quantita: 100,
      tipoQuantita: "precisa",
      stato: "bozza",
    },
  ],
});
assert.equal(salvato.codice, "TEST-PP-26-0001");
assert.equal(salvato.consegne[0]?.quantita, 100);
assert.equal(salvato.consegne[0]?.unita, "cladodi");
assert.equal(salvato.consegne[0]?.data, "2026-01-10");
assert.equal("allegato" in salvato, false);

const bozza = bozzaInvioConferma(true);
assert.equal(bozza.oggetto.startsWith("TEST"), true);
assert.equal(bozza.testo.includes("http"), false);
assert.equal(bozzaInvioConferma(false).oggetto.startsWith("TEST"), false);
assert.equal(DESTINATARIO_PROVA, "sandrohd@gmail.com");
assert.equal(validaDestinatarioSingolo("sandrohd@gmail.com").ok, true);
assert.equal(validaDestinatarioSingolo("a@b.c, c@d.e").ok, false);
assert.equal(
  rifiutaEmailFornitore("reale@fornitore.it", "reale@fornitore.it"),
  "In prova non si usa l'indirizzo del fornitore in anagrafica."
);
assert.equal(rifiutaEmailFornitore(DESTINATARIO_PROVA, "reale@fornitore.it"), null);
assert.match(testoConRiferimento("Testo operatore", "TEST-PP-26-0001"), /TEST-PP-26-0001/);
assert.equal(chiaveInvioConfermato("chiave-salva-1"), "chiave-salva-1:invio");

const senzaEmail = messaggioSalvataggioConfermato({ riusata: false, invioRichiesto: false, invio: null });
assert.match(senzaEmail.messaggio, /Bozza salvata/);
assert.equal(senzaEmail.errore, null);

const incerto = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "incerta", richiedeConferma: true, errore: MESSAGGIO_CONFERMA_INCERTA },
});
assert.match(incerto.messaggio, /visibile in elenco/);
assert.equal(incerto.errore, MESSAGGIO_CONFERMA_INCERTA);

async function verificaInvio() {
let chiamatePdf = 0;
let chiamateXlsx = 0;
const entrambi = await allegatiConfermati({
  documento: salvato,
  pdf: true,
  xlsx: true,
  pdfBytes: (documento) => {
    chiamatePdf += 1;
    assert.equal(documento, salvato);
    return Uint8Array.from([1, 2]);
  },
  xlsxBytes: async (documento) => {
    chiamateXlsx += 1;
    assert.equal(documento.consegne[0]?.quantita, 100);
    return Uint8Array.from([3]);
  },
});
assert.equal(entrambi.length, 2);
assert.equal(entrambi[0]?.filename, "TEST-PP-26-0001.pdf");
assert.equal(entrambi[1]?.filename, "TEST-PP-26-0001.xlsx");
assert.equal(chiamatePdf, 1);
assert.equal(chiamateXlsx, 1);
const soloPdf = await allegatiConfermati({
  documento: salvato,
  pdf: true,
  xlsx: false,
  pdfBytes: () => Uint8Array.from([1]),
  xlsxBytes: async () => {
    throw new Error("Excel non richiesto");
  },
});
assert.equal(soloPdf.length, 1);
const nessuno = await allegatiConfermati({
  documento: salvato,
  pdf: false,
  xlsx: false,
  pdfBytes: () => {
    throw new Error("PDF non richiesto");
  },
  xlsxBytes: async () => {
    throw new Error("Excel non richiesto");
  },
});
assert.equal(nessuno.length, 0);

const primo = applicaAcquisizione(
  { stato: "non_inviata", lock: null, lockAtMs: null, tentativi: 0 },
  { oraMs: 1_000, confermaIncerta: false, nuovoLock: "lock-1" }
);
assert.equal(primo.acquisita, true);
const secondo = applicaAcquisizione(primo, {
  oraMs: 1_100,
  confermaIncerta: false,
  nuovoLock: "lock-2",
});
assert.equal(secondo.acquisita, false);
assert.equal(secondo.stato, "in_invio");

let invii = 0;
const certo = await concludiTentativoInvio({
  acquisita: true,
  statoAttuale: "in_invio",
  invia: async () => {
    invii += 1;
    throw new Error("ECONNREFUSED");
  },
  concludi: async (esito) => {
    assert.equal(esito.esito, "fallita");
    return true;
  },
});
assert.equal(classificaErroreInvio("ECONNREFUSED"), "certo");
assert.equal(certo.stato, "fallita");
assert.equal(certo.richiedeConferma, false);
assert.equal(invii, 1);

let dopoIncerto = 0;
const dubbio = await concludiTentativoInvio({
  acquisita: true,
  statoAttuale: "in_invio",
  invia: async () => {
    throw new Error("450 timeout after data");
  },
  concludi: async (esito) => {
    assert.equal(esito.esito, "incerta");
    return true;
  },
});
assert.equal(dubbio.stato, "incerta");
assert.equal(dubbio.errore, MESSAGGIO_CONFERMA_INCERTA);
const bloccato = await concludiTentativoInvio({
  acquisita: false,
  statoAttuale: "incerta",
  invia: async () => {
    dopoIncerto += 1;
    return { messageId: "non-deve-partire" };
  },
  concludi: async () => true,
});
assert.equal(dopoIncerto, 0);
assert.equal(bloccato.richiedeConferma, true);
assert.equal(
  puoAcquisireInvio({ stato: "incerta", lockAtMs: null, oraMs: 2_000, confermaIncerta: false }),
  false
);
assert.equal(
  puoAcquisireInvio({ stato: "incerta", lockAtMs: null, oraMs: 2_000, confermaIncerta: true }),
  true
);

const ordineReale = "11111111-1111-4111-8111-111111111111";
const ordineProva = "22222222-2222-4222-8222-222222222222";
const ordineProtetto = "33333333-3333-4333-8333-333333333333";
const pianoProva = "44444444-4444-4444-8444-444444444444";
const selezione = selezioneEliminazioneProva({
  invii: [
    { id: "attesa", prova: true, stato: "non_inviata", ordineId: ordineProva, pianoId: null },
    { id: "corso", prova: true, stato: "in_invio", ordineId: ordineProtetto, pianoId: pianoProva },
    { id: "reale", prova: false, stato: "non_inviata", ordineId: ordineReale, pianoId: null },
  ],
  ordini: [
    { id: ordineReale, prova: false, pianoId: null },
    { id: ordineProva, prova: true, pianoId: null },
    { id: ordineProtetto, prova: true, pianoId: pianoProva },
  ],
  piani: [
    { id: pianoProva, prova: true },
    { id: "55555555-5555-4555-8555-555555555555", prova: false },
  ],
});
assert.equal(selezione.eliminaOrdini.includes(ordineReale), false);
assert.equal(selezione.eliminaOrdini.includes(ordineProtetto), false);
assert.deepEqual(selezione.eliminaOrdini, [ordineProva]);
assert.equal(selezione.eliminaPiani.includes(pianoProva), false);
assert.equal(selezione.eliminaPiani.includes("55555555-5555-4555-8555-555555555555"), false);
assert.deepEqual(selezione.annullaInvii, ["attesa"]);
assert.equal(selezione.eliminaInvii.includes("corso"), false);
assert.equal(selezione.eliminaInvii.includes("reale"), false);
assert.deepEqual(selezione.protetti, ["corso"]);
assert.match(messaggioEliminazioneProva(1), /esito incerto/);
assert.match(messaggioEliminazioneProva(0), /aziendali/);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261118140000_approvvigionamenti_invio_e_prova.sql", import.meta.url),
  "utf8"
);
assert.match(sql, /create table if not exists public\.approvvigionamenti_invii/);
assert.match(sql, /TEST-AP-/);
assert.match(sql, /TEST-PP-/);
assert.match(sql, /approvvigionamenti_prova_ordine_seq/);
assert.match(sql, /approvvigionamenti_prova_piano_seq/);
assert.match(sql, /p_prova boolean default false/);
assert.match(sql, /elimina_dati_prova_approvvigionamento\(\)/);
assert.equal(/elimina_dati_prova_approvvigionamento\(\s*p_/.test(sql), false);
assert.match(sql, /Rifiutata la cancellazione di dati non di prova/);
assert.match(sql, /approvvigionamenti_versioni/);
assert.match(sql, /approvvigionamenti_carichi/);
assert.match(sql, /Gli allegati non coincidono con le righe salvate/);
assert.equal(/insert into public\.approvvigionamenti_notifiche/.test(sql), false);

const azione = readFileSync(new URL("../../app/actions/approvvigionamento.ts", import.meta.url), "utf8");
assert.match(azione, /p_prova: parsed\.data\.prova/);
assert.match(azione, /\.eq\("prova", prova\)/);
const esecuzione = readFileSync(
  new URL("./invio-conferma-server.ts", import.meta.url),
  "utf8"
);
assert.match(esecuzione, /soloSmtp: true/);
assert.match(esecuzione, /pdfPianificazione\(documento\)/);
assert.match(esecuzione, /xlsxPianificazione\(documento\)/);
assert.equal(esecuzione.includes("pubblica_approvvigionamento"), false);
assert.equal(esecuzione.includes("cc:"), false);
assert.equal(esecuzione.includes("bcc:"), false);
assert.equal(esecuzione.includes("inviaDaCasellaAnagrafica"), true);

const portale = readFileSync(
  new URL("../../app/actions/approvvigionamento-portale.ts", import.meta.url),
  "utf8"
);
assert.match(portale, /eq\("prova", true\)/);

console.log("invio conferma: ok");
}

verificaInvio().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
