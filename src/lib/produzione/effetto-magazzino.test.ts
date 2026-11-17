import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  meseNelCoefficiente,
  puoMovimentareEffettoMagazzino,
} from "./effetto-magazzino";

const lotto = "L-17.11.26/PpB4/031/171126ABCDE-001";
const ok = puoMovimentareEffettoMagazzino({
  tipo: "magazzino.produce",
  unita: "kg",
  unitaProdotto: "kg",
  codice: "PpB4",
  lotto,
  quantita: 2,
});
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.lotto, lotto);

const senza = puoMovimentareEffettoMagazzino({
  tipo: "magazzino.produce",
  unita: "kg",
  unitaProdotto: "kg",
  codice: "PpB4",
  lotto: "",
  quantita: 2,
});
assert.equal(senza.ok, false);

const unita = puoMovimentareEffettoMagazzino({
  tipo: "magazzino.consuma",
  unita: "lt",
  unitaProdotto: "kg",
  codice: "PpB4",
  lotto,
  quantita: 1,
});
assert.equal(unita.ok, false);

const cestone = puoMovimentareEffettoMagazzino({
  tipo: "essiccatore.carica_cestone",
  unita: "kg",
  unitaProdotto: null,
  codice: "",
  lotto: "",
  quantita: 4,
});
assert.equal(cestone.ok, true);
assert.equal(meseNelCoefficiente(11, 11, 3), true);
assert.equal(meseNelCoefficiente(6, 11, 3), false);
assert.equal(meseNelCoefficiente(6, 4, 10), true);

const sql = readFileSync(
  "supabase/migrations/20261117090000_produzione_effetto_magazzino.sql",
  "utf8"
);
assert.match(sql, /produzione_registra_effetto_magazzino/);
assert.match(sql, /Nessun carico è stato creato/);
assert.match(sql, /Nessuna conversione/);
assert.match(sql, /Giacenza insufficiente/);
assert.doesNotMatch(sql, /insert into public\.iot_commands/);
assert.doesNotMatch(sql, /mqtt/i);
assert.doesNotMatch(sql, /catalog_kind', 'materia_prima'/);

console.log("effetto-magazzino: ok");
