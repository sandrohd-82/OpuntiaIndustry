import assert from "node:assert/strict";
import { validaRispostaFornitore } from "./risposta-fornitore";

assert.equal(
  validaRispostaFornitore({
    tipo: "conferma",
    motivazione: "",
    dataConsegna: null,
    righe: [],
  }).ok,
  true
);

const propostaVuota = validaRispostaFornitore({
  tipo: "proposta",
  motivazione: "Quantità diversa",
  dataConsegna: null,
  righe: [],
});
assert.equal(propostaVuota.ok, false);

const rifiuto = validaRispostaFornitore({
  tipo: "rifiuto",
  motivazione: "no",
  dataConsegna: null,
  righe: [],
});
assert.equal(rifiuto.ok, false);

const indisponibile = validaRispostaFornitore({
  tipo: "indisponibilita",
  motivazione: "Manca una parte del lotto dichiarato",
  dataConsegna: null,
  righe: [{ codice: "MP1", quantita: 10, unitaMisura: "kg" }],
});
assert.equal(indisponibile.ok, true);

console.log("risposta-fornitore: ok");
