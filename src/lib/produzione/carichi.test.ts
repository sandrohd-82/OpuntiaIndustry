import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bilancioCarichi, bilancioVersione, presaVisioneConsegna, puoGestireCarico } from "./carichi";

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

const V1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const V2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const perVersione = bilancioVersione({
  versioneId: V2,
  ordinate: [{ materiaPrimaId: MP, codice: "Mp1", unitaMisura: "kg", quantita: 9 }],
  carichi: [
    {
      versioneId: V1,
      righe: [{ rigaId: R1, materiaPrimaId: MP, quantita: 5 }],
    },
    {
      versioneId: V2,
      righe: [
        { rigaId: "99999999-9999-4999-8999-999999999999", materiaPrimaId: MP, quantita: null },
        { rigaId: R1, materiaPrimaId: MP, quantita: 1 },
      ],
    },
  ],
});
assert.equal(perVersione[0]?.ordinata, 9);
assert.equal(perVersione[0]?.ricevuta, 1);
assert.equal(perVersione[0]?.residua, 8);
assert.equal(perVersione[0]?.oltre, false);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261116160000_approvvigionamenti_carichi.sql", import.meta.url),
  "utf8"
);
assert.match(sql, /haccp_fogli_ingresso/);
assert.equal(sql.includes("insert into public.ordini"), false);
assert.equal(/drop table/i.test(sql), false);
assert.equal(sql.includes("update public.approvvigionamenti_versioni"), false);
const arrivo = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116170000_approvvigionamenti_carichi_arrivo.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(arrivo, /versione pubblicata corrente/);
assert.match(arrivo, /Quantità non compilata/);
assert.match(arrivo, /parziale/);
assert.equal(arrivo.includes("update public.approvvigionamenti_versioni"), false);
const lock = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116180000_approvvigionamenti_lock_ordini.sql",
    import.meta.url
  ),
  "utf8"
);
const bloccoOrdine = lock.indexOf("approvvigionamento_blocca_ordine");
const letturaSnapshot = lock.indexOf("fornitore_id, numero, righe");
assert.ok(bloccoOrdine > 0 && letturaSnapshot > bloccoOrdine);
assert.equal(/approvvigionamenti_versioni[\s\S]{0,160}for update/i.test(lock), false);
assert.match(lock, /order by 1/);
assert.equal(lock.includes("update public.approvvigionamenti_versioni"), false);
assert.equal(lock.includes("insert into public.ordini"), false);

console.log("carichi: ok");
