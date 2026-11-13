import assert from "node:assert/strict";
import {
  puoModificareCollegamentoFornitore,
  risolviAccessoMaterialeIngresso,
  type SoggettoAccessoFornitore,
} from "./fornitore-accesso";

const FORNITORE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FORNITORE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function soggetto(
  partial: Partial<SoggettoAccessoFornitore> &
    Pick<SoggettoAccessoFornitore, "aree">
): SoggettoAccessoFornitore {
  return {
    superadmin: false,
    fornitoreCollegatoId: null,
    ...partial,
  };
}

const fornitoreA = soggetto({
  aree: ["area-fornitori"],
  fornitoreCollegatoId: FORNITORE_A,
});

const accessoA = risolviAccessoMaterialeIngresso(fornitoreA, FORNITORE_B);
assert.equal(accessoA.esito, "negato");
if (accessoA.esito === "negato") {
  assert.equal(accessoA.motivo, "altro_fornitore");
}

const nonCollegato = risolviAccessoMaterialeIngresso(
  soggetto({ aree: ["area-fornitori"] }),
  FORNITORE_A
);
assert.equal(nonCollegato.esito, "negato");
if (nonCollegato.esito === "negato") {
  assert.equal(nonCollegato.motivo, "non_collegato");
}

assert.equal(puoModificareCollegamentoFornitore(fornitoreA), false);
const proprio = risolviAccessoMaterialeIngresso(fornitoreA, FORNITORE_A);
assert.equal(proprio.esito, "fornitore");
if (proprio.esito === "fornitore") {
  assert.equal(proprio.fornitoreId, FORNITORE_A);
}

const produzione = risolviAccessoMaterialeIngresso(
  soggetto({ aree: ["produzione"] }),
  FORNITORE_B
);
assert.equal(produzione.esito, "interno");

const amministrazione = soggetto({ aree: ["amministrazione"] });
assert.equal(
  risolviAccessoMaterialeIngresso(amministrazione, FORNITORE_A).esito,
  "interno"
);
assert.equal(puoModificareCollegamentoFornitore(amministrazione), true);
assert.equal(
  puoModificareCollegamentoFornitore(soggetto({ aree: ["produzione"] })),
  false
);

const superadmin = risolviAccessoMaterialeIngresso(
  soggetto({ aree: [], superadmin: true }),
  FORNITORE_B
);
assert.equal(superadmin.esito, "interno");
assert.equal(
  puoModificareCollegamentoFornitore(soggetto({ aree: [], superadmin: true })),
  true
);

console.log("fornitore-accesso: ok");
