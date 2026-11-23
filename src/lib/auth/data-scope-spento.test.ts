import assert from "node:assert/strict";
import {
  ambitoElencoSpento,
  allowedModesForScope,
} from "./data-scope";

assert.equal(ambitoElencoSpento({ skip: false, mode: "spento" }), true);
assert.equal(ambitoElencoSpento({ skip: true, mode: "spento" }), false);
assert.equal(ambitoElencoSpento({ skip: false, mode: "tutte" }), false);
assert.equal(ambitoElencoSpento(null), false);

for (const key of ["ordini", "fornitori", "anagrafiche_clienti"]) {
  const modes = allowedModesForScope(key);
  assert.equal(modes.includes("tutte"), true);
  assert.equal(modes.includes("proprie"), true);
  assert.equal(modes.includes("spento"), true);
}

assert.equal(allowedModesForScope("statistiche").includes("spento"), false);

console.log("ambiti elenco spento: ok");
