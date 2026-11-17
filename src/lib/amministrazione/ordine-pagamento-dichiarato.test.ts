import assert from "node:assert/strict";
import {
  decisionePagamentoDichiarato,
  importoPagamentoDaFattura,
  riepilogoDilazioniPagate,
} from "./ordine-pagamento-dichiarato";

const ok = importoPagamentoDaFattura({
  dataPagamento: "2026-11-17",
  fatturaTotale: 216.55,
});
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.importo, 216.55);

const senzaData = importoPagamentoDaFattura({
  dataPagamento: "",
  fatturaTotale: 10,
});
assert.equal(senzaData.ok, false);

const senzaFattura = importoPagamentoDaFattura({
  dataPagamento: "2026-11-17",
  fatturaTotale: null,
});
assert.equal(senzaFattura.ok, false);

const annullata = importoPagamentoDaFattura({
  dataPagamento: "2026-11-17",
  fatturaTotale: 10,
  fatturaAnnullata: true,
});
assert.equal(annullata.ok, false);

const rate = [
  { id: "a", importo: 100, stato: "da_pagare" as const, dataScadenza: "2026-12-01" },
  { id: "b", importo: 50, stato: "da_pagare" as const, dataScadenza: "2027-01-01" },
];
const intero = decisionePagamentoDichiarato({
  dataPagamento: "2026-11-17",
  fatturaTotale: 150,
  rate,
  scelta: "intero",
});
assert.equal(intero.ok, true);
if (intero.ok) {
  assert.equal(intero.saldata, true);
  assert.equal(intero.importo, 150);
  assert.deepEqual(intero.rateDaSegnare, ["a", "b"]);
}
const una = decisionePagamentoDichiarato({
  dataPagamento: "2026-11-17",
  fatturaTotale: 150,
  rate,
  scelta: "a",
});
assert.equal(una.ok, true);
if (una.ok) {
  assert.equal(una.saldata, false);
  assert.equal(una.importo, 100);
  assert.deepEqual(una.rateDaSegnare, ["a"]);
}
const ultima = decisionePagamentoDichiarato({
  dataPagamento: "2026-11-17",
  fatturaTotale: 150,
  rate: [
    { id: "a", importo: 100, stato: "pagato", dataScadenza: "2026-12-01" },
    rate[1],
  ],
  scelta: "b",
});
assert.equal(ultima.ok, true);
if (ultima.ok) assert.equal(ultima.saldata, true);
const gia = decisionePagamentoDichiarato({
  dataPagamento: "2026-11-17",
  fatturaTotale: 150,
  rate: [{ id: "a", importo: 100, stato: "pagato", dataScadenza: "2026-12-01" }],
  scelta: "a",
});
assert.equal(gia.ok, false);

const parziale = riepilogoDilazioniPagate([
  { stato: "pagato", importo: 100 },
  { stato: "da_pagare", importo: 50 },
  { stato: "annullata", importo: 20 },
]);
assert.equal(parziale.pagate, 1);
assert.equal(parziale.aperte, 1);
assert.equal(parziale.importoPagato, 100);
const nessuna = riepilogoDilazioniPagate([{ stato: "da_pagare", importo: 80 }]);
assert.equal(nessuna.pagate, 0);

console.log("ordine-pagamento-dichiarato: ok");
