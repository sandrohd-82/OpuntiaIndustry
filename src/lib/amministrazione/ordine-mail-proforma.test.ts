import assert from "node:assert/strict";
import { fatturaOrdineGiaInviata } from "./ordine-mail-bozza";

assert.equal(
  fatturaOrdineGiaInviata([
    { tipo: "proforma", eiStatus: "" },
    { tipo: "fattura", eiStatus: "", ficId: null },
  ]),
  false
);
assert.equal(
  fatturaOrdineGiaInviata([
    { tipo: "proforma", eiStatus: "" },
    { tipo: "fattura", eiStatus: "sent", ficId: null },
  ]),
  true
);
assert.equal(
  fatturaOrdineGiaInviata([{ tipo: "fattura", eiStatus: "", ficId: 24 }]),
  true
);

console.log("ordine mail proforma: ok");
