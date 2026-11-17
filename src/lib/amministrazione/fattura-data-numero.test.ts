import assert from "node:assert/strict";
import {
  conflittoDataDaErroreFic,
  dataDelGiornoDiEmissione,
  fatturaCheBloccaData,
  messaggioDataFatturaBloccata,
  spostaScadenza,
} from "./fattura-data-numero";

const blocco = fatturaCheBloccaData({
  data: "2026-10-20",
  numeroPrevisto: null,
  esistenti: [
    { numero: 23, data: "2026-10-28" },
    { numero: 24, data: "2026-11-06" },
  ],
});
assert.deepEqual(blocco, { numero: 24, data: "2026-11-06" });
assert.equal(
  fatturaCheBloccaData({
    data: "2026-11-17",
    numeroPrevisto: 25,
    esistenti: [{ numero: 24, data: "2026-11-06" }],
  }),
  null
);
assert.equal(
  dataDelGiornoDiEmissione({ oggi: "2026-11-17", blocco: "2026-11-06" }),
  "2026-11-17"
);
assert.equal(
  dataDelGiornoDiEmissione({ oggi: "2026-11-01", blocco: "2026-11-06" }),
  "2026-11-06"
);
assert.equal(
  spostaScadenza({
    origine: "2026-10-06",
    scadenza: "2026-11-06",
    nuova: "2026-11-17",
  }),
  "2026-12-18"
);
assert.equal(
  spostaScadenza({
    origine: "2026-10-20",
    scadenza: "2026-10-20",
    nuova: "2026-11-17",
  }),
  "2026-11-17"
);

const letto = conflittoDataDaErroreFic(
  'Fatture in Cloud ha risposto con errore 409: {"error":{"message":"Esiste già una fattura con data successiva ma numero inferiore (Fattura n° 24 del 06/11/2026)."}}'
);
assert.deepEqual(letto, { numero: 24, data: "2026-11-06" });
assert.match(messaggioDataFatturaBloccata(letto!), /06\/11\/2026/);
assert.equal(conflittoDataDaErroreFic("errore 500"), null);

console.log("fattura data numero: ok");
