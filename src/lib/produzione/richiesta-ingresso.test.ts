import assert from "node:assert/strict";
import type { SoggettoAccessoFornitore } from "./fornitore-accesso";
import { puoLeggereFoglio } from "./foglio-ingresso";
import {
  notificaRisultaLetta,
  pianoRichiestaIngresso,
  puoInviareRichiestaDaScheda,
  tipologiaIdoneaMaterialeIngresso,
} from "./richiesta-ingresso";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
assert.equal(notificaRisultaLetta("inviata"), false);
assert.equal(notificaRisultaLetta("fallita"), false);

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

assert.equal(
  puoLeggereFoglio(soggetto({ aree: ["produzione"] }), A),
  true
);
assert.equal(
  puoLeggereFoglio(
    soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }),
    A
  ),
  true
);
assert.equal(
  puoLeggereFoglio(
    soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }),
    B
  ),
  false
);

console.log("richiesta-ingresso: ok");
