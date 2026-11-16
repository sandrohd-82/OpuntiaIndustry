import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distribuzioneDelFornitore } from "./haccp-versioni";
import {
  effettoDistribuzionePuntuale,
  fornitoriDellaNuovaPubblicazione,
  puoInviareNotificaDistribuzione,
} from "./notifica-distribuzione";
import {
  applicaAcquisizione,
  classificaErroreInvio,
  conclusioneValida,
  LEASE_INVIO_SICURO_MS,
  puoAcquisireInvio,
  type SnapshotNotifica,
} from "./richiesta-ingresso";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LOCK_1 = "11111111-1111-4111-8111-111111111111";
const LOCK_2 = "22222222-2222-4222-8222-222222222222";

const puntuale = effettoDistribuzionePuntuale({
  ambito: "interno",
  destinatari: [B],
  fornitoreId: A,
});
assert.equal(puntuale.ambito, "interno");
assert.deepEqual(puntuale.destinatari, [B]);
assert.deepEqual(puntuale.distribuzione, { fornitoreId: A });
assert.equal(puntuale.destinatari.includes(A), false);

assert.deepEqual(fornitoriDellaNuovaPubblicazione(), []);
assert.equal(fornitoriDellaNuovaPubblicazione().includes(A), false);
assert.equal(fornitoriDellaNuovaPubblicazione().includes(C), false);

assert.equal(distribuzioneDelFornitore(A, A), true);
assert.equal(distribuzioneDelFornitore(A, B), false);

assert.equal(
  puoInviareNotificaDistribuzione("haccp", { superadmin: false, aree: ["produzione"] }),
  true
);
assert.equal(
  puoInviareNotificaDistribuzione("testo", { superadmin: false, aree: ["produzione"] }),
  false
);
assert.equal(
  puoInviareNotificaDistribuzione("testo", { superadmin: false, aree: ["amministrazione"] }),
  true
);
assert.equal(
  puoInviareNotificaDistribuzione("haccp", {
    superadmin: false,
    aree: ["area-fornitori"],
  }),
  false
);

const partenza: SnapshotNotifica = {
  stato: "non_inviata",
  lock: null,
  lockAtMs: null,
  tentativi: 0,
};
const primo = applicaAcquisizione(partenza, {
  oraMs: 1_000,
  confermaIncerta: false,
  nuovoLock: LOCK_1,
});
const secondo = applicaAcquisizione(primo, {
  oraMs: 1_100,
  confermaIncerta: false,
  nuovoLock: LOCK_2,
});
assert.equal(primo.acquisita, true);
assert.equal(primo.stato, "in_invio");
assert.equal(secondo.acquisita, false);
assert.equal(secondo.lock, LOCK_1);

assert.equal(
  conclusioneValida({ stato: "in_invio", lock: LOCK_1, token: LOCK_2 }),
  false
);
assert.equal(
  conclusioneValida({ stato: "in_invio", lock: LOCK_1, token: LOCK_1 }),
  true
);

assert.equal(classificaErroreInvio("connect ECONNREFUSED 127.0.0.1:465"), "certo");
assert.equal(classificaErroreInvio("Connection timeout"), "certo");
assert.equal(classificaErroreInvio("Socket timeout"), "incerto");
assert.equal(classificaErroreInvio("Timeout"), "incerto");

assert.equal(
  puoAcquisireInvio({
    stato: "in_invio",
    lockAtMs: 0,
    oraMs: LEASE_INVIO_SICURO_MS - 1,
    confermaIncerta: false,
  }),
  false
);
assert.equal(
  puoAcquisireInvio({
    stato: "in_invio",
    lockAtMs: 0,
    oraMs: LEASE_INVIO_SICURO_MS,
    confermaIncerta: false,
  }),
  false
);
assert.equal(
  puoAcquisireInvio({
    stato: "incerta",
    lockAtMs: 0,
    oraMs: LEASE_INVIO_SICURO_MS + 1,
    confermaIncerta: false,
  }),
  false
);
assert.equal(
  puoAcquisireInvio({
    stato: "in_invio",
    lockAtMs: 0,
    oraMs: LEASE_INVIO_SICURO_MS,
    confermaIncerta: true,
  }),
  true
);

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116103000_distribuzione_notifica_lock.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(sql, /interval '1080 seconds'/);
assert.match(sql, /p_conferma_incerta/);
assert.match(sql, /r\.notifica_stato in \('non_inviata', 'fallita'\)/);
assert.match(sql, /r\.notifica_lock = \$5/);
assert.match(sql, /r\.notifica_stato = 'in_invio'/);
assert.equal(sql.includes("insert into public.haccp_linee_guida_distribuzioni"), false);
assert.equal(sql.includes("haccp_linee_guida_destinatari"), false);
assert.equal(/drop table/i.test(sql), false);
assert.equal(sql.includes("delete from public.haccp_linee_guida"), false);

const azione = readFileSync(
  new URL("../../app/actions/requisiti-fornitore.ts", import.meta.url),
  "utf8"
);
assert.equal(azione.includes('ambito: "fornitori"'), false);
assert.equal(azione.includes("haccp_linee_guida_destinatari"), false);

console.log("notifica-distribuzione: ok");
