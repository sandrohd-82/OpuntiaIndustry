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

const revoca = readFileSync(
  "supabase/migrations/20261116200000_magazzino_mp_revoca_create.sql",
  "utf8"
);
assert.match(revoca, /revoke create on schema public from magazzino_mp_movimento/);
assert.match(revoca, /revoke create on schema public from magazzino_mp_pulizia/);
assert.doesNotMatch(revoca, /grant create on schema public to magazzino_mp_/);

const lotti = readFileSync(
  "supabase/migrations/20261116210000_magazzino_mp_lotti_struttura.sql",
  "utf8"
);
assert.match(lotti, /magazzino_mp_lotti_origine_check/);
assert.match(lotti, /quantita_respinta_presente/);
assert.match(lotti, /quantita_consumata_uscita/);
assert.match(lotti, /storico_non_attribuito/);
assert.match(lotti, /storico_verificato/);
assert.match(lotti, /security_invoker = true/);
assert.match(lotti, /movimento_id is null/);
assert.doesNotMatch(lotti, /magazzino_mp_registra_movimento/);

const vincoli = readFileSync(
  "supabase/migrations/20261116220000_magazzino_mp_lotti_vincoli.sql",
  "utf8"
);
assert.match(vincoli, /revoke truncate, trigger, references on table public.magazzino_mp_lotto_eventi/);
assert.match(vincoli, /service_role/);
assert.match(vincoli, /magazzino_mp_lotto_eventi_una_compensazione_uidx/);
assert.match(vincoli, /magazzino_mp_lotto_eventi_riferimento_stesso_lotto/);
assert.doesNotMatch(vincoli, /magazzino_mp_registra_movimento/);
assert.doesNotMatch(vincoli, /grant insert/);

const identifica = readFileSync(
  "supabase/migrations/20261116230000_magazzino_mp_identifica_lotto.sql",
  "utf8"
);
assert.match(identifica, /magazzino_mp_identificazione/);
assert.match(identifica, /security definer/);
assert.match(identifica, /has_area_access\('magazzino'\)/);
assert.match(identifica, /has_area_access\('produzione'\)/);
assert.match(identifica, /is_superadmin\(\)/);
assert.match(identifica, /mp-lotto-chiave:/);
assert.match(identifica, /mp-lotto-origine:/);
assert.match(identifica, /Il carico non ha un arrivo fisico/);
assert.match(identifica, /tipo = 'identificazione'/);
assert.match(identifica, /a_stato = 'in_controllo'/);
assert.match(identifica, /revoke create on schema public from magazzino_mp_identificazione/);
assert.match(identifica, /grant select, insert on public.magazzino_mp_lotti to magazzino_mp_identificazione/);
assert.doesNotMatch(identifica, /to authenticated;\s*\ngrant insert/);
assert.doesNotMatch(identifica, /magazzino_mp_registra_movimento/);
assert.doesNotMatch(identifica, /update public.magazzino_giacenze/);
assert.doesNotMatch(identifica, /update public.haccp_fogli_ingresso/);
assert.doesNotMatch(identifica, /update public.approvvigionamenti_carichi/);

const decisioni = readFileSync(
  "supabase/migrations/20261116240000_magazzino_mp_decisioni.sql",
  "utf8"
);
assert.match(decisioni, /uscita_respinta/);
assert.match(decisioni, /mp-lotto-chiave:[\s\S]*mp-lotto-origine:[\s\S]*mp-lotto:/);
assert.match(decisioni, /da_stato is distinct from 'disponibile'/);
assert.match(decisioni, /Non autorizzato: serve Produzione o superadmin/);
assert.match(decisioni, /La quantità supera il conto di origine/);
assert.match(decisioni, /La chiave idempotente è già usata con dati diversi/);
assert.match(decisioni, /revoke create on schema public from magazzino_mp_decisione/);
assert.doesNotMatch(decisioni, /magazzino_mp_registra_movimento/);
assert.doesNotMatch(decisioni, /update public.magazzino_giacenze/);
assert.doesNotMatch(decisioni, /update public.haccp_fogli_ingresso/);
assert.doesNotMatch(decisioni, /insert into public.magazzino_movimenti/);

const collegamento = readFileSync(
  "supabase/migrations/20261116250000_magazzino_mp_collegamento_struttura.sql",
  "utf8"
);
assert.match(collegamento, /lotto_evento_id uuid/);
assert.match(collegamento, /unique \(lotto_evento_id\)/);
assert.match(collegamento, /registro_classe is null/);
assert.match(collegamento, /registro_classe = 'senza_lotto'/);
assert.match(collegamento, /registro_classe = 'lotto'/);
assert.match(collegamento, /Evento inesistente/);
assert.match(collegamento, /L''evento appartiene a un''altra materia/);
assert.match(collegamento, /Evento non pertinente al movimento/);
assert.match(collegamento, /L''evento è già collegato a un movimento/);
assert.match(collegamento, /Un movimento collegato a un lotto non si chiude/);
assert.match(collegamento, /movimenti_storici_senza_lotto/);
assert.match(collegamento, /movimenti_nuovi_senza_lotto/);
assert.match(collegamento, /movimenti_collegati_lotto/);
assert.match(collegamento, /scostamento_non_verificato/);
assert.match(collegamento, /revoke create on schema public from magazzino_mp_pulizia/);
assert.match(collegamento, /txid_current\(\)/);
assert.doesNotMatch(
  collegamento,
  /create or replace function public\.magazzino_mp_registra_movimento/
);
assert.doesNotMatch(collegamento, /ingresso_senza_ordine/);
assert.doesNotMatch(collegamento, /update public.haccp_fogli_ingresso/);
assert.doesNotMatch(collegamento, /grant create on schema public to authenticated/);

const accettazione = readFileSync(
  "supabase/migrations/20261116270000_magazzino_mp_accettazione_prelievo.sql",
  "utf8"
);
assert.match(accettazione, /magazzino_mp_accetta_lotto/);
assert.match(accettazione, /magazzino_mp_preleva_lotto/);
assert.match(accettazione, /da_stato = 'in_controllo'/);
assert.match(accettazione, /a_stato = 'disponibile'/);
assert.match(accettazione, /sottotipo = 'prelievo'/);
assert.match(accettazione, /Il foglio HACCP non è chiuso/);
assert.match(accettazione, /non conforme/);
assert.match(accettazione, /Non vengono considerati conformi/);
assert.match(accettazione, /carico_riga_id/);
assert.match(accettazione, /revoke create on schema public from magazzino_mp_collegamento/);
assert.doesNotMatch(
  accettazione,
  /create or replace function public\.magazzino_mp_registra_movimento/
);
assert.doesNotMatch(accettazione, /magazzino_mp_haccp_deroghe/);
assert.doesNotMatch(accettazione, /lotti_esterni/);

const schema = readFileSync("src/lib/magazzino/barcode.ts", "utf8");
assert.match(schema, /z\.enum\(\["kg", "g", "lt", "ml", "pz"\]\)/);

console.log("riconciliazione-mp: ok");
