import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rigaOrdineValida } from "./approvvigionamento";
import { totaliDocumento } from "./documento-pianificazione";
import {
  etichettaMeseAnno,
  etichettaUnita,
  normalizzaUnitaApprovvigionamento,
  unitaMagazzinoCompatibile,
} from "./unita-approvvigionamento";

assert.equal(etichettaMeseAnno("2027-01-15"), "GENNAIO 2027");
assert.equal(etichettaMeseAnno("2026-12-01"), "DICEMBRE 2026");

const chilogrammi = normalizzaUnitaApprovvigionamento("Kg");
const litri = normalizzaUnitaApprovvigionamento("LT");
const litro = normalizzaUnitaApprovvigionamento("l");
assert.equal(chilogrammi.ok && chilogrammi.sigla, "kg");
assert.equal(litri.ok && litri.sigla, "lt");
assert.equal(litro.ok && litro.sigla, "lt");
assert.equal(unitaMagazzinoCompatibile("kg"), true);
assert.equal(unitaMagazzinoCompatibile("sacchi"), false);
assert.equal(unitaMagazzinoCompatibile("t"), false);
assert.equal(etichettaUnita("kg"), "Kg");
assert.equal(etichettaUnita("cs", "Casse"), "Casse (cs)");

const materia = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: materia,
    quantita: 3,
    unitaCatalogo: "kg",
    unitaRichiesta: "sacchi",
  }).ok,
  true
);
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: materia,
    quantita: 3,
    unitaCatalogo: "kg",
    unitaRichiesta: "kg",
  }).ok,
  true
);
assert.equal(
  rigaOrdineValida({
    materiaPrimaId: materia,
    quantita: 3,
    unitaCatalogo: null,
    unitaRichiesta: "kg",
  }).ok,
  true
);

const totali = totaliDocumento({
  codice: "PP",
  fornitore: "Mulino",
  materia: "Farina",
  unita: "kg",
  periodoInizio: "2027-01-01",
  periodoFine: "2027-01-31",
  note: "",
  consegne: [
    { data: "2027-01-02", quantita: 4, tipoQuantita: "precisa", stato: "bozza", unita: "kg" },
    { data: "2027-01-03", quantita: 2, tipoQuantita: "precisa", stato: "bozza", unita: "sacchi" },
  ],
});
assert.equal(totali.precisa, null);
assert.equal(totali.stimata, null);

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261117160000_approvvigionamenti_unita_riga.sql", import.meta.url),
  "utf8"
);
assert.equal(sql.includes("update public.approvvigionamenti_ordini"), false);
assert.equal(sql.includes("nextval"), false);
assert.equal(sql.includes("materie_prime_unita_check"), false);
assert.match(sql, /approvvigionamento_valida_righe/);
const sqlOrdine = readFileSync(
  new URL("../../../supabase/migrations/20261118120000_approvvigionamenti_unita_ordine.sql", import.meta.url),
  "utf8"
);
assert.match(sqlOrdine, /approvvigionamento_valida_righe/);
assert.equal(sqlOrdine.includes("unità di misura in catalogo"), false);
assert.equal(sqlOrdine.includes("materie_prime"), false);

console.log("unita approvvigionamento: ok");
