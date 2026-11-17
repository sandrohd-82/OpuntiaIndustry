import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  codiceProdottoArchiviato,
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

const identita = codiceProdottoArchiviato("PPB4", ["PpB4", "NDRi"]);
assert.equal(identita.ok, true);
if (identita.ok) assert.equal(identita.codice, "PpB4");
const ambiguo = codiceProdottoArchiviato("PPB4", ["PpB4", "PPb4"]);
assert.equal(ambiguo.ok, false);

const maiuscolo = puoMovimentareEffettoMagazzino({
  tipo: "magazzino.produce",
  unita: "kg",
  unitaProdotto: "kg",
  codice: "PpB4",
  lotto: "L-17.11.26/PPB4/031/171126ABCDE-001",
  quantita: 2,
});
assert.equal(maiuscolo.ok, true);
if (maiuscolo.ok) {
  assert.equal(maiuscolo.lotto, "L-17.11.26/PpB4/031/171126ABCDE-001");
}

const pannello = readFileSync(
  "src/components/produzione/FoglioProcessiPanel.tsx",
  "utf8"
);
assert.doesNotMatch(pannello, /codiceMp: ev\.target\.value\.toUpperCase/);
assert.doesNotMatch(pannello, /codiceMp: e\.target\.value\.toUpperCase/);
const azione = readFileSync(
  "src/app/actions/produzione-foglio-processi.ts",
  "utf8"
);
assert.doesNotMatch(azione, /codiceMp\)\.trim\(\)\.toUpperCase/);
assert.match(azione, /codiceProdottoArchiviato/);

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
const identitaSql = readFileSync(
  "supabase/migrations/20261117103000_effetto_codice_identita.sql",
  "utf8"
);
assert.match(identitaSql, /Il codice prodotto non è univoco/);
assert.match(identitaSql, /lower\(p\.codice\) = lower\(v_codice\)/);
assert.doesNotMatch(identitaSql, /update public\.prodotti_propri/);

console.log("effetto-magazzino: ok");
