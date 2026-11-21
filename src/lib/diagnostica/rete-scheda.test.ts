import assert from "node:assert/strict";
import { associaReteAzione, normalizzaReteAzione } from "./rete-scheda";

const verificata = associaReteAzione({
  invocazione: 1000,
  completamento: 3400,
  risorse: [
    { start: 10, requestStart: 12, responseStart: 40, responseEnd: 80 },
    { start: 2500, requestStart: 2520, responseStart: 3000, responseEnd: 3300 },
  ],
});
assert.equal(verificata.affidabilita, "verificata");
assert.equal(verificata.attesaHttpMs, 1520);
assert.equal(verificata.primoByteMs, 480);
assert.equal(verificata.httpMs, 780);
assert.equal(verificata.dopoRispostaMs, 100);

const doppia = associaReteAzione({
  invocazione: 1000,
  completamento: 3400,
  risorse: [
    { start: 2500, requestStart: 2520, responseStart: 3000, responseEnd: 3200 },
    { start: 2600, requestStart: 2620, responseStart: 3100, responseEnd: 3350 },
  ],
});
assert.equal(doppia.affidabilita, "incerta");
assert.equal(doppia.httpMs, null);

const vuota = associaReteAzione({
  invocazione: 1000,
  completamento: 3400,
  risorse: [],
});
assert.equal(vuota.affidabilita, "incerta");

const incompleta = associaReteAzione({
  invocazione: 1000,
  completamento: 3400,
  risorse: [{ start: 2500, requestStart: 0, responseStart: 0, responseEnd: 3300 }],
});
assert.equal(incompleta.affidabilita, "incerta");

const sporca = normalizzaReteAzione({
  affidabilita: "verificata",
  attesaHttpMs: 4,
  httpMs: 9,
  primoByteMs: 3,
  dopoRispostaMs: 1,
  header: "Next-Action",
  cookie: "session",
  url: "https://example.test/cliente?id=1",
  email: "ada@example.com",
});
assert.equal(sporca?.attesaHttpMs, 4);
assert.equal(JSON.stringify(sporca).includes("ada@"), false);
assert.equal(JSON.stringify(sporca).includes("Next-Action"), false);
assert.equal(JSON.stringify(sporca).includes("example"), false);
assert.equal(normalizzaReteAzione({ affidabilita: "incerta", httpMs: 9 })?.httpMs, null);

const completamenti = [5000, 10000, 15000, 20000, 25000, 30000];
const inizia = [0, 1, 2, 3, 4, 5];
const risorse = completamenti.map((fine, indice) => ({
  start: indice === 0 ? 1 : completamenti[indice - 1] + 1,
  requestStart: indice === 0 ? 20 : completamenti[indice - 1] + 20,
  responseStart: fine - 400,
  responseEnd: fine - 50,
}));
completamenti.forEach((fine, indice) => {
  const esito = associaReteAzione({
    invocazione: inizia[indice],
    completamento: fine,
    risorse,
  });
  assert.equal(esito.affidabilita, "verificata", `azione ${indice}`);
  assert.equal(esito.dopoRispostaMs, 50);
});

console.log("rete-scheda: ok");
