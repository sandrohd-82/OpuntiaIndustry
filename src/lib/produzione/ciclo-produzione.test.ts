import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { protocolloMacchinaProva } from "./ciclo-prova";

const sql = readFileSync(
  "supabase/migrations/20261116280000_produzione_ciclo_foglio.sql",
  "utf8"
);

assert.equal(protocolloMacchinaProva(true), "POWER_ON,POWER_OFF");
assert.equal(protocolloMacchinaProva(false), "");
assert.match(sql, /foglio_id, created_by, updated_by/);
assert.match(sql, /p_foglio_lavorazione_id, v_uid, v_uid/);
assert.match(sql, /modalita = 'prova'/);
assert.match(sql, /POWER_ON,POWER_OFF/);
assert.match(sql, /produzione_foglio_ciclo/);
assert.doesNotMatch(sql, /create or replace function public\.magazzino_mp_registra_movimento/);
assert.doesNotMatch(sql, /insert into public\.iot_commands/);
assert.doesNotMatch(sql, /prodotto_proprio/);
assert.doesNotMatch(sql, /mqtt/i);

console.log("ciclo-produzione: ok");
