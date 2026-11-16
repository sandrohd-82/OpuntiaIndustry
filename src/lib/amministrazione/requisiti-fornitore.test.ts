import assert from "node:assert/strict";
import { distribuzioneDelFornitore } from "../produzione/haccp-versioni";
import {
  attoCopreNatura,
  attoEFirma,
  avvisoEmailELettura,
  dentroValidita,
  requisitiApplicabili,
  sospesoDaEventi,
  valutaAbilitazione,
  type RequisitoCatalogo,
  type VoceAbilitazione,
} from "./requisiti-fornitore";

const ORA = "2026-11-16T08:00:00.000Z";
const PRIMA = "2026-10-01T08:00:00.000Z";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const linee: RequisitoCatalogo = {
  id: "linee",
  natura: "presa_visione",
  tipologie: ["materia_prima"],
  validitaGiorni: null,
};
const privacy: RequisitoCatalogo = {
  id: "privacy",
  natura: "consenso_privacy",
  tipologie: ["servizio", "prodotto", "materia_prima", "contributo"],
  validitaGiorni: 365,
};
const contratto: RequisitoCatalogo = {
  id: "contratto",
  natura: "accettazione_contrattuale",
  tipologie: ["prodotto"],
  validitaGiorni: null,
};
const controllo: RequisitoCatalogo = {
  id: "controllo",
  natura: "controllo_interno",
  tipologie: ["materia_prima"],
  validitaGiorni: null,
};
const catalogo = [linee, privacy, contratto, controllo];

const materia = requisitiApplicabili({
  tipologieFornitore: ["materia_prima"],
  catalogo,
  eccezioni: [],
});
assert.deepEqual(materia.map((r) => r.id), ["linee", "privacy", "controllo"]);

const servizio = requisitiApplicabili({
  tipologieFornitore: ["servizio"],
  catalogo,
  eccezioni: [],
});
assert.deepEqual(servizio.map((r) => r.id), ["privacy"]);

const aggiunto = requisitiApplicabili({
  tipologieFornitore: ["servizio"],
  catalogo,
  eccezioni: [{ requisitoId: "contratto", modalita: "aggiunto" }],
});
assert.equal(aggiunto.some((r) => r.id === "contratto"), true);

const escluso = requisitiApplicabili({
  tipologieFornitore: ["materia_prima"],
  catalogo,
  eccezioni: [{ requisitoId: "linee", modalita: "escluso" }],
});
assert.equal(escluso.some((r) => r.id === "linee"), false);

function voce(partial: Partial<VoceAbilitazione> & Pick<VoceAbilitazione, "id" | "natura">): VoceAbilitazione {
  return {
    validitaGiorni: null,
    versioneRichiestaId: V1,
    distribuita: true,
    versioneSoddisfattaId: V1,
    soddisfattoAt: PRIMA,
    controlloEsito: null,
    controlloAt: null,
    ...partial,
  };
}

const incompleto = valutaAbilitazione({
  oraIso: ORA,
  sospeso: false,
  voci: [voce({ id: "linee", natura: "presa_visione", versioneSoddisfattaId: null, soddisfattoAt: null })],
});
assert.equal(incompleto.stato, "incompleto");
assert.deepEqual(incompleto.mancanti, ["linee"]);

const confermato = valutaAbilitazione({
  oraIso: ORA,
  sospeso: false,
  voci: [voce({ id: "linee", natura: "presa_visione" })],
});
assert.equal(confermato.stato, "abilitato");

const nuovaVersione = valutaAbilitazione({
  oraIso: ORA,
  sospeso: false,
  voci: [voce({ id: "linee", natura: "presa_visione", versioneRichiestaId: V2 })],
});
assert.equal(nuovaVersione.stato, "incompleto");

const scaduto = valutaAbilitazione({
  oraIso: ORA,
  sospeso: false,
  voci: [voce({ id: "privacy", natura: "consenso_privacy", validitaGiorni: 30 })],
});
assert.equal(scaduto.stato, "incompleto");

const sospeso = valutaAbilitazione({
  oraIso: ORA,
  sospeso: true,
  voci: [voce({ id: "linee", natura: "presa_visione" })],
});
assert.equal(sospeso.stato, "sospeso");

assert.equal(
  sospesoDaEventi([
    { tipo: "sospensione", at: "2026-01-01T00:00:00.000Z" },
    { tipo: "riabilitazione", at: "2026-02-01T00:00:00.000Z" },
  ]),
  false
);
assert.equal(
  sospesoDaEventi([
    { tipo: "riabilitazione", at: "2026-02-01T00:00:00.000Z" },
    { tipo: "sospensione", at: "2026-03-01T00:00:00.000Z" },
  ]),
  true
);

assert.equal(dentroValidita("2026-11-20T00:00:00.000Z", null, ORA), true);
assert.equal(dentroValidita(null, null, ORA), false);
assert.equal(
  dentroValidita("2026-11-16T08:00:00.000Z", 1, "2026-11-17T08:00:00.000Z"),
  true
);
assert.equal(
  dentroValidita("2026-11-16T08:00:00.000Z", 1, "2026-11-17T08:00:00.001Z"),
  false
);

const vuoto = valutaAbilitazione({ oraIso: ORA, sospeso: false, voci: [] });
assert.equal(vuoto.stato, "abilitato");

assert.equal(attoCopreNatura("presa_visione", "consenso_privacy"), false);
assert.equal(attoCopreNatura("consenso_privacy", "accettazione_contrattuale"), false);
assert.equal(attoCopreNatura("presa_visione", "presa_visione"), true);
assert.equal(attoCopreNatura("controllo_interno", "controllo_interno"), false);
assert.equal(attoEFirma("presa_visione"), false);
assert.equal(attoEFirma("accettazione_contrattuale"), false);
assert.equal(avvisoEmailELettura(), false);
assert.equal(distribuzioneDelFornitore(A, A), true);
assert.equal(distribuzioneDelFornitore(B, A), false);

console.log("requisiti-fornitore: ok");
