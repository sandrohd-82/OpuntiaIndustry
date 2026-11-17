import assert from "node:assert/strict";
import { importoPagamentoDaFattura } from "./ordine-pagamento-dichiarato";

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

console.log("ordine-pagamento-dichiarato: ok");
