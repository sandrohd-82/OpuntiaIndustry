import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coordinaLettureScheda,
  erroreControlloNext,
  erroreSezione,
} from "./coordina-letture";

function attesa<T>(valore: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valore), ms);
  });
}

async function verifica() {
const ordine: string[] = [];
const parallele = await coordinaLettureScheda({
  scheda: attesa("scheda", 30).then((valore) => {
    ordine.push(valore);
    return { success: true as const, documenti: [] };
  }),
  extra: attesa("extra", 10).then((valore) => {
    ordine.push(valore);
    return { success: true as const, sedi: [] };
  }),
});
assert.equal(parallele.scheda.success, true);
assert.equal(parallele.extra.success, true);
assert.deepEqual(ordine, ["extra", "scheda"]);

const isolate = await coordinaLettureScheda({
  scheda: Promise.resolve({ success: true as const, documenti: [1] }),
  extra: Promise.resolve({ success: false as const, error: "brand" }),
  schede: Promise.reject(new Error("schede")),
  referenti: Promise.resolve({ success: true as const, items: ["a"] }),
  riepilogo: Promise.resolve({ errore: "form" }),
  allerte: Promise.resolve({ success: true as const, aziende: [] }),
});
if (!isolate.scheda.success) throw new Error("scheda attesa");
assert.equal(isolate.scheda.documenti.length, 1);
assert.equal(isolate.extra.success, false);
if (isolate.extra.success) throw new Error("extra atteso in errore");
assert.equal(isolate.extra.error, "brand");
assert.equal(isolate.schede.success, false);
if (isolate.schede.success) throw new Error("schede attese in errore");
assert.equal(isolate.schede.error, "schede");
if (!isolate.referenti.success) throw new Error("referenti attesi");
assert.equal(isolate.referenti.items[0], "a");
assert.equal("errore" in isolate.riepilogo, true);
if (!isolate.allerte.success) throw new Error("allerte attese");
assert.equal(isolate.allerte.aziende.length, 0);
assert.equal(erroreSezione(new Error("x")).success, false);

const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
  digest: "NEXT_REDIRECT;replace;/login;307;",
});
const negato = Object.assign(new Error("NEXT_NOT_FOUND"), {
  digest: "NEXT_HTTP_ERROR_FALLBACK;404",
});
assert.equal(erroreControlloNext(redirect), true);
assert.equal(erroreControlloNext(negato), true);
assert.equal(erroreControlloNext(new Error("query")), false);

await assert.rejects(
  () =>
    coordinaLettureScheda({
      scheda: Promise.resolve({ success: true as const }),
      extra: Promise.reject(redirect),
    }),
  (errore: unknown) => errore === redirect
);
await assert.rejects(
  () => coordinaLettureScheda({ referenti: Promise.reject(negato) }),
  (errore: unknown) => errore === negato
);

const azione = readFileSync("src/app/actions/scheda-completa-iniziale.ts", "utf8");
const modale = readFileSync(
  "src/components/amministrazione/ClienteSchedaCompletaModal.tsx",
  "utf8"
);
const dettaglio = readFileSync(
  "src/components/amministrazione/AnagraficaSchedaDetail.tsx",
  "utf8"
);
const formCliente = readFileSync(
  "src/components/amministrazione/ClienteFormModal.tsx",
  "utf8"
);
const formPossibile = readFileSync(
  "src/components/amministrazione/PossibileClienteFormModal.tsx",
  "utf8"
);
const formFornitore = readFileSync(
  "src/components/amministrazione/FornitoreFormModal.tsx",
  "utf8"
);
assert.match(azione, /coordinaLettureScheda/);
assert.match(azione, /leggiSchedaClienteCompleta/);
assert.match(azione, /leggiAnagraficaExtra/);
assert.match(azione, /leggiSchedeCardAzienda/);
assert.match(azione, /leggiReferentiAnagrafica/);
assert.match(azione, /leggiRiepilogoAnagrafica/);
assert.match(azione, /leggiAllerteAzienda/);
assert.doesNotMatch(azione, /createServiceClient/);
assert.doesNotMatch(
  azione.replace(
    "export async function caricaSchedaCompletaInizialeAction(",
    ""
  ),
  /Action\(/
);
assert.match(modale, /caricaSchedaCompletaInizialeAction/);
assert.match(modale, /loadClienteSchedaCompletaAction/);
assert.equal(modale.includes("listAziendaSchedeCardAction"), false);
assert.equal(modale.includes("listAllerteAziendaAction"), false);
assert.match(dettaglio, /letturaCoordinata/);
assert.match(dettaglio, /listAziendaSchedeCardAction/);
assert.match(dettaglio, /openSchedaFromTimelineAction/);
assert.match(formCliente, /listEntityReferentiAction/);
assert.match(formCliente, /loadAnagraficaExtraAction/);
assert.match(formPossibile, /listEntityReferentiAction/);
assert.match(formFornitore, /listEntityReferentiAction/);
assert.match(
  readFileSync("src/components/amministrazione/AnagraficaReferentiSection.tsx", "utf8"),
  /linkEntityReferenteAction/
);
assert.match(
  readFileSync("src/components/amministrazione/RichiediAnagraficaButton.tsx", "utf8"),
  /inviaRichiestaAnagraficaAction/
);
assert.match(
  readFileSync("src/app/actions/anagrafica-documenti.ts", "utf8"),
  /return leggiSchedaClienteCompleta\(clienteId\)/
);
assert.match(
  readFileSync("src/lib/amministrazione/schede-card-lettura.ts", "utf8"),
  /requireAnyAreaAccess/
);
assert.match(
  readFileSync("src/lib/amministrazione/schede-card-lettura.ts", "utf8"),
  /createServiceClient/
);
assert.match(
  readFileSync("src/lib/amministrazione/scheda-cliente-lettura.ts", "utf8"),
  /assertClienteVisibile/
);
assert.doesNotMatch(
  readFileSync("src/lib/amministrazione/scheda-cliente-lettura.ts", "utf8"),
  /createServiceClient/
);

console.log("coordina-letture: ok");
}

verifica();
