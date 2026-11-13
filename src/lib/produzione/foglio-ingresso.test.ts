import assert from "node:assert/strict";
import { processoControlloBySlug, vociProcesso } from "./controllo-processi";
import type { SoggettoAccessoFornitore } from "./fornitore-accesso";
import {
  fornitoreAperturaFoglio,
  motivoVoceNonAttiva,
  puoLeggereFoglio,
  puoRegistrareRisposta,
  statoDopoRipresa,
  transizioneFoglio,
  versioniCheBloccanoCompilazione,
  voceCompilabile,
  vociIncomplete,
  normalizzaValoreRisposta,
} from "./foglio-ingresso";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

function soggetto(
  partial: Partial<SoggettoAccessoFornitore> & Pick<SoggettoAccessoFornitore, "aree">
): SoggettoAccessoFornitore {
  return { superadmin: false, fornitoreCollegatoId: null, ...partial };
}

const processo = processoControlloBySlug("materiale-in-ingresso");
assert.ok(processo);
const tutte = vociProcesso(processo, false);
const fornitore = vociProcesso(processo, true);
assert.equal(tutte.length, 22);
assert.equal(fornitore.length, 21);
assert.equal(fornitore.some((voce) => voce.codice === "q"), false);
assert.equal(tutte.find((voce) => voce.codice === "2h")?.riferimento, "1e");

const aperto = fornitoreAperturaFoglio(
  soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }),
  B
);
assert.equal(aperto.ok, false);

const proprio = fornitoreAperturaFoglio(
  soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }),
  null
);
assert.equal(proprio.ok, true);
if (proprio.ok) assert.equal(proprio.fornitoreId, A);

assert.equal(
  fornitoreAperturaFoglio(soggetto({ aree: ["area-fornitori"] }), null).ok,
  false
);
const interno = fornitoreAperturaFoglio(soggetto({ aree: ["produzione"] }), A);
assert.equal(interno.ok, true);

assert.equal(
  puoLeggereFoglio(soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }), B),
  false
);
assert.equal(
  puoLeggereFoglio(soggetto({ aree: ["area-fornitori"], fornitoreCollegatoId: A }), A),
  true
);
assert.equal(puoLeggereFoglio(soggetto({ aree: ["produzione"] }), B), true);

assert.equal(transizioneFoglio("aperto", "in_compilazione", "fornitore").ok, true);
assert.equal(transizioneFoglio("in_compilazione", "in_attesa", "fornitore").ok, true);
assert.equal(statoDopoRipresa(true), "in_compilazione");
assert.equal(statoDopoRipresa(false), "aperto");
assert.equal(transizioneFoglio("in_attesa", "aperto", "fornitore").ok, true);
assert.equal(transizioneFoglio("aperto", "chiuso", "interno").ok, false);
assert.equal(transizioneFoglio("in_compilazione", "partito", "fornitore").ok, false);
assert.equal(transizioneFoglio("partito", "arrivato", "interno").ok, false);
assert.equal(transizioneFoglio("arrivato", "chiuso", "interno").ok, false);

assert.equal(voceCompilabile("q"), false);
assert.equal(voceCompilabile("1a"), false);
assert.equal(voceCompilabile("2m"), false);
assert.equal(voceCompilabile("p"), false);
assert.match(motivoVoceNonAttiva("q") ?? "", /Arrivo/);
assert.equal(
  puoRegistrareRisposta({
    codice: "q",
    attore: "fornitore",
    stato: "in_compilazione",
    esisteRisposta: false,
    motivazione: "",
    presaVisioneCompleta: true,
  }).ok,
  false
);

assert.equal(
  puoRegistrareRisposta({
    codice: "2a",
    attore: "fornitore",
    stato: "in_compilazione",
    esisteRisposta: true,
    motivazione: "",
    presaVisioneCompleta: true,
  }).ok,
  false
);
assert.equal(
  puoRegistrareRisposta({
    codice: "2a",
    attore: "fornitore",
    stato: "in_compilazione",
    esisteRisposta: true,
    motivazione: "Correzione del tipo contenitore",
    presaVisioneCompleta: true,
  }).ok,
  true
);

assert.deepEqual(versioniCheBloccanoCompilazione([V1, V2], [V1]), [V2]);
assert.deepEqual(versioniCheBloccanoCompilazione([V1], [V1]), []);
assert.equal(
  puoRegistrareRisposta({
    codice: "mezzo",
    attore: "fornitore",
    stato: "aperto",
    esisteRisposta: false,
    motivazione: "",
    presaVisioneCompleta: false,
  }).ok,
  false
);

const prima = normalizzaValoreRisposta("2a", { testo: "Bins" });
assert.equal(prima.ok, true);
const ripresa = vociIncomplete(["2a"]);
assert.equal(ripresa.includes("2a"), false);
assert.equal(ripresa.includes("2c"), true);
assert.equal(ripresa.includes("q"), false);

console.log("foglio-ingresso: ok");
