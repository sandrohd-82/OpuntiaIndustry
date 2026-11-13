import assert from "node:assert/strict";
import type { SoggettoAccessoFornitore } from "./fornitore-accesso";
import {
  consultaLineeGuidaFornitore,
  destinatariDaRegistrare,
  distribuzioneDelFornitore,
  notificaRisultaConsegnata,
  presaVisioneCopreVersione,
  pubblicazioneHaNovita,
  puoModificareDocumentoLineaGuida,
  puoRegistrarePresaVisione,
  versioneModificabile,
} from "./haccp-versioni";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

function soggetto(
  partial: Partial<SoggettoAccessoFornitore> &
    Pick<SoggettoAccessoFornitore, "aree">
): SoggettoAccessoFornitore {
  return { superadmin: false, fornitoreCollegatoId: null, ...partial };
}

assert.equal(versioneModificabile("bozza"), true);
assert.equal(versioneModificabile("pubblicata"), false);

assert.equal(
  puoModificareDocumentoLineaGuida(
    soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A })
  ),
  false
);
assert.equal(
  puoModificareDocumentoLineaGuida(soggetto({ aree: ["produzione"] })),
  true
);
assert.equal(
  puoModificareDocumentoLineaGuida(soggetto({ aree: ["amministrazione"] })),
  true
);

assert.deepEqual(destinatariDaRegistrare([A, A, B], [A]), [B]);

assert.equal(notificaRisultaConsegnata("inviata"), true);
assert.equal(notificaRisultaConsegnata("fallita"), false);
assert.equal(notificaRisultaConsegnata("non_inviata"), false);

assert.equal(distribuzioneDelFornitore(A, A), true);
assert.equal(distribuzioneDelFornitore(B, A), false);

const fornitoreA = consultaLineeGuidaFornitore(
  soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A })
);
assert.equal(fornitoreA.ok, true);
if (fornitoreA.ok) assert.equal(fornitoreA.fornitoreId, A);

assert.deepEqual(
  consultaLineeGuidaFornitore(soggetto({ aree: ["area-fornitori"] })),
  { ok: false, motivo: "non_collegato" }
);
assert.deepEqual(
  consultaLineeGuidaFornitore(soggetto({ aree: [], superadmin: true })),
  { ok: false, motivo: "non_collegato" }
);

assert.equal(presaVisioneCopreVersione(V1, V1), true);
assert.equal(presaVisioneCopreVersione(V1, V2), false);

assert.deepEqual(
  puoRegistrarePresaVisione({
    fornitoreSessione: null,
    versioneDistribuita: true,
    giaConfermataDaQuestoUtente: false,
  }),
  { ok: false, motivo: "non_collegato" }
);
assert.deepEqual(
  puoRegistrarePresaVisione({
    fornitoreSessione: A,
    versioneDistribuita: false,
    giaConfermataDaQuestoUtente: false,
  }),
  { ok: false, motivo: "versione_non_ricevuta" }
);
assert.equal(
  puoRegistrarePresaVisione({
    fornitoreSessione: A,
    versioneDistribuita: true,
    giaConfermataDaQuestoUtente: false,
  }).ok,
  true
);

assert.equal(
  pubblicazioneHaNovita({
    titolo: "HACCP",
    corpo: "Testo",
    pubblicata: { titolo: "HACCP", corpo: "Testo" },
  }),
  false
);
assert.equal(
  pubblicazioneHaNovita({
    titolo: "HACCP",
    corpo: "Testo nuovo",
    pubblicata: { titolo: "HACCP", corpo: "Testo" },
  }),
  true
);

console.log("haccp-versioni: ok");
