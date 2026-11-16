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
assert.match(barcode, /Nessuna conversione è stata applicata/);
assert.match(barcode, /Unità non prevista per i prodotti di consumo/);

const ruoli = readFileSync(
  "supabase/migrations/20261116193000_magazzino_mp_ruoli.sql",
  "utf8"
);
assert.match(ruoli, /owner to magazzino_mp_movimento/);
assert.match(ruoli, /owner to magazzino_mp_pulizia/);
assert.match(ruoli, /magazzino_mp_movimento/);
assert.match(ruoli, /magazzino_mp_pulizia/);
assert.match(ruoli, /select false/);
assert.doesNotMatch(ruoli, /set_config\('magazzino/);
assert.match(ruoli, /set local role magazzino_mp_movimento/);
assert.match(ruoli, /unita in \('kg', 'g', 'lt', 'ml', 'pz'\)/);

const schema = readFileSync("src/lib/magazzino/barcode.ts", "utf8");
assert.match(schema, /z\.enum\(\["kg", "g", "lt", "ml", "pz"\]\)/);

console.log("riconciliazione-mp: ok");
