import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  annullaMemoriaTest,
  leggiMemoriaTest,
  serializzaMemoriaTest,
} from "./memoria-test-approvvigionamento";
import {
  costruisciRevisionePiano,
  decidiVoceRevisione,
  destinatariInvii,
  preparaEmailProva,
  scritturaAziendaleConsentita,
  type ConsegnaUfficiale,
  type PropostaRevisione,
} from "./revisione-piano";
import { pianificaInProva, pubblicaInProva, sessioneTestVuota } from "./sessione-test-approvvigionamento";

const MP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

const creata = pianificaInProva(sessioneTestVuota(), {
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
assert.equal(creata.ok, true);
if (!creata.ok) throw new Error("piano");
const pubblicata = pubblicaInProva(creata.sessione, { ambito: "piano", id: creata.sessione.piani[0]!.id });
assert.equal(pubblicata.ok, true);
if (!pubblicata.ok) throw new Error("pubblica");
const ordini = pubblicata.sessione.ordini;
const ufficiali: ConsegnaUfficiale[] = ordini.map((ordine) => ({
  id: ordine.id,
  codice: ordine.codice,
  materiaId: MP,
  materia: "MP1 Farina",
  unita: "kg",
  unitaCatalogo: "kg",
  tipoQuantita: "precisa",
  data: ordine.dataConsegna,
  quantita: ordine.righe[0]!.quantita,
}));
const prima = ufficiali[0]!;
const seconda = ufficiali[1]!;
const terza = ufficiali[2]!;
const revisione = costruisciRevisionePiano({
  ufficiali,
  motivazione: "Il raccolto slitta di un giorno.",
  bozza: [
    {
      consegnaId: prima.id,
      materiaId: MP,
      materia: "MP1 Farina",
      codice: prima.codice,
      unita: "kg",
      unitaCatalogo: "kg",
      tipoQuantita: "precisa",
      data: "2026-01-02",
      quantita: prima.quantita,
      elimina: false,
    },
    {
      consegnaId: seconda.id,
      materiaId: MP,
      materia: "MP1 Farina",
      codice: seconda.codice,
      unita: "kg",
      unitaCatalogo: "kg",
      tipoQuantita: "precisa",
      data: seconda.data,
      quantita: 8,
      elimina: false,
    },
    {
      consegnaId: terza.id,
      materiaId: MP,
      materia: "MP1 Farina",
      codice: terza.codice,
      unita: "kg",
      unitaCatalogo: "kg",
      tipoQuantita: "precisa",
      data: terza.data,
      quantita: terza.quantita,
      elimina: true,
    },
    {
      consegnaId: null,
      materiaId: MP,
      materia: "MP1 Farina",
      codice: "Nuova",
      unita: "kg",
      unitaCatalogo: "kg",
      tipoQuantita: "stimata",
      data: "2026-01-08",
      quantita: 2,
      elimina: false,
    },
  ],
});
if (!revisione.ok) throw new Error(revisione.motivo);
assert.deepEqual(
  revisione.voci.map((voce) => voce.operazione).sort(),
  ["aggiunta", "data", "eliminazione", "quantita"]
);
const proposta: PropostaRevisione = {
  id: "11111111-1111-4111-8111-111111111111",
  pianoId: creata.sessione.piani[0]!.id,
  codice: "TEST-PP-0001",
  motivazione: revisione.motivazione,
  voci: revisione.voci,
};
const accettata = decidiVoceRevisione(proposta, revisione.voci[0]!.id, "accettata", "Data concordata.");
if (!accettata.ok) throw new Error("accetta");
const respinta = decidiVoceRevisione(
  accettata.proposta,
  revisione.voci[1]!.id,
  "respinta",
  "Quantità non accettata."
);
assert.equal(respinta.ok, true);
assert.deepEqual(
  pubblicata.sessione.ordini.map((ordine) => [ordine.dataConsegna, ordine.righe[0]?.quantita]),
  ordini.map((ordine) => [ordine.dataConsegna, ordine.righe[0]?.quantita])
);

const senzaMotivo = costruisciRevisionePiano({
  ufficiali,
  motivazione: "no",
  bozza: [
    {
      consegnaId: prima.id,
      materiaId: MP,
      materia: "MP1 Farina",
      codice: prima.codice,
      unita: "kg",
      unitaCatalogo: "kg",
      tipoQuantita: "precisa",
      data: "2026-01-04",
      quantita: prima.quantita,
      elimina: false,
    },
  ],
});
assert.equal(senzaMotivo.ok, false);

const anteprima = preparaEmailProva({
  destinatario: "prova@example.com",
  emailFornitore: "reale@fornitore.it",
  codice: "TEST-PP-0001",
  conferma: false,
});
if (!anteprima.ok) throw new Error("anteprima");
assert.equal(anteprima.busta.invio, false);
assert.equal(anteprima.busta.subject.startsWith("TEST"), true);
assert.equal(anteprima.busta.subject.includes("Ordine di approvvigionamento disponibile"), true);
assert.equal(anteprima.busta.text.startsWith("TEST"), true);
assert.equal(anteprima.busta.text.includes("Agrinsicilia ha pubblicato"), true);
assert.equal(anteprima.busta.text.includes("PDF allegato"), true);
assert.equal(anteprima.busta.text.includes("http"), false);
assert.equal(anteprima.busta.allegato, "TEST-PP-0001.pdf");
assert.equal(anteprima.busta.cc, null);
assert.equal(anteprima.busta.bcc, null);
const primaBusta = preparaEmailProva({
  destinatario: "prova@example.com",
  emailFornitore: "reale@fornitore.it",
  codice: "TEST-PP-0001",
  conferma: true,
});
const secondaBusta = preparaEmailProva({
  destinatario: "prova@example.com",
  emailFornitore: "reale@fornitore.it",
  codice: "TEST-PP-0001",
  conferma: true,
});
if (!primaBusta.ok || !secondaBusta.ok) throw new Error("buste");
assert.equal(primaBusta.busta.cc, null);
assert.equal(primaBusta.busta.bcc, null);
assert.deepEqual(destinatariInvii([primaBusta.busta, secondaBusta.busta]), ["prova@example.com"]);
assert.equal(
  preparaEmailProva({
    destinatario: "reale@fornitore.it",
    emailFornitore: "reale@fornitore.it",
    codice: "TEST-PP-0001",
    conferma: true,
  }).ok,
  false
);
assert.equal(scritturaAziendaleConsentita("test"), false);
assert.equal(scritturaAziendaleConsentita("reale"), true);

const memoria = {
  attiva: true,
  email: "prova@example.com",
  sessione: pubblicata.sessione,
  proposte: [proposta],
};
const riletta = leggiMemoriaTest(serializzaMemoriaTest(memoria));
assert.equal(riletta?.proposte.length, 1);
assert.equal(annullaMemoriaTest(), null);
assert.equal(leggiMemoriaTest(null), null);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261117150000_approvvigionamenti_revisione_piano.sql", import.meta.url),
  "utf8"
);
assert.match(sql, /registra_proposta_piano/);
assert.equal(sql.includes("update public.approvvigionamenti_ordini"), false);
assert.equal(sql.includes("approvvigionamenti_codice_seq"), false);
assert.equal(sql.includes("nextval"), false);

const azione = readFileSync(
  new URL("../../app/actions/approvvigionamento.ts", import.meta.url),
  "utf8"
);
const invio = azione.slice(azione.indexOf("export async function inviaEmailProvaApprovvigionamentoAction"));
assert.match(invio, /soloSmtp: true/);
assert.match(invio, /pdfPianificazione/);
assert.match(invio, /attachments/);
assert.equal(invio.includes("writeAuditLog"), false);
assert.equal(invio.includes("pubblica_approvvigionamento"), false);
assert.equal(invio.includes("cc:"), false);
assert.equal(invio.includes("bcc:"), false);

const calendario = readFileSync(
  new URL("../../components/produzione/CalendarioApprovvigionamento.tsx", import.meta.url),
  "utf8"
);
const pulsantiTest = readFileSync(
  new URL("../../components/produzione/calendario-test-contesto.tsx", import.meta.url),
  "utf8"
);
assert.equal(calendario.includes("registraPropostaPianoAction"), false);
assert.equal(calendario.includes("documentoEmailProva"), false);
assert.equal(calendario.includes("Anteprima email"), false);
assert.equal(calendario.includes("Invia solo all"), false);
assert.match(calendario, /Email destinatario TEST/);
assert.match(pulsantiTest, /Annulla test/);
const recupera = calendario.slice(
  calendario.indexOf("function recupera"),
  calendario.indexOf("function salvaComposizione")
);
assert.match(recupera, /vietatoInProva/);

console.log("revisione piano: ok");
