import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { aspettoGiorno, classeCellaCalendario } from "./aspetto-calendario";
import {
  consegnaSelezionataValida,
  meseDaData,
  versioneAccettabile,
} from "./approvvigionamento";
import { pdfPianificazione, totaliDocumento, xlsxPianificazione } from "./documento-pianificazione";
import {
  aggiungiConsegnaInProva,
  annullaConsegnaInProva,
  modificaConsegnaInProva,
  ordineSingoloInProva,
  pianificaInProva,
  pubblicaInProva,
  sessioneTestVuota,
} from "./sessione-test-approvvigionamento";

const MP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ALTRO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FORNITORE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const materia = {
  materiaPrimaId: MP,
  codice: "MP1",
  nome: "Farina",
  quantita: 3,
  unitaMisura: "kg",
  unitaCatalogo: "kg",
  tipoQuantita: "precisa" as const,
};

assert.equal(meseDaData("2026-01-10"), "2026-01-01");
assert.equal(
  versioneAccettabile({ ruolo: "storica", annullata: false, giaRisposta: false }).ok,
  false
);
assert.equal(
  versioneAccettabile({ ruolo: "corrente", annullata: true, giaRisposta: false }).ok,
  false
);
assert.equal(consegnaSelezionataValida({
  materiaPrimaId: "",
  quantita: 2,
  unitaCatalogo: "kg",
  unitaRichiesta: "kg",
  tipoQuantita: "precisa",
  data: "2026-01-10",
}).ok, false);

const aspetto = aspettoGiorno({
  nelPeriodo: true,
  consegnaPrevista: true,
  selezionato: false,
  stati: ["annullato"],
  confermati: [false],
});
assert.equal(classeCellaCalendario(aspetto).includes("slate"), true);
assert.equal(
  classeCellaCalendario(
    aspettoGiorno({
      nelPeriodo: true,
      consegnaPrevista: false,
      selezionato: false,
      stati: [],
      confermati: [],
    })
  ).includes("indigo"),
  true
);

const documento = {
  codice: "PP-TEST",
  fornitore: "Mulino",
  materia: "MP1 Farina",
  unita: "kg",
  periodoInizio: "2026-01-01",
  periodoFine: "2026-03-31",
  note: "Nota di prova",
  consegne: [
    { data: "2026-01-10", quantita: 4, tipoQuantita: "precisa" as const, stato: "bozza" },
    { data: "2026-02-10", quantita: 2, tipoQuantita: "stimata" as const, stato: "bozza" },
  ],
};
const totali = totaliDocumento(documento);
assert.equal(totali.consegne, 2);
assert.equal(totali.precisa, 4);
assert.equal(totali.stimata, 2);
void (async () => {
const pdf = await pdfPianificazione(documento);
const pdfTesto = Buffer.from(pdf).toString("latin1");
assert.equal(pdf.byteLength > 500, true);
assert.equal(pdfTesto.includes("PP-TEST"), true);
assert.equal(pdfTesto.includes("10/01/2026"), true);
assert.equal(pdfTesto.includes("01/01/2026"), true);
assert.equal(pdfTesto.includes("2026-01-10"), false);
assert.equal(pdfTesto.includes("Gennaio 2026"), true);
assert.equal(pdfTesto.includes("Febbraio 2026"), true);
assert.equal(pdfTesto.includes("Marzo 2026"), true);
assert.equal(pdfTesto.includes("Elenco consegne"), true);
assert.equal(pdfTesto.indexOf("Gennaio 2026") < pdfTesto.indexOf("Elenco consegne"), true);
assert.equal(pdfTesto.includes("Consegne: 2"), true);
assert.equal(pdfTesto.includes("Totale precisa: 4 kg"), true);
assert.equal(pdfTesto.includes("Totale stimata: 2 kg"), true);
assert.equal(pdfTesto.split("Totale precisa").length, 2);
assert.equal(
  pdfTesto.indexOf("Gennaio 2026") < pdfTesto.indexOf("Totale precisa") &&
    pdfTesto.indexOf("Totale precisa") < pdfTesto.indexOf("Elenco consegne"),
  true
);
assert.equal((pdfTesto.match(/\/Type\s*\/Page(?!s)/g) ?? []).length >= 4, true);
const nomeLungo =
  "Opuntia Industry Societa Agricola Cooperativa dei Produttori del Ficodindia della Valle del Belice e delle Colline Siciliane a Responsabilita Limitata con stabilimento";
const stampa = await pdfPianificazione({
  ...documento,
  codice: "Anteprima di prova",
  fornitore: nomeLungo,
  note: "Anteprima non salvata.",
});
const stampaTesto = Buffer.from(stampa).toString("latin1");
assert.equal(stampaTesto.includes("Anteprima di prova"), false);
assert.equal(stampaTesto.includes("Anteprima non salvata"), false);
assert.equal(stampaTesto.includes(`(${nomeLungo})`), false);
assert.equal(stampaTesto.includes("Opuntia Industry"), true);
assert.equal(stampaTesto.includes("stabilimento"), true);
const xlsx = await xlsxPianificazione(documento);
{
  assert.equal(xlsx.byteLength > 500, true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(xlsx) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  const foglio = wb.worksheets[0];
  if (!foglio) throw new Error("manca il foglio");
  const testi: string[] = [];
  foglio.eachRow((riga) => {
    riga.eachCell((cella) => testi.push(String(cella.value ?? "")));
  });
  const gennaio = testi.indexOf("Gennaio 2026");
  const febbraio = testi.indexOf("Febbraio 2026");
  const marzo = testi.indexOf("Marzo 2026");
  const elenco = testi.indexOf("Data");
  const totale = testi.indexOf("Totale precisa");
  assert.equal(gennaio >= 0 && febbraio > gennaio && marzo > febbraio && elenco > marzo, true);
  assert.equal(gennaio < totale && totale < febbraio && totale < elenco, true);
  assert.equal(testi.filter((voce) => voce === "Totale precisa").length, 1);
  assert.equal(testi.filter((voce) => voce === "Consegne").length, 1);
  assert.equal(testi.includes("4 kg"), true);
  assert.equal(testi.includes("2 kg"), true);
  assert.equal(testi.includes("10\n4"), true);
  assert.equal(testi.includes("10\n2"), true);
  assert.equal(testi.includes("10/01/2026"), true);
  assert.equal(testi.includes("01/01/2026 – 31/03/2026"), true);
  assert.equal(testi.includes("2026-01-10"), false);
  console.log("calendario esteso: ok");
}
})().catch((errore: unknown) => {
  console.error(errore);
  process.exit(1);
});

let sessione = sessioneTestVuota();
const piano = pianificaInProva(sessione, {
  fornitoreId: FORNITORE,
  fornitore: "Mulino",
  note: "",
  inizio: "2026-01-01",
  fine: "2026-01-05",
  cadenza: "regolare",
  ogniGiorni: 2,
  dateScelte: [],
  quantita: 3,
  copiaQuantita: true,
  quantitaPerData: {},
  tipoQuantita: "precisa",
  materia,
});
assert.equal(piano.ok, true);
if (!piano.ok) throw new Error("piano");
assert.equal(piano.sessione.piani.length, 1);
assert.equal(piano.sessione.ordini.length, 3);
assert.equal(piano.sessione.ordini.every((ordine) => ordine.pianoId === piano.sessione.piani[0]?.id), true);
sessione = piano.sessione;

const singolo = ordineSingoloInProva(sessione, {
  fornitoreId: FORNITORE,
  fornitore: "Mulino",
  note: "",
  data: "2026-01-12",
  quantita: 1,
  tipoQuantita: "stimata",
  materia: { ...materia, tipoQuantita: "stimata" },
});
assert.equal(singolo.ok, true);
if (!singolo.ok) throw new Error("singolo");
assert.equal(singolo.sessione.piani.length, 1);
assert.equal(singolo.sessione.ordini.at(-1)?.pianoId, null);
sessione = singolo.sessione;

const rifiutata = aggiungiConsegnaInProva(sessione, {
  pianoId: sessione.piani[0]!.id,
  data: "2026-01-20",
  quantita: 5,
  materia: { ...materia, materiaPrimaId: "" },
});
assert.equal(rifiutata.ok, false);
assert.equal(rifiutata.sessione.ordini.length, sessione.ordini.length);

const aggiunta = aggiungiConsegnaInProva(sessione, {
  pianoId: sessione.piani[0]!.id,
  data: "2026-02-02",
  quantita: 5,
  materia: { ...materia, materiaPrimaId: ALTRO, codice: "MP2", nome: "Olio" },
});
assert.equal(aggiunta.ok, true);
if (!aggiunta.ok) throw new Error("aggiunta");
const nuova = aggiunta.sessione.ordini.at(-1);
assert.equal(nuova?.righe[0]?.materiaPrimaId, ALTRO);
assert.equal(nuova?.pianoId, sessione.piani[0]?.id);
assert.equal(aggiunta.sessione.piani[0]?.periodoFine, "2026-02-02");
sessione = aggiunta.sessione;

const pubblicata = pubblicaInProva(sessione, { ambito: "piano", id: sessione.piani[0]!.id });
assert.equal(pubblicata.ok, true);
if (!pubblicata.ok) throw new Error("pubblica");
const primaVersione = pubblicata.sessione.versioni.length;
sessione = pubblicata.sessione;
const daModificare = sessione.ordini.find((ordine) => ordine.pianoId);
if (!daModificare) throw new Error("manca ordine");
const modificata = modificaConsegnaInProva(sessione, {
  ordineId: daModificare.id,
  data: daModificare.dataConsegna,
  note: "rivista",
  quantita: 9,
  tipoQuantita: "precisa",
});
assert.equal(modificata.ok, true);
if (!modificata.ok) throw new Error("modifica");
assert.equal(modificata.sessione.versioni.length, primaVersione);
assert.equal(
  modificata.sessione.ordini.find((ordine) => ordine.id === daModificare.id)?.stato,
  "da_ripubblicare"
);
sessione = modificata.sessione;
const ripubblicata = pubblicaInProva(sessione, { ambito: "ordine", id: daModificare.id });
assert.equal(ripubblicata.ok, true);
if (!ripubblicata.ok) throw new Error("ripubblica");
const numeri = ripubblicata.sessione.versioni
  .filter((versione) => versione.ordineId === daModificare.id)
  .map((versione) => versione.numero);
assert.deepEqual(numeri, [1, 2]);
sessione = ripubblicata.sessione;
const annullata = annullaConsegnaInProva(sessione, daModificare.id);
assert.equal(annullata.ok, true);
if (!annullata.ok) throw new Error("annulla");
assert.equal(annullata.sessione.ordini.find((ordine) => ordine.id === daModificare.id)?.stato, "annullato");
assert.equal(
  annullata.sessione.versioni.filter((versione) => versione.ordineId === daModificare.id).length,
  2
);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261117140000_approvvigionamenti_aggiunta_atomica.sql", import.meta.url),
  "utf8"
);
assert.match(sql, /approvvigionamento_aggiungi_consegna_piano/);
assert.match(sql, /annullata boolean/);
assert.equal(sql.includes("delete from public.approvvigionamenti_versioni"), false);
