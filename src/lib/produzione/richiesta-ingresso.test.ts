import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SoggettoAccessoFornitore } from "./fornitore-accesso";
import { puoLeggereFoglio } from "./foglio-ingresso";
import {
  LEASE_CONNESSIONE_SMTP_MS,
  LEASE_INVIO_SICURO_MS,
  applicaAcquisizione,
  classificaErroreInvio,
  conclusioneValida,
  etichettaNotificaRichiesta,
  notificaRisultaLetta,
  pianoRichiestaIngresso,
  puoAcquisireInvio,
  puoInviareRichiestaDaScheda,
  reinvioAutomaticoConsentito,
  tipologiaIdoneaMaterialeIngresso,
  type SnapshotNotifica,
} from "./richiesta-ingresso";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOCK_1 = "11111111-1111-4111-8111-111111111111";
const LOCK_2 = "22222222-2222-4222-8222-222222222222";

function soggetto(
  partial: Partial<SoggettoAccessoFornitore> & Pick<SoggettoAccessoFornitore, "aree">
): SoggettoAccessoFornitore {
  return { superadmin: false, fornitoreCollegatoId: null, ...partial };
}

assert.equal(tipologiaIdoneaMaterialeIngresso(["materia_prima"]), true);
assert.equal(tipologiaIdoneaMaterialeIngresso(["servizio", "prodotto"]), false);

const bloccoTipo = pianoRichiestaIngresso({
  tipologie: ["servizio"],
  accountAttivi: 1,
  richiestaEsistente: false,
  notificaStato: null,
});
assert.equal(bloccoTipo.ok, false);

const bloccoAccount = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 0,
  richiestaEsistente: false,
  notificaStato: null,
});
assert.equal(bloccoAccount.ok, false);

const nuova = pianoRichiestaIngresso({
  tipologie: ["materia_prima", "prodotto"],
  accountAttivi: 2,
  richiestaEsistente: false,
  notificaStato: null,
});
assert.deepEqual(nuova, { ok: true, creaFoglio: true, inviaNotifica: true });

const doppioClic = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 1,
  richiestaEsistente: true,
  notificaStato: "non_inviata",
});
assert.deepEqual(doppioClic, { ok: true, creaFoglio: false, inviaNotifica: true });

const giaInviata = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 1,
  richiestaEsistente: true,
  notificaStato: "inviata",
});
assert.deepEqual(giaInviata, { ok: true, creaFoglio: false, inviaNotifica: false });

const recupero = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 1,
  richiestaEsistente: true,
  notificaStato: "fallita",
});
assert.equal(recupero.ok && recupero.creaFoglio, false);
assert.equal(recupero.ok && recupero.inviaNotifica, true);

const duranteInvio = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 1,
  richiestaEsistente: true,
  notificaStato: "in_invio",
});
assert.equal(duranteInvio.ok && duranteInvio.creaFoglio, false);
assert.equal(duranteInvio.ok && duranteInvio.inviaNotifica, false);

const esitoIncerto = pianoRichiestaIngresso({
  tipologie: ["materia_prima"],
  accountAttivi: 1,
  richiestaEsistente: true,
  notificaStato: "incerta",
});
assert.equal(esitoIncerto.ok && esitoIncerto.inviaNotifica, false);

assert.equal(notificaRisultaLetta("inviata"), false);
assert.equal(notificaRisultaLetta("fallita"), false);
assert.equal(notificaRisultaLetta("in_invio"), false);
assert.equal(notificaRisultaLetta("incerta"), false);

assert.equal(LEASE_INVIO_SICURO_MS, 1_080_000);
assert.ok(LEASE_CONNESSIONE_SMTP_MS < LEASE_INVIO_SICURO_MS);

const partenza: SnapshotNotifica = {
  stato: "non_inviata",
  lock: null,
  lockAtMs: null,
  tentativi: 0,
};
const primoOperatore = applicaAcquisizione(partenza, {
  oraMs: 1_000,
  confermaIncerta: false,
  nuovoLock: LOCK_1,
});
const secondoOperatore = applicaAcquisizione(primoOperatore, {
  oraMs: 1_000,
  confermaIncerta: false,
  nuovoLock: LOCK_2,
});
assert.equal(primoOperatore.acquisita, true);
assert.equal(primoOperatore.lock, LOCK_1);
assert.equal(primoOperatore.tentativi, 1);
assert.equal(secondoOperatore.acquisita, false);
assert.equal(secondoOperatore.lock, LOCK_1);
assert.equal(secondoOperatore.tentativi, 1);

assert.equal(
  puoAcquisireInvio({
    stato: "in_invio",
    lockAtMs: 0,
    oraMs: 60_000,
    confermaIncerta: true,
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
    stato: "in_invio",
    lockAtMs: 0,
    oraMs: LEASE_INVIO_SICURO_MS,
    confermaIncerta: true,
  }),
  true
);
assert.equal(reinvioAutomaticoConsentito("in_invio"), false);
assert.equal(reinvioAutomaticoConsentito("incerta"), false);
assert.equal(reinvioAutomaticoConsentito("fallita"), true);

assert.equal(
  conclusioneValida({ stato: "in_invio", lock: LOCK_1, token: LOCK_2 }),
  false
);
assert.equal(
  conclusioneValida({ stato: "inviata", lock: LOCK_1, token: LOCK_1 }),
  false
);
assert.equal(
  conclusioneValida({ stato: "in_invio", lock: LOCK_1, token: LOCK_1 }),
  true
);

assert.equal(classificaErroreInvio("connect ECONNREFUSED 127.0.0.1:465"), "certo");
assert.equal(classificaErroreInvio("Connection timeout"), "certo");
assert.equal(classificaErroreInvio("Greeting never received"), "certo");
assert.equal(classificaErroreInvio("Timeout"), "incerto");
assert.equal(classificaErroreInvio(""), "incerto");
assert.equal(classificaErroreInvio("Socket timeout"), "incerto");

assert.equal(etichettaNotificaRichiesta("non_inviata"), "Notifica da inviare");
assert.equal(etichettaNotificaRichiesta("inviata"), "Notifica inviata");
assert.equal(etichettaNotificaRichiesta("fallita"), "Invio fallito");
assert.equal(etichettaNotificaRichiesta("incerta"), "Esito incerto");
assert.equal(
  etichettaNotificaRichiesta("in_invio", { lockAt: new Date(0).toISOString(), oraMs: 1_000 }),
  "Invio in corso"
);
assert.equal(
  etichettaNotificaRichiesta("in_invio", {
    lockAt: new Date(0).toISOString(),
    oraMs: LEASE_INVIO_SICURO_MS,
  }),
  "Esito incerto"
);

assert.equal(
  puoInviareRichiestaDaScheda(soggetto({ aree: ["amministrazione"] })),
  true
);
assert.equal(
  puoInviareRichiestaDaScheda(soggetto({ aree: ["produzione"] })),
  false
);
assert.equal(
  puoInviareRichiestaDaScheda(
    soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A })
  ),
  false
);

assert.equal(puoLeggereFoglio(soggetto({ aree: ["produzione"] }), A), true);
assert.equal(
  puoLeggereFoglio(soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }), A),
  true
);
assert.equal(
  puoLeggereFoglio(soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }), B),
  false
);

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116080000_notifica_ingresso_lock.sql",
    import.meta.url
  ),
  "utf8"
);
assert.match(sql, /interval '1080 seconds'/);
assert.match(sql, /p_conferma_incerta/);
assert.match(sql, /r\.notifica_stato in \('non_inviata', 'fallita'\)/);
assert.match(sql, /r\.notifica_lock = p_lock/);
assert.match(sql, /r\.notifica_stato = 'in_invio'/);
assert.equal(/drop table/i.test(sql), false);
assert.equal(sql.includes("20261114170000"), false);

console.log("richiesta-ingresso: ok");
