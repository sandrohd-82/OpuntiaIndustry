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
  improntaMailOrdine,
  mailProntaAllInvio,
  messaggioEliminazioneProva,
  messaggioSalvataggioConfermato,
  pulsanteFinale,
  rifiutaEmailFornitore,
  selezioneEliminazioneProva,
  testoConRiferimento,
  validaDestinatarioSingolo,
  validaOggettoTest,
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

const bozza = bozzaInvioConferma({
  materia: "MpClB/36 Cladodi Biologici da 12 a 36 mesi",
  unita: "Kg",
  inizio: "2027-01-08",
  fine: "2027-03-26",
  consegne: Array.from({ length: 33 }, () => ({ quantita: 10000, tipoQuantita: "stimata" })),
});
assert.equal(bozza.oggetto, "Ordine di approvvigionamento");
assert.equal(bozza.testo.includes("TEST"), false);
assert.equal(bozza.testo.includes("http"), false);
assert.match(bozza.testo, /mesi 01-02-03\/2027/);
assert.match(bozza.testo, /Materia prima: MpClB\/36 Cladodi Biologici da 12 a 36 mesi/);
assert.match(bozza.testo, /Unità: Kg/);
assert.match(bozza.testo, /Periodo: 08\/01\/27 – 26\/03\/27/);
assert.match(bozza.testo, /Consegne: 33/);
assert.match(bozza.testo, /Totale precisa: 0 Kg/);
assert.match(bozza.testo, /Totale stimata: 330000 Kg/);
assert.match(bozza.testo, /Distinti Saluti Opuntia Italia/);
assert.equal(validaOggettoTest("AB").ok, false);
assert.equal(validaOggettoTest(bozza.oggetto).ok, true);
assert.equal(DESTINATARIO_PROVA, "sandrohd@gmail.com");
assert.equal(validaDestinatarioSingolo("sandrohd@gmail.com").ok, true);
assert.equal(validaDestinatarioSingolo("").ok, false);
assert.equal(validaDestinatarioSingolo("a@b.c, c@d.e").ok, false);
assert.equal(
  rifiutaEmailFornitore("reale@fornitore.it", "reale@fornitore.it"),
  "Questa procedura non invia all'indirizzo di un fornitore in anagrafica."
);
assert.equal(rifiutaEmailFornitore(DESTINATARIO_PROVA, "reale@fornitore.it"), null);
assert.match(testoConRiferimento("Testo operatore", "TEST-PP-26-0001"), /TEST-PP-26-0001/);
assert.equal(chiaveInvioConfermato("chiave-salva-1"), "chiave-salva-1:invio");

const consegnaBase = {
  destinatario: DESTINATARIO_PROVA,
  oggetto: bozza.oggetto,
  testo: bozza.testo,
  pdf: true,
  xlsx: false,
  fornitoreId: "fornitore-1",
  materiaId: "materia-1",
  note: "",
  unita: "cladodi",
  consegne: [{ data: "2026-01-10", quantita: 100, unita: "cladodi", tipoQuantita: "precisa" }],
};
const impronta = improntaMailOrdine(consegnaBase);
const approvata = {
  impronta,
  destinatario: DESTINATARIO_PROVA,
  oggetto: bozza.oggetto,
  testo: bozza.testo,
  pdf: true,
  xlsx: false,
};
assert.equal(mailProntaAllInvio(approvata, impronta, true), true);
assert.equal(pulsanteFinale(false, false), "Finalizza e salva ordine");
assert.equal(pulsanteFinale(true, false), "Crea bozza mail");
assert.equal(pulsanteFinale(true, true), "Finalizza e invia mail");
assert.equal(mailProntaAllInvio(approvata, impronta, false), false);
const dopoModifica = improntaMailOrdine({
  ...consegnaBase,
  consegne: [{ data: "2026-01-10", quantita: 90, unita: "cladodi", tipoQuantita: "precisa" }],
});
assert.equal(mailProntaAllInvio(approvata, dopoModifica, true), false);
assert.notEqual(
  impronta,
  improntaMailOrdine({ ...consegnaBase, xlsx: true })
);
assert.notEqual(
  impronta,
  improntaMailOrdine({ ...consegnaBase, oggetto: `${bozza.oggetto} rivisto` })
);

const senzaEmail = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: false,
  confermato: true,
  invio: null,
});
assert.match(senzaEmail.salvataggio, /visibile in elenco/);
assert.equal(senzaEmail.mail, null);
assert.equal(senzaEmail.errore, null);

const accodata = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "non_inviata", richiedeConferma: false, errore: null },
});
assert.match(accodata.salvataggio, /visibile in elenco/);
assert.equal(accodata.mail, "Mail in attesa di invio");
assert.equal(accodata.messaggio.includes("Mail inviata"), false);

const inCorso = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "in_invio", richiedeConferma: false, errore: null },
});
assert.equal(inCorso.mail, "Mail in attesa di invio");

const inviata = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "inviata", richiedeConferma: false, errore: null },
});
assert.equal(inviata.mail, "Mail inviata");
assert.match(inviata.salvataggio, /visibile in elenco/);

const fallita = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "fallita", richiedeConferma: false, errore: "SMTP rifiutato" },
});
assert.match(fallita.salvataggio, /visibile in elenco/);
assert.equal(fallita.errore, "SMTP rifiutato");
assert.equal(fallita.mail, "Invio non riuscito.");

const incerto = messaggioSalvataggioConfermato({
  riusata: false,
  invioRichiesto: true,
  invio: { id: "1", stato: "incerta", richiedeConferma: true, errore: MESSAGGIO_CONFERMA_INCERTA },
});
assert.match(incerto.salvataggio, /visibile in elenco/);
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
assert.equal(esecuzione.includes("testoConRiferimento"), false);

const portale = readFileSync(
  new URL("../../app/actions/approvvigionamento-portale.ts", import.meta.url),
  "utf8"
);
assert.match(portale, /eq\("prova", true\)/);
assert.match(azione, /validaOggettoTest/);
assert.match(azione, /destinatarioConfermato/);
assert.equal(azione.includes("if (parsed.data.prova) {\n      const { data: anagrafiche }"), false);

const sqlTest = readFileSync(
  new URL("../../../supabase/migrations/20261118160000_approvvigionamenti_invio_senza_prefisso_test.sql", import.meta.url),
  "utf8"
);
assert.match(sqlTest, /approvvigionamento_invio_solo_test/);
assert.equal(sqlTest.includes("deve iniziare con TEST"), false);
assert.match(sqlTest, /fornitori/);
assert.equal(/insert into public\.approvvigionamenti_notifiche/.test(sqlTest), false);

const modale = readFileSync(
  new URL("../../components/produzione/CreaOrdineMateriaPrimaModal.tsx", import.meta.url),
  "utf8"
);
assert.match(modale, /pulsanteFinale/);
assert.match(modale, /Crea bozza mail/);
assert.match(modale, /Approva mail/);
assert.match(modale, /Mail pronta all/);
assert.match(modale, /Modifica bozza mail/);
assert.match(modale, /readOnly/);
assert.match(modale, /pdfPianificazione/);
assert.match(modale, /xlsxPianificazione/);
assert.equal(modale.includes("emailFornitoreApprovvigionamentoAction"), false);

const calendario = readFileSync(
  new URL("../../components/produzione/CalendarioApprovvigionamento.tsx", import.meta.url),
  "utf8"
);
assert.match(calendario, /Email destinatario TEST/);
assert.match(calendario, /emailTest=\{emailProva\}/);

console.log("invio conferma: ok");
}

verificaInvio().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
