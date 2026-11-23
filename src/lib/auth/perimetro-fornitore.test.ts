import assert from "node:assert/strict";
import {
  motivoAltriAccessiAziendali,
  permessoNelPerimetroFornitore,
} from "./perimetro-fornitore";

assert.equal(permessoNelPerimetroFornitore("/app/area-fornitori"), true);
assert.equal(permessoNelPerimetroFornitore("/app/area-fornitori/ordini-ricevuti"), true);
assert.equal(permessoNelPerimetroFornitore("action:/app/area-fornitori/ordini-ricevuti/x"), true);
assert.equal(permessoNelPerimetroFornitore("/app/produzione"), false);
assert.equal(permessoNelPerimetroFornitore("action:/app/amministrazione/organigramma/elenco-e-mansioni/crea-profilo"), false);

assert.equal(
  motivoAltriAccessiAziendali({
    ruolo: "fornitore",
    inOrganigramma: false,
    reparti: 0,
    caselle: 0,
  }),
  null
);
assert.match(
  motivoAltriAccessiAziendali({
    ruolo: "operator",
    inOrganigramma: false,
    reparti: 0,
    caselle: 0,
  }) ?? "",
  /ruolo aziendale/
);
assert.match(
  motivoAltriAccessiAziendali({
    ruolo: "fornitore",
    inOrganigramma: true,
    reparti: 0,
    caselle: 0,
  }) ?? "",
  /organigramma/
);

console.log("perimetro fornitore: ok");
