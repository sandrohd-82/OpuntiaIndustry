import assert from "node:assert/strict";
import { puoAccettareLottoMp } from "./accettazione-mp";

const conformi = ["mezzo", "1e", "2b", "2g", "2h"].map((codice) => ({
  codice,
  esito: "conforme",
}));

assert.equal(puoAccettareLottoMp({ foglioStato: "arrivato", esiti: conformi }).ok, false);
assert.equal(puoAccettareLottoMp({ foglioStato: "chiuso", esiti: conformi }).ok, true);
assert.equal(
  puoAccettareLottoMp({
    foglioStato: "chiuso",
    esiti: conformi.map((voce) =>
      voce.codice === "2b" ? { codice: "2b", esito: "non_conforme" } : voce
    ),
  }).ok,
  false
);
assert.equal(
  puoAccettareLottoMp({
    foglioStato: "chiuso",
    esiti: conformi.filter((voce) => voce.codice !== "2h"),
  }).ok,
  false
);

console.log("accettazione-mp: ok");
