import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  erroreUnitaMovimentoMp,
  riconciliazioneMp,
} from "./riconciliazione-mp";

const storico = riconciliazioneMp(7, []);
assert.equal(storico.saldoRegistrato, 7);
assert.equal(storico.sommaMovimenti, 0);
assert.equal(storico.scostamentoNonVerificato, 7);

const dopo = riconciliazioneMp(5, [
  { tipo: "carico", quantita: 1 },
  { tipo: "scarico", quantita: 3 },
]);
assert.equal(dopo.sommaMovimenti, -2);
assert.equal(dopo.scostamentoNonVerificato, 7);

assert.equal(
  erroreUnitaMovimentoMp({
    unitaAnagrafica: null,
    unitaRichiesta: "kg",
    unitaGiacenza: "kg",
  }),
  "Unità di misura assente in anagrafica. Impostala prima di registrare il movimento."
);
assert.match(
  erroreUnitaMovimentoMp({
    unitaAnagrafica: "g",
    unitaRichiesta: "kg",
    unitaGiacenza: "g",
  }) ?? "",
  /Nessuna conversione/
);
assert.match(
  erroreUnitaMovimentoMp({
    unitaAnagrafica: "g",
    unitaRichiesta: "g",
    unitaGiacenza: "kg",
  }) ?? "",
  /senza conversione/
);
assert.equal(
  erroreUnitaMovimentoMp({
    unitaAnagrafica: "kg",
    unitaRichiesta: "kg",
    unitaGiacenza: "kg",
  }),
  null
);

const sql = readFileSync(
  "supabase/migrations/20261116190000_magazzino_mp_registro.sql",
  "utf8"
);
assert.match(sql, /for update/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /security invoker/);
assert.doesNotMatch(sql, /set_config\('magazzino/);
assert.match(sql, /magazzino_mp_riconciliazione/);
assert.match(sql, /catalog_kind = 'materia_prima'/);

const elenco = readFileSync("src/app/actions/materie-prime.ts", "utf8");
assert.match(
  elenco,
  /requireAnyAreaAccess\(\[\s*"magazzino",\s*"produzione",\s*"amministrazione",\s*\]\)/
);
assert.match(elenco, /createMateriaPrimaAction[\s\S]*requireAreaAccess\("amministrazione"\)/);

const stato = readFileSync("src/app/actions/magazzino.ts", "utf8");
assert.match(stato, /non si modifica da questa scheda/);
assert.match(stato, /non si passa ad acquisti occasionali/);

const barcode = readFileSync("src/app/actions/magazzino-barcode.ts", "utf8");
assert.match(barcode, /magazzino_mp_registra_movimento/);

console.log("riconciliazione-mp: ok");
