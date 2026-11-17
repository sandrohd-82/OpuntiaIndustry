import assert from "node:assert/strict";
import {
  conflittoDataDaErroreFic,
  dataEmissioneAccettabile,
  fatturaCheBloccaData,
  messaggioDataFatturaBloccata,
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
  dataEmissioneAccettabile({
    richiesta: "2026-10-20",
    oggi: "2026-11-17",
    blocco: "2026-11-06",
  }),
  "2026-11-17"
);
assert.equal(
  dataEmissioneAccettabile({
    richiesta: "2026-11-17",
    oggi: "2026-11-17",
    blocco: "2026-11-06",
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
