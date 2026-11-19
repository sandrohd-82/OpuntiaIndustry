import assert from "node:assert/strict";
import {
  controlloTrelloConsentito,
  mappaMenuDaCaricare,
  scansioneFattureMailRichiesta,
  scansionePromozioniRichiesta,
} from "./prestazioni";

assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: false,
    giaEseguita: false,
    richiestoOperatore: false,
  }),
  false
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: true,
    giaEseguita: false,
    richiestoOperatore: false,
  }),
  true
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: true,
    giaEseguita: true,
    richiestoOperatore: false,
  }),
  false
);
assert.equal(
  scansioneFattureMailRichiesta({
    areaAmministrazione: false,
    giaEseguita: true,
    richiestoOperatore: true,
  }),
  true
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: false, giaEseguita: false }),
  false
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: true, giaEseguita: false }),
  true
);
assert.equal(
  scansionePromozioniRichiesta({ areaPertinente: true, giaEseguita: true }),
  false
);
assert.equal(controlloTrelloConsentito({ finestraNascosta: true, richiestaInCorso: false }), false);
assert.equal(controlloTrelloConsentito({ finestraNascosta: false, richiestaInCorso: true }), false);
assert.equal(controlloTrelloConsentito({ finestraNascosta: false, richiestaInCorso: false }), true);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/dashboard", areaAperta: undefined }),
  false
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/magazzino", areaAperta: undefined }),
  true
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: false, percorso: "/app/dashboard", areaAperta: "amministrazione" }),
  true
);
assert.equal(
  mappaMenuDaCaricare({ giaCaricata: true, percorso: "/app/magazzino", areaAperta: "magazzino" }),
  false
);
console.log("prestazioni: ok");
