import assert from "node:assert/strict";
import { fatturaElencoInviata } from "./ordini";

assert.equal(fatturaElencoInviata({ eiStatus: "", ficId: null }), false);
assert.equal(
  fatturaElencoInviata({ eiStatus: "send_error", ficId: null }),
  false
);
assert.equal(fatturaElencoInviata({ eiStatus: "pending" }), true);
assert.equal(fatturaElencoInviata({ eiStatus: "sent", ficId: null }), true);
assert.equal(
  fatturaElencoInviata({ eiStatus: "delivered", ficId: 10 }),
  true
);
assert.equal(fatturaElencoInviata({ eiStatus: "", ficId: 24 }), true);
assert.equal(fatturaElencoInviata({ eiStatus: "rejected", ficId: null }), false);

console.log("fattura elenco inviata: ok");
