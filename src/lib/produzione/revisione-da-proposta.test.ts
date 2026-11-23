import assert from "node:assert/strict";
import {
  bozzaDopoProposta,
  chiaveEstensioneRisposta,
  chiaveRevisioneRisposta,
  chiaveVoceRevisione,
  etichettaStatoAccordo,
  propostaProntaPerRevisione,
  riepilogoVociAccettate,
  rigaPianoAggiornata,
  statoAccordoFornitore,
  type RigaBozzaRevisione,
} from "./revisione-da-proposta";
import type { VoceRevisione } from "./revisione-piano";

const riga = (codice: string, quantita: number): RigaBozzaRevisione => ({
  materiaPrimaId: "11111111-1111-4111-8111-111111111111",
  codice,
  quantita,
  unitaMisura: "kg",
  unitaNome: "",
  tipoQuantita: "precisa",
  note: "",
});

function voce(parziale: Partial<VoceRevisione> & Pick<VoceRevisione, "id" | "operazione" | "stato">): VoceRevisione {
  return {
    consegnaId: "22222222-2222-4222-8222-222222222222",
    codice: "MP-1",
    materiaId: "11111111-1111-4111-8111-111111111111",
    materia: "Polpa",
    unita: "kg",
    tipoQuantita: "precisa",
    dataPrima: "2026-11-02",
    dataDopo: "2026-11-04",
    quantitaPrima: 10,
    quantitaDopo: 8,
    nota: "",
    ...parziale,
  };
}

const base = {
  pubblicato: true,
  annullata: false,
  bozzaNonPubblicata: false,
  rispostaTipo: null,
  rispostaStato: null,
  confermaSuVersionePrecedente: false,
} as const;

assert.equal(statoAccordoFornitore(base), "in_attesa");
assert.equal(
  statoAccordoFornitore({ ...base, rispostaTipo: "conferma", rispostaStato: "accettata" }),
  "accettato"
);
assert.equal(
  statoAccordoFornitore({ ...base, rispostaTipo: "proposta", rispostaStato: "in_esame" }),
  "modifica_richiesta"
);
assert.equal(
  statoAccordoFornitore({ ...base, rispostaTipo: "proposta", rispostaStato: "accettata" }),
  "modifica_richiesta"
);
assert.equal(statoAccordoFornitore({ ...base, bozzaNonPubblicata: true }), "revisione_da_pubblicare");
assert.equal(
  statoAccordoFornitore({ ...base, confermaSuVersionePrecedente: true }),
  "nuova_accettazione"
);
assert.equal(statoAccordoFornitore({ ...base, pubblicato: false }), null);
assert.equal(etichettaStatoAccordo("nuova_accettazione"), "Nuova accettazione necessaria");

const bozza = bozzaDopoProposta({
  dataAttuale: "2026-11-02",
  dataProposta: "2026-11-05",
  righeAttuali: [riga("MP-1", 10), riga("MP-2", 3)],
  righeProposte: [{ codice: "MP-1", quantita: 8, unitaMisura: "kg" }],
  materiePerCodice: {},
});
assert.equal(bozza.ok, true);
if (bozza.ok) {
  assert.equal(bozza.dataConsegna, "2026-11-05");
  assert.equal(bozza.righe[1]?.quantita, 3);
  assert.equal(bozza.righe[0]?.quantita, 8);
  assert.deepEqual(
    bozza.differenze.map((voce) => voce.esito),
    ["modificata", "modificata"]
  );
}

const aggiunta = bozzaDopoProposta({
  dataAttuale: "2026-11-02",
  dataProposta: null,
  righeAttuali: [riga("MP-1", 10)],
  righeProposte: [{ codice: "MP-9", quantita: 2, unitaMisura: "kg" }],
  materiePerCodice: { "MP-9": "33333333-3333-4333-8333-333333333333" },
});
assert.equal(aggiunta.ok, true);
if (aggiunta.ok) {
  assert.equal(aggiunta.righe.length, 2);
  assert.equal(aggiunta.differenze[0]?.esito, "aggiunta");
}

const senzaMateria = bozzaDopoProposta({
  dataAttuale: "2026-11-02",
  dataProposta: null,
  righeAttuali: [riga("MP-1", 10)],
  righeProposte: [{ codice: "MP-9", quantita: 2, unitaMisura: "kg" }],
  materiePerCodice: {},
});
assert.equal(senzaMateria.ok, false);

const aperta = riepilogoVociAccettate([
  voce({ id: "a", operazione: "quantita", stato: "in_esame" }),
  voce({ id: "b", operazione: "eliminazione", stato: "accettata" }),
]);
assert.equal(aperta.applicabile, false);

const chiusa = riepilogoVociAccettate([
  voce({ id: "a", operazione: "eliminazione", stato: "accettata", dataDopo: null, quantitaDopo: null }),
  voce({
    id: "b",
    operazione: "aggiunta",
    stato: "accettata",
    consegnaId: null,
    dataPrima: null,
    quantitaPrima: null,
  }),
  voce({ id: "c", operazione: "quantita", stato: "respinta" }),
]);
assert.equal(chiusa.applicabile, true);
assert.deepEqual(
  chiusa.differenze.map((voce) => voce.esito),
  ["eliminata", "aggiunta"]
);
assert.equal(propostaProntaPerRevisione([{ stato: "accettata" }, { stato: "in_esame" }]), false);
assert.equal(propostaProntaPerRevisione([{ stato: "accettata" }, { stato: "respinta" }]), true);

const aggiornata = rigaPianoAggiornata({
  dataAttuale: "2026-11-02",
  righe: [riga("MP-1", 10), riga("MP-2", 4)],
  voce: voce({ id: "a", operazione: "quantita", stato: "accettata", quantitaDopo: 6 }),
});
assert.equal(aggiornata.ok, true);
if (aggiornata.ok) {
  assert.equal(aggiornata.righe[0]?.quantita, 6);
  assert.equal(aggiornata.righe[1]?.quantita, 4);
  assert.equal(aggiornata.dataConsegna, "2026-11-04");
}

const id = "44444444-4444-4444-8444-444444444444";
for (const chiave of [
  chiaveRevisioneRisposta(id),
  chiaveEstensioneRisposta(id),
  chiaveVoceRevisione(id, "aggiorna"),
  chiaveVoceRevisione(id, "annulla"),
  chiaveVoceRevisione(id, "aggiungi"),
  chiaveVoceRevisione(id, "estendi"),
]) {
  assert.equal(chiave.length >= 8 && chiave.length <= 80, true);
}
assert.equal(chiaveRevisioneRisposta(id), chiaveRevisioneRisposta(id));

console.log("revisione da proposta: ok");
