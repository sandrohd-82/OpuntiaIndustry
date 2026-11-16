import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bilancioCarichi, presaVisioneConsegna, puoGestireCarico } from "./carichi";

const MP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const R1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

assert.equal(presaVisioneConsegna(), false);
assert.equal(puoGestireCarico({ superadmin: false, aree: ["produzione"] }), true);
assert.equal(puoGestireCarico({ superadmin: false, aree: ["amministrazione"] }), false);
assert.equal(puoGestireCarico({ superadmin: false, aree: ["area-fornitori"] }), false);

const parziale = bilancioCarichi({
  ordinate: [{ materiaPrimaId: MP, codice: "Mp1", unitaMisura: "kg", quantita: 5 }],
  arrivi: [{ rigaId: R1, materiaPrimaId: MP, quantita: 2 }],
});
assert.equal(parziale[0]?.ricevuta, 2);
assert.equal(parziale[0]?.residua, 3);
assert.equal(parziale[0]?.oltre, false);

const duplicata = bilancioCarichi({
  ordinate: [{ materiaPrimaId: MP, codice: "Mp1", unitaMisura: "kg", quantita: 5 }],
  arrivi: [
    { rigaId: R1, materiaPrimaId: MP, quantita: 2 },
    { rigaId: R1, materiaPrimaId: MP, quantita: 2 },
  ],
});
assert.equal(duplicata[0]?.ricevuta, 2);

const oltre = bilancioCarichi({
  ordinate: [{ materiaPrimaId: MP, codice: "Mp1", unitaMisura: "kg", quantita: 2 }],
  arrivi: [{ rigaId: R1, materiaPrimaId: MP, quantita: 8 }],
});
assert.equal(oltre[0]?.oltre, true);
assert.equal(oltre[0]?.residua, -6);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261116160000_approvvigionamenti_carichi.sql", import.meta.url),
  "utf8"
);
assert.match(sql, /haccp_fogli_ingresso/);
assert.equal(sql.includes("insert into public.ordini"), false);
assert.equal(/drop table/i.test(sql), false);
assert.equal(sql.includes("update public.approvvigionamenti_versioni"), false);

console.log("carichi: ok");
